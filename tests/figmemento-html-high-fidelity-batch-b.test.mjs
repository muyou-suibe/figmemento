import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("Batch B keeps the real Shop listing before the editorial collection guide", async () => {
  const shop = await source("app/shop/page.tsx");
  const listingIndex = shop.indexOf("<CatalogBrowser");
  const guideIndex = shop.indexOf("<CatalogCategoryGuide");

  assert.ok(listingIndex >= 0);
  assert.ok(guideIndex > listingIndex);
  assert.match(shop, /referenceShopMasthead/);
  assert.match(shop, /FixtureCatalogNotice/);
  assert.match(shop, /<CatalogBrowser referenceShop categories=\{catalog\.value\.categories\} products=\{catalog\.value\.products\} \/>/);
  // Static copy belongs to the approved Reference HTML presentation boundary;
  // listing facts remain owned by the canonical CatalogBrowser projection.
  assert.match(shop, /<ReferenceText>Vol\. I · August 2026 · Twenty-one keepsakes<\/ReferenceText>/);
  assert.match(shop, /<ReferenceText>Free worldwide shipping on orders over \$69/);
});

test("Batch B keeps Category navigation broad while the product listing stays isolated", async () => {
  const pageLoader = await source("app/application/catalog-pages.ts");
  const categoryPage = await source("app/category/[slug]/page.tsx");

  assert.match(pageLoader, /categories: categories\.value/);
  assert.match(pageLoader, /products\.value\.filter\(\(item\) => item\.product\.categoryId === category\.id\)/);
  assert.match(categoryPage, /ReferenceCategoryComposition/);
});

test("Batch B preserves reference-derived Shop and Category presentation safeguards", async () => {
  const reference = await source("/Users/youmu/Documents/figmemento-frontend-reference/融合风格_五页面完整设计方案(4)(2).html");
  const css = await source("app/storefront/catalog-storefront.module.css");
  const discovery = await source("app/storefront/CatalogDiscovery.tsx");

  assert.match(reference, /class="f-shophead(?:\s|")/);
  assert.match(reference, /class="f-cathero(?:\s|")/);
  assert.match(reference, /class="f-pgrid(?:\s|")/);
  assert.match(css, /\.discoveryShopHeading/);
  assert.match(css, /\.discoveryCategoryHero/);
  assert.match(css, /\.discoveryProductGrid/);
  assert.match(css, /@media \(max-width: 960px\)/);
  assert.match(css, /@media \(max-width: 720px\)/);
  assert.match(css, /@media \(max-width: 520px\)/);
  assert.match(css, /@media \(hover: none\), \(pointer: coarse\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(discovery, /isRenderablePublicAssetUrl/);
  assert.match(discovery, /Marketing preview unavailable/);
  assert.match(discovery, /formatListingPrice/);
});
