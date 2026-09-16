import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  isRenderablePublicAssetUrl,
  toPublicProductAssetViews,
} from "../app/application/catalog-assets.ts";
import { loadPublicProductPage } from "../app/application/catalog-pages.ts";
import {
  canSelectOptionValue,
  formatListingPrice,
  formatUsdPrice,
  resolveVariantSelection,
  toPublicSelectorVariants,
} from "../app/application/catalog-storefront.ts";
import { parseProductAsset } from "../app/domain/catalog/index.ts";
import { createDevelopmentCatalogFixtures } from "../app/infrastructure/catalog/development-catalog-fixtures.ts";
import { createDevelopmentCatalogRepository } from "../app/infrastructure/catalog/development-catalog-repository.ts";

const fixtureEnvironment = {
  NODE_ENV: "test",
  PHOTOGIFT_PRODUCT_SOURCE: "fixture",
};

function coupleFixtureGraph() {
  const dataSet = createDevelopmentCatalogFixtures();
  const product = dataSet.products.find((candidate) => candidate.slug === "couple-figure");
  assert.ok(product);
  return {
    dataSet,
    product,
    options: dataSet.options.filter((option) => option.productId === product.id),
    optionValues: dataSet.optionValues.filter((value) => value.productId === product.id),
    variants: dataSet.variants.filter((variant) => variant.productId === product.id),
    assets: dataSet.assets.filter((asset) => asset.productId === product.id),
    fulfillment: dataSet.fulfillmentConfigs.find((config) => config.productId === product.id),
  };
}

test("development ProductAssets use parser-valid public references and the controlled fallback", async () => {
  const dataSet = createDevelopmentCatalogFixtures();
  const prohibitedNamespace = /^(?:private|customer|order|preview|delivery):/i;

  assert.equal(dataSet.assets.length, 22);
  for (const asset of dataSet.assets) {
    assert.equal(asset.source.kind, "public_reference");
    assert.equal(parseProductAsset(asset).ok, true);
    assert.equal(asset.source.value.includes("example.com"), false);
    assert.equal(prohibitedNamespace.test(asset.source.value), false);
    assert.equal(isRenderablePublicAssetUrl(asset.source), false);
  }

  for (const namespace of ["private", "customer", "order", "preview", "delivery"]) {
    const sample = structuredClone(dataSet.assets[0]);
    sample.source.value = `${namespace}:fixture-asset`;
    assert.equal(parseProductAsset(sample).ok, false);
  }

  const graph = coupleFixtureGraph();
  const views = toPublicProductAssetViews(graph.product.id, graph.product.name, graph.assets);
  assert.equal(views.length, 1);
  assert.equal(isRenderablePublicAssetUrl(views[0].source), false);

  const gallerySource = await readFile(
    new URL("../app/storefront/ProductAssetGallery.tsx", import.meta.url),
    "utf8",
  );
  assert.match(
    gallerySource,
    /failed \|\| !isRenderablePublicAssetUrl\(asset\.source\)[^\n]*return <AssetFallback asset=\{asset\} \/>/,
  );
  assert.doesNotMatch(gallerySource, /example\.com/);
});

test("couple-figure resolves exact Mini and Standard prices while Deluxe remains unavailable", async () => {
  const graph = coupleFixtureGraph();
  const repository = createDevelopmentCatalogRepository(fixtureEnvironment);
  const products = await repository.listPublicProducts();
  assert.equal(products.status, "found");
  const listing = products.value.find((item) => item.product.id === graph.product.id);
  assert.deepEqual(listing.listingPrice, {
    kind: "starting_at",
    minPriceCents: 6_990,
    maxPriceCents: 8_990,
    currency: "USD",
  });
  assert.equal(formatListingPrice(listing.listingPrice), "From $69.90");

  const mini = graph.variants.find((variant) => variant.skuCode === "DEV-COUPLE-FIGURE-MINI");
  const standard = graph.variants.find((variant) => variant.skuCode === "DEV-COUPLE-FIGURE-STANDARD");
  const deluxe = graph.variants.find((variant) => variant.skuCode === "DEV-COUPLE-FIGURE-DELUXE");
  assert.ok(mini && standard && deluxe);

  assert.deepEqual(
    {
      priceCents: mini.priceCents,
      currency: mini.currency,
      isActive: mini.isActive,
      isAvailable: mini.isAvailable,
      isDefault: mini.isDefault,
    },
    { priceCents: 6_990, currency: "USD", isActive: true, isAvailable: true, isDefault: true },
  );
  assert.deepEqual(
    {
      priceCents: standard.priceCents,
      currency: standard.currency,
      isActive: standard.isActive,
      isAvailable: standard.isAvailable,
    },
    { priceCents: 8_990, currency: "USD", isActive: true, isAvailable: true },
  );
  assert.deepEqual(
    {
      priceCents: deluxe.priceCents,
      currency: deluxe.currency,
      isActive: deluxe.isActive,
      isAvailable: deluxe.isAvailable,
    },
    { priceCents: 10_990, currency: "USD", isActive: true, isAvailable: false },
  );
  assert.equal("inventoryQuantity" in deluxe, false);
  assert.equal("stockQuantity" in deluxe, false);

  for (const expected of [mini, standard]) {
    const resolution = await repository.resolveExactVariant({
      productId: graph.product.id,
      skuCode: expected.skuCode,
    });
    assert.equal(resolution.status, "found");
    assert.equal(resolution.value.id, expected.id);
    assert.equal(resolution.value.skuCode, expected.skuCode);
    assert.equal(resolution.value.priceCents, expected.priceCents);
    assert.equal(resolution.value.currency, "USD");
  }

  assert.deepEqual(
    await repository.resolveExactVariant({
      productId: graph.product.id,
      skuCode: deluxe.skuCode,
    }),
    { status: "unavailable", reason: "no_eligible_variant" },
  );
});

test("existing storefront contracts expose Size, exact price transitions, disabled Deluxe, and fulfillment", async () => {
  const graph = coupleFixtureGraph();
  const repository = createDevelopmentCatalogRepository(fixtureEnvironment);
  const page = await loadPublicProductPage(repository, graph.product.slug);
  assert.equal(page.status, "found");
  assert.deepEqual(
    page.value.options.map(({ code, name, required }) => ({ code, name, required })),
    [{ code: "size", name: "Size", required: true }],
  );
  assert.deepEqual(
    page.value.optionValues.map(({ code, label }) => ({ code, label })),
    [
      { code: "mini", label: "Mini" },
      { code: "standard", label: "Standard" },
      { code: "deluxe", label: "Deluxe" },
    ],
  );

  const selectorVariants = toPublicSelectorVariants(graph.variants);
  const option = graph.options[0];
  const values = Object.fromEntries(graph.optionValues.map((value) => [value.code, value]));
  const baseInput = {
    productId: graph.product.id,
    options: graph.options,
    optionValues: graph.optionValues,
    variants: selectorVariants,
  };

  const mini = resolveVariantSelection({
    ...baseInput,
    selectedOptions: [{ optionId: option.id, valueId: values.mini.id }],
  });
  assert.equal(mini.status, "resolved");
  assert.equal(mini.variant.skuCode, "DEV-COUPLE-FIGURE-MINI");
  assert.equal(formatUsdPrice(mini.variant.priceCents), "$69.90");

  const standard = resolveVariantSelection({
    ...baseInput,
    selectedOptions: [{ optionId: option.id, valueId: values.standard.id }],
  });
  assert.equal(standard.status, "resolved");
  assert.equal(standard.variant.skuCode, "DEV-COUPLE-FIGURE-STANDARD");
  assert.equal(formatUsdPrice(standard.variant.priceCents), "$89.90");

  const deluxeSelection = [{ optionId: option.id, valueId: values.deluxe.id }];
  const deluxe = resolveVariantSelection({ ...baseInput, selectedOptions: deluxeSelection });
  assert.deepEqual(deluxe, { status: "unavailable" });
  assert.equal(deluxe.variant, undefined);
  assert.equal(
    canSelectOptionValue(baseInput, [], deluxeSelection[0]),
    false,
  );

  assert.deepEqual(graph.fulfillment, {
    id: "fixture-fulfillment-couple-figure",
    productId: graph.product.id,
    fulfillmentType: "physical",
    requiresShipping: true,
    productionMode: "custom_manufacturing",
    leadTime: { minBusinessDays: 5, maxBusinessDays: 10 },
  });

  const selectorSource = await readFile(
    new URL("../app/storefront/VariantSelector.tsx", import.meta.url),
    "utf8",
  );
  assert.match(selectorSource, /disabled=\{!selectable\}/);
  assert.match(selectorSource, /formatUsdPrice\(resolution\.variant\.priceCents\)/);
  assert.match(selectorSource, /Selected SKU/);
});
