import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { acceptCartItem } from "../app/application/shopping-cart-service.ts";
import { formatCurrencyCents } from "../app/application/catalog-storefront.ts";
import { readCartConfig, ServerConfigurationError } from "../app/config/server.ts";
import {
  calculateCartSubtotal,
  LOCAL_CART_COOKIE_NAME,
  MAX_CART_LINE_QUANTITY,
  toPublicShoppingCart,
} from "../app/domain/shopping-cart.ts";
import { LocalMemoryShoppingCartProvider } from "../app/infrastructure/cart/local-memory-shopping-cart-provider.ts";
import { createServerCatalogRepository } from "../app/infrastructure/catalog/server-catalog-repository.ts";
import { createServerCustomizationFieldRepository } from "../app/infrastructure/customization/server-customization-field-repository.ts";
import { cartCookieHeader } from "../app/server/shopping-cart-runtime.server.ts";
import { isSameOriginCartMutation } from "../app/server/cart-http.server.ts";

function safeSummary() {
  return {
    configuration: { sku: "SKU-TEST", options: [{ label: "Size", value: "Standard" }], needsReview: false },
    personalization: { status: "current", rows: [{ kind: "short_text", label: "Message", state: "provided", value: "For you" }] },
  };
}

function item(overrides = {}) {
  return {
    handoff: {
      productId: "product-test",
      variantId: "variant-test",
      skuCode: "SKU-TEST",
      selectedOptions: [{ optionId: "option-size", valueId: "value-standard" }],
      configurationRevision: "revision-test",
      customizationValues: [{ fieldId: "field-message", fieldCode: "message", kind: "short_text", value: "For you" }],
    },
    snapshot: {
      productId: "product-test",
      productName: "Test Gift",
      productSlug: "test-gift",
      variantId: "variant-test",
      skuCode: "SKU-TEST",
      selectedOptions: [{ optionId: "option-size", valueId: "value-standard" }],
      unitPriceCents: 2_500,
      currency: "USD",
      availability: "available",
    },
    customization: safeSummary(),
    ...overrides,
  };
}

function deterministicProvider() {
  let next = 0;
  return new LocalMemoryShoppingCartProvider({ nextId: () => `cart-test-id-${++next}` });
}

test("Cart source is explicit and local_fake is rejected outside development/test", () => {
  assert.deepEqual(readCartConfig({}), { source: "disabled", runtimeMode: "unknown" });
  assert.deepEqual(readCartConfig({ CART_SOURCE: "local_fake" }, "test"), { source: "local_fake", runtimeMode: "test" });
  assert.throws(() => readCartConfig({ CART_SOURCE: "local_fake" }, "production"), ServerConfigurationError);
});

test("every explicit Add creates a new line and only exact line mutation changes quantity", async () => {
  const provider = deterministicProvider();
  const created = await provider.createCart();
  assert.equal(created.status, "found");
  const first = await provider.addLine(created.value.cartId, item());
  const second = await provider.addLine(created.value.cartId, item({ handoff: { ...item().handoff, customizationValues: [{ fieldId: "field-message", fieldCode: "message", kind: "short_text", value: "For us" }] } }));
  assert.equal(first.status, "found");
  assert.equal(second.status, "found");
  assert.equal(second.value.lines.length, 2);
  assert.notEqual(second.value.lines[0].lineId, second.value.lines[1].lineId);
  const updated = await provider.updateLine(created.value.cartId, second.value.lines[0].lineId, 2);
  assert.equal(updated.status, "found");
  assert.deepEqual(updated.value.lines.map((line) => line.quantity), [2, 1]);
  const invalid = await provider.updateLine(created.value.cartId, second.value.lines[0].lineId, MAX_CART_LINE_QUANTITY + 1);
  assert.deepEqual(invalid, { status: "source_failure" });
});

test("line ownership, clear semantics, and process reset stay bounded", async () => {
  const provider = deterministicProvider();
  const one = await provider.createCart();
  const two = await provider.createCart();
  assert.equal(one.status, "found");
  assert.equal(two.status, "found");
  const added = await provider.addLine(one.value.cartId, item());
  assert.equal(added.status, "found");
  const crossCart = await provider.removeLine(two.value.cartId, added.value.lines[0].lineId);
  assert.deepEqual(crossCart, { status: "not_found" });
  const cleared = await provider.clearCart(one.value.cartId);
  assert.equal(cleared.status, "found");
  assert.equal(cleared.value.lines.length, 0);
  const restarted = deterministicProvider();
  assert.deepEqual(await restarted.getCart(one.value.cartId), { status: "not_found" });
});

test("public Cart projection excludes internal Cart and configured-item/private fields", () => {
  const record = {
    cartId: "internal-cart-id",
    lines: [{
      lineId: "internal-line-id",
      handoff: { productId: "p", variantId: "v", skuCode: "S", selectedOptions: [], configurationRevision: "r", customizationValues: [{ fieldId: "f", fieldCode: "image", kind: "image", images: [{ receiptId: "private-receipt" }] }] },
      snapshot: { productId: "p", productName: "Gift", productSlug: "gift", variantId: "v", skuCode: "S", selectedOptions: [], unitPriceCents: 1_000, currency: "USD", availability: "available" },
      customization: { configuration: { sku: "S", options: [], needsReview: false }, personalization: { status: "current", rows: [{ kind: "image", label: "Photo", state: "provided", imageCount: 1 }] } },
      quantity: 1,
    }],
  };
  const serialized = JSON.stringify(toPublicShoppingCart(record));
  assert.doesNotMatch(serialized, /internal-cart-id|private-receipt|receiptId|ownerId|storageKey|signedUrl/);
  assert.match(serialized, /internal-line-id/);
});

test("mixed-currency subtotal fails closed and presentation uses actual currency", () => {
  const lines = [item(), { ...item(), snapshot: { ...item().snapshot, currency: "EUR" } }];
  assert.equal(calculateCartSubtotal(lines), null);
  assert.deepEqual(toPublicShoppingCart({ cartId: "cart", lines }), { status: "failure", lines: [] });
  assert.equal(formatCurrencyCents(1_234, "EUR"), "€12.34");
  assert.doesNotMatch(formatCurrencyCents(1_234, "EUR"), /\$/);
});

test("Cart cookie is dedicated, HttpOnly, Lax, host-only, and never has Domain", () => {
  const header = cartCookieHeader("opaque-cart-id-12345678901234567890", "development");
  assert.match(header, new RegExp(`^${LOCAL_CART_COOKIE_NAME}=`));
  assert.match(header, /Path=\//);
  assert.match(header, /HttpOnly/);
  assert.match(header, /SameSite=Lax/);
  assert.doesNotMatch(header, /Domain=/i);
});

test("Cart mutation protection rejects missing/cross/forwarded origins before mutation", () => {
  const good = new Request("http://localhost:3000/api/cart", { method: "POST", headers: { origin: "http://localhost:3000", "sec-fetch-site": "same-origin" } });
  const missing = new Request("http://localhost:3000/api/cart", { method: "POST" });
  const cross = new Request("http://localhost:3000/api/cart", { method: "POST", headers: { origin: "https://attacker.test", "sec-fetch-site": "cross-site" } });
  const forwarded = new Request("http://localhost:3000/api/cart", { method: "POST", headers: { origin: "http://localhost:3000", "x-forwarded-host": "attacker.test" } });
  assert.equal(isSameOriginCartMutation(good), true);
  assert.equal(isSameOriginCartMutation(new Request("http://127.0.0.1:43123/api/cart", { method: "POST", headers: { origin: "http://127.0.0.1:43123", "sec-fetch-site": "same-origin" } })), true);
  assert.equal(isSameOriginCartMutation(missing), false);
  assert.equal(isSameOriginCartMutation(cross), false);
  assert.equal(isSameOriginCartMutation(forwarded), false);
  assert.equal(isSameOriginCartMutation(new Request("http://localhost:3000/api/cart", { method: "POST", headers: { origin: "http://localhost:3000", "x-forwarded-host": "localhost:3000", "sec-fetch-site": "same-origin" } })), true);
});

test("private image Cart Add remains fail-closed without a verified owner/repository", async () => {
  const catalogSource = await createServerCatalogRepository({ PHOTOGIFT_PRODUCT_SOURCE: "fixture", NODE_ENV: "test" });
  assert.equal(catalogSource.status, "found");
  const customizationSource = createServerCustomizationFieldRepository({ PHOTOGIFT_PRODUCT_SOURCE: "fixture", NODE_ENV: "test" });
  const detail = await catalogSource.value.repository.findPublicProductBySlug("couple-figure");
  assert.equal(detail.status, "found");
  const variant = detail.value.variants.find((candidate) => candidate.isActive && candidate.isAvailable);
  assert.ok(variant);
  const configuration = await customizationSource.repository.getCustomizationFieldsForProduct(detail.value.product.id);
  assert.equal(configuration.status, "found");
  const imageField = configuration.value.fields.find((field) => field.kind === "image");
  assert.ok(imageField);
  const result = await acceptCartItem({
    productId: detail.value.product.id,
    variantId: variant.id,
    skuCode: variant.skuCode,
    selectedOptions: variant.selectedOptions,
    configurationRevision: configuration.value.configurationRevision,
    customizationValues: [{ fieldId: imageField.id, fieldCode: imageField.code, kind: "image", images: [{ receiptId: "private-receipt" }] }],
  }, { observedAt: new Date().toISOString(), catalogRepository: catalogSource.value.repository, customizationFieldRepository: customizationSource.repository });
  assert.deepEqual(result, { status: "rejected", reason: "invalid_item" });
});

test("text-only Cart Add remains independent of CustomerUpload receipt authority", async () => {
  const catalogSource = await createServerCatalogRepository({ PHOTOGIFT_PRODUCT_SOURCE: "fixture", NODE_ENV: "test" });
  assert.equal(catalogSource.status, "found");
  const customizationSource = createServerCustomizationFieldRepository({ PHOTOGIFT_PRODUCT_SOURCE: "fixture", NODE_ENV: "test" });
  const detail = await catalogSource.value.repository.findPublicProductBySlug("digital-portrait");
  assert.equal(detail.status, "found");
  const variant = detail.value.variants[0];
  const configuration = await customizationSource.repository.getCustomizationFieldsForProduct(detail.value.product.id);
  assert.equal(configuration.status, "found");

  const result = await acceptCartItem({
    productId: detail.value.product.id,
    variantId: variant.id,
    skuCode: variant.skuCode,
    selectedOptions: variant.selectedOptions,
    configurationRevision: configuration.value.configurationRevision,
    customizationValues: [],
  }, {
    observedAt: new Date().toISOString(),
    catalogRepository: catalogSource.value.repository,
    customizationFieldRepository: customizationSource.repository,
  });
  assert.equal(result.status, "accepted");
});

test("PDP Add to Cart uses the existing Cart item acceptance route", async () => {
  const source = await readFile(new URL("../app/storefront/AddToCartButton.tsx", import.meta.url), "utf8");
  assert.match(source, /fetch\("\/api\/cart"/);
  assert.doesNotMatch(source, /fetch\("\/api\/cart\/items"/);
});
