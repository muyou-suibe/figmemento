export type LocalCheckoutIssueCode =
  | "INVALID_CHECKOUT_INPUT"
  | "EMPTY_CART"
  | "CART_UNAVAILABLE"
  | "CART_LINE_INVALID"
  | "CATALOG_UNAVAILABLE"
  | "CUSTOMIZATION_UNAVAILABLE"
  | "CUSTOMIZATION_INVALID"
  | "UPLOAD_UNAVAILABLE"
  | "UPLOAD_INVALID"
  | "VARIANT_UNAVAILABLE"
  | "STALE_CATALOG"
  | "SHIPPING_UNAVAILABLE"
  | "COUPON_UNAVAILABLE"
  | "MIXED_CURRENCY"
  | "BASE_AUTHORITY_UNAVAILABLE"
  | "CHECKOUT_UNAVAILABLE";

export interface LocalCheckoutIssue {
  readonly code: LocalCheckoutIssueCode;
  readonly message: string;
}

export interface LocalCheckoutAddress {
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly country: string;
  readonly stateProvince?: string;
  readonly city: string;
  readonly addressLine1: string;
  readonly postalCode: string;
  readonly phone?: string;
}

export interface LocalCheckoutRequest {
  readonly address: LocalCheckoutAddress;
  readonly shippingMethod: string;
  readonly couponCode?: string;
  readonly pointsToRedeem?: number;
}

export interface LocalCheckoutValidationSuccess<T> {
  readonly ok: true;
  readonly value: T;
}

export interface LocalCheckoutValidationFailure {
  readonly ok: false;
  readonly issues: readonly LocalCheckoutIssue[];
}

export type LocalCheckoutValidationResult<T> =
  | LocalCheckoutValidationSuccess<T>
  | LocalCheckoutValidationFailure;

const ADDRESS_KEYS = new Set([
  "email",
  "firstName",
  "lastName",
  "country",
  "stateProvince",
  "city",
  "addressLine1",
  "postalCode",
  "phone",
]);
const REQUEST_KEYS = new Set([
  "email",
  "firstName",
  "lastName",
  "country",
  "stateProvince",
  "city",
  "addressLine1",
  "postalCode",
  "phone",
  "shippingMethod",
  "couponCode",
  "pointsToRedeem",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function issue(path: string, message: string): LocalCheckoutIssue {
  return { code: "INVALID_CHECKOUT_INPUT", message: `${path}: ${message}` };
}

function readRequiredString(
  input: Record<string, unknown>,
  key: string,
  maxLength: number,
  issues: LocalCheckoutIssue[],
): string | undefined {
  const value = input[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    issues.push(issue(key, "required"));
    return undefined;
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) issues.push(issue(key, "too_long"));
  return normalized;
}

function readOptionalString(
  input: Record<string, unknown>,
  key: string,
  maxLength: number,
  issues: LocalCheckoutIssue[],
): string | undefined {
  const value = input[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    issues.push(issue(key, "invalid_type"));
    return undefined;
  }
  const normalized = value.trim();
  if (normalized.length === 0) return undefined;
  if (normalized.length > maxLength) issues.push(issue(key, "too_long"));
  return normalized;
}

function checkUnknownFields(input: Record<string, unknown>, keys: Set<string>, issues: LocalCheckoutIssue[]): void {
  for (const key of Object.keys(input)) {
    if (!keys.has(key)) issues.push(issue(key, "unknown_field"));
  }
}

function parseAddress(input: Record<string, unknown>, issues: LocalCheckoutIssue[]): LocalCheckoutAddress | undefined {
  checkUnknownFields(input, ADDRESS_KEYS, issues);
  const email = readRequiredString(input, "email", 254, issues);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) issues.push(issue("email", "invalid_format"));
  const firstName = readRequiredString(input, "firstName", 100, issues);
  const lastName = readRequiredString(input, "lastName", 100, issues);
  const countryRaw = readRequiredString(input, "country", 2, issues);
  const city = readRequiredString(input, "city", 120, issues);
  const addressLine1 = readRequiredString(input, "addressLine1", 200, issues);
  const postalCode = readRequiredString(input, "postalCode", 30, issues);
  const stateProvince = readOptionalString(input, "stateProvince", 120, issues);
  const phone = readOptionalString(input, "phone", 40, issues);

  const country = countryRaw?.toUpperCase();
  if (country && !/^[A-Z]{2}$/.test(country)) issues.push(issue("country", "invalid_format"));

  if (issues.length > 0 || !email || !firstName || !lastName || !country || !city || !addressLine1 || !postalCode) {
    return undefined;
  }
  return {
    email,
    firstName,
    lastName,
    country,
    ...(stateProvince ? { stateProvince } : {}),
    city,
    addressLine1,
    postalCode,
    ...(phone ? { phone } : {}),
  };
}

/** Parses only browser-owned structural inputs; it has no price or authority. */
export function parseLocalCheckoutRequest(value: unknown): LocalCheckoutValidationResult<LocalCheckoutRequest> {
  if (!isRecord(value)) return { ok: false, issues: [issue("$", "object_required")] };
  const issues: LocalCheckoutIssue[] = [];
  checkUnknownFields(value, REQUEST_KEYS, issues);
  const address = parseAddress({
    email: value.email,
    firstName: value.firstName,
    lastName: value.lastName,
    country: value.country,
    stateProvince: value.stateProvince,
    city: value.city,
    addressLine1: value.addressLine1,
    postalCode: value.postalCode,
    phone: value.phone,
  }, issues);
  const shippingMethod = readRequiredString(value, "shippingMethod", 64, issues);
  const couponCode = readOptionalString(value, "couponCode", 64, issues);
  const pointsToRedeem = value.pointsToRedeem === undefined
    ? undefined
    : typeof value.pointsToRedeem === "number" && Number.isSafeInteger(value.pointsToRedeem) && value.pointsToRedeem >= 0 && value.pointsToRedeem <= 1_000_000
      ? value.pointsToRedeem
      : (issues.push(issue("pointsToRedeem", "invalid_value")), undefined);
  if (couponCode && !/^[A-Za-z0-9_-]+$/.test(couponCode)) issues.push(issue("couponCode", "invalid_format"));
  if (shippingMethod && !/^[A-Za-z0-9_-]+$/.test(shippingMethod)) issues.push(issue("shippingMethod", "invalid_format"));
  if (!address || !shippingMethod || issues.length > 0) return { ok: false, issues };
  return {
    ok: true,
    value: {
      address,
      shippingMethod,
      ...(couponCode ? { couponCode } : {}),
      ...(pointsToRedeem !== undefined ? { pointsToRedeem } : {}),
    },
  };
}

export type LocalShippingResult =
  | {
      readonly status: "eligible";
      readonly country: string;
      readonly method: string;
      readonly amountCents: number;
      readonly currency: "USD";
      readonly estimatedRange: string;
      readonly developmentOnly: true;
    }
  | {
      readonly status: "unsupported";
      readonly issueCode: "SHIPPING_UNAVAILABLE";
      readonly developmentOnly: true;
    };

export type LocalCouponStatus = "not_selected" | "valid" | "invalid" | "expired" | "not_applicable";

export interface LocalCouponResult {
  readonly status: LocalCouponStatus;
  readonly discountCents: number;
  readonly code?: string;
  readonly developmentOnly: true;
}

export type LocalCouponEvaluationResult =
  | LocalCouponResult
  | {
      readonly status: "unavailable";
      readonly issueCode: "COUPON_UNAVAILABLE";
      readonly developmentOnly: true;
    };

export interface LocalTaxState {
  readonly status: "not_activated";
  readonly amountCents: null;
}

export function createNotActivatedTaxState(): LocalTaxState {
  return { status: "not_activated", amountCents: null };
}

export function calculateLocalDemoTotal(input: {
  readonly subtotalCents: number;
  readonly shippingCents: number;
  readonly discountCents: number;
}): number | null {
  const values = [input.subtotalCents, input.shippingCents, input.discountCents];
  if (!values.every((value) => Number.isSafeInteger(value) && value >= 0)) return null;
  const total = input.subtotalCents + input.shippingCents - input.discountCents;
  return total >= 0 && Number.isSafeInteger(total) ? total : null;
}

export interface LocalCheckoutLineSummary {
  readonly lineId: string;
  readonly productId: string;
  readonly productName: string;
  readonly productSlug: string;
  readonly variantId: string;
  readonly skuCode: string;
  readonly selectedOptions: readonly { readonly optionId: string; readonly valueId: string }[];
  readonly unitBasePriceCents: number;
  /** Final server-calculated configured unit price when C03 pricing applies. */
  readonly unitPriceCents?: number;
  readonly currency: "USD";
  readonly fulfillmentType: "physical" | "digital";
  readonly quantity: number;
  readonly lineSubtotalCents: number;
}

export interface AcceptedLocalCheckout {
  /** A server-only evaluation result; this value has no durable identity. */
  readonly kind: "accepted_local_checkout";
  readonly lines: readonly LocalCheckoutLineSummary[];
  readonly currency: "USD";
  readonly subtotalCents: number;
  readonly shipping: Extract<LocalShippingResult, { status: "eligible" }>;
  readonly coupon: LocalCouponResult;
  readonly promotionDiscountCents?: number;
  readonly pointsDiscountCents?: number;
  readonly pointsRedeemed?: number;
  readonly tax: LocalTaxState;
  /** Development/test arithmetic only; never a payable or Order amount. */
  readonly localDemoTotalCents: number;
}

export type LocalCheckoutEvaluationResult =
  | { readonly status: "accepted"; readonly value: AcceptedLocalCheckout }
  | { readonly status: "blocked"; readonly issues: readonly LocalCheckoutIssue[] }
  | { readonly status: "unavailable"; readonly issues: readonly LocalCheckoutIssue[] };
