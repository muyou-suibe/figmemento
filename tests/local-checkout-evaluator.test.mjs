import assert from "node:assert/strict";
import test from "node:test";

import { LocalCheckoutEvaluator } from "../app/application/local-checkout-evaluator.ts";
import {
  resolveLocalCouponFixture,
  resolveLocalShippingFixture,
} from "../app/infrastructure/local-checkout/local-checkout-fixtures.ts";

const evaluatedAt = "2026-08-19T00:00:00.000Z";
const productId = "product-ready";
const variantId = "variant-ready";
const categoryId = "category-ready";
const skuCode = "SKU-READY";

const category = {
  id: categoryId,
  slug: "gifts",
  name: "Gifts",
  description: "A test category.",
  seo: {},
  lifecycle: "published",
};

const product = {
  id: productId,
  slug: "ready-gift",
  categoryId,
  name: "Ready Gift",
  description: "A test product.",
  seo: {},
  lifecycle: "published",
};

const variant = {
  id: variantId,
  productId,
  skuCode,
  priceCents: 2_500,
  currency: "USD",
  weightGrams: 500,
  isActive: true,
  isAvailable: true,
  isDefault: true,
  supplyMethod: "made_to_order",
  selectedOptions: [],
};

const fulfillment = {
  id: "fulfillment-ready",
  productId,
  fulfillmentType: "physical",
  requiresShipping: true,
  productionMode: "custom_manufacturing",
  leadTime: { minBusinessDays: 5, maxBusinessDays: 10 },
};

const detail = {
  category,
  product,
  listingPrice: { kind: "single", priceCents: variant.priceCents, currency: "USD" },
  options: [],
  optionValues: [],
  variants: [variant],
  assets: [],
  fulfillment,
};

const emptyCustomization = {
  configuration: { sku: skuCode, options: [], needsReview: false },
  personalization: { status: "empty_configuration", rows: [] },
};

const textField = {
  id: "field-note",
  productId,
  code: "note",
  label: "Note",
  kind: "short_text",
  required: false,
  isActive: true,
  position: 0,
  configurationRevision: "revision-a",
  constraints: { maxLength: 80 },
};

const request = {
  address: {
    email: "demo@example.test",
    firstName: "Demo",
    lastName: "Shopper",
    country: "US",
    city: "New York",
    addressLine1: "1 Demo Street",
    postalCode: "10001",
  },
  shippingMethod: "local_standard",
};

function makeLine(overrides = {}) {
  const { handoff: handoffOverrides = {}, snapshot: snapshotOverrides = {}, ...lineOverrides } = overrides;
  return {
    lineId: "line-a",
    handoff: {
      productId,
      variantId,
      skuCode,
      selectedOptions: [],
      configurationRevision: "revision-a",
      customizationValues: [],
      ...handoffOverrides,
    },
    snapshot: {
      productId,
      productName: product.name,
      productSlug: product.slug,
      variantId,
      skuCode,
      selectedOptions: [],
      unitPriceCents: variant.priceCents,
      currency: "USD",
      availability: "available",
      ...snapshotOverrides,
    },
    customization: emptyCustomization,
    quantity: 1,
    ...lineOverrides,
  };
}

function makeEvaluator({ lines = [makeLine()], catalog = detail, customization = { productId, configurationRevision: "revision-a", fields: [] }, overrides = {} } = {}) {
  const calls = { getCart: 0 };
  const cart = { cartId: "cart-ready", lines };
  const evaluator = new LocalCheckoutEvaluator({
    cartReader: {
      async getCart() {
        calls.getCart += 1;
        return { status: "found", value: structuredClone(cart) };
      },
    },
    catalogRepository: {
      async findPublicProductById() {
        return { status: "found", value: catalog };
      },
    },
    customizationFieldRepository: {
      async getCustomizationFieldsForProduct() {
        return { status: "found", value: customization };
      },
    },
    shippingResolver: resolveLocalShippingFixture,
    couponResolver: resolveLocalCouponFixture,
    ...overrides,
  });
  return { evaluator, calls, cart };
}

test("fresh evaluation reads the current Cart and derives authoritative summary", async () => {
  const value = makeEvaluator();
  const before = structuredClone(value.cart);
  const result = await value.evaluator.evaluate("cart-ready", {
    ...request,
    subtotalCents: 0,
    shippingCents: 0,
    discountCents: 99_999,
    localDemoTotalCents: 0,
  }, evaluatedAt);

  assert.equal(result.status, "accepted");
  assert.equal(result.value.subtotalCents, 2_500);
  assert.equal(result.value.shipping.amountCents, 500);
  assert.equal(result.value.localDemoTotalCents, 3_000);
  assert.equal(result.value.tax.status, "not_activated");
  assert.equal(result.value.tax.amountCents, null);
  assert.equal(result.value.lines[0].unitBasePriceCents, 2_500);
  assert.equal(result.value.lines[0].currency, "USD");
  assert.equal("id" in result.value, false);
  assert.equal("handoff" in result.value, false);
  assert.deepEqual(value.cart, before);
  assert.equal(value.calls.getCart, 1);
});

test("empty or missing Cart is blocked without creating Cart state", async () => {
  const empty = makeEvaluator({ lines: [] });
  const emptyResult = await empty.evaluator.evaluate("cart-ready", request, evaluatedAt);
  assert.equal(emptyResult.status, "blocked");
  assert.equal(emptyResult.issues[0].code, "EMPTY_CART");

  let reads = 0;
  const missing = makeEvaluator({ overrides: {
    cartReader: {
      async getCart() {
        reads += 1;
        return { status: "not_found" };
      },
    },
  } });
  const missingResult = await missing.evaluator.evaluate("missing-cart", request, evaluatedAt);
  assert.equal(missingResult.status, "blocked");
  assert.equal(missingResult.issues[0].code, "EMPTY_CART");
  assert.equal(reads, 1);
});

test("distinct configured-copy lines and quantity remain separate", async () => {
  const value = makeEvaluator({
    lines: [
      makeLine({
        lineId: "line-a",
        quantity: 2,
        handoff: {
          customizationValues: [{ fieldId: "field-note", fieldCode: "note", kind: "short_text", value: "Ada" }],
        },
      }),
      makeLine({
        lineId: "line-b",
        handoff: {
          customizationValues: [{ fieldId: "field-note", fieldCode: "note", kind: "short_text", value: "Grace" }],
        },
      }),
    ],
    customization: { productId, configurationRevision: "revision-a", fields: [textField] },
  });
  const result = await value.evaluator.evaluate("cart-ready", request, evaluatedAt);
  assert.equal(result.status, "accepted");
  assert.deepEqual(result.value.lines.map((line) => line.lineId), ["line-a", "line-b"]);
  assert.deepEqual(result.value.lines.map((line) => line.quantity), [2, 1]);
  assert.equal(result.value.subtotalCents, 7_500);
});

test("stale, invalid, unavailable, and authoritative-source failures fail safely", async () => {
  const stale = makeEvaluator({
    catalog: { ...detail, variants: [{ ...variant, priceCents: 2_600 }] },
  });
  const staleResult = await stale.evaluator.evaluate("cart-ready", request, evaluatedAt);
  assert.equal(staleResult.status, "blocked");
  assert.equal(staleResult.issues[0].code, "STALE_CATALOG");

  const invalidQuantity = makeEvaluator({ lines: [makeLine({ quantity: 0 })] });
  const invalidQuantityResult = await invalidQuantity.evaluator.evaluate("cart-ready", request, evaluatedAt);
  assert.equal(invalidQuantityResult.status, "blocked");
  assert.equal(invalidQuantityResult.issues[0].code, "CART_LINE_INVALID");

  const unavailable = makeEvaluator({
    catalog: { ...detail, variants: [{ ...variant, isAvailable: false }] },
  });
  const unavailableResult = await unavailable.evaluator.evaluate("cart-ready", request, evaluatedAt);
  assert.equal(unavailableResult.status, "blocked");
  assert.equal(unavailableResult.issues[0].code, "VARIANT_UNAVAILABLE");

  const sourceFailure = makeEvaluator({ overrides: {
    catalogRepository: {
      async findPublicProductById() {
        return { status: "source_failure", operation: "catalog.read" };
      },
    },
  } });
  const sourceFailureResult = await sourceFailure.evaluator.evaluate("cart-ready", request, evaluatedAt);
  assert.equal(sourceFailureResult.status, "unavailable");
  assert.equal(sourceFailureResult.issues[0].code, "CATALOG_UNAVAILABLE");

  const selectedOptionMismatch = makeEvaluator({
    lines: [makeLine({
      handoff: {
        selectedOptions: [{ optionId: "option-size", valueId: "value-standard" }],
      },
      snapshot: {
        selectedOptions: [{ optionId: "option-size", valueId: "value-standard" }],
      },
    })],
  });
  const selectedOptionMismatchResult = await selectedOptionMismatch.evaluator.evaluate("cart-ready", request, evaluatedAt);
  assert.equal(selectedOptionMismatchResult.status, "blocked");
  assert.equal(selectedOptionMismatchResult.issues[0].code, "STALE_CATALOG");
});

const imageField = {
  id: "field-image",
  productId,
  code: "photo",
  label: "Photo",
  kind: "image",
  required: true,
  isActive: true,
  position: 0,
  configurationRevision: "revision-a",
  constraints: {
    allowedMimeTypes: ["image/png"],
    maxBytes: 10_000,
    minDimensions: { width: 1, height: 1 },
    minImageCount: 1,
    maxImageCount: 1,
    cropEnabled: false,
  },
};

const imageLine = makeLine({
  handoff: {
    customizationValues: [{
      fieldId: "field-image",
      fieldCode: "photo",
      kind: "image",
      images: [{ receiptId: "private-receipt" }],
    }],
  },
});

const ownedReceiptRepository = {
  async findOwnedReceipt() {
    return {
      status: "found",
      value: {
        receiptId: "private-receipt",
        contentType: "image/png",
        byteSize: 100,
        dimensions: { width: 100, height: 100 },
        createdAt: "2026-08-18T00:00:00.000Z",
        expiresAt: "2026-08-20T00:00:00.000Z",
        lifecycle: "active",
      },
    };
  },
};

test("image lines require verified owner-scoped receipt authority", async () => {
  const noAuthority = makeEvaluator({ lines: [imageLine], customization: { productId, configurationRevision: "revision-a", fields: [imageField] } });
  const unavailable = await noAuthority.evaluator.evaluate("cart-ready", request, evaluatedAt);
  assert.equal(unavailable.status, "unavailable");
  assert.equal(unavailable.issues[0].code, "UPLOAD_UNAVAILABLE");

  const owned = makeEvaluator({
    lines: [imageLine],
    customization: { productId, configurationRevision: "revision-a", fields: [imageField] },
    overrides: { receiptRepository: ownedReceiptRepository, verifiedOwnerId: "verified-owner" },
  });
  const accepted = await owned.evaluator.evaluate("cart-ready", request, evaluatedAt);
  assert.equal(accepted.status, "accepted");
  assert.equal("receiptId" in accepted.value, false);
});

test("invalid, expired, and not-applicable coupons continue with zero discount", async () => {
  for (const couponCode of ["UNKNOWN", "EXPIRED10", "NOT_APPLICABLE"]) {
    const value = makeEvaluator();
    const result = await value.evaluator.evaluate("cart-ready", { ...request, couponCode }, evaluatedAt);
    assert.equal(result.status, "accepted", couponCode);
    assert.equal(result.value.coupon.status, couponCode === "UNKNOWN" ? "invalid" : couponCode === "EXPIRED10" ? "expired" : "not_applicable");
    assert.equal(result.value.coupon.discountCents, 0);
    assert.equal(result.value.localDemoTotalCents, 3_000);
  }

  const valid = makeEvaluator({ lines: [makeLine({ quantity: 2 })] });
  const validResult = await valid.evaluator.evaluate("cart-ready", { ...request, couponCode: "WELCOME10" }, evaluatedAt);
  assert.equal(validResult.status, "accepted");
  assert.equal(validResult.value.coupon.status, "valid");
  assert.equal(validResult.value.coupon.discountCents, 1_000);
  assert.equal(validResult.value.shipping.amountCents, 0); // Existing fixture waives shipping above 4,900.
  assert.equal(validResult.value.localDemoTotalCents, 4_000);
});

test("coupon authority failure and mixed currency fail closed without fixture fallback", async () => {
  const couponFailure = makeEvaluator({ overrides: {
    couponResolver() {
      throw new Error("internal coupon detail");
    },
  } });
  const unavailable = await couponFailure.evaluator.evaluate("cart-ready", request, evaluatedAt);
  assert.equal(unavailable.status, "unavailable");
  assert.equal(unavailable.issues[0].code, "COUPON_UNAVAILABLE");

  const mixedShipping = makeEvaluator({ overrides: {
    shippingResolver() {
      return {
        status: "eligible",
        country: "US",
        method: "local_standard",
        amountCents: 500,
        currency: "EUR",
        estimatedRange: "test",
        developmentOnly: true,
      };
    },
  } });
  const mixed = await mixedShipping.evaluator.evaluate("cart-ready", request, evaluatedAt);
  assert.equal(mixed.status, "blocked");
  assert.equal(mixed.issues[0].code, "MIXED_CURRENCY");

  const unsupportedShipping = makeEvaluator({ overrides: {
    shippingResolver() {
      return { status: "unsupported", issueCode: "SHIPPING_UNAVAILABLE", developmentOnly: true };
    },
  } });
  const unsupported = await unsupportedShipping.evaluator.evaluate("cart-ready", request, evaluatedAt);
  assert.equal(unsupported.status, "blocked");
  assert.equal(unsupported.issues[0].code, "SHIPPING_UNAVAILABLE");
});
