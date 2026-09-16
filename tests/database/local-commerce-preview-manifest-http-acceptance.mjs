// Exact retained disposable stack, fresh synthetic Orders through actual Worker
// HTTP. Authorized private preview writes only; no reset/delete or existing process stop.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawn,spawnSync} from 'node:child_process';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {createServer} from 'node:net';
import {createRequire} from 'node:module';
import {catalogDatabaseRows,catalogTestEnvironment,ids} from '../fixtures/local-persistent-catalog.mjs';
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
const manifest=JSON.parse(readFileSync('local/commerce/migrations/manifest.json'));assert.equal(manifest.schemaVersion,21);
const ledger=JSON.parse(sql("select json_agg(json_build_object('version',version,'checksum',checksum) order by version) from local_commerce.migration_ledger;"));
assert.equal(ledger.length,21);manifest.migrations.forEach((m,i)=>{assert.equal(ledger[i].version,m.version);assert.equal(ledger[i].checksum,m.checksum);assert.equal(createHash('sha256').update(readFileSync(`local/commerce/migrations/${m.filename}`)).digest('hex'),m.checksum);});
const info=JSON.parse(command('node_modules/.bin/supabase',['status','--workdir',dir,'-o','json']));assert.equal(info.API_URL,c.endpoints.apiUrl);
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
async function ready(p,index){for(let i=0;i<50;i++){assert.equal(p.exitCode,null,'Worker exited');try{const r=await fetch(origins[index]+'/api/customer-auth/session',{signal:AbortSignal.timeout(2000)});await r.arrayBuffer();if(r.status===200)return;}catch{/* readiness only */}await new Promise(r=>setTimeout(r,500));}assert.fail('Worker readiness blocked');}
const headers={apikey:info.SERVICE_ROLE_KEY,authorization:`Bearer ${info.SERVICE_ROLE_KEY}`,'Content-Type':'application/json','Content-Profile':'local_commerce'};
let encoded=JSON.stringify(catalogDatabaseRows(project));for(const id of Object.values(ids))encoded=encoded.replaceAll(id,randomUUID());
const rows=JSON.parse(encoded),suffix=randomUUID().replaceAll('-','');
rows.products[0].fulfillment_definition.requiresProductionPreview=true;
rows.categories[0].slug=`admission-${suffix}`;rows.products[0].slug=`admission-${suffix}`;rows.variants[0].sku_code=`ADMISSION-${suffix}`;
rows.rules=rows.rules.filter(r=>r.definition.kind==='shipping');rows.rules[0].rule_key=`admission-${suffix}`;rows.rules[0].definition.method=`payment_${suffix}`;
let disabledEncoded=JSON.stringify(rows);
for(const id of new Set(disabledEncoded.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g)))disabledEncoded=disabledEncoded.replaceAll(id,randomUUID());
const disabledRows=JSON.parse(disabledEncoded);disabledRows.rules=[];
disabledRows.products[0].fulfillment_definition.requiresProductionPreview=false;
disabledRows.categories[0].slug+='-disabled';disabledRows.products[0].slug+='-disabled';disabledRows.variants[0].sku_code+='-DISABLED';
for(const [k,t] of Object.entries({categories:'catalog_categories',products:'catalog_products',variants:'catalog_variants',configurations:'catalog_configuration_snapshots',rules:'catalog_pricing_rules'})){
 const r=await fetch(`${c.endpoints.apiUrl}/rest/v1/${t}`,{method:'POST',headers,body:JSON.stringify([...rows[k],...disabledRows[k]]),signal:AbortSignal.timeout(5000)});assert.equal(r.status,201,`synthetic ${k}`);await r.arrayBuffer();
}
const handoff={productId:rows.products[0].id,variantId:rows.variants[0].id,skuCode:rows.variants[0].sku_code,selectedOptions:rows.variants[0].selected_options,configurationRevision:'1',customizationValues:[]};
const disabledHandoff={...handoff,productId:disabledRows.products[0].id,variantId:disabledRows.variants[0].id,skuCode:disabledRows.variants[0].sku_code,selectedOptions:disabledRows.variants[0].selected_options};
const cookie=jar=>[...jar].map(([k,v])=>`${k}=${v}`).join('; ');
function accept(jar,r){for(const h of r.headers.getSetCookie()){const pair=h.split(';')[0],at=pair.indexOf('=');jar.set(pair.slice(0,at),pair.slice(at+1));}}
const send=(index,path,body,jar)=>fetch(origins[index]+path,{method:'POST',headers:{origin:origins[index],cookie:typeof jar==='string'?jar:cookie(jar),'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
async function newOrder(jar=new Map(),handoffs=[handoff],quantity=1){
 for(const h of handoffs){
  const cart=await send(0,'/api/cart',{handoff:h},jar);assert.equal(cart.status,200,'Cart');accept(jar,cart);const publicCart=await cart.json();
  if(quantity>1){const lineId=publicCart.lines.at(-1).lineId;assert.match(lineId,/^[a-f0-9-]{36}$/);const updated=await fetch(origins[0]+'/api/cart/items/'+lineId,{method:'PATCH',headers:{origin:origins[0],cookie:cookie(jar),'Content-Type':'application/json'},body:JSON.stringify({quantity}),signal:AbortSignal.timeout(10000)});assert.equal(updated.status,200);await updated.arrayBuffer();}
 }
 const input={creationAttemptId:randomUUID(),email:'payment@example.invalid',firstName:'Synthetic',lastName:'Payment',country:'US',city:'Test',addressLine1:'Test only',postalCode:'00000',shippingMethod:rows.rules[0].definition.method};
 let r=await send(0,'/api/local-orders',input,jar);if(r.status===204){accept(jar,r);r=await send(0,'/api/local-orders',input,jar);}assert.equal(r.status,200,'Order');const {publicReference}=await r.json();assert.match(publicReference,/^FM-LOCAL-[A-Z0-9]{16}$/);
 const id=sql(`select id from local_commerce.orders where project_id='${project}' and public_reference='${publicReference}';`);assert.match(id,/^[a-f0-9-]{36}$/);
 const cartId=decodeURIComponent([...jar].find(([k])=>k.includes('cart'))[1]);assert.match(cartId,/^[a-f0-9-]{36}$/);
 return {jar,publicReference,id,cartId};
}
const pay=(o,key,outcome,index=0,jar=o.jar)=>send(index,'/api/local-payments',{publicReference:o.publicReference,paymentAttemptId:key,outcome},jar);
const immutable=o=>sql(`select md5(concat((select row_to_json(s)::text from local_commerce.order_purchase_snapshots s where order_id='${o.id}'),(select string_agg(row_to_json(s)::text,',' order by s.id) from local_commerce.order_item_purchase_snapshots s join local_commerce.order_items i on i.id=s.order_item_id where i.order_id='${o.id}')));`);
const upstream=o=>{
 const scopes={order_purchase_snapshots:`order_id='${o.id}'`,order_item_purchase_snapshots:`order_item_id in(select id from local_commerce.order_items where order_id='${o.id}')`,order_item_receipt_bindings:`order_item_id in(select id from local_commerce.order_items where order_id='${o.id}')`,payment_attempts:`order_id='${o.id}'`,payment_actions:`order_id='${o.id}'`,carts:`id='${o.cartId}'`,cart_lines:`cart_id='${o.cartId}'`,catalog_products:`id in('${handoff.productId}','${disabledHandoff.productId}')`,catalog_variants:`product_id in('${handoff.productId}','${disabledHandoff.productId}')`,catalog_configuration_snapshots:`product_id in('${handoff.productId}','${disabledHandoff.productId}')`};
 return JSON.parse(sql(`select json_agg(v order by v->>'domain') from (${Object.entries(scopes).map(([t,w])=>`select json_build_object('domain','${t}','count',count(*),'digest',md5(coalesce(string_agg(to_jsonb(t)::text,',' order by to_jsonb(t)::text),''))) v from local_commerce.${t} t where ${w}`).join(' union all ')}) x;`));
};
const path=o=>'/api/local-fulfillment/operator/'+o.publicReference;
const admit=(o,key,index=0)=>send(index,path(o),{fulfillmentActionId:key,actionKind:'enter_photo_review'},o.jar);
const report={run,project,ledger:21,results:[]};
try {
 const a=start(0);await ready(a,0);
 const helper=spawn(process.execPath,['local/commerce/image-helper/server.mjs'],{env,detached:true,stdio:'ignore'});children.push(helper);
 await new Promise(r=>setTimeout(r,1000));assert.equal(helper.exitCode,null);
 const sharp=createRequire(process.cwd()+'/local/commerce/image-helper/package.json')('sharp');
 const bytes=await sharp({create:{width:14,height:9,channels:3,background:'#ac7053'}}).png().toBuffer();
 const previewPath=o=>path(o)+'/preview';
 const itemIds=o=>JSON.parse(sql(`select json_agg(id order by item_sequence) from local_commerce.order_items where order_id='${o.id}';`));
 const upload=async(o,item,key=randomUUID(),index=0)=>{
   const form=new FormData();form.set('file',new File([bytes],'synthetic.png',{type:'image/png'}));
   return fetch(origins[index]+previewPath(o)+'?'+new URLSearchParams({orderItemId:item,actionId:key,expectedVersion:'1'}),{
     method:'POST',headers:{origin:origins[index],cookie:cookie(o.jar)},body:form,signal:AbortSignal.timeout(20000)});
 };
 const publish=(o,entries,key=randomUUID(),index=0)=>send(index,previewPath(o),{actionId:key,expectedVersion:1,entries},o.jar);
 const effects=o=>JSON.parse(sql(`select json_build_object('manifests',(select count(*) from local_commerce.preview_manifests where order_id='${o.id}'),
 'entries',(select count(*) from local_commerce.preview_manifest_entries where order_id='${o.id}'),
 'publicationActions',(select count(*) from local_commerce.fulfillment_decisions where order_id='${o.id}' and decision_kind='preview_publish'),
 'shipments',(select count(*) from local_commerce.shipments where order_id='${o.id}'),
 'events',(select count(*) from local_commerce.shipment_events where order_id='${o.id}'));`));
 async function admitted(handoffs=[handoff]){
   const o=await newOrder(new Map(),handoffs),digest=immutable(o);
   const paid=await pay(o,randomUUID(),'success');assert.equal(paid.status,200);await paid.arrayBuffer();
   const admitted=await admit(o,randomUUID());assert.equal(admitted.status,200);await admitted.arrayBuffer();
   return {...o,digest,upstream:upstream(o)};
 }
 async function artifacts(o,items=itemIds(o)){
   const entries=[];
   for(const item of items){
     const r=await upload(o,item);assert.equal(r.status,200,'actual helper/Storage ready');
     const value=await r.json();assert.equal(value.value.state,'ready');
     assert.doesNotMatch(JSON.stringify(value),/object_locator|bucket|storage|token|digest|secret/i);
     entries.push({orderItemId:item,previewMediaId:value.value.previewMediaId});
   }
   return entries;
 }
 const one=await admitted(),multi=await admitted([handoff,handoff]),same=await admitted(),different=await admitted();
 const mixed=await admitted([handoff,disabledHandoff]),none=await admitted([disabledHandoff]),readiness=await admitted();
 const orders=[one,multi,same,different],sets=[];
 for(const o of orders)sets.push(await artifacts(o));
 for(const bad of [[],[{...sets[0][0],previewMediaId:sets[1][0].previewMediaId}],[{...sets[0][0],orderItemId:randomUUID()}]]){
   const r=await publish(one,bad);assert.equal(r.status,404);await r.arrayBuffer();
   assert.equal(effects(one).manifests,0);assert.equal(effects(one).publicationActions,0);
 }
 for(const bad of [[sets[1][0],sets[1][0]],[sets[1][0],{...sets[1][1],previewMediaId:sets[1][0].previewMediaId}]]){
   const r=await publish(multi,bad);assert.equal(r.status,404);await r.arrayBuffer();assert.equal(effects(multi).manifests,0);
 }
 const mixedItems=itemIds(mixed),mixedSet=await artifacts(mixed,[mixedItems[0]]);
 const disabledUpload=await upload(mixed,mixedItems[1]);assert.equal(disabledUpload.status,404);await disabledUpload.arrayBuffer();
 const noPreview=await publish(none,[]);assert.equal(noPreview.status,404);await noPreview.arrayBuffer();
 assert.deepEqual(effects(none),{manifests:0,entries:0,publicationActions:0,shipments:0,events:0});
 const disabled=start(1,'disabled');await ready(disabled,1);
 const denied=await publish(one,sets[0],randomUUID(),1);assert.equal(denied.status,404);await denied.arrayBuffer();await stop(disabled);
 const key=randomUUID(),lost=await publish(one,sets[0],key);assert.equal(lost.status,200);await lost.body.cancel();
 const originalManifest=sql(`select id from local_commerce.preview_manifests where order_id='${one.id}';`),originalEffects=effects(one);
 await stop(a);const b=start(0);await ready(b,0);
 const replay=await publish(one,sets[0],key);assert.equal(replay.status,200);const replayBody=await replay.json();assert.equal(replayBody.status,'replayed');
 assert.equal(replayBody.value.manifestVersion,1);assert.equal(replayBody.value.revisionRequestsUsed,0);
 assert.equal(replayBody.value.manifestId,originalManifest);assert.deepEqual(effects(one),originalEffects);
 report.restartPids=[a.pid,b.pid];
 const peer=start(1);await ready(peer,1);report.concurrentPids=[b.pid,peer.pid];
 const sameKey=randomUUID(),sameRace=await Promise.all([publish(same,sets[2],sameKey),publish(same,sets[2],sameKey,1)]);
 assert.deepEqual(sameRace.map(r=>r.status),[200,200]);for(const r of sameRace)await r.arrayBuffer();
 const distinctRace=await Promise.all([publish(different,sets[3],randomUUID()),publish(different,sets[3],randomUUID(),1)]);
 assert.equal(distinctRace.filter(r=>r.status===200).length,1);assert.ok(distinctRace.every(r=>[200,404,409].includes(r.status)));for(const r of distinctRace)await r.arrayBuffer();
 const complete=await publish(multi,sets[1]);assert.equal(complete.status,200);await complete.arrayBuffer();
 const mixedPublished=await publish(mixed,mixedSet);assert.equal(mixedPublished.status,200);await mixedPublished.arrayBuffer();
 await stop(peer);
 report.failures=[];
 for(const fault of ['preview-helper-failure','preview-storage-failure','preview-readback-failure','preview-readback-mismatch']){
   const o=await admitted(),p=start(1,'enabled',fault);await ready(p,1);
   const r=await upload(o,itemIds(o)[0],randomUUID(),1);assert.equal(r.status,404);await r.arrayBuffer();
   assert.ok(logs.includes('PREVIEW_FAULT_REACHED:'+fault));
   assert.equal(sql(`select count(*) from local_commerce.fulfillment_preview_media where order_id='${o.id}' and lifecycle='ready';`),'0');
   assert.deepEqual(effects(o),{manifests:0,entries:0,publicationActions:0,shipments:0,events:0});
   assert.deepEqual(upstream(o),o.upstream);report.failures.push({fault,http:r.status,pid:p.pid,noReady:true,noPublication:true,upstreamUnchanged:true});await stop(p);
 }
 const slow=start(1,'enabled','preview-ready-delay');await ready(slow,1);
 const pendingUpload=upload(readiness,itemIds(readiness)[0],randomUUID(),1);
 for(let i=0;!logs.includes('PREVIEW_FAULT_REACHED:preview-ready-delay');i++){
   assert.ok(i<100,'bounded ready-delay gate');await new Promise(r=>setTimeout(r,100));
 }
 const pendingId=sql(`select id from local_commerce.fulfillment_preview_media where order_id='${readiness.id}' and lifecycle='pending';`);assert.match(pendingId,/^[a-f0-9-]{36}$/);
 const pendingEntries=[{orderItemId:itemIds(readiness)[0],previewMediaId:pendingId}];
 const early=await publish(readiness,pendingEntries);assert.equal(early.status,404);await early.arrayBuffer();assert.equal(effects(readiness).manifests,0);
 const readyResponse=await pendingUpload;assert.equal(readyResponse.status,200);await readyResponse.arrayBuffer();
 const afterReady=await publish(readiness,pendingEntries);assert.equal(afterReady.status,200);await afterReady.arrayBuffer();
 report.readiness={pids:[b.pid,slow.pid],beforeReady:404,afterReady:200};await stop(slow);
 orders.push(mixed);
 orders.push(readiness);
 for(const o of orders){
   assert.deepEqual(effects(o),{manifests:1,entries:o===multi?2:1,publicationActions:1,shipments:0,events:0});
   assert.equal(immutable(o),o.digest);
   assert.deepEqual(upstream(o),o.upstream);
 }
 assert.deepEqual(upstream(none),none.upstream);assert.deepEqual(upstream(readiness),readiness.upstream);
 report.upstream=orders.concat(none).map(o=>({publicReference:o.publicReference,before:o.upstream,after:upstream(o)}));
 report.results.push('real paid Cart/Order/Payment admission','real helper private preview bytes','missing/foreign/wrong item denied',
   'independent operator required','lost response + fresh process exact v1 replay','two live Workers same and different publication ids',
   'one Order-wide multi-item v1; zero revisions','purchase snapshots unchanged; no Shipment');
 report.status='PASS';report.scope='partial Task 7.2 live matrix; remaining cases reported separately';
 console.info(JSON.stringify(report));
} finally {for(const p of children.reverse())await stop(p);globalThis.fetch=actualFetch;console.info(logs.split('\n').filter(s=>s.startsWith('PREVIEW_TRACE ')).join('\n'));}
