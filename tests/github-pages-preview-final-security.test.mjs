import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const previewRoot = join(process.cwd(), "preview", "github-pages");
const artifactRoot = join(process.cwd(), "dist", "github-pages-preview");
const basePath = normalizeBasePath(process.env.PREVIEW_BASE_PATH ?? "/figmemento-preview/");

function normalizeBasePath(value) {
  const withLeadingSlash = value.startsWith("/") ? value : `/${value}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
}

async function filesUnder(root, extensions) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(path, extensions));
    else if (extensions.some((extension) => entry.name.endsWith(extension))) files.push(path);
  }
  return files;
}

function assertNoAuthorityLeak(source, label) {
  assert.doesNotMatch(source, /(?:\/api\/|https?:\/\/[^\s"'`]*(?:supabase|stripe|paypal|resend|17track|r2)|\b(?:supabase|stripe|paypal|resend|17track)\b)/i, label);
  assert.doesNotMatch(source, /\b(?:ownerId|receiptId|storageKey|objectKey|paymentAttemptId|fulfillmentActionId|signedUrl|accessToken|refreshToken)\b/i, label);
  assert.doesNotMatch(source, /(?:SUPABASE_|STRIPE_|PAYPAL_|RESEND_|CLOUDFLARE_)[A-Z0-9_]*|(?:sk|pk)_(?:live|test)_[A-Za-z0-9]+/i, label);
}

test("Final Batch artifact is isolated, secret-free, and provider-free", async () => {
  const artifactFiles = await filesUnder(artifactRoot, [".html", ".css", ".js"]);
  assert.ok(artifactFiles.length >= 3);
  for (const file of artifactFiles) {
    const source = await readFile(file, "utf8");
    assertNoAuthorityLeak(source, file);
    assert.doesNotMatch(source, /(?:localhost|127\.0\.0\.1|document\.cookie|localStorage|sessionStorage|indexedDB)/i, file);
    assert.doesNotMatch(source, /(?:XMLHttpRequest|WebSocket)\s*\(/, file);
    assert.doesNotMatch(source, /(?:\/api\/|supabase|stripe|paypal|resend|17track|r2)\b/i, file);
  }
});

test("Final Batch artifact references only same-site static assets", async () => {
  const html = await readFile(join(artifactRoot, "index.html"), "utf8");
  const htmlReferences = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(htmlReferences.length >= 2);
  assert.ok(htmlReferences.every((reference) => reference.startsWith(basePath)), htmlReferences.join("\n"));
  assert.doesNotMatch(htmlReferences.join("\n"), /https?:\/\/|\/\/[^/]/);

  const styles = (await filesUnder(artifactRoot, [".css"])).map((file) => readFile(file, "utf8"));
  const css = (await Promise.all(styles)).join("\n");
  const cssReferences = [...css.matchAll(/(?:url|@import)\s*\(?["']?([^\s"')]+)["']?\)?/gi)].map((match) => match[1]);
  assert.ok(cssReferences.every((reference) => reference.startsWith(basePath) || reference.startsWith("data:")), cssReferences.join("\n"));

  const scripts = (await filesUnder(artifactRoot, [".js"])).map((file) => readFile(file, "utf8"));
  const javascript = (await Promise.all(scripts)).join("\n");
  assertNoAuthorityLeak(javascript, "generated JavaScript");
  assert.match(javascript, /FRONTEND PREVIEW/);
  assert.match(javascript, /Paid — Demo/);
  assert.match(javascript, /FM-PREVIEW-DEMO/);
  assert.match(javascript, /Tracking is not implemented/);
});

test("Preview source keeps the authority firewall and local-only image behavior", async () => {
  const sourceFiles = await filesUnder(previewRoot, [".ts", ".tsx"]);
  assert.ok(sourceFiles.length >= 5);
  for (const file of sourceFiles) {
    const source = await readFile(file, "utf8");
    const label = file.replace(`${previewRoot}/`, "");
    assert.doesNotMatch(source, /from\s+["'][^"']*(?:app\/api|supabase|stripe|paypal|resend|17track|server)[^"']*["']/i, label);
    assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(|document\.cookie|localStorage|sessionStorage|indexedDB/i, label);
  }
});
