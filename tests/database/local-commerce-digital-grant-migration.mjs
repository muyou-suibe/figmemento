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
const migrationPath = "local/commerce/migrations/0033_local-commerce-digital-grant.sql";
const candidate = readFileSync(migrationPath, "utf8");
const entry = {
  version: 33,
  migrationId: "local-commerce-digital-grant",
  filename: "0033_local-commerce-digital-grant.sql",
  checksum: createHash("sha256").update(candidate).digest("hex"),
  rollback: "Disable customer digital-grant activation while preserving canonical grants, immutable versions, Orders, private objects, and ledger evidence. Do not create tickets or reset policy counters.",
  forwardFix: "After permanent application use 0034+ only on authorized run-5576dfd8. Never edit applied 0001-0033. Preserve one canonical owner/item grant, fixed 30-day/five-claim policy, and existing Order authorization.",
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
const ledger = JSON.parse(sql("select json_agg(l order by version) from local_commerce.migration_ledger l;"));
const baseline = manifest.schemaVersion === 33 ? { ...manifest, schemaVersion: 32, migrations: manifest.migrations.slice(0, 32) } : manifest;
assert.equal(baseline.schemaVersion, 32);
assert.equal(baseline.migrations.length, 32);
baseline.migrations.forEach((migration, index) => {
  assert.equal(ledger[index].version, migration.version);
  assert.equal(ledger[index].checksum, migration.checksum);
  assert.equal(createHash("sha256").update(readFileSync(`local/commerce/migrations/${migration.filename}`)).digest("hex"), migration.checksum);
});
if (ledger.length >= 33) {
  assert.equal(ledger.length, 33);
  assert.equal(manifest.schemaVersion, 33);
  assert.deepEqual(manifest.migrations.at(-1), entry);
  assert.equal(ledger[32].checksum, entry.checksum);
  assert.equal(sql("select has_function_privilege('public','local_commerce.digital_grant_activate(text,text,text,text,uuid,text,timestamptz,text,text,uuid,text,text,text)','execute');"), "f");
  assert.equal(sql("select has_function_privilege('anon','local_commerce.digital_grant_activate(text,text,text,text,uuid,text,timestamptz,text,text,uuid,text,text,text)','execute');"), "f");
  assert.equal(sql("select has_function_privilege('authenticated','local_commerce.digital_grant_activate(text,text,text,text,uuid,text,timestamptz,text,text,uuid,text,text,text)','execute');"), "f");
  assert.equal(sql("select has_function_privilege('service_role','local_commerce.digital_grant_activate(text,text,text,text,uuid,text,timestamptz,text,text,uuid,text,text,text)','execute');"), "t");
  console.info(JSON.stringify({ status: "PASS", scope: "Task 9.2 applied migration verification", run, project, ledger: 33, pending: 0, checksum: entry.checksum }));
  process.exit(0);
}
assert.equal(ledger.length, 32);
const planned = { ...baseline, schemaVersion: 33, migrations: [...baseline.migrations, entry] };
if (manifest.schemaVersion === 33) assert.deepEqual(manifest.migrations.at(-1), entry);
const sources = planned.migrations.map((migration) => readFileSync(`local/commerce/migrations/${migration.filename}`, "utf8"));
const wrapper = ledgerWrappers(planned, sources, project, prep.markerDigest).at(-1);
const tables = JSON.parse(sql("select json_agg(format('%I.%I',schemaname,tablename) order by schemaname,tablename) from pg_tables where schemaname='local_commerce';"));
const snapshot = () => sql(tables.map((table) => `select '${table}',count(*),md5(coalesce(string_agg(to_jsonb(t)::text,',' order by to_jsonb(t)::text),'')) from ${table} t;`).join("\n"));
const before = snapshot();
const validation = `
do $test$
begin
  if has_function_privilege('public','local_commerce.digital_grant_activate(text,text,text,text,uuid,text,timestamptz,text,text,uuid,text,text,text)','execute')
    or has_function_privilege('anon','local_commerce.digital_grant_activate(text,text,text,text,uuid,text,timestamptz,text,text,uuid,text,text,text)','execute')
    or has_function_privilege('authenticated','local_commerce.digital_grant_activate(text,text,text,text,uuid,text,timestamptz,text,text,uuid,text,text,text)','execute')
    or not has_function_privilege('service_role','local_commerce.digital_grant_activate(text,text,text,text,uuid,text,timestamptz,text,text,uuid,text,text,text)','execute')
  then raise exception 'digital grant ACL mismatch'; end if;
  if local_commerce.digital_grant_activate('${project}','${"0".repeat(64)}','guest','${"1".repeat(64)}',null,null,clock_timestamp()+interval '1 hour','${"2".repeat(64)}','FM-LOCAL-0000000000000000','00000000-0000-4000-8000-000000000000','activate','${"3".repeat(64)}','${"4".repeat(64)}')->>'status' <> 'unavailable'
  then raise exception 'wrong marker accepted'; end if;
end $test$;`;
try {
  sql(wrapper.replace("begin;", "begin;set local statement_timeout='15000ms';").replace(/commit;\s*$/, `${validation}\nrollback;`));
} finally {
  assert.equal(snapshot(), before, "rollback-only Task 9.2 pre-apply changed canonical tables");
}
assert.equal(sql("select count(*) from local_commerce.migration_ledger;"), "32");
console.info(JSON.stringify({ status: "PASS", scope: "Task 9.2 rollback-only pre-apply", run, project, ledger: 32, pending: 0, candidateApplied: false, checksum: entry.checksum, immutableTableDigest: createHash("sha256").update(before).digest("hex") }));
if (process.argv.includes("--apply-authorized-0033")) {
  assert.equal(manifest.schemaVersion, 33, "register exact candidate in manifest before permanent apply");
  sql(wrapper);
  assert.equal(sql("select count(*) from local_commerce.migration_ledger;"), "33");
  assert.equal(sql(`select local_commerce.verify_project_identity('${project}','${prep.markerDigest}');`), "t");
  console.info(JSON.stringify({ status: "PASS", applied: 33, ledger: 33, pending: 0, checksum: entry.checksum }));
}
