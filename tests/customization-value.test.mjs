import assert from "node:assert/strict";
import test from "node:test";

import {
  parseCustomizationCropRegion,
  parseCustomizationValue,
  parseCustomizationValues,
  validateCustomizationCropPolicy,
} from "../app/domain/customization-value.ts";
import { parseCustomizationField } from "../app/domain/customization-field.ts";

const shortText = {
  fieldId: "field-name",
  fieldCode: "name",
  kind: "short_text",
  value: "  Ada  ",
};

const longText = {
  fieldId: "field-note",
  fieldCode: "note",
  kind: "long_text",
  value: "A note with\nmeaningful whitespace.",
};

const imageValue = {
  fieldId: "field-photo",
  fieldCode: "photo",
  kind: "image",
  images: [{ receiptId: "receipt-a" }, { receiptId: "receipt-b" }],
};

test("parses structurally valid short and long text values without semantic normalization", () => {
  const shortResult = parseCustomizationValue(shortText);
  const longResult = parseCustomizationValue(longText);
  assert.equal(shortResult.ok, true);
  assert.equal(longResult.ok, true);
  assert.ok(shortResult.ok && longResult.ok);
  assert.equal(shortResult.value.value, "  Ada  ");
  assert.equal(longResult.value.value, "A note with\nmeaningful whitespace.");
});

test("rejects invalid field identity, code, text shape, wrong kind structure, and unknown authority", () => {
  assert.equal(parseCustomizationValue({ ...shortText, fieldId: " " }).ok, false);
  assert.equal(parseCustomizationValue({ ...shortText, fieldCode: " " }).ok, false);
  assert.equal(parseCustomizationValue({ ...shortText, value: 42 }).ok, false);
  assert.equal(parseCustomizationValue({ ...shortText, images: [] }).ok, false);
  assert.equal(parseCustomizationValue({ ...shortText, productId: "product-frame" }).ok, false);
  assert.equal(parseCustomizationValue({ ...shortText, kind: "text" }).ok, false);
});

test("parses ordered opaque image receipt references and permits an empty structural image value", () => {
  const result = parseCustomizationValue(imageValue);
  assert.equal(result.ok, true);
  assert.ok(result.ok && result.value.kind === "image");
  assert.deepEqual(result.value.images.map((image) => image.receiptId), ["receipt-a", "receipt-b"]);

  const empty = parseCustomizationValue({ ...imageValue, images: [] });
  assert.equal(empty.ok, true);
  assert.ok(empty.ok && empty.value.kind === "image");
  assert.deepEqual(empty.value.images, []);
});

test("rejects invalid, duplicate, provider-specific, unknown, and crop image references", () => {
  assert.equal(parseCustomizationValue({ ...imageValue, images: [{ receiptId: " " }] }).ok, false);
  assert.equal(parseCustomizationValue({ ...imageValue, images: [{ receiptId: "receipt-a" }, { receiptId: "receipt-a" }] }).ok, false);
  assert.equal(parseCustomizationValue({ ...imageValue, value: "not-an-image" }).ok, false);
  assert.equal(parseCustomizationValue({ ...imageValue, images: [{ receiptId: "receipt-a", storageKey: "drafts/a.jpg" }] }).ok, false);
  assert.equal(parseCustomizationValue({ ...imageValue, bucket: "photogift-uploads" }).ok, false);
});

test("strictly parses finite in-bounds normalized crop regions", () => {
  assert.deepEqual(parseCustomizationCropRegion({ x: 0, y: 0, width: 1, height: 1 }), {
    ok: true,
    value: { x: 0, y: 0, width: 1, height: 1 },
  });
  assert.equal(parseCustomizationCropRegion({ x: 0.1, y: 0.2, width: 0.5, height: 0.5 }).ok, true);
  assert.equal(parseCustomizationCropRegion({ x: 0.125, y: 0.25, width: 0.5, height: 0.5 }).ok, true);
  for (const crop of [
    { x: -0.1, y: 0, width: 1, height: 1 },
    { x: 0, y: -0.1, width: 1, height: 1 },
    { x: 0, y: 0, width: 0, height: 1 },
    { x: 0, y: 0, width: 1, height: 0 },
    { x: 0, y: 0, width: 1.1, height: 1 },
    { x: 0, y: 0, width: 1, height: 1.1 },
    { x: 1.1, y: 0, width: 0.1, height: 1 },
    { x: 0, y: 1.1, width: 1, height: 0.1 },
    { x: 0.8, y: 0, width: 0.3, height: 1 },
    { x: 0, y: 0.8, width: 1, height: 0.3 },
    { x: "0", y: 0, width: 1, height: 1 },
    { x: Number.NaN, y: 0, width: 1, height: 1 },
    { x: 0, y: 0, width: Number.POSITIVE_INFINITY, height: 1 },
    { x: 0, y: 0, width: 1, height: 1, rotation: 90 },
  ]) {
    assert.equal(parseCustomizationCropRegion(crop).ok, false);
  }
});

test("image receipt references preserve valid crop metadata and receipt order", () => {
  const result = parseCustomizationValue({
    ...imageValue,
    images: [
      { receiptId: "receipt-a", crop: { x: 0.1, y: 0.2, width: 0.5, height: 0.5 } },
      { receiptId: "receipt-b" },
    ],
  });
  assert.equal(result.ok, true);
  assert.ok(result.ok && result.value.kind === "image");
  assert.deepEqual(result.value.images, [
    { receiptId: "receipt-a", crop: { x: 0.1, y: 0.2, width: 0.5, height: 0.5 } },
    { receiptId: "receipt-b" },
  ]);
  assert.equal(parseCustomizationValue({ ...imageValue, images: [{ receiptId: "receipt-a", crop: { x: 0.8, y: 0, width: 0.3, height: 1 } }] }).ok, false);
});

function imageField(cropEnabled) {
  const result = parseCustomizationField({
    id: "field-photo",
    productId: "product-frame",
    code: "photo",
    label: "Your photo",
    kind: "image",
    required: true,
    isActive: true,
    position: 0,
    configurationRevision: "revision-1",
    constraints: {
      allowedMimeTypes: ["image/jpeg"],
      maxBytes: 1_000_000,
      minDimensions: { width: 1, height: 1 },
      minImageCount: 0,
      maxImageCount: 2,
      cropEnabled,
    },
  });
  assert.ok(result.ok);
  return result.value;
}

test("crop policy accepts only crop-enabled image fields without claiming ownership", () => {
  const cropped = parseCustomizationValue({
    ...imageValue,
    images: [{ receiptId: "receipt-a", crop: { x: 0, y: 0, width: 1, height: 1 } }],
  });
  assert.ok(cropped.ok && cropped.value.kind === "image");
  assert.equal(validateCustomizationCropPolicy(imageField(true), cropped.value).ok, true);
  assert.equal(validateCustomizationCropPolicy(imageField(false), cropped.value).ok, false);

  const noCrop = parseCustomizationValue({ ...imageValue, images: [{ receiptId: "receipt-a" }] });
  assert.ok(noCrop.ok);
  assert.equal(validateCustomizationCropPolicy(imageField(false), noCrop.value).ok, true);

  const textField = parseCustomizationField({
    id: "field-note",
    productId: "product-other",
    code: "note",
    label: "Note",
    kind: "long_text",
    required: false,
    isActive: true,
    position: 0,
    configurationRevision: "revision-1",
    constraints: { maxLength: 100 },
  });
  assert.ok(textField.ok);
  assert.equal(validateCustomizationCropPolicy(textField.value, cropped.value).ok, false);
  assert.equal(validateCustomizationCropPolicy(imageField(true), { ...cropped.value, fieldId: "another-field" }).ok, true);
});

test("parses an ordered collection and rejects duplicate field values regardless of submitted kind", () => {
  const result = parseCustomizationValues([shortText, imageValue, longText]);
  assert.equal(result.ok, true);
  assert.ok(result.ok);
  assert.deepEqual(result.value.map((value) => value.fieldId), ["field-name", "field-photo", "field-note"]);

  assert.equal(parseCustomizationValues([shortText, { ...shortText, value: "Grace" }]).ok, false);
  assert.equal(parseCustomizationValues([imageValue, { ...imageValue, images: [{ receiptId: "receipt-c" }] }]).ok, false);
  assert.equal(parseCustomizationValues([shortText, { ...longText, fieldId: shortText.fieldId }]).ok, false);
});

test("normalized values expose no Product, Variant, price, or provider authority", () => {
  const result = parseCustomizationValues([shortText, imageValue]);
  assert.equal(result.ok, true);
  assert.ok(result.ok);
  assert.equal(parseCustomizationValue({ ...shortText, priceCents: 100 }).ok, false);
  assert.equal(parseCustomizationValue({ ...imageValue, variantId: "variant-mini" }).ok, false);
  assert.equal(parseCustomizationValue({ ...imageValue, images: [{ receiptId: "receipt-a", url: "https://example.com/a" }] }).ok, false);
  assert.equal(parseCustomizationValue({ ...shortText, photoReviewStatus: "approved" }).ok, false);
  assert.deepEqual(Object.keys(result.value[0]).sort(), ["fieldCode", "fieldId", "kind", "value"]);
});
