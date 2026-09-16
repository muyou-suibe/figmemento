import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { GET as unavailablePreviewRoute } from "../app/api/customer-uploads/preview/route.ts";
import {
  createLocalCustomerInputPreview,
  disposeLocalCustomerInputPreview,
  replaceLocalCustomerInputPreview,
} from "../app/client/local-customer-input-preview.ts";
import { createGuestDraftOwnerService, getGuestDraftOwnerCookieName } from "../app/lib/guest-draft-owner.ts";
import { createCustomerUploadPreviewHttpHandler } from "../app/server/customer-upload-preview-handler.server.ts";

const origin = "https://photogift.test";
const observedAt = "2026-08-13T12:00:00.000Z";
const receiptExpiry = "2026-08-13T12:10:00.000Z";

function ownerService(now = 1_700_000_000, offset = 0) {
  let next = offset;
  return createGuestDraftOwnerService({
    signingSecret: "offline-customer-preview-owner-secret-material-1234567890",
    contextLifetimeSeconds: 3_600,
  }, {
    nowSeconds: () => now,
    randomBytes(length) {
      const bytes = new Uint8Array(length);
      for (let index = 0; index < length; index += 1) bytes[index] = (next + index + 1) % 256;
      next += length;
      return bytes;
    },
  });
}

function receipt(overrides = {}) {
  return {
    receiptId: "receipt-preview-owned",
    originalFilename: "portrait.png",
    contentType: "image/png",
    byteSize: 3,
    dimensions: { width: 200, height: 150 },
    createdAt: "2026-08-13T11:00:00.000Z",
    expiresAt: receiptExpiry,
    lifecycle: "active",
    ...overrides,
  };
}

function bytes(values = [1, 2, 3]) {
  return (async function* generate() {
    yield new Uint8Array(values);
  }());
}

function previewRequest({
  receiptId = "receipt-preview-owned",
  context,
  extraQuery = "",
  method = "GET",
} = {}) {
  return new Request(`${origin}/api/customer-uploads/preview?receiptId=${encodeURIComponent(receiptId)}${extraQuery}`, {
    method,
    headers: context
      ? { cookie: `${getGuestDraftOwnerCookieName()}=${encodeURIComponent(context)}` }
      : {},
  });
}

function setup(options = {}) {
  const owners = options.ownerService ?? ownerService();
  const calls = { receiptFactories: 0, receiptLookups: 0, previewFactories: 0, previewAuthorizations: 0, objectFactories: 0, objectReads: 0 };
  const expectedOwnerId = options.expectedOwnerId;
  const foundReceipt = options.receipt ?? receipt();
  const handler = createCustomerUploadPreviewHttpHandler({
    ownerService: owners,
    createReceiptRepository() {
      calls.receiptFactories += 1;
      return {
        async findOwnedReceipt(receiptId, ownerId) {
          calls.receiptLookups += 1;
          if (options.repositoryThrow) throw new Error("repository failure");
          if (options.repositoryResult) return options.repositoryResult;
          if (options.crossOwner || options.notFound || receiptId !== foundReceipt.receiptId || (expectedOwnerId && ownerId !== expectedOwnerId)) {
            return { status: "not_found" };
          }
          return { status: "found", value: foundReceipt };
        },
      };
    },
    createPreviewAccess() {
      calls.previewFactories += 1;
      return {
        async authorizeCustomerInputPreview(input) {
          calls.previewAuthorizations += 1;
          if (options.authorizationThrow) throw new Error("authorization failure");
          if (options.authorizationResult) return options.authorizationResult;
          return {
            status: "found",
            value: {
              receiptId: input.receiptId,
              expiresAt: "2026-08-13T12:05:00.000Z",
            },
          };
        },
      };
    },
    createObjectStore() {
      calls.objectFactories += 1;
      return {
        async readPrivateObject(receiptId) {
          calls.objectReads += 1;
          if (options.objectThrow) throw new Error("object failure");
          if (options.objectResult) return options.objectResult;
          if (receiptId !== foundReceipt.receiptId) return { status: "not_found" };
          return {
            status: "found",
            value: { content: { contentType: options.objectContentType ?? foundReceipt.contentType, bytes: options.objectBytes ?? bytes() } },
          };
        },
      };
    },
    now: () => options.now ?? observedAt,
  });
  return { owners, calls, handler, foundReceipt };
}

async function issueContext(owners) {
  const issued = await owners.issueGuestDraftOwner();
  assert.equal(issued.status, "issued");
  return issued.value;
}

function assertUnavailableResponse(response) {
  assert.equal(response.status, 404);
  return response.json().then((body) => assert.deepEqual(body, { error: "Customer input preview is unavailable." }));
}

test("local customer-input preview creates and revokes only browser-local blob URLs", () => {
  const calls = { create: [], revoke: [] };
  const urlApi = {
    createObjectURL(file) { calls.create.push(file); return `blob:customer-preview-${calls.create.length}`; },
    revokeObjectURL(url) { calls.revoke.push(url); },
  };
  const firstFile = new File([new Uint8Array([1])], "first.png", { type: "image/png" });
  const secondFile = new File([new Uint8Array([2])], "second.png", { type: "image/png" });
  const first = createLocalCustomerInputPreview(firstFile, urlApi);
  assert.equal(first.url, "blob:customer-preview-1");
  assert.deepEqual(calls, { create: [firstFile], revoke: [] });
  const second = replaceLocalCustomerInputPreview(first, secondFile, urlApi);
  assert.equal(second.url, "blob:customer-preview-2");
  assert.deepEqual(calls.revoke, ["blob:customer-preview-1"]);
  disposeLocalCustomerInputPreview(second);
  disposeLocalCustomerInputPreview(second);
  assert.deepEqual(calls.revoke, ["blob:customer-preview-1", "blob:customer-preview-2"]);
});

test("preview route remains provider-unresolved and never fakes a successful image", async () => {
  const response = await unavailablePreviewRoute(previewRequest());
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "Customer input preview is temporarily unavailable." });
});

test("server preview is verify-only: missing, invalid, and expired owners issue no replacement context or privileged dependencies", async () => {
  for (const kind of ["missing", "invalid", "expired"]) {
    const setupResult = setup(kind === "expired" ? { ownerService: ownerService(1_700_003_600) } : {});
    let context;
    if (kind === "invalid") context = "tampered.owner.context";
    if (kind === "expired") context = (await issueContext(ownerService(1_700_000_000))).context;
    const response = await setupResult.handler(previewRequest({ context }));
    await assertUnavailableResponse(response);
    assert.equal(response.headers.get("set-cookie"), null);
    assert.deepEqual(setupResult.calls, { receiptFactories: 0, receiptLookups: 0, previewFactories: 0, previewAuthorizations: 0, objectFactories: 0, objectReads: 0 });
  }
});

test("owner-scoped missing and cross-owner receipts are indistinguishable and stop preview and object construction", async () => {
  const absent = setup({ notFound: true });
  const absentOwner = await issueContext(absent.owners);
  const crossOwnerService = ownerService(1_700_000_000, 90);
  const crossOwner = setup({ crossOwner: true, expectedOwnerId: "different-owner" });
  const crossOwnerContext = await issueContext(crossOwnerService);
  const [first, second] = await Promise.all([
    absent.handler(previewRequest({ context: absentOwner.context })),
    crossOwner.handler(previewRequest({ context: crossOwnerContext.context })),
  ]);
  await assertUnavailableResponse(first);
  await assertUnavailableResponse(second);
  for (const setupResult of [absent, crossOwner]) {
    assert.equal(setupResult.calls.receiptFactories, 1);
    assert.equal(setupResult.calls.receiptLookups, 1);
    assert.equal(setupResult.calls.previewFactories, 0);
    assert.equal(setupResult.calls.objectFactories, 0);
    assert.equal(setupResult.calls.objectReads, 0);
  }
});

test("only active, unexpired owned receipts reach preview authorization", async () => {
  for (const lifecycle of ["replaced", "removed", "expired", "cleanup_pending", "cleanup_failed", "cleanup_completed"]) {
    const setupResult = setup({ receipt: receipt({ lifecycle }) });
    const owner = await issueContext(setupResult.owners);
    const response = await setupResult.handler(previewRequest({ context: owner.context }));
    await assertUnavailableResponse(response);
    assert.equal(setupResult.calls.previewFactories, 0, lifecycle);
    assert.equal(setupResult.calls.objectFactories, 0, lifecycle);
  }
  const expired = setup({ receipt: receipt({ expiresAt: observedAt }) });
  const owner = await issueContext(expired.owners);
  await assertUnavailableResponse(await expired.handler(previewRequest({ context: owner.context })));
  assert.equal(expired.calls.previewFactories, 0);
  assert.equal(expired.calls.objectFactories, 0);
});

test("capability is server-only authorization and is validated before object construction", async () => {
  const cases = [
    ["wrong-receipt", { status: "found", value: { receiptId: "receipt-other", expiresAt: "2026-08-13T12:05:00.000Z" } }, 503],
    ["malformed-time", { status: "found", value: { receiptId: "receipt-preview-owned", expiresAt: "not-a-time" } }, 503],
    ["expired", { status: "found", value: { receiptId: "receipt-preview-owned", expiresAt: observedAt } }, 404],
    ["later-than-receipt", { status: "found", value: { receiptId: "receipt-preview-owned", expiresAt: "2026-08-13T12:11:00.000Z" } }, 503],
    ["unexpected-success", { status: "accepted", value: { receiptId: "receipt-preview-owned", expiresAt: "2026-08-13T12:05:00.000Z" } }, 503],
  ];
  for (const [name, authorizationResult, expectedStatus] of cases) {
    const setupResult = setup({ authorizationResult });
    const owner = await issueContext(setupResult.owners);
    const response = await setupResult.handler(previewRequest({ context: owner.context }));
    assert.equal(response.status, expectedStatus, name);
    assert.equal(setupResult.calls.previewAuthorizations, 1, name);
    assert.equal(setupResult.calls.objectFactories, 0, name);
    assert.equal(setupResult.calls.objectReads, 0, name);
  }
});

test("authorized preview reads only matching JPEG, PNG, or WebP private content with no-store headers", async () => {
  for (const contentType of ["image/jpeg", "image/png", "image/webp"]) {
    const setupResult = setup({ receipt: receipt({ contentType }), objectContentType: contentType, objectBytes: bytes([7, 8, 9]) });
    const owner = await issueContext(setupResult.owners);
    const response = await setupResult.handler(previewRequest({ context: owner.context }));
    assert.equal(response.status, 200, contentType);
    assert.equal(response.headers.get("content-type"), contentType);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("cross-origin-resource-policy"), "same-origin");
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    assert.equal(response.headers.get("access-control-allow-origin"), null);
    assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [7, 8, 9]);
    assert.equal(setupResult.calls.previewAuthorizations, 1);
    assert.equal(setupResult.calls.objectReads, 1);
  }
});

test("object absence, failures, MIME mismatch, and malformed object content fail closed", async () => {
  const cases = [
    ["not-found", { status: "not_found" }, undefined, 404],
    ["source-failure", { status: "source_failure", operation: "customer_upload_object_store.read" }, undefined, 503],
    ["wrong-provider-type", undefined, "text/html", 503],
    ["receipt-mismatch", undefined, "image/jpeg", 503],
  ];
  for (const [name, objectResult, objectContentType, expectedStatus] of cases) {
    const setupResult = setup({ objectResult, objectContentType });
    const owner = await issueContext(setupResult.owners);
    const response = await setupResult.handler(previewRequest({ context: owner.context }));
    assert.equal(response.status, expectedStatus, name);
    assert.equal(setupResult.calls.objectReads, 1, name);
  }
  const thrown = setup({ objectThrow: true });
  const owner = await issueContext(thrown.owners);
  assert.equal((await thrown.handler(previewRequest({ context: owner.context }))).status, 503);
});

test("preview target accepts only one opaque receiptId and success response leaks no authority", async () => {
  const setupResult = setup({ objectBytes: bytes([11, 12]) });
  const owner = await issueContext(setupResult.owners);
  for (const request of [
    previewRequest({ context: owner.context, extraQuery: "&ownerId=forbidden" }),
    previewRequest({ context: owner.context, extraQuery: "&receiptId=receipt-other" }),
    previewRequest({ receiptId: "bad receipt", context: owner.context }),
  ]) {
    await assertUnavailableResponse(await setupResult.handler(request));
  }
  assert.equal(setupResult.calls.receiptFactories, 0);
  const response = await setupResult.handler(previewRequest({ context: owner.context }));
  assert.equal(response.status, 200);
  const responseText = new TextDecoder().decode(await response.arrayBuffer());
  assert.doesNotMatch(responseText, /receipt|owner|bucket|storage|object|path|signed|provider|token|secret/i);
  const headers = [...response.headers.entries()].join("\n");
  assert.doesNotMatch(headers, /receipt|owner|bucket|storage|object|path|signed|provider|token|secret/i);
});

test("Task 5.8 sources stay client-safe/provider-neutral and do not alter public catalog boundaries", async () => {
  const [localPreview, handler, route, sitemap, productAssets] = await Promise.all([
    readFile(new URL("../app/client/local-customer-input-preview.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/server/customer-upload-preview-handler.server.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/customer-uploads/preview/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/sitemap.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/application/catalog-assets.ts", import.meta.url), "utf8"),
  ]);
  assert.match(localPreview, /createObjectURL/);
  assert.match(localPreview, /revokeObjectURL/);
  assert.doesNotMatch(localPreview, /fetch\(|\/api\/uploads|@supabase\/supabase-js|guest-draft-owner|CustomerUploadRepository|readPrivateObject|ProductAsset/i);
  assert.doesNotMatch(`${handler}\n${route}`, /@supabase\/supabase-js|SUPABASE_UPLOAD_BUCKET|createSignedUrl|R2Bucket|S3Client|storageKey|objectKey|publicUrl|ProductAsset|productionPreview/i);
  assert.doesNotMatch(`${sitemap}\n${productAssets}`, /customer-upload-preview|customer input preview|receiptId/i);
});
