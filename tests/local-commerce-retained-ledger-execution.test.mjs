import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { sha256Text } from "../app/application/local-commerce-migration-ledger.ts";
import { ledgerWrappers } from "../scripts/local-commerce-ledger-wrapper.mjs";
import {
  RETAINED_LEDGER_IDENTITY,
  retainedLedgerWrappers,
} from "../scripts/local-commerce-retained-ledger-wrapper.mjs";

const manifest = JSON.parse(readFileSync("local/commerce/migrations/manifest.json", "utf8"));
const sources = manifest.migrations.map((migration) =>
  readFileSync(`local/commerce/migrations/${migration.filename}`, "utf8"));
const marker = JSON.parse(readFileSync("local/commerce/runtime/project-marker.json", "utf8"));
const markerDigest = sha256Text(JSON.stringify(marker));

test("retained wrapper accepts only the exact retained marker and manifest", () => {
  const wrappers = retainedLedgerWrappers(manifest, sources, marker, markerDigest);
  assert.equal(wrappers.length, 37);
  assert.match(wrappers[1], /'development','retained_development',2/);
  assert.match(wrappers[2], /project_kind='retained_development'/);
  assert.match(wrappers[2], /environment='development'/);
  assert.match(wrappers[2], new RegExp(markerDigest));
  assert.throws(() => retainedLedgerWrappers({ ...manifest, projectId: "other" }, sources, marker, markerDigest));
  assert.throws(() => retainedLedgerWrappers(manifest, sources, { ...marker, runId: "run-other" }, markerDigest));
  assert.throws(() => retainedLedgerWrappers(manifest, sources, marker, "0".repeat(64)));
  assert.throws(() => retainedLedgerWrappers(manifest, [sources[0] + " ", ...sources.slice(1)], marker, markerDigest));
});

test("retained wrappers preserve atomic migration and exact-prefix guards", () => {
  const wrappers = retainedLedgerWrappers(manifest, sources, marker, markerDigest);
  for (const [index, wrapper] of wrappers.entries()) {
    assert.equal((wrapper.match(/^begin;$/gm) ?? []).length, 1);
    assert.equal((wrapper.match(/^commit;$/gm) ?? []).length, 1);
    assert.ok(wrapper.indexOf("insert into local_commerce.migration_ledger") < wrapper.lastIndexOf("commit;"));
    assert.match(wrapper, /pg_advisory_xact_lock\(7141001\)/);
    assert.match(wrapper, new RegExp(manifest.migrations[index].checksum));
  }
  assert.match(wrappers[0], /fresh schema required/);
  assert.match(wrappers[1], /ledger mismatch/);
  assert.match(wrappers[2], /schema_version=2/);
  assert.equal((wrappers[6].match(/^begin;$/gm) ?? []).length, 1);
  assert.equal((wrappers[6].match(/^commit;$/gm) ?? []).length, 1);
});

test("disposable wrapper remains disposable-only", () => {
  assert.throws(() => ledgerWrappers(manifest, sources, RETAINED_LEDGER_IDENTITY.projectId, markerDigest));
  const disposable = ledgerWrappers(manifest, sources, "figmemento-local-commerce-test-run-a123bc45", "a".repeat(64));
  assert.equal(disposable.length, 37);
  assert.match(disposable[1], /'test','disposable_test',2/);
});

test("retained execution path contains no reset, seed, remote, or arbitrary target path", () => {
  const source = [
    readFileSync("scripts/local-commerce-ledger-retained.mjs", "utf8"),
    readFileSync("scripts/local-commerce-retained-initialize.mjs", "utf8"),
  ].join("\n");
  assert.doesNotMatch(source, /db\s+reset|seed|supabase\.com|process\.argv\[[^\]]+\].*project/i);
  assert.match(source, /figmemento-local-commerce/);
  assert.match(source, /supabase_db_figmemento-local-commerce/);
  assert.match(source, /--confirm-retained-initialization/);
  assert.match(source, /local-commerce-stack\.mjs/);
  assert.doesNotMatch(source, /docker["'],\s*\[["'](?:start|restart|run)/);
});
