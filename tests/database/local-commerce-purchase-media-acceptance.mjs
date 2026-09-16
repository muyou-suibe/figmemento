import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {randomUUID,randomBytes,createHmac} from 'node:crypto';
import {createRequire} from 'node:module';
import {sha256Text,planMigrationLedger} from '../../app/application/local-commerce-migration-ledger.ts';
import {validateProjectMarker} from '../../app/application/local-commerce-environment.ts';
import {createLocalPersistentDraftPort} from '../../app/infrastructure/local-commerce/local-persistent-draft-adapter.server.ts';
import {createLocalPersistentMediaAuthority} from '../../app/infrastructure/local-commerce/local-persistent-media-authority.server.ts';
import {createLocalPersistentCustomerAuthProvider} from '../../app/application/customer-auth-persistent-provider.server.ts';
import {createConfiguredGuestDraftOwnerService,getGuestDraftOwnerCookieName} from '../../app/lib/guest-draft-owner.ts';
import {ensureGuestResourceOwner,resolveGuestResourceOwner,hashGuestResourceCapability} from '../../app/application/guest-resource-ownership.server.ts';
import {createLocalImageHelper} from '../../local/commerce/image-helper/server.mjs';
import {catalogTestEnvironment,catalogDatabaseRows,ids} from '../fixtures/local-persistent-catalog.mjs';
import {POST} from '../../app/api/uploads/route.ts';
import {GET} from '../../app/api/customer-uploads/preview/route.ts';

import {persistentCartHttp} from '../../app/server/local-persistent-cart-http.server.ts';
import {createLocalCheckoutHttpHandler} from '../../app/server/local-checkout-http.server.ts';
import {readPersistentPurchaseCart} from '../../app/server/local-persistent-purchase-authority.server.ts';
import {createLocalPersistentCartPort} from '../../app/infrastructure/local-commerce/local-persistent-cart-adapter.server.ts';
import {GET as readiness} from '../../app/api/checkout-readiness/route.ts';
import {LOCAL_CART_COOKIE_NAME} from '../../app/domain/shopping-cart.ts';
import {createDeterministicCustomerUploadFakes} from '../../app/testing/customer-upload-fakes.ts';
import {cleanupPersistentMedia} from '../../app/infrastructure/local-commerce/local-persistent-media-cleanup.server.ts';
import {verifyMediaCleanup} from './local-commerce-media-cleanup-acceptance.mjs';
const run=process.argv[2];assert.equal(run,'run-75224a5b');assert.equal(process.argv[3],'--confirm-disposable');
const dir=path.resolve('local/commerce/runtime/disposable',run);
const prep=JSON.parse(readFileSync(path.join(dir,'ledger-preparation.json'),'utf8'));const c=prep.config;
const marker=JSON.parse(readFileSync(path.join(dir,'project-marker.json'),'utf8'));
assert.equal(validateProjectMarker(marker,c),true);assert.equal(sha256Text(JSON.stringify(marker)),prep.markerDigest);
function command(bin,args,input){const r=spawnSync(bin,args,{input,encoding:'utf8',maxBuffer:4*1024*1024});assert.equal(r.status,0,r.stderr?.replace(/eyJ[A-Za-z0-9_.-]+/g,'[redacted]'));return r.stdout.trim();}
const names=command('docker',['ps','--filter',`label=com.supabase.cli.workdir=${dir}`,'--format','{{.Names}}']).split('\n');
const db=names.filter(n=>n.startsWith('supabase_db_'));assert.equal(db.length,1);
const sql=q=>command('docker',['exec','-i',db[0],'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],q);
const businessTables=sql("select tablename from pg_tables where schemaname='local_commerce' order by tablename;").split('\n').filter(name=>!name.startsWith('catalog_'));
assert.ok(businessTables.every(name=>/^[a-z_]+$/.test(name)));
const businessSnapshot=()=>sql(businessTables.map(name=>`select '${name}:' || md5(coalesce(jsonb_agg(j order by j::text)::text,'null')) from (select to_jsonb(t) j from local_commerce.${name} t) rows`).join(' union all ')+';');
assert.equal(sql(`select local_commerce.verify_project_identity('${c.projectId}','${prep.markerDigest}');`),'t');
const info=JSON.parse(command(path.resolve('node_modules/.bin/supabase'),['status','--workdir',dir,'-o','json']));
assert.equal(new URL(info.API_URL).origin,new URL(c.endpoints.apiUrl).origin);
assert.ok(info.SERVICE_ROLE_KEY && info.ANON_KEY && info.JWT_SECRET,'Standard CLI local credentials required');
const env=catalogTestEnvironment({LOCAL_COMMERCE_RUN_ID:run,LOCAL_COMMERCE_PROJECT_ID:c.projectId,LOCAL_COMMERCE_MARKER_DIGEST:prep.markerDigest,
 LOCAL_COMMERCE_SERVICE_ROLE_KEY:info.SERVICE_ROLE_KEY,CART_SOURCE:'local_persistent',CUSTOMER_AUTH_SOURCE:'local_persistent',CUSTOMER_UPLOAD_SOURCE:'local_persistent',LOCAL_CHECKOUT_SOURCE:'local_persistent',
 LOCAL_COMMERCE_IMAGE_HELPER_SECRET:randomBytes(32).toString('base64url'),PHOTOGIFT_GUEST_DRAFT_OWNER_SECRET:randomUUID()+randomUUID(),PHOTOGIFT_GUEST_DRAFT_OWNER_CONTEXT_TTL_SECONDS:'3600'});
for(const[k,v]of Object.entries({SHADOW_DB:c.ports.shadowDb,API:c.ports.api,DB:c.ports.db,STUDIO:c.ports.studio,SMTP:c.ports.smtp,IMAGE_HELPER:c.ports.imageHelper}))env['LOCAL_COMMERCE_'+k+'_PORT']=String(v);
env.LOCAL_COMMERCE_API_URL=c.endpoints.apiUrl;env.LOCAL_COMMERCE_RPC_URL=c.endpoints.rpcUrl;env.LOCAL_COMMERCE_STORAGE_URL=c.endpoints.storageUrl;env.LOCAL_COMMERCE_IMAGE_HELPER_URL=c.endpoints.imageHelperUrl;
Object.assign(process.env,env);
const report={runId:run,projectId:c.projectId,checks:[]};
async function check(name,f){await f();report.checks.push({name,status:'PASS'});console.log('PASS '+name);}
await check('ledger ordered checksums and exact project marker',()=>{
 const manifest=JSON.parse(readFileSync('local/commerce/migrations/manifest.json','utf8'));
 const applied=JSON.parse(sql('select json_agg(json_build_object(\'version\',version,\'migrationId\',migration_id,\'checksum\',checksum,\'projectId\',project_id) order by version) from local_commerce.migration_ledger;'));
 assert.equal(applied.length,manifest.schemaVersion);for(const m of manifest.migrations)assert.equal(sha256Text(readFileSync('local/commerce/migrations/'+m.filename,'utf8')),m.checksum);
 const p=planMigrationLedger({...manifest,projectId:c.projectId},applied,c.projectId);assert.equal(p.status,'ready');assert.equal(p.apply.length,0);report.ledger=applied;
});
const headers={apikey:info.ANON_KEY,authorization:'Bearer '+info.SERVICE_ROLE_KEY,'Content-Type':'application/json','Content-Profile':'local_commerce'};
const rows=catalogDatabaseRows(c.projectId);
rows.configurations[0].definition.fields=[{...rows.configurations[0].definition.fields[0],kind:'image',code:'photo',label:'Synthetic photo',constraints:{allowedMimeTypes:['image/png','image/jpeg','image/webp'],maxBytes:1048576,minDimensions:{width:1,height:1},minImageCount:0,maxImageCount:4,cropEnabled:true}}];
for(const[key,table]of[['categories','catalog_categories'],['products','catalog_products'],['variants','catalog_variants'],['configurations','catalog_configuration_snapshots'],['rules','catalog_pricing_rules']]){
 const r=await fetch(c.endpoints.apiUrl+'/rest/v1/'+table,{method:'POST',headers:{...headers,Prefer:'resolution=ignore-duplicates'},body:JSON.stringify(rows[key])});assert.equal(r.status,201,table);
}
const helper=createLocalImageHelper(env).server;
await new Promise(r=>helper.listen(c.ports.imageHelper,'127.0.0.1',r));
const web=createServer(async(req,res)=>{try{const request=new Request('http://127.0.0.1:55646'+req.url,{method:req.method,headers:req.headers,...(req.method==='POST'?{body:req,duplex:'half'}:{})});
 const response=req.url.startsWith('/api/uploads?')?await POST(request):await GET(request);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
}catch{res.writeHead(503);res.end();}});
await new Promise(r=>web.listen(55646,'127.0.0.1',r));
const sharp=createRequire(path.resolve('local/commerce/image-helper/package.json'))('sharp');
const png=await sharp({create:{width:12,height:8,channels:3,background:{r:32,g:90,b:160}}}).png().toBuffer();
const owners=createConfiguredGuestDraftOwnerService(env);
const guest=await ensureGuestResourceOwner({projectId:c.projectId,context:null,ownerService:owners});assert.equal(guest.status,'issued');
const verifyOwner=async()=>{const r=await resolveGuestResourceOwner({projectId:c.projectId,context:guest.context,ownerService:owners});return r.status==='authorized'?{owner:r.owner,expiresAt:r.owner.expiresAt}:null;};
const draft=await createLocalPersistentDraftPort({environment:env,verifyOwner});assert.equal(draft.status,'ready');
const {port,authority}=draft;const idem=()=>({key:randomUUID(),fingerprint:'media-acceptance'});
const created=await port.create({authority,expectedVersion:0,idempotency:idem(),productId:ids.product});assert.equal(created.status,'found');let state=created.value;
const media=createLocalPersistentMediaAuthority(env,verifyOwner);
const args=()=>({draftId:state.draftId,expectedVersion:state.version,fieldId:ids.field,bytes:png});
const readDraft=()=>port.read({authority,draftId:state.draftId});
const latest=()=>JSON.parse(sql(`select row_to_json(x) from (select id,lifecycle,version,original_locator,derivative_locator from local_commerce.media_operations where draft_id='${state.draftId}' order by created_at desc limit 1)x;`));
const save=async(m,crop)=>{const r=await port.save({authority,draftId:state.draftId,expectedVersion:state.version,idempotency:idem(),slots:[{slotId:m.slotId,fieldId:ids.field,receiptReference:m.receipt.receiptId,...(crop?{crop}:{})}]});assert.equal(r.status,'found',JSON.stringify(r));state=r.value;};
let accepted;
const nativeFetch=globalThis.fetch;
try{
 if (!process.argv.includes('--cleanup-only')) {
 await check('real original and derivative Storage; durable first; ready never auto-confirms Draft',async()=>{
  let writes=0;globalThis.fetch=async(u,o)=>{if(String(u).includes('/storage/v1/object/')&&o?.method==='POST'){
    const row=latest();assert.equal(row.lifecycle,'pending');assert.equal(row.original_locator.startsWith(c.projectId+'/media/'),true);writes++;
   }return nativeFetch(u,o);};
  try{accepted=await media.accept(args());}finally{globalThis.fetch=nativeFetch;}
  assert.equal(accepted.status,'found',JSON.stringify(accepted));assert.equal(writes,2);assert.deepEqual((await readDraft()).value,state);
  const preview=await media.read(accepted.receipt.receiptId);assert.equal(preview.status,'found');assert.equal((await sharp(preview.bytes).metadata()).width,12);
  assert.doesNotMatch(JSON.stringify(accepted),/locator|bucket|object_key|service_role|signed_url/i);
 });
 await check('explicit Draft CAS materializes SAME futureSlotId; stale CAS no mutation',async()=>{
  const before=state;await save(accepted);assert.equal(state.slots[0].slotId,accepted.slotId);assert.equal(state.version,before.version+1);
  assert.equal((await port.save({authority,draftId:state.draftId,expectedVersion:before.version,idempotency:idem(),slots:[]})).status,'conflict');
 });
 await check('crop has durable revision; preserves original and confirmed state until explicit CAS',async()=>{
  const previous=structuredClone(state);const crop={x:0.25,y:0.25,width:0.5,height:0.5};
  const r=await media.accept({...args(),slotId:accepted.slotId,originalReceiptId:accepted.receipt.receiptId,crop,bytes:new Uint8Array()});
  assert.equal(r.status,'found',JSON.stringify(r));assert.equal(r.sourceGeneration,accepted.sourceGeneration);assert.equal(r.cropRevision,accepted.cropRevision+1);
  assert.deepEqual((await readDraft()).value,previous);assert.equal((await media.read(accepted.receipt.receiptId)).status,'found');
  const image=await media.read(r.receipt.receiptId);assert.deepEqual(await sharp(image.bytes).metadata().then(m=>[m.width,m.height]),[6,4]);
  await save(r,crop);accepted=r;
 });

 await check('4.5 image Cart Add exact durable owner, confirmed field/crop; readonly readiness',async()=>{
  const handoff={productId:ids.product,variantId:ids.variant,skuCode:'SYNTHETIC-KEEPSAKE-S',
   selectedOptions:[{optionId:ids.option,valueId:ids.value}],configurationRevision:'1',
   customizationValues:[{fieldId:ids.field,fieldCode:'photo',kind:'image',images:[{receiptId:accepted.receipt.receiptId,crop:state.slots[0].crop}]}]};
  const guestCookie=getGuestDraftOwnerCookieName()+'='+encodeURIComponent(guest.context);
  const request=(cookie,h=handoff)=>new Request('http://127.0.0.1:55646/api/cart',{method:'POST',headers:{origin:'http://127.0.0.1:55646',cookie,'content-type':'application/json'},body:JSON.stringify({handoff:h})});
  const added=await persistentCartHttp(request(guestCookie),'add');assert.equal(added.status,200,await added.clone().text());
  const cartCookie=added.headers.getSetCookie().find(v=>v.startsWith(LOCAL_CART_COOKIE_NAME+'=')).split(';')[0];
  const cookies=guestCookie+'; '+cartCookie;
  const again=await persistentCartHttp(request(cookies),'add');assert.equal(again.status,200);
  const cart=await again.json();assert.equal(cart.lines.length,2);assert.notEqual(cart.lines[0].lineId,cart.lines[1].lineId);
  const snapshot=businessSnapshot;
  const before=snapshot();
  const r=await readiness(new Request('http://127.0.0.1:55646/api/checkout-readiness',{headers:{cookie:cookies}}));
  const body=await r.json();assert.equal(r.status,200,JSON.stringify(body));assert.equal(body.lines.length,2);
  for(const line of body.lines)assert.deepEqual(line.issues,[]);
  assert.equal(snapshot(),before);
  const wrong=await ensureGuestResourceOwner({projectId:c.projectId,context:null,ownerService:owners});
  const denied=await persistentCartHttp(request(getGuestDraftOwnerCookieName()+'='+encodeURIComponent(wrong.context)+'; '+cartCookie),'add');
  assert.equal(denied.status,400);
  const forged=structuredClone(handoff);forged.customizationValues[0].images[0].receiptId=randomUUID();
  assert.equal((await persistentCartHttp(request(cookies,forged),'add')).status,400);
  const fakeId=randomUUID();const fake=createDeterministicCustomerUploadFakes({receipts:[{receipt:{...accepted.receipt,receiptId:fakeId,ownerId:guest.owner.ownerId}}]});
  assert.equal((await fake.receiptRepository.findOwnedReceipt(fakeId,guest.owner.ownerId)).status,'found');
  const mapHandoff=structuredClone(handoff);mapHandoff.customizationValues[0].images[0].receiptId=fakeId;
  assert.equal((await persistentCartHttp(request(cookies,mapHandoff),'add')).status,400);
  for(const expected of [{productId:randomUUID()},{fieldId:randomUUID()},{configurationRevision:'999'},{crop:{x:0,y:0,width:1,height:1}}]){
   assert.notEqual((await media.readConfirmedReceipt(accepted.receipt.receiptId,{productId:ids.product,fieldId:ids.field,configurationRevision:'1',crop:state.slots[0].crop,...expected})).status,'found');
  }
  assert.equal(snapshot(),before);
  for(const lifecycle of ['removed','expired']){
   sql(`update local_commerce.media_receipts set lifecycle='${lifecycle}' where receipt_reference='${accepted.receipt.receiptId}';`);
   try{assert.equal((await persistentCartHttp(request(cookies),'add')).status,400);}
   finally{sql(`update local_commerce.media_receipts set lifecycle='active' where receipt_reference='${accepted.receipt.receiptId}';`);}
  }
  report.cartReadiness={status:r.status,lines:2,readOnly:true,distinctLines:true};
  await check('4.6 physical Checkout fresh DB rules, coupon states, readonly and stale guards',async()=>{
   const checkout=createLocalCheckoutHttpHandler();
   const fields={email:'synthetic@example.test',firstName:'Test',lastName:'Only',country:'US',city:'Test',addressLine1:'Synthetic',postalCode:'00000',shippingMethod:'local_standard'};
   const call=(data=fields)=>checkout(new Request('http://127.0.0.1:55646/api/checkout',{method:'POST',headers:{origin:'http://127.0.0.1:55646',cookie:cookies,'content-type':'application/json'},body:JSON.stringify(data)}));
   const baseline=snapshot();const initial=await call();assert.equal(initial.status,200,await initial.clone().text());const value=await initial.json();
   assert.equal(value.localDemoTotalCents,5500);assert.equal(value.tax.status,'not_activated');assert.equal(value.tax.amountCents,null);assert.equal(snapshot(),baseline);
   for(const[code,status,discount]of[['TEST10','valid',500],['MISSING','invalid',0]]){
    const response=await call({...fields,couponCode:code});assert.equal(response.status,200);const v=await response.json();assert.equal(v.coupon.status,status);assert.equal(v.coupon.discountCents,discount);
   }
   const original=sql(`select definition::text from local_commerce.catalog_pricing_rules where id='${ids.coupon}';`);
   sql(`update local_commerce.catalog_pricing_rules set definition=jsonb_set(definition,'{ruleRevision}','999') where id='${ids.coupon}';`);
   try{assert.equal((await call({...fields,couponCode:'TEST10'})).status,503);}
   finally{sql(`update local_commerce.catalog_pricing_rules set definition='${original}'::jsonb where id='${ids.coupon}';`);}
   for(const[patch,status]of[[{expiresAt:'2026-02-01T00:00:00Z'},'expired'],[{eligible:false},'not_applicable']]){
    sql(`update local_commerce.catalog_pricing_rules set definition=definition || '${JSON.stringify(patch)}'::jsonb where id='${ids.coupon}';`);
    try{const response=await call({...fields,couponCode:'TEST10'});assert.equal(response.status,200);const v=await response.json();assert.equal(v.coupon.status,status);assert.equal(v.coupon.discountCents,0);}
    finally{sql(`update local_commerce.catalog_pricing_rules set definition='${original}'::jsonb where id='${ids.coupon}';`);}
   }
   sql(`update local_commerce.catalog_pricing_rules set version=version+1,definition=jsonb_set(definition,'{amountCents}','700') where id='${ids.shipping}';`);
   try{const fresh=await call();assert.equal(fresh.status,200);assert.equal((await fresh.json()).shipping.amountCents,700);assert.equal((await call({...fields,expectedVersions:value.versions})).status,503);}
   finally{sql(`update local_commerce.catalog_pricing_rules set version=version-1,definition=jsonb_set(definition,'{amountCents}','500') where id='${ids.shipping}';`);}
   sql(`update local_commerce.catalog_variants set price_cents=2600,version=version+1 where id='${ids.variant}';`);
   try{const stale=await call();assert.equal(stale.status,409);assert.equal((await stale.json()).issues[0].code,'STALE_CATALOG');}
   finally{sql(`update local_commerce.catalog_variants set price_cents=2500,version=version-1 where id='${ids.variant}';`);}
   assert.equal((await call({...fields,discountAmount:9999})).status,400);
   assert.equal(snapshot(),baseline);report.checkout={readOnly:true,couponStates:4,shippingFresh:true,staleVersionRejected:true,tax:'not_activated/null'};
  });
  await check('4.7 two independent Cart adapters concurrent CAS: exactly one winner; no lost update',async()=>{
   const state=await readPersistentPurchaseCart(new Request('http://127.0.0.1:55646/api/cart',{headers:{cookie:cookies}}));assert.equal(state.status,'found');
   const v=await state.verifyOwner();assert.ok(v);
   const adapters=await Promise.all([1,2].map(()=>createLocalPersistentCartPort({environment:env,owner:v.owner,authorityExpiresAt:v.expiresAt,verifyOwner:state.verifyOwner})));
   adapters.forEach(a=>assert.equal(a.status,'ready'));
   const results=await Promise.all(adapters.map((a,i)=>a.port.updateLine({authority:a.authority,cartId:state.record.cartId,lineId:state.record.lines[0].lineId,expectedVersion:state.version,idempotency:idem(),quantity:i+2})));
   assert.equal(results.filter(r=>r.status==='found').length,1);assert.equal(results.filter(r=>r.status==='conflict').length,1);
   const winner=results.find(r=>r.status==='found');assert.equal(winner.value.version,state.version+1);
   const read=await adapters[1].port.read({authority:adapters[1].authority,cartId:state.record.cartId});assert.equal(read.status,'found');assert.equal(read.value.version,winner.value.version);
   assert.deepEqual(read.value.record.lines,winner.value.record.lines);report.cartCAS=true;
  });
 });

 await check('4.5 text-only Cart and readiness do not activate Upload',async()=>{
  const replacements=Object.fromEntries(Object.entries(ids).filter(([key])=>!['category','shipping','coupon'].includes(key)).map(([key])=>[key,randomUUID()]));
  let serialized=JSON.stringify(catalogDatabaseRows(c.projectId));
  for(const[key,id]of Object.entries(replacements))serialized=serialized.replaceAll(ids[key],id);
  const textRows=JSON.parse(serialized);textRows.products[0].slug='text-'+randomUUID();textRows.variants[0].sku_code='TEXT-'+randomUUID();
  Object.assign(textRows.products[0].fulfillment_definition,{fulfillmentType:'digital',requiresShipping:false,productionMode:'digital_creation'});
  textRows.variants[0].weight_grams=0;
  for(const[key,table]of[['products','catalog_products'],['variants','catalog_variants'],['configurations','catalog_configuration_snapshots']]){
   const r=await nativeFetch(c.endpoints.apiUrl+'/rest/v1/'+table,{method:'POST',headers,body:JSON.stringify(textRows[key])});assert.equal(r.status,201,table);
  }
  const h={productId:replacements.product,variantId:replacements.variant,skuCode:textRows.variants[0].sku_code,
   selectedOptions:[{optionId:replacements.option,valueId:replacements.value}],configurationRevision:'1',
   customizationValues:[{fieldId:replacements.field,fieldCode:'caption',kind:'short_text',value:'Independent text'}]};
  let mediaCalls=0;globalThis.fetch=async(u,o)=>{if(/storage\/v1|media_operation|\/process$/.test(String(u)))mediaCalls++;return nativeFetch(u,o);};
  const previous=process.env.CUSTOMER_UPLOAD_SOURCE;process.env.CUSTOMER_UPLOAD_SOURCE='disabled';
  try{
   const cookie=getGuestDraftOwnerCookieName()+'='+encodeURIComponent(guest.context);
   const r=await persistentCartHttp(new Request('http://127.0.0.1:55646/api/cart',{method:'POST',headers:{origin:'http://127.0.0.1:55646',cookie,'content-type':'application/json'},body:JSON.stringify({handoff:h})}),'add');
   assert.equal(r.status,200,await r.clone().text());
   const cartCookie=r.headers.getSetCookie().find(v=>v.startsWith(LOCAL_CART_COOKIE_NAME+'=')).split(';')[0];
   const ready=await readiness(new Request('http://127.0.0.1:55646/api/checkout-readiness',{headers:{cookie:cookie+'; '+cartCookie}}));
   assert.equal(ready.status,200);const projection=await ready.json();assert.deepEqual(projection.lines[0].issues,[]);
   await check('4.6 digital-only email, no shipping, bounded fields; mixed requires physical inputs',async()=>{
    const cookies=cookie+'; '+cartCookie;
    const checkout=createLocalCheckoutHttpHandler();
    const call=data=>checkout(new Request('http://127.0.0.1:55646/api/checkout',{method:'POST',headers:{origin:'http://127.0.0.1:55646',cookie:cookies,'content-type':'application/json'},body:JSON.stringify(data)}));
    const before=businessSnapshot();const digital=await call({email:'digital@example.test'});assert.equal(digital.status,200,await digital.clone().text());const v=await digital.json();assert.equal(businessSnapshot(),before);
    assert.deepEqual(v.shipping,{status:'not_applicable',amountCents:0});assert.equal(v.localDemoTotalCents,2500);assert.equal(v.tax.amountCents,null);
    assert.equal((await call({})).status,400);assert.equal((await call({email:'digital@example.test',country:'INVALID'})).status,400);
    assert.equal(mediaCalls,0);
    process.env.CUSTOMER_UPLOAD_SOURCE=previous;
    const image={productId:ids.product,variantId:ids.variant,skuCode:'SYNTHETIC-KEEPSAKE-S',selectedOptions:[{optionId:ids.option,valueId:ids.value}],configurationRevision:'1',
     customizationValues:[{fieldId:ids.field,fieldCode:'photo',kind:'image',images:[{receiptId:accepted.receipt.receiptId,crop:state.slots[0].crop}]}]};
    const mixed=await persistentCartHttp(new Request('http://127.0.0.1:55646/api/cart',{method:'POST',headers:{origin:'http://127.0.0.1:55646',cookie:cookies,'content-type':'application/json'},body:JSON.stringify({handoff:image})}),'add');assert.equal(mixed.status,200);
    assert.equal((await call({email:'digital@example.test'})).status,400);
    const physical=await call({email:'digital@example.test',firstName:'Test',lastName:'Only',country:'US',city:'Test',addressLine1:'Synthetic',postalCode:'00000',shippingMethod:'local_standard'});
    assert.equal(physical.status,200,await physical.clone().text());assert.equal((await physical.json()).shipping.amountCents,500);
    report.digitalMixed=true;
   });
   report.textOnlyUploadDecoupled=true;
  }finally{globalThis.fetch=nativeFetch;process.env.CUSTOMER_UPLOAD_SOURCE=previous;}
 });
 await check('wrong owner/project/expired authority; no memory fallback',async()=>{
  const foreign=await ensureGuestResourceOwner({projectId:c.projectId,context:null,ownerService:owners});
  assert.equal((await createLocalPersistentMediaAuthority(env,async()=>({owner:foreign.owner,expiresAt:foreign.owner.expiresAt})).read(accepted.receipt.receiptId)).status,'unavailable');
  assert.equal((await createLocalPersistentMediaAuthority(env,async()=>({owner:guest.owner,expiresAt:1})).read(accepted.receipt.receiptId)).status,'unavailable');
  for(const override of [{NODE_ENV:'production'},{NODE_ENV:'staging'},{NODE_ENV:'unknown'},{LOCAL_COMMERCE_MARKER_DIGEST:'0'.repeat(64)},{LOCAL_COMMERCE_API_URL:'https://invalid.example.test'}])
   assert.equal((await createLocalPersistentMediaAuthority({...env,...override},verifyOwner).read(accepted.receipt.receiptId)).status,'unavailable');
 });
 await check('new Node process restores exact ready operation/receipt, not process memory',()=>{
  const program=`import{readFileSync}from'node:fs';import{createConfiguredGuestDraftOwnerService}from'./app/lib/guest-draft-owner.ts';import{resolveGuestResourceOwner}from'./app/application/guest-resource-ownership.server.ts';import{createLocalPersistentMediaAuthority}from'./app/infrastructure/local-commerce/local-persistent-media-authority.server.ts';const x=JSON.parse(readFileSync(0,'utf8'));const v=async()=>{const r=await resolveGuestResourceOwner({projectId:x.env.LOCAL_COMMERCE_PROJECT_ID,context:x.context,ownerService:createConfiguredGuestDraftOwnerService(x.env)});return r.status==='authorized'?{owner:r.owner,expiresAt:r.owner.expiresAt}:null;};const r=await createLocalPersistentMediaAuthority(x.env,v).reconcile(x.id);console.log(JSON.stringify({pid:process.pid,result:r}));`;
  const r=JSON.parse(command(process.execPath,['--input-type=module','-e',program],JSON.stringify({env,context:guest.context,id:accepted.operationId})));
  assert.notEqual(r.pid,process.pid);assert.deepEqual(r.result,accepted);report.recoveryPid=r.pid;
 });
 await check('real Storage unauthorized write: pending/no receipt; bounded exact failure cleanup',async()=>{
  globalThis.fetch=async(u,o)=>{if(String(u).includes('/storage/v1/object/')&&o?.method==='POST'){const h=new Headers(o.headers);h.set('authorization','Bearer '+info.ANON_KEY);return nativeFetch(u,{...o,headers:h});}return nativeFetch(u,o);};
  try{assert.equal((await media.accept(args())).status,'unavailable');}finally{globalThis.fetch=nativeFetch;}
  const op=latest();assert.equal(op.lifecycle,'pending');assert.equal((await media.fail(op.id)).status,'failed');assert.deepEqual((await readDraft()).value,state);
 });
 await check('real RPC metadata rejection after Storage success; exact reconcile publishes once',async()=>{
  globalThis.fetch=async(u,o)=>{if(String(u).endsWith('/rpc/media_operation_command')&&JSON.parse(o.body).p_command==='publish'){
    return nativeFetch(u,{...o,body:JSON.stringify({...JSON.parse(o.body),p_marker_digest:'0'.repeat(64)})});}return nativeFetch(u,o);};
  try{assert.equal((await media.accept(args())).status,'unavailable');}finally{globalThis.fetch=nativeFetch;}
  const op=latest();assert.equal(op.lifecycle,'pending');const r=await media.reconcile(op.id);assert.equal(r.status,'found');assert.deepEqual(await media.reconcile(op.id),r);
  assert.deepEqual((await readDraft()).value,state);
 });
 await check('lost publish HTTP response recovers exact committed receipt',async()=>{
  let lost=false;globalThis.fetch=async(u,o)=>{const r=await nativeFetch(u,o);if(!lost&&String(u).endsWith('/rpc/media_operation_command')&&JSON.parse(o.body).p_command==='publish'){lost=true;throw Error('synthetic lost response');}return r;};
  try{assert.equal((await media.accept(args())).status,'found');assert.equal(lost,true);}finally{globalThis.fetch=nativeFetch;}
 });
 await check('actual read-back denied prevents false ready; exact operation recovers later',async()=>{
  globalThis.fetch=async(u,o)=>{if(String(u).includes('/storage/v1/object/')&&(!o?.method||o.method==='GET')){
    const h=new Headers(o?.headers);h.set('authorization','Bearer '+info.ANON_KEY);return nativeFetch(u,{...o,headers:h});}return nativeFetch(u,o);};
  try{assert.equal((await media.accept(args())).status,'unavailable');}finally{globalThis.fetch=nativeFetch;}
  const op=latest();assert.equal(op.lifecycle,'pending');assert.equal((await media.reconcile(op.id)).status,'found');assert.deepEqual((await readDraft()).value,state);
 });
 await check('actual helper rejection after original write preserves prior confirmed crop/derivative',async()=>{
  let calls=0;const prior=await media.read(accepted.receipt.receiptId);assert.equal(prior.status,'found');
  globalThis.fetch=async(u,o)=>{if(String(u)===c.endpoints.imageHelperUrl+'/process'&&++calls===2){
    const h=new Headers(o.headers);h.set('authorization','Bearer rejected');return nativeFetch(u,{...o,headers:h});}return nativeFetch(u,o);};
  try{assert.equal((await media.accept({...args(),slotId:accepted.slotId,originalReceiptId:accepted.receipt.receiptId,crop:{x:0,y:0,width:0.5,height:0.5}})).status,'unavailable');}
  finally{globalThis.fetch=nativeFetch;}
  const op=latest();assert.equal(op.lifecycle,'pending');assert.equal((await media.fail(op.id)).status,'failed');
  assert.deepEqual((await media.read(accepted.receipt.receiptId)).bytes,prior.bytes);assert.deepEqual((await readDraft()).value,state);
 });
 await check('known-operation conflicting input rejects; unknown operation never guesses ready',async()=>{
  const body={p_project_id:c.projectId,p_marker_digest:prep.markerDigest,p_owner_kind:'guest',p_owner_selector:await hashGuestResourceCapability(guest.owner.ownerId),p_customer_id:null,
    p_authority_expires_at:new Date(guest.owner.expiresAt*1000).toISOString(),p_command:'lookup',p_operation_id:accepted.operationId,p_draft_id:null,p_slot_id:null,p_expected_version:null,p_input:{digest:'0'.repeat(64)}};
  const r=await nativeFetch(c.endpoints.apiUrl+'/rest/v1/rpc/media_operation_command',{method:'POST',headers,body:JSON.stringify(body)});assert.equal(r.status,200);assert.equal((await r.json()).status,'conflict');
  assert.equal((await media.reconcile(randomUUID())).status,'unavailable');
 });
 await check('stale crop revision cannot replace newer ready crop; original Storage bytes immutable',async()=>{
  const before=structuredClone(state);const crop={x:0,y:0,width:0.5,height:0.5};
  globalThis.fetch=async(u,o)=>{if(String(u).endsWith('/rpc/media_operation_command')&&JSON.parse(o.body).p_command==='publish')return nativeFetch(u,{...o,body:JSON.stringify({...JSON.parse(o.body),p_marker_digest:'0'.repeat(64)})});return nativeFetch(u,o);};
  try{assert.equal((await media.accept({...args(),slotId:accepted.slotId,originalReceiptId:accepted.receipt.receiptId,crop})).status,'unavailable');}finally{globalThis.fetch=nativeFetch;}
  const old=latest();const newer=await media.accept({...args(),slotId:accepted.slotId,originalReceiptId:accepted.receipt.receiptId,crop});assert.equal(newer.status,'found');
  assert.equal((await media.reconcile(old.id)).status,'conflict');assert.deepEqual((await readDraft()).value,before);
  const original=await nativeFetch(c.endpoints.storageUrl+'/object/authenticated/local-commerce-private/'+old.original_locator,{headers});assert.equal(original.status,200);assert.deepEqual(Buffer.from(await original.arrayBuffer()),png);
  await save(newer,crop);accepted=newer;
 });
 await check('late generation cannot publish over newer replacement or confirm stale receipt',async()=>{
  globalThis.fetch=async(u,o)=>{if(String(u).endsWith('/rpc/media_operation_command')&&JSON.parse(o.body).p_command==='publish')return nativeFetch(u,{...o,body:JSON.stringify({...JSON.parse(o.body),p_marker_digest:'0'.repeat(64)})});return nativeFetch(u,o);};
  try{assert.equal((await media.accept({...args(),slotId:accepted.slotId})).status,'unavailable');}finally{globalThis.fetch=nativeFetch;}
  const old=latest();const newer=await media.accept({...args(),slotId:accepted.slotId});assert.equal(newer.status,'found');
  assert.equal((await media.reconcile(old.id)).status,'conflict');assert.deepEqual((await readDraft()).value,state);await save(newer);accepted=newer;
 });
 const cookie=getGuestDraftOwnerCookieName()+'='+encodeURIComponent(guest.context);
 const upload=async(bytes,type='image/png',extra)=>{const form=new FormData();form.set('file',new File([bytes],'untrusted.jpg',{type}));if(extra)extra(form);
  return nativeFetch(`http://127.0.0.1:55646/api/uploads?productId=${ids.product}&fieldId=${ids.field}&draftId=${state.draftId}&expectedVersion=${state.version}`,{method:'POST',headers:{origin:'http://127.0.0.1:55646',cookie},body:form});};
 await check('real HTTP sole upload JPEG/PNG/WebP accepted; safe receipt; independent attempts',async()=>{
  const receipts=[];for(const format of ['jpeg','png','webp']){const bytes=await sharp(png).toFormat(format).toBuffer();const r=await upload(bytes,'application/octet-stream');assert.equal(r.status,201,await r.clone().text());const b=await r.json();assert.equal(b.receipt.contentType,'image/'+format);receipts.push(b.receipt.receiptId);assert.doesNotMatch(JSON.stringify(b),/operationId|slotId|owner|locator|bucket|path|url/i);}
  assert.equal(new Set(receipts).size,3);assert.deepEqual((await readDraft()).value,state);report.uploadStatuses=[201,201,201];
 });
 await check('HTTP rejects SVG/HTML/corrupt/truncated/oversize/multi-file/forged form fields',async()=>{
  for(const bytes of [Buffer.from('<svg/>'),Buffer.from('<html>bad</html>'),png.subarray(0,30),Buffer.alloc(1048577)])assert.equal((await upload(bytes)).status,400);
  assert.equal((await upload(png,'image/png',f=>f.append('file',new File([png],'two.png')))).status,400);
  assert.equal((await upload(png,'image/png',f=>f.set('imageCount','1'))).status,400);
  const bomb=await sharp({create:{width:4097,height:4097,channels:3,background:'white'}}).png().toBuffer();assert.equal((await upload(bomb)).status,400);
 });
 await check('same-origin private read, wrong owner and absent object non-enumerating',async()=>{
  const url='http://127.0.0.1:55646/api/customer-uploads/preview?receiptId='+accepted.receipt.receiptId;
  const r=await nativeFetch(url,{headers:{cookie}});assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'image/png');assert.equal((await nativeFetch(url)).status,404);
  assert.equal((await nativeFetch(url,{headers:{cookie,origin:'https://invalid.example.test'}})).status,403);
  const extra=await media.accept(args());assert.equal(extra.status,'found');const op=latest();
  assert.equal((await media.remove(op.id)).status,'removed');
  assert.equal((await cleanupPersistentMedia(env,op.id,'derivative')).status,'completed');
  assert.equal((await media.read(extra.receipt.receiptId)).status,'unavailable');
  const ref=accepted.receipt.receiptId;
  sql(`update local_commerce.media_receipts set lifecycle='removed' where receipt_reference='${ref}';`);assert.equal((await media.read(ref)).status,'unavailable');
  sql(`update local_commerce.media_receipts set lifecycle='active',expires_at=clock_timestamp()-interval '1 second' where receipt_reference='${ref}';`);assert.equal((await media.read(ref)).status,'unavailable');
 });
 await check('RLS/execute deny browser roles; private core not service callable',()=>{
  for(const role of ['anon','authenticated'])for(const table of ['media_operations','media_slot_reservations'])assert.equal(sql(`select has_table_privilege('${role}','local_commerce.${table}','SELECT,INSERT,UPDATE,DELETE');`),'f');
  assert.equal(sql("select has_function_privilege('service_role','local_commerce.draft_command_before_media(text,text,text,text,uuid,timestamptz,text,uuid,uuid,integer,text,text,jsonb)','EXECUTE');"),'f');
 });
 await check('real durable member session revoke rejects media read immediately',async()=>{
  const auth=createLocalPersistentCustomerAuthProvider(env);const registered=await auth.signUp({email:'media-'+randomUUID()+'@example.test',password:'Synthetic-valid-password-42!'});assert.equal(registered.status,'ok');
  const verifyMember=async()=>{const r=await auth.getSession(registered.value.sessionId);if(r.status!=='ok'||!r.value.authenticated)return null;
   return{owner:{kind:'customer',projectId:c.projectId,ownerId:r.value.ownerId,customerId:r.value.customer.id},expiresAt:Date.parse(r.value.expiresAt)/1000};};
  const p=await createLocalPersistentDraftPort({environment:env,verifyOwner:verifyMember});assert.equal(p.status,'ready');
  const d=await p.port.create({authority:p.authority,expectedVersion:0,idempotency:idem(),productId:ids.product});assert.equal(d.status,'found');
  const m=createLocalPersistentMediaAuthority(env,verifyMember);const r=await m.accept({draftId:d.value.draftId,expectedVersion:d.value.version,fieldId:ids.field,bytes:png});assert.equal(r.status,'found');
  assert.equal((await m.read(r.receipt.receiptId)).status,'found');await auth.signOut(registered.value.sessionId);assert.equal((await m.read(r.receipt.receiptId)).status,'unavailable');
 });
 await check('actual anon/authenticated HTTP denies media table/RPC',async()=>{
  const enc=v=>Buffer.from(JSON.stringify(v)).toString('base64url');const h=enc({alg:'HS256',typ:'JWT'}),p=enc({role:'authenticated',sub:randomUUID(),aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600});
  const jwt=h+'.'+p+'.'+createHmac('sha256',info.JWT_SECRET).update(h+'.'+p).digest('base64url');
  const statuses=[];for(const token of [info.ANON_KEY,jwt]){
   const r=await nativeFetch(c.endpoints.apiUrl+'/rest/v1/media_operations?select=id',{headers:{apikey:info.ANON_KEY,authorization:'Bearer '+token,'Accept-Profile':'local_commerce'}});
   assert.ok([401,403].includes(r.status));statuses.push(r.status);
   const body={p_project_id:c.projectId,p_marker_digest:prep.markerDigest,p_owner_kind:'guest',p_owner_selector:await hashGuestResourceCapability(guest.owner.ownerId),p_customer_id:null,
    p_authority_expires_at:new Date(guest.owner.expiresAt*1000).toISOString(),p_command:'lookup',p_operation_id:accepted.operationId,p_draft_id:null,p_slot_id:null,p_expected_version:null,p_input:null};
   const rpc=await nativeFetch(c.endpoints.apiUrl+'/rest/v1/rpc/media_operation_command',{method:'POST',headers:{...headers,authorization:'Bearer '+token},body:JSON.stringify(body)});
   assert.ok([401,403].includes(rpc.status));statuses.push(rpc.status);
  }report.browserRoleStatuses=statuses;
 });
 }
 await verifyMediaCleanup({env,c,prep,sql,headers,info,media,args,readDraft,save,check,report,nativeFetch});
 const evidenceName=process.argv.includes('--cleanup-only')?'cleanup-evidence.json':'purchase-media-evidence.json';
 writeFileSync(path.join(dir,evidenceName),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.checks.length,runId:run,evidenceName}));
}finally{globalThis.fetch=nativeFetch;await new Promise(r=>web.close(r));await new Promise(r=>helper.close(r));}
