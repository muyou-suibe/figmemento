import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { loadPublicShopPage } from "../app/application/catalog-pages.ts";
import { CatalogRepositoryService } from "../app/application/catalog-repository.ts";
import { formatListingPrice } from "../app/application/catalog-storefront.ts";
import { createDevelopmentCatalogFixtures } from "../app/infrastructure/catalog/development-catalog-fixtures.ts";

const root = new URL("..", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("Fusion discovery routes use real catalog entry points and owner-approved reference copy", async () => {
  const [home, shop, category, browser, discovery] = await Promise.all([
    source("app/page.tsx"),
    source("app/shop/page.tsx"),
    source("app/category/[slug]/page.tsx"),
    source("app/storefront/CatalogBrowser.tsx"),
    source("app/storefront/CatalogDiscovery.tsx"),
  ]);

  assert.match(home, /fusionHomeLetters/);
  assert.match(home, /CatalogPolaroid/);
  assert.match(home, /CatalogProductGrid/);
  assert.match(shop, /CatalogCategoryGuide/);
  assert.match(category, /loadPublicCategoryPage/);
  assert.match(category, /ReferenceCategoryComposition/);
  assert.match(browser, /filterCatalogProducts/);
  assert.match(browser, /new URLSearchParams\(window\.location\.search\)/);
  assert.match(browser, /CatalogProductGrid/);
  assert.match(discovery, /formatListingPrice/);
  assert.match(discovery, /isRenderablePublicAssetUrl/);
  assert.match(discovery, /Marketing preview unavailable/);
  const catalogCopy = `${home}\n${shop}\n${category}\n${discovery}`;
  assert.match(catalogCopy, /verified buyer|Stripe &(?:amp;|&) PayPal|10% off your first keepsake/i);
  assert.match(catalogCopy, /selected catalog source/i);
  assert.doesNotMatch(catalogCopy, /\b(?:real|live|production)\s+(?:catalog data|catalog entries|published products?)\b/i);
  assert.doesNotMatch(`${home}\n${shop}\n${category}\n${discovery}`, /FixtureProductRepository|developmentCatalogFixtureDefinitions|\.\/catalog["']/);
});

test("Shop cards keep Catalog authority while adding stable reference-only decoration", async () => {
  const [browser, discovery, storefront, css] = await Promise.all([
    source("app/storefront/CatalogBrowser.tsx"),
    source("app/storefront/CatalogDiscovery.tsx"),
    source("app/application/catalog-storefront.ts"),
    source("app/storefront/catalog-storefront.module.css"),
  ]);

  assert.match(browser, /createReferenceShopPresentationMap/);
  assert.match(browser, /visibleProducts\.map\(\(item\) => referenceShopPresentationMap\.get\(item\.product\.id\)\)/);
  for (const decoration of ["bestseller", "for two", "any breed", "on canvas", "one of a kind", "so soft", "temporary", "in 1 hour"]) {
    assert.match(browser, new RegExp(decoration));
  }
  assert.match(discovery, /ReferenceShopCardPresentation/);
  assert.match(discovery, /shopPresentation/);
  assert.match(discovery, /item\.product\.name/);
  assert.match(discovery, /formatListingPrice\(item\.listingPrice\)/);
  assert.match(discovery, /shopPresentation\.rating/);
  assert.match(discovery, /shopPresentation\?\.badge/);
  assert.match(discovery, /shopPresentation\.peek/);
  assert.match(discovery, /href=\{`\/product\/\$\{item\.product\.slug\}`\}/);
  assert.match(css, /\.referenceShopPage \.discoveryCardDescription\s*\{[\s\S]*display: block;/);
  assert.match(css, /\.referenceShopPage \.discoveryCardName\s*\{[\s\S]*font-family: var\(--fusion-font-hand\);[\s\S]*font-size: 19px;[\s\S]*font-weight: 600;/);
  assert.match(css, /\.referenceShopPage \.referenceProductRating/);
  assert.match(css, /\.referenceShopPage \.referenceProductBadge/);
  assert.doesNotMatch(storefront, /rating|badge|bestseller|for two|any breed/i);
  assert.doesNotMatch(storefront, /presentation/);
});

test("Shop card SSR keeps real listing facts beside reference decoration", async () => {
  const repository = new CatalogRepositoryService({
    async loadCatalogDataSet() {
      return { status: "found", value: createDevelopmentCatalogFixtures() };
    },
  });
  const catalog = await loadPublicShopPage(repository);
  assert.equal(catalog.status, "found");

  const silentViteLogger = {
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
    customLogger: silentViteLogger,
    server: { middlewareMode: true, hmr: false, watch: null },
  });

  try {
    const [browser, discovery, language] = await Promise.all([
      server.ssrLoadModule("/app/storefront/CatalogBrowser.tsx"),
      server.ssrLoadModule("/app/storefront/CatalogDiscovery.tsx"),
      server.ssrLoadModule("/app/storefront/ReferenceLanguageProvider.tsx"),
    ]);
    const firstItems = catalog.value.products.slice(0, 2);
    const assignments = browser.createReferenceShopPresentationMap(firstItems);
    const reordered = [firstItems[1], firstItems[0]];
    assert.equal(assignments.get(firstItems[0].product.id)?.peek, "bestseller");
    assert.equal(assignments.get(firstItems[1].product.id)?.peek, "for two");
    assert.equal(assignments.get(reordered[1].product.id)?.peek, "bestseller");

    const markup = renderToStaticMarkup(createElement(
      language.ReferenceLanguageProvider,
      null,
      createElement(discovery.CatalogProductGrid, {
        items: firstItems,
        shopPresentation: firstItems.map((item) => assignments.get(item.product.id)),
      }),
    ));
    for (const item of firstItems) {
      assert.match(markup, new RegExp(item.product.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.match(markup, new RegExp(item.product.description.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.match(markup, new RegExp(formatListingPrice(item.listingPrice).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.match(markup, new RegExp(`/product/${item.product.slug}`));
    }
    assert.match(markup, /bestseller|for two/);
    assert.match(markup, /★ 4\.9 · 128|★ 4\.8 · 94/);
    assert.match(markup, /Bestseller|Anniversary/);
  } finally {
    await server.close();
  }
});

test("Home renders the owner-approved reference lower composition without changing catalog authority", async () => {
  const [home, shell, styles] = await Promise.all([
    source("app/page.tsx"),
    source("app/storefront/CatalogShell.tsx"),
    source("app/storefront/catalog-storefront.module.css"),
  ]);
  assert.match(home, /<CatalogShell page="home-reference"/);
  assert.match(home, /fusionTestimonialGrid/);
  assert.match(home, /fusionTestimonialCard/);
  assert.match(home, /style=\{\{ transform: "rotate\(-1\.4deg\)" \}\}/);
  assert.match(home, /I cried when I opened the box/);
  assert.match(home, /fusionHomeTrust/);
  assert.match(home, /Stripe &amp; PayPal/);
  assert.match(home, /fusionHomeNewsletter/);
  assert.match(home, /Join the atelier/);
  assert.match(home, /handwritten updates from the workshop/);
  assert.doesNotMatch(home, /fusionHomeReferenceLettersSpace|fusionHomeReferenceTrustSpace|fusionHomeReferenceNewsletterSpace/);
  assert.match(shell, /homeReferenceFooterOrnament/);
  assert.match(shell, /href="\/category\/custom-crafts"/);
  assert.doesNotMatch(shell, /href="\/category\/home-living"/);
  assert.match(shell, /MADE SLOWLY, SHIPPED EVERYWHERE/);
  assert.doesNotMatch(styles, /fusionHomeReferenceLettersSpace|fusionHomeReferenceTrustSpace|fusionHomeReferenceNewsletterSpace/);
  assert.match(styles, /fusionTestimonialGrid/);
});

test("Home keeps reference copy and passive motion independent of Catalog data", async () => {
  const [home, discovery, styles, language] = await Promise.all([
    source("app/page.tsx"),
    source("app/storefront/CatalogDiscovery.tsx"),
    source("app/storefront/catalog-storefront.module.css"),
    source("app/storefront/ReferenceLanguageProvider.tsx"),
  ]);

  for (const copy of [
    "Artisan at work · 4:5",
    "our workshop, 8:42 am",
    "Couple figurine · 4:5",
    "Ana & Luis, one year on",
    "Pet memorial · 4:5",
    "good boy, forever",
    "Mini-Me Keychain",
    "3D printed · hand-painted",
    "★ 4.9 · 128 reviews",
    "Bestseller",
    "Couple Figurine",
    "Dual portrait · wood base",
    "★ 4.8 · 94 reviews",
    "Anniversary",
    "Pet Memorial Figurine",
    "Full-color · any breed",
    "★ 4.9 · 203 reviews",
    "Most loved",
    "Custom Portrait",
    "Hand-painted · museum grade",
    "★ 4.7 · 67 reviews",
    "New",
  ]) {
    assert.match(home, new RegExp(copy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(home, /fusionHeroStickerOne/);
  assert.match(home, /fusionHeroStickerTwo/);
  assert.match(home, /fusionHeroStickerThree/);
  assert.match(discovery, /fallbackLabel/);
  assert.match(discovery, /referencePolaroidMedia/);
  assert.match(styles, /fusionFloatOne var\(--fusion-motion-float-1\)/);
  assert.match(styles, /fusionStickerTwinkle 4s ease-in-out infinite/);
  assert.match(styles, /fusionHeroStickerOne/);
  assert.doesNotMatch(styles, /\.discoveryPolaroid \{ animation: none; \}/);
  assert.match(language, /Artisan at work · 4:5/);
  assert.match(language, /Mini-Me Keychain/);
});

test("Fusion discovery styles preserve the audited editorial grammar and responsive safety", async () => {
  const css = await source("app/storefront/catalog-storefront.module.css");
  for (const selector of [
    "fusionHomeHero",
    "discoveryCategoryGuide",
    "discoveryProductGrid",
    "discoveryCardMedia",
    "discoveryPolaroid",
    "discoveryShopHeading",
    "discoveryCategoryHero",
    "discoveryEmpty",
  ]) assert.match(css, new RegExp(`\\.${selector}\\b`));
  assert.match(css, /cubic-bezier\(\.34, 1\.4, \.64, 1\)/);
  assert.match(css, /fusionFloatOne var\(--fusion-motion-float-1\)/);
  assert.match(css, /max-width: 960px/);
  assert.match(css, /max-width: 720px/);
  assert.match(css, /max-width: 520px/);
  assert.match(css, /@media \(hover: none\), \(pointer: coarse\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /min-height: var\(--fusion-tap\)/);
  const tabletStart = css.lastIndexOf("@media (max-width: 960px)");
  const tabletBlock = css.slice(tabletStart, css.indexOf("@media (max-width: 720px)", tabletStart));
  assert.match(tabletBlock, /\.discoveryProductGrid\s*\{[^}]*grid-template-columns:\s*repeat\(2,/);
  assert.match(css, /\.referenceShopPage \.discoveryProductGrid\s*\{[^}]*grid-template-columns:\s*repeat\(2,/);
  for (const selector of [".fusionHomeHero", ".discoveryCategoryGuide", ".discoveryProductGrid", ".discoveryShopHeading", ".discoveryCategoryHero"]) {
    const start = css.indexOf(`${selector} {`);
    assert.notEqual(start, -1);
    const block = css.slice(start, css.indexOf("}", start) + 1);
    assert.doesNotMatch(block, /opacity:\s*0/);
  }
});

test("Fusion product cards SSR real public catalog identity and listing price", async () => {
  const repository = new CatalogRepositoryService({
    async loadCatalogDataSet() {
      return { status: "found", value: createDevelopmentCatalogFixtures() };
    },
  });
  const catalog = await loadPublicShopPage(repository);
  assert.equal(catalog.status, "found");

  const silentViteLogger = {
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
    customLogger: silentViteLogger,
    server: { middlewareMode: true, hmr: false, watch: null },
  });

  try {
    const discovery = await server.ssrLoadModule("/app/storefront/CatalogDiscovery.tsx");
    const markup = renderToStaticMarkup(createElement(discovery.CatalogProductGrid, {
      items: catalog.value.products.slice(0, 2),
    }));
    for (const item of catalog.value.products.slice(0, 2)) {
      const escapedName = item.product.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const escapedCategory = item.category.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      assert.match(markup, new RegExp(escapedName));
      assert.match(markup, new RegExp(escapedCategory));
    }
    assert.match(markup, /discoveryProductGrid/);
    assert.match(markup, /View details/);
    assert.doesNotMatch(markup, /Add to cart|Quick add|Buy now|Wishlist/i);
  } finally {
    await server.close();
  }
});
