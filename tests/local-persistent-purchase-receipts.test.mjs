import test from 'node:test';
import assert from 'node:assert/strict';
import {persistentPurchaseReceipts,persistentOwnerVerifier} from '../app/server/local-persistent-purchase-authority.server.ts';
import {createLocalPersistentMediaAuthority} from '../app/infrastructure/local-commerce/local-persistent-media-authority.server.ts';
import {catalogTestEnvironment} from './fixtures/local-persistent-catalog.mjs';

const env=catalogTestEnvironment({CART_SOURCE:'local_persistent',CUSTOMER_AUTH_SOURCE:'local_persistent',CUSTOMER_UPLOAD_SOURCE:'local_persistent'});
const owner={kind:'guest',projectId:env.LOCAL_COMMERCE_PROJECT_ID,ownerId:'server-verified-guest',expiresAt:Math.floor(Date.now()/1000)+3600};
const verify=async()=>({owner,expiresAt:owner.expiresAt});
test('purchase receipt read rejects owner mismatch before any provider',async()=>{
  const r=persistentPurchaseReceipts(env,verify,[]);
  assert.deepEqual(await r.findOwnedReceipt(crypto.randomUUID(),'browser-other-owner'),{status:'not_found'});
});
test('receipt selector absent from parsed handoff cannot authorize lookup',async()=>{
  const r=persistentPurchaseReceipts(env,verify,[{ownerId:owner.ownerId,receiptId:crypto.randomUUID()}]);
  assert.deepEqual(await r.findOwnedReceipt(crypto.randomUUID(),owner.ownerId),{status:'not_found'});
});
test('missing, invalid and expired authority never construct a receipt fallback',async()=>{
  for(const verifier of [async()=>null,async()=>({owner,expiresAt:1})]){
    const m=createLocalPersistentMediaAuthority(env,verifier);
    assert.notEqual((await m.readConfirmedReceipt(crypto.randomUUID(),{productId:'p',fieldId:'f',configurationRevision:'1'})).status,'found');
  }
});
test('purchase owner authority ignores browser owner query/body and rejected runtime',async()=>{
  for(const mode of ['production','staging','unknown']){
    const request=new Request('http://localhost/api/cart?ownerId=forged');
    assert.equal(await persistentOwnerVerifier(request,{...env,NODE_ENV:mode})(),null);
  }
});
