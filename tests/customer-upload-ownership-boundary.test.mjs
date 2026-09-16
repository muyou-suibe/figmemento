import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createGuestDraftOwnerService, getGuestDraftOwnerCookieName } from "../app/lib/guest-draft-owner.ts";
import {
  customerUploadProtectedBoundaryResponse,
  executeCustomerUploadProtectedReceiptOperation,
  parseCustomerUploadReceiptTarget,
} from "../app/server/customer-upload-ownership.server.ts";

const configuration = {
  signingSecret: "offline-owner-boundary-secret-material-1234567890",
  contextLifetimeSeconds: 3_600,
};

function dependencies(now = 1_700_000_000, options = {}) {
  let next = 0;
  const ownerService = options.ownerService ?? createGuestDraftOwnerService(configuration, {
    nowSeconds: () => now,
    randomBytes(byteLength) {
      const bytes = new Uint8Array(byteLength);
      for (let index = 0; index < byteLength; index += 1) bytes[index] = (next + index + 1) % 256;
      next += byteLength;
      return bytes;
    },
  });
  const calls = { receiptFactories: 0, receiptLookups: 0, objectFactories: 0, previewFactories: 0 };
  const found = options.found ?? { receiptId: "receipt-owned", contentType: "image/jpeg", byteSize: 20, dimensions: { width: 2, height: 2 }, createdAt: "2026-08-13T00:00:00.000Z", expiresAt: "2026-08-20T00:00:00.000Z", lifecycle: "active" };
  return {
    calls,
    ownerService,
    dependencies: {
      ownerService,
      createReceiptRepository() {
        calls.receiptFactories += 1;
        return {
          async findOwnedReceipt(receiptId, ownerId) {
            calls.receiptLookups += 1;
            if (options.repositoryFailure) return { status: "source_failure", operation: "customer_upload_receipt.lookup_owned" };
            if (options.notFound || receiptId !== "receipt-owned" || ownerId !== options.expectedOwnerId) return { status: "not_found" };
            return { status: "found", value: found };
          },
        };
      },
      createObjectStore() { calls.objectFactories += 1; return {}; },
      createPreviewAccess() { calls.previewFactories += 1; return {}; },
    },
  };
}

function request(context, origin = "https://photogift.test", method = "POST") {
  return new Request("https://photogift.test/api/customer-upload", {
    method,
    headers: {
      ...(context ? { cookie: `${getGuestDraftOwnerCookieName()}=${encodeURIComponent(context)}` } : {}),
      ...(method === "POST" ? { origin, "sec-fetch-site": origin === "https://photogift.test" ? "same-origin" : "cross-site" } : {}),
    },
  });
}

async function issueContext(service) {
  const issued = await service.issueGuestDraftOwner();
  assert.ok(issued.status === "issued");
  return issued.value;
}

test("missing, invalid, and expired customer owner context stop every protected category before privileged construction", async () => {
  for (const operation of ["preview", "replace", "remove", "attach", "customer_cleanup"]) {
    for (const kind of ["missing", "invalid", "expired"]) {
      const setup = dependencies(kind === "expired" ? 1_700_003_600 : 1_700_000_000);
      let context = null;
      if (kind === "invalid") context = "invalid.context";
      if (kind === "expired") {
        const issuer = dependencies(1_700_000_000);
        context = (await issueContext(issuer.ownerService)).context;
      }
      const result = await executeCustomerUploadProtectedReceiptOperation(
        request(context, "https://photogift.test", operation === "preview" ? "GET" : "POST"), operation, { receiptId: "receipt-owned" }, setup.dependencies,
        async () => { throw new Error("must not continue"); },
      );
      assert.deepEqual(result, { status: "not_found" }, `${operation}/${kind}`);
      assert.deepEqual(setup.calls, { receiptFactories: 0, receiptLookups: 0, objectFactories: 0, previewFactories: 0 }, `${operation}/${kind}`);
    }
  }
});

test("valid owner reaches owner-scoped receipt lookup before a lazy preview or object factory", async () => {
  for (const operation of ["preview", "replace", "remove", "attach", "customer_cleanup"]) {
    const setup = dependencies();
    const issued = await issueContext(setup.ownerService);
    setup.dependencies.createReceiptRepository = () => {
      setup.calls.receiptFactories += 1;
      return {
        async findOwnedReceipt(receiptId, ownerId) {
          setup.calls.receiptLookups += 1;
          assert.equal(receiptId, "receipt-owned");
          assert.equal(ownerId, issued.ownerId);
          return { status: "found", value: { receiptId, contentType: "image/jpeg", byteSize: 20, dimensions: { width: 2, height: 2 }, createdAt: "2026-08-13T00:00:00.000Z", expiresAt: "2026-08-20T00:00:00.000Z", lifecycle: "active" } };
        },
      };
    };
    const result = await executeCustomerUploadProtectedReceiptOperation(
      request(issued.context, "https://photogift.test", operation === "preview" ? "GET" : "POST"), operation, { receiptId: "receipt-owned" }, setup.dependencies,
      async ({ ownerId, receipt, createObjectStore, createPreviewAccess }) => {
        assert.equal(ownerId, issued.ownerId);
        assert.equal(receipt.receiptId, "receipt-owned");
        if (operation === "preview") createPreviewAccess();
        else createObjectStore();
        return operation;
      },
    );
    assert.deepEqual(result, { status: "continued", value: operation });
    assert.equal(setup.calls.receiptFactories, 1);
    assert.equal(setup.calls.receiptLookups, 1);
    assert.equal(setup.calls.previewFactories, operation === "preview" ? 1 : 0);
    assert.equal(setup.calls.objectFactories, operation === "preview" ? 0 : 1);
  }
});

test("cross-owner and genuinely absent receipts map to the same public result without provider construction", async () => {
  const absent = dependencies();
  const absentContext = await issueContext(absent.ownerService);
  const crossOwner = dependencies();
  const crossOwnerContext = await issueContext(crossOwner.ownerService);
  for (const setup of [absent, crossOwner]) setup.dependencies.createReceiptRepository = () => {
    setup.calls.receiptFactories += 1;
    return { async findOwnedReceipt() { setup.calls.receiptLookups += 1; return { status: "not_found" }; } };
  };
  const results = await Promise.all([absent, crossOwner].map((setup, index) => executeCustomerUploadProtectedReceiptOperation(
    request(index === 0 ? absentContext.context : crossOwnerContext.context), "preview", { receiptId: "receipt-owned" }, setup.dependencies,
    async () => { throw new Error("provider must not run"); },
  )));
  assert.deepEqual(results, [{ status: "not_found" }, { status: "not_found" }]);
  for (const setup of [absent, crossOwner]) {
    assert.equal(setup.calls.receiptFactories, 1);
    assert.equal(setup.calls.receiptLookups, 1);
    assert.equal(setup.calls.objectFactories, 0);
    assert.equal(setup.calls.previewFactories, 0);
  }
  const [first, second] = results.map(customerUploadProtectedBoundaryResponse);
  assert.equal(first.status, 404);
  assert.equal(second.status, 404);
  assert.deepEqual(await first.json(), await second.json());
});

test("malformed targets, cross-origin mutations, verifier failures, and lookup failures are safe and provider-free", async () => {
  const setup = dependencies();
  const issued = await issueContext(setup.ownerService);
  assert.equal(parseCustomerUploadReceiptTarget({ receiptId: "receipt-owned", ownerId: issued.ownerId }), null);
  assert.equal(parseCustomerUploadReceiptTarget({ receiptId: "bad receipt" }), null);
  for (const [operation, target, requestValue, expected] of [
    ["preview", { receiptId: "bad receipt" }, request(null, "https://photogift.test", "GET"), "not_found"],
    ["remove", { receiptId: "receipt-owned" }, request(issued.context, "https://attacker.test"), "forbidden"],
  ]) {
    const result = await executeCustomerUploadProtectedReceiptOperation(requestValue, operation, target, setup.dependencies, async () => "unexpected");
    assert.equal(result.status, expected);
  }
  assert.deepEqual(setup.calls, { receiptFactories: 0, receiptLookups: 0, objectFactories: 0, previewFactories: 0 });

  const verifierFailure = dependencies(1_700_000_000, { ownerService: { async verifyGuestDraftOwnerContext() { return { status: "source_failure" }; } } });
  const result = await executeCustomerUploadProtectedReceiptOperation(request(null, "preview", "GET"), "preview", { receiptId: "receipt-owned" }, verifierFailure.dependencies, async () => "unexpected");
  assert.deepEqual(result, { status: "source_failure" });
  assert.deepEqual(verifierFailure.calls, { receiptFactories: 0, receiptLookups: 0, objectFactories: 0, previewFactories: 0 });

  const lookupFailure = dependencies();
  const lookupContext = await issueContext(lookupFailure.ownerService);
  lookupFailure.dependencies.createReceiptRepository = () => ({ async findOwnedReceipt() { return { status: "source_failure", operation: "customer_upload_receipt.lookup_owned" }; } });
  const lookupResult = await executeCustomerUploadProtectedReceiptOperation(request(lookupContext.context, "preview", "GET"), "preview", { receiptId: "receipt-owned" }, lookupFailure.dependencies, async () => "unexpected");
  assert.deepEqual(lookupResult, { status: "source_failure" });
  assert.equal(lookupFailure.calls.objectFactories, 0);
  assert.equal(lookupFailure.calls.previewFactories, 0);
});

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
  }));
  return nested.flat();
}

test("new boundary remains server-only and the replaced browser upload route has no provider authority", async () => {
  const root = fileURLToPath(new URL("../app/", import.meta.url));
  const [boundary, legacyUpload, clientFiles] = await Promise.all([
    readFile(new URL("../app/server/customer-upload-ownership.server.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/uploads/route.ts", import.meta.url), "utf8"),
    sourceFiles(root),
  ]);
  for (const path of clientFiles) {
    const source = await readFile(path, "utf8");
    if (/^\s*["']use client["']/.test(source)) assert.doesNotMatch(source, /customer-upload-ownership|guest-draft-owner/);
  }
  assert.doesNotMatch(boundary, /@supabase\/supabase-js|SUPABASE_UPLOAD_BUCKET|R2Bucket|S3Client|ProductAsset|localStorage|sessionStorage|console\./);
  assert.doesNotMatch(boundary, /Response\.json\([^\n]*ownerId|JSON\.stringify/);
  assert.doesNotMatch(legacyUpload, /storageKey|getSupabaseServerClient|SUPABASE_UPLOAD_BUCKET|\.storage\./);
  assert.match(legacyUpload, /createCustomerUploadHttpHandler/);
});
