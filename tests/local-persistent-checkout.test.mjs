import test from 'node:test';
import assert from 'node:assert/strict';
import {persistentCheckoutHttp} from '../app/server/local-persistent-checkout-http.server.ts';
import {catalogTestEnvironment} from './fixtures/local-persistent-catalog.mjs';
import {resolveLocalPersistentComposition} from '../app/application/local-persistent-commerce-composition.server.ts';

const base=catalogTestEnvironment({CUSTOMER_AUTH_SOURCE:'local_persistent',CART_SOURCE:'local_persistent',LOCAL_CHECKOUT_SOURCE:'local_persistent',CUSTOMER_UPLOAD_SOURCE:'disabled'});
test('text-only persistent Checkout composition does not activate Upload',()=>{
  assert.equal(resolveLocalPersistentComposition(base,{requiredCapabilities:['checkout']}).status,'ready');
});
for(const override of [{LOCAL_CHECKOUT_SOURCE:undefined},{LOCAL_CHECKOUT_SOURCE:'disabled'},{LOCAL_CHECKOUT_SOURCE:'invalid'},
  {LOCAL_CHECKOUT_SOURCE:'local_fake'},{NODE_ENV:'production'},{NODE_ENV:'staging'},{NODE_ENV:'unknown'},
  {LOCAL_COMMERCE_API_URL:'https://remote.example.test'},{LOCAL_COMMERCE_PROJECT_ID:'foreign-project'},
  {PHOTOGIFT_PRODUCT_SOURCE:'fixture'},{CART_SOURCE:'local_fake'}]) {
  test('persistent Checkout rejects source boundary '+JSON.stringify(override),async()=>{
    const original=globalThis.fetch;let requests=0;
    globalThis.fetch=async()=>{requests++;throw Error('External access prohibited');};
    try{const r=await persistentCheckoutHttp(new Request('http://localhost/api/checkout'),{email:'test@example.test'},{...base,...override});
      assert.equal(r.status,503);assert.equal((await r.json()).status,'unavailable');assert.equal(requests,0);
    }finally{globalThis.fetch=original;}
  });
}
