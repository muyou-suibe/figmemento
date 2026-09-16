import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './local-order-purchase-facts.test.mjs';
import {prepareLocalOrderPurchaseFacts} from '../app/application/local-order-purchase-facts.server.ts';
import {validatePersistentHistoryModel} from '../app/application/local-order-consumer-projections.server.ts';
import {persistentPhotoReviewApplicability as applicability, persistentPhotoReviewGate as gate} from '../app/application/local-persistent-photo-review.server.ts';

const orderId='11111111-1111-4111-8111-111111111111';
function raw({mediaCount=0,preview=true,quantity=1,index=1}={}) {
  const x=fixture();
  x.lines[0].cartLine.quantity=quantity;x.lines[0].summary.quantity=quantity;
  x.lines[0].summary.lineSubtotalCents=101*quantity;
  x.purchasedFulfillments['product-a'].requiresProductionPreview=preview;
  if(mediaCount) {
    x.configurations[0].definition.fields=[{id:'image-field',productId:'product-a',code:'photo',label:'Photo',kind:'image',required:true,isActive:true,position:0,configurationRevision:'1',
      constraints:{allowedMimeTypes:['image/png'],maxBytes:5000000,minDimensions:{width:1,height:1},minImageCount:1,maxImageCount:4,cropEnabled:true}}];
    x.lines[0].handoff.customizationValues=[{fieldId:'image-field',fieldCode:'photo',kind:'image',images:Array.from({length:mediaCount},(_,i)=>({receiptId:`33333333-3333-4333-8333-${String(index*10+i).padStart(12,'0')}`}))}];
  }
  const prepared=prepareLocalOrderPurchaseFacts(x);assert.equal(prepared.status,'found');
  return {orderId,orderItemId:`22222222-2222-4222-8222-${String(index).padStart(12,'0')}`,
    publicReference:'FM-LOCAL-0123456789ABCDEF',createdAt:'2026-09-13T00:00:00Z',orderLifecycle:'paid',itemSequence:index-1,contact:{},purchasedItem:prepared.value.items[0]};
}
function history(options){const r=validatePersistentHistoryModel(raw(options));assert.equal(r.status,'found');return r.value;}

for(const mediaCount of [0,1])for(const preview of [false,true])test(`independent purchased gates: media=${mediaCount}, preview=${preview}`,()=>{
  const item=history({mediaCount,preview}), p=applicability([item]);assert.equal(p.status,'found');
  assert.deepEqual(p.value.applicableItemIds,mediaCount?[item.orderItemId]:[]);
  assert.deepEqual(p.value.previewRequiredItemIds,preview?[item.orderItemId]:[]);
  assert.equal(gate([item],[]).value.passed,mediaCount===0);
});
test('quantity 3 and multiple media still require exactly one stable-item review',()=>{
  const item=history({mediaCount:2,quantity:3});assert.equal(applicability([item]).value.applicableItemIds.length,1);
  assert.equal(gate([item],[{orderId,orderItemId:item.orderItemId,status:'approved'}]).value.passed,true);
});
test('mixed items and two distinct identically configured items remain independent',()=>{
  const a=history({mediaCount:2,index:1}), b=history({mediaCount:2,index:2}), c=history({index:3});
  assert.deepEqual(applicability([a,b,c]).value.applicableItemIds,[a.orderItemId,b.orderItemId]);
  assert.equal(gate([a,b,c],[{orderId,orderItemId:a.orderItemId,status:'approved'}]).value.passed,false);
});
test('missing/malformed media and incomplete multi-media associations are unavailable, not empty',()=>{
  for(const media of [undefined,null,{},'[]']) {
    const x=structuredClone(raw());if(media===undefined)delete x.purchasedItem.media;else x.purchasedItem.media=media;
    assert.equal(validatePersistentHistoryModel(x).status,'unavailable');
  }
  const x=structuredClone(raw({mediaCount:2}));x.purchasedItem.media.pop();assert.equal(validatePersistentHistoryModel(x).status,'unavailable');
});
test('pending and rejected block; approved does not satisfy independent preview requirement',()=>{
  const item=history({mediaCount:1});
  for(const status of ['pending','rejected','approved']) {
    const result=gate([item],[{orderId,orderItemId:item.orderItemId,status}]);
    assert.equal(result.value.passed,status==='approved');assert.deepEqual(result.value.previewRequiredItemIds,[item.orderItemId]);
  }
});
test('no fabricated review for empty media; no duplicate, foreign or unknown state',()=>{
  const empty=history(), image=history({mediaCount:1});
  const review={orderId,orderItemId:image.orderItemId,status:'approved'};
  assert.equal(gate([empty],[review]).status,'unavailable');
  assert.equal(gate([image],[review,review]).status,'unavailable');
  assert.equal(gate([image],[{...review,orderId:'foreign'}]).status,'unavailable');
  assert.equal(gate([image],[{...review,status:'auto_approved'}]).status,'unavailable');
});
test('only validated canonical input; no browser cast, duplicate item or cross-Order grouping',()=>{
  const a=history({mediaCount:1}), other=structuredClone(raw({index:2}));other.orderId='44444444-4444-4444-8444-444444444444';
  assert.equal(applicability([structuredClone(a)]).status,'unavailable');
  assert.equal(applicability([a,a]).status,'unavailable');
  assert.equal(applicability([a,validatePersistentHistoryModel(other).value]).status,'unavailable');
  assert.equal(applicability([]).status,'unavailable');
});
test('projection is read-only and cannot create review or grant byte access',()=>{
  const a=history({mediaCount:2}), before=structuredClone(a);const p=applicability([a]);
  assert.deepEqual(a,before);assert.deepEqual(Object.keys(p.value).sort(),['applicableItemIds','orderId','previewRequiredItemIds']);
  assert.ok(Object.isFrozen(p.value.applicableItemIds));
});
