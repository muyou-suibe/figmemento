import assert from "node:assert/strict";
import test from "node:test";

process.env.CART_SOURCE = "disabled";

async function render(path) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("cart-test", `${process.pid}-${Date.now()}-${path}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
}

test("Cart page renders a safe hydration shell without checkout/payment claims", async () => {
  const response = await render("/cart");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Loading your local cart/i);
  assert.match(html, /FigMemento/i);
  assert.doesNotMatch(html, /Checkout|Pay now|Stripe|PayPal|final charge/i);
  assert.doesNotMatch(html, /receiptId|ownerId|storageKey|signedUrl|cartId/i);
});
