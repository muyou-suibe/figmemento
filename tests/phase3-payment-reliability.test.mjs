import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { handleAdminRefund } from "../app/server/admin-refunds-http.server.ts";
import { handleAdminPaymentEvents } from "../app/server/admin-payment-events-http.server.ts";
import { catalogTestEnvironment } from "./fixtures/local-persistent-catalog.mjs";

const admin = { async verifyAdminSession() {
  return { status: "authorized", principal: { role: "admin", identity: "configured-admin" } };
} };
const unauthorized = { async verifyAdminSession() { return { status: "unauthorized" }; } };
const env = catalogTestEnvironment({ ADMIN_ACCEPTANCE_SOURCE: "local_persistent",
  CUSTOMER_AUTH_SOURCE: "local_persistent", CART_SOURCE: "local_persistent",
  LOCAL_CHECKOUT_SOURCE: "local_persistent", CUSTOMER_UPLOAD_SOURCE: "local_persistent",
  LOCAL_ORDER_SOURCE: "local_persistent", LOCAL_PAYMENT_SOURCE: "local_persistent",
  LOCAL_FULFILLMENT_SOURCE: "local_persistent", LOCAL_TRACKING_SOURCE: "local_persistent" });
const body = { paymentReference: "LP-LOCAL-1234567890ABCDEF",
  refundAttemptId: "b357e2ba-4b79-479c-837e-113b34207590", amountCents: 6000, expectedVersion: 1 };
const projection = { refundReference: "RF-LOCAL-" + "A".repeat(32), paymentReference: body.paymentReference,
  amountCents: 6000, currency: "USD", remainingRefundableCents: 4000,
  aggregateVersion: 2, createdAt: "2026-09-22T00:00:00Z", status: "committed" };
function request(path, method, value, sameOrigin = true) {
  return new Request(`http://localhost:3000/api/admin/${path}`, { method,
    headers: { ...(value === undefined ? {} : { "content-type": "application/json" }),
      ...(sameOrigin ? { origin: "http://localhost:3000", "sec-fetch-site": "same-origin" } : {}) },
    body: value === undefined ? undefined : JSON.stringify(value) });
}

test("E07 signed Admin and same-origin gates run before refund authority", async () => {
  let calls = 0;
  const execute = async () => { calls++; return { status: "found", replayed: false, value: projection }; };
  const denied = await handleAdminRefund(request("refunds", "POST", body), { environment: env,
    verifier: unauthorized, execute });
  assert.equal(denied.status, 401);
  const cross = await handleAdminRefund(request("refunds", "POST", body, false), { environment: env,
    verifier: admin, execute });
  assert.equal(cross.status, 403);
  assert.equal(calls, 0);
});

test("E07 refund HTTP accepts bounded intent but never browser monetary authority", async () => {
  let accepted;
  const execute = async input => { accepted = input; return { status: "found", replayed: false, value: projection }; };
  const pass = await handleAdminRefund(request("refunds", "POST", body), { environment: env, verifier: admin, execute });
  assert.equal(pass.status, 200);
  assert.equal((await pass.json()).refund.remainingRefundableCents, 4000);
  assert.match(accepted.actionKeyDigest, /^[0-9a-f]{64}$/);
  for (const patch of [{ currency: "EUR" }, { alreadyRefundedCents: 4000 }, { amountCents: 0 },
    { amountCents: -1 }, { amountCents: 2147483648 }, { expectedVersion: null }]) {
    const denied = await handleAdminRefund(request("refunds", "POST", { ...body, ...patch }),
      { environment: env, verifier: admin, execute });
    assert.equal(denied.status, 400);
  }
});

test("E07 bounded conflict/non-refundable/unavailable projections", async () => {
  for (const [result, http] of [["conflict", 409], ["non_refundable", 409], ["unavailable", 503]]) {
    const response = await handleAdminRefund(request("refunds", "POST", body), { environment: env,
      verifier: admin, execute: async () => ({ status: result }) });
    assert.equal(response.status, http);
    assert.doesNotMatch(JSON.stringify(await response.json()), /password|secret|internal|ownerId|stack/i);
  }
});

test("E07/E28 malformed JSON is bounded before repository access", async () => {
  let calls = 0;
  const malformedRefund = await handleAdminRefund(new Request("http://localhost:3000/api/admin/refunds", {
    method: "POST", headers: { origin: "http://localhost:3000", "sec-fetch-site": "same-origin",
      "content-type": "application/json" }, body: "{" }), { environment: env, verifier: admin,
    execute: async () => { calls++; return { status: "unavailable" }; } });
  assert.equal(malformedRefund.status, 400);
  const malformedInbox = await handleAdminPaymentEvents(new Request("http://localhost:3000/api/admin/payment-events", {
    method: "POST", headers: { origin: "http://localhost:3000", "sec-fetch-site": "same-origin",
      "content-type": "application/json" }, body: "{" }), { environment: env, verifier: admin,
    process: async () => { calls++; return { status: "unavailable" }; } });
  assert.equal(malformedInbox.status, 400);
  assert.equal(calls, 0);
});

test("E28 Admin inbox list/detail/retry has no raw event intake or arbitrary state mutation", async () => {
  const event = { source: "local_fixture", externalEventId: "evt-1", eventType: "payment.succeeded",
    occurredAt: "2026-09-22T00:00:00Z", receivedAt: "2026-09-22T00:00:01Z",
    bodyByteSize: 120, payloadDigest: "a".repeat(64), subjectKind: "payment",
    subjectReference: body.paymentReference, facts: { amountCents: 10000, currency: "USD" },
    state: "unmatched", version: 3, attemptCount: 1, reconciledAt: null };
  let processed = 0;
  const deps = { environment: env, verifier: admin,
    read: async () => ({ status: "found", value: [event] }),
    process: async () => { processed++; return { status: "found", value: event }; } };
  const list = await handleAdminPaymentEvents(request("payment-events?state=unmatched", "GET"), deps);
  assert.equal(list.status, 200);
  assert.equal((await list.json()).value[0].externalEventId, "evt-1");
  const retry = await handleAdminPaymentEvents(request("payment-events", "POST",
    { source: "local_fixture", externalEventId: "evt-1" }), deps);
  assert.equal(retry.status, 200);
  assert.equal(processed, 1);
  for (const value of [{ source: "local_fixture", externalEventId: "evt-1", state: "reconciled" },
    { source: "local_fixture", externalEventId: "evt-1", rawPayload: "secret" }]) {
    const denied = await handleAdminPaymentEvents(request("payment-events", "POST", value), deps);
    assert.equal(denied.status, 400);
  }
  assert.equal(processed, 1);
  const denied = await handleAdminPaymentEvents(request("payment-events", "POST",
    { source: "local_fixture", externalEventId: "evt-1" }), { ...deps, verifier: unauthorized });
  assert.equal(denied.status, 401);
});

test("E07/E28 SQL contract locks, CAS, RLS, idempotency, and no raw payload", () => {
  const refund = readFileSync("local/commerce/migrations/0047_local-commerce-refund-aggregate.sql", "utf8");
  const inbox = readFileSync("local/commerce/migrations/0048_local-commerce-webhook-inbox.sql", "utf8");
  assert.match(refund, /for update of pa/);
  assert.match(refund, /v_aggregate\.version<>p_expected_version/);
  assert.match(refund, /refund_ledger_immutable/);
  assert.match(refund, /refund_actions_immutable/);
  assert.match(refund, /enable row level security/g);
  assert.match(inbox, /unique\(project_id,source,external_event_id\)/);
  assert.match(inbox, /on conflict \(project_id,source,external_event_id\) do nothing/);
  assert.match(inbox, /lease_expires_at<=clock_timestamp\(\)/);
  assert.match(inbox, /v_row\.lease_token<>p_lease_token/);
  assert.match(inbox, /enable row level security/);
  assert.doesNotMatch(inbox, /raw_payload|authorization_header|cookie_value|private_locator/i);
});
