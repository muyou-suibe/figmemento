import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("Fusion Batch D keeps real Cart and Local Checkout presentation boundaries", async () => {
  const [cart, checkout, cartPage, checkoutPage] = await Promise.all([
    source("app/storefront/CartExperience.tsx"),
    source("app/storefront/LocalCheckoutExperience.tsx"),
    source("app/cart/page.tsx"),
    source("app/checkout/page.tsx"),
  ]);

  assert.match(cartPage, /fusionCartPage/);
  assert.match(checkoutPage, /fusionCheckoutPage/);
  assert.match(cart, /styles\.fusionCart/);
  assert.match(checkout, /styles\.fusionCheckout/);
  assert.match(cart, /fetch\("\/api\/cart"/);
  assert.match(cart, /method: "PATCH"/);
  assert.match(cart, /method: "DELETE"/);
  assert.match(cart, /notifyCartChanged\(\)/);
  assert.match(cart, /line\.lineId/);
  assert.match(cart, /line\.customization\.configuration\.options/);
  assert.match(cart, /line\.customization\.personalization/);
  assert.match(cart, /Your cart is empty/);
  assert.match(cart, /Cart unavailable/);
  assert.match(checkout, /fetch\("\/api\/checkout"/);
  assert.match(checkout, /shippingMethod/);
  assert.match(checkout, /couponCode/);
  assert.match(checkout, /localDemoTotalCents/);
  assert.match(checkout, /Not activated/);
  assert.match(checkout, /not a payable amount/);
  assert.match(checkout, /DEVELOPMENT \/ TEST ONLY/);
  assert.match(checkout, /Your Cart is empty/);
  assert.doesNotMatch(`${cart}\n${checkout}`, /Pay now|Amount Due|Payable Total|Charged Total|Stripe|PayPal|Card number/i);
});

test("Fusion Batch D renders loading shells inside the scoped surfaces", async () => {
  const quietLogger = {
    hasWarned: false,
    info() {},
    warn() {},
    warnOnce() {},
    error() {},
    clearScreen() {},
  };
  const server = await createServer({
    root: process.cwd(),
    configFile: false,
    appType: "custom",
    customLogger: quietLogger,
    server: { middlewareMode: true, hmr: false, watch: null },
  });

  try {
    const [cartModule, checkoutModule] = await Promise.all([
      server.ssrLoadModule("/app/storefront/CartExperience.tsx"),
      server.ssrLoadModule("/app/storefront/LocalCheckoutExperience.tsx"),
    ]);
    const cartMarkup = renderToStaticMarkup(createElement(cartModule.CartExperience));
    const checkoutMarkup = renderToStaticMarkup(createElement(checkoutModule.LocalCheckoutExperience));
    assert.match(cartMarkup, /fusionCart/);
    assert.match(cartMarkup, /Loading your local cart/);
    assert.match(checkoutMarkup, /fusionCheckout/);
    assert.match(checkoutMarkup, /Loading your local Cart/);
  } finally {
    await server.close();
  }
});

test("Fusion Batch D cart and checkout CSS is scoped, responsive, and token-backed", async () => {
  const css = await source("app/storefront/catalog-storefront.module.css");
  const batchDStart = css.indexOf("FUSION CART + LOCAL CHECKOUT — BATCH D");
  const nextBatchStart = css.indexOf("FUSION ORDER + FULFILLMENT + TRACKING — BATCH E", batchDStart);
  const batchD = css.slice(batchDStart, nextBatchStart === -1 ? css.length : nextBatchStart);

  assert.notEqual(batchD, css, "Batch D CSS marker must be present");
  for (const selector of [
    ".fusionCartPage",
    ".fusionCheckoutPage",
    ".fusionCart",
    ".fusionCheckout",
    ".fusionCart .cartLine",
    ".fusionCart .cartSummary",
    ".fusionCheckout .checkoutFieldset",
    ".fusionCheckout .checkoutSummary",
    ".fusionCheckout .checkoutFeedback",
  ]) assert.match(batchD, new RegExp(`${selector.replaceAll(".", "\\.")}\\b`));
  for (const breakpoint of ["960px", "720px", "520px"]) assert.match(batchD, new RegExp(`@media \\(max-width: ${breakpoint}\\)`));
  assert.match(batchD, /@media \(hover: none\), \(pointer: coarse\)/);
  assert.match(batchD, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(batchD, /var\(--fusion-(?:paper|ink|terra|gold|honey|line|shadow-card|shadow-lift|tap)/);
  assert.match(batchD, /position: sticky/);
  assert.match(batchD, /border-radius: var\(--fusion-radius-control\)/);
  assert.doesNotMatch(batchD, /fonts\.googleapis\.com|import\.meta\.env|process\.env/);
});
