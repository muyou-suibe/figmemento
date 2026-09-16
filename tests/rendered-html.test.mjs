import assert from "node:assert/strict";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the FigMemento storefront", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>FigMemento — Little pieces of the people you love<\/title>/i);
  assert.doesNotMatch(html, /<link[^>]+rel="canonical"[^>]+figmemento\.com/i);
  assert.match(html, /Every gift has an(?:<!-- -->)?\s+<em>unforgettable<\/em>\s+(?:<!-- -->)?shape of its own/);
  assert.match(html, /collection is temporarily unavailable/i);
  assert.doesNotMatch(html, /Custom Couple Figure/);
  assert.match(html, /No sample products have been substituted/);
  assert.match(html, /Explore the Collection/);
  assert.doesNotMatch(html, /DEVELOPMENT \/ TEST ONLY/);
  assert.doesNotMatch(html, /Your site is taking shape|codex-preview|react-loading-skeleton/i);
});

test("server-rendered V2 routes preserve the shared presentation shell and safe states", async () => {
  for (const [path, expected, hasSharedShell] of [
    ["/shop", /shop is taking a quiet moment|catalog unavailable/i, true],
    ["/category/3d-figures", /catalog unavailable/i, true],
    ["/product/couple-figure", /catalog unavailable/i, true],
    ["/account", /Customer accounts are not enabled|Sign in|Create account|Your account/i, true],
    ["/account/sign-in", /Customer accounts are not enabled|Use your local development account|Email/i, true],
    ["/account/sign-up", /Customer accounts are not enabled|Create a local development account|Email/i, true],
    ["/checkout", /Local checkout review|Your Cart is empty|Email/i, true],
    ["/order/success/FM-LOCAL-ABCDEF0123456789", /Loading your local order|Local Order is unavailable/i, true],
    ["/faq", /Frequently asked questions/i, false],
    ["/does-not-exist", /That little piece/i, false],
  ]) {
    const response = await render(path);
    assert.ok(response.status === 200 || response.status === 404, `${path} returned ${response.status}`);
    const html = await response.text();
    assert.match(html, /FigMemento/i);
    if (hasSharedShell) assert.match(html, /Skip to content/i);
    assert.match(html, expected);
    if (path === "/account/sign-in" || path === "/account/sign-up") {
      assert.match(html, /<h1[^>]+id="sign-(in|up)-title"/i);
      assert.doesNotMatch(html, /sessionId|access token|refresh token|JWT/i);
      if (!/Customer accounts are not enabled/i.test(html)) {
        assert.match(html, /<label[^>]*>Email<\/label>/i);
        assert.match(html, /<label[^>]*>Password<\/label>/i);
        assert.match(html, /autocomplete=/i);
        assert.match(html, /type="submit"/i);
      }
    }
    assert.doesNotMatch(html, /Bestseller|reviews|testimonials|Instagram/i);
  }
});

test("server-rendered Local Checkout keeps its non-payment language and safe shell", async () => {
  const response = await render("/checkout");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /FigMemento/i);
  assert.match(html, /Skip to content/i);
  assert.match(html, /Local checkout review|Email|Loading your local cart/i);
  assert.doesNotMatch(html, /Place Order|Pay Now|Buy Now|Amount Due|Payable Total|Charged Total/i);
  assert.doesNotMatch(html, /ownerId|receiptId|storageKey|bucket|provider locator|private object path|handoff|figmemento-local-cart/i);
});

test("server-renders Local V1 customer and support entry surfaces", async () => {
  for (const [path, expected] of [
    ["/contact", /Contact message|Write to the workshop/i],
    ["/account", /Account/i],
    ["/account/orders", /orders|Sign in/i],
    ["/account/points", /points|Sign in/i],
    ["/product/temporary-tattoo", /Catalog unavailable|Reviews|Temporary Tattoos/i],
    ["/track-order", /Track your order|Order number/i],
  ]) {
    const response = await render(path);
    assert.ok(response.status === 200 || response.status === 404, `${path} returned ${response.status}`);
    const html = await response.text();
    assert.match(html, /FigMemento/i);
    assert.match(html, expected, path);
    assert.match(html, /Language \/ Idioma \/ 语言/i, path);
    assert.doesNotMatch(html, /access token|refresh token|service role|private object path/i);
  }
});

test("Local Admin remains an authenticated route with stable dashboard anchors", async () => {
  const response = await render("/local-admin");
  assert.ok([200, 307, 308].includes(response.status), `unexpected /local-admin status ${response.status}`);
  if (response.status === 200) {
    const html = await response.text();
    assert.match(html, /Local Admin/i);
    assert.match(html, /id="notifications"/i);
    assert.match(html, /id="analytics"/i);
  } else {
    assert.equal(response.headers.get("location"), "http://localhost/admin/login");
  }
});
