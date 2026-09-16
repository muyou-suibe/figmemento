import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { AdminCatalogQueryBoundary } from "../app/application/admin-catalog-boundary.ts";
import { AdminProductFulfillmentBoundary } from "../app/application/admin-product-fulfillment.ts";
import { deriveCatalogDraftUuid } from "../app/application/catalog-draft-identity.ts";
import { isIdentifier } from "../app/domain/catalog/index.ts";
import { createDevelopmentCatalogFixtures } from "../app/infrastructure/catalog/development-catalog-fixtures.ts";
import { SupabaseProductFulfillmentRepository } from "../app/infrastructure/catalog/supabase-product-fulfillment-repository.ts";
import { handleAdminProductFulfillmentMutation } from "../app/server/admin-product-fulfillment-http.server.ts";

const authorized = {
  async verifyAdminSession() {
    return { status: "authorized", principal: { role: "admin", identity: "configured-admin" } };
  },
};
const unauthorized = { async verifyAdminSession() { return { status: "unauthorized" }; } };

function fixtures() {
  return structuredClone(createDevelopmentCatalogFixtures());
}

function withoutProductConfig(dataSet, productId = dataSet.products[0].id) {
  return {
    ...dataSet,
    fulfillmentConfigs: dataSet.fulfillmentConfigs.filter((config) => config.productId !== productId),
  };
}

function createIntent(dataSet = fixtures(), overrides = {}) {
  const productId = overrides.productId ?? dataSet.products[0].id;
  return {
    operation: "create",
    productId,
    config: {
      id: "new:fulfillment-config",
      productId,
      fulfillmentType: "physical",
      requiresShipping: true,
      productionMode: "custom_manufacturing",
      leadTime: { minBusinessDays: 2, maxBusinessDays: 5 },
      ...overrides.config,
    },
    ...overrides.command,
  };
}

function updateIntent(config, patch = {}) {
  const updated = { ...config, ...patch };
  return { operation: "update", productId: updated.productId, config: updated };
}

function repositories(dataSet = fixtures(), resultOverride) {
  const calls = { reads: 0, creates: [], updates: [] };
  const result = (value) => resultOverride ?? { status: "applied", value };
  return {
    calls,
    reader: {
      async readAdminCatalogGraph() {
        calls.reads += 1;
        return { status: "found", value: dataSet };
      },
    },
    writer: {
      async createProductFulfillmentConfig(config) {
        calls.creates.push(config);
        return result(config);
      },
      async updateProductFulfillmentConfig(config) {
        calls.updates.push(config);
        return result(config);
      },
    },
  };
}

function request(body, origin = "https://photogift.test") {
  return new Request("https://photogift.test/api/admin/catalog/products/product/fulfillment", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
      "sec-fetch-site": origin === "https://photogift.test" ? "same-origin" : "cross-site",
    },
    body: JSON.stringify(body),
  });
}

function rowFor(config) {
  return {
    id: config.id,
    product_id: config.productId,
    fulfillment_type: config.fulfillmentType,
    requires_shipping: config.requiresShipping,
    production_mode: config.productionMode,
    min_lead_time_business_days: config.leadTime.minBusinessDays,
    max_lead_time_business_days: config.leadTime.maxBusinessDays,
  };
}

test("1: unauthorized FulfillmentConfig read and mutation create no privileged dependency", async () => {
  let readFactories = 0;
  const read = await new AdminCatalogQueryBoundary(unauthorized, () => {
    readFactories += 1;
    throw new Error("must not create reader");
  }).execute({});
  assert.equal(read.status, "unauthorized");
  assert.equal(readFactories, 0);

  const intent = createIntent();
  let writeFactories = 0;
  const response = await handleAdminProductFulfillmentMutation(
    request(intent, "https://attacker.test"),
    intent.productId,
    {
      verifier: unauthorized,
      createRepositories() {
        writeFactories += 1;
        throw new Error("must not create writer");
      },
    },
  );
  assert.equal(response.status, 401);
  assert.equal(writeFactories, 0);
});

test("2-3: cross-origin and unknown or supply-method fields stop before writer creation", async () => {
  const base = createIntent();
  for (const [candidate, origin, status] of [
    [base, "https://attacker.test", 403],
    [{ ...base, arbitraryFilter: "product_id=all" }, "https://photogift.test", 400],
    [{ ...base, config: { ...base.config, supplyMethod: "made_to_order" } }, "https://photogift.test", 400],
    [{ ...base, config: { ...base.config, supplierId: "supplier" } }, "https://photogift.test", 400],
  ]) {
    let factories = 0;
    const response = await handleAdminProductFulfillmentMutation(request(candidate, origin), base.productId, {
      verifier: authorized,
      createRepositories() {
        factories += 1;
        throw new Error("must not create writer");
      },
    });
    assert.equal(response.status, status);
    assert.equal(factories, 0);
  }
});

test("4-9, 12: approved physical/digital combinations and zero-day range are preserved exactly", async () => {
  const baseData = fixtures();
  const productId = baseData.products[0].id;
  const cases = [
    createIntent(baseData),
    createIntent(baseData, { config: { id: "new:digital", fulfillmentType: "digital", requiresShipping: false, productionMode: "digital_creation" } }),
    createIntent(baseData, { config: { id: "new:physical-no-shipping", fulfillmentType: "physical", requiresShipping: false } }),
    createIntent(baseData, { config: { id: "new:physical-digital-creation", fulfillmentType: "physical", requiresShipping: false, productionMode: "digital_creation" } }),
    createIntent(baseData, { config: { id: "new:digital-custom", fulfillmentType: "digital", requiresShipping: false, productionMode: "custom_manufacturing" } }),
    createIntent(baseData, { config: { id: "new:zero", leadTime: { minBusinessDays: 0, maxBusinessDays: 0 } } }),
  ];
  for (const intent of cases) {
    const dataSet = withoutProductConfig(fixtures(), productId);
    const repos = repositories(dataSet);
    const result = await new AdminProductFulfillmentBoundary(authorized, () => repos).execute(productId, intent);
    assert.equal(result.status, "applied");
    assert.equal(isIdentifier(result.value.id), true);
    assert.equal(result.value.id.startsWith("new:"), false);
    assert.equal(repos.calls.creates.length, 1);
    assert.equal(repos.calls.updates.length, 0);
  }
});

test("6, 10-11: digital shipping and invalid lead-time ranges are rejected before persistence", async () => {
  const base = createIntent();
  const invalidConfigs = [
    { ...base.config, fulfillmentType: "digital", requiresShipping: true },
    { ...base.config, leadTime: { minBusinessDays: -1, maxBusinessDays: 2 } },
    { ...base.config, leadTime: { minBusinessDays: 5, maxBusinessDays: 4 } },
  ];
  for (const config of invalidConfigs) {
    let factories = 0;
    const result = await new AdminProductFulfillmentBoundary(authorized, () => {
      factories += 1;
      throw new Error("must not create repositories");
    }).execute(base.productId, { ...base, config });
    assert.equal(result.status, "invalid_request");
    assert.equal(factories, 0);
  }
});

test("13-15, 19-22: update preserves identities and leaves Product, Variant, and Asset state unchanged", async () => {
  const dataSet = fixtures();
  const config = dataSet.fulfillmentConfigs[0];
  const beforeProducts = structuredClone(dataSet.products);
  const beforeVariants = structuredClone(dataSet.variants);
  const beforeAssets = structuredClone(dataSet.assets);
  let derivations = 0;
  const repos = repositories(dataSet);
  const result = await new AdminProductFulfillmentBoundary(authorized, () => repos, () => {
    derivations += 1;
    throw new Error("existing config must not be rederived");
  }).execute(config.productId, updateIntent(config, {
    requiresShipping: false,
    leadTime: { minBusinessDays: 0, maxBusinessDays: 7 },
  }));
  assert.equal(result.status, "applied");
  assert.equal(result.value.id, config.id);
  assert.equal(result.value.productId, config.productId);
  assert.equal(derivations, 0);
  assert.equal(repos.calls.updates.length, 1);
  assert.deepEqual(dataSet.products, beforeProducts);
  assert.deepEqual(dataSet.variants, beforeVariants);
  assert.deepEqual(dataSet.assets, beforeAssets);

  const other = dataSet.fulfillmentConfigs[1];
  const tampered = updateIntent({ ...config, id: other.id, productId: config.productId });
  const crossRepositories = repositories(dataSet);
  const cross = await new AdminProductFulfillmentBoundary(authorized, () => crossRepositories).execute(config.productId, tampered);
  assert.equal(cross.status, "invalid_request");
  assert.equal(crossRepositories.calls.updates.length, 0);
});

test("16-18: one-config invariant and ambiguous-commit retry are safe and deterministic", async () => {
  const initial = fixtures();
  const productId = initial.products[0].id;
  const conflictRepositories = repositories(initial);
  const conflict = await new AdminProductFulfillmentBoundary(authorized, () => conflictRepositories).execute(
    productId,
    createIntent(initial, { config: { id: "new:different-create" } }),
  );
  assert.equal(conflict.status, "invalid_request");
  assert.equal(conflictRepositories.calls.creates.length, 0);

  const without = withoutProductConfig(initial, productId);
  const intent = createIntent(without, { config: { id: "new:retry-safe" } });
  const firstRepositories = repositories(without);
  const first = await new AdminProductFulfillmentBoundary(authorized, () => firstRepositories).execute(productId, intent);
  assert.equal(first.status, "applied");
  const committed = { ...without, fulfillmentConfigs: [...without.fulfillmentConfigs, first.value] };
  const retryRepositories = repositories(committed);
  const retry = await new AdminProductFulfillmentBoundary(authorized, () => retryRepositories).execute(
    productId,
    structuredClone(intent),
  );
  assert.equal(retry.status, "applied");
  assert.equal(retry.value.id, first.value.id);
  assert.equal(retryRepositories.calls.creates.length, 0);
  assert.equal(committed.fulfillmentConfigs.filter((candidate) => candidate.productId === productId).length, 1);
  assert.notEqual(
    await deriveCatalogDraftUuid(productId, "fulfillment", intent.config.id),
    await deriveCatalogDraftUuid(initial.products[1].id, "fulfillment", intent.config.id),
  );
});

test("23-25: Supabase adapter uses allowlisted columns and safe error mapping", async () => {
  const config = fixtures().fulfillmentConfigs[0];
  const calls = [];
  const writer = {
    async insertConfig(columns) {
      calls.push({ operation: "insert", columns });
      return { data: rowFor({ ...config, id: columns.id }), error: null };
    },
    async updateConfig(id, productId, columns) {
      calls.push({ operation: "update", id, productId, columns });
      return { data: { id, product_id: productId, ...columns }, error: null };
    },
  };
  const repository = new SupabaseProductFulfillmentRepository(writer);
  const created = { ...config, id: "11111111-1111-5111-8111-111111111111" };
  assert.equal((await repository.createProductFulfillmentConfig(created)).status, "applied");
  assert.equal((await repository.updateProductFulfillmentConfig(config)).status, "applied");
  assert.deepEqual(calls.map((call) => call.operation), ["insert", "update"]);
  assert.deepEqual(Object.keys(calls[0].columns).sort(), [
    "fulfillment_type", "id", "max_lead_time_business_days", "min_lead_time_business_days",
    "product_id", "production_mode", "requires_shipping",
  ]);
  assert.equal("id" in calls[1].columns, false);
  assert.equal("product_id" in calls[1].columns, false);
  assert.equal("supply_method" in calls[1].columns, false);

  for (const [error, expected] of [
    [{ code: "23505", detail: "product_fulfillment_configs_product_key" }, "invalid_configuration"],
    [{ code: "23503", hint: "products FK" }, "invalid_configuration"],
    [{ code: "XX000", message: "password=secret", detail: "raw SQL" }, "source_failure"],
  ]) {
    const failing = new SupabaseProductFulfillmentRepository({
      async insertConfig() { return { data: null, error }; },
      async updateConfig() { return { data: null, error }; },
    });
    const result = await failing.createProductFulfillmentConfig(created);
    assert.equal(result.status, expected);
    assert.equal(JSON.stringify(result).includes("password"), false);
    assert.equal(JSON.stringify(result).includes("product_fulfillment_configs_product_key"), false);
    assert.equal(JSON.stringify(result).includes("raw SQL"), false);
  }
});

test("26: complete CatalogDataSet validation rejects unrelated invalid graph before write", async () => {
  const dataSet = fixtures();
  dataSet.variants[1] = { ...dataSet.variants[1], skuCode: dataSet.variants[0].skuCode };
  const config = dataSet.fulfillmentConfigs[0];
  const repos = repositories(dataSet);
  const result = await new AdminProductFulfillmentBoundary(authorized, () => repos).execute(
    config.productId,
    updateIntent(config, { leadTime: { minBusinessDays: 1, maxBusinessDays: 2 } }),
  );
  assert.equal(result.status, "invalid_request");
  assert.equal(repos.calls.updates.length, 0);
});

test("27: route and UI contain no defaults, deletion, supply method, migration, or out-of-scope writes", async () => {
  const route = await readFile(new URL("../app/api/admin/catalog/products/[id]/fulfillment/route.ts", import.meta.url), "utf8");
  const boundary = await readFile(new URL("../app/application/admin-product-fulfillment.ts", import.meta.url), "utf8");
  const adapter = await readFile(new URL("../app/infrastructure/catalog/supabase-product-fulfillment-repository.ts", import.meta.url), "utf8");
  const ui = await readFile(new URL("../app/admin/products/AdminProductFulfillmentEditor.tsx", import.meta.url), "utf8");
  assert.equal(route.includes("export async function POST"), true);
  assert.equal(route.includes("export async function GET"), false);
  assert.equal(adapter.includes('.from("product_fulfillment_configs")'), true);
  assert.equal(adapter.includes("deleteConfig"), false);
  assert.equal(boundary.includes("remove"), false);
  assert.equal(ui.includes("Create fulfillment configuration"), true);
  assert.equal(ui.includes('initialConfig?.fulfillmentType ?? ""'), true);
  assert.equal(ui.includes("development-catalog-fixtures"), false);
  assert.equal(ui.includes("supplyMethod"), false);
  assert.equal(ui.includes("international transit"), true);
  for (const forbidden of ["products\")", "product_variants", "product_assets", "catalog_audit_events", "save_product_sku_graph"]) {
    assert.equal(adapter.includes(forbidden), false);
    assert.equal(boundary.includes(forbidden), false);
  }
});
