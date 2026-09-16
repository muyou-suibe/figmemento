import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("V2 public presentation uses the approved shadow and semantic token authority", async () => {
  const globalCss = await source("app/globals.css");
  const catalogCss = await source("app/storefront/catalog-storefront.module.css");
  const infoCss = await source("app/info-page.module.css");
  const trackCss = await source("app/track-order/track-order.module.css");

  for (const [name, value] of [
    ["shadow-xs", "0 1px 2px rgba(30, 26, 21, 0.04)"],
    ["shadow-sm", "0 2px 8px rgba(30, 26, 21, 0.06)"],
    ["shadow-md", "0 4px 16px rgba(30, 26, 21, 0.08)"],
    ["shadow-lg", "0 8px 24px rgba(30, 26, 21, 0.10)"],
  ]) {
    assert.match(globalCss, new RegExp(`--${name}:\\s*${value.replace(/[()]/g, "\\$&")}`));
  }

  for (const css of [catalogCss, infoCss, trackCss]) {
    assert.doesNotMatch(css, /var\(--coral\)|var\(--sage\)|#e88868|#dbe8d8/i);
    assert.match(css, /var\(--color-(?:bg|card|text|accent|border)/);
  }
  assert.doesNotMatch(catalogCss, /@media\s*\([^)]*900px/i);
  assert.match(catalogCss, /homeReferenceShell[\s\S]*border-radius:\s*3px/);
  assert.match(globalCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.doesNotMatch(globalCss, /@import\s+url\(|fonts\.(?:googleapis|gstatic)\.com/i);
});

test("V2 public routes share the accessible shell and keep reference copy with a local signup boundary", async () => {
  const shell = await source("app/storefront/CatalogShell.tsx");
  assert.match(shell, /href="#main-content"/);
  assert.match(shell, /<footer className=.*styles\.footer/);
  assert.match(shell, /FAQ/);
  assert.match(shell, /Shipping & returns/);

  for (const path of [
    "app/page.tsx",
    "app/shop/page.tsx",
    "app/category/[slug]/page.tsx",
    "app/product/[slug]/page.tsx",
    "app/storefront/CatalogStatus.tsx",
    "app/loading.tsx",
    "app/not-found.tsx",
    "app/info-page.tsx",
    "app/track-order/page.tsx",
  ]) {
    assert.match(await source(path), /main-content/);
  }

  const publicSources = await Promise.all([
    source("app/page.tsx"),
    source("app/storefront/CatalogShell.tsx"),
    source("app/storefront/CatalogBrowser.tsx"),
    source("app/storefront/NewsletterSignup.tsx"),
  ]);
  const joined = publicSources.join("\n");
  assert.match(joined, /Free worldwide shipping over \$69/);
  assert.match(joined, /verified buyer/i);
  assert.match(joined, /STRIPE &amp; PAYPAL/i);
  assert.match(joined, /Join the atelier/);
  assert.match(joined, /handwritten updates from the workshop, once a week — and 10% off your first keepsake/);
  assert.match(joined, /<form className=\{styles\.fusionNewsletterForm\}/);
  assert.match(joined, /<button type="submit" disabled=\{status === "submitting"\}>/);
  assert.doesNotMatch(joined, /subscription (?:successfully )?(?:created|confirmed)|subscribe(?:d|r)? successfully/i);
  assert.doesNotMatch(await source("app/loading.tsx"), /Free shipping/i);
});

test("V2 storefront composition keeps catalog and customization behavior wired to existing components", async () => {
  const browser = await source("app/storefront/CatalogBrowser.tsx");
  const detail = await source("app/storefront/ProductDetailExperience.tsx");
  const selector = await source("app/storefront/VariantSelector.tsx");
  const customization = await source("app/storefront/ProductCustomizationFormShell.tsx");

  assert.match(browser, /filterCatalogProducts/);
  assert.match(browser, /formatListingPrice/);
  assert.match(detail, /ProductAssetGallery/);
  assert.match(detail, /VariantSelector/);
  assert.match(detail, /ProductCustomizationFormShell/);
  assert.match(detail, /ProductCustomizationHandoffGate/);
  assert.match(selector, /resolveVariantSelection/);
  assert.match(selector, /onSelectionChange/);
  assert.match(customization, /ProductCustomizationImageField/);
  assert.match(customization, /ProductCustomizationTextField/);
  assert.doesNotMatch(detail, /checkout|payment|stripe|paypal/i);
});
