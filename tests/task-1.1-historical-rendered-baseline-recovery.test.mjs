import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function readRecovery() {
  return readFile(
    new URL(
      "openspec/changes/complete-local-commerce-persistence/task-1.1-historical-rendered-baseline-recovery.md",
      root,
    ),
    "utf8",
  );
}

async function readSourceEvent() {
  const raw = await readFile(
    new URL(
      "openspec/changes/complete-local-commerce-persistence/task-1.1-historical-command-event.jsonl",
      root,
    ),
    "utf8",
  );
  const lines = raw.trimEnd().split("\n");
  assert.equal(lines.length, 1);
  return JSON.parse(lines[0]);
}

const expectedFailures = [
  {
    location: "tests/figmemento-fusion-shell-rendered.test.mjs:15:1",
    name: "rendered real routes expose the Fusion shell and safe unavailable state",
    digest: "718529982",
  },
  {
    location: "tests/figmemento-fusion-shell-rendered.test.mjs:38:1",
    name: "rendered unavailable catalog keeps the existing safe state and no fixture substitution",
    digest: "1129843323",
  },
  {
    location: "tests/rendered-html.test.mjs:33:1",
    name: "server-rendered V2 routes preserve the shared presentation shell and safe states",
    digest: "2821852582",
  },
  {
    location: "tests/rendered-html.test.mjs:77:1",
    name: "server-renders Local V1 customer and support entry surfaces",
    digest: "1080760043",
  },
];

test("Task 1.1 source event independently retains the parent command and historical rendered aggregate", async () => {
  const source = await readSourceEvent();
  const stdout = source.payload.item.stdout;

  assert.equal(source.timestamp, "2026-09-10T06:04:49.629Z");
  assert.equal(source.type, "event_msg");
  assert.equal(source.payload.item.type, "CommandExecution");
  assert.deepEqual(source.payload.item.command, ["/bin/zsh", "-lc", "npm run verify"]);
  assert.match(stdout, /> site-creator-vinext-starter@0\.1\.0 test:rendered/);
  assert.match(
    stdout,
    /> node --test tests\/rendered-html\.test\.mjs tests\/shopping-cart-rendered\.test\.mjs tests\/local-fulfillment-rendered\.test\.mjs tests\/local-tracking-rendered\.test\.mjs tests\/figmemento-fusion-shell-rendered\.test\.mjs/,
  );
  assert.match(stdout, /ℹ tests 11[\s\S]*ℹ pass 7[\s\S]*ℹ fail 4/);
});

test("Task 1.1 source event contains the four original TAP failure records", async () => {
  const source = await readSourceEvent();
  const records = [
    ...source.payload.item.stdout.matchAll(
      /test at ([^\n]+)\n✖ (.+?) \([^)]+ms\)\n  \[Error: An error occurred in the Server Components render\. The specific message is omitted in production builds to avoid leaking sensitive details\. A digest property is included on this error instance which may provide additional details about the nature of the error\.\] \{ digest: '(\d+)' \}/g,
    ),
  ].map((match) => ({
    location: match[1],
    name: match[2],
    digest: match[3],
  }));

  assert.deepEqual(records, expectedFailures);
});

test("Task 1.1 recovery records the exact contemporaneous rendered 7/11 source and aggregate", async () => {
  const recovery = await readRecovery();

  assert.match(recovery, /Status: \*\*PASS — INDEPENDENTLY ACCEPTED\*\*/);
  assert.match(recovery, /Task 1\.1 was independently accepted and is checked complete/);
  assert.match(recovery, /rollout-2026-08-07T09-35-08-019fd9dc-19c0-7543-bb24-5231f3cd2a01\.jsonl/);
  assert.match(recovery, /JSONL line: `100087`/);
  assert.match(recovery, /2026-09-10T06:04:49\.629Z/);
  assert.match(recovery, /parent command: npm run verify/);
  assert.match(recovery, /npm lifecycle stage: test:rendered/);
  assert.match(recovery, /tests 11[\s\S]*pass 7[\s\S]*fail 4/);
});

test("Task 1.1 recovery preserves all four exact historical failure identities and digests", async () => {
  const [source, recovery] = await Promise.all([
    readSourceEvent(),
    readRecovery(),
  ]);

  for (const failure of expectedFailures) {
    assert.ok(source.payload.item.stdout.includes(failure.location));
    assert.ok(source.payload.item.stdout.includes(failure.name));
    assert.ok(source.payload.item.stdout.includes(`digest: '${failure.digest}'`));
    assert.match(recovery, new RegExp(failure.location.replaceAll(".", "\\.")));
    assert.match(recovery, new RegExp(failure.name.replaceAll(".", "\\.")));
    assert.ok(
      recovery.includes(`digest '${failure.digest}'`) ||
        recovery.includes(`digest \`${failure.digest}\``),
    );
  }

  assert.equal((recovery.match(/Historical status: \*\*FAIL\*\*/g) ?? []).length, 4);
});

test("Task 1.1 recovery bounds cause claims and separates current rendered status", async () => {
  const recovery = await readRecovery();

  assert.equal(
    (recovery.match(/No deeper root cause is asserted\./g) ?? []).length,
    4,
  );
  assert.match(recovery, /Present-day rendered validation is a separate fact/);
  assert.match(recovery, /current `11\/11` pass demonstrates\s+the current tree only/);
  assert.match(recovery, /No application code, business authority, schema, migration, fixture, remote\s+service or production system was modified or accessed/);
});
