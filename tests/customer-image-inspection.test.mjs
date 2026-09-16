import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  inspectCustomerImageBytes,
  normalizeCustomerUploadFilename,
  preflightCustomerImage,
  validateCustomerImageFieldCount,
} from "../app/domain/customer-image-inspection.ts";

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

function uint32LE(value) {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}

function pngChunk(type, data) {
  return [...uint32BE(data.length), ...type.split("").map((value) => value.charCodeAt(0)), ...data, 0, 0, 0, 0];
}

function png(width, height) {
  return new Uint8Array([
    137, 80, 78, 71, 13, 10, 26, 10,
    ...pngChunk("IHDR", [...uint32BE(width), ...uint32BE(height), 8, 6, 0, 0, 0]),
    ...pngChunk("IDAT", [0]),
    ...pngChunk("IEND", []),
  ]);
}

function jpeg(width, height) {
  return new Uint8Array([
    0xff, 0xd8,
    0xff, 0xc0, 0x00, 0x0b, 0x08, (height >>> 8) & 0xff, height & 0xff, (width >>> 8) & 0xff, width & 0xff, 0x01, 0x01, 0x11, 0x00,
    0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00,
    0x00, 0xff, 0xd9,
  ]);
}

function webp(chunks) {
  const bytes = [82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80];
  for (const [chunkType, payload] of chunks) {
    bytes.push(...chunkType.split("").map((value) => value.charCodeAt(0)), ...uint32LE(payload.length), ...payload);
    if (payload.length % 2 === 1) bytes.push(0);
  }
  bytes.splice(4, 4, ...uint32LE(bytes.length - 8));
  return new Uint8Array(bytes);
}

function webpVp8XPayload(width, height, flags = 0) {
  return [flags, 0, 0, 0, (width - 1) & 0xff, ((width - 1) >>> 8) & 0xff, ((width - 1) >>> 16) & 0xff, (height - 1) & 0xff, ((height - 1) >>> 8) & 0xff, ((height - 1) >>> 16) & 0xff];
}

function webpVp8(width, height) {
  return webp([["VP8 ", vp8Payload(width, height)]]);
}

function vp8Payload(width, height) {
  return [0, 0, 0, 0x9d, 0x01, 0x2a, width & 0xff, (width >>> 8) & 0x3f, height & 0xff, (height >>> 8) & 0x3f];
}

function webpVp8L(width, height) {
  return webp([["VP8L", vp8LPayload(width, height)]]);
}

function vp8LPayload(width, height) {
  const encodedWidth = width - 1;
  const encodedHeight = height - 1;
  return [0x2f, encodedWidth & 0xff, ((encodedWidth >>> 8) & 0x3f) | ((encodedHeight & 0x03) << 6), (encodedHeight >>> 2) & 0xff, (encodedHeight >>> 10) & 0x0f];
}

function extendedWebp(width, height, payloadType = "VP8 ", payload = vp8Payload(width, height)) {
  return webp([["VP8X", webpVp8XPayload(width, height)], [payloadType, payload]]);
}

function inspect(bytes, overrides = {}, fieldConstraints = constraints) {
  return inspectCustomerImageBytes({ bytes, originalFilename: " portrait.png ", ...overrides }, fieldConstraints);
}

test("server inspection derives actual PNG, JPEG, and WebP types and dimensions from complete structures", () => {
  for (const [bytes, contentType, dimensions] of [
    [png(200, 250), "image/png", { width: 200, height: 250 }],
    [jpeg(250, 200), "image/jpeg", { width: 250, height: 200 }],
    [extendedWebp(300, 400), "image/webp", { width: 300, height: 400 }],
  ]) {
    const result = inspect(bytes);
    assert.ok(result.accepted, contentType);
    assert.equal(result.image.contentType, contentType);
    assert.deepEqual(result.image.dimensions, dimensions);
    assert.equal(result.image.safeOriginalFilename, "portrait.png");
  }
});

test("server inspection supports the common VP8, VP8L, and VP8X WebP dimension structures", () => {
  for (const [bytes, dimensions] of [
    [webpVp8(320, 240), { width: 320, height: 240 }],
    [webpVp8L(321, 241), { width: 321, height: 241 }],
    [extendedWebp(322, 242), { width: 322, height: 242 }],
  ]) {
    const result = inspect(bytes);
    assert.ok(result.accepted);
    assert.equal(result.image.contentType, "image/webp");
    assert.deepEqual(result.image.dimensions, dimensions);
  }
});

test("extended WebP requires a supported static image payload after VP8X and preserves the VP8X canvas dimensions", () => {
  const headerOnly = inspect(webp([["VP8X", webpVp8XPayload(320, 240)]]));
  assert.equal(headerOnly.accepted, false);
  assert.equal(headerOnly.issues.some((entry) => entry.code === "invalid_image"), true);
  assert.equal("image" in headerOnly, false);

  const valid = inspect(extendedWebp(320, 240));
  assert.ok(valid.accepted);
  assert.deepEqual(valid.image.dimensions, { width: 320, height: 240 });

  const mismatchedPayload = inspect(extendedWebp(320, 240, "VP8 ", vp8Payload(319, 240)));
  assert.equal(mismatchedPayload.accepted, false);
});

test("extended WebP fails closed for truncated, unsupported, animation, and RIFF-size-mismatched payloads", () => {
  const validBytes = extendedWebp(320, 240);
  const truncated = validBytes.slice(0, validBytes.length - 2);
  const unsupportedPayload = webp([["VP8X", webpVp8XPayload(320, 240)], ["JUNK", [1, 2, 3]]]);
  const animated = webp([["VP8X", webpVp8XPayload(320, 240, 0x02)], ["VP8 ", vp8Payload(320, 240)]]);
  const declaredSizeMismatch = structuredClone(validBytes);
  declaredSizeMismatch[4] -= 1;
  for (const bytes of [truncated, unsupportedPayload, animated, declaredSizeMismatch]) {
    const result = inspect(bytes);
    assert.equal(result.accepted, false);
    assert.equal(result.issues.some((entry) => entry.code === "invalid_image"), true);
    assert.equal("image" in result, false);
  }
});

test("actual bytes are authoritative over declared MIME, filename extension, and declared byte size", () => {
  const pngBytes = png(200, 200);
  const pngResult = inspect(pngBytes, { declaredContentType: "image/jpeg", declaredByteSize: 1, originalFilename: "photo.jpg" });
  assert.ok(pngResult.accepted);
  assert.equal(pngResult.image.contentType, "image/png");
  assert.equal(pngResult.warnings.some((entry) => entry.code === "declared_mime_mismatch"), true);
  assert.equal(pngResult.warnings.some((entry) => entry.code === "declared_byte_size_mismatch"), true);

  const jpegResult = inspect(jpeg(200, 200), { declaredContentType: "image/png", originalFilename: "photo.png" });
  assert.ok(jpegResult.accepted);
  assert.equal(jpegResult.image.contentType, "image/jpeg");
});

test("malformed, truncated, unsupported, and magic-only bytes fail safely without receipt metadata", () => {
  for (const bytes of [
    new Uint8Array(),
    new Uint8Array([137, 80, 78, 71]),
    new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b]),
    new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x64, 0x00, 0x64, 0x01, 0x01, 0x11, 0x00, 0x66, 0x61, 0x6b, 0x65]),
    new Uint8Array([82, 73, 70, 70, 4, 0, 0, 0, 87, 69, 66, 80]),
    new Uint8Array([71, 73, 70, 56, 57, 97]),
    new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x02, 0xff, 0xd9]),
    new Uint8Array([1, 2, 3, 4]),
  ]) {
    const result = inspect(bytes);
    assert.equal(result.accepted, false);
    assert.equal("image" in result, false);
    assert.equal(result.issues.length > 0, true);
  }
});

test("server enforces actual positive byte size and field maxBytes", () => {
  const empty = inspect(new Uint8Array());
  assert.equal(empty.accepted, false);
  assert.equal(empty.issues.some((entry) => entry.code === "invalid_image"), true);

  const limited = inspect(png(200, 200), {}, { ...constraints, maxBytes: 10 });
  assert.equal(limited.accepted, false);
  assert.equal(limited.issues.some((entry) => entry.code === "too_large"), true);
});

test("server enforces minimum dimensions and reuses deterministic recommended-dimension warnings", () => {
  const belowMinimum = inspect(png(99, 100));
  assert.equal(belowMinimum.accepted, false);
  assert.equal(belowMinimum.issues.some((entry) => entry.code === "dimensions_too_small"), true);

  const atMinimum = inspect(png(100, 100));
  assert.ok(atMinimum.accepted);
  assert.deepEqual(atMinimum.warnings, [{ code: "below_recommended_dimensions", message: "Image dimensions are below the configured recommendation." }]);

  const recommended = inspect(png(300, 300));
  assert.ok(recommended.accepted);
  assert.equal(recommended.warnings.some((entry) => entry.code === "below_recommended_dimensions"), false);
});

test("field count validation remains deterministic and works for multi-image configurations", () => {
  assert.equal(validateCustomerImageFieldCount(constraints, 0).valid, false);
  assert.equal(validateCustomerImageFieldCount(constraints, 1).valid, true);
  assert.equal(validateCustomerImageFieldCount(constraints, 2).valid, true);
  assert.equal(validateCustomerImageFieldCount(constraints, 3).valid, false);
});

test("safe filename normalization is display-only and rejects path, control, and overlong values", () => {
  assert.deepEqual(normalizeCustomerUploadFilename("  portrait.webp  "), { ok: true, value: "portrait.webp" });
  assert.equal(normalizeCustomerUploadFilename("C:\\fakepath\\portrait.webp").ok, false);
  assert.equal(normalizeCustomerUploadFilename("folder/portrait.webp").ok, false);
  assert.equal(normalizeCustomerUploadFilename("portrait\u0000.webp").ok, false);
  assert.equal(normalizeCustomerUploadFilename("x".repeat(256)).ok, false);
  assert.equal("storageKey" in normalizeCustomerUploadFilename("portrait.webp"), false);
});

test("client preflight gives advisory feedback only and cannot turn declared metadata into authoritative image metadata", () => {
  const preflight = preflightCustomerImage({
    declaredContentType: "image/jpeg",
    declaredByteSize: 20,
    originalFilename: "portrait.jpg",
    decodedDimensions: { width: 200, height: 200 },
    intendedImageCount: 1,
  }, constraints);
  assert.equal(preflight.canAttemptUpload, true);
  assert.equal("image" in preflight, false);
  assert.equal("receiptId" in preflight, false);

  const server = inspectCustomerImageBytes({
    bytes: new Uint8Array([1, 2, 3, 4]),
    declaredContentType: "image/jpeg",
    declaredByteSize: 20,
    originalFilename: "portrait.jpg",
  }, constraints);
  assert.equal(server.accepted, false);
  assert.equal(server.issues.some((entry) => entry.code === "invalid_image"), true);
});

test("client preflight catches obvious hint failures without claiming server acceptance", () => {
  const unsupported = preflightCustomerImage({ declaredContentType: "image/gif", declaredByteSize: 1, originalFilename: "photo.gif" }, constraints);
  const empty = preflightCustomerImage({ declaredContentType: "image/png", declaredByteSize: 0, originalFilename: "photo.png" }, constraints);
  const tooLarge = preflightCustomerImage({ declaredContentType: "image/png", declaredByteSize: constraints.maxBytes + 1, originalFilename: "photo.png" }, constraints);
  assert.equal(unsupported.canAttemptUpload, false);
  assert.equal(empty.canAttemptUpload, false);
  assert.equal(tooLarge.canAttemptUpload, false);
});

test("Task 5.4 modules stay provider-neutral and do not create receipts, objects, or product authority", async () => {
  const source = await readFile(new URL("../app/domain/customer-image-inspection.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /@supabase\/supabase-js|R2Bucket|S3Client|SUPABASE_UPLOAD_BUCKET|storageKey|objectKey|signedUrl|ProductAsset|priceCents|skuCode|production preview|face detection|blur detection/i);
  assert.doesNotMatch(source, /putPrivateObject|CustomerUploadReceipt|receiptId:|ownerId:|expiresAt:|lifecycle:/);
});
