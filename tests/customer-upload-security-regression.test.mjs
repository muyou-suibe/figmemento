import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { acceptCustomerImageUpload } from "../app/application/customer-upload-acceptance-service.ts";
import { CustomerUploadLifecycleService } from "../app/application/customer-upload-lifecycle-service.ts";
import { createGuestDraftOwnerService, getGuestDraftOwnerCookieName } from "../app/lib/guest-draft-owner.ts";
import { createCustomerInputSafeObservability } from "../app/server/customer-input-safe-failure.server.ts";
import { createCustomerUploadHttpHandler } from "../app/server/customer-upload-http-handler.server.ts";
import { createCustomerUploadPreviewHttpHandler } from "../app/server/customer-upload-preview-handler.server.ts";
import { createControlledCustomerUploadAdapters } from "../app/testing/customer-upload-failure-controls.ts";
import { createDeterministicCustomerUploadFakes } from "../app/testing/customer-upload-fakes.ts";

const origin = "https://photogift.test";
const createdAt = "2026-08-13T12:00:00.000Z";
const observedAt = "2026-08-14T12:00:00.000Z";
const expiresAt = "2026-08-14T12:10:00.000Z";
const laterExpiry = "2026-08-14T12:20:00.000Z";
const forbiddenBrowserAuthorityFields = ["bucket", "storageKey", "storage_key", "objectKey", "object_key", "path", "url", "signedUrl", "provider", "ownerId", "receiptId", "expiresAt", "allowedMimeTypes", "maxBytes", "minDimensions"];
const forbiddenResponseLocatorKeys = ["bucket", "storageKey", "storage_key", "objectKey", "object_key", "path", "url", "signedUrl", "provider", "ownerId"];
const providerMarkers = ["bucket=private-media", "storageKey=drafts/secret.png", "signedUrl=https://provider.test/secret", "token=secret", "SQLSTATE 23505", "DETAIL secret-detail", "HINT secret-hint", "customer-text-marker"];

const constraints = {
  allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  maxBytes: 1_024,
  minDimensions: { width: 100, height: 100 },
  recommendedDimensions: { width: 300, height: 300 },
  minImageCount: 1,
  maxImageCount: 2,
  cropEnabled: false,
};

function uint32BE(value) {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function pngChunk(type, data) {
  return [...uint32BE(data.length), ...type.split("").map((entry) => entry.charCodeAt(0)), ...data, 0, 0, 0, 0];
}

function png(width = 200, height = 150) {
  return new Uint8Array([
    137, 80, 78, 71, 13, 10, 26, 10,
    ...pngChunk("IHDR", [...uint32BE(width), ...uint32BE(height), 8, 6, 0, 0, 0]),
    ...pngChunk("IDAT", [0]),
    ...pngChunk("IEND", []),
  ]);
}

async function* byteStream(bytes) {
  yield new Uint8Array(bytes);
}

function createOwners(offset = 0) {
  let next = offset;
  return createGuestDraftOwnerService({
    signingSecret: "offline-security-regression-owner-secret-material-1234567890",
    contextLifetimeSeconds: 3_600,
  }, {
    nowSeconds: () => 1_700_000_000,
    randomBytes(length) {
      const bytes = new Uint8Array(length);
      for (let index = 0; index < length; index += 1) bytes[index] = (next + index + 1) % 256;
      next += length;
      return bytes;
    },
  });
}

async function issueOwner(service) {
  const issued = await service.issueGuestDraftOwner();
  assert.equal(issued.status, "issued");
  return issued.value;
}

function receipt(receiptId, ownerId, overrides = {}) {
  return {
    receiptId,
    ownerId,
    originalFilename: "portrait.png",
    contentType: "image/png",
    byteSize: 20,
    dimensions: { width: 200, height: 150 },
    createdAt,
    expiresAt,
    lifecycle: "active",
    ...overrides,
  };
}

function setup(options = {}) {
  const base = createDeterministicCustomerUploadFakes({
    now: () => options.now ?? observedAt,
    derivePreviewExpiresAt: ({ receipt: item }) => options.previewExpiresAt ?? item.expiresAt,
    receipts: options.receipts ?? [],
  });
  const adapters = createControlledCustomerUploadAdapters({
    objectStore: base.objectStore,
    receiptRepository: base.receiptRepository,
    previewAccess: base.previewAccess,
    failurePlan: options.failurePlan,
  });
  return { base, adapters, lifecycle: new CustomerUploadLifecycleService(adapters.receiptRepository, adapters.objectStore) };
}

async function persistObject(base, receiptId) {
  const result = await base.objectStore.putPrivateObject({
    receiptId,
    content: { contentType: "image/png", bytes: byteStream(png()) },
  });
  assert.deepEqual(result, { status: "stored", value: true });
}

function acceptanceDependencies(adapters, receiptIds) {
  let index = 0;
  return {
    objectStore: adapters.objectStore,
    receiptRepository: adapters.receiptRepository,
    receiptIdGenerator: { allocateReceiptId: () => receiptIds[index++] },
    now: () => createdAt,
    expiryPolicy: { deriveExpiresAt: () => expiresAt },
  };
}

function uploadInput() {
  return {
    verifiedOwnerId: "owner-a",
    fieldConstraints: constraints,
    bytes: png(),
    originalFilename: "portrait.png",
  };
}

function makeEvents() {
  const values = [];
  let next = 0;
  return {
    values,
    observability: createCustomerInputSafeObservability({
      createCorrelationId: () => `security-correlation-${++next}`,
      sink: { record(event) { values.push(event); } },
    }),
  };
}

function normalizeEvents(values) {
  return values.map(({ event, operation, category }) => ({ event, operation, category }));
}

function previewRequest(context, receiptId) {
  return new Request(`${origin}/api/customer-uploads/preview?receiptId=${encodeURIComponent(receiptId)}`, {
    headers: { cookie: `${getGuestDraftOwnerCookieName()}=${encodeURIComponent(context)}` },
  });
}

function previewHandler({ owners, adapters, counters, observability, now = observedAt }) {
  return createCustomerUploadPreviewHttpHandler({
    ownerService: owners,
    createReceiptRepository() {
      counters.receiptFactory += 1;
      return adapters.receiptRepository;
    },
    createPreviewAccess() {
      counters.previewFactory += 1;
      return adapters.previewAccess;
    },
    createObjectStore() {
      counters.objectFactory += 1;
      return adapters.objectStore;
    },
    now: () => now,
    observability,
  });
}

function uploadRequest({ fileType = "image/png", fileName = "portrait.png", extraFields = [] } = {}) {
  const form = new FormData();
  form.append("file", new File([png()], fileName, { type: fileType }));
  for (const [key, value] of extraFields) form.append(key, value);
  return new Request(`${origin}/api/uploads`, {
    method: "POST",
    body: form,
    headers: { origin, "sec-fetch-site": "same-origin" },
  });
}

function assertNoProviderMarkers(value) {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  for (const marker of providerMarkers) {
    assert.doesNotMatch(serialized, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
}

function assertNoAuthorityKeys(value) {
  if (Array.isArray(value)) {
    for (const entry of value) assertNoAuthorityKeys(entry);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    assert.equal(forbiddenResponseLocatorKeys.includes(key), false, `forbidden response locator key: ${key}`);
    assertNoAuthorityKeys(nested);
  }
}

test("ownership: cross-owner and guessed preview requests are identical, stop before failpoints, and reveal no receipt existence", async () => {
  const ownerAService = createOwners(0);
  const ownerBService = createOwners(100);
  const ownerA = await issueOwner(ownerAService);
  const ownerB = await issueOwner(ownerBService);
  const { base, adapters } = setup({
    receipts: [{ receipt: receipt("receipt-owned-by-b", ownerB.ownerId) }],
    failurePlan: { previewAuthorize: ["source_failure"], objectRead: ["source_failure"] },
  });
  await persistObject(base, "receipt-owned-by-b");
  const crossEvents = makeEvents();
  const missingEvents = makeEvents();
  const crossCounters = { receiptFactory: 0, previewFactory: 0, objectFactory: 0 };
  const missingCounters = { receiptFactory: 0, previewFactory: 0, objectFactory: 0 };
  const cross = previewHandler({ owners: ownerAService, adapters, counters: crossCounters, observability: crossEvents.observability });
  const missing = previewHandler({ owners: ownerAService, adapters, counters: missingCounters, observability: missingEvents.observability });

  const [crossResponse, missingResponse] = await Promise.all([
    cross(previewRequest(ownerA.context, "receipt-owned-by-b")),
    missing(previewRequest(ownerA.context, "receipt-guessed-but-valid")),
  ]);
  assert.equal(crossResponse.status, 404);
  assert.equal(missingResponse.status, 404);
  assert.deepEqual(await crossResponse.json(), await missingResponse.json());
  assert.deepEqual(normalizeEvents(crossEvents.values), normalizeEvents(missingEvents.values));
  assert.deepEqual(normalizeEvents(crossEvents.values), [{ event: "customer_input_failure", operation: "preview", category: "not_found" }]);
  assert.deepEqual(crossCounters, { receiptFactory: 1, previewFactory: 0, objectFactory: 0 });
  assert.deepEqual(missingCounters, { receiptFactory: 1, previewFactory: 0, objectFactory: 0 });
  assert.deepEqual(adapters.snapshot().calls, { objectPut: 0, receiptCreate: 0, previewAuthorize: 0, objectRead: 0, objectDelete: 0 });
  assert.deepEqual(adapters.snapshot().remaining.previewAuthorize, ["source_failure"]);
  assert.deepEqual(adapters.snapshot().remaining.objectRead, ["source_failure"]);
});

test("ownership: cross-owner lookup, remove, replace, and attach are indistinguishable from an unknown receipt with zero mutation", async () => {
  const { adapters, base } = setup({
    receipts: [
      { receipt: receipt("receipt-owner-a", "owner-a") },
      { receipt: receipt("receipt-owner-b", "owner-b") },
    ],
  });
  const operations = [
    adapters.receiptRepository.findOwnedReceipt("receipt-owner-b", "owner-a"),
    adapters.receiptRepository.findOwnedReceipt("receipt-guessed", "owner-a"),
    adapters.receiptRepository.removeOwnedReceipt({ ownerId: "owner-a", receiptId: "receipt-owner-b", operationId: "remove-cross" }),
    adapters.receiptRepository.removeOwnedReceipt({ ownerId: "owner-a", receiptId: "receipt-guessed", operationId: "remove-guess" }),
    adapters.receiptRepository.replaceOwnedReceipt({ ownerId: "owner-a", receiptId: "receipt-owner-b", replacementReceiptId: "receipt-owner-a", operationId: "replace-cross" }),
    adapters.receiptRepository.replaceOwnedReceipt({ ownerId: "owner-a", receiptId: "receipt-guessed", replacementReceiptId: "receipt-owner-a", operationId: "replace-guess" }),
    adapters.receiptRepository.attachOwnedReceiptOnce({ ownerId: "owner-a", receiptId: "receipt-owner-b", attachment: { attachmentId: "attachment-a" }, operationId: "attach-cross" }),
    adapters.receiptRepository.attachOwnedReceiptOnce({ ownerId: "owner-a", receiptId: "receipt-guessed", attachment: { attachmentId: "attachment-a" }, operationId: "attach-guess" }),
  ];
  for (const result of await Promise.all(operations)) assert.deepEqual(result, { status: "not_found" });
  assert.equal(base.snapshot().receipts.find((item) => item.receipt.receiptId === "receipt-owner-b").receipt.lifecycle, "active");
  assert.equal(base.snapshot().receipts.find((item) => item.receipt.receiptId === "receipt-owner-a").attachmentId, undefined);
});

test("browser authority: forged MIME is only a hint and canonical receipt metadata is derived from actual bytes", async () => {
  const owners = createOwners();
  const { base, adapters } = setup();
  const handler = createCustomerUploadHttpHandler({
    ownerService: owners,
    async resolveFieldConstraints() { return { status: "found", constraints }; },
    createAcceptanceDependencies() { return acceptanceDependencies(adapters, ["receipt-canonical"]); },
    runtimeMode: "development",
  });
  const response = await handler(uploadRequest({ fileType: "image/jpeg", fileName: "misleading.jpg" }));
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.receipt.contentType, "image/png");
  assert.equal(body.receipt.byteSize, png().byteLength);
  assert.deepEqual(body.receipt.dimensions, { width: 200, height: 150 });
  assert.equal(body.receipt.originalFilename, "misleading.jpg");
  assert.equal(body.receipt.createdAt, createdAt);
  assert.equal(body.receipt.expiresAt, expiresAt);
  assert.equal(body.receipt.lifecycle, "active");
  assertNoAuthorityKeys(body);
  assert.deepEqual(base.snapshot().receipts.map((item) => item.receipt.contentType), ["image/png"]);
});

test("browser metadata: declared byte size is a non-authoritative hint and actual inspected bytes remain canonical", async () => {
  const { base, adapters } = setup();
  const bytes = png();
  const result = await acceptCustomerImageUpload({
    ...uploadInput(),
    bytes,
    declaredContentType: "image/jpeg",
    declaredByteSize: 1,
  }, acceptanceDependencies(adapters, ["receipt-byte-size-canonical"]));
  assert.equal(result.status, "accepted");
  assert.equal(result.receipt.byteSize, bytes.byteLength);
  assert.equal(result.receipt.contentType, "image/png");
  assert.equal(result.warnings.some((entry) => entry.code === "declared_mime_mismatch"), true);
  assert.equal(result.warnings.some((entry) => entry.code === "declared_byte_size_mismatch"), true);
  assert.deepEqual(base.snapshot().objects.map((item) => item.receiptId), ["receipt-byte-size-canonical"]);
});

test("browser authority: multipart locator/owner/config injection is rejected before persistence construction or mutation", async () => {
  const owners = createOwners();
  const { base, adapters } = setup();
  let acceptanceFactoryCalls = 0;
  const handler = createCustomerUploadHttpHandler({
    ownerService: owners,
    async resolveFieldConstraints() { return { status: "found", constraints }; },
    createAcceptanceDependencies() {
      acceptanceFactoryCalls += 1;
      return acceptanceDependencies(adapters, ["receipt-must-not-exist"]);
    },
    runtimeMode: "development",
  });
  const response = await handler(uploadRequest({
    extraFields: forbiddenBrowserAuthorityFields.map((key) => [key, "browser-forged-authority"]),
  }));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Invalid upload request." });
  assert.equal(acceptanceFactoryCalls, 0);
  assert.deepEqual(base.snapshot(), { objects: [], receipts: [] });
  assert.deepEqual(adapters.snapshot().calls, { objectPut: 0, receiptCreate: 0, previewAuthorize: 0, objectRead: 0, objectDelete: 0 });
});

test("lifecycle replay: same attachment target and remove/replace repeats are state-derived, conflicts fail closed, and no object is eagerly deleted", async () => {
  const { base, lifecycle } = setup({
    receipts: [
      { receipt: receipt("attach-receipt", "owner-a") },
      { receipt: receipt("remove-receipt", "owner-a") },
      { receipt: receipt("replace-old", "owner-a") },
      { receipt: receipt("replace-new", "owner-a") },
      { receipt: receipt("replace-conflict", "owner-a") },
    ],
  });
  await persistObject(base, "attach-receipt");
  assert.equal((await lifecycle.attachCustomerUploadOnce({ verifiedOwnerId: "owner-a", receiptId: "attach-receipt", attachment: { attachmentId: "target-a" }, operationId: "attach-1" })).status, "attached");
  assert.equal((await lifecycle.attachCustomerUploadOnce({ verifiedOwnerId: "owner-a", receiptId: "attach-receipt", attachment: { attachmentId: "target-a" }, operationId: "attach-2" })).status, "attached");
  assert.deepEqual(await lifecycle.attachCustomerUploadOnce({ verifiedOwnerId: "owner-a", receiptId: "attach-receipt", attachment: { attachmentId: "target-b" }, operationId: "attach-3" }), { status: "invalid_state" });
  assert.equal((await lifecycle.removeCustomerUpload({ verifiedOwnerId: "owner-a", receiptId: "remove-receipt", operationId: "remove-1" })).status, "changed");
  assert.equal((await lifecycle.removeCustomerUpload({ verifiedOwnerId: "owner-a", receiptId: "remove-receipt", operationId: "remove-2" })).status, "changed");
  assert.deepEqual(await lifecycle.attachCustomerUploadOnce({ verifiedOwnerId: "owner-a", receiptId: "remove-receipt", attachment: { attachmentId: "target-after-remove" }, operationId: "attach-removed" }), { status: "invalid_state" });
  assert.equal((await lifecycle.replaceCustomerUpload({ verifiedOwnerId: "owner-a", receiptId: "replace-old", replacementReceiptId: "replace-new", operationId: "replace-1" })).status, "changed");
  assert.equal((await lifecycle.replaceCustomerUpload({ verifiedOwnerId: "owner-a", receiptId: "replace-old", replacementReceiptId: "replace-new", operationId: "replace-2" })).status, "changed");
  assert.deepEqual(await lifecycle.replaceCustomerUpload({ verifiedOwnerId: "owner-a", receiptId: "replace-old", replacementReceiptId: "replace-conflict", operationId: "replace-3" }), { status: "invalid_state" });
  const snapshot = base.snapshot().receipts;
  assert.equal(snapshot.find((item) => item.receipt.receiptId === "attach-receipt").receipt.lifecycle, "active");
  assert.equal(snapshot.find((item) => item.receipt.receiptId === "attach-receipt").attachmentId, "target-a");
  assert.equal(snapshot.find((item) => item.receipt.receiptId === "remove-receipt").receipt.lifecycle, "removed");
  assert.equal(snapshot.find((item) => item.receipt.receiptId === "replace-old").receipt.lifecycle, "replaced");
  assert.equal(snapshot.find((item) => item.receipt.receiptId === "replace-new").receipt.lifecycle, "active");
  assert.equal(snapshot.find((item) => item.receipt.receiptId === "replace-conflict").receipt.lifecycle, "active");
  assert.deepEqual(base.snapshot().objects.map((item) => item.receiptId), ["attach-receipt"]);
});

test("expiry and attachment: server time controls expiry, expired preview is denied, and attached content cannot be removed, expired, or cleanup-deleted", async () => {
  const owners = createOwners();
  const owner = await issueOwner(owners);
  const { base, adapters, lifecycle } = setup({
    receipts: [
      { receipt: receipt("expired-receipt", owner.ownerId, { expiresAt: observedAt }) },
      { receipt: receipt("early-receipt", owner.ownerId, { expiresAt: laterExpiry }) },
      { receipt: receipt("attached-receipt", owner.ownerId, { expiresAt: observedAt }) },
    ],
    failurePlan: { objectDelete: ["source_failure"] },
  });
  await persistObject(base, "expired-receipt");
  await persistObject(base, "attached-receipt");
  assert.equal((await lifecycle.attachCustomerUploadOnce({ verifiedOwnerId: owner.ownerId, receiptId: "attached-receipt", attachment: { attachmentId: "order-item-a" }, operationId: "attach" })).status, "attached");
  const counters = { receiptFactory: 0, previewFactory: 0, objectFactory: 0 };
  const safeEvents = makeEvents();
  const handler = previewHandler({ owners, adapters, counters, observability: safeEvents.observability });
  const preview = await handler(previewRequest(owner.context, "expired-receipt"));
  assert.equal(preview.status, 404);
  assert.deepEqual(await preview.json(), { error: "Customer input preview is unavailable." });
  assert.deepEqual(counters, { receiptFactory: 1, previewFactory: 0, objectFactory: 0 });
  assert.equal((await lifecycle.expireCustomerUpload({ receiptId: "expired-receipt", observedAt, operationId: "expire" })).status, "changed");
  assert.deepEqual(await lifecycle.expireCustomerUpload({ receiptId: "early-receipt", observedAt, operationId: "too-early" }), { status: "invalid_state" });
  assert.deepEqual(await lifecycle.removeCustomerUpload({ verifiedOwnerId: owner.ownerId, receiptId: "attached-receipt", operationId: "remove-attached" }), { status: "invalid_state" });
  assert.deepEqual(await lifecycle.expireCustomerUpload({ receiptId: "attached-receipt", observedAt, operationId: "expire-attached" }), { status: "invalid_state" });
  const cleanup = await lifecycle.runCustomerUploadCleanup({ observedAt, limit: 10, operationId: "cleanup" });
  assert.equal(cleanup.status, "claimed");
  assert.equal(cleanup.attempts.some((entry) => entry.receiptId === "attached-receipt"), false);
  const attached = base.snapshot().receipts.find((item) => item.receipt.receiptId === "attached-receipt");
  assert.equal(attached.receipt.lifecycle, "active");
  assert.equal(attached.attachmentId, "order-item-a");
  assert.equal(adapters.snapshot().calls.objectDelete, 1, "only expired-receipt reaches configured deletion failure");
  assert.deepEqual(adapters.snapshot().remaining.objectDelete, []);
});

test("attachment protection: attached receipts never consume a cleanup delete failure action", async () => {
  const { base, adapters, lifecycle } = setup({
    receipts: [{ receipt: receipt("attached-only-cleanup", "owner-a") }],
    failurePlan: { objectDelete: ["source_failure"] },
  });
  await persistObject(base, "attached-only-cleanup");
  assert.equal((await lifecycle.attachCustomerUploadOnce({
    verifiedOwnerId: "owner-a",
    receiptId: "attached-only-cleanup",
    attachment: { attachmentId: "order-item-attached" },
    operationId: "attach-only",
  })).status, "attached");
  assert.deepEqual(await lifecycle.runCustomerUploadCleanup({ observedAt, limit: 1, operationId: "cleanup-attached-only" }), {
    status: "claimed",
    attempts: [],
  });
  assert.equal(adapters.snapshot().calls.objectDelete, 0);
  assert.deepEqual(adapters.snapshot().remaining.objectDelete, ["source_failure"]);
  assert.deepEqual(base.snapshot().objects.map((item) => item.receiptId), ["attached-only-cleanup"]);
  assert.equal(base.snapshot().receipts[0].receipt.lifecycle, "active");
});

test("cleanup: controlled delete failure moves reachable state to cleanup_failed, retry completes, and internally absent objects remain completion-only", async () => {
  const { base, lifecycle } = setup({
    receipts: [{ receipt: receipt("retry-cleanup", "owner-a", { lifecycle: "removed" }) }],
    failurePlan: { objectDelete: ["source_failure", "pass"] },
  });
  await persistObject(base, "retry-cleanup");
  const first = await lifecycle.runCustomerUploadCleanup({ observedAt, limit: 1, operationId: "cleanup-1" });
  assert.deepEqual(first, { status: "claimed", attempts: [{ status: "failed", receiptId: "retry-cleanup" }] });
  assert.equal(base.snapshot().receipts[0].receipt.lifecycle, "cleanup_failed");
  assert.deepEqual(base.snapshot().objects.map((item) => item.receiptId), ["retry-cleanup"]);
  const second = await lifecycle.runCustomerUploadCleanup({ observedAt, limit: 1, operationId: "cleanup-2" });
  assert.deepEqual(second, { status: "claimed", attempts: [{ status: "completed", receiptId: "retry-cleanup" }] });
  assert.equal(base.snapshot().receipts[0].receipt.lifecycle, "cleanup_completed");
  assert.deepEqual(base.snapshot().objects, []);

  const absent = setup({ receipts: [{ receipt: receipt("already-absent", "owner-a", { lifecycle: "removed" }) }] });
  const absentResult = await absent.lifecycle.runCustomerUploadCleanup({ observedAt, limit: 1, operationId: "cleanup-absent" });
  assert.deepEqual(absentResult, { status: "claimed", attempts: [{ status: "completed", receiptId: "already-absent" }] });
  assert.equal(absent.base.snapshot().receipts[0].receipt.lifecycle, "cleanup_completed");
});

test("leakage: successful upload/preview are provider-locator-free and hostile failures stay out of bodies, headers, and safe events", async () => {
  const uploadOwners = createOwners();
  const uploadSetup = setup();
  const uploadHandler = createCustomerUploadHttpHandler({
    ownerService: uploadOwners,
    async resolveFieldConstraints() { return { status: "found", constraints }; },
    createAcceptanceDependencies() { return acceptanceDependencies(uploadSetup.adapters, ["receipt-safe-response"]); },
    runtimeMode: "development",
  });
  const uploadResponse = await uploadHandler(uploadRequest());
  assert.equal(uploadResponse.status, 201);
  const uploadBody = await uploadResponse.json();
  assertNoAuthorityKeys(uploadBody);
  assertNoProviderMarkers(uploadBody);
  assertNoProviderMarkers([...uploadResponse.headers.entries()]);

  const previewOwners = createOwners(200);
  const previewOwner = await issueOwner(previewOwners);
  const previewSetup = setup({ receipts: [{ receipt: receipt("receipt-preview-safe", previewOwner.ownerId) }] });
  await persistObject(previewSetup.base, "receipt-preview-safe");
  const previewCounters = { receiptFactory: 0, previewFactory: 0, objectFactory: 0 };
  const previewHandlerInstance = previewHandler({ owners: previewOwners, adapters: previewSetup.adapters, counters: previewCounters, observability: makeEvents().observability });
  const previewResponse = await previewHandlerInstance(previewRequest(previewOwner.context, "receipt-preview-safe"));
  assert.equal(previewResponse.status, 200);
  assert.equal(previewResponse.headers.get("content-type"), "image/png");
  assertNoProviderMarkers([...previewResponse.headers.entries()]);
  assertNoProviderMarkers(new Uint8Array(await previewResponse.arrayBuffer()));

  const failureOwners = createOwners(300);
  const failureEvents = makeEvents();
  const failureSetup = setup({ failurePlan: { objectPut: ["throw_hostile"] } });
  const failureHandler = createCustomerUploadHttpHandler({
    ownerService: failureOwners,
    async resolveFieldConstraints() { return { status: "found", constraints }; },
    createAcceptanceDependencies() { return acceptanceDependencies(failureSetup.adapters, ["receipt-hostile"]); },
    runtimeMode: "development",
    observability: failureEvents.observability,
  });
  const failureResponse = await failureHandler(uploadRequest());
  assert.equal(failureResponse.status, 503);
  const failureBody = await failureResponse.json();
  assertNoProviderMarkers(failureBody);
  assertNoProviderMarkers([...failureResponse.headers.entries()]);
  assertNoProviderMarkers(failureEvents.values);
});

test("Task 6.3 customer-input surfaces retain public catalog/ProductAsset separation and never compose test adapters into production routes", async () => {
  const [productAssets, sitemap, uploadRoute, previewRoute, fakes, controls] = await Promise.all([
    readFile(new URL("../app/application/catalog-assets.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/sitemap.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/uploads/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/customer-uploads/preview/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/testing/customer-upload-fakes.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/testing/customer-upload-failure-controls.ts", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(`${productAssets}\n${sitemap}`, /CustomerUploadReceipt|customer-upload-preview|receiptId|storageKey|objectKey|signedUrl/i);
  assert.doesNotMatch(`${uploadRoute}\n${previewRoute}`, /customer-upload-fakes|customer-upload-failure-controls|createDeterministicCustomerUploadFakes|createControlledCustomerUploadAdapters|snapshot\(/i);
  assert.doesNotMatch(`${fakes}\n${controls}`, /@supabase\/supabase-js|SUPABASE_UPLOAD_BUCKET|R2Bucket|S3Client|createSignedUrl|fetch\(|process\.env|operation ledger/i);
});
