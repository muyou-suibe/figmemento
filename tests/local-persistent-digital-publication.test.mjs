import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Task 9.1 reuses signed Admin and same-origin authority before persistent publication", async () => {
  const server = await source("app/server/local-persistent-digital-publication.server.ts");
  const route = await source("app/api/admin/digital-delivery/route.ts");
  assert.match(server, /createExistingAdminMutationVerifier/);
  assert.match(server, /isSameOriginAdminMutation/);
  assert.match(server, /requiredCapabilities: \["admin"\]/);
  assert.match(route, /readAdminAcceptanceConfiguration/);
  assert.match(route, /source\.source === "local_persistent"/);
  assert.match(route, /source\.source === "local_fake"/);
  assert.match(route, /\^PG-/);
});

test("Task 9.1 detects private bytes and exposes no locator projection", async () => {
  const server = await source("app/server/local-persistent-digital-publication.server.ts");
  for (const signature of ["0xff", "0x89", "RIFF", "WEBP", "%PDF-", "0x50"]) assert.match(server, new RegExp(signature));
  assert.match(server, /downloadPrivateObject/);
  assert.match(server, /readbackDigest === contentDigest/);
  assert.doesNotMatch(server.slice(server.indexOf("export interface SafeDigitalPublication"), server.indexOf("function hex")), /locator|contentReference|storagePath|bucket|signed/i);
  assert.doesNotMatch(server, /createSignedUrl|publicUrl|fetch\(.*https?:/i);
});

test("0031 owns exact digital item gates, immutable versions, replay and late-result safety", async () => {
  const sql = await source("local/commerce/migrations/0031_local-commerce-digital-publication.sql");
  for (const gate of [
    "lifecycle_status <> 'paid'", "outcome='succeeded'", "fulfillment_type <> 'digital'",
    "review_state='approved'", "requiresProductionPreview", "customer_approve", "operator_timeout",
    "max(version_number)", "digital_versions_current_item_key", "status in ('pending', 'ready', 'failed')",
    "version_number>target.version_number", "content_digest", "content_reference",
  ]) assert.match(sql, new RegExp(gate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.ok(sql.indexOf("select * into prior") < sql.indexOf("purchase.lifecycle_status <> 'paid'"));
  assert.match(sql, /previous|prior/);
  assert.match(sql, /replayed/);
  assert.doesNotMatch(sql, /insert into local_commerce\.(digital_grants|digital_tickets|digital_delivery_attempts)/);
  assert.doesNotMatch(sql, /insert into local_commerce\.(shipments|shipment_events)|supplier/i);
  assert.doesNotMatch(sql, /\bbegin\s*;/i, "ledger wrapper owns outer transaction");
});

test("0031 RPCs are service-role-only and retain RLS/private storage boundaries", async () => {
  const sql = await source("local/commerce/migrations/0031_local-commerce-digital-publication.sql");
  for (const fn of ["digital_publication_command", "digital_publication_complete"]) {
    assert.match(sql, new RegExp(`revoke all on function local_commerce\\.${fn}[\\s\\S]+from public, anon, authenticated`));
    assert.match(sql, new RegExp(`grant execute on function local_commerce\\.${fn}[\\s\\S]+to service_role`));
  }
  assert.match(sql, /security definer/g);
  assert.match(sql, /set search_path\s*=\s*pg_catalog,\s*local_commerce/g);
});
