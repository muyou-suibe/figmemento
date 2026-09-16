import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createPersistentPreviewOperator} from '../app/server/local-persistent-preview-media.server.ts';
import {persistentPreviewHttp} from '../app/server/local-persistent-preview-http.server.ts';
import {catalogTestEnvironment} from './fixtures/local-persistent-catalog.mjs';
import {raw} from './local-persistent-preview-manifest.test.mjs';

const id='aaaaaaaa-aaaa-4aaa-8aaa-000000000001',owner='bbbbbbbb-bbbb-4bbb-8bbb-000000000001',fulfillment='cccccccc-cccc-4ccc-8ccc-000000000001';
const history=raw(),reference=history.publicReference,item=history.orderItemId;
// Offline transport fixtures, not trusted real-byte/DB acceptance evidence.
async function fixture(mode,fn) {
 const originalFetch=globalThis.fetch,old={...process.env};
 const env=catalogTestEnvironment({LOCAL_FULFILLMENT_SOURCE:'local_persistent',LOCAL_ORDER_SOURCE:'local_persistent',LOCAL_PAYMENT_SOURCE:'local_persistent',
   CUSTOMER_UPLOAD_SOURCE:'local_persistent',CART_SOURCE:'local_persistent',LOCAL_CHECKOUT_SOURCE:'local_persistent',CUSTOMER_AUTH_SOURCE:'local_persistent',
   LOCAL_FULFILLMENT_OPERATOR:'enabled',LOCAL_COMMERCE_IMAGE_HELPER_SECRET:'a'.repeat(43)});
 Object.assign(process.env,env);
 const calls=[],png=new Uint8Array([1,2,3,4]);
 globalThis.fetch=async(input,init={})=>{
   const url=String(input);calls.push({url,method:init.method});
   assert.ok(url.startsWith(env.LOCAL_COMMERCE_API_URL) || url.startsWith(env.LOCAL_COMMERCE_IMAGE_HELPER_URL),'no external URL');
   if(url.endsWith('/rpc/verify_project_identity'))return Response.json(true);
   if(url.endsWith('/rpc/fulfillment_preview_command')) {
     const args=JSON.parse(init.body);calls.at(-1).args=args;
     if(args.p_operation==='read')return Response.json({status:'found',value:{orderId:history.orderId,ownerId:owner,fulfillmentId:fulfillment,version:1,targetManifestVersion:1,items:[history]}});
     if(args.p_operation==='probe_reserve')return Response.json({status:'not_found'});
     if(args.p_operation==='reserve')return Response.json({status:'found',value:{previewMediaId:id,manifestVersion:1,state:'pending'}});
     if(args.p_operation==='acquire')return Response.json({status:'found',value:{project_id:env.LOCAL_COMMERCE_PROJECT_ID,owner_id:owner,order_id:history.orderId,
       fulfillment_id:fulfillment,id,manifest_version:1,order_item_id:item,lifecycle:mode==='new_publish'?'ready':'pending',
       content_digest:createHash('sha256').update(png).digest('hex'),content_type:'image/png',byte_size:4,width:1,height:1,
       object_locator:`production-preview/${history.orderId}/${id}.png`}});
     if(args.p_operation==='ready')return Response.json(mode==='db_failure'?{status:'unavailable'}:{status:'found',value:{previewMediaId:id,state:'ready'}});
     if(args.p_operation==='probe_publish')return Response.json(mode==='new_publish'?{status:'not_found'}:{status:'found',replayed:true,value:{manifestVersion:1}});
     if(args.p_operation==='publish')return Response.json({status:'found',value:{manifestVersion:1}});
     assert.fail('unexpected command '+args.p_operation);
   }
   if(url.endsWith('/process'))return mode==='helper_failure'?new Response('',{status:503}):Response.json({status:'processed',contentType:'image/png',byteSize:4,
     dimensions:{width:1,height:1},outputDimensions:{width:1,height:1},png:Buffer.from(png).toString('base64')});
   if(url.includes('/storage/v1/')) {
     if(init.method==='POST')return mode==='storage_failure'?Response.json({message:'failed'},{status:503}):Response.json({Key:'private'},{status:200});
     if(mode==='storage_failure')return Response.json({message:'missing'},{status:404});
     return new Response(mode==='bad_readback'?new Uint8Array([9,9]):png,{headers:{'content-type':'image/png'}});
   }
   assert.fail('unexpected transport '+url);
 };
 try {await fn({env,calls,png});} finally {
   globalThis.fetch=originalFetch;
   for(const key of Object.keys(process.env))if(!(key in old))delete process.env[key];
   Object.assign(process.env,old);
 }
}
for(const mode of ['helper_failure','storage_failure','bad_readback','db_failure'])test(`preview ${mode}: no false ready/publication`,async()=>{
 await fixture(mode,async({env,calls,png})=>{
   const op=await createPersistentPreviewOperator(reference,env);assert.ok(op);
   const result=await op.upload(item,'synthetic-upload-operation',1,png);assert.equal(result.status,'unavailable');
   assert.equal(calls.filter(x=>x.args?.p_operation==='publish').length,0);
   if(mode!=='db_failure')assert.equal(calls.filter(x=>x.args?.p_operation==='ready').length,0);
   assert.equal(calls.some(x=>x.method==='DELETE'),false);
 });
});
test('trusted helper/write/read-back precede ready; only server-derived metadata enters ready RPC',async()=>{
 await fixture('success',async({env,calls,png})=>{
   const op=await createPersistentPreviewOperator(reference,env);assert.ok(op);
   const result=await op.upload(item,'synthetic-upload-operation',1,png);assert.equal(result.status,'found',JSON.stringify(calls));
   const ready=calls.findIndex(x=>x.args?.p_operation==='ready'),write=calls.findIndex(x=>x.url.includes('/storage/v1/')&&x.method==='POST');
   assert.ok(ready>write && write>=0);const payload=calls[ready].args.p_input;
   assert.equal(payload.byteSize,4);assert.equal(payload.width,1);assert.match(payload.contentDigest,/^[a-f0-9]{64}$/);
   assert.equal('object_locator' in payload,false);
 });
});
test('exact publication replay precedes new helper or Storage eligibility',async()=>{
 await fixture('success',async({env,calls})=>{
   const op=await createPersistentPreviewOperator(reference,env);assert.ok(op);
   assert.equal((await op.publish('publication-operation',1,[{orderItemId:item,previewMediaId:id}])).replayed,true);
   assert.equal(calls.some(x=>x.url.includes('/storage/')||x.url.endsWith('/process')),false);
 });
});
test('new publication verifies real acquired metadata and bytes before command',async()=>{
 await fixture('new_publish',async({env,calls})=>{
   const op=await createPersistentPreviewOperator(reference,env);assert.ok(op);
   assert.equal((await op.publish('new-publication-operation',1,[{orderItemId:item,previewMediaId:id}])).status,'found');
   assert.equal(calls.filter(c=>c.args?.p_operation==='publish').length,1);
 });
});
test('customer cookie alone cannot construct preview operator or service transport',async()=>{
 await fixture('success',async({env,calls})=>{
   process.env.LOCAL_FULFILLMENT_OPERATOR='disabled';
   assert.equal(await createPersistentPreviewOperator(reference,env),null);assert.equal(calls.length,0);
 });
});
test('HTTP rejects client ready/metadata/version allocation and never invokes a mutation',async()=>{
 await fixture('success',async({calls})=>{
   const r=await persistentPreviewHttp(new Request('http://localhost/api/preview',{method:'POST',headers:{origin:'http://localhost','content-type':'application/json'},
     body:JSON.stringify({actionId:'publication-operation',expectedVersion:1,entries:[],manifestVersion:4,ready:true})}),reference);
   assert.equal(r.status,400);assert.equal(calls.some(x=>x.args&&x.args.p_operation!=='read'),false);
 });
});
