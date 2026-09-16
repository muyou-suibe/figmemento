import assert from "node:assert/strict";
import test from "node:test";

import { parseOrderRequestItem } from "../app/domain/order.ts";

const nativeItem = (overrides = {}) => ({
  productId: "product-couple-figure",
  variantId: "variant-couple-figure-mini",
  skuCode: "DEV-COUPLE-FIGURE-MINI",
  selectedOptions: [{ optionId: "option-size", valueId: "value-mini" }],
  quantity: 1,
  ...overrides,
});

test("native order request carries Product, Variant/SKU, and selected Option identities", () => {
  assert.deepEqual(parseOrderRequestItem(nativeItem()), { ...nativeItem(), customization: undefined });
});

test("native order request permits an empty selected-option set for a valid default-SKU shape", () => {
  assert.deepEqual(
    parseOrderRequestItem(nativeItem({ selectedOptions: [] })),
    { ...nativeItem({ selectedOptions: [] }), customization: undefined },
  );
});

test("malformed Product identity is rejected", () => {
  assert.equal(parseOrderRequestItem(nativeItem({ productId: " bad product " })), null);
});

test("malformed Variant identity is rejected", () => {
  assert.equal(parseOrderRequestItem(nativeItem({ variantId: "variant/other" })), null);
});

test("malformed SKU code is rejected instead of creating another SKU identity concept", () => {
  assert.equal(parseOrderRequestItem(nativeItem({ skuCode: "bad sku" })), null);
});

test("malformed selected Option entries are rejected", () => {
  assert.equal(parseOrderRequestItem(nativeItem({ selectedOptions: ["value-mini"] })), null);
  assert.equal(parseOrderRequestItem(nativeItem({ selectedOptions: [{ optionId: "option-size" }] })), null);
});

test("duplicate selected Product Option identifiers are rejected", () => {
  assert.equal(parseOrderRequestItem(nativeItem({
    selectedOptions: [
      { optionId: "option-size", valueId: "value-mini" },
      { optionId: "option-size", valueId: "value-standard" },
    ],
  })), null);
});

test("selected Option entries accept identifiers only", () => {
  assert.equal(parseOrderRequestItem(nativeItem({
    selectedOptions: [{ optionId: "option-size", valueId: "value-mini", label: "Mini" }],
  })), null);
});

test("Customization remains a separate sibling payload", () => {
  const customization = { note: "Keep the pose relaxed.", photoPath: "drafts/1234.jpg" };
  const parsed = parseOrderRequestItem(nativeItem({ customization }));
  assert.ok(parsed && "variantId" in parsed);
  assert.deepEqual(parsed.customization, customization);
  assert.deepEqual(parsed.selectedOptions, [{ optionId: "option-size", valueId: "value-mini" }]);
  assert.equal("customization" in parsed.selectedOptions[0], false);
});

test("browser price and currency are not accepted as Variant authority", () => {
  assert.equal(parseOrderRequestItem(nativeItem({ price: 1 })), null);
  assert.equal(parseOrderRequestItem(nativeItem({ priceCents: 1 })), null);
  assert.equal(parseOrderRequestItem(nativeItem({ currency: "USD" })), null);
});

test("arbitrary Variant metadata is rejected by the strict request boundary", () => {
  assert.equal(parseOrderRequestItem(nativeItem({ weightGrams: 450 })), null);
  assert.equal(parseOrderRequestItem(nativeItem({ isAvailable: true })), null);
  assert.equal(parseOrderRequestItem(nativeItem({ variant: { id: "variant-couple-figure-mini" } })), null);
});

test("partial native catalog identity is rejected fail closed", () => {
  assert.equal(parseOrderRequestItem({
    productId: "product-couple-figure",
    variantId: "variant-couple-figure-mini",
    selectedOptions: [{ optionId: "option-size", valueId: "value-mini" }],
    quantity: 1,
  }), null);
});

test("legacy Product-slug request remains only as the approved compatibility shape", () => {
  assert.deepEqual(
    parseOrderRequestItem({
      slug: "couple-figure",
      quantity: 2,
      customization: { note: "Legacy cart item" },
    }),
    {
      slug: "couple-figure",
      quantity: 2,
      customization: { note: "Legacy cart item" },
    },
  );
  assert.equal(parseOrderRequestItem({ slug: "Couple Figure" }), null);
});

test("native contract parsing is offline and does not invoke fetch", () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("Network access is forbidden in this contract test.");
  };
  try {
    assert.ok(parseOrderRequestItem(nativeItem()));
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
