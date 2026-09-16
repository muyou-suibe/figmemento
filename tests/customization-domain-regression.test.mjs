import assert from "node:assert/strict";
import test from "node:test";

import { parseSelectedOptions } from "../app/domain/catalog/variant.ts";
import { parseConfiguredItemHandoff } from "../app/domain/configured-item.ts";
import { parseCustomizationField } from "../app/domain/customization-field.ts";
import { classifyCustomizationImageDimensions } from "../app/domain/customization-image-quality.ts";
import {
  parseCustomizationResolvedImageMetadata,
  validateCustomizationValuesAgainstFields,
} from "../app/domain/customization-validation.ts";
import {
  parseCustomizationCropRegion,
  parseCustomizationValue,
  parseCustomizationValues,
  validateCustomizationCropPolicy,
} from "../app/domain/customization-value.ts";

const productId = "product-regression";
const revision = "customization-revision-1";

const imageConstraints = {
  allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  maxBytes: 1_000,
  minDimensions: { width: 100, height: 200 },
  recommendedDimensions: { width: 300, height: 400 },
  minImageCount: 1,
  maxImageCount: 2,
  cropEnabled: true,
};

function parseField(input) {
  const result = parseCustomizationField(input);
  assert.ok(result.ok, JSON.stringify(result));
  return result.value;
}

const nameField = () => parseField({
  id: "field-name", productId, code: "name", label: "Name", kind: "short_text",
  required: true, isActive: true, position: 0, configurationRevision: revision,
  constraints: { maxLength: 8, helpText: "Enter a name" },
});
const noteField = () => parseField({
  id: "field-note", productId, code: "note", label: "Note", kind: "long_text",
  required: false, isActive: true, position: 1, configurationRevision: revision,
  constraints: { maxLength: 120 },
});
const photoField = (overrides = {}) => parseField({
  id: "field-photo", productId, code: "photo", label: "Photo", kind: "image",
  required: true, isActive: true, position: 2, configurationRevision: revision,
  constraints: imageConstraints,
  ...overrides,
});

function parseValues(input) {
  const result = parseCustomizationValues(input);
  assert.ok(result.ok, JSON.stringify(result));
  return result.value;
}

function metadata(input) {
  const result = parseCustomizationResolvedImageMetadata(input);
  assert.ok(result.ok, JSON.stringify(result));
  return result.value;
}

function validValues() {
  return parseValues([
    { fieldId: "field-name", fieldCode: "name", kind: "short_text", value: "  Ada  " },
    {
      fieldId: "field-photo", fieldCode: "photo", kind: "image",
      images: [
        { receiptId: "receipt-b", crop: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 } },
        { receiptId: "receipt-a" },
      ],
    },
  ]);
}

function validMetadata(additional = []) {
  return [
    metadata({ receiptId: "receipt-a", mimeType: "image/jpeg", fileSizeBytes: 100, width: 300, height: 400 }),
    metadata({ receiptId: "receipt-b", mimeType: "image/png", fileSizeBytes: 100, width: 300, height: 400 }),
    ...additional,
  ];
}

function validate(overrides = {}) {
  return validateCustomizationValuesAgainstFields({
    productId,
    configurationRevision: revision,
    authoritativeConfigurationRevision: revision,
    fields: [nameField(), noteField(), photoField()],
    values: validValues(),
    resolvedImageMetadata: validMetadata(),
    ...overrides,
  });
}

function codes(result) {
  return result.ok ? [] : result.issues.map((entry) => entry.code);
}

function handoff(overrides = {}) {
  return {
    productId,
    variantId: "variant-regression",
    skuCode: "SKU-REGRESSION",
    selectedOptions: [{ optionId: "option-size", valueId: "value-standard" }],
    configurationRevision: revision,
    customizationValues: [
      { fieldId: "field-name", fieldCode: "name", kind: "short_text", value: "Ada" },
      { fieldId: "field-photo", fieldCode: "photo", kind: "image", images: [{ receiptId: "receipt-a" }] },
    ],
    ...overrides,
  };
}

test("field core and discriminated constraints remain bounded, provider-neutral, and fail closed", () => {
  for (const kind of ["image", "short_text", "long_text"]) {
    const field = kind === "image" ? photoField() : parseField({
      id: `field-${kind}`, productId, code: kind, label: kind, kind,
      required: false, isActive: true, position: 0, configurationRevision: revision,
      constraints: { maxLength: 10 },
    });
    assert.equal(field.kind, kind);
    assert.equal("provider" in field, false);
    assert.equal("storageKey" in field, false);
  }

  const invalidFields = [
    { ...photoField(), kind: "file" },
    { ...photoField(), id: "bad id" },
    { ...photoField(), productId: "bad product" },
    { ...photoField(), code: "bad code" },
    { ...photoField(), label: " " },
    { ...photoField(), required: "yes" },
    { ...photoField(), isActive: "yes" },
    { ...photoField(), position: -1 },
    { ...photoField(), configurationRevision: " " },
    { ...photoField(), unknownAuthority: true },
    { ...nameField(), constraints: imageConstraints },
    { ...photoField(), constraints: { maxLength: 8 } },
    { ...photoField(), constraints: { ...imageConstraints, pricing: { cents: 100 } } },
    { ...photoField(), constraints: { ...imageConstraints, condition: "if-photo" } },
    { ...photoField(), constraints: { ...imageConstraints, supplier: "factory" } },
    { ...photoField(), constraints: { ...imageConstraints, productionPreview: true } },
    { ...photoField(), constraints: { ...imageConstraints, bucket: "private" } },
    { ...photoField(), constraints: { ...imageConstraints, allowedMimeTypes: ["image/gif"] } },
    { ...photoField(), constraints: { ...imageConstraints, allowedMimeTypes: ["image/jpeg", "image/jpeg"] } },
    { ...photoField(), constraints: { ...imageConstraints, maxBytes: 0 } },
    { ...photoField(), constraints: { ...imageConstraints, minDimensions: { width: 0, height: 1 } } },
    { ...photoField(), constraints: { ...imageConstraints, recommendedDimensions: { width: 99, height: 200 } } },
    { ...photoField(), constraints: { ...imageConstraints, minImageCount: 3, maxImageCount: 2 } },
    { ...photoField(), constraints: { ...imageConstraints, cropEnabled: "true" } },
  ];
  for (const candidate of invalidFields) assert.equal(parseCustomizationField(candidate).ok, false);
});

test("normalized values, crop data, and deferred value authority remain structurally isolated", () => {
  assert.equal(parseCustomizationValue({ fieldId: "field-name", fieldCode: "name", kind: "short_text", value: "Ada" }).ok, true);
  assert.equal(parseCustomizationValue({ fieldId: "field-note", fieldCode: "note", kind: "long_text", value: "Line one\nLine two" }).ok, true);
  assert.equal(parseCustomizationValue({ fieldId: "field-photo", fieldCode: "photo", kind: "image", images: [] }).ok, true);

  for (const candidate of [
    { fieldCode: "name", kind: "short_text", value: "Ada" },
    { fieldId: "field-name", kind: "short_text", value: "Ada" },
    { fieldId: "field-name", fieldCode: "name", kind: "image", value: "Ada" },
    { fieldId: "field-name", fieldCode: "name", kind: "short_text", value: "Ada", provider: "r2" },
    { fieldId: "field-photo", fieldCode: "photo", kind: "image", images: [{ receiptId: "receipt-a", photoPath: "drafts/a.jpg" }] },
    { fieldId: "field-name", fieldCode: "name", kind: "short_text", value: "Ada", productId },
    { fieldId: "field-name", fieldCode: "name", kind: "short_text", value: "Ada", variantId: "variant-regression" },
    { fieldId: "field-name", fieldCode: "name", kind: "short_text", value: "Ada", priceCents: 1 },
    { fieldId: "field-name", fieldCode: "name", kind: "short_text", value: "Ada", currency: "USD" },
    { fieldId: "field-photo", fieldCode: "photo", kind: "image", images: [], photoReviewStatus: "pending" },
    { fieldId: "field-photo", fieldCode: "photo", kind: "image", images: [{ receiptId: "receipt-a" }, { receiptId: "receipt-a" }] },
  ]) assert.equal(parseCustomizationValue(candidate).ok, false);

  const ordered = parseValues([
    { fieldId: "field-note", fieldCode: "note", kind: "long_text", value: "Note" },
    { fieldId: "field-photo", fieldCode: "photo", kind: "image", images: [{ receiptId: "receipt-b" }, { receiptId: "receipt-a" }] },
  ]);
  assert.deepEqual(ordered.map((value) => value.fieldId), ["field-note", "field-photo"]);
  assert.ok(ordered[1].kind === "image");
  assert.deepEqual(ordered[1].images.map((image) => image.receiptId), ["receipt-b", "receipt-a"]);
  assert.equal(parseCustomizationValues([ordered[0], { ...ordered[0], kind: "short_text", value: "Again" }]).ok, false);

  for (const invalidCrop of [
    { x: -0.1, y: 0, width: 1, height: 1 }, { x: 0, y: 0, width: 0, height: 1 },
    { x: 0, y: 0, width: 1.1, height: 1 }, { x: 0.6, y: 0, width: 0.5, height: 1 },
    { x: 0, y: 0.6, width: 1, height: 0.5 }, { x: Number.NaN, y: 0, width: 1, height: 1 },
    { x: Infinity, y: 0, width: 1, height: 1 }, { x: "0", y: 0, width: 1, height: 1 },
    { x: 0, y: 0, width: 1, height: 1, provider: "r2" },
  ]) assert.equal(parseCustomizationCropRegion(invalidCrop).ok, false);
  assert.equal(parseCustomizationCropRegion({ x: 0, y: 0, width: 1, height: 1 }).ok, true);
  assert.equal(parseCustomizationCropRegion({ x: 0.1, y: 0.2, width: 0.3, height: 0.4 }).ok, true);

  const cropped = ordered[1];
  assert.ok(cropped.kind === "image");
  assert.equal(validateCustomizationCropPolicy(photoField({ constraints: { ...imageConstraints, cropEnabled: false } }), { ...cropped, images: [{ receiptId: "receipt-a", crop: { x: 0, y: 0, width: 1, height: 1 } }] }).ok, false);
  assert.equal(validateCustomizationCropPolicy(photoField({ constraints: { ...imageConstraints, cropEnabled: false } }), { ...cropped, images: [{ receiptId: "receipt-a" }] }).ok, true);
  assert.equal(validateCustomizationCropPolicy(nameField(), cropped).ok, false);
});

test("authoritative validation preserves requiredness, normalization, metadata limits, and stable safe issue codes", () => {
  const valid = validate();
  assert.ok(valid.ok);
  assert.equal(valid.value[0].kind, "short_text");
  assert.equal(valid.value[0].value, "Ada");
  assert.ok(valid.value[1].kind === "image");
  assert.deepEqual(valid.value[1].images.map((image) => image.receiptId), ["receipt-b", "receipt-a"]);

  const representative = [
    [validate({ configurationRevision: "stale" }), "stale_configuration"],
    [validate({ fields: [{ ...nameField(), productId: "product-other" }, noteField(), photoField()] }), "cross_product_field"],
    [validate({ values: parseValues([{ fieldId: "field-unknown", fieldCode: "unknown", kind: "short_text", value: "Ada" }]) }), "unknown_field"],
    [validate({ fields: [{ ...nameField(), isActive: false }, noteField(), photoField()] }), "inactive_field"],
    [validate({ values: parseValues([{ fieldId: "field-name", fieldCode: "wrong", kind: "short_text", value: "Ada" }]) }), "field_code_mismatch"],
    [validate({ values: parseValues([{ fieldId: "field-name", fieldCode: "name", kind: "long_text", value: "Ada" }]) }), "field_kind_mismatch"],
    [validate({ values: parseValues([{ fieldId: "field-photo", fieldCode: "photo", kind: "image", images: [{ receiptId: "receipt-a" }] }]) }), "required_field_missing"],
    [validate({ values: parseValues([{ fieldId: "field-name", fieldCode: "name", kind: "short_text", value: "  " }, { fieldId: "field-photo", fieldCode: "photo", kind: "image", images: [{ receiptId: "receipt-a" }] }]) }), "required_field_empty"],
    [validate({ values: parseValues([{ fieldId: "field-name", fieldCode: "name", kind: "short_text", value: "Ada Lovelace" }, { fieldId: "field-photo", fieldCode: "photo", kind: "image", images: [{ receiptId: "receipt-a" }] }]) }), "text_too_long"],
    [validate({ values: parseValues([{ fieldId: "field-name", fieldCode: "name", kind: "short_text", value: "Ada" }, { fieldId: "field-photo", fieldCode: "photo", kind: "image", images: [] }]) }), "image_count_too_low"],
    [validate({ values: parseValues([{ fieldId: "field-name", fieldCode: "name", kind: "short_text", value: "Ada" }, { fieldId: "field-photo", fieldCode: "photo", kind: "image", images: [{ receiptId: "receipt-a" }, { receiptId: "receipt-b" }, { receiptId: "receipt-c" }] }]) }), "image_count_too_high"],
    [validate({ resolvedImageMetadata: [] }), "image_metadata_missing"],
    [validate({
      fields: [nameField(), noteField(), photoField({ constraints: { ...imageConstraints, allowedMimeTypes: ["image/jpeg", "image/png"] } })],
      resolvedImageMetadata: [
        metadata({ receiptId: "receipt-a", mimeType: "image/webp", fileSizeBytes: 100, width: 300, height: 400 }),
        metadata({ receiptId: "receipt-b", mimeType: "image/png", fileSizeBytes: 100, width: 300, height: 400 }),
      ],
    }), "image_mime_not_allowed"],
    [validate({ resolvedImageMetadata: [metadata({ receiptId: "receipt-a", mimeType: "image/jpeg", fileSizeBytes: 1_001, width: 300, height: 400 }), metadata({ receiptId: "receipt-b", mimeType: "image/png", fileSizeBytes: 100, width: 300, height: 400 })] }), "image_too_large"],
    [validate({ resolvedImageMetadata: [metadata({ receiptId: "receipt-a", mimeType: "image/jpeg", fileSizeBytes: 100, width: 99, height: 400 }), metadata({ receiptId: "receipt-b", mimeType: "image/png", fileSizeBytes: 100, width: 300, height: 400 })] }), "image_dimensions_too_small"],
    [validate({ fields: [nameField(), noteField(), photoField({ constraints: { ...imageConstraints, cropEnabled: false } })] }), "crop_not_allowed"],
  ];
  for (const [result, code] of representative) assert.equal(codes(result).includes(code), true, code);

  assert.equal(validate({ fields: [nameField(), noteField(), photoField({ constraints: { ...imageConstraints, minImageCount: 2 } })] }).ok, true);
  assert.equal(validate({ fields: [nameField(), noteField(), photoField({ constraints: { ...imageConstraints, recommendedDimensions: { width: 1_000, height: 1_000 } } })] }).ok, true);
  const text = validate({ values: parseValues([{ fieldId: "field-name", fieldCode: "name", kind: "short_text", value: "A  \n B" }, { fieldId: "field-photo", fieldCode: "photo", kind: "image", images: [{ receiptId: "receipt-a" }] }]) });
  assert.ok(text.ok && text.value[0].kind === "short_text");
  assert.equal(text.value[0].value, "A  \n B");
  assert.equal(parseCustomizationResolvedImageMetadata({ receiptId: "receipt-a", mimeType: "image/jpeg", fileSizeBytes: 1, width: 1, height: 1, storageKey: "drafts/a" }).ok, false);
});

test("dimension quality remains threshold-only and does not weaken hard minimum validation", () => {
  assert.equal(classifyCustomizationImageDimensions(imageConstraints, { width: 99, height: 200 }).state, "below_minimum");
  assert.equal(classifyCustomizationImageDimensions(imageConstraints, { width: 100, height: 199 }).state, "below_minimum");
  assert.equal(classifyCustomizationImageDimensions(imageConstraints, { width: 100, height: 200 }).state, "below_recommended");
  assert.equal(classifyCustomizationImageDimensions(imageConstraints, { width: 300, height: 400 }).state, "meets_recommendation");
  assert.equal(classifyCustomizationImageDimensions(imageConstraints, { width: 600, height: 800 }).state, "meets_recommendation");
  assert.equal(classifyCustomizationImageDimensions({ ...imageConstraints, recommendedDimensions: undefined }, { width: 100, height: 200 }).state, "meets_recommendation");
  const comparison = (extra) => classifyCustomizationImageDimensions(imageConstraints, { width: 200, height: 300, ...extra }).state;
  assert.equal(comparison({ fileSizeBytes: 1 }), comparison({ fileSizeBytes: 999_999 }));
  assert.equal(comparison({ mimeType: "image/jpeg" }), comparison({ mimeType: "image/webp" }));
  assert.equal(comparison({ receiptId: "receipt-a" }), comparison({ receiptId: "receipt-b" }));
  assert.equal(comparison({ crop: { x: 0, y: 0, width: 1, height: 1 } }), comparison({}));
  assert.deepEqual(Object.keys(classifyCustomizationImageDimensions(imageConstraints, { width: 300, height: 400 })), ["state"]);
});

test("configured item keeps C1 Variant identity separate from distinct Customization content", () => {
  const first = parseConfiguredItemHandoff(handoff());
  const textChanged = parseConfiguredItemHandoff(handoff({ customizationValues: [
    { fieldId: "field-name", fieldCode: "name", kind: "short_text", value: "Grace" },
    { fieldId: "field-photo", fieldCode: "photo", kind: "image", images: [{ receiptId: "receipt-a" }] },
  ] }));
  const receiptChanged = parseConfiguredItemHandoff(handoff({ customizationValues: [
    { fieldId: "field-name", fieldCode: "name", kind: "short_text", value: "Ada" },
    { fieldId: "field-photo", fieldCode: "photo", kind: "image", images: [{ receiptId: "receipt-b", crop: { x: 0, y: 0, width: 1, height: 1 } }] },
  ] }));
  assert.ok(first.ok && textChanged.ok && receiptChanged.ok);
  for (const result of [first.value, textChanged.value, receiptChanged.value]) {
    assert.deepEqual(
      { productId: result.productId, variantId: result.variantId, skuCode: result.skuCode, selectedOptions: result.selectedOptions },
      { productId, variantId: "variant-regression", skuCode: "SKU-REGRESSION", selectedOptions: [{ optionId: "option-size", valueId: "value-standard" }] },
    );
    for (const forbidden of ["price", "currency", "availability", "weight", "supplyMethod", "cartKey", "fingerprint", "mergeKey", "quantity", "quality", "resolvedImageMetadata"]) {
      assert.equal(forbidden in result, false, forbidden);
    }
  }
  assert.notDeepEqual(first.value.customizationValues, textChanged.value.customizationValues);
  assert.notDeepEqual(first.value.customizationValues, receiptChanged.value.customizationValues);
  assert.equal(parseSelectedOptions([{ fieldId: "field-photo", fieldCode: "photo", kind: "image", images: [] }]).ok, false);
  for (const extra of [
    { price: 1 }, { priceCents: 1 }, { currency: "USD" }, { surcharge: 1 }, { subtotal: 1 }, { total: 1 },
    { shippingPrice: 1 }, { fulfillmentType: "physical" }, { bucket: "private" }, { storageKey: "drafts/a" },
    { photoPath: "drafts/a" }, { url: "https://example.test/a" }, { signedUrl: "https://example.test/a" },
    { orderId: "order-1" }, { paymentStatus: "paid" }, { quantity: 1 }, { unknown: true },
  ]) assert.equal(parseConfiguredItemHandoff(handoff(extra)).ok, false);
});

test("all completed domain entry points are offline and do not invoke fetch", () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("Customization domain tests must remain offline.");
  };
  try {
    assert.ok(parseCustomizationField(nameField()).ok);
    assert.ok(parseCustomizationValues(handoff().customizationValues).ok);
    assert.ok(parseConfiguredItemHandoff(handoff()).ok);
    assert.ok(validate().ok);
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
