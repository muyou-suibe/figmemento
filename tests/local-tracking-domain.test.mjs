import assert from "node:assert/strict";
import test from "node:test";

import {
  areSameCanonicalFulfillment,
  createLocalShipment,
  createLocalTrackingDestinationReference,
  isLocalShipmentPublicReference,
  isLocalTrackingNumber,
  parseLocalTrackingActionInput,
  projectLocalShipment,
  transitionLocalShipment,
  validateLocalTrackingAdmission,
} from "../app/domain/local-tracking.ts";

const order = {
  kind: "canonical_local_order_reference",
  internalId: "order-tracking-domain-1",
  publicReference: "FM-LOCAL-ABCDEF0123456789",
};

const fulfillment = {
  kind: "canonical_local_fulfillment_reference",
  internalId: "fulfillment-tracking-domain-1",
  canonicalOrderInternalId: order.internalId,
};

const createInput = {
  internalShipmentId: "shipment-tracking-domain-1",
  publicShipmentReference: "FM-LOCAL-SHP-ABCDEF012345",
  canonicalOrder: order,
  canonicalFulfillment: fulfillment,
  fulfillmentStatus: "quality_check",
  trackingNumber: "FM-LOCAL-TRK-ABCDEF012345",
  createdAt: "2026-08-27T10:00:00.000Z",
};

function shipment() {
  const result = createLocalShipment(createInput);
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("expected a valid local Shipment");
  return result.value;
}

test("quality_check is the only trusted Shipment admission prerequisite", () => {
  assert.equal(validateLocalTrackingAdmission({ ...createInput, fulfillmentStatus: "quality_check" }).ok, true);
  const rejected = validateLocalTrackingAdmission({ ...createInput, fulfillmentStatus: "in_production" });
  assert.equal(rejected.ok, false);
  if (rejected.ok) throw new Error("expected non-quality-check admission to fail");
  assert.equal(rejected.issues[0].code, "not_quality_check");

  const forgedRelationship = validateLocalTrackingAdmission({
    ...createInput,
    canonicalFulfillment: { ...fulfillment, canonicalOrderInternalId: "another-order" },
  });
  assert.equal(forgedRelationship.ok, false);
});

test("Shipment identity and at-most-one invariant are independent from action identity", () => {
  assert.equal(isLocalShipmentPublicReference(createInput.publicShipmentReference), true);
  assert.equal(isLocalTrackingNumber(createInput.trackingNumber), true);
  assert.equal(areSameCanonicalFulfillment(fulfillment, { ...fulfillment }), true);
  assert.equal(areSameCanonicalFulfillment(fulfillment, { ...fulfillment, internalId: "fulfillment-2" }), false);
  assert.equal(areSameCanonicalFulfillment(fulfillment, {
    ...fulfillment,
    canonicalOrderInternalId: "different-order",
  }), false);
});

test("pure Shipment creation starts at shipment_created and stores references, not mutable Order facts", () => {
  const value = shipment();
  assert.equal(value.status, "shipment_created");
  assert.equal(value.events.length, 1);
  assert.equal(value.carrier.displayLabel, "Local Demo Carrier");
  assert.equal(value.developmentOnly, true);
  assert.equal(value.protectedDestination.canonicalOrderInternalId, order.internalId);
  assert.equal("address" in value, false);
  assert.equal("price" in value, false);
  assert.equal("paymentStatus" in value, false);
});

test("Shipment lifecycle permits only the exact forward path and delivered is terminal", () => {
  const created = shipment();
  const shipped = transitionLocalShipment({ current: created, targetStatus: "shipped", occurredAt: "2026-08-27T10:01:00.000Z" });
  assert.equal(shipped.ok, true);
  if (!shipped.ok) throw new Error("expected shipped transition");
  const inTransit = transitionLocalShipment({ current: shipped.value, targetStatus: "in_transit", occurredAt: "2026-08-27T10:02:00.000Z" });
  assert.equal(inTransit.ok, true);
  if (!inTransit.ok) throw new Error("expected in-transit transition");
  const delivered = transitionLocalShipment({ current: inTransit.value, targetStatus: "delivered", occurredAt: "2026-08-27T10:03:00.000Z" });
  assert.equal(delivered.ok, true);
  if (!delivered.ok) throw new Error("expected delivered transition");
  assert.equal(delivered.value.deliveredAt, "2026-08-27T10:03:00.000Z");

  const terminal = transitionLocalShipment({ current: delivered.value, targetStatus: "shipped", occurredAt: "2026-08-27T10:04:00.000Z" });
  assert.equal(terminal.ok, false);
  if (terminal.ok) throw new Error("expected terminal rejection");
  assert.equal(terminal.issues[0].code, "terminal");
});

test("invalid skips, backward transitions, and same-state mutation are rejected", () => {
  const created = shipment();
  for (const targetStatus of ["in_transit", "delivered", "shipment_created"]) {
    const result = transitionLocalShipment({ current: created, targetStatus, occurredAt: "2026-08-27T10:01:00.000Z" });
    assert.equal(result.ok, false);
  }
  const shipped = transitionLocalShipment({ current: created, targetStatus: "shipped", occurredAt: "2026-08-27T10:01:00.000Z" });
  assert.equal(shipped.ok, true);
  if (!shipped.ok) throw new Error("expected shipped transition");
  const skip = transitionLocalShipment({ current: shipped.value, targetStatus: "delivered", occurredAt: "2026-08-27T10:02:00.000Z" });
  assert.equal(skip.ok, false);
  const backward = transitionLocalShipment({ current: shipped.value, targetStatus: "shipment_created", occurredAt: "2026-08-27T10:02:00.000Z" });
  assert.equal(backward.ok, false);
});

test("identity, event labels, timestamps, and local fixture notice are deterministic", () => {
  const value = shipment();
  const projection = projectLocalShipment(value);
  assert.equal(projection.status, "found");
  if (projection.status !== "found") throw new Error("expected safe projection");
  assert.deepEqual(projection.value, {
    publicOrderReference: order.publicReference,
    publicShipmentReference: createInput.publicShipmentReference,
    carrierLabel: "Local Demo Carrier",
    trackingNumber: createInput.trackingNumber,
    status: "shipment_created",
    events: [{
      status: "shipment_created",
      label: "Local shipment created",
      occurredAt: createInput.createdAt,
    }],
    createdAt: createInput.createdAt,
    shippedAt: null,
    inTransitAt: null,
    deliveredAt: null,
    notice: "DEVELOPMENT / TEST ONLY",
  });
});

test("safe projection excludes internal identity, protected destination, and authority internals", () => {
  const value = shipment();
  const projection = projectLocalShipment(value);
  assert.equal(projection.status, "found");
  if (projection.status !== "found") throw new Error("expected projection");
  const serialized = JSON.stringify(projection.value);
  assert.doesNotMatch(serialized, /internalShipmentId|internalFulfillmentId|internalOrderId|ownerId|capability|paymentAttemptId|fulfillmentActionId|trackingActionId|storageKey|providerToken|address|coupon|tax|paymentStatus/i);
});

test("destination authority is only a protected Local Order reference", () => {
  const destination = createLocalTrackingDestinationReference(order);
  assert.equal(destination.ok, true);
  if (!destination.ok) throw new Error("expected destination reference");
  assert.deepEqual(destination.value, {
    kind: "protected_local_order_destination",
    canonicalOrderInternalId: order.internalId,
  });
  assert.equal("addressLine1" in destination.value, false);
});

test("Tracking action parser rejects browser address, financial, provider, and lifecycle authority", () => {
  const valid = parseLocalTrackingActionInput({
    trackingActionId: "tracking-action-domain-0001",
    actionKind: "mark_shipped",
  });
  assert.equal(valid.ok, true);
  for (const field of ["address", "shippingPrice", "coupon", "tax", "paymentStatus", "provider", "trackingNumber", "fulfillmentStatus"]) {
    const result = parseLocalTrackingActionInput({
      trackingActionId: "tracking-action-domain-0002",
      actionKind: "mark_shipped",
      [field]: "browser-authority",
    });
    assert.equal(result.ok, false, field);
    if (result.ok) throw new Error(`expected ${field} to be rejected`);
    assert.equal(result.issues[0].code, "authority_field", field);
  }
});

test("Shipment creation rejects invalid server identity and never invents fallback identity", () => {
  const invalidReference = createLocalShipment({ ...createInput, publicShipmentReference: "shipment-1" });
  assert.equal(invalidReference.ok, false);
  const invalidTracking = createLocalShipment({ ...createInput, trackingNumber: "TRACK-1" });
  assert.equal(invalidTracking.ok, false);
  const invalidQuality = createLocalShipment({ ...createInput, fulfillmentStatus: "preview_approved" });
  assert.equal(invalidQuality.ok, false);
});
