import assert from "node:assert/strict";
import test from "node:test";

import { SupabaseAdminCustomizationFieldRepository } from "../app/infrastructure/customization/supabase-admin-customization-field-repository.ts";

const productId = "product-frame";
const revision = "revision-current";

function definition(overrides = {}) {
  return {
    configuration_revision_id: revision,
    product_id: productId,
    stable_field_id: "field-name",
    label: "Name",
    kind: "short_text",
    required: true,
    is_active: false,
    position: 0,
    max_length: 80,
    help_text: "Keep identity, code, and history.",
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

function reader(overrides = {}) {
  const calls = { products: 0, current: 0, definitions: 0, identities: 0 };
  return {
    calls,
    async readProducts() { calls.products += 1; return overrides.products ?? { data: [{ id: productId }], error: null }; },
    async readCurrentConfigurations() { calls.current += 1; return overrides.current ?? { data: [{ id: revision, product_id: productId, is_current: true, superseded_at: null }], error: null }; },
    async readFieldDefinitions() { calls.definitions += 1; return overrides.definitions ?? { data: [definition()], error: null }; },
    async readFieldIdentities() { calls.identities += 1; return overrides.identities ?? { data: [{ id: "field-name", product_id: productId, code: "name" }], error: null }; },
  };
}

test("admin Supabase-shaped reader keeps inactive current definitions available for explicit reactivation", async () => {
  const source = reader();
  const result = await new SupabaseAdminCustomizationFieldRepository(source)
    .getCurrentConfigurationForAdmin(productId);
  assert.equal(result.status, "found");
  assert.equal(result.value.configurationRevision, revision);
  assert.equal(result.value.fields[0].isActive, false);
  assert.deepEqual(source.calls, { products: 1, current: 1, definitions: 1, identities: 1 });
});

test("admin reader distinguishes Product absence, unconfigured Product, and safe provider/configuration failure", async () => {
  const cases = [
    [{ products: { data: [], error: null } }, "not_found"],
    [{ current: { data: [], error: null } }, "not_configured"],
    [{ products: { data: null, error: { message: "secret" } } }, "source_failure"],
    [{ identities: { data: [{ id: "field-name", product_id: "product-other", code: "name" }], error: null } }, "invalid_configuration"],
  ];
  for (const [overrides, expected] of cases) {
    const result = await new SupabaseAdminCustomizationFieldRepository(reader(overrides))
      .getCurrentConfigurationForAdmin(productId);
    assert.equal(result.status, expected);
    assert.doesNotMatch(JSON.stringify(result), /secret|detail|hint|sqlstate/i);
  }
});

test("admin identity lookup returns only Product-scoped stable identity records and stays offline", async () => {
  const source = reader();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("network must not be used"); };
  try {
    const result = await new SupabaseAdminCustomizationFieldRepository(source)
      .getStableFieldIdentitiesForAdmin(productId, ["field-name"]);
    assert.deepEqual(result, { status: "found", value: [{ id: "field-name", productId, code: "name" }] });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
