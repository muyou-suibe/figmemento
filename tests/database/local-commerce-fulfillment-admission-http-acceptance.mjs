// Exact retained disposable stack, fresh synthetic Orders through actual Worker
// HTTP. No database reset, Storage mutation or pre-existing process stop.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawn,spawnSync} from 'node:child_process';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {createServer} from 'node:net';
import {createRequire} from 'node:module';
import {createConfiguredGuestDraftOwnerService,getGuestDraftOwnerCookieName} from '../../app/lib/guest-draft-owner.ts';
import {ensureGuestResourceOwner,resolveGuestResourceOwner} from '../../app/application/guest-resource-ownership.server.ts';
import {createLocalPersistentDraftPort} from '../../app/infrastructure/local-commerce/local-persistent-draft-adapter.server.ts';
import {createLocalPersistentMediaAuthority} from '../../app/infrastructure/local-commerce/local-persistent-media-authority.server.ts';
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
const manifest=JSON.parse(readFileSync('local/commerce/migrations/manifest.json'));assert.equal(manifest.schemaVersion,26);
const ledger=JSON.parse(sql("select json_agg(json_build_object('version',version,'checksum',checksum) order by version) from local_commerce.migration_ledger;"));
assert.equal(ledger.length,26);manifest.migrations.forEach((m,i)=>{assert.equal(ledger[i].version,m.version);assert.equal(ledger[i].checksum,m.checksum);assert.equal(createHash('sha256').update(readFileSync(`local/commerce/migrations/${m.filename}`)).digest('hex'),m.checksum);});
const info=JSON.parse(command('node_modules/.bin/supabase',['status','--workdir',dir,'-o','json']));assert.equal(info.API_URL,c.endpoints.apiUrl);
const env={...process.env,...catalogTestEnvironment({LOCAL_COMMERCE_RUN_ID:run,LOCAL_COMMERCE_PROJECT_ID:project,LOCAL_COMMERCE_MARKER_DIGEST:prep.markerDigest,
 LOCAL_COMMERCE_SERVICE_ROLE_KEY:info.SERVICE_ROLE_KEY,CART_SOURCE:'local_persistent',CUSTOMER_AUTH_SOURCE:'local_persistent',LOCAL_CHECKOUT_SOURCE:'local_persistent',LOCAL_ORDER_SOURCE:'local_persistent',CUSTOMER_UPLOAD_SOURCE:'local_persistent',LOCAL_PAYMENT_SOURCE:'local_persistent',LOCAL_FULFILLMENT_SOURCE:'local_persistent',LOCAL_FULFILLMENT_OPERATOR:'enabled',LOCAL_TRACKING_SOURCE:'disabled',ADMIN_ACCEPTANCE_SOURCE:'local_fake',
 LOCAL_COMMERCE_IMAGE_HELPER_SECRET:randomBytes(32).toString('base64url'),LOCAL_ORDER_CAPABILITY_SECRET:randomBytes(32).toString('hex'),LOCAL_ORDER_CAPABILITY_TTL_SECONDS:'3600',PHOTOGIFT_GUEST_DRAFT_OWNER_SECRET:randomBytes(48).toString('base64url'),PHOTOGIFT_GUEST_DRAFT_OWNER_CONTEXT_TTL_SECONDS:'3600'})};
for(const [k,v] of Object.entries({SHADOW_DB:c.ports.shadowDb,API:c.ports.api,DB:c.ports.db,STUDIO:c.ports.studio,SMTP:c.ports.smtp,IMAGE_HELPER:c.ports.imageHelper}))env[`LOCAL_COMMERCE_${k}_PORT`]=String(v);
for(const [k,v] of Object.entries({API:c.endpoints.apiUrl,RPC:c.endpoints.rpcUrl,STORAGE:c.endpoints.storageUrl,IMAGE_HELPER:c.endpoints.imageHelperUrl}))env[`LOCAL_COMMERCE_${k}_URL`]=v;
Object.assign(env,{CLOUDFLARE_INCLUDE_PROCESS_ENV:'true',WRANGLER_SEND_METRICS:'false',WRANGLER_WRITE_LOGS:'false'});
const ports=[c.ports.imageHelper+2,c.ports.imageHelper+3],origins=ports.map(p=>`http://127.0.0.1:${p}`);
for(const p of ports)await new Promise((resolve,reject)=>{const s=createServer();s.once('error',reject);s.listen(p,'127.0.0.1',()=>s.close(resolve));});
const actualFetch=globalThis.fetch;
globalThis.fetch=(input,options)=>{
 const u=new URL(input);assert.ok([...origins,c.endpoints.apiUrl,c.endpoints.imageHelperUrl].includes(u.origin),'only exact local endpoints');
 assert.notEqual(options?.method,'DELETE','no deletion authorized');return actualFetch(input,options);
};
const children=[];let logs='';
function start(index,operator='enabled'){const p=spawn(process.execPath,['tests/database/local-commerce-test-worker.mjs',run,'--confirm-disposable',String(ports[index])],{env:{...env,LOCAL_FULFILLMENT_OPERATOR:operator},detached:true,stdio:['ignore','pipe','pipe']});children.push(p);for(const s of [p.stdout,p.stderr])s.on('data',b=>{logs=(logs+b).slice(-18000);});return p;}
async function stop(p){if(p.exitCode!==null||p.signalCode!==null)return;const done=new Promise(r=>p.once('exit',r));process.kill(-p.pid,'SIGTERM');await Promise.race([done,new Promise(r=>setTimeout(r,5000))]);if(p.exitCode===null&&p.signalCode===null){process.kill(-p.pid,'SIGKILL');await done;}}
async function ready(p,index){for(let i=0;i<50;i++){assert.equal(p.exitCode,null,'Worker exited');try{const r=await fetch(origins[index]+'/api/customer-auth/session',{signal:AbortSignal.timeout(2000)});await r.arrayBuffer();if(r.status===200)return;}catch{/* readiness only */}await new Promise(r=>setTimeout(r,500));}assert.fail('Worker readiness blocked');}
const headers={apikey:info.SERVICE_ROLE_KEY,authorization:`Bearer ${info.SERVICE_ROLE_KEY}`,'Content-Type':'application/json','Content-Profile':'local_commerce'};
let encoded=JSON.stringify(catalogDatabaseRows(project));for(const id of Object.values(ids))encoded=encoded.replaceAll(id,randomUUID());
const rows=JSON.parse(encoded),suffix=randomUUID().replaceAll('-','');
rows.products[0].fulfillment_definition.requiresProductionPreview=true;
rows.categories[0].slug=`admission-${suffix}`;rows.products[0].slug=`admission-${suffix}`;rows.variants[0].sku_code=`ADMISSION-${suffix}`;
rows.rules=rows.rules.filter(r=>r.definition.kind==='shipping');rows.rules[0].rule_key=`admission-${suffix}`;rows.rules[0].definition.method=`payment_${suffix}`;
for(const [k,t] of Object.entries({categories:'catalog_categories',products:'catalog_products',variants:'catalog_variants',configurations:'catalog_configuration_snapshots',rules:'catalog_pricing_rules'})){
 const r=await fetch(`${c.endpoints.apiUrl}/rest/v1/${t}`,{method:'POST',headers,body:JSON.stringify(rows[k]),signal:AbortSignal.timeout(5000)});assert.equal(r.status,201,`synthetic ${k}`);await r.arrayBuffer();
}
const handoff={productId:rows.products[0].id,variantId:rows.variants[0].id,skuCode:rows.variants[0].sku_code,selectedOptions:rows.variants[0].selected_options,configurationRevision:'1',customizationValues:[]};
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
const read=async o=>{const r=await fetch(origins[0]+`/api/local-orders/${o.publicReference}`,{headers:{cookie:cookie(o.jar)},signal:AbortSignal.timeout(5000)});assert.equal(r.status,200);return r.json();};
const counts=o=>JSON.parse(sql(`select json_build_object('fulfillments',(select count(*) from local_commerce.fulfillments where order_id='${o.id}'),'reviews',(select count(*) from local_commerce.photo_reviews where order_id='${o.id}'),'actions',(select count(*) from local_commerce.fulfillment_decisions where order_id='${o.id}'));`));
const immutable=o=>sql(`select md5(concat((select row_to_json(s)::text from local_commerce.order_purchase_snapshots s where order_id='${o.id}'),(select string_agg(row_to_json(s)::text,',' order by s.id) from local_commerce.order_item_purchase_snapshots s join local_commerce.order_items i on i.id=s.order_item_id where i.order_id='${o.id}')));`);
const path=o=>'/api/local-fulfillment/operator/'+o.publicReference;
const admit=(o,key,index=0)=>send(index,path(o),{fulfillmentActionId:key,actionKind:'enter_photo_review'},o.jar);
const review=(o,itemId,action,key,version,index=0)=>send(index,path(o),{
 fulfillmentActionId:key,actionKind:action,orderItemId:itemId,expectedAggregateVersion:version,
},o.jar);
const version=o=>Number(sql(`select version from local_commerce.fulfillments where order_id='${o.id}';`));
const customer=(o,body,index=0)=>send(index,'/api/local-fulfillment/'+o.publicReference,body,o.jar);
const lifecycle=(o,actionKind,index=0)=>send(index,path(o),{
 fulfillmentActionId:randomUUID(),actionKind,expectedAggregateVersion:version(o),
},o.jar);
const report={run,project,ledger:26,results:[]};
async function imageOrder(preview,mediaCount=1,lineCount=1,mixed=false){
 let serialized=JSON.stringify(catalogDatabaseRows(project));for(const id of Object.values(ids))serialized=serialized.replaceAll(id,randomUUID());
 const imageRows=JSON.parse(serialized),tag=randomUUID().replaceAll('-','');
 imageRows.categories[0].slug='admission-image-'+tag;imageRows.products[0].slug='admission-image-'+tag;imageRows.variants[0].sku_code='ADMISSION-IMAGE-'+tag;
 imageRows.products[0].fulfillment_definition.requiresProductionPreview=preview;
 const field=imageRows.configurations[0].definition.fields[0];
 Object.assign(field,{code:'photo',label:'Photo',kind:'image',required:mediaCount>0,constraints:{allowedMimeTypes:['image/png'],maxBytes:1048576,minDimensions:{width:1,height:1},minImageCount:1,maxImageCount:2,cropEnabled:true}});
 for(const [k,t] of Object.entries({categories:'catalog_categories',products:'catalog_products',variants:'catalog_variants',configurations:'catalog_configuration_snapshots'})){
  const r=await fetch(c.endpoints.apiUrl+'/rest/v1/'+t,{method:'POST',headers,body:JSON.stringify(imageRows[k]),signal:AbortSignal.timeout(5000)});assert.equal(r.status,201);await r.arrayBuffer();
 }
 const ownerService=createConfiguredGuestDraftOwnerService(env),guest=await ensureGuestResourceOwner({projectId:project,context:null,ownerService});assert.equal(guest.status,'issued');
 const verifyOwner=async()=>{const r=await resolveGuestResourceOwner({projectId:project,context:guest.context,ownerService});return r.status==='authorized'?{owner:r.owner,expiresAt:r.owner.expiresAt}:null;};
 const draft=await createLocalPersistentDraftPort({environment:env,verifyOwner});assert.equal(draft.status,'ready');
 const media=createLocalPersistentMediaAuthority(env,verifyOwner);
 const sharp=createRequire(process.cwd()+'/local/commerce/image-helper/package.json')('sharp');
 const bytes=await sharp({create:{width:12,height:8,channels:3,background:'#ac7053'}}).png().toBuffer();
 const handoffs=[];
 for(let line=0;line<lineCount;line++){
  const created=await draft.port.create({authority:draft.authority,expectedVersion:0,idempotency:{key:randomUUID(),fingerprint:'admission-image-create'},productId:imageRows.products[0].id});assert.equal(created.status,'found');
  let current=created.value;const slots=[],images=[];
  for(let i=0;i<mediaCount;i++){
   const accepted=await media.accept({draftId:current.draftId,expectedVersion:current.version,fieldId:field.id,bytes});assert.equal(accepted.status,'found','real image helper/Storage');
   slots.push({slotId:accepted.slotId,fieldId:field.id,receiptReference:accepted.receipt.receiptId});images.push({receiptId:accepted.receipt.receiptId});
   const saved=await draft.port.save({authority:draft.authority,draftId:current.draftId,expectedVersion:current.version,idempotency:{key:randomUUID(),fingerprint:'admission-image-confirm'},slots});assert.equal(saved.status,'found');current=saved.value;
  }
  handoffs.push({productId:imageRows.products[0].id,variantId:imageRows.variants[0].id,skuCode:imageRows.variants[0].sku_code,selectedOptions:imageRows.variants[0].selected_options,configurationRevision:'1',customizationValues:mediaCount?[{fieldId:field.id,fieldCode:'photo',kind:'image',images}]:[]});
 }
 if(mixed)handoffs.push(handoff);
 return newOrder(new Map([[getGuestDraftOwnerCookieName(),encodeURIComponent(guest.context)]]),handoffs,mediaCount===2?3:1);
}
try {
 const a=start(0);await ready(a,0);assert.match(logs,/LOCAL_COMMERCE_WORKER_MODE_PROOF/);
 const one=await newOrder(),same=await newOrder(),different=await newOrder(),unpaid=await newOrder();
 const orders=[one,same,different,unpaid],before=orders.map(immutable);
 for(const o of orders){
  await read(o);
  const r=await fetch(origins[0]+path(o),{signal:AbortSignal.timeout(5000)});assert.equal(r.status,404);await r.arrayBuffer();
  assert.deepEqual(counts(o),{fulfillments:0,reviews:0,actions:0});
 }
 assert.equal((await admit(unpaid,randomUUID())).status,404);
 for(const o of [one,same,different]){const r=await pay(o,randomUUID(),'success');assert.equal(r.status,200);await r.arrayBuffer();assert.equal(counts(o).fulfillments,0);}
 const disabled=start(1,'disabled');await ready(disabled,1);
 assert.equal((await admit(one,randomUUID(),1)).status,404,'customer cookie does not grant operator authority');
 await stop(disabled);
 const key=randomUUID(),r=await admit(one,key);assert.equal(r.status,200,'real paid admission');await r.body.cancel();
 assert.deepEqual(counts(one),{fulfillments:1,reviews:0,actions:1});
 await stop(a);let b=start(0);await ready(b,0);
 const replay=await admit(one,key);assert.equal(replay.status,200);const body=await replay.json();assert.equal(body.status,'replayed');
 assert.deepEqual(Object.keys(body.fulfillment).sort(),['publicReference','revisionRequestsUsed','status','version']);
 assert.equal((await admit(one,randomUUID())).status,409);
 report.restartPids=[a.pid,b.pid];
 const peer=start(1);await ready(peer,1);report.concurrentPids=[b.pid,peer.pid];
 const sameKey=randomUUID(),responses=await Promise.all([admit(same,sameKey),admit(same,sameKey,1)]);
 assert.deepEqual(responses.map(r=>r.status),[200,200]);for(const r of responses)await r.arrayBuffer();
 const conflict=await Promise.all([admit(different,randomUUID()),admit(different,randomUUID(),1)]);
 assert.deepEqual(conflict.map(r=>r.status).sort(),[200,409]);for(const r of conflict)await r.arrayBuffer();
 for(const o of [one,same,different])assert.deepEqual(counts(o),{fulfillments:1,reviews:0,actions:1});
 assert.deepEqual(orders.map(immutable),before);
 const helper=spawn(process.execPath,['local/commerce/image-helper/server.mjs'],{env,detached:true,stdio:'ignore'});children.push(helper);
 await new Promise(r=>setTimeout(r,1000));assert.equal(helper.exitCode,null);
 const sharp=createRequire(process.cwd()+'/local/commerce/image-helper/package.json')('sharp');
 const previewBytes=await sharp({create:{width:14,height:9,channels:3,background:'#b77b5a'}}).png().toBuffer();
 async function publishCurrentPreview(o,manifestVersion=1){
  const owner=sql(`select owner_id from local_commerce.orders where id='${o.id}';`);
  const required=JSON.parse(sql(`select coalesce(json_agg(value->>'orderItemId' order by value->>'orderItemId'),'[]') from jsonb_array_elements(local_commerce.fulfillment_purchased_items('${project}','${o.id}','${owner}')) where (value#>>'{purchasedItem,fulfillment,requiresProductionPreview}')::boolean;`));
  const entries=[];
  for(const itemId of required){
   const form=new FormData();form.set('file',new File([previewBytes],'preview.png',{type:'image/png'}));
   const response=await fetch(origins[0]+path(o)+'/preview?'+new URLSearchParams({orderItemId:itemId,actionId:randomUUID(),expectedVersion:String(version(o))}),{
    method:'POST',headers:{origin:origins[0],cookie:cookie(o.jar)},body:form,signal:AbortSignal.timeout(20000)});
   assert.equal(response.status,200,'preview media');const body=await response.json();assert.equal(body.value.state,'ready');
   entries.push({orderItemId:itemId,previewMediaId:body.value.previewMediaId});
  }
  const published=await send(0,path(o)+'/preview',{actionId:randomUUID(),expectedVersion:version(o),entries},o.jar);
  assert.equal(published.status,200,'preview publication');const body=await published.json();assert.equal(body.value.manifestVersion,manifestVersion);return body;
 }
 report.imageMatrix=[];
 let matrixIndex=0;
 for(const [preview,mediaCount,lineCount,mixed] of [[true,1,1,false],[false,1,1,false],[true,2,1,false],[false,1,2,false],[true,1,1,true],[true,0,1,false],[false,0,1,false]]){
  const o=await imageOrder(preview,mediaCount,lineCount,mixed),digest=immutable(o);
  assert.equal(counts(o).reviews,0);const payment=await pay(o,randomUUID(),'success');assert.equal(payment.status,200);await payment.arrayBuffer();assert.equal(counts(o).reviews,0);
  const k=randomUUID(),race=await Promise.all([admit(o,k),admit(o,k,1)]);assert.deepEqual(race.map(r=>r.status),[200,200]);for(const r of race)await r.arrayBuffer();
  const expectedReviews=mediaCount?lineCount:0;
  assert.deepEqual(counts(o),{fulfillments:1,reviews:expectedReviews,actions:1});
  assert.equal(sql(`select count(*) from local_commerce.photo_reviews where order_id='${o.id}' and review_state='pending';`),String(expectedReviews));
  const itemIds=expectedReviews ? sql(`select string_agg(order_item_id::text,',' order by order_item_id) from local_commerce.photo_reviews where order_id='${o.id}';`).split(',') : [];
  const decisions=[];
  for(const [itemIndex,itemId] of itemIds.entries()){
   const expectedVersion=version(o);
   if(matrixIndex===0&&itemIndex===0){
    const actionId=randomUUID(),pair=await Promise.all([review(o,itemId,'approve_photo_review',actionId,expectedVersion),review(o,itemId,'approve_photo_review',actionId,expectedVersion,1)]);
    assert.deepEqual(pair.map(x=>x.status),[200,200]);for(const response of pair)await response.arrayBuffer();
    await stop(b);b=start(0);await ready(b,0);
    const replayResponse=await review(o,itemId,'approve_photo_review',actionId,expectedVersion);assert.equal(replayResponse.status,200);
    assert.equal((await replayResponse.json()).status,'replayed');decisions.push('approved-restart-replay');
   }else if(matrixIndex===1&&itemIndex===0){
    const rejected=await review(o,itemId,'reject_photo_review',randomUUID(),expectedVersion);assert.equal(rejected.status,200);await rejected.arrayBuffer();
    const lateApprove=await review(o,itemId,'approve_photo_review',randomUUID(),expectedVersion+1);assert.equal(lateApprove.status,409);await lateApprove.arrayBuffer();decisions.push('rejected');
   }else if(matrixIndex===2&&itemIndex===0){
    const pair=await Promise.all([
     review(o,itemId,'approve_photo_review',randomUUID(),expectedVersion),
     review(o,itemId,'reject_photo_review',randomUUID(),expectedVersion,1),
    ]);
    assert.deepEqual(pair.map(x=>x.status).sort(),[200,409]);for(const response of pair)await response.arrayBuffer();
    decisions.push('competing-'+sql(`select review_state from local_commerce.photo_reviews where order_id='${o.id}' and order_item_id='${itemId}';`));
   }else{
    const approved=await review(o,itemId,'approve_photo_review',randomUUID(),expectedVersion);assert.equal(approved.status,200);await approved.arrayBuffer();decisions.push('approved');
   }
  }
  assert.equal(sql(`select count(*) from local_commerce.photo_reviews where order_id='${o.id}' and review_state='pending';`),'0');
  assert.equal(sql(`select count(*) from local_commerce.fulfillment_decisions where order_id='${o.id}' and decision_kind in ('approve_photo_review','reject_photo_review');`),String(expectedReviews));
  const rejected=decisions.some(value=>value==='rejected'||value==='competing-rejected');let terminal,previewChain='not-applicable';
  if(rejected){const blocked=await lifecycle(o,'start_production');assert.equal(blocked.status,409);await blocked.arrayBuffer();terminal='production-blocked';}
  else {
   if(preview){
    await publishCurrentPreview(o,1);
    if(matrixIndex===0){
     for(const current of [1,2]){
      const revision=await customer(o,{fulfillmentActionId:randomUUID(),actionKind:'request_revision',expectedPreviewVersion:current,expectedAggregateVersion:version(o),revisionNote:'Please revise the current preview.'});assert.equal(revision.status,200);await revision.arrayBuffer();
      await publishCurrentPreview(o,current+1);
     }
     const third=await customer(o,{fulfillmentActionId:randomUUID(),actionKind:'request_revision',expectedPreviewVersion:3,expectedAggregateVersion:version(o),revisionNote:'A third revision is not allowed.'});assert.equal(third.status,409);await third.arrayBuffer();
     assert.equal(sql(`select count(*) from local_commerce.preview_manifests where order_id='${o.id}';`),'3');
     assert.equal(sql(`select revision_requests_used from local_commerce.fulfillments where order_id='${o.id}';`),'2');previewChain='v1-v3-two-revisions-third-rejected';
    }else previewChain='v1';
    const current=matrixIndex===0?3:1;
    const approval=await customer(o,{fulfillmentActionId:randomUUID(),actionKind:'approve_preview',expectedPreviewVersion:current,expectedAggregateVersion:version(o)});assert.equal(approval.status,200);await approval.arrayBuffer();
   }
   else assert.equal(sql(`select count(*) from local_commerce.preview_manifests where order_id='${o.id}';`),'0');
   const production=await lifecycle(o,'start_production');assert.equal(production.status,200);await production.arrayBuffer();
   const quality=await lifecycle(o,'mark_quality_check');assert.equal(quality.status,200);await quality.arrayBuffer();
   assert.equal(sql(`select fulfillment_state from local_commerce.fulfillments where order_id='${o.id}';`),'quality_check');
   terminal='quality_check';
  }
  if(mediaCount===2)assert.equal(sql(`select min(quantity) from local_commerce.order_item_purchase_snapshots s join local_commerce.order_items i on i.project_id=s.project_id and i.id=s.order_item_id where i.order_id='${o.id}';`),'3');
  assert.equal(sql(`select (select count(*) from local_commerce.shipments where order_id='${o.id}')+(select count(*) from local_commerce.shipment_events where order_id='${o.id}');`),'0');
  assert.equal(immutable(o),digest);report.imageMatrix.push({preview,mediaCount,lineCount,mixed,quantity:mediaCount===2?3:1,publicReference:o.publicReference,pendingReviews:expectedReviews,decisions,previewChain,terminal});matrixIndex++;
 }
 report.results.push('real upload/private Storage/receipt/Cart/Order/Payment/admission/review','reads and Payment do not admit','unpaid and disabled actor denied','explicit empty media has no fake review','approve/reject persistent decisions','review response loss + process restart replay','two live Workers: same-key admission and review','purchase header/item snapshots unchanged');
 report.status='PASS';report.scope='real empty/image/multiple media/mixed/two-line HTTP admission and photo-review decisions';
 console.info(JSON.stringify(report));
} finally {for(const p of children.reverse())await stop(p);globalThis.fetch=actualFetch;}
