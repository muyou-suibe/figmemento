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
const filename = "0035_local-commerce-digital-download-claim.sql";
const candidate = readFileSync(`local/commerce/migrations/${filename}`, "utf8");
const checksum = createHash("sha256").update(candidate).digest("hex");
const manifest = JSON.parse(readFileSync("local/commerce/migrations/manifest.json", "utf8"));

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
const baseline = { ...manifest, schemaVersion: 34, migrations: manifest.migrations.slice(0, 34) };
assert.equal(ledger.length, ledger.at(-1).version);
for (const [index, migration] of baseline.migrations.entries()) {
  assert.equal(ledger[index].checksum, migration.checksum);
  assert.equal(createHash("sha256").update(readFileSync(`local/commerce/migrations/${migration.filename}`)).digest("hex"), migration.checksum);
}
assert.equal(manifest.schemaVersion, 35);
assert.equal(manifest.migrations.at(-1).checksum, checksum);

const prepareSignature = "local_commerce.digital_download_prepare(text,text,text,text,uuid,text,timestamptz,text,text,text)";
const claimSignature = "local_commerce.digital_download_claim(text,text,text,text,uuid,text,timestamptz,text,text,text,uuid,text,integer,text,text)";
function securityEvidence() {
  for (const signature of [prepareSignature, claimSignature]) {
    for (const role of ["public", "anon", "authenticated"]) assert.equal(sql(`select has_function_privilege('${role}','${signature}','execute');`), "f");
    assert.equal(sql(`select has_function_privilege('service_role','${signature}','execute');`), "t");
  }
  for (const relation of ["digital_tickets", "digital_grants", "digital_delivery_attempts"]) {
    assert.equal(sql(`select relrowsecurity from pg_class where oid='local_commerce.${relation}'::regclass;`), "t");
    for (const role of ["anon", "authenticated"]) {
      assert.equal(sql(`select has_table_privilege('${role}','local_commerce.${relation}','insert,update,delete');`), "f");
    }
  }
}

if (ledger.length === 35) {
  securityEvidence();
  console.info(JSON.stringify({ status: "PASS", scope: "Task 9.4 applied migration verification", ledger: 35, pending: 0, checksum }));
  process.exit(0);
}
assert.equal(ledger.length, 34);
const wrappers = ledgerWrappers(manifest, manifest.migrations.map(m => readFileSync(`local/commerce/migrations/${m.filename}`, "utf8")), project, prep.markerDigest);
const wrapper = wrappers.at(-1);
const tables = JSON.parse(sql("select json_agg(format('%I.%I',schemaname,tablename) order by schemaname,tablename) from pg_tables where schemaname='local_commerce';"));
const snapshot = () => sql(tables.map(table => `select '${table}',count(*),md5(coalesce(string_agg(to_jsonb(x)::text,',' order by to_jsonb(x)::text),'')) from ${table} x;`).join("\n"));
const before = snapshot();
const validation = `
do $test$ begin
  if has_function_privilege('public','${prepareSignature}','execute')
    or has_function_privilege('anon','${claimSignature}','execute')
    or has_function_privilege('authenticated','${claimSignature}','execute')
    or not has_function_privilege('service_role','${prepareSignature}','execute')
    or not has_function_privilege('service_role','${claimSignature}','execute')
  then raise exception 'digital claim ACL mismatch'; end if;
  if local_commerce.digital_download_prepare('${project}','${"0".repeat(64)}','guest','${"1".repeat(64)}',null,null,clock_timestamp()+interval '1 hour','${"2".repeat(64)}','FM-LOCAL-0000000000000000','${"3".repeat(64)}')->>'status'<>'unavailable'
  then raise exception 'wrong marker accepted'; end if;
end $test$;
create temp table task94_case on commit drop as
select t.id ticket_id,t.ticket_hash,g.id grant_id,g.used_attempts original_used,o.id order_id,
  o.public_reference,o.owner_id,co.subject_hash owner_selector,ag.capability_hash,
  i.id order_item_id,v.id version_id,v.content_digest,v.byte_size
from local_commerce.digital_tickets t
join local_commerce.digital_grants g on g.project_id=t.project_id and g.id=t.grant_id
join local_commerce.orders o on o.project_id=g.project_id and o.id=g.order_id
join local_commerce.commerce_owners co on co.project_id=o.project_id and co.id=o.owner_id and co.owner_kind='guest'
join local_commerce.access_grants ag on ag.project_id=o.project_id and ag.owner_id=o.owner_id and ag.resource_id=o.id and ag.resource_kind='local_order'
join local_commerce.order_items i on i.project_id=o.project_id and i.id=g.order_item_id
join local_commerce.digital_versions v on v.project_id=i.project_id and v.order_item_id=i.id and v.is_current and v.status='ready'
where t.project_id='${project}' limit 1;
do $test$ begin if not exists(select 1 from task94_case) then raise exception 'no synthetic guest ticket fixture'; end if; end $test$;
with stamp as (select clock_timestamp() value)
update local_commerce.digital_grants g set activated_at=stamp.value,expires_at=stamp.value+interval '30 days',used_attempts=0,grant_status='active',lifecycle='active',revoked_at=null
  from task94_case c,stamp where g.project_id='${project}' and g.id=c.grant_id;
update local_commerce.digital_tickets t set digital_version_id=c.version_id,issued_at=clock_timestamp(),expires_at=clock_timestamp()+interval '10 minutes',consumed_at=null,lifecycle='active'
  from task94_case c where t.project_id='${project}' and t.id=c.ticket_id;
create function pg_temp.task94_claim() returns jsonb language sql as $fn$
  select local_commerce.digital_download_claim('${project}','${prep.markerDigest}','guest',c.owner_selector,null,null,
    clock_timestamp()+interval '1 hour',c.capability_hash,c.public_reference,c.ticket_hash,c.version_id,
    c.content_digest,c.byte_size,'${"4".repeat(64)}','${"5".repeat(64)}') from task94_case c
$fn$;
do $test$ declare r jsonb; begin
  select local_commerce.digital_download_prepare('${project}','${prep.markerDigest}','guest',c.owner_selector,null,null,
    clock_timestamp()+interval '1 hour',c.capability_hash,c.public_reference,c.ticket_hash) into r from task94_case c;
  if r->>'status'<>'found' then raise exception 'prepare failed: %',r; end if;
end $test$;
create function pg_temp.task94_fail() returns trigger language plpgsql as $fn$ begin raise exception 'injected Task 9.4 write fault'; end $fn$;
create trigger task94_ticket_fault before update on local_commerce.digital_tickets for each row execute function pg_temp.task94_fail();
do $test$ declare r jsonb; begin r:=pg_temp.task94_claim(); if r->>'status'<>'unavailable' then raise exception 'ticket fault accepted';end if;
  if exists(select 1 from local_commerce.digital_tickets t join task94_case c on c.ticket_id=t.id where t.consumed_at is not null) then raise exception 'partial ticket';end if;end $test$;
drop trigger task94_ticket_fault on local_commerce.digital_tickets;
create trigger task94_grant_fault before update on local_commerce.digital_grants for each row execute function pg_temp.task94_fail();
do $test$ declare r jsonb; begin r:=pg_temp.task94_claim(); if r->>'status'<>'unavailable' then raise exception 'grant fault accepted';end if;
  if exists(select 1 from local_commerce.digital_tickets t join task94_case c on c.ticket_id=t.id where t.consumed_at is not null) then raise exception 'partial ticket';end if;
  if exists(select 1 from local_commerce.digital_grants g join task94_case c on c.grant_id=g.id where g.used_attempts<>0) then raise exception 'partial quota';end if;end $test$;
drop trigger task94_grant_fault on local_commerce.digital_grants;
create trigger task94_attempt_fault before insert on local_commerce.digital_delivery_attempts for each row execute function pg_temp.task94_fail();
do $test$ declare r jsonb; begin r:=pg_temp.task94_claim(); if r->>'status'<>'unavailable' then raise exception 'attempt fault accepted';end if;
  if exists(select 1 from local_commerce.digital_tickets t join task94_case c on c.ticket_id=t.id where t.consumed_at is not null) then raise exception 'partial ticket';end if;
  if exists(select 1 from local_commerce.digital_grants g join task94_case c on c.grant_id=g.id where g.used_attempts<>0) then raise exception 'partial quota';end if;end $test$;
drop trigger task94_attempt_fault on local_commerce.digital_delivery_attempts;
do $test$ declare r jsonb; begin r:=pg_temp.task94_claim(); if r->>'status'<>'found' then raise exception 'valid claim failed: %',r;end if;
  if not exists(select 1 from local_commerce.digital_tickets t join task94_case c on c.ticket_id=t.id where t.consumed_at is not null and t.lifecycle='consumed') then raise exception 'ticket not consumed';end if;
  if not exists(select 1 from local_commerce.digital_grants g join task94_case c on c.grant_id=g.id where g.used_attempts=1) then raise exception 'quota mismatch';end if;
  if (select count(*) from local_commerce.digital_delivery_attempts a join task94_case c on c.ticket_id=a.ticket_id)<>1 then raise exception 'attempt mismatch';end if;
end $test$;`;
try {
  sql(wrapper.replace("begin;", "begin;set local statement_timeout='15000ms';").replace(/commit;\s*$/, `${validation}\nrollback;`));
} finally {
  assert.equal(snapshot(), before);
}
assert.equal(sql("select count(*) from local_commerce.migration_ledger;"), "34");
console.info(JSON.stringify({ status: "PASS", scope: "Task 9.4 rollback-only pre-apply", ledger: 34, pending: 0, checksum }));

if (process.argv.includes("--apply-authorized-0035")) {
  sql(wrapper);
  assert.equal(sql("select count(*) from local_commerce.migration_ledger;"), "35");
  securityEvidence();
  console.info(JSON.stringify({ status: "PASS", applied: 35, ledger: 35, pending: 0, checksum }));
}
