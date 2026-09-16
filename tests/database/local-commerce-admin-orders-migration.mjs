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
const migrationPath = "local/commerce/migrations/0027_local-commerce-admin-orders-read.sql";
const candidate = readFileSync(migrationPath, "utf8");
const entry = {
  version: 27,
  migrationId: "local-commerce-admin-orders-read",
  filename: "0027_local-commerce-admin-orders-read.sql",
  checksum: createHash("sha256").update(candidate).digest("hex"),
  rollback: "Disable the persistent Admin Orders read source and preserve all Orders, immutable snapshots, workflow records, private media and ledger evidence. No reset, deletion, reseed or purchase rewrite.",
  forwardFix: "After permanent application use 0028+ only on authorized run-5576dfd8. Never edit applied 0001-0027. Preserve the signed Admin boundary and canonical commerce commands.",
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
const baseline = manifest.schemaVersion === 27
  ? { ...manifest, schemaVersion: 26, migrations: manifest.migrations.slice(0, 26) }
  : manifest;
assert.equal(baseline.schemaVersion, 26);
assert.equal(baseline.migrations.length, 26);
const ledger = JSON.parse(sql("select json_agg(l order by version) from local_commerce.migration_ledger l;"));
assert.equal(ledger.length, 26);
baseline.migrations.forEach((migration, index) => {
  assert.equal(ledger[index].version, migration.version);
  assert.equal(ledger[index].checksum, migration.checksum);
  assert.equal(createHash("sha256").update(readFileSync(`local/commerce/migrations/${migration.filename}`)).digest("hex"), migration.checksum);
});
const planned = { ...baseline, schemaVersion: 27, migrations: [...baseline.migrations, entry] };
if (manifest.schemaVersion === 27) assert.deepEqual(manifest.migrations.at(-1), entry);
const sources = planned.migrations.map((migration) => readFileSync(`local/commerce/migrations/${migration.filename}`, "utf8"));
const wrapper = ledgerWrappers(planned, sources, project, prep.markerDigest).at(-1);
const tables = JSON.parse(sql("select json_agg(format('%I.%I',schemaname,tablename) order by schemaname,tablename) from pg_tables where schemaname='local_commerce';"));
const snapshot = () => sql(tables.map((table) => `select '${table}',count(*),md5(coalesce(string_agg(to_jsonb(t)::text,',' order by to_jsonb(t)::text),'')) from ${table} t;`).join("\n"));
const before = snapshot();
const validation = `
do $test$
declare
  allowed jsonb;
  denied jsonb;
begin
  allowed := local_commerce.admin_orders_read('${project}','${prep.markerDigest}','admin','configured-admin','','','','false',1,20);
  if allowed->>'status' <> 'found' or jsonb_typeof(allowed#>'{value,items}') <> 'array'
    or (allowed#>>'{value,totalCount}')::integer < 1 then raise exception 'bounded Admin read failed'; end if;
  denied := local_commerce.admin_orders_read('${project}','${"0".repeat(64)}','admin','configured-admin','','','',false,1,20);
  if denied->>'status' <> 'unavailable' then raise exception 'wrong marker accepted'; end if;
  denied := local_commerce.admin_orders_read('${project}','${prep.markerDigest}','operator','configured-admin','','','',false,1,20);
  if denied->>'status' <> 'unavailable' then raise exception 'wrong actor accepted'; end if;
  if has_function_privilege('public','local_commerce.admin_orders_read(text,text,text,text,text,text,text,boolean,integer,integer)','execute')
    or has_function_privilege('anon','local_commerce.admin_orders_read(text,text,text,text,text,text,text,boolean,integer,integer)','execute')
    or has_function_privilege('authenticated','local_commerce.admin_orders_read(text,text,text,text,text,text,text,boolean,integer,integer)','execute')
    or not has_function_privilege('service_role','local_commerce.admin_orders_read(text,text,text,text,text,text,text,boolean,integer,integer)','execute')
  then raise exception 'Admin read ACL mismatch'; end if;
end $test$;
`;
try {
  sql(wrapper.replace("begin;", "begin;set local statement_timeout='15000ms';").replace(/commit;\s*$/, `${validation}\nrollback;`));
} finally {
  assert.equal(snapshot(), before, "rollback-only Admin read pre-apply changed canonical tables");
}
assert.equal(sql("select count(*) from local_commerce.migration_ledger;"), "26");
console.info(JSON.stringify({ status: "PASS", scope: "Task 8.2 rollback-only pre-apply", run, project, ledger: 26, pending: 0, candidateApplied: false, checksum: entry.checksum, immutableTableDigest: createHash("sha256").update(before).digest("hex") }));

if (process.argv.includes("--apply-authorized-0027")) {
  assert.equal(manifest.schemaVersion, 27, "register exact candidate in manifest before permanent apply");
  sql(wrapper);
  const after = JSON.parse(sql("select json_agg(l order by version) from local_commerce.migration_ledger l;"));
  assert.equal(after.length, 27);
  planned.migrations.forEach((migration, index) => {
    assert.equal(after[index].version, migration.version);
    assert.equal(after[index].checksum, migration.checksum);
  });
  assert.equal(sql(`select local_commerce.verify_project_identity('${project}','${prep.markerDigest}');`), "t");
  console.info(JSON.stringify({ status: "PASS", applied: 27, ledger: 27, pending: 0, checksum: entry.checksum }));
}
