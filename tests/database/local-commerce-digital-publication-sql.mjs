// Task 9.1 transaction fault evidence. All fixture mutations are rolled back.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const run="run-5576dfd8", project=`figmemento-local-commerce-test-${run}`;
const dir=`${process.cwd()}/local/commerce/runtime/disposable/${run}`;
const prep=JSON.parse(readFileSync(`${dir}/ledger-preparation.json`,"utf8"));
const db="3f0a14e18d07b71e0b235dffcdc61e672086d6fb5b32b35849aa8bf54f3be3e4";
function docker(args,input){const r=spawnSync("docker",args,{input,encoding:"utf8",timeout:30000,maxBuffer:16*1024*1024});assert.equal(r.status,0,r.error?.code??r.stderr);return r.stdout.trim();}
const inspected=JSON.parse(docker(["inspect",db]))[0];assert.equal(inspected.Id,db);assert.equal(inspected.State.Status,"running");assert.equal(inspected.Config.Labels["com.supabase.cli.workdir"],dir);
const sql=q=>docker(["exec","-i",db,"psql","-X","-qAt","-v","ON_ERROR_STOP=1","-U","postgres","-d","postgres"],q);
assert.equal(sql(`select local_commerce.verify_project_identity('${project}','${prep.markerDigest}');`),"t");assert.equal(sql("select count(*) from local_commerce.migration_ledger;"),"32");
const target=JSON.parse(sql(`select json_build_object('reference',o.public_reference,'item',i.id)
 from local_commerce.digital_versions d join local_commerce.order_items i on i.project_id=d.project_id and i.id=d.order_item_id
 join local_commerce.orders o on o.project_id=i.project_id and o.id=i.order_id
 where d.project_id='${project}' and d.status='ready' and d.is_current and not exists(select 1 from local_commerce.shipments s where s.project_id=o.project_id and s.order_id=o.id)
 order by d.created_at desc limit 1;`));
assert.match(target.reference,/^FM-LOCAL-[A-Z0-9]{16}$/);assert.match(target.item,/^[0-9a-f-]{36}$/);
const key=createHash("sha256").update("task-9.1-db-fault-reserve").digest("hex"),ctx=createHash("sha256").update("task-9.1-db-fault-context").digest("hex"),content=createHash("sha256").update("%PDF-fault").digest("hex");
const baseline=sql(`select count(*)||':'||md5(coalesce(string_agg(to_jsonb(d)::text,',' order by to_jsonb(d)::text),'')) from local_commerce.digital_versions d where project_id='${project}' and order_item_id='${target.item}';`);
const output=sql(`begin;
 create function pg_temp.digital_insert_fault() returns trigger language plpgsql as \$\$begin raise exception 'synthetic digital insert fault';end;\$\$;
 create trigger digital_insert_fault after insert on local_commerce.digital_versions for each row execute function pg_temp.digital_insert_fault();
 do \$test\$ declare r jsonb;before_count bigint;begin
  select count(*) into before_count from local_commerce.digital_versions where project_id='${project}' and order_item_id='${target.item}';
  begin
   r:=local_commerce.digital_publication_command('${project}','${prep.markerDigest}','admin','configured-admin','${target.reference}','${target.item}','reserve','${key}','${ctx}',jsonb_build_object('contentDigest','${content}','contentType','application/pdf','byteSize',10,'fileName','fault.pdf'));
   raise exception 'insert fault unexpectedly returned: %',r;
  exception when others then
   if sqlerrm not like '%synthetic digital insert fault%' then raise;end if;
  end;
  if (select count(*) from local_commerce.digital_versions where project_id='${project}' and order_item_id='${target.item}')<>before_count then raise exception 'partial insert state';end if;
 end \$test\$;
 drop trigger digital_insert_fault on local_commerce.digital_versions;
 do \$test\$ declare r jsonb;v uuid;before_count bigint;begin
  select count(*) into before_count from local_commerce.digital_versions where project_id='${project}' and order_item_id='${target.item}';
  r:=local_commerce.digital_publication_command('${project}','${prep.markerDigest}','admin','configured-admin','${target.reference}','${target.item}','reserve','${key}','${ctx}',jsonb_build_object('contentDigest','${content}','contentType','application/pdf','byteSize',10,'fileName','fault.pdf'));
  if r->>'status'<>'found' then raise exception 'fault reservation unavailable: %',r;end if;v:=(r#>>'{value,versionId}')::uuid;
  create function pg_temp.digital_ready_fault() returns trigger language plpgsql as \$f\$begin raise exception 'synthetic digital ready fault';end;\$f\$;
  create trigger digital_ready_fault after update on local_commerce.digital_versions for each row execute function pg_temp.digital_ready_fault();
  begin
   r:=local_commerce.digital_publication_complete('${project}','${prep.markerDigest}','admin','configured-admin','${target.reference}','${target.item}','ready','${key}','${ctx}',v,'${content}');
   raise exception 'ready fault unexpectedly returned: %',r;
  exception when others then
   if sqlerrm not like '%synthetic digital ready fault%' then raise;end if;
  end;
  if (select status from local_commerce.digital_versions where id=v)<>'pending' then raise exception 'partial ready state';end if;
  if (select count(*) from local_commerce.digital_versions where project_id='${project}' and order_item_id='${target.item}')<>before_count+1 then raise exception 'reservation identity lost';end if;
 end \$test\$;
 rollback;
 select 'PASS';`);
assert.equal(output,"PASS");assert.equal(sql(`select count(*)||':'||md5(coalesce(string_agg(to_jsonb(d)::text,',' order by to_jsonb(d)::text),'')) from local_commerce.digital_versions d where project_id='${project}' and order_item_id='${target.item}';`),baseline);
console.info(JSON.stringify({status:"PASS",task:"9.1",scope:"rollback-only DB insert/ready fault atomicity",target:target.reference,ledger:32,canonicalDigestUnchanged:true}));
