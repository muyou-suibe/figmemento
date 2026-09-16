import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  isRenderablePublicAssetUrl,
  recordProductAssetFailure,
  selectProductAssetViews,
  toPublicProductAssetViews,
} from "../app/application/catalog-assets.ts";
import {
  loadPublicCategoryPage,
  loadPublicProductPage,
  loadPublicShopPage,
} from "../app/application/catalog-pages.ts";
import {
  buildCategoryMetadataModel,
  buildProductMetadataModel,
  buildPublicCatalogSitemapPaths,
} from "../app/application/catalog-seo.ts";
import { CatalogRepositoryService } from "../app/application/catalog-repository.ts";
import {
  canSelectOptionValue,
  filterCatalogProducts,
  formatListingPrice,
  resolveVariantSelection,
  toPublicSelectorVariants,
} from "../app/application/catalog-storefront.ts";
import { createDevelopmentCatalogFixtures } from "../app/infrastructure/catalog/development-catalog-fixtures.ts";
import { createServerCatalogRepository } from "../app/infrastructure/catalog/server-catalog-repository.ts";

const productId = "product-one";
const sizeOption = {
  id: "option-size",
  productId,
  code: "size",
  name: "Size",
  kind: "size",
  required: true,
  position: 0,
};
const colorOption = {
  id: "option-color",
  productId,
  code: "color",
  name: "Color",
  kind: "color",
  required: true,
  position: 1,
};
const smallValue = {
  id: "value-small",
  productId,
  optionId: sizeOption.id,
  code: "small",
  label: "Small",
  position: 0,
};
const largeValue = {
  ...smallValue,
  id: "value-large",
  code: "large",
  label: "Large",
  position: 1,
};
const coralValue = {
  id: "value-coral",
  productId,
  optionId: colorOption.id,
  code: "coral",
  label: "Coral",
  position: 0,
};
const sageValue = {
  ...coralValue,
  id: "value-sage",
  code: "sage",
  label: "Sage",
  position: 1,
};

function variant(id, skuCode, priceCents, selectedOptions, overrides = {}) {
  return {
    id,
    productId,
    skuCode,
    priceCents,
    currency: "USD",
    weightGrams: 300,
    isActive: true,
    isAvailable: true,
    isDefault: false,
    supplyMethod: "made_to_order",
    selectedOptions,
    ...overrides,
  };
}

const smallCoral = variant("variant-small-coral", "SKU-SMALL-CORAL", 2_500, [
  { optionId: sizeOption.id, valueId: smallValue.id },
  { optionId: colorOption.id, valueId: coralValue.id },
]);
const largeSage = variant("variant-large-sage", "SKU-LARGE-SAGE", 3_500, [
  { optionId: sizeOption.id, valueId: largeValue.id },
  { optionId: colorOption.id, valueId: sageValue.id },
]);

function selectionInput(overrides = {}) {
  return {
    productId,
    options: [sizeOption, colorOption],
    optionValues: [smallValue, largeValue, coralValue, sageValue],
    variants: [smallCoral, largeSage],
    selectedOptions: [],
    ...overrides,
  };
}

function summary(id, name, categoryId, categoryName, description = "A thoughtful gift") {
  return {
    category: {
      id: categoryId,
      slug: categoryId,
      name: categoryName,
      description: `${categoryName} description`,
      seo: {},
      lifecycle: "published",
    },
    product: {
      id,
      slug: id,
      categoryId,
      name,
      description,
      seo: {},
      lifecycle: "published",
    },
    listingPrice: { kind: "single", priceCents: 2_500, currency: "USD" },
  };
}

function repositoryFor(dataSet) {
  return new CatalogRepositoryService({
    async loadCatalogDataSet() {
      return { status: "found", value: dataSet };
    },
  });
}

function cloneFixtures() {
  return structuredClone(createDevelopmentCatalogFixtures());
}

test("catalog discovery filters published read models and orders results deterministically", () => {
  const products = [
    summary("z-pet", "Pet Portrait", "pets", "Pet Memories"),
    summary("a-couple", "Couple Figure", "figures", "3D Figures"),
    summary("m-pillow", "Photo Pillow", "crafts", "Custom Crafts"),
  ];

  assert.deepEqual(
    filterCatalogProducts(products, {}).map((item) => item.product.name),
    ["Couple Figure", "Pet Portrait", "Photo Pillow"],
  );
  assert.deepEqual(
    filterCatalogProducts(products, { categoryId: "pets" }).map((item) => item.product.id),
    ["z-pet"],
  );
  assert.deepEqual(
    filterCatalogProducts(products, { query: "  figure " }).map((item) => item.product.id),
    ["a-couple"],
  );
  assert.deepEqual(filterCatalogProducts(products, { query: "not present" }), []);
});

test("listing presentation distinguishes one price from a starting price", () => {
  assert.equal(formatListingPrice({ kind: "single", priceCents: 2_500, currency: "USD" }), "$25.00");
  assert.equal(
    formatListingPrice({ kind: "starting_at", minPriceCents: 2_500, maxPriceCents: 3_500, currency: "USD" }),
    "From $25.00",
  );
});

test("variant selection requires every required SKU option", () => {
  assert.deepEqual(
    resolveVariantSelection(selectionInput({
      selectedOptions: [{ optionId: sizeOption.id, valueId: smallValue.id }],
    })),
    { status: "incomplete", missingOptionIds: [colorOption.id] },
  );
});

test("variant selection resolves one eligible SKU and emits identifiers only", () => {
  const result = resolveVariantSelection(selectionInput({
    selectedOptions: [
      { optionId: colorOption.id, valueId: coralValue.id },
      { optionId: sizeOption.id, valueId: smallValue.id },
    ],
  }));
  assert.equal(result.status, "resolved");
  assert.equal(result.variant.priceCents, 2_500);
  assert.deepEqual(Object.keys(result.payload).sort(), ["productId", "selectedOptions", "skuCode", "variantId"]);
  assert.deepEqual(result.payload, {
    productId,
    variantId: smallCoral.id,
    skuCode: smallCoral.skuCode,
    selectedOptions: [
      { optionId: colorOption.id, valueId: coralValue.id },
      { optionId: sizeOption.id, valueId: smallValue.id },
    ],
  });
  assert.equal("priceCents" in result.payload, false);
  assert.equal("currency" in result.payload, false);
  assert.equal("customization" in result.payload, false);
});

test("the serialized selector Variant DTO excludes fulfillment, weight, and default metadata", () => {
  const fullVariant = {
    ...smallCoral,
    weightGrams: 725,
    supplyMethod: "made_to_order",
    isDefault: true,
  };
  const [selectorVariant] = toPublicSelectorVariants([fullVariant]);
  assert.deepEqual(Object.keys(selectorVariant).sort(), [
    "currency",
    "id",
    "isActive",
    "isAvailable",
    "priceCents",
    "productId",
    "selectedOptions",
    "skuCode",
  ]);
  assert.equal("weightGrams" in selectorVariant, false);
  assert.equal("supplyMethod" in selectorVariant, false);
  assert.equal("isDefault" in selectorVariant, false);
});

test("variant selection rejects duplicate, cross-Product, and unknown Option Values", () => {
  const duplicate = resolveVariantSelection(selectionInput({
    selectedOptions: [
      { optionId: sizeOption.id, valueId: smallValue.id },
      { optionId: sizeOption.id, valueId: largeValue.id },
      { optionId: colorOption.id, valueId: coralValue.id },
    ],
  }));
  assert.equal(duplicate.status, "invalid");

  const foreignValue = { ...smallValue, id: "foreign-value", productId: "other-product" };
  const crossProduct = resolveVariantSelection(selectionInput({
    optionValues: [smallValue, largeValue, coralValue, sageValue, foreignValue],
    selectedOptions: [
      { optionId: sizeOption.id, valueId: foreignValue.id },
      { optionId: colorOption.id, valueId: coralValue.id },
    ],
  }));
  assert.equal(crossProduct.status, "invalid");
});

test("invalid or unavailable combinations never fall back to a default Variant", () => {
  const defaultVariant = { ...smallCoral, isDefault: true };
  const invalid = resolveVariantSelection(selectionInput({
    variants: [defaultVariant, largeSage],
    selectedOptions: [
      { optionId: sizeOption.id, valueId: largeValue.id },
      { optionId: colorOption.id, valueId: coralValue.id },
    ],
  }));
  assert.equal(invalid.status, "invalid");

  const unavailable = resolveVariantSelection(selectionInput({
    variants: [{ ...smallCoral, isAvailable: false }, largeSage],
    selectedOptions: smallCoral.selectedOptions,
  }));
  assert.equal(unavailable.status, "unavailable");
});

test("selector eligibility excludes values that cannot lead to an active available SKU", () => {
  const input = selectionInput({
    variants: [smallCoral, { ...largeSage, isActive: false }],
  });
  assert.equal(
    canSelectOptionValue(input, [], { optionId: sizeOption.id, valueId: smallValue.id }),
    true,
  );
  assert.equal(
    canSelectOptionValue(input, [], { optionId: sizeOption.id, valueId: largeValue.id }),
    false,
  );
});

test("a Product without SKU options resolves its one empty eligible default Variant", () => {
  const defaultVariant = variant("variant-default", "SKU-DEFAULT", 1_900, [], { isDefault: true });
  const result = resolveVariantSelection({
    productId,
    options: [],
    optionValues: [],
    variants: [defaultVariant],
    selectedOptions: [],
  });
  assert.equal(result.status, "resolved");
  assert.equal(result.payload.variantId, defaultVariant.id);
});

test("storefront server source uses explicit nonproduction fixtures and rejects them in production", async () => {
  const development = await createServerCatalogRepository({
    NODE_ENV: "test",
    PHOTOGIFT_PRODUCT_SOURCE: "fixture",
  });
  assert.equal(development.status, "found");
  assert.equal(development.value.source, "fixture");
  const products = await development.value.repository.listPublicProducts();
  assert.equal(products.status, "found");
  assert.equal(products.value.length, 22);

  const production = await createServerCatalogRepository({
    NODE_ENV: "production",
    PHOTOGIFT_PRODUCT_SOURCE: "fixture",
  });
  assert.deepEqual(production, {
    status: "source_failure",
    operation: "catalog.configure",
  });
});

test("public route loaders preserve eligible, not-found, unavailable, and outage semantics", async () => {
  const availableData = cloneFixtures();
  const availableRepository = repositoryFor(availableData);
  const shop = await loadPublicShopPage(availableRepository);
  assert.equal(shop.status, "found");
  assert.equal(shop.value.products.length, 22);

  const category = await loadPublicCategoryPage(availableRepository, "3d-figures");
  assert.equal(category.status, "found");
  assert.ok(category.value.products.every((item) => item.category.slug === "3d-figures"));
  assert.deepEqual(category.value.categories.map((item) => item.slug), [
    "3d-figures",
    "custom-crafts",
    "digital-gifts",
    "pet-memories",
  ]);
  assert.equal((await loadPublicCategoryPage(availableRepository, "unknown-category")).status, "not_found");
  assert.equal((await loadPublicProductPage(availableRepository, "unknown-product")).status, "not_found");

  const hiddenData = cloneFixtures();
  hiddenData.categories.find((item) => item.slug === "3d-figures").lifecycle = "draft";
  hiddenData.products.find((item) => item.slug === "pet-figure").lifecycle = "draft";
  const hiddenRepository = repositoryFor(hiddenData);
  assert.equal((await loadPublicCategoryPage(hiddenRepository, "3d-figures")).status, "not_found");
  assert.equal((await loadPublicProductPage(hiddenRepository, "pet-figure")).status, "not_found");

  const unavailableData = cloneFixtures();
  const unavailableProduct = unavailableData.products.find((item) => item.slug === "couple-figure");
  unavailableData.variants
    .filter((item) => item.productId === unavailableProduct.id)
    .forEach((variant) => {
      variant.isAvailable = false;
    });
  assert.equal(
    (await loadPublicProductPage(repositoryFor(unavailableData), "couple-figure")).status,
    "unavailable",
  );

  const sourceFailureRepository = {
    async listPublicCategories() { return { status: "source_failure", operation: "catalog.read" }; },
    async listPublicProducts() { return { status: "source_failure", operation: "catalog.read" }; },
    async findPublicProductBySlug() { return { status: "source_failure", operation: "catalog.read" }; },
    async resolveExactVariant() { return { status: "source_failure", operation: "catalog.read" }; },
  };
  assert.equal((await loadPublicShopPage(sourceFailureRepository)).status, "source_failure");

  const invalidRepository = {
    ...sourceFailureRepository,
    async listPublicCategories() {
      return { status: "invalid_configuration", issues: [] };
    },
  };
  assert.equal((await loadPublicShopPage(invalidRepository)).status, "invalid_configuration");
});

test("ProductAsset views preserve approved media, order, accessibility, and SKU preference", () => {
  const assets = [
    {
      id: "asset-product-video",
      productId,
      mediaType: "video",
      role: "gallery",
      position: 2,
      title: "A short turntable view",
      visibility: "public",
      source: { kind: "url", value: "https://assets.example.test/turntable.mp4" },
    },
    {
      id: "asset-product-image",
      productId,
      mediaType: "image",
      role: "thumbnail",
      position: 1,
      altText: "Front view of the keepsake",
      visibility: "public",
      source: { kind: "url", value: "https://assets.example.test/front.webp" },
    },
    {
      id: "asset-variant-image",
      productId,
      variantId: smallCoral.id,
      mediaType: "image",
      role: "detail",
      position: 3,
      visibility: "public",
      source: { kind: "url", value: "https://assets.example.test/coral.webp" },
    },
    {
      id: "asset-reference",
      productId,
      mediaType: "image",
      role: "example",
      position: 4,
      visibility: "public",
      source: { kind: "public_reference", value: "marketing-library:gift-example" },
    },
    {
      id: "asset-seo",
      productId,
      mediaType: "image",
      role: "seo",
      position: 5,
      visibility: "public",
      source: { kind: "url", value: "https://assets.example.test/share.webp" },
    },
    {
      id: "asset-other-variant",
      productId,
      variantId: largeSage.id,
      mediaType: "image",
      role: "detail",
      position: 6,
      visibility: "public",
      source: { kind: "url", value: "https://assets.example.test/sage.webp" },
    },
    {
      id: "asset-other-product",
      productId: "other-product",
      mediaType: "image",
      role: "seo",
      position: 0,
      visibility: "public",
      source: { kind: "url", value: "https://assets.example.test/other.webp" },
    },
  ];

  const views = toPublicProductAssetViews(productId, "Couple Figure", assets);
  assert.deepEqual(views.map((asset) => asset.id), [
    "asset-product-image",
    "asset-product-video",
    "asset-variant-image",
    "asset-reference",
    "asset-seo",
    "asset-other-variant",
  ]);
  assert.equal(views.find((asset) => asset.mediaType === "image").description, "Front view of the keepsake");
  assert.equal(views.find((asset) => asset.mediaType === "video").description, "A short turntable view");

  const productOnly = selectProductAssetViews(views, productId, null);
  assert.deepEqual(productOnly.items.map((asset) => asset.id), [
    "asset-product-image",
    "asset-product-video",
    "asset-reference",
    "asset-seo",
  ]);
  const selected = selectProductAssetViews(views, productId, smallCoral.id);
  assert.equal(selected.primary.id, "asset-variant-image");
  assert.ok(selected.items.some((asset) => asset.variantId === undefined));
  assert.equal(selected.items.some((asset) => asset.id === "asset-other-variant"), false);
  assert.equal(selected.items.some((asset) => asset.productId !== productId), false);
  assert.equal(isRenderablePublicAssetUrl(views.find((asset) => asset.id === "asset-reference").source), false);
  assert.equal(isRenderablePublicAssetUrl(views.find((asset) => asset.id === "asset-product-video").source), true);

  const failed = recordProductAssetFailure(new Set(), "asset-product-image");
  assert.equal(failed.has("asset-product-image"), true);
  assert.equal(failed.has("asset-product-video"), false);
});

test("catalog SEO uses public overrides and safe NULL-compatible content fallbacks", () => {
  const site = { siteUrl: "https://photogift.example", brandName: "PhotoGift" };
  const category = {
    id: "category-figures",
    slug: "figures",
    name: "3D Figures",
    description: "Dimensional keepsakes made personal.",
    lifecycle: "published",
    seo: {
      title: "Personalized 3D Figures",
      description: "Explore published 3D figure designs.",
      canonicalPath: "/collections/figures",
    },
  };
  assert.deepEqual(buildCategoryMetadataModel(category, site), {
    title: "Personalized 3D Figures | PhotoGift",
    description: "Explore published 3D figure designs.",
    canonicalUrl: "https://photogift.example/collections/figures",
  });
  assert.deepEqual(buildCategoryMetadataModel({ ...category, seo: {} }, site), {
    title: "3D Figures | PhotoGift",
    description: category.description,
    canonicalUrl: "https://photogift.example/category/figures",
  });

  const product = {
    id: productId,
    slug: "couple-figure",
    categoryId: category.id,
    name: "Couple Figure",
    description: "A small figure based on a favorite moment.",
    lifecycle: "published",
    seo: null,
  };
  const metadata = buildProductMetadataModel(product, [{
    id: "asset-seo",
    productId,
    mediaType: "image",
    role: "seo",
    position: 0,
    visibility: "public",
    source: { kind: "url", value: "https://assets.example.test/share.webp" },
  }], site);
  assert.deepEqual(metadata, {
    title: "Couple Figure | PhotoGift",
    description: product.description,
    canonicalUrl: "https://photogift.example/product/couple-figure",
    imageUrl: "https://assets.example.test/share.webp",
  });
});

test("sitemap paths contain only eligible public catalog routes", async () => {
  const dataSet = cloneFixtures();
  dataSet.categories.find((item) => item.slug === "pet-memories").lifecycle = "retired";
  const unavailableProduct = dataSet.products.find((item) => item.slug === "couple-figure");
  dataSet.variants
    .filter((item) => item.productId === unavailableProduct.id)
    .forEach((variant) => {
      variant.isAvailable = false;
    });
  const repository = repositoryFor(dataSet);
  const categories = await repository.listPublicCategories();
  const products = await repository.listPublicProducts();
  assert.equal(categories.status, "found");
  assert.equal(products.status, "found");
  const paths = buildPublicCatalogSitemapPaths(categories.value, products.value);
  assert.ok(paths.includes("/shop"));
  assert.equal(paths.includes("/category/pet-memories"), false);
  assert.equal(paths.includes("/product/pet-figure"), false);
  assert.equal(paths.includes("/product/couple-figure"), false);
});

test("homepage uses the shared public catalog model without legacy Product or fixture fallback imports", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /loadPublicShopPage/);
  assert.match(source, /CatalogBrowser/);
  assert.doesNotMatch(source, /\.\/catalog["']/);
  assert.doesNotMatch(source, /domain\/product/);
  assert.doesNotMatch(source, /FixtureProductRepository|\/api\/products|product\.price\b|ProductArt/);

  const repository = repositoryFor(cloneFixtures());
  const catalog = await loadPublicShopPage(repository);
  assert.equal(catalog.status, "found");
  assert.deepEqual(catalog.value.categories.map((category) => category.name), [
    "3D Figures",
    "Custom Crafts",
    "Digital Gifts",
    "Pet Memories",
  ]);
  assert.deepEqual(
    catalog.value.products.find((item) => item.product.slug === "couple-figure").listingPrice,
    {
      kind: "starting_at",
      minPriceCents: 6_990,
      maxPriceCents: 8_990,
      currency: "USD",
    },
  );
});
