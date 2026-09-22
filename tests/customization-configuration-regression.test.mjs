import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

import {
  AdminCustomizationFieldCommandBoundary,
  AdminCustomizationFieldQueryBoundary,
  parseReplaceCustomizationConfigurationIntent,
} from "../app/application/admin-customization-field-boundary.ts";
import { loadPublicProductDetailWithCustomization } from "../app/application/customization-product-detail.ts";
import { FixtureCustomizationFieldRepository } from "../app/infrastructure/customization/development-customization-field-repository.ts";
import { createDevelopmentCustomizationFieldFixtures } from "../app/infrastructure/customization/development-customization-field-fixtures.ts";
import {
  createProductionCustomizationFieldRepository,
  createServerCustomizationFieldRepository,
} from "../app/infrastructure/customization/server-customization-field-repository.ts";
import { SupabaseCustomizationFieldRepository } from "../app/infrastructure/customization/supabase-customization-field-repository.ts";

const productId = "product-frame";
const otherProductId = "product-other";
const revision = "revision-current";
const principal = { role: "admin", identity: "configured-admin" };
const authorized = { async verifyAdminSession() { return { status: "authorized", principal }; } };
const unauthorized = { async verifyAdminSession() { return { status: "unauthorized" }; } };

function textDefinition(overrides = {}) {
  return {
    configuration_revision_id: revision,
    product_id: productId,
    stable_field_id: "field-name",
    label: "Name",
    kind: "short_text",
    required: true,
    is_active: true,
    position: 0,
    max_length: 80,
    help_text: "Development-safe label.",
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
    configuration_revision_id: revision,
    product_id: productId,
    stable_field_id: "field-image",
    label: "Image",
    kind: "image",
    required: false,
    is_active: true,
    position: 1,
    max_length: null,
    help_text: null,
    allowed_mime_types: ["image/jpeg", "image/png", "image/webp"],
    max_bytes: 2_000_000,
    min_width: 800,
    min_height: 600,
    recommended_width: 1200,
    recommended_height: 900,
    min_image_count: 0,
    max_image_count: 2,
    crop_enabled: true,
    ...overrides,
  };
}

function tableReader(options = {}) {
  return {
    async readCurrentConfigurations() {
      return options.current ?? { data: [{ id: revision, product_id: productId, is_current: true, superseded_at: null }], error: null };
    },
    async readActiveFieldDefinitions() {
      return options.definitions ?? { data: [imageDefinition(), textDefinition()], error: null };
    },
    async readFieldIdentities() {
      return options.identities ?? {
        data: [
          { id: "field-name", product_id: productId, code: "name" },
          { id: "field-image", product_id: productId, code: "image" },
        ],
        error: null,
      };
    },
  };
}

function adminField(overrides = {}) {
  return {
    identity: { kind: "existing", id: "field-name", code: "name" },
    label: "Name",
    kind: "short_text",
    required: true,
    isActive: true,
    position: 0,
    constraints: { maxLength: 80, helpText: "Development-safe label." },
    ...overrides,
  };
}

function adminIntent(overrides = {}) {
  return { productId, expectedCurrentRevision: revision, fields: [adminField()], ...overrides };
}

function currentConfiguration(overrides = {}) {
  return {
    productId,
    configurationRevision: revision,
    fields: [{
      id: "field-name", productId, code: "name", label: "Name", kind: "short_text",
      required: true, isActive: true, position: 0, configurationRevision: revision,
      constraints: { maxLength: 80, helpText: "Development-safe label." },
    }],
    ...overrides,
  };
}

function adminRepositories(options = {}) {
  const calls = { factory: 0, reads: 0, identityReads: 0, writes: 0, intent: null };
  const repositories = {
    reader: {
      async getCurrentConfigurationForAdmin() {
        calls.reads += 1;
        return options.current ?? { status: "found", value: currentConfiguration() };
      },
      async getStableFieldIdentitiesForAdmin(_requestedProductId, ids) {
        calls.identityReads += 1;
        return options.identities ?? {
          status: "found",
          value: ids.map((id) => ({ id, productId, code: id === "field-name" ? "name" : "other" })),
        };
      },
    },
    writer: {
      async publishCustomizationConfiguration(value) {
        calls.writes += 1;
        calls.intent = value;
        return options.write ?? {
          status: "applied",
          value: currentConfiguration({ configurationRevision: "revision-next" }),
          newFieldIdMappings: [],
        };
      },
    },
  };
  return { calls, repositories };
}

test("public Supabase-shaped repository normalizes only active definitions and fails closed on current/identity/constraint integrity", async () => {
  const good = await new SupabaseCustomizationFieldRepository(tableReader()).getCustomizationFieldsForProduct(productId);
  assert.equal(good.status, "found");
  assert.deepEqual(good.value.fields.map((field) => [field.id, field.position]), [["field-name", 0], ["field-image", 1]]);
  assert.equal(good.value.fields[0].id, "field-name");
  assert.equal(good.value.fields.some((field) => field.id === "definition-row-name"), false);

  const cases = [
    tableReader({ current: { data: [], error: null } }),
    tableReader({ current: { data: [{ id: revision, product_id: productId, is_current: true, superseded_at: null }, { id: "revision-duplicate", product_id: productId, is_current: true, superseded_at: null }], error: null } }),
    tableReader({ definitions: { data: [textDefinition({ is_active: false })], error: null }, identities: { data: [{ id: "field-name", product_id: productId, code: "name" }], error: null } }),
    tableReader({ definitions: { data: [textDefinition({ stable_field_id: "field-a" }), textDefinition({ stable_field_id: "field-b", position: 1 })], error: null }, identities: { data: [{ id: "field-a", product_id: productId, code: "same" }, { id: "field-b", product_id: productId, code: "same" }], error: null } }),
    tableReader({ definitions: { data: [textDefinition(), imageDefinition({ position: 0 })], error: null } }),
    tableReader({ definitions: { data: [textDefinition({ product_id: otherProductId })], error: null }, identities: { data: [{ id: "field-name", product_id: productId, code: "name" }], error: null } }),
    tableReader({ definitions: { data: [textDefinition({ configuration_revision_id: "revision-other" })], error: null }, identities: { data: [{ id: "field-name", product_id: productId, code: "name" }], error: null } }),
    tableReader({ definitions: { data: [textDefinition({ max_length: 0 })], error: null }, identities: { data: [{ id: "field-name", product_id: productId, code: "name" }], error: null } }),
    tableReader({ definitions: { data: [imageDefinition({ allowed_mime_types: ["image/gif"] })], error: null }, identities: { data: [{ id: "field-image", product_id: productId, code: "image" }], error: null } }),
  ];
  assert.equal((await new SupabaseCustomizationFieldRepository(cases[0]).getCustomizationFieldsForProduct(productId)).status, "not_found");
  for (const reader of cases.slice(1)) {
    assert.equal((await new SupabaseCustomizationFieldRepository(reader).getCustomizationFieldsForProduct(productId)).status, "invalid_configuration");
  }

  const unavailable = await new SupabaseCustomizationFieldRepository(tableReader({
    current: { data: null, error: { message: "POSTGREST_SECRET SQLSTATE 42P01 public.customization_fields" } },
  })).getCustomizationFieldsForProduct(productId);
  assert.deepEqual(unavailable, { status: "source_failure", operation: "customization_field_configuration.read" });
  assert.doesNotMatch(JSON.stringify(unavailable), /POSTGREST_SECRET|SQLSTATE|customization_fields/i);

  const source = await readFile(new URL("../app/infrastructure/customization/supabase-customization-field-repository.ts", import.meta.url), "utf8");
  assert.match(source, /\.eq\("is_active", true\)/);
});

test("public detail composes catalog first and preserves sibling catalog authority", async () => {
  const catalog = {
    calls: 0,
    async findPublicProductBySlug() {
      this.calls += 1;
      return {
        status: "found",
        value: {
          product: { id: productId },
          variants: [{ id: "variant-small", skuCode: "FRAME-SMALL", priceCents: 5990, currency: "USD" }],
          options: [{ id: "option-size" }],
          fulfillment: { requiresShipping: true },
          assets: [{ id: "asset-marketing" }],
        },
      };
    },
  };
  const customization = {
    calls: [],
    async getCustomizationFieldsForProduct(id) {
      this.calls.push(id);
      return { status: "found", value: currentConfiguration() };
    },
  };
  const configured = await loadPublicProductDetailWithCustomization(catalog, customization, "frame");
  assert.equal(configured.status, "found");
  assert.equal(configured.value.customization.status, "configured");
  assert.deepEqual(customization.calls, [productId]);
  assert.deepEqual(configured.value.catalog.variants[0], { id: "variant-small", skuCode: "FRAME-SMALL", priceCents: 5990, currency: "USD" });
  assert.deepEqual(configured.value.catalog.options, [{ id: "option-size" }]);
  assert.deepEqual(configured.value.catalog.fulfillment, { requiresShipping: true });
  assert.deepEqual(configured.value.catalog.assets, [{ id: "asset-marketing" }]);

  for (const result of [
    { status: "not_found" },
    { status: "found", value: { productId, configurationRevision: revision, fields: [] } },
    { status: "invalid_configuration", issues: [{ path: "$.fields", code: "duplicate", message: "Invalid." }] },
    { status: "source_failure", operation: "customization_field_configuration.read" },
  ]) {
    const composed = await loadPublicProductDetailWithCustomization(catalog, { async getCustomizationFieldsForProduct() { return result; } }, "frame");
    assert.equal(composed.status, result.status === "not_found" ? "found" : result.status);
  }

  const catalogFailure = { async findPublicProductBySlug() { return { status: "not_found" }; } };
  let customizationCalls = 0;
  assert.deepEqual(
    await loadPublicProductDetailWithCustomization(catalogFailure, { async getCustomizationFieldsForProduct() { customizationCalls += 1; return { status: "not_found" }; } }, "missing"),
    { status: "not_found" },
  );
  assert.equal(customizationCalls, 0);
});

test("admin boundary rejects before privilege, keeps validation strict, and delegates one complete replacement only after authorization", async () => {
  let factories = 0;
  const query = new AdminCustomizationFieldQueryBoundary(unauthorized, () => { factories += 1; throw new Error("must not construct"); });
  const command = new AdminCustomizationFieldCommandBoundary(unauthorized, () => { factories += 1; throw new Error("must not construct"); });
  assert.deepEqual(await query.execute({ productId }), { status: "unauthorized" });
  assert.deepEqual(await command.execute(adminIntent()), { status: "unauthorized" });
  assert.equal(factories, 0);

  const failingVerifier = { async verifyAdminSession() { throw new Error("raw auth fault"); } };
  assert.deepEqual(await new AdminCustomizationFieldCommandBoundary(failingVerifier, () => { factories += 1; throw new Error("must not construct"); }).execute(adminIntent()), { status: "authentication_failure" });
  assert.equal(factories, 0);

  const invalidRequests = [
    adminIntent({ fields: [adminField(), adminField({ identity: { kind: "new", draftId: "new:duplicate-code", code: "name" }, position: 1 })] }),
    adminIntent({ fields: [adminField(), adminField({ identity: { kind: "new", draftId: "new:duplicate-position", code: "other" } })] }),
    adminIntent({ fields: [adminField(), adminField({ identity: { kind: "existing", id: "field-name", code: "name" }, position: 1 })] }),
    adminIntent({ fields: [
      adminField({ identity: { kind: "new", draftId: "new:duplicate", code: "new-one" } }),
      adminField({ identity: { kind: "new", draftId: "new:duplicate", code: "new-two" }, position: 1 }),
    ] }),
    adminIntent({ fields: [adminField({ constraints: { maxLength: 0 } })] }),
    adminIntent({ fields: [adminField({ constraints: { maxLength: 10, other: true } })] }),
    adminIntent({ fields: [adminField({ constraints: { maxLength: 10, helpText: " " } })] }),
    adminIntent({ fields: [adminField({ kind: "image", constraints: { allowedMimeTypes: ["image/gif", "image/gif"], maxBytes: 0, minDimensions: { width: 0, height: 1 }, recommendedDimensions: { width: 1, height: 1 }, minImageCount: 2, maxImageCount: 1, cropEnabled: "yes", extra: true } })] }),
  ];
  for (const value of invalidRequests) assert.equal(parseReplaceCustomizationConfigurationIntent(value).ok, false);

  const source = adminRepositories();
  const result = await new AdminCustomizationFieldCommandBoundary(authorized, () => { source.calls.factory += 1; return source.repositories; }).execute(adminIntent());
  assert.equal(result.status, "applied");
  assert.equal(source.calls.factory, 1);
  assert.equal(source.calls.writes, 1);
  assert.deepEqual(source.calls.intent, parseReplaceCustomizationConfigurationIntent(adminIntent()).value);
});

test("admin stable identity and revision failures reject safely without retry or partial application", async () => {
  const identityCases = [
    { value: [], code: "missing" },
    { value: [{ id: "field-name", productId: otherProductId, code: "name" }], code: "cross-product" },
    { value: [{ id: "field-name", productId, code: "renamed" }], code: "immutable" },
  ];
  for (const expected of identityCases) {
    const source = adminRepositories({ identities: { status: "found", value: expected.value } });
    const result = await new AdminCustomizationFieldCommandBoundary(authorized, () => source.repositories).execute(adminIntent());
    assert.equal(result.status, "invalid_request", expected.code);
    assert.equal(source.calls.writes, 0, expected.code);
  }

  const stale = adminRepositories();
  assert.deepEqual(
    await new AdminCustomizationFieldCommandBoundary(authorized, () => stale.repositories).execute(adminIntent({ expectedCurrentRevision: "revision-stale" })),
    { status: "stale_revision" },
  );
  assert.equal(stale.calls.writes, 0);

  const atomicStale = adminRepositories({ write: { status: "stale_revision" } });
  assert.deepEqual(
    await new AdminCustomizationFieldCommandBoundary(authorized, () => atomicStale.repositories).execute(adminIntent()),
    { status: "stale_revision" },
  );
  assert.equal(atomicStale.calls.writes, 1);

  const historicalCollision = adminRepositories({
    write: { status: "invalid_configuration", issues: [{ path: "$.fields[0].identity.code", code: "duplicate", message: "Historical code collision." }] },
  });
  const collision = await new AdminCustomizationFieldCommandBoundary(authorized, () => historicalCollision.repositories).execute(
    adminIntent({ fields: [adminField({ identity: { kind: "new", draftId: "new:historical-code", code: "retired-name" } })] }),
  );
  assert.equal(collision.status, "invalid_configuration");
  assert.equal(historicalCollision.calls.writes, 1);
  assert.doesNotMatch(JSON.stringify(collision), /raw provider|sqlstate|secret/i);
});

test("fixture source selection is explicit, deterministic, isolated, and production application code never directly constructs it", async () => {
  let productionFactoryCalls = 0;
  const fixture = createServerCustomizationFieldRepository(
    { NODE_ENV: "test", PHOTOGIFT_PRODUCT_SOURCE: "fixture" },
    undefined,
    () => { productionFactoryCalls += 1; throw new Error("must not construct"); },
  );
  assert.equal(fixture.source, "fixture");
  assert.ok(fixture.repository instanceof FixtureCustomizationFieldRepository);
  assert.equal(productionFactoryCalls, 0);
  const first = await fixture.repository.getCustomizationFieldsForProduct("fixture-product-couple-figure");
  const second = await fixture.repository.getCustomizationFieldsForProduct("fixture-product-couple-figure");
  assert.deepEqual(second, first);
  assert.deepEqual(await fixture.repository.getCustomizationFieldsForProduct("fixture-product-pet-figure"), { status: "not_found" });
  assert.equal((await fixture.repository.getCustomizationFieldsForProduct("fixture-product-digital-portrait")).status, "found");
  assert.equal((await fixture.repository.getCustomizationFieldsForProduct("fixture-product-couple-figure")).status, "found");

  for (const result of [
    { status: "not_found" },
    { status: "invalid_configuration", issues: [] },
    { status: "source_failure", operation: "customization_field_configuration.read" },
  ]) {
    const production = createProductionCustomizationFieldRepository(
      () => ({ async getCustomizationFieldsForProduct() { return result; } }),
    );
    assert.equal(production.source, "supabase");
    assert.equal(production.repository instanceof FixtureCustomizationFieldRepository, false);
    assert.deepEqual(await production.repository.getCustomizationFieldsForProduct(productId), result);
  }
  assert.throws(
    () => createServerCustomizationFieldRepository({ NODE_ENV: "development", PHOTOGIFT_PRODUCT_SOURCE: "fixture" }, "production"),
    /Catalog source is unavailable until provider activation is authorized/,
  );

  const fields = createDevelopmentCustomizationFieldFixtures().flatMap((configuration) => configuration.fields);
  assert.equal(new Set(fields.map((field) => field.id)).size, fields.length);
  assert.equal(new Set(fields.map((field) => field.configurationRevision)).size, 3);
  assert.doesNotMatch(JSON.stringify(createDevelopmentCustomizationFieldFixtures()), /receiptId|ownerBinding|draft(?:Id|Value)?|bucket|object(?:Key|Locator)?|storage|preview|signed|orderId|customer(?:Id|Filename|Text|Value)?/i);

  const entries = await readdir(new URL("../app", import.meta.url), { recursive: true });
  const productionSources = await Promise.all(entries
    .filter((entry) => /\.(?:ts|tsx)$/.test(entry))
    .filter((entry) => !entry.includes("development-customization-field-repository"))
    .map(async (entry) => readFile(new URL(`../app/${entry}`, import.meta.url), "utf8")));
  assert.doesNotMatch(productionSources.join("\n"), /new\s+FixtureCustomizationFieldRepository\s*\(/);
});

test("Task 4.x configuration boundaries stay offline and do not drift into upload, ProductAsset, Variant, pricing, or legacy authority", async () => {
  const paths = [
    "../app/application/customization-field-repository.ts",
    "../app/application/customization-product-detail.ts",
    "../app/application/admin-customization-field-boundary.ts",
    "../app/infrastructure/customization/supabase-customization-field-mapper.ts",
    "../app/infrastructure/customization/supabase-customization-field-repository.ts",
    "../app/infrastructure/customization/server-customization-field-repository.ts",
    "../app/infrastructure/customization/development-customization-field-fixtures.ts",
    "../app/infrastructure/customization/development-customization-field-repository.ts",
  ];
  const source = (await Promise.all(paths.map((path) => readFile(new URL(path, import.meta.url), "utf8")))).join("\n");
  assert.doesNotMatch(source, /customization_drafts|customization_draft_values|customer_upload_receipts|customization_value_images|CustomerUploadRepository|object store|preview service|receipt lifecycle/i);
  assert.doesNotMatch(source, /customization_schema|seed\.sql|seed example|ProductAsset|product_assets/i);
  const adminBoundary = await readFile(new URL("../app/application/admin-customization-field-boundary.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source.replace(adminBoundary, ""), /product_variants|product_options|skuCode|variantId|optionId|priceCents|currency|surcharge|weightGrams|leadTime|fulfillment/i);
  assert.doesNotMatch(adminBoundary, /product_variants|product_options|skuCode|variantId|optionId|priceCents|weightGrams|leadTime|fulfillment/i);
  assert.match(adminBoundary, /surchargeRules/);
  assert.doesNotMatch(source, /fetch\s*\(/i);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("network must not be used"); };
  try {
    assert.equal((await new SupabaseCustomizationFieldRepository(tableReader()).getCustomizationFieldsForProduct(productId)).status, "found");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
