import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {cleanupPersistentMedia} from '../app/infrastructure/local-commerce/local-persistent-media-cleanup.server.ts';
import {catalogTestEnvironment} from './fixtures/local-persistent-catalog.mjs';
const sql=readFileSync('local/commerce/migrations/0012_local-commerce-media-cleanup.sql','utf8');
test('cleanup source contract bounds lease and excludes browser execution',()=>{
 assert.match(sql,/expires_at<=acquired_at\+interval '60 seconds'/);
 assert.match(sql,/unique\(project_id,internal_locator\)/);
 assert.match(sql,/j\.lease_token is distinct from p_lease_token/);
 assert.match(sql,/j\.expires_at<=t/);
 assert.match(sql,/media_cleanup_command\(text,text,uuid,text,text,uuid\) from public,anon,authenticated/);
 assert.match(sql,/set search_path=pg_catalog,local_commerce/);
});
test('retention and lock contract covers shared originals and committed Order bindings',()=>{
 assert.match(sql,/order_item_receipt_bindings/);
 assert.match(sql,/x\.original_locator=loc/);
 assert.match(sql,/r\.lifecycle='active'.*r\.expires_at>t/);
 assert.match(sql,/lock_media_project\(p_project_id\)/);
 assert.match(sql,/rename to draft_command_before_cleanup/);
 assert.match(sql,/rename to media_operation_before_cleanup/);
});
test('cleanup cannot construct a remote or fake provider',async()=>{
 const fetch=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('network prohibited');};
 try{for(const patch of [{NODE_ENV:'production'},{NODE_ENV:'staging'},{CUSTOMER_UPLOAD_SOURCE:'local_fake'},
   {LOCAL_COMMERCE_API_URL:'https://remote.example.test'}]){
   const env=catalogTestEnvironment({CUSTOMER_AUTH_SOURCE:'local_persistent',CUSTOMER_UPLOAD_SOURCE:'local_persistent',...patch});
   assert.equal((await cleanupPersistentMedia(env,'11111111-1111-4111-8111-111111111111','original')).status,'unavailable');
  }assert.equal(calls,0);
 }finally{globalThis.fetch=fetch;}
});
