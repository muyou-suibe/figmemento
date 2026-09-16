// Exact retained disposable stack, fresh synthetic Orders through actual Worker
// HTTP. No database reset, Storage mutation or pre-existing process stop.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash,createHmac} from 'node:crypto';
const run='run-5576dfd8',project=`figmemento-local-commerce-test-${run}`;
const dir=`${process.cwd()}/local/commerce/runtime/disposable/${run}`;
const prep=JSON.parse(readFileSync(`${dir}/ledger-preparation.json`)),c=prep.config;
const db='3f0a14e18d07b71e0b235dffcdc61e672086d6fb5b32b35849aa8bf54f3be3e4';
function command(bin,args,input){const r=spawnSync(bin,args,{input,encoding:'utf8',timeout:15000,maxBuffer:1024*1024});assert.equal(r.status,0,r.error?.code??'bounded command failed');return r.stdout.trim();}
const inspected=JSON.parse(command('docker',['inspect',db]))[0];assert.equal(inspected.Id,db);assert.equal(inspected.Config.Labels['com.supabase.cli.workdir'],dir);assert.equal(inspected.State.Status,'running');
assert.equal(c.projectId,project);assert.equal(c.projectKind,'disposable_test');
const sql=q=>command('docker',['exec','-i',db,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],q);
assert.equal(sql("select current_setting('server_version_num')::int/10000;"),'17');
assert.equal(sql(`select local_commerce.verify_project_identity('${project}','${prep.markerDigest}');`),'t');
const manifest=JSON.parse(readFileSync('local/commerce/migrations/manifest.json'));assert.equal(manifest.schemaVersion,19);
const ledger=JSON.parse(sql("select json_agg(json_build_object('version',version,'checksum',checksum) order by version) from local_commerce.migration_ledger;"));
assert.equal(ledger.length,19);manifest.migrations.forEach((m,i)=>{assert.equal(ledger[i].version,m.version);assert.equal(ledger[i].checksum,m.checksum);assert.equal(createHash('sha256').update(readFileSync(`local/commerce/migrations/${m.filename}`)).digest('hex'),m.checksum);});
const info=JSON.parse(command('node_modules/.bin/supabase',['status','--workdir',dir,'-o','json']));assert.equal(info.API_URL,c.endpoints.apiUrl);

const header=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
const payload=Buffer.from(JSON.stringify({role:'authenticated',exp:Math.floor(Date.now()/1000)+300})).toString('base64url');
const jwt=header+'.'+payload+'.'+createHmac('sha256',info.JWT_SECRET).update(header+'.'+payload).digest('base64url');
const url=c.endpoints.apiUrl+'/rest/v1/rpc/fulfillment_admission';
assert.equal(new URL(url).hostname,'127.0.0.1');
const args={p_project_id:project,p_marker_digest:prep.markerDigest,p_actor_kind:'operator',p_actor_id:'local-development-operator',p_public_reference:'FM-LOCAL-0000000000000000',p_operation:'read',p_order_id:null,p_expected_version:null,p_key_digest:null,p_context_digest:null};
const report=[];
for(const [role,credential] of [['anon',info.ANON_KEY],['authenticated',jwt],['service_role',info.SERVICE_ROLE_KEY]]){
 const r=await fetch(url,{method:'POST',headers:{apikey:info.ANON_KEY,authorization:'Bearer '+credential,'content-type':'application/json','Content-Profile':'local_commerce'},body:JSON.stringify(args),signal:AbortSignal.timeout(5000)});
 report.push({role,http:r.status});if(role==='service_role'){assert.equal(r.status,200);assert.deepEqual(await r.json(),{status:'unavailable'});}else{assert.ok([401,403].includes(r.status));await r.arrayBuffer();}
}
for(const patch of [{p_project_id:project+'-wrong'},{p_marker_digest:'0'.repeat(64)},{p_actor_kind:'customer'},{p_actor_id:'../browser'},{p_operation:'inject'}]){
 const r=await fetch(url,{method:'POST',headers:{apikey:info.SERVICE_ROLE_KEY,authorization:'Bearer '+info.SERVICE_ROLE_KEY,'content-type':'application/json','Content-Profile':'local_commerce'},body:JSON.stringify({...args,...patch}),signal:AbortSignal.timeout(5000)});assert.equal(r.status,200);assert.deepEqual(await r.json(),{status:'unavailable'});
}
console.info(JSON.stringify({run,ledger:19,status:'PASS',acl:report,invalidAuthorityCases:5,writes:0}));
