import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { ledgerWrappers } from "../../scripts/local-commerce-ledger-wrapper.mjs";

const run="run-5576dfd8", project=`figmemento-local-commerce-test-${run}`;
const dir=`${process.cwd()}/local/commerce/runtime/disposable/${run}`;
const prep=JSON.parse(readFileSync(`${dir}/ledger-preparation.json`,"utf8"));
const db="3f0a14e18d07b71e0b235dffcdc61e672086d6fb5b32b35849aa8bf54f3be3e4";
const candidate=readFileSync("local/commerce/migrations/0032_local-commerce-digital-publication-schema-cache.sql","utf8");
const entry={version:32,migrationId:"local-commerce-digital-publication-schema-cache",filename:"0032_local-commerce-digital-publication-schema-cache.sql",checksum:createHash("sha256").update(candidate).digest("hex"),rollback:"No data rollback is required. Keep the restricted 0031 functions and refresh PostgREST schema cache when the local stack is available.",forwardFix:"After permanent application use 0033+ only on authorized run-5576dfd8. Never edit applied 0001-0032. Preserve the restricted digital publication RPCs and immutable version facts."};
function docker(args,input){const r=spawnSync("docker",args,{input,encoding:"utf8",timeout:30000,maxBuffer:16*1024*1024});assert.equal(r.status,0,r.error?.code??r.stderr);return r.stdout.trim();}
const inspected=JSON.parse(docker(["inspect",db]))[0];assert.equal(inspected.Id,db);assert.equal(inspected.State.Status,"running");assert.equal(inspected.Config.Labels["com.supabase.cli.workdir"],dir);
const sql=q=>docker(["exec","-i",db,"psql","-X","-qAt","-v","ON_ERROR_STOP=1","-U","postgres","-d","postgres"],q);
assert.equal(prep.config.projectId,project);assert.equal(sql("select current_setting('server_version_num')::int/10000;"),"17");assert.equal(sql(`select local_commerce.verify_project_identity('${project}','${prep.markerDigest}');`),"t");
const manifest=JSON.parse(readFileSync("local/commerce/migrations/manifest.json","utf8"));assert.equal(manifest.schemaVersion,32);assert.deepEqual(manifest.migrations.at(-1),entry);
const baseline={...manifest,schemaVersion:31,migrations:manifest.migrations.slice(0,31)};
const ledger=JSON.parse(sql("select json_agg(l order by version) from local_commerce.migration_ledger l;"));
if(ledger.length>=32){manifest.migrations.slice(0,ledger.length).forEach((m,i)=>{assert.equal(ledger[i].version,m.version);assert.equal(ledger[i].checksum,m.checksum);assert.equal(createHash("sha256").update(readFileSync(`local/commerce/migrations/${m.filename}`)).digest("hex"),m.checksum);});assert.equal(sql(`select local_commerce.verify_project_identity('${project}','${prep.markerDigest}');`),"t");console.info(JSON.stringify({status:"PASS",scope:"Task 9.1 0032 applied migration verification",ledger:ledger.length,pending:manifest.schemaVersion-ledger.length,checksum:entry.checksum}));process.exit(0);}
assert.equal(ledger.length,31);
baseline.migrations.forEach((m,i)=>{assert.equal(ledger[i].version,m.version);assert.equal(ledger[i].checksum,m.checksum);assert.equal(createHash("sha256").update(readFileSync(`local/commerce/migrations/${m.filename}`)).digest("hex"),m.checksum);});
const sources=manifest.migrations.map(m=>readFileSync(`local/commerce/migrations/${m.filename}`,"utf8"));const wrapper=ledgerWrappers(manifest,sources,project,prep.markerDigest).at(-1);
const before=sql("select count(*)||':'||coalesce(md5(string_agg(to_jsonb(l)::text,',' order by version)),md5('')) from local_commerce.migration_ledger l;");
sql(wrapper.replace("begin;","begin;set local statement_timeout='15000ms';").replace(/commit;\s*$/,"rollback;"));assert.equal(sql("select count(*) from local_commerce.migration_ledger;"),"31");assert.equal(sql("select count(*)||':'||coalesce(md5(string_agg(to_jsonb(l)::text,',' order by version)),md5('')) from local_commerce.migration_ledger l;"),before);
console.info(JSON.stringify({status:"PASS",scope:"Task 9.1 0032 rollback-only pre-apply",ledger:31,pending:0,checksum:entry.checksum}));
if(process.argv.includes("--apply-authorized-0032")){sql(wrapper);assert.equal(sql("select count(*) from local_commerce.migration_ledger;"),"32");assert.equal(sql(`select local_commerce.verify_project_identity('${project}','${prep.markerDigest}');`),"t");console.info(JSON.stringify({status:"PASS",applied:32,ledger:32,pending:0,checksum:entry.checksum}));}
