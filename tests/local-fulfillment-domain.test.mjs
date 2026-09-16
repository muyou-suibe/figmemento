import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLocalFulfillmentReplayRequest,
  createLocalFulfillmentState,
  deriveNextLocalFulfillmentPreviewVersion,
  evaluateLocalFulfillmentTransition,
  isExactLocalFulfillmentReplay,
  isLocalFulfillmentActionId,
  parseLocalFulfillmentActionInput,
  projectLocalFulfillmentState,
} from "../app/domain/local-fulfillment.ts";

const publicOrderReference = "FM-LOCAL-ABCDEF0123456789";
const internalOrderId = "order-local-fulfillment-1";

function action(overrides = {}) {
  return {
    publicOrderReference,
    fulfillmentActionId: "fulfillment-action-0001",
    actionKind: "enter_photo_review",
    ...overrides,
  };
}

function parsed(input) {
  const result = parseLocalFulfillmentActionInput(input);
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("test action should parse");
  return result.value;
}

function state(status, { previewVersion = null, revisionRequestsUsed = 0 } = {}) {
  return createLocalFulfillmentState({
    internalOrderId,
    publicOrderReference,
    status,
    currentPreview: previewVersion === null ? null : {
      kind: "local_fulfillment_preview",
      previewVersion,
      displayLabel: "Development/test preview placeholder",
      publishedAt: `2026-08-26T0${previewVersion}:00:00.000Z`,
      developmentOnly: true,
    },
    revisionRequestsUsed,
    createdAt: "2026-08-26T10:00:00.000Z",
    updatedAt: "2026-08-26T10:00:00.000Z",
  });
}

function transition(input) {
  const result = evaluateLocalFulfillmentTransition(input);
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("test transition should succeed");
  return result.value;
}

test("Fulfillment action parser keeps action identity bounded and separates actor authority", () => {
  assert.equal(isLocalFulfillmentActionId("fulfillment-action-0001"), true);
  assert.equal(isLocalFulfillmentActionId(publicOrderReference), false);
  assert.equal(isLocalFulfillmentActionId("2026-08-26T10-00-00.000Z"), false);
  assert.equal(isLocalFulfillmentActionId("buyer@example.test"), false);

  assert.deepEqual(parsed(action()), action());
  assert.deepEqual(parsed(action({
    fulfillmentActionId: "fulfillment-action-0002",
    actionKind: "request_revision",
    expectedPreviewVersion: 1,
    revisionNote: "  Please adjust the lighting.  ",
  })), {
    publicOrderReference,
    fulfillmentActionId: "fulfillment-action-0002",
    actionKind: "request_revision",
    expectedPreviewVersion: 1,
    revisionNote: "Please adjust the lighting.",
  });

  for (const forbidden of [
    { actorKind: "operator" },
    { authorityContext: "operator-context" },
    { capability: "browser-capability" },
    { paid: true },
    { paymentStatus: "succeeded" },
    { fulfillmentStatus: "in_production" },
    { previewStatus: "preview_pending" },
    { previewVersion: 3 },
    { revisionRequestsUsed: 2 },
    { internalOrderId },
    { ownerId: "owner" },
    { receiptId: "receipt" },
    { storageKey: "private/key" },
    { providerPath: "provider/path" },
    { shippingStatus: "shipped" },
    { trackingNumber: "TRACK-1" },
    { targetState: "in_production" },
    { unknown: true },
  ]) {
    const result = parseLocalFulfillmentActionInput({ ...action(), ...forbidden });
    assert.equal(result.ok, false, JSON.stringify(forbidden));
  }

  assert.equal(parseLocalFulfillmentActionInput(action({ actionKind: "ship" })).ok, false);
  assert.equal(parseLocalFulfillmentActionInput(action({ actionKind: "refund" })).ok, false);
  assert.equal(parseLocalFulfillmentActionInput(action({ actionKind: "publish_preview", expectedPreviewVersion: 1 })).ok, false);
  assert.equal(parseLocalFulfillmentActionInput(action({ actionKind: "enter_photo_review", revisionNote: "not allowed" })).ok, false);
  assert.equal(parseLocalFulfillmentActionInput(action({
    actionKind: "request_revision",
    expectedPreviewVersion: 1,
    revisionNote: "x".repeat(501),
  })).ok, false);
});

test("only an operator can admit a paid canonical Order to Photo Review", () => {
  const input = { current: null, action: parsed(action()), orderPayment: { orderStatus: "paid", paymentStatus: "succeeded" } };
  assert.deepEqual(transition({ ...input, actorKind: "operator" }), {
    nextStatus: "photo_review",
    nextPreview: null,
    revisionRequestsUsed: 0,
  });

  for (const orderPayment of [
    { orderStatus: "pending_payment", paymentStatus: "pending" },
    { orderStatus: "payment_failed", paymentStatus: "failed" },
    { orderStatus: "paid", paymentStatus: "pending" },
  ]) {
    const result = evaluateLocalFulfillmentTransition({ ...input, actorKind: "operator", orderPayment });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.issues[0].code, "invalid_order_state");
  }

  const customer = evaluateLocalFulfillmentTransition({ ...input, actorKind: "customer" });
  assert.equal(customer.ok, false);
  if (!customer.ok) assert.equal(customer.issues[0].code, "invalid_actor");
});

test("pure lifecycle contract allows only the approved path and rejects skips/backward/shipping transitions", () => {
  const review = state("photo_review");
  const previewPending = state("preview_pending", { previewVersion: 1 });
  const revisionRequested = state("preview_revision_requested", { previewVersion: 1, revisionRequestsUsed: 1 });
  const approved = state("preview_approved", { previewVersion: 1 });
  const production = state("in_production", { previewVersion: 1 });
  const quality = state("quality_check", { previewVersion: 1 });

  assert.equal(evaluateLocalFulfillmentTransition({
    current: review,
    actorKind: "operator",
    action: parsed(action({ actionKind: "publish_preview" })),
    publishedAt: "2026-08-26T11:00:00.000Z",
  }).ok, true);
  assert.equal(evaluateLocalFulfillmentTransition({
    current: previewPending,
    actorKind: "customer",
    action: parsed(action({ actionKind: "approve_preview", expectedPreviewVersion: 1 })),
  }).ok, true);
  assert.equal(evaluateLocalFulfillmentTransition({
    current: previewPending,
    actorKind: "customer",
    action: parsed(action({ actionKind: "request_revision", expectedPreviewVersion: 1 })),
  }).ok, true);
  assert.equal(evaluateLocalFulfillmentTransition({
    current: revisionRequested,
    actorKind: "operator",
    action: parsed(action({ actionKind: "publish_preview" })),
    publishedAt: "2026-08-26T12:00:00.000Z",
  }).ok, true);
  assert.equal(evaluateLocalFulfillmentTransition({
    current: approved,
    actorKind: "operator",
    action: parsed(action({ actionKind: "start_production" })),
  }).ok, true);
  assert.equal(evaluateLocalFulfillmentTransition({
    current: production,
    actorKind: "operator",
    action: parsed(action({ actionKind: "mark_quality_check" })),
  }).ok, true);

  const invalid = [
    [review, "customer", "publish_preview"],
    [previewPending, "operator", "approve_preview", 1],
    [previewPending, "customer", "start_production"],
    [review, "operator", "start_production"],
    [previewPending, "operator", "mark_quality_check"],
    [approved, "operator", "publish_preview"],
    [production, "customer", "request_revision", 1],
    [quality, "operator", "mark_quality_check"],
  ];
  for (const [current, actorKind, actionKind, expectedPreviewVersion] of invalid) {
    const input = {
      current,
      actorKind,
      action: parsed(action({
        actionKind,
        ...(expectedPreviewVersion === undefined ? {} : { expectedPreviewVersion }),
      })),
    };
    const result = evaluateLocalFulfillmentTransition(input);
    assert.equal(result.ok, false, `${actorKind} ${actionKind} from ${current.status}`);
  }
});

test("preview publication generates only v1, v2, and v3 and revision requests do not publish", () => {
  const v1 = transition({
    current: state("photo_review"),
    actorKind: "operator",
    action: parsed(action({ actionKind: "publish_preview" })),
    publishedAt: "2026-08-26T11:00:00.000Z",
  });
  assert.equal(v1.nextPreview?.previewVersion, 1);
  assert.equal(v1.revisionRequestsUsed, 0);

  const revision1 = transition({
    current: state("preview_pending", { previewVersion: 1 }),
    actorKind: "customer",
    action: parsed(action({ actionKind: "request_revision", expectedPreviewVersion: 1 })),
  });
  assert.equal(revision1.nextStatus, "preview_revision_requested");
  assert.equal(revision1.nextPreview?.previewVersion, 1);
  assert.equal(revision1.revisionRequestsUsed, 1);

  const v2 = transition({
    current: state("preview_revision_requested", { previewVersion: 1, revisionRequestsUsed: 1 }),
    actorKind: "operator",
    action: parsed(action({ actionKind: "publish_preview" })),
    publishedAt: "2026-08-26T12:00:00.000Z",
  });
  assert.equal(v2.nextPreview?.previewVersion, 2);

  const revision2 = transition({
    current: state("preview_pending", { previewVersion: 2, revisionRequestsUsed: 1 }),
    actorKind: "customer",
    action: parsed(action({ actionKind: "request_revision", expectedPreviewVersion: 2 })),
  });
  assert.equal(revision2.revisionRequestsUsed, 2);
  assert.equal(revision2.nextPreview?.previewVersion, 2);

  const v3 = transition({
    current: state("preview_revision_requested", { previewVersion: 2, revisionRequestsUsed: 2 }),
    actorKind: "operator",
    action: parsed(action({ actionKind: "publish_preview" })),
    publishedAt: "2026-08-26T13:00:00.000Z",
  });
  assert.equal(v3.nextPreview?.previewVersion, 3);
  assert.equal(deriveNextLocalFulfillmentPreviewVersion(state("preview_revision_requested", { previewVersion: 3, revisionRequestsUsed: 2 })).ok, false);

  const third = evaluateLocalFulfillmentTransition({
    current: state("preview_pending", { previewVersion: 3, revisionRequestsUsed: 2 }),
    actorKind: "customer",
    action: parsed(action({ actionKind: "request_revision", expectedPreviewVersion: 3 })),
  });
  assert.equal(third.ok, false);
  if (!third.ok) assert.equal(third.issues[0].code, "revision_limit");
});

test("expected preview version is an optimistic guard and stale actions conflict", () => {
  const result = evaluateLocalFulfillmentTransition({
    current: state("preview_pending", { previewVersion: 2, revisionRequestsUsed: 1 }),
    actorKind: "customer",
    action: parsed(action({ actionKind: "approve_preview", expectedPreviewVersion: 1 })),
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.issues[0].code, "stale_preview_version");
});

test("replay matcher compares actor, canonical identity, action, version, and normalized input but ignores post-transition state", () => {
  const request = buildLocalFulfillmentReplayRequest({
    internalOrderId,
    actorKind: "customer",
    actorContextId: "customer-context",
    action: parsed(action({ actionKind: "approve_preview", expectedPreviewVersion: 2 })),
  });
  assert.equal(request.ok, true);
  if (!request.ok) return;
  const binding = {
    request: request.value,
    committedFrom: { status: "preview_pending", previewVersion: 2, revisionRequestsUsed: 1 },
    result: {
      kind: "local_fulfillment_action_result",
      publicOrderReference,
      status: "preview_approved",
      currentPreviewVersion: 2,
      revisionRequestsUsed: 1,
      committedAt: "2026-08-26T14:00:00.000Z",
      notice: "Development/test Fulfillment only.",
    },
  };
  assert.equal(isExactLocalFulfillmentReplay(request.value, binding), true);
  assert.equal(isExactLocalFulfillmentReplay(request.value, {
    ...binding,
    committedFrom: { status: "preview_approved", previewVersion: 2, revisionRequestsUsed: 1 },
  }), true);

  for (const changed of [
    { internalOrderId: "other-order" },
    { publicOrderReference: "FM-LOCAL-0123456789ABCDEF" },
    { fulfillmentActionId: "fulfillment-action-0002" },
    { actorKind: "operator" },
    { actorContextId: "other-context" },
    { actionKind: "request_revision" },
    { expectedPreviewVersion: 1 },
  ]) {
    assert.equal(isExactLocalFulfillmentReplay({ ...request.value, ...changed }, binding), false, JSON.stringify(changed));
  }
});

test("exact revision replay uses normalized notes and ignores the post-transition committedFrom state", () => {
  const padded = parseLocalFulfillmentActionInput(action({
    fulfillmentActionId: "fulfillment-revision-0001",
    actionKind: "request_revision",
    expectedPreviewVersion: 1,
    revisionNote: "  Please adjust the lighting.  ",
  }));
  const trimmed = parseLocalFulfillmentActionInput(action({
    fulfillmentActionId: "fulfillment-revision-0001",
    actionKind: "request_revision",
    expectedPreviewVersion: 1,
    revisionNote: "Please adjust the lighting.",
  }));
  assert.equal(padded.ok, true);
  assert.equal(trimmed.ok, true);
  if (!padded.ok || !trimmed.ok) return;

  const paddedRequest = buildLocalFulfillmentReplayRequest({
    internalOrderId,
    actorKind: "customer",
    actorContextId: "customer-context",
    action: padded.value,
  });
  const trimmedRequest = buildLocalFulfillmentReplayRequest({
    internalOrderId,
    actorKind: "customer",
    actorContextId: "customer-context",
    action: trimmed.value,
  });
  assert.equal(paddedRequest.ok, true);
  assert.equal(trimmedRequest.ok, true);
  if (!paddedRequest.ok || !trimmedRequest.ok) return;
  assert.equal(paddedRequest.value.normalizedRevisionNote, "Please adjust the lighting.");

  const binding = {
    request: paddedRequest.value,
    committedFrom: { status: "preview_pending", previewVersion: 1, revisionRequestsUsed: 0 },
    result: {
      kind: "local_fulfillment_action_result",
      publicOrderReference,
      status: "preview_revision_requested",
      currentPreviewVersion: 1,
      revisionRequestsUsed: 1,
      committedAt: "2026-08-26T14:00:00.000Z",
      notice: "Development/test Fulfillment only.",
    },
  };

  assert.equal(isExactLocalFulfillmentReplay(trimmedRequest.value, binding), true);
  assert.equal(isExactLocalFulfillmentReplay(trimmedRequest.value, {
    ...binding,
    committedFrom: { status: "preview_revision_requested", previewVersion: 1, revisionRequestsUsed: 1 },
  }), true);

  const differentNote = buildLocalFulfillmentReplayRequest({
    internalOrderId,
    actorKind: "customer",
    actorContextId: "customer-context",
    action: parsed(action({
      fulfillmentActionId: "fulfillment-revision-0001",
      actionKind: "request_revision",
      expectedPreviewVersion: 1,
      revisionNote: "Please change the pose.",
    })),
  });
  assert.equal(differentNote.ok, true);
  if (differentNote.ok) assert.equal(isExactLocalFulfillmentReplay(differentNote.value, binding), false);
});

test("exact publication replay keeps the committed v2 result and ignores post-publication state", () => {
  const publication = buildLocalFulfillmentReplayRequest({
    internalOrderId,
    actorKind: "operator",
    actorContextId: "operator-context",
    action: parsed(action({
      fulfillmentActionId: "fulfillment-publish-0001",
      actionKind: "publish_preview",
    })),
  });
  assert.equal(publication.ok, true);
  if (!publication.ok) return;

  const binding = {
    request: publication.value,
    committedFrom: { status: "preview_revision_requested", previewVersion: 1, revisionRequestsUsed: 1 },
    result: {
      kind: "local_fulfillment_action_result",
      publicOrderReference,
      status: "preview_pending",
      currentPreviewVersion: 2,
      revisionRequestsUsed: 1,
      committedAt: "2026-08-26T15:00:00.000Z",
      notice: "Development/test Fulfillment only.",
    },
  };

  assert.equal(isExactLocalFulfillmentReplay(publication.value, binding), true);
  assert.equal(isExactLocalFulfillmentReplay(publication.value, {
    ...binding,
    committedFrom: { status: "preview_pending", previewVersion: 2, revisionRequestsUsed: 1 },
  }), true);

  for (const changed of [
    { actorContextId: "other-operator" },
    { internalOrderId: "other-order" },
    { actionKind: "start_production" },
  ]) {
    assert.equal(isExactLocalFulfillmentReplay({ ...publication.value, ...changed }, binding), false, JSON.stringify(changed));
  }
});

test("customer/operator projections are safe and reads of missing state do not create anything", () => {
  const current = state("preview_pending", { previewVersion: 2, revisionRequestsUsed: 1 });
  const before = JSON.stringify(current);
  const customer = projectLocalFulfillmentState(current, "customer");
  assert.equal(customer.status, "found");
  if (customer.status === "found") {
    assert.deepEqual(customer.value.allowedActions, ["approve_preview", "request_revision"]);
    assert.equal(customer.value.revisionRequestsRemaining, 1);
    assert.equal("internalOrderId" in customer.value, false);
    assert.doesNotMatch(JSON.stringify(customer.value), /ownerId|receiptId|storageKey|provider|secret|upload/i);
  }
  const operator = projectLocalFulfillmentState(current, "operator");
  assert.equal(operator.status, "found");
  if (operator.status === "found") assert.deepEqual(operator.value.allowedActions, []);
  assert.equal(JSON.stringify(current), before);

  const missing = projectLocalFulfillmentState(null, "customer");
  assert.equal(missing.status, "unavailable");
  if (missing.status === "unavailable") assert.equal(missing.issues[0].code, "unavailable");
});
