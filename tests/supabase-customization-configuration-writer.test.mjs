import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  PUBLISH_CUSTOMIZATION_CONFIGURATION_RPC,
  SupabaseCustomizationConfigurationWriter,
} from "../app/infrastructure/customization/supabase-customization-configuration-writer.ts";

const productId = "product-frame";
const revision = "revision-current";
const nextRevision = "revision-next";

function replacement(overrides = {}) {
  return {
    productId,
    expectedCurrentRevision: revision,
    fields: [
      {
        identity: { kind: "existing", id: "field-name", code: "name" },
        label: "Name",
        kind: "short_text",
        required: true,
        isActive: true,
        position: 0,
        constraints: { maxLength: 100 },
      },
      {
        identity: { kind: "new", draftId: "new:photo", code: "photo" },
        label: "Photo",
        kind: "image",
        required: true,
        isActive: true,
        position: 1,
        constraints: {
          allowedMimeTypes: ["image/jpeg", "image/png"],
          maxBytes: 2_000_000,
          minDimensions: { width: 800, height: 600 },
          minImageCount: 1,
          maxImageCount: 1,
          cropEnabled: false,
        },
      },
    ],
    ...overrides,
  };
}

function configuration(intent = replacement(), overrides = {}) {
  return {
    productId: intent.productId,
    configurationRevision: nextRevision,
    fields: [
      {
        id: "field-name",
        productId: intent.productId,
        code: "name",
        label: "Name",
        kind: "short_text",
        required: true,
        isActive: true,
        position: 0,
        configurationRevision: nextRevision,
        constraints: { maxLength: 100 },
      },
      {
        id: "field-photo",
        productId: intent.productId,
        code: "photo",
        label: "Photo",
        kind: "image",
        required: true,
        isActive: true,
        position: 1,
        configurationRevision: nextRevision,
        constraints: {
          allowedMimeTypes: ["image/jpeg", "image/png"],
          maxBytes: 2_000_000,
          minDimensions: { width: 800, height: 600 },
          minImageCount: 1,
          maxImageCount: 1,
          cropEnabled: false,
        },
      },
    ],
    ...overrides,
  };
}

function rpcClient(result) {
  const calls = [];
  return {
    calls,
    async publishCustomizationConfiguration(arguments_) {
      calls.push(arguments_);
      return result;
    },
  };
}

test("writer performs exactly one approved RPC call with the complete parsed replacement", async () => {
  const intent = replacement();
  const client = rpcClient({
    data: {
      result_status: "applied",
      product_id: productId,
      configuration_revision_id: nextRevision,
      configuration: configuration(intent),
      new_field_id_mappings: [{ draftId: "new:photo", stableFieldId: "field-photo" }],
      safe_issues: null,
    },
    error: null,
  });

  const result = await new SupabaseCustomizationConfigurationWriter(client)
    .publishCustomizationConfiguration(intent);

  assert.deepEqual(client.calls, [{
    p_product_id: productId,
    p_expected_current_revision_id: revision,
    p_fields: intent.fields,
  }]);
  assert.equal(result.status, "applied");
  assert.equal(result.value.configurationRevision, nextRevision);
  assert.deepEqual(result.newFieldIdMappings, [{ draftId: "new:photo", stableFieldId: "field-photo" }]);
  assert.equal(result.value.fields[1].id, "field-photo");
});

test("writer maps only the bounded atomic outcomes and never exposes provider errors", async () => {
  for (const [provider, expected] of [
    [
      { data: { result_status: "not_found", product_id: productId }, error: null },
      { status: "not_found" },
    ],
    [
      { data: { result_status: "stale_revision", product_id: productId }, error: null },
      { status: "stale_revision" },
    ],
    [
      {
        data: {
          result_status: "invalid_configuration",
          safe_issues: [{ path: "$.fields", code: "incomplete", message: "Existing fields must be retained." }],
        },
        error: null,
      },
      { status: "invalid_configuration" },
    ],
    [
      { data: null, error: { message: "secret provider detail", hint: "secret" } },
      { status: "source_failure" },
    ],
    [
      { data: { result_status: "source_failure" }, error: null },
      { status: "source_failure" },
    ],
  ]) {
    const result = await new SupabaseCustomizationConfigurationWriter(rpcClient(provider))
      .publishCustomizationConfiguration(replacement());
    assert.equal(result.status, expected.status);
    assert.doesNotMatch(JSON.stringify(result), /secret provider detail|hint|sqlstate|constraint/i);
  }
});

test("writer rejects malformed applied rows, unsafe issues, and incomplete or corrupt new-field mappings", async () => {
  const intent = replacement();
  const valid = {
    result_status: "applied",
    product_id: productId,
    configuration_revision_id: nextRevision,
    configuration: configuration(intent),
    new_field_id_mappings: [{ draftId: "new:photo", stableFieldId: "field-photo" }],
    safe_issues: null,
  };
  const malformed = [
    { ...valid, product_id: "product-other" },
    { ...valid, configuration_revision_id: "revision-other" },
    { ...valid, configuration: configuration(intent, { fields: configuration(intent).fields.slice(0, 1) }) },
    { ...valid, new_field_id_mappings: [] },
    { ...valid, new_field_id_mappings: [{ draftId: "new:unknown", stableFieldId: "field-photo" }] },
    { ...valid, new_field_id_mappings: [{ draftId: "new:photo", stableFieldId: "field-name" }] },
    { result_status: "invalid_configuration", safe_issues: [{ path: "$.fields", code: "not-approved", message: "raw provider detail" }] },
  ];

  for (const data of malformed) {
    const result = await new SupabaseCustomizationConfigurationWriter(rpcClient({ data, error: null }))
      .publishCustomizationConfiguration(intent);
    assert.deepEqual(result, {
      status: "source_failure",
      operation: "admin_customization_field_command",
    });
  }
});

test("new-field mappings remain request-correlated and no application UUID is allocated", async () => {
  const intent = replacement({
    fields: [
      replacement().fields[1],
      replacement().fields[0],
    ].map((field, index) => ({ ...field, position: index })),
  });
  const response = configuration(intent, {
    fields: [
      { ...configuration().fields[1], position: 0 },
      { ...configuration().fields[0], position: 1 },
    ],
  });
  const result = await new SupabaseCustomizationConfigurationWriter(rpcClient({
    data: {
      result_status: "applied",
      product_id: productId,
      configuration_revision_id: nextRevision,
      configuration: response,
      new_field_id_mappings: [{ draftId: "new:photo", stableFieldId: "field-photo" }],
      safe_issues: null,
    },
    error: null,
  })).publishCustomizationConfiguration(intent);

  assert.equal(result.status, "applied");
  assert.deepEqual(result.newFieldIdMappings, [{ draftId: "new:photo", stableFieldId: "field-photo" }]);
  const source = await readFile(
    new URL("../app/infrastructure/customization/supabase-customization-configuration-writer.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /randomUUID|crypto\.randomUUID|gen_random_uuid|uuidv[0-9]/i);
  assert.doesNotMatch(source, /\.from\(|\.insert\(|\.update\(|\.delete\(/i);
  assert.match(source, new RegExp(PUBLISH_CUSTOMIZATION_CONFIGURATION_RPC));
});

test("writer remains an offline injected capability with no network call", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("network must not be used"); };
  try {
    const result = await new SupabaseCustomizationConfigurationWriter(rpcClient({
      data: { result_status: "not_found", product_id: productId },
      error: null,
    })).publishCustomizationConfiguration(replacement());
    assert.deepEqual(result, { status: "not_found" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
