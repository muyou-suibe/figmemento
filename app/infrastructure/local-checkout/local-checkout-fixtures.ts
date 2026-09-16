import type {
  LocalCouponResult,
  LocalShippingResult,
} from "../../domain/local-checkout.ts";

export const LOCAL_CHECKOUT_FIXTURE_NOTICE = "DEVELOPMENT / TEST ONLY" as const;

const LOCAL_SHIPPING_FIXTURES = [
  {
    country: "US",
    method: "local_standard",
    amountCents: 500,
    currency: "USD" as const,
    estimatedRange: "Local demo estimate: 5–10 business days",
  },
] as const;

export function resolveLocalShippingFixture(input: {
  readonly country: string;
  readonly method: string;
  readonly subtotalCents?: number;
}): LocalShippingResult {
  const match = LOCAL_SHIPPING_FIXTURES.find(
    (fixture) => fixture.country === input.country.toUpperCase() && fixture.method === input.method,
  );
  if (!match) return { status: "unsupported", issueCode: "SHIPPING_UNAVAILABLE", developmentOnly: true };
  return { status: "eligible", ...match, amountCents: input.subtotalCents !== undefined && input.subtotalCents >= 4_900 ? 0 : match.amountCents, developmentOnly: true };
}

export function resolveLocalCouponFixture(input: {
  readonly couponCode?: string;
  readonly subtotalCents: number;
}): LocalCouponResult {
  const code = input.couponCode?.trim();
  if (!code) return { status: "not_selected", discountCents: 0, developmentOnly: true };
  if (!Number.isSafeInteger(input.subtotalCents) || input.subtotalCents < 0) {
    return { status: "not_applicable", discountCents: 0, code, developmentOnly: true };
  }
  if (code === "WELCOME10") {
    return input.subtotalCents >= 5_000
      ? { status: "valid", discountCents: 1_000, code, developmentOnly: true }
      : { status: "not_applicable", discountCents: 0, code, developmentOnly: true };
  }
  if (code === "EXPIRED10") return { status: "expired", discountCents: 0, code, developmentOnly: true };
  if (code === "NOT_APPLICABLE") return { status: "not_applicable", discountCents: 0, code, developmentOnly: true };
  return { status: "invalid", discountCents: 0, code, developmentOnly: true };
}
