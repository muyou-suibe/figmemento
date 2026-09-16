import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createGuestDraftOwnerService, getGuestDraftOwnerCookieName } from "../app/lib/guest-draft-owner.ts";
import { POST as unavailableUploadRoute } from "../app/api/uploads/route.ts";
import { createCustomerUploadHttpHandler } from "../app/server/customer-upload-http-handler.server.ts";

const origin = "https://photogift.test";
const constraints = {
  allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  maxBytes: 1_024,
  minDimensions: { width: 100, height: 100 },
  minImageCount: 1,
  maxImageCount: 1,
  cropEnabled: false,
};

function ownerService(now = 1_700_000_000) {
  let next = 0;
  return createGuestDraftOwnerService({
    signingSecret: "offline-upload-http-handler-secret-material-1234567890",
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

function acceptedReceipt(overrides = {}) {
  return {
    receiptId: "receipt-upload-a",
    originalFilename: "portrait.png",
    contentType: "image/png",
    byteSize: 30,
    dimensions: { width: 200, height: 150 },
    createdAt: "2026-08-13T00:00:00.000Z",
    expiresAt: "2026-08-14T00:00:00.000Z",
    lifecycle: "active",
    ...overrides,
  };
}

function formRequest({
  fields = [["file", new File([new Uint8Array([1, 2, 3])], "portrait.png", { type: "image/jpeg" })]],
  context,
  requestOrigin = origin,
  method = "POST",
  contentLength,
} = {}) {
  const form = new FormData();
  for (const [name, value] of fields) form.append(name, value);
  return new Request(`${origin}/api/uploads`, {
    method,
    body: form,
    headers: {
      origin: requestOrigin,
      "sec-fetch-site": requestOrigin === origin ? "same-origin" : "cross-site",
      ...(contentLength === undefined ? {} : { "content-length": String(contentLength) }),
      ...(context ? { cookie: `${getGuestDraftOwnerCookieName()}=${encodeURIComponent(context)}` } : {}),
    },
  });
}

function observeMultipartParsing(request) {
  let calls = 0;
  return {
    request: new Proxy(request, {
      get(target, property) {
        if (property === "formData") {
          return async () => {
            calls += 1;
            return target.formData();
          };
        }
        return Reflect.get(target, property, target);
      },
    }),
    calls: () => calls,
  };
}

async function issuedContext(owners) {
  const issued = await owners.issueGuestDraftOwner();
  assert.equal(issued.status, "issued");
  return issued.value.context;
}

function setup(options = {}) {
  const owners = options.ownerService ?? ownerService();
  const calls = { resolve: 0, dependencyFactories: 0, accepts: 0 };
  const handler = createCustomerUploadHttpHandler({
    ownerService: owners,
    async resolveFieldConstraints() {
      calls.resolve += 1;
      return options.resolution ?? { status: "found", constraints };
    },
    createAcceptanceDependencies() {
      calls.dependencyFactories += 1;
      return {};
    },
    async acceptImageUpload(input) {
      calls.accepts += 1;
      options.onAccept?.(input);
      return options.acceptance ?? { status: "accepted", receipt: acceptedReceipt(), warnings: [] };
    },
    runtimeMode: "development",
  });
  return { owners, calls, handler };
}

function forbiddenKey(value) {
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, nested]) => (
    /^(?:ownerId|bucket|storageKey|storage_key|objectKey|object_key|path|photoPath|photoPaths|url|signedUrl|signedURL|provider|container|region|locator|secret|token)$/i.test(key)
    || forbiddenKey(nested)
  ));
}

test("new browser multipart contract accepts only file and rejects authority-looking fields before owner or privileged factories", async () => {
  for (const field of [
    "bucket",
    "storageKey",
    "storage_key",
    "objectKey",
    "object_key",
    "path",
    "photoPath",
    "photoPaths",
    "url",
    "signedUrl",
    "signedURL",
    "provider",
    "container",
    "region",
    "ownerId",
    "receiptId",
    "expiresAt",
  ]) {
    const setupResult = setup();
    const response = await setupResult.handler(formRequest({ fields: [
      ["file", new File([new Uint8Array([1])], "portrait.png", { type: "image/png" })],
      [field, "untrusted"],
    ] }));
    assert.equal(response.status, 400, field);
    assert.deepEqual(setupResult.calls, { resolve: 1, dependencyFactories: 0, accepts: 0 }, field);
  }
});

test("missing owner context explicitly issues an HttpOnly cookie without JSON owner credentials", async () => {
  const setupResult = setup();
  const response = await setupResult.handler(formRequest());
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(forbiddenKey(body), false);
  assert.equal(body.receipt.receiptId, "receipt-upload-a");
  const cookie = response.headers.get("set-cookie");
  assert.match(cookie ?? "", new RegExp(`^${getGuestDraftOwnerCookieName()}=`));
  assert.match(cookie ?? "", /; Path=\/; .*HttpOnly; SameSite=Lax/);
  assert.doesNotMatch(cookie ?? "", /Secure/);
  assert.deepEqual(setupResult.calls, { resolve: 1, dependencyFactories: 1, accepts: 1 });
});

test("invalid owner context fails closed without fresh issuance, field resolution, or privileged factories", async () => {
  const setupResult = setup();
  const observed = observeMultipartParsing(formRequest({ context: "tampered.owner.context" }));
  const response = await setupResult.handler(observed.request);
  assert.equal(response.status, 404);
  assert.equal(response.headers.get("set-cookie"), null);
  assert.deepEqual(setupResult.calls, { resolve: 0, dependencyFactories: 0, accepts: 0 });
  assert.equal(observed.calls(), 0);
});

test("cross-origin upload is rejected before owner issuance, resolution, or acceptance", async () => {
  const setupResult = setup();
  const observed = observeMultipartParsing(formRequest({ requestOrigin: "https://attacker.test" }));
  const response = await setupResult.handler(observed.request);
  assert.equal(response.status, 403);
  assert.deepEqual(setupResult.calls, { resolve: 0, dependencyFactories: 0, accepts: 0 });
  assert.equal(observed.calls(), 0);
});

test("field-resolution failures stop before multipart materialization while retaining allowed missing-owner issuance", async () => {
  for (const resolution of [{ status: "not_found" }, { status: "source_failure" }]) {
    const setupResult = setup({ resolution });
    const observed = observeMultipartParsing(formRequest());
    const response = await setupResult.handler(observed.request);
    assert.equal(response.status, resolution.status === "not_found" ? 404 : 503);
    assert.equal(observed.calls(), 0);
    assert.deepEqual(setupResult.calls, { resolve: 1, dependencyFactories: 0, accepts: 0 });
    assert.match(response.headers.get("set-cookie") ?? "", new RegExp(`^${getGuestDraftOwnerCookieName()}=`));
  }
});

test("field resolution receives non-body context only", async () => {
  const setupResult = setup();
  let resolverRequest;
  const handler = createCustomerUploadHttpHandler({
    ownerService: setupResult.owners,
    async resolveFieldConstraints(request) {
      resolverRequest = request;
      return { status: "not_found" };
    },
    createAcceptanceDependencies: () => ({}),
    runtimeMode: "development",
  });
  const observed = observeMultipartParsing(formRequest());
  const response = await handler(observed.request);
  assert.equal(response.status, 404);
  assert.equal(observed.calls(), 0);
  assert.equal(typeof resolverRequest.formData, "undefined");
  assert.equal(typeof resolverRequest.arrayBuffer, "undefined");
  assert.equal(resolverRequest.method, "POST");
});

test("obviously oversized Content-Length is rejected before multipart materialization", async () => {
  const setupResult = setup();
  const context = await issuedContext(setupResult.owners);
  const observed = observeMultipartParsing(formRequest({
    context,
    contentLength: 1_024 + (64 * 1024) + 1,
  }));
  const response = await setupResult.handler(observed.request);
  assert.equal(response.status, 400);
  assert.equal(observed.calls(), 0);
  assert.deepEqual(setupResult.calls, { resolve: 1, dependencyFactories: 0, accepts: 0 });
});

test("missing or lying Content-Length cannot bypass actual File size validation", async () => {
  for (const contentLength of [undefined, 1]) {
    const setupResult = setup();
    const context = await issuedContext(setupResult.owners);
    const observed = observeMultipartParsing(formRequest({
      context,
      contentLength,
      fields: [["file", new File([new Uint8Array(1_025)], "oversized.png", { type: "image/png" })]],
    }));
    const response = await setupResult.handler(observed.request);
    assert.equal(response.status, 400);
    assert.equal(observed.calls(), 1);
    assert.deepEqual(setupResult.calls, { resolve: 1, dependencyFactories: 0, accepts: 0 });
  }
});

test("default unavailable route resolves failure without reading multipart bytes", async () => {
  const priorSecret = process.env.PHOTOGIFT_GUEST_DRAFT_OWNER_SECRET;
  const priorTtl = process.env.PHOTOGIFT_GUEST_DRAFT_OWNER_CONTEXT_TTL_SECONDS;
  process.env.PHOTOGIFT_GUEST_DRAFT_OWNER_SECRET = "offline-default-route-owner-secret-material-1234567890";
  process.env.PHOTOGIFT_GUEST_DRAFT_OWNER_CONTEXT_TTL_SECONDS = "3600";
  try {
    const observed = observeMultipartParsing(formRequest());
    const response = await unavailableUploadRoute(observed.request);
    assert.equal(response.status, 503);
    assert.equal(observed.calls(), 0);
  } finally {
    if (priorSecret === undefined) delete process.env.PHOTOGIFT_GUEST_DRAFT_OWNER_SECRET;
    else process.env.PHOTOGIFT_GUEST_DRAFT_OWNER_SECRET = priorSecret;
    if (priorTtl === undefined) delete process.env.PHOTOGIFT_GUEST_DRAFT_OWNER_CONTEXT_TTL_SECONDS;
    else process.env.PHOTOGIFT_GUEST_DRAFT_OWNER_CONTEXT_TTL_SECONDS = priorTtl;
  }
});

test("accepted response uses authoritative Task 5.5 metadata and never provider or owner fields", async () => {
  let received;
  const setupResult = setup({
    acceptance: {
      status: "accepted",
      receipt: acceptedReceipt({ contentType: "image/png", byteSize: 30, dimensions: { width: 200, height: 150 } }),
      warnings: [{ code: "declared_mime_mismatch", message: "Declared image type does not match the detected image bytes." }],
    },
    onAccept(input) { received = input; },
  });
  const response = await setupResult.handler(formRequest({ fields: [[
    "file", new File([new Uint8Array(30)], "portrait.jpg", { type: "image/jpeg" }),
  ]] }));
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(received.declaredContentType, "image/jpeg");
  assert.equal(body.receipt.contentType, "image/png");
  assert.equal(body.receipt.byteSize, 30);
  assert.deepEqual(body.receipt.dimensions, { width: 200, height: 150 });
  assert.equal(forbiddenKey(body), false);
});

test("malformed accepted receipt and source failure both return generic safe service failure", async () => {
  for (const acceptance of [
    { status: "accepted", receipt: acceptedReceipt({ ownerId: "leaked-owner" }), warnings: [] },
    { status: "source_failure", stage: "object_storage", compensation: "failed" },
  ]) {
    const setupResult = setup({ acceptance });
    const response = await setupResult.handler(formRequest());
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.deepEqual(body, { error: "Customer upload is temporarily unavailable." });
    assert.equal(forbiddenKey(body), false);
  }
});

test("new handler and route are provider-neutral while the historical order path stays compatibility-only", async () => {
  const [handler, route, orderRoute, compatibility] = await Promise.all([
    readFile(new URL("../app/server/customer-upload-http-handler.server.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/uploads/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/orders/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/application/legacy-order-upload-reference.ts", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(`${handler}\n${route}`, /@supabase\/supabase-js|SUPABASE_UPLOAD_BUCKET|R2Bucket|S3Client|\.storage\.|storageKey|objectKey|signedUrl/i);
  assert.doesNotMatch(route, /bucket|storageKey|photoPath/);
  assert.match(orderRoute, /readLegacyOrderUploadReference/);
  assert.match(compatibility, /Compatibility-only server-side interpretation/);
  assert.match(compatibility, /photoPath/);
});
