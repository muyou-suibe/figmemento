import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { CheckoutReadinessEvaluator } from "../app/application/checkout-readiness-evaluator.ts";
import { GET } from "../app/api/checkout-readiness/route.ts";
import {
  getShoppingCartProvider,
  resetShoppingCartProviderForTests,
} from "../app/server/shopping-cart-runtime.server.ts";
import {
  aggregateCheckoutReadiness,
  readinessIssue,
} from "../app/domain/checkout-readiness.ts";
import { LOCAL_CART_COOKIE_NAME } from "../app/domain/shopping-cart.ts";

const evaluatedAt = "2026-08-18T00:00:00.000Z";
const productId = "product-ready";
const variantId = "variant-ready";
const categoryId = "category-ready";
const skuCode = "SKU-READY";

const category = {
  id: categoryId,
  slug: "gifts",
  name: "Gifts",
  description: "A test category for readiness.",
  seo: {},
  lifecycle: "published",
};

const product = {
  id: productId,
  slug: "ready-gift",
  categoryId,
  name: "Ready Gift",
  description: "A test product for readiness.",
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

const dependencies = [
  { name: "order_persistence", status: "satisfied" },
  { name: "shipping", status: "satisfied" },
  { name: "tax", status: "satisfied" },
  { name: "discount", status: "satisfied" },
  { name: "payment", status: "satisfied" },
];

function line(overrides = {}) {
  return {
    lineId: "line-a",
    handoff: {
      productId,
      variantId,
      skuCode,
      selectedOptions: [],
      configurationRevision: "revision-a",
      customizationValues: [],
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
    },
    customization: {
      configuration: { sku: skuCode, options: [], needsReview: false },
      personalization: { status: "empty_configuration", rows: [] },
    },
    quantity: 1,
    ...overrides,
  };
}

function makeEvaluator(lines = [line()], overrides = {}) {
  const calls = { getCart: 0 };
  const cart = { cartId: "cart-ready", lines };
  const evaluator = new CheckoutReadinessEvaluator({
    cartReader: {
      async getCart() {
        calls.getCart += 1;
        return { status: "found", value: structuredClone(cart) };
      },
    },
    catalogRepository: {
      async findPublicProductById() {
        return { status: "found", value: detail };
      },
    },
    customizationFieldRepository: {
      async getCustomizationFieldsForProduct() {
        return { status: "found", value: { productId, configurationRevision: "revision-a", fields: [] } };
      },
    },
    dependencies,
    ...overrides,
  });
  return { evaluator, calls, cart };
}

function imageEvaluator(expiresAt) {
  const imageLine = line({
    handoff: {
      ...line().handoff,
      customizationValues: [{ fieldId: "field-image", fieldCode: "photo", kind: "image", images: [{ receiptId: "private-receipt" }] }],
    },
  });
  const imageField = {
    id: "field-image", productId, code: "photo", label: "Photo", kind: "image", required: true,
    isActive: true, position: 0, configurationRevision: "revision-a",
    constraints: { allowedMimeTypes: ["image/png"], maxBytes: 10_000, minDimensions: { width: 1, height: 1 }, minImageCount: 1, maxImageCount: 1, cropEnabled: false },
  };
  return makeEvaluator([imageLine], {
    verifiedOwnerId: "verified-owner",
    receiptRepository: {
      async findOwnedReceipt() {
        return { status: "found", value: {
          receiptId: "private-receipt", contentType: "image/png", byteSize: 100,
          dimensions: { width: 100, height: 100 }, createdAt: "2026-08-17T00:00:00.000Z",
          expiresAt, lifecycle: "active",
        } };
      },
    },
    customizationFieldRepository: {
      async getCustomizationFieldsForProduct() {
        return { status: "found", value: { productId, configurationRevision: "revision-a", fields: [imageField] } };
      },
    },
  });
}

test("ready is a synthetic, read-only pre-checkout observation", async () => {
  const value = makeEvaluator();
  const before = structuredClone(value.cart);
  const report = await value.evaluator.evaluate("cart-ready", evaluatedAt);
  assert.equal(report.state, "ready");
  assert.deepEqual(report.issues, []);
  assert.deepEqual(report.lines.map((entry) => entry.lineId), ["line-a"]);
  assert.deepEqual(value.cart, before);
  assert.equal(value.calls.getCart, 1);
});

test("same-SKU configured copies remain independent report lines", async () => {
  const value = makeEvaluator([
    line({ lineId: "line-a" }),
    line({ lineId: "line-b" }),
  ]);
  const report = await value.evaluator.evaluate("cart-ready", evaluatedAt);
  assert.equal(report.state, "ready");
  assert.deepEqual(report.lines.map((entry) => entry.lineId), ["line-a", "line-b"]);
  assert.equal(report.lines.length, 2);
});

test("empty and missing current Cart are blocked without creating state", async () => {
  let reads = 0;
  const value = makeEvaluator([]);
  const empty = await value.evaluator.evaluate("cart-ready", evaluatedAt);
  assert.equal(empty.state, "blocked");
  assert.deepEqual(empty.issues.map((issue) => issue.code), ["EMPTY_CART"]);

  const missing = new CheckoutReadinessEvaluator({
    ...value.evaluator.dependencies,
    cartReader: { async getCart() { reads += 1; return { status: "not_found" }; } },
  });
  const absent = await missing.evaluate("stale-cart", evaluatedAt);
  assert.equal(absent.state, "blocked");
  assert.deepEqual(absent.issues.map((issue) => issue.code), ["EMPTY_CART"]);
  assert.equal(reads, 1);
});

test("fresh price and currency changes block without refreshing the Cart", async () => {
  const value = makeEvaluator();
  const before = structuredClone(value.cart);
  const changed = new CheckoutReadinessEvaluator({
    ...value.evaluator.dependencies,
    catalogRepository: {
      async findPublicProductById() {
        return { status: "found", value: {
          ...detail,
          variants: [{ ...variant, priceCents: 2_600, currency: "USD" }],
        } };
      },
    },
  });
  const report = await changed.evaluate("cart-ready", evaluatedAt);
  assert.equal(report.state, "blocked");
  assert.ok(report.issues.some((issue) => issue.code === "PRICE_CHANGED"));
  assert.deepEqual(value.cart, before);
});

test("a true currency change is distinct from a price change", async () => {
  const value = makeEvaluator([line({ snapshot: { ...line().snapshot, currency: "EUR" } })]);
  const before = structuredClone(value.cart);
  const report = await value.evaluator.evaluate("cart-ready", evaluatedAt);
  assert.equal(report.state, "blocked");
  assert.ok(report.issues.some((issue) => issue.code === "CURRENCY_CHANGED"));
  assert.ok(!report.issues.some((issue) => issue.code === "PRICE_CHANGED"));
  assert.deepEqual(value.cart, before);
});

test("selected options are compared without replacing the Cart Variant", async () => {
  const value = makeEvaluator([line()], {
    catalogRepository: {
      async findPublicProductById() {
        return { status: "found", value: {
          ...detail,
          options: [{ id: "option-size", productId, code: "size", name: "Size", kind: "size", required: true, position: 0 }],
          optionValues: [{ id: "value-standard", productId, optionId: "option-size", code: "standard", label: "Standard", position: 0 }],
          variants: [{ ...variant, selectedOptions: [{ optionId: "option-size", valueId: "value-standard" }] }],
        } };
      },
    },
  });
  const before = structuredClone(value.cart);
  const report = await value.evaluator.evaluate("cart-ready", evaluatedAt);
  assert.equal(report.state, "blocked");
  assert.ok(report.issues.some((issue) => issue.code === "OPTIONS_CHANGED"));
  assert.deepEqual(value.cart, before);
});

test("Product and Variant availability failures remain bounded and do not mutate the Cart", async () => {
  for (const [name, catalogResult, expected] of [
    ["Product not found", { status: "not_found" }, "ITEM_UNAVAILABLE"],
    ["Product unavailable", { status: "unavailable", reason: "not_public" }, "ITEM_UNAVAILABLE"],
  ]) {
    const value = makeEvaluator([line()], {
      catalogRepository: { async findPublicProductById() { return catalogResult; } },
    });
    const before = structuredClone(value.cart);
    const report = await value.evaluator.evaluate("cart-ready", evaluatedAt);
    assert.equal(report.state, "blocked", name);
    assert.ok(report.issues.some((issue) => issue.code === expected), name);
    assert.deepEqual(value.cart, before, name);
  }

  for (const [name, variantOverride] of [
    ["Variant inactive", { isActive: false }],
    ["Variant unavailable", { isAvailable: false }],
  ]) {
    const value = makeEvaluator([line()], {
      catalogRepository: { async findPublicProductById() { return { status: "found", value: { ...detail, variants: [{ ...variant, ...variantOverride }] } }; } },
    });
    const before = structuredClone(value.cart);
    const report = await value.evaluator.evaluate("cart-ready", evaluatedAt);
    assert.equal(report.state, "blocked", name);
    assert.ok(report.issues.some((issue) => issue.code === "ITEM_UNAVAILABLE"), name);
    assert.deepEqual(value.cart, before, name);
  }
});

test("SKU identity and catalog changes are bounded without fallback", async () => {
  const value = makeEvaluator([line()], {
    catalogRepository: {
      async findPublicProductById() {
        return { status: "found", value: { ...detail, product: { ...product, name: "Renamed Gift" }, variants: [{ ...variant, skuCode: "SKU-NEW" }] } };
      },
    },
  });
  const report = await value.evaluator.evaluate("cart-ready", evaluatedAt);
  assert.equal(report.state, "blocked");
  assert.ok(report.issues.some((issue) => issue.code === "CATALOG_CHANGED"));
  assert.ok(!report.issues.some((issue) => issue.code === "INTERNAL_UNAVAILABLE"));
});

test("current fulfillment validity is checked without claiming historical change", async () => {
  const ready = await makeEvaluator().evaluator.evaluate("cart-ready", evaluatedAt);
  assert.equal(ready.state, "ready");
  assert.ok(!ready.issues.some((issue) => issue.code === "FULFILLMENT_CHANGED"));

  const invalid = makeEvaluator([line()], {
    catalogRepository: {
      async findPublicProductById() {
        return { status: "found", value: { ...detail, fulfillment: { ...fulfillment, productId: "other-product" } } };
      },
    },
  });
  const report = await invalid.evaluator.evaluate("cart-ready", evaluatedAt);
  assert.equal(report.state, "unavailable");
  assert.ok(report.issues.some((issue) => issue.code === "INTERNAL_UNAVAILABLE"));
  assert.ok(!report.issues.some((issue) => issue.code === "FULFILLMENT_CHANGED"));
});

test("Customization stale, invalid, and unavailable states remain distinct", async () => {
  const stale = makeEvaluator([line()], {
    customizationFieldRepository: {
      async getCustomizationFieldsForProduct() {
        return { status: "found", value: { productId, configurationRevision: "revision-b", fields: [] } };
      },
    },
  });
  const staleBefore = structuredClone(stale.cart);
  const staleReport = await stale.evaluator.evaluate("cart-ready", evaluatedAt);
  assert.equal(staleReport.state, "blocked");
  assert.ok(staleReport.issues.some((issue) => issue.code === "CUSTOMIZATION_STALE"));
  assert.deepEqual(stale.cart, staleBefore);

  const invalid = makeEvaluator([line({
    handoff: {
      ...line().handoff,
      customizationValues: [],
    },
  })], {
    customizationFieldRepository: {
      async getCustomizationFieldsForProduct() {
        return { status: "found", value: {
          productId, configurationRevision: "revision-a", fields: [{
            id: "field-name", productId, code: "name", label: "Name", kind: "short_text", required: true,
            isActive: true, position: 0, configurationRevision: "revision-a", constraints: { maxLength: 40 },
          }],
        } };
      },
    },
  });
  const invalidReport = await invalid.evaluator.evaluate("cart-ready", evaluatedAt);
  assert.equal(invalidReport.state, "blocked");
  assert.ok(invalidReport.issues.some((issue) => issue.code === "CUSTOMIZATION_INVALID"));

  const unavailable = makeEvaluator([line()], {
    customizationFieldRepository: {
      async getCustomizationFieldsForProduct() {
        return { status: "source_failure", operation: "customization_field_configuration.read" };
      },
    },
  });
  const unavailableReport = await unavailable.evaluator.evaluate("cart-ready", evaluatedAt);
  assert.equal(unavailableReport.state, "unavailable");
  assert.ok(unavailableReport.issues.some((issue) => issue.code === "INTERNAL_UNAVAILABLE"));
});

test("owner-scoped receipt failures stay safe and bounded", async () => {
  for (const [name, receiptResult] of [
    ["not found", { status: "not_found" }],
    ["inactive", { status: "invalid_state", lifecycle: "removed" }],
  ]) {
    const value = imageEvaluator("2026-08-19T00:00:00.000Z");
    value.evaluator.dependencies.receiptRepository.findOwnedReceipt = async () => receiptResult;
    const report = await value.evaluator.evaluate("cart-ready", evaluatedAt);
    assert.equal(report.state, "blocked", name);
    assert.ok(report.issues.some((issue) => issue.code === "UPLOAD_INVALID"), name);
    assert.doesNotMatch(JSON.stringify(report), /private-receipt|verified-owner|storageKey/);
  }
});

test("unavailable authority wins over ordinary line blockers", async () => {
  const value = makeEvaluator([line({ snapshot: { ...line().snapshot, unitPriceCents: 999 } })], {
    catalogRepository: {
      async findPublicProductById() {
        throw new Error("SQL detail must not escape");
      },
    },
  });
  const report = await value.evaluator.evaluate("cart-ready", evaluatedAt);
  assert.equal(report.state, "unavailable");
  assert.ok(report.issues.some((issue) => issue.code === "INTERNAL_UNAVAILABLE"));
  assert.doesNotMatch(JSON.stringify(report), /SQL detail|provider|secret|receiptId|ownerId/);
});

test("dependency status is authoritative for unavailable precedence", () => {
  const readyLine = { lineId: "line-a", productName: "Gift", skuCode: "SKU", state: "ready", issues: [] };
  const satisfied = aggregateCheckoutReadiness({ evaluatedAt, lines: [readyLine], dependencies: dependencies });
  assert.equal(satisfied.state, "ready");
  assert.deepEqual(satisfied.issues, []);

  const notActivated = aggregateCheckoutReadiness({
    evaluatedAt,
    lines: [readyLine],
    dependencies: [{ name: "payment", status: "not_activated", issue: readinessIssue("PAYMENT_UNAVAILABLE") }],
  });
  assert.equal(notActivated.state, "blocked");
  assert.deepEqual(notActivated.issues.map((issue) => issue.code), ["PAYMENT_UNAVAILABLE"]);

  const unavailable = aggregateCheckoutReadiness({
    evaluatedAt,
    lines: [readyLine],
    dependencies: [{ name: "payment", status: "unavailable", issue: readinessIssue("PAYMENT_UNAVAILABLE") }],
  });
  assert.equal(unavailable.state, "unavailable");
  assert.deepEqual(unavailable.issues.map((issue) => issue.code), ["DEPENDENCY_UNAVAILABLE"]);

  const mixed = aggregateCheckoutReadiness({
    evaluatedAt,
    lines: [{ ...readyLine, state: "blocked", issues: [readinessIssue("PRICE_CHANGED")] }],
    dependencies: [{ name: "payment", status: "unavailable", issue: readinessIssue("PAYMENT_UNAVAILABLE") }],
  });
  assert.equal(mixed.state, "unavailable");
  assert.deepEqual(mixed.issues.map((issue) => issue.code), ["PRICE_CHANGED", "DEPENDENCY_UNAVAILABLE"]);
});

test("not-activated runtime dependencies are blocked and do not calculate totals", async () => {
  const value = makeEvaluator([line()], {
    dependencies: [
      { name: "order_persistence", status: "not_activated", issue: { code: "ORDER_PERSISTENCE_UNAVAILABLE", message: "Order preparation is not available yet." } },
      { name: "shipping", status: "not_activated", issue: { code: "SHIPPING_UNAVAILABLE", message: "Shipping preparation is not available yet." } },
      { name: "tax", status: "not_activated", issue: { code: "TAX_UNAVAILABLE", message: "Tax preparation is not available yet." } },
      { name: "discount", status: "not_activated", issue: { code: "DISCOUNT_UNAVAILABLE", message: "Discount preparation is not available yet." } },
      { name: "payment", status: "not_activated", issue: { code: "PAYMENT_UNAVAILABLE", message: "Payment preparation is not available yet." } },
    ],
  });
  const report = await value.evaluator.evaluate("cart-ready", evaluatedAt);
  assert.equal(report.state, "blocked");
  assert.deepEqual(report.issues.map((issue) => issue.code), [
    "ORDER_PERSISTENCE_UNAVAILABLE",
    "SHIPPING_UNAVAILABLE",
    "TAX_UNAVAILABLE",
    "DISCOUNT_UNAVAILABLE",
    "PAYMENT_UNAVAILABLE",
  ]);
  assert.doesNotMatch(JSON.stringify(report), /subtotal|totalCents|paymentIntent|checkoutSession/);
});

test("private image readiness fails closed without verified owner-scoped receipt authority", async () => {
  const imageLine = line({
    handoff: {
      ...line().handoff,
      customizationValues: [{ fieldId: "field-image", fieldCode: "photo", kind: "image", images: [{ receiptId: "private-receipt" }] }],
    },
  });
  const imageDetail = {
    ...detail,
  };
  const value = makeEvaluator([imageLine], {
    catalogRepository: { async findPublicProductById() { return { status: "found", value: imageDetail }; } },
    customizationFieldRepository: {
      async getCustomizationFieldsForProduct() {
        return { status: "found", value: {
          productId,
          configurationRevision: "revision-a",
          fields: [{
            id: "field-image", productId, code: "photo", label: "Photo", kind: "image", required: true,
            isActive: true, position: 0, configurationRevision: "revision-a",
            constraints: { allowedMimeTypes: ["image/png"], maxBytes: 10_000, minDimensions: { width: 1, height: 1 }, minImageCount: 1, maxImageCount: 1, cropEnabled: false },
          }],
        } };
      },
    },
  });
  const report = await value.evaluator.evaluate("cart-ready", evaluatedAt);
  assert.equal(report.state, "unavailable");
  assert.ok(report.issues.some((issue) => issue.code === "UPLOAD_UNAVAILABLE"));
  assert.doesNotMatch(JSON.stringify(report), /private-receipt|ownerId|storageKey/);
});

test("verified owner-scoped receipt authority can satisfy a synthetic image line", async () => {
  const imageLine = line({
    handoff: {
      ...line().handoff,
      customizationValues: [{ fieldId: "field-image", fieldCode: "photo", kind: "image", images: [{ receiptId: "private-receipt" }] }],
    },
  });
  const value = makeEvaluator([imageLine], {
    verifiedOwnerId: "verified-owner",
    receiptRepository: {
      async findOwnedReceipt() {
        return { status: "found", value: {
          receiptId: "private-receipt", contentType: "image/png", byteSize: 100,
          dimensions: { width: 100, height: 100 }, createdAt: "2026-08-17T00:00:00.000Z",
          expiresAt: "2026-08-19T00:00:00.000Z", lifecycle: "active",
        } };
      },
    },
    customizationFieldRepository: {
      async getCustomizationFieldsForProduct() {
        return { status: "found", value: {
          productId,
          configurationRevision: "revision-a",
          fields: [{
            id: "field-image", productId, code: "photo", label: "Photo", kind: "image", required: true,
            isActive: true, position: 0, configurationRevision: "revision-a",
            constraints: { allowedMimeTypes: ["image/png"], maxBytes: 10_000, minDimensions: { width: 1, height: 1 }, minImageCount: 1, maxImageCount: 1, cropEnabled: false },
          }],
        } };
      },
    },
  });
  const report = await value.evaluator.evaluate("cart-ready", evaluatedAt);
  assert.equal(report.state, "ready");
  assert.doesNotMatch(JSON.stringify(report), /private-receipt|verified-owner/);
});

test("receipt expiry uses one injected evaluation timestamp", async () => {
  const justBefore = await imageEvaluator("2026-08-18T00:00:00.000Z")
    .evaluator.evaluate("cart-ready", "2026-08-17T23:59:59.999Z");
  assert.equal(justBefore.state, "ready");

  const atBoundary = await imageEvaluator("2026-08-18T00:00:00.000Z")
    .evaluator.evaluate("cart-ready", "2026-08-18T00:00:00.000Z");
  assert.equal(atBoundary.state, "blocked");
  assert.ok(atBoundary.issues.some((issue) => issue.code === "UPLOAD_INVALID"));
});

test("HTTP readiness uses the server Cart boundary and does not issue an empty Cart cookie", async () => {
  const previous = {
    nodeEnv: process.env.NODE_ENV,
    cartSource: process.env.CART_SOURCE,
  };
  process.env.NODE_ENV = "test";
  process.env.CART_SOURCE = "local_fake";
  resetShoppingCartProviderForTests();
  try {
    const response = await GET(new Request("http://localhost:3000/api/checkout-readiness?cartId=forged"));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("set-cookie"), null);
    const body = await response.json();
    assert.equal(body.state, "blocked");
    assert.deepEqual(body.issues.map((issue) => issue.code), ["EMPTY_CART"]);
    assert.doesNotMatch(JSON.stringify(body), /forged|cartId|ownerId|receiptId/);
  } finally {
    if (previous.nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous.nodeEnv;
    if (previous.cartSource === undefined) delete process.env.CART_SOURCE;
    else process.env.CART_SOURCE = previous.cartSource;
    resetShoppingCartProviderForTests();
  }
});

test("no Cart cookie stays EMPTY_CART even when the Cart provider is disabled", async () => {
  const previous = {
    nodeEnv: process.env.NODE_ENV,
    cartSource: process.env.CART_SOURCE,
    productSource: process.env.PHOTOGIFT_PRODUCT_SOURCE,
  };
  process.env.NODE_ENV = "test";
  process.env.CART_SOURCE = "disabled";
  process.env.PHOTOGIFT_PRODUCT_SOURCE = "invalid-source";
  resetShoppingCartProviderForTests();
  try {
    const response = await GET(new Request("http://localhost:3000/api/checkout-readiness"));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("set-cookie"), null);
    const body = await response.json();
    assert.equal(body.state, "blocked");
    assert.deepEqual(body.issues.map((issue) => issue.code), ["EMPTY_CART"]);

    const claimed = await GET(new Request("http://localhost:3000/api/checkout-readiness", {
      headers: { cookie: `${LOCAL_CART_COOKIE_NAME}=claimed-cart-id-12345678901234567890` },
    }));
    assert.equal(claimed.status, 503);
    assert.equal(claimed.headers.get("set-cookie"), null);
    const claimedBody = await claimed.json();
    assert.equal(claimedBody.state, "unavailable");
    assert.deepEqual(claimedBody.issues.map((issue) => issue.code), ["CART_UNAVAILABLE"]);
  } finally {
    if (previous.nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous.nodeEnv;
    if (previous.cartSource === undefined) delete process.env.CART_SOURCE;
    else process.env.CART_SOURCE = previous.cartSource;
    if (previous.productSource === undefined) delete process.env.PHOTOGIFT_PRODUCT_SOURCE;
    else process.env.PHOTOGIFT_PRODUCT_SOURCE = previous.productSource;
    resetShoppingCartProviderForTests();
  }
});

test("HTTP empty-Cart precedence short-circuits unavailable Catalog/Customization authorities", async () => {
  const previous = {
    nodeEnv: process.env.NODE_ENV,
    cartSource: process.env.CART_SOURCE,
    productSource: process.env.PHOTOGIFT_PRODUCT_SOURCE,
  };
  process.env.NODE_ENV = "test";
  process.env.CART_SOURCE = "local_fake";
  // This source is deliberately invalid. Empty reads must not initialize it.
  process.env.PHOTOGIFT_PRODUCT_SOURCE = "invalid-source";
  resetShoppingCartProviderForTests();
  try {
    const read = async (cartId) => GET(new Request("http://localhost:3000/api/checkout-readiness", {
      headers: cartId ? { cookie: `${LOCAL_CART_COOKIE_NAME}=${encodeURIComponent(cartId)}` } : {},
    }));
    const assertEmpty = async (response, label) => {
      assert.equal(response.status, 200, label);
      assert.equal(response.headers.get("set-cookie"), null, label);
      const body = await response.json();
      assert.equal(body.state, "blocked", label);
      assert.deepEqual(body.issues.map((issue) => issue.code), ["EMPTY_CART"], label);
    };

    await assertEmpty(await read(null), "no Cart cookie");
    await assertEmpty(await read("stale-cart-id-12345678901234567890"), "unknown Cart cookie");

    const provider = getShoppingCartProvider();
    assert.ok(provider);
    const emptyCart = await provider.createCart();
    assert.equal(emptyCart.status, "found");
    await assertEmpty(await read(emptyCart.value.cartId), "existing empty Cart");

    const nonEmptyCart = await provider.createCart();
    assert.equal(nonEmptyCart.status, "found");
    const added = await provider.addLine(nonEmptyCart.value.cartId, {
      handoff: line().handoff,
      snapshot: line().snapshot,
      customization: line().customization,
    });
    assert.equal(added.status, "found");
    const unavailable = await read(nonEmptyCart.value.cartId);
    assert.equal(unavailable.status, 503);
    assert.equal(unavailable.headers.get("set-cookie"), null);
    const unavailableBody = await unavailable.json();
    assert.equal(unavailableBody.state, "unavailable");
    assert.deepEqual(unavailableBody.issues.map((issue) => issue.code), ["INTERNAL_UNAVAILABLE"]);
  } finally {
    if (previous.nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous.nodeEnv;
    if (previous.cartSource === undefined) delete process.env.CART_SOURCE;
    else process.env.CART_SOURCE = previous.cartSource;
    if (previous.productSource === undefined) delete process.env.PHOTOGIFT_PRODUCT_SOURCE;
    else process.env.PHOTOGIFT_PRODUCT_SOURCE = previous.productSource;
    resetShoppingCartProviderForTests();
  }
});

test("readiness HTTP source surface is GET-only and introduces no payment or working Checkout action", async () => {
  const routeSource = await readFile(new URL("../app/api/checkout-readiness/route.ts", import.meta.url), "utf8");
  const cartSource = await readFile(new URL("../app/storefront/CartExperience.tsx", import.meta.url), "utf8");
  assert.match(routeSource, /export async function GET/);
  assert.doesNotMatch(routeSource, /export async function (POST|PATCH|DELETE)/);
  assert.doesNotMatch(routeSource, /Stripe|PayPal|PaymentIntent|Checkout Session|createOrder|createCart\(/);
  assert.doesNotMatch(cartSource, /Buy now|Pay now|PaymentIntent|Stripe|PayPal/);
  assert.match(cartSource, /checkout are not active/i);
  assert.match(cartSource, /fetch\("\/api\/checkout-readiness"/);
  assert.match(cartSource, /read-only server observation/i);
});
