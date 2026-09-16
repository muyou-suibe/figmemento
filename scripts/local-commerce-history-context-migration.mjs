import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {ledgerWrappers} from './local-commerce-ledger-wrapper.mjs';
const apply=process.argv[2]==='--apply-authorized-read-context';
assert.ok(apply || process.argv[2]==='--preapply');
const project='figmemento-local-commerce-test-run-5576dfd8';
const workdir=`${process.cwd()}/local/commerce/runtime/disposable/run-5576dfd8`;
const container='3f0a14e18d07b71e0b235dffcdc61e672086d6fb5b32b35849aa8bf54f3be3e4';
const marker='a9e9004d843753efa456c4e8b66f91ed95d268034fba1166c55d9785dadf815c';
const run=(args,input)=>{const r=spawnSync('docker',args,{input,encoding:'utf8',timeout:15000});assert.equal(r.status,0,r.error?.code??r.stderr);return r.stdout.trim();};
const c=JSON.parse(run(['inspect',container]))[0];assert.equal(c.Id,container);assert.equal(c.State.Status,'running');assert.equal(c.Config.Labels['com.supabase.cli.workdir'],workdir);
const sql=input=>run(['exec','-i',container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],input);
assert.equal(sql("select current_setting('server_version_num')::integer/10000;"),'17');
assert.equal(sql(`select local_commerce.verify_project_identity('${project}','${marker}');`),'t');
const manifest=JSON.parse(readFileSync('local/commerce/migrations/manifest.json'));
assert.equal(manifest.schemaVersion,apply?17:16);
const sources=manifest.migrations.map(m=>{const s=readFileSync(`local/commerce/migrations/${m.filename}`,'utf8');assert.equal(createHash('sha256').update(s).digest('hex'),m.checksum);return s;});
const ledger=()=>JSON.parse(sql("select json_agg(json_build_object('version',version,'checksum',checksum,'project',project_id) order by version) from local_commerce.migration_ledger;"));
const before=ledger();assert.equal(before.length,16);before.forEach((v,i)=>{assert.equal(v.version,i+1);assert.equal(v.checksum,manifest.migrations[i].checksum);assert.equal(v.project,project);});
const candidate=readFileSync('local/commerce/migrations/0017_local-commerce-history-context.sql','utf8');
assert.doesNotMatch(candidate,/^\s*(?:begin|commit|rollback)\s*;|\b(?:insert into|update local_commerce|delete from|create table|alter table)\b/im);
const checksum=createHash('sha256').update(candidate).digest('hex');
const sig='local_commerce.read_order_history(text,text,text,text,uuid,text,timestamptz,text,uuid,text,uuid,text)';
const definitionDigest=()=>sql(`select md5(pg_get_functiondef('${sig}'::regprocedure));`);
const beforeDigest=definitionDigest();
if(apply){assert.equal(checksum,manifest.migrations[16].checksum);sql(ledgerWrappers(manifest,sources,project,marker)[16]);}
else{
 sql(`BEGIN; SET LOCAL statement_timeout='5000ms'; ${candidate}
 DO $check$ BEGIN
 IF position('itemSequence' in pg_get_functiondef('${sig}'::regprocedure))=0 OR position('orderLifecycle' in pg_get_functiondef('${sig}'::regprocedure))=0 THEN RAISE EXCEPTION 'missing context'; END IF;
 IF has_function_privilege('anon','${sig}','EXECUTE') OR has_function_privilege('authenticated','${sig}','EXECUTE') THEN RAISE EXCEPTION 'privilege expansion'; END IF;
 END $check$; ROLLBACK;`);
 assert.equal(definitionDigest(),beforeDigest);
}
const after=ledger();assert.equal(after.length,apply?17:16);
after.forEach((v,i)=>assert.equal(v.checksum,manifest.migrations[i].checksum));
console.info(JSON.stringify({mode:apply?'APPLIED':'ROLLED BACK',project,pg:17,ledger:after.length,pending:0,checksum,existingSnapshotsChanged:0}));
