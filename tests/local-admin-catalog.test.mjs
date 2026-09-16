import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { AdminCatalogCommandBoundary } from "../app/application/admin-catalog-boundary.ts";
import { AdminCatalogLifecycleBoundary } from "../app/application/admin-catalog-lifecycle.ts";
import {
  AdminCustomizationFieldCommandBoundary,
  AdminCustomizationFieldQueryBoundary,
} from "../app/application/admin-customization-field-boundary.ts";
import { AdminProductAssetBoundary } from "../app/application/admin-product-assets.ts";
import { AdminProductFulfillmentBoundary } from "../app/application/admin-product-fulfillment.ts";
import { AdminProductSkuGraphBoundary } from "../app/application/admin-sku-graph.ts";
import { createDevelopmentCatalogRepository } from "../app/infrastructure/catalog/development-catalog-repository.ts";
import { createLocalAdminCatalogRuntime } from "../app/infrastructure/catalog/local-admin-catalog-repository.server.ts";

const authorized = {
  async verifyAdminSession() {
    return { status: "authorized", principal: { role: "admin", identity: "configured-admin" } };
  },
};

function runtimeEnvironment() {
  return { NODE_ENV: "test", PHOTOGIFT_PRODUCT_SOURCE: "fixture" };
}

async function readGraph(runtime) {
  const result = await runtime.reader.readAdminCatalogGraph();
  assert.equal(result.status, "found");
  return result.value;
}

function contentRepositories(runtime) {
  return () => ({ reader: runtime.reader, writer: runtime.commandRepository });
}

function withoutProductId(value) {
  const { productId: ignoredProductId, ...entry } = value;
  void ignoredProductId;
  return entry;
}

test("2.1-2.2: one seeded Admin graph is complete, cloned, and isolated from public fixtures", async () => {
  const runtime = createLocalAdminCatalogRuntime();
  const graph = await readGraph(runtime);
  assert.equal(graph.categories.length, 4);
  assert.equal(graph.products.length, 22);
  assert.equal(graph.options.length, 1);
  assert.equal(graph.optionValues.length, 3);
  assert.equal(graph.variants.length, 24);
  assert.equal(graph.assets.length, 22);
  assert.equal(graph.fulfillmentConfigs.length, 22);

  const returned = graph.products[0];
  returned.name = "caller mutation must not enter state";
  assert.notEqual((await readGraph(runtime)).products[0].name, returned.name);

  const product = graph.products.find((entry) => entry.slug === "glass-light-picture");
  assert.ok(product);
  const localSave = await runtime.commandRepository.saveProduct({ ...product, name: "Local Admin Product Edit" });
  assert.equal(localSave.status, "applied");
  assert.equal((await readGraph(runtime)).products.find((entry) => entry.id === product.id).name, "Local Admin Product Edit");

  const publicRepository = createDevelopmentCatalogRepository(runtimeEnvironment());
  const publicResult = await publicRepository.findPublicProductBySlug("glass-light-picture");
  assert.equal(publicResult.status, "found");
  assert.equal(publicResult.value.product.name, "Custom Glass Light Picture");
});

test("2.3: individual option, option-value, and Variant commands commit through the shared graph", async () => {
  const runtime = createLocalAdminCatalogRuntime();
  const graph = await readGraph(runtime);
  const product = graph.products.find((entry) => entry.slug === "couple-figure");
  assert.ok(product);
  const option = graph.options.find((entry) => entry.productId === product.id);
  const optionValue = graph.optionValues.find((entry) => entry.productId === product.id && entry.code === "standard");
  const variant = graph.variants.find((entry) => entry.productId === product.id && entry.skuCode === "DEV-COUPLE-FIGURE-STANDARD");
  assert.ok(option);
  assert.ok(optionValue);
  assert.ok(variant);
  const boundary = new AdminCatalogCommandBoundary(authorized, contentRepositories(runtime));

  const optionResult = await boundary.execute({ kind: "save_option", payload: { ...option, name: "Individually updated Size" } });
  assert.equal(optionResult.status, "applied");
  const valueResult = await boundary.execute({ kind: "save_option_value", payload: { ...optionValue, label: "Individually updated Standard" } });
  assert.equal(valueResult.status, "applied");
  const variantResult = await boundary.execute({ kind: "save_variant", payload: { ...variant, priceCents: 9_590 } });
  assert.equal(variantResult.status, "applied");

  const updated = await readGraph(runtime);
  assert.equal(updated.options.find((entry) => entry.id === option.id).name, "Individually updated Size");
  assert.equal(updated.optionValues.find((entry) => entry.id === optionValue.id).label, "Individually updated Standard");
  assert.equal(updated.variants.find((entry) => entry.id === variant.id).priceCents, 9_590);
});

test("2.3: existing Admin parsers and bounded content/SKU commands produce honest mutations", async () => {
  const runtime = createLocalAdminCatalogRuntime();
  const graph = await readGraph(runtime);
  const category = graph.categories[0];
  const product = graph.products.find((entry) => entry.slug === "couple-figure");
  assert.ok(product);

  const categoryResult = await new AdminCatalogCommandBoundary(authorized, contentRepositories(runtime)).execute(
    { kind: "save_category", payload: { ...category, description: "Updated local category description." } },
    { existingResourceId: category.id, preserveLifecycle: true },
  );
  assert.equal(categoryResult.status, "applied");
  assert.equal((await readGraph(runtime)).categories.find((entry) => entry.id === category.id).description, "Updated local category description.");

  const productResult = await new AdminCatalogCommandBoundary(authorized, contentRepositories(runtime)).execute(
    { kind: "save_product", payload: { ...product, name: "Updated Local Couple Figure" } },
    { existingResourceId: product.id, preserveLifecycle: true },
  );
  assert.equal(productResult.status, "applied");

  const coupleGraph = {
    productId: product.id,
    options: graph.options.filter((entry) => entry.productId === product.id).map((entry) => ({ ...withoutProductId(entry), name: "Updated Size" })),
    optionValues: graph.optionValues.filter((entry) => entry.productId === product.id).map((entry) => entry.code === "standard" ? { ...withoutProductId(entry), label: "Updated Standard" } : withoutProductId(entry)),
    variants: graph.variants.filter((entry) => entry.productId === product.id).map((entry) => entry.skuCode === "DEV-COUPLE-FIGURE-STANDARD" ? { ...withoutProductId(entry), priceCents: 9_490 } : withoutProductId(entry)),
  };
  const skuResult = await new AdminProductSkuGraphBoundary(authorized, () => ({
    reader: runtime.reader,
    writer: runtime.skuGraphRepository,
  }), async () => { throw new Error("existing identities do not need derivation"); }).execute(product.id, coupleGraph);
  assert.equal(skuResult.status, "applied");
  const afterSku = await readGraph(runtime);
  assert.equal(afterSku.options.find((entry) => entry.productId === product.id).name, "Updated Size");
  assert.equal(afterSku.optionValues.find((entry) => entry.code === "standard").label, "Updated Standard");
  assert.equal(afterSku.variants.find((entry) => entry.skuCode === "DEV-COUPLE-FIGURE-STANDARD").priceCents, 9_490);
});

test("2.3: cross-Product references and invalid SKU graphs fail before commit", async () => {
  const runtime = createLocalAdminCatalogRuntime();
  const initial = await readGraph(runtime);
  const product = initial.products.find((entry) => entry.slug === "couple-figure");
  const foreignProduct = initial.products.find((entry) => entry.slug === "pet-figure");
  const foreignOption = {
    id: "fixture-option-pet-size",
    productId: foreignProduct.id,
    code: "size",
    name: "Pet Size",
    kind: "size",
    required: true,
    position: 0,
  };
  const foreignValue = {
    id: "fixture-value-pet-size-standard",
    productId: foreignProduct.id,
    optionId: foreignOption.id,
    code: "standard",
    label: "Standard",
    position: 0,
  };
  const foreignVariant = initial.variants.find((entry) => entry.productId === foreignProduct.id);
  runtime.state.injectCatalogForTest({
    ...initial,
    options: [...initial.options, foreignOption],
    optionValues: [...initial.optionValues, foreignValue],
    variants: initial.variants.map((entry) => entry.id === foreignVariant.id
      ? { ...entry, selectedOptions: [{ optionId: foreignOption.id, valueId: foreignValue.id }] }
      : entry),
  });
  const before = await readGraph(runtime);

  const crossProduct = await runtime.commandRepository.saveVariant({
    ...before.variants.find((entry) => entry.productId === product.id),
    selectedOptions: [{ optionId: foreignOption.id, valueId: foreignValue.id }],
  });
  assert.equal(crossProduct.status, "invalid_configuration");
  assert.deepEqual(await readGraph(runtime), before);

  const invalidGraph = {
    productId: product.id,
    options: before.options.filter((entry) => entry.productId === product.id),
    optionValues: before.optionValues.filter((entry) => entry.productId === product.id),
    variants: before.variants.filter((entry) => entry.productId === product.id).map((entry) => entry.isDefault ? { ...entry, selectedOptions: [] } : { ...entry }),
  };
  const invalidResult = await new AdminProductSkuGraphBoundary(authorized, () => ({
    reader: runtime.reader,
    writer: runtime.skuGraphRepository,
  }), async () => { throw new Error("no draft identities in this invalid graph"); }).execute(product.id, invalidGraph);
  assert.equal(invalidResult.status, "invalid_request");
  assert.deepEqual(await readGraph(runtime), before);
});

test("2.4: Asset and FulfillmentConfig adapters use current contracts and commit only valid state", async () => {
  const runtime = createLocalAdminCatalogRuntime();
  const initial = await readGraph(runtime);
  const product = initial.products.find((entry) => entry.slug === "glass-light-picture");
  const assetBoundary = new AdminProductAssetBoundary(
    authorized,
    () => ({ reader: runtime.reader, writer: runtime.assetRepository }),
    async () => "local-asset-added",
  );
  const asset = {
    id: "new:local-asset",
    productId: product.id,
    mediaType: "image",
    role: "gallery",
    position: 1,
    altText: "Local gallery asset",
    visibility: "public",
    source: { kind: "public_reference", value: "marketing:local/gallery" },
  };
  const assetResult = await assetBoundary.execute(product.id, { operation: "create", productId: product.id, asset });
  assert.equal(assetResult.status, "applied");
  assert.equal((await readGraph(runtime)).assets.some((entry) => entry.id === "local-asset-added"), true);

  const invalidAsset = await assetBoundary.execute(product.id, {
    operation: "create",
    productId: product.id,
    asset: { ...asset, id: "new:private-asset", source: { kind: "public_reference", value: "private:object" } },
  });
  assert.equal(invalidAsset.status, "invalid_request");
  assert.equal((await readGraph(runtime)).assets.some((entry) => entry.id === "local-asset-added"), true);

  const config = initial.fulfillmentConfigs.find((entry) => entry.productId === product.id);
  const fulfillmentBoundary = new AdminProductFulfillmentBoundary(
    authorized,
    () => ({ reader: runtime.reader, writer: runtime.fulfillmentRepository }),
  );
  const fulfillmentResult = await fulfillmentBoundary.execute(product.id, {
    operation: "update",
    productId: product.id,
    config: { ...config, leadTime: { minBusinessDays: 6, maxBusinessDays: 12 } },
  });
  assert.equal(fulfillmentResult.status, "applied");
  assert.deepEqual((await readGraph(runtime)).fulfillmentConfigs.find((entry) => entry.productId === product.id).leadTime, { minBusinessDays: 6, maxBusinessDays: 12 });

  const invalidFulfillment = await fulfillmentBoundary.execute(product.id, {
    operation: "update",
    productId: product.id,
    config: { ...config, fulfillmentType: "digital", requiresShipping: true },
  });
  assert.equal(invalidFulfillment.status, "invalid_request");
  assert.deepEqual((await readGraph(runtime)).fulfillmentConfigs.find((entry) => entry.productId === product.id).leadTime, { minBusinessDays: 6, maxBusinessDays: 12 });
});

test("2.4: lifecycle adapter mirrors bounded publication actions and has no hard delete", async () => {
  const runtime = createLocalAdminCatalogRuntime();
  const graph = await readGraph(runtime);
  const product = graph.products.find((entry) => entry.slug === "couple-figure");
  const lifecycle = new AdminCatalogLifecycleBoundary(
    authorized,
    () => ({ writer: runtime.lifecycleRepository }),
  );

  const unpublished = await lifecycle.execute("product", product.id, { action: "unpublish" });
  assert.equal(unpublished.status, "applied");
  assert.equal((await readGraph(runtime)).products.find((entry) => entry.id === product.id).lifecycle, "draft");
  const published = await lifecycle.execute("product", product.id, { action: "publish" });
  assert.equal(published.status, "applied");
  const repeated = await lifecycle.execute("product", product.id, { action: "publish" });
  assert.equal(repeated.status, "applied");
  assert.equal(repeated.value.changed, false);
  const retired = await lifecycle.execute("product", product.id, { action: "retire" });
  assert.equal(retired.status, "applied");
  assert.equal((await readGraph(runtime)).products.find((entry) => entry.id === product.id).lifecycle, "retired");

  const destructive = await runtime.lifecycleRepository.applyLifecycleIntent({
    targetType: "product",
    targetId: product.id,
    action: "destructive_state_mutation_attempt",
    actorBoundary: "configured_admin_session",
    actorIdentifier: "configured-admin",
  });
  assert.deepEqual(destructive, { status: "rejected", reason: "destructive_mutation_forbidden" });
  assert.equal((await readGraph(runtime)).products.find((entry) => entry.id === product.id).lifecycle, "retired");
});

test("2.4: Catalog-adjacent CustomizationField composition is local and provider-neutral", async () => {
  const runtime = createLocalAdminCatalogRuntime();
  const productId = "fixture-product-glass-light-picture";
  const query = new AdminCustomizationFieldQueryBoundary(authorized, () => runtime.customizationRepository);
  const current = await query.execute({ productId });
  assert.equal(current.status, "found");
  assert.equal(current.value.status, "configured");
  const first = current.value.fields[0];
  const replacement = current.value.fields.map((field, index) => ({
    identity: { kind: "existing", id: field.id, code: field.code },
    label: index === 0 ? "Updated local label" : field.label,
    kind: field.kind,
    required: field.required,
    isActive: field.isActive,
    position: field.position,
    constraints: field.constraints,
  }));
  const saved = await new AdminCustomizationFieldCommandBoundary(authorized, () => ({
    reader: runtime.customizationRepository,
    writer: runtime.customizationRepository,
  })).execute({
    productId,
    expectedCurrentRevision: current.value.configurationRevision,
    fields: replacement,
  });
  assert.equal(saved.status, "applied");
  assert.notEqual(saved.value.configurationRevision, current.value.configurationRevision);
  assert.equal(saved.value.fields.find((field) => field.id === first.id).label, "Updated local label");
  const notConfigured = await query.execute({ productId: "fixture-product-pet-figure" });
  assert.equal(notConfigured.status, "found");
  assert.equal(notConfigured.value.status, "not_configured");
});

test("2.5: reset/injection seams restore deterministic state and do not persist or bleed between instances", async () => {
  const runtime = createLocalAdminCatalogRuntime();
  const initial = await readGraph(runtime);
  const product = initial.products[0];
  await runtime.commandRepository.saveProduct({ ...product, name: "temporary local mutation" });
  assert.equal((await readGraph(runtime)).products[0].name, "temporary local mutation");
  runtime.state.resetForTest();
  assert.deepEqual(await readGraph(runtime), initial);

  runtime.state.injectCatalogForTest({ ...initial, fulfillmentConfigs: initial.fulfillmentConfigs.slice(1) });
  const invalid = await runtime.reader.readAdminCatalogGraph();
  assert.equal(invalid.status, "found");
  const publicReadAfterInvalidInjection = await runtime.reader.listPublicProducts();
  assert.equal(publicReadAfterInvalidInjection.status, "invalid_configuration");
  runtime.state.resetForTest();
  assert.deepEqual(await readGraph(runtime), initial);

  const freshRuntime = createLocalAdminCatalogRuntime();
  assert.deepEqual(await readGraph(freshRuntime), initial);

  const sourceFactory = await readFile(new URL("../app/infrastructure/catalog/local-admin-catalog-repository.server.ts", import.meta.url), "utf8");
  assert.doesNotMatch(sourceFactory, /@supabase|fetch\(|createSignedUrl|writeFile|readFile|sqlite|\bD1\b|Drizzle|localStorage|sessionStorage/);
});
