import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './local-order-purchase-facts.test.mjs';
import { prepareLocalOrderPurchaseFacts as prepare } from '../app/application/local-order-purchase-facts.server.ts';
import { parsePersistentPurchaseFulfillment as parse } from '../app/application/local-persistent-fulfillment-authority.server.ts';
import { parseProductFulfillmentConfig } from '../app/domain/catalog/fulfillment.ts';
import { parsePersistentOrderStructuralInput } from '../app/application/local-order-creation-context.server.ts';
import { parseCanonicalPersistentOrderItem } from '../app/application/local-order-history.server.ts';
import { LocalCatalogAuthority } from '../app/infrastructure/local-commerce/local-catalog-authority.server.ts';
import { catalogDatabaseRows, catalogTestEnvironment, offlineCatalogClient } from './fixtures/local-persistent-catalog.mjs';

for (const physical of [true,false]) for (const policy of [true,false]) {
  test(`${physical?'physical':'digital'} selected explicit ${policy} remains exact`,()=>{
    const x=fixture();
    Object.assign(x.catalog.fulfillmentConfigs[0],{fulfillmentType:physical?'physical':'digital',requiresShipping:physical});
    x.purchasedFulfillments['product-a']={...x.catalog.fulfillmentConfigs[0],requiresProductionPreview:policy};
    x.lines[0].summary.fulfillmentType=physical?'physical':'digital';x.shippingCents=physical?7:0;
    const r=prepare(x);assert.equal(r.status,'found');assert.equal(r.value.items[0].fulfillment.requiresProductionPreview,policy);
  });
}
test('missing selected policy blocks new purchase without default',()=>{
  const x=fixture();delete x.purchasedFulfillments['product-a'].requiresProductionPreview;
  assert.equal(prepare(x).status,'unavailable');
});
test('null/string/number/array malformed policy blocks new purchase',()=>{
  for(const value of [null,'true','false',0,1,[],{}]) {const x=fixture();x.purchasedFulfillments['product-a'].requiresProductionPreview=value;assert.equal(prepare(x).status,'unavailable');}
});
test('browser cannot submit preview policy as Order input',()=>{
  const body={creationAttemptId:'attempt-test-12345678',email:'synthetic@example.invalid',shippingMethod:'local_standard',couponCode:''};
  assert.ok(parsePersistentOrderStructuralInput(body));
  for(const policy of [true,false])assert.equal(parsePersistentOrderStructuralInput({...body,requiresProductionPreview:policy}),null);
});
test('persistent extension does not weaken shared strict parser or permit other unknown fields',()=>{
  const x=fixture().purchasedFulfillments['product-a'];
  assert.equal(parseProductFulfillmentConfig(x).ok,false);assert.equal(parse(x).status,'found');
  assert.equal(parse({...x,arbitraryField:true}).status,'unavailable');
});
test('fulfillment input must be a record',()=>{for(const value of [null,[],false,'physical'])assert.equal(parse(value).status,'unavailable');});
test('mixed items retain independent booleans',()=>{
  const x=fixture(), second=structuredClone(x.lines[0]);second.cartLine.lineId='line-b';second.summary.lineId='line-b';
  const p={...x.catalog.products[0],id:'product-b'},v={...x.catalog.variants[0],id:'variant-b',productId:p.id};
  x.catalog.products.push(p);x.catalog.variants.push(v);
  const f={...x.catalog.fulfillmentConfigs[0],id:'fulfillment-b',productId:p.id};x.catalog.fulfillmentConfigs.push(f);
  x.purchasedFulfillments[p.id]={...f,requiresProductionPreview:false};
  x.configurations.push({id:'config-b',product_id:p.id,revision:1,definition:{productId:p.id,configurationRevision:'1',fields:[]}});
  Object.assign(x.versions,{'products:product-b':1,'variants:variant-b':1,'configurations:config-b':1});
  Object.assign(second.handoff,{productId:p.id,variantId:v.id});Object.assign(second.summary,{productId:p.id,variantId:v.id});x.lines.push(second);
  const r=prepare(x);assert.equal(r.status,'found');assert.deepEqual(r.value.items.map(i=>i.fulfillment.requiresProductionPreview),[true,false]);
});
test('quantity greater than one still has one purchased policy per stable line',()=>{
  const r=prepare(fixture());assert.equal(r.status,'found');assert.equal(r.value.items.length,1);assert.equal(r.value.items[0].quantity,2);assert.equal(r.value.items[0].fulfillment.requiresProductionPreview,true);
});
test('Product version remains in protected purchase set',()=>{
  const x=fixture();delete x.versions['products:product-a'];assert.equal(prepare(x).status,'unavailable');
});
test('post-prepare Catalog policy mutation cannot rewrite detached purchase facts',()=>{
  const x=fixture(),r=prepare(x);assert.equal(r.status,'found');x.purchasedFulfillments['product-a'].requiresProductionPreview=false;
  assert.equal(r.value.items[0].fulfillment.requiresProductionPreview,true);assert.ok(Object.isFrozen(r.value.items[0].fulfillment));
});
test('legacy missing snapshot cannot gain policy from current Catalog',()=>{
  const x=fixture(),r=prepare(x),item=structuredClone(r.value.items[0]);delete item.fulfillment.requiresProductionPreview;
  const read=()=>parseCanonicalPersistentOrderItem({orderId:'order-a',orderItemId:'item-a',publicReference:'FM-LOCAL-0123456789ABCDEF',purchasedItem:item});
  assert.equal(read().status,'unavailable');x.purchasedFulfillments['product-a'].requiresProductionPreview=true;assert.equal(read().status,'unavailable');
});
test('unrelated legacy Product does not poison persistent Catalog browsing',async()=>{
  const rows=catalogDatabaseRows();const r=await new LocalCatalogAuthority(catalogTestEnvironment(),offlineCatalogClient(rows)).readSnapshot();
  assert.equal(r.status,'found');assert.equal(parse(r.value.purchasedFulfillments[rows.products[0].id]).status,'unavailable');
});
test('persistent browsing accepts extension but shared projection contains only original fields',async()=>{
  const rows=catalogDatabaseRows();rows.products[0].fulfillment_definition.requiresProductionPreview=false;
  const r=await new LocalCatalogAuthority(catalogTestEnvironment(),offlineCatalogClient(rows)).readSnapshot();
  assert.equal(r.status,'found');assert.equal(Object.hasOwn(r.value.dataSet.fulfillmentConfigs[0],'requiresProductionPreview'),false);
  assert.equal(parseProductFulfillmentConfig(r.value.dataSet.fulfillmentConfigs[0]).ok,true);
});
