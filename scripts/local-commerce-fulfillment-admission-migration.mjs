import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {ledgerWrappers} from './local-commerce-ledger-wrapper.mjs';
import {fulfillmentAdmissionSqlChecks} from '../tests/database/local-commerce-fulfillment-admission-sql.mjs';
const mode=process.argv[2];assert.ok(['--preapply','--apply-authorized-admission','--postapply-check'].includes(mode));
const apply=mode==='--apply-authorized-admission',post=mode==='--postapply-check';
const project='figmemento-local-commerce-test-run-5576dfd8';
const workdir=`${process.cwd()}/local/commerce/runtime/disposable/run-5576dfd8`;
const container='3f0a14e18d07b71e0b235dffcdc61e672086d6fb5b32b35849aa8bf54f3be3e4';
const marker='a9e9004d843753efa456c4e8b66f91ed95d268034fba1166c55d9785dadf815c';
function run(args,input){const r=spawnSync('docker',args,{input,encoding:'utf8',timeout:15000,maxBuffer:1024*1024});assert.equal(r.status,0,r.error?.code??r.stderr);return r.stdout.trim();}
const c=JSON.parse(run(['inspect',container]))[0];assert.equal(c.Id,container);assert.equal(c.State.Status,'running');assert.equal(c.Config.Labels['com.supabase.cli.workdir'],workdir);
const sql=q=>run(['exec','-i',container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],q);
assert.equal(sql("select current_setting('server_version_num')::integer/10000;"),'17');
assert.equal(sql(`select local_commerce.verify_project_identity('${project}','${marker}');`),'t');
const manifest=JSON.parse(readFileSync('local/commerce/migrations/manifest.json'));
assert.equal(manifest.schemaVersion,apply||post?19:18);
const sources=manifest.migrations.map(m=>{const s=readFileSync(`local/commerce/migrations/${m.filename}`,'utf8');assert.equal(createHash('sha256').update(s).digest('hex'),m.checksum);return s;});
const ledger=()=>JSON.parse(sql("select json_agg(json_build_object('version',version,'checksum',checksum,'project',project_id) order by version) from local_commerce.migration_ledger;"));
const before=ledger();assert.equal(before.length,post?19:18);
before.forEach((v,i)=>{assert.equal(v.version,i+1);assert.equal(v.checksum,manifest.migrations[i].checksum);assert.equal(v.project,project);});
const candidate=readFileSync('local/commerce/migrations/0019_local-commerce-fulfillment-admission.sql','utf8');
assert.doesNotMatch(candidate,/^\s*(?:begin|commit|rollback)\s*;/im);
const checksum=createHash('sha256').update(candidate).digest('hex');
const sig='local_commerce.fulfillment_admission(text,text,text,text,text,text,uuid,integer,text,text)';
const immutable=()=>sql("select md5(coalesce(string_agg(row_to_json(s)::text,',' order by id),'')) from local_commerce.order_purchase_snapshots s;");
const original=immutable();
const checks=`DO $acl$ BEGIN
 IF has_function_privilege('anon','${sig}','EXECUTE') OR has_function_privilege('authenticated','${sig}','EXECUTE') OR NOT has_function_privilege('service_role','${sig}','EXECUTE') THEN RAISE EXCEPTION 'bad ACL'; END IF;
 IF has_function_privilege('service_role','local_commerce.fulfillment_purchased_items(text,uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'internal helper exposed'; END IF;
 IF (select count(*) from pg_class where oid in ('local_commerce.fulfillments'::regclass,'local_commerce.photo_reviews'::regclass,'local_commerce.fulfillment_decisions'::regclass) and relrowsecurity)<>3 THEN RAISE EXCEPTION 'RLS disabled'; END IF;
 END $acl$;`;
if(apply){
 assert.equal(checksum,manifest.migrations[18].checksum);
 sql(`BEGIN; SET LOCAL statement_timeout='8000ms'; ${candidate} ${checks} ${fulfillmentAdmissionSqlChecks(project,marker)} ROLLBACK;`);
 sql(ledgerWrappers(manifest,sources,project,marker)[18]);
}else{
 sql(`BEGIN; SET LOCAL statement_timeout='8000ms'; ${post?'':candidate} ${checks} ${fulfillmentAdmissionSqlChecks(project,marker)} ROLLBACK;`);
 if(!post)assert.equal(sql(`select to_regprocedure('${sig}') is null;`),'t');
}
assert.equal(immutable(),original);assert.equal(sql(`select local_commerce.verify_project_identity('${project}','${marker}');`),'t');
const after=ledger();assert.equal(after.length,apply||post?19:18);
after.forEach((v,i)=>assert.equal(v.checksum,manifest.migrations[i].checksum));
console.info(JSON.stringify({mode,project,pg:17,ledger:after.length,pending:0,checksum,immutableDigest:original,
 sqlOnly:true,syntheticFixturesRolledBack:true,photoApplicabilityMatrix:true,atomicFailurePoints:3,acl:true,rls:true}));
