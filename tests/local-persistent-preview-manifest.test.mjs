import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './local-order-purchase-facts.test.mjs';
import {prepareLocalOrderPurchaseFacts} from '../app/application/local-order-purchase-facts.server.ts';
import {validatePersistentHistoryModel} from '../app/application/local-order-consumer-projections.server.ts';
import {preparePersistentPreviewManifest as prepare} from '../app/application/local-persistent-preview-manifest.server.ts';

const orderId='11111111-1111-4111-8111-111111111111';
const fulfillmentId='99999999-9999-4999-8999-999999999999';
export function raw({mediaCount=0,preview=true,quantity=1,index=1}={}) {
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

function input(){
 const items=[history({preview:true,index:1}),history({preview:false,index:2}),history({preview:true,index:3})];
 const artifacts=items.filter(x=>x.fulfillment.requiresProductionPreview).map((x,i)=>({projectId:'project',ownerId:'owner',orderId,fulfillmentId,orderItemId:x.orderItemId,manifestVersion:1,previewMediaId:'aaaaaaaa-aaaa-4aaa-8aaa-'+String(i+1).padStart(12,'0'),state:'ready',digest:'a'.repeat(64),byteSize:100,width:10,height:10,contentType:'image/png'}));
 return {projectId:'project',ownerId:'owner',orderId,fulfillmentId,manifestVersion:1,items,artifacts};
}
test('one v1 covers precisely all required items, not disabled items',()=>{
 const x=input(),r=prepare(x);assert.equal(r.status,'found');assert.equal(r.value.entries.length,2);assert.equal(r.value.manifestVersion,1);assert.ok(Object.isFrozen(r.value.entries));
});
test('reject missing, extra disabled, duplicate and foreign item media',()=>{
 for(const mutate of [
  x=>x.artifacts.pop(),
  x=>x.artifacts.push({...x.artifacts[0],orderItemId:x.items[1].orderItemId}),
  x=>{x.artifacts[1]={...x.artifacts[0]};},
  x=>{x.artifacts[0].orderItemId='foreign';}
 ]){const x=input();mutate(x);assert.equal(prepare(x).status,'unavailable');}
});
test('reject wrong project/owner/Order/version and unready or unverified artifact',()=>{
 for(const patch of [{projectId:'foreign'},{ownerId:'foreign'},{orderId:'foreign'},{fulfillmentId:'foreign'},{manifestVersion:2},{state:'pending'},{digest:''},{byteSize:0},{width:0},{contentType:'image/jpeg'},{previewMediaId:'customer-receipt'}]){
  const x=input();Object.assign(x.artifacts[0],patch);assert.equal(prepare(x).status,'unavailable');
 }
});
test('no dummy manifest for all preview-disabled items; malformed history unavailable',()=>{
 const x=input();x.items=[history({preview:false})];x.artifacts=[];assert.equal(prepare(x).status,'unavailable');
 const y=input();y.items=structuredClone(y.items);assert.equal(prepare(y).status,'unavailable');
});
test('pure projection exposes no locator or digest and never mutates purchased facts',()=>{
 const x=input(),before=structuredClone(x);const r=prepare(x);assert.equal(r.status,'found');assert.deepEqual(x,before);
 for(const e of r.value.entries)assert.deepEqual(Object.keys(e).sort(),['contentType','height','orderItemId','previewMediaId','width']);
});
