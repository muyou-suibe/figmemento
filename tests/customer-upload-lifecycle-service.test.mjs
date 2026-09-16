import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { CustomerUploadLifecycleService } from "../app/application/customer-upload-lifecycle-service.ts";

const now = "2026-08-14T12:00:00.000Z";

function receipt(id, lifecycle = "active") {
  return {
    receiptId: id,
    contentType: "image/png",
    byteSize: 20,
    dimensions: { width: 200, height: 200 },
    createdAt: "2026-08-13T12:00:00.000Z",
    expiresAt: now,
    lifecycle,
  };
}

/** Narrow Task 5.6 model, not the reusable Task 6.1 fake adapter. */
function model(seed, options = {}) {
  const entries = new Map(seed.map((entry) => [entry.receipt.receiptId, {
    receipt: structuredClone(entry.receipt), ownerId: entry.ownerId, attachmentId: entry.attachmentId,
    replacementId: entry.replacementId, operations: new Map(),
  }]));
  const calls = [];
  const replay = (entry, operationId, command) => {
    const previous = entry.operations.get(operationId);
    if (!previous) return false;
    return previous === JSON.stringify(command) ? true : "conflict";
  };
  const record = (entry, operationId, command) => entry.operations.set(operationId, JSON.stringify(command));
  const repository = {
    async replaceOwnedReceipt(input) {
      calls.push("replace");
      const original = entries.get(input.receiptId);
      const replacement = entries.get(input.replacementReceiptId);
      if (!original || !replacement || original.ownerId !== input.ownerId || replacement.ownerId !== input.ownerId) return { status: "not_found" };
      const replayed = replay(original, input.operationId, { kind: "replace", replacementReceiptId: input.replacementReceiptId });
      if (replayed === true) return { status: "changed", value: structuredClone(original.receipt) };
      if (replayed === "conflict" || input.receiptId === input.replacementReceiptId || original.receipt.lifecycle !== "active" || replacement.receipt.lifecycle !== "active" || original.attachmentId) return { status: "invalid_state", lifecycle: original.receipt.lifecycle };
      original.receipt.lifecycle = "replaced";
      original.replacementId = input.replacementReceiptId;
      record(original, input.operationId, { kind: "replace", replacementReceiptId: input.replacementReceiptId });
      return { status: "changed", value: structuredClone(original.receipt) };
    },
    async removeOwnedReceipt(input) {
      calls.push("remove");
      const entry = entries.get(input.receiptId);
      if (!entry || entry.ownerId !== input.ownerId) return { status: "not_found" };
      const replayed = replay(entry, input.operationId, { kind: "remove" });
      if (replayed === true) return { status: "changed", value: structuredClone(entry.receipt) };
      if (replayed === "conflict" || entry.attachmentId || entry.receipt.lifecycle !== "active") return { status: "invalid_state", lifecycle: entry.receipt.lifecycle };
      entry.receipt.lifecycle = "removed";
      record(entry, input.operationId, { kind: "remove" });
      return { status: "changed", value: structuredClone(entry.receipt) };
    },
    async attachOwnedReceiptOnce(input) {
      calls.push("attach");
      const entry = entries.get(input.receiptId);
      if (!entry || entry.ownerId !== input.ownerId) return { status: "not_found" };
      const replayed = replay(entry, input.operationId, { kind: "attach", attachmentId: input.attachment.attachmentId });
      if (replayed === true) return { status: "attached", value: structuredClone(entry.receipt) };
      if (replayed === "conflict" || entry.receipt.lifecycle === "cleanup_pending" || entry.attachmentId || entry.receipt.lifecycle !== "active") return { status: "invalid_state", lifecycle: entry.receipt.lifecycle };
      entry.attachmentId = input.attachment.attachmentId;
      record(entry, input.operationId, { kind: "attach", attachmentId: input.attachment.attachmentId });
      return { status: "attached", value: structuredClone(entry.receipt) };
    },
    async expireReceipt(input) {
      calls.push("expire");
      const entry = entries.get(input.receiptId);
      if (!entry) return { status: "not_found" };
      const replayed = replay(entry, input.operationId, { kind: "expire", observedAt: input.observedAt });
      if (replayed === true) return { status: "changed", value: structuredClone(entry.receipt) };
      if (replayed === "conflict" || entry.attachmentId || entry.receipt.lifecycle !== "active" || input.observedAt < entry.receipt.expiresAt) return { status: "invalid_state", lifecycle: entry.receipt.lifecycle };
      entry.receipt.lifecycle = "expired";
      record(entry, input.operationId, { kind: "expire", observedAt: input.observedAt });
      return { status: "changed", value: structuredClone(entry.receipt) };
    },
    async claimReceiptsForCleanup(input) {
      calls.push("claim");
      const eligible = ["replaced", "removed", "expired", "cleanup_failed"];
      const claimed = [...entries.values()]
        .filter((entry) => !entry.attachmentId && eligible.includes(entry.receipt.lifecycle))
        .sort((left, right) => left.receipt.receiptId.localeCompare(right.receipt.receiptId))
        .slice(0, input.limit);
      for (const entry of claimed) entry.receipt.lifecycle = "cleanup_pending";
      return { status: "claimed", value: claimed.map((entry) => structuredClone(entry.receipt)) };
    },
    async completeReceiptCleanup(input) {
      calls.push("complete");
      const entry = entries.get(input.receiptId);
      if (!entry) return { status: "not_found" };
      if (entry.receipt.lifecycle !== "cleanup_pending") return { status: "invalid_state", lifecycle: entry.receipt.lifecycle };
      entry.receipt.lifecycle = "cleanup_completed";
      return { status: "changed", value: structuredClone(entry.receipt) };
    },
    async failReceiptCleanup(input) {
      calls.push("fail");
      const entry = entries.get(input.receiptId);
      if (!entry) return { status: "not_found" };
      if (entry.receipt.lifecycle !== "cleanup_pending") return { status: "invalid_state", lifecycle: entry.receipt.lifecycle };
      entry.receipt.lifecycle = "cleanup_failed";
      return { status: "changed", value: structuredClone(entry.receipt) };
    },
  };
  const objectStore = {
    async deletePrivateObject(receiptId) {
      calls.push(`delete:${receiptId}`);
      if (options.beforeDelete) await options.beforeDelete({ repository, entries, receiptId });
      if (options.deleteThrow) throw new Error("delete failure");
      return options.deleteResult ?? { status: "deleted", value: true };
    },
  };
  return { entries, calls, repository, objectStore };
}

function service(seed, options) {
  const setup = model(seed, options);
  return { ...setup, lifecycle: new CustomerUploadLifecycleService(setup.repository, setup.objectStore) };
}

function serviceWithRepositoryResult(method, result) {
  const repository = {
    async [method]() {
      return result;
    },
  };
  return new CustomerUploadLifecycleService(repository, {
    async deletePrivateObject() {
      return { status: "deleted", value: true };
    },
  });
}

test("replace is atomic/replay-safe metadata transition with no eager object deletion", async () => {
  const setup = service([{ receipt: receipt("r1"), ownerId: "owner-a" }, { receipt: receipt("r2"), ownerId: "owner-a" }, { receipt: receipt("r3"), ownerId: "owner-a" }]);
  const first = await setup.lifecycle.replaceCustomerUpload({ verifiedOwnerId: "owner-a", receiptId: "r1", replacementReceiptId: "r2", operationId: "op-replace" });
  const replay = await setup.lifecycle.replaceCustomerUpload({ verifiedOwnerId: "owner-a", receiptId: "r1", replacementReceiptId: "r2", operationId: "op-replace" });
  const conflict = await setup.lifecycle.replaceCustomerUpload({ verifiedOwnerId: "owner-a", receiptId: "r1", replacementReceiptId: "r3", operationId: "op-replace" });
  const self = await setup.lifecycle.replaceCustomerUpload({ verifiedOwnerId: "owner-a", receiptId: "r2", replacementReceiptId: "r2", operationId: "op-self" });
  assert.equal(first.status, "changed");
  assert.equal(replay.status, "changed");
  assert.deepEqual(conflict, { status: "invalid_state" });
  assert.deepEqual(self, { status: "invalid_state" });
  assert.equal(setup.entries.get("r1").receipt.lifecycle, "replaced");
  assert.equal(setup.entries.get("r2").receipt.lifecycle, "active");
  assert.equal(setup.calls.some((call) => call.startsWith("delete:")), false);
  const crossOwner = await setup.lifecycle.replaceCustomerUpload({ verifiedOwnerId: "owner-b", receiptId: "r1", replacementReceiptId: "r2", operationId: "op-cross" });
  assert.deepEqual(crossOwner, { status: "not_found" });
});

test("remove is active-to-removed replay-safe metadata only and attached content is protected", async () => {
  const setup = service([{ receipt: receipt("r1"), ownerId: "owner-a" }, { receipt: receipt("attached"), ownerId: "owner-a", attachmentId: "order-a" }]);
  assert.equal((await setup.lifecycle.removeCustomerUpload({ verifiedOwnerId: "owner-a", receiptId: "r1", operationId: "op-remove" })).status, "changed");
  assert.equal((await setup.lifecycle.removeCustomerUpload({ verifiedOwnerId: "owner-a", receiptId: "r1", operationId: "op-remove" })).status, "changed");
  assert.deepEqual(await setup.lifecycle.removeCustomerUpload({ verifiedOwnerId: "owner-a", receiptId: "attached", operationId: "op-attached" }), { status: "invalid_state" });
  assert.deepEqual(await setup.lifecycle.removeCustomerUpload({ verifiedOwnerId: "owner-b", receiptId: "r1", operationId: "op-cross" }), { status: "not_found" });
  assert.equal(setup.calls.some((call) => call.startsWith("delete:")), false);
});

test("attach-once replays only the same target, conflicts on a different target, and cannot attach cleanup_pending", async () => {
  const setup = service([{ receipt: receipt("r1"), ownerId: "owner-a" }, { receipt: receipt("pending", "cleanup_pending"), ownerId: "owner-a" }]);
  const first = await setup.lifecycle.attachCustomerUploadOnce({ verifiedOwnerId: "owner-a", receiptId: "r1", attachment: { attachmentId: "order-a" }, operationId: "op-attach" });
  const replay = await setup.lifecycle.attachCustomerUploadOnce({ verifiedOwnerId: "owner-a", receiptId: "r1", attachment: { attachmentId: "order-a" }, operationId: "op-attach" });
  const conflict = await setup.lifecycle.attachCustomerUploadOnce({ verifiedOwnerId: "owner-a", receiptId: "r1", attachment: { attachmentId: "order-b" }, operationId: "op-attach" });
  assert.equal(first.status, "attached");
  assert.equal(replay.status, "attached");
  assert.deepEqual(conflict, { status: "invalid_state" });
  assert.deepEqual(await setup.lifecycle.attachCustomerUploadOnce({ verifiedOwnerId: "owner-a", receiptId: "pending", attachment: { attachmentId: "order-a" }, operationId: "op-pending" }), { status: "invalid_state" });
  assert.deepEqual(await setup.lifecycle.attachCustomerUploadOnce({ verifiedOwnerId: "owner-b", receiptId: "r1", attachment: { attachmentId: "order-a" }, operationId: "op-cross" }), { status: "not_found" });
});

test("server-observed expiry is due-only and protects attached content", async () => {
  const setup = service([{ receipt: receipt("due"), ownerId: "owner-a" }, { receipt: receipt("attached"), ownerId: "owner-a", attachmentId: "order-a" }]);
  assert.equal((await setup.lifecycle.expireCustomerUpload({ receiptId: "due", observedAt: now, operationId: "op-expire" })).status, "changed");
  assert.deepEqual(await setup.lifecycle.expireCustomerUpload({ receiptId: "attached", observedAt: now, operationId: "op-attached" }), { status: "invalid_state" });
  const early = service([{ receipt: receipt("early"), ownerId: "owner-a" }]);
  assert.deepEqual(await early.lifecycle.expireCustomerUpload({ receiptId: "early", observedAt: "2026-08-14T11:59:59.000Z", operationId: "op-early" }), { status: "invalid_state" });
});

test("each lifecycle command accepts only its explicit repository success status", async () => {
  const unexpectedAttached = { status: "attached", value: receipt("r1") };
  const unexpectedChanged = { status: "changed", value: receipt("r1") };

  assert.deepEqual(await serviceWithRepositoryResult("replaceOwnedReceipt", unexpectedAttached).replaceCustomerUpload({
    verifiedOwnerId: "owner-a", receiptId: "r1", replacementReceiptId: "r2", operationId: "op-replace",
  }), { status: "source_failure" });
  assert.deepEqual(await serviceWithRepositoryResult("removeOwnedReceipt", unexpectedAttached).removeCustomerUpload({
    verifiedOwnerId: "owner-a", receiptId: "r1", operationId: "op-remove",
  }), { status: "source_failure" });
  assert.deepEqual(await serviceWithRepositoryResult("expireReceipt", unexpectedAttached).expireCustomerUpload({
    receiptId: "r1", observedAt: now, operationId: "op-expire",
  }), { status: "source_failure" });
  assert.deepEqual(await serviceWithRepositoryResult("attachOwnedReceiptOnce", unexpectedChanged).attachCustomerUploadOnce({
    verifiedOwnerId: "owner-a", receiptId: "r1", attachment: { attachmentId: "order-a" }, operationId: "op-attach",
  }), { status: "source_failure" });
});

test("unrelated repository success statuses fail closed instead of becoming lifecycle success", async () => {
  for (const status of ["accepted", "found", "claimed"]) {
    const lifecycle = serviceWithRepositoryResult("replaceOwnedReceipt", { status, value: receipt("r1") });
    assert.deepEqual(await lifecycle.replaceCustomerUpload({
      verifiedOwnerId: "owner-a", receiptId: "r1", replacementReceiptId: "r2", operationId: `op-${status}`,
    }), { status: "source_failure" });
  }

  const cleanup = serviceWithRepositoryResult("claimReceiptsForCleanup", {
    status: "accepted",
    value: [],
  });
  assert.deepEqual(await cleanup.claimCustomerUploadCleanup({
    observedAt: now, limit: 1, operationId: "op-cleanup-accepted",
  }), { status: "source_failure" });
});

test("cleanup claim is the atomic lease: cleanup wins prevents attach and then deletes/completes", async () => {
  let setup;
  let attachDuringDelete;
  setup = service([{ receipt: receipt("r1", "removed"), ownerId: "owner-a" }], {
    beforeDelete: async () => {
      attachDuringDelete = await setup.lifecycle.attachCustomerUploadOnce({
        verifiedOwnerId: "owner-a",
        receiptId: "r1",
        attachment: { attachmentId: "order-a" },
        operationId: "op-racing-attach",
      });
    },
  });
  const result = await setup.lifecycle.runCustomerUploadCleanup({ observedAt: now, limit: 1, operationId: "op-cleanup" });
  assert.equal(result.status, "claimed");
  assert.equal(result.attempts[0].status, "completed");
  assert.equal(setup.entries.get("r1").receipt.lifecycle, "cleanup_completed");
  assert.deepEqual(attachDuringDelete, { status: "invalid_state" });
  assert.deepEqual(setup.calls, ["claim", "delete:r1", "attach", "complete"]);
});

test("attach wins prevents cleanup claim and object deletion", async () => {
  const setup = service([{ receipt: receipt("r1", "active"), ownerId: "owner-a" }]);
  assert.equal((await setup.lifecycle.attachCustomerUploadOnce({ verifiedOwnerId: "owner-a", receiptId: "r1", attachment: { attachmentId: "order-a" }, operationId: "op-attach" })).status, "attached");
  const result = await setup.lifecycle.runCustomerUploadCleanup({ observedAt: now, limit: 1, operationId: "op-cleanup" });
  assert.equal(result.status, "claimed");
  assert.deepEqual(result.attempts, []);
  assert.equal(setup.calls.some((call) => call.startsWith("delete:")), false);
});

test("cleanup handles eligible states, bounded limits, internal absent object success, failure, and retry", async () => {
  const setup = service([
    { receipt: receipt("a", "replaced"), ownerId: "owner-a" }, { receipt: receipt("b", "removed"), ownerId: "owner-a" },
    { receipt: receipt("c", "expired"), ownerId: "owner-a" }, { receipt: receipt("d", "cleanup_failed"), ownerId: "owner-a" },
    { receipt: receipt("active"), ownerId: "owner-a" }, { receipt: receipt("done", "cleanup_completed"), ownerId: "owner-a" },
    { receipt: receipt("attached", "removed"), ownerId: "owner-a", attachmentId: "order-a" },
  ], { deleteResult: { status: "not_found" } });
  const result = await setup.lifecycle.runCustomerUploadCleanup({ observedAt: now, limit: 2, operationId: "op-clean" });
  assert.equal(result.status, "claimed");
  assert.equal(result.attempts.length, 2);
  assert.equal(result.attempts.every((attempt) => attempt.status === "completed"), true);
  assert.equal(setup.entries.get("active").receipt.lifecycle, "active");
  assert.equal(setup.entries.get("attached").receipt.lifecycle, "removed");
  assert.equal(setup.entries.get("done").receipt.lifecycle, "cleanup_completed");

  const failed = service([{ receipt: receipt("retry", "removed"), ownerId: "owner-a" }], { deleteThrow: true });
  const first = await failed.lifecycle.runCustomerUploadCleanup({ observedAt: now, limit: 1, operationId: "op-fail" });
  assert.equal(first.attempts[0].status, "failed");
  assert.equal(failed.entries.get("retry").receipt.lifecycle, "cleanup_failed");
  failed.objectStore.deletePrivateObject = async (receiptId) => { failed.calls.push(`delete:${receiptId}`); return { status: "deleted", value: true }; };
  const retry = await failed.lifecycle.runCustomerUploadCleanup({ observedAt: now, limit: 1, operationId: "op-retry" });
  assert.equal(retry.attempts[0].status, "completed");
  assert.equal(failed.entries.get("retry").receipt.lifecycle, "cleanup_completed");
});

test("Task 5.6 services use explicit ports without provider, legacy, arbitrary lifecycle, or exact-once drift", async () => {
  const [serviceSource, repositorySource] = await Promise.all([
    readFile(new URL("../app/application/customer-upload-lifecycle-service.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/application/customer-upload-repository.ts", import.meta.url), "utf8"),
  ]);
  const source = `${serviceSource}\n${repositorySource}`;
  assert.doesNotMatch(source, /@supabase\/supabase-js|SUPABASE_UPLOAD_BUCKET|R2Bucket|S3Client|storageKey|objectKey|signedUrl|ProductAsset|priceCents|skuCode/i);
  assert.doesNotMatch(source, /setLifecycle|updateReceipt|exactly-once|operation ledger/i);
  assert.match(repositorySource, /must compete atomically with cleanup claims/);
  assert.match(repositorySource, /Atomic bounded cleanup lease claim/);
  assert.doesNotMatch(serviceSource, /findOwnedReceipt|readPrivateObject|inspectPrivateObject/);
});
