// Exact retained disposable stack, fresh synthetic Orders through actual Worker
// HTTP. No database reset, Storage mutation or pre-existing process stop.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawn,spawnSync} from 'node:child_process';
import {randomUUID,randomBytes,createHash,createHmac} from 'node:crypto';
import {createServer} from 'node:net';
import {catalogDatabaseRows,catalogTestEnvironment,ids} from '../fixtures/local-persistent-catalog.mjs';
import {createPersistentOrderCapabilityCodec} from '../../app/server/local-order-capability.server.ts';
import {createGuestDraftOwnerService,getGuestDraftOwnerCookieName} from '../../app/lib/guest-draft-owner.ts';
const run=process.argv.find(value=>/^run-[a-f0-9]{8}$/.test(value))??'run-5576dfd8';
const dir=`${process.cwd()}/local/commerce/runtime/disposable/${run}`;
const prep=JSON.parse(readFileSync(`${dir}/ledger-preparation.json`)),c=prep.config;
const project=c.projectId;
const db=process.env.TASK_11_4_VERIFIED_DB_CONTAINER_ID??'3f0a14e18d07b71e0b235dffcdc61e672086d6fb5b32b35849aa8bf54f3be3e4';
function command(bin,args,input){const r=spawnSync(bin,args,{input,encoding:'utf8',timeout:15000,maxBuffer:1024*1024});assert.equal(r.status,0,r.error?.code??'bounded command failed');return r.stdout.trim();}
const inspected=JSON.parse(command('docker',['inspect',db]))[0];assert.equal(inspected.Id,db);assert.equal(inspected.Config.Labels['com.supabase.cli.workdir'],dir);assert.equal(inspected.State.Status,'running');
assert.equal(c.projectId,project);assert.equal(c.projectKind,'disposable_test');
const sql=q=>command('docker',['exec','-i',db,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],q);
assert.equal(sql("select current_setting('server_version_num')::int/10000;"),'17');
assert.equal(sql(`select local_commerce.verify_project_identity('${project}','${prep.markerDigest}');`),'t');
const manifest=JSON.parse(readFileSync('local/commerce/migrations/manifest.json'));assert.ok(manifest.schemaVersion>=18);
const ledger=JSON.parse(sql("select json_agg(json_build_object('version',version,'checksum',checksum) order by version) from local_commerce.migration_ledger;"));
assert.equal(ledger.length,manifest.schemaVersion);manifest.migrations.forEach((m,i)=>{assert.equal(ledger[i].version,m.version);assert.equal(ledger[i].checksum,m.checksum);assert.equal(createHash('sha256').update(readFileSync(`local/commerce/migrations/${m.filename}`)).digest('hex'),m.checksum);});
const info=JSON.parse(command('node_modules/.bin/supabase',['status','--workdir',dir,'-o','json']));assert.equal(info.API_URL,c.endpoints.apiUrl);
const env={...process.env,...catalogTestEnvironment({LOCAL_COMMERCE_RUN_ID:run,LOCAL_COMMERCE_PROJECT_ID:project,LOCAL_COMMERCE_MARKER_DIGEST:prep.markerDigest,
 LOCAL_COMMERCE_SERVICE_ROLE_KEY:info.SERVICE_ROLE_KEY,CART_SOURCE:'local_persistent',CUSTOMER_AUTH_SOURCE:'local_persistent',LOCAL_CHECKOUT_SOURCE:'local_persistent',LOCAL_ORDER_SOURCE:'local_persistent',CUSTOMER_UPLOAD_SOURCE:'local_persistent',LOCAL_PAYMENT_SOURCE:'local_persistent',LOCAL_FULFILLMENT_SOURCE:'disabled',LOCAL_TRACKING_SOURCE:'disabled',ADMIN_ACCEPTANCE_SOURCE:'local_fake',
 LOCAL_COMMERCE_IMAGE_HELPER_SECRET:randomBytes(32).toString('base64url'),LOCAL_ORDER_CAPABILITY_SECRET:randomBytes(32).toString('hex'),LOCAL_ORDER_CAPABILITY_TTL_SECONDS:'3600',PHOTOGIFT_GUEST_DRAFT_OWNER_SECRET:randomBytes(48).toString('base64url'),PHOTOGIFT_GUEST_DRAFT_OWNER_CONTEXT_TTL_SECONDS:'3600'})};
for(const [k,v] of Object.entries({SHADOW_DB:c.ports.shadowDb,API:c.ports.api,DB:c.ports.db,STUDIO:c.ports.studio,SMTP:c.ports.smtp,IMAGE_HELPER:c.ports.imageHelper}))env[`LOCAL_COMMERCE_${k}_PORT`]=String(v);
for(const [k,v] of Object.entries({API:c.endpoints.apiUrl,RPC:c.endpoints.rpcUrl,STORAGE:c.endpoints.storageUrl,IMAGE_HELPER:c.endpoints.imageHelperUrl}))env[`LOCAL_COMMERCE_${k}_URL`]=v;
Object.assign(env,{CLOUDFLARE_INCLUDE_PROCESS_ENV:'true',WRANGLER_SEND_METRICS:'false',WRANGLER_WRITE_LOGS:'false'});
const ports=[c.ports.imageHelper+2,c.ports.imageHelper+3],origins=ports.map(p=>`http://127.0.0.1:${p}`);
for(const p of ports)await new Promise((resolve,reject)=>{const s=createServer();s.once('error',reject);s.listen(p,'127.0.0.1',()=>s.close(resolve));});
const actualFetch=globalThis.fetch;
globalThis.fetch=(input,options)=>{
 const u=new URL(input);assert.ok([...origins,c.endpoints.apiUrl].includes(u.origin),'only exact local endpoints');
 assert.notEqual(options?.method,'DELETE','no deletion authorized');return actualFetch(input,options);
};
const children=[];let logs='';
function start(index){const p=spawn(process.execPath,['tests/database/local-commerce-test-worker.mjs',run,'--confirm-disposable',String(ports[index])],{env,detached:true,stdio:['ignore','pipe','pipe']});children.push(p);for(const s of [p.stdout,p.stderr])s.on('data',b=>{logs=(logs+b).slice(-18000);});return p;}
async function stop(p){if(p.exitCode!==null||p.signalCode!==null)return;const done=new Promise(r=>p.once('exit',r));process.kill(-p.pid,'SIGTERM');await Promise.race([done,new Promise(r=>setTimeout(r,5000))]);if(p.exitCode===null&&p.signalCode===null){process.kill(-p.pid,'SIGKILL');await done;}}
async function ready(p,index){for(let i=0;i<50;i++){assert.equal(p.exitCode,null,'Worker exited');try{const r=await fetch(origins[index]+'/api/customer-auth/session',{signal:AbortSignal.timeout(2000)});await r.arrayBuffer();if(r.status===200)return;}catch{/* readiness only */}await new Promise(r=>setTimeout(r,500));}assert.fail('Worker readiness blocked');}
const headers={apikey:info.SERVICE_ROLE_KEY,authorization:`Bearer ${info.SERVICE_ROLE_KEY}`,'Content-Type':'application/json','Content-Profile':'local_commerce'};
let encoded=JSON.stringify(catalogDatabaseRows(project));for(const id of Object.values(ids))encoded=encoded.replaceAll(id,randomUUID());
const rows=JSON.parse(encoded),suffix=randomUUID().replaceAll('-','');
rows.products[0].fulfillment_definition.requiresProductionPreview=true;
rows.categories[0].slug=`payment-${suffix}`;rows.products[0].slug=`payment-${suffix}`;rows.variants[0].sku_code=`PAYMENT-${suffix}`;
rows.rules=rows.rules.filter(r=>r.definition.kind==='shipping');rows.rules[0].rule_key=`payment-${suffix}`;rows.rules[0].definition.method=`payment_${suffix}`;
for(const [k,t] of Object.entries({categories:'catalog_categories',products:'catalog_products',variants:'catalog_variants',configurations:'catalog_configuration_snapshots',rules:'catalog_pricing_rules'})){
 const r=await fetch(`${c.endpoints.apiUrl}/rest/v1/${t}`,{method:'POST',headers,body:JSON.stringify(rows[k]),signal:AbortSignal.timeout(5000)});assert.equal(r.status,201,`synthetic ${k}`);await r.arrayBuffer();
}
const handoff={productId:rows.products[0].id,variantId:rows.variants[0].id,skuCode:rows.variants[0].sku_code,selectedOptions:rows.variants[0].selected_options,configurationRevision:'1',customizationValues:[]};
const cookie=jar=>[...jar].map(([k,v])=>`${k}=${v}`).join('; ');
function accept(jar,r){for(const h of r.headers.getSetCookie()){const pair=h.split(';')[0],at=pair.indexOf('=');jar.set(pair.slice(0,at),pair.slice(at+1));}}
const send=(index,path,body,jar)=>fetch(origins[index]+path,{method:'POST',headers:{origin:origins[index],cookie:typeof jar==='string'?jar:cookie(jar),'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
async function newOrder(jar=new Map()){
 const cart=await send(0,'/api/cart',{handoff},jar);assert.equal(cart.status,200,'Cart');accept(jar,cart);await cart.arrayBuffer();
 const input={creationAttemptId:randomUUID(),email:'payment@example.invalid',firstName:'Synthetic',lastName:'Payment',country:'US',city:'Test',addressLine1:'Test only',postalCode:'00000',shippingMethod:rows.rules[0].definition.method};
 let r=await send(0,'/api/local-orders',input,jar);if(r.status===204){accept(jar,r);r=await send(0,'/api/local-orders',input,jar);}assert.equal(r.status,200,'Order');const {publicReference}=await r.json();assert.match(publicReference,/^FM-LOCAL-[A-Z0-9]{16}$/);
 const id=sql(`select id from local_commerce.orders where project_id='${project}' and public_reference='${publicReference}';`);assert.match(id,/^[a-f0-9-]{36}$/);
 const cartId=decodeURIComponent([...jar].find(([k])=>k.includes('cart'))[1]);assert.match(cartId,/^[a-f0-9-]{36}$/);
 return {jar,publicReference,id,cartId};
}
const pay=(o,key,outcome,index=0,jar=o.jar)=>send(index,'/api/local-payments',{publicReference:o.publicReference,paymentAttemptId:key,outcome},jar);
const read=async o=>{const r=await fetch(origins[0]+`/api/local-orders/${o.publicReference}`,{headers:{cookie:cookie(o.jar)},signal:AbortSignal.timeout(5000)});assert.equal(r.status,200);return r.json();};
const counts=o=>JSON.parse(sql(`select json_build_object('attempts',(select count(*) from local_commerce.payment_attempts where order_id='${o.id}'),'actions',(select count(*) from local_commerce.payment_actions where order_id='${o.id}'),'version',(select version from local_commerce.orders where id='${o.id}'));`));
const downstream=()=>sql("select json_build_array((select count(*) from local_commerce.fulfillments),(select count(*) from local_commerce.shipments),(select count(*) from local_commerce.digital_grants),(select count(*) from local_commerce.digital_versions),(select count(*) from local_commerce.preview_manifests),(select count(*) from local_commerce.photo_reviews));");
const immutable=o=>sql(`select md5(concat((select row_to_json(s)::text from local_commerce.order_purchase_snapshots s where order_id='${o.id}'),(select string_agg(row_to_json(s)::text,',' order by s.id) from local_commerce.order_item_purchase_snapshots s join local_commerce.order_items i on i.id=s.order_item_id where i.order_id='${o.id}')));`);
const cartDigest=o=>sql(`select md5(concat((select row_to_json(c)::text from local_commerce.carts c where id='${o.cartId}'),(select string_agg(row_to_json(l)::text,',' order by l.id) from local_commerce.cart_lines l where cart_id='${o.cartId}')));`);
const report={run,project,ledger:manifest.schemaVersion,results:[]};
try{
 const a=start(0);await ready(a,0);assert.match(logs,/LOCAL_COMMERCE_WORKER_MODE_PROOF/);
 const effects=downstream();
 const success=await newOrder(),failed=await newOrder(),cancelled=await newOrder(),raceSame=await newOrder(),raceDifferent=await newOrder(),raceMixed=await newOrder();
 const purchases=[success,failed,cancelled,raceSame,raceDifferent,raceMixed],digests=purchases.map(immutable);
 const cartDigests=purchases.map(cartDigest);
 const original=await read(success);assert.equal(original.status,'pending_payment');assert.equal(original.paymentStatus,'pending');
 const key=randomUUID(),r=await pay(success,key,'success');assert.equal(r.status,200,'success HTTP');
 await r.body.cancel(); // discard whole response projection; no recovery credential is issued
 const committed=counts(success);assert.deepEqual(committed,{attempts:1,actions:1,version:2});
 const stored=JSON.parse(sql(`select result->'payment' from local_commerce.payment_actions where order_id='${success.id}';`));
 await stop(a);const b=start(0);await ready(b,0);assert.notEqual(a.pid,b.pid);
 const replay=await pay(success,key,'success');assert.equal(replay.status,200);assert.equal(replay.headers.get('set-cookie'),null);assert.deepEqual((await replay.json()).payment,stored);assert.deepEqual(counts(success),committed);
 assert.equal(stored.simulatedAmountCents,original.commercial.localArithmeticTotalCents);assert.equal(stored.simulatedCurrency,original.commercial.currency);
 assert.equal((await read(success)).status,'paid');assert.equal((await read(success)).paymentStatus,'succeeded');
 assert.equal((await pay(success,randomUUID(),'success')).status,409);assert.equal((await pay(success,key,'failed')).status,409);
 report.restartPids=[a.pid,b.pid];report.results.push('success + whole-response loss + restart replay + paid new-key reject');
 for(const [o,outcome] of [[failed,'failed'],[cancelled,'cancelled']]){
  const k=randomUUID(),first=await pay(o,k,outcome);assert.equal(first.status,200);const saved=(await first.json()).payment;
  const state=await read(o);assert.equal(state.status,outcome==='failed'?'payment_failed':'pending_payment');assert.equal(state.paymentStatus,outcome==='failed'?'failed':'pending');
  const retry=await pay(o,randomUUID(),'success');assert.equal(retry.status,200);await retry.arrayBuffer();
  const old=await pay(o,k,outcome);assert.equal(old.status,200);assert.deepEqual((await old.json()).payment,saved);assert.equal((await read(o)).status,'paid');assert.equal(counts(o).attempts,2);
 }
 report.results.push('failed/cancelled retry; original result replay without Order rollback');
 const peer=start(1);await ready(peer,1);assert.equal(b.exitCode,null);assert.equal(peer.exitCode,null);report.concurrentPids=[b.pid,peer.pid];
 const sameKey=randomUUID();const same=await Promise.all([pay(raceSame,sameKey,'success',0),pay(raceSame,sameKey,'success',1)]);
 assert.deepEqual(same.map(r=>r.status),[200,200]);const sameBodies=await Promise.all(same.map(r=>r.json()));assert.deepEqual(sameBodies[0].payment,sameBodies[1].payment);assert.equal(counts(raceSame).attempts,1);
 const different=await Promise.all([pay(raceDifferent,randomUUID(),'success',0),pay(raceDifferent,randomUUID(),'success',1)]);assert.deepEqual(different.map(r=>r.status).sort(),[200,409]);for(const r of different)await r.arrayBuffer();assert.equal(counts(raceDifferent).attempts,1);
 const mixed=await Promise.all([pay(raceMixed,randomUUID(),'failed',0),pay(raceMixed,randomUUID(),'success',1)]);const mixedStatuses=mixed.map(r=>r.status);assert.ok(mixedStatuses.every(s=>[200,409].includes(s)));assert.ok(mixedStatuses.includes(200));for(const r of mixed)await r.arrayBuffer();
 const serial=sql(`select json_agg(outcome order by created_at,id) from local_commerce.payment_attempts where order_id='${raceMixed.id}';`);
 const outcomes=JSON.parse(serial);assert.ok(outcomes.filter(o=>o==='succeeded').length<=1);assert.ok(outcomes.length>=1&&outcomes.length<=2);if(outcomes.includes('succeeded'))assert.equal((await read(raceMixed)).status,'paid');
 report.results.push('two live instances same-key/different-key/failed-success serialization');report.mixedRace={http:mixedStatuses,outcomes};
 for(const patch of [{amount:1},{currency:'EUR'},{ownerId:randomUUID()},{paymentStatus:'succeeded'}]){const r=await send(0,'/api/local-payments',{publicReference:success.publicReference,paymentAttemptId:key,outcome:'success',...patch},success.jar);assert.equal(r.status,400);await r.arrayBuffer();}
 assert.equal((await pay(success,key,'success',0,'')).status,404);
 assert.equal((await pay(success,key,'success',0,failed.jar)).status,404);
 const codec=await createPersistentOrderCapabilityCodec(env,{projectId:project,markerDigest:prep.markerDigest});
 const expired=await codec.issue(Math.floor(Date.now()/1000)-7200);
 assert.equal((await pay(success,key,'success',0,cookie(success.jar).replace(/figmemento-local-order-access=[^;]+/,'figmemento-local-order-access='+expired))).status,404);
 for(const kind of ['guest','capability']){
  const guest=await createGuestDraftOwnerService({signingSecret:env.PHOTOGIFT_GUEST_DRAFT_OWNER_SECRET,contextLifetimeSeconds:kind==='guest'?15:3600}).issueGuestDraftOwner();assert.equal(guest.status,'issued');
  const shortCodec=await createPersistentOrderCapabilityCodec({...env,LOCAL_ORDER_CAPABILITY_TTL_SECONDS:kind==='capability'?'15':'3600'},{projectId:project,markerDigest:prep.markerDigest});
  const now=Math.floor(Date.now()/1000),cap=await shortCodec.issue(now);
  const o=await newOrder(new Map([[getGuestDraftOwnerCookieName(),encodeURIComponent(guest.value.context)],['figmemento-local-order-access',cap]])),k=randomUUID();
  const paid=await pay(o,k,'success');assert.equal(paid.status,200);await paid.arrayBuffer();const before=counts(o);
  const expiry=kind==='guest'?guest.value.expiresAt:now+15;
  await new Promise(r=>setTimeout(r,Math.max(0,expiry*1000-Date.now()+100)));
  const rejected=await pay(o,k,'success',1);assert.equal(rejected.status,404);assert.equal(rejected.headers.get('set-cookie'),null);assert.deepEqual(counts(o),before);
 }
 // Member Orders are actually created from a member-owned Cart, not claimed.
 const memberJar=new Map();const signup=await send(0,'/api/customer-auth/sign-up',{email:`payment-${suffix}@example.invalid`,password:'Synthetic-acceptance-password-42!'},memberJar);assert.equal(signup.status,200);accept(memberJar,signup);await signup.arrayBuffer();
 const member=await newOrder(memberJar),mk=randomUUID();assert.equal((await pay(member,mk,'success')).status,200);const memberCookie=cookie(member.jar);
 const logout=await send(0,'/api/customer-auth/sign-out',{},member.jar);assert.equal(logout.status,200);await logout.arrayBuffer();assert.equal((await pay(member,mk,'success',1,memberCookie)).status,404);
 report.results.push('tamper + missing/foreign/expired capability + revoked member replay denied');
 assert.deepEqual(purchases.map(cartDigest),cartDigests,'Payment leaves Cart identity/version/lines/quantity unchanged');
 // Only our newly created synthetic Product changes; no retained Catalog row.
 sql(`update local_commerce.catalog_variants set price_cents=price_cents+321,version=version+1 where project_id='${project}' and id='${rows.variants[0].id}';`);
 const added=await send(0,'/api/cart',{handoff},success.jar);assert.equal(added.status,200);await added.arrayBuffer();
 const afterDrift=await pay(success,key,'success');assert.equal(afterDrift.status,200);assert.deepEqual((await afterDrift.json()).payment,stored);assert.deepEqual(counts(success),committed);
 assert.deepEqual(purchases.map(immutable),digests);assert.equal(downstream(),effects);
 report.immutableDigests=digests;report.results.push('Catalog/Cart drift does not change Payment; immutable snapshots + zero downstream rows');
 const rpc=`${c.endpoints.apiUrl}/rest/v1/rpc/payment_command`;
 const args={p_project_id:project,p_marker_digest:prep.markerDigest,p_owner_kind:'guest',p_owner_selector:'0'.repeat(64),p_customer_id:null,p_session_hash:null,p_authority_expires_at:new Date(Date.now()+60000).toISOString(),p_capability_hash:'0'.repeat(64),p_public_reference:success.publicReference,p_operation:'prepare',p_order_id:null,p_expected_version:null,p_key_digest:'0'.repeat(64),p_context_digest:null,p_outcome:'success'};
 const headerJwt=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),payloadJwt=Buffer.from(JSON.stringify({role:'authenticated',exp:Math.floor(Date.now()/1000)+600})).toString('base64url');
 const authJwt=`${headerJwt}.${payloadJwt}.`+createHmac('sha256',info.JWT_SECRET).update(`${headerJwt}.${payloadJwt}`).digest('base64url');
 report.acl=[];
 for(const [role,credential] of [['anon',info.ANON_KEY],['authenticated',authJwt],['service_role',info.SERVICE_ROLE_KEY]]){
  const r=await fetch(rpc,{method:'POST',headers:{...headers,apikey:role==='service_role'?credential:info.ANON_KEY,authorization:`Bearer ${credential}`},body:JSON.stringify(args),signal:AbortSignal.timeout(5000)});
  report.acl.push({role,http:r.status});if(role==='service_role'){assert.equal(r.status,200);assert.equal((await r.json()).status,'unavailable');}else{assert.ok([401,403].includes(r.status));await r.arrayBuffer();}
 }
 report.orders=purchases.map(o=>o.publicReference);report.status='PASS';console.info(JSON.stringify(report));
}finally{for(const p of children.reverse())await stop(p);globalThis.fetch=actualFetch;}
