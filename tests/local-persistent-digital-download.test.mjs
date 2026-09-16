import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Task 9.4 keeps the download under existing Order and owner authority", async () => {
  const server = await source("app/server/local-persistent-digital-download.server.ts");
  const route = await source("app/api/local-orders/[reference]/digital-delivery/download/route.ts");
  for (const value of ["createPersistentOrderCapabilityCodec", "persistentOwnerVerifier",
    "hashGuestResourceCapability", "hashOpaqueCustomerSessionToken", "isSameOriginCartMutation"]) {
    assert.match(server, new RegExp(value));
  }
  assert.match(route, /export async function GET/);
  assert.doesNotMatch(route, /ticket.*params|redirect|signed/i);
  assert.match(server, /x-figmemento-download-ticket/);
});

test("Task 9.4 performs prepare, private read, digest verification, claim, then Response", async () => {
  const server = await source("app/server/local-persistent-digital-download.server.ts");
  const offsets = [
    server.indexOf('command("prepare")'),
    server.indexOf("downloadPrivateObject"),
    server.indexOf("await digest(bytes)"),
    server.indexOf('command("claim"'),
    server.indexOf("new Response(stream"),
  ];
  assert.ok(offsets.every(value => value >= 0));
  assert.deepEqual(offsets, [...offsets].sort((a, b) => a - b));
  assert.doesNotMatch(server, /createSignedUrl|publicUrl|redirect\s*\(/i);
});

test("0035 rechecks current version and atomically consumes one ticket and allowance", async () => {
  const sql = await source("local/commerce/migrations/0035_local-commerce-digital-download-claim.sql");
  for (const value of ["digital_download_prepare", "digital_download_claim", "for update",
    "ticket_row.digital_version_id<>ready_version.id", "is_current for share",
    "used_attempts=used_attempts+1", "lifecycle='consumed'",
    "insert into local_commerce.digital_delivery_attempts", "quota_before", "quota_after"]) {
    assert.match(sql, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }
  assert.doesNotMatch(sql, /create table .*downloads/i);
  assert.doesNotMatch(sql, /\bbegin\s*;/i);
});

test("0035 RPC and tables remain browser-inaccessible", async () => {
  const sql = await source("local/commerce/migrations/0035_local-commerce-digital-download-claim.sql");
  for (const name of ["digital_download_prepare", "digital_download_claim"]) {
    assert.match(sql, new RegExp(`revoke all on function local_commerce\\.${name}[\\s\\S]+from public,anon,authenticated`));
    assert.match(sql, new RegExp(`grant execute on function local_commerce\\.${name}[\\s\\S]+to service_role`));
  }
});

test("Task 9.4 response is private and locator/token are absent from projections", async () => {
  const server = await source("app/server/local-persistent-digital-download.server.ts");
  assert.match(server, /content-disposition/);
  assert.match(server, /x-content-type-options/);
  assert.match(server, /private, no-store/);
  assert.match(server, /referrer-policy/);
  assert.doesNotMatch(server, /console\.|signedUrl|serviceRole/i);
});
