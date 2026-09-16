import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createLocalPersistentMediaAuthority} from '../app/infrastructure/local-commerce/local-persistent-media-authority.server.ts';
import {catalogTestEnvironment, ids} from './fixtures/local-persistent-catalog.mjs';
import {uploadCustomerCustomizationImage} from '../app/client/customer-customization-image-upload.ts';
const sql = readFileSync('local/commerce/migrations/0013_local-commerce-upload-command-binding.sql', 'utf8');

test('upload binding is owner/project unique and references exact operation ownership', () => {
  assert.match(sql, /unique\(project_id,owner_id,key_digest\)/);
  assert.match(sql, /foreign key\(project_id,operation_id,owner_id\) references local_commerce.media_operations/);
  assert.match(sql, /p_recovery_only then return jsonb_build_object\('status','unavailable'\)/);
  assert.doesNotMatch(sql, /raw_key|raw_token|signed_url/);
});
test('begin and binding share a transaction and cleanup lock; fingerprint conflict cannot rebind', () => {
  assert.match(sql, /perform local_commerce.lock_media_project/);
  assert.match(sql, /binding.fingerprint<>p_fingerprint or binding.command_context<>context/);
  assert.match(sql, /'begin',null,p_draft_id,null,p_expected_version,p_input/);
  assert.match(sql, /insert into local_commerce.media_upload_command_bindings/);
  assert.doesNotMatch(sql, /^\s*(?:begin|commit|rollback);/mi);
});
test('binding RPC/table privilege is restricted with fixed search path', () => {
  assert.match(sql, /enable row level security/);
  assert.match(sql, /security definer set search_path=pg_catalog,local_commerce/);
  assert.match(sql, /revoke all on function local_commerce.media_upload_command[^;]+from public,anon,authenticated/);
  assert.match(sql, /grant execute on function local_commerce.media_upload_command[^;]+to service_role/);
});
test('invalid request selector or recovery without key is rejected before provider access', async () => {
  let calls = 0;
  const media = createLocalPersistentMediaAuthority(catalogTestEnvironment(), async () => { calls++; return null; });
  for (const patch of [{requestKey: 'not-a-uuid'}, {recoveryOnly: true}, {requestKey: crypto.randomUUID(), slotId: crypto.randomUUID()}]) {
    assert.equal((await media.accept({draftId: ids.product, expectedVersion: 1, fieldId: ids.field, bytes: new Uint8Array([1]), ...patch})).status, 'rejected');
  }
  assert.equal(calls, 0);
});
test('client new uploads use distinct random keys; explicit recovery retains the supplied key', async () => {
  const keys = [];
  const fake = async (_url, options) => { keys.push(new Headers(options.headers)); return new Response(null, {status: 503}); };
  const input = {productId: 'p', fieldId: 'f', file: new File(['test'], 'test.png')};
  await uploadCustomerCustomizationImage(input, fake); await uploadCustomerCustomizationImage(input, fake);
  assert.notEqual(keys[0].get('idempotency-key'), keys[1].get('idempotency-key'));
  const key = crypto.randomUUID(); await uploadCustomerCustomizationImage({...input, requestKey: key, recoveryOnly: true}, fake);
  assert.equal(keys[2].get('idempotency-key'), key); assert.equal(keys[2].get('x-upload-recovery'), '1');
});
