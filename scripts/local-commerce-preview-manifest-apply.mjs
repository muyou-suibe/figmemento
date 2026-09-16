import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {ledgerWrappers} from './local-commerce-ledger-wrapper.mjs';
assert.deepEqual(process.argv.slice(2),['--apply-authorized-preview']);
// Re-execute the complete rollback gate immediately before permanent apply.
await import('./local-commerce-preview-manifest-preapply.mjs');
const project='figmemento-local-commerce-test-run-5576dfd8';
const marker='a9e9004d843753efa456c4e8b66f91ed95d268034fba1166c55d9785dadf815c';
const container='3f0a14e18d07b71e0b235dffcdc61e672086d6fb5b32b35849aa8bf54f3be3e4';
function docker(args,input){const r=spawnSync('docker',args,{input,encoding:'utf8',timeout:15000,maxBuffer:1048576});assert.equal(r.status,0,r.error?.code??r.stderr);return r.stdout.trim();}
const c=JSON.parse(docker(['inspect',container]))[0];
assert.equal(c.Id,container);assert.equal(c.State.Status,'running');
assert.equal(c.Config.Labels['com.supabase.cli.workdir'],`${process.cwd()}/local/commerce/runtime/disposable/run-5576dfd8`);
const sql=q=>docker(['exec','-i',container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],q);
assert.equal(sql("select current_setting('server_version_num')::int/10000;"),'17');
const manifest=JSON.parse(readFileSync('local/commerce/migrations/manifest.json'));
assert.equal(manifest.schemaVersion,20);assert.equal(manifest.migrations.length,20);
const sources=manifest.migrations.map(m=>{const s=readFileSync(`local/commerce/migrations/${m.filename}`,'utf8');assert.equal(createHash('sha256').update(s).digest('hex'),m.checksum);return s;});
assert.equal(manifest.migrations[19].checksum,'63a4d18a984ee95511743d333072a9d56bd15421eaac6e2ed51e11647ce818e9');
// The wrapper locks and rechecks the complete prior ledger and exact marker in
// the same transaction as DDL and the new ledger row. Never direct SQL apply.
sql(ledgerWrappers(manifest,sources,project,marker)[19]);
assert.equal(sql(`select local_commerce.verify_project_identity('${project}','${marker}');`),'t');
const after=JSON.parse(sql("select json_agg(json_build_object('version',version,'checksum',checksum,'project',project_id) order by version) from local_commerce.migration_ledger;"));
assert.equal(after.length,20);after.forEach((r,i)=>{assert.equal(r.version,i+1);assert.equal(r.project,project);assert.equal(r.checksum,manifest.migrations[i].checksum);});
console.info(JSON.stringify({status:'PASS',project,ledger:20,pending:0,markerUnchanged:true,priorChecksumsUnchanged:true,checksum:manifest.migrations[19].checksum,applied:true}));
