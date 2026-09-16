import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { CustomerUploadLifecycleService } from "../app/application/customer-upload-lifecycle-service.ts";
import { acceptCustomerImageUpload } from "../app/application/customer-upload-acceptance-service.ts";
import {
  createDeterministicCustomerUploadFakes,
  DeterministicInMemoryCustomerUploadObjectStore,
} from "../app/testing/customer-upload-fakes.ts";

const createdAt = "2026-08-13T12:00:00.000Z";
const observedAt = "2026-08-14T12:00:00.000Z";
const expiry = observedAt;
const afterExpiry = "2026-08-14T12:10:00.000Z";
const previewExpiry = "2026-08-14T12:05:00.000Z";

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

function png(width = 200, height = 200) {
  return new Uint8Array([
    137, 80, 78, 71, 13, 10, 26, 10,
    ...pngChunk("IHDR", [...uint32BE(width), ...uint32BE(height), 8, 6, 0, 0, 0]),
    ...pngChunk("IDAT", [0]),
    ...pngChunk("IEND", []),
  ]);
}

async function* chunks(...values) {
  for (const value of values) yield new Uint8Array(value);
}

async function readBytes(content) {
  const output = [];
  for await (const chunk of content.bytes) output.push(...chunk);
  return new Uint8Array(output);
}

function receipt(receiptId, ownerId = "owner-a", overrides = {}) {
  return {
    receiptId,
    ownerId,
    originalFilename: "portrait.png",
    contentType: "image/png",
    byteSize: 20,
    dimensions: { width: 200, height: 200 },
    createdAt,
    expiresAt: expiry,
    lifecycle: "active",
    ...overrides,
  };
}

function fakes(options = {}) {
  return createDeterministicCustomerUploadFakes({
    now: () => options.now ?? "2026-08-14T12:01:00.000Z",
    derivePreviewExpiresAt: ({ receipt }) => options.previewExpiry ?? receipt.expiresAt,
    receipts: options.receipts ?? [],
  });
}

function lifecycle(fake) {
  return new CustomerUploadLifecycleService(fake.receiptRepository, fake.objectStore);
}

test("local object fake stores exact private bytes, reuses authoritative inspection, deletes, and isolates mutable byte state", async () => {
  const objectStore = new DeterministicInMemoryCustomerUploadObjectStore();
  const first = new Uint8Array([1, 2]);
  const second = new Uint8Array([3, 4]);
  assert.deepEqual(await objectStore.putPrivateObject({
    receiptId: "receipt-object",
    content: { contentType: "image/png", bytes: chunks(first, second) },
  }), { status: "stored", value: true });
  first[0] = 99;
  second[0] = 98;

  const found = await objectStore.readPrivateObject("receipt-object");
  assert.equal(found.status, "found");
  const returned = await readBytes(found.value.content);
  assert.deepEqual([...returned], [1, 2, 3, 4]);
  returned[0] = 77;
  const reread = await objectStore.readPrivateObject("receipt-object");
  assert.equal(reread.status, "found");
  assert.deepEqual([...await readBytes(reread.value.content)], [1, 2, 3, 4]);

  const imageBytes = png(200, 150);
  assert.equal((await objectStore.putPrivateObject({
    receiptId: "receipt-inspection",
    content: { contentType: "image/png", bytes: chunks(imageBytes) },
  })).status, "stored");
  assert.deepEqual(await objectStore.inspectPrivateObject("receipt-inspection"), {
    status: "found",
    value: { contentType: "image/png", byteSize: imageBytes.byteLength, width: 200, height: 150 },
  });
  assert.deepEqual(await objectStore.inspectPrivateObject("missing-object"), { status: "not_found" });
  assert.deepEqual(await objectStore.deletePrivateObject("receipt-object"), { status: "deleted", value: true });
  assert.deepEqual(await objectStore.readPrivateObject("receipt-object"), { status: "not_found" });
  assert.deepEqual(await objectStore.deletePrivateObject("receipt-object"), { status: "not_found" });
});

test("receipt fake creates only valid active receipts, keeps owner state server-side, and isolates input/output copies", async () => {
  const fake = fakes();
  const input = receipt("receipt-created");
  const created = await fake.receiptRepository.createAcceptedReceipt(input);
  assert.equal(created.status, "accepted");
  assert.equal("ownerId" in created.value, false);
  input.dimensions.width = 999;
  const found = await fake.receiptRepository.findOwnedReceipt("receipt-created", "owner-a");
  assert.equal(found.status, "found");
  assert.equal(found.value.dimensions.width, 200);
  found.value.dimensions.width = 888;
  const reread = await fake.receiptRepository.findOwnedReceipt("receipt-created", "owner-a");
  assert.equal(reread.status, "found");
  assert.equal(reread.value.dimensions.width, 200);
  assert.deepEqual(await fake.receiptRepository.createAcceptedReceipt(receipt("receipt-created")), {
    status: "invalid_state",
    lifecycle: "active",
  });
  assert.deepEqual(await fake.receiptRepository.createAcceptedReceipt(receipt("receipt-nonactive", "owner-a", { lifecycle: "removed" })), {
    status: "invalid_state",
    lifecycle: "removed",
  });
});

test("owner scoped lookup, lifecycle mutation, and preview make absent and cross-owner receipts indistinguishable", async () => {
  const fake = fakes({ receipts: [{ receipt: receipt("receipt-a", "owner-a") }, { receipt: receipt("receipt-b", "owner-b") }] });
  const commands = [
    fake.receiptRepository.findOwnedReceipt("receipt-b", "owner-a"),
    fake.receiptRepository.findOwnedReceipt("unknown-receipt", "owner-a"),
    fake.receiptRepository.removeOwnedReceipt({ ownerId: "owner-a", receiptId: "receipt-b", operationId: "remove-cross" }),
    fake.receiptRepository.removeOwnedReceipt({ ownerId: "owner-a", receiptId: "unknown-receipt", operationId: "remove-missing" }),
    fake.receiptRepository.replaceOwnedReceipt({ ownerId: "owner-a", receiptId: "receipt-b", replacementReceiptId: "receipt-a", operationId: "replace-cross" }),
    fake.receiptRepository.attachOwnedReceiptOnce({ ownerId: "owner-a", receiptId: "receipt-b", attachment: { attachmentId: "attachment-a" }, operationId: "attach-cross" }),
    fake.previewAccess.authorizeCustomerInputPreview({ ownerId: "owner-a", receiptId: "receipt-b" }),
    fake.previewAccess.authorizeCustomerInputPreview({ ownerId: "owner-a", receiptId: "unknown-receipt" }),
  ];
  for (const result of await Promise.all(commands)) assert.deepEqual(result, { status: "not_found" });
  const ownerB = await fake.receiptRepository.findOwnedReceipt("receipt-b", "owner-b");
  assert.equal(ownerB.status, "found");
});

test("replace and remove are replay-safe state transitions without eager object deletion", async () => {
  const fake = fakes({ receipts: [
    { receipt: receipt("replace-old") }, { receipt: receipt("replace-new") }, { receipt: receipt("replace-conflict") }, { receipt: receipt("remove-me") },
  ] });
  const service = lifecycle(fake);
  assert.equal((await service.replaceCustomerUpload({ verifiedOwnerId: "owner-a", receiptId: "replace-old", replacementReceiptId: "replace-new", operationId: "replace-1" })).status, "changed");
  assert.equal((await service.replaceCustomerUpload({ verifiedOwnerId: "owner-a", receiptId: "replace-old", replacementReceiptId: "replace-new", operationId: "replace-2" })).status, "changed");
  assert.deepEqual(await service.replaceCustomerUpload({ verifiedOwnerId: "owner-a", receiptId: "replace-old", replacementReceiptId: "replace-conflict", operationId: "replace-3" }), { status: "invalid_state" });
  assert.deepEqual(await service.replaceCustomerUpload({ verifiedOwnerId: "owner-a", receiptId: "replace-new", replacementReceiptId: "replace-new", operationId: "replace-self" }), { status: "invalid_state" });
  assert.equal((await service.removeCustomerUpload({ verifiedOwnerId: "owner-a", receiptId: "remove-me", operationId: "remove-1" })).status, "changed");
  assert.equal((await service.removeCustomerUpload({ verifiedOwnerId: "owner-a", receiptId: "remove-me", operationId: "remove-2" })).status, "changed");
  const snapshot = fake.snapshot().receipts;
  assert.equal(snapshot.find((entry) => entry.receipt.receiptId === "replace-old").receipt.lifecycle, "replaced");
  assert.equal(snapshot.find((entry) => entry.receipt.receiptId === "replace-old").replacementReceiptId, "replace-new");
  assert.equal(snapshot.find((entry) => entry.receipt.receiptId === "replace-new").receipt.lifecycle, "active");
  assert.equal(snapshot.find((entry) => entry.receipt.receiptId === "remove-me").receipt.lifecycle, "removed");
  assert.deepEqual(fake.snapshot().objects, []);
});

test("attach-once preserves lifecycle separation and wins against a subsequent cleanup claim", async () => {
  const fake = fakes({ receipts: [{ receipt: receipt("attach-first") }] });
  const service = lifecycle(fake);
  assert.equal((await service.attachCustomerUploadOnce({ verifiedOwnerId: "owner-a", receiptId: "attach-first", attachment: { attachmentId: "attachment-a" }, operationId: "attach-1" })).status, "attached");
  assert.equal((await service.attachCustomerUploadOnce({ verifiedOwnerId: "owner-a", receiptId: "attach-first", attachment: { attachmentId: "attachment-a" }, operationId: "attach-2" })).status, "attached");
  assert.deepEqual(await service.attachCustomerUploadOnce({ verifiedOwnerId: "owner-a", receiptId: "attach-first", attachment: { attachmentId: "attachment-b" }, operationId: "attach-3" }), { status: "invalid_state" });
  assert.equal((await service.claimCustomerUploadCleanup({ observedAt, limit: 1, operationId: "claim-after-attach" })).status, "claimed");
  const snapshot = fake.snapshot().receipts[0];
  assert.equal(snapshot.receipt.lifecycle, "active");
  assert.equal(snapshot.attachmentId, "attachment-a");
});

test("expiry, cleanup claim order, cleanup completion/failure/retry, and cleanup-wins attachment barrier are deterministic", async () => {
  const fake = fakes({ receipts: [
    { receipt: receipt("due", "owner-a", { expiresAt: observedAt }) },
    { receipt: receipt("late", "owner-a", { expiresAt: afterExpiry }) },
    { receipt: receipt("created-later", "owner-a", { lifecycle: "removed", createdAt: "2026-08-13T13:00:00.000Z" }) },
    { receipt: receipt("created-earlier", "owner-a", { lifecycle: "removed", createdAt }) },
    { receipt: receipt("attached", "owner-a", { expiresAt: observedAt }), attachment: { attachmentId: "order-a" } },
  ] });
  const service = lifecycle(fake);
  assert.equal((await service.expireCustomerUpload({ receiptId: "due", observedAt, operationId: "expire-due" })).status, "changed");
  assert.deepEqual(await service.expireCustomerUpload({ receiptId: "late", observedAt, operationId: "expire-early" }), { status: "invalid_state" });
  assert.deepEqual(await service.expireCustomerUpload({ receiptId: "attached", observedAt, operationId: "expire-attached" }), { status: "invalid_state" });
  assert.deepEqual(await service.claimCustomerUploadCleanup({ observedAt, limit: 0, operationId: "bad-limit" }), { status: "invalid_state" });
  assert.deepEqual(await service.claimCustomerUploadCleanup({ observedAt, limit: 1_001, operationId: "absurd-limit" }), { status: "invalid_state" });
  const claimed = await service.claimCustomerUploadCleanup({ observedAt, limit: 2, operationId: "claim-ordered" });
  assert.equal(claimed.status, "claimed");
  assert.deepEqual(claimed.value.map((entry) => entry.receiptId), ["created-earlier", "due"]);
  assert.deepEqual(await service.attachCustomerUploadOnce({ verifiedOwnerId: "owner-a", receiptId: "created-earlier", attachment: { attachmentId: "too-late" }, operationId: "attach-after-claim" }), { status: "invalid_state" });
  assert.equal((await fake.receiptRepository.completeReceiptCleanup({ receiptId: "created-earlier", operationId: "complete" })).status, "changed");
  assert.equal((await fake.receiptRepository.failReceiptCleanup({ receiptId: "due", operationId: "fail" })).status, "changed");
  const retry = await service.claimCustomerUploadCleanup({ observedAt, limit: 1, operationId: "claim-retry" });
  assert.equal(retry.status, "claimed");
  assert.deepEqual(retry.value.map((entry) => entry.receiptId), ["due"]);
  assert.equal((await fake.receiptRepository.completeReceiptCleanup({ receiptId: "due", operationId: "complete-retry" })).status, "changed");
  const attached = fake.snapshot().receipts.find((entry) => entry.receipt.receiptId === "attached");
  assert.equal(attached.receipt.lifecycle, "active");
  assert.equal(attached.attachmentId, "order-a");
});

test("preview fake returns only a deterministic short-lived capability for active owned unexpired receipts", async () => {
  const fake = fakes({ receipts: [
    { receipt: receipt("preview-active", "owner-a", { expiresAt: afterExpiry }) },
    { receipt: receipt("preview-inactive", "owner-a", { lifecycle: "removed", expiresAt: afterExpiry }) },
    { receipt: receipt("preview-expired", "owner-a", { expiresAt: observedAt }) },
  ], previewExpiry });
  assert.deepEqual(await fake.previewAccess.authorizeCustomerInputPreview({ ownerId: "owner-a", receiptId: "preview-active" }), {
    status: "found",
    value: { receiptId: "preview-active", expiresAt: previewExpiry },
  });
  assert.deepEqual(await fake.previewAccess.authorizeCustomerInputPreview({ ownerId: "owner-b", receiptId: "preview-active" }), { status: "not_found" });
  assert.deepEqual(await fake.previewAccess.authorizeCustomerInputPreview({ ownerId: "owner-a", receiptId: "preview-inactive" }), { status: "not_found" });
  assert.deepEqual(await fake.previewAccess.authorizeCustomerInputPreview({ ownerId: "owner-a", receiptId: "preview-expired" }), { status: "not_found" });
  const invalidPolicy = fakes({
    receipts: [{ receipt: receipt("preview-invalid", "owner-a", { expiresAt: afterExpiry }) }],
    previewExpiry: "2026-08-14T12:11:00.000Z",
  });
  assert.deepEqual(await invalidPolicy.previewAccess.authorizeCustomerInputPreview({ ownerId: "owner-a", receiptId: "preview-invalid" }), {
    status: "source_failure",
    operation: "customer_upload_preview.authorize",
  });
});

test("fake bundle supports successful acceptance while keeping object and receipt resources distinct", async () => {
  const fake = fakes();
  const result = await acceptCustomerImageUpload({
    verifiedOwnerId: "owner-a",
    fieldConstraints: constraints,
    bytes: png(),
    originalFilename: "portrait.png",
  }, {
    objectStore: fake.objectStore,
    receiptRepository: fake.receiptRepository,
    receiptIdGenerator: { allocateReceiptId: () => "receipt-accepted" },
    now: () => createdAt,
    expiryPolicy: { deriveExpiresAt: () => afterExpiry },
  });
  assert.equal(result.status, "accepted");
  assert.deepEqual(fake.snapshot().objects, [{ receiptId: "receipt-accepted", byteSize: png().byteLength, contentType: "image/png" }]);
  assert.equal(fake.snapshot().receipts[0].receipt.lifecycle, "active");
});

test("Task 6.1 fakes are isolated from production routes, providers, runtime configuration, and persistent operation ledgers", async () => {
  const [fakeSource, uploadRoute, previewRoute] = await Promise.all([
    readFile(new URL("../app/testing/customer-upload-fakes.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/uploads/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/customer-uploads/preview/route.ts", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(fakeSource, /@supabase\/supabase-js|SUPABASE_UPLOAD_BUCKET|R2Bucket|S3Client|createSignedUrl|storageKey|objectKey|publicUrl|process\.env|fetch\(|Date\.now|Math\.random/i);
  assert.doesNotMatch(fakeSource, /operation ledger|operations\s*=|operationId.*Map|Map.*operationId/i);
  assert.doesNotMatch(`${uploadRoute}\n${previewRoute}`, /customer-upload-fakes|DeterministicInMemoryCustomerUpload|createDeterministicCustomerUploadFakes/i);
});
