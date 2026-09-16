import { maxRedeemablePoints, pointsDiscountCents } from "../domain/customer-points.ts";
import type { LocalCouponEvaluationResult, LocalCouponResult } from "../domain/local-checkout.ts";

export interface LocalPromotionEvaluationInput {
  readonly couponCode?: string;
  readonly subtotalCents: number;
  readonly firstOrderEligible: boolean;
  readonly pointsBalance: number;
  readonly requestedPoints: number;
}

export interface LocalPromotionEvaluation {
  readonly coupon: LocalCouponResult;
  readonly promotionDiscountCents: number;
  readonly pointsDiscountCents: number;
  readonly pointsRedeemed: number;
  readonly totalDiscountCents: number;
  readonly policy: "single-best-discount; points require no competing discount";
}

export type LocalPromotionResolver = (input: LocalPromotionEvaluationInput) => LocalPromotionEvaluation | LocalCouponEvaluationResult;

function validCoupon(input: LocalPromotionEvaluationInput): LocalCouponResult {
  const code = input.couponCode?.trim();
  if (!code) return { status: "not_selected", discountCents: 0, developmentOnly: true };
  if (!Number.isSafeInteger(input.subtotalCents) || input.subtotalCents < 0) return { status: "not_applicable", discountCents: 0, code, developmentOnly: true };
  if (code === "WELCOME10") {
    return input.firstOrderEligible
      ? { status: "valid", discountCents: Math.floor(input.subtotalCents / 10), code, developmentOnly: true }
      : { status: "not_applicable", discountCents: 0, code, developmentOnly: true };
  }
  if (code === "EXPIRED10") return { status: "expired", discountCents: 0, code, developmentOnly: true };
  if (code === "NOT_APPLICABLE") return { status: "not_applicable", discountCents: 0, code, developmentOnly: true };
  return { status: "invalid", discountCents: 0, code, developmentOnly: true };
}

/** LOCAL V1 policy; requires future production business review. */
export function evaluateLocalPromotion(input: LocalPromotionEvaluationInput): LocalPromotionEvaluation {
  const coupon = validCoupon(input);
  if (coupon.status === "valid") {
    return { coupon, promotionDiscountCents: 0, pointsDiscountCents: 0, pointsRedeemed: 0, totalDiscountCents: coupon.discountCents, policy: "single-best-discount; points require no competing discount" };
  }
  const threshold = input.subtotalCents >= 7_900 ? 500 : 0;
  if (threshold > 0) {
    return { coupon, promotionDiscountCents: threshold, pointsDiscountCents: 0, pointsRedeemed: 0, totalDiscountCents: threshold, policy: "single-best-discount; points require no competing discount" };
  }
  const requested = Number.isSafeInteger(input.requestedPoints) && input.requestedPoints > 0 ? input.requestedPoints : 0;
  const redeemed = Math.min(requested, maxRedeemablePoints(input.subtotalCents, input.pointsBalance));
  const pointsDiscount = pointsDiscountCents(redeemed);
  return { coupon, promotionDiscountCents: 0, pointsDiscountCents: pointsDiscount, pointsRedeemed: redeemed, totalDiscountCents: pointsDiscount, policy: "single-best-discount; points require no competing discount" };
}
