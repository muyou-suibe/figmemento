import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  AdminCatalogCommandBoundary,
  AdminCatalogQueryBoundary,
} from "../app/application/admin-catalog-boundary.ts";
import { AdminCatalogLifecycleBoundary } from "../app/application/admin-catalog-lifecycle.ts";
import { AdminProductFulfillmentBoundary } from "../app/application/admin-product-fulfillment.ts";
import { AdminProductSkuGraphBoundary } from "../app/application/admin-sku-graph.ts";
import { validateCatalogDataSet } from "../app/application/catalog-data-set.ts";
import { evaluatePublicEligibility } from "../app/domain/catalog/index.ts";
import { createDevelopmentCatalogFixtures } from "../app/infrastructure/catalog/development-catalog-fixtures.ts";
import { SupabaseProductSkuGraphRepository } from "../app/infrastructure/catalog/supabase-product-sku-graph-repository.ts";

const authorized = {
  async verifyAdminSession() {
    return { status: "authorized", principal: { role: "admin", identity: "configured-admin" } };
  },
};

const unauthorized = {
  async verifyAdminSession() {
    return { status: "unauthorized" };
  },
};

function fixtures() {
  return structuredClone(createDevelopmentCatalogFixtures());
}

function repositories(dataSet, writeResult) {
  const calls = { reads: 0, writes: 0 };
  const writer = {
    async saveCategory(value) { calls.writes += 1; return writeResult ?? { status: "applied", value }; },
    async saveProduct(value) { calls.writes += 1; return writeResult ?? { status: "applied", value }; },
    async saveOption(value) { calls.writes += 1; return writeResult ?? { status: "applied", value }; },
    async saveOptionValue(value) { calls.writes += 1; return writeResult ?? { status: "applied", value }; },
    async saveVariant(value) { calls.writes += 1; return writeResult ?? { status: "applied", value }; },
    async saveAsset(value) { calls.writes += 1; return writeResult ?? { status: "applied", value }; },
    async saveFulfillmentConfig(value) { calls.writes += 1; return writeResult ?? { status: "applied", value }; },
  };
  return {
    calls,
    reader: {
      async readAdminCatalogGraph() {
        calls.reads += 1;
        return { status: "found", value: dataSet };
      },
    },
    writer,
  };
}

function graphFor(dataSet, productId = dataSet.products[0].id) {
  const product = dataSet.products.find((item) => item.id === productId);
  assert.ok(product);
  const category = dataSet.categories.find((item) => item.id === product.categoryId);
  const fulfillment = dataSet.fulfillmentConfigs.find((item) => item.productId === productId);
  assert.ok(category);
  assert.ok(fulfillment);
  return {
    category,
    product,
    fulfillment,
    options: dataSet.options.filter((item) => item.productId === productId),
    optionValues: dataSet.optionValues.filter((item) => item.productId === productId),
    variants: dataSet.variants.filter((item) => item.productId === productId),
    catalogVariants: dataSet.variants,
  };
}

function issueCodes(result) {
  return result.ok ? [] : result.issues.map((issue) => issue.code);
}

test("Task 6.7: unauthorized admin reads and every mutation boundary reject before privileged construction", async () => {
  let factories = 0;
  const forbiddenFactory = () => {
    factories += 1;
    throw new Error("privileged dependency must not be constructed");
  };

  const results = await Promise.all([
    new AdminCatalogQueryBoundary(unauthorized, forbiddenFactory).execute({}),
    new AdminCatalogCommandBoundary(unauthorized, forbiddenFactory).execute({ kind: "save_product", payload: {} }),
    new AdminProductSkuGraphBoundary(unauthorized, forbiddenFactory).execute("product-1", {}),
    new AdminProductFulfillmentBoundary(unauthorized, forbiddenFactory).execute("product-1", {}),
    new AdminCatalogLifecycleBoundary(unauthorized, forbiddenFactory).execute("product", "product-1", { action: "publish" }),
  ]);

  assert.deepEqual(results.map((result) => result.status), Array(5).fill("unauthorized"));
  assert.equal(factories, 0);
});

test("Task 6.7: duplicate Category and Product slugs are rejected before admin writes", async () => {
  const dataSet = fixtures();
  const cases = [
    {
      kind: "save_category",
      value: { ...dataSet.categories[0], slug: dataSet.categories[1].slug },
    },
    {
      kind: "save_product",
      value: { ...dataSet.products[0], slug: dataSet.products[1].slug },
    },
  ];

  for (const candidate of cases) {
    const repos = repositories(dataSet);
    const result = await new AdminCatalogCommandBoundary(authorized, () => repos).execute({
      kind: candidate.kind,
      payload: candidate.value,
    });
    assert.equal(result.status, "invalid_request");
    assert.equal(result.issues.some((issue) => issue.code === "duplicate"), true);
    assert.equal(repos.calls.writes, 0);
  }
});

test("Task 6.7: duplicate global SKU codes and Product option combinations fail closed", () => {
  const duplicateSku = fixtures();
  duplicateSku.variants[1] = {
    ...duplicateSku.variants[1],
    skuCode: duplicateSku.variants[0].skuCode,
  };
  const skuResult = validateCatalogDataSet(duplicateSku);
  assert.equal(skuResult.ok, false);
  assert.equal(issueCodes(skuResult).includes("duplicate"), true);

  const duplicateCombination = fixtures();
  const original = duplicateCombination.variants[0];
  duplicateCombination.variants.push({
    ...original,
    id: "duplicate-combination-variant",
    skuCode: "UNIQUE-DUPLICATE-COMBINATION",
    isDefault: false,
  });
  const combinationResult = validateCatalogDataSet(duplicateCombination);
  assert.equal(combinationResult.ok, false);
  assert.equal(issueCodes(combinationResult).includes("duplicate"), true);
  assert.equal(
    combinationResult.issues.some((issue) => /combination/i.test(issue.message)),
    true,
  );
});

test("Task 6.7: cross-Product Variant and option references are rejected without persistence", async () => {
  const dataSet = fixtures();
  const firstProduct = dataSet.products[0];
  const otherVariant = dataSet.variants.find((variant) => variant.productId !== firstProduct.id);
  assert.ok(otherVariant);
  const asset = dataSet.assets.find((item) => item.productId === firstProduct.id);
  assert.ok(asset);

  const repos = repositories(dataSet);
  const result = await new AdminCatalogCommandBoundary(authorized, () => repos).execute({
    kind: "save_asset",
    payload: { ...asset, variantId: otherVariant.id },
  });
  assert.equal(result.status, "invalid_request");
  assert.equal(result.issues.some((issue) => issue.code === "ownership"), true);
  assert.equal(repos.calls.writes, 0);

  const crossOption = fixtures();
  const otherProduct = crossOption.products[1];
  crossOption.optionValues.push({
    ...crossOption.optionValues[0],
    id: "cross-product-option-value",
    productId: otherProduct.id,
  });
  const dataSetResult = validateCatalogDataSet(crossOption);
  assert.equal(dataSetResult.ok, false);
  assert.equal(issueCodes(dataSetResult).includes("ownership"), true);
});

test("Task 6.7: invalid FulfillmentConfig combinations fail before repository access", async () => {
  const dataSet = fixtures();
  const config = dataSet.fulfillmentConfigs[0];
  for (const invalidConfig of [
    { ...config, fulfillmentType: "digital", requiresShipping: true },
    { ...config, leadTime: { minBusinessDays: 8, maxBusinessDays: 2 } },
  ]) {
    let factories = 0;
    const result = await new AdminProductFulfillmentBoundary(authorized, () => {
      factories += 1;
      throw new Error("invalid fulfillment must not reach persistence");
    }).execute(config.productId, {
      operation: "update",
      productId: config.productId,
      config: invalidConfig,
    });
    assert.equal(result.status, "invalid_request");
    assert.equal(factories, 0);
  }
});

test("Task 6.7: SKU graph partial-write failures remain one atomic RPC with no local mutation", async () => {
  const dataSet = fixtures();
  const productId = dataSet.products[0].id;
  const graph = {
    productId,
    options: dataSet.options.filter((item) => item.productId === productId),
    optionValues: dataSet.optionValues.filter((item) => item.productId === productId),
    variants: dataSet.variants.filter((item) => item.productId === productId),
  };
  const before = structuredClone(graph);
  let rpcCalls = 0;
  const repository = new SupabaseProductSkuGraphRepository({
    async saveProductSkuGraph() {
      rpcCalls += 1;
      return { data: null, error: { code: "23505", detail: "must remain private" } };
    },
  });
  const result = await repository.saveProductSkuGraph(graph);
  assert.equal(result.status, "invalid_configuration");
  assert.equal(rpcCalls, 1);
  assert.deepEqual(graph, before);

  const sql = await readFile(
    new URL("../supabase/migrations/20260808120000_add_atomic_catalog_sku_graph_rpc.sql", import.meta.url),
    "utf8",
  );
  assert.match(sql, /create function public\.save_product_sku_graph[\s\S]*language plpgsql[\s\S]*security invoker/i);
  assert.match(sql, /delete from public\.product_variant_values[\s\S]*raise exception/i);
  assert.doesNotMatch(sql, /exception\s+when\s+others[\s\S]*return/i);
});

test("Task 6.7: repeated equivalent lifecycle requests are no-op safe and do not duplicate success audits", async () => {
  const sql = await readFile(
    new URL("../supabase/migrations/20260810120000_add_atomic_catalog_lifecycle_rpc.sql", import.meta.url),
    "utf8",
  );
  const noChange = sql.search(/if v_previous_lifecycle = v_target_lifecycle then/i);
  const succeededOutcome = sql.indexOf("'succeeded'");
  const successAudit = sql.lastIndexOf("insert into public.catalog_audit_events", succeededOutcome);
  assert.notEqual(noChange, -1);
  assert.notEqual(succeededOutcome, -1);
  assert.notEqual(successAudit, -1);
  assert.equal(noChange < successAudit, true);
  assert.match(sql.slice(noChange, successAudit), /false, null::text/i);
});

test("Task 6.7: publication validation rejects invalid Category, fulfillment, and SKU eligibility", () => {
  const dataSet = fixtures();
  const valid = graphFor(dataSet);
  assert.equal(evaluatePublicEligibility(valid).eligible, true);

  const cases = [
    { ...valid, category: { ...valid.category, lifecycle: "draft" } },
    { ...valid, fulfillment: { ...valid.fulfillment, fulfillmentType: "digital", requiresShipping: true } },
    { ...valid, variants: valid.variants.map((variant) => ({ ...variant, isAvailable: false })) },
  ];
  for (const graph of cases) {
    assert.equal(evaluatePublicEligibility(graph).eligible, false);
  }
});

test("Task 6.7: lifecycle audit events cover success, rejection, failure, and destructive attempts without sensitive payloads", async () => {
  const sql = await readFile(
    new URL("../supabase/migrations/20260810120000_add_atomic_catalog_lifecycle_rpc.sql", import.meta.url),
    "utf8",
  );
  for (const value of ["publish", "unpublish", "retire", "destructive_state_mutation_attempt", "succeeded", "rejected", "failed"]) {
    assert.equal(sql.includes(`'${value}'`), true);
  }
  assert.match(sql, /insert into public\.catalog_audit_events/i);
  assert.doesNotMatch(sql, /customer_email|shipping_address|payment_method|access_token|cookie|password|sql_detail|sql_hint/i);
});

test("Task 6.7: Admin Catalog operations cannot rewrite orders or immutable order snapshots", async () => {
  const sources = await Promise.all([
    "../app/application/admin-catalog-boundary.ts",
    "../app/application/admin-sku-graph.ts",
    "../app/application/admin-product-assets.ts",
    "../app/application/admin-product-fulfillment.ts",
    "../app/application/admin-catalog-lifecycle.ts",
    "../app/infrastructure/catalog/supabase-catalog-admin-repository.ts",
    "../app/infrastructure/catalog/supabase-product-sku-graph-repository.ts",
    "../app/infrastructure/catalog/supabase-product-asset-repository.ts",
    "../app/infrastructure/catalog/supabase-product-fulfillment-repository.ts",
    "../app/infrastructure/catalog/supabase-catalog-lifecycle-repository.ts",
    "../supabase/migrations/20260808120000_add_atomic_catalog_sku_graph_rpc.sql",
    "../supabase/migrations/20260810120000_add_atomic_catalog_lifecycle_rpc.sql",
  ].map((path) => readFile(new URL(path, import.meta.url), "utf8")));

  for (const source of sources) {
    assert.doesNotMatch(source, /\.(?:from)\(["'](?:orders|order_items)["']\)/i);
    assert.doesNotMatch(source, /\b(?:insert\s+into|update|delete\s+from)\s+(?:public\.)?(?:orders|order_items)\b/i);
  }
});
