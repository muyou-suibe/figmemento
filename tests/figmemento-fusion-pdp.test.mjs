import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

import { toPublicProductAssetViews } from "../app/application/catalog-assets.ts";
import {
  formatListingPrice,
  resolveVariantSelection,
  toPublicSelectorVariants,
} from "../app/application/catalog-storefront.ts";
import { createDevelopmentCatalogFixtures } from "../app/infrastructure/catalog/development-catalog-fixtures.ts";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function coupleFixture() {
  const fixtures = createDevelopmentCatalogFixtures();
  const product = fixtures.products.find((candidate) => candidate.slug === "couple-figure");
  assert.ok(product);
  return {
    fixtures,
    product,
    options: fixtures.options.filter((option) => option.productId === product.id),
    optionValues: fixtures.optionValues.filter((value) => value.productId === product.id),
    variants: fixtures.variants.filter((variant) => variant.productId === product.id),
    assets: toPublicProductAssetViews(
      product.id,
      product.name,
      fixtures.assets.filter((asset) => asset.productId === product.id),
    ),
  };
}

test("Fusion PDP keeps the real route and authority boundaries", async () => {
  const [route, detail, selector, gallery, imageField] = await Promise.all([
    source("app/product/[slug]/page.tsx"),
    source("app/storefront/ProductDetailExperience.tsx"),
    source("app/storefront/VariantSelector.tsx"),
    source("app/storefront/ProductAssetGallery.tsx"),
    source("app/storefront/ProductCustomizationImageField.tsx"),
  ]);

  assert.match(route, /loadPublicProductDetailWithCustomization/);
  assert.match(route, /source\.value\.source === "fixture"/);
  assert.match(route, /toPublicProductAssetViews/);
  assert.match(route, /toPublicSelectorVariants/);
  assert.match(detail, /className=\{styles\.fusionPdp\}/);
  assert.match(detail, /<ProductAssetGallery/);
  assert.match(detail, /<VariantSelector/);
  assert.match(detail, /<ProductCustomizationFormShell/);
  assert.match(detail, /<AddToCartButton/);
  assert.match(selector, /resolveVariantSelection/);
  assert.match(selector, /onSelectionChange/);
  assert.match(gallery, /selectProductAssetViews/);
  assert.match(gallery, /isRenderablePublicAssetUrl/);
  assert.match(gallery, /aria-pressed=\{activeAsset\?\.id === asset\.id\}/);
  assert.match(imageField, /uploadCustomerCustomizationImage/);
  assert.match(imageField, /createFailedImageUploadAction/);

  const publicPdpSources = `${route}\n${detail}\n${gallery}`;
  assert.doesNotMatch(publicPdpSources, /ownerId|storageKey|bucket|signedUrl|guest-owner secret|private object path/i);
  assert.doesNotMatch(gallery, /CustomerUpload|customer_upload|receiptId|objectKey|storageKey|bucket|signedUrl/i);
});

test("PDP variant presentation follows authoritative combinations, price, and availability", () => {
  const { product, options, optionValues, variants } = coupleFixture();
  const size = options[0];
  const values = optionValues.filter((value) => value.optionId === size.id);
  const publicVariants = toPublicSelectorVariants(variants);
  const input = { productId: product.id, options, optionValues, variants: publicVariants };

  const mini = resolveVariantSelection({
    ...input,
    selectedOptions: [{ optionId: size.id, valueId: values.find((value) => value.code === "mini").id }],
  });
  const standard = resolveVariantSelection({
    ...input,
    selectedOptions: [{ optionId: size.id, valueId: values.find((value) => value.code === "standard").id }],
  });
  const deluxe = resolveVariantSelection({
    ...input,
    selectedOptions: [{ optionId: size.id, valueId: values.find((value) => value.code === "deluxe").id }],
  });
  const incomplete = resolveVariantSelection({ ...input, selectedOptions: [] });

  assert.equal(mini.status, "resolved");
  assert.equal(mini.variant.skuCode, "DEV-COUPLE-FIGURE-MINI");
  assert.equal(mini.variant.priceCents, 6_990);
  assert.equal(mini.variant.currency, "USD");
  assert.equal(standard.status, "resolved");
  assert.equal(standard.variant.skuCode, "DEV-COUPLE-FIGURE-STANDARD");
  assert.equal(standard.variant.priceCents, 8_990);
  assert.equal(deluxe.status, "unavailable");
  assert.equal(incomplete.status, "incomplete");
});

test("PDP renders Fusion composition with safe fixture media fallback and spec fields", async () => {
  const { product, options, optionValues, variants, assets } = coupleFixture();
  const dynamicProductName = "Catalog supplied PDP title";
  const dynamicProductDescription = "Catalog supplied PDP description";
  const dynamicListingPrice = {
    kind: "starting_at",
    minPriceCents: 4_200,
    maxPriceCents: 8_600,
    currency: "USD",
  };
  const dynamicFulfillment = {
    fulfillmentType: "Physical",
    productionMode: "Custom manufacturing",
    leadTimeLabel: "5–10 business days",
    requiresShipping: true,
  };
  const quietLogger = {
    hasWarned: false,
    info() {},
    warn() {},
    warnOnce() {},
    error() {},
    clearScreen() {},
  };
  const server = await createServer({
    root: process.cwd(),
    configFile: false,
    appType: "custom",
    customLogger: quietLogger,
    server: { middlewareMode: true, hmr: false, watch: null },
  });

  try {
    const pdpModule = await server.ssrLoadModule("/app/storefront/ProductDetailExperience.tsx");
    const markup = renderToStaticMarkup(createElement(pdpModule.ProductDetailExperience, {
      productId: product.id,
      productName: dynamicProductName,
      productDescription: dynamicProductDescription,
      categoryName: "3D Figures",
      listingPrice: dynamicListingPrice,
      fulfillment: dynamicFulfillment,
      options,
      optionValues,
      variants: toPublicSelectorVariants(variants),
      assets,
      customization: { status: "configured", configurationRevision: "fixture-catalog-v1", fields: [] },
    }));

    assert.match(markup, /fusionPdp/);
    assert.match(markup, new RegExp(`<h1[^>]*>${escapeRegExp(dynamicProductName)}<\\/h1>`));
    assert.match(markup, new RegExp(`description[^>]*>${escapeRegExp(dynamicProductDescription)}<\\/p>`));
    assert.match(markup, new RegExp(escapeRegExp(formatListingPrice(dynamicListingPrice))));
    assert.match(markup, /Product details/);
    assert.match(markup, /At a glance/);
    assert.match(markup, new RegExp(escapeRegExp(dynamicFulfillment.fulfillmentType)));
    assert.match(markup, new RegExp(escapeRegExp(dynamicFulfillment.productionMode)));
    assert.match(markup, new RegExp(escapeRegExp(dynamicFulfillment.leadTimeLabel)));
    assert.match(markup, /thumbnail media unavailable/);
    assert.match(markup, /Choose your gift/);
    assert.match(markup, /Choose every required option to see the exact SKU price/);
    assert.match(markup, /Personalize your gift/);
    assert.doesNotMatch(markup, /receiptId|ownerId|storageKey|bucket|signedUrl/i);
  } finally {
    await server.close();
  }
});

test("Fusion PDP CSS is scoped, responsive, touch-safe, and reduced-motion aware", async () => {
  const css = await source("app/storefront/catalog-storefront.module.css");
  const batchDStart = css.indexOf("FUSION PDP — BATCH D");
  const batchDEnd = css.indexOf("FUSION CART + LOCAL CHECKOUT — BATCH D");
  assert.ok(batchDStart >= 0);
  assert.ok(batchDEnd > batchDStart);
  const batchD = css.slice(batchDStart, batchDEnd);

  for (const selector of [
    ".fusionPdp",
    ".fusionPdpPage",
    ".fusionPdpSpec",
    ".fusionPdpAssetCaption",
    ".fusionPdp .heroMedia",
    ".fusionPdp .optionButton",
    ".fusionPdp .customizationImageSlot",
    ".fusionPdp .cartAction",
  ]) assert.match(batchD, new RegExp(`${selector.replaceAll(".", "\\.")}\\b`));
  assert.match(batchD, /@media \(max-width: 960px\)/);
  assert.match(batchD, /@media \(max-width: 720px\)/);
  assert.match(batchD, /@media \(max-width: 520px\)/);
  assert.match(batchD, /@media \(hover: none\), \(pointer: coarse\)/);
  assert.match(batchD, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(batchD, /min-height: var\(--fusion-tap\)/);
  assert.match(batchD, /overflow-wrap: anywhere/);
  assert.doesNotMatch(batchD, /opacity:\s*0/);
});
