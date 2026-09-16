// Candidate-only rollback evidence. Never registers or permanently applies SQL.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {customerPreviewSqlChecks} from './local-commerce-customer-preview-sql.mjs';
import {customerPreviewFaultSql} from './local-commerce-customer-preview-fault-sql.mjs';
import {productionQualitySql} from './local-commerce-production-quality-sql.mjs';
import {adminTimeoutSql} from './local-commerce-admin-timeout-sql.mjs';
import {fulfillmentReplaySql} from './local-commerce-fulfillment-replay-sql.mjs';
import {ledgerWrappers} from '../../scripts/local-commerce-ledger-wrapper.mjs';
const run='run-5576dfd8',project=`figmemento-local-commerce-test-${run}`;
const dir=`${process.cwd()}/local/commerce/runtime/disposable/${run}`;
const prep=JSON.parse(readFileSync(`${dir}/ledger-preparation.json`));
const db='3f0a14e18d07b71e0b235dffcdc61e672086d6fb5b32b35849aa8bf54f3be3e4';
function docker(args,input){const r=spawnSync('docker',args,{input,encoding:'utf8',timeout:15000,maxBuffer:1048576});assert.equal(r.status,0,r.error?.code??r.stderr);return r.stdout.trim();}
const c=JSON.parse(docker(['inspect',db]))[0];
assert.equal(c.Id,db);assert.equal(c.State.Status,'running');assert.equal(c.Config.Labels['com.supabase.cli.workdir'],dir);
assert.equal(prep.config.projectId,project);assert.equal(prep.config.projectKind,'disposable_test');
const sql=q=>docker(['exec','-i',db,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],q);
assert.equal(sql("select current_setting('server_version_num')::int/10000;"),'17');
assert.equal(sql(`select local_commerce.verify_project_identity('${project}','${prep.markerDigest}');`),'t');
const manifest=JSON.parse(readFileSync('local/commerce/migrations/manifest.json'));
const ledger=JSON.parse(sql('select json_agg(l order by version) from local_commerce.migration_ledger l;'));
assert.equal(ledger.length,24);assert.ok([24,25].includes(manifest.schemaVersion));
const registered=manifest.migrations.find(m=>m.version===25);
manifest.schemaVersion=24;manifest.migrations=manifest.migrations.slice(0,24);
manifest.migrations.forEach((m,i)=>{assert.equal(ledger[i].version,m.version);assert.equal(ledger[i].checksum,m.checksum);assert.equal(createHash('sha256').update(readFileSync(`local/commerce/migrations/${m.filename}`)).digest('hex'),m.checksum);});
const tables=JSON.parse(sql("select json_agg(format('%I.%I',schemaname,tablename) order by tablename) from pg_tables where schemaname='local_commerce' or (schemaname='storage' and tablename in('objects','buckets'));"));
const snapshot=()=>sql(tables.map(t=>`select '${t}',count(*),md5(coalesce(string_agg(to_jsonb(t)::text,',' order by to_jsonb(t)::text),'')) from ${t} t;`).join('\n'));
const before=snapshot();
const candidate=readFileSync('local/commerce/migrations/0025_local-commerce-admin-timeout.sql','utf8');
const entry={version:25,migrationId:'local-commerce-admin-timeout',filename:'0025_local-commerce-admin-timeout.sql',
 checksum:createHash('sha256').update(candidate).digest('hex'),
 rollback:'Disable persistent production/quality commands and preserve all Orders, private media, manifests, decisions and ledger. No reset, reseed, deletion or purchase rewrite.',
 forwardFix:'After permanent application use 0026+ only on authorized run-5576dfd8. Never edit applied 0001-0025. No Task 8 or provider activation.'};
if(registered)assert.deepEqual(registered,entry);
const planned={...manifest,schemaVersion:25,migrations:[...manifest.migrations,entry]};
const wrapper=ledgerWrappers(planned,[...manifest.migrations.map(m=>readFileSync(`local/commerce/migrations/${m.filename}`,'utf8')),candidate],project,prep.markerDigest).at(-1);
try {
 sql(wrapper.replace('begin;','begin;set local statement_timeout=\'8000ms\';').replace(/commit;\s*$/,
  `${customerPreviewSqlChecks(project,prep.markerDigest)}${customerPreviewFaultSql(project,prep.markerDigest)}${fulfillmentReplaySql()}${productionQualitySql(project,prep.markerDigest)}${adminTimeoutSql(project,prep.markerDigest)} rollback;`));
} finally { assert.equal(snapshot(),before,'complete table digests unchanged after rollback'); }
assert.equal(sql('select count(*) from local_commerce.migration_ledger;'),'24');
console.info(JSON.stringify({status:'PASS',scope:'Task 7.6 rollback-only pre-apply; NOT real HTTP acceptance',run,ledger:24,pending:0,
 candidateRegistered:false,candidateApplied:false,candidateSha256:createHash('sha256').update(candidate).digest('hex'),
 unchangedTables:tables.length,databaseDigest:createHash('sha256').update(before).digest('hex'),
 directV1Approval:true,revisionChain:true,changedAggregateReplayConflict:true,customerFaultPoints:4,revisionPublicationFaultPoints:8,
 guestMemberSqlAuthorization:true,noteUtf16:true,timeoutFaultPoints:4,deadlineBoundary:true,legacyMissingDeadline:true,
 oldDeadlineRejected:true,revisionPendingRejected:true,twoRevisionsNoV4:true,distinctTimeoutProduction:true,
 upstreamAndHistoricalImmutability:true,aclRls:true,ledgerWrapper:true}));

if(process.argv.includes('--apply-authorized-0025')){
 assert.ok(registered,'register verified checksum before apply');
 sql(wrapper);
 const after=JSON.parse(sql('select json_agg(l order by version) from local_commerce.migration_ledger l;'));
 assert.equal(after.length,25);planned.migrations.forEach((m,i)=>{assert.equal(after[i].version,m.version);assert.equal(after[i].checksum,m.checksum);});
 console.info(JSON.stringify({status:'PASS',applied:25,ledger:25,pending:0,checksum:entry.checksum}));
}
