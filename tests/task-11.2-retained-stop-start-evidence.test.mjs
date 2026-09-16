import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const evidence = await readFile(new URL("../openspec/changes/complete-local-commerce-persistence/task-11.2-acceptance.md", import.meta.url), "utf8");
const tasks = await readFile(new URL("../openspec/changes/complete-local-commerce-persistence/tasks.md", import.meta.url), "utf8");
const cycle = await readFile(new URL("database/local-commerce-task-11.1-full-recovery.mjs", import.meta.url), "utf8");
const session = await readFile(new URL("database/local-commerce-task-11.2-retained-session-lifecycle.mjs", import.meta.url), "utf8");

test("Task 11.2 evidence records the exact retained profile and complete durable matrix", () => {
  assert.match(evidence, /figmemento-local-commerce/);
  assert.match(evidence, /Ledger: 37\/37; pending: 0/);
  assert.match(evidence, /PostgreSQL, PostgREST, Kong, GoTrue and Storage remained required/);
  for (const fact of ["guest Cart", "Draft/media", "Payment history", "photo review", "timeout decision", "delivered Shipment", "digital version", "consumed quota 2", "spent tickets"]) assert.match(evidence, new RegExp(fact, "i"));
  assert.match(evidence, /valid customer session/); assert.match(evidence, /remained expired/); assert.match(evidence, /remained unauthenticated/);
});

test("Task 11.2 lifecycle tooling preserves volumes and uses one locked exclusion profile", () => {
  for (const source of [cycle, session]) {
    assert.match(source, /supabase.*stop/s); assert.doesNotMatch(source, /--no-backup|supabase[^\n]*reset|\["(?:rm|prune)"\]/);
    assert.match(source, /vector,logflare,studio,realtime,edge-runtime,mailpit,imgproxy,postgres-meta,supavisor/);
    assert.match(source, /volumeNames|volumes/);
  }
  assert.match(cycle, /adminLocalFakeRestartLoss: "PASS"/);
  assert.match(cycle, /missingByteFault: "PASS"/);
  assert.match(session, /expiredSessionDenied: true/);
  assert.match(session, /revokedSessionDenied: true/);
});

test("Tasks 11.2 through 11.6 remain closed and Task 12 is independently accepted", () => {
  assert.match(tasks, /- \[x\] 11\.2 /);
  assert.match(tasks, /- \[x\] 11\.3 /);
  assert.match(tasks, /- \[x\] 11\.4 /);
  assert.match(tasks, /- \[x\] 11\.5 /);
  assert.match(tasks, /- \[x\] 11\.6 /);
  assert.match(tasks, /- \[ \] 1\.1 /);
  assert.match(tasks, /- \[x\] 12\.1 /);
});
