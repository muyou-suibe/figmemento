import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

import { sha256Text } from "../../app/application/local-commerce-migration-ledger.ts";
import { literal } from "../../scripts/local-commerce-ledger-wrapper.mjs";
import { RETAINED_LEDGER_IDENTITY, retainedLedgerWrappers } from "../../scripts/local-commerce-retained-ledger-wrapper.mjs";

const root = path.resolve(".");
const commerceRoot = path.join(root, "local", "commerce");
const markerPath = path.join(commerceRoot, "runtime", "project-marker.json");
const manifestPath = path.join(commerceRoot, "migrations", "manifest.json");
const signature = "local_commerce.order_commit(text,text,text,text,uuid,text,timestamptz,text,uuid,integer,text,text,text,timestamptz,timestamptz,jsonb)";
const mode = process.argv[2];

assert.ok(mode === "--rollback-only" || mode === "--apply-authorized-0041");

function command(binary, args, input, timeout = 30_000) {
  const result = spawnSync(binary, args, { cwd: root, input, encoding: "utf8", timeout, maxBuffer: 32 * 1024 * 1024 });
  assert.equal(result.error, undefined, `${binary} bounded execution failed`);
  assert.equal(result.status, 0, (result.stderr || "command failed").split("\n")[0]);
  return result.stdout.trim();
}

const markerBytes = readFileSync(markerPath);
const marker = JSON.parse(markerBytes.toString("utf8"));
const markerDigest = sha256Text(JSON.stringify(marker));
assert.deepEqual(marker, {
  format: "figmemento-local-commerce-marker/v1",
  projectId: RETAINED_LEDGER_IDENTITY.projectId,
  environment: RETAINED_LEDGER_IDENTITY.environment,
  projectKind: RETAINED_LEDGER_IDENTITY.projectKind,
  runId: RETAINED_LEDGER_IDENTITY.runId,
  schema: "local_commerce",
  postgresMajorVersion: RETAINED_LEDGER_IDENTITY.postgresMajorVersion,
  createdAt: marker.createdAt,
});

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
assert.equal(manifest.schemaVersion, 41);
assert.equal(manifest.migrations.length, 41);
assert.equal(manifest.migrations.some((entry) => entry.version === 42), false);
for (const migration of manifest.migrations) {
  assert.equal(createHash("sha256").update(readFileSync(path.join(commerceRoot, "migrations", migration.filename))).digest("hex"), migration.checksum);
}
const sources = manifest.migrations.map((migration) => readFileSync(path.join(commerceRoot, "migrations", migration.filename), "utf8"));
const wrapper = retainedLedgerWrappers(manifest, sources, marker, markerDigest).at(-1);
assert.ok(wrapper);

const ids = command("docker", ["ps", "--filter", `label=com.supabase.cli.project=${RETAINED_LEDGER_IDENTITY.projectId}`, "--format", "{{.ID}}"]).split("\n").filter(Boolean);
const containers = JSON.parse(command("docker", ["inspect", ...ids]));
const databaseCandidates = containers.filter((container) =>
  container.Name === "/supabase_db_figmemento-local-commerce"
  && container.Config?.Labels?.["com.supabase.cli.project"] === RETAINED_LEDGER_IDENTITY.projectId
  && container.Config?.Labels?.["com.supabase.cli.workdir"] === commerceRoot
  && container.State?.Running === true
  && container.Mounts?.some((mount) => mount.Type === "volume" && mount.Name === "supabase_db_figmemento-local-commerce" && mount.Destination === "/var/lib/postgresql/data"),
);
assert.equal(databaseCandidates.length, 1);
assert.match(databaseCandidates[0].Config.Image, /postgres:17(?:\.|$)/);
const database = databaseCandidates[0].Id;
const sql = (query, timeout = 30_000) => command("docker", ["exec", "-i", database, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], query, timeout);
const ledger = () => JSON.parse(sql("select coalesce(json_agg(json_build_object('version',version,'checksum',checksum) order by version),'[]') from local_commerce.migration_ledger;"));
const definition = () => sql(`select pg_get_functiondef('${signature}'::regprocedure);`);

assert.equal(sql("select current_setting('server_version_num')::int/10000;"), "17");
assert.equal(sql(`select local_commerce.verify_project_identity(${literal(RETAINED_LEDGER_IDENTITY.projectId)},${literal(markerDigest)});`), "t");
assert.equal(ledger().length, 40);
assert.match(definition(), /amountCents\":null/);

if (mode === "--rollback-only") {
  const before = definition();
  const body = wrapper.replace(/^.*?\nbegin;\n/s, "").replace(/\ncommit;\s*$/s, "");
  sql(`begin;\n${body}\nrollback;`, 60_000);
  assert.equal(definition(), before);
  assert.equal(ledger().length, 40);
  assert.equal(sql(`select schema_version from local_commerce.project_identities where project_id=${literal(RETAINED_LEDGER_IDENTITY.projectId)};`), "40");
  console.log(JSON.stringify({ status: "PASS", mode: "rollback-only", projectId: RETAINED_LEDGER_IDENTITY.projectId, postgresMajor: 17, baseline: "40/40", functionUnchanged: true, ledgerUnchanged: true, priorMigrationsImmutable: true, remote: false }));
} else {
  sql(wrapper, 60_000);
  const after = definition();
  assert.match(after, /amount\":null/);
  assert.doesNotMatch(after, /amountCents\":null/);
  assert.equal(ledger().length, 41);
  assert.deepEqual(ledger().at(-1), { version: 41, checksum: manifest.migrations.at(-1).checksum });
  assert.equal(sql(`select schema_version from local_commerce.project_identities where project_id=${literal(RETAINED_LEDGER_IDENTITY.projectId)};`), "41");
  assert.equal(sql(`select local_commerce.verify_project_identity(${literal(RETAINED_LEDGER_IDENTITY.projectId)},${literal(markerDigest)});`), "t");
  for (const role of ["public", "anon", "authenticated"]) assert.equal(sql(`select has_function_privilege('${role}','${signature}','execute');`), "f");
  assert.equal(sql(`select has_function_privilege('service_role','${signature}','execute');`), "t");
  console.log(JSON.stringify({ status: "PASS", mode: "apply-authorized-0041", projectId: RETAINED_LEDGER_IDENTITY.projectId, postgresMajor: 17, ledger: "41/41", pending: 0, markerVerified: true, priorMigrationsImmutable: true, security: "PASS", remote: false }));
}
