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
const migrationPath = "local/commerce/migrations/0028_local-commerce-shipment-create.sql";
const candidate = readFileSync(migrationPath, "utf8");
const entry = {
  version: 28,
  migrationId: "local-commerce-shipment-create",
  filename: "0028_local-commerce-shipment-create.sql",
  checksum: createHash("sha256").update(candidate).digest("hex"),
  rollback: "Disable persistent Shipment commands and preserve Orders, Fulfillments, immutable purchase facts, Shipment evidence and the ledger. No reset, deletion, reseed or purchase rewrite.",
  forwardFix: "After permanent application use 0029+ only on authorized run-5576dfd8. Never edit applied 0001-0028. Preserve one Shipment per Fulfillment and server-owned carrier/tracking authority.",
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
const baseline = manifest.schemaVersion === 28
  ? { ...manifest, schemaVersion: 27, migrations: manifest.migrations.slice(0, 27) }
  : manifest;
assert.equal(baseline.schemaVersion, 27);
assert.equal(baseline.migrations.length, 27);
const ledger = JSON.parse(sql("select json_agg(l order by version) from local_commerce.migration_ledger l;"));
assert.equal(ledger.length, 27);
baseline.migrations.forEach((migration, index) => {
  assert.equal(ledger[index].version, migration.version);
  assert.equal(ledger[index].checksum, migration.checksum);
  assert.equal(createHash("sha256").update(readFileSync(`local/commerce/migrations/${migration.filename}`)).digest("hex"), migration.checksum);
});
const planned = { ...baseline, schemaVersion: 28, migrations: [...baseline.migrations, entry] };
if (manifest.schemaVersion === 28) assert.deepEqual(manifest.migrations.at(-1), entry);
const sources = planned.migrations.map((migration) => readFileSync(`local/commerce/migrations/${migration.filename}`, "utf8"));
const wrapper = ledgerWrappers(planned, sources, project, prep.markerDigest).at(-1);
const tables = JSON.parse(sql("select json_agg(format('%I.%I',schemaname,tablename) order by schemaname,tablename) from pg_tables where schemaname='local_commerce';"));
const snapshot = () => sql(tables.map((table) => `select '${table}',count(*),md5(coalesce(string_agg(to_jsonb(t)::text,',' order by to_jsonb(t)::text),'')) from ${table} t;`).join("\n"));
const before = snapshot();
const validation = `
do $test$
declare denied jsonb;
begin
  if not exists(select 1 from pg_tables where schemaname='local_commerce' and tablename='shipment_actions' and rowsecurity)
    then raise exception 'shipment_actions RLS missing'; end if;
  if not exists(select 1 from information_schema.columns where table_schema='local_commerce' and table_name='shipments' and column_name='public_reference' and is_nullable='NO')
    then raise exception 'Shipment public identity missing'; end if;
  if has_function_privilege('public','local_commerce.shipment_command(text,text,text,text,text,text,text,integer,text,text)','execute')
    or has_function_privilege('anon','local_commerce.shipment_command(text,text,text,text,text,text,text,integer,text,text)','execute')
    or has_function_privilege('authenticated','local_commerce.shipment_command(text,text,text,text,text,text,text,integer,text,text)','execute')
    or not has_function_privilege('service_role','local_commerce.shipment_command(text,text,text,text,text,text,text,integer,text,text)','execute')
    then raise exception 'Shipment command ACL mismatch'; end if;
  if has_table_privilege('anon','local_commerce.shipment_actions','select')
    or has_table_privilege('authenticated','local_commerce.shipment_actions','insert')
    then raise exception 'Shipment action table browser privilege'; end if;
  denied := local_commerce.shipment_command('${project}','${"0".repeat(64)}','operator','local-tracking-operator','FM-LOCAL-0000000000000000','prepare','create_shipment',0,'${"1".repeat(64)}',null);
  if denied->>'status' <> 'unavailable' then raise exception 'wrong marker accepted'; end if;
end $test$;
`;
try {
  sql(wrapper.replace("begin;", "begin;set local statement_timeout='15000ms';").replace(/commit;\s*$/, `${validation}\nrollback;`));
} finally {
  assert.equal(snapshot(), before, "rollback-only Shipment pre-apply changed canonical tables");
}
assert.equal(sql("select count(*) from local_commerce.migration_ledger;"), "27");
console.info(JSON.stringify({ status: "PASS", scope: "Task 8.4 rollback-only pre-apply", run, project, ledger: 27, pending: 0, candidateApplied: false, checksum: entry.checksum, immutableTableDigest: createHash("sha256").update(before).digest("hex") }));

if (process.argv.includes("--apply-authorized-0028")) {
  assert.equal(manifest.schemaVersion, 28, "register exact candidate in manifest before permanent apply");
  sql(wrapper);
  const after = JSON.parse(sql("select json_agg(l order by version) from local_commerce.migration_ledger l;"));
  assert.equal(after.length, 28);
  planned.migrations.forEach((migration, index) => {
    assert.equal(after[index].version, migration.version);
    assert.equal(after[index].checksum, migration.checksum);
  });
  assert.equal(sql(`select local_commerce.verify_project_identity('${project}','${prep.markerDigest}');`), "t");
  console.info(JSON.stringify({ status: "PASS", applied: 28, ledger: 28, pending: 0, checksum: entry.checksum }));
}
