import assert from "node:assert/strict";
import test from "node:test";

import { LocalMemoryShoppingCartProvider } from "../app/infrastructure/cart/local-memory-shopping-cart-provider.ts";
import { LocalMemoryLocalOrderRepository } from "../app/infrastructure/local-order/local-memory-local-order-repository.server.ts";
import { LocalMemoryLocalPaymentRepository } from "../app/infrastructure/local-payment/local-memory-local-payment-repository.server.ts";
import { LocalMemoryLocalFulfillmentRepository } from "../app/infrastructure/local-fulfillment/local-memory-local-fulfillment-repository.server.ts";
import { LocalMemoryLocalTrackingRepository } from "../app/infrastructure/local-tracking/local-memory-local-tracking-repository.server.ts";
import {
  createLocalMemoryCommerceProviderPorts,
  LocalMemoryShoppingCartAsyncPort,
  LocalMemoryOrderAsyncPort,
  LocalMemoryPaymentAsyncPort,
  LocalMemoryFulfillmentAsyncPort,
  LocalMemoryTrackingAsyncPort,
} from "../app/application/local-memory-commerce-provider-adapters.server.ts";

const authority = (ownerId = "customer-port-owner", actorKind = "customer", actorId = ownerId) => ({
  kind: "verified_server_authority",
  projectId: "figmemento-local-commerce-test",
  ownerId,
  actorKind,
  actorId,
});

const item = () => ({
  handoff: {
    productId: "product-port-test",
    variantId: "variant-port-test",
    skuCode: "SKU-PORT-TEST",
    selectedOptions: [{ optionId: "size", valueId: "standard" }],
    configurationRevision: "revision-port-test",
    customizationValues: [],
  },
  snapshot: {
    productId: "product-port-test",
    productName: "Port Test Gift",
    productSlug: "port-test-gift",
    variantId: "variant-port-test",
    skuCode: "SKU-PORT-TEST",
    selectedOptions: [{ optionId: "size", valueId: "standard" }],
    unitPriceCents: 2_500,
    currency: "USD",
    availability: "available",
  },
  customization: {
    configuration: { sku: "SKU-PORT-TEST", options: [], needsReview: false },
    personalization: { status: "empty_configuration", rows: [] },
  },
});

const draft = (ownerId = "customer-port-owner") => ({
  customerId: ownerId,
  contact: {
    email: "port-owner@example.test",
    firstName: "Port",
    lastName: "Owner",
    country: "US",
    city: "Los Angeles",
    addressLine1: "1 Port Street",
    postalCode: "90001",
  },
  commercial: {
    currency: "USD",
    subtotalCents: 2_500,
    shipping: { status: "eligible", country: "US", method: "local_standard", amountCents: 0, currency: "USD", estimatedRange: "5-10 business days", developmentOnly: true },
    coupon: { status: "not_selected", discountCents: 0, developmentOnly: true },
    tax: { status: "not_activated", amountCents: null },
    localArithmeticTotalCents: 2_500,
    developmentOnly: true,
  },
  lines: [{
    productId: "product-port-test",
    productName: "Port Test Gift",
    productSlug: "port-test-gift",
    variantId: "variant-port-test",
    skuCode: "SKU-PORT-TEST",
    selectedOptions: [{ optionId: "size", valueId: "standard" }],
    quantity: 1,
    unitBasePriceCents: 2_500,
    currency: "USD",
    fulfillmentType: "physical",
    lineSubtotalCents: 2_500,
  }],
});

const ids = () => {
  let n = 0;
  return {
    nextInternalId: () => `port-order-${++n}`,
    nextPublicReference: () => `FM-LOCAL-PORTTEST${String(n).padStart(8, "0")}`,
    nextBrowserCapability: () => `port-capability-${++n}`,
    nextOrderItemId: () => `port-order-item-${++n}`,
  };
};

function orderFixture() {
  const orders = new LocalMemoryLocalOrderRepository({ ids: ids(), now: () => "2026-09-10T01:00:00.000Z" });
  const payments = new LocalMemoryLocalPaymentRepository(orders, { now: () => "2026-09-10T01:01:00.000Z" });
  const fulfillments = new LocalMemoryLocalFulfillmentRepository(orders, { now: () => "2026-09-10T01:02:00.000Z" });
  const tracking = new LocalMemoryLocalTrackingRepository({ orders, fulfillments }, { now: () => "2026-09-10T01:03:00.000Z", ids: { nextInternalShipmentId: () => "port-shipment-1", nextPublicShipmentReference: () => "FM-LOCAL-SHP-PORTTEST0001", nextTrackingNumber: () => "FM-LOCAL-TRK-PORTTEST0001" } });
  return { orders, payments, fulfillments, tracking };
}

test("Memory adapters implement the five async provider-neutral ports", async () => {
  const fx = orderFixture();
  const ports = createLocalMemoryCommerceProviderPorts({ cart: new LocalMemoryShoppingCartProvider({ nextId: (() => { let n = 0; return () => `port-cart-id-${++n}`; })() }), ...fx });
  const auth = authority();
  for (const port of Object.values(ports)) {
    assert.equal(typeof port.readExact === "function" || typeof port.read === "function" || typeof port.attempt === "function" || typeof port.command === "function", true);
  }
  const created = ports.cart.create({ authority: auth, idempotency: { key: "cart-create-port-0001", fingerprint: "cart-create" } });
  assert.equal(created instanceof Promise, true);
  const cart = await created;
  assert.equal(cart.status, "found");
  assert.equal(cart.value.version, 0);
});

test("Cart adapter enforces owner scope, async CAS, and idempotency context", async () => {
  const provider = new LocalMemoryShoppingCartProvider({ nextId: (() => { let n = 0; return () => `cart-port-id-${++n}`; })() });
  const port = new LocalMemoryShoppingCartAsyncPort(provider);
  const owner = authority();
  const other = authority("different-port-owner");
  const created = await port.create({ authority: owner, idempotency: { key: "cart-create-port-0002", fingerprint: "create" } });
  assert.equal(created.status, "found");
  const line = await port.addLine({ authority: owner, cartId: created.value.cartId, expectedVersion: 0, idempotency: { key: "cart-add-port-0001", fingerprint: "add-v1" }, item: item() });
  assert.equal(line.status, "found");
  assert.equal(line.value.version, 1);
  assert.equal((await port.read({ authority: other, cartId: created.value.cartId })).status, "unavailable");
  assert.deepEqual(await port.addLine({ authority: owner, cartId: created.value.cartId, expectedVersion: 0, idempotency: { key: "cart-add-port-0002", fingerprint: "add-v2" }, item: item() }), { status: "conflict", reason: "version_mismatch" });
  const replay = await port.addLine({ authority: owner, cartId: created.value.cartId, expectedVersion: 0, idempotency: { key: "cart-add-port-0001", fingerprint: "add-v1" }, item: item() });
  assert.equal(replay.status, "found");
  assert.equal(replay.value.version, 1);
  assert.deepEqual(await port.addLine({ authority: owner, cartId: created.value.cartId, expectedVersion: 1, idempotency: { key: "cart-add-port-0001", fingerprint: "changed" }, item: item() }), { status: "conflict", reason: "idempotency_mismatch" });
});

test("Order adapter keeps exact identity and immutable snapshot reads behind an async port", async () => {
  const fx = orderFixture();
  const port = new LocalMemoryOrderAsyncPort(fx.orders);
  const auth = authority();
  const created = await port.create({ authority: auth, cartId: "port-cart-order-1", idempotency: { key: "123e4567-e89b-42d3-a456-426614174099", fingerprint: "order-v1" }, snapshot: draft() });
  assert.equal(created.status, "found");
  assert.equal(created.value.snapshot.lines[0].fulfillmentType, "physical");
  assert.equal((await port.readSnapshot({ authority: auth, internalOrderId: created.value.internalOrderId, publicReference: created.value.publicReference })).status, "found");
  assert.equal((await port.readExact({ authority: auth, internalOrderId: created.value.internalOrderId, publicReference: "FM-LOCAL-PORTTEST9999" })).status, "unavailable");
  const wrongOwner = await port.readExact({ authority: authority("different-port-owner"), internalOrderId: created.value.internalOrderId, publicReference: created.value.publicReference });
  assert.equal(wrongOwner.status, "unavailable");
});

test("Payment adapter exposes atomic attempt as async found/conflict/unavailable", async () => {
  const fx = orderFixture();
  const orderPort = new LocalMemoryOrderAsyncPort(fx.orders);
  const paymentPort = new LocalMemoryPaymentAsyncPort(fx.payments, fx.orders);
  const auth = authority();
  const order = await orderPort.create({ authority: auth, cartId: "port-cart-payment-1", idempotency: { key: "123e4567-e89b-42d3-a456-426614174100", fingerprint: "order-payment" }, snapshot: draft() });
  assert.equal(order.status, "found");
  const input = { authority: auth, expectedVersion: 1, idempotency: { key: "payment-port-action-0001", fingerprint: "payment-success" }, internalOrderId: order.value.internalOrderId, publicReference: order.value.publicReference, outcome: "success" };
  const committed = await paymentPort.attempt(input);
  assert.equal(committed.status, "found");
  const replay = await paymentPort.attempt(input);
  assert.equal(replay.status, "found");
  assert.deepEqual(await paymentPort.attempt({ ...input, expectedVersion: 1, idempotency: { key: "payment-port-action-0002", fingerprint: "payment-other" } }), { status: "conflict", reason: "version_mismatch" });
});

test("Fulfillment and Tracking adapters enforce actor/version/idempotency command boundaries", async () => {
  const fx = orderFixture();
  const orderPort = new LocalMemoryOrderAsyncPort(fx.orders);
  const paymentPort = new LocalMemoryPaymentAsyncPort(fx.payments, fx.orders);
  const fulfillmentPort = new LocalMemoryFulfillmentAsyncPort(fx.fulfillments, fx.orders);
  const trackingPort = new LocalMemoryTrackingAsyncPort(fx.tracking, fx.orders);
  const customer = authority();
  const operator = authority("operator-owner", "operator", "operator-port-actor");
  const order = await orderPort.create({ authority: customer, cartId: "port-cart-fulfillment-1", idempotency: { key: "123e4567-e89b-42d3-a456-426614174101", fingerprint: "order-fulfillment" }, snapshot: draft() });
  assert.equal(order.status, "found");
  assert.equal((await paymentPort.attempt({ authority: customer, expectedVersion: 1, idempotency: { key: "payment-port-action-0003", fingerprint: "success" }, internalOrderId: order.value.internalOrderId, publicReference: order.value.publicReference, outcome: "success" })).status, "found");
  const enter = { publicOrderReference: order.value.publicReference, fulfillmentActionId: "fulfillment-port-action-0001", actionKind: "enter_photo_review" };
  const entered = await fulfillmentPort.command({ authority: operator, expectedVersion: 0, idempotency: { key: "fulfillment-port-action-0001", fingerprint: "enter" }, internalOrderId: order.value.internalOrderId, publicReference: order.value.publicReference, action: enter });
  assert.equal(entered.status, "found");
  assert.equal((await fulfillmentPort.command({ authority: operator, expectedVersion: 0, idempotency: { key: "fulfillment-port-action-0001", fingerprint: "enter" }, internalOrderId: order.value.internalOrderId, publicReference: order.value.publicReference, action: enter })).status, "found");
  assert.equal((await fulfillmentPort.readExact({ authority: authority("different-port-owner"), internalOrderId: order.value.internalOrderId, publicReference: order.value.publicReference })).status, "unavailable");
  assert.deepEqual(await fulfillmentPort.command({ authority: operator, expectedVersion: 0, idempotency: { key: "fulfillment-port-action-0002", fingerprint: "stale" }, internalOrderId: order.value.internalOrderId, publicReference: order.value.publicReference, action: { ...enter, fulfillmentActionId: "fulfillment-port-action-0002" } }), { status: "conflict", reason: "version_mismatch" });
  const published = await fulfillmentPort.command({ authority: operator, expectedVersion: 1, idempotency: { key: "fulfillment-port-action-0003", fingerprint: "publish" }, internalOrderId: order.value.internalOrderId, publicReference: order.value.publicReference, action: { ...enter, fulfillmentActionId: "fulfillment-port-action-0003", actionKind: "publish_preview" }, publishedAt: "2026-09-10T01:04:00.000Z" });
  assert.equal(published.status, "found");
  const approved = await fulfillmentPort.command({ authority: customer, expectedVersion: 2, idempotency: { key: "fulfillment-port-action-0004", fingerprint: "approve" }, internalOrderId: order.value.internalOrderId, publicReference: order.value.publicReference, action: { ...enter, fulfillmentActionId: "fulfillment-port-action-0004", actionKind: "approve_preview", expectedPreviewVersion: 1 } });
  assert.equal(approved.status, "found");
  const production = await fulfillmentPort.command({ authority: operator, expectedVersion: 3, idempotency: { key: "fulfillment-port-action-0005", fingerprint: "production" }, internalOrderId: order.value.internalOrderId, publicReference: order.value.publicReference, action: { ...enter, fulfillmentActionId: "fulfillment-port-action-0005", actionKind: "start_production" } });
  assert.equal(production.status, "found");
  const quality = await fulfillmentPort.command({ authority: operator, expectedVersion: 4, idempotency: { key: "fulfillment-port-action-0006", fingerprint: "quality" }, internalOrderId: order.value.internalOrderId, publicReference: order.value.publicReference, action: { ...enter, fulfillmentActionId: "fulfillment-port-action-0006", actionKind: "mark_quality_check" } });
  assert.equal(quality.status, "found");
  const trackingInput = { authority: operator, expectedVersion: 0, idempotency: { key: "tracking-port-action-0001", fingerprint: "create" }, internalOrderId: order.value.internalOrderId, publicReference: order.value.publicReference, action: { trackingActionId: "tracking-port-action-0001", actionKind: "create_shipment" } };
  assert.equal((await trackingPort.command(trackingInput)).status, "found");
  assert.equal((await trackingPort.command(trackingInput)).status, "found");
  assert.deepEqual(await trackingPort.command({ ...trackingInput, idempotency: { key: "tracking-port-action-0002", fingerprint: "stale" }, action: { trackingActionId: "tracking-port-action-0002", actionKind: "mark_shipped" } }), { status: "conflict", reason: "version_mismatch" });
});

test("Invalid authority and missing expected version fail closed without throwing", async () => {
  const provider = new LocalMemoryShoppingCartProvider();
  const port = new LocalMemoryShoppingCartAsyncPort(provider);
  const result = await port.create({ authority: { kind: "browser_payload" }, idempotency: { key: "invalid", fingerprint: "invalid" } });
  assert.equal(result.status, "unavailable");
  const missingVersion = await port.addLine({ authority: authority(), cartId: "unknown", idempotency: { key: "missing-version", fingerprint: "x" }, item: item() });
  assert.equal(missingVersion.status, "unavailable");
});
