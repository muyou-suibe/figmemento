import assert from "node:assert/strict";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the PhotoGift storefront", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>PhotoGift — Little pieces of the people you love<\/title>/i);
  assert.match(html, /Your favorite moments/);
  assert.match(html, /Loading the gift collection/);
  assert.doesNotMatch(html, /Custom Couple Figure/);
  assert.match(html, /Gift categories/);
  assert.match(html, /How it works/);
  assert.doesNotMatch(html, /Your site is taking shape|codex-preview|react-loading-skeleton/i);
});
