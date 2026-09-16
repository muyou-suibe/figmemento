import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {ledgerWrappers} from './local-commerce-ledger-wrapper.mjs';
import {fullPreviewManifestSqlChecks} from '../tests/database/local-commerce-preview-manifest-full-sql.mjs';
const apply=process.argv[2]==='--apply-authorized-forward-fix';
assert.ok(apply || process.argv[2]==='--preapply');
const project='figmemento-local-commerce-test-run-5576dfd8',marker='a9e9004d843753efa456c4e8b66f91ed95d268034fba1166c55d9785dadf815c';
const container='3f0a14e18d07b71e0b235dffcdc61e672086d6fb5b32b35849aa8bf54f3be3e4';
function docker(args,input){const r=spawnSync('docker',args,{input,encoding:'utf8',timeout:15000,maxBuffer:1048576});assert.equal(r.status,0,r.error?.code??r.stderr);return r.stdout.trim();}
const c=JSON.parse(docker(['inspect',container]))[0];assert.equal(c.Id,container);assert.equal(c.State.Status,'running');
assert.equal(c.Config.Labels['com.supabase.cli.workdir'],`${process.cwd()}/local/commerce/runtime/disposable/run-5576dfd8`);
const sql=q=>docker(['exec','-i',container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],q);
assert.equal(sql("select current_setting('server_version_num')::int/10000;"),'17');
assert.equal(sql(`select local_commerce.verify_project_identity('${project}','${marker}');`),'t');
const manifest=JSON.parse(readFileSync('local/commerce/migrations/manifest.json'));assert.equal(manifest.schemaVersion,21);assert.equal(manifest.migrations.length,21);
const sources=manifest.migrations.map(m=>{const s=readFileSync(`local/commerce/migrations/${m.filename}`,'utf8');assert.equal(createHash('sha256').update(s).digest('hex'),m.checksum);return s;});
assert.equal(manifest.migrations[19].checksum,'63a4d18a984ee95511743d333072a9d56bd15421eaac6e2ed51e11647ce818e9');
const ledger=()=>JSON.parse(sql("select json_agg(json_build_object('version',version,'checksum',checksum,'project',project_id) order by version) from local_commerce.migration_ledger;"));
const before=ledger();assert.equal(before.length,20);before.forEach((r,i)=>{assert.equal(r.version,i+1);assert.equal(r.project,project);assert.equal(r.checksum,manifest.migrations[i].checksum);});
const candidate=readFileSync('local/commerce/migrations/0021_local-commerce-preview-deferred-authority.sql','utf8');
const checksum=createHash('sha256').update(candidate).digest('hex');
assert.equal(checksum,'43ac7a4bd81512ab0b94d149357f02db2fc98ef4927cb79b8555a35ee5a892ef','owner-authorized exact bytes only');
const tables=JSON.parse(sql("select json_agg(format('%I.%I',schemaname,tablename) order by schemaname,tablename) from pg_tables where schemaname='local_commerce' or (schemaname='storage' and tablename in ('objects','buckets'));"));
const snapshot=()=>JSON.parse(sql(`select json_agg(v order by v->>'table') from (${tables.map(t=>`select json_build_object('table','${t}','count',count(*),'digest',md5(coalesce(string_agg(to_jsonb(t)::text,',' order by to_jsonb(t)::text),''))) v from ${t} t`).join(' union all ')}) x;`));
const security=()=>sql("select json_build_object('tables',(select json_agg(json_build_array(n.nspname,c.relname,c.relacl,c.relrowsecurity) order by n.nspname,c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('local_commerce','storage') and c.relkind='r'),'policies',(select json_agg(p order by schemaname,tablename,policyname) from pg_policies p where schemaname in ('local_commerce','storage')),'triggers',(select json_agg(pg_get_triggerdef(oid) order by tgname) from pg_trigger where tgfoid='local_commerce.assert_preview_manifest_complete()'::regprocedure));");
const originalData=snapshot(),originalSecurity=security();
const trigger='local_commerce.assert_preview_manifest_complete()';
const checks=`do $security$ declare role_name text;begin
 if not exists(select 1 from pg_proc where oid='${trigger}'::regprocedure and prosecdef and prorettype='trigger'::regtype and proconfig=ARRAY['search_path=pg_catalog, local_commerce'] and pg_get_userbyid(proowner)='postgres') then raise exception 'trigger definition';end if;
 foreach role_name in array array['anon','authenticated','service_role'] loop
 if has_function_privilege(role_name,'${trigger}','EXECUTE') or has_function_privilege(role_name,'local_commerce.fulfillment_purchased_items(text,uuid,uuid)','EXECUTE') then raise exception 'private function exposed';end if;end loop;
 if exists(select 1 from pg_proc p,aclexplode(p.proacl) a where p.oid in ('${trigger}'::regprocedure,'local_commerce.fulfillment_purchased_items(text,uuid,uuid)'::regprocedure) and a.grantee=0 and a.privilege_type='EXECUTE') then raise exception 'PUBLIC execute';end if;
 if not has_function_privilege('service_role','local_commerce.fulfillment_preview_command(text,text,text,text,text,text,uuid,integer,text,jsonb)','EXECUTE') then raise exception 'command inaccessible';end if;
end;$security$;`;
sql(`begin;set local statement_timeout='8000ms';${candidate}
${checks}
${fullPreviewManifestSqlChecks(project,marker)}
set constraints all deferred;
do $service$ declare p jsonb;r jsonb;item uuid;media uuid;entries jsonb;begin
 p:=pg_temp.preview_setup(array[true]);select id into item from local_commerce.order_items where order_id=(p->>'order')::uuid;
 r:=pg_temp.preview_call(pg_temp.preview_reserve(p,item));media:=(r#>>'{value,previewMediaId}')::uuid;
 perform pg_temp.fa(pg_temp.preview_call(pg_temp.preview_ready(p,media))->>'status'='found','ready');
 entries:=jsonb_build_array(jsonb_build_object('orderItemId',item,'previewMediaId',media));
 set local role service_role;
 r:=pg_temp.preview_call(p||jsonb_build_object('operation','publish','key',pg_temp.preview_key(),'input',jsonb_build_object('entries',entries)));
 if r->>'status'<>'found' then raise exception 'service role publication rejected';end if;
 -- This flush occurs while service_role is the effective caller, matching
 -- PostgREST commit rather than an all-postgres rollback simulation.
 set constraints all immediate;
 reset role;
 if has_function_privilege('service_role','local_commerce.assert_preview_manifest_complete()','EXECUTE') then raise exception 'helper exposed';end if;
end;$service$;rollback;`);
assert.deepEqual(ledger(),before);
assert.deepEqual(snapshot(),originalData,'rollback data and Storage metadata unchanged');assert.equal(security(),originalSecurity,'rollback security unchanged');
if(apply){assert.equal(checksum,manifest.migrations[20].checksum);sql(ledgerWrappers(manifest,sources,project,marker)[20]);}
if(apply){sql(checks);assert.equal(security(),originalSecurity,'no grants/RLS/policy/trigger relationship changes');
 const business=rows=>rows.filter(r=>!['local_commerce.migration_ledger','local_commerce.project_identities'].includes(r.table));
 assert.deepEqual(business(snapshot()),business(originalData),'migration does not change business or Storage rows');}
const after=ledger();assert.equal(after.length,apply?21:20);after.forEach((r,i)=>{assert.equal(r.version,i+1);assert.equal(r.project,project);assert.equal(r.checksum,manifest.migrations[i].checksum);});
assert.equal(sql(`select local_commerce.verify_project_identity('${project}','${marker}');`),'t');
console.info(JSON.stringify({status:'PASS',project,checksum,applied:apply,ledger:after.length,pending:manifest.migrations.length-after.length,serviceRoleDeferredCommit:true,priorChecksumsUnchanged:true,unchangedTableCount:tables.length,security:'trigger-only; no direct helper execute; grants/RLS/Storage unchanged',businessRowsUnchanged:true}));
