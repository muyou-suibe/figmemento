// Acceptance-only launch seam. Does not change ordinary vinext dev/build/start.
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';

const root = fileURLToPath(new URL('../../', import.meta.url));
const run = process.argv[2];
const port = Number(process.argv[4]);
const orderFault = process.argv[5];
const retained = run === 'retained-development' && process.argv[3] === '--confirm-retained';
const previewFaults=['preview-helper-failure','preview-storage-failure','preview-readback-failure','preview-readback-mismatch','preview-ready-delay'];
const digitalFaults=['digital-storage-failure','digital-readback-mismatch','digital-response-loss','digital-trace'];
const digitalDownloadFaults=['digital-download-missing-object','digital-download-storage-failure','digital-download-content-mismatch','digital-download-size-mismatch','digital-download-claim-delay','digital-download-claim-failure'];
const digitalStreamFaults=['digital-stream-failure','digital-stream-delay','digital-stream-result-failure','digital-stream-crash-after-claim'];
assert.ok(orderFault === undefined || ['before-probe','probe-loss','before-commit','commit-loss','catalog-unavailable','commit-race-window','preview-trace','inbox-hang-after-claim',...previewFaults,...digitalFaults,...digitalDownloadFaults,...digitalStreamFaults].includes(orderFault));
if (retained) assert.equal(process.env.LOCAL_COMMERCE_PROJECT_ID, 'figmemento-local-commerce');
else assert.match(run ?? '', /^run-[a-f0-9]{8}$/);
assert.equal(process.argv[3], retained ? '--confirm-retained' : '--confirm-disposable');
assert.equal(process.env.NODE_ENV, retained ? 'development' : 'test');
assert.equal(process.env.LOCAL_COMMERCE_ENVIRONMENT, retained ? 'development' : 'test');
assert.equal(process.env.LOCAL_COMMERCE_PROJECT_KIND, retained ? 'retained_development' : 'disposable_test');
assert.equal(process.env.LOCAL_COMMERCE_RUN_ID, run);
assert.equal(process.env.LOCAL_COMMERCE_PROJECT_ID, retained ? 'figmemento-local-commerce' : `figmemento-local-commerce-test-${run}`);
assert.ok(Number.isSafeInteger(port) && port > 1024 && port < 65536);
assert.equal(process.env.CLOUDFLARE_INCLUDE_PROCESS_ENV, 'true');
process.env.WRANGLER_SEND_METRICS = 'false';
process.env.WRANGLER_WRITE_LOGS = 'false';

// A test-only transform asserts inside the real Worker entry. No debug route,
// environment override, secret projection, or replacement route handler.
const modeProof = {
  name: 'local-commerce-acceptance-mode-proof',
  enforce: 'pre',
  transform(code, id) {
    if (orderFault === 'inbox-hang-after-claim' && id.split('?')[0] === path.join(root,'app/server/local-payment-webhook-inbox.server.ts')) {
      const needle = 'const claim = await connection.adapter.callRestrictedRpc<unknown>("webhook_inbox_claim", common);';
      assert.equal(code.split(needle).length,2);
      return {code:code.replace(needle,`${needle} if (claim.status === "found" && claim.value && typeof claim.value === "object" && claim.value.status === "claimed") { console.info("PHASE3_INBOX_CLAIMED_WAITING"); await new Promise(() => {}); }`),map:null};
    }
    if (digitalStreamFaults.includes(orderFault) && id.split('?')[0] === path.join(root,'app/server/local-persistent-digital-download.server.ts')) {
      const point={
        'digital-stream-failure':['controller.enqueue(bytes);','console.info("DIGITAL_STREAM_FAILURE_AFTER_CLAIM"); throw new Error("injected post-claim stream failure"); controller.enqueue(bytes);'],
        'digital-stream-delay':['controller.enqueue(bytes);','console.info("DIGITAL_STREAM_DELAY_WINDOW"); await new Promise(resolve=>setTimeout(resolve,8000)); controller.enqueue(bytes);'],
        'digital-stream-result-failure':['await connection.adapter.callRestrictedRpc("digital_download_stream_result", {','throw new Error("injected stream-result DB transport failure"); await connection.adapter.callRestrictedRpc("digital_download_stream_result", {'],
        'digital-stream-crash-after-claim':['const attemptId = String(claimedRpc.value.attemptId);','console.info("DIGITAL_STREAM_CRASH_AFTER_CLAIM"); await new Promise(()=>{}); const attemptId = String(claimedRpc.value.attemptId);'],
      }[orderFault];
      assert.equal(code.split(point[0]).length,2);
      return {code:code.replace(point[0],point[1]),map:null};
    }
    if (digitalDownloadFaults.includes(orderFault) && id.split('?')[0] === path.join(root,'app/server/local-persistent-digital-download.server.ts')) {
      const point={
        'digital-download-missing-object':['const object = await connection.adapter.downloadPrivateObject(candidate.contentReference);','const object = await connection.adapter.downloadPrivateObject(`missing/${candidate.contentReference}`);'],
        'digital-download-storage-failure':['const object = await connection.adapter.downloadPrivateObject(candidate.contentReference);','throw new Error("injected digital download Storage failure"); const object = await connection.adapter.downloadPrivateObject(candidate.contentReference);'],
        'digital-download-content-mismatch':['if (bytes.length !== candidate.byteSize || await digest(bytes) !== candidate.contentDigest)','bytes[0]^=1; if (bytes.length !== candidate.byteSize || await digest(bytes) !== candidate.contentDigest)'],
        'digital-download-size-mismatch':['const bytes = new Uint8Array(await object.value.arrayBuffer());','const bytes = new Uint8Array(await object.value.arrayBuffer()).slice(0,-1);'],
        'digital-download-claim-delay':['const claimedRpc = await command("claim", candidate);','console.info("DIGITAL_DOWNLOAD_CLAIM_WINDOW"); await new Promise(resolve=>setTimeout(resolve,8000)); const claimedRpc = await command("claim", candidate);'],
        'digital-download-claim-failure':['const claimedRpc = await command("claim", candidate);','throw new Error("injected pre-claim transport failure"); const claimedRpc = await command("claim", candidate);'],
      }[orderFault];
      assert.equal(code.split(point[0]).length,2);
      return {code:code.replace(point[0],`console.info("DIGITAL_DOWNLOAD_FAULT_REACHED:${orderFault}"); ${point[1]}`),map:null};
    }
    if (digitalFaults.includes(orderFault) && id.split('?')[0] === path.join(root,'app/server/local-persistent-digital-publication.server.ts')) {
      if(orderFault==='digital-trace'){
        const replacements=[
          ['let reserved = await command("probe");','let reserved = await command("probe"); console.info("DIGITAL_TRACE probe",reserved.status);'],
          ['reserved = await command("reserve");','reserved = await command("reserve"); console.info("DIGITAL_TRACE reserve",reserved.status);'],
          ['let readback = await connection.adapter.downloadPrivateObject(locator);','let readback = await connection.adapter.downloadPrivateObject(locator); console.info("DIGITAL_TRACE initial_read",readback.status);'],
          ['if (uploaded.status !== "found" || uploaded.value.path !== locator)','console.info("DIGITAL_TRACE upload",uploaded.status); if (uploaded.status !== "found" || uploaded.value.path !== locator)'],
          ['      readback = await connection.adapter.downloadPrivateObject(locator);','      readback = await connection.adapter.downloadPrivateObject(locator); console.info("DIGITAL_TRACE readback",readback.status);'],
          ['const completed = await complete(exact ? "ready" : "fail");','const completed = await complete(exact ? "ready" : "fail"); console.info("DIGITAL_TRACE complete",completed.status,exact);'],
        ];
        for(const [needle,replacement] of replacements){assert.equal(code.split(needle).length,2);code=code.replace(needle,replacement);}
        return {code,map:null};
      }
      const point={
        'digital-storage-failure':['const uploaded = await connection.adapter.uploadPrivateObject(locator, bytes, contentType);','throw new Error("injected digital Storage failure"); const uploaded = await connection.adapter.uploadPrivateObject(locator, bytes, contentType);'],
        'digital-readback-mismatch':['const readbackDigest = await digest(persisted);','persisted[0]^=1; const readbackDigest = await digest(persisted);'],
        'digital-response-loss':['const value = projection(completed.value);','throw new Error("injected digital response loss"); const value = projection(completed.value);'],
      }[orderFault];
      assert.equal(code.split(point[0]).length,2);
      return {code:code.replace(point[0],`console.info("DIGITAL_FAULT_REACHED:${orderFault}"); ${point[1]}`),map:null};
    }
    if (previewFaults.includes(orderFault) && id.split('?')[0] === path.join(root,'app/server/local-persistent-preview-media.server.ts')) {
      // Acceptance-only dependency interruption; no production fault switch or
      // alternate command authority. All preceding real RPC/I/O still runs.
      const point={
        'preview-helper-failure':['if(processed.status!=="processed") return unavailable;', 'return unavailable;'],
        'preview-storage-failure':['await adapter.uploadPrivateObject(', 'throw new Error("injected storage transport failure"); await adapter.uploadPrivateObject('],
        'preview-readback-failure':['if(!readback || readback.length', 'return unavailable; if(!readback || readback.length'],
        'preview-readback-mismatch':['if(!readback || readback.length', 'if(readback) readback[0]^=1; if(!readback || readback.length'],
        'preview-ready-delay':['return command("ready",readyKey', 'await new Promise(resolve=>setTimeout(resolve,8000)); return command("ready",readyKey'],
      }[orderFault];
      assert.equal(code.split(point[0]).length,2);
      return {code:code.replace(point[0],`console.info("PREVIEW_FAULT_REACHED:${orderFault}"); ${point[1]}`),map:null};
    }
    if (orderFault === 'preview-trace' && id.split('?')[0] === path.join(root,'app/server/local-persistent-preview-media.server.ts')) {
      const replacements=[
        ['if(replay.status!=="not_found") return replay;', 'console.info("PREVIEW_TRACE probe",replay.status); if(replay.status!=="not_found") return replay;'],
        ['if(!m || m.lifecycle!=="ready" || m.order_item_id!==e.orderItemId) return unavailable;', 'console.info("PREVIEW_TRACE acquire",Boolean(m),m?.lifecycle,m?.order_item_id===e.orderItemId); if(!m || m.lifecycle!=="ready" || m.order_item_id!==e.orderItemId) return unavailable;'],
        ['if(!bytes || bytes.length!==m.byte_size || await previewBytesDigest(bytes)!==m.content_digest) return unavailable;', 'console.info("PREVIEW_TRACE readback",Boolean(bytes),bytes?.length===m.byte_size,bytes ? await previewBytesDigest(bytes)===m.content_digest : false); if(!bytes || bytes.length!==m.byte_size || await previewBytesDigest(bytes)!==m.content_digest) return unavailable;'],
        ['return command("publish",key,expectedVersion,input);','console.info("PREVIEW_TRACE publish_reached"); return command("publish",key,expectedVersion,input);'],
      ];
      for(const [needle,replacement] of replacements){assert.equal(code.split(needle).length,2);code=code.replace(needle,replacement);}
      return {code,map:null};
    }
    if (orderFault === 'probe-loss' && id.split('?')[0] === path.join(root, 'app/infrastructure/local-commerce/local-persistent-supabase-adapter.server.ts')) {
      const needle='return createClient(url, serviceRoleKey, {';
      assert.equal(code.split(needle).length,2);
      return {code:code.replace(needle,`${needle}
      global: {fetch: async (input, init) => {
        const target=typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        const response=await globalThis.fetch(input,init);
        if(target === url + '/rest/v1/rpc/order_commit' && typeof init?.body === 'string' && JSON.parse(init.body).p_operation === 'probe') {
          await response.body?.cancel();
          console.info('ORDER_ACCEPTANCE_FAULT_REACHED:probe-loss:transport');
          throw new TypeError('Injected local RPC response transport loss');
        }
        return response;
      }},`),map:null};
    }
    if (orderFault && !['probe-loss','preview-trace','inbox-hang-after-claim',...previewFaults,...digitalFaults,...digitalDownloadFaults,...digitalStreamFaults].includes(orderFault) && id.split('?')[0] === path.join(root, 'app/server/local-persistent-order-http.server.ts')) {
      if (orderFault === 'commit-race-window') {
        const needle='  const committed = await';
        assert.equal(code.split(needle).length,2);
        return {code:code.replace(needle,`  console.info("ORDER_ACCEPTANCE_RACE_WINDOW");\n  await new Promise(resolve => setTimeout(resolve, 8000));\n${needle}`),map:null};
      }
      const points = {
        'before-probe': ['  const probe = await', 'before'],
        'before-commit': ['  const committed = await', 'before'],
        'commit-loss': ['  return committed.status ===', 'before'],
        'catalog-unavailable': ['  const baseline = await catalog.readSnapshot();', 'before'],
      };
      const needle = points[orderFault][0];
      assert.equal(code.split(needle).length, 2, 'test fault point must match exactly once');
      return {code:code.replace(needle, `  console.info("ORDER_ACCEPTANCE_FAULT_REACHED:${orderFault}");\n  throw new Error("Injected bounded acceptance interruption");\n${needle}`),map:null};
    }
    if (id.split('?')[0] !== path.join(root, 'worker/index.ts')) return;
    return {code: `
if (process.env.NODE_ENV !== ${JSON.stringify(retained ? 'development' : 'test')} || process.env.LOCAL_COMMERCE_ENVIRONMENT !== ${JSON.stringify(retained ? 'development' : 'test')}
 || process.env.LOCAL_COMMERCE_PROJECT_KIND !== ${JSON.stringify(retained ? 'retained_development' : 'disposable_test')}
 || process.env.LOCAL_COMMERCE_RUN_ID !== ${JSON.stringify(run)}
 || process.env.LOCAL_COMMERCE_PROJECT_ID !== ${JSON.stringify(process.env.LOCAL_COMMERCE_PROJECT_ID)}
 || process.env.LOCAL_COMMERCE_MARKER_DIGEST !== ${JSON.stringify(process.env.LOCAL_COMMERCE_MARKER_DIGEST)}
 || process.env.LOCAL_COMMERCE_API_URL !== ${JSON.stringify(process.env.LOCAL_COMMERCE_API_URL)}
 || process.env.LOCAL_COMMERCE_IMAGE_HELPER_URL !== ${JSON.stringify(process.env.LOCAL_COMMERCE_IMAGE_HELPER_URL)}) {
 throw new Error('Acceptance Worker mode mismatch');
}
console.info('LOCAL_COMMERCE_WORKER_MODE_PROOF', JSON.stringify({
 nodeEnv: process.env.NODE_ENV, environment: process.env.LOCAL_COMMERCE_ENVIRONMENT,
 runId: process.env.LOCAL_COMMERCE_RUN_ID, entry: 'worker/index.ts'
}));
${code}`, map: null};
  },
};
const server = await createServer({
  root, configFile: path.join(root, 'vite.config.ts'), mode: retained ? 'development' : 'test',
  envDir: retained ? path.join(root, 'local/commerce/runtime') : path.join(root, 'local/commerce/runtime/disposable', run),
  server: {host: '127.0.0.1', port, strictPort: true},
  plugins: [modeProof],
});
assert.equal(server.config.mode, retained ? 'development' : 'test');
assert.equal(process.env.NODE_ENV, retained ? 'development' : 'test');
await server.listen();
console.info('LOCAL_COMMERCE_TEST_LAUNCH', JSON.stringify({pid: process.pid, mode: server.config.mode, port, runId: run}));
let closing = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => {
  if (closing) return;
  closing = true;
  await server.close();
  process.exit(0);
});
