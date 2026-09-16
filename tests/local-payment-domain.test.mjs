import assert from "node:assert/strict";
import test from "node:test";

import {
  isExactCommittedLocalPaymentReplay,
  isLocalPaymentPublicReference,
  isPaymentAttemptId,
  parseLocalPaymentMutationInput,
  projectLocalPaymentAttempt,
  transitionLocalPaymentLifecycle,
  transitionLocalPaymentOrderState,
  validateNewLocalPaymentAttempt,
} from "../app/domain/local-payment.ts";

const orderReference = "FM-LOCAL-ABCDEF0123456789";
const paymentAttemptId = "123e4567-e89b-42d3-a456-426614174000";

function protectedOrder(overrides = {}) {
  return {
    status: "pending_payment",
    paymentStatus: "pending",
    commercial: {
      developmentOnly: true,
      currency: "USD",
      localArithmeticTotalCents: 9_890,
      tax: { status: "not_activated", amountCents: null },
    },
    ...overrides,
  };
}

test("Payment identifiers use bounded opaque formats", () => {
  assert.equal(isLocalPaymentPublicReference("LP-LOCAL-ABCDEF0123456789"), true);
  assert.equal(isLocalPaymentPublicReference("FM-LOCAL-ABCDEF0123456789"), false);
  assert.equal(isPaymentAttemptId(paymentAttemptId), true);
  assert.equal(isPaymentAttemptId(" payment-attempt"), false);
  assert.equal(isPaymentAttemptId(""), false);
});

test("bounded mutation parser accepts only reference, selector, and outcome", () => {
  const parsed = parseLocalPaymentMutationInput({
    publicReference: orderReference,
    paymentAttemptId,
    outcome: "success",
  });
  assert.equal(parsed.ok, true);

  for (const forbidden of [
    { amount: 9_890 },
    { currency: "USD" },
    { total: 9_890 },
    { paymentStatus: "paid" },
    { targetStatus: "paid" },
    { cardNumber: "4242424242424242" },
    { providerToken: "secret-token" },
    { refund: true },
  ]) {
    const rejected = parseLocalPaymentMutationInput({
      publicReference: orderReference,
      paymentAttemptId,
      outcome: "success",
      ...forbidden,
    });
    assert.equal(rejected.ok, false);
  }

  assert.equal(parseLocalPaymentMutationInput({
    publicReference: orderReference,
    paymentAttemptId,
    outcome: "succeeded",
  }).ok, false);
  assert.equal(parseLocalPaymentMutationInput({
    publicReference: orderReference,
    paymentAttemptId,
    outcome: "refund",
  }).ok, false);
});

test("new-attempt validation derives a USD development arithmetic amount", () => {
  assert.deepEqual(validateNewLocalPaymentAttempt(protectedOrder()), {
    ok: true,
    value: { simulatedAmountCents: 9_890, simulatedCurrency: "USD" },
  });
});

test("new-attempt validation rejects unsafe commercial snapshots", () => {
  const invalidCases = [
    ["non-development", protectedOrder({ commercial: { ...protectedOrder().commercial, developmentOnly: false } }), "non_development"],
    ["mixed currency", protectedOrder({ commercial: { ...protectedOrder().commercial, currency: "EUR" } }), "unsupported_currency"],
    ["fractional amount", protectedOrder({ commercial: { ...protectedOrder().commercial, localArithmeticTotalCents: 1.5 } }), "invalid_amount"],
    ["negative amount", protectedOrder({ commercial: { ...protectedOrder().commercial, localArithmeticTotalCents: -1 } }), "invalid_amount"],
    ["activated tax", protectedOrder({ commercial: { ...protectedOrder().commercial, tax: { status: "activated", amountCents: 1 } } }), "invalid_tax"],
  ];
  for (const [name, input, code] of invalidCases) {
    const result = validateNewLocalPaymentAttempt(input);
    assert.equal(result.ok, false, name);
    if (!result.ok) assert.equal(result.issues[0].code, code, name);
  }
});

test("paid Orders reject new attempts but remain eligible for exact replay", () => {
  const rejected = validateNewLocalPaymentAttempt(protectedOrder({
    status: "paid",
    paymentStatus: "succeeded",
  }));
  assert.equal(rejected.ok, false);
  if (!rejected.ok) assert.equal(rejected.issues[0].code, "non_retryable");

  const request = {
    internalOrderId: "order-internal-1",
    paymentAttemptId,
    outcome: "success",
    authorityContext: "same-browser-context",
  };
  const committed = {
    ...request,
    result: {
      kind: "local_payment_projection",
      paymentReference: "LP-LOCAL-0123456789ABCDEF",
      orderReference,
      status: "succeeded",
      outcome: "success",
      simulatedAmountCents: 9_890,
      simulatedCurrency: "USD",
      timestamp: "2026-08-25T12:00:00.000Z",
      notice: "Development/test simulation only. No real money was charged.",
    },
  };
  assert.equal(isExactCommittedLocalPaymentReplay(request, committed), true);
  assert.equal(isExactCommittedLocalPaymentReplay({ ...request, internalOrderId: "order-internal-2" }, committed), false);
  assert.equal(isExactCommittedLocalPaymentReplay({ ...request, authorityContext: "different-context" }, committed), false);
  assert.equal(isExactCommittedLocalPaymentReplay({ ...request, outcome: "failed" }, committed), false);
  assert.equal(isExactCommittedLocalPaymentReplay({ ...request, paymentAttemptId: "new-attempt" }, committed), false);
});

test("pure transition table covers success, failed, cancelled, and retry", () => {
  const cases = [
    [{ orderStatus: "pending_payment", paymentStatus: "pending" }, "success", { attemptState: "succeeded", orderStatus: "paid", paymentStatus: "succeeded" }],
    [{ orderStatus: "pending_payment", paymentStatus: "pending" }, "failed", { attemptState: "failed", orderStatus: "payment_failed", paymentStatus: "failed" }],
    [{ orderStatus: "pending_payment", paymentStatus: "pending" }, "cancelled", { attemptState: "cancelled", orderStatus: "pending_payment", paymentStatus: "pending" }],
    [{ orderStatus: "payment_failed", paymentStatus: "failed" }, "success", { attemptState: "succeeded", orderStatus: "paid", paymentStatus: "succeeded" }],
    [{ orderStatus: "payment_failed", paymentStatus: "failed" }, "failed", { attemptState: "failed", orderStatus: "payment_failed", paymentStatus: "failed" }],
    [{ orderStatus: "payment_failed", paymentStatus: "failed" }, "cancelled", { attemptState: "cancelled", orderStatus: "pending_payment", paymentStatus: "pending" }],
  ];
  for (const [lifecycle, outcome, expected] of cases) {
    const result = transitionLocalPaymentLifecycle(lifecycle, outcome);
    assert.deepEqual(result, { ok: true, value: expected });
  }
  const paid = transitionLocalPaymentLifecycle({ orderStatus: "paid", paymentStatus: "succeeded" }, "success");
  assert.equal(paid.ok, false);
  if (!paid.ok) assert.equal(paid.issues[0].code, "non_retryable");
  const refund = transitionLocalPaymentLifecycle({ orderStatus: "pending_payment", paymentStatus: "pending" }, "refund");
  assert.equal(refund.ok, false);
  if (!refund.ok) assert.equal(refund.issues[0].code, "refund_unsupported");
});

test("transition state keeps immutable Order facts separate", () => {
  const state = {
    internalId: "order-internal-1",
    publicReference: orderReference,
    createdAt: "2026-08-25T12:00:00.000Z",
    contact: { email: "guest@example.test", firstName: "Guest", lastName: "Buyer", country: "US", city: "LA", addressLine1: "1 Main", postalCode: "90001" },
    commercial: protectedOrder().commercial,
    lines: [{ productId: "product-1", productName: "Demo", productSlug: "demo", variantId: "variant-1", skuCode: "DEMO-1", selectedOptions: [], quantity: 1, unitBasePriceCents: 9_890, currency: "USD", lineSubtotalCents: 9_890 }],
    lifecycle: { orderStatus: "pending_payment", paymentStatus: "pending" },
  };
  const originalFacts = {
    internalId: state.internalId,
    publicReference: state.publicReference,
    createdAt: state.createdAt,
    contact: state.contact,
    commercial: state.commercial,
    lines: state.lines,
  };
  const result = transitionLocalPaymentOrderState(state, "success");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual({
    internalId: result.value.internalId,
    publicReference: result.value.publicReference,
    createdAt: result.value.createdAt,
    contact: result.value.contact,
    commercial: result.value.commercial,
    lines: result.value.lines,
  }, originalFacts);
  assert.deepEqual(result.value.lifecycle, { orderStatus: "paid", paymentStatus: "succeeded" });
  assert.deepEqual(state.lifecycle, { orderStatus: "pending_payment", paymentStatus: "pending" });
});

test("safe public projection omits internal and private Payment facts", () => {
  const result = projectLocalPaymentAttempt({
    kind: "local_payment_attempt",
    paymentReference: "LP-LOCAL-0123456789ABCDEF",
    orderReference,
    serverIdentity: { internalPaymentId: "internal-payment", internalOrderId: "internal-order", authorityContext: "secret-context" },
    paymentAttemptId,
    outcome: "success",
    state: "succeeded",
    simulatedAmountCents: 9_890,
    simulatedCurrency: "USD",
    createdAt: "2026-08-25T12:00:00.000Z",
    committedAt: "2026-08-25T12:00:01.000Z",
    developmentOnly: true,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal("serverIdentity" in result.value, false);
  assert.equal("paymentAttemptId" in result.value, false);
  assert.equal("developmentOnly" in result.value, false);
  assert.equal(result.value.notice, "Development/test simulation only. No real money was charged.");
});

test("pending attempts are internal and cannot be projected", () => {
  const result = projectLocalPaymentAttempt({
    kind: "local_payment_attempt",
    paymentReference: "LP-LOCAL-0123456789ABCDEF",
    orderReference,
    serverIdentity: { internalPaymentId: "internal-payment", internalOrderId: "internal-order", authorityContext: "secret-context" },
    paymentAttemptId,
    outcome: "success",
    state: "pending",
    simulatedAmountCents: 9_890,
    simulatedCurrency: "USD",
    createdAt: "2026-08-25T12:00:00.000Z",
    committedAt: "2026-08-25T12:00:01.000Z",
    developmentOnly: true,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.issues[0].code, "pending_not_public");
});
