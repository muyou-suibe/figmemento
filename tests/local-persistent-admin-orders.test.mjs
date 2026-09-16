import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { readAdminAcceptanceConfiguration } from "../app/config/admin-acceptance-runtime.server.ts";
import { createLocalPersistentAdminOrdersReadRepository } from "../app/infrastructure/orders/local-persistent-admin-orders-read-repository.server.ts";
import { catalogTestEnvironment } from "./fixtures/local-persistent-catalog.mjs";

const order = {
  orderId: "11111111-1111-4111-8111-111111111111",
  publicReference: "FM-LOCAL-1234567890ABCDEF",
  orderLifecycle: "paid",
  orderVersion: 2,
  paymentStatus: "paid",
  fulfillmentStatus: "preview_pending",
  createdAt: "2026-09-14T00:00:00.000Z",
  customer: { displayName: "Synthetic Customer", displayEmail: "synthetic@example.test" },
  amounts: { subtotalCents: 1000, discountCents: 0, shippingCents: 500, totalCents: 1500, currency: "USD", couponCode: null },
  fulfillment: {
    id: "22222222-2222-4222-8222-222222222222",
    version: 4,
    revisionRequestsUsed: 1,
    currentManifestId: "33333333-3333-4333-8333-333333333333",
    currentManifestVersion: 2,
    approvalDeadlineAt: "2026-09-17T00:00:00.000Z",
    hasAdminTimeout: false,
  },
  lineItems: [{ id: "44444444-4444-4444-8444-444444444444", productName: "Synthetic Product", skuCode: "SYN-001", quantity: 1, fulfillmentType: "physical", configurationRevision: 3 }],
};

function environment(overrides = {}) {
  return catalogTestEnvironment({
    ADMIN_ACCEPTANCE_SOURCE: "local_persistent",
    CUSTOMER_AUTH_SOURCE: "local_persistent",
    CART_SOURCE: "local_persistent",
    LOCAL_ORDER_SOURCE: "local_persistent",
    LOCAL_PAYMENT_SOURCE: "local_persistent",
    LOCAL_FULFILLMENT_SOURCE: "local_persistent",
    LOCAL_TRACKING_SOURCE: "local_persistent",
    LOCAL_COMMERCE_SERVICE_ROLE_KEY: "test-service-role-key",
    ...overrides,
  });
}

function connection(value = { status: "found", value: { status: "found", value: { page: 1, pageSize: 20, totalCount: 1, items: [order] } } }) {
  return async () => ({
    status: "ready",
    composition: { projectId: environment().LOCAL_COMMERCE_PROJECT_ID, markerDigest: environment().LOCAL_COMMERCE_MARKER_DIGEST },
    adapter: { async callRestrictedRpc(name, input) {
      assert.equal(name, "admin_orders_read");
      assert.equal(input.p_actor_kind, "admin");
      assert.equal(input.p_actor_id, "configured-admin");
      assert.equal(input.p_project_id, environment().LOCAL_COMMERCE_PROJECT_ID);
      return value;
    } },
  });
}

test("Task 8.2 recognizes local_persistent only in development/test and preserves defaults", () => {
  assert.deepEqual(readAdminAcceptanceConfiguration({}, "production"), { status: "production_default", source: "production", runtimeMode: "production" });
  assert.deepEqual(readAdminAcceptanceConfiguration({ ADMIN_ACCEPTANCE_SOURCE: "local_fake" }, "test"), { status: "local_fake", source: "local_fake", runtimeMode: "test" });
  assert.deepEqual(readAdminAcceptanceConfiguration({ ADMIN_ACCEPTANCE_SOURCE: "local_persistent" }, "test"), { status: "local_persistent", source: "local_persistent", runtimeMode: "test" });
  for (const mode of ["production", "staging", "unknown"]) assert.equal(readAdminAcceptanceConfiguration({ ADMIN_ACCEPTANCE_SOURCE: "local_persistent" }, mode).status, "configuration_failure");
  assert.equal(readAdminAcceptanceConfiguration({ ADMIN_ACCEPTANCE_SOURCE: "browser-choice" }, "test").status, "configuration_failure");
});

test("Task 8.2 persistent repository returns bounded canonical projection", async () => {
  const repository = createLocalPersistentAdminOrdersReadRepository(environment(), { connect: connection() });
  const result = await repository.read({ q: "FM-LOCAL", fulfillment: "preview_pending", payment: "paid", page: 1 });
  assert.equal(result.status, "found");
  assert.equal(result.value.sourceNotice, "LOCAL / TEST PERSISTENT COMMERCE");
  assert.equal(result.value.items[0].publicReference, order.publicReference);
  assert.equal(result.value.items[0].lineItems[0].productName, "Synthetic Product");
  assert.equal(result.value.items[0].persistentControl.currentManifestVersion, 2);
  assert.doesNotMatch(JSON.stringify(result), /ownerId|capability|sessionHash|passwordHash|storage|service.?role|signedUrl|bucket|objectPath/i);
});

test("Task 8.2 malformed or unavailable authority never falls back", async () => {
  let calls = 0;
  const repository = createLocalPersistentAdminOrdersReadRepository(environment(), { connect: async () => { calls += 1; return { status: "unavailable", issues: [] }; } });
  assert.equal((await repository.read()).status, "unavailable");
  assert.equal(calls, 1);
  const malformed = createLocalPersistentAdminOrdersReadRepository(environment(), { connect: connection({ status: "found", value: { status: "found", value: { page: 1, pageSize: 20, totalCount: 1, items: [{ ...order, ownerId: "leak" }] } } }) });
  assert.equal((await malformed.read()).status, "source_failure");
});

test("Task 8.2 SQL is read-only, fixed-search-path and service-role-only", () => {
  const sql = readFileSync("local/commerce/migrations/0027_local-commerce-admin-orders-read.sql", "utf8");
  assert.match(sql, /security definer\s+set search_path = pg_catalog/i);
  assert.match(sql, /verify_project_identity\(p_project_id, p_marker_digest\)/);
  assert.match(sql, /p_actor_kind <> 'admin'/);
  assert.match(sql, /p_actor_id <> 'configured-admin'/);
  assert.match(sql, /revoke all on function[\s\S]+from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function[\s\S]+to service_role/i);
  assert.doesNotMatch(sql, /\b(insert|update|delete|truncate)\b\s+(?:into\s+|from\s+)?local_commerce\./i);
  for (const forbidden of ["capability_hash", "session_hash", "password_hash", "storage_path", "object_path", "service_role_key", "signed_url"]) assert.doesNotMatch(sql, new RegExp(forbidden, "i"));
});

test("Task 8.2 persistent UI uses canonical timeout route and no legacy generic PATCH", () => {
  const component = readFileSync("app/admin/AdminPersistentOrderControls.tsx", "utf8");
  const page = readFileSync("app/admin/orders/page.tsx", "utf8");
  assert.match(component, /api\/local-fulfillment\/admin\/.*\/timeout/);
  assert.match(component, /expectedAggregateVersion/);
  assert.match(component, /expectedPreviewVersion/);
  assert.doesNotMatch(component, /api\/admin\/orders/);
  assert.match(page, /composition\.status === "local_persistent"/);
});
