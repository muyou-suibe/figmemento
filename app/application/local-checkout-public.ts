import type {
  LocalCheckoutEvaluationResult,
  LocalCheckoutIssue,
} from "../domain/local-checkout.ts";

export interface LocalCheckoutPublicLine {
  readonly lineId: string;
  readonly productId: string;
  readonly productName: string;
  readonly productSlug: string;
  readonly variantId: string;
  readonly skuCode: string;
  readonly selectedOptions: readonly { readonly optionId: string; readonly valueId: string }[];
  readonly unitBasePriceCents: number;
  readonly currency: "USD";
  readonly quantity: number;
  readonly lineSubtotalCents: number;
}

export interface LocalCheckoutPublicAccepted {
  readonly status: "accepted";
  readonly fixtureNotice: "DEVELOPMENT / TEST ONLY";
  readonly lines: readonly LocalCheckoutPublicLine[];
  readonly currency: "USD";
  readonly subtotalCents: number;
  readonly shipping: {
    readonly method: string;
    readonly amountCents: number;
    readonly currency: "USD";
    readonly estimatedRange: string;
  };
  readonly coupon: {
    readonly status: "not_selected" | "valid" | "invalid" | "expired" | "not_applicable";
    readonly discountCents: number;
  };
  readonly promotionDiscountCents?: number;
  readonly pointsDiscountCents?: number;
  readonly pointsRedeemed?: number;
  readonly tax: { readonly status: "not_activated"; readonly amountCents: null };
  readonly localDemoTotalCents: number;
}

export interface LocalCheckoutPublicFailure {
  readonly status: "blocked" | "unavailable";
  readonly issues: readonly LocalCheckoutIssue[];
}

export type LocalCheckoutPublicProjection =
  | LocalCheckoutPublicAccepted
  | LocalCheckoutPublicFailure;

/**
 * Explicitly projects the server-only evaluation result. No handoff,
 * ownership, receipt, Cart cookie, storage, provider, or durable identity is
 * allowed to cross this boundary.
 */
export function projectLocalCheckoutResult(
  result: LocalCheckoutEvaluationResult,
): LocalCheckoutPublicProjection {
  if (result.status !== "accepted") {
    return {
      status: result.status,
      issues: result.issues.map((entry) => ({ code: entry.code, message: entry.message })),
    };
  }

  return {
    status: "accepted",
    fixtureNotice: "DEVELOPMENT / TEST ONLY",
    lines: result.value.lines.map((line) => ({
      lineId: line.lineId,
      productId: line.productId,
      productName: line.productName,
      productSlug: line.productSlug,
      variantId: line.variantId,
      skuCode: line.skuCode,
      selectedOptions: line.selectedOptions.map((selection) => ({ ...selection })),
      unitBasePriceCents: line.unitBasePriceCents,
      currency: line.currency,
      quantity: line.quantity,
      lineSubtotalCents: line.lineSubtotalCents,
    })),
    currency: result.value.currency,
    subtotalCents: result.value.subtotalCents,
    shipping: {
      method: result.value.shipping.method,
      amountCents: result.value.shipping.amountCents,
      currency: result.value.shipping.currency,
      estimatedRange: result.value.shipping.estimatedRange,
    },
    coupon: {
      status: result.value.coupon.status,
      discountCents: result.value.coupon.discountCents,
    },
    ...(result.value.promotionDiscountCents !== undefined ? { promotionDiscountCents: result.value.promotionDiscountCents } : {}),
    ...(result.value.pointsDiscountCents !== undefined ? { pointsDiscountCents: result.value.pointsDiscountCents } : {}),
    ...(result.value.pointsRedeemed !== undefined ? { pointsRedeemed: result.value.pointsRedeemed } : {}),
    tax: {
      status: result.value.tax.status,
      amountCents: result.value.tax.amountCents,
    },
    localDemoTotalCents: result.value.localDemoTotalCents,
  };
}
