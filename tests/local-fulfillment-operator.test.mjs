import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { LocalMemoryLocalOrderRepository } from "../app/infrastructure/local-order/local-memory-local-order-repository.server.ts";
import { LocalMemoryLocalPaymentRepository } from "../app/infrastructure/local-payment/local-memory-local-payment-repository.server.ts";
import { LocalMemoryLocalFulfillmentRepository } from "../app/infrastructure/local-fulfillment/local-memory-local-fulfillment-repository.server.ts";
import { parseLocalFulfillmentActionInput } from "../app/domain/local-fulfillment.ts";
import { LocalFulfillmentOperatorService } from "../app/application/local-fulfillment-operator-service.ts";
import { createLocalFulfillmentOperatorHttpHandler } from "../app/server/local-fulfillment-operator-http.server.ts";
import { createLocalFulfillmentRuntime } from "../app/server/local-fulfillment-runtime.server.ts";

let sequence = 1;

function draft() {
  return {
    contact: {
      email: "operator@example.test",
      firstName: "Operator",
      lastName: "Tester",
      country: "US",
      city: "Austin",
      addressLine1: "1 Main Street",
      postalCode: "78701",
    },
    commercial: {
      currency: "USD",
      subtotalCents: 8990,
      shipping: { status: "eligible", country: "US", method: "local_standard", amountCents: 900, currency: "USD", estimatedRange: "5-10 business days", developmentOnly: true },
      coupon: { status: "not_selected", discountCents: 0, developmentOnly: true },
      tax: { status: "not_activated", amountCents: null },
      localArithmeticTotalCents: 9890,
      developmentOnly: true,
    },
    lines: [{ productId: "operator-product", productName: "Operator Gift", productSlug: "operator-gift", variantId: "operator-variant", skuCode: "OPERATOR-GIFT", selectedOptions: [], quantity: 1, unitBasePriceCents: 8990, currency: "USD", lineSubtotalCents: 8990 }],
  };
}

async function fixture({ paid = true } = {}) {
  const orders = new LocalMemoryLocalOrderRepository({ now: () => "2026-08-26T14:00:00.000Z" });
  const created = await orders.findOrCreate({
    creationAttemptId: `123e4567-e89b-42d3-a456-42661417${String(sequence++).padStart(4, "0")}`,
    context: { cartId: "operator-cart", authorityKey: "operator-test" },
    inputFingerprint: `operator-fingerprint-${sequence}`,
    snapshot: draft(),
  });
  assert.equal(created.status, "created");
  if (!paid) return { orders, order: created.snapshot };
  const payment = new LocalMemoryLocalPaymentRepository(orders, { now: () => "2026-08-26T14:01:00.000Z" }).commit({
    internalOrderId: created.snapshot.internalId,
    orderReference: created.snapshot.publicReference,
    paymentAttemptId: `operator-payment-${sequence++}`,
    outcome: "success",
    authorityContext: "operator-payment-test",
  });
  assert.equal(payment.status, "committed");
  return { orders, order: payment.orderSnapshot };
}

function action(order, overrides = {}) {
  const parsed = parseLocalFulfillmentActionInput({
    publicOrderReference: order.publicReference,
    fulfillmentActionId: "operator-http-action-0001",
    actionKind: "enter_photo_review",
    ...overrides,
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) throw new Error("operator action should parse");
  return parsed.value;
}

function request(reference, method, body, headers = {}) {
  return new Request(`http://localhost:3000/api/local-fulfillment/operator/${reference}`, {
    method,
    headers: {
      origin: "http://localhost:3000",
      "sec-fetch-site": "same-origin",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function handlerFor(fixtureValue, verifier) {
  const repository = new LocalMemoryLocalFulfillmentRepository(fixtureValue.orders);
  const runtime = createLocalFulfillmentRuntime({
    configuration: { source: "local_fake", runtimeMode: "test" },
    orders: fixtureValue.orders,
    repository,
    now: () => "2026-08-26T14:02:00.000Z",
  });
  const service = new LocalFulfillmentOperatorService({ runtime, verifier });
  return { repository, runtime, handler: createLocalFulfillmentOperatorHttpHandler({ createService: () => service }) };
}

const authorized = { verify: () => ({ actorKind: "operator", actorContextId: "operator-test-context" }) };

test("operator runtime enablement is not authority and unauthorized requests stop before Order lookup", async () => {
  const fixtureValue = await fixture();
  let publicReads = 0;
  const orders = {
    findSnapshotForFulfillment(reference) { publicReads += 1; return fixtureValue.orders.findSnapshotForFulfillment(reference); },
    findSnapshotForFulfillmentById(id) { return fixtureValue.orders.findSnapshotForFulfillmentById(id); },
  };
  const repository = new LocalMemoryLocalFulfillmentRepository(orders);
  const runtime = createLocalFulfillmentRuntime({ configuration: { source: "local_fake", runtimeMode: "test" }, orders, repository });
  const service = new LocalFulfillmentOperatorService({ runtime, verifier: undefined });
  const handler = createLocalFulfillmentOperatorHttpHandler({ createService: () => service });
  const response = await handler(request(fixtureValue.order.publicReference, "POST", { fulfillmentActionId: "operator-unauth-0001", actionKind: "enter_photo_review" }), fixtureValue.order.publicReference);
  assert.equal(response.status, 404);
  assert.equal(publicReads, 0);
  assert.equal(repository.getCountsForTests().aggregateCount, 0);
});

test("authorized operator needs no customer capability and can enter paid Photo Review", async () => {
  const fixtureValue = await fixture();
  const runtime = handlerFor(fixtureValue, authorized);
  const response = await runtime.handler(request(fixtureValue.order.publicReference, "POST", { fulfillmentActionId: "operator-enter-0001", actionKind: "enter_photo_review" }), fixtureValue.order.publicReference);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, "committed");
  assert.equal(body.fulfillment.status, "photo_review");
  assert.doesNotMatch(JSON.stringify(body), /internalOrderId|actorContextId|capability|actionBindings|ownerId|storageKey|provider/i);
  const read = await runtime.handler(request(fixtureValue.order.publicReference, "GET"), fixtureValue.order.publicReference);
  assert.equal(read.status, 200);
  const projection = await read.json();
  assert.equal(projection.status, "photo_review");
  assert.doesNotMatch(JSON.stringify(projection), /internalOrderId|actorContextId|capability|actionBindings|ownerId|storageKey|provider/i);
});

test("operator cannot admit an unpaid Order", async () => {
  const fixtureValue = await fixture({ paid: false });
  const runtime = handlerFor(fixtureValue, authorized);
  const response = await runtime.handler(request(fixtureValue.order.publicReference, "POST", { fulfillmentActionId: "operator-unpaid-0001", actionKind: "enter_photo_review" }), fixtureValue.order.publicReference);
  assert.equal(response.status, 409);
  assert.equal(runtime.repository.getCountsForTests().aggregateCount, 0);
});

test("operator lifecycle uses server-derived actions and exact replay", async () => {
  const fixtureValue = await fixture();
  const runtime = handlerFor(fixtureValue, authorized);
  const reference = fixtureValue.order.publicReference;
  const enter = await runtime.handler(request(reference, "POST", { fulfillmentActionId: "operator-enter-0002", actionKind: "enter_photo_review" }), reference);
  const enterReplay = await runtime.handler(request(reference, "POST", { fulfillmentActionId: "operator-enter-0002", actionKind: "enter_photo_review" }), reference);
  const publish = await runtime.handler(request(reference, "POST", { fulfillmentActionId: "operator-publish-0001", actionKind: "publish_preview" }), reference);
  const publishReplay = await runtime.handler(request(reference, "POST", { fulfillmentActionId: "operator-publish-0001", actionKind: "publish_preview" }), reference);
  assert.equal(enter.status, 200);
  assert.equal((await enterReplay.json()).status, "replayed");
  assert.equal(publish.status, 200);
  assert.equal((await publish.json()).fulfillment.currentPreviewVersion, 1);
  assert.equal(publishReplay.status, 200);
  const replayBody = await publishReplay.json();
  assert.equal(replayBody.status, "replayed");
  assert.equal(replayBody.fulfillment.currentPreviewVersion, 1);
});

test("operator publishes v2 and v3 with exact publication replay, without browser version input", async () => {
  const fixtureValue = await fixture();
  const runtime = handlerFor(fixtureValue, authorized);
  const reference = fixtureValue.order.publicReference;
  await runtime.handler(request(reference, "POST", { fulfillmentActionId: "operator-v123-enter", actionKind: "enter_photo_review" }), reference);
  await runtime.handler(request(reference, "POST", { fulfillmentActionId: "operator-v123-publish-v1", actionKind: "publish_preview" }), reference);
  const revisionOne = runtime.repository.commit({
    internalOrderId: fixtureValue.order.internalId,
    orderReference: reference,
    actorKind: "customer",
    actorContextId: "customer-v123-context",
    action: action(fixtureValue.order, { fulfillmentActionId: "customer-v123-revision-1", actionKind: "request_revision", expectedPreviewVersion: 1, revisionNote: "Adjust the light." }),
  });
  assert.equal(revisionOne.status, "committed");
  const v2 = await runtime.handler(request(reference, "POST", { fulfillmentActionId: "operator-v123-publish-v2", actionKind: "publish_preview" }), reference);
  const v2Replay = await runtime.handler(request(reference, "POST", { fulfillmentActionId: "operator-v123-publish-v2", actionKind: "publish_preview" }), reference);
  assert.equal((await v2.json()).fulfillment.currentPreviewVersion, 2);
  assert.equal((await v2Replay.json()).fulfillment.currentPreviewVersion, 2);

  const revisionTwo = runtime.repository.commit({
    internalOrderId: fixtureValue.order.internalId,
    orderReference: reference,
    actorKind: "customer",
    actorContextId: "customer-v123-context",
    action: action(fixtureValue.order, { fulfillmentActionId: "customer-v123-revision-2", actionKind: "request_revision", expectedPreviewVersion: 2, revisionNote: "Adjust the crop." }),
  });
  assert.equal(revisionTwo.status, "committed");
  const v3 = await runtime.handler(request(reference, "POST", { fulfillmentActionId: "operator-v123-publish-v3", actionKind: "publish_preview" }), reference);
  const v3Replay = await runtime.handler(request(reference, "POST", { fulfillmentActionId: "operator-v123-publish-v3", actionKind: "publish_preview" }), reference);
  assert.equal((await v3.json()).fulfillment.currentPreviewVersion, 3);
  const v3ReplayBody = await v3Replay.json();
  assert.equal(v3ReplayBody.status, "replayed");
  assert.equal(v3ReplayBody.fulfillment.currentPreviewVersion, 3);
});

test("production requires customer approval and Quality Check is terminal", async () => {
  const fixtureValue = await fixture();
  const runtime = handlerFor(fixtureValue, authorized);
  const reference = fixtureValue.order.publicReference;
  await runtime.handler(request(reference, "POST", { fulfillmentActionId: "operator-enter-0003", actionKind: "enter_photo_review" }), reference);
  await runtime.handler(request(reference, "POST", { fulfillmentActionId: "operator-publish-0003", actionKind: "publish_preview" }), reference);
  const beforeApproval = await runtime.handler(request(reference, "POST", { fulfillmentActionId: "operator-start-before-0001", actionKind: "start_production" }), reference);
  assert.equal(beforeApproval.status, 409);

  const approved = runtime.repository.commit({
    internalOrderId: fixtureValue.order.internalId,
    orderReference: reference,
    actorKind: "customer",
    actorContextId: "customer-test-context",
    action: action(fixtureValue.order, { fulfillmentActionId: "customer-approve-operator-test", actionKind: "approve_preview", expectedPreviewVersion: 1 }),
  });
  assert.equal(approved.status, "committed");
  const started = await runtime.handler(request(reference, "POST", { fulfillmentActionId: "operator-start-0001", actionKind: "start_production" }), reference);
  const startedReplay = await runtime.handler(request(reference, "POST", { fulfillmentActionId: "operator-start-0001", actionKind: "start_production" }), reference);
  assert.equal(started.status, 200);
  assert.equal((await startedReplay.json()).status, "replayed");
  const quality = await runtime.handler(request(reference, "POST", { fulfillmentActionId: "operator-quality-0001", actionKind: "mark_quality_check" }), reference);
  const qualityReplay = await runtime.handler(request(reference, "POST", { fulfillmentActionId: "operator-quality-0001", actionKind: "mark_quality_check" }), reference);
  assert.equal(quality.status, 200);
  assert.equal((await quality.json()).fulfillment.status, "quality_check");
  assert.equal((await qualityReplay.json()).status, "replayed");
  const terminal = await runtime.handler(request(reference, "POST", { fulfillmentActionId: "operator-start-after-quality-0001", actionKind: "start_production" }), reference);
  assert.equal(terminal.status, 409);
});

test("customer capability cannot authorize operator actions", async () => {
  const fixtureValue = await fixture();
  const runtime = handlerFor(fixtureValue, { verify: () => null });
  const response = await runtime.handler(request(fixtureValue.order.publicReference, "POST", { fulfillmentActionId: "operator-customer-capability-0001", actionKind: "enter_photo_review" }, { cookie: "figmemento-local-order-access=customer-capability-only" }), fixtureValue.order.publicReference);
  assert.equal(response.status, 404);
  assert.equal(runtime.repository.getCountsForTests().aggregateCount, 0);
});

test("operator HTTP keeps same-origin, bounded JSON, and authority fields server-owned", async () => {
  const fixtureValue = await fixture();
  let constructed = 0;
  const handler = createLocalFulfillmentOperatorHttpHandler({ createService: () => { constructed += 1; throw new Error("must not construct"); } });
  const reference = fixtureValue.order.publicReference;
  const crossOrigin = await handler(request(reference, "POST", { fulfillmentActionId: "operator-guard-0001", actionKind: "enter_photo_review" }, { origin: "https://evil.example" }), reference);
  const nonJson = await handler(request(reference, "POST", "ignored", { "content-type": "text/plain" }), reference);
  const authority = await handler(request(reference, "POST", { fulfillmentActionId: "operator-guard-0002", actionKind: "enter_photo_review", targetState: "in_production", actorKind: "operator" }), reference);
  const oversized = await handler(request(reference, "POST", "x".repeat(16 * 1024 + 1)), reference);
  assert.equal(crossOrigin.status, 403);
  assert.equal(nonJson.status, 400);
  assert.equal(authority.status, 400);
  assert.equal(oversized.status, 400);
  assert.equal(constructed, 0);
});

test("operator boundary is server-only and does not introduce production/provider paths", async () => {
  const source = await Promise.all([
    readFile(new URL("../app/application/local-fulfillment-operator-service.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/server/local-fulfillment-operator-http.server.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/server/local-fulfillment-development-operator.server.ts", import.meta.url), "utf8"),
  ]).then((parts) => parts.join("\n"));
  assert.doesNotMatch(source, /NEXT_PUBLIC|localStorage|sessionStorage|document\.cookie|password|secret|token|stripe|paypal|supabase|shipping|tracking|supplier|factory|dangerouslySetInnerHTML/i);
});
