import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  acceptCustomerImageUpload,
  createCryptographicCustomerUploadReceiptIdGenerator,
} from "../app/application/customer-upload-acceptance-service.ts";
import { parseCustomerUploadReceipt } from "../app/domain/customer-upload.ts";

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
  return [...uint32BE(data.length), ...type.split("").map((value) => value.charCodeAt(0)), ...data, 0, 0, 0, 0];
}

function png(width = 200, height = 200) {
  return new Uint8Array([
    137, 80, 78, 71, 13, 10, 26, 10,
    ...pngChunk("IHDR", [...uint32BE(width), ...uint32BE(height), 8, 6, 0, 0, 0]),
    ...pngChunk("IDAT", [0]),
    ...pngChunk("IEND", []),
  ]);
}

function setup(options = {}) {
  const calls = [];
  const id = options.receiptId ?? "receipt-upload-a";
  const stored = { receipt: null, bytes: null, contentType: null };
  const objectStore = {
    async putPrivateObject({ receiptId, content }) {
      calls.push("put");
      stored.bytes = new Uint8Array();
      for await (const chunk of content.bytes) {
        stored.bytes = new Uint8Array([...stored.bytes, ...chunk]);
      }
      stored.contentType = content.contentType;
      stored.receiptId = receiptId;
      if (options.putThrow) throw new Error("store failure");
      return options.putResult ?? { status: "stored", value: true };
    },
    async deletePrivateObject(receiptId) {
      calls.push(`delete:${receiptId}`);
      if (options.deleteThrow) throw new Error("delete failure");
      return options.deleteResult ?? { status: "deleted", value: true };
    },
  };
  const receiptRepository = {
    async createAcceptedReceipt(receipt) {
      calls.push("create");
      stored.receipt = receipt;
      if (options.createThrow) throw new Error("metadata failure");
      if (options.createResult) return options.createResult(receipt);
      return { status: "accepted", value: withoutOwner(receipt) };
    },
  };
  return {
    calls,
    stored,
    dependencies: {
      objectStore,
      receiptRepository,
      receiptIdGenerator: { allocateReceiptId: () => id },
      now: () => "2026-08-13T12:00:00.000Z",
      expiryPolicy: { deriveExpiresAt: (createdAt) => {
        assert.equal(createdAt, "2026-08-13T12:00:00.000Z");
        return "2026-08-14T12:00:00.000Z";
      } },
    },
  };
}

function withoutOwner(receipt) {
  return Object.fromEntries(Object.entries(receipt).filter(([key]) => key !== "ownerId"));
}

function input(bytes = png(), overrides = {}) {
  return {
    verifiedOwnerId: "verified-owner-a",
    fieldConstraints: constraints,
    bytes,
    originalFilename: " photo.png ",
    declaredContentType: "image/jpeg",
    declaredByteSize: 1,
    ...overrides,
  };
}

test("inspection rejection performs no allocation, object write, receipt persistence, or compensation", async () => {
  const service = setup();
  let allocations = 0;
  service.dependencies.receiptIdGenerator = { allocateReceiptId() { allocations += 1; return "receipt-unreachable"; } };
  const result = await acceptCustomerImageUpload(input(new Uint8Array([1, 2, 3])), service.dependencies);
  assert.equal(result.status, "rejected");
  assert.equal(allocations, 0);
  assert.deepEqual(service.calls, []);
});

test("acceptance stores exactly inspected bytes and authoritative metadata before returning a browser-safe receipt", async () => {
  const service = setup();
  const bytes = png(200, 200);
  const result = await acceptCustomerImageUpload(input(bytes), service.dependencies);
  assert.equal(result.status, "accepted");
  assert.deepEqual(service.calls, ["put", "create"]);
  assert.deepEqual(service.stored.bytes, bytes);
  assert.equal(service.stored.contentType, "image/png");
  assert.equal(service.stored.receipt.ownerId, "verified-owner-a");
  assert.equal(service.stored.receipt.contentType, "image/png");
  assert.equal(service.stored.receipt.byteSize, bytes.byteLength);
  assert.deepEqual(service.stored.receipt.dimensions, { width: 200, height: 200 });
  assert.equal(service.stored.receipt.originalFilename, "photo.png");
  assert.equal(service.stored.receipt.lifecycle, "active");
  assert.equal("ownerId" in result.receipt, false);
  assert.equal("ownerId" in JSON.parse(JSON.stringify(result.receipt)), false);
  assert.equal(result.receipt.createdAt, "2026-08-13T12:00:00.000Z");
  assert.equal(result.receipt.expiresAt, "2026-08-14T12:00:00.000Z");
  assert.equal(result.warnings.some((entry) => entry.code === "declared_mime_mismatch"), true);
  assert.equal(result.warnings.some((entry) => entry.code === "declared_byte_size_mismatch"), true);
  assert.equal(result.warnings.some((entry) => entry.code === "below_recommended_dimensions"), true);
});

test("verified owner is an application-only input and malformed derived owner fails before persistence", async () => {
  const service = setup();
  const result = await acceptCustomerImageUpload(input(png(), { verifiedOwnerId: "browser owner" }), service.dependencies);
  assert.deepEqual(result, { status: "source_failure", stage: "receipt_metadata", compensation: "not_attempted" });
  assert.deepEqual(service.calls, []);
});

test("storage source failure or exception creates no receipt and triggers no compensation", async () => {
  for (const options of [{ putResult: { status: "source_failure", operation: "customer_upload_object_store.put" } }, { putThrow: true }]) {
    const service = setup(options);
    const result = await acceptCustomerImageUpload(input(), service.dependencies);
    assert.deepEqual(result, { status: "source_failure", stage: "object_storage", compensation: "not_attempted" });
    assert.deepEqual(service.calls, ["put"]);
  }
});

test("metadata failure or exception compensates a stored private object exactly once and never returns a receipt", async () => {
  for (const options of [
    { createResult: () => ({ status: "source_failure", operation: "customer_upload_receipt.create" }) },
    { createThrow: true },
  ]) {
    const service = setup(options);
    const result = await acceptCustomerImageUpload(input(), service.dependencies);
    assert.deepEqual(result, { status: "source_failure", stage: "receipt_persistence", compensation: "succeeded" });
    assert.deepEqual(service.calls, ["put", "create", "delete:receipt-upload-a"]);
    assert.equal("receipt" in result, false);
  }
});

test("compensation failure stays bounded, safe, and does not retry or accept the upload", async () => {
  for (const options of [
    { createThrow: true, deleteResult: { status: "source_failure", operation: "customer_upload_object_store.delete" } },
    { createThrow: true, deleteThrow: true },
  ]) {
    const service = setup(options);
    const result = await acceptCustomerImageUpload(input(), service.dependencies);
    assert.deepEqual(result, { status: "source_failure", stage: "receipt_persistence", compensation: "failed" });
    assert.deepEqual(service.calls, ["put", "create", "delete:receipt-upload-a"]);
    assert.equal(JSON.stringify(result).match(/bucket|key|provider|secret/i), null);
  }
});

test("malformed repository accepted responses fail closed and receive the same compensation", async () => {
  for (const mutate of [
    (safe) => ({ ...safe, receiptId: "receipt-other" }),
    (safe) => ({ ...safe, contentType: "image/jpeg" }),
    (safe) => ({ ...safe, dimensions: { width: 201, height: 200 } }),
    (safe) => ({ ...safe, lifecycle: "removed" }),
    (safe) => ({ ...safe, ownerId: "leaked-owner" }),
  ]) {
    const service = setup({ createResult: (receipt) => ({ status: "accepted", value: mutate(withoutOwner(receipt)) }) });
    const result = await acceptCustomerImageUpload(input(), service.dependencies);
    assert.deepEqual(result, { status: "source_failure", stage: "receipt_persistence", compensation: "succeeded" });
    assert.deepEqual(service.calls, ["put", "create", "delete:receipt-upload-a"]);
  }
});

test("only stored object and accepted canonical metadata statuses are success", async () => {
  for (const putResult of [
    { status: "found", value: true }, { status: "deleted", value: true }, { status: "not_found" },
  ]) {
    const service = setup({ putResult });
    const result = await acceptCustomerImageUpload(input(), service.dependencies);
    assert.equal(result.status, "source_failure");
    assert.equal(result.stage, "object_storage");
    assert.deepEqual(service.calls, ["put"]);
  }
  const service = setup({ createResult: (receipt) => ({ status: "found", value: withoutOwner(receipt) }) });
  const result = await acceptCustomerImageUpload(input(), service.dependencies);
  assert.deepEqual(result, { status: "source_failure", stage: "receipt_persistence", compensation: "succeeded" });
  assert.deepEqual(service.calls, ["put", "create", "delete:receipt-upload-a"]);
});

test("cryptographic receipt IDs are parser-compatible, opaque, and distinct", () => {
  const generator = createCryptographicCustomerUploadReceiptIdGenerator();
  const first = generator.allocateReceiptId();
  const second = generator.allocateReceiptId();
  assert.equal(parseCustomerUploadReceipt({
    receiptId: first,
    contentType: "image/png",
    byteSize: 1,
    dimensions: { width: 1, height: 1 },
    createdAt: "2026-08-13T00:00:00.000Z",
    expiresAt: "2026-08-14T00:00:00.000Z",
    lifecycle: "active",
  }).ok, true);
  assert.notEqual(first, second);
  assert.equal(/photo|verified-owner|bucket|path/i.test(first), false);
});

test("Task 5.5 remains provider-neutral, receipt-safe, and explicitly avoids distributed transaction claims", async () => {
  const source = await readFile(new URL("../app/application/customer-upload-acceptance-service.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /@supabase\/supabase-js|SUPABASE_UPLOAD_BUCKET|R2Bucket|S3Client|storageKey|objectKey|signedUrl|ProductAsset|priceCents|skuCode/i);
  assert.match(source, /does not claim a distributed\n \* transaction or rollback guarantee/);
  assert.match(source, /best-effort\n \* compensation/);
  assert.match(source, /inspectCustomerImageBytes/);
  assert.doesNotMatch(source, /Request|Response|cookies\(|getSupabaseServerClient/);
});
