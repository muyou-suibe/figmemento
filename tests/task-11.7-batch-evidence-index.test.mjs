import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, root), "utf8");
}

test("Task 11.7 indexes every required evidence class without converting blocked scope into pass", async () => {
  const index = await read(
    "openspec/changes/complete-local-commerce-persistence/task-11.7-batch-evidence-index.md",
  );

  for (const reference of [
    "task-11.1-full-recovery-acceptance.md",
    "task-11.2-acceptance.md",
    "task-11.3-acceptance.md",
    "task-11.4-concurrency-acceptance.md",
    "task-11.5-fault-injection-acceptance.md",
    "task-11.6-security-matrix-acceptance.md",
    "task-10.8-browser-experience-evidence-index.md",
  ]) {
    assert.match(index, new RegExp(reference.replaceAll(".", "\\.")));
  }

  assert.match(index, /Historical rendered 7\/11 individual failures \| BLOCKED/);
  assert.match(index, /Persistent Supplier workflow \| BLOCKED \/ UNSUPPORTED/);
  assert.match(index, /No Task 11 scenario in this table is marked FAILED/);
  assert.match(index, /Task 11 evidence cannot mark\s+Task 12 complete/);
});

test("local commerce runbooks document safe lifecycle, rebuild, helper and deferred authority", async () => {
  const [runbook, migrations, helper] = await Promise.all([
    read("local/commerce/README.md"),
    read("local/commerce/migrations/README.md"),
    read("local/commerce/image-helper/README.md"),
  ]);

  for (const phrase of [
    "Safe stop, restart and retained recovery",
    "Destructive reset and from-zero rebuild",
    "Migration rollback and forward fixes",
    "Unsupported supplier boundary",
    "Deferred production decisions",
    "C1 historical backfill and Customization Phase C",
  ]) {
    assert.match(runbook, new RegExp(phrase));
  }

  assert.match(migrations, /current reviewed\s+inventory is `0001` through `0037`/);
  assert.match(migrations, /Never edit an applied migration/);
  assert.match(helper, /integrated only for explicitly selected `local_persistent`/);
  assert.match(helper, /is still not a\s+receipt, slot, crop revision or ready publication/);
});
