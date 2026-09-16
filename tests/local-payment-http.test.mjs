import assert from "node:assert/strict";
import test from "node:test";

import { LocalPaymentService } from "../app/application/local-payment-service.ts";
import { LocalMemoryLocalOrderRepository } from "../app/infrastructure/local-order/local-memory-local-order-repository.server.ts";
import { LocalMemoryLocalPaymentRepository } from "../app/infrastructure/local-payment/local-memory-local-payment-repository.server.ts";
import { createLocalPaymentMutationHttpHandler } from "../app/server/local-payment-http.server.ts";

const creationAttempt = "123e4567-e89b-42d3-a456-426614174250";

function draft() {
  return {
    contact: {
      email: "guest@example.test",
      firstName: "Guest",
      lastName: "Buyer",
      country: "US",
      city: "Los Angeles",
      addressLine1: "1 Main Street",
      postalCode: "90001",
    },
    commercial: {
      currency: "USD",
      subtotalCents: 8_990,
      shipping: { status: "eligible", country: "US", method: "local_standard", amountCents: 900, currency: "USD", estimatedRange: "5-10 business days", developmentOnly: true },
      coupon: { status: "not_selected", discountCents: 0, developmentOnly: true },
      tax: { status: "not_activated", amountCents: null },
      localArithmeticTotalCents: 9_890,
      developmentOnly: true,
    },
    lines: [{
      productId: "product-1",
      productName: "Glass Light",
      productSlug: "glass-light-picture",
      variantId: "variant-1",
      skuCode: "GLASS-LIGHT-PICTURE",
      selectedOptions: [{ optionId: "size", valueId: "standard" }],
      quantity: 1,
      unitBasePriceCents: 8_990,
      currency: "USD",
      lineSubtotalCents: 8_990,
    }],
  };
}

async function createRuntime() {
  const orders = new LocalMemoryLocalOrderRepository({ now: () => "2026-08-26T13:00:00.000Z" });
  const orderResult = await orders.findOrCreate({
    creationAttemptId: creationAttempt,
    context: { cartId: "cart-http", authorityKey: "catalog-v1" },
    inputFingerprint: "fingerprint-http",
    snapshot: draft(),
  });
  assert.equal(orderResult.status, "created");
  const payments = new LocalMemoryLocalPaymentRepository(orders, { now: () => "2026-08-26T13:01:00.000Z" });
  const service = new LocalPaymentService({
    readConfig: () => ({ source: "local_fake", runtimeMode: "test" }),
    getOrderRepository: () => orders,
    getPaymentRepository: () => payments,
  });
  const handler = createLocalPaymentMutationHttpHandler({ createService: () => service });
  return { orders, payments, order: orderResult, handler };
}

function request(body, order, headers = {}) {
  return new Request("http://localhost:3000/api/local-payments", {
    method: "POST",
    headers: {
      origin: "http://localhost:3000",
      "sec-fetch-site": "same-origin",
      "content-type": "application/json",
      cookie: `figmemento-local-order-access=${order.browserCapability}`,
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function bodyFor(order, overrides = {}) {
  return {
    publicReference: order.snapshot.publicReference,
    paymentAttemptId: "http-payment-A",
    outcome: "success",
    ...overrides,
  };
}

test("Local Payment HTTP commits a bounded safe projection and canonical Order lifecycle", async () => {
  const runtime = await createRuntime();
  const response = await runtime.handler(request(bodyFor(runtime.order), runtime.order));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, "committed");
  assert.equal(body.payment.status, "succeeded");
  assert.equal(body.order.status, "paid");
  assert.equal(body.order.paymentStatus, "succeeded");
  assert.doesNotMatch(JSON.stringify(body), /internalOrderId|internalPaymentId|authorityContext|browserCapability|paymentAttemptId|protected|receipt|ownerId|storageKey/i);
  const read = runtime.orders.findSnapshotForPayment(runtime.order.snapshot.internalId);
  assert.equal(read.status, "found");
  assert.equal(read.snapshot.status, "paid");
  assert.equal(read.snapshot.paymentStatus, "succeeded");
});

test("HTTP exact replay returns the original result after paid and a new selector is rejected", async () => {
  const runtime = await createRuntime();
  const first = await runtime.handler(request(bodyFor(runtime.order), runtime.order));
  const firstBody = await first.json();
  const replay = await runtime.handler(request(bodyFor(runtime.order), runtime.order));
  const replayBody = await replay.json();
  assert.equal(replay.status, 200);
  assert.equal(replayBody.status, "replayed");
  assert.equal(replayBody.payment.paymentReference, firstBody.payment.paymentReference);
  const newAttempt = await runtime.handler(request(bodyFor(runtime.order, { paymentAttemptId: "http-payment-B" }), runtime.order));
  assert.equal(newAttempt.status, 409);
  assert.equal(runtime.payments.getPaymentAttemptCountForTests(), 1);
  assert.equal(runtime.orders.getOrderLifecycleTransitionCountForTests(), 1);
});

test("HTTP failed and cancelled outcomes remain retryable with a new selector", async () => {
  const failed = await createRuntime();
  const failedResponse = await failed.handler(request(bodyFor(failed.order, { paymentAttemptId: "http-failed", outcome: "failed" }), failed.order));
  assert.equal(failedResponse.status, 200);
  assert.equal((await failedResponse.json()).payment.status, "failed");
  const retry = await failed.handler(request(bodyFor(failed.order, { paymentAttemptId: "http-retry", outcome: "success" }), failed.order));
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).order.status, "paid");

  const cancelled = await createRuntime();
  const cancelledResponse = await cancelled.handler(request(bodyFor(cancelled.order, { paymentAttemptId: "http-cancelled", outcome: "cancelled" }), cancelled.order));
  assert.equal(cancelledResponse.status, 200);
  const cancelledBody = await cancelledResponse.json();
  assert.equal(cancelledBody.payment.status, "cancelled");
  assert.equal(cancelledBody.order.status, "pending_payment");
});

test("missing, wrong, and unknown capability/reference responses are uniform", async () => {
  const runtime = await createRuntime();
  const missing = await runtime.handler(new Request("http://localhost:3000/api/local-payments", {
    method: "POST",
    headers: { origin: "http://localhost:3000", "sec-fetch-site": "same-origin", "content-type": "application/json" },
    body: JSON.stringify(bodyFor(runtime.order)),
  }));
  const wrong = await runtime.handler(request(bodyFor(runtime.order), runtime.order, { cookie: "figmemento-local-order-access=wrong-capability-123456" }));
  const unknown = await runtime.handler(request(bodyFor(runtime.order, { publicReference: "FM-LOCAL-AAAAAAAAAAAAAAAA" }), runtime.order));
  assert.equal(missing.status, 404);
  assert.equal(wrong.status, 404);
  assert.equal(unknown.status, 404);
  const missingBody = await missing.json();
  const wrongBody = await wrong.json();
  const unknownBody = await unknown.json();
  assert.deepEqual(missingBody, wrongBody);
  assert.deepEqual(missingBody, unknownBody);
});

test("same-origin and parser guards reject before service construction", async () => {
  let serviceConstructed = 0;
  const handler = createLocalPaymentMutationHttpHandler({ createService: () => {
    serviceConstructed += 1;
    throw new Error("must not construct service");
  } });
  const baseBody = { publicReference: "FM-LOCAL-AAAAAAAAAAAAAAAA", paymentAttemptId: "http-guard", outcome: "success" };
  const crossOrigin = await handler(request(baseBody, { browserCapability: "capability-123456" }, { origin: "https://evil.example" }));
  assert.equal(crossOrigin.status, 403);
  const authorityField = await handler(request({ ...baseBody, amount: 1 }, { browserCapability: "capability-123456" }));
  assert.equal(authorityField.status, 400);
  const capabilityField = await handler(request({ ...baseBody, capability: "capability-123456" }, { browserCapability: "capability-123456" }));
  assert.equal(capabilityField.status, 400);
  assert.equal(serviceConstructed, 0);
});

test("local Order access cookie is available to the Payment path without exposing its value", async () => {
  const runtime = await createRuntime();
  const response = await runtime.handler(request(bodyFor(runtime.order), runtime.order));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("set-cookie"), null);
  assert.doesNotMatch(await response.text(), /figmemento-local-order-access/i);
});
