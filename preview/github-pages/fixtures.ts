import type {
  PreviewCategory,
  PreviewCustomizationField,
  PreviewFulfillmentFixture,
  PreviewPaymentFixture,
  PreviewProduct,
} from "./types.ts";

/**
 * Frontend-preview presentation data only. This module is deliberately not
 * imported by the main App Router or any production catalog source.
 */
export const PREVIEW_NOTICE = "FRONTEND PREVIEW" as const;
export const PREVIEW_NOTICE_DETAIL =
  "UI and user-flow demonstration only. Server-backed upload, checkout, payment, fulfillment and tracking are not active on this build." as const;
export const LOCAL_IMAGE_PREVIEW_NOTICE =
  "LOCAL BROWSER PREVIEW — FILE IS NOT UPLOADED" as const;
export const DEMO_PRICE_NOTICE = "Display price for frontend preview only." as const;
export const DEMO_PAYMENT_NOTICE = "Paid — Demo" as const;
export const OPERATOR_PREVIEW_NOTICE = "UI PREVIEW ONLY" as const;
export const TRACKING_PREVIEW_NOTICE = "Tracking is not implemented in this preview." as const;

// These state fixtures define the vocabulary used by the later client-only
// commerce/fulfillment preview batches; Batch A does not render or transition them.
export const previewPaymentFixtures: readonly PreviewPaymentFixture[] = [
  { state: "success", label: DEMO_PAYMENT_NOTICE },
  { state: "failed", label: "Payment failed — Demo" },
  { state: "cancelled", label: "Payment cancelled — Demo" },
];

export const previewFulfillmentFixtures: readonly PreviewFulfillmentFixture[] = [
  { state: "photo_review", label: "Photo Review — Demo" },
  { state: "preview_pending", label: "Preview pending — Demo" },
  { state: "preview_revision_requested", label: "Revision requested — Demo" },
  { state: "preview_approved", label: "Preview approved — Demo" },
  { state: "in_production", label: "In production — Demo" },
  { state: "quality_check", label: "Quality check — Demo" },
];

export const previewCategories: readonly PreviewCategory[] = [
  {
    slug: "3d-figures",
    name: "3D Figures",
    description: "Small, warm keepsakes shaped around the people who matter most.",
  },
  {
    slug: "light-pictures",
    name: "Light Pictures",
    description: "A soft visual reminder of a favorite person, place, or moment.",
  },
  {
    slug: "digital-portraits",
    name: "Digital Portraits",
    description: "A digital-first presentation for creative gift ideas.",
  },
];

const imageField: PreviewCustomizationField = {
  id: "preview-reference-image",
  kind: "image",
  label: "Development reference image",
  required: true,
  helpText: "Choose an image to see the browser-local preview interaction.",
};

const noteField: PreviewCustomizationField = {
  id: "preview-short-text",
  kind: "short_text",
  label: "A short note",
  required: false,
  maxLength: 80,
  helpText: "A presentation-only personalization field.",
};

const figureOptions = [{
  id: "size",
  name: "Size",
  values: [
    { id: "mini", label: "Mini" },
    { id: "standard", label: "Standard" },
    { id: "deluxe", label: "Deluxe" },
  ],
}] as const;

export const previewProducts: readonly PreviewProduct[] = [
  {
    slug: "couple-figure",
    name: "Couple Figure",
    categorySlug: "3d-figures",
    description: "A gentle little figure for the story you share.",
    fulfillmentType: "physical",
    productionMode: "custom_manufacturing",
    leadTime: "5–10 business days",
    requiresShipping: true,
    mediaLabel: "Public product media preview",
    options: figureOptions,
    variants: [
      { id: "preview-couple-mini", skuCode: "PREVIEW-COUPLE-MINI", optionValueId: "mini", priceCents: 6990, isAvailable: true },
      { id: "preview-couple-standard", skuCode: "PREVIEW-COUPLE-STANDARD", optionValueId: "standard", priceCents: 8990, isAvailable: true },
      { id: "preview-couple-deluxe", skuCode: "PREVIEW-COUPLE-DELUXE", optionValueId: "deluxe", priceCents: 10990, isAvailable: false },
    ],
    customizationFields: [imageField, noteField],
  },
  {
    slug: "glass-light-picture",
    name: "Glass Light Picture",
    categorySlug: "light-pictures",
    description: "A softly lit keepsake that lets a favorite image glow.",
    fulfillmentType: "physical",
    productionMode: "custom_manufacturing",
    leadTime: "5–10 business days",
    requiresShipping: true,
    mediaLabel: "Public product media preview",
    options: [{
      id: "finish",
      name: "Finish",
      values: [{ id: "warm-light", label: "Warm light" }, { id: "day-light", label: "Day light" }],
    }],
    variants: [
      { id: "preview-glass-warm", skuCode: "PREVIEW-GLASS-WARM", optionValueId: "warm-light", priceCents: 7990, isAvailable: true },
      { id: "preview-glass-day", skuCode: "PREVIEW-GLASS-DAY", optionValueId: "day-light", priceCents: 8490, isAvailable: true },
    ],
    customizationFields: [imageField, noteField],
  },
  {
    slug: "digital-portrait",
    name: "Digital Portrait",
    categorySlug: "digital-portraits",
    description: "A digital portrait concept for a keepsake made to share.",
    fulfillmentType: "digital",
    productionMode: "digital_creation",
    leadTime: "2–4 business days",
    requiresShipping: false,
    mediaLabel: "Controlled public-media fallback",
    options: [{
      id: "style",
      name: "Style",
      values: [{ id: "soft-line", label: "Soft line" }, { id: "bold-color", label: "Bold color" }],
    }],
    variants: [
      { id: "preview-portrait-soft", skuCode: "PREVIEW-PORTRAIT-SOFT", optionValueId: "soft-line", priceCents: 3990, isAvailable: true },
      { id: "preview-portrait-bold", skuCode: "PREVIEW-PORTRAIT-BOLD", optionValueId: "bold-color", priceCents: 4490, isAvailable: true },
    ],
    customizationFields: [imageField, noteField],
  },
];

export function previewProductForSlug(slug: string): PreviewProduct | undefined {
  return previewProducts.find((product) => product.slug === slug);
}

export function previewCategoryForSlug(slug: string): PreviewCategory | undefined {
  return previewCategories.find((category) => category.slug === slug);
}

export function previewProductsForCategory(slug: string): readonly PreviewProduct[] {
  return previewProducts.filter((product) => product.categorySlug === slug);
}
