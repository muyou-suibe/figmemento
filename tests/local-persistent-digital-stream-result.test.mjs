import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Task 9.7 records stream outcome only after the durable claim", async () => {
  const server = await source("app/server/local-persistent-digital-download.server.ts");
  const claim = server.indexOf('command("claim"');
  const streamResult = server.indexOf('callRestrictedRpc("digital_download_stream_result"');
  const response = server.indexOf("new Response(stream");
  assert.ok(claim >= 0 && streamResult > claim && response > streamResult);
  assert.doesNotMatch(server, /recordStreamOutcome\("streamed"\)/);
  assert.match(server, /leaves the durable result as `unknown`/);
  assert.match(server, /recordStreamOutcome\("failed"\)/);
  assert.match(server, /request\.signal\.addEventListener\("abort"/);
  assert.match(server, /async cancel\(\)/);
  assert.match(server, /remains durable `unknown`/);
});

test("0037 keeps unknown crash state and records only streamed or failed without refund", async () => {
  const sql = await source("local/commerce/migrations/0037_local-commerce-digital-stream-result.sql");
  for (const value of ["digital_download_stream_result", "stream_result_context_digest", "stream_result_at",
    "attempt_result in ('streamed','failed')", "attempt_result='unknown'", "version=version+1"]) {
    assert.match(sql, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }
  assert.doesNotMatch(sql, /update\s+local_commerce\.(digital_grants|digital_tickets)/i);
  assert.doesNotMatch(sql, /used_attempts\s*=|consumed_at\s*=|delete\s+from/i);
});

test("0037 result recording is idempotent, conflict-bound and service-role-only", async () => {
  const sql = await source("local/commerce/migrations/0037_local-commerce-digital-stream-result.sql");
  assert.match(sql, /target\.attempt_result=p_result and target\.stream_result_context_digest=p_context_digest/);
  assert.match(sql, /'replayed',true/);
  assert.match(sql, /return jsonb_build_object\('status','conflict'\)/);
  assert.match(sql, /security definer/);
  assert.match(sql, /set search_path = pg_catalog, local_commerce/);
  assert.match(sql, /from public,anon,authenticated/);
  assert.match(sql, /to service_role/);
});

test("Task 9.7 stream audit exposes no ticket, cookie, locator, URL, or PII", async () => {
  const server = await source("app/server/local-persistent-digital-download.server.ts");
  const audit = server.slice(server.indexOf("const recordStreamResult"), server.indexOf("const stream ="));
  assert.doesNotMatch(audit, /rawTicket|ticketHash|cookie|session|contentReference|url|email|serviceRole/i);
  assert.match(audit, /p_attempt_id: attemptId/);
  assert.match(audit, /p_context_digest: streamContextDigest/);
});
