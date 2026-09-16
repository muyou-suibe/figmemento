// Real vinext Worker, real loopback HTTP/RPC, exact existing disposable DB.
// Creates only uniquely named synthetic fixtures; no reset, seed replacement,
// remote endpoint, or stopping any pre-existing process/container.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawn,spawnSync} from 'node:child_process';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {createServer} from 'node:net';
import {createRequire} from 'node:module';
import {createConfiguredGuestDraftOwnerService,createGuestDraftOwnerService,getGuestDraftOwnerCookieName} from '../../app/lib/guest-draft-owner.ts';
import {createPersistentOrderCapabilityCodec} from '../../app/server/local-order-capability.server.ts';
import {ensureGuestResourceOwner,resolveGuestResourceOwner} from '../../app/application/guest-resource-ownership.server.ts';
import {createLocalPersistentDraftPort} from '../../app/infrastructure/local-commerce/local-persistent-draft-adapter.server.ts';
import {createLocalPersistentMediaAuthority} from '../../app/infrastructure/local-commerce/local-persistent-media-authority.server.ts';
import {verifyCopyCleanup} from './local-commerce-copy-cleanup-acceptance.mjs';
import {persistentOwnerVerifier} from '../../app/server/local-persistent-purchase-authority.server.ts';
import {LocalCatalogAuthority} from '../../app/infrastructure/local-commerce/local-catalog-authority.server.ts';
import {readPersistentOrderHistory} from '../../app/server/local-persistent-order-history.server.ts';
import {verifyHistorySecurity} from './local-commerce-history-security.mjs';
import {catalogDatabaseRows,catalogTestEnvironment,ids} from '../fixtures/local-persistent-catalog.mjs';

const run=process.argv.find(value=>/^run-[a-f0-9]{8}$/.test(value))??'run-5576dfd8';
const dir=`${process.cwd()}/local/commerce/runtime/disposable/${run}`;
const prep=JSON.parse(readFileSync(`${dir}/ledger-preparation.json`)),c=prep.config;
const project=c.projectId;
assert.equal(c.projectId,project);assert.equal(c.projectKind,'disposable_test');assert.equal(c.postgresMajorVersion,17);
function command(bin,args,input) {const r=spawnSync(bin,args,{input,encoding:'utf8',timeout:15000,maxBuffer:1024*1024});assert.equal(r.status,0,'bounded local command failed');return r.stdout.trim();}
const db=process.env.TASK_11_4_VERIFIED_DB_CONTAINER_ID??'3f0a14e18d07b71e0b235dffcdc61e672086d6fb5b32b35849aa8bf54f3be3e4';
const inspected=JSON.parse(command('docker',['inspect',db]))[0];assert.equal(inspected.Config.Labels['com.supabase.cli.workdir'],dir);assert.equal(inspected.State.Status,'running');
const sql=q=>command('docker',['exec','-i',db,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],q);
assert.equal(sql(`select local_commerce.verify_project_identity('${project}','${prep.markerDigest}');`),'t');
const manifest=JSON.parse(readFileSync('local/commerce/migrations/manifest.json'));
assert.ok(manifest.schemaVersion>=18);
const ledger=JSON.parse(sql('select json_agg(json_build_object(\'version\',version,\'checksum\',checksum) order by version) from local_commerce.migration_ledger;'));
assert.equal(ledger.length,manifest.schemaVersion);for(const [i,m] of manifest.migrations.entries()){assert.equal(ledger[i].version,m.version);assert.equal(ledger[i].checksum,m.checksum);assert.equal(createHash('sha256').update(readFileSync(`local/commerce/migrations/${m.filename}`)).digest('hex'),m.checksum);}
const info=JSON.parse(command('node_modules/.bin/supabase',['status','--workdir',dir,'-o','json']));assert.equal(info.API_URL,c.endpoints.apiUrl);
const env={...process.env,...catalogTestEnvironment({LOCAL_COMMERCE_RUN_ID:run,LOCAL_COMMERCE_PROJECT_ID:project,LOCAL_COMMERCE_MARKER_DIGEST:prep.markerDigest,
 LOCAL_COMMERCE_SERVICE_ROLE_KEY:info.SERVICE_ROLE_KEY,CART_SOURCE:'local_persistent',CUSTOMER_AUTH_SOURCE:'local_persistent',LOCAL_CHECKOUT_SOURCE:'local_persistent',
 LOCAL_ORDER_SOURCE:'local_persistent',CUSTOMER_UPLOAD_SOURCE:'local_persistent',LOCAL_PAYMENT_SOURCE:'disabled',LOCAL_FULFILLMENT_SOURCE:'disabled',LOCAL_TRACKING_SOURCE:'disabled',ADMIN_ACCEPTANCE_SOURCE:'local_fake',
 LOCAL_COMMERCE_IMAGE_HELPER_SECRET:randomBytes(32).toString('base64url'),
 LOCAL_ORDER_CAPABILITY_SECRET:randomBytes(32).toString('hex'),LOCAL_ORDER_CAPABILITY_TTL_SECONDS:'3600',PHOTOGIFT_GUEST_DRAFT_OWNER_SECRET:randomBytes(48).toString('base64url'),PHOTOGIFT_GUEST_DRAFT_OWNER_CONTEXT_TTL_SECONDS:'3600'})};
for(const [k,v] of Object.entries({SHADOW_DB:c.ports.shadowDb,API:c.ports.api,DB:c.ports.db,STUDIO:c.ports.studio,SMTP:c.ports.smtp,IMAGE_HELPER:c.ports.imageHelper}))env[`LOCAL_COMMERCE_${k}_PORT`]=String(v);
for(const [k,v] of Object.entries({API:c.endpoints.apiUrl,RPC:c.endpoints.rpcUrl,STORAGE:c.endpoints.storageUrl,IMAGE_HELPER:c.endpoints.imageHelperUrl}))env[`LOCAL_COMMERCE_${k}_URL`]=v;
env.CLOUDFLARE_INCLUDE_PROCESS_ENV='true';env.WRANGLER_SEND_METRICS='false';env.WRANGLER_WRITE_LOGS='false';
if(process.argv.includes('--idempotency')) {
 const actualFetch=globalThis.fetch;
 globalThis.fetch=(url,options)=>{if(options?.method==='DELETE'&&String(url).includes('/storage/v1/'))throw Error('Task6.4 does not authorize Storage DELETE');return actualFetch(url,options);};
}
assert.equal((await new LocalCatalogAuthority(env).readSnapshot()).status,'found','Catalog preflight before any synthetic setup');
console.info('EXACT PROJECT CATALOG READ SNAPSHOT FOUND');
const port=c.ports.imageHelper+2,origin=`http://127.0.0.1:${port}`;
for(const freePort of [port,c.ports.imageHelper]) await new Promise((resolve,reject)=>{const s=createServer();s.once('error',reject);s.listen(freePort,'127.0.0.1',()=>s.close(resolve));});
let encoded=JSON.stringify(catalogDatabaseRows(project));for(const id of Object.values(ids))encoded=encoded.replaceAll(id,randomUUID());
const rows=JSON.parse(encoded),suffix=randomUUID().replaceAll('-','');
rows.products[0].fulfillment_definition.requiresProductionPreview=true;
rows.categories[0].slug=`order-acceptance-${suffix}`;rows.products[0].slug=`order-acceptance-${suffix}`;rows.variants[0].sku_code=`ORDER-ACCEPTANCE-${suffix}`;
rows.rules=rows.rules.filter(r=>r.definition.kind==='shipping');rows.rules[0].rule_key=`order-shipping-${suffix}`;rows.rules[0].definition.method=`order_${suffix}`;
if(process.argv.includes('--idempotency')) {
 const coupon=structuredClone(catalogDatabaseRows(project).rules[1]);coupon.id=randomUUID();coupon.rule_key=`order-coupon-${suffix}`;coupon.definition.code=`REPLAY${suffix.slice(0,12).toUpperCase()}`;rows.rules.push(coupon);
}
const headers={apikey:info.SERVICE_ROLE_KEY,authorization:`Bearer ${info.SERVICE_ROLE_KEY}`,'Content-Type':'application/json','Content-Profile':'local_commerce'};
const freshHistory=(cookie,selector)=>{
 const r=spawnSync(process.execPath,['tests/database/local-commerce-history-read-probe.mjs'],{input:JSON.stringify({cookie,selector,environment:env}),encoding:'utf8',timeout:15000});
 assert.equal(r.status,0,'fresh history probe must succeed without forbidden calls');return JSON.parse(r.stdout);
};
for(const [key,table] of Object.entries({categories:'catalog_categories',products:'catalog_products',variants:'catalog_variants',configurations:'catalog_configuration_snapshots',rules:'catalog_pricing_rules'})) {
 const r=await fetch(`${c.endpoints.apiUrl}/rest/v1/${table}`,{method:'POST',headers,body:JSON.stringify(rows[key]),signal:AbortSignal.timeout(5000)});assert.equal(r.status,201,`private synthetic ${key} setup`);await r.arrayBuffer();
}
const children=[];let logs='';
function start(args=['tests/database/local-commerce-test-worker.mjs',run,'--confirm-disposable',String(port)]){const p=spawn(process.execPath,args,{env,detached:true,stdio:['ignore','pipe','pipe']});children.push(p);for(const stream of [p.stdout,p.stderr])stream.on('data',b=>{logs=(logs+b.toString()).slice(-20000);});return p;}
async function stop(p){if(p.exitCode!==null||p.signalCode!==null)return;const done=new Promise(r=>p.once('exit',r));process.kill(-p.pid,'SIGTERM');await Promise.race([done,new Promise(r=>setTimeout(r,5000))]);if(p.exitCode===null&&p.signalCode===null){process.kill(-p.pid,'SIGKILL');await done;}}
async function ready(p){for(let i=0;i<40;i++){assert.equal(p.exitCode,null,'Worker exited');try{const r=await fetch(origin+'/api/customer-auth/session',{signal:AbortSignal.timeout(2000)});await r.arrayBuffer();if(r.status===200)return;}catch{/* bounded startup polling */}await new Promise(r=>setTimeout(r,500));}assert.fail('Worker readiness failed');}
let jar=new Map();const cookie=()=>[...jar].map(([k,v])=>`${k}=${v}`).join('; ');
function acceptCookies(r){for(const h of r.headers.getSetCookie()){const pair=h.split(';')[0],at=pair.indexOf('=');jar.set(pair.slice(0,at),pair.slice(at+1));}}
const send=(path,body,cookies=cookie())=>fetch(origin+path,{method:'POST',headers:{origin,cookie:cookies,'Content-Type':'application/json'},body:typeof body==='string'?body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
let owner;
const counts=()=>Object.fromEntries(['orders','order_items','order_purchase_snapshots','order_item_purchase_snapshots','order_item_receipt_bindings','access_grants','order_creation_bindings','payment_attempts'].map(t=>[t,Number(sql(`select count(*) from local_commerce.${t} where project_id='${project}' and owner_id='${owner}';`))]));
try {
 const a=start();await ready(a);assert.match(logs,/LOCAL_COMMERCE_WORKER_MODE_PROOF/);
 const handoff={productId:rows.products[0].id,variantId:rows.variants[0].id,skuCode:rows.variants[0].sku_code,selectedOptions:rows.variants[0].selected_options,configurationRevision:'1',customizationValues:[]};
 const cart=await send('/api/cart',{handoff});assert.equal(cart.status,200,'real Cart add');acceptCookies(cart);await cart.arrayBuffer();
 const second=await send('/api/cart',{handoff});assert.equal(second.status,200);acceptCookies(second);await second.arrayBuffer();
 const cartCookie=[...jar].find(([k])=>k.includes('cart'));assert.ok(cartCookie);const cartId=decodeURIComponent(cartCookie[1]);assert.match(cartId,/^[a-f0-9-]{36}$/);
 owner=sql(`select owner_id from local_commerce.carts where project_id='${project}' and id='${cartId}';`);assert.match(owner,/^[a-f0-9-]{36}$/);
 const payload=JSON.stringify({creationAttemptId:randomUUID(),email:'order-test@example.invalid',firstName:'Synthetic',lastName:'Acceptance',country:'US',city:'Test',addressLine1:'Synthetic test address',postalCode:'00000',shippingMethod:rows.rules[0].definition.method,...(rows.rules[1]?{couponCode:rows.rules[1].definition.code}:{})});
 const before=counts();const lostEstablishment=await send('/api/local-orders',payload);assert.equal(lostEstablishment.status,204);assert.equal(await lostEstablishment.text(),'');assert.deepEqual(counts(),before);
 // Do not accept the first cookie: simulate complete establishment-response loss.
 const established=await send('/api/local-orders',payload);assert.equal(established.status,204);assert.match(established.headers.get('set-cookie'),/HttpOnly/);acceptCookies(established);assert.equal(await established.text(),'');assert.deepEqual(counts(),before);
 console.info('HTTP ESTABLISHMENT PASS',JSON.stringify({status:204,purchaseRowsDelta:0}));
 const originalCookie=cookie();
 const committed=await send('/api/local-orders',payload);assert.equal(committed.status,200,'actual Order commit');assert.equal(committed.headers.get('set-cookie'),null);await committed.body.cancel();
 const after=counts();assert.equal(after.orders,before.orders+1);assert.equal(after.order_items,before.order_items+2);assert.equal(after.access_grants,before.access_grants+1);assert.equal(after.order_creation_bindings,before.order_creation_bindings+1);assert.equal(after.payment_attempts,before.payment_attempts);
 assert.equal(after.order_purchase_snapshots,before.order_purchase_snapshots+1);assert.equal(after.order_item_purchase_snapshots,before.order_item_purchase_snapshots+2);
 const immutableDigest=()=>sql(`select md5(coalesce(string_agg(row_to_json(s)::text,',' order by id),'')) from local_commerce.order_item_purchase_snapshots s where project_id='${project}' and owner_id='${owner}';`);
 const committedDigest=immutableDigest();
 const reference=sql(`select public_reference from local_commerce.orders where project_id='${project}' and owner_id='${owner}';`);assert.match(reference,/^FM-LOCAL-[A-Z0-9]{16}$/);
 const historicalOrderId=sql(`select id from local_commerce.orders where project_id='${project}' and public_reference='${reference}';`);
 const historicalItemId=sql(`select id from local_commerce.order_items where project_id='${project}' and order_id='${historicalOrderId}' order by item_sequence limit 1;`);
 const historySelector={orderId:historicalOrderId,orderItemId:historicalItemId,publicReference:reference};
 const historicalRead=(cookies=originalCookie,selector=historySelector)=>readPersistentOrderHistory(new Request(origin,{headers:{cookie:cookies}}),selector,env);
 const history=await historicalRead();assert.equal(history.status,'found','canonical read in independent Node process after Worker commit');assert.equal(history.value.purchasedItem.fulfillment.requiresProductionPreview,true);
 const freshBefore=freshHistory(originalCookie,historySelector);assert.equal(freshBefore.model.status,'found');assert.equal(freshBefore.projections.supplier.status,'unavailable');
 const expiredToken=await (await createPersistentOrderCapabilityCodec(env,{projectId:project,markerDigest:prep.markerDigest})).issue(Math.floor(Date.now()/1000)-7200);
 assert.equal((await historicalRead(originalCookie.replace(/figmemento-local-order-access=[^;]+/,'figmemento-local-order-access='+expiredToken))).status,'unavailable');
 const foreignContext=await ensureGuestResourceOwner({projectId:project,context:null,ownerService:createConfiguredGuestDraftOwnerService(env)});assert.equal(foreignContext.status,'issued');
 const foreignGuestCookie=originalCookie.split('; ').filter(x=>!x.startsWith(getGuestDraftOwnerCookieName()+'=')).concat(getGuestDraftOwnerCookieName()+'='+encodeURIComponent(foreignContext.context)).join('; ');
 assert.equal((await historicalRead(foreignGuestCookie)).status,'unavailable');
 const access=await (await createPersistentOrderCapabilityCodec(env,{projectId:project,markerDigest:prep.markerDigest})).verify(decodeURIComponent(originalCookie.split('; ').find(x=>x.startsWith('figmemento-local-order-access=')).split('=')[1]),Math.floor(Date.now()/1000));assert.ok(access);
 await verifyHistorySecurity({sql,info,api:c.endpoints.apiUrl,base:{p_project_id:project,p_marker_digest:prep.markerDigest,p_owner_kind:'guest',p_owner_selector:sql(`select subject_hash from local_commerce.commerce_owners where project_id='${project}' and id='${owner}';`),p_customer_id:null,p_session_hash:null,p_authority_expires_at:new Date(Date.now()+600000).toISOString(),p_capability_hash:access.digest,p_order_id:historicalOrderId,p_public_reference:reference,p_order_item_id:historicalItemId,p_projection:'canonical_item'}});
 // Only this run's newly created synthetic Product/Variant: committed replay
 // must not consult the changed current Catalog or recompute the purchase.
 sql(`update local_commerce.catalog_products set name='Changed synthetic title',version=version+1 where project_id='${project}' and id='${rows.products[0].id}'; update local_commerce.catalog_variants set price_cents=2600,version=version+1 where project_id='${project}' and id='${rows.variants[0].id}';`);
 await stop(a);logs='';const b=start();await ready(b);assert.notEqual(a.pid,b.pid);
 const replay=await send('/api/local-orders',payload,originalCookie);assert.equal(replay.status,200);assert.equal(replay.headers.get('set-cookie'),null);assert.deepEqual(await replay.json(),{publicReference:reference});assert.deepEqual(counts(),after);
 assert.equal(immutableDigest(),committedDigest);
 assert.deepEqual(await historicalRead(),history,'restart and Catalog drift history');
 const freshAfter=freshHistory(originalCookie,historySelector);assert.notEqual(freshAfter.pid,freshBefore.pid);assert.deepEqual(freshAfter.canonical,freshBefore.canonical);assert.deepEqual(freshAfter.summary,freshBefore.summary);assert.deepEqual(freshAfter.projections,freshBefore.projections);
 console.info('6.5 FRESH HISTORY PROCESS / CATALOG OUTAGE SENTINEL / ZERO STORAGE PASS',JSON.stringify({pids:[freshBefore.pid,freshAfter.pid],catalogCalls:freshAfter.catalog,storageCalls:freshAfter.storage}));
 const summary=await fetch(origin+`/api/local-orders/${reference}`,{headers:{cookie:originalCookie},signal:AbortSignal.timeout(5000)});assert.equal(summary.status,200);const safe=await summary.json();assert.equal(safe.publicReference,reference);assert.equal(safe.lines.length,2);assert.ok(!/requiresProductionPreview|capability|ownerId|receiptId|locator/.test(JSON.stringify(safe)));
 assert.equal((await historicalRead('',historySelector)).status,'unavailable');
 assert.equal((await historicalRead(originalCookie,{...historySelector,orderItemId:randomUUID()})).status,'unavailable');
 assert.equal((await historicalRead(originalCookie,{...historySelector,orderId:randomUUID()})).status,'unavailable');
 console.info('6.5 CANONICAL HISTORY / EXACT ITEM / RESTART / CATALOG DRIFT / SAFE HTTP SUMMARY PASS');
 if(process.argv.includes('--idempotency')) {
  for(const patch of [{email:'changed@example.invalid'},{firstName:'Changed'},{addressLine1:'Changed address'},{shippingMethod:'different-method'},{couponCode:'DIFFERENT'}]) {
   const denied=await send('/api/local-orders',{...JSON.parse(payload),...patch},originalCookie);assert.equal(denied.status,409,'changed normalized context');await denied.arrayBuffer();assert.deepEqual(counts(),after);assert.equal(immutableDigest(),committedDigest);
  }
  const otherKey=await send('/api/local-orders',{...JSON.parse(payload),creationAttemptId:randomUUID()},originalCookie);assert.ok([409,503].includes(otherKey.status));await otherKey.arrayBuffer();assert.deepEqual(counts(),after);
  const bindings=sql(`select coalesce(json_agg(b)::text,'[]') from local_commerce.order_creation_bindings b where project_id='${project}' and owner_id='${owner}';`);
  for(const value of originalCookie.split('; ').map(x=>decodeURIComponent(x.slice(x.indexOf('=')+1)))) if(value.length>48)assert.ok(!bindings.includes(value));
  assert.ok(!/password|session_token|storage_locator|cookie/i.test(bindings));
  console.info('6.4 CONTACT/ADDRESS/SHIPPING/COUPON CONFLICT; DIFFERENT KEY REJECT; 7-TABLE COUNT/SNAPSHOT INVARIANTS; RAW CREDENTIAL ABSENCE PASS');
 }
 console.info('REAL WORKER RESTART REPLAY PASS',JSON.stringify({processA:a.pid,processB:b.pid,status:200,countsUnchanged:true,publicReference:reference}));
 const forged=originalCookie.replace(/figmemento-local-order-access=[^;]+/,'figmemento-local-order-access=forged');
 const replaced=await send('/api/local-orders',payload,forged);assert.equal(replaced.status,204);acceptCookies(replaced);assert.deepEqual(counts(),after);
 const denied=await send('/api/local-orders',payload);assert.equal(denied.status,503);await denied.arrayBuffer();assert.deepEqual(counts(),after);
 console.info('REPLACEMENT CAPABILITY CLAIM REJECTED PASS');
 jar=new Map(originalCookie.split('; ').map(pair=>{const at=pair.indexOf('=');return[pair.slice(0,at),pair.slice(at+1)];}));
 const signup=await send('/api/customer-auth/sign-up',{email:`order-${suffix}@example.invalid`,password:'Synthetic-acceptance-password-42!'});assert.equal(signup.status,200,'real member signup');acceptCookies(signup);await signup.arrayBuffer();
 const guestWithMember=await send('/api/local-orders',payload);assert.equal(guestWithMember.status,200);assert.deepEqual(await guestWithMember.json(),{publicReference:reference});assert.deepEqual(counts(),after);
 assert.equal(sql(`select owner_kind from local_commerce.commerce_owners where project_id='${project}' and id='${owner}';`),'guest');
 const memberCookie=signup.headers.getSetCookie()[0].split(';')[0],split=memberCookie.indexOf('=');
 jar=new Map([[memberCookie.slice(0,split),memberCookie.slice(split+1)]]);
 const memberCart=await send('/api/cart',{handoff});assert.equal(memberCart.status,200);acceptCookies(memberCart);await memberCart.arrayBuffer();
 const memberCartId=decodeURIComponent([...jar].find(([k])=>k.includes('cart'))[1]);assert.match(memberCartId,/^[a-f0-9-]{36}$/);
 const memberOwner=sql(`select owner_id from local_commerce.carts where project_id='${project}' and id='${memberCartId}';`);assert.match(memberOwner,/^[a-f0-9-]{36}$/);
 assert.equal(sql(`select owner_kind from local_commerce.commerce_owners where project_id='${project}' and id='${memberOwner}';`),'customer');
 const memberPayload=JSON.stringify({...JSON.parse(payload),creationAttemptId:randomUUID()});
 const memberGate=await send('/api/local-orders',memberPayload);assert.equal(memberGate.status,204);acceptCookies(memberGate);
 const memberOrder=await send('/api/local-orders',memberPayload);assert.equal(memberOrder.status,200,'member-owned Cart Order');await memberOrder.arrayBuffer();
 const staleSessionCookie=cookie();
 const memberReference=sql(`select public_reference from local_commerce.orders where project_id='${project}' and owner_id='${memberOwner}';`);
 const memberOrderId=sql(`select id from local_commerce.orders where project_id='${project}' and owner_id='${memberOwner}';`);
 const memberItemId=sql(`select id from local_commerce.order_items where project_id='${project}' and order_id='${memberOrderId}' limit 1;`);
 const memberSelector={orderId:memberOrderId,orderItemId:memberItemId,publicReference:memberReference};
 assert.equal((await historicalRead(staleSessionCookie,memberSelector)).status,'found','fresh member canonical read');
 const otherMember=await send('/api/customer-auth/sign-up',{email:`other-${suffix}@example.invalid`,password:'Synthetic-acceptance-password-42!'},'');assert.equal(otherMember.status,200);await otherMember.arrayBuffer();
 const otherSession=otherMember.headers.getSetCookie()[0].split(';')[0];
 const sessionName=otherSession.slice(0,otherSession.indexOf('='));
 const otherMemberCookie=staleSessionCookie.split('; ').filter(x=>!x.startsWith(sessionName+'=')).concat(otherSession).join('; ');
 assert.equal((await historicalRead(otherMemberCookie,memberSelector)).status,'unavailable','foreign member cannot reuse original Order capability');
 assert.equal((await historicalRead(originalCookie,{...historySelector,orderItemId:memberItemId})).status,'unavailable','cross Order exact pairing');
 assert.equal((await historicalRead(staleSessionCookie,historySelector)).status,'unavailable','member cannot claim guest history');
 const logout=await send('/api/customer-auth/sign-out',{});assert.equal(logout.status,200);await logout.arrayBuffer();
 assert.equal((await historicalRead(staleSessionCookie,memberSelector)).status,'unavailable','revoked member history');
 const revokedReplay=await send('/api/local-orders',memberPayload,staleSessionCookie);assert.equal(revokedReplay.status,503);await revokedReplay.arrayBuffer();
 console.info('CATALOG DRIFT / GUEST+MEMBER SEPARATION / MEMBER CREATE / DURABLE REVOKE PASS');
 // Independent, server-verified guest and newly named image Product fixture.
 // Real helper/Storage receipt, then explicit durable Draft confirmation.
 let imageEncoded=JSON.stringify(rows);
 for(const id of new Set(imageEncoded.match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/g))) imageEncoded=imageEncoded.replaceAll(id,randomUUID());
 const imageRows=JSON.parse(imageEncoded),imageSuffix=randomUUID().replaceAll('-','');
 imageRows.rules=imageRows.rules.filter(r=>r.definition.kind==='shipping');
 imageRows.categories[0].slug=`image-order-${imageSuffix}`;imageRows.products[0].slug=`image-order-${imageSuffix}`;imageRows.variants[0].sku_code=`IMAGE-ORDER-${imageSuffix}`;
 imageRows.rules[0].rule_key=`image-shipping-${imageSuffix}`;imageRows.rules[0].definition.method=`image_${imageSuffix}`;
 const field=imageRows.configurations[0].definition.fields[0];
 Object.assign(field,{code:'photo',label:'Photo',kind:'image',required:true,constraints:{allowedMimeTypes:['image/png'],maxBytes:1048576,minDimensions:{width:1,height:1},minImageCount:1,maxImageCount:1,cropEnabled:true}});
 if(process.argv.includes('--idempotency'))field.constraints.maxImageCount=2;
 for(const [key,table] of Object.entries({categories:'catalog_categories',products:'catalog_products',variants:'catalog_variants',configurations:'catalog_configuration_snapshots',rules:'catalog_pricing_rules'})) {
  const r=await fetch(`${c.endpoints.apiUrl}/rest/v1/${table}`,{method:'POST',headers,body:JSON.stringify(imageRows[key]),signal:AbortSignal.timeout(5000)});assert.equal(r.status,201);await r.arrayBuffer();
 }
 const ownerService=createConfiguredGuestDraftOwnerService(env);
 const guest=await ensureGuestResourceOwner({projectId:project,context:null,ownerService});assert.equal(guest.status,'issued');
 const verifyOwner=async()=>{const r=await resolveGuestResourceOwner({projectId:project,context:guest.context,ownerService});return r.status==='authorized'?{owner:r.owner,expiresAt:r.owner.expiresAt}:null;};
 const draft=await createLocalPersistentDraftPort({environment:env,verifyOwner});assert.equal(draft.status,'ready');
 const created=await draft.port.create({authority:draft.authority,expectedVersion:0,idempotency:{key:randomUUID(),fingerprint:'image-order-create'},productId:imageRows.products[0].id});assert.equal(created.status,'found');
 const helper=start(['local/commerce/image-helper/server.mjs']);
 await new Promise(r=>setTimeout(r,1000));assert.equal(helper.exitCode,null);
 const sharp=createRequire(`${process.cwd()}/local/commerce/image-helper/package.json`)('sharp');
 const bytes=await sharp({create:{width:12,height:8,channels:3,background:'#ac7053'}}).png().toBuffer();
 const media=createLocalPersistentMediaAuthority(env,verifyOwner);
 const historyCrop=process.argv.includes('--idempotency')?{x:0,y:0,width:0.5,height:0.5}:undefined;
 const cropFacts=historyCrop?{crop:historyCrop}:{};
 const accepted=await media.accept({draftId:created.value.draftId,expectedVersion:created.value.version,fieldId:field.id,bytes,...cropFacts});assert.equal(accepted.status,'found','real helper/Storage acceptance');
 const saved=await draft.port.save({authority:draft.authority,draftId:created.value.draftId,expectedVersion:created.value.version,idempotency:{key:randomUUID(),fingerprint:'image-order-save'},slots:[{slotId:accepted.slotId,fieldId:field.id,receiptReference:accepted.receipt.receiptId,...cropFacts}]});assert.equal(saved.status,'found');
 jar=new Map([[getGuestDraftOwnerCookieName(),encodeURIComponent(guest.context)]]);
 const imageHandoff={productId:imageRows.products[0].id,variantId:imageRows.variants[0].id,skuCode:imageRows.variants[0].sku_code,selectedOptions:imageRows.variants[0].selected_options,configurationRevision:'1',customizationValues:[{fieldId:field.id,fieldCode:'photo',kind:'image',images:[{receiptId:accepted.receipt.receiptId,...cropFacts}]}]};
 const imageCart=await send('/api/cart',{handoff:imageHandoff});assert.equal(imageCart.status,200,'real image Cart add');acceptCookies(imageCart);await imageCart.arrayBuffer();
 const imagePayload=JSON.stringify({...JSON.parse(payload),creationAttemptId:randomUUID(),shippingMethod:imageRows.rules[0].definition.method});
 const imageGate=await send('/api/local-orders',imagePayload);assert.equal(imageGate.status,204);acceptCookies(imageGate);
 const imageOrder=await send('/api/local-orders',imagePayload);assert.equal(imageOrder.status,200,'real ready image Order commit');
 const imageReference=(await imageOrder.json()).publicReference;assert.match(imageReference,/^FM-LOCAL-[A-Z0-9]{16}$/);
 assert.equal(sql(`select count(*) from local_commerce.order_item_receipt_bindings b join local_commerce.media_receipts r on r.project_id=b.project_id and r.id=b.receipt_id where r.project_id='${project}' and r.receipt_reference='${accepted.receipt.receiptId}';`),'1');
 console.info('REAL PRIVATE STORAGE RECEIPT → DRAFT → CART → ORDER PASS',JSON.stringify({status:200,receiptBindings:1,publicReference:imageReference}));
 const imageId=sql(`select id from local_commerce.orders where project_id='${project}' and public_reference='${imageReference}';`);
 const imageItemId=sql(`select id from local_commerce.order_items where project_id='${project}' and order_id='${imageId}' limit 1;`);
 const imageHistory=freshHistory(cookie(),{orderId:imageId,orderItemId:imageItemId,publicReference:imageReference});assert.equal(imageHistory.model.status,'found');
 assert.deepEqual(imageHistory.model.value.media,[{receiptId:accepted.receipt.receiptId,fieldId:field.id,fieldCode:'photo',position:0,...cropFacts}]);
 const previewUrl=origin+'/api/customer-uploads/preview?receiptId='+accepted.receipt.receiptId;
 const orderCookieOnly=cookie().split('; ').filter(x=>x.startsWith('figmemento-local-order-access=')).join('; ');
 const byteDenied=await fetch(previewUrl,{headers:{cookie:orderCookieOnly},signal:AbortSignal.timeout(5000)});assert.ok([403,404,503].includes(byteDenied.status));await byteDenied.arrayBuffer();
 const byteAllowed=await fetch(previewUrl,{headers:{cookie:cookie()},signal:AbortSignal.timeout(5000)});assert.equal(byteAllowed.status,200);assert.ok((await byteAllowed.arrayBuffer()).byteLength>0);
 console.info('6.5 IMAGE HISTORY / ZERO STORAGE / RECEIPT DOES NOT GRANT BYTES PASS',JSON.stringify({denied:byteDenied.status,authorized:200}));
 if(process.argv.includes('--copy')) {
  const target=await draft.port.create({authority:draft.authority,expectedVersion:0,idempotency:{key:randomUUID(),fingerprint:'copy-target'},productId:imageRows.products[0].id});assert.equal(target.status,'found');
  const request={sourceReceiptId:accepted.receipt.receiptId,targetDraftId:target.value.draftId,expectedVersion:target.value.version,idempotencyKey:randomUUID()};
  const copied=await media.copy(request);assert.equal(copied.status,'found','real private Storage copy');
  assert.notEqual(copied.receipt.receiptId,accepted.receipt.receiptId);assert.notEqual(copied.operationId,accepted.operationId);assert.notEqual(copied.slotId,accepted.slotId);
  assert.deepEqual(await media.copy(request),copied,'exact copy replay');
  assert.equal((await media.copy({...request,expectedVersion:request.expectedVersion+1})).status,'conflict');
  const unchanged=await draft.port.read({authority:draft.authority,draftId:target.value.draftId});assert.equal(unchanged.status,'found');assert.deepEqual(unchanged.value,target.value,'copy does not confirm Draft');
  const sourceBytes=await media.read(accepted.receipt.receiptId),copyBytes=await media.read(copied.receipt.receiptId);assert.equal(sourceBytes.status,'found');assert.equal(copyBytes.status,'found');assert.deepEqual(copyBytes.bytes,sourceBytes.bytes);
  const provenance=JSON.parse(sql(`select json_build_object('sameOriginal',s.original_object_id=t.original_object_id,'differentDerivative',s.derivative_locator<>t.derivative_locator,'bindingCount',(select count(*) from local_commerce.media_copy_bindings b where b.project_id=t.project_id and b.target_operation_id=t.id and b.source_receipt_id=s.receipt_id)) from local_commerce.media_operations s join local_commerce.media_operations t on t.project_id=s.project_id where s.project_id='${project}' and s.id='${accepted.operationId}' and t.id='${copied.operationId}';`));assert.deepEqual(provenance,{sameOriginal:true,differentDerivative:true,bindingCount:1});
  const confirmed=await draft.port.save({authority:draft.authority,draftId:target.value.draftId,expectedVersion:target.value.version,idempotency:{key:randomUUID(),fingerprint:'explicit-copy-confirmation'},slots:[{slotId:copied.slotId,fieldId:field.id,receiptReference:copied.receipt.receiptId}]});assert.equal(confirmed.status,'found','ordinary Draft CAS confirms copied slot');
  console.info('REAL COPY / STORAGE BYTE READBACK / PROVENANCE / IDEMPOTENCY / EXPLICIT DRAFT CAS PASS');
  const foreign=await ensureGuestResourceOwner({projectId:project,context:null,ownerService});assert.equal(foreign.status,'issued');
  const foreignVerifier=async()=>{const r=await resolveGuestResourceOwner({projectId:project,context:foreign.context,ownerService});return r.status==='authorized'?{owner:r.owner,expiresAt:r.owner.expiresAt}:null;};
  assert.equal((await createLocalPersistentMediaAuthority(env,foreignVerifier).copy({...request,idempotencyKey:randomUUID()})).status,'unavailable');
  assert.equal((await createLocalPersistentMediaAuthority(env,async()=>{const v=await verifyOwner();return {...v,expiresAt:1};}).copy(request)).status,'unavailable');
  assert.equal((await media.copy({...request,targetDraftId:created.value.draftId})).status,'conflict');
  // A fresh Cart, same verified guest: copied receipt is a distinct purchase.
  for(const key of [...jar.keys()])if(key.includes('cart'))jar.delete(key);
  const copiedHandoff={...imageHandoff,customizationValues:[{fieldId:field.id,fieldCode:'photo',kind:'image',images:[{receiptId:copied.receipt.receiptId}]}]};
  const added=await send('/api/cart',{handoff:copiedHandoff});assert.equal(added.status,200);acceptCookies(added);const publicCart=await added.json();
  const lineId=publicCart.lines[0].lineId;assert.match(lineId,/^[a-f0-9-]{36}$/);
  const quantity=await fetch(origin+'/api/cart/items/'+lineId,{method:'PATCH',headers:{origin,cookie:cookie(),'Content-Type':'application/json'},body:JSON.stringify({quantity:3}),signal:AbortSignal.timeout(10000)});assert.equal(quantity.status,200);await quantity.arrayBuffer();
  const secondPort=port+1;await new Promise((resolve,reject)=>{const s=createServer();s.once('error',reject);s.listen(secondPort,'127.0.0.1',()=>s.close(resolve));});
  const peer=start(['tests/database/local-commerce-test-worker.mjs',run,'--confirm-disposable',String(secondPort)]),peerOrigin=`http://127.0.0.1:${secondPort}`;
  let peerReady=false;for(let i=0;i<40&&!peerReady;i++){try{const r=await fetch(peerOrigin+'/api/customer-auth/session',{signal:AbortSignal.timeout(1500)});await r.arrayBuffer();peerReady=r.status===200;}catch{/* bounded startup */}if(!peerReady)await new Promise(r=>setTimeout(r,250));}assert.ok(peerReady);assert.equal(b.exitCode,null);assert.equal(peer.exitCode,null);
  const body={...JSON.parse(imagePayload),creationAttemptId:randomUUID()};
  const claim=spawn(process.execPath,['tests/database/local-commerce-cleanup-claim-probe.mjs'],{env,stdio:['pipe','pipe','pipe']});
  let claimOutput='';claim.stdout.on('data',b=>claimOutput+=b);
  const claimed=new Promise((resolve,reject)=>{claim.once('error',reject);claim.once('exit',code=>{try{assert.equal(code,0);resolve(JSON.parse(claimOutput));}catch(e){reject(e);}});});
  claim.stdin.end(JSON.stringify({api:c.endpoints.apiUrl,headers,args:{p_project_id:project,p_marker_digest:prep.markerDigest,p_operation_id:copied.operationId,p_resource:'original',p_command:'claim',p_lease_token:null}}));
  const responses=await Promise.all([send('/api/local-orders',body),fetch(peerOrigin+'/api/local-orders',{method:'POST',headers:{origin:peerOrigin,cookie:cookie(),'Content-Type':'application/json'},body:JSON.stringify({...body,creationAttemptId:randomUUID()}),signal:AbortSignal.timeout(15000)})]);
  const cleanupResult=await claimed;assert.equal(cleanupResult.status,'retained');assert.equal(cleanupResult.storageRequests,0);
  console.info('6.7 LIVE ATTACH / CLEANUP CLAIM COMPETITION PASS',JSON.stringify({orderPids:[b.pid,peer.pid],cleanup:cleanupResult}));
  assert.equal(responses.filter(r=>r.status===200).length,1);assert.ok(responses.every(r=>[200,409,503].includes(r.status)));for(const r of responses)await r.arrayBuffer();
  const attached=JSON.parse(sql(`select json_build_object('bindings',count(*),'quantity',max(i.quantity)) from local_commerce.order_item_receipt_bindings x join local_commerce.media_receipts r on r.project_id=x.project_id and r.id=x.receipt_id join local_commerce.order_item_purchase_snapshots i on i.project_id=x.project_id and i.order_item_id=x.order_item_id where r.project_id='${project}' and r.receipt_reference='${copied.receipt.receiptId}';`));assert.deepEqual(attached,{bindings:1,quantity:3});
  const retained=JSON.parse(sql(`select local_commerce.media_cleanup_command('${project}','${prep.markerDigest}','${copied.operationId}','original','claim',null);`));assert.equal(retained.status,'retained');
  console.info('REAL TWO-LIVE-WORKER ORDER COMPETITION / QUANTITY 3 SINGLE ATTACH / RETAINED CLEANUP REJECTION PASS',JSON.stringify({processA:b.pid,processB:peer.pid,statuses:responses.map(r=>r.status)}));
 }
 if(process.argv.includes('--cleanup')) {
  const memberVerifiers=[];
  for(let n=0;n<2;n++) {
   const response=await send('/api/customer-auth/sign-up',{email:`copy-${randomUUID()}@example.invalid`,password:'Synthetic-copy-password-42!'},'');assert.equal(response.status,200);await response.arrayBuffer();
   const memberCookies=response.headers.getSetCookie().map(h=>h.split(';')[0]).join('; ');
   memberVerifiers.push(persistentOwnerVerifier(new Request(origin+'/api/customer-auth/session',{headers:{cookie:memberCookies}}),env));
  }
  const prepareAttach=async({d,r})=>{
   const confirmed=await draft.port.save({authority:draft.authority,draftId:d.draftId,expectedVersion:d.version,idempotency:{key:randomUUID(),fingerprint:'cleanup-attach-admission'},slots:[{slotId:r.slotId,fieldId:field.id,receiptReference:r.receipt.receiptId}]});assert.equal(confirmed.status,'found');
   jar=new Map([[getGuestDraftOwnerCookieName(),encodeURIComponent(guest.context)]]);
   const added=await send('/api/cart',{handoff:{...imageHandoff,customizationValues:[{fieldId:field.id,fieldCode:'photo',kind:'image',images:[{receiptId:r.receipt.receiptId}]}]}});assert.equal(added.status,200);acceptCookies(added);await added.arrayBuffer();
   const request={...JSON.parse(imagePayload),creationAttemptId:randomUUID()};
   const gate=await send('/api/local-orders',request);assert.equal(gate.status,204);acceptCookies(gate);
   const resourceOwner=sql(`select owner_id from local_commerce.media_operations where project_id='${project}' and id='${r.operationId}';`);assert.match(resourceOwner,/^[a-f0-9-]{36}$/);
   const purchaseRows=()=>['orders','order_items','access_grants','order_creation_bindings'].map(t=>sql(`select count(*) from local_commerce.${t} where project_id='${project}' and owner_id='${resourceOwner}';`));
   const before=purchaseRows();
   return {version:confirmed.value.version,reject:async()=>{const denied=await send('/api/local-orders',request);assert.ok([409,503].includes(denied.status));await denied.arrayBuffer();assert.deepEqual(purchaseRows(),before);}};
  };
  await verifyCopyCleanup({env,c,prep,media,draft,bytes,field,productId:imageRows.products[0].id,verifyOwner,memberVerifiers,wrongProductId:rows.products[0].id,prepareAttach,guestCookie:`${getGuestDraftOwnerCookieName()}=${encodeURIComponent(guest.context)}`,task114Only:process.argv.includes('--task-11.4-h'),task115Only:process.argv.includes('--task-11.5-cleanup')});
 }
 if(process.argv.includes('--idempotency')) {
  const freshCart=async()=>{
   const clean=originalCookie.split('; ').filter(x=>!x.startsWith(cartCookie[0]+'=')).join('; ');
   const r=await send('/api/cart',{handoff},clean);assert.equal(r.status,200);const body=await r.json();
   const cookies=new Map(clean.split('; ').map(x=>{const i=x.indexOf('=');return[x.slice(0,i),x.slice(i+1)];}));
   for(const h of r.headers.getSetCookie()){const pair=h.split(';')[0],i=pair.indexOf('=');cookies.set(pair.slice(0,i),pair.slice(i+1));}
   return {cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; '),body};
  };
  const postAt=(where,body,cookie)=>fetch(where+'/api/local-orders',{method:'POST',headers:{origin:where,cookie,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
  const awaitPeer=async(p,where)=>{for(let n=0;n<50;n++){assert.equal(p.exitCode,null);try{const r=await fetch(where+'/api/customer-auth/session',{signal:AbortSignal.timeout(1000)});await r.arrayBuffer();if(r.status===200)return;}catch{/* bounded startup */}await new Promise(r=>setTimeout(r,200));}assert.fail('peer readiness');};
  const peerPort=port+1,peerOrigin=`http://127.0.0.1:${peerPort}`;
  await new Promise((resolve,reject)=>{const s=createServer();s.once('error',reject);s.listen(peerPort,'127.0.0.1',()=>s.close(resolve));});
  const peer=start(['tests/database/local-commerce-test-worker.mjs',run,'--confirm-disposable',String(peerPort)]);await awaitPeer(peer,peerOrigin);
  for(const sameKey of [true,false]) {
   const f=await freshCart(),request={...JSON.parse(payload),creationAttemptId:randomUUID()},before=counts();
   assert.equal(b.exitCode,null);assert.equal(peer.exitCode,null);
   const responses=await Promise.all([postAt(origin,request,f.cookie),postAt(peerOrigin,sameKey?request:{...request,creationAttemptId:randomUUID()},f.cookie)]);
   const values=await Promise.all(responses.map(r=>r.json()));
   assert.equal(counts().orders,before.orders+1);
   if(sameKey){assert.deepEqual(responses.map(r=>r.status),[200,200]);assert.deepEqual(values[0],values[1]);}
   else {assert.equal(responses.filter(r=>r.status===200).length,1);assert.ok(responses.every(r=>[200,409,503].includes(r.status)));}
   console.info('6.4 TWO LIVE INSTANCES PASS',JSON.stringify({pids:[b.pid,peer.pid],sameKey,statuses:responses.map(r=>r.status),newOrders:1}));
  }
  await stop(peer);
  if(process.argv.includes('--race-window')) {
   const delayed=start(['tests/database/local-commerce-test-worker.mjs',run,'--confirm-disposable',String(peerPort),'commit-race-window']);await awaitPeer(delayed,peerOrigin);
   for(const kind of ['Cart','Product','shipping','coupon']) {
    const f=await freshCart(),request={...JSON.parse(payload),creationAttemptId:randomUUID()},before=counts();
    logs='';const pending=postAt(peerOrigin,request,f.cookie);
    for(let n=0;n<250&&!logs.includes('ORDER_ACCEPTANCE_RACE_WINDOW');n++)await new Promise(r=>setTimeout(r,20));
    assert.match(logs,/ORDER_ACCEPTANCE_RACE_WINDOW/,'actual Worker must have resolved facts before mutation');
    assert.equal(b.exitCode,null);assert.equal(delayed.exitCode,null);
    if(kind==='Cart') {
     const r=await fetch(origin+'/api/cart/items/'+f.body.lines[0].lineId,{method:'PATCH',headers:{origin,cookie:f.cookie,'Content-Type':'application/json'},body:JSON.stringify({quantity:2}),signal:AbortSignal.timeout(5000)});assert.equal(r.status,200);await r.arrayBuffer();
    } else if(kind==='Product') {
     sql(`update local_commerce.catalog_products set name='Concurrent synthetic Product',version=version+1 where project_id='${project}' and id='${rows.products[0].id}';`);
    } else {
     const row=rows.rules[kind==='shipping'?0:1],field=kind==='shipping'?'amountCents':'discountValue';
     sql(`update local_commerce.catalog_pricing_rules set definition=jsonb_set(definition,'{${field}}',to_jsonb((definition->>'${field}')::integer+1)),version=version+1 where project_id='${project}' and id='${row.id}';`);
    }
    const r=await pending;assert.ok([409,503].includes(r.status),`${kind} stale commit must reject, got ${r.status}`);await r.arrayBuffer();assert.deepEqual(counts(),before,'no half Order/item/grant/payment');
    console.info('6.7 REAL PRECOMMIT VERSION RACE PASS',JSON.stringify({kind,pids:[b.pid,delayed.pid],status:r.status,rowsUnchanged:true,writer:kind==='Cart'?'other Worker HTTP':'separate psql process / private synthetic fixture only'}));
   }
   await stop(delayed);
  }
  for(const fault of ['before-probe','probe-loss','before-commit','commit-loss']) {
   const f=await freshCart(),request={...JSON.parse(payload),creationAttemptId:randomUUID()},before=counts();logs='';
   const injected=start(['tests/database/local-commerce-test-worker.mjs',run,'--confirm-disposable',String(peerPort),fault]);await awaitPeer(injected,peerOrigin);
   const response=await postAt(peerOrigin,request,f.cookie);assert.equal(response.status,503);await response.arrayBuffer();
   assert.ok(logs.includes('ORDER_ACCEPTANCE_FAULT_REACHED:'+fault),'exact injected point reached');
   if(fault==='probe-loss')assert.match(logs,/ORDER_ACCEPTANCE_FAULT_REACHED:probe-loss:transport/);
   assert.equal(counts().orders,before.orders+(fault==='commit-loss'?1:0));
   await stop(injected);
   const replay=await postAt(origin,request,f.cookie);assert.equal(replay.status,200);const value=await replay.json();assert.match(value.publicReference,/^FM-LOCAL-[A-Z0-9]{16}$/);
   const after=counts();assert.equal(after.orders,before.orders+1);
   const again=await postAt(origin,request,f.cookie);assert.equal(again.status,200);assert.deepEqual(await again.json(),value);assert.deepEqual(counts(),after);
   console.info('6.4 REAL WORKER FAULT / RETRY PASS',JSON.stringify({fault,injectedPid:injected.pid,retryPid:b.pid,newOrders:1}));
  }
  for(const kind of ['guest','capability']) {
   // Original, legitimately issued short-lived server credentials: commit
   // while valid, then allow natural expiry. No timestamp/DB-row repair.
   const shortGuest=await createGuestDraftOwnerService({signingSecret:env.PHOTOGIFT_GUEST_DRAFT_OWNER_SECRET,contextLifetimeSeconds:kind==='guest'?8:3600}).issueGuestDraftOwner();assert.equal(shortGuest.status,'issued');
   const codec=await createPersistentOrderCapabilityCodec({...env,LOCAL_ORDER_CAPABILITY_TTL_SECONDS:kind==='capability'?'8':'3600'},{projectId:project,markerDigest:prep.markerDigest});assert.ok(codec);
   const issuedAt=Math.floor(Date.now()/1000),cap=await codec.issue(issuedAt);
   let freshCookie=`${getGuestDraftOwnerCookieName()}=${encodeURIComponent(shortGuest.value.context)}; figmemento-local-order-access=${cap}`;
   const cartResponse=await send('/api/cart',{handoff},freshCookie);assert.equal(cartResponse.status,200);await cartResponse.arrayBuffer();
   const pair=cartResponse.headers.getSetCookie().map(h=>h.split(';')[0]).find(h=>h.startsWith(cartCookie[0]+'='));assert.ok(pair);freshCookie+='; '+pair;
   const request={...JSON.parse(payload),creationAttemptId:randomUUID()};
   const made=await send('/api/local-orders',request,freshCookie);assert.equal(made.status,200);await made.arrayBuffer();
   const hash=createHash('sha256').update(request.creationAttemptId).digest('hex');
   const bound=()=>sql(`select row_to_json(g)::text from local_commerce.access_grants g join local_commerce.order_creation_bindings b on b.project_id=g.project_id and b.order_id=g.resource_id where b.project_id='${project}' and b.key_digest='${hash}';`);
   const before=bound();assert.ok(before);
   const expiry=kind==='guest'?shortGuest.value.expiresAt:issuedAt+8;
   await new Promise(r=>setTimeout(r,Math.max(0,expiry*1000-Date.now()+80)));
   const denied=await send('/api/local-orders',request,freshCookie);assert.equal(denied.status,kind==='guest'?503:204);const body=await denied.text();assert.ok(!body.includes('publicReference'));assert.equal(bound(),before);
   console.info('6.4 ORIGINAL COMMITTED AUTHORITY NATURAL EXPIRY PASS',JSON.stringify({kind,status:denied.status,grantUnchanged:true}));
  }
  const signIn=await send('/api/customer-auth/sign-in',{email:`order-${suffix}@example.invalid`,password:'Synthetic-acceptance-password-42!'},'');assert.equal(signIn.status,200);await signIn.arrayBuffer();
  const newSession=signIn.headers.getSetCookie()[0].split(';')[0];
  const activeMemberCookie=staleSessionCookie.split('; ').filter(s=>!s.startsWith(newSession.split('=')[0]+'=')).concat(newSession).join('; ');
  for(const [body,cookies] of [[JSON.parse(payload),activeMemberCookie],[JSON.parse(memberPayload),originalCookie]]){const r=await send('/api/local-orders',body,cookies);assert.equal(r.status,409);await r.arrayBuffer();}
  console.info('6.4 GUEST KEY → CUSTOMER CART / MEMBER KEY → GUEST CART REJECT PASS');
  const changeCase=async(label,change)=>{
   const f=await freshCart(),request={...JSON.parse(payload),creationAttemptId:randomUUID()};
   const order=await postAt(origin,request,f.cookie);assert.equal(order.status,200);await order.arrayBuffer();
   const before=counts(),digest=immutableDigest();
   await change(f);
   const denied=await postAt(origin,request,f.cookie);assert.equal(denied.status,409,label);await denied.arrayBuffer();assert.deepEqual(counts(),before);assert.equal(immutableDigest(),digest);
   console.info('6.4 SERVER-ACCEPTED CART CONTEXT CHANGE REJECT PASS',JSON.stringify({label}));
  };
  await changeCase('quantity / server Cart version',async f=>{
   const r=await fetch(origin+'/api/cart/items/'+f.body.lines[0].lineId,{method:'PATCH',headers:{origin,cookie:f.cookie,'Content-Type':'application/json'},body:JSON.stringify({quantity:2}),signal:AbortSignal.timeout(10000)});assert.equal(r.status,200);await r.arrayBuffer();
  });
  await changeCase('configuration value',async f=>{
   const r=await send('/api/cart',{handoff:{...handoff,customizationValues:[{fieldId:rows.configurations[0].definition.fields[0].id,fieldCode:'caption',kind:'short_text',value:'Independent accepted value'}]}},f.cookie);assert.equal(r.status,200);await r.arrayBuffer();
  });
  // A second real synthetic Variant/options selection, not an invented browser
  // option or a manual Cart-row update. Existing rows retain their identities.
  const extraValue={...rows.products[0].option_value_definitions[0],id:randomUUID(),code:'large',label:'Large',position:1};
  sql(`update local_commerce.catalog_products set option_value_definitions=option_value_definitions||'${JSON.stringify([extraValue])}'::jsonb where project_id='${project}' and id='${rows.products[0].id}';`);
  const variant={...rows.variants[0],id:randomUUID(),sku_code:`REPLAY-OPTION-${randomUUID()}`,is_default:false,selected_options:[{optionId:extraValue.optionId,valueId:extraValue.id}]};
  const addedVariant=await fetch(`${c.endpoints.apiUrl}/rest/v1/catalog_variants`,{method:'POST',headers,body:JSON.stringify(variant),signal:AbortSignal.timeout(5000)});assert.equal(addedVariant.status,201);await addedVariant.arrayBuffer();
  await changeCase('selected option',async f=>{
   const r=await send('/api/cart',{handoff:{...handoff,variantId:variant.id,skuCode:variant.sku_code,selectedOptions:variant.selected_options}},f.cookie);assert.equal(r.status,200);await r.arrayBuffer();
  });
  await changeCase('configuration revision',async f=>{
   const current=structuredClone(rows.configurations[0].definition);current.configurationRevision='2';for(const field of current.fields)field.configurationRevision='2';
   sql(`begin; update local_commerce.catalog_configuration_snapshots set configuration_status='inactive' where project_id='${project}' and product_id='${rows.products[0].id}' and revision=1;
    insert into local_commerce.catalog_configuration_snapshots(project_id,product_id,revision,definition,configuration_status) values('${project}','${rows.products[0].id}',2,'${JSON.stringify(current)}'::jsonb,'active'); commit;`);
   const r=await send('/api/cart',{handoff:{...handoff,configurationRevision:'2'}},f.cookie);assert.equal(r.status,200);await r.arrayBuffer();
  });
  assert.equal((await new LocalCatalogAuthority(env).readSnapshot()).status,'found','final synthetic Catalog remains valid');
  for(const mode of ['image-order','crop']) {
   const d=await draft.port.create({authority:draft.authority,expectedVersion:0,idempotency:{key:randomUUID(),fingerprint:'replay-media-context'},productId:imageRows.products[0].id});assert.equal(d.status,'found');
   const images=[];
   for(let i=0;i<2;i++){const r=await media.accept({draftId:d.value.draftId,expectedVersion:d.value.version,fieldId:field.id,bytes});assert.equal(r.status,'found');images.push(r);}
   const slots=images.map(r=>({slotId:r.slotId,fieldId:field.id,receiptReference:r.receipt.receiptId}));
   const confirmed=await draft.port.save({authority:draft.authority,draftId:d.value.draftId,expectedVersion:d.value.version,idempotency:{key:randomUUID(),fingerprint:'two-image-confirm'},slots});assert.equal(confirmed.status,'found');
   let values=images.map(r=>({receiptId:r.receipt.receiptId}));
   let mediaCookies=`${getGuestDraftOwnerCookieName()}=${encodeURIComponent(guest.context)}`;
   const add=await send('/api/cart',{handoff:{...imageHandoff,customizationValues:[{fieldId:field.id,fieldCode:'photo',kind:'image',images:values}]}},mediaCookies);assert.equal(add.status,200);await add.arrayBuffer();mediaCookies+='; '+add.headers.getSetCookie().map(h=>h.split(';')[0]).join('; ');
   const request={...JSON.parse(imagePayload),creationAttemptId:randomUUID()};
   const gate=await send('/api/local-orders',request,mediaCookies);assert.equal(gate.status,204);mediaCookies+='; '+gate.headers.getSetCookie().map(h=>h.split(';')[0]).join('; ');
   const made=await send('/api/local-orders',request,mediaCookies);assert.equal(made.status,200);const projection=await made.json();
   const oid=sql(`select id from local_commerce.orders where project_id='${project}' and public_reference='${projection.publicReference}';`);
   const iid=sql(`select id from local_commerce.order_items where project_id='${project}' and order_id='${oid}' limit 1;`);
   const ordered=freshHistory(mediaCookies,{orderId:oid,orderItemId:iid,publicReference:projection.publicReference});assert.equal(ordered.model.status,'found');
   assert.deepEqual(ordered.model.value.media.map(m=>({receiptId:m.receiptId,position:m.position})),images.map((r,position)=>({receiptId:r.receipt.receiptId,position})));
   const state=()=>sql(`select md5(string_agg(row_to_json(o)::text,',' order by o.id)) from local_commerce.orders o where project_id='${project}';`);
   const before=state();
   const replay=await send('/api/local-orders',request,mediaCookies);assert.equal(replay.status,200);assert.deepEqual(await replay.json(),projection);
   let changedSlots;
   if(mode==='image-order'){values=[...values].reverse();changedSlots=[...slots].reverse();}
   else {
    const crop={x:0,y:0,width:0.5,height:0.5};const r=await media.accept({draftId:d.value.draftId,expectedVersion:confirmed.value.version,fieldId:field.id,slotId:images[0].slotId,originalReceiptId:images[0].receipt.receiptId,crop});assert.equal(r.status,'found');
    values=[{receiptId:r.receipt.receiptId,crop},values[1]];changedSlots=[{slotId:r.slotId,fieldId:field.id,receiptReference:r.receipt.receiptId,crop},slots[1]];
   }
   const saved=await draft.port.save({authority:draft.authority,draftId:d.value.draftId,expectedVersion:confirmed.value.version,idempotency:{key:randomUUID(),fingerprint:mode},slots:changedSlots});assert.equal(saved.status,'found');
   const change=await send('/api/cart',{handoff:{...imageHandoff,customizationValues:[{fieldId:field.id,fieldCode:'photo',kind:'image',images:values}]}},mediaCookies);assert.equal(change.status,200);await change.arrayBuffer();
   const denied=await send('/api/local-orders',request,mediaCookies);assert.equal(denied.status,409);await denied.arrayBuffer();assert.equal(state(),before);
   const newAttempt=await send('/api/local-orders',{...request,creationAttemptId:randomUUID()},mediaCookies);assert.ok([409,503].includes(newAttempt.status));await newAttempt.arrayBuffer();assert.equal(state(),before);
   console.info('6.4 CONFIRMED MEDIA CONTEXT CHANGE / ATTACHED NEW ATTEMPT REJECT PASS',JSON.stringify({mode}));
  }
  // Drift only the fresh synthetic authority owned by this invocation.
  // Revision 2 was introduced above without deleting historical revision 1.
  sql(`update local_commerce.catalog_pricing_rules set definition=jsonb_set(definition,'{amountCents}','777'::jsonb) where project_id='${project}' and id='${rows.rules[0].id}';
   update local_commerce.catalog_pricing_rules set definition=jsonb_set(definition,'{discountValue}','15'::jsonb) where project_id='${project}' and id='${rows.rules[1].id}';`);
  assert.equal((await new LocalCatalogAuthority(env).readSnapshot()).status,'found');
  const finalCounts=counts(),finalDigest=immutableDigest();
  const driftWorker=start(['tests/database/local-commerce-test-worker.mjs',run,'--confirm-disposable',String(peerPort)]);await awaitPeer(driftWorker,peerOrigin);
  const historical=await postAt(peerOrigin,JSON.parse(payload),originalCookie);assert.equal(historical.status,200);assert.deepEqual(await historical.json(),{publicReference:reference});assert.deepEqual(counts(),finalCounts);assert.equal(immutableDigest(),finalDigest);await stop(driftWorker);
  console.info('6.4 PRODUCT/PRICE/CONFIGURATION/SHIPPING/COUPON DRIFT → FRESH WORKER HISTORICAL REPLAY PASS');
  // A test-only interruption at the real new-create Catalog call. Committed
  // replay must not reach it; a legitimate uncommitted Cart must reach it.
  const fresh=await send('/api/cart',{handoff:{...handoff,configurationRevision:'2'}},originalCookie.split('; ').filter(s=>!s.startsWith(cartCookie[0]+'=')).join('; '));assert.equal(fresh.status,200);await fresh.arrayBuffer();
  const newCartPair=fresh.headers.getSetCookie().map(h=>h.split(';')[0]).find(h=>h.startsWith(cartCookie[0]+'='));assert.ok(newCartPair);
  const freshCookie=originalCookie.split('; ').filter(s=>!s.startsWith(cartCookie[0]+'=')).concat(newCartPair).join('; ');
  const unavailableWorker=start(['tests/database/local-commerce-test-worker.mjs',run,'--confirm-disposable',String(peerPort),'catalog-unavailable']);await awaitPeer(unavailableWorker,peerOrigin);
  const withoutCatalog=await postAt(peerOrigin,JSON.parse(payload),originalCookie);assert.equal(withoutCatalog.status,200);assert.deepEqual(await withoutCatalog.json(),{publicReference:reference});
  const rejected=await postAt(peerOrigin,{...JSON.parse(payload),creationAttemptId:randomUUID()},freshCookie);assert.equal(rejected.status,503);await rejected.arrayBuffer();assert.match(logs,/ORDER_ACCEPTANCE_FAULT_REACHED:catalog-unavailable/);assert.deepEqual(counts(),finalCounts);assert.equal(immutableDigest(),finalDigest);await stop(unavailableWorker);
  console.info('6.4 CATALOG UNAVAILABLE: COMMITTED REPLAY PASS / NEW CREATE FAIL CLOSED');
 }
 sql(`update local_commerce.catalog_products set publication_status='draft',availability='unavailable',fulfillment_definition=jsonb_set(fulfillment_definition,'{requiresProductionPreview}','false'::jsonb) where project_id='${project}' and id='${rows.products[0].id}';`);
 const absent=freshHistory(originalCookie,historySelector);assert.equal(absent.canonical.status,'found');assert.deepEqual(absent.canonical,freshBefore.canonical);assert.deepEqual(absent.summary,freshBefore.summary);
 console.info('6.5 CURRENT PURCHASE PRODUCT UNAVAILABLE / HISTORICAL DEEP EQUALITY PASS');
 console.info('ORDER HTTP CAPABILITY ACCEPTANCE PASS — remaining Batch 6 media/payment/concurrency not claimed');
} finally {for(const child of children)await stop(child);}
