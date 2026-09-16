import assert from "node:assert/strict";
import test from "node:test";

import { LocalFulfillmentCustomerService } from "../app/application/local-fulfillment-customer-service.ts";
import { parseLocalFulfillmentActionInput } from "../app/domain/local-fulfillment.ts";
import { LocalMemoryLocalOrderRepository } from "../app/infrastructure/local-order/local-memory-local-order-repository.server.ts";
import { LocalMemoryLocalPaymentRepository } from "../app/infrastructure/local-payment/local-memory-local-payment-repository.server.ts";
import { LocalMemoryLocalFulfillmentRepository } from "../app/infrastructure/local-fulfillment/local-memory-local-fulfillment-repository.server.ts";

let sequence = 600;

function draft() {
  return {
    contact: {
      email: "customer@example.test",
      firstName: "Customer",
      lastName: "Buyer",
      country: "US",
      city: "Los Angeles",
      addressLine1: "1 Main Street",
      postalCode: "90001",
    },
    commercial: {
      currency: "USD",
      subtotalCents: 8990,
      shipping: {
        status: "eligible",
        country: "US",
        method: "local_standard",
        amountCents: 900,
        currency: "USD",
        estimatedRange: "5-10 business days",
        developmentOnly: true,
      },
      coupon: { status: "not_selected", discountCents: 0, developmentOnly: true },
      tax: { status: "not_activated", amountCents: null },
      localArithmeticTotalCents: 9890,
      developmentOnly: true,
    },
    lines: [{
      productId: "product-customer-fulfillment",
      productName: "Customer Fulfillment Gift",
      productSlug: "customer-fulfillment-gift",
      variantId: "variant-customer-fulfillment",
      skuCode: "CUSTOMER-FULFILLMENT-GIFT",
      selectedOptions: [],
      quantity: 1,
      unitBasePriceCents: 8990,
      currency: "USD",
      lineSubtotalCents: 8990,
    }],
  };
}

async function createPaidOrder() {
  const orders = new LocalMemoryLocalOrderRepository({ now: () => "2026-08-26T12:00:00.000Z" });
  const creation = await orders.findOrCreate({
    creationAttemptId: `123e4567-e89b-42d3-a456-42661417${String(sequence++).padStart(4, "0")}`,
    context: { cartId: `customer-cart-${sequence}`, authorityKey: "customer-fulfillment-test" },
    inputFingerprint: `customer-fulfillment-fingerprint-${sequence}`,
    snapshot: draft(),
  });
  assert.equal(creation.status, "created");
  if (creation.status !== "created") throw new Error("Order fixture creation failed");
  const payments = new LocalMemoryLocalPaymentRepository(orders, { now: () => "2026-08-26T12:01:00.000Z" });
  const payment = payments.commit({
    internalOrderId: creation.snapshot.internalId,
    orderReference: creation.snapshot.publicReference,
    paymentAttemptId: `customer-payment-${sequence++}`,
    outcome: "success",
    authorityContext: "customer-payment-test",
  });
  assert.equal(payment.status, "committed");
  if (payment.status !== "committed") throw new Error("Payment fixture creation failed");
  return { orders, order: payment.orderSnapshot, capability: creation.browserCapability };
}

function action(order, overrides = {}) {
  const parsed = parseLocalFulfillmentActionInput({
    publicOrderReference: order.publicReference,
    fulfillmentActionId: "customer-fulfillment-action-0001",
    actionKind: "approve_preview",
    expectedPreviewVersion: 1,
    ...overrides,
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) throw new Error("Customer action fixture failed");
  return parsed.value;
}

function commitOperator(repository, order, overrides = {}) {
  const parsed = parseLocalFulfillmentActionInput({
    publicOrderReference: order.publicReference,
    fulfillmentActionId: "operator-fulfillment-action-0001",
    actionKind: "enter_photo_review",
    ...overrides,
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) throw new Error("Operator action fixture failed");
  return repository.commit({
    internalOrderId: order.internalId,
    orderReference: order.publicReference,
    actorKind: "operator",
    actorContextId: "operator-context",
    action: parsed.value,
    publishedAt: "2026-08-26T12:02:00.000Z",
  });
}

function serviceFor(orders, repository) {
  return new LocalFulfillmentCustomerService({
    readConfig: () => ({ source: "local_fake", runtimeMode: "test" }),
    getOrderRepository: () => orders,
    getFulfillmentRepository: () => repository,
  });
}

test("customer read is capability-protected, side-effect free, and cannot admit Fulfillment", async () => {
  const fixture = await createPaidOrder();
  const repository = new LocalMemoryLocalFulfillmentRepository(fixture.orders);
  const service = serviceFor(fixture.orders, repository);

  const before = repository.getCountsForTests();
  const missing = await service.read({ publicOrderReference: fixture.order.publicReference });
  const unauthorized = await service.read({
    publicOrderReference: fixture.order.publicReference,
    browserCapability: "wrong-customer-capability" ,
  });
  const unknown = await service.read({
    publicOrderReference: "FM-LOCAL-AAAAAAAAAAAAAAAA",
    browserCapability: fixture.capability,
  });
  const notAdmitted = await service.read({
    publicOrderReference: fixture.order.publicReference,
    browserCapability: fixture.capability,
  });

  assert.equal(missing.status, "unavailable");
  assert.deepEqual(unauthorized, missing);
  assert.deepEqual(unknown, missing);
  assert.deepEqual(notAdmitted, missing);
  assert.deepEqual(repository.getCountsForTests(), before);

  const customerApprove = await service.mutate({
    publicOrderReference: fixture.order.publicReference,
    browserCapability: fixture.capability,
    action: action(fixture.order, { fulfillmentActionId: "customer-before-admission-0001" }),
  });
  assert.equal(customerApprove.status, "unavailable");
  assert.deepEqual(repository.getCountsForTests(), before);
});

test("authorized customer read returns only the safe projection", async () => {
  const fixture = await createPaidOrder();
  const repository = new LocalMemoryLocalFulfillmentRepository(fixture.orders);
  assert.equal(commitOperator(repository, fixture.order).status, "committed");
  assert.equal(commitOperator(repository, fixture.order, {
    fulfillmentActionId: "operator-customer-read-publish-0001",
    actionKind: "publish_preview",
  }).status, "committed");

  const result = await serviceFor(fixture.orders, repository).read({
    publicOrderReference: fixture.order.publicReference,
    browserCapability: fixture.capability,
  });
  assert.equal(result.status, "found");
  if (result.status !== "found") return;
  assert.equal(result.value.publicOrderReference, fixture.order.publicReference);
  assert.equal(result.value.status, "preview_pending");
  assert.equal(result.value.currentPreviewVersion, 1);
  assert.deepEqual(result.value.allowedActions, ["approve_preview", "request_revision"]);
  assert.equal(result.value.notice, "Development/test Fulfillment only.");
  assert.doesNotMatch(JSON.stringify(result), /internalOrderId|actorContextId|capability|actionBindings|revisionRecords|ownerId|receiptId|storageKey|bucket|provider|private/i);
});

test("customer approval uses the current preview, replays exactly, and rejects a new selector after approval", async () => {
  const fixture = await createPaidOrder();
  const repository = new LocalMemoryLocalFulfillmentRepository(fixture.orders);
  assert.equal(commitOperator(repository, fixture.order).status, "committed");
  assert.equal(commitOperator(repository, fixture.order, { actionKind: "publish_preview", fulfillmentActionId: "operator-approval-publish-0001" }).status, "committed");
  const service = serviceFor(fixture.orders, repository);

  const first = await service.mutate({
    publicOrderReference: fixture.order.publicReference,
    browserCapability: fixture.capability,
    action: action(fixture.order, { fulfillmentActionId: "customer-approval-0001", expectedPreviewVersion: 1 }),
  });
  const replay = await service.mutate({
    publicOrderReference: fixture.order.publicReference,
    browserCapability: fixture.capability,
    action: action(fixture.order, { fulfillmentActionId: "customer-approval-0001", expectedPreviewVersion: 1 }),
  });
  const newer = await service.mutate({
    publicOrderReference: fixture.order.publicReference,
    browserCapability: fixture.capability,
    action: action(fixture.order, { fulfillmentActionId: "customer-approval-0002", expectedPreviewVersion: 1 }),
  });

  assert.equal(first.status, "committed");
  assert.equal(replay.status, "replayed");
  if (first.status === "committed" && replay.status === "replayed") {
    assert.deepEqual(replay.result, first.result);
  }
  assert.equal(newer.status, "rejected");
  const current = repository.findByOrderIdentity({ internalOrderId: fixture.order.internalId, publicOrderReference: fixture.order.publicReference });
  assert.equal(current.status, "found");
  if (current.status === "found") assert.equal(current.aggregate.state.status, "preview_approved");
});

test("stale approval is rejected while v2 approval remains current and replayable", async () => {
  const fixture = await createPaidOrder();
  const repository = new LocalMemoryLocalFulfillmentRepository(fixture.orders);
  commitOperator(repository, fixture.order);
  commitOperator(repository, fixture.order, { actionKind: "publish_preview", fulfillmentActionId: "operator-v2-publish-0001" });
  const service = serviceFor(fixture.orders, repository);
  const revision = await service.mutate({
    publicOrderReference: fixture.order.publicReference,
    browserCapability: fixture.capability,
    action: action(fixture.order, { actionKind: "request_revision", fulfillmentActionId: "customer-v2-revision-0001", expectedPreviewVersion: 1, revisionNote: "  Adjust lighting  " }),
  });
  assert.equal(revision.status, "committed");
  commitOperator(repository, fixture.order, { actionKind: "publish_preview", fulfillmentActionId: "operator-v2-publish-0002" });
  const stale = await service.mutate({
    publicOrderReference: fixture.order.publicReference,
    browserCapability: fixture.capability,
    action: action(fixture.order, { fulfillmentActionId: "customer-v2-stale-0001", expectedPreviewVersion: 1 }),
  });
  const approveV2 = await service.mutate({
    publicOrderReference: fixture.order.publicReference,
    browserCapability: fixture.capability,
    action: action(fixture.order, { fulfillmentActionId: "customer-v2-approval-0001", expectedPreviewVersion: 2 }),
  });
  const replayV2 = await service.mutate({
    publicOrderReference: fixture.order.publicReference,
    browserCapability: fixture.capability,
    action: action(fixture.order, { fulfillmentActionId: "customer-v2-approval-0001", expectedPreviewVersion: 2 }),
  });
  assert.equal(stale.status, "rejected");
  assert.equal(approveV2.status, "committed");
  assert.equal(replayV2.status, "replayed");
});

test("customer revisions are bounded to two, replay once, and never publish automatically", async () => {
  const fixture = await createPaidOrder();
  const repository = new LocalMemoryLocalFulfillmentRepository(fixture.orders);
  commitOperator(repository, fixture.order);
  commitOperator(repository, fixture.order, { actionKind: "publish_preview", fulfillmentActionId: "operator-revision-publish-0001" });
  const service = serviceFor(fixture.orders, repository);

  const first = await service.mutate({
    publicOrderReference: fixture.order.publicReference,
    browserCapability: fixture.capability,
    action: action(fixture.order, { actionKind: "request_revision", fulfillmentActionId: "customer-revision-0001", revisionNote: "<script>plain text</script>" }),
  });
  const replay = await service.mutate({
    publicOrderReference: fixture.order.publicReference,
    browserCapability: fixture.capability,
    action: action(fixture.order, { actionKind: "request_revision", fulfillmentActionId: "customer-revision-0001", revisionNote: "  <script>plain text</script>  " }),
  });
  assert.equal(first.status, "committed");
  assert.equal(replay.status, "replayed");
  commitOperator(repository, fixture.order, { actionKind: "publish_preview", fulfillmentActionId: "operator-revision-publish-0002" });
  const second = await service.mutate({
    publicOrderReference: fixture.order.publicReference,
    browserCapability: fixture.capability,
    action: action(fixture.order, { actionKind: "request_revision", fulfillmentActionId: "customer-revision-0002", expectedPreviewVersion: 2, revisionNote: "Second request" }),
  });
  assert.equal(second.status, "committed");
  commitOperator(repository, fixture.order, { actionKind: "publish_preview", fulfillmentActionId: "operator-revision-publish-0003" });
  const third = await service.mutate({
    publicOrderReference: fixture.order.publicReference,
    browserCapability: fixture.capability,
    action: action(fixture.order, { actionKind: "request_revision", fulfillmentActionId: "customer-revision-0003", expectedPreviewVersion: 3, revisionNote: "Third request" }),
  });
  assert.equal(third.status, "rejected");
  const current = repository.findByOrderIdentity({ internalOrderId: fixture.order.internalId, publicOrderReference: fixture.order.publicReference });
  assert.equal(current.status, "found");
  if (current.status === "found") {
    assert.equal(current.aggregate.state.revisionRequestsUsed, 2);
    assert.equal(current.aggregate.state.currentPreview?.previewVersion, 3);
    assert.equal(current.aggregate.state.status, "preview_pending");
    assert.equal(current.aggregate.previewHistory.length, 3);
  }
  assert.doesNotMatch(JSON.stringify(first), /<script>|revisionNote|internalOrderId|capability/i);
});

test("customer boundary rejects operator actions before aggregate mutation and restart fails closed", async () => {
  const fixture = await createPaidOrder();
  const repository = new LocalMemoryLocalFulfillmentRepository(fixture.orders);
  const service = serviceFor(fixture.orders, repository);
  const rejected = await service.mutate({
    publicOrderReference: fixture.order.publicReference,
    browserCapability: fixture.capability,
    action: action(fixture.order, { actionKind: "publish_preview", fulfillmentActionId: "customer-operator-action-0001", expectedPreviewVersion: undefined }),
  });
  assert.equal(rejected.status, "invalid");
  assert.equal(repository.getCountsForTests().aggregateCount, 0);

  commitOperator(repository, fixture.order);
  const restartedService = serviceFor(fixture.orders, new LocalMemoryLocalFulfillmentRepository(fixture.orders));
  const afterRestart = await restartedService.read({ publicOrderReference: fixture.order.publicReference, browserCapability: fixture.capability });
  assert.equal(afterRestart.status, "unavailable");
});
