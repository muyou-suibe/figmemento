// Applied-ledger HTTP security evidence; denied writes only, no data cleanup.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash,createHmac} from 'node:crypto';
const run='run-5576dfd8',project=`figmemento-local-commerce-test-${run}`;
const dir=`${process.cwd()}/local/commerce/runtime/disposable/${run}`;
const prep=JSON.parse(readFileSync(`${dir}/ledger-preparation.json`)),c=prep.config;
const db='3f0a14e18d07b71e0b235dffcdc61e672086d6fb5b32b35849aa8bf54f3be3e4';
function command(bin,args,input){const r=spawnSync(bin,args,{input,encoding:'utf8',timeout:15000,maxBuffer:1048576});assert.equal(r.status,0,r.error?.code??'bounded command failed');return r.stdout.trim();}
const inspected=JSON.parse(command('docker',['inspect',db]))[0];assert.equal(inspected.Id,db);assert.equal(inspected.Config.Labels['com.supabase.cli.workdir'],dir);assert.equal(inspected.State.Status,'running');
assert.equal(c.projectId,project);assert.equal(c.projectKind,'disposable_test');
const sql=q=>command('docker',['exec','-i',db,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],q);
assert.equal(sql("select current_setting('server_version_num')::int/10000;"),'17');
assert.equal(sql(`select local_commerce.verify_project_identity('${project}','${prep.markerDigest}');`),'t');
const manifest=JSON.parse(readFileSync('local/commerce/migrations/manifest.json'));assert.equal(manifest.schemaVersion,22);
const ledger=JSON.parse(sql("select json_agg(json_build_object('version',version,'checksum',checksum) order by version) from local_commerce.migration_ledger;"));
assert.equal(ledger.length,22);manifest.migrations.forEach((m,i)=>{assert.equal(ledger[i].version,m.version);assert.equal(ledger[i].checksum,m.checksum);assert.equal(createHash('sha256').update(readFileSync(`local/commerce/migrations/${m.filename}`)).digest('hex'),m.checksum);});
const sig='local_commerce.fulfillment_customer_command(text,text,text,text,uuid,text,timestamptz,text,text,text,text,integer,text,integer)';
assert.equal(sql(`select prosecdef and proconfig @> ARRAY['search_path=pg_catalog, local_commerce'] from pg_proc where oid='${sig}'::regprocedure;`),'t');
assert.equal(sql(`select count(*) from pg_proc p,aclexplode(p.proacl) a where p.oid='${sig}'::regprocedure and a.grantee not in(p.proowner,(select oid from pg_roles where rolname='service_role'));`),'0');
assert.equal(sql("select count(*) from pg_class where oid in ('local_commerce.fulfillment_preview_media'::regclass,'local_commerce.preview_manifest_entries'::regclass) and relrowsecurity;"),'2');
assert.equal(sql("select public from storage.buckets where id='local-commerce-private';"),'f');
const info=JSON.parse(command('node_modules/.bin/supabase',['status','--workdir',dir,'-o','json']));assert.equal(info.API_URL,c.endpoints.apiUrl);assert.equal(new URL(info.API_URL).hostname,'127.0.0.1');
const h=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
const p=Buffer.from(JSON.stringify({role:'authenticated',exp:Math.floor(Date.now()/1000)+300})).toString('base64url');
const jwt=h+'.'+p+'.'+createHmac('sha256',info.JWT_SECRET).update(h+'.'+p).digest('base64url');
const args={p_project_id:project,p_marker_digest:prep.markerDigest,p_owner_kind:'guest',p_owner_selector:'0'.repeat(64),p_customer_id:null,p_session_hash:null,p_authority_expires_at:new Date(Date.now()+60000).toISOString(),p_capability_hash:'0'.repeat(64),p_public_reference:'FM-LOCAL-0000000000000000',p_operation:'read',p_key_digest:null,p_expected_preview_version:null,p_note:'',p_expected_aggregate_version:null};
const results=[];
for(const [role,credential] of [['anon',info.ANON_KEY],['authenticated',jwt],['service_role',info.SERVICE_ROLE_KEY]]){
 const headers={apikey:info.ANON_KEY,authorization:'Bearer '+credential,'content-type':'application/json','Content-Profile':'local_commerce','Accept-Profile':'local_commerce'};
 const r=await fetch(info.API_URL+'/rest/v1/rpc/fulfillment_customer_command',{method:'POST',headers,body:JSON.stringify(args),signal:AbortSignal.timeout(5000)});
 results.push({role,operation:'RPC',http:r.status});
 if(role==='service_role'){assert.equal(r.status,200);assert.deepEqual(await r.json(),{status:'unavailable'});continue;}
 assert.ok([401,403].includes(r.status));await r.arrayBuffer();
 for(const table of ['fulfillment_preview_media','preview_manifest_entries','fulfillment_decisions'])for(const method of ['GET','POST','PATCH','DELETE']){
   // Exact impossible identity ensures a privilege regression cannot touch a
   // retained row; POST remains invalid without any canonical ownership keys.
   const url=info.API_URL+'/rest/v1/'+table+(method==='POST'?'':'?id=eq.00000000-0000-0000-0000-000000000000');
   const denied=await fetch(url,{method,headers,...(['POST','PATCH'].includes(method)?{body:'{}'}:{}),signal:AbortSignal.timeout(5000)});
   results.push({role,table,method,http:denied.status});assert.ok([401,403].includes(denied.status));await denied.arrayBuffer();
 }
}
const publicObject=await fetch(info.API_URL+'/storage/v1/object/public/local-commerce-private/nonexistent-security-probe',{signal:AbortSignal.timeout(5000)});
assert.ok([400,401,403,404].includes(publicObject.status));await publicObject.arrayBuffer();
console.info(JSON.stringify({status:'PASS',run,ledger:22,pending:0,signature:sig,securityDefiner:true,fixedSearchPath:true,rlsTables:2,privateBucket:true,publicObjectHttp:publicObject.status,results}));
