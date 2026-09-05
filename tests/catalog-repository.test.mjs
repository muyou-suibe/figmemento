import assert from "node:assert/strict";
import test from "node:test";

import { isRenderablePublicAssetUrl } from "../app/application/catalog-assets.ts";
import {
  catalogGraphForProduct,
  validateCatalogDataSet,
} from "../app/application/catalog-data-set.ts";
import { CatalogRepositoryService } from "../app/application/catalog-repository.ts";
import { ServerConfigurationError } from "../app/config/server.ts";
import {
  canonicalVariantSignature,
  evaluatePublicEligibility,
  parseProductAsset,
} from "../app/domain/catalog/index.ts";
import { createDevelopmentCatalogFixtures } from "../app/infrastructure/catalog/development-catalog-fixtures.ts";
import { createDevelopmentCatalogRepository } from "../app/infrastructure/catalog/development-catalog-repository.ts";
import { mapSupabaseCatalogRows } from "../app/infrastructure/catalog/supabase-catalog-mapper.ts";
import { SupabaseCatalogRepository } from "../app/infrastructure/catalog/supabase-catalog-repository.ts";

function cloneFixtures() {
  return structuredClone(createDevelopmentCatalogFixtures());
}

function repositoryFor(dataSet) {
  return new CatalogRepositoryService({
    async loadCatalogDataSet() {
      return { status: "found", value: dataSet };
    },
  });
}

function supabaseRowsFrom(dataSet) {
  return {
    categories: dataSet.categories.map((category) => ({
      id: category.id,
      slug: category.slug,
      name: category.name,
      description: category.description,
      seo: category.seo,
      lifecycle: category.lifecycle,
    })),
    products: dataSet.products.map((product) => ({
      id: product.id,
      slug: product.slug,
      category_id: product.categoryId,
      name: product.name,
      description: product.description,
      seo: product.seo,
      lifecycle: product.lifecycle,
      price_cents: 1,
      currency: "EUR",
    })),
    productOptions: dataSet.options.map((option) => ({
      id: option.id,
      product_id: option.productId,
      code: option.code,
      name: option.name,
      kind: option.kind,
      is_required: option.required,
      position: option.position,
    })),
    productOptionValues: dataSet.optionValues.map((value) => ({
      id: value.id,
      product_id: value.productId,
      option_id: value.optionId,
      code: value.code,
      label: value.label,
      position: value.position,
    })),
    productVariants: dataSet.variants.map((variant) => ({
      id: variant.id,
      product_id: variant.productId,
      sku_code: variant.skuCode,
      price_cents: variant.priceCents,
      currency: variant.currency,
      weight_grams: variant.weightGrams,
      is_active: variant.isActive,
      is_available: variant.isAvailable,
      is_default: variant.isDefault,
      supply_method: variant.supplyMethod,
      combination_signature: canonicalVariantSignature(variant.selectedOptions),
    })),
    productVariantValues: dataSet.variants.flatMap((variant) =>
      variant.selectedOptions.map((selection) => ({
        variant_id: variant.id,
        product_id: variant.productId,
        option_id: selection.optionId,
        option_value_id: selection.valueId,
      })),
    ),
    productAssets: dataSet.assets.map((asset) => ({
      id: asset.id,
      product_id: asset.productId,
      variant_id: asset.variantId ?? null,
      media_type: asset.mediaType,
      role: asset.role,
      position: asset.position,
      alt_text: asset.altText ?? null,
      title: asset.title ?? null,
      width: asset.width ?? null,
      height: asset.height ?? null,
      visibility: asset.visibility,
      source_kind: asset.source.kind,
      source_value: asset.source.value,
    })),
    productFulfillmentConfigs: dataSet.fulfillmentConfigs.map((config) => ({
      id: config.id,
      product_id: config.productId,
      fulfillment_type: config.fulfillmentType,
      requires_shipping: config.requiresShipping,
      production_mode: config.productionMode,
      min_lead_time_business_days: config.leadTime.minBusinessDays,
      max_lead_time_business_days: config.leadTime.maxBusinessDays,
    })),
  };
}

function addSizedStartingPrice(dataSet, slug = "custom-pillow") {
  const product = dataSet.products.find((candidate) => candidate.slug === slug);
  const defaultVariant = dataSet.variants.find((candidate) => candidate.productId === product.id);
  const option = {
    id: `fixture-option-${slug}-size`,
    productId: product.id,
    code: "size",
    name: "Size",
    kind: "size",
    required: true,
    position: 0,
  };
  const small = {
    id: `fixture-value-${slug}-small`,
    productId: product.id,
    optionId: option.id,
    code: "small",
    label: "Small",
    position: 0,
  };
  const large = {
    id: `fixture-value-${slug}-large`,
    productId: product.id,
    optionId: option.id,
    code: "large",
    label: "Large",
    position: 1,
  };
  dataSet.options.push(option);
  dataSet.optionValues.push(small, large);
  defaultVariant.selectedOptions = [{ optionId: option.id, valueId: small.id }];
  dataSet.variants.push({
    ...defaultVariant,
    id: `fixture-variant-${slug}-large`,
    skuCode: `DEV-${slug.toUpperCase()}-LARGE`,
    priceCents: defaultVariant.priceCents + 1_000,
    isDefault: false,
    selectedOptions: [{ optionId: option.id, valueId: large.id }],
  });
  return { product, defaultVariant };
}

test("public repositories filter unpublished Categories and draft or retired Products", async () => {
  const dataSet = cloneFixtures();
  const hiddenCategory = dataSet.categories.find((category) => category.slug === "pet-memories");
  hiddenCategory.lifecycle = "draft";
  dataSet.products.find((product) => product.slug === "couple-figure").lifecycle = "draft";
  dataSet.products.find((product) => product.slug === "custom-pillow").lifecycle = "retired";
  const repository = repositoryFor(dataSet);

  const categories = await repository.listPublicCategories();
  assert.equal(categories.status, "found");
  assert.deepEqual(categories.value.map((category) => category.slug), ["3d-figures", "custom-crafts", "digital-gifts"]);

  const products = await repository.listPublicProducts();
  assert.equal(products.status, "found");
  assert.equal(products.value.some(({ product }) => product.slug === "couple-figure"), false);
  assert.equal(products.value.some(({ product }) => product.slug === "custom-pillow"), false);
  assert.equal(products.value.some(({ product }) => product.categoryId === hiddenCategory.id), false);
});

test("the development catalog is complete, publicly eligible, and resolves an exact SKU", async () => {
  const dataSet = createDevelopmentCatalogFixtures();
  assert.deepEqual(
    {
      products: dataSet.products.length,
      categories: dataSet.categories.length,
      options: dataSet.options.length,
      optionValues: dataSet.optionValues.length,
      variants: dataSet.variants.length,
      assets: dataSet.assets.length,
      fulfillmentConfigs: dataSet.fulfillmentConfigs.length,
    },
    {
      products: 22,
      categories: 4,
      options: 1,
      optionValues: 3,
      variants: 24,
      assets: 22,
      fulfillmentConfigs: 22,
    },
  );
  assert.deepEqual(validateCatalogDataSet(dataSet), { ok: true, value: true });
  assert.equal(dataSet.assets.every((asset) => parseProductAsset(asset).ok), true);
  assert.equal(dataSet.assets.every((asset) => asset.source.kind === "public_reference"), true);
  assert.equal(
    dataSet.assets.every((asset) => {
      const product = dataSet.products.find((candidate) => candidate.id === asset.productId);
      return asset.source.value === `marketing:development-catalog/${product.slug}/thumbnail`;
    }),
    true,
  );
  assert.equal(dataSet.assets.some((asset) => asset.source.value.includes("example.com")), false);
  assert.equal(dataSet.assets.some((asset) => isRenderablePublicAssetUrl(asset.source)), false);

  const coupleProduct = dataSet.products.find((product) => product.slug === "couple-figure");
  const coupleOption = dataSet.options.find((option) => option.productId === coupleProduct.id);
  assert.deepEqual(coupleOption, {
    id: "fixture-option-couple-figure-size",
    productId: coupleProduct.id,
    code: "size",
    name: "Size",
    kind: "size",
    required: true,
    position: 0,
  });
  assert.deepEqual(
    dataSet.optionValues
      .filter((value) => value.optionId === coupleOption.id)
      .map(({ code, label, position }) => ({ code, label, position })),
    [
      { code: "mini", label: "Mini", position: 0 },
      { code: "standard", label: "Standard", position: 1 },
      { code: "deluxe", label: "Deluxe", position: 2 },
    ],
  );
  const coupleVariants = dataSet.variants.filter((variant) => variant.productId === coupleProduct.id);
  assert.deepEqual(
    coupleVariants.map(({ skuCode, priceCents, currency, weightGrams, isActive, isAvailable, isDefault, supplyMethod }) => ({
      skuCode,
      priceCents,
      currency,
      weightGrams,
      isActive,
      isAvailable,
      isDefault,
      supplyMethod,
    })),
    [
      { skuCode: "DEV-COUPLE-FIGURE-MINI", priceCents: 6_990, currency: "USD", weightGrams: 450, isActive: true, isAvailable: true, isDefault: true, supplyMethod: "made_to_order" },
      { skuCode: "DEV-COUPLE-FIGURE-STANDARD", priceCents: 8_990, currency: "USD", weightGrams: 450, isActive: true, isAvailable: true, isDefault: false, supplyMethod: "made_to_order" },
      { skuCode: "DEV-COUPLE-FIGURE-DELUXE", priceCents: 10_990, currency: "USD", weightGrams: 450, isActive: true, isAvailable: false, isDefault: false, supplyMethod: "made_to_order" },
    ],
  );
  assert.equal(coupleVariants.every((variant) => variant.selectedOptions.length === 1), true);

  const otherProductIds = new Set(
    dataSet.products
      .filter((product) => product.id !== coupleProduct.id)
      .map((product) => product.id),
  );
  assert.equal(otherProductIds.size, 21);
  assert.equal(
    [...otherProductIds].every((productId) => {
      const variants = dataSet.variants.filter((variant) => variant.productId === productId);
      return variants.length === 1 && variants[0].isDefault && variants[0].selectedOptions.length === 0;
    }),
    true,
  );
  assert.equal(new Set(dataSet.variants.map((variant) => variant.skuCode)).size, dataSet.variants.length);
  assert.equal(dataSet.variants.every((variant) => variant.currency === "USD"), true);
  assert.equal(
    dataSet.products.every((product) =>
      dataSet.fulfillmentConfigs.filter((config) => config.productId === product.id).length === 1
    ),
    true,
  );
  assert.deepEqual(
    dataSet.fulfillmentConfigs.find((config) => config.productId === coupleProduct.id),
    {
      id: "fixture-fulfillment-couple-figure",
      productId: coupleProduct.id,
      fulfillmentType: "physical",
      requiresShipping: true,
      productionMode: "custom_manufacturing",
      leadTime: { minBusinessDays: 5, maxBusinessDays: 10 },
    },
  );
  const coupleGraph = catalogGraphForProduct(dataSet, coupleProduct);
  assert.equal(coupleGraph.ok, true);
  assert.ok(coupleGraph.ok);
  assert.deepEqual(evaluatePublicEligibility(coupleGraph.value), {
    eligible: true,
    listingPrice: {
      kind: "starting_at",
      minPriceCents: 6_990,
      maxPriceCents: 8_990,
      currency: "USD",
    },
    eligibleVariantIds: [
      "fixture-variant-couple-figure-mini",
      "fixture-variant-couple-figure-standard",
    ],
  });

  const repository = createDevelopmentCatalogRepository({
    NODE_ENV: "test",
    PHOTOGIFT_PRODUCT_SOURCE: "fixture",
  });
  const products = await repository.listPublicProducts();
  assert.equal(products.status, "found");
  assert.equal(products.value.length, 22);
  const couple = products.value.find(({ product }) => product.slug === "couple-figure");
  assert.deepEqual(couple.listingPrice, {
    kind: "starting_at",
    minPriceCents: 6_990,
    maxPriceCents: 8_990,
    currency: "USD",
  });

  const detail = await repository.findPublicProductBySlug("couple-figure");
  assert.equal(detail.status, "found");
  const mini = detail.value.variants.find((variant) => variant.skuCode === "DEV-COUPLE-FIGURE-MINI");
  const resolution = await repository.resolveExactVariant({
    productId: detail.value.product.id,
    skuCode: mini.skuCode,
  });
  assert.equal(resolution.status, "found");
  assert.equal(resolution.value.priceCents, 6_990);
});

test("listing prices are Variant-authoritative for same-price and starting-at products", async () => {
  const dataSet = cloneFixtures();
  const { product, defaultVariant } = addSizedStartingPrice(dataSet);
  const rows = supabaseRowsFrom(dataSet);
  const mapped = mapSupabaseCatalogRows(rows);
  assert.equal(mapped.status, "found");
  const repository = repositoryFor(mapped.value);
  const summary = await repository.listPublicProducts();
  assert.equal(summary.status, "found");
  assert.deepEqual(
    summary.value.find((item) => item.product.id === product.id).listingPrice,
    {
      kind: "starting_at",
      minPriceCents: defaultVariant.priceCents,
      maxPriceCents: defaultVariant.priceCents + 1_000,
      currency: "USD",
    },
  );
  assert.notEqual(defaultVariant.priceCents, rows.products.find((row) => row.id === product.id).price_cents);
});

test("inactive and unavailable Variants are excluded without selecting a fallback", async () => {
  for (const field of ["isActive", "isAvailable"]) {
    const dataSet = cloneFixtures();
    const product = dataSet.products.find((candidate) => candidate.slug === "couple-figure");
    dataSet.variants
      .filter((candidate) => candidate.productId === product.id)
      .forEach((variant) => {
        variant[field] = false;
      });
    const repository = repositoryFor(dataSet);
    const products = await repository.listPublicProducts();
    assert.equal(products.status, "found");
    assert.equal(products.value.some((item) => item.product.id === product.id), false);
    assert.deepEqual(await repository.findPublicProductBySlug(product.slug), {
      status: "unavailable",
      reason: "no_eligible_variant",
    });
  }
});

test("catalog graph ownership failures and malformed Supabase Variants are explicit", async () => {
  const crossProduct = cloneFixtures();
  crossProduct.products[0].categoryId = "missing-category";
  const invalidGraph = await repositoryFor(crossProduct).readAdminCatalogGraph();
  assert.equal(invalidGraph.status, "invalid_configuration");
  assert.equal(invalidGraph.issues.some((issue) => issue.code === "ownership"), true);

  const rows = supabaseRowsFrom(cloneFixtures());
  rows.productVariants[0].price_cents = "6990";
  const malformed = mapSupabaseCatalogRows(rows);
  assert.equal(malformed.status, "invalid_configuration");
  assert.equal(malformed.issues.some((issue) => issue.path.includes("priceCents")), true);
});

test("cross-Product assets are rejected and ProductAssets are ordered by position", async () => {
  const invalidData = cloneFixtures();
  invalidData.assets[0].variantId = invalidData.variants.find(
    (variant) => variant.productId !== invalidData.assets[0].productId,
  ).id;
  const invalid = await repositoryFor(invalidData).readAdminCatalogGraph();
  assert.equal(invalid.status, "invalid_configuration");
  assert.equal(invalid.issues.some((issue) => issue.code === "ownership"), true);

  const dataSet = cloneFixtures();
  const product = dataSet.products.find((candidate) => candidate.slug === "couple-figure");
  const original = dataSet.assets.find((asset) => asset.productId === product.id);
  original.position = 2;
  dataSet.assets.push(
    { ...original, id: "fixture-asset-couple-first", role: "gallery", position: 0 },
    { ...original, id: "fixture-asset-couple-second", role: "detail", position: 1 },
  );
  const detail = await repositoryFor(dataSet).findPublicProductBySlug(product.slug);
  assert.equal(detail.status, "found");
  assert.deepEqual(detail.value.assets.map((asset) => asset.position), [0, 1, 2]);
});

test("Supabase mapping preserves provider-neutral FulfillmentConfig fields", () => {
  const mapped = mapSupabaseCatalogRows(supabaseRowsFrom(cloneFixtures()));
  assert.equal(mapped.status, "found");
  const digital = mapped.value.products.find((product) => product.slug === "digital-portrait");
  const fulfillment = mapped.value.fulfillmentConfigs.find((config) => config.productId === digital.id);
  assert.deepEqual(fulfillment, {
    id: "fixture-fulfillment-digital-portrait",
    productId: digital.id,
    fulfillmentType: "digital",
    requiresShipping: false,
    productionMode: "digital_creation",
    leadTime: { minBusinessDays: 1, maxBusinessDays: 2 },
  });
  assert.equal("supplyMethod" in fulfillment, false);
});

test("Supabase source failures return source_failure and never substitute fixtures", async () => {
  const repository = new SupabaseCatalogRepository({
    async readCatalogTables() {
      throw new Error("controlled Supabase outage");
    },
  });
  assert.deepEqual(await repository.listPublicProducts(), {
    status: "source_failure",
    operation: "catalog.read",
  });
});

test("development fixtures require explicit non-production selection", async () => {
  const selected = createDevelopmentCatalogRepository({
    NODE_ENV: "test",
    PHOTOGIFT_PRODUCT_SOURCE: "fixture",
  });
  const products = await selected.listPublicProducts();
  assert.equal(products.status, "found");
  assert.equal(products.value.length, 22);

  assert.throws(
    () => createDevelopmentCatalogRepository({
      NODE_ENV: "production",
      PHOTOGIFT_PRODUCT_SOURCE: "fixture",
    }),
    (error) => error instanceof ServerConfigurationError && error.key === "PHOTOGIFT_PRODUCT_SOURCE",
  );
});
