import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const runner = readFileSync("tests/database/local-commerce-task-11.3-disposable-rebuild.mjs", "utf8");
const evidence = readFileSync("openspec/changes/complete-local-commerce-persistence/task-11.3-acceptance.md", "utf8");
const tasks = readFileSync("openspec/changes/complete-local-commerce-persistence/tasks.md", "utf8");

test("Task 11.3 runner is exact-disposable and validates the full current ledger", () => {
  assert.match(runner, /\^run-\[a-f0-9\]\{8\}\$/);
  assert.match(runner, /--confirm-task-11\.3-disposable/);
  assert.match(runner, /projectKind, "disposable_test"/);
  assert.match(runner, /environment, "test"/);
  assert.match(runner, /manifest\.schemaVersion, 37/);
  assert.match(runner, /applied\.length, 37/);
  assert.match(runner, /plan\.apply\.length, 0/);
  assert.doesNotMatch(runner, /https:\/\//);
});

test("Task 11.3 evidence distinguishes fresh, reset rebuild, and interrupted recovery", () => {
  assert.match(evidence, /Fresh construction/);
  assert.match(evidence, /Migration rerun/);
  assert.match(evidence, /Guarded reset and from-zero rebuild/);
  assert.match(evidence, /Interrupted migration recovery/);
  assert.match(evidence, /failed interruption attempt, not acceptance evidence/);
  assert.match(evidence, /old fresh Product count was zero/);
  assert.match(evidence, /both.*probe.*absent/is);
  assert.match(evidence, /retained development project remained/);
});

test("Task 11.3 records no migration or production-authority expansion", () => {
  assert.match(evidence, /Migrations: 0001–0037; no 0038/);
  assert.match(evidence, /No retained, root\/default, historical, remote, or production project was reset/);
  assert.match(evidence, /changes no Catalog,\nOrder, Payment, Fulfillment, Supplier, Shipment, Tracking, or digital business\nauthority/);
  assert.match(tasks, /^- \[x\] 11\.3 /m);
  assert.match(tasks, /^- \[x\] 11\.4 /m);
  assert.match(tasks, /^- \[x\] 11\.5 /m);
  assert.match(tasks, /^- \[x\] 11\.6 /m);
  assert.match(tasks, /^- \[x\] 12\.1 /m);
});
