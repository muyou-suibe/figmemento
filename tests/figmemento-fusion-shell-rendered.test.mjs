import assert from "node:assert/strict";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("shell-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("rendered real routes expose the Fusion shell and safe unavailable state", async () => {
  for (const path of ["/", "/shop", "/does-not-exist"]) {
    const response = await render(path);
    assert.ok(response.status === 200 || response.status === 404, `${path} returned ${response.status}`);
    const html = await response.text();
    assert.match(html, /FigMemento/);
    assert.match(html, /Skip to content/);
    assert.match(html, /Main navigation/);
    assert.match(html, /search a memory|Search a memory/i);
    assert.match(html, /href="\/shop"/);
    assert.match(html, /href="\/cart"/);
    assert.match(html, /href="\/track-order"/);
    assert.match(html, /href="\/faq"/);
    assert.match(html, /href="\/shipping-returns"/);
    assert.match(html, /href="\/journal"/i);
    assert.match(html, /href="\/about"/i);
    assert.match(html, /href="\/contact"/i);
    assert.match(html, /Free worldwide shipping over \$69/i);
    assert.match(html, /Preview every order before it ships/i);
    assert.match(html, /10% off your first keepsake/i);
  }
});

test("rendered unavailable catalog keeps the existing safe state and no fixture substitution", async () => {
  const response = await render("/shop");
  const html = await response.text();
  assert.match(html, /catalog unavailable|shop is taking a quiet moment/i);
  assert.doesNotMatch(html, /Custom Couple Figure|No sample products have been substituted/i);
});

test("rendered customer routes omit internal design annotation and retain customer footer navigation", async () => {
  for (const path of ["/", "/shop", "/category/3d-figures", "/journal", "/about", "/contact"]) {
    const response = await render(path);
    assert.equal(response.status, 200, `${path} returned ${response.status}`);
    const html = await response.text();
    assert.doesNotMatch(html, /Fusion design annotation|Fusion<\/b>\s*02\+07\+08\+12/);
    assert.doesNotMatch(html, /<b>BG<\/b>\s*#FDF8F2|<b>Motion<\/b>\s*reveal/);
    for (const href of ["/shop", "/journal", "/about", "/contact", "/privacy", "/terms", "/shipping-returns"]) {
      assert.match(html, new RegExp(`href="${href.replaceAll("/", "\\/")}"`));
    }
  }
});
