import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = new URL("../preview/github-pages/", import.meta.url);
const rootPath = fileURLToPath(root);

async function sourceFiles(directory = root) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const location = new URL(entry.name, directory);
    if (entry.isDirectory()) files.push(...await sourceFiles(location));
    else if (/\.(?:ts|tsx)$/.test(entry.name)) files.push(location);
  }
  return files;
}

test("preview source has no server/API/provider import boundary", async () => {
  const files = await sourceFiles();
  assert.ok(files.length >= 5);
  for (const file of files) {
    const source = await readFile(file, "utf8");
    const label = relative(rootPath, fileURLToPath(file));
    assert.doesNotMatch(source, /from\s+["'][^"']*(?:^|\/)(?:app|next|api|server|supabase|stripe|paypal|resend|17track)[^"']*["']/i, label);
    assert.doesNotMatch(source, /(?:from\s+)?["'][^"']*\.server(?:\.[^"']+)?["']/i, label);
    assert.doesNotMatch(source, /\bfetch\s*\(|document\.cookie|localStorage|sessionStorage/i, label);
  }
});

test("preview build configuration changes only the non-secret base path", async () => {
  const source = await readFile(new URL("vite.config.ts", root), "utf8");
  assert.match(source, /previewRoot/);
  assert.match(source, /input: resolve\(previewRoot, "index\.html"\)/);
  assert.match(source, /dist\/github-pages-preview/);
  assert.match(source, /PREVIEW_BASE_PATH/);
  assert.doesNotMatch(source, /SUPABASE|STRIPE|PAYPAL|SERVICE_ROLE|SECRET|COOKIE|TOKEN/i);
});

test("preview fixtures are explicit presentation data", async () => {
  const source = await readFile(new URL("fixtures.ts", root), "utf8");
  assert.match(source, /Frontend-preview presentation data only/);
  assert.match(source, /FRONTEND PREVIEW/);
  assert.match(source, /LOCAL BROWSER PREVIEW/);
  assert.match(source, /Paid — Demo/);
  assert.match(source, /UI PREVIEW ONLY/);
  assert.match(source, /Tracking is not implemented/);
  assert.match(source, /previewPaymentFixtures/);
  assert.match(source, /previewFulfillmentFixtures/);
  assert.match(source, /PREVIEW-COUPLE-MINI/);
  assert.match(source, /isAvailable: false/);
  assert.doesNotMatch(source, /receiptId|storageKey|objectKey|capability|paymentAttemptId|fulfillmentActionId/i);
});

test("hash router preserves repository subpaths and refreshable routes", async () => {
  const { normalizeBasePath, previewHref, parsePreviewRoute } = await import("../preview/github-pages/router.ts");
  assert.equal(normalizeBasePath("/figmemento-preview"), "/figmemento-preview/");
  assert.equal(previewHref("/shop", "/figmemento-preview/"), "/figmemento-preview/#/shop");
  assert.deepEqual(parsePreviewRoute("#/product/couple-figure"), { kind: "product", slug: "couple-figure" });
  assert.deepEqual(parsePreviewRoute("#/category/3d-figures"), { kind: "category", slug: "3d-figures" });
  assert.deepEqual(parsePreviewRoute("#/cart"), { kind: "placeholder", label: "Cart demo", route: "/cart" });
  assert.deepEqual(parsePreviewRoute("#"), { kind: "home" });
});
