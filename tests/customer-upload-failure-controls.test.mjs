import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { acceptCustomerImageUpload } from "../app/application/customer-upload-acceptance-service.ts";
import { CustomerUploadLifecycleService } from "../app/application/customer-upload-lifecycle-service.ts";
import { createCustomerInputSafeObservability } from "../app/server/customer-input-safe-failure.server.ts";
import { createCustomerUploadHttpHandler } from "../app/server/customer-upload-http-handler.server.ts";
import { createCustomerUploadPreviewHttpHandler } from "../app/server/customer-upload-preview-handler.server.ts";
import { createGuestDraftOwnerService, getGuestDraftOwnerCookieName } from "../app/lib/guest-draft-owner.ts";
import { createControlledCustomerUploadAdapters } from "../app/testing/customer-upload-failure-controls.ts";
import { createDeterministicCustomerUploadFakes } from "../app/testing/customer-upload-fakes.ts";

const origin = "https://photogift.test";
const createdAt = "2026-08-13T12:00:00.000Z";
const observedAt = "2026-08-14T12:00:00.000Z";
const expiry = "2026-08-14T12:10:00.000Z";
const previewExpiry = "2026-08-14T12:05:00.000Z";
const hostileMarkers = ["bucket=private-media", "storageKey=drafts/secret.png", "signedUrl=https://provider.test/secret", "token=secret", "SQLSTATE 23505", "DETAIL secret-detail", "HINT secret-hint", "customer-text-marker"];

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

function baseFakes(options = {}) {
  return createDeterministicCustomerUploadFakes({
    now: () => options.now ?? observedAt,
    derivePreviewExpiresAt: ({ receipt }) => options.previewExpiry ?? receipt.expiresAt,
    receipts: options.receipts ?? [],
  });
}

function controlled(options = {}) {
  const base = baseFakes(options);
  const adapters = createControlledCustomerUploadAdapters({
    objectStore: base.objectStore,
    receiptRepository: base.receiptRepository,
    previewAccess: base.previewAccess,
    failurePlan: options.failurePlan,
  });
  return { base, adapters };
}

function uploadInput() {
  return {
    verifiedOwnerId: "owner-a",
    fieldConstraints: constraints,
    bytes: png(),
    originalFilename: "portrait.png",
  };
}

function acceptanceDependencies(adapters, receiptIds) {
  let index = 0;
  return {
    objectStore: adapters.objectStore,
    receiptRepository: adapters.receiptRepository,
    receiptIdGenerator: { allocateReceiptId: () => receiptIds[index++] },
    now: () => createdAt,
    expiryPolicy: { deriveExpiresAt: () => expiry },
  };
}

function assertNotAccepted(result) {
  assert.equal(result.status, "source_failure");
  assert.equal("receipt" in result, false);
}

function ownerService() {
  let next = 0;
  return createGuestDraftOwnerService({
    signingSecret: "offline-failure-control-owner-secret-material-1234567890",
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

async function ownerContext(owners) {
  const issued = await owners.issueGuestDraftOwner();
  assert.equal(issued.status, "issued");
  return issued.value;
}

function events() {
  const recorded = [];
  let count = 0;
  return {
    recorded,
    observability: createCustomerInputSafeObservability({
      createCorrelationId: () => `correlation-${++count}`,
      sink: { record(event) { recorded.push(event); } },
    }),
  };
}

function uploadRequest() {
  const form = new FormData();
  form.append("file", new File([png()], "portrait.png", { type: "image/png" }));
  return new Request(`${origin}/api/uploads`, {
    method: "POST",
    body: form,
    headers: { origin, "sec-fetch-site": "same-origin" },
  });
}

function previewRequest(context, receiptId) {
  return new Request(`${origin}/api/customer-uploads/preview?receiptId=${encodeURIComponent(receiptId)}`, {
    headers: { cookie: `${getGuestDraftOwnerCookieName()}=${encodeURIComponent(context)}` },
  });
}

function assertNoHostileMarker(value) {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  for (const marker of hostileMarkers) assert.doesNotMatch(serialized, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

test("failure wrapper is normal pass-through and only consumes a queued action when the corresponding port method runs", async () => {
  const { base, adapters } = controlled({ failurePlan: { objectDelete: ["source_failure"] } });
  const result = await acceptCustomerImageUpload(uploadInput(), acceptanceDependencies(adapters, ["receipt-pass"]));
  assert.equal(result.status, "accepted");
  assert.equal(base.snapshot().objects.length, 1);
  assert.equal(base.snapshot().receipts.length, 1);
  assert.deepEqual(adapters.snapshot(), {
    calls: { objectPut: 1, receiptCreate: 1, previewAuthorize: 0, objectRead: 0, objectDelete: 0 },
    remaining: { objectPut: [], receiptCreate: [], previewAuthorize: [], objectRead: [], objectDelete: ["source_failure"] },
  });
});

test("object put source failure and throw happen before state mutation, receipt metadata, or compensation", async () => {
  for (const action of ["source_failure", "throw"]) {
    const { base, adapters } = controlled({ failurePlan: { objectPut: [action] } });
    const result = await acceptCustomerImageUpload(uploadInput(), acceptanceDependencies(adapters, [`receipt-put-${action}`]));
    assert.deepEqual(result, { status: "source_failure", stage: "object_storage", compensation: "not_attempted" });
    assert.deepEqual(base.snapshot(), { objects: [], receipts: [] });
    assert.deepEqual(adapters.snapshot().calls, { objectPut: 1, receiptCreate: 0, previewAuthorize: 0, objectRead: 0, objectDelete: 0 });
  }
});

test("write-then-throw models an uncertain orphan without metadata creation, compensation, or false accepted receipt", async () => {
  const { base, adapters } = controlled({ failurePlan: { objectPut: ["write_then_throw"] } });
  const result = await acceptCustomerImageUpload(uploadInput(), acceptanceDependencies(adapters, ["receipt-uncertain"]));
  assert.deepEqual(result, { status: "source_failure", stage: "object_storage", compensation: "not_attempted" });
  assert.deepEqual(base.snapshot().receipts, []);
  assert.deepEqual(base.snapshot().objects.map((entry) => entry.receiptId), ["receipt-uncertain"]);
  assert.deepEqual(adapters.snapshot().calls, { objectPut: 1, receiptCreate: 0, previewAuthorize: 0, objectRead: 0, objectDelete: 0 });
});

test("receipt-create source failure and throw trigger exactly one compensation attempt and never accept metadata", async () => {
  for (const action of ["source_failure", "throw"]) {
    const { base, adapters } = controlled({ failurePlan: { receiptCreate: [action] } });
    const result = await acceptCustomerImageUpload(uploadInput(), acceptanceDependencies(adapters, [`receipt-create-${action}`]));
    assert.deepEqual(result, { status: "source_failure", stage: "receipt_persistence", compensation: "succeeded" });
    assert.deepEqual(base.snapshot(), { objects: [], receipts: [] });
    assert.deepEqual(adapters.snapshot().calls, { objectPut: 1, receiptCreate: 1, previewAuthorize: 0, objectRead: 0, objectDelete: 1 });
  }
});

test("compensation source failure or throw leaves only a private orphan, never an accepted receipt, and does not retry", async () => {
  for (const deleteAction of ["source_failure", "throw"]) {
    const { base, adapters } = controlled({ failurePlan: { receiptCreate: ["source_failure"], objectDelete: [deleteAction] } });
    const result = await acceptCustomerImageUpload(uploadInput(), acceptanceDependencies(adapters, [`receipt-compensation-${deleteAction}`]));
    assert.deepEqual(result, { status: "source_failure", stage: "receipt_persistence", compensation: "failed" });
    assert.deepEqual(base.snapshot().receipts, []);
    assert.deepEqual(base.snapshot().objects.map((entry) => entry.receiptId), [`receipt-compensation-${deleteAction}`]);
    assert.equal(adapters.snapshot().calls.objectDelete, 1);
  }
});

test("retry after clean compensation accepts a new receipt and does not reuse the first failed attempt", async () => {
  const { base, adapters } = controlled({ failurePlan: { receiptCreate: ["source_failure", "pass"] } });
  const dependencies = acceptanceDependencies(adapters, ["receipt-first", "receipt-second"]);
  const first = await acceptCustomerImageUpload(uploadInput(), dependencies);
  assertNotAccepted(first);
  const second = await acceptCustomerImageUpload(uploadInput(), dependencies);
  assert.equal(second.status, "accepted");
  assert.deepEqual(base.snapshot().objects.map((entry) => entry.receiptId), ["receipt-second"]);
  assert.deepEqual(base.snapshot().receipts.map((entry) => entry.receipt.receiptId), ["receipt-second"]);
});

test("a later normal request after uncertain write still executes full acceptance and does not claim orphan reconciliation", async () => {
  const { base, adapters } = controlled({ failurePlan: { objectPut: ["write_then_throw", "pass"] } });
  const dependencies = acceptanceDependencies(adapters, ["receipt-orphan", "receipt-later"]);
  assertNotAccepted(await acceptCustomerImageUpload(uploadInput(), dependencies));
  const second = await acceptCustomerImageUpload(uploadInput(), dependencies);
  assert.equal(second.status, "accepted");
  assert.deepEqual(base.snapshot().objects.map((entry) => entry.receiptId), ["receipt-later", "receipt-orphan"]);
  assert.deepEqual(base.snapshot().receipts.map((entry) => entry.receipt.receiptId), ["receipt-later"]);
});

async function previewSetup(failurePlan) {
  const owners = ownerService();
  const issuedOwner = await ownerContext(owners);
  const { base, adapters } = controlled({
    receipts: [{ receipt: receipt("receipt-preview", issuedOwner.ownerId) }],
    failurePlan,
    now: "2026-08-14T12:00:00.000Z",
    previewExpiry,
  });
  await base.objectStore.putPrivateObject({
    receiptId: "receipt-preview",
    content: { contentType: "image/png", bytes: (async function* values() { yield png(); }()) },
  });
  const safeEvents = events();
  const handler = createCustomerUploadPreviewHttpHandler({
    ownerService: owners,
    createReceiptRepository: () => adapters.receiptRepository,
    createPreviewAccess: () => adapters.previewAccess,
    createObjectStore: () => adapters.objectStore,
    now: () => "2026-08-14T12:00:00.000Z",
    observability: safeEvents.observability,
  });
  return { base, adapters, context: issuedOwner.context, handler, safeEvents };
}

test("preview authorization source failure and throw are safe and do not reach object read", async () => {
  for (const action of ["source_failure", "throw"]) {
    const setup = await previewSetup({ previewAuthorize: [action] });
    const response = await setup.handler(previewRequest(setup.context, "receipt-preview"));
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "Customer input preview is temporarily unavailable." });
    assert.deepEqual(setup.adapters.snapshot().calls, { objectPut: 0, receiptCreate: 0, previewAuthorize: 1, objectRead: 0, objectDelete: 0 });
    assert.deepEqual(setup.safeEvents.recorded.map(({ event, operation, category }) => ({ event, operation, category })), [{ event: "customer_input_failure", operation: "preview", category: "temporary_failure" }]);
  }
});

test("preview read source failure and hostile throw are safe, contain no bytes/diagnostics, and leave receipt state unchanged", async () => {
  for (const action of ["source_failure", "throw_hostile"]) {
    const setup = await previewSetup({ objectRead: [action] });
    const response = await setup.handler(previewRequest(setup.context, "receipt-preview"));
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.deepEqual(body, { error: "Customer input preview is temporarily unavailable." });
    assertNoHostileMarker(body);
    assertNoHostileMarker([...response.headers.entries()]);
    assertNoHostileMarker(setup.safeEvents.recorded);
    assert.equal(setup.adapters.snapshot().calls.objectRead, 1);
    assert.equal(setup.base.snapshot().receipts[0].receipt.lifecycle, "active");
  }
});

test("preview read retry passes unchanged state after an initial deterministic failure", async () => {
  const setup = await previewSetup({ objectRead: ["source_failure", "pass"] });
  const first = await setup.handler(previewRequest(setup.context, "receipt-preview"));
  assert.equal(first.status, 503);
  const second = await setup.handler(previewRequest(setup.context, "receipt-preview"));
  assert.equal(second.status, 200);
  assert.equal(second.headers.get("content-type"), "image/png");
  assert.equal(setup.adapters.snapshot().calls.objectRead, 2);
  assert.equal(setup.base.snapshot().receipts[0].receipt.lifecycle, "active");
});

async function cleanupSetup(failurePlan, attached = false) {
  const { base, adapters } = controlled({
    receipts: [{ receipt: receipt("receipt-cleanup", "owner-a", { lifecycle: attached ? "active" : "removed" }), ...(attached ? { attachment: { attachmentId: "order-a" } } : {}) }],
    failurePlan,
  });
  await base.objectStore.putPrivateObject({
    receiptId: "receipt-cleanup",
    content: { contentType: "image/png", bytes: (async function* values() { yield png(); }()) },
  });
  return { base, adapters, service: new CustomerUploadLifecycleService(adapters.receiptRepository, adapters.objectStore) };
}

test("cleanup delete source failure and throw become cleanup_failed, retain the object, and never complete", async () => {
  for (const action of ["source_failure", "throw"]) {
    const setup = await cleanupSetup({ objectDelete: [action] });
    const result = await setup.service.runCustomerUploadCleanup({ observedAt, limit: 1, operationId: `cleanup-${action}` });
    assert.deepEqual(result, { status: "claimed", attempts: [{ status: "failed", receiptId: "receipt-cleanup" }] });
    assert.equal(setup.base.snapshot().receipts[0].receipt.lifecycle, "cleanup_failed");
    assert.deepEqual(setup.base.snapshot().objects.map((entry) => entry.receiptId), ["receipt-cleanup"]);
    assert.equal(setup.adapters.snapshot().calls.objectDelete, 1);
  }
});

test("cleanup retry transitions cleanup_failed through a new claim to cleanup_completed after delete succeeds", async () => {
  const setup = await cleanupSetup({ objectDelete: ["source_failure", "pass"] });
  const first = await setup.service.runCustomerUploadCleanup({ observedAt, limit: 1, operationId: "cleanup-first" });
  assert.deepEqual(first, { status: "claimed", attempts: [{ status: "failed", receiptId: "receipt-cleanup" }] });
  assert.equal(setup.base.snapshot().receipts[0].receipt.lifecycle, "cleanup_failed");
  const second = await setup.service.runCustomerUploadCleanup({ observedAt, limit: 1, operationId: "cleanup-second" });
  assert.deepEqual(second, { status: "claimed", attempts: [{ status: "completed", receiptId: "receipt-cleanup" }] });
  assert.equal(setup.base.snapshot().receipts[0].receipt.lifecycle, "cleanup_completed");
  assert.deepEqual(setup.base.snapshot().objects, []);
});

test("already absent cleanup completes under the approved internal policy, while attached content is excluded before delete failpoints", async () => {
  const absent = await cleanupSetup();
  assert.equal((await absent.base.objectStore.deletePrivateObject("receipt-cleanup")).status, "deleted");
  const absentResult = await absent.service.runCustomerUploadCleanup({ observedAt, limit: 1, operationId: "cleanup-absent" });
  assert.deepEqual(absentResult, { status: "claimed", attempts: [{ status: "completed", receiptId: "receipt-cleanup" }] });
  assert.equal(absent.base.snapshot().receipts[0].receipt.lifecycle, "cleanup_completed");
  assert.equal(absent.adapters.snapshot().calls.objectDelete, 1);
  assert.deepEqual(absent.adapters.snapshot().remaining.objectDelete, []);

  const attached = await cleanupSetup({ objectDelete: ["source_failure"] }, true);
  const attachedResult = await attached.service.runCustomerUploadCleanup({ observedAt, limit: 1, operationId: "cleanup-attached" });
  assert.deepEqual(attachedResult, { status: "claimed", attempts: [] });
  assert.equal(attached.base.snapshot().receipts[0].receipt.lifecycle, "active");
  assert.equal(attached.adapters.snapshot().calls.objectDelete, 0);
  assert.deepEqual(attached.adapters.snapshot().remaining.objectDelete, ["source_failure"]);
});

test("hostile controlled upload throw remains safe through the HTTP boundary without raw event diagnostics", async () => {
  const { adapters } = controlled({ failurePlan: { objectPut: ["throw_hostile"] } });
  const owners = ownerService();
  const safeEvents = events();
  const handler = createCustomerUploadHttpHandler({
    ownerService: owners,
    async resolveFieldConstraints() { return { status: "found", constraints }; },
    createAcceptanceDependencies() {
      return acceptanceDependencies(adapters, ["receipt-hostile"]);
    },
    observability: safeEvents.observability,
    runtimeMode: "development",
  });
  const response = await handler(uploadRequest());
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.deepEqual(body, { error: "Customer upload is temporarily unavailable." });
  assertNoHostileMarker(body);
  assertNoHostileMarker([...response.headers.entries()]);
  assertNoHostileMarker(safeEvents.recorded);
  assert.deepEqual(safeEvents.recorded.map(({ event, operation, category }) => ({ event, operation, category })), [{ event: "customer_input_failure", operation: "upload", category: "temporary_failure" }]);
});

test("Task 6.2 controls remain test-only, provider-neutral, closed, and absent from production route composition", async () => {
  const [control, uploadRoute, previewRoute] = await Promise.all([
    readFile(new URL("../app/testing/customer-upload-failure-controls.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/uploads/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/customer-uploads/preview/route.ts", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(control, /@supabase\/supabase-js|SUPABASE_UPLOAD_BUCKET|R2Bucket|S3Client|createSignedUrl|fetch\(|process\.env|Record<string, unknown>|nextResult|arbitrary callback|operation ledger/i);
  assert.doesNotMatch(`${uploadRoute}\n${previewRoute}`, /customer-upload-fakes|customer-upload-failure-controls|DeterministicInMemoryCustomerUpload|createControlledCustomerUploadAdapters/i);
});
