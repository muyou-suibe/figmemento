import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { loadPublicCategoryPage, loadPublicProductPage, loadPublicShopPage } from "../app/application/catalog-pages.ts";
import { toPublicProductAssetViews } from "../app/application/catalog-assets.ts";
import {
  buildProductMetadataModel,
  buildPublicCatalogSitemapPaths,
} from "../app/application/catalog-seo.ts";
import { loadPublicProductDetailWithCustomization } from "../app/application/customization-product-detail.ts";
import { loadProductCatalog } from "../app/application/product-catalog.ts";
import { toPublicSelectorVariants } from "../app/application/catalog-storefront.ts";
import { toNextCatalogMetadata } from "../app/storefront/catalog-metadata.ts";
import { createDevelopmentCatalogFixtures } from "../app/infrastructure/catalog/development-catalog-fixtures.ts";
import { createDevelopmentCatalogRepository } from "../app/infrastructure/catalog/development-catalog-repository.ts";
import { SupabaseCatalogTableReader } from "../app/infrastructure/catalog/supabase-catalog-repository.ts";
import { createDevelopmentCustomizationFieldRepository } from "../app/infrastructure/customization/development-customization-field-repository.ts";

const fixtureEnvironment = {
  NODE_ENV: "test",
  PHOTOGIFT_PRODUCT_SOURCE: "fixture",
};

const PRIVATE_RECEIPT_CANARY = "PRIVATE_RECEIPT_CANARY";
const PRIVATE_FILENAME_CANARY = "PRIVATE_FILENAME_CANARY";
const PRIVATE_PREVIEW_CANARY = "PRIVATE_PREVIEW_CANARY";
const PRIVATE_OBJECT_KEY_CANARY = "PRIVATE_OBJECT_KEY_CANARY";

// `lifecycle` is intentionally not in this set: Product, Category, and
// ProductAsset have an approved public lifecycle/visibility vocabulary. A
// private receipt lifecycle would still be caught by its receipt object keys,
// source scans, and the canary object assertions below.
const forbiddenPrivateKeys = new Set([
  "receiptid",
  "receipt_id",
  "originalfilename",
  "original_filename",
  "ownerid",
  "owner_id",
  "ownerbindingid",
  "owner_binding_id",
  "previewurl",
  "preview_url",
  "previewcapability",
  "preview_capability",
  "signedurl",
  "signed_url",
  "storagekey",
  "storage_key",
  "objectkey",
  "object_key",
  "bucket",
  "provider",
  "expiresat",
  "expires_at",
  "contenttype",
  "content_type",
  "mimetype",
  "mime_type",
  "bytesize",
  "byte_size",
  "filesize",
  "file_size",
  "dimensions",
  "draftid",
  "draft_id",
]);

function privateKeyHits(value, path = "$", hits = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => privateKeyHits(item, `${path}[${index}]`, hits));
    return hits;
  }
  if (!value || typeof value !== "object") return hits;
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenPrivateKeys.has(key.toLowerCase())) hits.push(`${path}.${key}`);
    privateKeyHits(child, `${path}.${key}`, hits);
  }
  return hits;
}

function assertPublicShape(label, value) {
  assert.deepEqual(privateKeyHits(value), [], `${label} exposed private property names`);
  const serialized = JSON.stringify(value);
  for (const canary of [
    PRIVATE_RECEIPT_CANARY,
    PRIVATE_FILENAME_CANARY,
    PRIVATE_PREVIEW_CANARY,
    PRIVATE_OBJECT_KEY_CANARY,
  ]) {
    assert.equal(serialized.includes(canary), false, `${label} exposed ${canary}`);
  }
}

async function readSources(paths) {
  return (await Promise.all(paths.map(async (path) => [
    path,
    await readFile(new URL(`../${path}`, import.meta.url), "utf8"),
  ])));
}

const PUBLIC_BOUNDARY_FILES = [
  "app/application/catalog-repository.ts",
  "app/application/catalog-assets.ts",
  "app/application/catalog-seo.ts",
  "app/application/catalog-pages.ts",
  "app/application/catalog-storefront.ts",
  "app/application/customization-product-detail.ts",
  "app/infrastructure/catalog/catalog-repository-factory.ts",
  "app/infrastructure/catalog/development-catalog-fixtures.ts",
  "app/infrastructure/catalog/development-catalog-repository.ts",
  "app/infrastructure/catalog/server-catalog-repository.ts",
  "app/infrastructure/catalog/supabase-catalog-repository.ts",
  "app/infrastructure/customization/development-customization-field-fixtures.ts",
  "app/infrastructure/customization/development-customization-field-repository.ts",
  "app/api/products/route.ts",
  "app/page.tsx",
  "app/shop/page.tsx",
  "app/category/[slug]/page.tsx",
  "app/product/[slug]/page.tsx",
  "app/sitemap.ts",
  "app/layout.tsx",
];

test("ProductAsset remains a public marketing-only result", () => {
  const fixtures = createDevelopmentCatalogFixtures();
  const asset = fixtures.assets[0];
  assert.equal(asset.visibility, "public");
  assert.equal("receiptId" in asset, false);
  assert.equal("ownerId" in asset, false);
  assert.equal("lifecycle" in asset, false);
  assertPublicShape("ProductAsset", asset);

  const views = toPublicProductAssetViews(
    fixtures.products[0].id,
    fixtures.products[0].name,
    fixtures.assets.filter((candidate) => candidate.productId === fixtures.products[0].id),
  );
  assertPublicShape("public ProductAsset views", views);
  assert.ok(views.every((view) => view.source.kind === "public_reference"));
});

test("public catalog repositories query only catalog relations", async () => {
  const publicTables = [];
  const forbiddenTables = new Set([
    "customer_upload_receipts",
    "customization_drafts",
    "customization_draft_values",
    "customization_value_images",
    "order_item_customization_snapshots",
    "order_item_customization_values",
    "order_item_customization_images",
  ]);
  const client = {
    from(table) {
      if (forbiddenTables.has(table)) {
        throw new Error(`private catalog query attempted: ${table}`);
      }
      publicTables.push(table);
      const query = {
        select() { return query; },
        order() { return query; },
        then(resolve, reject) {
          return Promise.resolve({ data: [], error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };

  const rows = await new SupabaseCatalogTableReader(client).readCatalogTables();
  assert.deepEqual(new Set(publicTables), new Set([
    "categories",
    "products",
    "product_options",
    "product_option_values",
    "product_variants",
    "product_variant_values",
    "product_assets",
    "product_fulfillment_configs",
  ]));
  assertPublicShape("empty public catalog rows", rows);
});

test("public Product detail payload contains catalog facts and safe field definitions only", async () => {
  const catalog = createDevelopmentCatalogRepository(fixtureEnvironment);
  const customization = createDevelopmentCustomizationFieldRepository(fixtureEnvironment);
  const result = await loadPublicProductDetailWithCustomization(
    catalog,
    customization,
    "couple-figure",
  );
  assert.equal(result.status, "found");
  assert.ok(result.status === "found");
  assertPublicShape("public Product detail", result.value);
  assert.equal(result.value.catalog.product.slug, "couple-figure");
  assert.ok(result.value.catalog.assets.every((asset) => asset.visibility === "public"));
  assert.equal(result.value.customization.status, "configured");
  assert.ok(result.value.customization.fields.every((field) => field.productId === result.value.catalog.product.id));

  const selectorVariants = toPublicSelectorVariants(result.value.catalog.variants);
  assertPublicShape("public selector variants", selectorVariants);
  assert.equal(selectorVariants.some((variant) => "supplyMethod" in variant), false);
  assert.equal(selectorVariants.some((variant) => "weightGrams" in variant), false);
});

test("homepage, shop, category, legacy API-shaped catalog, and public Product serialization stay private-data free", async () => {
  const repository = createDevelopmentCatalogRepository(fixtureEnvironment);
  const shop = await loadPublicShopPage(repository);
  assert.equal(shop.status, "found");
  assertPublicShape("homepage/shop public data", shop.value);
  assert.equal(shop.value.products.length, 22);

  const category = await loadPublicCategoryPage(repository, "3d-figures");
  assert.equal(category.status, "found");
  assertPublicShape("category public data", category.value);

  const product = await loadPublicProductPage(repository, "couple-figure");
  assert.equal(product.status, "found");
  assertPublicShape("Product public data", product.value);

  const legacyResult = await loadProductCatalog({
    async listPublishedProducts() {
      return [{
        id: "public-product",
        name: "Public Product",
        category: "3D keepsakes",
        price: 69.9,
        description: "A public catalog item.",
        art: "figure",
      }];
    },
  }, "fixture");
  assert.equal(legacyResult.status, "available");
  assertPublicShape("legacy public catalog API result", legacyResult);
  assert.equal(legacyResult.source, "fixture");
});

test("sitemap is derived only from public catalog paths", async () => {
  const repository = createDevelopmentCatalogRepository(fixtureEnvironment);
  const categories = await repository.listPublicCategories();
  const products = await repository.listPublicProducts();
  assert.equal(categories.status, "found");
  assert.equal(products.status, "found");

  const paths = buildPublicCatalogSitemapPaths(categories.value, products.value);
  assertPublicShape("sitemap paths", paths);
  assert.ok(paths.includes("/shop"));
  assert.ok(paths.includes("/category/3d-figures"));
  assert.ok(paths.includes("/product/couple-figure"));
  assert.equal(paths.some((path) => path.includes("receipt") || path.includes("draft") || path.includes("owner")), false);
});

test("SEO metadata and structured data remain public-content only", async () => {
  const fixtures = createDevelopmentCatalogFixtures();
  const product = fixtures.products.find((candidate) => candidate.slug === "couple-figure");
  const assets = fixtures.assets.filter((asset) => asset.productId === product.id);
  const metadata = buildProductMetadataModel(product, assets, {
    siteUrl: "https://photogift.example",
    brandName: "PhotoGift",
  });
  assertPublicShape("catalog SEO model", metadata);
  assertPublicShape("Next metadata", toNextCatalogMetadata(metadata));

  const layoutSource = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const structuredDataSource = await readFile(new URL("../app/config/seo-metadata.ts", import.meta.url), "utf8");
  assert.match(structuredDataSource, /"@type": "WebSite"/);
  assert.match(layoutSource, /JSON\.stringify\(structuredData\)/);
  assert.doesNotMatch(layoutSource, /receiptId|originalFilename|previewUrl|storageKey|objectKey|ownerId|customer_upload|customization_draft/i);
});

test("development Product and CustomizationField fixtures contain only synthetic public-safe definitions", async () => {
  const catalog = createDevelopmentCatalogFixtures();
  assertPublicShape("development Product fixtures", catalog);

  const customizationRepository = createDevelopmentCustomizationFieldRepository(fixtureEnvironment);
  const configuration = await customizationRepository.getCustomizationFieldsForProduct("fixture-product-couple-figure");
  assert.equal(configuration.status, "found");
  assertPublicShape("development CustomizationField fixtures", configuration.value);
  assert.ok(configuration.value.fields.every((field) => field.productId === configuration.value.productId));

  const [fixtureSources, fakeSource] = await Promise.all([
    readSources([
      "app/infrastructure/catalog/development-catalog-fixtures.ts",
      "app/infrastructure/catalog/development-catalog-repository.ts",
      "app/infrastructure/customization/development-customization-field-fixtures.ts",
      "app/infrastructure/customization/development-customization-field-repository.ts",
    ]),
    readFile(new URL("../app/testing/customer-upload-fakes.ts", import.meta.url), "utf8"),
  ]);
  const fixtureSourceText = fixtureSources.map(([, source]) => source).join("\n");
  assert.doesNotMatch(fixtureSourceText, /customer-upload-fakes|app\/testing|CustomerUploadReceipt|CustomerUploadObjectStore/i);
  assert.doesNotMatch(fixtureSourceText, /receiptId|originalFilename|previewUrl|storageKey|objectKey|ownerId|ownerBindingId|customer_upload/i);
  assert.match(fakeSource, /attachOwnedReceiptOnce/);
  assert.match(fakeSource, /CustomerUploadReceipt/);
});

test("public catalog and page boundaries have no customer-upload imports or private relation queries", async () => {
  const sources = await readSources(PUBLIC_BOUNDARY_FILES);
  const source = sources.map(([, content]) => content).join("\n");
  assert.doesNotMatch(source, /CustomerUploadReceiptRepository|CustomerUploadObjectStore|CustomerUploadLifecycleService|CustomerUploadPreviewAccessPort|customer-upload-fakes/i);
  assert.doesNotMatch(source, /customer_upload_receipts|customization_drafts|customization_draft_values|customization_value_images|order_item_customization_(?:snapshots|values|images)/i);
  assert.doesNotMatch(source, /receiptId|originalFilename|previewUrl|previewCapability|storageKey|objectKey|ownerId|ownerBindingId|signedUrl/i);

  const privateSource = await readFile(new URL("../app/application/customer-upload-repository.ts", import.meta.url), "utf8");
  assert.match(privateSource, /CustomerUploadReceiptRepository/);
  assert.match(privateSource, /attachOwnedReceiptOnce/);
});

test("the current public Product API serializer shape stays private-data free", async () => {
  const routeSource = await readFile(new URL("../app/api/products/route.ts", import.meta.url), "utf8");
  assert.match(routeSource, /Response\.json\(\{ products: result\.products, source: result\.source \}\)/);
  const result = await loadProductCatalog({
    async listPublishedProducts() {
      return [{
        id: "public-product",
        name: "Public Product",
        category: "3D keepsakes",
        price: 69.9,
        description: "A public catalog item.",
        art: "figure",
      }];
    },
  }, "fixture");
  assert.equal(result.status, "available");
  assertPublicShape("public Product API response", {
    products: result.products,
    source: result.source,
  });
});

test("the current sitemap implementation remains public-only", async () => {
  const source = await readFile(new URL("../app/sitemap.ts", import.meta.url), "utf8");
  assert.match(source, /buildPublicCatalogSitemapPaths\(categories\.value, products\.value\)/);
  assert.doesNotMatch(source, /CustomerUpload|customer_upload|receiptId|originalFilename|previewUrl|storageKey|objectKey|ownerId|draftId/i);
});
