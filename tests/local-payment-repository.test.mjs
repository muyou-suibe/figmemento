import assert from "node:assert/strict";
import test from "node:test";

import { LocalMemoryLocalOrderRepository } from "../app/infrastructure/local-order/local-memory-local-order-repository.server.ts";
import { LocalMemoryLocalPaymentRepository } from "../app/infrastructure/local-payment/local-memory-local-payment-repository.server.ts";

const creationAttemptA = "123e4567-e89b-42d3-a456-426614174100";
const creationAttemptB = "123e4567-e89b-42d3-a456-426614174101";

function draft(productId = "product-1") {
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
      productName: "Glass Light",
      productSlug: "glass-light-picture",
      variantId: "variant-1",
      skuCode: "GLASS-LIGHT-PICTURE",
      selectedOptions: [{ optionId: "size", valueId: "standard" }],
      quantity: 1,
      unitBasePriceCents: 8990,
      currency: "USD",
      lineSubtotalCents: 8990,
    }],
  };
}

function createRuntime(options = {}) {
  const orders = new LocalMemoryLocalOrderRepository({
    now: () => "2026-08-26T12:00:00.000Z",
  });
  const payments = new LocalMemoryLocalPaymentRepository(orders, {
    now: () => "2026-08-26T12:01:00.000Z",
    ...options,
  });
  return { orders, payments };
}

async function createOrder(orders, creationAttemptId = creationAttemptA, productId = "product-1") {
  const result = await orders.findOrCreate({
    creationAttemptId,
    context: { cartId: `cart-${productId}`, authorityKey: "catalog-v1" },
    inputFingerprint: `fingerprint-${productId}`,
    snapshot: draft(productId),
  });
  assert.equal(result.status, "created");
  return result;
}

function paymentInput(order, overrides = {}) {
  return {
    internalOrderId: order.snapshot.internalId,
    orderReference: order.snapshot.publicReference,
    paymentAttemptId: "payment-attempt-A",
    outcome: "success",
    authorityContext: "same-browser-context",
    ...overrides,
  };
}

test("success commits one Payment attempt and the canonical protected read sees paid", async () => {
  const runtime = createRuntime();
  const order = await createOrder(runtime.orders);
  const originalFacts = JSON.parse(JSON.stringify(order.snapshot));

  const committed = runtime.payments.commit(paymentInput(order));
  assert.equal(committed.status, "committed");
  assert.equal(committed.result.status, "succeeded");
  assert.equal(committed.orderSnapshot.status, "paid");
  assert.equal(committed.orderSnapshot.paymentStatus, "succeeded");
  assert.equal(runtime.payments.getPaymentAttemptCountForTests(), 1);
  assert.equal(runtime.orders.getOrderLifecycleTransitionCountForTests(), 1);

  const read = await runtime.orders.findAuthorizedSnapshot(order.snapshot.publicReference, order.browserCapability);
  assert.equal(read.status, "found");
  assert.equal(read.snapshot.status, "paid");
  assert.equal(read.snapshot.paymentStatus, "succeeded");
  assert.deepEqual(
    { ...JSON.parse(JSON.stringify(read.snapshot)), status: "pending_payment", paymentStatus: "pending" },
    originalFacts,
  );
});

test("exact replay after paid returns the original result without a second attempt or transition", async () => {
  const runtime = createRuntime();
  const order = await createOrder(runtime.orders);
  const input = paymentInput(order);
  const first = runtime.payments.commit(input);
  const replay = runtime.payments.commit(input);

  assert.equal(first.status, "committed");
  assert.equal(replay.status, "replayed");
  assert.equal(replay.result.paymentReference, first.result.paymentReference);
  assert.equal(replay.result.timestamp, first.result.timestamp);
  assert.equal(replay.result.simulatedAmountCents, first.result.simulatedAmountCents);
  assert.equal(runtime.payments.getPaymentAttemptCountForTests(), 1);
  assert.equal(runtime.orders.getOrderLifecycleTransitionCountForTests(), 1);
});

test("failed and cancelled attempts preserve facts and allow a new selector retry", async () => {
  const failedRuntime = createRuntime();
  const failedOrder = await createOrder(failedRuntime.orders);
  const failed = failedRuntime.payments.commit(paymentInput(failedOrder, {
    paymentAttemptId: "payment-attempt-failed",
    outcome: "failed",
  }));
  assert.equal(failed.status, "committed");
  assert.equal(failed.orderSnapshot.status, "payment_failed");
  assert.equal(failed.orderSnapshot.paymentStatus, "failed");

  const retry = failedRuntime.payments.commit(paymentInput(failedOrder, {
    paymentAttemptId: "payment-attempt-retry",
    outcome: "success",
  }));
  assert.equal(retry.status, "committed");
  assert.equal(retry.orderSnapshot.status, "paid");
  assert.equal(failedRuntime.payments.getPaymentAttemptCountForTests(), 2);

  const cancelledRuntime = createRuntime();
  const cancelledOrder = await createOrder(cancelledRuntime.orders);
  const cancelled = cancelledRuntime.payments.commit(paymentInput(cancelledOrder, {
    paymentAttemptId: "payment-attempt-cancelled",
    outcome: "cancelled",
  }));
  assert.equal(cancelled.status, "committed");
  assert.equal(cancelled.orderSnapshot.status, "pending_payment");
  assert.equal(cancelled.orderSnapshot.paymentStatus, "pending");
});

test("new selector after paid is rejected without rewriting the original result", async () => {
  const runtime = createRuntime();
  const order = await createOrder(runtime.orders);
  const first = runtime.payments.commit(paymentInput(order));
  const rejected = runtime.payments.commit(paymentInput(order, { paymentAttemptId: "payment-attempt-B" }));

  assert.equal(first.status, "committed");
  assert.equal(rejected.status, "rejected");
  assert.equal(rejected.issues[0].code, "non_retryable");
  assert.equal(runtime.payments.getPaymentAttemptCountForTests(), 1);
  assert.equal(runtime.orders.getOrderLifecycleTransitionCountForTests(), 1);
  assert.equal(runtime.payments.getCommittedAttemptForTests("payment-attempt-A").attempt.paymentReference, first.result.paymentReference);
});

test("reusing a selector with another outcome, Order, or authority context is a bounded conflict", async () => {
  const runtime = createRuntime();
  const orderA = await createOrder(runtime.orders);
  const orderB = await createOrder(runtime.orders, creationAttemptB, "product-2");
  const first = runtime.payments.commit(paymentInput(orderA));
  assert.equal(first.status, "committed");

  const differentOutcome = runtime.payments.commit(paymentInput(orderA, { outcome: "failed" }));
  const differentOrder = runtime.payments.commit(paymentInput(orderB));
  const differentContext = runtime.payments.commit(paymentInput(orderA, { authorityContext: "other-context" }));
  assert.equal(differentOutcome.status, "conflict");
  assert.equal(differentOrder.status, "conflict");
  assert.equal(differentContext.status, "conflict");
  assert.equal(runtime.payments.getPaymentAttemptCountForTests(), 1);
  assert.equal(runtime.orders.getOrderLifecycleTransitionCountForTests(), 1);
});

test("injected commit failure leaves Payment and canonical Order unchanged", async () => {
  const failure = { enabled: true };
  const runtime = createRuntime({ failureInjector: { beforeCommit: () => { if (failure.enabled) throw new Error("injected"); } } });
  const order = await createOrder(runtime.orders);
  const rejected = runtime.payments.commit(paymentInput(order));
  assert.equal(rejected.status, "failed");
  assert.equal(runtime.payments.getPaymentAttemptCountForTests(), 0);
  assert.equal(runtime.orders.getOrderLifecycleTransitionCountForTests(), 0);
  const read = await runtime.orders.findAuthorizedSnapshot(order.snapshot.publicReference, order.browserCapability);
  assert.equal(read.status, "found");
  assert.equal(read.snapshot.status, "pending_payment");

  failure.enabled = false;
  const retry = runtime.payments.commit(paymentInput(order));
  assert.equal(retry.status, "committed");
});

function queuedCommit(payments, input) {
  return Promise.resolve().then(() => payments.commit(input));
}

test("distinct selectors serialize against the latest canonical state when success wins first", async () => {
  const runtime = createRuntime();
  const order = await createOrder(runtime.orders);
  const [success, failed] = await Promise.all([
    queuedCommit(runtime.payments, paymentInput(order, {
      paymentAttemptId: "payment-attempt-success",
      outcome: "success",
    })),
    queuedCommit(runtime.payments, paymentInput(order, {
      paymentAttemptId: "payment-attempt-failed",
      outcome: "failed",
    })),
  ]);

  assert.equal(success.status, "committed");
  assert.equal(failed.status, "rejected");
  assert.equal(failed.issues[0].code, "non_retryable");
  assert.equal(runtime.payments.getPaymentAttemptCountForTests(), 1);
  assert.equal(runtime.orders.getOrderLifecycleTransitionCountForTests(), 1);
  assert.equal(runtime.payments.getCommittedAttemptForTests("payment-attempt-success").attempt.outcome, "success");
  assert.equal(runtime.payments.getCommittedAttemptForTests("payment-attempt-failed"), undefined);

  const read = await runtime.orders.findAuthorizedSnapshot(order.snapshot.publicReference, order.browserCapability);
  assert.equal(read.status, "found");
  assert.equal(read.snapshot.status, "paid");
  assert.equal(read.snapshot.paymentStatus, "succeeded");
});

test("distinct selectors serialize failed-first then allow success as a fresh retry", async () => {
  const runtime = createRuntime();
  const order = await createOrder(runtime.orders);
  const [failed, success] = await Promise.all([
    queuedCommit(runtime.payments, paymentInput(order, {
      paymentAttemptId: "payment-attempt-failed-first",
      outcome: "failed",
    })),
    queuedCommit(runtime.payments, paymentInput(order, {
      paymentAttemptId: "payment-attempt-success-after-failure",
      outcome: "success",
    })),
  ]);

  assert.equal(failed.status, "committed");
  assert.equal(failed.orderSnapshot.status, "payment_failed");
  assert.equal(success.status, "committed");
  assert.equal(success.orderSnapshot.status, "paid");
  assert.equal(runtime.payments.getPaymentAttemptCountForTests(), 2);
  assert.equal(runtime.orders.getOrderLifecycleTransitionCountForTests(), 2);
  assert.notEqual(
    runtime.payments.getCommittedAttemptForTests("payment-attempt-failed-first").attempt.paymentReference,
    runtime.payments.getCommittedAttemptForTests("payment-attempt-success-after-failure").attempt.paymentReference,
  );

  const read = await runtime.orders.findAuthorizedSnapshot(order.snapshot.publicReference, order.browserCapability);
  assert.equal(read.status, "found");
  assert.equal(read.snapshot.status, "paid");
  assert.equal(read.snapshot.paymentStatus, "succeeded");
});

test("same-selector concurrent success and failed requests commit one binding and conflict the other", async () => {
  const runtime = createRuntime();
  const order = await createOrder(runtime.orders);
  const [success, failed] = await Promise.all([
    queuedCommit(runtime.payments, paymentInput(order, {
      paymentAttemptId: "payment-attempt-conflict",
      outcome: "success",
    })),
    queuedCommit(runtime.payments, paymentInput(order, {
      paymentAttemptId: "payment-attempt-conflict",
      outcome: "failed",
    })),
  ]);

  assert.equal(success.status, "committed");
  assert.equal(failed.status, "conflict");
  assert.equal(runtime.payments.getPaymentAttemptCountForTests(), 1);
  assert.equal(runtime.orders.getOrderLifecycleTransitionCountForTests(), 1);
  const binding = runtime.payments.getCommittedAttemptForTests("payment-attempt-conflict");
  assert.equal(binding.binding.outcome, "success");
  assert.equal(binding.attempt.paymentReference, success.result.paymentReference);

  const read = await runtime.orders.findAuthorizedSnapshot(order.snapshot.publicReference, order.browserCapability);
  assert.equal(read.status, "found");
  assert.equal(read.snapshot.status, "paid");
  assert.equal(read.snapshot.paymentStatus, "succeeded");
});

test("equivalent concurrent submissions commit one attempt and replay the same result", async () => {
  const runtime = createRuntime();
  const order = await createOrder(runtime.orders);
  const results = await Promise.all(Array.from({ length: 10 }, () => Promise.resolve().then(() => runtime.payments.commit(paymentInput(order)))));
  assert.equal(runtime.payments.getPaymentAttemptCountForTests(), 1);
  assert.equal(runtime.orders.getOrderLifecycleTransitionCountForTests(), 1);
  assert.equal(new Set(results.map((result) => result.status)).size, 2);
  assert.equal(new Set(results.map((result) => result.result.paymentReference)).size, 1);
});

test("fresh Payment and Order runtimes fail closed after restart", async () => {
  const first = createRuntime();
  const order = await createOrder(first.orders);
  const committed = first.payments.commit(paymentInput(order));
  assert.equal(committed.status, "committed");

  const restarted = createRuntime();
  assert.equal(restarted.payments.commit(paymentInput(order)).status, "unavailable");
});
