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
const migrationPath = "local/commerce/migrations/0031_local-commerce-digital-publication.sql";
const candidate = readFileSync(migrationPath, "utf8");
const entry = {
  version: 31,
  migrationId: "local-commerce-digital-publication",
  filename: "0031_local-commerce-digital-publication.sql",
  checksum: createHash("sha256").update(candidate).digest("hex"),
  rollback: "Disable persistent digital publication and preserve private objects, immutable versions, Orders, review/preview facts, and ledger evidence. Do not activate grants or tickets.",
  forwardFix: "After permanent application use 0032+ only on authorized run-5576dfd8. Never edit applied 0001-0031. Preserve immutable private versions, exact-item gates, and replay-first Admin authority.",
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
if (ledger.length >= 31) {
  assert.ok(manifest.schemaVersion >= 31);
  assert.deepEqual(manifest.migrations[30], entry);
  manifest.migrations.slice(0, ledger.length).forEach((migration, index) => {
    assert.equal(ledger[index].version, migration.version);
    assert.equal(ledger[index].checksum, migration.checksum);
    assert.equal(createHash("sha256").update(readFileSync(`local/commerce/migrations/${migration.filename}`)).digest("hex"), migration.checksum);
  });
  assert.equal(sql("select has_function_privilege('public','local_commerce.digital_publication_command(text,text,text,text,text,uuid,text,text,text,jsonb)','execute');"), "f");
  assert.equal(sql("select has_function_privilege('anon','local_commerce.digital_publication_command(text,text,text,text,text,uuid,text,text,text,jsonb)','execute');"), "f");
  assert.equal(sql("select has_function_privilege('authenticated','local_commerce.digital_publication_command(text,text,text,text,text,uuid,text,text,text,jsonb)','execute');"), "f");
  assert.equal(sql("select has_function_privilege('service_role','local_commerce.digital_publication_command(text,text,text,text,text,uuid,text,text,text,jsonb)','execute');"), "t");
  console.info(JSON.stringify({ status: "PASS", scope: "Task 9.1 applied migration verification", run, project, ledger: ledger.length, pending: manifest.schemaVersion - ledger.length, checksum: entry.checksum }));
  process.exit(0);
}
const baseline = manifest.schemaVersion === 31 ? { ...manifest, schemaVersion: 30, migrations: manifest.migrations.slice(0, 30) } : manifest;
assert.equal(baseline.schemaVersion, 30);
assert.equal(baseline.migrations.length, 30);
assert.equal(ledger.length, 30);
baseline.migrations.forEach((migration, index) => {
  assert.equal(ledger[index].version, migration.version);
  assert.equal(ledger[index].checksum, migration.checksum);
  assert.equal(createHash("sha256").update(readFileSync(`local/commerce/migrations/${migration.filename}`)).digest("hex"), migration.checksum);
});
const planned = { ...baseline, schemaVersion: 31, migrations: [...baseline.migrations, entry] };
if (manifest.schemaVersion === 31) assert.deepEqual(manifest.migrations.at(-1), entry);
const sources = planned.migrations.map((migration) => readFileSync(`local/commerce/migrations/${migration.filename}`, "utf8"));
const wrapper = ledgerWrappers(planned, sources, project, prep.markerDigest).at(-1);
const tables = JSON.parse(sql("select json_agg(format('%I.%I',schemaname,tablename) order by schemaname,tablename) from pg_tables where schemaname='local_commerce';"));
const snapshot = () => sql(tables.map((table) => `select '${table}',count(*),md5(coalesce(string_agg(to_jsonb(t)::text,',' order by to_jsonb(t)::text),'')) from ${table} t;`).join("\n"));
const before = snapshot();
const validation = `
do $test$
declare denied jsonb;
begin
  if not exists(select 1 from pg_tables where schemaname='local_commerce' and tablename='digital_versions' and rowsecurity)
    then raise exception 'digital_versions RLS missing'; end if;
  if not exists(select 1 from pg_indexes where schemaname='local_commerce' and indexname='digital_versions_current_item_key')
    then raise exception 'current version uniqueness missing'; end if;
  if has_function_privilege('public','local_commerce.digital_publication_command(text,text,text,text,text,uuid,text,text,text,jsonb)','execute')
    or has_function_privilege('anon','local_commerce.digital_publication_command(text,text,text,text,text,uuid,text,text,text,jsonb)','execute')
    or has_function_privilege('authenticated','local_commerce.digital_publication_command(text,text,text,text,text,uuid,text,text,text,jsonb)','execute')
    or not has_function_privilege('service_role','local_commerce.digital_publication_command(text,text,text,text,text,uuid,text,text,text,jsonb)','execute')
    then raise exception 'publication command ACL mismatch'; end if;
  if has_function_privilege('public','local_commerce.digital_publication_complete(text,text,text,text,text,uuid,text,text,text,uuid,text)','execute')
    or has_function_privilege('anon','local_commerce.digital_publication_complete(text,text,text,text,text,uuid,text,text,text,uuid,text)','execute')
    or has_function_privilege('authenticated','local_commerce.digital_publication_complete(text,text,text,text,text,uuid,text,text,text,uuid,text)','execute')
    or not has_function_privilege('service_role','local_commerce.digital_publication_complete(text,text,text,text,text,uuid,text,text,text,uuid,text)','execute')
    then raise exception 'publication complete ACL mismatch'; end if;
  denied := local_commerce.digital_publication_command('${project}','${"0".repeat(64)}','admin','configured-admin',
    'FM-LOCAL-0000000000000000','00000000-0000-4000-8000-000000000000','probe','${"1".repeat(64)}','${"2".repeat(64)}',
    '{"contentDigest":"${"3".repeat(64)}","contentType":"application/pdf","byteSize":5,"fileName":"a.pdf"}'::jsonb);
  if denied->>'status'<>'unavailable' then raise exception 'wrong marker accepted'; end if;
end $test$;`;
try {
  sql(wrapper.replace("begin;", "begin;set local statement_timeout='15000ms';").replace(/commit;\s*$/, `${validation}\nrollback;`));
} finally {
  assert.equal(snapshot(), before, "rollback-only Task 9.1 pre-apply changed canonical tables");
}
assert.equal(sql("select count(*) from local_commerce.migration_ledger;"), "30");
console.info(JSON.stringify({ status: "PASS", scope: "Task 9.1 rollback-only pre-apply", run, project, ledger: 30, pending: 0, candidateApplied: false, checksum: entry.checksum, immutableTableDigest: createHash("sha256").update(before).digest("hex") }));

if (process.argv.includes("--apply-authorized-0031")) {
  assert.equal(manifest.schemaVersion, 31, "register exact candidate in manifest before permanent apply");
  sql(wrapper);
  const after = JSON.parse(sql("select json_agg(l order by version) from local_commerce.migration_ledger l;"));
  assert.equal(after.length, 31);
  planned.migrations.forEach((migration, index) => {
    assert.equal(after[index].version, migration.version);
    assert.equal(after[index].checksum, migration.checksum);
  });
  assert.equal(sql(`select local_commerce.verify_project_identity('${project}','${prep.markerDigest}');`), "t");
  console.info(JSON.stringify({ status: "PASS", applied: 31, ledger: 31, pending: 0, checksum: entry.checksum }));
}
