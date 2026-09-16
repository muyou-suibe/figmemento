import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createLocalPersistentMediaAuthority} from '../app/infrastructure/local-commerce/local-persistent-media-authority.server.ts';
import {persistentMediaHttp} from '../app/server/local-persistent-media-http.server.ts';
import {catalogTestEnvironment,ids} from './fixtures/local-persistent-catalog.mjs';
const env=catalogTestEnvironment({CUSTOMER_AUTH_SOURCE:'local_persistent',CUSTOMER_UPLOAD_SOURCE:'local_persistent',CART_SOURCE:'local_persistent'});
const expiry=Math.floor(Date.now()/1000)+3600;
const owner={kind:'guest',projectId:env.LOCAL_COMMERCE_PROJECT_ID,ownerId:'offline-media-verified-owner-123456789',expiresAt:expiry};
const verifyOwner=async()=>({owner,expiresAt:expiry});

test('persistent media unsafe environment/source matrix performs no network call',async()=>{
 const previous=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('network sentinel');};
 try{for(const patch of [{NODE_ENV:'production'},{NODE_ENV:'staging'},{NODE_ENV:'unknown'},{CUSTOMER_UPLOAD_SOURCE:'local_fake'},
  {CART_SOURCE:'local_fake'},{PHOTOGIFT_PRODUCT_SOURCE:'fixture'},{LOCAL_COMMERCE_API_URL:'https://remote.invalid'}]){
   const p=createLocalPersistentMediaAuthority({...env,...patch},verifyOwner);assert.equal((await p.read(ids.field)).status,'unavailable');
  }assert.equal(calls,0);
 }finally{globalThis.fetch=previous;}
});
test('expired/revoked/wrong project authority cannot construct DB or Storage',async()=>{
 const previous=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('network sentinel');};
 try{for(const v of [async()=>null,async()=>({owner,expiresAt:0}),async()=>({owner:{...owner,projectId:'wrong'},expiresAt:expiry})]){
  assert.equal((await createLocalPersistentMediaAuthority(env,v).read(ids.field)).status,'unavailable');
 }assert.equal(calls,0);}finally{globalThis.fetch=previous;}
});
test('server-generated identities and finite crop/CAS are required before network',async()=>{
 const p=createLocalPersistentMediaAuthority(env,verifyOwner);
 const previous=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('network sentinel');};
 try{for(const patch of [{expectedVersion:undefined},{expectedVersion:0},{draftId:'browser-invented'},{slotId:'position-0'},
  {crop:{x:NaN,y:0,width:1,height:1}},{crop:{x:0,y:0,width:0,height:1}}]){
  assert.equal((await p.accept({draftId:ids.product,fieldId:ids.field,expectedVersion:1,bytes:new Uint8Array([1]),...patch})).status,'rejected');
 }assert.equal(calls,0);}finally{globalThis.fetch=previous;}
});
test('sole persistent upload rejects origin before ownership/network/body',async()=>{
 const previous=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('network sentinel');};
 try{const request=new Request('http://localhost/api/uploads',{method:'POST',headers:{origin:'https://wrong.invalid'},body:'not multipart'});
  assert.equal((await persistentMediaHttp(request,'upload',env)).status,403);assert.equal(calls,0);
 }finally{globalThis.fetch=previous;}
});
test('media SQL has fixed-search-path restricted RPC and subordinate stable reservations',()=>{
 const sql=readFileSync('local/commerce/migrations/0011_local-commerce-media-operations.sql','utf8');
 assert.match(sql,/foreign key\(project_id,draft_id,owner_id\) references local_commerce.configuration_drafts/);
 assert.match(sql,/unique\(project_id,slot_id,source_generation,crop_revision\)/);
 assert.match(sql,/p_expected_version<>o.version/);assert.match(sql,/s.source_generation<>o.source_generation/);
 assert.match(sql,/set search_path=pg_catalog,local_commerce/);
 assert.match(sql,/revoke all on function local_commerce.media_operation_command[^;]+from public,anon,authenticated/);
 assert.match(sql,/draft_command_before_media[^;]+from public,anon,authenticated,service_role/);
 const publish=sql.slice(sql.indexOf("elsif p_command='publish'"),sql.indexOf('-- Extend the existing'));
 assert.doesNotMatch(publish,/insert into local_commerce.draft_media_links|update local_commerce.configuration_drafts/);
 assert.match(sql,/values\(p_project_id,op.slot_id,d.owner_id,d.id,op.receipt_id/);
});
