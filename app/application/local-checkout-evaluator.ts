import {
  acceptConfiguredItemHandoff,
  type ConfiguredItemHandoffAcceptanceDependencies,
  type SafeConfiguredItemRejectionReason,
} from "./configured-item-handoff-acceptance.ts";
import {
  calculateResolvedOrderSubtotal,
  resolveOrderCatalogItems,
  type OrderCatalogResolutionRejection,
  type ResolvedOrderCatalogItem,
} from "./order-catalog-resolution.ts";
import type { CustomizationFieldReadRepository } from "./customization-field-repository.ts";
import type { CustomerUploadReceiptRepository } from "./customer-upload-repository.ts";
import type { PublicCatalogReadRepository } from "./catalog-repository.ts";
import {
  calculateLocalDemoTotal,
  createNotActivatedTaxState,
  type AcceptedLocalCheckout,
  type LocalCheckoutEvaluationResult,
  type LocalCheckoutIssue,
  type LocalCheckoutRequest,
  type LocalCouponEvaluationResult,
  type LocalShippingResult,
  type LocalCheckoutLineSummary,
} from "../domain/local-checkout.ts";
import {
  canonicalVariantSignature,
} from "../domain/catalog/variant.ts";
import type { ConfiguredItemHandoff } from "../domain/configured-item.ts";
import type {
  CustomerUploadOwnerId,
  CustomerUploadTimestamp,
} from "../domain/customer-upload.ts";
import {
  parseCartQuantity,
  type ShoppingCartProvider,
  type StoredCartLine,
  type ShoppingCartRecord,
} from "../domain/shopping-cart.ts";
import type { LocalPromotionResolver } from "./local-promotion.ts";

export interface LocalCheckoutEvaluatorDependencies {
  readonly cartReader: Pick<ShoppingCartProvider, "getCart">;
  readonly catalogRepository: Pick<PublicCatalogReadRepository, "findPublicProductById">;
  readonly customizationFieldRepository: Pick<
    CustomizationFieldReadRepository,
    "getCustomizationFieldsForProduct"
  >;
  readonly receiptRepository?: Pick<CustomerUploadReceiptRepository, "findOwnedReceipt">;
  /** Derived by the existing owner boundary; never read from checkout input. */
  readonly verifiedOwnerId?: CustomerUploadOwnerId | null;
  readonly shippingResolver: (input: {
    readonly country: string;
    readonly method: string;
    readonly subtotalCents?: number;
  }) => LocalShippingResult;
  readonly couponResolver: (input: {
    readonly couponCode?: string;
    readonly subtotalCents: number;
  }) => LocalCouponEvaluationResult;
  readonly promotionResolver?: LocalPromotionResolver;
  readonly firstOrderEligible?: boolean;
  readonly pointsBalance?: number;
}

export interface FreshLocalCheckoutLine {
  readonly cartLine: StoredCartLine;
  readonly handoff: ConfiguredItemHandoff;
  readonly summary: LocalCheckoutLineSummary;
}

export type FreshLocalCheckoutAuthorityResult =
  | {
      readonly status: "accepted";
      readonly value: AcceptedLocalCheckout;
      readonly cart: ShoppingCartRecord;
      readonly lines: readonly FreshLocalCheckoutLine[];
    }
  | { readonly status: "blocked" | "unavailable"; readonly issues: readonly LocalCheckoutIssue[] };

const missingReceiptRepository: Pick<CustomerUploadReceiptRepository, "findOwnedReceipt"> = {
  async findOwnedReceipt() {
    return { status: "not_found" };
  },
};

function issue(code: LocalCheckoutIssue["code"], message: string): LocalCheckoutIssue {
  return { code, message };
}

function blocked(code: LocalCheckoutIssue["code"], message: string): { readonly status: "blocked"; readonly issues: readonly LocalCheckoutIssue[] } {
  return { status: "blocked", issues: [issue(code, message)] };
}

function unavailable(code: LocalCheckoutIssue["code"], message: string): { readonly status: "unavailable"; readonly issues: readonly LocalCheckoutIssue[] } {
  return { status: "unavailable", issues: [issue(code, message)] };
}

function mapAcceptanceReason(reason: SafeConfiguredItemRejectionReason): LocalCheckoutIssue {
  switch (reason) {
    case "product_not_available":
    case "variant_unavailable":
      return issue("VARIANT_UNAVAILABLE", "A Cart item is no longer available.");
    case "variant_incomplete":
    case "variant_mismatch":
    case "variant_invalid":
      return issue("STALE_CATALOG", "A Cart item selection no longer matches the current catalog.");
    case "customization_not_configured":
    case "invalid_customization":
      return issue("CUSTOMIZATION_INVALID", "A Cart personalization needs review.");
    case "stale_configuration":
      return issue("STALE_CATALOG", "A Cart personalization configuration is stale.");
    case "receipt_not_owned_or_missing":
    case "receipt_inactive":
    case "receipt_expired":
      return issue("UPLOAD_INVALID", "An image personalization cannot be verified.");
    case "catalog_failure":
      return issue("CATALOG_UNAVAILABLE", "The current catalog cannot be verified.");
    case "source_failure":
      return issue("CHECKOUT_UNAVAILABLE", "Checkout cannot be evaluated right now.");
    case "invalid_handoff":
      return issue("CART_LINE_INVALID", "A Cart item is invalid.");
  }
}

function mapOrderResolutionReason(
  reason: OrderCatalogResolutionRejection,
): LocalCheckoutIssue {
  switch (reason) {
    case "variant_unavailable":
    case "variant_not_found":
    case "product_not_eligible":
      return issue("VARIANT_UNAVAILABLE", "A Cart item is no longer available.");
    case "variant_mismatch":
    case "sku_mismatch":
    case "selected_options_mismatch":
      return issue("STALE_CATALOG", "A Cart item selection no longer matches the current catalog.");
    case "product_not_found":
    case "catalog_source_failure":
      return issue("CATALOG_UNAVAILABLE", "The current catalog cannot be verified.");
    case "invalid_quantity":
      return issue("CART_LINE_INVALID", "A Cart quantity is invalid.");
    case "invalid_catalog_configuration":
    default:
      return issue("BASE_AUTHORITY_UNAVAILABLE", "The current catalog authority cannot be verified.");
  }
}

function sameOptions(
  left: readonly { readonly optionId: string; readonly valueId: string }[],
  right: readonly { readonly optionId: string; readonly valueId: string }[],
): boolean {
  return left.length === right.length && canonicalVariantSignature(left) === canonicalVariantSignature(right);
}

function safeSubtotal(items: readonly ResolvedOrderCatalogItem[]): number | null {
  const subtotal = calculateResolvedOrderSubtotal(items);
  return Number.isSafeInteger(subtotal) && subtotal >= 0 ? subtotal : null;
}

function compareSnapshot(
  line: StoredCartLine,
  resolved: ResolvedOrderCatalogItem,
): LocalCheckoutIssue | null {
  const snapshot = line.snapshot;
  if (
    resolved.productId !== snapshot.productId
    || resolved.productName !== snapshot.productName
    || resolved.productSlug !== snapshot.productSlug
    || resolved.variantId !== snapshot.variantId
    || resolved.skuCode !== snapshot.skuCode
    || !sameOptions(resolved.selectedOptions, snapshot.selectedOptions)
  ) {
    return issue("STALE_CATALOG", "A Cart item no longer matches the current catalog.");
  }
  if (resolved.unitBasePriceCents !== snapshot.unitPriceCents) {
    return issue("STALE_CATALOG", "A Cart price has changed and needs review.");
  }
  if (resolved.currency !== snapshot.currency) {
    return issue("MIXED_CURRENCY", "Cart currency authority cannot be reconciled.");
  }
  return null;
}

function lineSummary(line: StoredCartLine, resolved: ResolvedOrderCatalogItem): LocalCheckoutLineSummary {
  return {
    lineId: line.lineId,
    productId: resolved.productId,
    productName: resolved.productName,
    productSlug: resolved.productSlug,
    variantId: resolved.variantId,
    skuCode: resolved.skuCode,
    selectedOptions: resolved.selectedOptions.map((selection) => ({ ...selection })),
    unitBasePriceCents: resolved.unitBasePriceCents,
    currency: resolved.currency,
    fulfillmentType: resolved.fulfillmentType,
    quantity: resolved.quantity,
    lineSubtotalCents: resolved.unitBasePriceCents * resolved.quantity,
  };
}

function isImageLine(line: StoredCartLine): boolean {
  return line.handoff.customizationValues.some(
    (value) => value.kind === "image" && value.images.length > 0,
  );
}

function lineRequest(line: StoredCartLine): {
  productId: string;
  variantId: string;
  skuCode: string;
  selectedOptions: StoredCartLine["snapshot"]["selectedOptions"];
  slug: string;
  quantity: number;
} {
  return {
    productId: line.handoff.productId,
    variantId: line.handoff.variantId,
    skuCode: line.handoff.skuCode,
    selectedOptions: line.handoff.selectedOptions,
    slug: line.snapshot.productSlug,
    quantity: line.quantity,
  };
}

export async function evaluateLocalCheckoutLine(
  line: StoredCartLine,
  dependencies: Pick<LocalCheckoutEvaluatorDependencies, "catalogRepository" | "customizationFieldRepository" | "receiptRepository" | "verifiedOwnerId">,
  observedAt: CustomerUploadTimestamp,
): Promise<
  | { readonly status: "resolved"; readonly summary: LocalCheckoutLineSummary; readonly handoff: ConfiguredItemHandoff }
  | { readonly status: "rejected"; readonly issue: LocalCheckoutIssue }
  | { readonly status: "unavailable"; readonly issue: LocalCheckoutIssue }
> {
  if (line.snapshot.productId !== line.handoff.productId
    || line.snapshot.variantId !== line.handoff.variantId
    || line.snapshot.skuCode !== line.handoff.skuCode
    || !sameOptions(line.snapshot.selectedOptions, line.handoff.selectedOptions)) {
    return { status: "rejected", issue: issue("STALE_CATALOG", "A Cart item no longer matches its configuration.") };
  }
  if (line.snapshot.availability !== "available") {
    return { status: "rejected", issue: issue("VARIANT_UNAVAILABLE", "A Cart item is no longer available.") };
  }
  if (parseCartQuantity(line.quantity) === null) {
    return { status: "rejected", issue: issue("CART_LINE_INVALID", "A Cart quantity is invalid.") };
  }

  let acceptance;
  try {
    acceptance = await acceptConfiguredItemHandoff(
      {
        rawInput: line.handoff,
        verifiedOwnerId: dependencies.verifiedOwnerId ?? null,
        observedAt,
      },
      {
        catalogRepository: dependencies.catalogRepository,
        customizationFieldRepository: dependencies.customizationFieldRepository,
        receiptRepository: dependencies.receiptRepository ?? missingReceiptRepository,
      } satisfies ConfiguredItemHandoffAcceptanceDependencies,
    );
  } catch {
    return { status: "unavailable", issue: issue("CHECKOUT_UNAVAILABLE", "Checkout cannot be evaluated right now.") };
  }
  if (acceptance.status !== "accepted") {
    const mapped = mapAcceptanceReason(acceptance.reason);
    const imageUnavailable = isImageLine(line)
      && (acceptance.reason === "receipt_not_owned_or_missing" || acceptance.reason === "source_failure")
      && !dependencies.receiptRepository;
    const authorityUnavailable = acceptance.reason === "catalog_failure"
      || acceptance.reason === "source_failure";
    return {
      status: imageUnavailable || authorityUnavailable ? "unavailable" : "rejected",
      issue: imageUnavailable ? issue("UPLOAD_UNAVAILABLE", "Image personalization is temporarily unavailable.") : mapped,
    };
  }

  let resolved;
  try {
    resolved = await resolveOrderCatalogItems([lineRequest(line)], dependencies.catalogRepository);
  } catch {
    return { status: "unavailable", issue: issue("CATALOG_UNAVAILABLE", "The current catalog cannot be verified.") };
  }
  if (resolved.status !== "resolved") {
    const mapped = mapOrderResolutionReason(resolved.reason);
    return {
      status: mapped.code === "CATALOG_UNAVAILABLE" || mapped.code === "BASE_AUTHORITY_UNAVAILABLE"
        ? "unavailable"
        : "rejected",
      issue: mapped,
    };
  }
  const current = resolved.items[0];
  if (!current) return { status: "unavailable", issue: issue("BASE_AUTHORITY_UNAVAILABLE", "The current catalog authority cannot be verified.") };
  const snapshotIssue = compareSnapshot(line, current);
  if (snapshotIssue) return { status: "rejected", issue: snapshotIssue };
  return { status: "resolved", summary: lineSummary(line, current), handoff: acceptance.handoff };
}

/**
 * Server-only fresh authority evaluation shared by read-only Checkout and the
 * Local Order creation boundary. The returned handoffs remain protected and
 * are never suitable for a browser projection.
 */
export async function evaluateFreshLocalCheckout(
  cartId: string | null,
  request: LocalCheckoutRequest,
  dependencies: LocalCheckoutEvaluatorDependencies,
  observedAt: CustomerUploadTimestamp,
): Promise<FreshLocalCheckoutAuthorityResult> {
  if (cartId === null) return blocked("EMPTY_CART", "Your Cart is empty.");

  let cartResult;
  try {
    cartResult = await dependencies.cartReader.getCart(cartId);
  } catch {
    return unavailable("CART_UNAVAILABLE", "Your Cart is temporarily unavailable.");
  }
  if (cartResult.status === "not_found") return blocked("EMPTY_CART", "Your Cart is empty.");
  if (cartResult.status !== "found") return unavailable("CART_UNAVAILABLE", "Your Cart is temporarily unavailable.");
  if (cartResult.value.lines.length === 0) return blocked("EMPTY_CART", "Your Cart is empty.");

  const lineResults = await Promise.all(
    cartResult.value.lines.map((line) => evaluateLocalCheckoutLine(line, dependencies, observedAt)),
  );
  const lineIssues = lineResults
    .filter((result): result is Extract<typeof result, { status: "rejected" | "unavailable" }> => result.status !== "resolved")
    .map((result) => result.issue);
  if (lineIssues.length > 0) {
    const hasUnavailable = lineResults.some((result) => result.status === "unavailable");
    return hasUnavailable
      ? { status: "unavailable", issues: lineIssues }
      : { status: "blocked", issues: lineIssues };
  }

  const resolvedLines = lineResults as Extract<typeof lineResults[number], { status: "resolved" }>[];
  const lines = resolvedLines.map((result) => result.summary);
  const currency = lines[0]?.currency;
  if (!currency || lines.some((line) => line.currency !== currency)) {
    return blocked("MIXED_CURRENCY", "Cart currency authority cannot be reconciled.");
  }
  const subtotalCents = safeSubtotal(lines);
  if (subtotalCents === null) return unavailable("BASE_AUTHORITY_UNAVAILABLE", "Cart pricing authority cannot be verified.");

  let shipping: LocalShippingResult;
  try {
    shipping = dependencies.shippingResolver({
      country: request.address.country,
      method: request.shippingMethod,
      subtotalCents,
    });
  } catch {
    return unavailable("SHIPPING_UNAVAILABLE", "Local shipping is temporarily unavailable.");
  }
  if (shipping.status !== "eligible") return blocked("SHIPPING_UNAVAILABLE", "This local shipping selection is unavailable.");
  if (shipping.currency !== currency) return blocked("MIXED_CURRENCY", "Shipping currency authority cannot be reconciled.");

  let coupon: LocalCouponEvaluationResult;
  let promotionDiscountCents: number | undefined;
  let pointsDiscountCents: number | undefined;
  let pointsRedeemed: number | undefined;
  let totalDiscountCents = 0;
  try {
    if (dependencies.promotionResolver) {
      const promotion = dependencies.promotionResolver({
        couponCode: request.couponCode,
        subtotalCents,
        firstOrderEligible: dependencies.firstOrderEligible === true,
        pointsBalance: dependencies.pointsBalance ?? 0,
        requestedPoints: request.pointsToRedeem ?? 0,
      });
      if ("totalDiscountCents" in promotion) {
        coupon = promotion.coupon;
        promotionDiscountCents = promotion.promotionDiscountCents;
        pointsDiscountCents = promotion.pointsDiscountCents;
        pointsRedeemed = promotion.pointsRedeemed;
        totalDiscountCents = promotion.totalDiscountCents;
      } else {
        coupon = promotion;
        totalDiscountCents = promotion.status === "unavailable" ? 0 : promotion.discountCents;
      }
    } else {
      coupon = dependencies.couponResolver({ couponCode: request.couponCode, subtotalCents });
      totalDiscountCents = coupon.status === "unavailable" ? 0 : coupon.discountCents;
    }
  } catch {
    return unavailable("COUPON_UNAVAILABLE", "Coupon status cannot be safely evaluated.");
  }
  if (coupon.status === "unavailable") return unavailable("COUPON_UNAVAILABLE", "Coupon status cannot be safely evaluated.");
  if (!Number.isSafeInteger(coupon.discountCents) || coupon.discountCents < 0) {
    return unavailable("COUPON_UNAVAILABLE", "Coupon status cannot be safely evaluated.");
  }
  if (!Number.isSafeInteger(totalDiscountCents) || totalDiscountCents < 0) {
    return unavailable("COUPON_UNAVAILABLE", "Promotion status cannot be safely evaluated.");
  }
  const localDemoTotalCents = calculateLocalDemoTotal({
    subtotalCents,
    shippingCents: shipping.amountCents,
    discountCents: totalDiscountCents,
  });
  if (localDemoTotalCents === null) return unavailable("BASE_AUTHORITY_UNAVAILABLE", "Checkout arithmetic cannot be safely evaluated.");

  return {
    status: "accepted",
    value: {
      kind: "accepted_local_checkout",
      lines,
      currency,
      subtotalCents,
      shipping,
      coupon,
      ...(promotionDiscountCents !== undefined ? { promotionDiscountCents } : {}),
      ...(pointsDiscountCents !== undefined ? { pointsDiscountCents } : {}),
      ...(pointsRedeemed !== undefined ? { pointsRedeemed } : {}),
      tax: createNotActivatedTaxState(),
      localDemoTotalCents,
    },
    cart: cartResult.value,
    lines: resolvedLines.map((result) => ({
      cartLine: cartResult.value.lines.find((line) => line.lineId === result.summary.lineId) as StoredCartLine,
      handoff: result.handoff,
      summary: result.summary,
    })),
  };
}

export class LocalCheckoutEvaluator {
  private readonly dependencies: LocalCheckoutEvaluatorDependencies;

  constructor(dependencies: LocalCheckoutEvaluatorDependencies) {
    this.dependencies = dependencies;
  }

  async evaluate(
    cartId: string | null,
    request: LocalCheckoutRequest,
    observedAt: CustomerUploadTimestamp,
  ): Promise<LocalCheckoutEvaluationResult> {
    const evaluated = await evaluateFreshLocalCheckout(cartId, request, this.dependencies, observedAt);
    return evaluated.status === "accepted"
      ? { status: "accepted", value: evaluated.value }
      : evaluated;
  }
}
