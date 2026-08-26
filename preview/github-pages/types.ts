export interface PreviewCategory {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
}

export interface PreviewOptionValue {
  readonly id: string;
  readonly label: string;
}

export interface PreviewOption {
  readonly id: string;
  readonly name: string;
  readonly values: readonly PreviewOptionValue[];
}

export interface PreviewVariant {
  readonly id: string;
  readonly skuCode: string;
  readonly optionValueId: string;
  readonly priceCents: number;
  readonly isAvailable: boolean;
}

export interface PreviewCustomizationField {
  readonly id: string;
  readonly kind: "short_text" | "long_text" | "image";
  readonly label: string;
  readonly required: boolean;
  readonly maxLength?: number;
  readonly helpText?: string;
}

export interface PreviewProduct {
  readonly slug: string;
  readonly name: string;
  readonly categorySlug: string;
  readonly description: string;
  readonly fulfillmentType: "physical" | "digital";
  readonly productionMode: "custom_manufacturing" | "digital_creation";
  readonly leadTime: string;
  readonly requiresShipping: boolean;
  readonly mediaLabel: string;
  readonly options: readonly PreviewOption[];
  readonly variants: readonly PreviewVariant[];
  readonly customizationFields: readonly PreviewCustomizationField[];
}

export type PreviewPaymentState = "success" | "failed" | "cancelled";

export interface PreviewPaymentFixture {
  readonly state: PreviewPaymentState;
  readonly label: string;
}

export type PreviewFulfillmentState =
  | "photo_review"
  | "preview_pending"
  | "preview_revision_requested"
  | "preview_approved"
  | "in_production"
  | "quality_check";

export interface PreviewFulfillmentFixture {
  readonly state: PreviewFulfillmentState;
  readonly label: string;
}

export interface PreviewCartLineDraft {
  readonly productSlug: string;
  readonly productName: string;
  readonly skuCode: string;
  readonly optionLabel: string;
  readonly unitPriceCents: number;
  readonly customizationSummary: readonly string[];
  readonly imageSelected: boolean;
  readonly requiresShipping: boolean;
}

export interface PreviewCartItem extends PreviewCartLineDraft {
  readonly lineId: string;
  readonly quantity: number;
}

export type PreviewCouponStatus = "none" | "valid" | "expired" | "invalid";

export interface PreviewCouponResult {
  readonly status: PreviewCouponStatus;
  readonly label: string;
  readonly discountCents: number;
}

export interface PreviewShippingOption {
  readonly id: string;
  readonly label: string;
  readonly priceCents: number;
}

export interface PreviewCheckoutDraft {
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly country: string;
  readonly stateProvince: string;
  readonly city: string;
  readonly addressLine1: string;
  readonly postalCode: string;
  readonly phone: string;
  readonly shippingOptionId: string;
  readonly couponCode: string;
}

export interface PreviewCheckoutSummary {
  readonly subtotalCents: number;
  readonly shippingCents: number;
  readonly shippingLabel: string;
  readonly coupon: PreviewCouponResult;
  readonly taxStatus: "not_activated";
  readonly taxAmountCents: null;
  readonly localDemoTotalCents: number;
}

export interface PreviewFulfillmentDemoState {
  readonly state: PreviewFulfillmentState;
  readonly previewVersion: 0 | 1 | 2 | 3;
  readonly revisionCount: number;
}

export type PreviewFulfillmentAction =
  | "enter_photo_review"
  | "publish_preview"
  | "approve_preview"
  | "request_revision"
  | "start_production"
  | "mark_quality_check";

export type PreviewRoute =
  | { readonly kind: "home" }
  | { readonly kind: "shop" }
  | { readonly kind: "category"; readonly slug: string }
  | { readonly kind: "product"; readonly slug: string }
  | { readonly kind: "placeholder"; readonly label: string; readonly route: string };
