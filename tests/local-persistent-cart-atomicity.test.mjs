import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createLocalPersistentCartPort} from '../app/infrastructure/local-commerce/local-persistent-cart-adapter.server.ts';
import {catalogTestEnvironment,offlineCatalogClient} from './fixtures/local-persistent-catalog.mjs';

const env=catalogTestEnvironment({CART_SOURCE:'local_persistent',CUSTOMER_AUTH_SOURCE:'local_persistent'});
const owner={kind:'guest',projectId:env.LOCAL_COMMERCE_PROJECT_ID,ownerId:'verified-guest-owner-1234567890123456',expiresAt:Math.floor(Date.now()/1000)+3600};
const cartId='42000000-0000-4000-8000-000000000001';
test('clear uses the existing unified command RPC with mandatory CAS and verified authority',async()=>{
 const calls=[];const base=offlineCatalogClient();
 const clientFactory={create(){
  const original=base.create();
  return {schema(n){
   const schema=original.schema(n);
   return {async rpc(name,args){
    if(name!=='cart_command')return schema.rpc(name,args);
    calls.push(args);
    return {error:null,data:{status:'found',value:{cartId,version:8,record:{cartId,lines:[]}}}};
   }};
  }};
 }};
 const a=await createLocalPersistentCartPort({environment:env,owner,authorityExpiresAt:owner.expiresAt,clientFactory});assert.equal(a.status,'ready');
 const command={authority:a.authority,cartId,expectedVersion:7,idempotency:{key:'clear-1',fingerprint:'clear'}};
 assert.equal((await a.port.clear({...command,expectedVersion:undefined})).reason,'invalid_request');
 assert.equal((await a.port.clear({...command,authority:{...a.authority,ownerId:'forged'}})).reason,'invalid_authority');assert.equal(calls.length,0);
 const r=await a.port.clear(command);assert.equal(r.status,'found');assert.equal(r.value.version,8);assert.equal(calls.length,1);
 assert.equal(calls[0].p_operation,'clear');assert.equal(calls[0].p_expected_version,7);assert.equal(calls[0].p_command_key,'clear-1');assert.notEqual(calls[0].p_owner_selector,owner.ownerId);
});
test('v9 checksum and ordered manifest preserve immutable v1-v8 and security boundary',()=>{
 const manifest=JSON.parse(readFileSync('local/commerce/migrations/manifest.json','utf8'));assert.ok(manifest.schemaVersion>=9);
 assert.deepEqual(manifest.migrations.slice(0,9).map(m=>m.version),[1,2,3,4,5,6,7,8,9]);
 for(const m of manifest.migrations){assert.equal(createHash('sha256').update(readFileSync('local/commerce/migrations/'+m.filename)).digest('hex'),m.checksum);assert.ok(m.rollback&&m.forwardFix);}
 const sql=readFileSync('local/commerce/migrations/0009_local-commerce-cart-atomicity.sql','utf8');
 assert.doesNotMatch(sql,/^begin;|^commit;/mi);assert.match(sql,/security definer\s+set search_path = pg_catalog, local_commerce/);
 assert.match(sql,/from public,anon,authenticated/);assert.match(sql,/to service_role/);
});
test('atomic RPC locks owner/cart, checks version then writes lines/version/binding; no compensation',()=>{
 const sql=readFileSync('local/commerce/migrations/0009_local-commerce-cart-atomicity.sql','utf8');
 const cas=sql.indexOf('v_cart.version <> p_expected_version'),mutation=sql.indexOf('delete from local_commerce.cart_lines'),version=sql.indexOf('set version=version+1'),binding=sql.indexOf('insert into local_commerce.cart_command_bindings');
 assert.ok(sql.indexOf('for share')<cas&&sql.indexOf('for update')<cas&&cas<mutation&&mutation<version&&version<binding);
 assert.match(sql,/p_expected_version is null/);assert.match(sql,/p_authority_expires_at <= clock_timestamp\(\)/);
 assert.match(sql,/delete from local_commerce.cart_lines where project_id=p_project_id and cart_id=v_cart.id and owner_id=v_owner/);
 assert.doesNotMatch(sql,/delete from local_commerce\.(?!cart_lines)|exception when|commit;/i);
});
test('replay probe is internal read-only and precedes current Catalog acceptance',()=>{
 const ts=readFileSync('app/infrastructure/local-commerce/local-persistent-cart-adapter.server.ts','utf8');
 assert.ok(ts.indexOf('invoke("replay_add")')<ts.indexOf('await acceptCartItem'));
 const sql=readFileSync('local/commerce/migrations/0009_local-commerce-cart-atomicity.sql','utf8');
 assert.ok(sql.indexOf("if p_operation='replay_add' then")<sql.indexOf('v_cart.version <> p_expected_version'));
 assert.match(sql,/then p_item->'handoff' else null/);
 const port=readFileSync('app/application/local-commerce-provider-ports.server.ts','utf8');assert.doesNotMatch(port,/replay_add/);
});
