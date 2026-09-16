import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createLocalPersistentCartPort} from '../app/infrastructure/local-commerce/local-persistent-cart-adapter.server.ts';
import {readCartConfig} from '../app/config/server.ts';
import {getShoppingCartProvider} from '../app/server/shopping-cart-runtime.server.ts';
import {catalogTestEnvironment,offlineCatalogClient} from './fixtures/local-persistent-catalog.mjs';

const env=catalogTestEnvironment({CART_SOURCE:'local_persistent',CUSTOMER_AUTH_SOURCE:'local_persistent'});
const owner={kind:'guest',projectId:env.LOCAL_COMMERCE_PROJECT_ID,ownerId:'guest-opaque-server-owner-0123456789',expiresAt:Math.floor(Date.now()/1000)+3600};
const make=(environment=env,options={})=>createLocalPersistentCartPort({environment,owner,authorityExpiresAt:owner.expiresAt,clientFactory:offlineCatalogClient(),...options});
test('persistent selection never constructs legacy memory provider',()=>{
  assert.equal(readCartConfig(env,'test').source,'local_persistent');
  assert.equal(getShoppingCartProvider(env,'test'),null);
  assert.equal(getShoppingCartProvider({},'test'),null);
  assert.ok(getShoppingCartProvider({CART_SOURCE:'local_fake'},'test'));
});
test('production staging unknown sources fail closed before client creation',async()=>{
  for(const mode of ['production','staging','unknown']) {
    assert.throws(()=>readCartConfig(env,mode));
    assert.equal((await make({...env,NODE_ENV:mode})).status,'unavailable');
  }
  assert.equal((await make({...env,LOCAL_COMMERCE_API_URL:'https://example.invalid'})).status,'unavailable');
  assert.equal((await make({...env,CUSTOMER_AUTH_SOURCE:'local_fake'})).status,'unavailable');
});
test('project and expired verified owner rejected',async()=>{
  assert.equal((await make(env,{owner:{...owner,projectId:'wrong'}})).status,'unavailable');
  assert.equal((await make(env,{authorityExpiresAt:1})).status,'unavailable');
});
test('unified port rejects absent CAS, forged authority, quantity and malformed exact identities',async()=>{
  const ready=await make();assert.equal(ready.status,'ready');
  const context={authority:ready.authority,cartId:'41000000-0000-4000-8000-000000000001',lineId:'41000000-0000-4000-8000-000000000002',expectedVersion:1,idempotency:{key:'a',fingerprint:'b'},quantity:2};
  assert.deepEqual(await ready.port.updateLine({...context,expectedVersion:undefined}),{status:'unavailable',reason:'invalid_request'});
  assert.deepEqual(await ready.port.updateLine({...context,authority:{...context.authority,ownerId:'forged'}}),{status:'unavailable',reason:'invalid_authority'});
  for(const quantity of [0,21,1.5])assert.equal((await ready.port.updateLine({...context,quantity})).reason,'invalid_request');
  assert.equal((await ready.port.read({...context,cartId:'browser-selected'})).reason,'invalid_request');
});
test('DB outage is bounded and never uses memory',async()=>{
  const ready=await make();assert.equal(ready.status,'ready');
  assert.deepEqual(await ready.port.create({authority:ready.authority,idempotency:{key:'a',fingerprint:'b'}}),{status:'unavailable',reason:'source_failure'});
});
test('ordered SQL retains mandatory version, exact owner, distinct insertion and restricted execute',()=>{
  const sql=readFileSync('local/commerce/migrations/0008_local-commerce-cart-persistence.sql','utf8');
  assert.match(sql,/v_cart.version <> p_expected_version/);
  assert.match(sql,/p_expected_version is null/);
  assert.match(sql,/and owner_id=v_owner and id=p_line_id/);
  assert.match(sql,/insert into local_commerce.cart_lines/);
  assert.doesNotMatch(sql,/on conflict.*cart_lines|^begin;|^commit;/mi);
  assert.match(sql,/from public,anon,authenticated/);
});
