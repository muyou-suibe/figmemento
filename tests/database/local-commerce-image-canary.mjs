import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {processLocalCommerceImage} from '../../app/server/local-commerce-image-processing.server.ts';

export async function verifyImageCanary({env, c, png}) {
  let targetRequests = 0, targetCredentials = 0, redirects = 0;
  const target = createServer((req, res) => { targetRequests++; if (req.headers.authorization) targetCredentials++; res.end('must not be reached'); });
  const redirect = createServer((req, res) => { redirects++; res.writeHead(302, {location: `http://127.0.0.1:${target.address().port}/target`}); res.end(); });
  await new Promise(r => target.listen(0, '127.0.0.1', r));
  await new Promise(r => redirect.listen(0, '127.0.0.1', r));
  const policy = {allowedMimeTypes: ['image/png'], maxBytes: 1048576, minDimensions: {width: 1, height: 1}, cropEnabled: true};
  try {
    const url = `http://127.0.0.1:${target.address().port}/not-allowed`;
    const headers = {'content-type': 'application/octet-stream', authorization: 'Bearer ' + env.LOCAL_COMMERCE_IMAGE_HELPER_SECRET,
      'x-commerce-project': c.projectId, 'x-commerce-marker': env.LOCAL_COMMERCE_MARKER_DIGEST};
    for (const extra of [{url}, {path: '/private/not-authorized'}, {url: 'file:///private/not-authorized'}]) {
      const r = await fetch(c.endpoints.imageHelperUrl + '/process', {method: 'POST', headers: {...headers, 'x-image-policy': JSON.stringify({...policy, ...extra})}, body: png});
      await r.arrayBuffer(); assert.equal(r.status, 400);
    }
    for (const patch of [
      {LOCAL_COMMERCE_IMAGE_HELPER_URL: `http://127.0.0.1:${target.address().port}`},
      {LOCAL_COMMERCE_IMAGE_HELPER_URL: c.endpoints.imageHelperUrl.replace('127.0.0.1', 'localhost')},
      {LOCAL_COMMERCE_PROJECT_ID: 'wrong-project'}, {LOCAL_COMMERCE_MARKER_DIGEST: '0'.repeat(64)},
      {LOCAL_COMMERCE_IMAGE_HELPER_SECRET: 'x'.repeat(43)},
    ]) assert.equal((await processLocalCommerceImage({...env, ...patch}, png, policy)).status, 'unavailable');
    // Explicit TEST-only configured local redirect service; exact paired port
    // and URL remain consistent, so this exercises fetch redirect behavior.
    const redirectEnv = {...env, LOCAL_COMMERCE_IMAGE_HELPER_PORT: String(redirect.address().port),
      LOCAL_COMMERCE_IMAGE_HELPER_URL: `http://127.0.0.1:${redirect.address().port}`};
    assert.equal((await processLocalCommerceImage(redirectEnv, png, policy)).status, 'unavailable');
    assert.equal(redirects, 1); assert.equal(targetRequests, 0); assert.equal(targetCredentials, 0);
    console.info('REAL LOCAL SSRF / REDIRECT CANARY PASS', JSON.stringify({redirects, targetRequests, targetCredentials}));
  } finally {
    await new Promise(r => redirect.close(r)); await new Promise(r => target.close(r));
  }
}
