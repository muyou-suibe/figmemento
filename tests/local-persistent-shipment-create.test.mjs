import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { readLocalTrackingConfig } from "../app/config/local-tracking-runtime.ts";
import { ServerConfigurationError } from "../app/config/server.ts";
import { parsePersistentShipmentAction } from "../app/server/local-persistent-tracking.server.ts";
import { createLocalTrackingRuntime } from "../app/server/local-tracking-runtime.server.ts";

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("local_persistent Tracking is explicit development/test-only configuration", () => {
  assert.deepEqual(readLocalTrackingConfig({ LOCAL_TRACKING_SOURCE: "local_persistent" }, "test"), {
    source: "local_persistent",
    runtimeMode: "test",
  });
  assert.deepEqual(readLocalTrackingConfig({ LOCAL_TRACKING_SOURCE: "local_persistent" }, "development"), {
    source: "local_persistent",
    runtimeMode: "development",
  });
  for (const mode of ["production", "staging", undefined]) {
    assert.throws(
      () => readLocalTrackingConfig({ LOCAL_TRACKING_SOURCE: "local_persistent" }, mode),
      (error) => error instanceof ServerConfigurationError && error.key === "LOCAL_TRACKING_SOURCE",
    );
  }
});

test("persistent Shipment create accepts only an opaque selector and mandatory version zero", () => {
  const accepted = parsePersistentShipmentAction({
    trackingActionId: "shipment-create-action-0001",
    actionKind: "create_shipment",
    expectedShipmentVersion: 0,
  });
  assert.deepEqual(accepted, {
    trackingActionId: "shipment-create-action-0001",
    actionKind: "create_shipment",
    expectedShipmentVersion: 0,
  });
  for (const changed of [
    { expectedShipmentVersion: undefined },
    { expectedShipmentVersion: 1 },
    { trackingNumber: "FM-LOCAL-TRK-FAKE00000000" },
    { carrier: "browser-carrier" },
    { paid: true },
    { qualityCheck: true },
    { requiresShipping: true },
    { ownerId: "browser-owner" },
    { actionKind: "mark_shipped" },
  ]) {
    assert.equal(parsePersistentShipmentAction({
      trackingActionId: "shipment-create-action-0001",
      actionKind: "create_shipment",
      expectedShipmentVersion: 0,
      ...changed,
    }), null);
  }
});

test("persistent source cannot construct or fall back to the process-memory runtime", () => {
  assert.throws(
    () => createLocalTrackingRuntime({ configuration: readLocalTrackingConfig({ LOCAL_TRACKING_SOURCE: "local_persistent" }, "test") }),
    /canonical durable command boundary/,
  );
});

test("Shipment RPC owns paid, physical, review, preview, quality and one-Shipment gates", async () => {
  const sql = await source("local/commerce/migrations/0028_local-commerce-shipment-create.sql");
  const foundation = await source("local/commerce/migrations/0003_local-commerce-order-operations-delivery.sql");
  for (const required of [
    "purchase.lifecycle_status <> 'paid'",
    "aggregate.fulfillment_state <> 'quality_check'",
    "fulfillmentType}' = 'physical'",
    "requiresShipping}' = 'true'::jsonb",
    "review_state = 'approved'",
    "requiresProductionPreview",
    "customer_approve",
    "operator_timeout",
    "shipment_actions_key unique",
    "for update",
  ]) assert.match(sql, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(foundation, /shipments_fulfillment_key unique \(project_id, fulfillment_id\)/);
  assert.doesNotMatch(sql, /supplier|warehouse|carrier api|signed url/i);
  assert.doesNotMatch(sql, /\bbegin\s*;/i, "ledger wrapper owns the outer transaction");
});

test("Shipment identity, carrier and timestamps are server-owned local/test facts", async () => {
  const sql = await source("local/commerce/migrations/0028_local-commerce-shipment-create.sql");
  assert.match(sql, /gen_random_uuid\(\)/);
  assert.match(sql, /FM-LOCAL-SHP-/);
  assert.match(sql, /FM-LOCAL-TRK-/);
  assert.match(sql, /local_demo_carrier/);
  assert.match(sql, /Local Demo Carrier/);
  assert.match(sql, /stamp := clock_timestamp\(\)/);
  assert.doesNotMatch(sql, /p_(?:tracking|carrier|timestamp|paid|review|shipping|owner)_/i);
});

test("Shipment create uses the unified async Tracking command port and restricted RPC", async () => {
  const server = await source("app/server/local-persistent-tracking.server.ts");
  const http = await source("app/server/local-tracking-operator-http.server.ts");
  assert.match(server, /LocalCommerceTrackingPort/);
  assert.match(server, /expectedVersion: action\.expectedShipmentVersion/);
  assert.match(server, /idempotency: \{ key, fingerprint: contextDigest \}/);
  assert.match(server, /callRestrictedRpc<unknown>\("shipment_command"/);
  assert.match(server, /createLocalTrackingDevelopmentOperatorVerifier\(\)\.verify\(\)/);
  assert.match(http, /parsePersistentShipmentAction/);
  assert.match(http, /persistentShipmentCommand/);
  assert.match(http, /persistent \? unavailable\(\)/);
  assert.doesNotMatch(server, /LocalMemoryLocalTrackingRepository/);
});

test("Shipment action replay and transaction-owned event/audit are durable", async () => {
  const sql = await source("local/commerce/migrations/0028_local-commerce-shipment-create.sql");
  assert.ok(sql.indexOf("select * into previous") < sql.indexOf("purchase.lifecycle_status <> 'paid'"));
  assert.match(sql, /previous\.context_digest/);
  assert.match(sql, /insert into local_commerce\.shipment_events/);
  assert.match(sql, /insert into local_commerce\.shipment_actions/);
  assert.match(sql, /when unique_violation or deadlock_detected or serialization_failure/);
  assert.match(sql, /revoke all on function local_commerce\.shipment_command[\s\S]+from public, anon, authenticated/);
  assert.match(sql, /grant execute on function local_commerce\.shipment_command[\s\S]+to service_role/);
});
