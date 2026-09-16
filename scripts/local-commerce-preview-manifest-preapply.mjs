import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fullPreviewManifestSqlChecks} from '../tests/database/local-commerce-preview-manifest-full-sql.mjs';

// Rollback-only candidate diagnostics; deliberately no registration/apply mode.
const project='figmemento-local-commerce-test-run-5576dfd8';
const marker='a9e9004d843753efa456c4e8b66f91ed95d268034fba1166c55d9785dadf815c';
const container='3f0a14e18d07b71e0b235dffcdc61e672086d6fb5b32b35849aa8bf54f3be3e4';
const workdir=`${process.cwd()}/local/commerce/runtime/disposable/run-5576dfd8`;
function run(args,input){
  const r=spawnSync('docker',args,{input,encoding:'utf8',timeout:15000,maxBuffer:2*1024*1024});
  assert.equal(r.status,0,r.error?.code??r.stderr);return r.stdout.trim();
}
const c=JSON.parse(run(['inspect',container]))[0];
assert.equal(c.Id,container);assert.equal(c.State.Status,'running');
assert.equal(c.Config.Labels['com.supabase.cli.workdir'],workdir);
const sql=q=>run(['exec','-i',container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],q);
assert.equal(sql("select current_setting('server_version_num')::integer/10000;"),'17');
assert.equal(sql(`select local_commerce.verify_project_identity('${project}','${marker}');`),'t');
const manifest=JSON.parse(readFileSync('local/commerce/migrations/manifest.json'));
const registered=process.argv.includes('--apply-authorized-preview');
assert.equal(manifest.schemaVersion,registered?20:19);assert.equal(manifest.migrations.length,registered?20:19);
manifest.migrations.forEach(m=>assert.equal(createHash('sha256').update(readFileSync(`local/commerce/migrations/${m.filename}`)).digest('hex'),m.checksum));
assert.equal(manifest.migrations[18].checksum,'fa2503b466fef22cbea70d6e47b0b587c372c39e1956151c56190740af8e4d29');
const ledger=()=>sql("select json_agg(json_build_object('version',version,'checksum',checksum,'project',project_id) order by version) from local_commerce.migration_ledger;");
const before=ledger();const rows=JSON.parse(before);assert.equal(rows.length,19);
rows.forEach((r,i)=>{assert.equal(r.project,project);assert.equal(r.version,i+1);assert.equal(r.checksum,manifest.migrations[i].checksum);});
const candidate=readFileSync('local/commerce/migrations/0020_local-commerce-private-preview-manifest.sql','utf8');
if(registered)assert.equal(createHash('sha256').update(candidate).digest('hex'),manifest.migrations[19].checksum);
assert.doesNotMatch(candidate,/^\s*(?:begin|commit|rollback)\s*;/im);
const sig='local_commerce.fulfillment_preview_command(text,text,text,text,text,text,uuid,integer,text,jsonb)';
assert.equal(sql(`select to_regprocedure('${sig}') is null;`),'t');
// Hash every existing local-commerce table, plus private Storage metadata.
// Only counts/digests leave PostgreSQL; no customer or credential rows do.
const inventory=JSON.parse(sql("select json_agg(format('%I.%I',schemaname,tablename) order by schemaname,tablename) from pg_tables where schemaname='local_commerce' or (schemaname='storage' and tablename in ('objects','buckets'));"));
const databaseSnapshot=()=>JSON.parse(sql(`select json_agg(v order by v->>'table') from (${inventory.map(t=>`select json_build_object('table','${t}','count',count(*),'digest',md5(coalesce(string_agg(to_jsonb(t)::text,',' order by to_jsonb(t)::text),''))) v from ${t} t`).join(' union all ')}) snapshots;`));
const databaseBefore=databaseSnapshot();
sql(`BEGIN; SET LOCAL statement_timeout='8000ms'; ${candidate}
DO $acl$ DECLARE role_name text;table_name text;privilege_name text;visible_rows bigint; BEGIN
 IF has_function_privilege('anon','${sig}','EXECUTE') OR has_function_privilege('authenticated','${sig}','EXECUTE')
 OR NOT has_function_privilege('service_role','${sig}','EXECUTE') THEN RAISE EXCEPTION 'RPC ACL';END IF;
 IF (select count(*) from pg_class where oid in ('local_commerce.fulfillment_preview_media'::regclass,'local_commerce.preview_manifest_entries'::regclass) and relrowsecurity)<>2 THEN RAISE EXCEPTION 'RLS';END IF;
 IF has_table_privilege('anon','local_commerce.fulfillment_preview_media','SELECT,INSERT,UPDATE,DELETE')
 OR has_table_privilege('authenticated','local_commerce.preview_manifest_entries','SELECT,INSERT,UPDATE,DELETE')
 OR has_table_privilege('service_role','local_commerce.fulfillment_preview_media','INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'direct CRUD';END IF;
 IF NOT EXISTS(select 1 from pg_proc where oid='${sig}'::regprocedure and prosecdef
   and proconfig @> ARRAY['search_path=pg_catalog, local_commerce']) THEN RAISE EXCEPTION 'search path';END IF;
 IF EXISTS(select 1 from pg_proc p,aclexplode(p.proacl) a where p.oid='${sig}'::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE') THEN RAISE EXCEPTION 'PUBLIC EXECUTE';END IF;
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
   FOREACH table_name IN ARRAY ARRAY['local_commerce.fulfillment_preview_media','local_commerce.preview_manifest_entries'] LOOP
     FOREACH privilege_name IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE'] LOOP
       IF has_table_privilege(role_name,table_name,privilege_name) THEN RAISE EXCEPTION 'browser CRUD';END IF;
     END LOOP;
   END LOOP;
 END LOOP;
 -- Storage owns its grants; its privacy boundary is RLS, not the Catalog ACL.
 IF (select count(*) from pg_class where oid in ('storage.objects'::regclass,'storage.buckets'::regclass) and relrowsecurity)<>2 THEN RAISE EXCEPTION 'Storage RLS';END IF;
 IF EXISTS(select 1 from pg_policies where schemaname='storage' and tablename in ('objects','buckets') and roles && ARRAY['public','anon','authenticated']::name[]) THEN RAISE EXCEPTION 'browser Storage policy';END IF;
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
   EXECUTE format('set local role %I',role_name);
   SELECT count(*) INTO visible_rows FROM storage.objects;
   IF visible_rows<>0 THEN RAISE EXCEPTION 'private objects visible';END IF;
   SELECT count(*) INTO visible_rows FROM storage.buckets;
   IF visible_rows<>0 THEN RAISE EXCEPTION 'private buckets visible';END IF;
   RESET ROLE;
 END LOOP;
 IF NOT EXISTS(select 1 from storage.buckets where id='local-commerce-private' and public=false) THEN RAISE EXCEPTION 'private bucket';END IF;
 IF EXISTS(select 1 from pg_proc p,aclexplode(p.proacl) a where p.oid='${sig}'::regprocedure
   and a.privilege_type='EXECUTE' and a.grantee not in (p.proowner,(select oid from pg_roles where rolname='service_role')))
 THEN RAISE EXCEPTION 'excess RPC execute';END IF;
END;$acl$;
${fullPreviewManifestSqlChecks(project,marker)} ROLLBACK;`);
assert.equal(ledger(),before);
assert.equal(sql(`select local_commerce.verify_project_identity('${project}','${marker}');`),'t');
assert.equal(sql(`select to_regprocedure('${sig}') is null;`),'t');
assert.deepEqual(databaseSnapshot(),databaseBefore,'rollback must leave every existing table and Storage metadata unchanged');
console.info(JSON.stringify({status:'PASS',scope:'expanded full pre-apply SQL/identity/security matrix; NOT live Task 7.2 acceptance',
  project,pg:17,ledger:19,pending:manifest.migrations.length-rows.length,checksum:createHash('sha256').update(candidate).digest('hex'),
  applied:false,publicationFaultPoints:4,syntheticFixturesRolledBack:true,databaseBeforeAfter:databaseBefore}));
