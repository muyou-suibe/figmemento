import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  CUSTOMIZATION_FIELD_SOURCE_FAILURE_OPERATION,
  customizationFieldSourceFailure,
  normalizeCustomizationFieldConfiguration,
} from "../app/application/customization-field-repository.ts";

const productId = "product-frame";
const configurationRevision = "revision-1";
const textConstraints = { maxLength: 120, helpText: "Use a short name." };
const imageConstraints = {
  allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  maxBytes: 2_000_000,
  minDimensions: { width: 800, height: 800 },
  minImageCount: 1,
  maxImageCount: 3,
  cropEnabled: false,
};

function field(overrides = {}) {
  return {
    id: "field-name",
    productId,
    code: "name",
    label: "Name",
    kind: "short_text",
    required: true,
    isActive: true,
    position: 0,
    configurationRevision,
    constraints: textConstraints,
    ...overrides,
  };
}

function configuration(fields = [field()]) {
  return { productId, configurationRevision, fields };
}

function invalid(value) {
  const result = normalizeCustomizationFieldConfiguration(productId, value);
  assert.equal(result.status, "invalid_configuration");
  return result;
}

test("accepts a valid current configuration with image and text field shapes", () => {
  const result = normalizeCustomizationFieldConfiguration(productId, configuration([
    field({ id: "field-photo", code: "photo", label: "Photo", kind: "image", position: 1, constraints: imageConstraints }),
    field(),
  ]));

  assert.equal(result.status, "found");
  assert.equal(result.value.productId, productId);
  assert.equal(result.value.configurationRevision, configurationRevision);
  assert.deepEqual(result.value.fields.map((entry) => entry.code), ["name", "photo"]);
  assert.equal(result.value.fields[0].kind, "short_text");
  assert.equal(result.value.fields[1].kind, "image");
});

test("distinguishes an authoritative empty configuration from repository not_found", () => {
  const empty = normalizeCustomizationFieldConfiguration(productId, configuration([]));
  assert.deepEqual(empty, {
    status: "found",
    value: { productId, configurationRevision, fields: [] },
  });
  const noConfiguration = { status: "not_found" };
  assert.notDeepEqual(empty, noConfiguration);
});

test("sorts valid source fields solely by unique authoritative position", () => {
  const result = normalizeCustomizationFieldConfiguration(productId, configuration([
    field({ id: "field-later", code: "later", label: "Later", position: 2 }),
    field({ id: "field-first", code: "first", label: "First", position: 0 }),
  ]));

  assert.equal(result.status, "found");
  assert.deepEqual(result.value.fields.map((entry) => entry.position), [0, 2]);
  assert.deepEqual(result.value.fields.map((entry) => entry.id), ["field-first", "field-later"]);
});

test("rejects Product ownership, inactive fields, and inconsistent revisions", () => {
  const foreign = invalid(configuration([field({ productId: "product-other" })]));
  assert.ok(foreign.issues.some((issue) => issue.code === "ownership"));
  const inactive = invalid(configuration([field({ isActive: false })]));
  assert.ok(inactive.issues.some((issue) => issue.path.endsWith(".isActive")));
  const revision = invalid(configuration([field({ configurationRevision: "revision-other" })]));
  assert.ok(revision.issues.some((issue) => issue.path.endsWith(".configurationRevision")));
});

test("rejects blank configuration revisions and malformed fields", () => {
  assert.ok(invalid({ ...configuration(), configurationRevision: "  " }).issues.some((issue) => issue.path === "$.configurationRevision"));
  assert.ok(invalid(configuration([{ not: "a field" }])).issues.some((issue) => issue.path.startsWith("$.fields[0]")));
  assert.ok(invalid(configuration([field({ kind: "unsupported" })])).issues.some((issue) => issue.code === "invalid_value"));
  assert.ok(invalid(configuration([field({ constraints: { maxLength: 0 } })])).issues.some((issue) => issue.code === "invalid_value"));
});

test("rejects duplicate stable IDs, Product-scoped codes, and positions instead of inventing a tie-breaker", () => {
  const duplicateId = invalid(configuration([field(), field({ code: "other", position: 1 })]));
  assert.ok(duplicateId.issues.some((issue) => issue.message.includes("ID")));
  const duplicateCode = invalid(configuration([field(), field({ id: "field-other", position: 1 })]));
  assert.ok(duplicateCode.issues.some((issue) => issue.message.includes("code")));
  const duplicatePosition = invalid(configuration([field(), field({ id: "field-other", code: "other" })]));
  assert.ok(duplicatePosition.issues.some((issue) => issue.message.includes("position")));
});

test("keeps source failures safe and distinct from not found and invalid configuration", () => {
  const failure = customizationFieldSourceFailure();
  assert.deepEqual(failure, {
    status: "source_failure",
    operation: CUSTOMIZATION_FIELD_SOURCE_FAILURE_OPERATION,
  });
  assert.deepEqual(Object.keys(failure).sort(), ["operation", "status"]);
  assert.notEqual(failure.status, "not_found");
  assert.notEqual(failure.status, "invalid_configuration");
});

test("the provider-neutral contract has no infrastructure, legacy, or purchase-authority imports", async () => {
  const source = await readFile(
    new URL("../app/application/customization-field-repository.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /from\s+["'][^"']*(?:infrastructure|supabase|fixture)[^"']*["']/i);
  assert.doesNotMatch(source, /from\s+["'][^"']*(?:product-catalog|configured-item|customization-value)[^"']*["']/i);
  assert.doesNotMatch(source, /\b(?:fetch|query|insert|update|delete)\s*\(/i);
});
