import assert from "node:assert/strict";
import test from "node:test";

import { createLocalFulfillmentState } from "../app/domain/local-fulfillment.ts";
import { LocalMemoryLocalOrderRepository } from "../app/infrastructure/local-order/local-memory-local-order-repository.server.ts";
import { LocalMemoryLocalPaymentRepository } from "../app/infrastructure/local-payment/local-memory-local-payment-repository.server.ts";
import { LocalMemoryLocalTrackingRepository } from "../app/infrastructure/local-tracking/local-memory-local-tracking-repository.server.ts";
import { commitAuthorizedLocalTrackingOperatorAction, createLocalTrackingRuntime } from "../app/server/local-tracking-runtime.server.ts";
import { readLocalTrackingConfig } from "../app/config/local-tracking-runtime.ts";
import { parseLocalTrackingActionInput } from "../app/domain/local-tracking.ts";

let sequence = 1;
const draft = {
  contact: { email: "tracking@example.test", firstName: "Track", lastName: "Test", country: "US", city: "Austin", addressLine1: "1 Main Street", postalCode: "78701" },
  commercial: { currency: "USD", subtotalCents: 1000, shipping: { status: "eligible", country: "US", method: "local_standard", amountCents: 0, currency: "USD", estimatedRange: "local", developmentOnly: true }, coupon: { status: "not_selected", discountCents: 0, developmentOnly: true }, tax: { status: "not_activated", amountCents: null }, localArithmeticTotalCents: 1000, developmentOnly: true },
  lines: [{ productId: "tracking-product", productName: "Tracking Gift", productSlug: "tracking-gift", variantId: "tracking-variant", skuCode: "TRACKING", selectedOptions: [], quantity: 1, unitBasePriceCents: 1000, currency: "USD", lineSubtotalCents: 1000 }],
};

async function fixture({ paid = true, fulfillmentStatus = "quality_check" } = {}) {
  const orders = new LocalMemoryLocalOrderRepository({ now: () => "2026-08-27T10:00:00.000Z", ids: { nextInternalId: () => `order-${sequence}`, nextPublicReference: () => `FM-LOCAL-TRACKINGTEST${String(sequence++).padStart(4, "0")}`, nextBrowserCapability: () => `cap-${sequence}` } });
  const created = await orders.findOrCreate({ creationAttemptId: `123e4567-e89b-42d3-a456-4266141700${String(sequence).padStart(2, "0")}`, context: { cartId: `cart-${sequence}`, authorityKey: "tracking-test" }, inputFingerprint: `fingerprint-${sequence}`, snapshot: draft });
  assert.equal(created.status, "created");
  let snapshot = created.snapshot;
  if (paid) {
    const payment = new LocalMemoryLocalPaymentRepository(orders, { now: () => "2026-08-27T10:01:00.000Z" }).commit({ internalOrderId: snapshot.internalId, orderReference: snapshot.publicReference, paymentAttemptId: `payment-${sequence}`, outcome: "success", authorityContext: "payment-context" });
    assert.equal(payment.status, "committed");
    snapshot = payment.orderSnapshot;
  }
  const state = createLocalFulfillmentState({ internalOrderId: snapshot.internalId, publicOrderReference: snapshot.publicReference, status: fulfillmentStatus, currentPreview: null, revisionRequestsUsed: 0, createdAt: "2026-08-27T10:02:00.000Z", updatedAt: "2026-08-27T10:02:00.000Z" });
  const fulfillments = { findByOrderIdentity() { return { status: "found", aggregate: { kind: "local_fulfillment_aggregate", internalOrderId: snapshot.internalId, publicOrderReference: snapshot.publicReference, state, previewHistory: [], revisionRecords: [], actionBindings: [] } }; } };
  return { orders, fulfillments, snapshot, ports: { orders, fulfillments } };
}
function action(trackingActionId, actionKind = "create_shipment") {
  const parsed = parseLocalTrackingActionInput({ trackingActionId, actionKind });
  assert.equal(parsed.ok, true);
  return parsed.value;
}
function repoFor(fixtureValue, options = {}) { return new LocalMemoryLocalTrackingRepository(fixtureValue.ports, { now: () => "2026-08-27T10:03:00.000Z", ids: { nextInternalShipmentId: () => "shipment-1", nextPublicShipmentReference: () => "FM-LOCAL-SHP-ABCDEF012345", nextTrackingNumber: () => "FM-LOCAL-TRK-ABCDEF012345" }, ...options }); }
function commit(repo, fx, id, kind = "create_shipment", actorContextId = "tracking-operator") { return repo.commit({ publicOrderReference: fx.snapshot.publicReference, actorKind: "operator", actorContextId, action: action(id, kind) }); }

test("creates one canonical Shipment only after paid/succeeded and quality_check", async () => {
  const fx = await fixture();
  const repo = repoFor(fx);
  const first = commit(repo, fx, "tracking-create-0001");
  assert.equal(first.status, "committed");
  assert.equal(repo.getCountsForTests().shipmentCount, 1);
  assert.equal(fx.snapshot.status, "paid");
  assert.equal(fx.snapshot.paymentStatus, "succeeded");
  const duplicateSelector = commit(repo, fx, "tracking-create-0002");
  assert.equal(duplicateSelector.status, "conflict");
  assert.equal(repo.getCountsForTests().shipmentCount, 1);
});

test("creation fails closed for unpaid and pre-quality Fulfillment", async () => {
  for (const options of [{ paid: false }, { fulfillmentStatus: "in_production" }]) {
    const fx = await fixture(options);
    const result = commit(repoFor(fx), fx, `tracking-reject-${sequence}`);
    assert.equal(result.status, "rejected");
  }
});

test("exact create replay wins before uniqueness and preserves original identity", async () => {
  const fx = await fixture();
  const repo = repoFor(fx);
  const first = commit(repo, fx, "tracking-replay-0001");
  const replay = commit(repo, fx, "tracking-replay-0001");
  assert.equal(first.status, "committed");
  assert.equal(replay.status, "replayed");
  if (first.status === "committed" && replay.status === "replayed") {
    assert.deepEqual(replay.result, first.result);
    assert.deepEqual(replay.shipment, first.shipment);
  }
  assert.equal(repo.getCountsForTests().actionBindingCount, 1);
});

test("lifecycle transitions are exact, replayable, and delivered is terminal", async () => {
  const fx = await fixture();
  const repo = repoFor(fx);
  assert.equal(commit(repo, fx, "tracking-life-create").status, "committed");
  assert.equal(commit(repo, fx, "tracking-life-ship", "mark_shipped").shipment.status, "shipped");
  assert.equal(commit(repo, fx, "tracking-life-transit", "mark_in_transit").shipment.status, "in_transit");
  const delivered = commit(repo, fx, "tracking-life-deliver", "mark_delivered");
  assert.equal(delivered.shipment.status, "delivered");
  assert.equal(commit(repo, fx, "tracking-life-deliver", "mark_delivered").status, "replayed");
  const invalid = commit(repo, fx, "tracking-life-again", "mark_delivered");
  assert.equal(invalid.status, "rejected");
  assert.equal(repo.getCountsForTests().eventCount, 4);
});

test("concurrent distinct creates serialize to one Shipment and concurrent events cannot duplicate", async () => {
  const fx = await fixture();
  const repo = repoFor(fx);
  const creates = await Promise.all([Promise.resolve().then(() => commit(repo, fx, "tracking-race-a-0001")), Promise.resolve().then(() => commit(repo, fx, "tracking-race-b-0001"))]);
  assert.equal(creates.filter((entry) => entry.status === "committed").length, 1);
  assert.equal(repo.getCountsForTests().shipmentCount, 1);
  assert.equal(commit(repo, fx, "tracking-race-ship-a-0001", "mark_shipped").status, "committed");
  const transitions = await Promise.all([Promise.resolve().then(() => commit(repo, fx, "tracking-race-transit-a-0001", "mark_in_transit")), Promise.resolve().then(() => commit(repo, fx, "tracking-race-transit-b-0001", "mark_in_transit"))]);
  assert.equal(transitions.filter((entry) => entry.status === "committed").length, 1);
  assert.equal(repo.getCountsForTests().eventCount, 3);
});

test("rollback preserves an existing aggregate and leaves no ghost binding", async () => {
  const fx = await fixture();
  let shouldFail = false;
  const repo = repoFor(fx, { failureInjector: { beforeCommit: () => { if (shouldFail) throw new Error("controlled"); } } });
  assert.equal(commit(repo, fx, "tracking-rollback-create").status, "committed");
  const before = repo.findByOrderIdentity({ internalOrderId: fx.snapshot.internalId, publicOrderReference: fx.snapshot.publicReference });
  assert.equal(before.status, "found");
  if (before.status !== "found") throw new Error("expected the pre-failure aggregate");
  const countsBefore = repo.getCountsForTests();
  shouldFail = true;
  const failed = commit(repo, fx, "tracking-rollback-ship", "mark_shipped");
  assert.equal(failed.status, "failed");
  shouldFail = false;
  const after = repo.findByOrderIdentity({ internalOrderId: fx.snapshot.internalId, publicOrderReference: fx.snapshot.publicReference });
  assert.equal(after.status, "found");
  if (after.status !== "found") throw new Error("expected the aggregate after rollback");
  assert.deepEqual(after.aggregate, before.aggregate);
  assert.deepEqual(repo.getCountsForTests(), countsBefore);
  assert.equal(after.aggregate.shipment.status, "shipment_created");
  assert.deepEqual(after.aggregate.shipment.events, before.aggregate.shipment.events);
  assert.equal(after.aggregate.shipment.shippedAt, null);
  assert.equal(after.aggregate.shipment.updatedAt, before.aggregate.shipment.updatedAt);
  assert.equal(after.aggregate.actionBindings.length, before.aggregate.actionBindings.length);
  const retry = commit(repo, fx, "tracking-rollback-ship", "mark_shipped");
  assert.equal(retry.status, "committed");
  assert.equal(repo.getCountsForTests().eventCount, 2);

  const restarted = new LocalMemoryLocalTrackingRepository(fx.ports);
  assert.equal(restarted.findByOrderIdentity({ internalOrderId: fx.snapshot.internalId, publicOrderReference: fx.snapshot.publicReference }).status, "unavailable");
});

test("same trackingActionId with a different actor context conflicts without mutation", async () => {
  const fx = await fixture();
  const repo = repoFor(fx);
  assert.equal(commit(repo, fx, "tracking-selector-actor-0001", "create_shipment", "operator-context-A").status, "committed");
  const before = repo.findByOrderIdentity({ internalOrderId: fx.snapshot.internalId, publicOrderReference: fx.snapshot.publicReference });
  const conflict = commit(repo, fx, "tracking-selector-actor-0001", "create_shipment", "operator-context-B");
  assert.equal(conflict.status, "conflict");
  const after = repo.findByOrderIdentity({ internalOrderId: fx.snapshot.internalId, publicOrderReference: fx.snapshot.publicReference });
  assert.deepEqual(after, before);
  assert.deepEqual(repo.getCountsForTests(), { shipmentCount: 1, eventCount: 1, actionBindingCount: 1 });
});

test("same trackingActionId with a different action kind conflicts without mutation", async () => {
  const fx = await fixture();
  const repo = repoFor(fx);
  assert.equal(commit(repo, fx, "tracking-selector-kind-0001").status, "committed");
  const before = repo.findByOrderIdentity({ internalOrderId: fx.snapshot.internalId, publicOrderReference: fx.snapshot.publicReference });
  const conflict = commit(repo, fx, "tracking-selector-kind-0001", "mark_shipped");
  assert.equal(conflict.status, "conflict");
  const after = repo.findByOrderIdentity({ internalOrderId: fx.snapshot.internalId, publicOrderReference: fx.snapshot.publicReference });
  assert.deepEqual(after, before);
  assert.deepEqual(repo.getCountsForTests(), { shipmentCount: 1, eventCount: 1, actionBindingCount: 1 });
});

test("Tracking lifecycle preserves canonical Order facts and upstream quality_check", async () => {
  const fx = await fixture();
  const repo = repoFor(fx);
  const orderBefore = structuredClone(fx.snapshot);
  const fulfillmentBefore = structuredClone(fx.fulfillments.findByOrderIdentity({ internalOrderId: fx.snapshot.internalId, publicOrderReference: fx.snapshot.publicReference }));
  assert.equal(commit(repo, fx, "tracking-upstream-create").status, "committed");
  assert.equal(commit(repo, fx, "tracking-upstream-ship", "mark_shipped").status, "committed");
  assert.equal(commit(repo, fx, "tracking-upstream-transit", "mark_in_transit").status, "committed");
  assert.equal(commit(repo, fx, "tracking-upstream-deliver", "mark_delivered").status, "committed");
  assert.deepEqual(fx.orders.findSnapshotForFulfillmentById(fx.snapshot.internalId), { status: "found", snapshot: orderBefore });
  assert.deepEqual(fx.fulfillments.findByOrderIdentity({ internalOrderId: fx.snapshot.internalId, publicOrderReference: fx.snapshot.publicReference }), fulfillmentBefore);
  const tracking = repo.findByOrderIdentity({ internalOrderId: fx.snapshot.internalId, publicOrderReference: fx.snapshot.publicReference });
  assert.equal(tracking.status, "found");
  if (tracking.status === "found") assert.equal(tracking.aggregate.shipment.status, "delivered");
});

test("operator runtime gate precedes repository construction", async () => {
  const fx = await fixture();
  const runtime = createLocalTrackingRuntime({ configuration: readLocalTrackingConfig({ LOCAL_TRACKING_SOURCE: "local_fake" }, "test"), ports: fx.ports, repository: repoFor(fx) });
  const result = commitAuthorizedLocalTrackingOperatorAction(runtime, { publicOrderReference: fx.snapshot.publicReference, action: action("tracking-runtime-0001"), verifier: { verify: () => null } });
  assert.equal(result.status, "unavailable");
  const authorized = commitAuthorizedLocalTrackingOperatorAction(runtime, { publicOrderReference: fx.snapshot.publicReference, action: action("tracking-runtime-0002"), verifier: { verify: () => ({ actorKind: "operator", actorContextId: "tracking-operator" }) } });
  assert.equal(authorized.status, "committed");
});
