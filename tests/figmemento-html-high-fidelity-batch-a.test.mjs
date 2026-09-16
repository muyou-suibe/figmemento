import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("..", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

const REFERENCE_HTML = "/Users/youmu/Documents/figmemento-frontend-reference/融合风格_五页面完整设计方案(4)(2).html";

test("Batch A keeps the checked-in Fusion reference and real route authority", async () => {
  const [reference, proposal, home, shell, navigation, discovery] = await Promise.all([
    readFile(REFERENCE_HTML, "utf8"),
    source("openspec/changes/build-figmemento-html-high-fidelity-port/proposal.md"),
    source("app/page.tsx"),
    source("app/storefront/CatalogShell.tsx"),
    source("app/storefront/CatalogShellNavigation.tsx"),
    source("app/storefront/CatalogDiscovery.tsx"),
  ]);

  assert.match(reference, /<title>FigMemento · Fusion Design — Warm Narrative Edition<\/title>/);
  assert.match(proposal, /visual, interaction, motion, and responsive\s+reference/i);
  assert.match(home, /loadPublicShopPage/);
  assert.match(home, /href="\/shop"/);
  assert.match(shell, /CatalogShellNavigation/);
  assert.match(shell, /FixtureCatalogNotice/);
  assert.match(discovery, /href=\{`\/product\/\$\{item\.product\.slug\}`\}/);
  assert.match(`${home}\n${shell}\n${navigation}\n${discovery}`, /href="\/journal"/i);
  assert.match(`${home}\n${shell}\n${navigation}\n${discovery}`, /href="\/about"/i);
  assert.match(`${home}\n${shell}\n${navigation}\n${discovery}`, /href="\/contact"/i);
  assert.match(navigation, /\/brand\/figmemento-logo\.png/);
  assert.match(`${home}\n${shell}\n${navigation}\n${discovery}`, /Free worldwide shipping|10% off|verified buyer|stripe|paypal/i);
});

test("Batch A uses catalog-backed card data and controlled public media fallback", async () => {
  const discovery = await source("app/storefront/CatalogDiscovery.tsx");
  assert.match(discovery, /formatListingPrice\(item\.listingPrice\)/);
  assert.match(discovery, /discoveryCardPin/);
  assert.match(discovery, /Available to explore/);
  assert.match(discovery, /isRenderablePublicAssetUrl/);
  assert.match(discovery, /Marketing preview unavailable/);
  assert.doesNotMatch(discovery, /customer-private|production-preview|digital-delivery|storage provider/i);
});

test("Batch A records the reference motion contract at the real Home boundary", async () => {
  const [styles, reveal, globalStyles] = await Promise.all([
    source("app/storefront/catalog-storefront.module.css"),
    source("app/storefront/FusionReveal.tsx"),
    source("app/globals.css"),
  ]);
  assert.match(styles, /animation: fusionMarquee var\(--fusion-motion-marquee\) linear infinite/);
  assert.match(styles, /@keyframes fusionMarquee/);
  assert.match(styles, /@keyframes fusionStickerTwinkle/);
  assert.match(styles, /fusionStickerTwinkle 4s ease-in-out infinite/);
  assert.match(styles, /width: 216px/);
  assert.match(styles, /width: 280px/);
  assert.match(reveal, /threshold: 0\.12/);
  assert.match(reveal, /rootMargin: "0px 0px -30px 0px"/);
  assert.match(globalStyles, /@keyframes fusionPageEntrance/);
  assert.match(globalStyles, /--fusion-motion-page:\s*450ms/);
});

test("Batch A keeps reduced motion and keyboard-safe presentation independent of content", async () => {
  const [styles, shell, navigation] = await Promise.all([
    source("app/storefront/catalog-storefront.module.css"),
    source("app/storefront/CatalogShell.tsx"),
    source("app/storefront/CatalogShellNavigation.tsx"),
  ]);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /\.marqueeTrack,\s*\.fusionHeroSticker \{ animation: none; \}/);
  assert.match(styles, /\.fusionReveal\[data-reveal-state="pending"\][\s\S]*opacity: 1;/);
  assert.match(shell, /href="#main-content"/);
  assert.match(navigation, /role="search"/);
  assert.match(navigation, /aria-expanded=\{menuOpen\}/);
  assert.match(navigation, /event\.key !== "Escape"/);
});

test("Batch A closes the remaining reference material and composition gaps", async () => {
  const [styles, shell, navigation, home, newsletter] = await Promise.all([
    source("app/storefront/catalog-storefront.module.css"),
    source("app/storefront/CatalogShell.tsx"),
    source("app/storefront/CatalogShellNavigation.tsx"),
    source("app/page.tsx"),
    source("app/storefront/NewsletterSignup.tsx"),
  ]);

  assert.match(styles, /\.referenceShell \.topNote\s*\{[\s\S]*background: var\(--fusion-honey\);[\s\S]*color: var\(--fusion-ink\);/);
  assert.match(styles, /\.marqueeTrack > span\s*\{[\s\S]*padding: 7px 26px;/);
  assert.match(styles, /\.shellCategoryPills\s*\{[\s\S]*justify-content: center;/);
  assert.match(styles, /\.referenceShell \.footer\s*\{[\s\S]*background: var\(--fusion-ink\);[\s\S]*border-top: 4px solid var\(--fusion-gold\);/);
  assert.match(styles, /@keyframes fusionCartWiggle/);
  assert.match(styles, /\.cartLink\s*\{[\s\S]*animation: fusionCartWiggle var\(--fusion-motion-cart\) ease-in-out 1;/);
  assert.match(styles, /\.searchButton:hover,[\s\S]*transform: rotate\(-8deg\) scale\(1\.1\);/);
  assert.match(shell, /CatalogShellCategoryPills/);
  assert.match(navigation, /export function CatalogShellCategoryPills/);
  assert.match(navigation, /<div className=\{styles\.headerControls\}>[\s\S]*<nav className=\{styles\.nav\}/);
  assert.match(navigation, /<form className=\{styles\.headerSearch\}/);
  assert.match(home, /<NewsletterSignup \/>/);
  assert.match(newsletter, /<form className=\{styles\.fusionNewsletterForm\}/);
  assert.match(newsletter, /<input[\s\S]*id="home-newsletter-email"[\s\S]*type="email"/);
  assert.doesNotMatch(newsletter, /<input\b[^>]*\bdisabled\b/);
  assert.match(newsletter, /<button type="submit" disabled=\{status === "submitting"\}>/);
  assert.match(home, /Join the atelier/);
  assert.match(home, /handwritten updates from the workshop, once a week — and 10% off your first keepsake/);
  assert.match(newsletter, /placeholder=\{t\("your email address"\)\}/);
});
