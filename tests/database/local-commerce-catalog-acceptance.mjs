// Explicit local-only integration executable; not part of database-free tests.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHmac,randomUUID} from 'node:crypto';
import {sha256Text,planMigrationLedger} from '../../app/application/local-commerce-migration-ledger.ts';
import {validateProjectMarker} from '../../app/application/local-commerce-environment.ts';
import {LocalCatalogAuthority} from '../../app/infrastructure/local-commerce/local-catalog-authority.server.ts';
import {createLocalPersistentSupabaseAdapter} from '../../app/infrastructure/local-commerce/local-persistent-supabase-adapter.server.ts';
import {LocalMemoryShoppingCartProvider} from '../../app/infrastructure/cart/local-memory-shopping-cart-provider.ts';
import {LocalCheckoutRuleAuthority} from '../../app/infrastructure/local-commerce/local-checkout-rule-authority.server.ts';
import {createServerCatalogRepository} from '../../app/infrastructure/catalog/server-catalog-repository.ts';
import {acceptConfiguredItemHandoff} from '../../app/application/configured-item-handoff-acceptance.ts';
import {LocalAdminCatalogState} from '../../app/infrastructure/catalog/local-admin-catalog-runtime.server.ts';
import {readProductSource} from '../../app/config/server.ts';
import {catalogTestEnvironment,catalogDatabaseRows,ids} from '../fixtures/local-persistent-catalog.mjs';

const run=process.argv[2];
assert.match(run??'',/^run-[a-f0-9]{8}$/);
assert.equal(process.argv[3],'--confirm-disposable');
const dir=path.resolve('local/commerce/runtime/disposable',run);
const prep=JSON.parse(readFileSync(path.join(dir,'ledger-preparation.json'),'utf8'));
const c=prep.config;
const marker=JSON.parse(readFileSync(path.join(dir,'project-marker.json'),'utf8'));
assert.equal(validateProjectMarker(marker,c),true);
assert.equal(sha256Text(JSON.stringify(marker)),prep.markerDigest);
assert.equal(c.projectId,'figmemento-local-commerce-test-'+run);
const manifest=JSON.parse(readFileSync('local/commerce/migrations/manifest.json','utf8'));
const report={runId:run,projectId:c.projectId,checks:[],http:[]};
function command(bin,args){const r=spawnSync(bin,args,{encoding:'utf8',env:{...process.env,SUPABASE_TELEMETRY_DISABLED:'true'}});assert.equal(r.status,0,`${bin} local command failed`);return r.stdout.trim();}
const names=command('docker',['ps','--filter',`label=com.supabase.cli.workdir=${dir}`,'--format','{{.Names}}']).split('\n');
const db=names.filter(n=>n.startsWith('supabase_db_'));assert.equal(db.length,1);
function sql(q,expectFailure=false){const r=spawnSync('docker',['exec','-i',db[0],'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],{input:q,encoding:'utf8'});if(expectFailure){assert.notEqual(r.status,0);return r.stderr;}assert.equal(r.status,0,'local SQL assertion failed');return r.stdout.trim();}
const info=JSON.parse(command(path.resolve('node_modules/.bin/supabase'),['status','--workdir',dir,'-o','json']));
assert.equal(new URL(info.API_URL).origin,new URL(c.endpoints.apiUrl).origin);
const auth=names.find(n=>n.startsWith('supabase_auth_'));assert.ok(auth);
const authEnv=JSON.parse(command('docker',['inspect',auth]))[0].Config.Env;
const secret=authEnv.find(x=>x.startsWith('GOTRUE_JWT_SECRET='))?.slice('GOTRUE_JWT_SECRET='.length);assert.ok(secret);
const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const payload=b64({role:'authenticated',sub:randomUUID(),aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600});
const signing=b64({alg:'HS256',typ:'JWT'})+'.'+payload;
const authenticated=signing+'.'+createHmac('sha256',secret).update(signing).digest('base64url');
const keys={anon:info.ANON_KEY,authenticated,service_role:info.SERVICE_ROLE_KEY};assert.ok(keys.service_role);
async function http(role,p,method='GET',body,storage=false){
 const headers={apikey:info.ANON_KEY,authorization:'Bearer '+keys[role]};
 if(!storage){headers['Accept-Profile']='local_commerce';headers['Content-Profile']='local_commerce';headers['Content-Type']='application/json';}
 else if(body)headers['Content-Type']=Buffer.isBuffer(body)?'image/png':'application/json';
 const r=await fetch(c.endpoints.apiUrl+p,{method,headers,body:body===undefined?undefined:Buffer.isBuffer(body)?body:JSON.stringify(body),redirect:'error'});
 const bytes=Buffer.from(await r.arrayBuffer());let data;try{data=JSON.parse(bytes.toString())}catch{data=null;}
 report.http.push({role,path:p.split('?')[0],method,status:r.status});return {status:r.status,data,bytes};
}
async function check(name,f){await f();report.checks.push({name,status:'PASS'});console.log('PASS '+name);}
const env=catalogTestEnvironment({LOCAL_COMMERCE_RUN_ID:run,LOCAL_COMMERCE_PROJECT_ID:c.projectId,LOCAL_COMMERCE_MARKER_DIGEST:prep.markerDigest,LOCAL_COMMERCE_SERVICE_ROLE_KEY:keys.service_role});
for(const [key,val] of Object.entries({SHADOW_DB:c.ports.shadowDb,API:c.ports.api,DB:c.ports.db,STUDIO:c.ports.studio,SMTP:c.ports.smtp,IMAGE_HELPER:c.ports.imageHelper}))env['LOCAL_COMMERCE_'+key+'_PORT']=String(val);
env.LOCAL_COMMERCE_API_URL=c.endpoints.apiUrl;env.LOCAL_COMMERCE_RPC_URL=c.endpoints.rpcUrl;env.LOCAL_COMMERCE_STORAGE_URL=c.endpoints.storageUrl;env.LOCAL_COMMERCE_IMAGE_HELPER_URL=c.endpoints.imageHelperUrl;
const rpc=(role,name,args)=>http(role,'/rest/v1/rpc/'+name,'POST',args);
const identity={p_project_id:c.projectId,p_marker_digest:prep.markerDigest};
const a=new LocalCatalogAuthority(env);
const ruleEnv={...env,LOCAL_CHECKOUT_SOURCE:'local_persistent',CART_SOURCE:'local_persistent',CUSTOMER_AUTH_SOURCE:'local_persistent',CUSTOMER_UPLOAD_SOURCE:'local_persistent'};
const rules=new LocalCheckoutRuleAuthority(ruleEnv);
const input={country:'US',method:'local_standard',requiresShipping:true,subtotalCents:5000,currency:'USD',couponCode:'TEST10'};
const now=Date.parse('2026-09-11T00:00:00Z');
try {
 report.postgres=sql('show server_version;');assert.match(report.postgres,/^17\./);report.cli=command(path.resolve('node_modules/.bin/supabase'),['--version']);assert.equal(report.cli,'2.114.0');
 await check('2.7 ledger/checksums 7/7 and planner apply=0 skip=7',()=>{
  const applied=JSON.parse(sql(`select json_agg(json_build_object('version',version,'migrationId',migration_id,'checksum',checksum,'projectId',project_id) order by version) from local_commerce.migration_ledger;`));
  assert.equal(applied.length,7);for(const e of manifest.migrations)assert.equal(sha256Text(readFileSync('local/commerce/migrations/'+e.filename,'utf8')),e.checksum);
  const p=planMigrationLedger({...manifest,projectId:c.projectId},applied,c.projectId);assert.equal(p.status,'ready');assert.equal(p.apply.length,0);assert.equal(p.skipped.length,7);report.ledger=applied;
 });
 await check('2.7 36 RLS tables; anon/authenticated CRUD denied; service reads allowed',async()=>{
  const tables=JSON.parse(sql("select json_agg(json_build_object('name',relname,'rls',relrowsecurity) order by relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='local_commerce' and c.relkind='r';"));assert.equal(tables.length,36);assert.ok(tables.every(t=>t.rls));report.rlsTableCount=tables.length;
  for(const t of tables){for(const role of ['anon','authenticated'])for(const method of ['GET','POST','PATCH','DELETE']){const r=await http(role,'/rest/v1/'+t.name,method,method==='POST'||method==='PATCH'?{}:undefined);assert.ok([401,403].includes(r.status),`${role} ${method} ${t.name}`);}assert.equal((await http('service_role','/rest/v1/'+t.name+'?limit=1')).status,200);}
 });
 await check('2.7 restricted RPC correct/wrong identity and permissions',async()=>{
  assert.equal((await rpc('service_role','verify_project_identity',identity)).data,true);
  for(const patch of [{p_project_id:'wrong'},{p_marker_digest:'wrong'}])assert.equal((await rpc('service_role','verify_project_identity',{...identity,...patch})).data,false);
  for(const name of ['verify_project_identity','read_catalog_authority'])for(const role of ['anon','authenticated'])assert.ok([401,403].includes((await rpc(role,name,identity)).status));
  assert.equal(sql("select bool_and(proconfig @> array['search_path=local_commerce, pg_catalog']) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='local_commerce' and p.prosecdef;"),'t');
 });
 await check('2.7 private Storage denied anon; service upload/download/delete',async()=>{
  assert.equal(sql("select public from storage.buckets where id='local-commerce-private';"),'f');
  const key='acceptance-'+randomUUID()+'.png';const p='/storage/v1/object/local-commerce-private/'+key;const bytes=Buffer.from('89504e470d0a1a0a','hex');
  const denied=await http('anon',p,'POST',bytes,true);assert.ok(denied.status>=400 || Number(denied.data?.statusCode)>=400);
  assert.ok((await http('service_role',p,'POST',bytes,true)).status<300);
  assert.deepEqual((await http('service_role',p,'GET',undefined,true)).bytes,bytes);
  assert.ok((await http('service_role','/storage/v1/object/local-commerce-private','DELETE',{prefixes:[key]},true)).status<300);
 });
 await check('2.7 migration effect and ledger failure roll back together',()=>{
  assert.match(sql("begin; create table local_commerce.ledger_atomic_probe(id int); insert into local_commerce.migration_ledger select * from local_commerce.migration_ledger where version=7; commit;",true),/duplicate key/);
  assert.equal(sql("select to_regclass('local_commerce.ledger_atomic_probe') is null;"),'t');assert.equal(sql('select count(*) from local_commerce.migration_ledger;'),'7');
 });
 await check('2.7 Order/payment/receipt transaction FK failure leaves zero rows',()=>{
  const owner=randomUUID(),order=randomUUID(),payment=randomUUID(),receipt=randomUUID();
  const failure=sql(`begin; insert into local_commerce.commerce_owners(project_id,id,owner_kind,subject_hash) values('${c.projectId}','${owner}','guest','${'a'.repeat(64)}'); insert into local_commerce.orders(project_id,id,owner_id,public_reference) values('${c.projectId}','${order}','${owner}','FM-ROLLBACK'); insert into local_commerce.payment_attempts(project_id,id,order_id,owner_id,action_key,amount_cents,currency) values('${c.projectId}','${payment}','${order}','${owner}','rollback',1,'USD'); insert into local_commerce.media_receipts(project_id,id,owner_id,media_object_id,product_id,field_key,expires_at) values('${c.projectId}','${receipt}','${owner}','${randomUUID()}','${randomUUID()}','test',now()+interval '1 day'); commit;`,true);assert.match(failure,/foreign key/);
  for(const [t,id] of [['orders',order],['payment_attempts',payment],['media_receipts',receipt]])assert.equal(sql(`select count(*) from local_commerce.${t} where id='${id}';`),'0');
 });
 await check('2.7/4.1 environment matrix fails closed',async()=>{
  for(const patch of [{NODE_ENV:'production'},{NODE_ENV:'staging'},{NODE_ENV:'unknown'},{LOCAL_COMMERCE_API_URL:'https://invalid.example'},{LOCAL_COMMERCE_PROJECT_ID:'other'},{CART_SOURCE:'local_fake'}])assert.equal((await new LocalCatalogAuthority({...env,...patch}).readSnapshot()).status,'source_failure');
 });
 await check('2.7 fake provider no DB client/network sentinel',async()=>{
  const original=globalThis.fetch;let network=0,clients=0;
  globalThis.fetch=async()=>{network++;throw Error('Offline network forbidden');};
  try {
   const fakeEnv={NODE_ENV:'test',PHOTOGIFT_PRODUCT_SOURCE:'fixture',CART_SOURCE:'local_fake'};
   assert.notEqual((await createLocalPersistentSupabaseAdapter(fakeEnv,{clientFactory:{create(){clients++;throw Error('DB forbidden');}}})).status,'ready');
   assert.equal((await createServerCatalogRepository(fakeEnv)).status,'found');
   await new LocalMemoryShoppingCartProvider().createCart();
   assert.equal(clients,0);assert.equal(network,0);
  } finally {globalThis.fetch=original;}
 });
 report.phaseC='PASS';
 // Phase D only after all Phase C assertions above pass. Private test setup.
 await check('4.1 private synthetic setup with real service-role HTTP',async()=>{
  const r=catalogDatabaseRows(c.projectId);
  // Reruns replace only this harness's known synthetic IDs, never other rows.
  for(const [key,table] of [['rules','catalog_pricing_rules'],['configurations','catalog_configuration_snapshots'],['variants','catalog_variants'],['products','catalog_products'],['categories','catalog_categories']])for(const row of r[key])assert.equal((await http('service_role',`/rest/v1/${table}?project_id=eq.${c.projectId}&id=eq.${row.id}`,'DELETE')).status,204);
  for(const [key,table] of [['categories','catalog_categories'],['products','catalog_products'],['variants','catalog_variants'],['configurations','catalog_configuration_snapshots'],['rules','catalog_pricing_rules']])assert.equal((await http('service_role','/rest/v1/'+table,'POST',r[key])).status,201,table);
 });
 await check('4.1 DB Catalog/SKU/options/config/fulfillment/pricing read',async()=>{
  const r=await a.repository.findPublicProductById(ids.product);assert.equal(r.status,'found');assert.equal(r.value.variants[0].skuCode,'SYNTHETIC-KEEPSAKE-S');assert.equal(r.value.variants[0].priceCents,2500);assert.equal(r.value.variants[0].currency,'USD');assert.deepEqual(r.value.variants[0].selectedOptions,[{optionId:ids.option,valueId:ids.value}]);assert.equal(r.value.options[0].id,ids.option);assert.equal(r.value.fulfillment.requiresShipping,true);assert.equal((await a.getCustomizationFieldsForProduct(ids.product)).value.configurationRevision,'1');assert.doesNotMatch(JSON.stringify(r),/selectedSpecificationKey/);
  assert.equal((await createServerCatalogRepository(env)).status,'found');
  assert.equal(readProductSource({...env,NODE_ENV:'development'}),'local_persistent');
  // A development runtime cannot impersonate this explicitly test-only stack.
  assert.equal((await createServerCatalogRepository({...env,NODE_ENV:'development'})).status,'source_failure');
 });
 await check('4.1 wrong marker, project and cross-project FK reject',async()=>{
  assert.equal((await new LocalCatalogAuthority({...env,LOCAL_COMMERCE_MARKER_DIGEST:'b'.repeat(64)}).readSnapshot()).status,'source_failure');
  assert.equal((await rpc('service_role','read_catalog_authority',{...identity,p_project_id:'wrong'})).data,null);
  const v=catalogDatabaseRows(c.projectId).variants[0];assert.equal((await http('service_role','/rest/v1/catalog_variants','POST',{...v,id:randomUUID(),project_id:'wrong'})).status,409);
 });
 await check('4.1 handoff stale configuration rejected; fake Admin isolated',async()=>{
  const before=await a.repository.findPublicProductById(ids.product);
  const state=new LocalAdminCatalogState();const fake=state.snapshotCatalog();fake.products[0]={...fake.products[0],name:'Changed fake Admin'};assert.equal(state.commitCatalog(fake).ok,true);assert.deepEqual(await a.repository.findPublicProductById(ids.product),before);
  const handoff={productId:ids.product,variantId:ids.variant,skuCode:'SYNTHETIC-KEEPSAKE-S',selectedOptions:[{optionId:ids.option,valueId:ids.value}],configurationRevision:'1',customizationValues:[]};
  const deps={catalogRepository:a.repository,customizationFieldRepository:a,receiptRepository:{findOwnedReceipt(){throw Error('No image');}}};
  for(const [rev,status] of [['1','accepted'],['stale','rejected']])assert.equal((await acceptConfiguredItemHandoff({rawInput:{...handoff,configurationRevision:rev},verifiedOwnerId:null,observedAt:new Date(now).toISOString()},deps)).status,status);
 });
 await check('4.1 shipping/coupon four statuses and tax null',async()=>{
  const result=await rules.evaluate(input,now);assert.equal(result.status,'found');assert.equal(result.value.shipping.amountCents,500);assert.equal(result.value.shipping.currency,'USD');assert.match(result.value.shipping.estimatedRange,/5–10/);assert.deepEqual(result.value.tax,{status:'not_activated',amountCents:null});
  assert.equal((await rules.evaluate({...input,country:'ZZ'},now)).value.shipping.status,'unsupported');assert.equal((await rules.evaluate({...input,requiresShipping:false},now)).value.shipping.status,'not_applicable');
  for(const [patch,time,status,amount] of [[{},now,'valid',500],[{couponCode:'INVALID'},now,'invalid',0],[{},Date.parse('2027-01-01'),'expired',0],[{subtotalCents:100},now,'not_applicable',0]]){const r=await rules.evaluate({...input,...patch,discountAmount:999999},time);assert.equal(r.status,'found');assert.equal(r.value.coupon.status,status);assert.equal(r.value.coupon.discountCents,amount);}
 });
 await check('4.1 actual rule update increments version; stale version rejects',async()=>{
  const old=(await a.readSnapshot()).value.versions;
  assert.equal((await http('service_role','/rest/v1/catalog_pricing_rules?id=eq.'+ids.coupon,'PATCH',{rule_status:'active'})).status,204);
  assert.equal((await a.readSnapshot(old)).status,'source_failure');assert.equal((await rules.evaluate({...input,expectedVersions:old},now)).status,'unavailable');
 });
 await check('4.1 unavailable authority returns no fallback',async()=>{
  assert.equal((await new LocalCheckoutRuleAuthority({...ruleEnv,LOCAL_COMMERCE_SERVICE_ROLE_KEY:'invalid'}).evaluate(input,now)).status,'unavailable');
 });
 report.phaseD='PASS';
} finally {writeFileSync(path.join(dir,'catalog-acceptance.json'),JSON.stringify(report,null,2)+'\n');}
