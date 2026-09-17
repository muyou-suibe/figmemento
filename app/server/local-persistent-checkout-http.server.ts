import { evaluateLocalCheckoutLine } from "../application/local-checkout-evaluator.ts";
import { resolveLocalPersistentComposition } from "../application/local-persistent-commerce-composition.server.ts";
import { calculateLocalDemoTotal, createNotActivatedTaxState, parseLocalCheckoutRequest, type LocalCheckoutIssueCode } from "../domain/local-checkout.ts";
import { LocalCatalogAuthority } from "../infrastructure/local-commerce/local-catalog-authority.server.ts";
import { LocalCheckoutRuleAuthority } from "../infrastructure/local-commerce/local-checkout-rule-authority.server.ts";
import { persistentPurchaseReceipts, readPersistentPurchaseCart } from "./local-persistent-purchase-authority.server.ts";
import type { RuntimeEnvironment } from "../config/server.ts";

const headers = { "cache-control": "no-store" };
const fail = (code: LocalCheckoutIssueCode, status = 503) => Response.json({
  status: status === 503 ? "unavailable" : "blocked", issues: [{ code, message: "Checkout cannot be safely evaluated." }],
}, { status, headers });

/** A transient read projection, never an AcceptedCheckout or Order authority. */
export async function persistentCheckoutHttp(request: Request, body: unknown, environment: RuntimeEnvironment = process.env): Promise<Response> {
  try {
    if (resolveLocalPersistentComposition(environment, { requiredCapabilities: ["checkout"] }).status !== "ready") return fail("CHECKOUT_UNAVAILABLE");
    if (!body || typeof body !== "object" || Array.isArray(body)) return fail("INVALID_CHECKOUT_INPUT", 400);
    const input = body as Record<string, unknown>;
    const { expectedVersions, ...fields } = input;
    if (expectedVersions !== undefined && (!expectedVersions || typeof expectedVersions !== "object" || Array.isArray(expectedVersions)
      || Object.keys(expectedVersions).length > 2000 || Object.entries(expectedVersions).some(([key, value]) =>
        key.length > 160 || typeof value !== "number" || !Number.isSafeInteger(value) || value < 1))) return fail("INVALID_CHECKOUT_INPUT", 400);
    // Points are a separately scoped authority, never a browser discount.
    if (fields.pointsToRedeem !== undefined && fields.pointsToRedeem !== 0) return fail("INVALID_CHECKOUT_INPUT", 400);
    const cart = await readPersistentPurchaseCart(request, environment);
    if (cart.status === "empty") return fail("EMPTY_CART", 409);
    if (cart.status !== "found") return fail("CART_UNAVAILABLE");
    if (!cart.record.lines.length) return fail("EMPTY_CART", 409);
    const catalog = new LocalCatalogAuthority(environment);
    const baseline = await catalog.readSnapshot(expectedVersions as Record<string, number> | undefined);
    if (baseline.status !== "found") return fail("STALE_CATALOG");
    const hasImages = cart.record.lines.some(line => line.handoff.customizationValues.some(field => field.kind === "image" && field.images.length));
    const dependencies = { catalogRepository: catalog.repository, customizationFieldRepository: catalog,
      verifiedOwnerId: cart.owner.ownerId,
      pricingResolver: (pricingInput: Parameters<LocalCatalogAuthority["resolveCustomizationPricing"]>[0]) => catalog.resolveCustomizationPricing(pricingInput),
      ...(hasImages ? { receiptRepository: persistentPurchaseReceipts(environment, cart.verifyOwner, cart.record.lines.map(line => line.handoff)) } : {}) };
    const results = await Promise.all(cart.record.lines.map(line => evaluateLocalCheckoutLine(line, dependencies, new Date().toISOString())));
    for (const result of results) if (result.status !== "resolved") return fail(result.issue.code, result.status === "unavailable" ? 503 : 409);
    const lines = results.flatMap(result => result.status === "resolved" ? [result.summary] : []);
    const currency = lines[0].currency;
    if (lines.some(line => line.currency !== currency)) return fail("MIXED_CURRENCY", 409);
    const physical = lines.some(line => line.fulfillmentType === "physical");
    let country: string | undefined, method: string | undefined, couponCode: string | undefined;
    if (physical) {
      const parsed = parseLocalCheckoutRequest(fields);
      if (!parsed.ok) return fail("INVALID_CHECKOUT_INPUT", 400);
      country = parsed.value.address.country; method = parsed.value.shippingMethod; couponCode = parsed.value.couponCode;
    } else {
      // Only physical requirements are waived. Supplied values remain bounded;
      // no invented postal address or dummy shipping method.
      const limits: Record<string, number> = { email: 254, firstName: 100, lastName: 100, country: 2,
        stateProvince: 120, city: 120, addressLine1: 200, postalCode: 30, phone: 40, shippingMethod: 64, couponCode: 64 };
      for (const [key, value] of Object.entries(fields)) {
        if (key === "pointsToRedeem" && value === 0) continue;
        if (!Object.hasOwn(limits, key) || typeof value !== "string" || value.trim().length > limits[key]) return fail("INVALID_CHECKOUT_INPUT", 400);
      }
      if (typeof fields.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email.trim())) return fail("INVALID_CHECKOUT_INPUT", 400);
      if (fields.country && !/^[A-Za-z]{2}$/.test(String(fields.country))) return fail("INVALID_CHECKOUT_INPUT", 400);
      for (const key of ["shippingMethod", "couponCode"]) if (fields[key] && !/^[A-Za-z0-9_-]+$/.test(String(fields[key]))) return fail("INVALID_CHECKOUT_INPUT", 400);
      couponCode = typeof fields.couponCode === "string" ? fields.couponCode.trim() : undefined;
    }
    const subtotalCents = lines.reduce((sum, line) => sum + line.lineSubtotalCents, 0);
    const rules = await new LocalCheckoutRuleAuthority(environment).evaluate({ requiresShipping: physical, country, method,
      subtotalCents, currency, couponCode, expectedVersions: baseline.value.versions });
    if (rules.status !== "found") return fail("CHECKOUT_UNAVAILABLE");
    const { shipping, coupon, versions } = rules.value;
    if (shipping.status === "unsupported") return fail("SHIPPING_UNAVAILABLE", 409);
    const localDemoTotalCents = calculateLocalDemoTotal({ subtotalCents, shippingCents: shipping.amountCents, discountCents: coupon.discountCents });
    if (localDemoTotalCents === null) return fail("BASE_AUTHORITY_UNAVAILABLE");
    // Fresh owner and version guards detect changes during the evaluation.
    const latest = await readPersistentPurchaseCart(request, environment);
    const finalCatalog = await catalog.readSnapshot(versions);
    if (!await cart.verifyOwner() || latest.status !== "found" || latest.owner.ownerId !== cart.owner.ownerId
      || latest.version !== cart.version || finalCatalog.status !== "found") return fail("CHECKOUT_UNAVAILABLE");
    return Response.json({ status: "accepted", fixtureNotice: "DEVELOPMENT / TEST ONLY",
      lines: lines.map(line => ({ lineId: line.lineId, productId: line.productId, productName: line.productName,
        productSlug: line.productSlug, variantId: line.variantId, skuCode: line.skuCode, selectedOptions: line.selectedOptions,
        unitBasePriceCents: line.unitBasePriceCents, ...(line.unitPriceCents !== undefined ? { unitPriceCents: line.unitPriceCents } : {}),
        currency: line.currency, quantity: line.quantity, lineSubtotalCents: line.lineSubtotalCents })),
      currency, subtotalCents,
      shipping: shipping.status === "not_applicable" ? { status: "not_applicable", amountCents: 0 }
        : { status: "eligible", method: shipping.method, amountCents: shipping.amountCents, currency: shipping.currency, estimatedRange: shipping.estimatedRange },
      coupon: { status: coupon.status, discountCents: coupon.discountCents }, tax: createNotActivatedTaxState(), localDemoTotalCents,
      versions,
    }, { status: 200, headers });
  } catch { return fail("CHECKOUT_UNAVAILABLE"); }
}
