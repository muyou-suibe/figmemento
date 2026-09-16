// Exact retained disposable stack, fresh synthetic Orders through actual Worker
// HTTP. Authorized private preview writes only; no reset/delete or existing process stop.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawn,spawnSync} from 'node:child_process';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {createServer} from 'node:net';
import {createRequire} from 'node:module';
import {catalogDatabaseRows,catalogTestEnvironment,ids} from '../fixtures/local-persistent-catalog.mjs';
const task114=process.env.TASK_11_4_EQUIVALENT_IDENTITY_VERIFIED==='1';
const run=task114?'run-93f6c1a2':'run-5576dfd8',project=`figmemento-local-commerce-test-${run}`;
const dir=`${process.cwd()}/local/commerce/runtime/disposable/${run}`;
const prep=JSON.parse(readFileSync(`${dir}/ledger-preparation.json`)),c=prep.config;
const db=task114?process.env.TASK_11_4_VERIFIED_DB_CONTAINER_ID:'3f0a14e18d07b71e0b235dffcdc61e672086d6fb5b32b35849aa8bf54f3be3e4';
function command(bin,args,input){const r=spawnSync(bin,args,{input,encoding:'utf8',timeout:15000,maxBuffer:1024*1024});assert.equal(r.status,0,r.error?.code??'bounded command failed');return r.stdout.trim();}
assert.match(db??'',/^[a-f0-9]{64}$/);
if(!task114){const inspected=JSON.parse(command('docker',['inspect',db]))[0];assert.equal(inspected.Id,db);assert.equal(inspected.Config.Labels['com.supabase.cli.workdir'],dir);assert.equal(inspected.State.Status,'running');}
assert.equal(c.projectId,project);assert.equal(c.projectKind,'disposable_test');
const sql=q=>command('docker',['exec','-i',db,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],q);
assert.equal(sql("select current_setting('server_version_num')::int/10000;"),'17');
assert.equal(sql(`select local_commerce.verify_project_identity('${project}','${prep.markerDigest}');`),'t');
const manifest=JSON.parse(readFileSync('local/commerce/migrations/manifest.json'));assert.ok(manifest.schemaVersion>=26);
const ledger=JSON.parse(sql("select json_agg(json_build_object('version',version,'checksum',checksum) order by version) from local_commerce.migration_ledger;"));
assert.equal(ledger.length,manifest.schemaVersion);manifest.migrations.forEach((m,i)=>{assert.equal(ledger[i].version,m.version);assert.equal(ledger[i].checksum,m.checksum);assert.equal(createHash('sha256').update(readFileSync(`local/commerce/migrations/${m.filename}`)).digest('hex'),m.checksum);});
const info=task114?{SERVICE_ROLE_KEY:process.env.LOCAL_COMMERCE_SERVICE_ROLE_KEY,API_URL:c.endpoints.apiUrl}:JSON.parse(command('node_modules/.bin/supabase',['status','--workdir',dir,'-o','json']));assert.equal(info.API_URL,c.endpoints.apiUrl);assert.ok(info.SERVICE_ROLE_KEY);
const env={...process.env,...catalogTestEnvironment({LOCAL_COMMERCE_RUN_ID:run,LOCAL_COMMERCE_PROJECT_ID:project,LOCAL_COMMERCE_MARKER_DIGEST:prep.markerDigest,
 LOCAL_COMMERCE_SERVICE_ROLE_KEY:info.SERVICE_ROLE_KEY,CART_SOURCE:'local_persistent',CUSTOMER_AUTH_SOURCE:'local_persistent',LOCAL_CHECKOUT_SOURCE:'local_persistent',LOCAL_ORDER_SOURCE:'local_persistent',CUSTOMER_UPLOAD_SOURCE:'local_persistent',LOCAL_PAYMENT_SOURCE:'local_persistent',LOCAL_FULFILLMENT_SOURCE:'local_persistent',LOCAL_FULFILLMENT_OPERATOR:'enabled',LOCAL_TRACKING_SOURCE:'disabled',ADMIN_ACCEPTANCE_SOURCE:'local_fake',
 LOCAL_COMMERCE_IMAGE_HELPER_SECRET:randomBytes(32).toString('base64url'),LOCAL_ORDER_CAPABILITY_SECRET:randomBytes(32).toString('hex'),LOCAL_ORDER_CAPABILITY_TTL_SECONDS:'3600',PHOTOGIFT_GUEST_DRAFT_OWNER_SECRET:randomBytes(48).toString('base64url'),PHOTOGIFT_GUEST_DRAFT_OWNER_CONTEXT_TTL_SECONDS:'3600'})};
for(const [k,v] of Object.entries({SHADOW_DB:c.ports.shadowDb,API:c.ports.api,DB:c.ports.db,STUDIO:c.ports.studio,SMTP:c.ports.smtp,IMAGE_HELPER:c.ports.imageHelper}))env[`LOCAL_COMMERCE_${k}_PORT`]=String(v);
for(const [k,v] of Object.entries({API:c.endpoints.apiUrl,RPC:c.endpoints.rpcUrl,STORAGE:c.endpoints.storageUrl,IMAGE_HELPER:c.endpoints.imageHelperUrl}))env[`LOCAL_COMMERCE_${k}_URL`]=v;
Object.assign(env,{CLOUDFLARE_INCLUDE_PROCESS_ENV:'true',WRANGLER_SEND_METRICS:'false',WRANGLER_WRITE_LOGS:'false'});
const ports=[c.ports.imageHelper+2,c.ports.imageHelper+3],origins=ports.map(p=>`http://127.0.0.1:${p}`);
for(const p of [...ports,c.ports.imageHelper])await new Promise((resolve,reject)=>{const s=createServer();s.once('error',reject);s.listen(p,'127.0.0.1',()=>s.close(resolve));});
const actualFetch=globalThis.fetch;
globalThis.fetch=(input,options)=>{
 const u=new URL(input);assert.ok([...origins,c.endpoints.apiUrl,c.endpoints.imageHelperUrl].includes(u.origin),'only exact local endpoints');
 assert.notEqual(options?.method,'DELETE','no deletion authorized');return actualFetch(input,options);
};
const children=[];let logs='';
function start(index,operator='enabled',fault='preview-trace'){const p=spawn(process.execPath,['tests/database/local-commerce-test-worker.mjs',run,'--confirm-disposable',String(ports[index]),fault],{env:{...env,LOCAL_FULFILLMENT_OPERATOR:operator},detached:true,stdio:['ignore','pipe','pipe']});children.push(p);for(const s of [p.stdout,p.stderr])s.on('data',b=>{logs=(logs+b).slice(-18000);});return p;}
async function stop(p){if(p.exitCode!==null||p.signalCode!==null)return;const done=new Promise(r=>p.once('exit',r));process.kill(-p.pid,'SIGTERM');await Promise.race([done,new Promise(r=>setTimeout(r,5000))]);if(p.exitCode===null&&p.signalCode===null){process.kill(-p.pid,'SIGKILL');await done;}}
async function ready(p,index){for(let i=0;i<50;i++){assert.equal(p.exitCode,null,'Worker exited');try{const r=await fetch(origins[index]+'/api/customer-auth/session',{headers:{connection:'close'},signal:AbortSignal.timeout(2000)});await r.arrayBuffer();if(r.status===200)return;}catch{/* readiness only */}await new Promise(r=>setTimeout(r,500));}assert.fail('Worker readiness blocked');}
const headers={apikey:info.SERVICE_ROLE_KEY,authorization:`Bearer ${info.SERVICE_ROLE_KEY}`,'Content-Type':'application/json','Content-Profile':'local_commerce'};
let encoded=JSON.stringify(catalogDatabaseRows(project));
for(const [index,id] of Object.values(ids).entries())encoded=encoded.replaceAll(id,task114?`11800000-0000-4000-8000-${String(index+1).padStart(12,'0')}`:randomUUID());
const rows=JSON.parse(encoded),suffix=randomUUID().replaceAll('-','');
rows.products[0].fulfillment_definition.requiresProductionPreview=true;
rows.categories[0].slug=`admission-${suffix}`;rows.products[0].slug=`admission-${suffix}`;rows.variants[0].sku_code=`ADMISSION-${suffix}`;
rows.rules=rows.rules.filter(r=>r.definition.kind==='shipping');rows.rules[0].rule_key=`admission-${suffix}`;rows.rules[0].definition.method=`payment_${suffix}`;
let disabledEncoded=JSON.stringify(rows);
for(const id of new Set(disabledEncoded.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g)))disabledEncoded=disabledEncoded.replaceAll(id,randomUUID());
const disabledRows=JSON.parse(disabledEncoded);disabledRows.rules=[];
disabledRows.products[0].fulfillment_definition.requiresProductionPreview=false;
disabledRows.categories[0].slug+='-disabled';disabledRows.products[0].slug+='-disabled';disabledRows.variants[0].sku_code+='-DISABLED';
if(task114){
 rows.categories[0].slug='task-11-4-preview-required';rows.products[0].slug='task-11-4-preview-required';rows.variants[0].sku_code='TASK-11-4-PREVIEW-001';rows.configurations[0].definition.fields=[];
 rows.rules[0].definition.method='task_11_4_preview_standard';
 Object.assign(disabledRows.products[0],{id:'11600000-0000-4000-8000-000000000002'});Object.assign(disabledRows.variants[0],{product_id:disabledRows.products[0].id});Object.assign(disabledRows.configurations[0],{product_id:disabledRows.products[0].id});
}else for(const [k,t] of Object.entries({categories:'catalog_categories',products:'catalog_products',variants:'catalog_variants',configurations:'catalog_configuration_snapshots',rules:'catalog_pricing_rules'})){
 const r=await fetch(`${c.endpoints.apiUrl}/rest/v1/${t}`,{method:'POST',headers,body:JSON.stringify([...rows[k],...disabledRows[k]]),signal:AbortSignal.timeout(5000)});assert.equal(r.status,201,`synthetic ${k}`);await r.arrayBuffer();
}
const handoff={productId:rows.products[0].id,variantId:rows.variants[0].id,skuCode:rows.variants[0].sku_code,selectedOptions:rows.variants[0].selected_options,configurationRevision:'1',customizationValues:[]};
const disabledHandoff={...handoff,productId:disabledRows.products[0].id,variantId:disabledRows.variants[0].id,skuCode:disabledRows.variants[0].sku_code,selectedOptions:disabledRows.variants[0].selected_options};
const cookie=jar=>[...jar].map(([k,v])=>`${k}=${v}`).join('; ');
function accept(jar,r){for(const h of r.headers.getSetCookie()){const pair=h.split(';')[0],at=pair.indexOf('=');jar.set(pair.slice(0,at),pair.slice(at+1));}}
const send=(index,path,body,jar)=>fetch(origins[index]+path,{method:'POST',headers:{origin:origins[index],cookie:typeof jar==='string'?jar:cookie(jar),'Content-Type':'application/json',connection:'close'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
async function newOrder(jar=new Map(),handoffs=[handoff],quantity=1){
 for(const h of handoffs){
  const cart=await send(0,'/api/cart',{handoff:h},jar);if(cart.status!==200){const body=await cart.clone().text();assert.doesNotMatch(body,/password|sessionHash|capabilityHash|object_locator|service_role|eyJ[A-Za-z0-9_.-]+/i);assert.equal(cart.status,200,`Cart ${body}`);}accept(jar,cart);const publicCart=await cart.json();
  if(quantity>1){const lineId=publicCart.lines.at(-1).lineId;assert.match(lineId,/^[a-f0-9-]{36}$/);const updated=await fetch(origins[0]+'/api/cart/items/'+lineId,{method:'PATCH',headers:{origin:origins[0],cookie:cookie(jar),'Content-Type':'application/json',connection:'close'},body:JSON.stringify({quantity}),signal:AbortSignal.timeout(10000)});assert.equal(updated.status,200);await updated.arrayBuffer();}
 }
 const input={creationAttemptId:randomUUID(),email:'payment@example.invalid',firstName:'Synthetic',lastName:'Payment',country:'US',city:'Test',addressLine1:'Test only',postalCode:'00000',shippingMethod:rows.rules[0].definition.method};
 let r=await send(0,'/api/local-orders',input,jar);if(r.status===204){accept(jar,r);r=await send(0,'/api/local-orders',input,jar);}assert.equal(r.status,200,'Order');const {publicReference}=await r.json();assert.match(publicReference,/^FM-LOCAL-[A-Z0-9]{16}$/);
 const id=sql(`select id from local_commerce.orders where project_id='${project}' and public_reference='${publicReference}';`);assert.match(id,/^[a-f0-9-]{36}$/);
 const cartId=decodeURIComponent([...jar].find(([k])=>k.includes('cart'))[1]);assert.match(cartId,/^[a-f0-9-]{36}$/);
 return {jar,publicReference,id,cartId};
}
const pay=(o,key,outcome,index=0,jar=o.jar)=>send(index,'/api/local-payments',{publicReference:o.publicReference,paymentAttemptId:key,outcome},jar);
const upstream=o=>{
 const scopes={order_purchase_snapshots:`order_id='${o.id}'`,order_item_purchase_snapshots:`order_item_id in(select id from local_commerce.order_items where order_id='${o.id}')`,order_item_receipt_bindings:`order_item_id in(select id from local_commerce.order_items where order_id='${o.id}')`,payment_attempts:`order_id='${o.id}'`,payment_actions:`order_id='${o.id}'`,carts:`id='${o.cartId}'`,cart_lines:`cart_id='${o.cartId}'`,catalog_products:`id in('${handoff.productId}','${disabledHandoff.productId}')`,catalog_variants:`product_id in('${handoff.productId}','${disabledHandoff.productId}')`,catalog_configuration_snapshots:`product_id in('${handoff.productId}','${disabledHandoff.productId}')`};
 return JSON.parse(sql(`select json_agg(v order by v->>'domain') from (${Object.entries(scopes).map(([t,w])=>`select json_build_object('domain','${t}','count',count(*),'digest',md5(coalesce(string_agg(to_jsonb(t)::text,',' order by to_jsonb(t)::text),''))) v from local_commerce.${t} t where ${w}`).join(' union all ')}) x;`));
};
const path=o=>'/api/local-fulfillment/operator/'+o.publicReference;
const admit=(o,key,index=0)=>send(index,path(o),{fulfillmentActionId:key,actionKind:'enter_photo_review'},o.jar);
const report={run,project,ledger:manifest.schemaVersion,results:[],races:[],restarts:[]};
const customerPath=o=>'/api/local-fulfillment/'+o.publicReference;
const version=o=>Number(sql(`select version from local_commerce.fulfillments where order_id='${o.id}';`));
const effects=o=>sql(`select md5(coalesce(string_agg(v::text,',' order by v::text),'')) from (
 select to_jsonb(t) v from local_commerce.fulfillments t where order_id='${o.id}'
 union all select to_jsonb(t) from local_commerce.fulfillment_decisions t where order_id='${o.id}') s;`);
const history=(o,max)=>sql(`select md5(coalesce(string_agg(v::text,',' order by v::text),'')) from (
 select to_jsonb(t) v from local_commerce.preview_manifests t where order_id='${o.id}' and manifest_version<=${max}
 union all select to_jsonb(t) from local_commerce.preview_manifest_entries t where order_id='${o.id}' and manifest_version<=${max}
 union all select to_jsonb(t) from local_commerce.fulfillment_preview_media t where order_id='${o.id}' and manifest_version<=${max} and lifecycle='ready') s;`);
const action=(o,kind,v,note)=>({fulfillmentActionId:randomUUID(),actionKind:kind,expectedPreviewVersion:v,expectedAggregateVersion:version(o),...(note===undefined?{}:{revisionNote:note})});
const customer=(o,a,index=0,jar=o.jar)=>send(index,customerPath(o),a,jar);
async function checked(r,status=200){const body=await r.json();assert.doesNotMatch(JSON.stringify(body),/password|sessionHash|capabilityHash|object_locator|service_role/i);assert.equal(r.status,status,JSON.stringify(body));return body;}
async function read(o,index=0,jar=o.jar){return fetch(origins[index]+customerPath(o),{headers:{origin:origins[index],cookie:typeof jar==='string'?jar:cookie(jar),connection:'close'},signal:AbortSignal.timeout(15000)});}
const orders=[];
let currentStage='startup';
const stage=value=>{currentStage=value;console.info(JSON.stringify({status:'STAGE',task:'11.4-M-N',stage:value}));};
try {
 stage('workers');
 let a=start(0);await ready(a,0);let b=start(1);await ready(b,1);
 const helper=spawn(process.execPath,['local/commerce/image-helper/server.mjs'],{env,detached:true,stdio:'ignore'});children.push(helper);
 await new Promise(r=>setTimeout(r,1000));assert.equal(helper.exitCode,null);
 const sharp=createRequire(process.cwd()+'/local/commerce/image-helper/package.json')('sharp');
 const bytes=await sharp({create:{width:14,height:9,channels:3,background:'#ac7053'}}).png().toBuffer();
 async function admitted(jar=new Map()){
  const o=await newOrder(jar);await checked(await pay(o,randomUUID(),'success'));await checked(await admit(o,randomUUID()));
  o.before=upstream(o);orders.push(o);return o;
 }
 async function media(o,v,index=0,expectedStatus=200){
  const item=JSON.parse(sql(`select json_agg(id) from local_commerce.order_items where order_id='${o.id}';`))[0];
  const form=new FormData();form.set('file',new File([bytes],'synthetic.png',{type:'image/png'}));
  const r=await fetch(origins[index]+path(o)+'/preview?'+new URLSearchParams({orderItemId:item,actionId:randomUUID(),expectedVersion:String(version(o))}),{
   method:'POST',headers:{origin:origins[index],cookie:cookie(o.jar),connection:'close'},body:form,signal:AbortSignal.timeout(20000)});
  const body=await checked(r,expectedStatus);if(expectedStatus!==200)return null;
  assert.equal(body.value.state,'ready');assert.equal(body.value.manifestVersion,v);
  return [{orderItemId:item,previewMediaId:body.value.previewMediaId}];
 }
 const publication=(o,entries)=>({actionId:randomUUID(),expectedVersion:version(o),entries});
 const publish=(o,input,index=0)=>send(index,path(o)+'/preview',input,o.jar);
 async function pending(jar){const o=await admitted(jar);await checked(await publish(o,publication(o,await media(o,1))));return o;}
 async function restart(){const old=a.pid;await stop(a);a=start(0);await ready(a,0);assert.notEqual(old,a.pid);report.restarts.push([old,a.pid]);}
 stage('initial-pending');
 const one=await pending();const beforeRead=effects(one);const current=await checked(await read(one));assert.equal(current.manifestVersion,1);assert.equal(effects(one),beforeRead,'GET zero mutation');
 const approve=action(one,'approve_preview',1),first=await checked(await customer(one,approve));
 assert.equal(first.result.status,'preview_approved');assert.equal(first.result.revisionRequestsUsed,0);
 // Discard the first HTTP result, stop the serving process, recover with
 // original cookies/action/CAS from a fresh PID and the committed DB result.
 const stable=effects(one);stage('initial-restart');await restart();stage('initial-replay');const replay=await checked(await customer(one,approve));
 assert.equal(replay.status,'replayed');assert.deepEqual(replay.result,first.result);assert.equal(effects(one),stable);
 await checked(await customer(one,{...approve,expectedAggregateVersion:approve.expectedAggregateVersion+1}),409);
 await checked(await customer(one,{...approve,actionKind:'request_revision',revisionNote:'changed'}),409);
 assert.equal(effects(one),stable);report.results.push('v1 approval / zero revisions / restart replay / changed CAS conflict');
 stage('revision-chain');const chain=await pending();
 for(let v=1;v<=2;v++){
  stage(`revision-chain-v${v}`);
  const before=effects(chain);
  stage(`revision-chain-v${v}-invalid-note`);
  for(const revisionNote of ['', ' \n\t','x'.repeat(501),'😀'.repeat(251)])await checked(await customer(chain,action(chain,'request_revision',v,revisionNote)),400);
  stage(`revision-chain-v${v}-invalid-version`);
  for(const patch of [{expectedPreviewVersion:undefined},{expectedAggregateVersion:undefined},{expectedPreviewVersion:4}])await checked(await customer(chain,{...action(chain,'approve_preview',v),...patch}),400);
  stage(`revision-chain-v${v}-cas-conflict`);
  await checked(await customer(chain,{...action(chain,'approve_preview',v),expectedAggregateVersion:version(chain)+1}),409);
  assert.equal(effects(chain),before);
  const revision=action(chain,'request_revision',v,v===1?'x'.repeat(500):'😀'.repeat(250));
  stage(`revision-chain-v${v}-commit`);
  const r=await checked(await customer(chain,revision));assert.equal(r.result.status,'preview_revision_requested');assert.equal(r.result.revisionRequestsUsed,v);
  stage(`revision-chain-v${v}-restart`);
  await restart();const replay=await checked(await customer(chain,revision));assert.deepEqual(replay.result,r.result);assert.equal(replay.status,'replayed');
  stage(`revision-chain-v${v}-conflicts`);
  await checked(await customer(chain,{...revision,revisionNote:'changed'}),409);
  await checked(await customer(chain,{...revision,expectedAggregateVersion:revision.expectedAggregateVersion+1}),409);
  await checked(await customer(chain,action(chain,'approve_preview',v)),409);
  stage(`revision-chain-v${v}-media`);
  const old=history(chain,v);const pub=publication(chain,await media(chain,v+1));
  stage(`revision-chain-v${v}-publish`);
  const result=await checked(await publish(chain,pub));assert.equal(result.value.manifestVersion,v+1);assert.equal(result.value.revisionRequestsUsed,v);
  stage(`revision-chain-v${v}-publish-replay`);
  await restart();const pubReplay=await checked(await publish(chain,pub));assert.deepEqual(pubReplay.value,result.value);
  assert.equal(history(chain,v),old,'historical manifest entries + ready media unchanged');
  await checked(await customer(chain,action(chain,'approve_preview',v)),409);
 }
 const beforeThird=effects(chain);await checked(await customer(chain,action(chain,'request_revision',3,'third')),409);assert.equal(effects(chain),beforeThird);
 assert.equal(sql(`select count(*)||':'||max(manifest_version) from local_commerce.preview_manifests where order_id='${chain.id}';`),'3:3');
 report.results.push('real private v2/v3 helper/readback + revision/restart/publication replay + no third revision/no v4');
 stage('authority-negatives');for(const jar of ['',one.jar])await checked(await customer(chain,action(chain,'approve_preview',3),0,jar),404);
 const {createPersistentOrderCapabilityCodec}=await import('../../app/server/local-order-capability.server.ts');
 const codec=await createPersistentOrderCapabilityCodec(env,{projectId:project,markerDigest:prep.markerDigest});
 const expired=await codec.issue(Math.floor(Date.now()/1000)-7200);
 for(const token of [expired,'forged'])await checked(await customer(chain,action(chain,'approve_preview',3),0,cookie(chain.jar).replace(/figmemento-local-order-access=[^;]+/,'figmemento-local-order-access='+token)),404);
 const memberJar=new Map();const signup=await send(0,'/api/customer-auth/sign-up',{email:`preview-${suffix}@example.invalid`,password:'Synthetic-acceptance-password-42!'},memberJar);accept(memberJar,signup);await checked(signup);
 const member=await pending(memberJar);assert.equal(sql(`select o.owner_kind from local_commerce.orders p join local_commerce.commerce_owners o on o.project_id=p.project_id and o.id=p.owner_id where p.id='${member.id}';`),'customer');
 const memberAction=action(member,'approve_preview',1);await checked(await customer(member,memberAction));
 const sessionKey=[...member.jar.keys()].find(k=>k.includes('session'));assert.ok(sessionKey);
 const noSession=new Map(member.jar);noSession.delete(sessionKey);await checked(await customer(member,memberAction,1,noSession),404);
 const otherJar=new Map();const otherSignup=await send(0,'/api/customer-auth/sign-up',{email:`other-preview-${suffix}@example.invalid`,password:'Synthetic-acceptance-password-42!'},otherJar);accept(otherJar,otherSignup);await checked(otherSignup);
 const wrong=new Map(member.jar);wrong.set(sessionKey,otherJar.get(sessionKey));await checked(await customer(member,memberAction,1,wrong),404);
 await checked(await send(0,'/api/customer-auth/sign-out',{},member.jar));await checked(await customer(member,memberAction,1),404);
 const expiryJar=new Map();const expirySignup=await send(0,'/api/customer-auth/sign-up',{email:`expired-preview-${suffix}@example.invalid`,password:'Synthetic-acceptance-password-42!'},expiryJar);accept(expiryJar,expirySignup);await checked(expirySignup);
 const expiring=await pending(expiryJar),expiryAction=action(expiring,'approve_preview',1);await checked(await customer(expiring,expiryAction));
 const sessionHash=createHash('sha256').update(decodeURIComponent(expiring.jar.get(sessionKey))).digest('hex');
 // Exact newly created synthetic session only. Server DB clock sets the
 // expiry boundary; no production clock override or existing session touched.
 assert.equal(sql(`update local_commerce.customer_sessions set expires_at=clock_timestamp() where project_id='${project}' and owner_id=(select owner_id from local_commerce.orders where id='${expiring.id}') and session_hash='${sessionHash}' returning 1;`),'1');
 await checked(await customer(expiring,expiryAction,1),404);
 report.results.push('guest forged/foreign/expired + member missing/wrong/revoked fresh-session gates precede replay');
 // Both workers stay live during each Promise.all; distinct processes share
 // only the DB/Storage serialization boundary, not a JavaScript mutex.
 assert.equal(a.exitCode,null);assert.equal(b.exitCode,null);report.workerPids=[a.pid,b.pid];
 for(const kind of ['two-approvals','approval-vs-revision','same-key','last-revision']){
  stage(`customer-race-${kind}`);
  const o=await pending();let v=1;
  if(kind==='last-revision'){
   await checked(await customer(o,action(o,'request_revision',1,'first')));
   await checked(await publish(o,publication(o,await media(o,2))));v=2;
  }
  const left=action(o,kind==='last-revision'?'request_revision':'approve_preview',v,kind==='last-revision'?'second':undefined);
  const right=kind==='same-key'?left:action(o,kind==='two-approvals'?'approve_preview':'request_revision',v,kind==='two-approvals'?undefined:'other');
  const responses=await Promise.all([customer(o,left,0),customer(o,right,1)]);const statuses=responses.map(r=>r.status);
  const bodies=await Promise.all(responses.map(r=>r.json()));const raceEvidence=JSON.stringify({kind,statuses,bodies});
  assert.doesNotMatch(raceEvidence,/password|sessionHash|capabilityHash|object_locator|service_role/i);
  assert.ok(statuses.includes(200),raceEvidence);assert.ok(statuses.every(s=>[200,409].includes(s)),raceEvidence);
  if(kind!=='same-key')assert.equal(statuses.filter(s=>s===200).length,1);
  else {const retry=await checked(await customer(o,left));const committed=bodies[statuses.indexOf(200)];assert.deepEqual(retry.result,committed.result);}
  assert.ok(Number(sql(`select revision_requests_used from local_commerce.fulfillments where order_id='${o.id}';`))<=2);
  report.races.push({kind,pids:[a.pid,b.pid],statuses});
 }
 for(const v of [1,2]){
  stage(`publication-race-v${v+1}`);
  const o=await pending();
  for(let n=1;n<=v;n++){
   await checked(await customer(o,action(o,'request_revision',n,'next')));
   if(n<v)await checked(await publish(o,publication(o,await media(o,n+1))));
  }
  const pub=publication(o,await media(o,v+1));const stale=action(o,'approve_preview',v);
  const [publicationResponse,approvalResponse]=await Promise.all([publish(o,pub,0),customer(o,stale,1)]);
  await checked(publicationResponse);await checked(approvalResponse,409);
  report.races.push({kind:`v${v+1} publication vs stale v${v}`,pids:[a.pid,b.pid],statuses:[200,409]});
 }
 stage('preview-fault-matrix');const faultOrder=await pending();report.privateMediaFaults=[];
 for(const v of [2,3]){
  await checked(await customer(faultOrder,action(faultOrder,'request_revision',v-1,'new preview')));
  const readyCount=sql(`select count(*) from local_commerce.fulfillment_preview_media where order_id='${faultOrder.id}' and lifecycle='ready';`);
  const historical=history(faultOrder,v-1);
  for(const fault of ['preview-helper-failure','preview-storage-failure','preview-readback-failure','preview-readback-mismatch']){
   await stop(b);b=start(1,'enabled',fault);await ready(b,1);
   await media(faultOrder,v,1,404);
   assert.equal(sql(`select count(*) from local_commerce.fulfillment_preview_media where order_id='${faultOrder.id}' and lifecycle='ready';`),readyCount);
   assert.equal(sql(`select max(manifest_version) from local_commerce.preview_manifests where order_id='${faultOrder.id}';`),String(v-1));
   assert.equal(history(faultOrder,v-1),historical);
   report.privateMediaFaults.push({version:v,fault,pid:b.pid,noFalseReady:true,noPublication:true});
  }
  await stop(b);b=start(1);await ready(b,1);
  await checked(await publish(faultOrder,publication(faultOrder,await media(faultOrder,v))));
 }
 for(const o of orders){assert.deepEqual(upstream(o),o.before);assert.equal(sql(`select count(*) from local_commerce.shipments where order_id='${o.id}';`),'0');assert.equal(sql(`select count(*) from local_commerce.shipment_events where order_id='${o.id}';`),'0');}
 report.upstreamDigests=orders.map(o=>({reference:o.publicReference,digests:o.before}));
 report.status='PASS';report.classification='LOCAL DEVELOPMENT / TEST PERSISTENCE ACCEPTANCE';console.info(JSON.stringify(report));
}catch(error){const workerLogSummary=logs.split(info.SERVICE_ROLE_KEY).join('[redacted]').replace(/eyJ[A-Za-z0-9_.-]+/g,'[redacted]').slice(-4000);console.error(JSON.stringify({status:'FAILED',task:'11.4-M-N',stage:currentStage,error:error instanceof Error?error.name:'unknown',message:error instanceof Error?error.message:'unknown',workerLogSummary}));throw error;
}finally{for(const p of children.reverse())await stop(p);globalThis.fetch=actualFetch;}
