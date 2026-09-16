import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  applyCurrentProductCustomizationImageSlotOperation,
  isCurrentProductCustomizationAsyncRevision,
  isCurrentProductCustomizationImageSlotSelection,
} from "../app/application/product-customization-image-async-fencing.ts";

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function slot(slotId, generation, operationId, extra = {}) {
  return { slotId, selectionGeneration: generation, activeOperationId: operationId, ...extra };
}

async function applyDeferred(state, operation, pending, update) {
  const result = await pending;
  const applied = applyCurrentProductCustomizationImageSlotOperation({
    slots: state.current,
    operation,
    update: (current) => ({ ...current, ...update(result), activeOperationId: null }),
  });
  state.current = applied.slots;
  return applied.applied;
}

test("Task 10.2 two independent slots accept reverse-order upload completion", async () => {
  const state = { current: [slot("a", 1, "upload-a"), slot("b", 1, "upload-b")] };
  const a = deferred();
  const b = deferred();
  const aResult = applyDeferred(state, { slotId: "a", selectionGeneration: 1, operationId: "upload-a" }, a.promise, (receipt) => ({ receipt }));
  const bResult = applyDeferred(state, { slotId: "b", selectionGeneration: 1, operationId: "upload-b" }, b.promise, (receipt) => ({ receipt }));
  b.resolve("receipt-b");
  assert.equal(await bResult, true);
  a.resolve("receipt-a");
  assert.equal(await aResult, true);
  assert.deepEqual(state.current.map(({ slotId, receipt }) => [slotId, receipt]), [["a", "receipt-a"], ["b", "receipt-b"]]);
});

test("Task 10.2 reorder while pending preserves slot identity and completion target", async () => {
  const state = { current: [slot("a", 2, "upload-a"), slot("b", 3, "upload-b")] };
  const pending = deferred();
  const completion = applyDeferred(state, { slotId: "a", selectionGeneration: 2, operationId: "upload-a" }, pending.promise, (receipt) => ({ receipt }));
  state.current = state.current.slice().reverse();
  pending.resolve("receipt-a");
  assert.equal(await completion, true);
  assert.deepEqual(state.current.map(({ slotId, receipt }) => [slotId, receipt]), [["b", undefined], ["a", "receipt-a"]]);
});

test("Task 10.2 removal makes late success unable to resurrect a slot", async () => {
  const state = { current: [slot("a", 1, "upload-a"), slot("b", 1, null)] };
  const pending = deferred();
  const completion = applyDeferred(state, { slotId: "a", selectionGeneration: 1, operationId: "upload-a" }, pending.promise, (receipt) => ({ receipt }));
  state.current = state.current.filter((entry) => entry.slotId !== "a");
  pending.resolve("late-receipt");
  assert.equal(await completion, false);
  assert.deepEqual(state.current.map((entry) => entry.slotId), ["b"]);
});

test("Task 10.2 removal or cancellation makes late failure unable to create ghost error", async () => {
  const state = { current: [slot("a", 1, "upload-a"), slot("b", 1, null)] };
  const pending = deferred();
  const completion = applyDeferred(state, { slotId: "a", selectionGeneration: 1, operationId: "upload-a" }, pending.promise, (error) => ({ error }));
  state.current = [slot("b", 1, null)];
  pending.resolve("late-failure");
  assert.equal(await completion, false);
  assert.equal(state.current.some((entry) => "error" in entry), false);
});

test("Task 10.2 per-slot cancellation fences a late result without removing the slot", async () => {
  const state = { current: [slot("a", 1, "upload-a", { status: "uploading" })] };
  const pending = deferred();
  const completion = applyDeferred(state, { slotId: "a", selectionGeneration: 1, operationId: "upload-a" }, pending.promise, (receipt) => ({ receipt }));
  state.current = [slot("a", 1, null, { status: "ready" })];
  pending.resolve("late-receipt");
  assert.equal(await completion, false);
  assert.equal(state.current[0].receipt, undefined);
  assert.equal(state.current[0].status, "ready");
});

test("Task 10.2 replacement generation fences old upload success", async () => {
  const state = { current: [slot("a", 1, "old-upload")] };
  const pending = deferred();
  const completion = applyDeferred(state, { slotId: "a", selectionGeneration: 1, operationId: "old-upload" }, pending.promise, (receipt) => ({ receipt }));
  state.current = [slot("a", 2, "new-upload", { receipt: "new-receipt" })];
  pending.resolve("old-receipt");
  assert.equal(await completion, false);
  assert.equal(state.current[0].receipt, "new-receipt");
});

test("Task 10.2 replacement generation fences old upload failure", async () => {
  const state = { current: [slot("a", 1, "old-upload")] };
  const pending = deferred();
  const completion = applyDeferred(state, { slotId: "a", selectionGeneration: 1, operationId: "old-upload" }, pending.promise, (error) => ({ error }));
  state.current = [slot("a", 2, null, { status: "ready" })];
  pending.resolve("old-failure");
  assert.equal(await completion, false);
  assert.equal(state.current[0].error, undefined);
  assert.equal(state.current[0].status, "ready");
});

test("Task 10.2 old decode success and error are fenced by slot generation", () => {
  const current = [slot("a", 4, null)];
  assert.equal(isCurrentProductCustomizationImageSlotSelection(current, { slotId: "a", selectionGeneration: 3 }), false);
  assert.equal(isCurrentProductCustomizationImageSlotSelection(current, { slotId: "a", selectionGeneration: 4 }), true);
  assert.equal(isCurrentProductCustomizationImageSlotSelection(current, { slotId: "b", selectionGeneration: 4 }), false);
});

test("Task 10.2 stale crop preview result cannot overwrite the newer revision", () => {
  assert.equal(isCurrentProductCustomizationAsyncRevision(8, 7), false);
  assert.equal(isCurrentProductCustomizationAsyncRevision(8, 8), true);
});

test("Task 10.2 stale draft save result cannot overwrite newer confirmed revision", () => {
  assert.equal(isCurrentProductCustomizationAsyncRevision(12, 11), false);
  assert.equal(isCurrentProductCustomizationAsyncRevision(12, 12), true);
  assert.equal(isCurrentProductCustomizationAsyncRevision(12, Number.NaN), false);
});

test("Task 10.2 slot fencing preserves unrelated image and non-image state", () => {
  const state = {
    current: [
      slot("a", 1, "upload-a", { receipt: null, crop: null }),
      slot("b", 5, null, { receipt: "receipt-b", crop: { x: 0, y: 0, width: 1, height: 1 } }),
    ],
    text: "engraving",
    variantId: "variant-authority",
    selectedOptions: { size: "large" },
    configurationRevision: 9,
  };
  const applied = applyCurrentProductCustomizationImageSlotOperation({
    slots: state.current,
    operation: { slotId: "a", selectionGeneration: 1, operationId: "upload-a" },
    update: (current) => ({ ...current, activeOperationId: null, receipt: "receipt-a" }),
  });
  assert.equal(applied.applied, true);
  assert.deepEqual(applied.slots[1], state.current[1]);
  assert.equal(state.text, "engraving");
  assert.equal(state.variantId, "variant-authority");
  assert.deepEqual(state.selectedOptions, { size: "large" });
  assert.equal(state.configurationRevision, 9);
});

test("Task 10.2 source uses per-slot correlation and retains durable draft CAS authority", async () => {
  const [component, draftAdapter, draftPort] = await Promise.all([
    readFile(new URL("../app/storefront/ProductCustomizationImageField.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/infrastructure/local-commerce/local-persistent-draft-adapter.server.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/application/local-commerce-draft-port.server.ts", import.meta.url), "utf8"),
  ]);
  assert.match(component, /ProductCustomizationImageSlotOperation/);
  assert.match(component, /isCurrentProductCustomizationImageSlotOperation\(slotsRef\.current, operation\)/);
  assert.match(component, /activeOperationId: operationId/);
  assert.match(component, /handleCancelUpload/);
  assert.match(component, /finishActiveSlotOperation\(removed\)/);
  assert.doesNotMatch(component, /fieldUploadInProgressRef|disabled=\{isFieldUploading/);
  assert.match(draftPort, /LocalCommerceCommandContext[\s\S]*save/);
  assert.match(draftAdapter, /p_expected_version: command\.expectedVersion/);
  assert.doesNotMatch(draftAdapter, /File|Blob|objectUrl|previewUrl|activeOperationId|selectionGeneration/);
});
