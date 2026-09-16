import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { handleAdminCustomizationFieldMutation, handleAdminCustomizationFieldQuery } from "../app/server/admin-customization-field-http.server.ts";
import { createCustomerInputSafeObservability } from "../app/server/customer-input-safe-failure.server.ts";
import { createCustomerUploadHttpHandler } from "../app/server/customer-upload-http-handler.server.ts";
import { createCustomerUploadPreviewHttpHandler } from "../app/server/customer-upload-preview-handler.server.ts";
import { customerUploadProtectedBoundaryResponse } from "../app/server/customer-upload-ownership.server.ts";
import { createControlledCustomerUploadAdapters } from "../app/testing/customer-upload-failure-controls.ts";
import { createDeterministicCustomerUploadFakes } from "../app/testing/customer-upload-fakes.ts";
import { createGuestDraftOwnerService, getGuestDraftOwnerCookieName } from "../app/lib/guest-draft-owner.ts";

const origin = "https://photogift.test";
const observedAt = "2026-08-14T12:00:00.000Z";
const expiresAt = "2026-08-14T12:10:00.000Z";
const productId = "product-response-leakage";
const configurationRevision = "revision-current";

// These values are test-only canaries. They must never be placed in runtime
// configuration, fixtures, production errors, or application source.
const hostile = Object.freeze({
  bucket: "PRIVATE_BUCKET_CANARY",
  storageKey: "PRIVATE_STORAGE_KEY_CANARY",
  objectKey: "PRIVATE_OBJECT_KEY_CANARY",
  provider: "PRIVATE_PROVIDER_CANARY",
  signedUrl: "PRIVATE_SIGNED_URL_CANARY",
  ownerContext: "PRIVATE_OWNER_CONTEXT_CANARY",
  cookie: "PRIVATE_COOKIE_CANARY",
  token: "PRIVATE_TOKEN_CANARY",
  secret: "PRIVATE_SECRET_CANARY",
  serviceRole: "PRIVATE_SERVICE_ROLE_CANARY",
  sql: "PRIVATE_SQL_CANARY",
  sqlHint: "PRIVATE_SQL_HINT_CANARY",
  table: "PRIVATE_TABLE_CANARY",
  receipt: "PRIVATE_RECEIPT_CANARY",
  filename: "PRIVATE_FILENAME_CANARY",
  customerText: "PRIVATE_CUSTOMER_TEXT_CANARY",
});
const hostileValues = Object.values(hostile);
const forbiddenHeaderNames = new Set([
  "x-storage-key",
  "x-bucket",
  "x-object-key",
  "x-provider-error",
  "x-sql-error",
  "x-owner-token",
  "authorization",
  "cookie",
]);
const forbiddenResponseKeys = new Set([
  "bucket",
  "storageKey",
  "storage_key",
  "objectKey",
  "object_key",
  "provider",
  "url",
  "permanentUrl",
  "signedUrl",
  "signedURL",
  "ownerId",
  "ownerContext",
  "token",
  "secret",
  "serviceRole",
  "sql",
  "details",
  "detail",
  "hint",
  "stack",
  "rawError",
  "rawProviderError",
]);

const constraints = {
  allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  maxBytes: 10_000,
  minDimensions: { width: 100, height: 100 },
  recommendedDimensions: { width: 200, height: 150 },
  minImageCount: 1,
  maxImageCount: 1,
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

async function* byteStream(values) {
  yield new Uint8Array(values);
}

function owners(offset = 0) {
  let next = offset;
  return createGuestDraftOwnerService({
    signingSecret: "offline-response-leakage-owner-secret-material-1234567890",
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

function requestWithFile({ context, fileName = "portrait.png", fileType = "image/png", extraFields = [] } = {}) {
  const form = new FormData();
  form.append("file", new File([png()], fileName, { type: fileType }));
  for (const [key, value] of extraFields) form.append(key, value);
  return new Request(`${origin}/api/uploads`, {
    method: "POST",
    body: form,
    headers: {
      origin,
      "sec-fetch-site": "same-origin",
      ...(context ? { cookie: `${getGuestDraftOwnerCookieName()}=${encodeURIComponent(context)}` } : {}),
    },
  });
}

function acceptedReceipt(overrides = {}) {
  return {
    receiptId: "receipt-safe",
    originalFilename: "portrait.png",
    contentType: "image/png",
    byteSize: png().byteLength,
    dimensions: { width: 200, height: 150 },
    createdAt: "2026-08-14T11:00:00.000Z",
    expiresAt,
    lifecycle: "active",
    ...overrides,
  };
}

function receipt(receiptId, ownerId, overrides = {}) {
  return {
    receiptId,
    ownerId,
    originalFilename: "portrait.png",
    contentType: "image/png",
    byteSize: 3,
    dimensions: { width: 200, height: 150 },
    createdAt: "2026-08-14T11:00:00.000Z",
    expiresAt,
    lifecycle: "active",
    ...overrides,
  };
}

function events() {
  const recorded = [];
  let next = 0;
  return {
    recorded,
    observability: createCustomerInputSafeObservability({
      createCorrelationId: () => `response-leakage-${++next}`,
      sink: { record(event) { recorded.push(event); } },
    }),
  };
}

function assertNoHostileMarkers(value) {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  for (const marker of hostileValues) assert.equal(serialized.includes(marker), false, `leaked marker: ${marker}`);
}

function assertNoForbiddenKeys(value) {
  if (Array.isArray(value)) {
    for (const entry of value) assertNoForbiddenKeys(entry);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    assert.equal(forbiddenResponseKeys.has(key), false, `forbidden response key: ${key}`);
    assertNoForbiddenKeys(nested);
  }
}

function assertSafeHeaders(response, { allowSetCookie = false } = {}) {
  assertNoHostileMarkers(response.statusText);
  for (const [name, value] of response.headers.entries()) {
    if (name === "set-cookie" && allowSetCookie) {
      assertNoHostileMarkers(value);
      continue;
    }
    assert.equal(forbiddenHeaderNames.has(name), false, `forbidden response header: ${name}`);
    assertNoHostileMarkers(value);
  }
}

async function readSafeJson(response, options = {}) {
  const body = await response.json();
  assertNoHostileMarkers(body);
  assertNoForbiddenKeys(body);
  assertSafeHeaders(response, options);
  return body;
}

function assertGuestCookie(response, { secure }) {
  const cookie = response.headers.get("set-cookie");
  assert.ok(cookie);
  assert.match(cookie, new RegExp(`^${getGuestDraftOwnerCookieName()}=[^;]+`));
  assert.match(cookie, /; Path=\//);
  assert.match(cookie, /; Max-Age=3600/);
  assert.match(cookie, /; HttpOnly/);
  assert.match(cookie, /; SameSite=Lax/);
  if (secure) assert.match(cookie, /; Secure/);
  else assert.doesNotMatch(cookie, /; Secure/);
  assertNoHostileMarkers(cookie);
  assert.doesNotMatch(cookie, /(?:bucket|storageKey|objectKey|provider|signedUrl|token|secret|ownerId)/i);
}

function acceptanceDependencies(adapters, receiptIds = ["receipt-accepted"]) {
  let index = 0;
  return {
    objectStore: adapters.objectStore,
    receiptRepository: adapters.receiptRepository,
    receiptIdGenerator: { allocateReceiptId: () => receiptIds[index++] },
    now: () => "2026-08-14T11:00:00.000Z",
    expiryPolicy: { deriveExpiresAt: () => expiresAt },
  };
}

function uploadSetup(options = {}) {
  const base = createDeterministicCustomerUploadFakes({
    now: () => observedAt,
    derivePreviewExpiresAt: ({ receipt: item }) => item.expiresAt,
  });
  const adapters = createControlledCustomerUploadAdapters({
    objectStore: base.objectStore,
    receiptRepository: base.receiptRepository,
    previewAccess: base.previewAccess,
    failurePlan: options.failurePlan,
  });
  const ownerService = options.ownerService ?? owners();
  const safeEvents = options.safeEvents ?? events();
  const handler = createCustomerUploadHttpHandler({
    ownerService,
    async resolveFieldConstraints() {
      return options.resolution ?? { status: "found", constraints };
    },
    createAcceptanceDependencies() {
      return acceptanceDependencies(adapters, ["receipt-accepted"]);
    },
    ...(options.acceptImageUpload ? { acceptImageUpload: options.acceptImageUpload } : {}),
    runtimeMode: options.runtimeMode ?? "development",
    observability: safeEvents.observability,
  });
  return { base, adapters, ownerService, safeEvents, handler };
}

function previewRequest(context, receiptId = "receipt-preview") {
  return new Request(`${origin}/api/customer-uploads/preview?receiptId=${encodeURIComponent(receiptId)}`, {
    headers: context ? { cookie: `${getGuestDraftOwnerCookieName()}=${encodeURIComponent(context)}` } : {},
  });
}

async function previewSetup(options = {}) {
  const ownerService = options.ownerService ?? owners(options.ownerOffset ?? 0);
  const issuedOwner = options.issuedOwner ?? await issueOwner(ownerService);
  const ownerId = options.ownerId ?? issuedOwner.ownerId;
  const base = createDeterministicCustomerUploadFakes({
    now: () => observedAt,
    derivePreviewExpiresAt: ({ receipt: item }) => options.capabilityExpiry ?? item.expiresAt,
    receipts: options.receipts ?? [{ receipt: receipt("receipt-preview", ownerId) }],
  });
  const adapters = createControlledCustomerUploadAdapters({
    objectStore: base.objectStore,
    receiptRepository: base.receiptRepository,
    previewAccess: base.previewAccess,
    failurePlan: options.failurePlan,
  });
  const safeEvents = options.safeEvents ?? events();
  const handler = createCustomerUploadPreviewHttpHandler({
    ownerService,
    createReceiptRepository: () => adapters.receiptRepository,
    createPreviewAccess: () => adapters.previewAccess,
    createObjectStore: () => adapters.objectStore,
    now: () => observedAt,
    observability: safeEvents.observability,
  });
  return { base, adapters, ownerService, ownerId, ownerContext: issuedOwner.context, safeEvents, handler };
}

async function persistPreviewObject(base, receiptId = "receipt-preview", values = [1, 2, 3]) {
  const result = await base.objectStore.putPrivateObject({
    receiptId,
    content: { contentType: "image/png", bytes: byteStream(values) },
  });
  assert.deepEqual(result, { status: "stored", value: true });
}

function adminAuthorized() {
  return {
    async verifyAdminSession() {
      return { status: "authorized", principal: { role: "admin", identity: "configured-admin" } };
    },
  };
}

function adminIntent(overrides = {}) {
  return {
    expectedCurrentRevision: configurationRevision,
    fields: [{
      identity: { kind: "existing", id: "field-name", code: "name" },
      label: "Name",
      kind: "short_text",
      required: true,
      isActive: true,
      position: 0,
      constraints: { maxLength: 80 },
    }],
    ...overrides,
  };
}

function adminConfiguration() {
  return {
    productId,
    configurationRevision,
    fields: [{
      id: "field-name",
      productId,
      code: "name",
      label: "Name",
      kind: "short_text",
      required: true,
      isActive: true,
      position: 0,
      configurationRevision,
      constraints: { maxLength: 80 },
    }],
  };
}

test("9.3 successful upload exposes only the approved receipt contract", async () => {
  const setup = uploadSetup({ runtimeMode: "production" });
  const response = await setup.handler(requestWithFile());
  assert.equal(response.status, 201);
  const body = await readSafeJson(response, { allowSetCookie: true });
  assert.deepEqual(Object.keys(body).sort(), ["receipt", "warnings"]);
  assert.deepEqual(Object.keys(body.receipt).sort(), [
    "byteSize", "contentType", "createdAt", "dimensions", "expiresAt", "lifecycle", "originalFilename", "receiptId",
  ]);
  assert.equal(body.receipt.receiptId, "receipt-accepted");
  assert.equal(body.receipt.originalFilename, "portrait.png");
  assertGuestCookie(response, { secure: true });
});

test("9.3 an existing guest owner is not reissued and owner context stays cookie-only", async () => {
  const ownerService = owners();
  const owner = await issueOwner(ownerService);
  const setup = uploadSetup({ ownerService });
  const response = await setup.handler(requestWithFile({ context: owner.context }));
  assert.equal(response.status, 201);
  const body = await readSafeJson(response);
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal("ownerId" in body, false);
  assert.equal("ownerContext" in body, false);
});

test("9.3 upload owner, field, acceptance, object, metadata, and malformed-receipt failures are bounded", async () => {
  const cases = [
    {
      name: "owner service exception",
      setup: () => uploadSetup({ ownerService: {
        async ensureGuestDraftOwnerContext() { throw new Error(Object.values(hostile).join(" | ")); },
        getSetCookieHeader() { return `${getGuestDraftOwnerCookieName()}=${hostile.cookie}`; },
      } }),
    },
    { name: "field resolution source failure", setup: () => uploadSetup({ resolution: { status: "source_failure" } }) },
    { name: "object-store failure", setup: () => uploadSetup({ failurePlan: { objectPut: ["throw_hostile"] } }) },
    { name: "receipt metadata persistence failure", setup: () => uploadSetup({ failurePlan: { receiptCreate: ["throw_hostile"] } }) },
    {
      name: "acceptance service unexpected throw",
      setup: () => uploadSetup({ acceptImageUpload: async () => { throw new Error(Object.values(hostile).join(" | ")); } }),
    },
    {
      name: "malformed accepted receipt",
      setup: () => uploadSetup({ acceptImageUpload: async () => ({
        status: "accepted",
        receipt: { ...acceptedReceipt(), bucket: hostile.bucket, ownerId: hostile.ownerContext },
        warnings: [],
      }) }),
    },
  ];
  for (const { name, setup } of cases) {
    const result = setup();
    const response = await result.handler(requestWithFile());
    assert.equal(response.status, 503, name);
    assert.deepEqual(await readSafeJson(response, { allowSetCookie: name !== "owner service exception" }), {
      error: "Customer upload is temporarily unavailable.",
    }, name);
    assertNoHostileMarkers(result.safeEvents.recorded);
  }
});

test("9.3 safe upload validation returns approved issue/warning codes without raw customer or provider text", async () => {
  const setup = uploadSetup({
    acceptImageUpload: async () => ({
      status: "rejected",
      issues: [{ code: "invalid_filename", message: `${hostile.filename} ${hostile.sql}` }],
      warnings: [{ code: "declared_mime_mismatch", message: hostile.provider }],
    }),
  });
  const response = await setup.handler(requestWithFile({ fileName: "safe-name.png" }));
  assert.equal(response.status, 400);
  const body = await readSafeJson(response, { allowSetCookie: true });
  assert.deepEqual(body, {
    issues: [{ code: "invalid_filename", message: "Filename is not a safe display value." }],
    warnings: [{ code: "declared_mime_mismatch", message: "Declared image type does not match the detected image bytes." }],
  });
});

test("9.3 preview success returns private bytes through safe headers without a provider locator", async () => {
  const setup = await previewSetup();
  await persistPreviewObject(setup.base);
  const response = await setup.handler(previewRequest(setup.ownerContext));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("cross-origin-resource-policy"), "same-origin");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assertSafeHeaders(response);
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [1, 2, 3]);
});

test("9.3 preview missing, cross-owner, unknown, expired, and inactive states are bounded and do not form an existence oracle", async () => {
  const ownerAService = owners(0);
  const ownerBService = owners(100);
  const ownerA = await issueOwner(ownerAService);
  const ownerB = await issueOwner(ownerBService);
  const shared = await previewSetup({
    ownerService: ownerAService,
    issuedOwner: ownerA,
    ownerId: ownerB.ownerId,
    receipts: [
      { receipt: receipt("receipt-cross-owner", ownerB.ownerId) },
      { receipt: receipt("receipt-expired", ownerA.ownerId, { expiresAt: observedAt }) },
      { receipt: receipt("receipt-inactive", ownerA.ownerId, { lifecycle: "removed" }) },
    ],
  });
  const responses = await Promise.all([
    shared.handler(previewRequest(shared.ownerContext, "receipt-cross-owner")),
    shared.handler(previewRequest(shared.ownerContext, "receipt-unknown")),
    shared.handler(previewRequest(shared.ownerContext, "receipt-expired")),
    shared.handler(previewRequest(shared.ownerContext, "receipt-inactive")),
    shared.handler(previewRequest(undefined, "receipt-unknown")),
  ]);
  for (const response of responses) {
    assert.equal(response.status, 404);
    assert.deepEqual(await readSafeJson(response), { error: "Customer input preview is unavailable." });
  }
});

test("9.3 preview authorization and object-read failures suppress raw provider errors", async () => {
  for (const failurePlan of [
    { previewAuthorize: ["throw_hostile"] },
    { objectRead: ["throw_hostile"] },
  ]) {
    const setup = await previewSetup({ failurePlan });
    await persistPreviewObject(setup.base);
    const response = await setup.handler(previewRequest(setup.ownerContext));
    assert.equal(response.status, 503);
    assert.deepEqual(await readSafeJson(response), { error: "Customer input preview is temporarily unavailable." });
    assertNoHostileMarkers(setup.safeEvents.recorded);
  }
});

test("9.3 protected ownership response collapses internal status and diagnostic fields safely", async () => {
  for (const result of [
    { status: "continued", value: { ownerId: hostile.ownerContext, provider: hostile.provider } },
    { status: "not_found", lookupReason: hostile.table },
    { status: "forbidden", ownerId: hostile.ownerContext },
    { status: "source_failure", operation: hostile.sql, detail: hostile.sqlHint },
  ]) {
    const response = customerUploadProtectedBoundaryResponse(result);
    assertSafeHeaders(response);
    const body = await readSafeJson(response);
    assert.deepEqual(body, result.status === "continued" ? { status: "continued" } : result.status === "source_failure"
      ? { status: "source_failure", message: "Customer upload is temporarily unavailable." }
      : { status: result.status });
  }
});

test("9.3 admin customization HTTP responses expose safe status contracts only", async () => {
  let factories = 0;
  const unauthorized = await handleAdminCustomizationFieldQuery(productId, {
    verifier: { async verifyAdminSession() { return { status: "unauthorized" }; } },
    createReader() { factories += 1; throw new Error(hostile.serviceRole); },
    createRepositories() { factories += 1; throw new Error(hostile.serviceRole); },
  });
  assert.equal(unauthorized.status, 401);
  assert.deepEqual(await readSafeJson(unauthorized), { status: "unauthorized" });
  assert.equal(factories, 0);

  const sourceFailure = await handleAdminCustomizationFieldQuery(productId, {
    verifier: adminAuthorized(),
    createReader() {
      return { async getCurrentConfigurationForAdmin() { return { status: "source_failure", operation: hostile.sql }; } };
    },
    createRepositories() { throw new Error(hostile.serviceRole); },
  });
  assert.equal(sourceFailure.status, 503);
  assert.deepEqual(await readSafeJson(sourceFailure), {
    status: "source_failure",
    message: "Customization configuration is temporarily unavailable.",
  });

  const invalid = await handleAdminCustomizationFieldMutation(
    new Request(`${origin}/api/admin/customization-fields/${productId}`, {
      method: "POST",
      headers: { origin, "sec-fetch-site": "same-origin", "content-type": "application/json" },
      body: JSON.stringify({ raw: hostile.sql, details: hostile.sqlHint }),
    }),
    productId,
    {
      verifier: adminAuthorized(),
      createReader() { return { async getCurrentConfigurationForAdmin() { return { status: "not_found" }; } }; },
      createRepositories() { factories += 1; throw new Error(hostile.serviceRole); },
    },
  );
  assert.equal(invalid.status, 400);
  const invalidBody = await readSafeJson(invalid);
  assert.equal(invalidBody.status, "invalid_request");
  assert.equal(factories, 0);

  const stale = await handleAdminCustomizationFieldMutation(
    new Request(`${origin}/api/admin/customization-fields/${productId}`, {
      method: "POST",
      headers: { origin, "sec-fetch-site": "same-origin", "content-type": "application/json" },
      body: JSON.stringify(adminIntent()),
    }),
    productId,
    {
      verifier: adminAuthorized(),
      createReader() {
        return {
          async getCurrentConfigurationForAdmin() { return { status: "found", value: adminConfiguration() }; },
          async getStableFieldIdentitiesForAdmin() { return { status: "found", value: [{ id: "field-name", productId, code: "name" }] }; },
        };
      },
      createRepositories() {
        return {
          reader: {
            async getCurrentConfigurationForAdmin() { return { status: "found", value: adminConfiguration() }; },
            async getStableFieldIdentitiesForAdmin() { return { status: "found", value: [{ id: "field-name", productId, code: "name" }] }; },
          },
          writer: { async publishCustomizationConfiguration() { return { status: "stale_revision" }; } },
        };
      },
    },
  );
  assert.equal(stale.status, 409);
  assert.deepEqual(await readSafeJson(stale), { status: "stale_revision" });
});

test("9.3 route headers never reflect authorization/cookie/provider/SQL markers", async () => {
  const setup = uploadSetup({
    resolution: { status: "source_failure" },
  });
  const response = await setup.handler(requestWithFile());
  assertSafeHeaders(response, { allowSetCookie: true });
  assert.equal(response.headers.get("authorization"), null);
  assert.equal(response.headers.get("cookie"), null);
  assert.equal(response.headers.get("x-storage-key"), null);
  assert.equal(response.headers.get("x-sql-error"), null);
});

test("9.3 normalized checkout remains the approved 503 stop and does not reflect hostile input", async () => {
  const source = await readFile(new URL("../app/api/orders/route.ts", import.meta.url), "utf8");
  const stop = '"Personalized checkout is temporarily unavailable."';
  const stopIndex = source.indexOf(stop);
  const catalogIndex = source.indexOf("const catalog = await createServerCatalogRepository()");
  assert.notEqual(stopIndex, -1);
  assert.notEqual(catalogIndex, -1);
  assert.ok(stopIndex < catalogIndex);
  assert.match(source.slice(Math.max(0, stopIndex - 120), stopIndex + stop.length + 40), /status:\s*503/);
  const responseExpression = source.match(/return Response\.json\(\s*\{\s*error:\s*"Personalized checkout is temporarily unavailable\."\s*\},\s*\{\s*status:\s*503\s*\}\s*,\s*\);/s)?.[0];
  assert.ok(responseExpression);
  assert.doesNotMatch(responseExpression, /\$\{|body\.|customerText|provider|receipt|storage|sql|secret/i);
  assertNoHostileMarkers(responseExpression);
});

test("9.3 safe observability remains a closed event without raw exception/customer/provider fields", async () => {
  const safeEvents = events();
  safeEvents.observability.record("upload", "temporary_failure");
  assert.deepEqual(safeEvents.recorded, [{
    event: "customer_input_failure",
    operation: "upload",
    category: "temporary_failure",
    correlationId: "response-leakage-1",
  }]);
  assertNoHostileMarkers(safeEvents.recorded);
  assert.deepEqual(Object.keys(safeEvents.recorded[0]).sort(), ["category", "correlationId", "event", "operation"]);
});
