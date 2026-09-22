// Exact retained-development Phase 3 incremental apply. No reset/reseed.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readLocalCommerceConfig, validateProjectMarker } from "../app/application/local-commerce-environment.ts";
import { planMigrationLedger, sha256Text } from "../app/application/local-commerce-migration-ledger.ts";
import { retainedLedgerWrappers, RETAINED_LEDGER_IDENTITY } from "./local-commerce-retained-ledger-wrapper.mjs";

assert.ok(process.argv.includes("--confirm-retained-phase3"));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workdir = path.join(root, "local", "commerce");
const selected = readLocalCommerceConfig(process.env);
assert.equal(selected.status, "ready");
assert.deepEqual({ projectId: selected.config.projectId, environment: selected.config.environment,
  projectKind: selected.config.projectKind, runId: selected.config.runId,
  postgresMajorVersion: selected.config.postgresMajorVersion }, RETAINED_LEDGER_IDENTITY);
const marker = JSON.parse(readFileSync(path.join(workdir, "runtime", "project-marker.json"), "utf8"));
assert.equal(validateProjectMarker(marker, selected.config), true);
const markerDigest = sha256Text(JSON.stringify(marker));
const manifest = JSON.parse(readFileSync(path.join(workdir, "migrations", "manifest.json"), "utf8"));
assert.equal(manifest.schemaVersion, 48);
assert.deepEqual(manifest.migrations.slice(46).map(item => item.filename), [
  "0047_local-commerce-refund-aggregate.sql", "0048_local-commerce-webhook-inbox.sql" ]);
const sources = manifest.migrations.map(item => readFileSync(path.join(workdir, "migrations", item.filename), "utf8"));
for (const [index, item] of manifest.migrations.entries()) {
  assert.equal(createHash("sha256").update(sources[index]).digest("hex"), item.checksum);
}
const wrappers = retainedLedgerWrappers(manifest, sources, marker, markerDigest);
function command(binary, args, input, timeout = 30_000) {
  const result = spawnSync(binary, args, { input, encoding: "utf8", timeout, maxBuffer: 4_000_000 });
  assert.equal(result.status, 0, `${binary}: ${result.error?.code ?? "bounded command failed"}`);
  return result.stdout.trim();
}
const ids = command("docker", ["ps", "--filter", "label=com.supabase.cli.project=figmemento-local-commerce",
  "--format", "{{.ID}}"]).split("\n").filter(Boolean);
const exact = ids.map(id => JSON.parse(command("docker", ["inspect", id]))[0]).filter(item =>
  item.Config.Labels?.["com.supabase.cli.workdir"] === workdir
  && item.Config.Labels?.["com.supabase.cli.project"] === "figmemento-local-commerce"
  && item.Name.startsWith("/supabase_db_") && item.State.Running === true
  && item.State.Health?.Status === "healthy"
  && item.Mounts.some(mount => mount.Type === "volume"
    && mount.Name === "supabase_db_figmemento-local-commerce"
    && mount.Destination === "/var/lib/postgresql/data"));
assert.equal(exact.length, 1, "one healthy exact retained DB container/volume");
const sql = (statement, timeout = 30_000) => command("docker", ["exec", "-i", exact[0].Id,
  "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], statement, timeout);
assert.equal(sql("select current_setting('server_version_num')::int/10000;"), "17");
assert.equal(sql(`select local_commerce.verify_project_identity('figmemento-local-commerce','${markerDigest}');`), "t");
function ledger() {
  return JSON.parse(sql("select json_agg(json_build_object('version',version,'migrationId',migration_id,'checksum',checksum,'projectId',project_id) order by version) from local_commerce.migration_ledger;"));
}
const before = ledger();
assert.equal(before.length, 46, "retained must still be 46/46 before Phase 3");
const planned = planMigrationLedger(manifest, before, "figmemento-local-commerce");
assert.equal(planned.status, "ready");
assert.deepEqual(planned.apply.map(item => item.version), [47, 48]);
const rowsBefore = ["orders", "payment_attempts", "refund_aggregates", "webhook_inbox"].map(name => {
  if (name === "refund_aggregates" || name === "webhook_inbox") return null;
  return Number(sql(`select count(*) from local_commerce.${name} where project_id='figmemento-local-commerce';`));
});
for (const index of [46, 47]) {
  sql(wrappers[index], 120_000); // Generated wrapper atomically applies SQL + ledger.
  const after = ledger();
  assert.equal(after.length, index + 1);
  assert.deepEqual(after.map(row => row.version), Array.from({ length: index + 1 }, (_, position) => position + 1));
  assert.equal(after[index].checksum, manifest.migrations[index].checksum);
  assert.equal(sql(`select local_commerce.verify_project_identity('figmemento-local-commerce','${markerDigest}');`), "t");
  console.info(JSON.stringify({ status: "COMMITTED", version: index + 1,
    checksum: manifest.migrations[index].checksum }));
}
const after = ledger();
const finalPlan = planMigrationLedger(manifest, after, "figmemento-local-commerce");
assert.equal(finalPlan.status, "ready");
assert.equal(finalPlan.apply.length, 0);
assert.equal(sql("select schema_version from local_commerce.project_identities where project_id='figmemento-local-commerce';"), "48");
assert.equal(sql("select count(*) from local_commerce.refund_aggregates where project_id='figmemento-local-commerce';"), "0");
assert.equal(sql("select count(*) from local_commerce.webhook_inbox where project_id='figmemento-local-commerce';"), "0");
assert.equal(Number(sql("select count(*) from local_commerce.orders where project_id='figmemento-local-commerce';")), rowsBefore[0]);
assert.equal(Number(sql("select count(*) from local_commerce.payment_attempts where project_id='figmemento-local-commerce';")), rowsBefore[1]);
console.info(JSON.stringify({ status: "PASS", projectId: "figmemento-local-commerce",
  environment: "development", projectKind: "retained_development", runId: "retained-development",
  postgresMajor: 17, ledger: "48/48", pending: 0, sourceMismatch: 0,
  retainedOrderCountUnchanged: true, retainedPaymentCountUnchanged: true,
  newRefundRows: 0, newInboxRows: 0, remoteAccess: false }));
