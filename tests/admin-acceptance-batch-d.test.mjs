import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { POST as contentPost } from "../app/api/admin/catalog/[resource]/[id]/route.ts";
import { POST as lifecyclePost } from "../app/api/admin/catalog/[resource]/[id]/lifecycle/route.ts";
import { POST as assetPost } from "../app/api/admin/catalog/products/[id]/assets/route.ts";
import { GET as customizationGet } from "../app/api/admin/catalog/products/[id]/customization/route.ts";
import { POST as fulfillmentPost } from "../app/api/admin/catalog/products/[id]/fulfillment/route.ts";
import { POST as skuGraphPost } from "../app/api/admin/catalog/products/[id]/sku-graph/route.ts";
import {
  AdminCatalogQueryBoundary,
} from "../app/application/admin-catalog-boundary.ts";
import { createSignedAdminSession } from "../app/application/admin-session.ts";
import {
  createAdminCatalogReader,
  getSharedLocalAdminCatalogRuntime,
  resetSharedAdminAcceptanceRuntimeForTests,
  resolveAdminOrdersReadSource,
} from "../app/server/admin-acceptance-source.server.ts";
import { ExistingAdminSessionVerifier } from "../app/server/admin-catalog-session.server.ts";
import { handleAdminCatalogContentMutation } from "../app/server/admin-catalog-http.server.ts";
import { createDevelopmentCatalogFixtures } from "../app/infrastructure/catalog/development-catalog-fixtures.ts";

const origin = "https://photogift.test";
const productId = "fixture-product-couple-figure";
const categoryId = "5e040e93-7924-479e-87b6-04d6126ff31f";
const adminPassword = "batch-d-local-admin-password";

async function withLocalEnvironment(callback) {
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    ADMIN_ACCEPTANCE_SOURCE: process.env.ADMIN_ACCEPTANCE_SOURCE,
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
  };
  process.env.NODE_ENV = "test";
  process.env.ADMIN_ACCEPTANCE_SOURCE = "local_fake";
  process.env.ADMIN_PASSWORD = adminPassword;
  resetSharedAdminAcceptanceRuntimeForTests();
  try {
    return await callback();
  } finally {
    resetSharedAdminAcceptanceRuntimeForTests();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function adminToken() {
  return createSignedAdminSession(adminPassword);
}

function jsonRequest(path, body, token) {
  return new Request(`${origin}${path}`, {
    method: "POST",
    headers: {
      origin,
      "sec-fetch-site": "same-origin",
      "content-type": "application/json",
      ...(token ? { cookie: `photogift-admin-session=${encodeURIComponent(token)}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

function getRequest(path, token) {
  return new Request(`${origin}${path}`, {
    headers: { cookie: `photogift-admin-session=${encodeURIComponent(token)}` },
  });
}

async function responseBody(response) {
  return response.json();
}

async function currentCatalog() {
  const loaded = await createAdminCatalogReader().readAdminCatalogGraph();
  assert.equal(loaded.status, "found");
  return loaded.value;
}

function routeGraphEntity(entity) {
  return Object.fromEntries(Object.entries(entity).filter(([key]) => key !== "productId"));
}

test("Batch D route integration uses one authorized local Catalog graph across real route handlers", async () => {
  await withLocalEnvironment(async () => {
    const token = await adminToken();
    const before = await currentCatalog();
    const product = before.products.find((candidate) => candidate.id === productId);
    const category = before.categories.find((candidate) => candidate.id === categoryId);
    const asset = before.assets.find((candidate) => candidate.productId === productId);
    const fulfillment = before.fulfillmentConfigs.find((candidate) => candidate.productId === productId);
    assert.ok(product && category && asset && fulfillment);

    const unauthorized = await contentPost(
      jsonRequest(`/api/admin/catalog/products/${productId}`, {
        kind: "save_product",
        payload: product,
      }),
      { params: Promise.resolve({ resource: "products", id: productId }) },
    );
    assert.equal(unauthorized.status, 401);

    const productResponse = await contentPost(
      jsonRequest(`/api/admin/catalog/products/${productId}`, {
        kind: "save_product",
        payload: { ...product, name: "Batch D local route product" },
      }, token),
      { params: Promise.resolve({ resource: "products", id: productId }) },
    );
    assert.equal(productResponse.status, 200);
    assert.equal((await responseBody(productResponse)).status, "applied");

    const categoryResponse = await contentPost(
      jsonRequest(`/api/admin/catalog/categories/${categoryId}`, {
        kind: "save_category",
        payload: { ...category, description: "Batch D local route category" },
      }, token),
      { params: Promise.resolve({ resource: "categories", id: categoryId }) },
    );
    assert.equal(categoryResponse.status, 200);

    const graph = {
      productId,
      options: before.options.filter((item) => item.productId === productId).map(routeGraphEntity),
      optionValues: before.optionValues.filter((item) => item.productId === productId).map(routeGraphEntity),
      variants: before.variants.filter((item) => item.productId === productId).map(routeGraphEntity),
    };
    const skuResponse = await skuGraphPost(
      jsonRequest(`/api/admin/catalog/products/${productId}/sku-graph`, graph, token),
      { params: Promise.resolve({ id: productId }) },
    );
    assert.equal(skuResponse.status, 200);
    assert.equal((await responseBody(skuResponse)).status, "applied");

    const assetResponse = await assetPost(
      jsonRequest(`/api/admin/catalog/products/${productId}/assets`, {
        operation: "update",
        productId,
        asset: { ...asset, altText: "Batch D local route asset" },
      }, token),
      { params: Promise.resolve({ id: productId }) },
    );
    assert.equal(assetResponse.status, 200);

    const fulfillmentResponse = await fulfillmentPost(
      jsonRequest(`/api/admin/catalog/products/${productId}/fulfillment`, {
        operation: "update",
        productId,
        config: fulfillment,
      }, token),
      { params: Promise.resolve({ id: productId }) },
    );
    assert.equal(fulfillmentResponse.status, 200);

    const customizationResponse = await customizationGet(
      getRequest(`/api/admin/catalog/products/${productId}/customization`, token),
      { params: Promise.resolve({ id: productId }) },
    );
    assert.equal(customizationResponse.status, 200);
    assert.equal((await responseBody(customizationResponse)).status, "found");

    const unpublished = await lifecyclePost(
      jsonRequest(`/api/admin/catalog/products/${productId}/lifecycle`, { action: "unpublish" }, token),
      { params: Promise.resolve({ resource: "products", id: productId }) },
    );
    assert.equal(unpublished.status, 200);
    assert.equal((await responseBody(unpublished)).status, "applied");

    const republished = await lifecyclePost(
      jsonRequest(`/api/admin/catalog/products/${productId}/lifecycle`, { action: "publish" }, token),
      { params: Promise.resolve({ resource: "products", id: productId }) },
    );
    assert.equal(republished.status, 200);
    assert.equal((await responseBody(republished)).status, "applied");

    const after = await currentCatalog();
    assert.equal(after.products.find((candidate) => candidate.id === productId)?.name, "Batch D local route product");
    assert.equal(after.categories.find((candidate) => candidate.id === categoryId)?.description, "Batch D local route category");
    assert.equal(after.assets.find((candidate) => candidate.id === asset.id)?.altText, "Batch D local route asset");
    assert.deepEqual(after.variants.filter((item) => item.productId === productId).map(routeGraphEntity), graph.variants);
    assert.equal(after.fulfillmentConfigs.find((candidate) => candidate.productId === productId)?.id, fulfillment.id);
    assert.equal(after.products.find((candidate) => candidate.id === productId)?.lifecycle, "published");

    const firstRuntime = getSharedLocalAdminCatalogRuntime();
    const secondRuntime = getSharedLocalAdminCatalogRuntime();
    assert.strictEqual(firstRuntime, secondRuntime);
    assert.strictEqual(firstRuntime.reader, createAdminCatalogReader());
  });
});

test("Batch D local Orders is a bounded independent read source with shared filter/export semantics", async () => {
  await withLocalEnvironment(async () => {
    const selected = resolveAdminOrdersReadSource();
    assert.equal(selected.status, "local_fake");
    const query = { attention: "1" };
    const page = await selected.repository.read(query);
    assert.equal(page.status, "found");
    assert.equal(page.value.sourceNotice, "LOCAL / TEST ONLY");
    assert.ok(page.value.items.length > 0);
    assert.ok(page.value.items.every((order) => ["awaiting_review", "quality_check", "issue"].includes(order.fulfillmentStatus)));
    assert.ok(page.value.items.every((order) => order.lineItems.every((item) => item.photo.previewAvailable === false)));

    const exported = await selected.repository.readExportRows(query);
    assert.equal(exported.status, "found");
    assert.equal(exported.value.length, page.value.totalCount);
    assert.ok(exported.value.every((row) => row.currency === "USD"));

    const pageSource = await readFile("app/admin/orders/page.tsx", "utf8");
    const exportSource = await readFile("app/api/admin/orders/export/route.ts", "utf8");
    assert.ok(pageSource.indexOf("resolveAdminOrdersReadSource") < pageSource.indexOf("getSupabaseServerClient()"));
    assert.ok(exportSource.indexOf("resolveAdminOrdersReadSource") < exportSource.indexOf("getSupabaseServerClient().from"));
    assert.match(pageSource, /LocalOrderControls/);
    assert.match(pageSource, /LOCAL_ADMIN_ORDERS_SOURCE_NOTICE/);
  });
});

test("Batch D source policy has no local failure fallback and fails invalid production configuration closed", async () => {
  await withLocalEnvironment(async () => {
    let productionCalls = 0;
    let localCalls = 0;
    const { resolveAdminAcceptanceSource } = await import("../app/config/admin-acceptance-runtime.server.ts");
    const failure = resolveAdminAcceptanceSource("authorized", {
      production: () => { productionCalls += 1; return "production"; },
      localFake: () => { localCalls += 1; throw new Error("controlled local source failure"); },
    });
    assert.deepEqual(failure, { status: "source_failure", source: "local_fake" });
    assert.equal(localCalls, 1);
    assert.equal(productionCalls, 0);

    const previousMode = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    resetSharedAdminAcceptanceRuntimeForTests();
    const result = await new AdminCatalogQueryBoundary(
      new ExistingAdminSessionVerifier(await adminToken()),
      createAdminCatalogReader,
    ).execute({});
    assert.equal(result.status, "invalid_configuration");
    process.env.NODE_ENV = previousMode;
  });
});

test("Batch D catalog route remains auth-first before its shared source factory", async () => {
  await withLocalEnvironment(async () => {
    let factories = 0;
    const response = await handleAdminCatalogContentMutation(
      jsonRequest(`/api/admin/catalog/products/${productId}`, { kind: "save_product", payload: {} }),
      "products",
      productId,
      {
        verifier: { async verifyAdminSession() { return { status: "unauthorized" }; } },
        createRepositories() {
          factories += 1;
          throw new Error("unauthorized request must not construct a source");
        },
      },
    );
    assert.equal(response.status, 401);
    assert.equal(factories, 0);

    const fixtures = createDevelopmentCatalogFixtures();
    assert.equal(fixtures.products.some((product) => product.id === productId), true);
  });
});
