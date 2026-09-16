import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  isRenderablePublicAssetUrl,
  selectProductAssetViews,
} from "../app/application/catalog-assets.ts";
import {
  resolveVariantSelection,
  toPublicSelectorVariants,
} from "../app/application/catalog-storefront.ts";
import { createDevelopmentCatalogFixtures } from "../app/infrastructure/catalog/development-catalog-fixtures.ts";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

function coupleFixture() {
  const fixtures = createDevelopmentCatalogFixtures();
  const product = fixtures.products.find((candidate) => candidate.slug === "couple-figure");
  assert.ok(product);
  const options = fixtures.options.filter((option) => option.productId === product.id);
  const optionValues = fixtures.optionValues.filter((value) => value.productId === product.id);
  return {
    fixtures,
    product,
    options,
    optionValues,
    variants: toPublicSelectorVariants(fixtures.variants.filter((variant) => variant.productId === product.id)),
  };
}

test("Batch C PDP keeps the real product, SKU, customization, and cart boundaries", async () => {
  const [route, detail, selector, customization, imageField, handoff, cart] = await Promise.all([
    source("app/product/[slug]/page.tsx"),
    source("app/storefront/ProductDetailExperience.tsx"),
    source("app/storefront/VariantSelector.tsx"),
    source("app/storefront/ProductCustomizationFormShell.tsx"),
    source("app/storefront/ProductCustomizationImageField.tsx"),
    source("app/storefront/ProductCustomizationHandoffGate.tsx"),
    source("app/storefront/AddToCartButton.tsx"),
  ]);

  assert.match(route, /loadPublicProductDetailWithCustomization/);
  assert.match(route, /toPublicProductAssetViews/);
  assert.match(route, /toPublicSelectorVariants/);
  assert.match(route, /FixtureCatalogNotice/);
  assert.match(detail, /<ProductAssetGallery/);
  assert.match(detail, /<VariantSelector/);
  assert.match(detail, /<ProductCustomizationFormShell/);
  assert.match(detail, /<ProductCustomizationHandoffGate/);
  assert.match(detail, /<AddToCartButton handoff={handoffGate.handoff}/);
  assert.ok(detail.indexOf("<VariantSelector") < detail.indexOf("<ProductCustomizationFormShell"));
  assert.ok(detail.indexOf("<ProductCustomizationFormShell") < detail.indexOf("<AddToCartButton"));
  assert.match(selector, /resolveVariantSelection/);
  assert.match(selector, /onSelectionChange/);
  assert.match(customization, /ProductCustomizationTextField/);
  assert.match(customization, /ProductCustomizationImageField/);
  assert.match(imageField, /uploadCustomerCustomizationImage/);
  assert.match(imageField, /createFailedImageUploadAction/);
  assert.match(handoff, /server verification/i);
  assert.match(cart, /\/api\/cart/);

  const publicSources = `${route}\n${detail}\n${selector}\n${customization}\n${imageField}\n${handoff}\n${cart}`;
  assert.doesNotMatch(publicSources, /ownerId|storageKey|objectKey|signedUrl|bucket|secret|access token/i);
  assert.doesNotMatch(publicSources, /Free shipping|Bestseller|reviews|testimonials|guaranteed delivery/i);
});

test("Batch C uses variant-specific public media and controlled public fallback", () => {
  const { product } = coupleFixture();
  const general = {
    id: "general",
    productId: product.id,
    mediaType: "image",
    role: "gallery",
    position: 1,
    description: "General marketing image",
    source: { kind: "public_reference", value: "marketing:fixture/general" },
  };
  const variant = {
    ...general,
    id: "variant",
    variantId: "fixture-variant-couple-figure-mini",
    position: 0,
    description: "Mini marketing image",
  };
  const selection = selectProductAssetViews(
    [general, variant],
    product.id,
    "fixture-variant-couple-figure-mini",
  );
  assert.equal(selection.primary?.id, "variant");
  assert.deepEqual(selection.items.map((asset) => asset.id), ["variant", "general"]);
  assert.equal(isRenderablePublicAssetUrl({ kind: "url", value: "https://cdn.example.test/image.jpg" }), true);
  assert.equal(isRenderablePublicAssetUrl({ kind: "url", value: "https://cdn.example.test/image with spaces.jpg" }), false);
  assert.equal(isRenderablePublicAssetUrl({ kind: "public_reference", value: "private:customer/image" }), false);
});

test("Batch C selection remains exact and customization never becomes a SKU option", () => {
  const { product, options, optionValues, variants } = coupleFixture();
  const size = options.find((option) => option.code === "size");
  assert.ok(size);
  const mini = optionValues.find((value) => value.optionId === size.id && value.code === "mini");
  const standard = optionValues.find((value) => value.optionId === size.id && value.code === "standard");
  const deluxe = optionValues.find((value) => value.optionId === size.id && value.code === "deluxe");
  assert.ok(mini && standard && deluxe);
  const input = { productId: product.id, options, optionValues, variants };

  const resolvedMini = resolveVariantSelection({
    ...input,
    selectedOptions: [{ optionId: size.id, valueId: mini.id }],
  });
  const resolvedStandard = resolveVariantSelection({
    ...input,
    selectedOptions: [{ optionId: size.id, valueId: standard.id }],
  });
  const unavailableDeluxe = resolveVariantSelection({
    ...input,
    selectedOptions: [{ optionId: size.id, valueId: deluxe.id }],
  });
  const incomplete = resolveVariantSelection({ ...input, selectedOptions: [] });

  assert.equal(resolvedMini.status, "resolved");
  assert.equal(resolvedMini.variant.skuCode, "DEV-COUPLE-FIGURE-MINI");
  assert.equal(resolvedMini.variant.priceCents, 6_990);
  assert.equal(resolvedStandard.status, "resolved");
  assert.equal(resolvedStandard.variant.skuCode, "DEV-COUPLE-FIGURE-STANDARD");
  assert.equal(resolvedStandard.variant.priceCents, 8_990);
  assert.equal(unavailableDeluxe.status, "unavailable");
  assert.equal(incomplete.status, "incomplete");
  assert.deepEqual(resolvedMini.variant.selectedOptions, [{ optionId: size.id, valueId: mini.id }]);
  assert.doesNotMatch(JSON.stringify(resolvedMini.variant.selectedOptions), /photo|name|text|style|upload|custom/i);
});

test("Batch C PDP CSS is scoped to real media, options, customization, and responsive states", async () => {
  const css = await source("app/storefront/catalog-storefront.module.css");
  const start = css.indexOf(".fusionPdpPage");
  const end = css.indexOf("FUSION CART + LOCAL CHECKOUT — BATCH D");
  assert.ok(start >= 0 && end > start);
  const pdpCss = css.slice(start, end);
  for (const selector of [
    ".fusionPdp",
    ".fusionPdp .heroMedia",
    ".fusionPdp .optionButton",
    ".fusionPdp .customizationImageField",
    ".fusionPdp .cartAction",
  ]) assert.match(pdpCss, new RegExp(`${selector.replaceAll(".", "\\.")}\\b`));
  assert.match(pdpCss, /@media \(max-width: 960px\)/);
  assert.match(pdpCss, /@media \(max-width: 720px\)/);
  assert.match(pdpCss, /@media \(max-width: 520px\)/);
  assert.match(pdpCss, /@media \(hover: none\), \(pointer: coarse\)/);
  assert.match(pdpCss, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(pdpCss, /min-height: var\(--fusion-tap\)/);
  assert.match(pdpCss, /overflow-wrap: anywhere/);
});
