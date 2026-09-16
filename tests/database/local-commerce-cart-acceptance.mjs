// Real isolated DB acceptance; never included in database-free test entrypoints.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {sha256Text,planMigrationLedger} from '../../app/application/local-commerce-migration-ledger.ts';
import {validateProjectMarker} from '../../app/application/local-commerce-environment.ts';
import {createLocalPersistentCartPort} from '../../app/infrastructure/local-commerce/local-persistent-cart-adapter.server.ts';
import {LocalCatalogAuthority} from '../../app/infrastructure/local-commerce/local-catalog-authority.server.ts';
import {acceptCartItem} from '../../app/application/shopping-cart-service.ts';
import {createLocalPersistentCustomerAuthProvider} from '../../app/application/customer-auth-persistent-provider.server.ts';
import {createConfiguredGuestDraftOwnerService} from '../../app/lib/guest-draft-owner.ts';
import {ensureGuestResourceOwner} from '../../app/application/guest-resource-ownership.server.ts';
import {persistentCartHttp} from '../../app/server/local-persistent-cart-http.server.ts';
import {catalogTestEnvironment,catalogDatabaseRows,ids} from '../fixtures/local-persistent-catalog.mjs';
const run=process.argv[2];assert.match(run??'',/^run-[a-f0-9]{8}$/);assert.notEqual(run,'run-68938831');assert.equal(process.argv[3],'--confirm-disposable');
const dir=path.resolve('local/commerce/runtime/disposable',run);
const prep=JSON.parse(readFileSync(path.join(dir,'ledger-preparation.json'),'utf8'));const c=prep.config;
const marker=JSON.parse(readFileSync(path.join(dir,'project-marker.json'),'utf8'));
assert.equal(validateProjectMarker(marker,c),true);assert.equal(sha256Text(JSON.stringify(marker)),prep.markerDigest);
assert.equal(c.projectId,'figmemento-local-commerce-test-'+run);
function command(bin,args,input){const r=spawnSync(bin,args,{input,encoding:'utf8'});assert.equal(r.status,0,r.stderr?.replace(/eyJ\S+/g,'[redacted]'));return r.stdout.trim();}
const names=command('docker',['ps','--filter',`label=com.supabase.cli.workdir=${dir}`,'--format','{{.Names}}']).split('\n');
const db=names.filter(n=>n.startsWith('supabase_db_'));assert.equal(db.length,1);
const sql=q=>command('docker',['exec','-i',db[0],'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],q);
const info=JSON.parse(command(path.resolve('node_modules/.bin/supabase'),['status','--workdir',dir,'-o','json']));
assert.equal(new URL(info.API_URL).origin,new URL(c.endpoints.apiUrl).origin);
const env=catalogTestEnvironment({LOCAL_COMMERCE_RUN_ID:run,LOCAL_COMMERCE_PROJECT_ID:c.projectId,LOCAL_COMMERCE_MARKER_DIGEST:prep.markerDigest,
 LOCAL_COMMERCE_SERVICE_ROLE_KEY:info.SERVICE_ROLE_KEY,CART_SOURCE:'local_persistent',CUSTOMER_AUTH_SOURCE:'local_persistent',
 PHOTOGIFT_GUEST_DRAFT_OWNER_SECRET:randomUUID()+randomUUID(),PHOTOGIFT_GUEST_DRAFT_OWNER_CONTEXT_TTL_SECONDS:'3600'});
for(const [k,v] of Object.entries({SHADOW_DB:c.ports.shadowDb,API:c.ports.api,DB:c.ports.db,STUDIO:c.ports.studio,SMTP:c.ports.smtp,IMAGE_HELPER:c.ports.imageHelper}))env['LOCAL_COMMERCE_'+k+'_PORT']=String(v);
env.LOCAL_COMMERCE_API_URL=c.endpoints.apiUrl;env.LOCAL_COMMERCE_RPC_URL=c.endpoints.rpcUrl;env.LOCAL_COMMERCE_STORAGE_URL=c.endpoints.storageUrl;env.LOCAL_COMMERCE_IMAGE_HELPER_URL=c.endpoints.imageHelperUrl;
const report={runId:run,projectId:c.projectId,checks:[]};
async function check(name,f){await f();report.checks.push({name,status:'PASS'});console.log('PASS '+name);}
const manifest=JSON.parse(readFileSync('local/commerce/migrations/manifest.json','utf8'));
await check('ledger 8/8 checksums and exact marker',()=>{
 assert.equal(sql(`select local_commerce.verify_project_identity('${c.projectId}','${prep.markerDigest}');`),'t');
 const applied=JSON.parse(sql(`select json_agg(json_build_object('version',version,'migrationId',migration_id,'checksum',checksum,'projectId',project_id) order by version) from local_commerce.migration_ledger;`));
 assert.equal(applied.length,8);for(const m of manifest.migrations)assert.equal(sha256Text(readFileSync('local/commerce/migrations/'+m.filename,'utf8')),m.checksum);
 const p=planMigrationLedger({...manifest,projectId:c.projectId},applied,c.projectId);assert.equal(p.status,'ready');assert.equal(p.apply.length,0);report.ledger=applied;
});
const headers={apikey:info.ANON_KEY,authorization:'Bearer '+info.SERVICE_ROLE_KEY,'Content-Type':'application/json','Content-Profile':'local_commerce'};
await check('private synthetic Catalog setup on exact disposable DB',async()=>{
 const rows=catalogDatabaseRows(c.projectId);
 for(const [key,table] of [['categories','catalog_categories'],['products','catalog_products'],['variants','catalog_variants'],['configurations','catalog_configuration_snapshots'],['rules','catalog_pricing_rules']]){
 const r=await fetch(c.endpoints.apiUrl+'/rest/v1/'+table,{method:'POST',headers:{...headers,Prefer:'resolution=ignore-duplicates'},body:JSON.stringify(rows[key])});assert.equal(r.status,201,table);}
});
const guest=await ensureGuestResourceOwner({projectId:c.projectId,context:null,ownerService:createConfiguredGuestDraftOwnerService(env)});assert.equal(guest.status,'issued');
const owner=guest.owner;
const construct=(o=owner,e=env)=>createLocalPersistentCartPort({environment:e,owner:o,authorityExpiresAt:owner.expiresAt});
const ready=await construct();assert.equal(ready.status,'ready');const {port,authority}=ready;
const idem=()=>({key:randomUUID(),fingerprint:'cart-acceptance'});
const catalog=new LocalCatalogAuthority(env);
const handoff={productId:ids.product,variantId:ids.variant,skuCode:'SYNTHETIC-KEEPSAKE-S',selectedOptions:[{optionId:ids.option,valueId:ids.value}],configurationRevision:'1',customizationValues:[{fieldId:ids.field,fieldCode:'caption',kind:'short_text',value:'A durable caption'}]};
const accepted=await acceptCartItem(handoff,{observedAt:new Date().toISOString(),catalogRepository:catalog.repository,customizationFieldRepository:catalog});assert.equal(accepted.status,'accepted');
let state;
await check('guest Cart identity and two identical explicit adds remain distinct',async()=>{
 const created=await port.create({authority,idempotency:idem()});assert.equal(created.status,'found');state=created.value;
 for(let i=0;i<2;i++){const r=await port.addLine({authority,idempotency:idem(),cartId:state.cartId,expectedVersion:state.version,item:accepted.value});assert.equal(r.status,'found');state=r.value;}
 assert.equal(state.record.lines.length,2);assert.notEqual(state.record.lines[0].lineId,state.record.lines[1].lineId);
 assert.deepEqual(state.record.lines[0].handoff,handoff);assert.equal(state.record.lines[0].snapshot.unitPriceCents,2500);
});
await check('exact line quantity persists without altering second configured line',async()=>{
 const r=await port.updateLine({authority,idempotency:idem(),cartId:state.cartId,expectedVersion:state.version,lineId:state.record.lines[0].lineId,quantity:3});assert.equal(r.status,'found');state=r.value;
 assert.deepEqual(state.record.lines.map(l=>l.quantity),[3,1]);
 for(const quantity of [0,21])assert.equal((await port.updateLine({authority,idempotency:idem(),cartId:state.cartId,expectedVersion:state.version,lineId:state.record.lines[0].lineId,quantity})).status,'unavailable');
});
await check('fresh process and reconstructed repository read exact durable snapshot',()=>{
 const program=`import assert from 'node:assert/strict';import{readFileSync}from'node:fs';import{createLocalPersistentCartPort}from'./app/infrastructure/local-commerce/local-persistent-cart-adapter.server.ts';const x=JSON.parse(readFileSync(0,'utf8'));const a=await createLocalPersistentCartPort(x.input);assert.equal(a.status,'ready');const r=await a.port.read({authority:a.authority,cartId:x.state.cartId});assert.equal(r.status,'found');assert.deepEqual(r.value,x.state);console.log('recovery PASS');`;
 assert.equal(command(process.execPath,['--input-type=module','-e',program],JSON.stringify({input:{environment:env,owner,authorityExpiresAt:owner.expiresAt},state})),'recovery PASS');
});
await check('wrong owner/project/marker fail closed; no Cart claim',async()=>{
 const other=await construct({...owner,ownerId:'different-opaque-guest-owner-123456789'});assert.equal(other.status,'ready');
 assert.equal((await other.port.read({authority:other.authority,cartId:state.cartId})).status,'unavailable');
 assert.equal((await construct({...owner,projectId:'wrong'})).status,'unavailable');
 assert.equal((await construct(owner,{...env,LOCAL_COMMERCE_MARKER_DIGEST:'b'.repeat(64)})).status,'unavailable');
});
await check('member durable session owner creates a separate Cart and cannot read guest Cart',async()=>{
 const registered=await createLocalPersistentCustomerAuthProvider(env).signUp({email:'cart-'+randomUUID()+'@example.test',password:'A-valid-test-password-42!'});assert.equal(registered.status,'ok');
 const session=registered.value.session;
 const m=await createLocalPersistentCartPort({environment:env,owner:{kind:'customer',projectId:c.projectId,ownerId:session.ownerId,customerId:session.customer.id},authorityExpiresAt:Date.parse(session.expiresAt)/1000});assert.equal(m.status,'ready');
 const r=await m.port.create({authority:m.authority,idempotency:idem()});assert.equal(r.status,'found');assert.notEqual(r.value.cartId,state.cartId);
 assert.equal((await m.port.read({authority:m.authority,cartId:state.cartId})).status,'unavailable');
});
await check('stale configuration and missing version rejected; snapshot unchanged',async()=>{
 const r=await port.addLine({authority,idempotency:idem(),cartId:state.cartId,expectedVersion:state.version,item:{...accepted.value,handoff:{...handoff,configurationRevision:'999'}}});assert.equal(r.status,'unavailable');
 assert.equal((await port.updateLine({authority,idempotency:idem(),cartId:state.cartId,lineId:state.record.lines[0].lineId,quantity:4})).status,'unavailable');
 assert.deepEqual((await port.read({authority,cartId:state.cartId})).value,state);
});
await check('real DB HTTP boundary: signed guest cookies, safe projection, quantity, same-origin',async()=>{
 const previous=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);
 try {
  const req=(method,body,cookie='',origin='http://localhost:3004')=>new Request('http://localhost:3004/api/cart',{method,headers:{origin,cookie,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  assert.equal((await persistentCartHttp(req('POST',{handoff},'','https://wrong.invalid'),'add')).status,403);
  const a=await persistentCartHttp(req('POST',{handoff,ownerId:'forged',cartId:state.cartId}),'add');assert.equal(a.status,200);
  const cookies=a.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');assert.match(cookies,/photogift-guest-draft-owner=/);assert.match(cookies,/figmemento-local-cart=/);
  const publicValue=await a.json();assert.equal(publicValue.lines.length,1);assert.doesNotMatch(JSON.stringify(publicValue),/ownerId|projectId|sessionHash|passwordHash|cartId/);
  const b=await persistentCartHttp(req('POST',{handoff},cookies),'add');assert.equal(b.status,200);const value=await b.json();assert.equal(value.lines.length,2);
  const u=await persistentCartHttp(req('PATCH',{quantity:2},cookies),'update',value.lines[0].lineId);assert.equal(u.status,200);assert.deepEqual((await u.json()).lines.map(l=>l.quantity),[2,1]);
  const read=await persistentCartHttp(req('GET',null,cookies),'read');assert.equal(read.status,200);assert.equal((await read.json()).lines.length,2);
  const guestCookie=cookies.split('; ').find(s=>s.startsWith('photogift-guest-draft-owner='));
  const another=await persistentCartHttp(req('POST',{handoff},guestCookie),'add');assert.equal(another.status,200);
  assert.ok(another.headers.getSetCookie().every(s=>!s.startsWith('photogift-guest-draft-owner=')),'valid guest context must not be replaced');
  const member=await createLocalPersistentCustomerAuthProvider(env).signUp({email:'http-cart-'+randomUUID()+'@example.test',password:'A-valid-test-password-42!'});assert.equal(member.status,'ok');
  const authCookie='figmemento-local-customer-session='+member.value.sessionId;
  const memberCart=await persistentCartHttp(req('POST',{handoff},authCookie+'; '+guestCookie),'add');assert.equal(memberCart.status,200);
  const memberCookies=memberCart.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ')+'; '+authCookie+'; '+guestCookie;
  const memberRead=await persistentCartHttp(req('GET',null,memberCookies),'read');assert.equal(memberRead.status,200);assert.equal((await memberRead.json()).lines.length,1);
  const guestAfterLogin=await persistentCartHttp(req('GET',null,cookies+'; '+authCookie),'read');assert.equal(guestAfterLogin.status,200);assert.equal((await guestAfterLogin.json()).lines.length,2);
  report.http={add:a.status,secondAdd:b.status,update:u.status,read:read.status,sameOrigin:403};
 } finally {for(const [k,v]of Object.entries(previous)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});
report.status='PASS';writeFileSync(path.join(dir,'task-4.2-cart-evidence.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:'PASS',checks:report.checks.length,runId:run}));
