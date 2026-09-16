import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { parsePersistentShipmentAction } from "../app/server/local-persistent-tracking.server.ts";

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("persistent Shipment actions require exact action-specific CAS versions", () => {
  for (const [actionKind, expectedShipmentVersion] of [
    ["create_shipment", 0], ["mark_shipped", 1], ["mark_in_transit", 2], ["mark_delivered", 3],
  ]) {
    assert.deepEqual(parsePersistentShipmentAction({ trackingActionId: `persistent-${actionKind}-0001`, actionKind, expectedShipmentVersion }), {
      trackingActionId: `persistent-${actionKind}-0001`, actionKind, expectedShipmentVersion,
    });
  }
  for (const value of [
    { trackingActionId: "persistent-create-0001", actionKind: "create_shipment", expectedShipmentVersion: 1 },
    { trackingActionId: "persistent-ship-00001", actionKind: "mark_shipped", expectedShipmentVersion: 0 },
    { trackingActionId: "persistent-deliver-001", actionKind: "mark_delivered" },
    { trackingActionId: "persistent-event-0001", actionKind: "carrier_event", expectedShipmentVersion: 1 },
    { trackingActionId: "persistent-event-0001", actionKind: "mark_shipped", expectedShipmentVersion: 1, occurredAt: new Date().toISOString() },
  ]) assert.equal(parsePersistentShipmentAction(value), null);
});

test("0029 keeps one canonical command and hides the 0028 creation helper", async () => {
  const sql = await source("local/commerce/migrations/0029_local-commerce-shipment-lifecycle.sql");
  assert.match(sql, /rename to shipment_create_command_0028/);
  assert.match(sql, /revoke all on function local_commerce\.shipment_create_command_0028[\s\S]+service_role/);
  assert.match(sql, /create function local_commerce\.shipment_command/);
  assert.match(sql, /security definer[\s\S]+set search_path = pg_catalog, local_commerce/);
  assert.match(sql, /grant execute on function local_commerce\.shipment_command[\s\S]+to service_role/);
  assert.doesNotMatch(sql, /\bbegin\s*;/i);
});

test("Shipment lifecycle is exact, server-timed, replay-first and terminal", async () => {
  const sql = await source("local/commerce/migrations/0029_local-commerce-shipment-lifecycle.sql");
  for (const text of [
    "when 'mark_shipped' then 'shipment_created'",
    "when 'mark_in_transit' then 'shipped'",
    "when 'mark_delivered' then 'in_transit'",
    "shipment.version is distinct from p_expected_version",
    "stamp := clock_timestamp()",
    "tracking_lifecycle = target_status",
    "version = version + 1",
    "target_status = 'delivered' then 'delivered'",
  ]) assert.ok(sql.includes(text));
  assert.ok(sql.indexOf("select * into previous") < sql.indexOf("shipment.lifecycle <> 'active'"));
  assert.doesNotMatch(sql, /p_(?:occurred|timestamp|event_type|carrier|tracking_number)/i);
});

test("every lifecycle effect persists one ordered event and one action snapshot", async () => {
  const sql = await source("local/commerce/migrations/0029_local-commerce-shipment-lifecycle.sql");
  assert.match(sql, /insert into local_commerce\.shipment_events/);
  assert.match(sql, /event_type, occurred_at, version/);
  assert.match(sql, /insert into local_commerce\.shipment_actions/);
  assert.match(sql, /order by e\.version/);
  assert.match(sql, /Local shipment delivered in local demo/);
});

test("persistent lifecycle uses the unified async Tracking port without memory fallback", async () => {
  const server = await source("app/server/local-persistent-tracking.server.ts");
  const http = await source("app/server/local-tracking-operator-http.server.ts");
  assert.match(server, /LocalCommerceTrackingPort/);
  assert.match(server, /expectedVersion: action\.expectedShipmentVersion/);
  assert.match(server, /idempotency: \{ key, fingerprint: contextDigest \}/);
  assert.match(server, /createLocalTrackingDevelopmentOperatorVerifier\(\)\.verify\(\)/);
  assert.match(http, /parsePersistentShipmentAction/);
  assert.doesNotMatch(server, /LocalMemoryLocalTrackingRepository/);
});

test("delivered remains physical-only and does not claim downstream business effects", async () => {
  const sql = await source("local/commerce/migrations/0029_local-commerce-shipment-lifecycle.sql");
  assert.doesNotMatch(sql, /digital_grants|download_(?:tickets|attempts)|refund_|supplier_|warehouse_/i);
  assert.doesNotMatch(sql, /update local_commerce\.(?:orders|order_purchase_snapshots|order_item_purchase_snapshots|payment_attempts|fulfillments)/i);
});
