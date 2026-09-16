import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { POST as contentPost } from "../app/api/admin/catalog/[resource]/[id]/route.ts";
import { POST as lifecyclePost } from "../app/api/admin/catalog/[resource]/[id]/lifecycle/route.ts";
import { GET as customizationGet } from "../app/api/admin/catalog/products/[id]/customization/route.ts";
import { POST as assetPost } from "../app/api/admin/catalog/products/[id]/assets/route.ts";
import { POST as fulfillmentPost } from "../app/api/admin/catalog/products/[id]/fulfillment/route.ts";
import { POST as skuGraphPost } from "../app/api/admin/catalog/products/[id]/sku-graph/route.ts";
import {
  AdminCatalogCommandBoundary,
  AdminCatalogQueryBoundary,
} from "../app/application/admin-catalog-boundary.ts";
import { AdminCatalogLifecycleBoundary } from "../app/application/admin-catalog-lifecycle.ts";
import {
  AdminCustomizationFieldCommandBoundary,
  AdminCustomizationFieldQueryBoundary,
} from "../app/application/admin-customization-field-boundary.ts";
import { AdminProductAssetBoundary } from "../app/application/admin-product-assets.ts";
import { AdminProductFulfillmentBoundary } from "../app/application/admin-product-fulfillment.ts";
import { AdminProductSkuGraphBoundary } from "../app/application/admin-sku-graph.ts";
import {
  readAdminAcceptanceConfiguration,
  resolveAdminAcceptanceSource,
} from "../app/config/admin-acceptance-runtime.server.ts";
import {
  readCartConfig,
  readCustomerAuthConfig,
  readCustomerUploadConfig,
  readProductSource,
} from "../app/config/server.ts";
import { readLocalFulfillmentConfig } from "../app/config/local-fulfillment-runtime.ts";
import { readLocalOrderConfig } from "../app/config/local-order-runtime.ts";
import { readLocalPaymentConfig } from "../app/config/local-payment-runtime.ts";
import { readLocalTrackingConfig } from "../app/config/local-tracking-runtime.ts";
import { createSignedAdminSession } from "../app/application/admin-session.ts";
import {
  createAdminCatalogReader,
  getSharedLocalAdminCatalogRuntime,
  resolveAdminOrdersReadSource,
  resetSharedAdminAcceptanceRuntimeForTests,
} from "../app/server/admin-acceptance-source.server.ts";
import {
  loadAdminOrdersExportAfterAuthorization,
  loadAdminOrdersPageAfterAuthorization,
} from "../app/server/admin-orders-composition.server.ts";
import { handleAdminCatalogContentMutation } from "../app/server/admin-catalog-http.server.ts";
import { createDevelopmentCatalogRepository } from "../app/infrastructure/catalog/development-catalog-repository.ts";
import { createDevelopmentCatalogFixtures } from "../app/infrastructure/catalog/development-catalog-fixtures.ts";
import { createLocalAdminOrdersReadRepository } from "../app/infrastructure/orders/local-admin-orders-read-repository.server.ts";

const origin = "https://photogift.test";
const adminPassword = "batch-e-local-admin-password";
const productId = "fixture-product-couple-figure";
const categoryId = "5e040e93-7924-479e-87b6-04d6126ff31f";

const authorized = {
  async verifyAdminSession() {
    return { status: "authorized", principal: { role: "admin", identity: "configured-admin" } };
  },
};

function snapshotEnvironment(keys) {
  return Object.fromEntries(keys.map((key) => [key, process.env[key]]));
}

function restoreEnvironment(previous) {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

async function withLocalAdminEnvironment(callback) {
  const keys = ["NODE_ENV", "ADMIN_ACCEPTANCE_SOURCE", "ADMIN_PASSWORD"];
  const previous = snapshotEnvironment(keys);
  process.env.NODE_ENV = "test";
  process.env.ADMIN_ACCEPTANCE_SOURCE = "local_fake";
  process.env.ADMIN_PASSWORD = adminPassword;
  resetSharedAdminAcceptanceRuntimeForTests();
  try {
    return await callback();
  } finally {
    resetSharedAdminAcceptanceRuntimeForTests();
    restoreEnvironment(previous);
  }
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

function withoutProductId(value) {
  const { productId: ignoredProductId, ...entry } = value;
  void ignoredProductId;
  return entry;
}

async function readAdminCatalogGraph() {
  const result = await createAdminCatalogReader().readAdminCatalogGraph();
  assert.equal(result.status, "found");
  return result.value;
}

test("Batch E 5.1/5.6: source selection is explicit, fail-closed, and independent", () => {
  assert.deepEqual(
    readAdminAcceptanceConfiguration({}, "development"),
    { status: "production_default", source: "production", runtimeMode: "development" },
  );
  assert.deepEqual(
    readAdminAcceptanceConfiguration({ ADMIN_ACCEPTANCE_SOURCE: "local_fake" }, "development"),
    { status: "local_fake", source: "local_fake", runtimeMode: "development" },
  );
  assert.deepEqual(
    readAdminAcceptanceConfiguration({ ADMIN_ACCEPTANCE_SOURCE: "local_fake" }, "test"),
    { status: "local_fake", source: "local_fake", runtimeMode: "test" },
  );

  for (const runtimeMode of ["production", "unknown-runtime"]) {
    const result = readAdminAcceptanceConfiguration({ ADMIN_ACCEPTANCE_SOURCE: "local_fake" }, runtimeMode);
    assert.equal(result.status, "configuration_failure");
    assert.equal(result.reason, "local_source_not_allowed");
  }
  assert.equal(readAdminAcceptanceConfiguration({ ADMIN_ACCEPTANCE_SOURCE: "unknown" }, "test").status, "configuration_failure");

  const productionCalls = { production: 0, localFake: 0 };
  assert.deepEqual(
    resolveAdminAcceptanceSource("authorized", {
      production: () => { productionCalls.production += 1; return "production"; },
      localFake: () => { productionCalls.localFake += 1; return "local"; },
    }, {}, "test"),
    { status: "resolved", source: "production", value: "production" },
  );
  assert.deepEqual(productionCalls, { production: 1, localFake: 0 });

  const localCalls = { production: 0, localFake: 0 };
  assert.deepEqual(
    resolveAdminAcceptanceSource("authorized", {
      production: () => { localCalls.production += 1; return "production"; },
      localFake: () => { localCalls.localFake += 1; return "local"; },
    }, { ADMIN_ACCEPTANCE_SOURCE: "local_fake" }, "test"),
    { status: "resolved", source: "local_fake", value: "local" },
  );
  assert.deepEqual(localCalls, { production: 0, localFake: 1 });

  const failedCalls = { production: 0, localFake: 0 };
  assert.deepEqual(
    resolveAdminAcceptanceSource("authorized", {
      production: () => { failedCalls.production += 1; return "production"; },
      localFake: () => { failedCalls.localFake += 1; throw new Error("local source failure"); },
    }, { ADMIN_ACCEPTANCE_SOURCE: "local_fake" }, "test"),
    { status: "source_failure", source: "local_fake" },
  );
  assert.deepEqual(failedCalls, { production: 0, localFake: 1 });

  assert.equal(readProductSource({}), "supabase");
  assert.equal(readProductSource({ PHOTOGIFT_PRODUCT_SOURCE: "fixture", NODE_ENV: "test" }), "fixture");
  assert.throws(
    () => readProductSource({ PHOTOGIFT_PRODUCT_SOURCE: "fixture", NODE_ENV: "production" }),
    /Fixture product source is allowed only in development or test/,
  );

  assert.equal(readLocalOrderConfig({}, "test").source, "disabled");
  assert.equal(readLocalPaymentConfig({}, "test").source, "disabled");
  assert.equal(readLocalFulfillmentConfig({}, "test").source, "disabled");
  assert.equal(readLocalTrackingConfig({}, "test").source, "disabled");
  assert.equal(readCartConfig({}, "test").source, "disabled");
  assert.equal(readCustomerAuthConfig({}, "test").source, "disabled");
  assert.equal(readCustomerUploadConfig({}, "test").source, "disabled");
});

test("Batch E 5.1/5.6: browser input cannot choose Admin or downstream source", async () => {
  const configSource = await readFile(new URL("../app/config/admin-acceptance-runtime.server.ts", import.meta.url), "utf8");
  const sourceBoundary = await readFile(new URL("../app/server/admin-acceptance-source.server.ts", import.meta.url), "utf8");
  const productsPage = await readFile(new URL("../app/admin/products/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(configSource, /URLSearchParams|Request\b|cookies\(|localStorage|sessionStorage|window\.|document\./);
  assert.doesNotMatch(configSource, /console\.(log|warn|error)/);
  assert.doesNotMatch(productsPage, /NEXT_PUBLIC_ADMIN_ACCEPTANCE_SOURCE|URLSearchParams|localStorage|sessionStorage/);
  assert.doesNotMatch(sourceBoundary, /app\/api\/|Request\b|URLSearchParams|cookies\(/);
  assert.equal(productsPage.includes("searchParams"), false);
  assert.match(configSource, /process\.env\.NODE_ENV/);
});

test("Batch E 5.2: every privileged Catalog boundary rejects before source construction", async () => {
  const denied = { async verifyAdminSession() { return { status: "unauthorized" }; } };
  const failed = { async verifyAdminSession() { throw new Error("hostile authentication detail"); } };
  let constructions = 0;
  const sourceFactory = () => { constructions += 1; throw new Error("source must not be constructed"); };

  const boundaries = [
    new AdminCatalogQueryBoundary(denied, sourceFactory),
    new AdminCatalogCommandBoundary(denied, sourceFactory),
    new AdminCatalogLifecycleBoundary(denied, sourceFactory),
    new AdminProductSkuGraphBoundary(denied, sourceFactory),
    new AdminProductAssetBoundary(denied, sourceFactory),
    new AdminProductFulfillmentBoundary(denied, sourceFactory),
    new AdminCustomizationFieldQueryBoundary(denied, sourceFactory),
    new AdminCustomizationFieldCommandBoundary(denied, sourceFactory),
  ];
  const results = await Promise.all([
    boundaries[0].execute({}),
    boundaries[1].execute({}),
    boundaries[2].execute("product", productId, { action: "publish" }),
    boundaries[3].execute(productId, {}),
    boundaries[4].execute(productId, {}),
    boundaries[5].execute(productId, {}),
    boundaries[6].execute({ productId }),
    boundaries[7].execute({ productId, fields: [] }),
  ]);
  assert.ok(results.every((result) => result.status === "unauthorized"));
  assert.equal(constructions, 0);

  const authFailure = await new AdminCatalogQueryBoundary(failed, sourceFactory).execute({});
  assert.equal(authFailure.status, "authentication_failure");
  assert.equal(constructions, 0);
});

test("Batch E 5.2/5.5: authorized local Catalog route handlers use one graph and provider sentinels stay quiet", async () => {
  await withLocalAdminEnvironment(async () => {
    const originalFetch = globalThis.fetch;
    let fetchCalls = 0;
    globalThis.fetch = async () => {
      fetchCalls += 1;
      throw new Error("provider sentinel: local mode must not fetch");
    };
    try {
      const token = await createSignedAdminSession(adminPassword);
      const before = await readAdminCatalogGraph();
      const product = before.products.find((entry) => entry.id === productId);
      const category = before.categories.find((entry) => entry.id === categoryId);
      const asset = before.assets.find((entry) => entry.productId === productId);
      const fulfillment = before.fulfillmentConfigs.find((entry) => entry.productId === productId);
      assert.ok(product && category && asset && fulfillment);

      const productResponse = await contentPost(
        jsonRequest(`/api/admin/catalog/products/${productId}`, {
          kind: "save_product",
          payload: { ...product, name: "Batch E local product" },
        }, token),
        { params: Promise.resolve({ resource: "products", id: productId }) },
      );
      assert.equal(productResponse.status, 200);
      assert.equal((await productResponse.json()).status, "applied");

      const graph = {
        productId,
        options: before.options.filter((entry) => entry.productId === productId).map(withoutProductId),
        optionValues: before.optionValues.filter((entry) => entry.productId === productId).map(withoutProductId),
        variants: before.variants.filter((entry) => entry.productId === productId).map(withoutProductId),
      };
      const skuResponse = await skuGraphPost(
        jsonRequest(`/api/admin/catalog/products/${productId}/sku-graph`, graph, token),
        { params: Promise.resolve({ id: productId }) },
      );
      assert.equal(skuResponse.status, 200);
      assert.equal((await skuResponse.json()).status, "applied");

      const assetResponse = await assetPost(
        jsonRequest(`/api/admin/catalog/products/${productId}/assets`, {
          operation: "update",
          productId,
          asset: { ...asset, altText: "Batch E local asset" },
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

      const unpublishResponse = await lifecyclePost(
        jsonRequest(`/api/admin/catalog/products/${productId}/lifecycle`, { action: "unpublish" }, token),
        { params: Promise.resolve({ resource: "products", id: productId }) },
      );
      assert.equal(unpublishResponse.status, 200);
      assert.equal((await unpublishResponse.json()).status, "applied");

      const republishResponse = await lifecyclePost(
        jsonRequest(`/api/admin/catalog/products/${productId}/lifecycle`, { action: "publish" }, token),
        { params: Promise.resolve({ resource: "products", id: productId }) },
      );
      assert.equal(republishResponse.status, 200);
      assert.equal((await republishResponse.json()).status, "applied");

      const localRuntime = getSharedLocalAdminCatalogRuntime();
      assert.strictEqual(localRuntime.reader, createAdminCatalogReader());
      assert.equal(fetchCalls, 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("Batch E 5.5: local Orders page and export composition never construct production providers", async () => {
  await withLocalAdminEnvironment(async () => {
    const originalFetch = globalThis.fetch;
    const calls = {
      fetch: 0,
      productionOrdersLoader: 0,
      supabaseFactory: 0,
      uploadConfig: 0,
      storage: 0,
      signedUrl: 0,
      catalog: 0,
    };
    globalThis.fetch = async () => {
      calls.fetch += 1;
      throw new Error("provider sentinel: local Orders must not fetch");
    };
    const loadProduction = async () => {
      calls.productionOrdersLoader += 1;
      calls.supabaseFactory += 1;
      calls.uploadConfig += 1;
      calls.storage += 1;
      calls.signedUrl += 1;
      calls.catalog += 1;
      throw new Error("production provider sentinel");
    };
    try {
      const selected = resolveAdminOrdersReadSource();
      assert.equal(selected.status, "local_fake");
      const dependencies = { resolveSource: () => selected, loadProduction };

      const page = await loadAdminOrdersPageAfterAuthorization({ attention: "1" }, dependencies);
      assert.equal(page.status, "local_fake");
      assert.equal(page.value.sourceNotice, "LOCAL / TEST ONLY");
      assert.equal(page.value.query.attentionOnly, true);
      assert.ok(page.value.items.length > 0);

      const exportResult = await loadAdminOrdersExportAfterAuthorization({ attention: "1" }, dependencies);
      assert.equal(exportResult.status, "local_fake");
      assert.equal(exportResult.value.length, page.value.totalCount);
      assert.ok(exportResult.value.every((row) => row.currency === "USD"));
      assert.equal(calls.productionOrdersLoader, 0);
      assert.equal(calls.supabaseFactory, 0);
      assert.equal(calls.uploadConfig, 0);
      assert.equal(calls.storage, 0);
      assert.equal(calls.signedUrl, 0);
      assert.equal(calls.catalog, 0);
      assert.equal(calls.fetch, 0);

      const failedSelection = {
        status: "local_fake",
        repository: createLocalAdminOrdersReadRepository({ failure: "source_failure" }),
      };
      const failedPage = await loadAdminOrdersPageAfterAuthorization({}, {
        resolveSource: () => failedSelection,
        loadProduction,
      });
      assert.deepEqual(failedPage, { status: "source_failure", source: "local_fake" });
      const failedExport = await loadAdminOrdersExportAfterAuthorization({}, {
        resolveSource: () => failedSelection,
        loadProduction,
      });
      assert.deepEqual(failedExport, { status: "source_failure", source: "local_fake" });
      assert.equal(calls.productionOrdersLoader, 0);
      assert.equal(calls.supabaseFactory, 0);
      assert.equal(calls.uploadConfig, 0);
      assert.equal(calls.storage, 0);
      assert.equal(calls.signedUrl, 0);
      assert.equal(calls.catalog, 0);
      assert.equal(calls.fetch, 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("Batch E 5.3: shared Catalog state is honest, rollback-safe, and resettable", async () => {
  await withLocalAdminEnvironment(async () => {
    const initial = await readAdminCatalogGraph();
    const product = initial.products.find((entry) => entry.id === productId);
    assert.ok(product);

    const command = new AdminCatalogCommandBoundary(authorized, () => ({
      reader: createAdminCatalogReader(),
      writer: getSharedLocalAdminCatalogRuntime().commandRepository,
    }));
    const saved = await command.execute(
      { kind: "save_product", payload: { ...product, name: "Batch E honest local edit" } },
      { existingResourceId: product.id, preserveLifecycle: true },
    );
    assert.equal(saved.status, "applied");
    assert.equal((await readAdminCatalogGraph()).products.find((entry) => entry.id === product.id).name, "Batch E honest local edit");

    const duplicateSlug = await command.execute(
      { kind: "save_product", payload: { ...product, name: "must roll back", slug: initial.products.find((entry) => entry.id !== product.id).slug } },
      { existingResourceId: product.id, preserveLifecycle: true },
    );
    assert.equal(duplicateSlug.status, "invalid_request");
    assert.equal((await readAdminCatalogGraph()).products.find((entry) => entry.id === product.id).name, "Batch E honest local edit");

    const lifecycle = new AdminCatalogLifecycleBoundary(authorized, () => ({
      writer: getSharedLocalAdminCatalogRuntime().lifecycleRepository,
    }));
    assert.equal((await lifecycle.execute("product", product.id, { action: "unpublish" })).status, "applied");
    assert.equal((await lifecycle.execute("product", product.id, { action: "publish" })).status, "applied");
    const hardDelete = await lifecycle.execute("product", product.id, { action: "delete" });
    assert.equal(hardDelete.status, "invalid_request");
    assert.equal((await readAdminCatalogGraph()).products.some((entry) => entry.id === product.id), true);

    resetSharedAdminAcceptanceRuntimeForTests();
    const resetGraph = await readAdminCatalogGraph();
    assert.equal(resetGraph.products.find((entry) => entry.id === product.id).name, "Custom Couple Figure");

    const publicRepository = createDevelopmentCatalogRepository({ NODE_ENV: "test", PHOTOGIFT_PRODUCT_SOURCE: "fixture" });
    const publicResult = await publicRepository.findPublicProductBySlug("couple-figure");
    assert.equal(publicResult.status, "found");
    assert.equal(publicResult.value.product.name, "Custom Couple Figure");
  });
});

test("Batch E 5.4: local Orders preserve projection, query parity, pagination, privacy, and snapshot isolation", async () => {
  await withLocalAdminEnvironment(async () => {
    const selected = resolveAdminOrdersReadSource();
    assert.equal(selected.status, "local_fake");
    const firstPage = await selected.repository.read();
    assert.equal(firstPage.status, "found");
    assert.equal(firstPage.value.totalCount, 24);
    assert.equal(firstPage.value.pageSize, 20);
    assert.equal(firstPage.value.items.length, 20);
    assert.ok(firstPage.value.items.every((order) => order.customer.displayEmail.endsWith("@example.test")));
    assert.ok(firstPage.value.items.every((order) => order.lineItems.every((item) => item.photo.previewAvailable === false)));

    const secondPage = await selected.repository.read({ page: 2 });
    assert.equal(secondPage.status, "found");
    assert.equal(secondPage.value.items.length, 4);
    const longOrder = await selected.repository.read({ q: "LOCAL-TEST-ORDER-WITH-A-DELIBERATELY-LONG" });
    assert.equal(longOrder.status, "found");
    assert.equal(longOrder.value.totalCount, 1);
    const attention = await selected.repository.read({ attention: "1" });
    assert.equal(attention.status, "found");
    assert.ok(attention.value.items.every((order) => ["awaiting_review", "quality_check", "issue"].includes(order.fulfillmentStatus)));
    const empty = await selected.repository.read({ q: "no-such-local-order" });
    assert.equal(empty.status, "found");
    assert.deepEqual(empty.value.items, []);
    const unavailable = (await import("../app/infrastructure/orders/local-admin-orders-read-repository.server.ts")).createLocalAdminOrdersReadRepository({ failure: "unavailable" });
    assert.deepEqual(await unavailable.read(), { status: "unavailable", reason: "local_admin_orders_unavailable" });

    const serialized = JSON.stringify(firstPage.value);
    assert.doesNotMatch(serialized, /photoPath|privatePath|bucket|storageKey|objectKey|signedUrl|sk_live|pk_live|access[_-]?token|cookie/i);
    const exportRows = await selected.repository.readExportRows();
    assert.equal(exportRows.status, "found");
    assert.equal(exportRows.value.length, 24);
    assert.equal(exportRows.value[0].currency, "USD");

    const ordersBeforeCatalogEdit = firstPage.value.items.map((order) => ({ reference: order.publicReference, total: order.totalCents }));
    const catalog = await readAdminCatalogGraph();
    const product = catalog.products.find((entry) => entry.id === productId);
    assert.ok(product);
    await getSharedLocalAdminCatalogRuntime().commandRepository.saveProduct({ ...product, name: "Catalog-only local edit" });
    const ordersAfterCatalogEdit = (await selected.repository.read()).value.items.map((order) => ({ reference: order.publicReference, total: order.totalCents }));
    assert.deepEqual(ordersAfterCatalogEdit, ordersBeforeCatalogEdit);
  });
});

test("Batch E 5.5/5.6: safe failures do not leak details and Admin source does not drift other runtimes", async () => {
  const pageSource = await readFile(new URL("../app/admin/products/page.tsx", import.meta.url), "utf8");
  const ordersPage = await readFile(new URL("../app/admin/orders/page.tsx", import.meta.url), "utf8");
  const exportRoute = await readFile(new URL("../app/api/admin/orders/export/route.ts", import.meta.url), "utf8");
  assert.match(pageSource, /Catalog administration configuration is invalid/);
  assert.match(pageSource, /production C1 schema must be deployed/);
  assert.match(ordersPage, /loadAdminOrdersPageAfterAuthorization/);
  assert.ok(ordersPage.indexOf("isValidAdminSession") < ordersPage.indexOf("loadAdminOrdersPageAfterAuthorization"));
  assert.ok(ordersPage.indexOf("resolveAdminOrdersReadSource") < ordersPage.indexOf("getSupabaseServerClient()"));
  assert.match(exportRoute, /loadAdminOrdersExportAfterAuthorization/);
  assert.ok(exportRoute.indexOf("isValidAdminSession") < exportRoute.indexOf("loadAdminOrdersExportAfterAuthorization"));
  assert.ok(exportRoute.indexOf("resolveAdminOrdersReadSource") < exportRoute.indexOf("getSupabaseServerClient().from"));

  let factoryCalls = 0;
  const failureProduct = createDevelopmentCatalogFixtures().products.find((entry) => entry.id === productId);
  assert.ok(failureProduct);
  const response = await handleAdminCatalogContentMutation(
    jsonRequest(`/api/admin/catalog/products/${productId}`, { kind: "save_product", payload: failureProduct }),
    "products",
    productId,
    {
      verifier: authorized,
      createRepositories() {
        factoryCalls += 1;
        throw new Error("TOP_SECRET SQL detail and filesystem path");
      },
    },
  );
  assert.equal(response.status, 503);
  const responseText = await response.text();
  assert.doesNotMatch(responseText, /TOP_SECRET|SQL detail|filesystem path|stack|hint|secret/i);
  assert.equal(factoryCalls, 1);

  const adminSource = await readFile(new URL("../app/server/admin-acceptance-source.server.ts", import.meta.url), "utf8");
  assert.doesNotMatch(adminSource, /getSupabaseServerClient|createSignedUrl|\.storage\.|LocalOrderRuntime|LocalPaymentRuntime|LocalFulfillmentRuntime|LocalTrackingRuntime|customer-upload-runtime/);
  assert.doesNotMatch(adminSource, /fetch\(|writeFile|readFile|sqlite|\bD1\b|Drizzle/);
});
