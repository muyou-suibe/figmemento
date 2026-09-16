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
const filename = "0036_local-commerce-digital-grant-revocation.sql";
const candidate = readFileSync(`local/commerce/migrations/${filename}`, "utf8");
const checksum = createHash("sha256").update(candidate).digest("hex");
const manifest = JSON.parse(readFileSync("local/commerce/migrations/manifest.json", "utf8"));
const signature = "local_commerce.digital_grant_revoke(text,text,text,text,text,uuid,uuid,text,text,text)";

function docker(args, input) {
  const result = spawnSync("docker", args, { input, encoding: "utf8", timeout: 30000, maxBuffer: 16 * 1024 * 1024 });
  assert.equal(result.status, 0, result.error?.code ?? result.stderr);
  return result.stdout.trim();
}
const sql = statement => docker(["exec", "-i", db, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], statement);
const inspected = JSON.parse(docker(["inspect", db]))[0];
assert.equal(inspected.State.Status, "running");
assert.equal(inspected.Config.Labels["com.supabase.cli.workdir"], dir);
assert.equal(prep.config.projectId, project);
assert.equal(sql("select current_setting('server_version_num')::int/10000;"), "17");
assert.equal(sql(`select local_commerce.verify_project_identity('${project}','${prep.markerDigest}');`), "t");

const ledger = JSON.parse(sql("select json_agg(l order by version) from local_commerce.migration_ledger l;"));
const baseline = { ...manifest, schemaVersion: 35, migrations: manifest.migrations.slice(0, 35) };
assert.equal(ledger.length, ledger.at(-1).version);
for (const [index, migration] of baseline.migrations.entries()) {
  assert.equal(ledger[index].checksum, migration.checksum);
  assert.equal(createHash("sha256").update(readFileSync(`local/commerce/migrations/${migration.filename}`)).digest("hex"), migration.checksum);
}
assert.equal(manifest.schemaVersion, 36);
assert.equal(manifest.migrations.at(-1).checksum, checksum);

function securityEvidence() {
  for (const role of ["public", "anon", "authenticated"]) assert.equal(sql(`select has_function_privilege('${role}','${signature}','execute');`), "f");
  assert.equal(sql(`select has_function_privilege('service_role','${signature}','execute');`), "t");
  assert.equal(sql("select relrowsecurity from pg_class where oid='local_commerce.digital_grants'::regclass;"), "t");
  for (const role of ["anon", "authenticated"]) assert.equal(sql(`select has_table_privilege('${role}','local_commerce.digital_grants','update');`), "f");
}

if (ledger.length === 36) {
  securityEvidence();
  console.info(JSON.stringify({ status: "PASS", scope: "Task 9.6 applied migration verification", ledger: 36, pending: 0, checksum }));
  process.exit(0);
}
assert.equal(ledger.length, 35);
const wrappers = ledgerWrappers(manifest, manifest.migrations.map(m => readFileSync(`local/commerce/migrations/${m.filename}`, "utf8")), project, prep.markerDigest);
const wrapper = wrappers.at(-1);
const tables = JSON.parse(sql("select json_agg(format('%I.%I',schemaname,tablename) order by schemaname,tablename) from pg_tables where schemaname='local_commerce';"));
const snapshot = () => sql(tables.map(table => `select '${table}',count(*),md5(coalesce(string_agg(to_jsonb(x)::text,',' order by to_jsonb(x)::text),'')) from ${table} x;`).join("\n"));
const before = snapshot();
const validation = `
do $test$ begin
  if has_function_privilege('public','${signature}','execute')
    or has_function_privilege('anon','${signature}','execute')
    or has_function_privilege('authenticated','${signature}','execute')
    or not has_function_privilege('service_role','${signature}','execute')
  then raise exception 'digital revoke ACL mismatch'; end if;
end $test$;
create temp table task96_case on commit drop as
select g.id grant_id,g.order_id,g.order_item_id,g.owner_id,o.public_reference,
  g.activated_at,g.expires_at,g.max_attempts,g.used_attempts,g.version
from local_commerce.digital_grants g join local_commerce.orders o
  on o.project_id=g.project_id and o.id=g.order_id and o.owner_id=g.owner_id
where g.project_id='${project}' limit 1;
do $test$ begin if not exists(select 1 from task96_case) then raise exception 'no synthetic digital grant fixture'; end if; end $test$;
update local_commerce.digital_grants g set grant_status='active',lifecycle='active',revoked_at=null,
  revocation_action_key=null,revocation_context_digest=null,revoked_by=null,revocation_result=null
from task96_case c where g.project_id='${project}' and g.id=c.grant_id;
create function pg_temp.task96_revoke(p_key text,p_context text) returns jsonb language sql as $fn$
select local_commerce.digital_grant_revoke('${project}','${prep.markerDigest}','admin','configured-admin',
  c.public_reference,c.order_item_id,c.grant_id,'revoke',p_key,p_context) from task96_case c
$fn$;
do $test$ declare r jsonb; begin
  r:=local_commerce.digital_grant_revoke('${project}','${"0".repeat(64)}','admin','configured-admin',
    (select public_reference from task96_case),(select order_item_id from task96_case),(select grant_id from task96_case),
    'revoke','${"1".repeat(64)}','${"2".repeat(64)}');
  if r->>'status'<>'unavailable' then raise exception 'wrong marker accepted'; end if;
end $test$;
create function pg_temp.task96_fail() returns trigger language plpgsql as $fn$ begin raise exception 'injected Task 9.6 revoke fault'; end $fn$;
create trigger task96_grant_fault before update on local_commerce.digital_grants for each row execute function pg_temp.task96_fail();
do $test$ declare r jsonb; begin r:=pg_temp.task96_revoke('${"3".repeat(64)}','${"4".repeat(64)}');
  if r->>'status'<>'unavailable' then raise exception 'fault accepted'; end if;
  if exists(select 1 from local_commerce.digital_grants g join task96_case c on c.grant_id=g.id where g.revoked_at is not null) then raise exception 'partial revoke'; end if;
end $test$;
drop trigger task96_grant_fault on local_commerce.digital_grants;
do $test$ declare r jsonb; before_ticket text; after_ticket text; begin
  select md5(coalesce(string_agg(to_jsonb(t)::text,',' order by to_jsonb(t)::text),'')) into before_ticket from local_commerce.digital_tickets t join task96_case c on c.grant_id=t.grant_id;
  r:=pg_temp.task96_revoke('${"5".repeat(64)}','${"6".repeat(64)}');
  if r->>'status'<>'found' or r->>'replayed'<>'false' then raise exception 'valid revoke failed: %',r; end if;
  if not exists(select 1 from local_commerce.digital_grants g join task96_case c on c.grant_id=g.id
    where g.grant_status='revoked' and g.lifecycle='revoked' and g.revoked_at is not null
      and g.activated_at=c.activated_at and g.expires_at=c.expires_at and g.max_attempts=c.max_attempts
      and g.used_attempts=c.used_attempts and g.version=c.version+1) then raise exception 'grant preservation mismatch'; end if;
  select md5(coalesce(string_agg(to_jsonb(t)::text,',' order by to_jsonb(t)::text),'')) into after_ticket from local_commerce.digital_tickets t join task96_case c on c.grant_id=t.grant_id;
  if before_ticket is distinct from after_ticket then raise exception 'tickets were mutated'; end if;
  r:=pg_temp.task96_revoke('${"5".repeat(64)}','${"6".repeat(64)}');
  if r->>'status'<>'found' or r->>'replayed'<>'true' then raise exception 'exact replay failed'; end if;
  r:=pg_temp.task96_revoke('${"5".repeat(64)}','${"7".repeat(64)}');
  if r->>'status'<>'conflict' then raise exception 'changed context accepted'; end if;
end $test$;`;
try {
  sql(wrapper.replace("begin;", "begin;set local statement_timeout='15000ms';").replace(/commit;\s*$/, `${validation}\nrollback;`));
} finally {
  assert.equal(snapshot(), before);
}
assert.equal(sql("select count(*) from local_commerce.migration_ledger;"), "35");
console.info(JSON.stringify({ status: "PASS", scope: "Task 9.6 rollback-only pre-apply", ledger: 35, pending: 0, checksum }));

if (process.argv.includes("--apply-authorized-0036")) {
  sql(wrapper);
  assert.equal(sql("select count(*) from local_commerce.migration_ledger;"), "36");
  securityEvidence();
  console.info(JSON.stringify({ status: "PASS", applied: 36, ledger: 36, pending: 0, checksum }));
}
