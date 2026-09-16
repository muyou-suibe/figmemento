import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Task 9.6 reuses signed Admin and same-origin authority for canonical grant revocation", async () => {
  const server = await source("app/server/local-persistent-digital-revocation.server.ts");
  const route = await source("app/api/admin/digital-delivery/route.ts");
  for (const boundary of ["createExistingAdminMutationVerifier", "isSameOriginAdminMutation", "requiredCapabilities: [\"admin\"]", "digital_grant_revoke"]) {
    assert.match(server, new RegExp(boundary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(route, /export async function DELETE/);
  assert.doesNotMatch(server, /customer.*capability|email|Supabase Auth/i);
});

test("0036 revokes only the canonical grant without ticket locking or quota reset", async () => {
  const sql = await source("local/commerce/migrations/0036_local-commerce-digital-grant-revocation.sql");
  for (const fact of ["revocation_action_key", "revocation_context_digest", "revoked_by", "revocation_result", "grant_status='revoked'", "lifecycle='revoked'", "revoked_at=stamp", "version=version+1"]) {
    assert.match(sql, new RegExp(fact.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(sql, /for share[\s\S]+for share[\s\S]+digital_grants[\s\S]+for update/i);
  assert.doesNotMatch(sql, /update\s+local_commerce\.digital_tickets/i);
  assert.doesNotMatch(sql, /for update[\s\S]*digital_tickets/i);
  assert.doesNotMatch(sql, /used_attempts\s*=|max_attempts\s*=|expires_at\s*=|activated_at\s*=/i);
});

test("0036 is replay-first, conflict-binds context, and keeps restricted RPC security", async () => {
  const sql = await source("local/commerce/migrations/0036_local-commerce-digital-grant-revocation.sql");
  assert.ok(sql.indexOf("select * into prior") < sql.indexOf("select * into purchase"));
  assert.match(sql, /prior\.revocation_context_digest is distinct from p_context_digest/);
  assert.match(sql, /'replayed',true/);
  assert.match(sql, /security definer/);
  assert.match(sql, /set search_path = pg_catalog, local_commerce/);
  assert.match(sql, /revoke all on function[\s\S]+from public,anon,authenticated/);
  assert.match(sql, /grant execute on function[\s\S]+to service_role/);
  assert.doesNotMatch(sql, /insert into local_commerce\.(digital_grants|digital_tickets|digital_versions|digital_delivery_attempts)/);
});

test("Task 9.6 safe projection preserves policy and exposes no private authority", async () => {
  const server = await source("app/server/local-persistent-digital-revocation.server.ts");
  const projection = server.slice(server.indexOf("export interface SafeDigitalRevocation"), server.indexOf("function hex"));
  for (const field of ["activatedAt", "expiresAt", "maxDownloads", "consumedAttempts", "revokedAt", "version"]) assert.match(projection, new RegExp(field));
  assert.doesNotMatch(projection, /owner|ticket|token|cookie|contentReference|storage|locator|secret/i);
});
