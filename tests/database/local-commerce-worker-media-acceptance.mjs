// Real Worker HTTP smoke; never import API handlers or substitute a Node server.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn, spawnSync} from 'node:child_process';
import {createServer} from 'node:net';
import {randomBytes, randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {sha256Text, planMigrationLedger} from '../../app/application/local-commerce-migration-ledger.ts';
import {validateProjectMarker} from '../../app/application/local-commerce-environment.ts';
import {catalogTestEnvironment, ids} from '../fixtures/local-persistent-catalog.mjs';
import {createConfiguredGuestDraftOwnerService, getGuestDraftOwnerCookieName} from '../../app/lib/guest-draft-owner.ts';
import {ensureGuestResourceOwner, resolveGuestResourceOwner} from '../../app/application/guest-resource-ownership.server.ts';
import {createLocalPersistentDraftPort} from '../../app/infrastructure/local-commerce/local-persistent-draft-adapter.server.ts';
import {ledgerWrappers} from '../../scripts/local-commerce-ledger-wrapper.mjs';
import {verifyMediaMatrix} from './local-commerce-worker-media-matrix.mjs';
import {verifyImageCanary} from './local-commerce-image-canary.mjs';
import {verifyUploadBindingSecurity} from './local-commerce-upload-binding-security.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
process.chdir(root);
const run = process.argv[2];
assert.match(run ?? '', /^run-[a-f0-9]{8}$/);
assert.equal(process.argv[3], '--confirm-disposable');
const dir = path.join(root, 'local/commerce/runtime/disposable', run);
const prep = JSON.parse(readFileSync(path.join(dir, 'ledger-preparation.json')));
const c = prep.config;
const marker = JSON.parse(readFileSync(path.join(dir, 'project-marker.json')));
assert.equal(c.runId, run);
assert.equal(c.projectId, `figmemento-local-commerce-test-${run}`);
assert.equal(c.environment, 'test');
assert.equal(c.projectKind, 'disposable_test');
assert.equal(c.postgresMajorVersion, 17);
assert.equal(validateProjectMarker(marker, c), true);
assert.equal(sha256Text(JSON.stringify(marker)), prep.markerDigest);
function command(bin, args, input) {
  const r = spawnSync(bin, args, {input, encoding: 'utf8', timeout: 10000, maxBuffer: 2 * 1024 * 1024});
  assert.equal(r.error, undefined, 'bounded command failed');
  assert.equal(r.status, 0, 'local command failed (diagnostics withheld)');
  return r.stdout.trim();
}
const candidates = command('docker', ['ps', '--filter', `label=com.supabase.cli.workdir=${dir}`, '--format', '{{.ID}}']).split('\n').filter(Boolean);
assert.ok(candidates.length);
const containers = JSON.parse(command('docker', ['inspect', ...candidates]));
const dbs = containers.filter(x => x.Config.Labels['com.supabase.cli.workdir'] === dir && x.Name.startsWith('/supabase_db_'));
assert.equal(dbs.length, 1, 'exactly one DB for exact workdir');
const sql = q => command('docker', ['exec', '-i', dbs[0].Id, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'], q);
assert.equal(sql(`select local_commerce.verify_project_identity('${c.projectId}','${prep.markerDigest}');`), 't');
const manifest = JSON.parse(readFileSync('local/commerce/migrations/manifest.json'));
assert.equal(manifest.schemaVersion, 13);
for (const m of manifest.migrations) assert.equal(sha256Text(readFileSync('local/commerce/migrations/' + m.filename, 'utf8')), m.checksum);
const readLedger = () => JSON.parse(sql("select json_agg(json_build_object('version',version,'migrationId',migration_id,'checksum',checksum,'projectId',project_id) order by version) from local_commerce.migration_ledger;"));
let applied = readLedger();
let plan = planMigrationLedger({...manifest, projectId: c.projectId}, applied, c.projectId);
assert.equal(plan.status, 'ready');
if (plan.apply.length) {
  assert.ok(process.argv.includes('--apply-migration-13'), 'Explicit forward migration flag required');
  assert.equal(applied.length, 12); assert.deepEqual(plan.apply.map(m => m.version), [13]);
  const sources = manifest.migrations.map(m => readFileSync('local/commerce/migrations/' + m.filename, 'utf8'));
  sql(ledgerWrappers(manifest, sources, c.projectId, prep.markerDigest)[12]);
  applied = readLedger(); plan = planMigrationLedger({...manifest, projectId: c.projectId}, applied, c.projectId);
}
assert.equal(plan.status, 'ready'); assert.equal(plan.apply.length, 0); assert.equal(applied.length, 13);
console.info('LEDGER PASS', JSON.stringify({runId: run, applied: 13, pending: 0}));
const info = JSON.parse(command(path.join(root, 'node_modules/.bin/supabase'), ['status', '--workdir', dir, '-o', 'json']));
assert.equal(new URL(info.API_URL).origin, c.endpoints.apiUrl);
const env = {...process.env, ...catalogTestEnvironment({
  LOCAL_COMMERCE_RUN_ID: run, LOCAL_COMMERCE_PROJECT_ID: c.projectId, LOCAL_COMMERCE_MARKER_DIGEST: prep.markerDigest,
  LOCAL_COMMERCE_SERVICE_ROLE_KEY: info.SERVICE_ROLE_KEY, CART_SOURCE: 'local_persistent',
  CUSTOMER_AUTH_SOURCE: 'local_persistent', CUSTOMER_UPLOAD_SOURCE: 'local_persistent', LOCAL_CHECKOUT_SOURCE: 'local_persistent',
  LOCAL_ORDER_SOURCE: 'disabled', LOCAL_PAYMENT_SOURCE: 'disabled', LOCAL_FULFILLMENT_SOURCE: 'disabled',
  LOCAL_TRACKING_SOURCE: 'disabled', ADMIN_ACCEPTANCE_SOURCE: 'local_fake',
  LOCAL_COMMERCE_IMAGE_HELPER_SECRET: randomBytes(32).toString('base64url'),
  PHOTOGIFT_GUEST_DRAFT_OWNER_SECRET: randomBytes(48).toString('base64url'),
  PHOTOGIFT_GUEST_DRAFT_OWNER_CONTEXT_TTL_SECONDS: '3600',
})};
for (const [k, v] of Object.entries({SHADOW_DB: c.ports.shadowDb, API: c.ports.api, DB: c.ports.db, STUDIO: c.ports.studio, SMTP: c.ports.smtp, IMAGE_HELPER: c.ports.imageHelper})) env['LOCAL_COMMERCE_' + k + '_PORT'] = String(v);
for (const [k, v] of Object.entries({API: c.endpoints.apiUrl, RPC: c.endpoints.rpcUrl, STORAGE: c.endpoints.storageUrl, IMAGE_HELPER: c.endpoints.imageHelperUrl})) env['LOCAL_COMMERCE_' + k + '_URL'] = v;
env.CLOUDFLARE_INCLUDE_PROCESS_ENV = 'true';
env.WRANGLER_SEND_METRICS = 'false'; env.WRANGLER_WRITE_LOGS = 'false';
Object.assign(process.env, env);
const appPort = c.ports.imageHelper + 1;
assert.ok(!Object.values(c.ports).includes(appPort));
for (const port of [c.ports.imageHelper, appPort]) await new Promise((resolve, reject) => {
  const s = createServer(); s.once('error', reject); s.listen(port, '127.0.0.1', () => s.close(resolve));
});
// Existing synthetic Catalog must already be present; this harness never reseeds.
assert.equal(sql(`select count(*) from local_commerce.catalog_configuration_snapshots where project_id='${c.projectId}' and product_id='${ids.product}' and definition->'fields'->0->>'kind'='image';`), '1');
const owners = createConfiguredGuestDraftOwnerService(env);
const guest = await ensureGuestResourceOwner({projectId: c.projectId, context: null, ownerService: owners});
assert.equal(guest.status, 'issued');
const verifyOwner = async () => {
  const r = await resolveGuestResourceOwner({projectId: c.projectId, context: guest.context, ownerService: owners});
  return r.status === 'authorized' ? {owner: r.owner, expiresAt: r.owner.expiresAt} : null;
};
const draft = await createLocalPersistentDraftPort({environment: env, verifyOwner}); assert.equal(draft.status, 'ready');
const created = await draft.port.create({authority: draft.authority, expectedVersion: 0, idempotency: {key: randomUUID(), fingerprint: 'worker-acceptance'}, productId: ids.product});
assert.equal(created.status, 'found');
const sharp = createRequire(path.join(root, 'local/commerce/image-helper/package.json'))('sharp');
// Nonuniform pixels detect wrong crop origin, not only output dimensions.
const raster = Buffer.from(Array.from({length:12*8*3}, (_,i) => (i*37+Math.floor(i/36)*11)%256));
const png = await sharp(raster, {raw:{width:12,height:8,channels:3}}).png().toBuffer();
const origin = `http://127.0.0.1:${appPort}`;
const cookie = getGuestDraftOwnerCookieName() + '=' + encodeURIComponent(guest.context);
const children = [];
let logs = '';
function start(args) {
  const p = spawn(process.execPath, args, {cwd: root, env, detached: true, stdio: ['ignore', 'pipe', 'pipe']});
  children.push(p);
  for (const s of [p.stdout, p.stderr]) s.on('data', b => { logs = (logs + b.toString()).slice(-30000); });
  return p;
}
async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise(r => child.once('exit', r));
  process.kill(-child.pid, 'SIGTERM');
  await Promise.race([exited, new Promise(r => setTimeout(r, 5000))]);
  if (child.exitCode === null && child.signalCode === null) { process.kill(-child.pid, 'SIGKILL'); await exited; }
}
async function waitReady(worker, helper) {
  for (let i = 0; i < 30; i++) {
    assert.equal(worker.exitCode, null); assert.equal(helper.exitCode, null);
    try { const r = await fetch(origin + '/api/customer-auth/session', {signal: AbortSignal.timeout(3000)}); await r.arrayBuffer(); if (r.status === 200) return; } catch { /* bounded startup poll */ }
    await new Promise(r => setTimeout(r, 1000));
  }
  assert.fail('actual Worker readiness timeout');
}
const query = new URLSearchParams({productId: ids.product, fieldId: ids.field, draftId: created.value.draftId, expectedVersion: String(created.value.version)});
function upload(key, {bytes = png, recovery = false, selectedCookie = cookie, parameters = query} = {}) {
  const form = new FormData(); form.set('file', new File([bytes], 'synthetic.png', {type: 'image/png'}));
  return fetch(origin + '/api/uploads?' + parameters, {method: 'POST', headers: {origin, cookie: selectedCookie,
    'idempotency-key': key, ...(recovery ? {'x-upload-recovery': '1'} : {})}, body: form, signal: AbortSignal.timeout(30000)});
}
function binding(key) {
  return JSON.parse(sql(`select coalesce(json_agg(json_build_object('operation',b.operation_id,'receipt',r.receipt_reference,'original',o.original_locator,'derivative',o.derivative_locator)), '[]')
    from local_commerce.media_upload_command_bindings b join local_commerce.media_operations o on o.project_id=b.project_id and o.id=b.operation_id
    left join local_commerce.media_receipts r on r.project_id=o.project_id and r.id=o.receipt_id
    where b.project_id='${c.projectId}' and b.key_digest='${sha256Text(key)}';`));
}
try {
  const helper = start(['local/commerce/image-helper/server.mjs']);
  const worker = start(['tests/database/local-commerce-test-worker.mjs', run, '--confirm-disposable', String(appPort)]);
  assert.notEqual(worker.pid, helper.pid);
  console.info('PROCESSES', JSON.stringify({workerPid: worker.pid, helperPid: helper.pid, appPort, helperPort: c.ports.imageHelper, runId: run, projectId: c.projectId}));
  let ready = false;
  for (let i = 0; i < 30; i++) {
    if (worker.exitCode !== null || helper.exitCode !== null) break;
    try { const r = await fetch(origin + '/api/customer-auth/session', {signal: AbortSignal.timeout(3000)}); await r.arrayBuffer(); if (r.status === 200) { ready = true; break; } } catch { /* bounded startup poll */ }
    await new Promise(r => setTimeout(r, 1000));
  }
  assert.ok(ready, 'actual test Worker readiness');
  assert.match(logs, /LOCAL_COMMERCE_WORKER_MODE_PROOF/);
  assert.match(logs, /"nodeEnv":"test","environment":"test"/);
  console.info('WORKER ENTRY MODE PASS: test/test');
  const receipts = [], keys = [];
  for (let i = 0; i < 2; i++) {
    const key = randomUUID(); keys.push(key);
    const r = await upload(key);
    const b = await r.json(); console.info('WORKER UPLOAD', JSON.stringify({attempt: i + 1, http: r.status}));
    assert.equal(r.status, 201, 'actual Worker upload');
    assert.doesNotMatch(JSON.stringify(b), /locator|bucket|path|url|owner|operationId|slotId|service_role/i);
    receipts.push(b.receipt.receiptId);
    const preview = await fetch(origin + '/api/customer-uploads/preview?receiptId=' + encodeURIComponent(b.receipt.receiptId), {headers: {cookie}, signal: AbortSignal.timeout(15000)});
    assert.equal(preview.status, 200); assert.equal(preview.headers.get('content-type'), 'image/png');
    const m = await sharp(Buffer.from(await preview.arrayBuffer())).metadata(); assert.deepEqual([m.width, m.height], [12, 8]);
    console.info('WORKER PRIVATE PREVIEW PASS 200');
    const denied = await fetch(origin + '/api/customer-uploads/preview?receiptId=' + encodeURIComponent(b.receipt.receiptId), {signal: AbortSignal.timeout(15000)});
    assert.equal(denied.status, 404); await denied.arrayBuffer();
  }
  assert.notEqual(receipts[0], receipts[1]);
  assert.notEqual(binding(keys[0])[0].operation, binding(keys[1])[0].operation);
  console.info('INDEPENDENT KEYS / OPERATIONS / RECEIPTS PASS');
  // Deliberately discard the success body before the client sees any receipt.
  // Durable commit is checked privately, not reconstructed from the response.
  const lostKey = randomUUID();
  const lost = await upload(lostKey); assert.equal(lost.status, 201); await lost.body.cancel();
  const before = binding(lostKey); assert.equal(before.length, 1); assert.ok(before[0].receipt);
  const objectCount = () => sql(`select count(*) from storage.objects where bucket_id='local-commerce-private' and name like '${c.projectId}/media/${before[0].operation}/%';`);
  assert.equal(objectCount(), '2');
  await stop(worker);
  logs = '';
  const workerB = start(['tests/database/local-commerce-test-worker.mjs', run, '--confirm-disposable', String(appPort)]);
  await waitReady(workerB, helper); assert.notEqual(worker.pid, workerB.pid);
  const replay = await upload(lostKey, {recovery: true}); assert.equal(replay.status, 201);
  assert.equal((await replay.json()).receipt.receiptId, before[0].receipt);
  assert.deepEqual(binding(lostKey), before); assert.equal(objectCount(), '2');
  console.info('WORKER RESTART / DISCARDED RESPONSE EXACT REPLAY PASS', JSON.stringify({workerA: worker.pid, workerB: workerB.pid, helper: helper.pid, bindings: 1, privateObjects: 2}));
  const different = await sharp({create: {width: 12, height: 8, channels: 3, background: '#ff5500'}}).png().toBuffer();
  const changed = new URLSearchParams(query); changed.set('expectedVersion', String(created.value.version + 1));
  const otherGuest = await ensureGuestResourceOwner({projectId: c.projectId, context: null, ownerService: owners});
  assert.equal(otherGuest.status, 'issued');
  const otherCookie = getGuestDraftOwnerCookieName() + '=' + encodeURIComponent(otherGuest.context);
  const differentProduct = new URLSearchParams(query); differentProduct.set('productId', randomUUID());
  const differentField = new URLSearchParams(query); differentField.set('fieldId', randomUUID());
  const differentDraft = new URLSearchParams(query); differentDraft.set('draftId', randomUUID());
  const unknownKey = randomUUID();
  for (const [label, key, options, status] of [
    ['different bytes', lostKey, {recovery: true, bytes: different}, 409],
    ['different context', lostKey, {recovery: true, parameters: changed}, 409],
    ['different Product', lostKey, {recovery: true, parameters: differentProduct}, 404],
    ['different field', lostKey, {recovery: true, parameters: differentField}, 404],
    ['different draft', lostKey, {recovery: true, parameters: differentDraft}, 404],
    ['wrong verified owner', lostKey, {recovery: true, selectedCookie: otherCookie}, 404],
    ['unknown key', unknownKey, {recovery: true}, 503],
    ['no owner', lostKey, {recovery: true, selectedCookie: ''}, 404],
  ]) {
    const r = await upload(key, options); await r.arrayBuffer(); assert.equal(r.status, status, label);
    console.info('RECOVERY REJECTION PASS', label, status);
  }
  assert.deepEqual(binding(lostKey), before);
  assert.deepEqual(binding(unknownKey), []);
  await verifyUploadBindingSecurity({c, prep, info, sql, keyDigest: sha256Text(lostKey)});
  await verifyMediaMatrix({env, c, sql, info, draft, created, verifyOwner, png, sharp, ids});
  await verifyImageCanary({env, c, png});
  console.info('WORKER AND MEDIA MATRIX PASS');
} catch (error) {
  console.error('FIRST BLOCKER', error.message);
  let safe = logs;
  for (const value of [info.SERVICE_ROLE_KEY, info.ANON_KEY, info.JWT_SECRET, env.LOCAL_COMMERCE_IMAGE_HELPER_SECRET, env.PHOTOGIFT_GUEST_DRAFT_OWNER_SECRET, guest.context]) if (value) safe = safe.split(value).join('[redacted]');
  console.error(safe.replace(/eyJ[A-Za-z0-9_.-]+/g, '[redacted]').slice(-8000));
  process.exitCode = 1;
} finally {
  for (const child of children) {
    if (child.exitCode !== null || child.signalCode !== null) continue;
    const exited = new Promise(r => child.once('exit', r));
    try { process.kill(-child.pid, 'SIGTERM'); } catch { continue; }
    await Promise.race([exited, new Promise(r => setTimeout(r, 5000))]);
    if (child.exitCode === null && child.signalCode === null) process.kill(-child.pid, 'SIGKILL');
  }
}
