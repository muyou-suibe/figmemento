import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Task 9.2 reuses existing customer Order and owner/session authorization", async () => {
  const server = await source("app/server/local-persistent-digital-grant.server.ts");
  const route = await source("app/api/local-orders/[reference]/digital-delivery/grant/route.ts");
  for (const authority of [
    "createPersistentOrderCapabilityCodec", "readPersistentOrderCapabilityCookie",
    "persistentOwnerVerifier", "readCustomerAuthSessionId",
    "hashGuestResourceCapability", "hashOpaqueCustomerSessionToken",
  ]) assert.match(server, new RegExp(authority));
  assert.match(server, /requiredCapabilities: \["delivery"\]/);
  assert.match(server, /isSameOriginCartMutation/);
  assert.match(route, /handleLocalPersistentDigitalGrantActivation/);
  assert.doesNotMatch(server, /Supabase Auth|email lookup|publicReference-only/i);
});

test("Task 9.2 owns fixed server policy and rejects browser policy fields", async () => {
  const server = await source("app/server/local-persistent-digital-grant.server.ts");
  assert.match(server, /\["orderItemId","grantActionId"\]/);
  assert.match(server, /"grant-30-days", 5/);
  assert.match(server, /2_592_000_000/);
  assert.match(server, /maxDownloads: 5/);
  assert.doesNotMatch(server, /raw token|signedUrl|storagePath|contentReference/i);
});

test("0033 extends the canonical grant once without ticket or download consumption", async () => {
  const sql = await source("local/commerce/migrations/0033_local-commerce-digital-grant.sql");
  for (const fact of [
    "digital_grants_canonical_item_key", "interval '30 days'", "max_attempts = 5",
    "used_attempts", "digital_versions", "is_current", "fulfillment_type <> 'digital'",
    "payment_attempts", "access_grants", "customer_sessions",
  ]) assert.match(sql, new RegExp(fact.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(sql, /security definer/);
  assert.match(sql, /set search_path = pg_catalog, local_commerce/);
  assert.doesNotMatch(sql, /insert into local_commerce\.(digital_tickets|digital_delivery_attempts|shipments|shipment_events)/);
  assert.doesNotMatch(sql, /update local_commerce\.digital_versions/);
  assert.doesNotMatch(sql, /\bbegin\s*;/i, "ledger wrapper owns outer transaction");
});

test("0033 RPC is service-role-only and keeps direct browser access denied", async () => {
  const sql = await source("local/commerce/migrations/0033_local-commerce-digital-grant.sql");
  assert.match(sql, /revoke all on function local_commerce\.digital_grant_activate[\s\S]+from public,anon,authenticated/);
  assert.match(sql, /grant execute on function local_commerce\.digital_grant_activate[\s\S]+to service_role/);
  const adapter = await source("app/infrastructure/local-commerce/local-persistent-supabase-adapter.server.ts");
  assert.match(adapter, /"digital_grant_activate"/);
});
