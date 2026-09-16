import assert from 'node:assert/strict';
import test from 'node:test';
import {createLocalPersistentDraftPort} from '../app/infrastructure/local-commerce/local-persistent-draft-adapter.server.ts';
import {catalogTestEnvironment,ids} from './fixtures/local-persistent-catalog.mjs';

const env=catalogTestEnvironment({CART_SOURCE:'local_persistent',CUSTOMER_AUTH_SOURCE:'local_persistent'});
const expiresAt=Math.floor(Date.now()/1000)+3600;
const owner={kind:'guest',projectId:env.LOCAL_COMMERCE_PROJECT_ID,ownerId:'offline-draft-verified-owner-123456789',expiresAt};
const verifyOwner=async()=>({owner,expiresAt});
test('unsafe mode/project/expired owner never constructs network authority',async()=>{
 for(const patch of [{NODE_ENV:'production'},{NODE_ENV:'staging'},{NODE_ENV:'unknown'},{CART_SOURCE:'local_fake'},
  {PHOTOGIFT_PRODUCT_SOURCE:'fixture'},{LOCAL_COMMERCE_API_URL:'https://example.invalid'}]){
  assert.equal((await createLocalPersistentDraftPort({environment:{...env,...patch},verifyOwner})).status,'unavailable');
 }
 for(const expiry of [0,NaN,Infinity])assert.equal((await createLocalPersistentDraftPort({environment:env,verifyOwner:async()=>({owner,expiresAt:expiry})})).status,'unavailable');
});
test('commands reverify owner; revoked authority has no cached authorization',async()=>{
 let active=true;const p=await createLocalPersistentDraftPort({environment:env,verifyOwner:async()=>active?{owner,expiresAt}:null});
 assert.equal(p.status,'ready');active=false;
 assert.equal((await p.port.read({authority:p.authority,draftId:ids.product})).status,'unavailable');
});
test('CAS is required and browser-owned identity cannot replace verified authority',async()=>{
 const p=await createLocalPersistentDraftPort({environment:env,verifyOwner});assert.equal(p.status,'ready');
 const command={authority:p.authority,draftId:ids.product,idempotency:{key:'test',fingerprint:'test'},slots:[]};
 assert.equal((await p.port.save(command)).status,'unavailable');
 assert.equal((await p.port.save({...command,expectedVersion:1,authority:{...p.authority,ownerId:'forged'}})).status,'unavailable');
});
test('canonical crop parser rejects non-finite/out-of-bounds before any DB request',async()=>{
 const p=await createLocalPersistentDraftPort({environment:env,verifyOwner});assert.equal(p.status,'ready');
 const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('offline sentinel');};
 try{
  for(const crop of [{x:NaN,y:0,width:1,height:1},{x:0,y:Infinity,width:1,height:1},{x:0,y:0,width:0,height:1},{x:0.5,y:0,width:0.8,height:1}]){
   const r=await p.port.save({authority:p.authority,draftId:ids.product,expectedVersion:1,idempotency:{key:'test',fingerprint:'test'},slots:[{fieldId:ids.field,receiptReference:ids.field,crop}]});assert.equal(r.status,'unavailable');
  }
  assert.equal(calls,0);
 }finally{globalThis.fetch=original;}
});
