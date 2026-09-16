import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createCustomerInputSafeObservability } from "../app/server/customer-input-safe-failure.server.ts";
import { createCustomerUploadHttpHandler } from "../app/server/customer-upload-http-handler.server.ts";
import { createCustomerUploadPreviewHttpHandler } from "../app/server/customer-upload-preview-handler.server.ts";
import { createGuestDraftOwnerService, getGuestDraftOwnerCookieName } from "../app/lib/guest-draft-owner.ts";

const origin = "https://photogift.test";
const markers = [
  "CUSTOMIZATION_TEXT_SECRET",
  "portrait-secret.png",
  "COOKIE_SECRET",
  "OWNER_CONTEXT_SECRET",
  "SIGNATURE_SECRET",
  "BEARER_TOKEN_SECRET",
  "bucket=private-media",
  "storageKey=drafts/secret.png",
  "objectKey=object-secret",
  "signedUrl=https://provider.test/signed-secret",
  "SUPABASE_SERVICE_ROLE_KEY_SECRET",
  "SQLSTATE 23505",
  "constraint_secret",
  "table_secret",
  "DETAIL secret-detail",
  "HINT secret-hint",
  "SELECT * FROM secret_table",
  "provider-response-secret",
  "NESTED_CAUSE_SECRET",
  "STACK_SECRET",
  "BINARY_SECRET_MARKER",
];

function hostileError() {
  const error = new Error(markers.join(" | "));
  error.name = "provider-response-secret";
  error.cause = { diagnostic: markers.join(" | ") };
  error.stack = `STACK_SECRET ${markers.join(" | ")}`;
  return error;
}

function ownerService() {
  let next = 0;
  return createGuestDraftOwnerService({
    signingSecret: "offline-safe-error-owner-secret-material-1234567890",
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

function eventRecorder() {
  const events = [];
  let next = 0;
  return {
    events,
    observability: createCustomerInputSafeObservability({
      createCorrelationId: () => `correlation-${++next}`,
      sink: { record(event) { events.push(event); } },
    }),
  };
}

function formRequest({ context, authorization = "Bearer BEARER_TOKEN_SECRET" } = {}) {
  const form = new FormData();
  form.append("file", new File([new TextEncoder().encode("BINARY_SECRET_MARKER")], "portrait-secret.png", { type: "image/png" }));
  return new Request(`${origin}/api/uploads`, {
    method: "POST",
    body: form,
    headers: {
      origin,
      "sec-fetch-site": "same-origin",
      authorization,
      "x-owner-context": "OWNER_CONTEXT_SECRET",
      cookie: context
        ? `${getGuestDraftOwnerCookieName()}=${encodeURIComponent(context)}; sensitive=COOKIE_SECRET`
        : "sensitive=COOKIE_SECRET",
    },
  });
}

function previewRequest(context, receiptId = "receipt-safe") {
  return new Request(`${origin}/api/customer-uploads/preview?receiptId=${encodeURIComponent(receiptId)}`, {
    headers: {
      authorization: "Bearer BEARER_TOKEN_SECRET",
      "x-owner-context": "OWNER_CONTEXT_SECRET",
      cookie: `${getGuestDraftOwnerCookieName()}=${encodeURIComponent(context)}; sensitive=COOKIE_SECRET`,
    },
  });
}

function constraints() {
  return {
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
    maxBytes: 1_024,
    minDimensions: { width: 1, height: 1 },
    minImageCount: 1,
    maxImageCount: 1,
    cropEnabled: false,
  };
}

function assertNoMarker(value) {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  for (const marker of markers) assert.doesNotMatch(serialized, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

async function issueContext(owners) {
  const issued = await owners.issueGuestDraftOwner();
  assert.equal(issued.status, "issued");
  return issued.value.context;
}

test("safe observability uses a closed server-generated event with no metadata escape hatch", () => {
  const { events, observability } = eventRecorder();
  observability.record("upload", "temporary_failure");
  assert.deepEqual(events, [{
    event: "customer_input_failure",
    operation: "upload",
    category: "temporary_failure",
    correlationId: "correlation-1",
  }]);
  assert.deepEqual(Object.keys(events[0]).sort(), ["category", "correlationId", "event", "operation"]);
  assertNoMarker(events);
});

test("upload exception and hostile validation messages produce fixed public output and safe events only", async () => {
  const owners = ownerService();
  const { events, observability } = eventRecorder();
  const handler = createCustomerUploadHttpHandler({
    ownerService: owners,
    async resolveFieldConstraints() { return { status: "found", constraints: constraints() }; },
    createAcceptanceDependencies() { throw hostileError(); },
    async acceptImageUpload() { throw hostileError(); },
    observability,
    runtimeMode: "development",
  });
  const response = await handler(formRequest());
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.deepEqual(body, { error: "Customer upload is temporarily unavailable." });
  assertNoMarker(body);
  assertNoMarker([...response.headers.entries()]);
  assert.deepEqual(events, [{ event: "customer_input_failure", operation: "upload", category: "temporary_failure", correlationId: "correlation-1" }]);
  assertNoMarker(events);

  const rejectedEvents = eventRecorder();
  const rejectedHandler = createCustomerUploadHttpHandler({
    ownerService: ownerService(),
    async resolveFieldConstraints() { return { status: "found", constraints: constraints() }; },
    createAcceptanceDependencies() { return {}; },
    async acceptImageUpload() {
      return {
        status: "rejected",
        issues: [{ code: "too_large", message: markers.join(" ") }],
        warnings: [{ code: "declared_mime_mismatch", message: markers.join(" ") }],
      };
    },
    observability: rejectedEvents.observability,
    runtimeMode: "development",
  });
  const rejectedResponse = await rejectedHandler(formRequest());
  assert.equal(rejectedResponse.status, 400);
  assert.deepEqual(await rejectedResponse.json(), {
    issues: [{ code: "too_large", message: "Image byte size exceeds the configured maximum." }],
    warnings: [{ code: "declared_mime_mismatch", message: "Declared image type does not match the detected image bytes." }],
  });
  assert.deepEqual(rejectedEvents.events, [{ event: "customer_input_failure", operation: "upload", category: "upload_rejected", correlationId: "correlation-1" }]);
  assertNoMarker(rejectedEvents.events);
});

test("preview hostile provider failures are opaque, and cross-owner/nonexistent events remain equivalent", async () => {
  const owners = ownerService();
  const context = await issueContext(owners);
  const { events, observability } = eventRecorder();
  const handler = createCustomerUploadPreviewHttpHandler({
    ownerService: owners,
    createReceiptRepository() {
      return { async findOwnedReceipt() { return { status: "found", value: {
        receiptId: "receipt-safe", contentType: "image/png", byteSize: 1, dimensions: { width: 1, height: 1 },
        createdAt: "2026-08-13T00:00:00.000Z", expiresAt: "2026-08-13T12:10:00.000Z", lifecycle: "active",
      } }; } };
    },
    createPreviewAccess() { return { async authorizeCustomerInputPreview() { throw hostileError(); } }; },
    createObjectStore() { throw hostileError(); },
    now: () => "2026-08-13T12:00:00.000Z",
    observability,
  });
  const response = await handler(previewRequest(context));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "Customer input preview is temporarily unavailable." });
  assertNoMarker([...response.headers.entries()]);
  assert.deepEqual(events, [{ event: "customer_input_failure", operation: "preview", category: "temporary_failure", correlationId: "correlation-1" }]);
  assertNoMarker(events);

  const missing = eventRecorder();
  const missingHandler = createCustomerUploadPreviewHttpHandler({
    ownerService: owners,
    createReceiptRepository() { return { async findOwnedReceipt() { return { status: "not_found" }; } }; },
    createPreviewAccess() { throw hostileError(); },
    createObjectStore() { throw hostileError(); },
    now: () => "2026-08-13T12:00:00.000Z",
    observability: missing.observability,
  });
  const crossOwner = eventRecorder();
  const crossOwnerHandler = createCustomerUploadPreviewHttpHandler({
    ownerService: owners,
    createReceiptRepository() { return { async findOwnedReceipt() { return { status: "not_found" }; } }; },
    createPreviewAccess() { throw hostileError(); },
    createObjectStore() { throw hostileError(); },
    now: () => "2026-08-13T12:00:00.000Z",
    observability: crossOwner.observability,
  });
  for (const preview of [missingHandler, crossOwnerHandler]) {
    const unavailable = await preview(previewRequest(context));
    assert.equal(unavailable.status, 404);
    assert.deepEqual(await unavailable.json(), { error: "Customer input preview is unavailable." });
  }
  const normalize = ({ event, operation, category }) => ({ event, operation, category });
  assert.deepEqual(missing.events.map(normalize), crossOwner.events.map(normalize));
  assert.deepEqual(missing.events.map(normalize), [{ event: "customer_input_failure", operation: "preview", category: "not_found" }]);
});

test("new customer-input boundaries contain no raw-error logger or arbitrary safe-event fields", async () => {
  const files = await Promise.all([
    readFile(new URL("../app/server/customer-input-safe-failure.server.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/server/customer-upload-http-handler.server.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/server/customer-upload-preview-handler.server.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/server/customer-upload-ownership.server.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/application/customer-upload-acceptance-service.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/application/customer-upload-lifecycle-service.ts", import.meta.url), "utf8"),
  ]);
  const source = files.join("\n");
  assert.doesNotMatch(source, /console\.(?:log|info|warn|error)\s*\(/);
  assert.doesNotMatch(source, /JSON\.stringify\s*\([^)]*(?:error|request|receipt|file|body)/i);
  assert.doesNotMatch(source, /String\s*\([^)]*(?:error|request|receipt|file|body)/i);
  assert.doesNotMatch(source, /error\.(?:message|stack|cause)/);
  const safeModule = files[0];
  assert.doesNotMatch(safeModule, /metadata\s*:|context\s*:|Record<string, unknown>/);
  for (const forbiddenField of [
    "cookie", "token", "signature", "secret", "authorization", "password", "credential", "bucket", "storageKey", "objectKey", "signedUrl", "path", "query", "sql", "hint", "detail", "customization", "text", "filename", "bytes", "file", "request", "headers", "ownerId", "receiptId",
  ]) {
    assert.doesNotMatch(safeModule, new RegExp(`readonly\\s+${forbiddenField}\\s*:`));
  }
});
