import assert from "node:assert/strict";
import test from "node:test";

import { parseCustomizationField } from "../app/domain/customization-field.ts";
import { classifyCustomizationImageDimensions } from "../app/domain/customization-image-quality.ts";
import {
  parseCustomizationResolvedImageMetadata,
  validateCustomizationValuesAgainstFields,
} from "../app/domain/customization-validation.ts";
import { parseCustomizationValues } from "../app/domain/customization-value.ts";

const constraints = {
  allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  maxBytes: 10_000_000,
  minDimensions: { width: 100, height: 200 },
  recommendedDimensions: { width: 300, height: 400 },
  minImageCount: 0,
  maxImageCount: 3,
  cropEnabled: true,
};

const noRecommendationConstraints = {
  ...constraints,
  recommendedDimensions: undefined,
};

function image(width, height, overrides = {}) {
  return {
    receiptId: "receipt-a",
    mimeType: "image/jpeg",
    fileSizeBytes: 1_000,
    width,
    height,
    ...overrides,
  };
}

function state(width, height, overrides = {}, fieldConstraints = constraints) {
  return classifyCustomizationImageDimensions(fieldConstraints, image(width, height, overrides)).state;
}

test("classifies either dimension below the required minimum as below_minimum", () => {
  assert.equal(state(99, 200), "below_minimum");
  assert.equal(state(100, 199), "below_minimum");
  assert.equal(state(99, 199), "below_minimum");
});

test("uses both dimensions at threshold boundaries", () => {
  assert.equal(state(100, 200), "below_recommended");
  assert.equal(state(299, 400), "below_recommended");
  assert.equal(state(300, 399), "below_recommended");
  assert.equal(state(299, 399), "below_recommended");
  assert.equal(state(300, 400), "meets_recommendation");
  assert.equal(state(600, 800), "meets_recommendation");
});

test("treats minimum-satisfying images without a configured recommendation as acceptable", () => {
  assert.equal(
    state(100, 200, {}, noRecommendationConstraints),
    "meets_recommendation",
  );
});

test("never downgrades a below-minimum image to a recommendation warning", () => {
  assert.equal(state(99, 800), "below_minimum");
});

test("does not use file size, MIME type, receipt identity, or crop-shaped extra data", () => {
  const baseline = state(200, 300);
  assert.equal(state(200, 300, { fileSizeBytes: 1 }), baseline);
  assert.equal(state(200, 300, { fileSizeBytes: 9_999_999 }), baseline);
  assert.equal(state(200, 300, { mimeType: "image/png" }), baseline);
  assert.equal(state(200, 300, { mimeType: "image/webp" }), baseline);
  assert.equal(state(200, 300, { receiptId: "receipt-b" }), baseline);
  assert.equal(
    state(200, 300, { crop: { x: 0, y: 0, width: 1, height: 1 } }),
    baseline,
  );
});

test("returns only the explicit threshold state and does not mutate metadata", () => {
  const metadata = image(200, 300, {
    crop: { x: 0, y: 0, width: 1, height: 1 },
  });
  const before = structuredClone(metadata);
  const result = classifyCustomizationImageDimensions(constraints, metadata);

  assert.deepEqual(result, { state: "below_recommended" });
  assert.deepEqual(metadata, before);
});

test("Task 2.5 continues to reject trusted metadata below required dimensions", () => {
  const fieldResult = parseCustomizationField({
    id: "field-photo",
    productId: "product-frame",
    code: "photo",
    label: "Photo",
    kind: "image",
    required: true,
    isActive: true,
    position: 0,
    configurationRevision: "revision-1",
    constraints,
  });
  assert.ok(fieldResult.ok);

  const valuesResult = parseCustomizationValues([
    {
      fieldId: "field-photo",
      fieldCode: "photo",
      kind: "image",
      images: [{ receiptId: "receipt-a" }],
    },
  ]);
  assert.ok(valuesResult.ok);

  const metadataResult = parseCustomizationResolvedImageMetadata(image(99, 200));
  assert.ok(metadataResult.ok);

  const result = validateCustomizationValuesAgainstFields({
    productId: "product-frame",
    configurationRevision: "revision-1",
    authoritativeConfigurationRevision: "revision-1",
    fields: [fieldResult.value],
    values: valuesResult.value,
    resolvedImageMetadata: [metadataResult.value],
  });

  assert.equal(result.ok, false);
  assert.ok(!result.ok);
  assert.equal(
    result.issues.some((entry) => entry.code === "image_dimensions_too_small"),
    true,
  );
});
