import type {
  PreviewCartItem,
  PreviewCartLineDraft,
  PreviewCheckoutDraft,
  PreviewCheckoutSummary,
  PreviewCouponResult,
  PreviewFulfillmentAction,
  PreviewFulfillmentDemoState,
  PreviewShippingOption,
} from "./types.ts";

export const PREVIEW_ORDER_REFERENCE = "FM-PREVIEW-DEMO" as const;

export const previewShippingOptions: readonly PreviewShippingOption[] = [
  { id: "standard-demo-shipping", label: "Standard Demo Shipping", priceCents: 800 },
  { id: "express-demo-shipping", label: "Express Demo Shipping", priceCents: 1800 },
];

export function createPreviewCheckoutDraft(): PreviewCheckoutDraft {
  return {
    email: "",
    firstName: "",
    lastName: "",
    country: "US",
    stateProvince: "",
    city: "",
    addressLine1: "",
    postalCode: "",
    phone: "",
    shippingOptionId: previewShippingOptions[0].id,
    couponCode: "",
  };
}

export function addPreviewCartItem(
  items: readonly PreviewCartItem[],
  draft: PreviewCartLineDraft,
  lineId: string,
): readonly PreviewCartItem[] {
  return [...items, { ...draft, lineId, quantity: 1, customizationSummary: [...draft.customizationSummary] }];
}

export function updatePreviewCartQuantity(
  items: readonly PreviewCartItem[],
  lineId: string,
  delta: number,
): readonly PreviewCartItem[] {
  return items.map((item) => item.lineId === lineId
    ? { ...item, quantity: Math.max(1, item.quantity + delta) }
    : item);
}

export function removePreviewCartItem(items: readonly PreviewCartItem[], lineId: string): readonly PreviewCartItem[] {
  return items.filter((item) => item.lineId !== lineId);
}

export function clearPreviewCart(): readonly PreviewCartItem[] {
  return [];
}

export function previewCartSubtotal(items: readonly PreviewCartItem[]): number {
  return items.reduce((total, item) => total + item.unitPriceCents * item.quantity, 0);
}

export function evaluatePreviewCoupon(code: string, subtotalCents: number): PreviewCouponResult {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return { status: "none", label: "No demo coupon", discountCents: 0 };
  if (normalized === "DEMO10") return { status: "valid", label: "DEMO10 · 10% demo discount", discountCents: Math.floor(subtotalCents * 0.1) };
  if (normalized === "EXPIRED") return { status: "expired", label: "Expired demo coupon", discountCents: 0 };
  return { status: "invalid", label: "Invalid demo coupon", discountCents: 0 };
}

export function calculatePreviewCheckoutSummary(
  items: readonly PreviewCartItem[],
  draft: PreviewCheckoutDraft,
): PreviewCheckoutSummary {
  const subtotalCents = previewCartSubtotal(items);
  const needsShipping = items.some((item) => item.requiresShipping);
  const shipping = previewShippingOptions.find((option) => option.id === draft.shippingOptionId) ?? previewShippingOptions[0];
  const coupon = evaluatePreviewCoupon(draft.couponCode, subtotalCents);
  const shippingCents = needsShipping ? shipping.priceCents : 0;
  return {
    subtotalCents,
    shippingCents,
    shippingLabel: needsShipping ? shipping.label : "No shipping for digital demo items",
    coupon,
    taxStatus: "not_activated",
    taxAmountCents: null,
    localDemoTotalCents: Math.max(0, subtotalCents + shippingCents - coupon.discountCents),
  };
}

export function createPreviewFulfillmentState(): PreviewFulfillmentDemoState {
  return { state: "photo_review", previewVersion: 0, revisionCount: 0 };
}

export function applyPreviewFulfillmentAction(
  current: PreviewFulfillmentDemoState,
  action: PreviewFulfillmentAction,
): PreviewFulfillmentDemoState {
  switch (action) {
    case "enter_photo_review":
      return current;
    case "publish_preview":
      if (current.state === "photo_review") return { ...current, state: "preview_pending", previewVersion: 1 };
      if (current.state === "preview_revision_requested" && current.previewVersion < 3) {
        return { ...current, state: "preview_pending", previewVersion: (current.previewVersion + 1) as 1 | 2 | 3 };
      }
      return current;
    case "approve_preview":
      return current.state === "preview_pending" ? { ...current, state: "preview_approved" } : current;
    case "request_revision":
      if (current.state === "preview_pending" && current.previewVersion < 3) {
        return { ...current, state: "preview_revision_requested", revisionCount: current.revisionCount + 1 };
      }
      return current;
    case "start_production":
      return current.state === "preview_approved" ? { ...current, state: "in_production" } : current;
    case "mark_quality_check":
      return current.state === "in_production" ? { ...current, state: "quality_check" } : current;
  }
}
