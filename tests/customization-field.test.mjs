import assert from "node:assert/strict";
import test from "node:test";

import {
  parseCustomizationField,
  parseCustomizationFieldCore,
} from "../app/domain/customization-field.ts";

const validField = {
  id: "field-photo",
  productId: "product-frame",
  code: "photo",
  label: "Your photo",
  kind: "image",
  required: true,
  isActive: true,
  position: 0,
  configurationRevision: "revision-1",
};

test("parses each approved CustomizationField core kind", () => {
  for (const kind of ["image", "short_text", "long_text"]) {
    const result = parseCustomizationFieldCore({ ...validField, kind });
    assert.equal(result.ok, true);
    assert.ok(result.ok);
    assert.equal(result.value.kind, kind);
  }
});

test("rejects invalid kind and unknown top-level authority", () => {
  assert.equal(parseCustomizationFieldCore({ ...validField, kind: "photo" }).ok, false);
  const result = parseCustomizationFieldCore({ ...validField, constraints: {} });
  assert.equal(result.ok, false);
  assert.ok(!result.ok && result.issues.some((issue) => issue.code === "unknown_field"));
});

test("rejects missing or invalid identities, code, label, flags, position, and revision", () => {
  const invalid = parseCustomizationFieldCore({
    ...validField,
    id: " ",
    productId: 42,
    code: " ",
    label: "\t",
    required: "true",
    isActive: 1,
    position: -1,
    configurationRevision: "",
  });
  assert.equal(invalid.ok, false);
});

test("requires a finite non-negative integer position", () => {
  for (const position of [-1, 1.5, "1", Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(parseCustomizationFieldCore({ ...validField, position }).ok, false);
  }
  assert.equal(parseCustomizationFieldCore({ ...validField, position: 3 }).ok, true);
});

test("returns only provider-neutral core fields", () => {
  const result = parseCustomizationFieldCore(validField);
  assert.equal(result.ok, true);
  assert.ok(result.ok);
  assert.deepEqual(Object.keys(result.value).sort(), [
    "code",
    "configurationRevision",
    "id",
    "isActive",
    "kind",
    "label",
    "position",
    "productId",
    "required",
  ]);
});

const textConstraints = { maxLength: 120, helpText: "Use a short name." };
const imageConstraints = {
  allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  maxBytes: 2_000_000,
  minDimensions: { width: 800, height: 800 },
  recommendedDimensions: { width: 1200, height: 1200 },
  minImageCount: 1,
  maxImageCount: 3,
  cropEnabled: false,
};

test("parses bounded text constraints for short and long text", () => {
  for (const kind of ["short_text", "long_text"]) {
    const result = parseCustomizationField({ ...validField, kind, constraints: textConstraints });
    assert.equal(result.ok, true);
    assert.ok(result.ok);
    assert.deepEqual(result.value.constraints, textConstraints);
  }
  for (const maxLength of [0, -1, 1.5, "120", Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(parseCustomizationField({ ...validField, kind: "short_text", constraints: { maxLength } }).ok, false);
  }
  assert.equal(parseCustomizationField({ ...validField, kind: "short_text", constraints: { maxLength: 10, helpText: " " } }).ok, false);
});

test("parses bounded image constraints and strict MIME values", () => {
  const result = parseCustomizationField({ ...validField, constraints: imageConstraints });
  assert.equal(result.ok, true);
  assert.ok(result.ok);
  assert.deepEqual(result.value.constraints, imageConstraints);
  for (const allowedMimeTypes of [[], ["image/jpg"], ["jpg"], ["image/jpeg", "image/jpeg"]]) {
    assert.equal(parseCustomizationField({ ...validField, constraints: { ...imageConstraints, allowedMimeTypes } }).ok, false);
  }
});

test("rejects invalid image bytes, dimensions, counts, and crop types", () => {
  for (const maxBytes of [0, -1, 1.5, "2000000", Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(parseCustomizationField({ ...validField, constraints: { ...imageConstraints, maxBytes } }).ok, false);
  }
  for (const minDimensions of [{ width: 0, height: 1 }, { width: 1.5, height: 1 }, { width: 1, height: "1" }]) {
    assert.equal(parseCustomizationField({ ...validField, constraints: { ...imageConstraints, minDimensions } }).ok, false);
  }
  assert.equal(parseCustomizationField({ ...validField, constraints: { ...imageConstraints, recommendedDimensions: { width: 799, height: 800 } } }).ok, false);
  assert.equal(parseCustomizationField({ ...validField, constraints: { ...imageConstraints, minImageCount: 4 } }).ok, false);
  assert.equal(parseCustomizationField({ ...validField, constraints: { ...imageConstraints, maxImageCount: 0 } }).ok, false);
  assert.equal(parseCustomizationField({ ...validField, constraints: { ...imageConstraints, minImageCount: 1.5 } }).ok, false);
  assert.equal(parseCustomizationField({ ...validField, constraints: { ...imageConstraints, cropEnabled: "false" } }).ok, false);
});

test("rejects wrong-kind, unknown, deferred, and provider-specific constraints", () => {
  const textOnlyInvalid = { maxLength: 10, maxBytes: 100 };
  const imageOnlyInvalid = { ...imageConstraints, maxLength: 10 };
  assert.equal(parseCustomizationField({ ...validField, kind: "short_text", constraints: textOnlyInvalid }).ok, false);
  assert.equal(parseCustomizationField({ ...validField, constraints: imageOnlyInvalid }).ok, false);
  for (const key of ["unknown", "priceCents", "conditions", "supplierId", "productionPreview", "storageKey"]) {
    assert.equal(parseCustomizationField({ ...validField, constraints: { ...imageConstraints, [key]: true } }).ok, false);
  }
  const result = parseCustomizationField({ ...validField, provider: "supabase", constraints: imageConstraints });
  assert.equal(result.ok, false);
});

test("normalized constraint output contains no provider or storage authority", () => {
  const result = parseCustomizationField({ ...validField, constraints: imageConstraints });
  assert.equal(result.ok, true);
  assert.ok(result.ok);
  assert.deepEqual(Object.keys(result.value).sort(), [
    "code", "configurationRevision", "constraints", "id", "isActive",
    "kind", "label", "position", "productId", "required",
  ]);
  assert.deepEqual(Object.keys(result.value.constraints).sort(), [
    "allowedMimeTypes", "cropEnabled", "maxBytes", "maxImageCount",
    "minDimensions", "minImageCount", "recommendedDimensions",
  ]);
});
