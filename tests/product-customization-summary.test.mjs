import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createProductCustomizationSummary } from "../app/application/product-customization-summary.ts";
import { normalizeCustomizationValue } from "../app/domain/customization-validation.ts";
import {
  createProductCustomizationDraft,
  reduceProductCustomizationDraft,
} from "../app/domain/product-customization-draft.ts";

const productId = "product-frame";
const revision = "customization-v1";
const fields = [
  { id: "field-name", productId, code: "name", label: "Name", kind: "short_text", required: true, isActive: true, position: 0, configurationRevision: revision, constraints: { maxLength: 30 } },
  { id: "field-photo", productId, code: "photos", label: "Reference images", kind: "image", required: true, isActive: true, position: 1, configurationRevision: revision, constraints: { allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"], maxBytes: 10_000, minDimensions: { width: 1, height: 1 }, minImageCount: 1, maxImageCount: 3, cropEnabled: true } },
  { id: "field-message", productId, code: "message", label: "Message", kind: "long_text", required: false, isActive: true, position: 2, configurationRevision: revision, constraints: { maxLength: 200 } },
];
const size = { id: "option-size", productId, code: "size", name: "Size", kind: "size", required: true, position: 0 };
const material = { id: "option-material", productId, code: "material", name: "Material", kind: "material", required: true, position: 1 };
const mini = { id: "value-mini", productId, optionId: size.id, code: "mini", label: "Mini", position: 0 };
const resin = { id: "value-resin", productId, optionId: material.id, code: "resin", label: "Resin", position: 0 };

function receipt(receiptId, overrides = {}) {
  return {
    receiptId,
    originalFilename: "portrait.png",
    contentType: "image/png",
    byteSize: 800,
    dimensions: { width: 1200, height: 900 },
    createdAt: "2026-08-14T00:00:00.000Z",
    expiresAt: "2026-08-15T00:00:00.000Z",
    lifecycle: "active",
    ...overrides,
  };
}

function baseDraft() {
  let draft = createProductCustomizationDraft({ productId, configurationRevision: revision });
  draft = reduceProductCustomizationDraft(draft, {
    type: "set_selected_options",
    selectedOptions: [{ optionId: size.id, valueId: mini.id }, { optionId: material.id, valueId: resin.id }],
  });
  draft = reduceProductCustomizationDraft(draft, {
    type: "set_variant_selection",
    selection: { variantId: "variant-mini", skuCode: "FRAME-MINI" },
  });
  return draft;
}

function summary(draft, overrides = {}) {
  return createProductCustomizationSummary({
    draft,
    configurationRevision: revision,
    fields,
    options: [size, material],
    optionValues: [mini, resin],
    ...overrides,
  });
}

test("summary uses the shared validator normalizer without changing raw draft text", () => {
  const raw = { fieldId: "field-message", fieldCode: "message", kind: "long_text", value: "  First line\nSecond line  " };
  assert.deepEqual(normalizeCustomizationValue(raw), { ...raw, value: "First line\nSecond line" });
  let draft = baseDraft();
  draft = reduceProductCustomizationDraft(draft, { type: "set_text_value", value: { fieldId: "field-name", fieldCode: "name", kind: "short_text", value: "  Ada  " } });
  draft = reduceProductCustomizationDraft(draft, { type: "set_text_value", value: raw });
  const model = summary(draft);
  assert.equal(draft.values.find((value) => value.fieldId === "field-name")?.value, "  Ada  ");
  assert.deepEqual(model.personalization.rows, [
    { renderKey: "field-name", kind: "short_text", label: "Name", state: "provided", value: "Ada" },
    { renderKey: "field-photo", kind: "image", label: "Reference images", state: "not_provided_yet", images: [] },
    { renderKey: "field-message", kind: "long_text", label: "Message", state: "provided", value: "First line\nSecond line" },
  ]);
});

test("summary keeps SKU/options separate, supports partial selection, and never guesses an SKU", () => {
  const complete = summary(baseDraft());
  assert.deepEqual(complete.configuration, {
    sku: "FRAME-MINI",
    options: [{ renderKey: size.id, label: "Size", value: "Mini" }, { renderKey: material.id, label: "Material", value: "Resin" }],
    needsReview: false,
  });
  let partial = createProductCustomizationDraft({ productId, configurationRevision: revision });
  partial = reduceProductCustomizationDraft(partial, { type: "set_selected_options", selectedOptions: [{ optionId: size.id, valueId: mini.id }] });
  const partialModel = summary(partial);
  assert.equal(partialModel.configuration.sku, null);
  assert.deepEqual(partialModel.configuration.options, [{ renderKey: size.id, label: "Size", value: "Mini" }, { renderKey: material.id, label: "Material", value: "Not selected" }]);
  const unknown = summary(reduceProductCustomizationDraft(partial, {
    type: "set_selected_options", selectedOptions: [{ optionId: "option-unknown", valueId: "value-unknown" }],
  }));
  assert.equal(unknown.configuration.needsReview, true);
  assert.deepEqual(unknown.configuration.options, [{ renderKey: size.id, label: "Size", value: "Not selected" }, { renderKey: material.id, label: "Material", value: "Not selected" }]);
});

test("summary follows active field and image-reference order while exposing safe receipt metadata only", () => {
  let draft = baseDraft();
  for (const item of [receipt("receipt-super-secret-opaque-marker", { originalFilename: "third.webp", contentType: "image/webp", dimensions: { width: 600, height: 400 } }), receipt("receipt-a", { originalFilename: "first.png" }), receipt("receipt-b", { originalFilename: undefined })]) {
    draft = reduceProductCustomizationDraft(draft, { type: "record_accepted_receipt", receipt: item });
  }
  draft = reduceProductCustomizationDraft(draft, {
    type: "set_image_value",
    value: {
      fieldId: "field-photo", fieldCode: "photos", kind: "image",
      images: [
        { receiptId: "receipt-b" },
        { receiptId: "receipt-a", crop: { x: 0.125, y: 0.25, width: 0.5, height: 0.6 } },
      ],
    },
  });
  const model = summary(draft);
  const imageRow = model.personalization.rows[1];
  assert.equal(imageRow.kind, "image");
  assert.deepEqual(imageRow.images, [
    { renderKey: "field-photo:0", label: "Image 1", state: "available", metadata: "PNG / 1200 × 900" },
    { renderKey: "field-photo:1", label: "Image 2", state: "available", filename: "first.png", metadata: "PNG / 1200 × 900", crop: { left: "12.5%", top: "25%", width: "50%", height: "60%" } },
  ]);
  assert.equal(JSON.stringify(model).includes("receipt-super-secret-opaque-marker"), false);
  assert.equal(JSON.stringify(model).includes("third.webp"), false);
  assert.equal(JSON.stringify(model).includes("receipt-a"), false);
  assert.deepEqual(draft.acceptedReceipts.map((entry) => entry.receiptId), ["receipt-super-secret-opaque-marker", "receipt-a", "receipt-b"]);
});

test("summary follows current accepted image references through replacement, failure, removal, reorder, and crop changes", () => {
  let draft = baseDraft();
  for (const entry of [
    receipt("receipt-a", { originalFilename: "a.png" }),
    receipt("receipt-b", { originalFilename: "b.png" }),
    receipt("receipt-c", { originalFilename: "c.png" }),
  ]) {
    draft = reduceProductCustomizationDraft(draft, { type: "record_accepted_receipt", receipt: entry });
  }
  draft = reduceProductCustomizationDraft(draft, {
    type: "set_image_value",
    value: { fieldId: "field-photo", fieldCode: "photos", kind: "image", images: [{ receiptId: "receipt-a" }] },
  });
  assert.equal(summary(draft).personalization.rows[1].images[0].filename, "a.png");

  // A selected replacement and a failed replacement never enter the accepted draft value.
  draft = reduceProductCustomizationDraft(draft, {
    type: "upload_started",
    operation: { operationId: "replacement-b", fieldId: "field-photo" },
  });
  assert.equal(summary(draft).personalization.rows[1].images[0].filename, "a.png");
  draft = reduceProductCustomizationDraft(draft, {
    type: "upload_failed",
    operationId: "replacement-b",
    fieldId: "field-photo",
  });
  assert.equal(summary(draft).personalization.rows[1].images[0].filename, "a.png");

  // Only an explicit accepted draft value replaces the summarized image.
  draft = reduceProductCustomizationDraft(draft, {
    type: "set_image_value",
    value: { fieldId: "field-photo", fieldCode: "photos", kind: "image", images: [{ receiptId: "receipt-b" }] },
  });
  assert.equal(summary(draft).personalization.rows[1].images[0].filename, "b.png");

  draft = reduceProductCustomizationDraft(draft, {
    type: "set_image_value",
    value: {
      fieldId: "field-photo",
      fieldCode: "photos",
      kind: "image",
      images: [
        { receiptId: "receipt-c", crop: { x: 0.1, y: 0.2, width: 0.5, height: 0.6 } },
        { receiptId: "receipt-a" },
        { receiptId: "receipt-b" },
      ],
    },
  });
  let images = summary(draft).personalization.rows[1].images;
  assert.deepEqual(images.map((image) => image.filename), ["c.png", "a.png", "b.png"]);
  assert.deepEqual(images[0].crop, { left: "10%", top: "20%", width: "50%", height: "60%" });

  draft = reduceProductCustomizationDraft(draft, {
    type: "set_image_value",
    value: {
      fieldId: "field-photo",
      fieldCode: "photos",
      kind: "image",
      images: [{ receiptId: "receipt-c" }, { receiptId: "receipt-a" }, { receiptId: "receipt-b" }],
    },
  });
  images = summary(draft).personalization.rows[1].images;
  assert.equal(images[0].crop, undefined);

  draft = reduceProductCustomizationDraft(draft, { type: "remove_customization_value", fieldId: "field-photo" });
  assert.deepEqual(summary(draft).personalization.rows[1], {
    renderKey: "field-photo",
    kind: "image",
    label: "Reference images",
    state: "not_provided_yet",
    images: [],
  });
});

test("summary makes missing metadata and stale or unsafe field association review-only without remapping customer input", () => {
  let draft = baseDraft();
  draft = reduceProductCustomizationDraft(draft, {
    type: "set_image_value",
    value: { fieldId: "field-photo", fieldCode: "photos", kind: "image", images: [{ receiptId: "receipt-missing" }] },
  });
  const metadataMissing = summary(draft);
  assert.equal(metadataMissing.personalization.rows[1].kind, "image");
  assert.deepEqual(metadataMissing.personalization.rows[1].images, [{ renderKey: "field-photo:0", label: "Image 1", state: "needs_review" }]);
  assert.equal(JSON.stringify(metadataMissing).includes("receipt-missing"), false);

  const stale = summary(draft, { configurationRevision: "customization-v2" });
  assert.deepEqual(stale.personalization, { status: "needs_review", rows: [] });
  const mismatched = summary({
    ...draft,
    values: [{ fieldId: "field-name", fieldCode: "wrong-code", kind: "short_text", value: "<script>alert(1)</script>" }],
  });
  assert.equal(mismatched.personalization.status, "needs_review");
  assert.equal(JSON.stringify(mismatched).includes("<script>alert(1)</script>"), false);
});

test("Task 7.7 summary sources remain display-only and preserve deferred boundaries", async () => {
  const [helper, component, detail, validator] = await Promise.all([
    readFile(new URL("../app/application/product-customization-summary.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/storefront/ProductCustomizationSummary.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/storefront/ProductDetailExperience.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/domain/customization-validation.ts", import.meta.url), "utf8"),
  ]);
  assert.match(helper, /normalizeCustomizationValue/);
  assert.match(validator, /export function normalizeCustomizationValue/);
  assert.match(component, /<section className=\{styles\.customizationSummary\} aria-labelledby="customization-summary-heading">/);
  assert.match(component, /Selected configuration/);
  assert.match(component, /Your personalization/);
  assert.match(component, /Customer input summary — not a production preview\./);
  assert.match(component, /<dl/);
  assert.match(detail, /createProductCustomizationSummary/);
  assert.match(detail, /<ProductCustomizationFormShell/);
  assert.match(detail, /<ProductCustomizationSummary model=\{summary\}/);
  assert.ok(detail.indexOf("<ProductCustomizationFormShell") < detail.indexOf("<ProductCustomizationSummary"));
  assert.doesNotMatch(helper, /resolveVariantSelection|fetch\s*\(|Date\.now|@supabase\/supabase-js|R2Bucket|S3Client|ProductAsset|parseConfiguredItemHandoff|price|currency|surcharge|shipping|fulfillment|cart|order|Stripe|PayPal|storageKey|storage_key|objectKey|object_key|signedUrl|bucket|photoPath/i);
  assert.doesNotMatch(component, /fetch\s*\(|JSON\.stringify|dangerouslySetInnerHTML|innerHTML|receiptId|storageKey|objectKey|signedUrl|bucket|photoPath|Ready to checkout|Add to cart|Continue|Stripe|PayPal|api\/orders|api\/customer-uploads\/preview/i);
  assert.doesNotMatch(detail, /parseConfiguredItemHandoff|api\/orders|Add to cart|Ready to order/);
});
