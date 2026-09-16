import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ACTIVE_FIELD_DEFINITION_SELECT,
  CURRENT_CONFIGURATION_SELECT,
  FIELD_IDENTITY_SELECT,
  SupabaseCustomizationFieldRepository,
} from "../app/infrastructure/customization/supabase-customization-field-repository.ts";

const productId = "product-frame";
const revisionId = "revision-current";

function currentConfig(overrides = {}) {
  return { id: revisionId, product_id: productId, is_current: true, superseded_at: null, ...overrides };
}

function textDefinition(overrides = {}) {
  return {
    id: "definition-row-name",
    configuration_revision_id: revisionId,
    product_id: productId,
    stable_field_id: "field-name",
    label: "Name",
    kind: "short_text",
    required: true,
    is_active: true,
    position: 0,
    max_length: 120,
    help_text: "Use a short name.",
    allowed_mime_types: null,
    max_bytes: null,
    min_width: null,
    min_height: null,
    recommended_width: null,
    recommended_height: null,
    min_image_count: null,
    max_image_count: null,
    crop_enabled: null,
    ...overrides,
  };
}

function imageDefinition(overrides = {}) {
  return {
    id: "definition-row-photo",
    configuration_revision_id: revisionId,
    product_id: productId,
    stable_field_id: "field-photo",
    label: "Photo",
    kind: "image",
    required: true,
    is_active: true,
    position: 1,
    max_length: null,
    help_text: null,
    allowed_mime_types: ["image/jpeg", "image/png", "image/webp"],
    max_bytes: 2_000_000,
    min_width: 800,
    min_height: 600,
    recommended_width: 1_200,
    recommended_height: 900,
    min_image_count: 1,
    max_image_count: 3,
    crop_enabled: true,
    ...overrides,
  };
}

function identity(id, code, overrides = {}) {
  return { id, product_id: productId, code, ...overrides };
}

function reader({
  current = [currentConfig()],
  definitions = [textDefinition(), imageDefinition()],
  identities = [identity("field-name", "name"), identity("field-photo", "photo")],
  currentError = null,
  definitionsError = null,
  identitiesError = null,
} = {}) {
  const calls = { current: [], definitions: [], identities: [] };
  return {
    calls,
    async readCurrentConfigurations(id) {
      calls.current.push(id);
      return { data: current, error: currentError };
    },
    async readActiveFieldDefinitions(id, revision) {
      calls.definitions.push({ id, revision });
      return { data: definitions, error: definitionsError };
    },
    async readFieldIdentities(id, stableFieldIds) {
      calls.identities.push({ id, stableFieldIds: [...stableFieldIds] });
      return { data: identities, error: identitiesError };
    },
  };
}

function repository(options) {
  const tableReader = reader(options);
  return { tableReader, repository: new SupabaseCustomizationFieldRepository(tableReader) };
}

test("current configuration cardinality remains observable and query failures are safe", async () => {
  for (const [options, expectedStatus] of [
    [{ current: [] }, "not_found"],
    [{ current: [currentConfig(), currentConfig({ id: "revision-second" })] }, "invalid_configuration"],
    [{ current: [null] }, "invalid_configuration"],
    [{ currentError: { message: "database secret" } }, "source_failure"],
  ]) {
    const { repository: source } = repository(options);
    const result = await source.getCustomizationFieldsForProduct(productId);
    assert.equal(result.status, expectedStatus);
    assert.doesNotMatch(JSON.stringify(result), /database secret|details|hint|sqlstate/i);
  }
});

test("maps one current revision through stable identity IDs and the exact field constraints", async () => {
  const { repository: source } = repository();
  const result = await source.getCustomizationFieldsForProduct(productId);

  assert.equal(result.status, "found");
  assert.equal(result.value.productId, productId);
  assert.equal(result.value.configurationRevision, revisionId);
  assert.deepEqual(result.value.fields.map((field) => field.id), ["field-name", "field-photo"]);
  assert.equal(result.value.fields.some((field) => field.id.startsWith("definition-row")), false);
  assert.deepEqual(result.value.fields[0].constraints, { maxLength: 120, helpText: "Use a short name." });
  assert.deepEqual(result.value.fields[1].constraints, {
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
    maxBytes: 2_000_000,
    minDimensions: { width: 800, height: 600 },
    recommendedDimensions: { width: 1_200, height: 900 },
    minImageCount: 1,
    maxImageCount: 3,
    cropEnabled: true,
  });
});

test("maps long text and omits recommended dimensions only when the approved pair is absent", async () => {
  const { repository: source } = repository({
    definitions: [
      textDefinition({ kind: "long_text", stable_field_id: "field-note", label: "Note", max_length: 1_000, help_text: null }),
      imageDefinition({ recommended_width: null, recommended_height: null }),
    ],
    identities: [identity("field-note", "note"), identity("field-photo", "photo")],
  });
  const result = await source.getCustomizationFieldsForProduct(productId);

  assert.equal(result.status, "found");
  assert.deepEqual(result.value.fields[0].constraints, { maxLength: 1_000 });
  assert.equal(result.value.fields[1].kind, "image");
  assert.equal("recommendedDimensions" in result.value.fields[1].constraints, false);
});

test("malformed successful rows are invalid configuration, including inactive and ownership drift", async () => {
  const cases = [
    { definitions: [textDefinition({ max_length: 0 })] },
    { definitions: [imageDefinition({ min_width: "800" })] },
    { definitions: [textDefinition({ is_active: false })] },
    { definitions: [textDefinition({ product_id: "product-other" })] },
    { definitions: [textDefinition({ configuration_revision_id: "revision-other" })] },
    { identities: [identity("field-name", "name", { product_id: "product-other" })] },
    { identities: [] },
  ];
  for (const options of cases) {
    const { repository: source } = repository(options);
    const result = await source.getCustomizationFieldsForProduct(productId);
    assert.equal(result.status, "invalid_configuration");
  }
});

test("duplicates fail closed through identity integrity and Task 4.1 normalization", async () => {
  const duplicateIdentity = repository({
    definitions: [textDefinition()],
    identities: [identity("field-name", "name"), identity("field-name", "name-again")],
  });
  assert.equal((await duplicateIdentity.repository.getCustomizationFieldsForProduct(productId)).status, "invalid_configuration");

  const duplicateCode = repository({
    definitions: [textDefinition(), textDefinition({ stable_field_id: "field-other", position: 1 })],
    identities: [identity("field-name", "name"), identity("field-other", "name")],
  });
  assert.equal((await duplicateCode.repository.getCustomizationFieldsForProduct(productId)).status, "invalid_configuration");

  const duplicatePosition = repository({
    definitions: [textDefinition(), textDefinition({ stable_field_id: "field-other", position: 0 })],
    identities: [identity("field-name", "name"), identity("field-other", "other")],
  });
  assert.equal((await duplicatePosition.repository.getCustomizationFieldsForProduct(productId)).status, "invalid_configuration");
});

test("a valid empty current configuration succeeds without an identity lookup", async () => {
  const { tableReader, repository: source } = repository({ definitions: [], identities: [] });
  const result = await source.getCustomizationFieldsForProduct(productId);

  assert.deepEqual(result, {
    status: "found",
    value: { productId, configurationRevision: revisionId, fields: [] },
  });
  assert.deepEqual(tableReader.calls.identities, []);
});

test("definition and identity query failures are safe source failures and do not fall back", async () => {
  for (const options of [
    { definitionsError: { message: "definition query failed" } },
    { identitiesError: { message: "identity query failed" } },
    { definitions: null },
  ]) {
    const { repository: source } = repository(options);
    const result = await source.getCustomizationFieldsForProduct(productId);
    assert.deepEqual(result, { status: "source_failure", operation: "customization_field_configuration.read" });
  }
});

test("the concrete adapter bounds table access to explicit Phase A columns with no legacy or purchase authority", async () => {
  assert.equal(CURRENT_CONFIGURATION_SELECT, "id, product_id, is_current, superseded_at");
  assert.equal(ACTIVE_FIELD_DEFINITION_SELECT, "configuration_revision_id, product_id, stable_field_id, label, kind, required, is_active, position, max_length, help_text, allowed_mime_types, max_bytes, min_width, min_height, recommended_width, recommended_height, min_image_count, max_image_count, crop_enabled");
  assert.equal(FIELD_IDENTITY_SELECT, "id, product_id, code");

  const source = await readFile(
    new URL("../app/infrastructure/customization/supabase-customization-field-repository.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /select\s*\(\s*["']\*["']\s*\)|customization_schema|product_variants|product_options|price|currency|surcharge|receipt|storage/i);
  assert.match(source, /\.eq\("product_id", productId\)[\s\S]*\.eq\("is_current", true\)/);
  assert.match(source, /\.eq\("configuration_revision_id", configurationRevision\)[\s\S]*\.eq\("is_active", true\)/);
});

test("controlled repository tests remain offline and do not use fetch", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("network must not be used"); };
  try {
    const { repository: source } = repository();
    assert.equal((await source.getCustomizationFieldsForProduct(productId)).status, "found");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
