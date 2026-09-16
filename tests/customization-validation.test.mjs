import assert from "node:assert/strict";
import test from "node:test";

import { parseCustomizationField } from "../app/domain/customization-field.ts";
import {
  parseCustomizationResolvedImageMetadata,
  validateCustomizationValuesAgainstFields,
} from "../app/domain/customization-validation.ts";
import { parseCustomizationValues } from "../app/domain/customization-value.ts";

function field(input) {
  const result = parseCustomizationField(input);
  assert.ok(result.ok);
  return result.value;
}

const productId = "product-frame";
const revision = "revision-1";
const nameField = field({
  id: "field-name", productId, code: "name", label: "Name", kind: "short_text",
  required: true, isActive: true, position: 0, configurationRevision: revision,
  constraints: { maxLength: 8 },
});
const noteField = field({
  id: "field-note", productId, code: "note", label: "Note", kind: "long_text",
  required: false, isActive: true, position: 1, configurationRevision: revision,
  constraints: { maxLength: 120 },
});
const photoField = field({
  id: "field-photo", productId, code: "photo", label: "Photo", kind: "image",
  required: true, isActive: true, position: 2, configurationRevision: revision,
  constraints: {
    allowedMimeTypes: ["image/jpeg", "image/png"], maxBytes: 1000,
    minDimensions: { width: 100, height: 100 }, minImageCount: 1,
    maxImageCount: 2, cropEnabled: true,
  },
});

function values(input) {
  const result = parseCustomizationValues(input);
  assert.ok(result.ok);
  return result.value;
}

function metadata(input) {
  return input.map((entry) => {
    const result = parseCustomizationResolvedImageMetadata(entry);
    assert.ok(result.ok);
    return result.value;
  });
}

const validValues = () => values([
  { fieldId: "field-name", fieldCode: "name", kind: "short_text", value: "  Ada  " },
  { fieldId: "field-photo", fieldCode: "photo", kind: "image", images: [{ receiptId: "receipt-a" }] },
]);
const validMetadata = () => metadata([
  { receiptId: "receipt-a", mimeType: "image/jpeg", fileSizeBytes: 1000, width: 100, height: 100 },
]);

function validate(overrides = {}) {
  return validateCustomizationValuesAgainstFields({
    productId,
    configurationRevision: revision,
    authoritativeConfigurationRevision: revision,
    fields: [nameField, noteField, photoField],
    values: validValues(),
    resolvedImageMetadata: validMetadata(),
    ...overrides,
  });
}

function hasCode(result, code) {
  return !result.ok && result.issues.some((entry) => entry.code === code);
}

test("accepts authoritative same-Product fields, normalizes text, and preserves value order", () => {
  const result = validate();
  assert.equal(result.ok, true);
  assert.ok(result.ok);
  assert.deepEqual(result.value.map((value) => value.fieldId), ["field-name", "field-photo"]);
  assert.equal(result.value[0].kind, "short_text");
  assert.equal(result.value[0].value, "Ada");
});

test("rejects cross-Product, duplicate, unknown, inactive, code, and kind field authority drift", () => {
  const foreign = field({
    id: "field-foreign", productId: "product-other", code: "foreign", label: "Foreign", kind: "short_text",
    required: false, isActive: true, position: 3, configurationRevision: revision, constraints: { maxLength: 10 },
  });
  assert.equal(hasCode(validate({ fields: [nameField, noteField, photoField, foreign] }), "cross_product_field"), true);
  assert.equal(hasCode(validate({ fields: [nameField, { ...nameField }, photoField] }), "invalid_authoritative_configuration"), true);
  assert.equal(hasCode(validate({ fields: [nameField, { ...noteField, code: "name" }, photoField] }), "invalid_authoritative_configuration"), true);
  assert.equal(hasCode(validate({ values: values([{ fieldId: "field-unknown", fieldCode: "unknown", kind: "short_text", value: "x" }]) }), "unknown_field"), true);
  assert.equal(hasCode(validate({ values: values([{ fieldId: "field-name", fieldCode: "wrong", kind: "short_text", value: "Ada" }]) }), "field_code_mismatch"), true);
  assert.equal(hasCode(validate({ values: values([{ fieldId: "field-name", fieldCode: "name", kind: "long_text", value: "Ada" }]) }), "field_kind_mismatch"), true);
  assert.equal(hasCode(validate({ fields: [{ ...nameField, isActive: false }, noteField, photoField] }), "inactive_field"), true);
});

test("requires one consistent authoritative revision and rejects stale drafts", () => {
  assert.equal(validate().ok, true);
  assert.equal(hasCode(validate({ configurationRevision: "revision-stale" }), "stale_configuration"), true);
  assert.equal(hasCode(validate({ fields: [nameField, { ...noteField, configurationRevision: "revision-2" }, photoField] }), "invalid_authoritative_configuration"), true);
  assert.equal(hasCode(validate({ authoritativeConfigurationRevision: "revision-2" }), "invalid_authoritative_configuration"), true);
});

test("accepts a current configured-empty authority but fails closed for stale, blank, or supplied values", () => {
  const configuredEmpty = validate({
    fields: [],
    values: values([]),
    resolvedImageMetadata: [],
  });
  assert.equal(configuredEmpty.ok, true);
  assert.ok(configuredEmpty.ok);
  assert.deepEqual(configuredEmpty.value, []);

  assert.equal(hasCode(validate({
    fields: [],
    values: values([]),
    resolvedImageMetadata: [],
    configurationRevision: "revision-stale",
  }), "stale_configuration"), true);
  assert.equal(hasCode(validate({
    fields: [],
    values: values([]),
    resolvedImageMetadata: [],
    authoritativeConfigurationRevision: " ",
  }), "invalid_authoritative_configuration"), true);
  assert.equal(hasCode(validate({
    fields: [],
    values: values([{ fieldId: "field-name", fieldCode: "name", kind: "short_text", value: "Ada" }]),
    resolvedImageMetadata: [],
  }), "unknown_field"), true);
});

test("enforces requiredness while allowing absent optional fields", () => {
  assert.equal(hasCode(validate({ values: values([{ fieldId: "field-photo", fieldCode: "photo", kind: "image", images: [{ receiptId: "receipt-a" }] }]) }), "required_field_missing"), true);
  assert.equal(hasCode(validate({ values: values([
    { fieldId: "field-name", fieldCode: "name", kind: "short_text", value: "   " },
    { fieldId: "field-photo", fieldCode: "photo", kind: "image", images: [{ receiptId: "receipt-a" }] },
  ]) }), "required_field_empty"), true);
  assert.equal(validate().ok, true);
});

test("checks normalized text length without truncation or collapsing internal whitespace", () => {
  const tooLong = validate({ values: values([
    { fieldId: "field-name", fieldCode: "name", kind: "short_text", value: "  Ada Lovelace  " },
    { fieldId: "field-photo", fieldCode: "photo", kind: "image", images: [{ receiptId: "receipt-a" }] },
  ]) });
  assert.equal(hasCode(tooLong, "text_too_long"), true);
  const multiline = validate({ values: values([
    { fieldId: "field-name", fieldCode: "name", kind: "short_text", value: "A  \n B" },
    { fieldId: "field-photo", fieldCode: "photo", kind: "image", images: [{ receiptId: "receipt-a" }] },
  ]) });
  assert.equal(multiline.ok, true);
  assert.ok(multiline.ok && multiline.value[0].kind === "short_text");
  assert.equal(multiline.value[0].value, "A  \n B");
});

test("enforces image count with required effective minimum and preserves receipt order", () => {
  assert.equal(hasCode(validate({ values: values([
    { fieldId: "field-name", fieldCode: "name", kind: "short_text", value: "Ada" },
    { fieldId: "field-photo", fieldCode: "photo", kind: "image", images: [] },
  ]) }), "image_count_too_low"), true);
  const minTwoField = { ...photoField, constraints: { ...photoField.constraints, minImageCount: 2 } };
  assert.equal(hasCode(validate({ fields: [nameField, noteField, minTwoField] }), "image_count_too_low"), true);
  const atMaximum = validate({
    values: values([
      { fieldId: "field-name", fieldCode: "name", kind: "short_text", value: "Ada" },
      { fieldId: "field-photo", fieldCode: "photo", kind: "image", images: [{ receiptId: "receipt-b" }, { receiptId: "receipt-a" }] },
    ]),
    resolvedImageMetadata: metadata([
      { receiptId: "receipt-a", mimeType: "image/jpeg", fileSizeBytes: 100, width: 100, height: 100 },
      { receiptId: "receipt-b", mimeType: "image/png", fileSizeBytes: 100, width: 100, height: 100 },
    ]),
  });
  assert.equal(atMaximum.ok, true);
  assert.ok(atMaximum.ok && atMaximum.value[1].kind === "image");
  assert.deepEqual(atMaximum.value[1].images.map((image) => image.receiptId), ["receipt-b", "receipt-a"]);
  assert.equal(hasCode(validate({ values: values([
    { fieldId: "field-name", fieldCode: "name", kind: "short_text", value: "Ada" },
    { fieldId: "field-photo", fieldCode: "photo", kind: "image", images: [{ receiptId: "receipt-a" }, { receiptId: "receipt-b" }, { receiptId: "receipt-c" }] },
  ]) }), "image_count_too_high"), true);
});

test("requires unique trusted metadata and validates MIME, bytes, and minimum dimensions without quality classification", () => {
  assert.equal(hasCode(validate({ resolvedImageMetadata: [] }), "image_metadata_missing"), true);
  const duplicateMetadata = validMetadata();
  duplicateMetadata.push({ ...duplicateMetadata[0] });
  assert.equal(hasCode(validate({ resolvedImageMetadata: duplicateMetadata }), "duplicate_image_metadata"), true);
  assert.equal(hasCode(validate({ resolvedImageMetadata: metadata([{ receiptId: "receipt-a", mimeType: "image/webp", fileSizeBytes: 100, width: 100, height: 100 }]) }), "image_mime_not_allowed"), true);
  assert.equal(hasCode(validate({ resolvedImageMetadata: metadata([{ receiptId: "receipt-a", mimeType: "image/jpeg", fileSizeBytes: 1001, width: 100, height: 100 }]) }), "image_too_large"), true);
  assert.equal(hasCode(validate({ resolvedImageMetadata: metadata([{ receiptId: "receipt-a", mimeType: "image/jpeg", fileSizeBytes: 100, width: 99, height: 100 }]) }), "image_dimensions_too_small"), true);
  const recommended = validate({ fields: [nameField, noteField, { ...photoField, constraints: { ...photoField.constraints, recommendedDimensions: { width: 1000, height: 1000 } } }] });
  assert.equal(recommended.ok, true);
});

test("strict metadata parser rejects invalid or provider-shaped evidence", () => {
  for (const value of [
    { receiptId: "receipt-a", mimeType: "image/jpeg", fileSizeBytes: 0, width: 1, height: 1 },
    { receiptId: "receipt-a", mimeType: "image/jpeg", fileSizeBytes: 1.5, width: 1, height: 1 },
    { receiptId: "receipt-a", mimeType: "image/gif", fileSizeBytes: 1, width: 1, height: 1 },
    { receiptId: "receipt-a", mimeType: "image/jpeg", fileSizeBytes: 1, width: 1, height: 1, storageKey: "drafts/a" },
  ]) {
    assert.equal(parseCustomizationResolvedImageMetadata(value).ok, false);
  }
});

test("reuses crop policy without field identity or Product ownership validation", () => {
  const cropped = values([
    { fieldId: "field-name", fieldCode: "name", kind: "short_text", value: "Ada" },
    { fieldId: "field-photo", fieldCode: "photo", kind: "image", images: [{ receiptId: "receipt-a", crop: { x: 0, y: 0, width: 1, height: 1 } }] },
  ]);
  assert.equal(validate({ values: cropped }).ok, true);
  assert.equal(hasCode(validate({ fields: [nameField, noteField, { ...photoField, constraints: { ...photoField.constraints, cropEnabled: false } }], values: cropped }), "crop_not_allowed"), true);
});
