// Applied 0024 validation. Every synthetic SQL fixture/fault is rolled back.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {customerPreviewSqlChecks} from './local-commerce-customer-preview-sql.mjs';
import {productionQualitySql} from './local-commerce-production-quality-sql.mjs';
import {fulfillmentReplaySql} from './local-commerce-fulfillment-replay-sql.mjs';
import {customerPreviewFaultSql} from './local-commerce-customer-preview-fault-sql.mjs';
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
assert.equal(ledger.length,24);assert.equal(manifest.schemaVersion,24);
manifest.migrations.forEach((m,i)=>{assert.equal(ledger[i].version,m.version);assert.equal(ledger[i].checksum,m.checksum);assert.equal(createHash('sha256').update(readFileSync(`local/commerce/migrations/${m.filename}`)).digest('hex'),m.checksum);});
const tables=JSON.parse(sql("select json_agg(format('%I.%I',schemaname,tablename) order by tablename) from pg_tables where schemaname='local_commerce' or (schemaname='storage' and tablename in('objects','buckets'));"));
const snapshot=()=>sql(tables.map(t=>`select '${t}',count(*),md5(coalesce(string_agg(to_jsonb(t)::text,',' order by to_jsonb(t)::text),'')) from ${t} t;`).join('\n'));
const before=snapshot();

try {sql(`begin;set local statement_timeout='8000ms';${customerPreviewSqlChecks(project,prep.markerDigest)}${customerPreviewFaultSql(project,prep.markerDigest)}${fulfillmentReplaySql()}${productionQualitySql(project,prep.markerDigest)} rollback;`);}
finally {assert.equal(snapshot(),before,'complete tables unchanged after rollback');}
console.info(JSON.stringify({status:'PASS',run,ledger:24,pending:0,unchangedTables:tables.length,task:'7.5',reserveFaultPoints:4,readyFaultPoints:4,customerFaultPoints:4,revisionPublicationFaultPoints:8,guestMemberSqlAuthorization:true,utf16Boundaries:true,aclRls:true,historicalUpstreamImmutable:true}));
