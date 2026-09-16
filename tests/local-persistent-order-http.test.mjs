import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {parsePersistentOrderStructuralInput,persistentOrderCreationContext} from '../app/application/local-order-creation-context.server.ts';
import {createLocalOrderCreateHttpHandler} from '../app/server/local-order-http.server.ts';
import {createPersistentOrderCapabilityCodec} from '../app/server/local-order-capability.server.ts';
import {resolveLocalPersistentComposition} from '../app/application/local-persistent-commerce-composition.server.ts';
import {catalogTestEnvironment} from './fixtures/local-persistent-catalog.mjs';

const input={creationAttemptId:'explicit-attempt-123456',email:'test@example.test'};
const environment=()=>catalogTestEnvironment({NODE_ENV:'test',LOCAL_ORDER_SOURCE:'local_persistent',LOCAL_CHECKOUT_SOURCE:'local_persistent',
  CART_SOURCE:'local_persistent',CUSTOMER_AUTH_SOURCE:'local_persistent',CUSTOMER_UPLOAD_SOURCE:'local_persistent',
  LOCAL_ORDER_CAPABILITY_SECRET:'12'.repeat(32),LOCAL_ORDER_CAPABILITY_TTL_SECONDS:'60'});
const req=(body=input,headers={})=>new Request('http://localhost:3000/api/local-orders',{method:'POST',
  headers:{origin:'http://localhost:3000','content-type':'application/json',...headers},body:JSON.stringify(body)});

test('creation context normalizes structure and hashes exact owner/Cart/version, never current Catalog',async()=>{
  const owner={projectId:'project',kind:'guest',ownerId:'opaque-guest'};
  const a=parsePersistentOrderStructuralInput({...input,firstName:' Buyer ',country:'us',shippingMethod:' standard '});
  const b=parsePersistentOrderStructuralInput({shippingMethod:'standard',country:'US',firstName:'Buyer',...input});
  const original=await persistentOrderCreationContext(a,owner,'cart',2);
  assert.deepEqual(await persistentOrderCreationContext(b,owner,'cart',2),original);
  for(const [who,id,version] of [[{...owner,projectId:'other'},'cart',2],[{...owner,ownerId:'other'},'cart',2],[{...owner,kind:'customer',customerId:'subject'},'cart',2],[owner,'other',2],[owner,'cart',3]]) {
    const changed=await persistentOrderCreationContext(a,who,id,version);assert.equal(changed.keyDigest,original.keyDigest);assert.notEqual(changed.contextDigest,original.contextDigest);
  }
  for(const version of [0,-1,1.5,NaN])assert.equal(await persistentOrderCreationContext(a,owner,'cart',version),null);
  assert.match(original.keyDigest,/^[a-f0-9]{64}$/);assert.match(original.contextDigest,/^[a-f0-9]{64}$/);
});

test('structural input rejects browser authority and raw capability fields',()=>{
  for(const key of ['ownerId','cartId','cartVersion','customerId','price','discountAmount','capability','sessionHash','storageLocator'])assert.equal(parsePersistentOrderStructuralInput({...input,[key]:'forged'}),null);
});

test('real handler retains fresh owner → structural context → committed probe → new eligibility order',()=>{
  const source=readFileSync(new URL('../app/server/local-persistent-order-http.server.ts',import.meta.url),'utf8');
  const sequence=['const cart = await readPersistentPurchaseCart','const verifiedOwner = await cart.verifyOwner','const context = await persistentOrderCreationContext','const probe = await','if (probe.value.status !== "not_found") return project(probe.value)','const baseline = await catalog.readSnapshot','line => evaluateLocalCheckoutLine(','const committed = await'];
  let previous=-1;for(const part of sequence){const index=source.indexOf(part);assert.ok(index>previous,part);previous=index;}
});

test('actual Order POST handler branches to persistent establishment before purchase invocation',async()=>{
  const env=environment(), old={...process.env};Object.assign(process.env,env);
  try{
    const composition=resolveLocalPersistentComposition(env,{requiredCapabilities:['order','checkout']});assert.equal(composition.status,'ready');
    let connections=0,purchases=0;
    const handler=createLocalOrderCreateHttpHandler({persistent:{
      connect:async()=>{connections++;return {status:'ready',composition:composition.value,adapter:{}};},
      purchase:async(_request,_input,_environment,_connection,cap)=>{purchases++;assert.match(cap.digest,/^[0-9a-f]{64}$/);assert.deepEqual(Object.keys(cap),['digest','expiresAtSeconds']);return Response.json({test:'purchase path reached'});},
    }});
    const codec=await createPersistentOrderCapabilityCodec(env,composition.value);
    const expired=await codec.issue(Math.floor(Date.now()/1000)-120);
    for(const token of [undefined,'malformed','a'.repeat(64),expired]){
      const r=await handler(req(input,token?{cookie:`figmemento-local-order-access=${token}`} : {}));
      assert.equal(r.status,204);assert.equal(await r.text(),'');assert.match(r.headers.get('set-cookie'),/HttpOnly; SameSite=Lax/);assert.equal(purchases,0);
    }
    const token=await codec.issue(Math.floor(Date.now()/1000));
    const r=await handler(req(input,{cookie:`figmemento-local-order-access=${token}`}));
    assert.equal(r.status,200);assert.equal(purchases,1);assert.equal(r.headers.has('set-cookie'),false);assert.equal(connections,5);
    assert.equal((await handler(req({...input,p_capability_hash:'a'.repeat(64)}))).status,400);
    assert.equal((await handler(req(input,{origin:'https://evil.test'}))).status,403);
    assert.equal(connections,5);
  }finally{for(const k of Object.keys(process.env))if(!(k in old))delete process.env[k];Object.assign(process.env,old);}
});

test('project/marker and forbidden source checks precede capability issuance',async()=>{
  const old={...process.env};Object.assign(process.env,environment());
  try{
    let calls=0;
    const handler=createLocalOrderCreateHttpHandler({persistent:{connect:async()=>{calls++;return {status:'unavailable',issues:[]};},purchase:async()=>{throw Error('must not run');}}});
    let r=await handler(req());assert.equal(r.status,503);assert.equal(r.headers.has('set-cookie'),false);assert.equal(calls,1);
    process.env.NODE_ENV='production';r=await handler(req());assert.equal(r.status,503);assert.equal(calls,1);
  }finally{for(const k of Object.keys(process.env))if(!(k in old))delete process.env[k];Object.assign(process.env,old);}
});
