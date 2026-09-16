import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { ledgerWrappers } from "../../scripts/local-commerce-ledger-wrapper.mjs";

const run = "run-5576dfd8";
const project = `figmemento-local-commerce-test-${run}`;
const dir = `${process.cwd()}/local/commerce/runtime/disposable/${run}`;
const prep = JSON.parse(readFileSync(`${dir}/ledger-preparation.json`, "utf8"));
const db = "3f0a14e18d07b71e0b235dffcdc61e672086d6fb5b32b35849aa8bf54f3be3e4";
const migrationPath = "local/commerce/migrations/0029_local-commerce-shipment-lifecycle.sql";
const candidate = readFileSync(migrationPath, "utf8");
const entry = {
  version: 29,
  migrationId: "local-commerce-shipment-lifecycle",
  filename: "0029_local-commerce-shipment-lifecycle.sql",
  checksum: createHash("sha256").update(candidate).digest("hex"),
  rollback: "Disable persistent Shipment lifecycle commands and preserve every Shipment, event, action, immutable purchase fact and ledger row. No reset, deletion, reseed or upstream rewrite.",
  forwardFix: "After permanent application use 0030+ only on authorized run-5576dfd8. Never edit applied 0001-0029. Preserve ordered events, terminal delivery and exact action replay.",
};

function docker(args, input) {
  const result = spawnSync("docker", args, { input, encoding: "utf8", timeout: 30000, maxBuffer: 16 * 1024 * 1024 });
  assert.equal(result.status, 0, result.error?.code ?? result.stderr);
  return result.stdout.trim();
}
const inspected = JSON.parse(docker(["inspect", db]))[0];
assert.equal(inspected.Id, db);
assert.equal(inspected.State.Status, "running");
assert.equal(inspected.Config.Labels["com.supabase.cli.workdir"], dir);
assert.equal(prep.config.projectId, project);
assert.equal(prep.config.projectKind, "disposable_test");
const sql = (query) => docker(["exec", "-i", db, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], query);
assert.equal(sql("select current_setting('server_version_num')::int/10000;"), "17");
assert.equal(sql(`select local_commerce.verify_project_identity('${project}','${prep.markerDigest}');`), "t");

const manifest = JSON.parse(readFileSync("local/commerce/migrations/manifest.json", "utf8"));
const baseline = manifest.schemaVersion === 29
  ? { ...manifest, schemaVersion: 28, migrations: manifest.migrations.slice(0, 28) }
  : manifest;
assert.equal(baseline.schemaVersion, 28);
assert.equal(baseline.migrations.length, 28);
const ledger = JSON.parse(sql("select json_agg(l order by version) from local_commerce.migration_ledger l;"));
assert.equal(ledger.length, 28);
baseline.migrations.forEach((migration, index) => {
  assert.equal(ledger[index].version, migration.version);
  assert.equal(ledger[index].checksum, migration.checksum);
  assert.equal(createHash("sha256").update(readFileSync(`local/commerce/migrations/${migration.filename}`)).digest("hex"), migration.checksum);
});
const planned = { ...baseline, schemaVersion: 29, migrations: [...baseline.migrations, entry] };
assert.deepEqual(manifest.migrations.at(-1), entry);
const sources = planned.migrations.map((migration) => readFileSync(`local/commerce/migrations/${migration.filename}`, "utf8"));
const wrapper = ledgerWrappers(planned, sources, project, prep.markerDigest).at(-1);
const tables = JSON.parse(sql("select json_agg(format('%I.%I',schemaname,tablename) order by schemaname,tablename) from pg_tables where schemaname='local_commerce';"));
const snapshot = () => sql(tables.map((table) => `select '${table}',count(*),md5(coalesce(string_agg(to_jsonb(t)::text,',' order by to_jsonb(t)::text),'')) from ${table} t;`).join("\n"));
const before = snapshot();
const validation = `
do $test$
begin
  if not exists(select 1 from information_schema.columns where table_schema='local_commerce' and table_name='shipments' and column_name='shipped_at')
    or not exists(select 1 from information_schema.columns where table_schema='local_commerce' and table_name='shipments' and column_name='in_transit_at')
    or not exists(select 1 from information_schema.columns where table_schema='local_commerce' and table_name='shipments' and column_name='delivered_at')
    then raise exception 'Shipment lifecycle timestamps missing'; end if;
  if has_function_privilege('public','local_commerce.shipment_command(text,text,text,text,text,text,text,integer,text,text)','execute')
    or has_function_privilege('anon','local_commerce.shipment_command(text,text,text,text,text,text,text,integer,text,text)','execute')
    or has_function_privilege('authenticated','local_commerce.shipment_command(text,text,text,text,text,text,text,integer,text,text)','execute')
    or not has_function_privilege('service_role','local_commerce.shipment_command(text,text,text,text,text,text,text,integer,text,text)','execute')
    or has_function_privilege('service_role','local_commerce.shipment_create_command_0028(text,text,text,text,text,text,text,integer,text,text)','execute')
    then raise exception 'Shipment lifecycle command ACL mismatch'; end if;
  if position('mark_delivered' in pg_get_constraintdef((select oid from pg_constraint where conrelid='local_commerce.shipment_actions'::regclass and conname='shipment_actions_kind_check'))) = 0
    then raise exception 'Shipment action kinds not extended'; end if;
end $test$;
`;
try {
  sql(wrapper.replace("begin;", "begin;set local statement_timeout='15000ms';").replace(/commit;\s*$/, `${validation}\nrollback;`));
} finally {
  assert.equal(snapshot(), before, "rollback-only lifecycle pre-apply changed canonical tables");
}
assert.equal(sql("select count(*) from local_commerce.migration_ledger;"), "28");
console.info(JSON.stringify({ status: "PASS", scope: "Task 8.5 rollback-only pre-apply", run, project, ledger: 28, pending: 0, candidateApplied: false, checksum: entry.checksum, immutableTableDigest: createHash("sha256").update(before).digest("hex") }));

if (process.argv.includes("--apply-authorized-0029")) {
  sql(wrapper);
  const after = JSON.parse(sql("select json_agg(l order by version) from local_commerce.migration_ledger l;"));
  assert.equal(after.length, 29);
  planned.migrations.forEach((migration, index) => {
    assert.equal(after[index].version, migration.version);
    assert.equal(after[index].checksum, migration.checksum);
  });
  assert.equal(sql(`select local_commerce.verify_project_identity('${project}','${prep.markerDigest}');`), "t");
  console.info(JSON.stringify({ status: "PASS", applied: 29, ledger: 29, pending: 0, checksum: entry.checksum }));
}
