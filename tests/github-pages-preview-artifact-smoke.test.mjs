import assert from "node:assert/strict";
import { createReadStream } from "node:fs";
import { access, readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { join, normalize, relative } from "node:path";
import test from "node:test";

const outputRoot = join(process.cwd(), "dist", "github-pages-preview");
const basePath = normalizeBasePath(process.env.PREVIEW_BASE_PATH ?? "/figmemento-preview/");
const routes = [
  "#/",
  "#/shop",
  "#/category/3d-figures",
  "#/product/couple-figure",
  "#/cart",
  "#/checkout",
  "#/payment",
  "#/order-success",
  "#/fulfillment",
  "#/operator",
];

function normalizeBasePath(value) {
  const withLeadingSlash = value.startsWith("/") ? value : `/${value}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
}

function contentTypeFor(pathname) {
  if (pathname.endsWith(".css")) return "text/css; charset=utf-8";
  if (pathname.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (pathname.endsWith(".html")) return "text/html; charset=utf-8";
  return "application/octet-stream";
}

async function serveFile(pathname, response) {
  const requested = pathname.slice(basePath.length) || "index.html";
  const candidate = normalize(join(outputRoot, requested));
  if (relative(outputRoot, candidate).startsWith("..")) {
    response.writeHead(403).end();
    return;
  }
  try {
    const file = await stat(candidate);
    if (!file.isFile()) throw new Error("not a file");
    response.writeHead(200, { "content-type": contentTypeFor(candidate) });
    createReadStream(candidate).pipe(response);
  } catch {
    response.writeHead(404).end();
  }
}

test("generated Pages artifact serves hash routes below a repository subpath", async () => {
  await access(join(outputRoot, "index.html"));
  const html = await readFile(join(outputRoot, "index.html"), "utf8");
  assert.doesNotMatch(html, /(?:src|href)=["\/]assets\//);
  const allReferences = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(allReferences.length >= 2);
  assert.ok(allReferences.every((value) => value.startsWith(basePath)), allReferences.join("\n"));
  assert.doesNotMatch(allReferences.join("\n"), /https?:\/\/|\/\/[^/]/);
  const assetReferences = allReferences.filter((value) => value.startsWith(basePath));
  assert.ok(assetReferences.length >= 2);

  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (!url.pathname.startsWith(basePath)) {
      response.writeHead(404).end();
      return;
    }
    void serveFile(url.pathname, response);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
      const home = await fetch(`${origin}${basePath}`);
      assert.equal(home.status, 200);
      assert.match(home.headers.get("content-type") ?? "", /^text\/html\b/i);
      const homeBody = await home.text();
    assert.equal(homeBody, html);
    for (const route of routes) {
      const page = await fetch(`${origin}${basePath}${route}`);
      assert.equal(page.status, 200, route);
      assert.equal(await page.text(), html, route);
    }
    for (const asset of assetReferences) {
      const assetResponse = await fetch(`${origin}${asset}`);
      assert.equal(assetResponse.status, 200, asset);
      assert.match(assetResponse.headers.get("content-type") ?? "", /^(?:text\/javascript|text\/css)\b/i, asset);
    }

    const missingMedia = await fetch(`${origin}${basePath}assets/missing-media.webp`);
    assert.equal(missingMedia.status, 404);
    const javascript = (await Promise.all(assetReferences
      .filter((asset) => asset.endsWith(".js"))
      .map((asset) => readFile(join(outputRoot, asset.slice(basePath.length)), "utf8")))).join("\n");
    assert.match(javascript, /preview-media-fallback/);
    assert.doesNotMatch(javascript, /https?:\/\/example\.com/i);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
