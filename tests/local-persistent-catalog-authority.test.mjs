import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {LocalCatalogAuthority} from '../app/infrastructure/local-commerce/local-catalog-authority.server.ts';
import {LocalCheckoutRuleAuthority} from '../app/infrastructure/local-commerce/local-checkout-rule-authority.server.ts';
import {createServerCatalogRepository} from '../app/infrastructure/catalog/server-catalog-repository.ts';
import {readProductSource} from '../app/config/server.ts';
import {readLocalCheckoutConfig} from '../app/config/local-checkout-runtime.ts';
import {acceptConfiguredItemHandoff} from '../app/application/configured-item-handoff-acceptance.ts';
import {catalogTestEnvironment as env,catalogDatabaseRows as rows,offlineCatalogClient as client,ids} from './fixtures/local-persistent-catalog.mjs';

const checkoutEnv=()=>env({LOCAL_CHECKOUT_SOURCE:'local_persistent',CART_SOURCE:'local_persistent',CUSTOMER_AUTH_SOURCE:'local_persistent',CUSTOMER_UPLOAD_SOURCE:'local_persistent'});
const input={country:'US',method:'local_standard',requiresShipping:true,subtotalCents:5000,currency:'USD',couponCode:'TEST10'};
const now=Date.parse('2026-09-11T00:00:00Z');
test('4.1 exact Catalog graph, SKU/options, fulfillment and configuration are read through project RPC',async()=>{
  const c=client();const a=new LocalCatalogAuthority(env(),c);
  const p=await a.repository.findPublicProductById(ids.product);
  assert.equal(p.status,'found');assert.equal(p.value.variants[0].skuCode,'SYNTHETIC-KEEPSAKE-S');
  assert.equal(p.value.variants[0].priceCents,2500);assert.equal(p.value.options[0].id,ids.option);
  assert.equal((await a.getCustomizationFieldsForProduct(ids.product)).value.configurationRevision,'1');
  assert.equal(p.value.fulfillment.requiresShipping,true);
  assert.ok(c.calls.filter(x=>x.name==='read_catalog_authority').every(x=>x.args.p_project_id===env().LOCAL_COMMERCE_PROJECT_ID));
});
test('4.1 persistent configured handoff uses canonical selection and rejects stale configuration',async()=>{
  const a=new LocalCatalogAuthority(env(),client());
  const handoff={productId:ids.product,variantId:ids.variant,skuCode:'SYNTHETIC-KEEPSAKE-S',selectedOptions:[{optionId:ids.option,valueId:ids.value}],configurationRevision:'1',customizationValues:[]};
  const deps={catalogRepository:a.repository,customizationFieldRepository:a,receiptRepository:{async findByReceiptId(){throw Error('Text-only must not read receipts');}}};
  const result=await acceptConfiguredItemHandoff({rawInput:handoff,verifiedOwnerId:null,observedAt:new Date(now).toISOString()},deps);
  assert.equal(result.status,'accepted');
  assert.equal((await acceptConfiguredItemHandoff({rawInput:{...handoff,configurationRevision:'old'},verifiedOwnerId:null,observedAt:new Date(now).toISOString()},deps)).status,'rejected');
});
test('4.1 forbidden modes and remote/project configuration fail before client construction',async()=>{
  for(const overrides of [{NODE_ENV:'production'},{NODE_ENV:'staging'},{NODE_ENV:'unknown'},{LOCAL_COMMERCE_API_URL:'https://example.com'},{LOCAL_COMMERCE_PROJECT_ID:'other-project'},{CART_SOURCE:'local_fake'}]){
    const c=client(); assert.equal((await new LocalCatalogAuthority(env(overrides),c).readSnapshot()).status,'source_failure');assert.equal(c.calls.length,0);
  }
});
test('4.1 wrong marker, cross-project rows and DB outage never return fallback',async()=>{
  for(const [data,options] of [[rows(),{badMarker:true}],[rows(),{outage:true}],[{...rows(),projectId:'other'},{}]]) {
    assert.equal((await new LocalCatalogAuthority(env(),client(data,options)).readSnapshot()).status,'source_failure');
  }
  const data=rows();data.variants[0].project_id='other';assert.equal((await new LocalCatalogAuthority(env(),client(data)).readSnapshot()).status,'source_failure');
});
test('4.1 stale row versions, duplicate/current and mismatched field revisions fail closed',async()=>{
  const a=new LocalCatalogAuthority(env(),client());assert.equal((await a.readSnapshot({[`variants:${ids.variant}`]:99})).status,'source_failure');
  for(const mutate of [r=>r.configurations[0].definition.configurationRevision='2',r=>r.configurations.push(structuredClone(r.configurations[0])),r=>r.configurations[0].definition.fields[0].configurationRevision='2']){
    const data=rows();mutate(data);assert.equal((await new LocalCatalogAuthority(env(),client(data)).readSnapshot()).status,'source_failure');
  }
});
test('4.1 default, fixture, local_fake and independent disabled Checkout are preserved',async()=>{
  assert.equal(readProductSource({NODE_ENV:'test'}),'supabase');assert.equal(readProductSource({NODE_ENV:'test',PHOTOGIFT_PRODUCT_SOURCE:'fixture'}),'fixture');
  assert.equal((await createServerCatalogRepository({NODE_ENV:'test',PHOTOGIFT_PRODUCT_SOURCE:'fixture'})).value.source,'fixture');
  assert.equal(readLocalCheckoutConfig(env(),'test').source,'disabled');assert.equal(readLocalCheckoutConfig({LOCAL_CHECKOUT_SOURCE:'local_fake'},'test').source,'local_fake');
  for(const mode of ['production','staging','unknown'])assert.throws(()=>readLocalCheckoutConfig(checkoutEnv(),mode));
});
test('4.1 explicitly fake Admin remains independent from persistent Catalog',async()=>{
  const a=new LocalCatalogAuthority(env({ADMIN_ACCEPTANCE_SOURCE:'local_fake'}),client());
  const before=await a.repository.findPublicProductById(ids.product);
  const {LocalAdminCatalogState}=await import('../app/infrastructure/catalog/local-admin-catalog-runtime.server.ts');
  const state=new LocalAdminCatalogState();
  assert.equal(before.status,'found');
  const fake=state.snapshotCatalog();
  fake.products[0]={...fake.products[0],name:'Admin fake mutation'};
  assert.equal(state.commitCatalog(fake).ok,true);
  assert.equal(state.snapshotCatalog().products.find(p=>p.id===fake.products[0].id).name,'Admin fake mutation');
  assert.deepEqual(await a.repository.findPublicProductById(ids.product),before);
});
test('4.1 shipping is bounded and tax remains exactly inactive/null',async()=>{
  const a=new LocalCheckoutRuleAuthority(checkoutEnv(),client());
  const result=await a.evaluate(input,now);assert.equal(result.status,'found');assert.equal(result.value.shipping.amountCents,500);
  assert.deepEqual(result.value.tax,{status:'not_activated',amountCents:null});
  assert.equal((await a.evaluate({...input,country:'ZZ'},now)).value.shipping.status,'unsupported');
  assert.equal((await a.evaluate({...input,requiresShipping:false,country:undefined,method:undefined},now)).value.shipping.status,'not_applicable');
});
test('4.1 coupon four statuses preserve zero discount for non-valid selectors',async()=>{
  const a=new LocalCheckoutRuleAuthority(checkoutEnv(),client());
  for(const [patch,time,status,amount] of [[{},now,'valid',500],[{couponCode:'UNKNOWN'},now,'invalid',0],[{},Date.parse('2027-01-01'),'expired',0],[{subtotalCents:100},now,'not_applicable',0]]){
    const result=await a.evaluate({...input,...patch,discountAmount:999999},time);assert.equal(result.status,'found');assert.equal(result.value.coupon.status,status);assert.equal(result.value.coupon.discountCents,amount);
  }
});
test('4.1 unavailable, malformed, stale and duplicate rules fail closed',async()=>{
  for(const mutate of [r=>r.rules[0].definition.amountCents=-1,r=>r.rules[1].definition.ruleRevision=2,r=>r.rules[1].definition.discountValue=101]){
    const data=rows();mutate(data);assert.equal((await new LocalCheckoutRuleAuthority(checkoutEnv(),client(data)).evaluate(input,now)).status,'unavailable');
  }
  assert.equal((await new LocalCheckoutRuleAuthority(checkoutEnv(),client(rows(),{outage:true})).evaluate(input,now)).status,'unavailable');
  assert.equal((await new LocalCheckoutRuleAuthority(checkoutEnv(),client()).evaluate({...input,expectedVersions:{[`rules:${ids.coupon}`]:2}},now)).status,'unavailable');
  assert.equal((await new LocalCheckoutRuleAuthority(env(),client()).evaluate(input,now)).status,'unavailable');
});
test('4.1 read-only source adds no Supplier identity, public seed or price mutation',()=>{
  const source=readFileSync(new URL('../app/infrastructure/local-commerce/local-catalog-authority.server.ts',import.meta.url),'utf8');
  assert.doesNotMatch(source,/selectedSpecificationKey|SupplierOffer|\.insert\(|\.update\(|local-admin-catalog|development-catalog/);
  const sql=readFileSync(new URL('../local/commerce/migrations/0007_local-commerce-catalog-authority.sql',import.meta.url),'utf8');
  assert.match(sql,/security definer\s+set search_path = local_commerce, pg_catalog/);
  assert.match(sql,/revoke all on function local_commerce.read_catalog_authority\(text,text\) from public,anon,authenticated/);
  assert.match(sql,/enable row level security/);
});
