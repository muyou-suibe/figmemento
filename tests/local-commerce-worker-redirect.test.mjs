import assert from 'node:assert/strict';
import test from 'node:test';
import {processLocalCommerceImage} from '../app/server/local-commerce-image-processing.server.ts';
import {catalogTestEnvironment} from './fixtures/local-persistent-catalog.mjs';

test('Worker-compatible helper fetch rejects every redirect without following or forwarding secrets', async () => {
  const nativeFetch = globalThis.fetch;
  const env = catalogTestEnvironment({CUSTOMER_AUTH_SOURCE: 'local_persistent', CUSTOMER_UPLOAD_SOURCE: 'local_persistent', LOCAL_COMMERCE_IMAGE_HELPER_SECRET: 's'.repeat(43)});
  const policy = {allowedMimeTypes: ['image/png'], maxBytes: 1024, minDimensions: {width: 1, height: 1}, cropEnabled: true};
  try {
    for (const status of [301, 302, 303, 307, 308]) {
      let helperCalls = 0;
      globalThis.fetch = async (input, init) => {
        const url = typeof input === 'string' ? input : input.url;
        if (url === env.LOCAL_COMMERCE_API_URL + '/rest/v1/rpc/verify_project_identity') return Response.json(true);
        assert.equal(url, env.LOCAL_COMMERCE_IMAGE_HELPER_URL + '/process', 'no second target');
        assert.equal(init.redirect, 'manual', 'workerd supported no-follow mode');
        helperCalls++;
        return new Response(null, {status, headers: {location: 'http://127.0.0.1:55919/not-allowed'}});
      };
      assert.equal((await processLocalCommerceImage(env, new Uint8Array([1]), policy)).status, 'unavailable');
      assert.equal(helperCalls, 1);
    }
  } finally { globalThis.fetch = nativeFetch; }
});
