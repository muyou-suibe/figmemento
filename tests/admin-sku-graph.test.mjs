import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  AdminProductSkuGraphBoundary,
  dataSetWithProductSkuGraph,
  deriveCatalogDraftUuid,
} from "../app/application/admin-sku-graph.ts";
import { deriveVariantListingPrice, isIdentifier } from "../app/domain/catalog/index.ts";
import { createDevelopmentCatalogFixtures } from "../app/infrastructure/catalog/development-catalog-fixtures.ts";
import {
  SupabaseProductSkuGraphRepository,
  toSaveProductSkuGraphRpcArguments,
} from "../app/infrastructure/catalog/supabase-product-sku-graph-repository.ts";
import { handleAdminSkuGraphMutation } from "../app/server/admin-sku-graph-http.server.ts";

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

function zeroOptionProductId(dataSet) {
  const product = dataSet.products.find((candidate) =>
    !dataSet.options.some((option) => option.productId === candidate.id)
  );
  assert.ok(product);
  return product.id;
}

function existingIntent(dataSet, productId = dataSet.products[0].id) {
  return {
    productId,
    options: dataSet.options.filter((item) => item.productId === productId).map((item) => ({
      id: item.id,
      code: item.code,
      name: item.name,
      kind: item.kind,
      required: item.required,
      position: item.position,
    })),
    optionValues: dataSet.optionValues.filter((item) => item.productId === productId).map((item) => ({
      id: item.id,
      optionId: item.optionId,
      code: item.code,
      label: item.label,
      position: item.position,
    })),
    variants: dataSet.variants.filter((item) => item.productId === productId).map((item) => ({
      id: item.id,
      skuCode: item.skuCode,
      priceCents: item.priceCents,
      currency: item.currency,
      weightGrams: item.weightGrams,
      isActive: item.isActive,
      isAvailable: item.isAvailable,
      isDefault: item.isDefault,
      supplyMethod: item.supplyMethod,
      selectedOptions: item.selectedOptions,
    })),
  };
}

function multiIntent(dataSet = fixtures()) {
  const productId = dataSet.products[0].id;
  return {
    productId,
    options: [
      { id: "new:option-size", code: "size", name: "Size", kind: "size", required: true, position: 0 },
      { id: "new:option-material", code: "material", name: "Material", kind: "material", required: true, position: 1 },
    ],
    optionValues: [
      { id: "new:value-small", optionId: "new:option-size", code: "small", label: "Small", position: 0 },
      { id: "new:value-large", optionId: "new:option-size", code: "large", label: "Large", position: 1 },
      { id: "new:value-wood", optionId: "new:option-material", code: "wood", label: "Wood", position: 0 },
    ],
    variants: [
      {
        id: "new:variant-small",
        skuCode: "TEST-SMALL-WOOD",
        priceCents: 2500,
        currency: "USD",
        weightGrams: 320,
        isActive: true,
        isAvailable: false,
        isDefault: true,
        supplyMethod: "made_to_order",
        selectedOptions: [
          { optionId: "new:option-size", valueId: "new:value-small" },
          { optionId: "new:option-material", valueId: "new:value-wood" },
        ],
      },
      {
        id: "new:variant-large",
        skuCode: "TEST-LARGE-WOOD",
        priceCents: 3200,
        currency: "USD",
        weightGrams: 460,
        isActive: true,
        isAvailable: true,
        isDefault: false,
        supplyMethod: "made_to_order",
        selectedOptions: [
          { optionId: "new:option-size", valueId: "new:value-large" },
          { optionId: "new:option-material", valueId: "new:value-wood" },
        ],
      },
    ],
  };
}

function deterministicIds() {
  let next = 0;
  const calls = [];
  return {
    calls,
    generate() {
      next += 1;
      const id = `00000000-0000-4000-8000-${String(next).padStart(12, "0")}`;
      calls.push(id);
      return id;
    },
  };
}

function repositories(dataSet = fixtures(), writeResult) {
  const calls = { reads: 0, writes: 0, graphs: [] };
  return {
    calls,
    reader: {
      async readAdminCatalogGraph() {
        calls.reads += 1;
        return { status: "found", value: dataSet };
      },
    },
    writer: {
      async saveProductSkuGraph(graph) {
        calls.writes += 1;
        calls.graphs.push(graph);
        return writeResult ?? { status: "applied", value: graph };
      },
    },
  };
}

function request(body, origin = "https://photogift.test") {
  return new Request(`https://photogift.test/api/admin/catalog/products/${body?.productId ?? "product"}/sku-graph`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
      "sec-fetch-site": origin === "https://photogift.test" ? "same-origin" : "cross-site",
    },
    body: JSON.stringify(body),
  });
}

test("1-4: auth, same-origin, strict parsing, and route identity stop before RPC factory", async () => {
  const dataSet = fixtures();
  const intent = existingIntent(dataSet);
  for (const [verifier, input, origin, routeId, status] of [
    [unauthorized, intent, "https://photogift.test", intent.productId, 401],
    [authorized, intent, "https://attacker.test", intent.productId, 403],
    [authorized, { ...intent, arbitraryOperations: [] }, "https://photogift.test", intent.productId, 400],
    [authorized, { ...intent, productId: dataSet.products[1].id }, "https://photogift.test", intent.productId, 400],
  ]) {
    let factories = 0;
    const response = await handleAdminSkuGraphMutation(request(input, origin), routeId, {
      verifier,
      createRepositories() {
        factories += 1;
        throw new Error("must not create repositories");
      },
    });
    assert.equal(response.status, status);
    assert.equal(factories, 0);
  }
});

test("5: a valid zero-Option graph preserves the existing default Variant", async () => {
  const dataSet = fixtures();
  const intent = existingIntent(dataSet, zeroOptionProductId(dataSet));
  const repos = repositories(dataSet);
  const result = await new AdminProductSkuGraphBoundary(authorized, () => repos).execute(intent.productId, intent);
  assert.equal(result.status, "applied");
  assert.equal(repos.calls.writes, 1);
  assert.equal(repos.calls.graphs[0].options.length, 0);
  assert.equal(repos.calls.graphs[0].variants[0].isDefault, true);
  assert.deepEqual(repos.calls.graphs[0].variants[0].selectedOptions, []);
});

test("6, 17, 28-30: multi-Option graph gets server IDs and preserves approved fields only", async () => {
  const dataSet = fixtures();
  const intent = multiIntent(dataSet);
  const ids = deterministicIds();
  const repos = repositories(dataSet);
  const beforeLifecycle = dataSet.products.map((product) => product.lifecycle);
  const result = await new AdminProductSkuGraphBoundary(
    authorized,
    () => repos,
    () => ids.generate(),
  ).execute(intent.productId, intent);
  assert.equal(result.status, "applied");
  assert.equal(ids.calls.length, 7);
  assert.equal(repos.calls.writes, 1);
  assert.equal(repos.calls.graphs[0].variants[0].isActive, true);
  assert.equal(repos.calls.graphs[0].variants[0].isAvailable, false);
  assert.equal(repos.calls.graphs[0].variants[1].isAvailable, true);
  assert.equal(repos.calls.graphs[0].variants.every((variant) => !variant.id.startsWith("new:")), true);
  assert.deepEqual(dataSet.products.map((product) => product.lifecycle), beforeLifecycle);

  const existing = existingIntent(dataSet);
  const existingRepos = repositories(dataSet);
  await new AdminProductSkuGraphBoundary(authorized, () => existingRepos).execute(existing.productId, existing);
  assert.equal(existingRepos.calls.graphs[0].variants[0].id, existing.variants[0].id);
});

test("draft identities are stable UUIDs and are scoped by Product, entity kind, and token", async () => {
  const productId = fixtures().products[0].id;
  const repeated = await deriveCatalogDraftUuid(productId, "option", "new:shared-token");
  assert.equal(await deriveCatalogDraftUuid(productId, "option", "new:shared-token"), repeated);
  assert.equal(isIdentifier(repeated), true);
  assert.match(repeated, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(await deriveCatalogDraftUuid("another-product", "option", "new:shared-token"), repeated);
  assert.notEqual(await deriveCatalogDraftUuid(productId, "variant", "new:shared-token"), repeated);
  assert.notEqual(await deriveCatalogDraftUuid(productId, "option", "new:different-token"), repeated);
});

test("a lost-response retry through fresh boundaries reuses every identity and RPC payload", async () => {
  const initial = fixtures();
  const requestIntent = multiIntent(initial);
  const firstRepositories = repositories(initial);
  const first = await new AdminProductSkuGraphBoundary(
    authorized,
    () => firstRepositories,
  ).execute(requestIntent.productId, structuredClone(requestIntent));
  assert.equal(first.status, "applied");

  const firstGraph = firstRepositories.calls.graphs[0];
  const committed = dataSetWithProductSkuGraph(initial, firstGraph);
  const retryRepositories = repositories(committed);
  const retry = await new AdminProductSkuGraphBoundary(
    authorized,
    () => retryRepositories,
  ).execute(requestIntent.productId, structuredClone(requestIntent));
  assert.equal(retry.status, "applied");

  const retryGraph = retryRepositories.calls.graphs[0];
  assert.deepEqual(
    retryGraph.options.map(({ id }) => id),
    firstGraph.options.map(({ id }) => id),
  );
  assert.deepEqual(
    retryGraph.optionValues.map(({ id }) => id),
    firstGraph.optionValues.map(({ id }) => id),
  );
  assert.deepEqual(
    retryGraph.variants.map(({ id }) => id),
    firstGraph.variants.map(({ id }) => id),
  );
  assert.deepEqual(
    toSaveProductSkuGraphRpcArguments(retryGraph),
    toSaveProductSkuGraphRpcArguments(firstGraph),
  );

  const optionIds = new Set(firstGraph.options.map(({ id }) => id));
  const valueIds = new Set(firstGraph.optionValues.map(({ id }) => id));
  assert.equal(firstGraph.optionValues.every(({ optionId }) => optionIds.has(optionId)), true);
  assert.equal(firstGraph.variants.every(({ selectedOptions }) => selectedOptions.every(
    ({ optionId, valueId }) => optionIds.has(optionId) && valueIds.has(valueId),
  )), true);
  assert.equal(new Set([...optionIds, ...valueIds, ...firstGraph.variants.map(({ id }) => id)]).size, 7);
});

test("persisted IDs bypass derivation, while arbitrary final UUIDs cannot bypass ownership", async () => {
  const dataSet = fixtures();
  const intent = existingIntent(dataSet);
  let derivations = 0;
  const existingRepositories = repositories(dataSet);
  const existing = await new AdminProductSkuGraphBoundary(
    authorized,
    () => existingRepositories,
    () => {
      derivations += 1;
      throw new Error("existing identities must not be rederived");
    },
  ).execute(intent.productId, intent);
  assert.equal(existing.status, "applied");
  assert.equal(derivations, 0);
  assert.equal(existingRepositories.calls.graphs[0].variants[0].id, intent.variants[0].id);

  const arbitrary = structuredClone(intent);
  arbitrary.variants[0].id = "11111111-1111-4111-8111-111111111111";
  const arbitraryRepositories = repositories(dataSet);
  const rejected = await new AdminProductSkuGraphBoundary(
    authorized,
    () => arbitraryRepositories,
  ).execute(intent.productId, arbitrary);
  assert.equal(rejected.status, "invalid_request");
  assert.equal(arbitraryRepositories.calls.writes, 0);
});

test("7-16, 33: complete CatalogDataSet validation rejects invalid graphs with zero writes", async () => {
  const dataSet = fixtures();
  const base = multiIntent(dataSet);
  const otherProductSku = dataSet.variants.find((variant) => variant.productId !== base.productId).skuCode;
  const invalidCases = [
    { ...base, variants: base.variants.map((variant, index) => index === 0 ? { ...variant, selectedOptions: variant.selectedOptions.slice(0, 1) } : variant) },
    { ...base, variants: [base.variants[0], { ...base.variants[1], selectedOptions: base.variants[0].selectedOptions }] },
    { ...base, variants: base.variants.map((variant, index) => index === 0 ? { ...variant, skuCode: otherProductSku } : variant) },
    { ...base, optionValues: base.optionValues.map((value, index) => index === 0 ? { ...value, optionId: "new:option-material" } : value) },
    { ...base, variants: base.variants.map((variant, index) => index === 0 ? { ...variant, priceCents: -1 } : variant) },
    { ...base, variants: base.variants.map((variant, index) => index === 0 ? { ...variant, priceCents: 1.5 } : variant) },
    { ...base, variants: base.variants.map((variant, index) => index === 0 ? { ...variant, currency: "EUR" } : variant) },
    { ...base, variants: base.variants.map((variant, index) => index === 0 ? { ...variant, weightGrams: -1 } : variant) },
    { ...base, variants: base.variants.map((variant, index) => index === 0 ? { ...variant, weightGrams: 1.5 } : variant) },
    { ...base, variants: base.variants.map((variant) => ({ ...variant, isDefault: true })) },
    { ...base, variants: base.variants.map((variant, index) => index === 0 ? { ...variant, supplyMethod: "warehouse_stock" } : variant) },
  ];
  for (const invalid of invalidCases) {
    const repos = repositories(dataSet);
    const result = await new AdminProductSkuGraphBoundary(
      authorized,
      () => repos,
      deterministicIds().generate,
    ).execute(base.productId, invalid);
    assert.equal(result.status, "invalid_request");
    assert.equal(repos.calls.writes, 0);
  }
});

test("10: existing Option, Value, and Variant identities cannot cross Products", async () => {
  const dataSet = fixtures();
  const first = dataSet.products[0].id;
  const second = dataSet.products[1].id;
  dataSet.options.push({ id: "other-option", productId: second, code: "size", name: "Size", kind: "size", required: true, position: 0 });
  dataSet.optionValues.push({ id: "other-value", productId: second, optionId: "other-option", code: "small", label: "Small", position: 0 });
  const cases = [
    { ...existingIntent(dataSet, first), options: [{ id: "other-option", code: "size", name: "Size", kind: "size", required: true, position: 0 }] },
    { ...existingIntent(dataSet, first), optionValues: [{ id: "other-value", optionId: "other-option", code: "small", label: "Small", position: 0 }] },
    { ...existingIntent(dataSet, first), variants: [{ ...existingIntent(dataSet, second).variants[0], selectedOptions: [] }] },
  ];
  for (const candidate of cases) {
    const repos = repositories(dataSet);
    const result = await new AdminProductSkuGraphBoundary(authorized, () => repos).execute(first, candidate);
    assert.equal(result.status, "invalid_request");
    assert.equal(repos.calls.writes, 0);
  }
});

test("18-19, 22, 27: RPC payload is canonical, exact, server-derived, and deterministic", () => {
  const dataSet = fixtures();
  const productId = dataSet.products[0].id;
  const graph = {
    productId,
    options: [
      { id: "option-b", productId, code: "material", name: "Material", kind: "material", required: true, position: 1 },
      { id: "option-a", productId, code: "size", name: "Size", kind: "size", required: true, position: 0 },
    ],
    optionValues: [
      { id: "value-b", productId, optionId: "option-b", code: "wood", label: "Wood", position: 0 },
      { id: "value-a", productId, optionId: "option-a", code: "small", label: "Small", position: 0 },
    ],
    variants: [{
      id: "variant-a", productId, skuCode: "CANONICAL-1", priceCents: 1000, currency: "USD", weightGrams: 100,
      isActive: true, isAvailable: false, isDefault: true, supplyMethod: "made_to_order",
      selectedOptions: [{ optionId: "option-b", valueId: "value-b" }, { optionId: "option-a", valueId: "value-a" }],
    }],
  };
  const first = toSaveProductSkuGraphRpcArguments(graph);
  const second = toSaveProductSkuGraphRpcArguments(structuredClone(graph));
  assert.deepEqual(first, second);
  assert.deepEqual(Object.keys(first).sort(), ["p_option_values", "p_options", "p_product_id", "p_variant_values", "p_variants"]);
  assert.equal(first.p_variants[0].combination_signature, "option-a=value-a|option-b=value-b");
  assert.deepEqual(first.p_variant_values.map((row) => row.option_id), ["option-a", "option-b"]);
  assert.equal("combination_signature" in graph.variants[0], false);
});

test("20: browser combination signature and RPC overrides are rejected before persistence", async () => {
  const dataSet = fixtures();
  const intent = existingIntent(dataSet);
  intent.variants[0].combination_signature = "browser-owned";
  intent.p_variants = [];
  let factories = 0;
  const result = await new AdminProductSkuGraphBoundary(authorized, () => {
    factories += 1;
    throw new Error("must not create repositories");
  }).execute(intent.productId, intent);
  assert.equal(result.status, "invalid_request");
  assert.equal(factories, 0);
});

test("21-26, 34: production adapter performs one RPC with no fallback writes and safe errors", async () => {
  const graphData = fixtures();
  const intent = existingIntent(graphData);
  const graph = {
    productId: intent.productId,
    options: [],
    optionValues: [],
    variants: graphData.variants.filter((variant) => variant.productId === intent.productId),
  };
  for (const [error, expected] of [
    [null, "applied"],
    [{ code: "P0002", message: "raw" }, "not_found"],
    [{ code: "23503", detail: "order_items private FK" }, "invalid_configuration"],
    [{ code: "XX000", message: "password=secret", hint: "SQL" }, "source_failure"],
  ]) {
    const calls = [];
    const repository = new SupabaseProductSkuGraphRepository({
      async saveProductSkuGraph(arguments_) {
        calls.push(arguments_);
        return { data: null, error };
      },
    });
    const result = await repository.saveProductSkuGraph(graph);
    assert.equal(result.status, expected);
    assert.equal(calls.length, 1);
    assert.deepEqual(Object.keys(calls[0]).sort(), ["p_option_values", "p_options", "p_product_id", "p_variant_values", "p_variants"]);
    assert.equal(JSON.stringify(result).includes("password"), false);
    assert.equal(JSON.stringify(result).includes("order_items"), false);
  }

  const adapterSource = await readFile(new URL("../app/infrastructure/catalog/supabase-product-sku-graph-repository.ts", import.meta.url), "utf8");
  assert.equal((adapterSource.match(/\.rpc\("save_product_sku_graph"/g) ?? []).length, 1);
  assert.equal(adapterSource.includes('.from("product_options")'), false);
  assert.equal(adapterSource.includes('.from("product_option_values")'), false);
  assert.equal(adapterSource.includes('.from("product_variants")'), false);
  assert.equal(adapterSource.includes('.from("product_variant_values")'), false);
});

test("31: ProductAsset Variant references reject removal before RPC without mutating assets", async () => {
  const dataSet = fixtures();
  const productId = dataSet.products[0].id;
  const variantId = dataSet.variants.find((variant) => variant.productId === productId).id;
  dataSet.assets.find((asset) => asset.productId === productId).variantId = variantId;
  const beforeAssets = structuredClone(dataSet.assets);
  const intent = { ...existingIntent(dataSet, productId), variants: [] };
  const repos = repositories(dataSet);
  const result = await new AdminProductSkuGraphBoundary(authorized, () => repos).execute(productId, intent);
  assert.equal(result.status, "invalid_request");
  assert.equal(repos.calls.writes, 0);
  assert.deepEqual(dataSet.assets, beforeAssets);
});

test("32: Variant price edits change Variant-derived listing price only", async () => {
  const dataSet = fixtures();
  const intent = existingIntent(dataSet, zeroOptionProductId(dataSet));
  intent.variants[0].priceCents = 7777;
  const repos = repositories(dataSet);
  const result = await new AdminProductSkuGraphBoundary(authorized, () => repos).execute(intent.productId, intent);
  assert.equal(result.status, "applied");
  const proposed = dataSetWithProductSkuGraph(dataSet, repos.calls.graphs[0]);
  const listing = deriveVariantListingPrice(intent.productId, proposed.variants);
  assert.equal(listing.ok, true);
  assert.equal(listing.value.priceCents, 7777);
  assert.equal("priceCents" in dataSet.products.find((product) => product.id === intent.productId), false);
});

test("admin SKU route is POST-only and UI exposes the approved graph fields", async () => {
  const route = await readFile(new URL("../app/api/admin/catalog/products/[id]/sku-graph/route.ts", import.meta.url), "utf8");
  const ui = await readFile(new URL("../app/admin/products/AdminSkuGraphEditor.tsx", import.meta.url), "utf8");
  assert.equal(route.includes("export async function POST"), true);
  assert.equal(route.includes("export async function GET"), false);
  for (const field of ["skuCode", "priceCents", "weightGrams", "isActive", "isAvailable", "isDefault", "supplyMethod", "selectedOptions"]) {
    assert.equal(ui.includes(field), true);
  }
  assert.equal(ui.includes("inventory"), false);
  assert.equal(ui.includes("combination_signature"), false);
  assert.equal(ui.includes("catalog_audit_events"), false);
});
