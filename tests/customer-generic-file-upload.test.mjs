import assert from "node:assert/strict";
import test from "node:test";
import { acceptCustomerGenericFileUpload } from "../app/application/customer-generic-file-acceptance-service.ts";
import { createDeterministicCustomerUploadFakes } from "../app/testing/customer-upload-fakes.ts";
import nextConfig from "../next.config.ts";

test("C10 multipart transport leaves bounded envelope room above the 20 MiB business maximum", () => {
  assert.equal(nextConfig.experimental?.serverActions?.bodySizeLimit, "21mb");
});

const constraints = {
  allowedMimeTypes: ["application/pdf", "text/plain"],
  maxBytes: 1024,
  minFileCount: 0,
  maxFileCount: 2,
};

function makeDependencies() {
  const fakes = createDeterministicCustomerUploadFakes({
    now: () => "2026-09-18T00:00:00.000Z",
    derivePreviewExpiresAt: () => "2026-09-19T00:00:00.000Z",
  });
  return {
    fakes,
    dependencies: {
      objectStore: fakes.objectStore,
      receiptRepository: fakes.receiptRepository,
      receiptIdGenerator: { allocateReceiptId: () => "cur-generic-001" },
      now: () => "2026-09-18T00:00:00.000Z",
      expiryPolicy: { deriveExpiresAt: () => "2026-09-19T00:00:00.000Z" },
    },
  };
}

async function collect(source) {
  const chunks = [];
  for await (const chunk of source) chunks.push(chunk);
  return chunks;
}

test("C10 accepts a real PDF byte stream and stores a private opaque receipt", async () => {
  const { fakes, dependencies } = makeDependencies();
  const bytes = new TextEncoder().encode("%PDF-1.7\nprivate customer input");
  const result = await acceptCustomerGenericFileUpload({
    verifiedOwnerId: "owner-generic",
    fieldConstraints: constraints,
    bytes,
    originalFilename: "brief.pdf",
    declaredContentType: "application/octet-stream",
  }, dependencies);
  assert.equal(result.status, "accepted");
  assert.equal(result.receipt.contentType, "application/pdf");
  assert.equal(result.receipt.dimensions, undefined);
  const stored = await fakes.objectStore.readPrivateObject(result.receipt.receiptId);
  assert.equal(stored.status, "found");
  assert.deepEqual(await collect(stored.value.content.bytes), [bytes]);
});

test("C10 rejects bytes whose detected MIME is outside the field allowlist", async () => {
  const { dependencies } = makeDependencies();
  const result = await acceptCustomerGenericFileUpload({
    verifiedOwnerId: "owner-generic",
    fieldConstraints: constraints,
    bytes: new Uint8Array([0, 1, 2, 3]),
    originalFilename: "unknown.bin",
    declaredContentType: "application/pdf",
  }, dependencies);
  assert.equal(result.status, "rejected");
  assert.equal(result.issues.some((issue) => issue.code === "file_mime_not_allowed"), true);
});
