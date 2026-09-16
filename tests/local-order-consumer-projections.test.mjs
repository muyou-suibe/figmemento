import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './local-order-purchase-facts.test.mjs';
import {prepareLocalOrderPurchaseFacts} from '../app/application/local-order-purchase-facts.server.ts';
import {validatePersistentHistoryModel,projectHistoryForAdmin,projectHistoryForFulfillment,projectHistoryForTracking,projectHistoryForDelivery,projectHistoryForSupplier} from '../app/application/local-order-consumer-projections.server.ts';
const raw=()=>({orderId:'11111111-1111-4111-8111-111111111111',orderItemId:'22222222-2222-4222-8222-222222222222',
  publicReference:'FM-LOCAL-0123456789ABCDEF',createdAt:'2026-09-13T00:00:00Z',orderLifecycle:'pending_payment',itemSequence:0,
  contact:{email:'test@example.invalid',country:'US',city:'Synthetic',addressLine1:'Synthetic fixture'},purchasedItem:prepareLocalOrderPurchaseFacts(fixture()).value.items[0]});
const common=['orderId','publicReference','createdAt','orderLifecycle','orderItemId','itemSequence'];
const cases=[
 ['Admin',projectHistoryForAdmin,[...common,'contact','product','variant','selectedOptions','quantity','pricing','configuration','customizationValues','fulfillment','media']],
 ['Fulfillment',projectHistoryForFulfillment,[...common,'quantity','fulfillmentType','requiresShipping','productionMode','leadTime','requiresProductionPreview','configuration','customizationValues','media']],
 ['Tracking',projectHistoryForTracking,[...common,'fulfillmentType','requiresShipping','requiresProductionPreview','destination']],
 ['Delivery',projectHistoryForDelivery,[...common,'fulfillmentType','requiresProductionPreview','configuration','customizationValues','media']],
];
for(const [name,project,keys] of cases)test(`${name}: exact allowlist, validated input only, no I/O/actor authority`,()=>{
 const r=validatePersistentHistoryModel(raw());assert.equal(r.status,'found');const p=project(r.value);assert.equal(p.status,'found');
 assert.deepEqual(Object.keys(p.value).sort(),keys.sort());assert.ok(Object.isFrozen(p.value));
 assert.equal(project({...r.value}).status,'unavailable');assert.equal(project(raw()).status,'unavailable');
 const allKeys=[];const scan=v=>{if(v&&typeof v==='object')for(const [k,c]of Object.entries(v)){allKeys.push(k);scan(c);}};scan(p.value);
 assert.ok(allKeys.every(k=>!/capability|session|ownerId|subjectHash|password|bucket|locator|signedUrl|storageKey|serviceRole|sql/i.test(k)));
});
test('Tracking omits email, configuration and media; no shipment is constructed',()=>{
 const p=projectHistoryForTracking(validatePersistentHistoryModel(raw()).value).value;
 assert.equal(p.destination.email,undefined);assert.equal(p.media,undefined);assert.equal(p.configuration,undefined);assert.equal(p.shipment,undefined);
});
test('Supplier remains explicitly unavailable even for a valid canonical item',()=>assert.equal(projectHistoryForSupplier(validatePersistentHistoryModel(raw()).value).status,'unavailable'));
test('missing persisted context is not inferred by a projector',()=>{
 for(const k of ['orderLifecycle','itemSequence','contact']){const x=raw();delete x[k];assert.equal(validatePersistentHistoryModel(x).status,'unavailable');}
});
test('preview false does not imply paid or production-ready',()=>{
 const x=raw();x.purchasedItem=structuredClone(x.purchasedItem);x.purchasedItem.fulfillment.requiresProductionPreview=false;
 const p=projectHistoryForFulfillment(validatePersistentHistoryModel(x).value).value;
 assert.equal(p.requiresProductionPreview,false);assert.equal(p.orderLifecycle,'pending_payment');assert.equal(p.productionReady,undefined);
});
test('bad pricing/tax and injected media access fields reject without projection',()=>{
 for(const change of [x=>x.purchasedItem.amounts.tax.amount=0,x=>x.purchasedItem.amounts.localArithmeticTotalCents=1,
 x=>x.purchasedItem.media=[{receiptId:'33333333-3333-4333-8333-333333333333',fieldId:'image',fieldCode:'photo',position:0,locator:'private'}]]){
 const x=structuredClone(raw());change(x);assert.equal(validatePersistentHistoryModel(x).status,'unavailable');}
});
