// Candidate-only rollback evidence; permanent apply requires the exact explicit flag.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {customerPreviewSqlChecks} from './local-commerce-customer-preview-sql.mjs';
import {customerPreviewFaultSql} from './local-commerce-customer-preview-fault-sql.mjs';
import {productionQualitySql} from './local-commerce-production-quality-sql.mjs';
import {adminTimeoutSql} from './local-commerce-admin-timeout-sql.mjs';
import {fulfillmentReplaySql} from './local-commerce-fulfillment-replay-sql.mjs';
import {photoReviewSql} from './local-commerce-photo-review-sql.mjs';
import {ledgerWrappers} from '../../scripts/local-commerce-ledger-wrapper.mjs';
const run='run-5576dfd8',project=`figmemento-local-commerce-test-${run}`;
const dir=`${process.cwd()}/local/commerce/runtime/disposable/${run}`;
const prep=JSON.parse(readFileSync(`${dir}/ledger-preparation.json`));
const db='3f0a14e18d07b71e0b235dffcdc61e672086d6fb5b32b35849aa8bf54f3be3e4';
function docker(args,input){const r=spawnSync('docker',args,{input,encoding:'utf8',timeout:20000,maxBuffer:4*1024*1024});assert.equal(r.status,0,r.error?.code??r.stderr);return r.stdout.trim();}
const c=JSON.parse(docker(['inspect',db]))[0];
assert.equal(c.Id,db);assert.equal(c.State.Status,'running');assert.equal(c.Config.Labels['com.supabase.cli.workdir'],dir);
assert.equal(prep.config.projectId,project);assert.equal(prep.config.projectKind,'disposable_test');
const sql=q=>docker(['exec','-i',db,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],q);
assert.equal(sql("select current_setting('server_version_num')::int/10000;"),'17');
assert.equal(sql(`select local_commerce.verify_project_identity('${project}','${prep.markerDigest}');`),'t');
const manifest=JSON.parse(readFileSync('local/commerce/migrations/manifest.json'));
const ledger=JSON.parse(sql('select json_agg(l order by version) from local_commerce.migration_ledger l;'));
assert.equal(ledger.length,25);assert.equal(manifest.schemaVersion,26);
const registered=manifest.migrations.find(m=>m.version===26);
const baseline={...manifest,schemaVersion:25,migrations:manifest.migrations.slice(0,25)};
baseline.migrations.forEach((m,i)=>{assert.equal(ledger[i].version,m.version);assert.equal(ledger[i].checksum,m.checksum);assert.equal(createHash('sha256').update(readFileSync(`local/commerce/migrations/${m.filename}`)).digest('hex'),m.checksum);});
const tables=JSON.parse(sql("select json_agg(format('%I.%I',schemaname,tablename) order by tablename) from pg_tables where schemaname='local_commerce' or (schemaname='storage' and tablename in('objects','buckets'));"));
const snapshot=()=>sql(tables.map(t=>`select '${t}',count(*),md5(coalesce(string_agg(to_jsonb(t)::text,',' order by to_jsonb(t)::text),'')) from ${t} t;`).join('\n'));
const before=snapshot();
const candidate=readFileSync('local/commerce/migrations/0026_local-commerce-photo-review-decisions.sql','utf8');
const entry={version:26,migrationId:'local-commerce-photo-review-decisions',filename:'0026_local-commerce-photo-review-decisions.sql',
 checksum:createHash('sha256').update(candidate).digest('hex'),
 rollback:'Disable the persistent photo-review decision command while preserving all canonical reviews, Orders, purchased media, Fulfillment decisions and ledger. No reset, deletion, reseed or purchase rewrite.',
 forwardFix:'After permanent application use 0027+ only on authorized run-5576dfd8. Never edit applied 0001-0026. No Task 8 or provider activation.'};
assert.deepEqual(registered,entry);
const planned={...baseline,schemaVersion:26,migrations:[...baseline.migrations,entry]};
const wrapper=ledgerWrappers(planned,[...baseline.migrations.map(m=>readFileSync(`local/commerce/migrations/${m.filename}`,'utf8')),candidate],project,prep.markerDigest).at(-1);
try {
 sql(wrapper.replace('begin;',"begin;set local statement_timeout='12000ms';").replace(/commit;\s*$/,
  `${customerPreviewSqlChecks(project,prep.markerDigest)}${customerPreviewFaultSql(project,prep.markerDigest)}${fulfillmentReplaySql()}${productionQualitySql(project,prep.markerDigest)}${adminTimeoutSql(project,prep.markerDigest)}${photoReviewSql(project,prep.markerDigest)} rollback;`));
} finally {assert.equal(snapshot(),before,'complete table digests unchanged after rollback');}
assert.equal(sql('select count(*) from local_commerce.migration_ledger;'),'25');
console.info(JSON.stringify({status:'PASS',scope:'Task 7.7 rollback-only pre-apply; NOT real HTTP acceptance',run,ledger:25,pending:0,
 candidateRegistered:true,candidateApplied:false,candidateSha256:entry.checksum,unchangedTables:tables.length,
 databaseDigest:createHash('sha256').update(before).digest('hex'),approveReject:true,replayConflict:true,
 faultPoints:6,canonicalMediaBindings:true,emptyMediaNotApplicable:true,aclRls:true,ledgerWrapper:true}));
if(process.argv.includes('--apply-authorized-0026')){
 sql(wrapper);
 const after=JSON.parse(sql('select json_agg(l order by version) from local_commerce.migration_ledger l;'));
 assert.equal(after.length,26);planned.migrations.forEach((m,i)=>{assert.equal(after[i].version,m.version);assert.equal(after[i].checksum,m.checksum);});
 console.info(JSON.stringify({status:'PASS',applied:26,ledger:26,pending:0,checksum:entry.checksum}));
}
