import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { projectPersistentCustomerTracking } from "../app/server/local-persistent-tracking-customer.server.ts";

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const reference = "FM-LOCAL-1234567890ABCDEF";
const safe = {
  publicOrderReference: reference,
  publicShipmentReference: "FM-LOCAL-SHP-1234567890AB",
  carrierLabel: "Local Demo Carrier",
  trackingNumber: "FM-LOCAL-TRK-1234567890AB",
  status: "shipped",
  events: [
    { status: "shipment_created", label: "Local shipment created", occurredAt: "2026-09-14T01:00:00Z" },
    { status: "shipped", label: "Local shipment shipped", occurredAt: "2026-09-14T02:00:00Z" },
  ],
  createdAt: "2026-09-14T01:00:00Z",
  shippedAt: "2026-09-14T02:00:00Z",
  inTransitAt: null,
  deliveredAt: null,
  notice: "DEVELOPMENT / TEST ONLY",
};

test("persistent customer Tracking mapper exposes only the bounded safe projection", () => {
  assert.deepEqual(projectPersistentCustomerTracking(safe, reference), safe);
  const projected = projectPersistentCustomerTracking({ ...safe, internalShipmentId: crypto.randomUUID(), actorId: "operator", storageKey: "private/x" }, reference);
  assert.deepEqual(projected, safe);
  assert.doesNotMatch(JSON.stringify(projected), /internal|actor|storage|digest|owner|session|capability/i);
});

test("persistent customer Tracking mapper rejects malformed, stale and unordered wire values", () => {
  for (const value of [
    { ...safe, publicOrderReference: "FM-LOCAL-OTHER00000000000" },
    { ...safe, carrierLabel: "browser carrier" },
    { ...safe, trackingNumber: "external" },
    { ...safe, status: "delivered" },
    { ...safe, events: [...safe.events].reverse() },
    { ...safe, shippedAt: "browser time" },
  ]) assert.equal(projectPersistentCustomerTracking(value, reference), null);
});

test("0030 delegates to canonical Order authorization and remains read-only and restricted", async () => {
  const sql = await source("local/commerce/migrations/0030_local-commerce-customer-tracking-read.sql");
  assert.match(sql, /security definer[\s\S]+set search_path = pg_catalog, local_commerce/);
  assert.match(sql, /authorized := local_commerce\.read_order_history\(/);
  assert.match(sql, /'customer_summary'/);
  assert.match(sql, /revoke all[\s\S]+from public, anon, authenticated/);
  assert.match(sql, /grant execute[\s\S]+to service_role/);
  assert.doesNotMatch(sql, /\b(?:insert|update|delete|truncate)\s+(?:into\s+|from\s+)?local_commerce\./i);
});

test("persistent customer Tracking reuses capability plus guest/member owner authority", async () => {
  const server = await source("app/server/local-persistent-tracking-customer.server.ts");
  for (const required of [
    "createPersistentOrderCapabilityCodec", "readPersistentOrderCapabilityCookie",
    "persistentOwnerVerifier", "hashOpaqueCustomerSessionToken",
    "createLocalPersistentCustomerAuthProvider", '"read_customer_tracking"',
  ]) assert.ok(server.includes(required));
  assert.doesNotMatch(server, /LocalMemory|findAuthorizedSnapshot|email/i);
});

test("customer HTTP remains GET-only and preserves approved same-origin GET policy", async () => {
  const http = await source("app/server/local-tracking-customer-http.server.ts");
  const gate = await source("app/server/local-fulfillment-http.server.ts");
  assert.match(http, /request\.method !== "GET"[\s\S]+405/);
  assert.match(http, /isSameOriginLocalFulfillmentRequest/);
  assert.match(http, /resolveCanonicalLocalCommerceCapability\("tracking"\)/);
  assert.match(gate, /request\.method === "GET" && \(fetchSite === null \|\| fetchSite === "same-origin"\)/);
});

test("customer and operator authorities remain separated", async () => {
  const customer = await source("app/server/local-tracking-customer-http.server.ts");
  const operator = await source("app/server/local-tracking-operator-http.server.ts");
  assert.doesNotMatch(customer, /persistentShipmentCommand|parsePersistentShipmentAction/);
  assert.match(operator, /persistentShipmentCommand/);
  assert.match(operator, /isSameOriginLocalFulfillmentRequest/);
});
