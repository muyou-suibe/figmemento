import assert from "node:assert/strict";
import { createReadStream } from "node:fs";
import { access, readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { join, normalize, relative } from "node:path";
import test from "node:test";

const outputRoot = join(process.cwd(), "dist", "github-pages-preview");
const basePath = process.env.PREVIEW_BASE_PATH ?? "/figmemento-frontend-preview/";
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
    response.writeHead(200);
    createReadStream(candidate).pipe(response);
  } catch {
    response.writeHead(404).end();
  }
}

test("generated Pages artifact serves hash routes below a repository subpath", async () => {
  await access(join(outputRoot, "index.html"));
  const html = await readFile(join(outputRoot, "index.html"), "utf8");
  assert.doesNotMatch(html, /(?:src|href)=["\/]assets\//);
  const assetReferences = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1]).filter((value) => value.startsWith(basePath));
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
    }
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
