import assert from "node:assert/strict";
import test from "node:test";
import { createLocalFulfillmentState } from "../app/domain/local-fulfillment.ts";
import { parseLocalTrackingActionInput } from "../app/domain/local-tracking.ts";
import { LocalMemoryLocalOrderRepository } from "../app/infrastructure/local-order/local-memory-local-order-repository.server.ts";
import { LocalMemoryLocalPaymentRepository } from "../app/infrastructure/local-payment/local-memory-local-payment-repository.server.ts";
import { LocalMemoryLocalTrackingRepository } from "../app/infrastructure/local-tracking/local-memory-local-tracking-repository.server.ts";
import { LocalTrackingOperatorService, parseLocalTrackingOperatorActionInput } from "../app/application/local-tracking-operator-service.ts";
import { createLocalTrackingRuntime } from "../app/server/local-tracking-runtime.server.ts";

let sequence = 1;
async function fixture() {
  const n = sequence++;
  const orders = new LocalMemoryLocalOrderRepository({ now: () => "2026-08-27T14:00:00.000Z", ids: { nextInternalId: () => `operator-order-${n}`, nextPublicReference: () => `FM-LOCAL-OPERATETESTX${String(n).padStart(4, "0")}`, nextBrowserCapability: () => `operator-cap-${n}` } });
  const created = await orders.findOrCreate({ creationAttemptId: `123e4567-e89b-42d3-a456-42661418${String(n).padStart(4, "0")}`, context: { cartId: `operator-cart-${n}`, authorityKey: "operator-test" }, inputFingerprint: `operator-fingerprint-${n}`, snapshot: { contact: { email: "operator@example.test", firstName: "Operator", lastName: "Test", country: "US", city: "Austin", addressLine1: "1 Main Street", postalCode: "78701" }, commercial: { currency: "USD", subtotalCents: 1000, shipping: { status: "eligible", country: "US", method: "local_standard", amountCents: 0, currency: "USD", estimatedRange: "local", developmentOnly: true }, coupon: { status: "not_selected", discountCents: 0, developmentOnly: true }, tax: { status: "not_activated", amountCents: null }, localArithmeticTotalCents: 1000, developmentOnly: true }, lines: [{ productId: "operator-product", productName: "Operator Gift", productSlug: "operator-gift", variantId: "operator-variant", skuCode: "OPERATOR", selectedOptions: [], quantity: 1, unitBasePriceCents: 1000, currency: "USD", lineSubtotalCents: 1000 }] } });
  const payment = new LocalMemoryLocalPaymentRepository(orders, { now: () => "2026-08-27T14:01:00.000Z" }).commit({ internalOrderId: created.snapshot.internalId, orderReference: created.snapshot.publicReference, paymentAttemptId: `operator-payment-${n}`, outcome: "success", authorityContext: "operator-payment" });
  const state = createLocalFulfillmentState({ internalOrderId: created.snapshot.internalId, publicOrderReference: created.snapshot.publicReference, status: "quality_check", currentPreview: null, revisionRequestsUsed: 0, createdAt: "2026-08-27T14:02:00.000Z", updatedAt: "2026-08-27T14:02:00.000Z" });
  const fulfillments = { findByOrderIdentity() { return { status: "found", aggregate: { kind: "local_fulfillment_aggregate", internalOrderId: created.snapshot.internalId, publicOrderReference: created.snapshot.publicReference, state, previewHistory: [], revisionRecords: [], actionBindings: [] } }; } };
  const tracking = new LocalMemoryLocalTrackingRepository({ orders, fulfillments }, { now: () => "2026-08-27T14:03:00.000Z", ids: { nextInternalShipmentId: () => `operator-shipment-${n}`, nextPublicShipmentReference: () => "FM-LOCAL-SHP-OPERAT000001", nextTrackingNumber: () => "FM-LOCAL-TRK-OPERAT000001" } });
  const runtime = createLocalTrackingRuntime({ configuration: { source: "local_fake", runtimeMode: "test" }, ports: { orders, fulfillments }, repository: tracking });
  const verifier = { verify: () => ({ actorKind: "operator", actorContextId: "operator-context" }) };
  return { service: new LocalTrackingOperatorService({ runtime, verifier }), runtime, publicReference: payment.orderSnapshot.publicReference, tracking };
}
function action(trackingActionId, actionKind) { const parsed = parseLocalTrackingActionInput({ trackingActionId, actionKind }); assert.equal(parsed.ok, true); return parsed.value; }

test("operator performs the exact lifecycle without customer capability", async () => {
  const fx = await fixture();
  const initial = fx.service.read(fx.publicReference);
  assert.equal(initial.status, "found");
  if (initial.status === "found") { assert.equal(initial.value.fulfillmentStatus, "quality_check"); assert.equal(initial.value.shipment, null); assert.deepEqual(initial.value.allowedActions, ["create_shipment"]); }
  const expected = [["operator-create-0001", "create_shipment", "shipment_created", ["mark_shipped"]], ["operator-ship-00001", "mark_shipped", "shipped", ["mark_in_transit"]], ["operator-transit-0001", "mark_in_transit", "in_transit", ["mark_delivered"]], ["operator-deliver-0001", "mark_delivered", "delivered", []]];
  for (const [id, kind, status, next] of expected) {
    const result = fx.service.mutate(fx.publicReference, action(id, kind));
    assert.equal(result.status, "committed");
    const projection = fx.service.read(fx.publicReference);
    assert.equal(projection.status, "found");
    if (projection.status === "found") { assert.equal(projection.value.fulfillmentStatus, "quality_check"); assert.equal(projection.value.shipment?.status, status); assert.deepEqual(projection.value.allowedActions, next); }
  }
  const terminal = fx.service.read(fx.publicReference);
  assert.equal(terminal.status, "found");
  if (terminal.status === "found") { assert.equal(terminal.value.shipment?.status, "delivered"); assert.deepEqual(terminal.value.allowedActions, []); }
  assert.equal(fx.service.mutate(fx.publicReference, action("operator-deliver-0001", "mark_delivered")).status, "replayed");
  assert.equal(fx.tracking.getCountsForTests().eventCount, 4);
});

test("customer capability cannot authorize operator construction and browser authority is rejected", async () => {
  const fx = await fixture();
  const unauthorized = new LocalTrackingOperatorService({ runtime: fx.runtime, verifier: undefined });
  assert.equal(unauthorized.mutate(fx.publicReference, action("operator-no-auth-0001", "create_shipment")).status, "unavailable");
  assert.equal(parseLocalTrackingOperatorActionInput({ trackingActionId: "operator-forged-0001", actionKind: "create_shipment", trackingNumber: "FM-LOCAL-TRK-FAKE00001", status: "delivered" }, fx.publicReference).ok, false);
  assert.equal(fx.service.mutate(fx.publicReference, action("operator-skip-000001", "mark_delivered")).status, "unavailable");
});

test("runtime gate remains separate from operator authority", async () => {
  const fx = await fixture();
  const disabled = new LocalTrackingOperatorService({ runtime: { ...fx.runtime, configuration: { source: "disabled", runtimeMode: "test" } }, verifier: { verify: () => ({ actorKind: "operator", actorContextId: "operator-context" }) } });
  assert.equal(disabled.mutate(fx.publicReference, action("operator-disabled-0001", "create_shipment")).status, "unavailable");
});
