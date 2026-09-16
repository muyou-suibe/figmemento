import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { replaceLocalOrderLifecycle } from "../app/domain/local-order.ts";
import { parseLocalFulfillmentActionInput } from "../app/domain/local-fulfillment.ts";
import { LocalMemoryLocalOrderRepository } from "../app/infrastructure/local-order/local-memory-local-order-repository.server.ts";
import { LocalMemoryLocalPaymentRepository } from "../app/infrastructure/local-payment/local-memory-local-payment-repository.server.ts";
import { LocalMemoryLocalFulfillmentRepository } from "../app/infrastructure/local-fulfillment/local-memory-local-fulfillment-repository.server.ts";
import {
  commitAuthorizedLocalFulfillmentOperatorAction,
  createLocalFulfillmentRuntime,
  getSharedLocalFulfillmentRepository,
  getSharedLocalFulfillmentRuntime,
  resetSharedLocalFulfillmentRuntimeForTests,
} from "../app/server/local-fulfillment-runtime.server.ts";

let creationSequence = 100;
let paymentSequence = 100;

function nextCreationAttemptId() {
  const suffix = String(creationSequence++).padStart(4, "0");
  return `123e4567-e89b-42d3-a456-42661417${suffix}`;
}

function draft(productId = "product-fulfillment") {
  return {
    contact: {
      email: "fulfillment@example.test",
      firstName: "Fulfillment",
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
      productId,
      productName: "Fulfillment Gift",
      productSlug: "fulfillment-gift",
      variantId: "variant-fulfillment",
      skuCode: "FULFILLMENT-GIFT",
      selectedOptions: [],
      quantity: 1,
      unitBasePriceCents: 8990,
      currency: "USD",
      lineSubtotalCents: 8990,
    }],
  };
}

async function createOrder({ paid = true, productId = "product-fulfillment" } = {}) {
  const orders = new LocalMemoryLocalOrderRepository({
    now: () => "2026-08-26T10:00:00.000Z",
  });
  const created = await orders.findOrCreate({
    creationAttemptId: nextCreationAttemptId(),
    context: { cartId: `cart-${productId}-${creationSequence}`, authorityKey: "fulfillment-test" },
    inputFingerprint: `fulfillment-fingerprint-${creationSequence}`,
    snapshot: draft(productId),
  });
  assert.equal(created.status, "created");
  if (!paid) return { orders, created, snapshot: created.snapshot };

  const payments = new LocalMemoryLocalPaymentRepository(orders, {
    now: () => "2026-08-26T10:01:00.000Z",
  });
  const payment = payments.commit({
    internalOrderId: created.snapshot.internalId,
    orderReference: created.snapshot.publicReference,
    paymentAttemptId: `payment-attempt-${paymentSequence++}`,
    outcome: "success",
    authorityContext: "payment-test-context",
  });
  assert.equal(payment.status, "committed");
  assert.equal(payment.orderSnapshot.status, "paid");
  assert.equal(payment.orderSnapshot.paymentStatus, "succeeded");
  return { orders, created, snapshot: payment.orderSnapshot };
}

function parsedAction(order, overrides = {}) {
  const input = {
    publicOrderReference: order.snapshot.publicReference,
    fulfillmentActionId: "fulfillment-action-0001",
    actionKind: "enter_photo_review",
    ...overrides,
  };
  const parsed = parseLocalFulfillmentActionInput(input);
  assert.equal(parsed.ok, true, JSON.stringify(input));
  if (!parsed.ok) throw new Error("Fulfillment test action should parse");
  return parsed.value;
}

function commit(repository, order, overrides, actorKind = "operator", actorContextId = "operator-context") {
  return repository.commit({
    internalOrderId: order.snapshot.internalId,
    orderReference: order.snapshot.publicReference,
    actorKind,
    actorContextId,
    action: parsedAction(order, overrides),
    publishedAt: "2026-08-26T11:00:00.000Z",
  });
}

function queuedCommit(repository, input) {
  return Promise.resolve().then(() => repository.commit(input));
}

function rawCommitInput(order, overrides, actorKind = "operator", actorContextId = "operator-context") {
  return {
    internalOrderId: order.snapshot.internalId,
    orderReference: order.snapshot.publicReference,
    actorKind,
    actorContextId,
    action: parsedAction(order, overrides),
    publishedAt: "2026-08-26T11:00:00.000Z",
  };
}

function assertPaidSnapshot(orders, order, expected) {
  const read = orders.findSnapshotForFulfillmentById(order.snapshot.internalId);
  assert.equal(read.status, "found");
  if (read.status !== "found") return;
  assert.deepEqual(read.snapshot, expected);
  assert.equal(read.snapshot.status, "paid");
  assert.equal(read.snapshot.paymentStatus, "succeeded");
}

test("operator authority precedes public-reference resolution and only paid Orders can be admitted", async () => {
  const order = await createOrder();
  let publicReads = 0;
  const orders = {
    findSnapshotForFulfillment(publicReference) {
      publicReads += 1;
      return order.orders.findSnapshotForFulfillment(publicReference);
    },
    findSnapshotForFulfillmentById(internalOrderId) {
      return order.orders.findSnapshotForFulfillmentById(internalOrderId);
    },
  };
  const repository = new LocalMemoryLocalFulfillmentRepository(orders);
  const runtime = createLocalFulfillmentRuntime({
    configuration: { source: "local_fake", runtimeMode: "test" },
    orders,
    repository,
    now: () => "2026-08-26T11:00:00.000Z",
  });

  const unauthorized = commitAuthorizedLocalFulfillmentOperatorAction(runtime, {
    publicOrderReference: order.snapshot.publicReference,
    action: parsedAction(order, { fulfillmentActionId: "fulfillment-unauth-0001" }),
    verifier: { verify: () => null },
  });
  assert.equal(unauthorized.status, "unavailable");
  assert.equal(publicReads, 0);
  assert.equal(repository.getCountsForTests().aggregateCount, 0);

  const authorized = commitAuthorizedLocalFulfillmentOperatorAction(runtime, {
    publicOrderReference: order.snapshot.publicReference,
    action: parsedAction(order, { fulfillmentActionId: "fulfillment-admit-0001" }),
    verifier: { verify: () => ({ actorKind: "operator", actorContextId: "operator-context" }) },
  });
  assert.equal(authorized.status, "committed");
  assert.equal(publicReads, 1);
  if (authorized.status === "committed") assert.equal(authorized.state.status, "photo_review");
  assert.deepEqual(repository.getCountsForTests(), {
    aggregateCount: 1,
    actionBindingCount: 1,
    previewRecordCount: 0,
    revisionRecordCount: 0,
  });
});

test("customer cannot admit Fulfillment and unpaid Orders cannot create state", async () => {
  const paid = await createOrder();
  const repository = new LocalMemoryLocalFulfillmentRepository(paid.orders);
  const customerEntry = commit(repository, paid, { fulfillmentActionId: "fulfillment-customer-0001" }, "customer", "customer-context");
  assert.equal(customerEntry.status, "rejected");
  assert.equal(repository.getCountsForTests().aggregateCount, 0);

  const unpaid = await createOrder({ paid: false, productId: "unpaid-fulfillment" });
  const unpaidRepository = new LocalMemoryLocalFulfillmentRepository(unpaid.orders);
  const unpaidEntry = commit(unpaidRepository, unpaid, { fulfillmentActionId: "fulfillment-unpaid-0001" });
  assert.equal(unpaidEntry.status, "rejected");
  assert.equal(unpaidRepository.getCountsForTests().aggregateCount, 0);
});

test("one aggregate stores the complete valid lifecycle without copying Local Order facts", async () => {
  const order = await createOrder();
  const repository = new LocalMemoryLocalFulfillmentRepository(order.orders, {
    now: () => "2026-08-26T12:00:00.000Z",
  });
  const immutableFacts = structuredClone(order.snapshot);

  assert.equal(commit(repository, order, { fulfillmentActionId: "fulfillment-enter-0001" }).state?.status, "photo_review");
  assert.equal(commit(repository, order, { fulfillmentActionId: "fulfillment-publish-0001", actionKind: "publish_preview" }).state?.status, "preview_pending");
  assert.equal(commit(repository, order, {
    fulfillmentActionId: "fulfillment-revision-0001",
    actionKind: "request_revision",
    expectedPreviewVersion: 1,
    revisionNote: "Adjust lighting",
  }, "customer", "customer-context").state?.status, "preview_revision_requested");
  assert.equal(commit(repository, order, { fulfillmentActionId: "fulfillment-publish-0002", actionKind: "publish_preview" }).state?.currentPreview?.previewVersion, 2);
  assert.equal(commit(repository, order, {
    fulfillmentActionId: "fulfillment-revision-0002",
    actionKind: "request_revision",
    expectedPreviewVersion: 2,
    revisionNote: "Adjust pose",
  }, "customer", "customer-context").state?.revisionRequestsUsed, 2);
  assert.equal(commit(repository, order, { fulfillmentActionId: "fulfillment-publish-0003", actionKind: "publish_preview" }).state?.currentPreview?.previewVersion, 3);
  assert.equal(commit(repository, order, {
    fulfillmentActionId: "fulfillment-approve-0001",
    actionKind: "approve_preview",
    expectedPreviewVersion: 3,
  }, "customer", "customer-context").state?.status, "preview_approved");
  assert.equal(commit(repository, order, { fulfillmentActionId: "fulfillment-start-0001", actionKind: "start_production" }).state?.status, "in_production");
  assert.equal(commit(repository, order, { fulfillmentActionId: "fulfillment-quality-0001", actionKind: "mark_quality_check" }).state?.status, "quality_check");

  const stored = repository.findByOrderIdentity({
    internalOrderId: order.snapshot.internalId,
    publicOrderReference: order.snapshot.publicReference,
  });
  assert.equal(stored.status, "found");
  if (stored.status === "found") {
    assert.deepEqual(Object.keys(stored.aggregate).sort(), [
      "actionBindings",
      "internalOrderId",
      "kind",
      "previewHistory",
      "publicOrderReference",
      "revisionRecords",
      "state",
    ]);
    assert.equal("lines" in stored.aggregate, false);
    assert.equal(stored.aggregate.previewHistory.length, 3);
    assert.equal(stored.aggregate.revisionRecords.length, 2);
    assert.equal(stored.aggregate.actionBindings.length, 9);
    assert.equal(stored.aggregate.state.status, "quality_check");
  }
  assertPaidSnapshot(order.orders, order, immutableFacts);
});

test("exact approval replay returns the original result before new-state validation", async () => {
  const order = await createOrder();
  const repository = new LocalMemoryLocalFulfillmentRepository(order.orders);
  commit(repository, order, { fulfillmentActionId: "fulfillment-enter-approve-0001" });
  commit(repository, order, { fulfillmentActionId: "fulfillment-publish-approve-0001", actionKind: "publish_preview" });
  const input = rawCommitInput(order, {
    fulfillmentActionId: "fulfillment-approve-replay-0001",
    actionKind: "approve_preview",
    expectedPreviewVersion: 1,
  }, "customer", "customer-context");
  const first = repository.commit(input);
  const replay = repository.commit(input);
  assert.equal(first.status, "committed");
  assert.equal(replay.status, "replayed");
  if (first.status === "committed" && replay.status === "replayed") {
    assert.deepEqual(replay.result, first.result);
    assert.equal(replay.result.committedAt, first.result.committedAt);
    assert.equal(replay.state.status, "preview_approved");
  }
  assert.equal(repository.getCountsForTests().actionBindingCount, 3);
});

test("exact revision replay normalizes equivalent notes, ignores current state, and conflicts on a different note", async () => {
  const order = await createOrder();
  const repository = new LocalMemoryLocalFulfillmentRepository(order.orders);
  commit(repository, order, { fulfillmentActionId: "fulfillment-enter-revision-0001" });
  commit(repository, order, { fulfillmentActionId: "fulfillment-publish-revision-0001", actionKind: "publish_preview" });
  const padded = rawCommitInput(order, {
    fulfillmentActionId: "fulfillment-revision-replay-0001",
    actionKind: "request_revision",
    expectedPreviewVersion: 1,
    revisionNote: "  Please adjust the lighting.  ",
  }, "customer", "customer-context");
  const trimmed = rawCommitInput(order, {
    fulfillmentActionId: "fulfillment-revision-replay-0001",
    actionKind: "request_revision",
    expectedPreviewVersion: 1,
    revisionNote: "Please adjust the lighting.",
  }, "customer", "customer-context");
  const first = repository.commit(padded);
  const replay = repository.commit(trimmed);
  assert.equal(first.status, "committed");
  assert.equal(replay.status, "replayed");
  if (replay.status === "replayed") assert.equal(replay.state.status, "preview_revision_requested");

  const differentNote = rawCommitInput(order, {
    fulfillmentActionId: "fulfillment-revision-replay-0001",
    actionKind: "request_revision",
    expectedPreviewVersion: 1,
    revisionNote: "Please change the pose.",
  }, "customer", "customer-context");
  const conflict = repository.commit(differentNote);
  assert.equal(conflict.status, "conflict");
  assert.equal(repository.getCountsForTests().revisionRecordCount, 1);
  assert.equal(repository.getCountsForTests().actionBindingCount, 3);
});

test("exact publication replay returns v2 without deriving v3", async () => {
  const order = await createOrder();
  const repository = new LocalMemoryLocalFulfillmentRepository(order.orders);
  commit(repository, order, { fulfillmentActionId: "fulfillment-enter-publication-0001" });
  commit(repository, order, { fulfillmentActionId: "fulfillment-publish-publication-0001", actionKind: "publish_preview" });
  commit(repository, order, {
    fulfillmentActionId: "fulfillment-revision-publication-0001",
    actionKind: "request_revision",
    expectedPreviewVersion: 1,
  }, "customer", "customer-context");
  const input = rawCommitInput(order, {
    fulfillmentActionId: "fulfillment-publish-replay-0001",
    actionKind: "publish_preview",
  });
  const first = repository.commit(input);
  const replay = repository.commit(input);
  assert.equal(first.status, "committed");
  assert.equal(replay.status, "replayed");
  if (first.status === "committed" && replay.status === "replayed") {
    assert.equal(first.result.currentPreviewVersion, 2);
    assert.equal(replay.result.currentPreviewVersion, 2);
    assert.equal(replay.result.committedAt, first.result.committedAt);
  }
  assert.equal(repository.getCountsForTests().previewRecordCount, 2);
});

test("the same selector cannot cross Orders or change actor, context, action, or version", async () => {
  const firstOrder = await createOrder({ productId: "first-fulfillment" });
  const secondOrder = await createOrder({ productId: "second-fulfillment" });
  const orders = {
    findSnapshotForFulfillment(publicReference) {
      if (publicReference === firstOrder.snapshot.publicReference) {
        return firstOrder.orders.findSnapshotForFulfillment(publicReference);
      }
      return secondOrder.orders.findSnapshotForFulfillment(publicReference);
    },
    findSnapshotForFulfillmentById(internalOrderId) {
      if (internalOrderId === firstOrder.snapshot.internalId) {
        return firstOrder.orders.findSnapshotForFulfillmentById(internalOrderId);
      }
      return secondOrder.orders.findSnapshotForFulfillmentById(internalOrderId);
    },
  };
  const repository = new LocalMemoryLocalFulfillmentRepository(orders);
  commit(repository, firstOrder, { fulfillmentActionId: "fulfillment-collision-enter-0001" });
  commit(repository, firstOrder, { fulfillmentActionId: "fulfillment-collision-publish-0001", actionKind: "publish_preview" });
  const original = rawCommitInput(firstOrder, {
    fulfillmentActionId: "fulfillment-collision-revision-0001",
    actionKind: "request_revision",
    expectedPreviewVersion: 1,
    revisionNote: "Adjust lighting",
  }, "customer", "customer-context");
  assert.equal(repository.commit(original).status, "committed");

  assert.equal(repository.commit(rawCommitInput(firstOrder, {
    fulfillmentActionId: "fulfillment-collision-revision-0001",
    actionKind: "request_revision",
    expectedPreviewVersion: 1,
    revisionNote: "Change pose",
  }, "customer", "customer-context")).status, "conflict");
  assert.equal(repository.commit(rawCommitInput(firstOrder, {
    fulfillmentActionId: "fulfillment-collision-revision-0001",
    actionKind: "request_revision",
    expectedPreviewVersion: 1,
    revisionNote: "Adjust lighting",
  }, "customer", "other-customer")).status, "conflict");
  assert.equal(repository.commit(rawCommitInput(firstOrder, {
    fulfillmentActionId: "fulfillment-collision-revision-0001",
    actionKind: "approve_preview",
    expectedPreviewVersion: 1,
  }, "customer", "customer-context")).status, "conflict");
  assert.equal(repository.commit(rawCommitInput(firstOrder, {
    fulfillmentActionId: "fulfillment-collision-revision-0001",
    actionKind: "request_revision",
    expectedPreviewVersion: 2,
    revisionNote: "Adjust lighting",
  }, "customer", "customer-context")).status, "conflict");
  assert.equal(repository.commit(rawCommitInput(secondOrder, {
    fulfillmentActionId: "fulfillment-collision-revision-0001",
    actionKind: "request_revision",
    expectedPreviewVersion: 1,
    revisionNote: "Adjust lighting",
  }, "customer", "customer-context")).status, "conflict");
  assert.equal(repository.getCountsForTests().revisionRecordCount, 1);
});

test("last revision slot serializes distinct actions and equivalent actions replay once", async () => {
  const order = await createOrder();
  const repository = new LocalMemoryLocalFulfillmentRepository(order.orders);
  commit(repository, order, { fulfillmentActionId: "fulfillment-enter-race-0001" });
  commit(repository, order, { fulfillmentActionId: "fulfillment-publish-race-0001", actionKind: "publish_preview" });
  commit(repository, order, {
    fulfillmentActionId: "fulfillment-revision-race-0001",
    actionKind: "request_revision",
    expectedPreviewVersion: 1,
  }, "customer", "customer-context");
  commit(repository, order, { fulfillmentActionId: "fulfillment-publish-race-0002", actionKind: "publish_preview" });

  const distinct = await Promise.all([
    queuedCommit(repository, rawCommitInput(order, {
      fulfillmentActionId: "fulfillment-revision-race-0002",
      actionKind: "request_revision",
      expectedPreviewVersion: 2,
    }, "customer", "customer-context")),
    queuedCommit(repository, rawCommitInput(order, {
      fulfillmentActionId: "fulfillment-revision-race-0003",
      actionKind: "request_revision",
      expectedPreviewVersion: 2,
    }, "customer", "customer-context")),
  ]);
  assert.equal(distinct.filter((result) => result.status === "committed").length, 1);
  assert.equal(distinct.filter((result) => result.status === "rejected").length, 1);
  const afterDistinct = repository.findByOrderIdentity({ internalOrderId: order.snapshot.internalId, publicOrderReference: order.snapshot.publicReference });
  assert.equal(afterDistinct.status, "found");
  if (afterDistinct.status === "found") assert.equal(afterDistinct.aggregate.state.revisionRequestsUsed, 2);
  assert.equal(repository.getCountsForTests().revisionRecordCount, 2);

  const duplicateOrder = await createOrder({ productId: "equivalent-race-fulfillment" });
  const duplicateRepository = new LocalMemoryLocalFulfillmentRepository(duplicateOrder.orders);
  commit(duplicateRepository, duplicateOrder, { fulfillmentActionId: "fulfillment-enter-equivalent-0001" });
  commit(duplicateRepository, duplicateOrder, { fulfillmentActionId: "fulfillment-publish-equivalent-0001", actionKind: "publish_preview" });
  const equivalentInput = rawCommitInput(duplicateOrder, {
    fulfillmentActionId: "fulfillment-revision-equivalent-0001",
    actionKind: "request_revision",
    expectedPreviewVersion: 1,
  }, "customer", "customer-context");
  const equivalent = await Promise.all([
    queuedCommit(duplicateRepository, equivalentInput),
    queuedCommit(duplicateRepository, equivalentInput),
  ]);
  assert.deepEqual(equivalent.map((result) => result.status).sort(), ["committed", "replayed"]);
  assert.equal(duplicateRepository.getCountsForTests().revisionRecordCount, 1);
});

test("equivalent approval and publication submissions commit once and never create a later version", async () => {
  const approvalOrder = await createOrder({ productId: "approval-race-fulfillment" });
  const approvalRepository = new LocalMemoryLocalFulfillmentRepository(approvalOrder.orders);
  commit(approvalRepository, approvalOrder, { fulfillmentActionId: "fulfillment-enter-approval-race-0001" });
  commit(approvalRepository, approvalOrder, { fulfillmentActionId: "fulfillment-publish-approval-race-0001", actionKind: "publish_preview" });
  const approvalInput = rawCommitInput(approvalOrder, {
    fulfillmentActionId: "fulfillment-approve-race-0001",
    actionKind: "approve_preview",
    expectedPreviewVersion: 1,
  }, "customer", "customer-context");
  const approvals = await Promise.all([
    queuedCommit(approvalRepository, approvalInput),
    queuedCommit(approvalRepository, approvalInput),
  ]);
  assert.deepEqual(approvals.map((result) => result.status).sort(), ["committed", "replayed"]);
  const approved = approvalRepository.findByOrderIdentity({ internalOrderId: approvalOrder.snapshot.internalId, publicOrderReference: approvalOrder.snapshot.publicReference });
  assert.equal(approved.status, "found");
  if (approved.status === "found") assert.equal(approved.aggregate.state.status, "preview_approved");

  const publicationOrder = await createOrder({ productId: "publication-race-fulfillment" });
  const publicationRepository = new LocalMemoryLocalFulfillmentRepository(publicationOrder.orders);
  commit(publicationRepository, publicationOrder, { fulfillmentActionId: "fulfillment-enter-publication-race-0001" });
  commit(publicationRepository, publicationOrder, { fulfillmentActionId: "fulfillment-publish-publication-race-0001", actionKind: "publish_preview" });
  commit(publicationRepository, publicationOrder, {
    fulfillmentActionId: "fulfillment-revision-publication-race-0001",
    actionKind: "request_revision",
    expectedPreviewVersion: 1,
  }, "customer", "customer-context");
  const publicationInput = rawCommitInput(publicationOrder, {
    fulfillmentActionId: "fulfillment-publish-publication-race-0002",
    actionKind: "publish_preview",
  });
  const publications = await Promise.all([
    queuedCommit(publicationRepository, publicationInput),
    queuedCommit(publicationRepository, publicationInput),
  ]);
  assert.deepEqual(publications.map((result) => result.status).sort(), ["committed", "replayed"]);
  assert.equal(publicationRepository.getCountsForTests().previewRecordCount, 2);
});

test("new selectors use the latest Fulfillment state and do not overwrite it", async () => {
  const order = await createOrder();
  const repository = new LocalMemoryLocalFulfillmentRepository(order.orders);
  commit(repository, order, { fulfillmentActionId: "fulfillment-enter-fresh-0001" });
  commit(repository, order, { fulfillmentActionId: "fulfillment-publish-fresh-0001", actionKind: "publish_preview" });
  const approved = commit(repository, order, {
    fulfillmentActionId: "fulfillment-approve-fresh-0001",
    actionKind: "approve_preview",
    expectedPreviewVersion: 1,
  }, "customer", "customer-context");
  assert.equal(approved.status, "committed");
  const staleRevision = commit(repository, order, {
    fulfillmentActionId: "fulfillment-revision-fresh-0001",
    actionKind: "request_revision",
    expectedPreviewVersion: 1,
  }, "customer", "customer-context");
  assert.equal(staleRevision.status, "rejected");
  const current = repository.findByOrderIdentity({ internalOrderId: order.snapshot.internalId, publicOrderReference: order.snapshot.publicReference });
  assert.equal(current.status, "found");
  if (current.status === "found") assert.equal(current.aggregate.state.status, "preview_approved");

  const publicationOrder = await createOrder({ productId: "publication-fresh-fulfillment" });
  const publicationRepository = new LocalMemoryLocalFulfillmentRepository(publicationOrder.orders);
  commit(publicationRepository, publicationOrder, { fulfillmentActionId: "fulfillment-enter-fresh-publish-0001" });
  commit(publicationRepository, publicationOrder, { fulfillmentActionId: "fulfillment-publish-fresh-publish-0001", actionKind: "publish_preview" });
  commit(publicationRepository, publicationOrder, {
    fulfillmentActionId: "fulfillment-revision-fresh-publish-0001",
    actionKind: "request_revision",
    expectedPreviewVersion: 1,
  }, "customer", "customer-context");
  assert.equal(commit(publicationRepository, publicationOrder, { fulfillmentActionId: "fulfillment-publish-fresh-publish-0002", actionKind: "publish_preview" }).status, "committed");
  assert.equal(commit(publicationRepository, publicationOrder, { fulfillmentActionId: "fulfillment-publish-fresh-publish-0003", actionKind: "publish_preview" }).status, "rejected");
  const publicationCurrent = publicationRepository.findByOrderIdentity({ internalOrderId: publicationOrder.snapshot.internalId, publicOrderReference: publicationOrder.snapshot.publicReference });
  assert.equal(publicationCurrent.status, "found");
  if (publicationCurrent.status === "found") {
    assert.equal(publicationCurrent.aggregate.state.currentPreview?.previewVersion, 2);
    assert.equal(publicationCurrent.aggregate.previewHistory.length, 2);
  }
});

test("canonical Order is freshly checked for new actions but exact replay returns after payment becomes ineligible", async () => {
  const order = await createOrder();
  let currentSnapshot = order.snapshot;
  const orders = {
    findSnapshotForFulfillment(publicReference) {
      return publicReference === currentSnapshot.publicReference ? { status: "found", snapshot: structuredClone(currentSnapshot) } : { status: "unavailable" };
    },
    findSnapshotForFulfillmentById(internalOrderId) {
      return internalOrderId === currentSnapshot.internalId ? { status: "found", snapshot: structuredClone(currentSnapshot) } : { status: "unavailable" };
    },
  };
  const repository = new LocalMemoryLocalFulfillmentRepository(orders);
  const entry = rawCommitInput(order, { fulfillmentActionId: "fulfillment-fresh-order-0001" });
  assert.equal(repository.commit(entry).status, "committed");

  currentSnapshot = replaceLocalOrderLifecycle(currentSnapshot, { status: "payment_failed", paymentStatus: "failed" });
  assert.equal(repository.commit(entry).status, "replayed");
  const newAction = rawCommitInput(order, { fulfillmentActionId: "fulfillment-fresh-order-0002", actionKind: "publish_preview" });
  const rejected = repository.commit(newAction);
  assert.equal(rejected.status, "rejected");
  assert.equal(repository.getCountsForTests().actionBindingCount, 1);
});

test("failure before the single Map.set leaves every aggregate component unchanged and retry succeeds", async () => {
  const order = await createOrder();
  const failure = { enabled: true };
  const repository = new LocalMemoryLocalFulfillmentRepository(order.orders, {
    failureInjector: { beforeCommit: () => { if (failure.enabled) throw new Error("injected"); } },
  });
  const beforeOrder = structuredClone(order.snapshot);
  const failed = commit(repository, order, { fulfillmentActionId: "fulfillment-atomic-enter-0001" });
  assert.equal(failed.status, "failed");
  assert.deepEqual(repository.getCountsForTests(), {
    aggregateCount: 0,
    actionBindingCount: 0,
    previewRecordCount: 0,
    revisionRecordCount: 0,
  });
  assert.equal(repository.findByOrderIdentity({ internalOrderId: order.snapshot.internalId, publicOrderReference: order.snapshot.publicReference }).status, "unavailable");
  assertPaidSnapshot(order.orders, order, beforeOrder);

  failure.enabled = false;
  const retry = commit(repository, order, { fulfillmentActionId: "fulfillment-atomic-enter-0001" });
  assert.equal(retry.status, "committed");
  assert.equal(repository.getCountsForTests().aggregateCount, 1);
  assertPaidSnapshot(order.orders, order, beforeOrder);
});

test("failure on an existing aggregate rolls back preview, revision, history, and binding state", async () => {
  const order = await createOrder({ productId: "fulfillment-rollback-existing" });
  const failure = { enabled: false };
  const repository = new LocalMemoryLocalFulfillmentRepository(order.orders, {
    failureInjector: { beforeCommit: () => { if (failure.enabled) throw new Error("injected"); } },
  });
  assert.equal(commit(repository, order, { fulfillmentActionId: "fulfillment-rollback-enter-0001" }).status, "committed");
  assert.equal(commit(repository, order, { fulfillmentActionId: "fulfillment-rollback-publish-0001", actionKind: "publish_preview" }).status, "committed");
  const before = repository.findByOrderIdentity({
    internalOrderId: order.snapshot.internalId,
    publicOrderReference: order.snapshot.publicReference,
  });
  assert.equal(before.status, "found");
  if (before.status !== "found") return;

  failure.enabled = true;
  const failed = commit(repository, order, {
    fulfillmentActionId: "fulfillment-rollback-revision-0001",
    actionKind: "request_revision",
    expectedPreviewVersion: 1,
  }, "customer", "customer-context");
  assert.equal(failed.status, "failed");
  const afterFailure = repository.findByOrderIdentity({
    internalOrderId: order.snapshot.internalId,
    publicOrderReference: order.snapshot.publicReference,
  });
  assert.equal(afterFailure.status, "found");
  if (afterFailure.status === "found") {
    assert.deepEqual(afterFailure.aggregate, before.aggregate);
    assert.equal(afterFailure.aggregate.state.status, "preview_pending");
    assert.equal(afterFailure.aggregate.state.currentPreview?.previewVersion, 1);
    assert.equal(afterFailure.aggregate.state.revisionRequestsUsed, 0);
    assert.equal(afterFailure.aggregate.previewHistory.length, 1);
    assert.equal(afterFailure.aggregate.revisionRecords.length, 0);
    assert.equal(afterFailure.aggregate.actionBindings.length, 2);
  }

  failure.enabled = false;
  const retry = commit(repository, order, {
    fulfillmentActionId: "fulfillment-rollback-revision-0001",
    actionKind: "request_revision",
    expectedPreviewVersion: 1,
  }, "customer", "customer-context");
  assert.equal(retry.status, "committed");
  assert.equal(repository.getCountsForTests().revisionRecordCount, 1);
});

test("fresh repository instances lose Fulfillment state and shared runtime reuses one canonical instance", async () => {
  const order = await createOrder();
  const first = new LocalMemoryLocalFulfillmentRepository(order.orders);
  assert.equal(commit(first, order, { fulfillmentActionId: "fulfillment-restart-0001" }).status, "committed");
  const restarted = new LocalMemoryLocalFulfillmentRepository(order.orders);
  assert.equal(restarted.findByOrderIdentity({ internalOrderId: order.snapshot.internalId, publicOrderReference: order.snapshot.publicReference }).status, "unavailable");
  assert.equal(restarted.getCountsForTests().aggregateCount, 0);

  resetSharedLocalFulfillmentRuntimeForTests();
  const sharedA = getSharedLocalFulfillmentRepository();
  const sharedB = getSharedLocalFulfillmentRepository();
  assert.strictEqual(sharedA, sharedB);
  assert.strictEqual(getSharedLocalFulfillmentRuntime().repository, sharedA);
  resetSharedLocalFulfillmentRuntimeForTests();
  assert.notStrictEqual(getSharedLocalFulfillmentRepository(), sharedA);
});

test("Batch B implementation remains local and provider-stopped", async () => {
  const paths = [
    "../app/application/local-fulfillment-repository.ts",
    "../app/infrastructure/local-fulfillment/local-memory-local-fulfillment-repository.server.ts",
    "../app/server/local-fulfillment-runtime.server.ts",
  ];
  const source = (await Promise.all(paths.map((path) => readFile(new URL(path, import.meta.url), "utf8")))).join("\n");
  assert.doesNotMatch(source, /\b(?:supabase|stripe|paypal|resend|17track|cloudflare|fetch|SQL|migration|storage|supplier|factory|erp|shipping|tracking|webhook)\b/i);
  assert.doesNotMatch(source, /(?:localStorage|sessionStorage|indexedDB|document\.cookie|password|secret|token)/i);
});
