import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { createLocalFulfillmentState } from "../app/domain/local-fulfillment.ts";
import { LocalTrackingCustomerService } from "../app/application/local-tracking-customer-service.ts";
import { LocalMemoryLocalOrderRepository } from "../app/infrastructure/local-order/local-memory-local-order-repository.server.ts";
import { LocalMemoryLocalPaymentRepository } from "../app/infrastructure/local-payment/local-memory-local-payment-repository.server.ts";
import { LocalMemoryLocalTrackingRepository } from "../app/infrastructure/local-tracking/local-memory-local-tracking-repository.server.ts";
import { createLocalTrackingCustomerHttpHandler } from "../app/server/local-tracking-customer-http.server.ts";
import { parseLocalTrackingActionInput } from "../app/domain/local-tracking.ts";

let sequence = 100;
const draft = {
  contact: { email: "tracking-customer@example.test", firstName: "Tracking", lastName: "Customer", country: "US", city: "Austin", addressLine1: "1 Main Street", postalCode: "78701" },
  commercial: { currency: "USD", subtotalCents: 1000, shipping: { status: "eligible", country: "US", method: "local_standard", amountCents: 0, currency: "USD", estimatedRange: "local", developmentOnly: true }, coupon: { status: "not_selected", discountCents: 0, developmentOnly: true }, tax: { status: "not_activated", amountCents: null }, localArithmeticTotalCents: 1000, developmentOnly: true },
  lines: [{ productId: "tracking-customer-product", productName: "Tracking Customer Gift", productSlug: "tracking-customer-gift", variantId: "tracking-customer-variant", skuCode: "TRACKING-CUSTOMER", selectedOptions: [], quantity: 1, unitBasePriceCents: 1000, currency: "USD", lineSubtotalCents: 1000 }],
};

async function fixture({ shipment = true } = {}) {
  const n = sequence++;
  const orders = new LocalMemoryLocalOrderRepository({ now: () => "2026-08-27T12:00:00.000Z", ids: { nextInternalId: () => `customer-order-${n}`, nextPublicReference: () => `FM-LOCAL-CUSTOMERTEST${String(n).padStart(4, "0")}`, nextBrowserCapability: () => `customer-capability-${n}` } });
  const created = await orders.findOrCreate({ creationAttemptId: `123e4567-e89b-42d3-a456-42661419${String(n).padStart(4, "0")}`, context: { cartId: `customer-cart-${n}`, authorityKey: "tracking-customer-test" }, inputFingerprint: `customer-fingerprint-${n}`, snapshot: draft });
  assert.equal(created.status, "created");
  const payment = new LocalMemoryLocalPaymentRepository(orders, { now: () => "2026-08-27T12:01:00.000Z" }).commit({ internalOrderId: created.snapshot.internalId, orderReference: created.snapshot.publicReference, paymentAttemptId: `customer-payment-${n}`, outcome: "success", authorityContext: "customer-payment" });
  assert.equal(payment.status, "committed");
  const state = createLocalFulfillmentState({ internalOrderId: created.snapshot.internalId, publicOrderReference: created.snapshot.publicReference, status: "quality_check", currentPreview: null, revisionRequestsUsed: 0, createdAt: "2026-08-27T12:02:00.000Z", updatedAt: "2026-08-27T12:02:00.000Z" });
  const fulfillments = { findByOrderIdentity() { return { status: "found", aggregate: { kind: "local_fulfillment_aggregate", internalOrderId: created.snapshot.internalId, publicOrderReference: created.snapshot.publicReference, state, previewHistory: [], revisionRecords: [], actionBindings: [] } }; } };
  const tracking = new LocalMemoryLocalTrackingRepository({ orders, fulfillments }, { now: () => "2026-08-27T12:03:00.000Z", ids: { nextInternalShipmentId: () => `customer-shipment-${n}`, nextPublicShipmentReference: () => "FM-LOCAL-SHP-CUSTOMER0001", nextTrackingNumber: () => "FM-LOCAL-TRK-CUSTOMER0001" } });
  if (shipment) {
    const parsed = parseLocalTrackingActionInput({ trackingActionId: `customer-create-${n}-0001`, actionKind: "create_shipment" });
    assert.equal(parsed.ok, true);
    tracking.commit({ publicOrderReference: created.snapshot.publicReference, actorKind: "operator", actorContextId: "tracking-operator", action: parsed.value });
  }
  const service = new LocalTrackingCustomerService({ readConfig: () => ({ source: "local_fake", runtimeMode: "test" }), getOrderRepository: () => orders, getTrackingRepository: () => tracking });
  const handler = createLocalTrackingCustomerHttpHandler({ createService: () => service });
  return { orders, tracking, service, handler, order: payment.orderSnapshot, capability: created.browserCapability };
}
function request(fx, headers = {}) {
  return new Request(`http://localhost:3000/api/local-tracking/${fx.order.publicReference}`, { method: "GET", headers: { origin: "http://localhost:3000", "sec-fetch-site": "same-origin", cookie: `figmemento-local-order-access=${fx.capability}`, ...headers } });
}

test("authorized same-browser customer read returns only the safe Shipment projection", async () => {
  const fx = await fixture();
  const response = await fx.handler(request(fx), fx.order.publicReference);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, "shipment_created");
  assert.equal(body.publicOrderReference, fx.order.publicReference);
  assert.equal(body.publicShipmentReference, "FM-LOCAL-SHP-CUSTOMER0001");
  assert.equal(body.trackingNumber, "FM-LOCAL-TRK-CUSTOMER0001");
  assert.equal(body.notice, "DEVELOPMENT / TEST ONLY");
  assert.doesNotMatch(JSON.stringify(body), /internalOrderId|internalFulfillmentId|internalShipmentId|ownerId|capability|actorContextId|actionBindings|trackingActionId|receiptId|storageKey|provider|address|payment|coupon|tax|private/i);
});

test("wrong browser, public references, tracking numbers, absent Shipment, and restart fail uniformly", async () => {
  const fx = await fixture();
  const wrongBrowser = await fx.handler(request(fx, { cookie: "figmemento-local-order-access=wrong-browser-capability-0001" }), fx.order.publicReference);
  const publicShipment = await fx.handler(new Request("http://localhost:3000/api/local-tracking/FM-LOCAL-SHP-CUSTOMER0001", { headers: { origin: "http://localhost:3000" } }), "FM-LOCAL-SHP-CUSTOMER0001");
  const trackingNumber = await fx.handler(new Request("http://localhost:3000/api/local-tracking/FM-LOCAL-TRK-CUSTOMER0001", { headers: { origin: "http://localhost:3000" } }), "FM-LOCAL-TRK-CUSTOMER0001");
  const missing = await fx.handler(new Request("http://localhost:3000/api/local-tracking/ FM-LOCAL-CUSTOMERTEST", { headers: { origin: "http://localhost:3000", cookie: `figmemento-local-order-access=${fx.capability}` } }), "FM-LOCAL-CUSTOMERTEST");
  const noShipment = await fixture({ shipment: false });
  const absent = await noShipment.handler(request(noShipment), noShipment.order.publicReference);
  const restartedService = new LocalTrackingCustomerService({ readConfig: () => ({ source: "local_fake", runtimeMode: "test" }), getOrderRepository: () => fx.orders, getTrackingRepository: () => new LocalMemoryLocalTrackingRepository({ orders: fx.orders, fulfillments: { findByOrderIdentity: () => ({ status: "found", aggregate: { state: { status: "quality_check" } } }) } }) });
  const restarted = await restartedService.read({ publicOrderReference: fx.order.publicReference, browserCapability: fx.capability });
  assert.equal(wrongBrowser.status, 404);
  assert.equal(publicShipment.status, 404);
  assert.equal(trackingNumber.status, 404);
  assert.equal(missing.status, 404);
  assert.equal(absent.status, 404);
  assert.equal(restarted.status, "unavailable");
  const wrongBody = await wrongBrowser.json();
  const shipmentBody = await publicShipment.json();
  const trackingBody = await trackingNumber.json();
  const missingBody = await missing.json();
  const absentBody = await absent.json();
  assert.deepEqual(wrongBody, shipmentBody);
  assert.deepEqual(trackingBody, missingBody);
  assert.deepEqual(missingBody, absentBody);
});

test("customer reads are side-effect free and never create an absent Shipment", async () => {
  const fx = await fixture();
  const before = fx.tracking.findByOrderIdentity({ internalOrderId: fx.order.internalId, publicOrderReference: fx.order.publicReference });
  const counts = fx.tracking.getCountsForTests();
  for (let i = 0; i < 5; i += 1) {
    const response = await fx.handler(request(fx), fx.order.publicReference);
    assert.equal(response.status, 200);
  }
  assert.deepEqual(fx.tracking.findByOrderIdentity({ internalOrderId: fx.order.internalId, publicOrderReference: fx.order.publicReference }), before);
  assert.deepEqual(fx.tracking.getCountsForTests(), counts);

  const empty = await fixture({ shipment: false });
  const emptyCounts = empty.tracking.getCountsForTests();
  const response = await empty.handler(request(empty), empty.order.publicReference);
  assert.equal(response.status, 404);
  assert.deepEqual(empty.tracking.getCountsForTests(), emptyCounts);
  assert.equal(empty.tracking.findByOrderIdentity({ internalOrderId: empty.order.internalId, publicOrderReference: empty.order.publicReference }).status, "unavailable");
});

test("customer Tracking read remains GET-only, same-origin, local, and provider-stopped", async () => {
  const fx = await fixture();
  assert.equal((await fx.handler(request(fx, { origin: "https://evil.example" }), fx.order.publicReference)).status, 404);
  assert.equal((await fx.handler(new Request("http://localhost:3000/api/local-tracking/x", { method: "POST" }), fx.order.publicReference)).status, 405);
  const paths = ["../app/application/local-tracking-customer-service.ts", "../app/server/local-tracking-customer-http.server.ts", "../app/api/local-tracking/[reference]/route.ts"];
  const source = (await Promise.all(paths.map((path) => readFile(new URL(path, import.meta.url), "utf8")))).join("\n");
  assert.doesNotMatch(source, /fetch\s*\(|supabase|17track|stripe|paypal|resend|localStorage|sessionStorage|writeFile|readFile|insert\s*\(|update\s*\(|delete\s*\(/i);
});
