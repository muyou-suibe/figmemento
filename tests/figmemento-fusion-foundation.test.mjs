import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const root = new URL("..", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("Fusion foundation preserves the existing canonical token authority", async () => {
  const css = await source("app/globals.css");
  assert.match(css, /--color-bg:\s*#FDF8F2/);
  assert.match(css, /--color-card:\s*#FFFDF8/);
  assert.match(css, /--font-display:\s*"Playfair Display", "Noto Serif SC"/);
  assert.match(css, /--font-body:\s*"Lato", "Noto Sans SC"/);
  assert.match(css, /--fusion-bg:\s*#FDF8F2/);
  assert.match(css, /--fusion-paper:\s*#FFFDF8/);
  assert.match(css, /--fusion-ink:\s*#3C2A1E/);
  assert.match(css, /--fusion-terra:\s*#C4815A/);
  assert.match(css, /--fusion-line:\s*#E8DCCC/);
  assert.match(css, /--fusion-shadow-card:\s*2px 3px 10px rgba\(60, 42, 30, 0\.08\)/);
  assert.match(css, /--fusion-shadow-lift:\s*5px 8px 24px rgba\(60, 42, 30, 0\.14\)/);
});

test("Fusion typography and motion tokens follow the audited reference", async () => {
  const css = await source("app/globals.css");
  assert.match(css, /--fusion-font-serif:\s*"Playfair Display", "Noto Serif SC", serif/);
  assert.match(css, /--fusion-font-hand:\s*"Lato", "Noto Sans SC", "PingFang SC", sans-serif/);
  assert.match(css, /--fusion-font-ital:\s*"Lato", "Noto Sans SC", "PingFang SC", sans-serif/);
  assert.match(css, /--fusion-font-body:\s*"Lato", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif/);
  assert.match(css, /--fusion-motion-marquee:\s*26s/);
  assert.match(css, /--fusion-motion-page:\s*450ms/);
  assert.match(css, /--fusion-motion-reveal:\s*700ms/);
  assert.match(css, /--fusion-motion-count:\s*1200ms/);
  assert.match(css, /--fusion-breakpoint-wide:\s*960px/);
  assert.match(css, /--fusion-breakpoint-compact:\s*720px/);
  assert.match(css, /--fusion-breakpoint-narrow:\s*520px/);

  const foundation = await source("app/storefront/fusion-foundation.module.css");
  assert.doesNotMatch(foundation, /Caveat/);
  assert.match(foundation, /prefers-reduced-motion:\s*reduce/);
  assert.match(foundation, /pointer:\s*coarse/);
});

test("Fusion primitives are small, semantic, and do not import business surfaces", async () => {
  const component = await source("app/storefront/FusionFoundation.tsx");
  const styles = await source("app/storefront/fusion-foundation.module.css");
  for (const name of [
    "EditorialHeading",
    "Eyebrow",
    "PaperCard",
    "MediaFrame",
    "DoubleRule",
    "Annotation",
    "StatusBlock",
    "ActionRow",
    "ResponsiveGrid",
    "PolaroidFrame",
    "WashiTape",
    "PinAccent",
  ]) {
    assert.match(component, new RegExp(`export function ${name}\\b`));
  }
  for (const className of ["editorialHeading", "paperCard", "mediaFrame", "doubleRule", "annotation", "statusBlock", "actionRow", "responsiveGrid", "polaroidFrame", "washiTape", "pinAccent"]) {
    assert.match(styles, new RegExp(`\\.${className}\\b`));
  }
  assert.doesNotMatch(component, /(?:app\/api|supabase|stripe|paypal|resend|17track|order|payment|fulfillment|tracking|checkout|customization)/i);
  assert.doesNotMatch(styles, /(?:\$69|10%\s*off|50\+?\s*countries|free\s+worldwide\s+shipping|preview\s+every\s+order)/i);
});

test("Fusion foundation retains responsive, focus, and touch-safe constraints", async () => {
  const styles = await source("app/storefront/fusion-foundation.module.css");
  assert.match(styles, /min-height:\s*var\(--fusion-tap\)/);
  assert.match(styles, /focus-visible/);
  assert.match(styles, /max-width:\s*960px/);
  assert.match(styles, /max-width:\s*720px/);
  assert.match(styles, /max-width:\s*520px/);
  assert.match(styles, /padding-inline:\s*16px/);
});

test("Fusion foundation primitives render through the real React SSR harness", async () => {
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
    const foundation = await server.ssrLoadModule("/app/storefront/FusionFoundation.tsx");
    const longCopy = "A long editorial note remains intact across the foundation render and is not truncated.";
    const markup = renderToStaticMarkup(createElement("main", null,
      createElement(foundation.EditorialHeading, { eyebrow: "A small note", key: "heading" }, "Fusion heading"),
      createElement(foundation.PaperCard, { key: "card" }, longCopy),
      createElement(foundation.MediaFrame, { key: "media" }, "Media frame"),
      createElement(foundation.DoubleRule, { key: "rule" }),
      createElement(foundation.Annotation, { key: "annotation" }, longCopy),
      createElement(foundation.StatusBlock, { key: "status" }, "Status content"),
      createElement(foundation.ActionRow, { key: "actions" }, createElement("button", null, "Action")),
      createElement(foundation.ResponsiveGrid, { key: "grid" }, createElement("div", null, "Grid item")),
      createElement(foundation.PolaroidFrame, { key: "polaroid" }, "Polaroid content"),
      createElement(foundation.WashiTape, { key: "tape" }),
      createElement(foundation.PinAccent, { key: "pin" }),
    ));

    assert.match(markup, /<h2[^>]*>Fusion heading<\/h2>/);
    assert.match(markup, /editorialHeading/);
    assert.match(markup, /paperCard/);
    assert.match(markup, /statusBlock/);
    assert.match(markup, /actionRow/);
    assert.match(markup, /responsiveGrid/);
    assert.match(markup, /polaroidFrame/);
    assert.match(markup, /Media frame/);
    assert.match(markup, new RegExp(longCopy));
    assert.match(markup, /<div[^>]*aria-hidden="true"[^>]*role="separator"/);
    assert.match(markup, /<span[^>]*aria-hidden="true"[^>]*class="[^"]*washiTape/);
    assert.match(markup, /<span[^>]*aria-hidden="true"[^>]*class="[^"]*pinAccent/);
  } finally {
    await server.close();
  }
});

test("WashiTape stays decorative and does not inherit interactive touch sizing", async () => {
  const [component, styles] = await Promise.all([
    source("app/storefront/FusionFoundation.tsx"),
    source("app/storefront/fusion-foundation.module.css"),
  ]);
  assert.match(component, /<span aria-hidden="true" className=\{classes\(styles\.washiTape/);
  assert.match(styles, /\.washiTape::before/);
  assert.match(styles, /\.washiTape::after/);
  assert.match(styles, /padding:\s*5px 22px/);
  assert.match(styles, /transform:\s*rotate\(-1\.5deg\)/);
  assert.doesNotMatch(styles, /\.washiTape\s*\{[^}]*min-height:\s*var\(--fusion-tap\)/s);
});

test("Fusion foundation has no remote font or server configuration bridge", async () => {
  const [css, component] = await Promise.all([
    source("app/storefront/fusion-foundation.module.css"),
    source("app/storefront/FusionFoundation.tsx"),
  ]);
  assert.doesNotMatch(css, /@import|fonts\.googleapis\.com|import\.meta\.env|process\.env/);
  assert.doesNotMatch(component, /import\.meta\.env|process\.env|cloudflare:workers/);
});

test("Fusion Batch H locks responsive boundaries and bounded motion", async () => {
  const [globalStyles, catalogStyles, adminStyles, foundationStyles] = await Promise.all([
    source("app/globals.css"),
    source("app/storefront/catalog-storefront.module.css"),
    source("app/admin/products/admin-products.module.css"),
    source("app/storefront/fusion-foundation.module.css"),
  ]);

  assert.match(globalStyles, /@keyframes fusionPageEntrance/);
  for (const breakpoint of ["960px", "720px", "520px"]) {
    assert.match(catalogStyles, new RegExp(`@media \\(max-width: ${breakpoint}\\)`));
    assert.match(adminStyles, new RegExp(`@media \\(max-width: ${breakpoint}\\)`));
  }
  assert.match(catalogStyles, /animation: fusionPageEntrance var\(--fusion-motion-page\) ease both/);
  assert.match(catalogStyles, /@media \(hover: none\), \(pointer: coarse\)/);
  assert.match(catalogStyles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(catalogStyles, /\.discoveryCardPeek[\s\S]*opacity: \.82/);
  assert.match(catalogStyles, /min-height: var\(--fusion-tap\)/);
  assert.match(adminStyles, /outline: 2px solid var\(--fusion-focus\)/);
  assert.match(adminStyles, /@media \(hover: none\), \(pointer: coarse\)/);
  assert.match(adminStyles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(foundationStyles, /\.reveal \{[\s\S]*opacity: 1;[\s\S]*transform: none;/);
  assert.match(foundationStyles, /data-reveal-state="pending"/);
  assert.match(foundationStyles, /@media \(prefers-reduced-motion: reduce\)/);
});

test("Fusion Batch H keeps content and interaction semantics independent of motion", async () => {
  const [home, category, gallery, navigation, browser, checkout, order, fulfillment, tracking, admin] = await Promise.all([
    source("app/page.tsx"),
    source("app/category/[slug]/page.tsx"),
    source("app/storefront/ProductAssetGallery.tsx"),
    source("app/storefront/CatalogShellNavigation.tsx"),
    source("app/storefront/CatalogBrowser.tsx"),
    source("app/storefront/LocalCheckoutExperience.tsx"),
    source("app/storefront/LocalOrderSuccessExperience.tsx"),
    source("app/storefront/LocalFulfillmentOperatorTool.tsx"),
    source("app/storefront/LocalTrackingExperience.tsx"),
    source("app/admin/products/AdminCatalogEditor.tsx"),
  ]);

  assert.match(home, /role="group" aria-labelledby="home-selected-products-label"/);
  assert.match(home, /<ReferenceText>Selected catalog products<\/ReferenceText>/);
  assert.match(category, /<ReferenceCategoryComposition slug=\{slug\} category=\{category\} products=\{products\} \/>/);
  assert.match(gallery, /role="group" aria-label=\{t\("Choose product media"\)\}/);
  assert.match(navigation, /aria-expanded=\{menuOpen\}/);
  assert.match(navigation, /firstMobileLinkRef\.current\?\.focus\(\)/);
  assert.match(navigation, /event\.key !== "Escape"/);
  assert.match(browser, /aria-live="polite"/);
  assert.match(browser, /aria-pressed=\{/);
  assert.match(checkout, /role="status"/);
  assert.match(checkout, /role="alert"/);
  assert.match(order, /role="status"/);
  assert.match(fulfillment, /role="status"/);
  assert.match(tracking, /aria-label=\{t\("Local tracking progress"\)\}/);
  assert.match(tracking, /role="alert"/);
  assert.match(admin, /<details className=\{styles\.editorCard\}>/);
  assert.match(admin, /role="status"/);
});

test("Fusion Batch H does not add animation dependencies or protected-flow behavior", async () => {
  const [packageJson, globalStyles, catalogStyles, adminStyles] = await Promise.all([
    source("package.json"),
    source("app/globals.css"),
    source("app/storefront/catalog-storefront.module.css"),
    source("app/admin/products/admin-products.module.css"),
  ]);
  assert.doesNotMatch(packageJson, /framer-motion|gsap/i);
  assert.doesNotMatch(`${globalStyles}\n${catalogStyles}\n${adminStyles}`, /Stripe|PayPal|17TRACK|supabaseAdmin|storage provider|R2/i);
  assert.doesNotMatch(`${catalogStyles}\n${adminStyles}`, /setTimeout|fetch\(|process\.env|import\.meta\.env/);
});
