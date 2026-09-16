import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readLocalCommerceConfig, validateProjectMarker } from "../app/application/local-commerce-environment.ts";
import { planMigrationLedger, sha256Text } from "../app/application/local-commerce-migration-ledger.ts";
import { literal } from "./local-commerce-ledger-wrapper.mjs";
import { RETAINED_LEDGER_IDENTITY, retainedLedgerWrappers } from "./local-commerce-retained-ledger-wrapper.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const commerceRoot = path.join(root, "local", "commerce");
const markerPath = path.join(commerceRoot, "runtime", "project-marker.json");
const manifestPath = path.join(commerceRoot, "migrations", "manifest.json");
const expectedDbVolume = "supabase_db_figmemento-local-commerce";
const command = process.argv[2] ?? "verify";

function load() {
  const selected = readLocalCommerceConfig(process.env);
  if (selected.status !== "ready" || JSON.stringify({
    projectId: selected.config.projectId,
    environment: selected.config.environment,
    projectKind: selected.config.projectKind,
    runId: selected.config.runId,
    postgresMajorVersion: selected.config.postgresMajorVersion,
  }) !== JSON.stringify(RETAINED_LEDGER_IDENTITY)) {
    throw new Error("Exact retained-development environment required");
  }
  const markerBytes = readFileSync(markerPath);
  const marker = JSON.parse(markerBytes.toString("utf8"));
  if (!validateProjectMarker(marker, selected.config)) throw new Error("Retained marker mismatch");
  const markerDigest = sha256Text(JSON.stringify(marker));
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const sources = manifest.migrations.map((migration) =>
    readFileSync(path.join(commerceRoot, "migrations", migration.filename), "utf8"));
  const wrappers = retainedLedgerWrappers(manifest, sources, marker, markerDigest);
  return {
    config: selected.config,
    marker,
    markerDigest,
    markerFileDigest: createHash("sha256").update(markerBytes).digest("hex"),
    manifest,
    sources,
    wrappers,
  };
}

function run(binary, args, options = {}) {
  const result = spawnSync(binary, args, {
    cwd: root,
    encoding: "utf8",
    timeout: options.timeout ?? 30_000,
    input: options.input,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw new Error((result.error?.message || result.stderr || "bounded command failed").split("\n")[0]);
  }
  return result.stdout.trim();
}

function exactDatabase() {
  const ids = run("docker", ["ps", "--filter", `label=com.supabase.cli.project=${RETAINED_LEDGER_IDENTITY.projectId}`, "--format", "{{.ID}}"])
    .split("\n").filter(Boolean);
  const inspected = ids.length ? JSON.parse(run("docker", ["inspect", ...ids])) : [];
  const databases = inspected.filter((container) =>
    container.Config?.Labels?.["com.supabase.cli.project"] === RETAINED_LEDGER_IDENTITY.projectId &&
    container.Config?.Labels?.["com.supabase.cli.workdir"] === commerceRoot &&
    container.Name?.startsWith("/supabase_db_") &&
    container.State?.Running === true &&
    container.Mounts?.some((mount) => mount.Type === "volume" && mount.Name === expectedDbVolume && mount.Destination === "/var/lib/postgresql/data"));
  if (databases.length !== 1) throw new Error("Exact retained PostgreSQL container unavailable");
  return databases[0].Id;
}

function psql(database, sql, timeout = 30_000) {
  return run("docker", ["exec", "-i", database, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], { input: sql, timeout });
}

function readLedger(database) {
  return JSON.parse(psql(database, `select coalesce(json_agg(json_build_object('version',version,'migrationId',migration_id,'checksum',checksum,'projectId',project_id) order by version),'[]') from local_commerce.migration_ledger;`));
}

const loaded = load();
if (command === "verify") {
  console.log(JSON.stringify({
    status: "VERIFIED",
    projectId: loaded.config.projectId,
    environment: loaded.config.environment,
    projectKind: loaded.config.projectKind,
    runId: loaded.config.runId,
    postgresMajorVersion: loaded.config.postgresMajorVersion,
    markerFileDigest: loaded.markerFileDigest,
    canonicalMarkerDigest: loaded.markerDigest,
    migrationCount: loaded.manifest.migrations.length,
  }));
} else if (command === "preflight" || command === "apply" || command === "plan") {
  const database = exactDatabase();
  assert.equal(psql(database, "select current_setting('server_version_num')::int/10000;"), "17");
  const namespace = psql(database, "select coalesce(to_regnamespace('local_commerce')::text,'');");

  if (command === "preflight") {
    if (namespace !== "") throw new Error("Fresh retained local_commerce schema required");
    console.log(JSON.stringify({ status: "FRESH", database, schema: null, ledger: null, canonicalMarkerDigest: loaded.markerDigest }));
  } else if (command === "apply") {
    if (!process.argv.includes("--confirm-retained-initialization")) throw new Error("Explicit retained initialization confirmation required");
    if (namespace !== "") throw new Error("Fresh retained local_commerce schema required");
    let committed = 0;
    for (const [index, wrapper] of loaded.wrappers.entries()) {
      try {
        psql(database, wrapper, 120_000);
        committed = index + 1;
        const ledger = readLedger(database);
        assert.equal(ledger.length, committed);
        assert.deepEqual(ledger.map((entry) => entry.version), Array.from({ length: committed }, (_, offset) => offset + 1));
        assert.deepEqual(ledger, loaded.manifest.migrations.slice(0, committed).map((migration) => ({
          version: migration.version,
          migrationId: migration.migrationId,
          checksum: migration.checksum,
          projectId: RETAINED_LEDGER_IDENTITY.projectId,
        })));
        if (committed >= 2) {
          assert.equal(psql(database, `select count(*) from local_commerce.project_identities where project_id=${literal(RETAINED_LEDGER_IDENTITY.projectId)} and environment='development' and project_kind='retained_development' and schema_version=${committed} and marker_digest=${literal(loaded.markerDigest)} and lifecycle='active';`), "1");
        }
        console.log(JSON.stringify({ status: "COMMITTED", version: committed, migrationId: loaded.manifest.migrations[index].migrationId }));
      } catch (error) {
        throw new Error(`Migration ${index + 1} failed after committed prefix ${committed}: ${error.message}`);
      }
    }
    console.log(JSON.stringify({ status: "APPLIED", ledger: committed, pending: loaded.manifest.schemaVersion - committed, canonicalMarkerDigest: loaded.markerDigest }));
  } else {
    if (namespace === "") throw new Error("Retained ledger unavailable");
    const applied = readLedger(database);
    const plan = planMigrationLedger(loaded.manifest, applied, RETAINED_LEDGER_IDENTITY.projectId);
    if (plan.status !== "ready") throw new Error(plan.detail);
    assert.equal(psql(database, `select local_commerce.verify_project_identity(${literal(RETAINED_LEDGER_IDENTITY.projectId)},${literal(loaded.markerDigest)});`), "t");
    console.log(JSON.stringify({ status: "READY", ledger: plan.skipped.length, pending: plan.apply.length, canonicalMarkerDigest: loaded.markerDigest }));
  }
} else {
  throw new Error("Use verify, preflight, apply --confirm-retained-initialization, or plan");
}
