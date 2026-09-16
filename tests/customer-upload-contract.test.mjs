import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  canTransitionCustomerUploadLifecycle,
  hasCustomerUploadExpiryElapsed,
  parseCustomerUploadOwnerId,
  parseCustomerUploadReceipt,
  parseOwnedCustomerUploadReceipt,
} from "../app/domain/customer-upload.ts";

const createdAt = "2026-08-13T00:00:00.000Z";
const expiresAt = "2026-08-20T00:00:00.000Z";

function receipt(overrides = {}) {
  return {
    receiptId: "receipt-private-a",
    originalFilename: "portrait.webp",
    contentType: "image/webp",
    byteSize: 123_456,
    dimensions: { width: 1200, height: 900 },
    createdAt,
    expiresAt,
    lifecycle: "active",
    ...overrides,
  };
}

test("accepts only safe authoritative opaque receipt metadata", () => {
  const result = parseCustomerUploadReceipt(receipt());
  assert.ok(result.ok);
  assert.deepEqual(result.value, receipt());
  assert.equal(hasCustomerUploadExpiryElapsed(result.value, "2026-08-19T23:59:59.000Z"), false);
  assert.equal(hasCustomerUploadExpiryElapsed(result.value, expiresAt), true);
});

test("validates opaque receipt and owner identities, JPEG/PNG/WebP, bytes, dimensions, and explicit expiry", () => {
  for (const candidate of [
    receipt({ receiptId: "bad receipt" }),
    receipt({ contentType: "image/gif" }),
    receipt({ byteSize: 0 }),
    receipt({ byteSize: -1 }),
    receipt({ dimensions: { width: 0, height: 1 } }),
    receipt({ dimensions: { width: 1.5, height: 1 } }),
    receipt({ expiresAt: createdAt }),
    receipt({ expiresAt: "not-a-time" }),
  ]) assert.equal(parseCustomerUploadReceipt(candidate).ok, false);

  assert.equal(parseCustomerUploadOwnerId("guest-owner-a").ok, true);
  assert.equal(parseCustomerUploadOwnerId("guest owner").ok, false);
  assert.equal(parseOwnedCustomerUploadReceipt({ ...receipt(), ownerId: "guest-owner-a" }).ok, true);
  assert.equal(parseOwnedCustomerUploadReceipt({ ...receipt(), ownerId: "guest owner" }).ok, false);
});

test("rejects provider path/URL and unrelated commercial authority from the safe receipt", () => {
  for (const extra of [
    { ownerId: "guest-owner-a" }, { bucket: "private" }, { storageKey: "drafts/a.webp" },
    { objectKey: "opaque-object" }, { path: "/private/a.webp" }, { url: "https://example.test/a.webp" },
    { signedUrl: "https://example.test/a.webp" }, { provider: "provider" }, { priceCents: 1 },
    { skuCode: "SKU-1" }, { productAssetId: "asset-public" }, { previewUrl: "https://example.test/p" },
  ]) assert.equal(parseCustomerUploadReceipt({ ...receipt(), ...extra }).ok, false, Object.keys(extra)[0]);

  assert.equal(parseCustomerUploadReceipt(receipt({ originalFilename: " ../portrait.webp" })).ok, false);
  assert.equal(parseCustomerUploadReceipt(receipt({ originalFilename: "folder/portrait.webp" })).ok, false);
});

test("restricts lifecycle to the approved Phase B values and does not invent attachment as a receipt state", () => {
  for (const lifecycle of ["active", "replaced", "removed", "expired", "cleanup_pending", "cleanup_failed", "cleanup_completed"]) {
    assert.equal(parseCustomerUploadReceipt(receipt({ lifecycle })).ok, true, lifecycle);
  }
  for (const lifecycle of ["attached", "deleted", "pending", "production_ready"]) {
    assert.equal(parseCustomerUploadReceipt(receipt({ lifecycle })).ok, false, lifecycle);
  }
  assert.equal(canTransitionCustomerUploadLifecycle("active", "replaced"), true);
  assert.equal(canTransitionCustomerUploadLifecycle("removed", "cleanup_pending"), true);
  assert.equal(canTransitionCustomerUploadLifecycle("cleanup_pending", "cleanup_completed"), true);
  assert.equal(canTransitionCustomerUploadLifecycle("active", "cleanup_completed"), false);
  assert.equal(canTransitionCustomerUploadLifecycle("cleanup_completed", "active"), false);
});

test("keeps browser-safe receipts separate from server-owned records and provider-private locators", async () => {
  const [domain, objectStore, repository] = await Promise.all([
    readFile(new URL("../app/domain/customer-upload.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/application/customer-upload-object-store.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/application/customer-upload-repository.ts", import.meta.url), "utf8"),
  ]);

  assert.match(domain, /interface OwnedCustomerUploadReceipt extends CustomerUploadReceipt/);
  assert.match(repository, /findOwnedReceipt/);
  assert.match(repository, /attachOwnedReceiptOnce/);
  assert.match(repository, /authorizeCustomerInputPreview/);
  assert.doesNotMatch(domain, /ProductAsset|priceCents|skuCode|objectKey|storageKey|signedUrl|previewUrl/);
  assert.match(objectStore, /map\n \* the opaque receipt ID to their own internal locator/);
  assert.doesNotMatch(objectStore, /@supabase\/supabase-js|R2Bucket|S3Client|SupabaseBucket|storageKey|ObjectHandle/);
  assert.doesNotMatch(repository, /@supabase\/supabase-js|R2Bucket|S3Client|SupabaseBucket|storageKey/);
  assert.doesNotMatch(`${objectStore}\n${repository}`, /permanent public URL|production preview/i);
});
