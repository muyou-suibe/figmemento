import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import "./figmemento-visual-v2.test.mjs";

const cssPath = new URL("../app/globals.css", import.meta.url);
const catalogCssPath = new URL("../app/storefront/catalog-storefront.module.css", import.meta.url);
const auditPath = new URL("../docs/figmemento-visual-gap-audit.md", import.meta.url);

async function readFixtures() {
  return {
    css: await readFile(cssPath, "utf8"),
    catalogCss: await readFile(catalogCssPath, "utf8"),
    audit: await readFile(auditPath, "utf8"),
  };
}

test("FigMemento visual tokens use the approved warm-neutral authority", async () => {
  const { css } = await readFixtures();
  for (const [name, value] of [
    ["color-bg", "#FDF8F2"],
    ["color-card", "#FFFDF8"],
    ["color-text", "#3C2A1E"],
    ["color-text-light", "#6B5D4F"],
    ["color-text-muted", "#8B7355"],
    ["color-accent", "#C4815A"],
    ["color-highlight", "#D4B896"],
    ["color-border", "#E8DCCC"],
    ["color-border-light", "#F5EDE0"],
    ["color-tag-bg", "#F5EDE0"],
    ["color-success", "#7B9E6C"],
  ]) {
    assert.match(css, new RegExp(`--${name}:\\s*${value}`, "i"));
  }
  assert.match(css, /--coral:\s*var\(--color-accent\)/);
  assert.match(css, /--sage:\s*var\(--color-tag-bg\)/);
  assert.doesNotMatch(css, /--coral:\s*#e88868/i);
  assert.doesNotMatch(css, /--sage:\s*#dbe8d8/i);
});

test("typography, grid, spacing, shape, depth, and layering contracts are local and inspectable", async () => {
  const { css } = await readFixtures();
  assert.match(css, /--font-display:[^;]*Playfair Display/);
  assert.match(css, /--font-body:[^;]*Lato/);
  assert.match(css, /--font-weight-display-light:\s*300/);
  assert.match(css, /--font-weight-display-medium:\s*500/);
  assert.match(css, /--font-weight-body-light:\s*300/);
  assert.match(css, /--font-weight-body-regular:\s*400/);
  assert.match(css, /--grid-max:\s*1280px/);
  assert.match(css, /@media \(min-width: 640px\)/);
  assert.match(css, /@media \(min-width: 1024px\)/);
  for (const value of ["4px", "8px", "16px", "24px", "32px", "48px", "64px", "96px", "128px"]) {
    assert.match(css, new RegExp(`--space-[1-9]:\\s*${value}`));
  }
  for (const value of ["4px", "8px", "12px", "16px", "24px", "999px"]) {
    assert.match(css, new RegExp(`--radius-[^:]+:\\s*${value}`));
  }
  for (const name of ["shadow-xs", "shadow-sm", "shadow-md", "shadow-lg", "z-base", "z-dropdown", "z-sticky", "z-overlay", "z-modal", "z-toast"]) {
    assert.match(css, new RegExp(`--${name}:`));
  }
  assert.doesNotMatch(css, /@import\s+url\(/i);
  assert.doesNotMatch(css, /fonts\.(googleapis|gstatic)\.com/i);
});

test("motion, reduced-motion, focus, and shared product-media foundations are present", async () => {
  const { css, catalogCss } = await readFixtures();
  assert.match(css, /--motion-fast:\s*150ms/);
  assert.match(css, /--motion-normal:\s*250ms/);
  assert.match(css, /--motion-slow:\s*400ms/);
  assert.match(css, /--motion-distance:\s*4px/);
  assert.match(css, /--motion-scale:\s*1\.05/);
  assert.match(css, /--motion-card:\s*300ms/);
  assert.match(css, /--motion-card-scale:\s*1\.03/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /:where\(button, a, input, textarea, select\):focus-visible/);
  assert.match(css, /rgba\(160, 113, 79, 0\.12\)/);
  assert.match(catalogCss, /\.cardMedia[\s\S]*aspect-ratio: 4 \/ 5/);
  assert.match(catalogCss, /\.cardMedia[\s\S]*border-radius: var\(--radius-md\)/);
  assert.match(catalogCss, /\.cardMedia::before[\s\S]*background: rgba\(255, 252, 247, 0\.14\)/);
  assert.match(catalogCss, /\.card:hover \.cardMedia::before/);
  assert.match(catalogCss, /\.heroMedia[\s\S]*border-radius: var\(--radius-xl\)/);
});

test("gap audit keeps unsupported business content explicitly deferred", async () => {
  const { audit } = await readFixtures();
  assert.match(audit, /VISUAL \/ CONTENT DEPENDENCY — NOT IMPLEMENTED/);
  assert.match(audit, /reviews, ratings, testimonials/);
  assert.match(audit, /free-shipping thresholds/);
  assert.match(audit, /ProductAsset fallback remains/);
  assert.match(audit, /PDP/);
});
