import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  cropPersistentCustomizationImage,
  createPersistentCustomizationDraft,
  hydratePersistentDraftImages,
  readPersistentCustomizationDraft,
  restorePersistentCustomizationDraft,
  savePersistentCustomizationDraft,
  selectPersistentDraftProjection,
} from "../app/client/local-persistent-draft.ts";
import { createProductCustomizationDraft } from "../app/domain/product-customization-draft.ts";
import { uploadCustomerCustomizationImage } from "../app/client/customer-customization-image-upload.ts";

const draftId = "10000000-0000-4000-8000-000000000001";
const productId = "20000000-0000-4000-8000-000000000002";
const receiptId = "30000000-0000-4000-8000-000000000003";
const slotId = "40000000-0000-4000-8000-000000000004";
const fieldId = "50000000-0000-4000-8000-000000000005";
const projection = { draftId, productId, version: 2, confirmedRevision: 2,
  slots: [{ slotId, fieldId, receiptReference: receiptId, position: 0, confirmedRevision: 2 }] };

test("Task 10.4 browser Draft client exposes only the authorized safe projection and bounded statuses", async () => {
  const requests = [];
  const fake = async (url, init) => { requests.push({ url, init }); return Response.json(projection); };
  const createKey = crypto.randomUUID();
  assert.deepEqual(await createPersistentCustomizationDraft(productId, createKey, fake), { status: "found", value: projection });
  assert.equal(requests[0].url, "/api/local-drafts");
  assert.equal(new Headers(requests[0].init.headers).get("idempotency-key"), createKey);
  assert.deepEqual(JSON.parse(requests[0].init.body), { productId });
  assert.deepEqual(await readPersistentCustomizationDraft(draftId, fake), { status: "found", value: projection });
  const saveKey = crypto.randomUUID();
  assert.deepEqual(await savePersistentCustomizationDraft({ draftId, expectedVersion: 1,
    slots: [{ fieldId, receiptReference: receiptId }], idempotencyKey: saveKey }, fake), { status: "found", value: projection });
  assert.deepEqual(JSON.parse(requests[2].init.body), { expectedVersion: 1, slots: [{ fieldId, receiptReference: receiptId }] });
  assert.doesNotMatch(JSON.stringify(requests), /ownerId|customerId|operationId|locator|bucket|objectKey|service.?role/i);
  assert.equal((await createPersistentCustomizationDraft(productId, createKey, async () => { throw Error("lost"); })).status, "indeterminate");
  assert.equal((await readPersistentCustomizationDraft(draftId, async () => { throw Error("offline"); })).status, "unavailable");
  assert.equal((await savePersistentCustomizationDraft({ draftId, expectedVersion: 1, slots: [], idempotencyKey: saveKey },
    async () => new Response(null, { status: 409 }))).status, "conflict");
});

test("Task 10.6 crop client sends exact Draft CAS and receives only a safe replacement receipt", async () => {
  const crop = { x: 0.1, y: 0.05, width: 0.8, height: 0.85 };
  const key = crypto.randomUUID();
  const receipt = { receiptId, contentType: "image/png", byteSize: 123, dimensions: { width: 16, height: 17 },
    createdAt: "2026-09-14T01:00:00.000Z", expiresAt: "2026-09-15T01:00:00.000Z", lifecycle: "active" };
  const calls = [];
  const result = await cropPersistentCustomizationImage({ productId, fieldId, draftId, expectedVersion: 4,
    receiptId, crop, idempotencyKey: key }, async (url, init) => {
    calls.push({ url, init }); return Response.json({ receipt }, { status: 201 });
  });
  assert.deepEqual(result, { status: "found", receipt });
  assert.equal(calls[0].url, "/api/customer-uploads/preview");
  assert.equal(new Headers(calls[0].init.headers).get("idempotency-key"), key);
  assert.deepEqual(JSON.parse(calls[0].init.body), { productId, fieldId, draftId, expectedVersion: 4, receiptId, crop });
  assert.doesNotMatch(JSON.stringify(result), /ownerId|operationId|slotId|locator|bucket|objectKey|service.?role/i);
});

test("Task 10.4 upload helper keeps upload/recovery/release on one route with exact caller key and Draft CAS", async () => {
  const calls = [];
  const key = crypto.randomUUID();
  const file = new File(["same bytes"], "same.png", { type: "image/png" });
  const fake = async (url, init) => { calls.push({ url, init }); return new Response(null, { status: 204 }); };
  const released = await uploadCustomerCustomizationImage({ productId, fieldId, file, draftId,
    expectedVersion: 4, requestKey: key, releaseOnly: true }, fake);
  assert.equal(released.status, "released");
  assert.match(calls[0].url, /^\/api\/uploads\?/);
  const query = new URL(calls[0].url, "http://local.test").searchParams;
  assert.equal(query.get("draftId"), draftId);
  assert.equal(query.get("expectedVersion"), "4");
  const headers = new Headers(calls[0].init.headers);
  assert.equal(headers.get("idempotency-key"), key);
  assert.equal(headers.get("x-upload-release"), "1");
  assert.equal(headers.get("x-upload-recovery"), null);
  assert.equal((await uploadCustomerCustomizationImage({ productId, fieldId, file, draftId,
    expectedVersion: 4, requestKey: key, recoveryOnly: true, releaseOnly: true }, fake)).status, "invalid_request");
  assert.equal(calls.length, 1);
});

test("Task 10.4 server source reuses owner/CSRF/Draft/media authorities and never returns private selectors", async () => {
  const [draftServer, mediaServer, mediaAuthority, detail, field] = await Promise.all([
    readFile(new URL("../app/server/local-persistent-draft-http.server.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/server/local-persistent-media-http.server.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/infrastructure/local-commerce/local-persistent-media-authority.server.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/storefront/ProductDetailExperience.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/storefront/ProductCustomizationImageField.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(draftServer, /createLocalPersistentDraftPort/);
  assert.match(draftServer, /persistentOwnerVerifier/);
  assert.match(draftServer, /isSameOriginCartMutation/);
  assert.match(draftServer, /resolveDraftSlot/);
  assert.match(draftServer, /cache-control["']:\s*["']no-store/);
  assert.doesNotMatch(draftServer, /localStorage|indexedDB|owner-wide|latest-by-email/i);
  assert.match(mediaServer, /x-upload-recovery/);
  assert.match(mediaServer, /x-upload-release/);
  assert.match(mediaServer, /releaseUpload/);
  assert.doesNotMatch(mediaServer, /operationId.*Response\.json|slotId.*Response\.json|signedUrl/i);
  assert.match(mediaAuthority, /recoveryOnly:\s*true/);
  assert.match(mediaAuthority, /retireRecovered/);
  assert.match(mediaAuthority, /lifecycle === "pending"[\s\S]*rpc\("fail"/);
  assert.match(detail, /persistentCreateKey/);
  assert.match(detail, /saveField/);
  assert.match(field, /server_pending/);
  assert.match(field, /draft_saving/);
  assert.match(field, /releasePersistentOperation/);
  assert.match(field, /detachStalePersistentReceipt/);
});

test("Task 10.5 exact Product restore parses only safe confirmed slot metadata", async () => {
  const receipt = { receiptId, contentType: "image/png", byteSize: 123, dimensions: { width: 20, height: 30 },
    createdAt: "2026-09-14T01:00:00.000Z", expiresAt: "2026-09-15T01:00:00.000Z", lifecycle: "active" };
  const requests = [];
  const result = await restorePersistentCustomizationDraft(productId, async (url, init) => {
    requests.push({ url, init });
    return Response.json({ status: "found", draft: projection,
      receipts: [{ slotId, status: "found", receipt }] });
  });
  assert.deepEqual(result, { status: "found", value: { draft: projection,
    receipts: [{ slotId, status: "found", receipt }] } });
  assert.equal(requests[0].url, `/api/local-drafts?productId=${productId}`);
  assert.equal(requests[0].init.method, "GET");
  assert.equal(requests[0].init.cache, "no-store");
  assert.equal((await restorePersistentCustomizationDraft(productId,
    async () => Response.json({ status: "not_found" }))).status, "not_found");
  assert.equal((await restorePersistentCustomizationDraft(productId,
    async () => Response.json({ status: "found", draft: projection, receipts: [{ slotId, status: "found", receipt,
      operationId: crypto.randomUUID() }] }))).status, "unavailable");
});

test("Task 10.5 restored Draft hydrates image facts only and preserves unavailable receipt references", () => {
  const unavailableReceipt = "60000000-0000-4000-8000-000000000006";
  const restored = { draft: { ...projection, slots: [projection.slots[0], { slotId: "70000000-0000-4000-8000-000000000007",
    fieldId, receiptReference: unavailableReceipt, position: 1, confirmedRevision: 2 }] },
  receipts: [{ slotId, status: "found", receipt: { receiptId, contentType: "image/png", byteSize: 123,
    dimensions: { width: 20, height: 30 }, createdAt: "2026-09-14T01:00:00.000Z",
    expiresAt: "2026-09-15T01:00:00.000Z", lifecycle: "active" } },
  { slotId: "70000000-0000-4000-8000-000000000007", status: "unavailable" }] };
  const initial = createProductCustomizationDraft({ productId, configurationRevision: "9" });
  const hydrated = hydratePersistentDraftImages({ current: initial,
    fields: [{ id: fieldId, code: "photos", kind: "image", isActive: true },
      { id: "text-field", code: "note", kind: "short_text", isActive: true }], restored });
  assert.equal(hydrated.selectedVariant, null);
  assert.deepEqual(hydrated.selectedOptions, []);
  assert.deepEqual(hydrated.values, [{ fieldId, fieldCode: "photos", kind: "image",
    images: [{ receiptId }, { receiptId: unavailableReceipt }] }]);
  assert.deepEqual(hydrated.acceptedReceipts.map(value => value.receiptId), [receiptId]);
});

test("Task 10.5 projection selection rejects older, regressive, and different-Draft responses", () => {
  const current = { ...projection, version: 5, confirmedRevision: 4 };
  assert.equal(selectPersistentDraftProjection(null, current), null);
  assert.equal(selectPersistentDraftProjection(null, current, true), current);
  assert.equal(selectPersistentDraftProjection(current, { ...current, version: 4 }), current);
  assert.equal(selectPersistentDraftProjection(current, { ...current, confirmedRevision: 3 }), current);
  assert.equal(selectPersistentDraftProjection(current, { ...current, draftId: crypto.randomUUID(), version: 6 }), current);
  const newer = { ...current, version: 6, confirmedRevision: 5 };
  assert.equal(selectPersistentDraftProjection(current, newer), newer);
});

test("Task 10.5 restore source uses an HttpOnly exact selector and no owner/Product scan", async () => {
  const [draftServer, route, detail, field] = await Promise.all([
    readFile(new URL("../app/server/local-persistent-draft-http.server.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/local-drafts/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/storefront/ProductDetailExperience.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/storefront/ProductCustomizationImageField.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(route, /persistentDraftHttp\(request, "restore"\)/);
  assert.match(draftServer, /photogift-local-draft-/);
  assert.match(draftServer, /HttpOnly; SameSite=Lax/);
  assert.match(draftServer, /adapter\.port\.read/);
  assert.doesNotMatch(draftServer, /latest|order by|owner-wide|product-wide/i);
  assert.match(detail, /restorePersistentCustomizationDraft/);
  assert.match(detail, /localEditEpoch/);
  assert.match(field, /Saved private image preview/);
  assert.match(field, /customer-uploads\/preview\?receiptId/);
  assert.doesNotMatch(`${draftServer}\n${detail}\n${field}`, /localStorage|sessionStorage|indexedDB/i);
});
