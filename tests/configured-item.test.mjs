import assert from "node:assert/strict";
import test from "node:test";

import { parseConfiguredItemHandoff } from "../app/domain/configured-item.ts";

function handoff(overrides = {}) {
  return {
    productId: "product-couple-figure",
    variantId: "variant-couple-figure-mini",
    skuCode: "DEV-COUPLE-FIGURE-MINI",
    selectedOptions: [{ optionId: "option-size", valueId: "value-mini" }],
    configurationRevision: "customization-v1",
    customizationValues: [
      {
        fieldId: "field-name",
        fieldCode: "name",
        kind: "short_text",
        value: "Ada",
      },
      {
        fieldId: "field-photo",
        fieldCode: "photo",
        kind: "image",
        images: [{
          receiptId: "receipt-a",
          crop: { x: 0, y: 0, width: 1, height: 1 },
        }],
      },
    ],
    ...overrides,
  };
}

function parse(input = handoff()) {
  return parseConfiguredItemHandoff(input);
}

test("parses the normalized configured-item structural contract and preserves ordered values", () => {
  const result = parse();
  assert.ok(result.ok);
  assert.deepEqual(result.value, handoff());
  assert.deepEqual(
    result.value.customizationValues.map((value) => value.fieldId),
    ["field-name", "field-photo"],
  );
  assert.ok(result.value.customizationValues[1].kind === "image");
  assert.deepEqual(result.value.customizationValues[1].images, [{
    receiptId: "receipt-a",
    crop: { x: 0, y: 0, width: 1, height: 1 },
  }]);
});

test("requires the native C1 Product, Variant, SKU, selected-option, and claimed revision shapes", () => {
  assert.equal(parse(handoff({ productId: "bad product" })).ok, false);
  assert.equal(parse(handoff({ variantId: "bad/variant" })).ok, false);
  assert.equal(parse(handoff({ skuCode: "bad sku" })).ok, false);
  assert.equal(parse(handoff({ configurationRevision: "  " })).ok, false);
  assert.equal(parse(handoff({ selectedOptions: [{ optionId: "option-size" }] })).ok, false);
  assert.equal(parse(handoff({
    selectedOptions: [
      { optionId: "option-size", valueId: "value-mini" },
      { optionId: "option-size", valueId: "value-standard" },
    ],
  })).ok, false);
  assert.equal(parse(handoff({
    selectedOptions: [{
      fieldId: "field-photo",
      fieldCode: "photo",
      kind: "image",
      images: [{ receiptId: "receipt-a" }],
    }],
  })).ok, false);
});

test("rejects malformed, duplicate, and provider-shaped Customization values", () => {
  assert.equal(parse(handoff({ customizationValues: [{
    fieldId: "field-name", fieldCode: "name", kind: "short_text",
  }] })).ok, false);
  assert.equal(parse(handoff({ customizationValues: [
    { fieldId: "field-name", fieldCode: "name", kind: "short_text", value: "Ada" },
    { fieldId: "field-name", fieldCode: "name", kind: "long_text", value: "Grace" },
  ] })).ok, false);
  assert.equal(parse(handoff({ customizationValues: [{
    fieldId: "field-photo", fieldCode: "photo", kind: "image",
    images: [{ receiptId: "receipt-a", storageKey: "drafts/a.jpg" }],
  }] })).ok, false);
  assert.equal(parse(handoff({ customizationValues: [{
    fieldId: "field-photo", fieldCode: "photo", kind: "image",
    images: [{ receiptId: "receipt-a", crop: { x: 0, y: 0, width: 1, height: 1 } }],
    productId: "product-other",
  }] })).ok, false);
});

test("rejects every unapproved browser authority at the strict top-level boundary", () => {
  for (const extra of [
    { price: 1 }, { priceCents: 100 }, { unitPrice: 1 }, { unitPriceCents: 100 },
    { basePrice: 1 }, { basePriceCents: 100 }, { currency: "USD" },
    { subtotal: 1 }, { subtotalCents: 100 }, { total: 1 }, { totalCents: 100 },
    { surcharge: 1 }, { surchargeCents: 100 }, { customizationPrice: 1 },
    { customizationSurcharge: 1 }, { discount: 1 }, { weight: 100 },
    { weightGrams: 100 }, { shippingPrice: 1 }, { shippingRate: 1 },
    { shippingMethod: "express" }, { fulfillmentType: "physical" },
    { productionMode: "custom_manufacturing" }, { leadTime: 5 },
    { bucket: "private" }, { storageKey: "drafts/a.jpg" }, { photoPath: "drafts/a.jpg" },
    { photoPaths: ["drafts/a.jpg"] }, { signedUrl: "https://example.test/a" },
    { url: "https://example.test/a" }, { provider: "supabase" }, { supabase: {} },
    { r2Key: "a" }, { orderId: "order-1" }, { orderItemId: "item-1" },
    { paymentStatus: "paid" }, { stripePrice: "price_1" }, { stripeSessionId: "cs_1" },
    { photoReviewStatus: "pending" }, { digitalDeliveryPath: "delivery/a" },
    { digitalDeliveryName: "a.zip" }, { unknownAuthority: true }, { quantity: 1 },
  ]) {
    assert.equal(parse(handoff(extra)).ok, false, `expected rejection for ${Object.keys(extra)[0]}`);
  }
});

test("same SKU handoffs preserve distinct text and receipt content without creating a cart identity", () => {
  const textA = parse(handoff());
  const textB = parse(handoff({ customizationValues: [
    { fieldId: "field-name", fieldCode: "name", kind: "short_text", value: "Grace" },
    { fieldId: "field-photo", fieldCode: "photo", kind: "image", images: [{ receiptId: "receipt-a" }] },
  ] }));
  const receiptB = parse(handoff({ customizationValues: [
    { fieldId: "field-name", fieldCode: "name", kind: "short_text", value: "Ada" },
    { fieldId: "field-photo", fieldCode: "photo", kind: "image", images: [{ receiptId: "receipt-b" }] },
  ] }));

  assert.ok(textA.ok && textB.ok && receiptB.ok);
  assert.deepEqual(
    [textA.value, textB.value, receiptB.value].map(({ productId, variantId, skuCode, selectedOptions }) => ({
      productId, variantId, skuCode, selectedOptions,
    })),
    Array.from({ length: 3 }, () => ({
      productId: "product-couple-figure",
      variantId: "variant-couple-figure-mini",
      skuCode: "DEV-COUPLE-FIGURE-MINI",
      selectedOptions: [{ optionId: "option-size", valueId: "value-mini" }],
    })),
  );
  assert.notDeepEqual(textA.value.customizationValues, textB.value.customizationValues);
  assert.notDeepEqual(textA.value.customizationValues, receiptB.value.customizationValues);
  for (const result of [textA, textB, receiptB]) {
    assert.equal("cartKey" in result.value, false);
    assert.equal("fingerprint" in result.value, false);
    assert.equal("mergeKey" in result.value, false);
    assert.equal("quantity" in result.value, false);
    assert.equal("quality" in result.value, false);
    assert.equal("resolvedImageMetadata" in result.value, false);
  }
});

test("is a pure structural parser with no Product, Variant, field, storage, or network access", () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("Network access is forbidden in configured-item tests.");
  };
  try {
    assert.ok(parse().ok);
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
