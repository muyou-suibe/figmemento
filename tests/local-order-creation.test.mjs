import assert from "node:assert/strict";
import test from "node:test";

import { LocalOrderCreationService } from "../app/application/local-order-creation.ts";
import { LocalMemoryLocalOrderRepository } from "../app/infrastructure/local-order/local-memory-local-order-repository.server.ts";
import {
  resolveLocalCouponFixture,
  resolveLocalShippingFixture,
} from "../app/infrastructure/local-checkout/local-checkout-fixtures.ts";
import { projectLocalOrderSnapshot } from "../app/domain/local-order.ts";

const productId = "product-ready";
const variantId = "variant-ready";
const categoryId = "category-ready";
const skuCode = "SKU-READY";
const attemptA = "123e4567-e89b-42d3-a456-426614174010";
const attemptB = "123e4567-e89b-42d3-a456-426614174011";
const attemptC = "123e4567-e89b-42d3-a456-426614174012";
const attemptD = "123e4567-e89b-42d3-a456-426614174013";
const attemptE = "123e4567-e89b-42d3-a456-426614174014";
const attemptF = "123e4567-e89b-42d3-a456-426614174015";

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

const detail = {
  category,
  product,
  listingPrice: { kind: "single", priceCents: variant.priceCents, currency: "USD" },
  options: [],
  optionValues: [],
  variants: [variant],
  assets: [],
  fulfillment: {
    id: "fulfillment-ready",
    productId,
    fulfillmentType: "physical",
    requiresShipping: true,
    productionMode: "custom_manufacturing",
    leadTime: { minBusinessDays: 5, maxBusinessDays: 10 },
  },
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

function makeLine(lineId = "line-a", customizationValues = []) {
  return {
    lineId,
    handoff: {
      productId,
      variantId,
      skuCode,
      selectedOptions: [],
      configurationRevision: "revision-a",
      customizationValues,
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
      personalization: { status: "current", rows: [] },
    },
    quantity: 1,
  };
}

function makeService({ lines = [makeLine()], catalog = detail, customization = { productId, configurationRevision: "revision-a", fields: [] }, repository = new LocalMemoryLocalOrderRepository(), dependencyOverrides = {} } = {}) {
  const cart = { cartId: "cart-ready", lines };
  const dependencies = {
    repository,
    cartReader: {
      async getCart() {
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
    now: () => "2026-08-24T12:00:00.000Z",
    ...dependencyOverrides,
  };
  return { service: new LocalOrderCreationService(dependencies), cart, repository };
}

test("fresh Local Order creation snapshots current authority, preserves Cart, and retries atomically", async () => {
  const configuredValue = { fieldId: "field-note", fieldCode: "note", kind: "short_text", value: "Ada" };
  const value = makeService({
    lines: [makeLine("line-a", [configuredValue]), makeLine("line-b", [{ ...configuredValue, value: "Grace" }])],
    customization: { productId, configurationRevision: "revision-a", fields: [textField] },
  });
  const before = structuredClone(value.cart);
  const first = await value.service.create("cart-ready", { ...request, creationAttemptId: attemptA });
  assert.equal(first.status, "created");
  assert.equal(first.snapshot.status, "pending_payment");
  assert.equal(first.snapshot.paymentStatus, "pending");
  assert.equal(first.snapshot.commercial.tax.status, "not_activated");
  assert.equal(first.snapshot.commercial.tax.amountCents, null);
  assert.equal(first.snapshot.lines.length, 2);
  assert.equal(first.snapshot.lines.every((line) => typeof line.orderItemId === "string"), true);
  assert.equal(first.snapshot.lines.every((line) => line.fulfillmentType === "physical"), true);
  assert.equal(new Set(first.snapshot.lines.map((line) => line.orderItemId)).size, 2);
  assert.deepEqual(first.snapshot.lines.map((line) => line.customization?.values[0]?.value), ["Ada", "Grace"]);
  assert.deepEqual(value.cart, before);

  const retry = await value.service.create("cart-ready", { ...request, creationAttemptId: attemptA }, first.browserCapability);
  assert.equal(retry.status, "existing");
  assert.equal(retry.snapshot.publicReference, first.snapshot.publicReference);
  assert.deepEqual(
    retry.snapshot.lines.map((line) => line.orderItemId),
    first.snapshot.lines.map((line) => line.orderItemId),
  );
  assert.equal(value.repository.getOrderCountForTests(), 1);
});

test("shipping-required text-only integration creates a pending Local Order without upload authority", async () => {
  const configuredValue = { fieldId: "field-note", fieldCode: "note", kind: "short_text", value: "A handwritten memory" };
  const value = makeService({
    lines: [makeLine("line-text-only", [configuredValue])],
    customization: { productId, configurationRevision: "revision-a", fields: [textField] },
  });

  const created = await value.service.create("cart-ready", { ...request, creationAttemptId: attemptB });
  assert.equal(created.status, "created");
  assert.equal(created.snapshot.status, "pending_payment");
  assert.equal(created.snapshot.paymentStatus, "pending");
  assert.equal(created.snapshot.commercial.shipping.method, "local_standard");
  assert.equal(created.snapshot.lines[0].customization?.values[0]?.kind, "short_text");
  assert.equal(created.snapshot.lines[0].customization?.values[0]?.value, "A handwritten memory");
  assert.equal("receiptId" in (created.snapshot.lines[0].customization?.values[0] ?? {}), false);
  assert.equal("ownerId" in created.snapshot, false);
  assert.deepEqual(value.cart.lines[0].handoff.customizationValues, [configuredValue]);

  const projection = projectLocalOrderSnapshot(created.snapshot);
  assert.equal(projection.lines[0].customization?.[0]?.kind, "short_text");
  assert.equal(projection.lines[0].customization?.[0]?.value, "A handwritten memory");
  assert.equal("orderItemId" in projection.lines[0], false);
  assert.equal("fulfillmentType" in projection.lines[0], false);
  assert.doesNotMatch(JSON.stringify(projection), /receiptId|ownerId|storageKey|bucket|capability/i);
});

test("server-resolved fulfillment classification is snapshotted for digital Orders", async () => {
  const value = makeService({
    catalog: {
      ...detail,
      fulfillment: {
        ...detail.fulfillment,
        fulfillmentType: "digital",
        requiresShipping: false,
        productionMode: "digital_creation",
      },
    },
  });
  const result = await value.service.create("cart-ready", { ...request, creationAttemptId: attemptF });
  assert.equal(result.status, "created");
  assert.equal(result.snapshot.lines[0].fulfillmentType, "digital");
  const publicProjection = projectLocalOrderSnapshot(result.snapshot);
  assert.equal("fulfillmentType" in publicProjection.lines[0], false);
  assert.equal("orderItemId" in publicProjection.lines[0], false);
});

test("missing or invalid server fulfillment evidence rejects a new Order", async () => {
  for (const fulfillment of [undefined, { ...detail.fulfillment, fulfillmentType: "unknown" }]) {
    const repository = new LocalMemoryLocalOrderRepository();
    const value = makeService({ repository, catalog: { ...detail, fulfillment } });
    const result = await value.service.create("cart-ready", { ...request, creationAttemptId: attemptF });
    assert.notEqual(result.status, "created");
    assert.equal(repository.getOrderCountForTests(), 0);
  }
});

test("browser-carried fulfillment classification cannot override the Catalog authority", async () => {
  const baseLine = makeLine();
  const value = makeService({
    lines: [{
      ...baseLine,
      handoff: { ...baseLine.handoff, fulfillmentType: "digital" },
    }],
  });
  const result = await value.service.create("cart-ready", { ...request, creationAttemptId: attemptF });
  assert.notEqual(result.status, "created");
  assert.equal(value.repository.getOrderCountForTests(), 0);
});

test("created Local Order snapshot remains stable after source Cart, Catalog, and customization changes", async () => {
  const configuredValue = { fieldId: "field-note", fieldCode: "note", kind: "short_text", value: "Original note" };
  const value = makeService({
    lines: [makeLine("line-immutable", [configuredValue])],
    customization: { productId, configurationRevision: "revision-a", fields: [textField] },
  });
  const created = await value.service.create("cart-ready", { ...request, creationAttemptId: attemptC });
  assert.equal(created.status, "created");

  value.cart.lines[0].quantity = 9;
  value.cart.lines[0].handoff.customizationValues[0].value = "Changed note";
  detail.product.name = "Changed product name";
  detail.variants[0].priceCents = 9_999;

  const reread = await value.repository.findAuthorizedSnapshot(created.snapshot.publicReference, created.browserCapability);
  assert.equal(reread.status, "found");
  assert.equal(reread.snapshot.lines[0].productName, "Ready Gift");
  assert.equal(reread.snapshot.lines[0].quantity, 1);
  assert.equal(reread.snapshot.lines[0].unitBasePriceCents, 2_500);
  assert.equal(reread.snapshot.lines[0].customization?.values[0]?.value, "Original note");
});

test("protected image receipt facts are snapshotted but omitted from safe projection", async () => {
  const receipt = {
    receiptId: "private-receipt",
    contentType: "image/png",
    byteSize: 100,
    dimensions: { width: 100, height: 100 },
    createdAt: "2026-08-18T00:00:00.000Z",
    expiresAt: "2026-08-30T00:00:00.000Z",
    lifecycle: "active",
  };
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
      cropEnabled: true,
    },
  };
  const imageValue = {
    fieldId: "field-image",
    fieldCode: "photo",
    kind: "image",
    images: [{ receiptId: receipt.receiptId, crop: { x: 0, y: 0, width: 1, height: 1 } }],
  };
  const value = makeService({
    lines: [makeLine("line-image", [imageValue])],
    customization: { productId, configurationRevision: "revision-a", fields: [imageField] },
    dependencyOverrides: {
      receiptRepository: { async findOwnedReceipt() { return { status: "found", value: receipt }; } },
      verifiedOwnerId: "verified-owner",
    },
  });

  const created = await value.service.create("cart-ready", { ...request, creationAttemptId: attemptB });
  assert.equal(created.status, "created");
  assert.equal(created.snapshot.lines[0].customization?.values[0]?.images[0]?.receiptId, "private-receipt");
  const publicValue = projectLocalOrderSnapshot(created.snapshot);
  assert.equal("receiptId" in (publicValue.lines[0].customization?.[0] ?? {}), false);
  assert.doesNotMatch(JSON.stringify(publicValue), /private-receipt|verified-owner|storageKey|bucket|capability/i);
});

test("invalid, expired, and not-applicable coupon statuses remain non-blocking and tax stays inactive", async () => {
  for (const [couponCode, attemptId, expectedStatus] of [
    ["UNKNOWN", attemptC, "invalid"],
    ["EXPIRED10", attemptD, "expired"],
    ["NOT_APPLICABLE", attemptE, "not_applicable"],
  ]) {
    const value = makeService();
    const result = await value.service.create("cart-ready", { ...request, couponCode, creationAttemptId: attemptId });
    assert.equal(result.status, "created", couponCode);
    assert.equal(result.snapshot.commercial.coupon.status, expectedStatus);
    assert.equal(result.snapshot.commercial.coupon.discountCents, 0);
    assert.equal(result.snapshot.commercial.tax.status, "not_activated");
    assert.equal(result.snapshot.commercial.tax.amountCents, null);
  }
});

test("stale current Catalog authority fails before repository creation", async () => {
  const repository = new LocalMemoryLocalOrderRepository();
  const value = makeService({ repository, catalog: { ...detail, variants: [{ ...variant, priceCents: 2_600 }] } });
  const result = await value.service.create("cart-ready", { ...request, creationAttemptId: attemptA });
  assert.equal(result.status, "blocked");
  assert.equal(result.issues[0].code, "STALE_CATALOG");
  assert.equal(repository.getOrderCountForTests(), 0);
});

test("empty and ineligible current Carts are rejected before Local Order commit", async () => {
  const emptyRepository = new LocalMemoryLocalOrderRepository();
  const empty = makeService({ repository: emptyRepository, lines: [] });
  const emptyResult = await empty.service.create("cart-ready", { ...request, creationAttemptId: attemptD });
  assert.equal(emptyResult.status, "blocked");
  assert.equal(emptyResult.issues[0].code, "EMPTY_CART");
  assert.equal(emptyRepository.getOrderCountForTests(), 0);

  const unavailableRepository = new LocalMemoryLocalOrderRepository();
  const unavailable = makeService({
    repository: unavailableRepository,
    catalog: { ...detail, variants: [{ ...variant, isAvailable: false }] },
  });
  const unavailableResult = await unavailable.service.create("cart-ready", { ...request, creationAttemptId: attemptE });
  assert.equal(unavailableResult.status, "blocked");
  assert.equal(unavailableResult.issues[0].code, "VARIANT_UNAVAILABLE");
  assert.equal(unavailableRepository.getOrderCountForTests(), 0);
});

test("image receipt authority, unsupported shipping, and mixed currency fail closed before commit", async () => {
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
  const imageLine = makeLine("line-image", [{
    fieldId: "field-image",
    fieldCode: "photo",
    kind: "image",
    images: [{ receiptId: "private-receipt" }],
  }]);
  const missingAuthorityRepository = new LocalMemoryLocalOrderRepository();
  const missingAuthority = makeService({
    repository: missingAuthorityRepository,
    lines: [imageLine],
    customization: { productId, configurationRevision: "revision-a", fields: [imageField] },
  });
  const missingResult = await missingAuthority.service.create("cart-ready", { ...request, creationAttemptId: attemptA });
  assert.equal(missingResult.status, "unavailable");
  assert.equal(missingResult.issues[0].code, "UPLOAD_UNAVAILABLE");
  assert.equal(missingAuthorityRepository.getOrderCountForTests(), 0);

  const rejectedRepository = new LocalMemoryLocalOrderRepository();
  const rejected = makeService({
    repository: rejectedRepository,
    lines: [imageLine],
    customization: { productId, configurationRevision: "revision-a", fields: [imageField] },
    dependencyOverrides: {
      verifiedOwnerId: "verified-owner",
      receiptRepository: { async findOwnedReceipt() { return { status: "not_found" }; } },
    },
  });
  const rejectedResult = await rejected.service.create("cart-ready", { ...request, creationAttemptId: attemptB });
  assert.equal(rejectedResult.status, "blocked");
  assert.equal(rejectedResult.issues[0].code, "UPLOAD_INVALID");
  assert.equal(rejectedRepository.getOrderCountForTests(), 0);

  const shippingRepository = new LocalMemoryLocalOrderRepository();
  const unsupportedShipping = makeService({
    repository: shippingRepository,
    dependencyOverrides: { shippingResolver: () => ({ status: "unsupported", issueCode: "SHIPPING_UNAVAILABLE", developmentOnly: true }) },
  });
  const shippingResult = await unsupportedShipping.service.create("cart-ready", { ...request, creationAttemptId: attemptB });
  assert.equal(shippingResult.status, "blocked");
  assert.equal(shippingResult.issues[0].code, "SHIPPING_UNAVAILABLE");
  assert.equal(shippingRepository.getOrderCountForTests(), 0);

  const mixedCurrencyRepository = new LocalMemoryLocalOrderRepository();
  const mixedCurrency = makeService({
    repository: mixedCurrencyRepository,
    dependencyOverrides: {
      shippingResolver: () => ({
        status: "eligible",
        country: "US",
        method: "local_standard",
        amountCents: 500,
        currency: "EUR",
        estimatedRange: "test",
        developmentOnly: true,
      }),
    },
  });
  const mixedCurrencyResult = await mixedCurrency.service.create("cart-ready", { ...request, creationAttemptId: attemptC });
  assert.equal(mixedCurrencyResult.status, "blocked");
  assert.equal(mixedCurrencyResult.issues[0].code, "MIXED_CURRENCY");
  assert.equal(mixedCurrencyRepository.getOrderCountForTests(), 0);
});
