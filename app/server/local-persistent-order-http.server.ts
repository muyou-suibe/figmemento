import type { RuntimeEnvironment } from "../config/server.ts";
import { resolveLocalPersistentComposition } from "../application/local-persistent-commerce-composition.server.ts";
import { createLocalPersistentSupabaseAdapter } from "../infrastructure/local-commerce/local-persistent-supabase-adapter.server.ts";
import { createPersistentOrderCapabilityCodec, persistentOrderCapabilityGate, boundedPersistentOrderGrantExpiry,
  type VerifiedPersistentOrderCapability } from "./local-order-capability.server.ts";
import { parsePersistentOrderStructuralInput, persistentOrderCreationContext, type PersistentOrderStructuralInput } from "../application/local-order-creation-context.server.ts";
import { readPersistentPurchaseCart, persistentPurchaseReceipts } from "./local-persistent-purchase-authority.server.ts";
import { hashGuestResourceCapability } from "../application/guest-resource-ownership.server.ts";
import { hashOpaqueCustomerSessionToken } from "../application/customer-auth-session-persistence.server.ts";
import { readCustomerAuthSessionId } from "./customer-auth-http.server.ts";
import { LocalCatalogAuthority } from "../infrastructure/local-commerce/local-catalog-authority.server.ts";
import { LocalCheckoutRuleAuthority } from "../infrastructure/local-commerce/local-checkout-rule-authority.server.ts";
import { evaluateLocalCheckoutLine } from "../application/local-checkout-evaluator.ts";
import { prepareLocalOrderPurchaseFacts } from "../application/local-order-purchase-facts.server.ts";
import { parseLocalCheckoutRequest } from "../domain/local-checkout.ts";
import { localOrderPurchaseVersions } from "../application/local-order-purchase-versions.server.ts";

const fail = (status = 503) => Response.json({ status: status === 409 ? "blocked" : "unavailable",
  issues: [{ code: "LOCAL_ORDER_UNAVAILABLE", message: "Local Order cannot be safely processed." }] },
{ status, headers: { "cache-control": "no-store" } });
type Connection = Extract<Awaited<ReturnType<typeof createLocalPersistentSupabaseAdapter>>, { status: "ready" }>;
type CommitResult = { status: "found"; value: { orderId: string; publicReference: string; replayed: boolean } }
  | { status: "not_found" | "unavailable" | "conflict" };

async function createPersistentPurchase(request: Request, input: PersistentOrderStructuralInput,
  environment: RuntimeEnvironment, connection: Connection, capability: VerifiedPersistentOrderCapability): Promise<Response> {
  // This read is exact-owner Cart state, not current Catalog reconstruction.
  const cart = await readPersistentPurchaseCart(request, environment);
  if (cart.status !== "found") return fail();
  const verifiedOwner = await cart.verifyOwner();
  if (!verifiedOwner) return fail();
  const context = await persistentOrderCreationContext(input, cart.owner, cart.record.cartId, cart.version);
  const grantExpiry = boundedPersistentOrderGrantExpiry(capability, verifiedOwner.expiresAt, Math.floor(Date.now() / 1000));
  const selector = cart.owner.kind === "guest" ? await hashGuestResourceCapability(cart.owner.ownerId) : cart.owner.ownerId;
  if (!context || !grantExpiry || !selector) return fail();
  const session = readCustomerAuthSessionId(request);
  if (cart.owner.kind === "customer" && !session) return fail();
  const args = {
    p_project_id: connection.composition.projectId, p_marker_digest: connection.composition.markerDigest,
    p_owner_kind: cart.owner.kind, p_owner_selector: selector,
    p_customer_id: cart.owner.kind === "customer" ? cart.owner.customerId : null,
    p_session_hash: cart.owner.kind === "customer" ? await hashOpaqueCustomerSessionToken(session!) : null,
    p_authority_expires_at: new Date(verifiedOwner.expiresAt * 1000).toISOString(),
    p_capability_expires_at: new Date(capability.expiresAtSeconds * 1000).toISOString(),
    p_grant_expires_at: grantExpiry, p_capability_hash: capability.digest,
    p_cart_id: cart.record.cartId, p_expected_version: cart.version,
    p_key_digest: context.keyDigest, p_context_digest: context.contextDigest,
  };
  const project = (r: CommitResult): Response => {
    if (r.status !== "found") return fail(r.status === "conflict" ? 409 : 503);
    if (!/^FM-LOCAL-[A-Z0-9]{16}$/.test(r.value?.publicReference ?? "")) return fail();
    // No token, internal identity, provider data or private facts in this result.
    return Response.json({ publicReference: r.value.publicReference }, { headers: { "cache-control": "no-store" } });
  };
  const probe = await connection.adapter.callRestrictedRpc<CommitResult>("order_commit", { ...args, p_operation: "probe", p_facts: null });
  if (probe.status !== "found") return fail();
  if (probe.value.status !== "not_found") return project(probe.value);

  const catalog = new LocalCatalogAuthority(environment);
  const baseline = await catalog.readSnapshot();
  if (baseline.status !== "found") return fail();
  const hasImages = cart.record.lines.some(line => line.handoff.customizationValues.some(f => f.kind === "image" && f.images.length));
  const resolved = await Promise.all(cart.record.lines.map(line => evaluateLocalCheckoutLine(line, {
    catalogRepository: catalog.repository, customizationFieldRepository: catalog, verifiedOwnerId: cart.owner.ownerId,
    pricingResolver: pricingInput => catalog.resolveCustomizationPricing(pricingInput),
    ...(hasImages ? { receiptRepository: persistentPurchaseReceipts(environment, cart.verifyOwner, cart.record.lines.map(l => l.handoff)) } : {}),
  }, new Date().toISOString())));
  if (resolved.some(line => line.status !== "resolved")) return fail(409);
  const lines = resolved.flatMap((line, index) => line.status === "resolved" ? [{ ...line, cartLine: cart.record.lines[index] }] : []);
  const physical = lines.some(line => line.summary.fulfillmentType === "physical");
  if (physical && !parseLocalCheckoutRequest({ ...input.contact, shippingMethod: input.shippingMethod, couponCode: input.couponCode || undefined }).ok) return fail(409);
  const rules = await new LocalCheckoutRuleAuthority(environment).evaluate({ requiresShipping: physical,
    country: input.contact.country, method: input.shippingMethod, couponCode: input.couponCode,
    currency: "USD", subtotalCents: lines.reduce((sum, line) => sum + line.summary.lineSubtotalCents, 0) });
  if (rules.status !== "found" || rules.value.shipping.status === "unsupported") return fail();
  const versions = localOrderPurchaseVersions({ catalog: baseline.value.dataSet, configurations: baseline.value.configurations,
    rules: baseline.value.rules, versions: baseline.value.versions, selections: lines.map(l => l.handoff),
    requiresShipping: physical, country: input.contact.country, method: input.shippingMethod, couponCode: input.couponCode });
  if (!versions) return fail();
  const prepared = prepareLocalOrderPurchaseFacts({ lines, catalog: baseline.value.dataSet,
    purchasedFulfillments: baseline.value.purchasedFulfillments,
    configurations: baseline.value.configurations, versions,
    shippingCents: rules.value.shipping.amountCents, discountCents: rules.value.coupon.discountCents });
  if (prepared.status !== "found" || !await cart.verifyOwner()) return fail();
  const committed = await connection.adapter.callRestrictedRpc<CommitResult>("order_commit", { ...args, p_operation: "commit",
    p_facts: { ...prepared.value, contact: input.contact, shippingMethod: input.shippingMethod,
      couponCode: input.couponCode, couponStatus: rules.value.coupon.status } });
  return committed.status === "found" ? project(committed.value) : fail();
}

/** Test seams are server-only dependencies of the actual HTTP handler, never
 * body parameters. The production route uses these defaults without overrides. */
export interface PersistentOrderHttpDependencies {
  readonly connect?: typeof createLocalPersistentSupabaseAdapter;
  readonly purchase?: typeof createPersistentPurchase;
}
export async function persistentOrderCreateHttp(request: Request, rawInput: unknown,
  environment: RuntimeEnvironment, overrides: PersistentOrderHttpDependencies = {}): Promise<Response> {
  try {
    const input = parsePersistentOrderStructuralInput(rawInput);
    if (!input) return fail(400);
    const composition = resolveLocalPersistentComposition(environment, { requiredCapabilities: ["order", "checkout"] });
    if (composition.status !== "ready") return fail();
    const connection = await (overrides.connect ?? createLocalPersistentSupabaseAdapter)(environment);
    if (connection.status !== "ready" || connection.composition.projectId !== composition.value.projectId
      || connection.composition.markerDigest !== composition.value.markerDigest) return fail();
    const codec = await createPersistentOrderCapabilityCodec(environment, composition.value);
    if (!codec) return fail();
    const gate = await persistentOrderCapabilityGate(request, codec, Math.floor(Date.now() / 1000));
    if (gate.status === "established") return gate.response;
    return await (overrides.purchase ?? createPersistentPurchase)(request, input, environment, connection, gate.capability);
  } catch { return fail(); }
}
