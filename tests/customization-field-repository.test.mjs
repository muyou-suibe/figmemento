import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  CUSTOMIZATION_FIELD_SOURCE_FAILURE_OPERATION,
  customizationFieldSourceFailure,
  normalizeAdminCustomizationFieldConfiguration,
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

test("validates the complete canonical configuration before projecting active fields", () => {
  const active = field();
  const inactive = field({ id: "field-retired", code: "retired", label: "Retired", isActive: false, position: 1 });
  const value = configuration([inactive, active]);
  const admin = normalizeAdminCustomizationFieldConfiguration(productId, value);
  const publicResult = normalizeCustomizationFieldConfiguration(productId, value);
  assert.equal(admin.status, "found");
  assert.deepEqual(admin.value.fields.map((entry) => entry.id), [active.id, inactive.id]);
  assert.equal(publicResult.status, "found");
  assert.deepEqual(publicResult.value.fields.map((entry) => entry.id), [active.id]);
  assert.equal(publicResult.value.configurationRevision, configurationRevision);

  const allInactive = normalizeCustomizationFieldConfiguration(productId, configuration([inactive]));
  assert.deepEqual(allInactive, { status: "found", value: { productId, configurationRevision, fields: [] } });
});

test("public choice projection retains active identities and conditional rules", () => {
  const choices = [
    { id: "choice-live", code: "live", label: "Live", position: 0, isActive: true },
    { id: "choice-retired", code: "retired", label: "Retired", position: 1, isActive: false },
  ];
  const selector = field({ id: "field-selector", code: "selector", kind: "single_select", constraints: { choices }, position: 0 });
  const multi = field({ id: "field-multi", code: "multi", kind: "multi_select", required: false, constraints: { choices, minSelections: 0, maxSelections: 1 }, position: 1 });
  const conditional = field({ id: "field-conditional", code: "conditional", required: false, position: 2,
    rules: { visibleWhen: { kind: "field_present", fieldId: selector.id }, requiredWhen: { kind: "single_select_is", fieldId: selector.id, choiceId: choices[0].id } },
  });
  const value = configuration([selector, multi, conditional]);
  const admin = normalizeAdminCustomizationFieldConfiguration(productId, value);
  const publicResult = normalizeCustomizationFieldConfiguration(productId, value);
  assert.equal(admin.status, "found");
  assert.equal(publicResult.status, "found");
  for (const index of [0, 1]) {
    assert.deepEqual(admin.value.fields[index].constraints.choices.map((choice) => choice.id), choices.map((choice) => choice.id));
    assert.deepEqual(publicResult.value.fields[index].constraints.choices.map((choice) => choice.id), [choices[0].id]);
  }
  assert.deepEqual(publicResult.value.fields[2].rules, conditional.rules);
});

test("rejects Product ownership and inconsistent revisions even on inactive fields", () => {
  const foreign = invalid(configuration([field({ productId: "product-other" })]));
  assert.ok(foreign.issues.some((issue) => issue.code === "ownership"));
  const revision = invalid(configuration([field({ configurationRevision: "revision-other" })]));
  assert.ok(revision.issues.some((issue) => issue.path.endsWith(".configurationRevision")));
  const hiddenForeign = invalid(configuration([field(), field({ id: "field-other", code: "other", position: 1, isActive: false, productId: "product-other" })]));
  assert.ok(hiddenForeign.issues.some((issue) => issue.code === "ownership"));
  const hiddenRevision = invalid(configuration([field(), field({ id: "field-other", code: "other", position: 1, isActive: false, configurationRevision: "revision-other" })]));
  assert.ok(hiddenRevision.issues.some((issue) => issue.path.endsWith(".configurationRevision")));
});

test("rejects blank configuration revisions and malformed fields", () => {
  assert.ok(invalid({ ...configuration(), configurationRevision: "  " }).issues.some((issue) => issue.path === "$.configurationRevision"));
  assert.ok(invalid(configuration([{ not: "a field" }])).issues.some((issue) => issue.path.startsWith("$.fields[0]")));
  assert.ok(invalid(configuration([field({ kind: "unsupported" })])).issues.some((issue) => issue.code === "invalid_value"));
  assert.ok(invalid(configuration([field({ constraints: { maxLength: 0 } })])).issues.some((issue) => issue.code === "invalid_value"));
  assert.ok(invalid(configuration([field(), field({ id: "field-other", code: "other", position: 1, isActive: false, constraints: { maxLength: 0 } })])).issues.some((issue) => issue.code === "invalid_value"));
});

test("rejects duplicate stable IDs, Product-scoped codes, and positions instead of inventing a tie-breaker", () => {
  const duplicateId = invalid(configuration([field(), field({ code: "other", position: 1 })]));
  assert.ok(duplicateId.issues.some((issue) => issue.message.includes("ID")));
  const duplicateCode = invalid(configuration([field(), field({ id: "field-other", position: 1 })]));
  assert.ok(duplicateCode.issues.some((issue) => issue.message.includes("code")));
  const duplicatePosition = invalid(configuration([field(), field({ id: "field-other", code: "other" })]));
  assert.ok(duplicatePosition.issues.some((issue) => issue.message.includes("position")));
  for (const duplicate of [
    field({ code: "other", position: 1, isActive: false }),
    field({ id: "field-other", position: 1, isActive: false }),
    field({ id: "field-other", code: "other", isActive: false }),
  ]) {
    assert.ok(invalid(configuration([field(), duplicate])).issues.some((issue) => issue.code === "duplicate"));
  }
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
