import assert from 'node:assert/strict';
import {randomUUID, createHash} from 'node:crypto';
import {createLocalPersistentMediaAuthority} from '../../app/infrastructure/local-commerce/local-persistent-media-authority.server.ts';
import {createLocalPersistentSupabaseAdapter} from '../../app/infrastructure/local-commerce/local-persistent-supabase-adapter.server.ts';
import {LocalCatalogAuthority} from '../../app/infrastructure/local-commerce/local-catalog-authority.server.ts';
import {persistentPurchaseReceipts} from '../../app/infrastructure/local-commerce/local-persistent-purchase-receipts.server.ts';
import {acceptConfiguredItemHandoff} from '../../app/application/configured-item-handoff-acceptance.ts';
import {acceptCartItem} from '../../app/application/shopping-cart-service.ts';
import {CheckoutReadinessEvaluator} from '../../app/application/checkout-readiness-evaluator.ts';

// Real DB/Storage/helper matrix. It is NOT the actual Worker smoke, which the
// caller has already run. Only this invocation's newly created Draft is used.
export async function verifyMediaMatrix({env, c, sql, info, draft, created, verifyOwner, png, sharp, ids}) {
  const nativeFetch = globalThis.fetch;
  const media = createLocalPersistentMediaAuthority(env, verifyOwner);
  const db = await createLocalPersistentSupabaseAdapter(env); assert.equal(db.status, 'ready');
  let state = created.value;
  const args = () => ({draftId: state.draftId, expectedVersion: state.version, fieldId: ids.field, bytes: png});
  const latest = () => JSON.parse(sql(`select row_to_json(x) from (select * from local_commerce.media_operations where project_id='${c.projectId}' and draft_id='${state.draftId}' order by created_at desc limit 1)x;`));
  const save = async (r, crop) => {
    const saved = await draft.port.save({authority: draft.authority, draftId: state.draftId, expectedVersion: state.version,
      idempotency: {key: randomUUID(), fingerprint: 'matrix-save'}, slots: [{slotId: r.slotId, fieldId: ids.field,
        receiptReference: r.receipt.receiptId, ...(crop ? {crop} : {})}]});
    assert.equal(saved.status, 'found'); state = saved.value;
  };
  const accepted = await media.accept(args()); assert.equal(accepted.status, 'found');
  const original = latest(); await save(accepted);
  const crop = {x: 0.25, y: 0.25, width: 0.5, height: 0.5};
  const cropped = await media.accept({...args(), slotId: accepted.slotId, originalReceiptId: accepted.receipt.receiptId, crop});
  assert.equal(cropped.status, 'found');
  const preview = await media.read(cropped.receipt.receiptId); assert.equal(preview.status, 'found');
  assert.deepEqual(await sharp(preview.bytes).metadata().then(m => [m.width, m.height]), [6, 4]);
  const pixels = await sharp(preview.bytes).removeAlpha().raw().toBuffer();
  const expectedPixels = await sharp(png).extract({left: 3, top: 2, width: 6, height: 4}).removeAlpha().raw().toBuffer();
  assert.deepEqual(pixels, expectedPixels);
  const bytes = await db.adapter.downloadPrivateObject(original.original_locator); assert.equal(bytes.status, 'found');
  assert.equal(createHash('sha256').update(Buffer.from(await bytes.value.arrayBuffer())).digest('hex'), createHash('sha256').update(png).digest('hex'));
  await save(cropped, crop);
  console.info('REAL STORAGE original digest / crop dimensions and pixels PASS');
  const handoff = {productId: ids.product, variantId: ids.variant, skuCode: 'SYNTHETIC-KEEPSAKE-S',
    selectedOptions: [{optionId: ids.option, valueId: ids.value}], configurationRevision: '1',
    customizationValues: [{fieldId: ids.field, fieldCode: 'photo', kind: 'image', images: [{receiptId: cropped.receipt.receiptId, crop}]}]};
  const owner = (await verifyOwner()).owner;
  const catalog = new LocalCatalogAuthority(env);
  const dependencies = h => ({catalogRepository: catalog.repository, customizationFieldRepository: catalog,
    receiptRepository: persistentPurchaseReceipts(env, verifyOwner, [h]), verifiedOwnerId: owner.ownerId, observedAt: new Date().toISOString()});
  const item = await acceptCartItem(handoff, dependencies(handoff)); assert.equal(item.status, 'accepted');
  for (const kind of ['original write', 'metadata publish', 'helper render', 'read-back']) {
    const requestKey = randomUUID();
    let helperCalls = 0, injected = 0;
    globalThis.fetch = async (u, o) => {
      if (kind === 'original write' && String(u).includes('/storage/v1/object/') && o?.method === 'POST'
        || kind === 'read-back' && String(u).includes('/storage/v1/object/') && (!o?.method || o.method === 'GET')) {
        injected++; const h = new Headers(o?.headers); h.set('authorization', 'Bearer ' + info.ANON_KEY);
        return nativeFetch(u, {...o, headers: h});
      }
      if (kind === 'metadata publish' && String(u).endsWith('/rpc/media_operation_command') && JSON.parse(o.body).p_command === 'publish') {
        injected++; return nativeFetch(u, {...o, body: JSON.stringify({...JSON.parse(o.body), p_marker_digest: '0'.repeat(64)})});
      }
      if (kind === 'helper render' && String(u) === c.endpoints.imageHelperUrl + '/process' && ++helperCalls === 2) {
        injected++; const h = new Headers(o.headers); h.set('authorization', 'Bearer wrong'); return nativeFetch(u, {...o, headers: h});
      }
      return nativeFetch(u, o);
    };
    try { assert.equal((await media.accept({...args(), requestKey})).status, 'unavailable', kind); }
    finally { globalThis.fetch = nativeFetch; }
    assert.ok(injected > 0); const pending = latest(); assert.equal(pending.lifecycle, 'pending'); assert.equal(pending.receipt_id, null);
    // Forged handoff of a pending operation cannot acquire a receipt. This is
    // hostile input to real purchase validators, not a persisted accepted Cart.
    const bad = structuredClone(handoff); bad.customizationValues[0].images[0].receiptId = pending.id;
    const deps = dependencies(bad);
    assert.equal((await acceptConfiguredItemHandoff({rawInput: bad, verifiedOwnerId: owner.ownerId, observedAt: deps.observedAt}, deps)).status, 'rejected');
    assert.equal((await acceptCartItem(bad, deps)).status, 'rejected');
    const evaluator = new CheckoutReadinessEvaluator({...deps, cartReader: {async getCart() { throw Error('not used'); }}});
    const report = await evaluator.evaluateCartRecord({lines: [{...item.value, lineId: randomUUID(), quantity: 1, handoff: bad}]});
    assert.ok(report.lines[0].issues.length > 0);
    console.info('REAL FAILURE GATE PASS', kind, 'configured-item / Cart Add / readiness rejected; no receipt');
    const retry = await media.accept({...args(), requestKey, recoveryOnly:true});
    assert.equal(retry.status, 'found'); assert.equal(retry.operationId, pending.id);
    assert.equal(sql(`select count(*) from local_commerce.media_upload_command_bindings where project_id='${c.projectId}' and operation_id='${pending.id}';`), '1');
    console.info('PENDING SAME-KEY RECOVERY PASS', kind, 'same operation / one binding');
  }
  globalThis.fetch = async (u, o) => {
    if (String(u).endsWith('/rpc/media_operation_command') && JSON.parse(o.body).p_command === 'publish')
      return nativeFetch(u, {...o, body: JSON.stringify({...JSON.parse(o.body), p_marker_digest: '0'.repeat(64)})});
    return nativeFetch(u, o);
  };
  try { assert.equal((await media.accept({...args(), slotId: cropped.slotId})).status, 'unavailable'); }
  finally { globalThis.fetch = nativeFetch; }
  const old = latest();
  const newer = await media.accept({...args(), slotId: cropped.slotId}); assert.equal(newer.status, 'found');
  await save(newer);
  assert.equal((await media.reconcile(old.id)).status, 'conflict');
  const recovered = await draft.port.read({authority: draft.authority, draftId: state.draftId});
  assert.deepEqual(recovered.value, state);
  console.info('STALE GENERATION PASS: late operation cannot overwrite confirmed Draft');
  // Delete only this newly created synthetic derivative, after exact locator
  // validation. Never any old run, original, or unrelated object.
  const extra = await media.accept(args()); assert.equal(extra.status, 'found'); const missing = latest();
  assert.equal(missing.id, extra.operationId);
  assert.equal(missing.derivative_locator, `${c.projectId}/media/${extra.operationId}/derivative`);
  const deleted = await db.adapter.removePrivateObjects([missing.derivative_locator]);
  assert.equal(deleted.status, 'found');
  assert.equal((await media.read(extra.receipt.receiptId)).status, 'unavailable');
  console.info('MISSING SYNTHETIC DERIVATIVE PASS: unavailable; exact test object removed');
}
