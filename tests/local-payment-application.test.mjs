import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { LocalPaymentService } from "../app/application/local-payment-service.ts";
import { parseLocalPaymentMutationInput } from "../app/domain/local-payment.ts";
import { LocalMemoryLocalOrderRepository } from "../app/infrastructure/local-order/local-memory-local-order-repository.server.ts";
import { LocalMemoryLocalPaymentRepository } from "../app/infrastructure/local-payment/local-memory-local-payment-repository.server.ts";
import { deriveLocalPaymentAuthorityContext } from "../app/server/local-payment-authority.server.ts";
import {
  getSharedLocalOrderRepository,
} from "../app/server/local-order-runtime.server.ts";
import {
  getSharedLocalPaymentRepository,
  resetSharedLocalPaymentRuntimeForTests,
} from "../app/server/local-payment-runtime.server.ts";

const creationAttemptA = "123e4567-e89b-42d3-a456-426614174200";
const creationAttemptB = "123e4567-e89b-42d3-a456-426614174201";

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

function createRuntime({ transformSnapshot, config = { source: "local_fake", runtimeMode: "test" } } = {}) {
  const orders = new LocalMemoryLocalOrderRepository({ now: () => "2026-08-26T13:00:00.000Z" });
  const canonicalPort = {
    findSnapshotForPayment(internalOrderId) {
      const result = orders.findSnapshotForPayment(internalOrderId);
      if (result.status !== "found" || !transformSnapshot) return result;
      return { status: "found", snapshot: transformSnapshot(result.snapshot) };
    },
    commitLifecycleForPayment(input) {
      return orders.commitLifecycleForPayment(input);
    },
  };
  const payments = new LocalMemoryLocalPaymentRepository(canonicalPort, {
    now: () => "2026-08-26T13:01:00.000Z",
  });
  let orderRepositoryCalls = 0;
  let paymentRepositoryCalls = 0;
  const service = new LocalPaymentService({
    readConfig: () => config,
    getOrderRepository: () => {
      orderRepositoryCalls += 1;
      return orders;
    },
    getPaymentRepository: () => {
      paymentRepositoryCalls += 1;
      return payments;
    },
  });
  return {
    orders,
    payments,
    service,
    get orderRepositoryCalls() { return orderRepositoryCalls; },
    get paymentRepositoryCalls() { return paymentRepositoryCalls; },
  };
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

function input(order, overrides = {}) {
  return {
    publicReference: order.snapshot.publicReference,
    paymentAttemptId: "application-payment-A",
    outcome: "success",
    browserCapability: order.browserCapability,
    ...overrides,
  };
}

test("authorized application success resolves canonical identity and commits Payment", async () => {
  const runtime = createRuntime();
  const order = await createOrder(runtime.orders);
  const result = await runtime.service.execute(input(order));

  assert.equal(result.status, "committed");
  assert.equal(result.payment.status, "succeeded");
  assert.equal(result.order.publicReference, order.snapshot.publicReference);
  assert.equal(result.order.status, "paid");
  assert.equal(result.order.paymentStatus, "succeeded");
  assert.doesNotMatch(JSON.stringify(result), /internalOrderId|internalPaymentId|authorityContext|browserCapability|paymentAttemptId/);

  const read = await runtime.orders.findAuthorizedSnapshot(order.snapshot.publicReference, order.browserCapability);
  assert.equal(read.status, "found");
  assert.equal(read.snapshot.status, "paid");
  assert.equal(read.snapshot.paymentStatus, "succeeded");
});

test("application service calls the aggregate for exact replay after paid", async () => {
  const runtime = createRuntime();
  const order = await createOrder(runtime.orders);
  const first = await runtime.service.execute(input(order));
  const replay = await runtime.service.execute(input(order));

  assert.equal(first.status, "committed");
  assert.equal(replay.status, "replayed");
  assert.equal(replay.payment.paymentReference, first.payment.paymentReference);
  assert.equal(replay.payment.timestamp, first.payment.timestamp);
  assert.equal(runtime.payments.getPaymentAttemptCountForTests(), 1);
  assert.equal(runtime.orders.getOrderLifecycleTransitionCountForTests(), 1);
});

test("application service does not pre-reject paid Orders for a new selector", async () => {
  const runtime = createRuntime();
  const order = await createOrder(runtime.orders);
  await runtime.service.execute(input(order));
  const result = await runtime.service.execute(input(order, { paymentAttemptId: "application-payment-B" }));

  assert.equal(result.status, "non_retryable");
  assert.equal(runtime.paymentRepositoryCalls, 2);
  assert.equal(runtime.payments.getPaymentAttemptCountForTests(), 1);
});

test("application service maps failed, retry, and cancelled outcomes through the aggregate", async () => {
  const failedRuntime = createRuntime();
  const failedOrder = await createOrder(failedRuntime.orders);
  const failed = await failedRuntime.service.execute(input(failedOrder, {
    paymentAttemptId: "application-payment-failed",
    outcome: "failed",
  }));
  const retry = await failedRuntime.service.execute(input(failedOrder, {
    paymentAttemptId: "application-payment-retry",
    outcome: "success",
  }));
  assert.equal(failed.status, "committed");
  assert.equal(failed.order.status, "payment_failed");
  assert.equal(retry.status, "committed");
  assert.equal(retry.order.status, "paid");

  const cancelledRuntime = createRuntime();
  const cancelledOrder = await createOrder(cancelledRuntime.orders, creationAttemptB);
  const cancelled = await cancelledRuntime.service.execute(input(cancelledOrder, {
    paymentAttemptId: "application-payment-cancelled",
    outcome: "cancelled",
  }));
  assert.equal(cancelled.status, "committed");
  assert.equal(cancelled.order.status, "pending_payment");
  assert.equal(cancelled.order.paymentStatus, "pending");
});

test("missing, wrong, and unknown capability failures are uniformly unavailable", async () => {
  const runtime = createRuntime();
  const order = await createOrder(runtime.orders);
  const missing = await runtime.service.execute(input(order, { browserCapability: undefined }));
  const wrong = await runtime.service.execute(input(order, { browserCapability: "wrong-capability-123456" }));
  const unknown = await runtime.service.execute(input(order, {
    publicReference: "FM-LOCAL-AAAAAAAAAAAAAAAA",
  }));

  assert.equal(missing.status, "unavailable");
  assert.deepEqual(wrong, missing);
  assert.deepEqual(unknown, missing);
  assert.equal(runtime.payments.getPaymentAttemptCountForTests(), 0);
});

test("runtime gate and parser reject authority-bearing/browser-only inputs before privileged Payment construction", async () => {
  let privilegedCalls = 0;
  const disabled = createRuntime({ config: { source: "disabled", runtimeMode: "test" } });
  const order = await createOrder(disabled.orders);
  const disabledResult = await disabled.service.execute(input(order));
  assert.equal(disabledResult.status, "unavailable");

  const production = createRuntime({ config: { source: "local_fake", runtimeMode: "production" } });
  const productionOrder = await createOrder(production.orders, creationAttemptB);
  const productionResult = await production.service.execute(input(productionOrder));
  assert.equal(productionResult.status, "unsupported_runtime");

  const parsed = parseLocalPaymentMutationInput({
    publicReference: order.snapshot.publicReference,
    paymentAttemptId: "browser-authority-attempt",
    outcome: "success",
    amount: 1,
    currency: "USD",
    targetStatus: "paid",
  });
  assert.equal(parsed.ok, false);

  const noPrivilegedService = new LocalPaymentService({
    readConfig: () => ({ source: "local_fake", runtimeMode: "test" }),
    getOrderRepository: () => {
      throw new Error("order repository must not be created for missing capability");
    },
    getPaymentRepository: () => {
      privilegedCalls += 1;
      return disabled.payments;
    },
  });
  const noCapability = await noPrivilegedService.execute(input(order, { browserCapability: undefined }));
  assert.equal(noCapability.status, "unavailable");
  assert.equal(privilegedCalls, 0);
});

test("unsafe canonical commercial state fails closed without browser, Cart, or Catalog fallback", async () => {
  const cases = [
    ["developmentOnly", (snapshot) => ({ ...snapshot, commercial: { ...snapshot.commercial, developmentOnly: false } })],
    ["currency", (snapshot) => ({ ...snapshot, commercial: { ...snapshot.commercial, currency: "EUR" } })],
    ["negative amount", (snapshot) => ({ ...snapshot, commercial: { ...snapshot.commercial, localArithmeticTotalCents: -1 } })],
    ["fractional amount", (snapshot) => ({ ...snapshot, commercial: { ...snapshot.commercial, localArithmeticTotalCents: 1.5 } })],
    ["tax", (snapshot) => ({ ...snapshot, commercial: { ...snapshot.commercial, tax: { status: "activated", amountCents: 10 } } })],
    ["missing commercial authority", (snapshot) => ({ ...snapshot, commercial: undefined })],
  ];

  for (const [index, [label, transformSnapshot]] of cases.entries()) {
    const runtime = createRuntime({ transformSnapshot });
    const creationAttemptId = `${creationAttemptA.slice(0, -1)}${index}`;
    const order = await createOrder(runtime.orders, creationAttemptId);
    const result = await runtime.service.execute(input(order));
    assert.equal(result.status, "invalid", label);
    assert.equal(runtime.payments.getPaymentAttemptCountForTests(), 0, label);
    assert.equal(runtime.orders.getOrderLifecycleTransitionCountForTests(), 0, label);
  }
});

test("exact replay bypasses later commercial corruption", async () => {
  let corrupt = false;
  const runtime = createRuntime({
    transformSnapshot: (snapshot) => corrupt
      ? { ...snapshot, commercial: { ...snapshot.commercial, developmentOnly: false, localArithmeticTotalCents: -1 } }
      : snapshot,
  });
  const order = await createOrder(runtime.orders);
  const first = await runtime.service.execute(input(order));
  corrupt = true;
  const replay = await runtime.service.execute(input(order));

  assert.equal(first.status, "committed");
  assert.equal(replay.status, "replayed");
  assert.equal(replay.payment.paymentReference, first.payment.paymentReference);
  assert.equal(runtime.payments.getPaymentAttemptCountForTests(), 1);
});

test("authority context is stable, distinct per capability, and never exposed as raw capability", async () => {
  const runtime = createRuntime();
  const order = await createOrder(runtime.orders);
  const other = await createOrder(runtime.orders, creationAttemptB, "product-2");
  const firstContext = await deriveLocalPaymentAuthorityContext(order.browserCapability);
  const sameContext = await deriveLocalPaymentAuthorityContext(order.browserCapability);
  const otherContext = await deriveLocalPaymentAuthorityContext(other.browserCapability);

  assert.equal(firstContext, sameContext);
  assert.notEqual(firstContext, otherContext);
  assert.equal(firstContext.length, 64);
  assert.notEqual(firstContext, order.browserCapability);

  const result = await runtime.service.execute(input(order));
  assert.equal(result.status, "committed");
  const binding = runtime.payments.getCommittedAttemptForTests("application-payment-A");
  assert.equal(binding.binding.authorityContext, firstContext);
  assert.notEqual(binding.binding.authorityContext, order.browserCapability);
  assert.doesNotMatch(JSON.stringify(binding), new RegExp(order.browserCapability));
  assert.doesNotMatch(JSON.stringify(result), /authorityContext|browserCapability/);
});

test("shared runtime composition uses one Order instance and restart loses Order, Payment, and binding", async () => {
  resetSharedLocalPaymentRuntimeForTests();
  try {
    const orders = getSharedLocalOrderRepository();
    const order = await createOrder(orders);
    const service = new LocalPaymentService({
      readConfig: () => ({ source: "local_fake", runtimeMode: "test" }),
      getOrderRepository: getSharedLocalOrderRepository,
      getPaymentRepository: getSharedLocalPaymentRepository,
    });
    const first = await service.execute(input(order));
    assert.equal(first.status, "committed");

    resetSharedLocalPaymentRuntimeForTests();
    const afterRestart = await service.execute(input(order));
    assert.equal(afterRestart.status, "unavailable");
  } finally {
    resetSharedLocalPaymentRuntimeForTests();
  }
});

test("application service has no Cart, Catalog, customization, or upload dependencies", async () => {
  const source = await readFile(new URL("../app/application/local-payment-service.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /Cart|Catalog|Customization|CustomerUpload|receipt|storage/i);
});
