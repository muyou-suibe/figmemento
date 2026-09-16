import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createLocalPersistentMediaAuthority,reconcileExactCopyPrepareConflict} from '../app/infrastructure/local-commerce/local-persistent-media-authority.server.ts';
import {catalogTestEnvironment} from './fixtures/local-persistent-catalog.mjs';
const env=catalogTestEnvironment({CUSTOMER_AUTH_SOURCE:'local_persistent',CART_SOURCE:'local_persistent',CUSTOMER_UPLOAD_SOURCE:'local_persistent'});
const input={sourceReceiptId:'51000000-0000-4000-8000-000000000001',targetDraftId:'51000000-0000-4000-8000-000000000002',idempotencyKey:'51000000-0000-4000-8000-000000000003',expectedVersion:1};
test('copy without fresh authority never constructs network fallback',async()=>{
 const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('network forbidden');};
 try {assert.equal((await createLocalPersistentMediaAuthority(env,async()=>null).copy(input)).status,'unavailable');assert.equal(calls,0);}finally{globalThis.fetch=original;}
});
test('copy rejects malformed selectors and missing CAS before authority',async()=>{
 let calls=0;const media=createLocalPersistentMediaAuthority(env,async()=>{calls++;return null;});
 for(const bad of [{...input,expectedVersion:0},{...input,expectedVersion:1.5},{...input,sourceReceiptId:'https://example.test/image'},{...input,targetDraftId:'/private/file'},{...input,idempotencyKey:'bad'}])assert.equal((await media.copy(bad)).status,'unavailable');
 assert.equal(calls,0);
});
test('copy rejects wrong project and expired owner without external I/O',async()=>{
 const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('network forbidden');};
 try {for(const owner of [{kind:'guest',projectId:'other',ownerId:'opaque-owner',expiresAt:Date.now()/1000+60},{kind:'guest',projectId:env.LOCAL_COMMERCE_PROJECT_ID,ownerId:'opaque-owner',expiresAt:1}])
  assert.equal((await createLocalPersistentMediaAuthority(env,async()=>({owner,expiresAt:owner.expiresAt})).copy(input)).status,'unavailable');assert.equal(calls,0);
 }finally{globalThis.fetch=original;}
});
test('copy SQL preserves Draft authority, original bytes and fresh owner/replay guards',()=>{
 const sql=readFileSync('local/commerce/migrations/0015_local-commerce-explicit-media-copy.sql','utf8');
 assert.match(sql,/lock_media_project/);assert.match(sql,/binding\.expected_version is distinct from p_expected_version/);
 assert.match(sql,/receipt_reference=p_source_receipt/);assert.match(sql,/owner_id=owner_uuid/);
 assert.match(sql,/source\.original_locator/);assert.match(sql,/source\.original_object_id/);
 assert.match(sql,/target_operation_id/);assert.match(sql,/media_slot_reservations/);
 assert.match(sql,/media_operation_before_cleanup\(text,text,text,text,uuid,timestamptz,text,uuid,uuid,uuid,integer,jsonb\)/);
 assert.match(sql,/if o\.operation_kind not in \(''upload'',''copy''\) and not exists/);
 assert.match(sql,/unexpected media publication implementation/);
 assert.doesNotMatch(sql,/update\s+local_commerce\.(orders|carts|cart_lines)|delete\s+from|create table/i);
 assert.match(sql,/security definer set search_path=pg_catalog,local_commerce/);
 assert.match(sql,/revoke all on function local_commerce\.media_copy_command[^;]+from public,anon,authenticated/);
 assert.match(sql,/grant execute on function local_commerce\.media_copy_command[^;]+to service_role/);
});

const copyOperation={
 id:'52000000-0000-4000-8000-000000000001',project_id:env.LOCAL_COMMERCE_PROJECT_ID,
 draft_id:'52000000-0000-4000-8000-000000000002',slot_id:'52000000-0000-4000-8000-000000000003',
 product_id:'52000000-0000-4000-8000-000000000004',field_key:'image-field',source_generation:1,crop_revision:1,
 configuration_revision:3,version:1,lifecycle:'pending',operation_kind:'copy',output_facts:null,
 normalized_input:{kind:'copy',fieldId:'image-field',configurationRevision:3,digest:'a'.repeat(64),contentType:'image/png',
  byteSize:12,dimensions:{width:2,height:2}},
 original_locator:`${env.LOCAL_COMMERCE_PROJECT_ID}/media/source/original`,
 derivative_locator:`${env.LOCAL_COMMERCE_PROJECT_ID}/media/52000000-0000-4000-8000-000000000001/derivative`,
};
const copyOutput={digest:'b'.repeat(64),byteSize:16,dimensions:{width:2,height:2}};
const stored=(operation,receipt=null)=>({status:'found',operation,receipt});

test('exact copy prepare race performs one bounded lookup and accepts only the canonical advanced operation',async()=>{
 let lookups=0;
 const pending=await reconcileExactCopyPrepareConflict({canonical:copyOperation,output:copyOutput,lookup:async()=>{
  lookups++;return stored({...copyOperation,version:2,output_facts:copyOutput});
 }});
 assert.equal(lookups,1);assert.equal(pending.status,'found');assert.equal(pending.operation.version,2);

 lookups=0;
 const receipt={receiptId:'52000000-0000-4000-8000-000000000005',createdAt:'2026-01-01T00:00:00.000Z',
  expiresAt:'2026-01-02T00:00:00.000Z',lifecycle:'active'};
 const ready=await reconcileExactCopyPrepareConflict({canonical:copyOperation,output:copyOutput,lookup:async()=>{
  lookups++;return stored({...copyOperation,version:3,lifecycle:'ready',output_facts:copyOutput},receipt);
 }});
 assert.equal(lookups,1);assert.equal(ready.status,'found');assert.equal(ready.operation.lifecycle,'ready');
});

test('exact copy prepare race rejects unavailable, foreign, changed and stale lookup state',async()=>{
 const cases=[
  {status:'unavailable'},
  stored({...copyOperation,id:'52000000-0000-4000-8000-000000000099',version:2,output_facts:copyOutput}),
  stored({...copyOperation,draft_id:'52000000-0000-4000-8000-000000000099',version:2,output_facts:copyOutput}),
  stored({...copyOperation,operation_kind:'upload',version:2,output_facts:copyOutput}),
  stored({...copyOperation,version:1,output_facts:copyOutput}),
  stored({...copyOperation,version:2,output_facts:{...copyOutput,digest:'c'.repeat(64)}}),
  stored({...copyOperation,version:3,lifecycle:'ready',output_facts:copyOutput}),
 ];
 for(const candidate of cases){
  let lookups=0;const result=await reconcileExactCopyPrepareConflict({canonical:copyOperation,output:copyOutput,
   lookup:async()=>{lookups++;return candidate;}});
  assert.equal(lookups,1);assert.notEqual(result.status,'found');
 }
});
