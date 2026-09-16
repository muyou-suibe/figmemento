import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  addProductCustomizationImageSlot,
  admitProductCustomizationImageFiles,
  canAddProductCustomizationImageSlot,
  createEmptyProductCustomizationImageSlot,
  hydrateProductCustomizationImageSlots,
  moveProductCustomizationImageSlot,
  removeProductCustomizationImageSlot,
  setProductCustomizationImageSlotReceipt,
  toOrderedProductCustomizationImageValue,
} from "../app/application/product-customization-image-slots.ts";
import {
  createImageUploadStartedActions,
  createRemovedImageSlotActions,
} from "../app/application/product-customization-image-upload-flow.ts";
import {
  createProductCustomizationDraft,
  reduceProductCustomizationDraft,
} from "../app/domain/product-customization-draft.ts";

function ids() {
  let value = 0;
  return () => `slot-${++value}`;
}

function slot(slotId, receiptId, crop) {
  return { slotId, ...(receiptId ? { image: { receiptId, ...(crop ? { crop } : {}) } } : {}) };
}

test("bounded slot creation starts with one empty position and never exceeds configured max", () => {
  const createSlotId = ids();
  let slots = hydrateProductCustomizationImageSlots({ images: [], createSlotId });
  assert.equal(slots.length, 1);
  slots = addProductCustomizationImageSlot({ slots, maxImageCount: 3, createSlotId });
  slots = addProductCustomizationImageSlot({ slots, maxImageCount: 3, createSlotId });
  const maximum = addProductCustomizationImageSlot({ slots, maxImageCount: 3, createSlotId });
  assert.equal(maximum.length, 3);
  assert.equal(canAddProductCustomizationImageSlot(maximum, 3), false);
  assert.equal(addProductCustomizationImageSlot({ slots: maximum, maxImageCount: 1, createSlotId }).length, 3);
  assert.equal(addProductCustomizationImageSlot({ slots: hydrateProductCustomizationImageSlots({ images: [], createSlotId }), maxImageCount: 1, createSlotId }).length, 1);
});

test("hydration preserves stale over-limit draft references without silently truncating customer input", () => {
  const createSlotId = ids();
  const slots = hydrateProductCustomizationImageSlots({
    images: [{ receiptId: "receipt-a" }, { receiptId: "receipt-b" }, { receiptId: "receipt-c" }],
    createSlotId,
  });
  assert.equal(slots.length, 3);
  assert.equal(canAddProductCustomizationImageSlot(slots, 2), false);
  assert.deepEqual(slots.map((entry) => entry.image?.receiptId), ["receipt-a", "receipt-b", "receipt-c"]);
});

test("Task 10.1 multi-file admission fills existing empty slots, adds only remaining slots, and reports excess files", () => {
  const createSlotId = ids();
  const crop = { x: 0.1, y: 0.2, width: 0.6, height: 0.7 };
  const existing = [slot("occupied", "receipt-a", crop), createEmptyProductCustomizationImageSlot("empty")];
  const files = [{ name: "b.png" }, { name: "c.png" }, { name: "excess.png" }];
  const admission = admitProductCustomizationImageFiles({
    slots: existing,
    occupiedSlotIds: new Set(["occupied"]),
    files,
    maxImageCount: 3,
    createSlotId,
  });

  assert.deepEqual(admission.accepted.map(({ slotId, file }) => [slotId, file.name]), [
    ["empty", "b.png"],
    ["slot-1", "c.png"],
  ]);
  assert.deepEqual(admission.rejected.map((file) => file.name), ["excess.png"]);
  assert.equal(admission.remainingCapacity, 0);
  assert.deepEqual(admission.slots[0], existing[0]);
  assert.notEqual(admission.slots[0], existing[0]);
  assert.deepEqual(admission.slots.map((entry) => entry.slotId), ["occupied", "empty", "slot-1"]);
  assert.deepEqual(existing, [slot("occupied", "receipt-a", crop), createEmptyProductCustomizationImageSlot("empty")]);
});

test("Task 10.1 admission preserves all occupied slots and deterministically rejects every file at capacity", () => {
  const existing = [slot("a", "receipt-a"), slot("b", "receipt-b")];
  const files = [{ name: "c.png" }, { name: "d.png" }];
  const admission = admitProductCustomizationImageFiles({
    slots: existing,
    occupiedSlotIds: new Set(["a", "b"]),
    files,
    maxImageCount: 2,
    createSlotId: () => "never-created",
  });
  assert.deepEqual(admission.accepted, []);
  assert.deepEqual(admission.rejected, files);
  assert.deepEqual(admission.slots, existing);
  assert.equal(admission.remainingCapacity, 0);
});

test("receipt ordering, movement, removal, replacement, duplicate defense, and crop preservation are deterministic", () => {
  const crop = { x: 0.1, y: 0.2, width: 0.5, height: 0.5 };
  const initial = [slot("a", "receipt-a", crop), slot("b", "receipt-b"), slot("c", "receipt-c")];
  const moved = moveProductCustomizationImageSlot({
    slots: moveProductCustomizationImageSlot({ slots: initial, slotId: "c", direction: "up" }),
    slotId: "c",
    direction: "up",
  });
  assert.deepEqual(moved.map((entry) => entry.slotId), ["c", "a", "b"]);
  assert.equal(moveProductCustomizationImageSlot({ slots: moved, slotId: "c", direction: "up" }), moved);
  const withoutMiddle = removeProductCustomizationImageSlot(moved, "a");
  assert.deepEqual(withoutMiddle.map((entry) => entry.image?.receiptId), ["receipt-c", "receipt-b"]);

  const replaced = setProductCustomizationImageSlotReceipt({ slots: initial, slotId: "b", image: { receiptId: "receipt-x" } });
  assert.deepEqual(replaced.map((entry) => entry.image?.receiptId), ["receipt-a", "receipt-x", "receipt-c"]);
  assert.equal(setProductCustomizationImageSlotReceipt({ slots: initial, slotId: "b", image: { receiptId: "receipt-a" } }), initial);
  const cropMoved = moveProductCustomizationImageSlot({ slots: initial, slotId: "a", direction: "down" });
  assert.deepEqual(cropMoved[1].image?.crop, crop);
});

test("ordered image value maps occupied positions only and preserves existing crop without inventing it", () => {
  const value = toOrderedProductCustomizationImageValue({
    fieldId: "field-photo",
    fieldCode: "photo",
    slots: [
      slot("a", "receipt-a", { x: 0, y: 0, width: 1, height: 1 }),
      createEmptyProductCustomizationImageSlot("pending"),
      slot("c", "receipt-c"),
    ],
  });
  assert.deepEqual(value, {
    fieldId: "field-photo",
    fieldCode: "photo",
    kind: "image",
    images: [
      { receiptId: "receipt-a", crop: { x: 0, y: 0, width: 1, height: 1 } },
      { receiptId: "receipt-c" },
    ],
  });
});

test("slot-scoped upload failures clear only the retried slot and retain existing single-image compatibility", () => {
  let draft = createProductCustomizationDraft({ productId: "product-frame", configurationRevision: "v1" });
  draft = reduceProductCustomizationDraft(draft, {
    type: "upload_started",
    operation: { operationId: "upload-a", fieldId: "field-photo", slotId: "slot-a" },
  });
  draft = reduceProductCustomizationDraft(draft, { type: "upload_failed", operationId: "upload-a", fieldId: "field-photo" });
  assert.deepEqual(draft.signals.uploadFailures, [{ operationId: "upload-a", fieldId: "field-photo", slotId: "slot-a", code: "upload_failed" }]);

  const slotBStart = createImageUploadStartedActions({ draft, fieldId: "field-photo", slotId: "slot-b", operationId: "upload-b" });
  assert.deepEqual(slotBStart.map((action) => action.type), ["upload_started"]);
  const slotARetry = createImageUploadStartedActions({ draft, fieldId: "field-photo", slotId: "slot-a", operationId: "upload-c" });
  assert.deepEqual(slotARetry.map((action) => action.type), ["clear_upload_failure", "upload_started"]);

  const legacy = reduceProductCustomizationDraft(createProductCustomizationDraft({ productId: "product-frame", configurationRevision: "v1" }), {
    type: "upload_failed", operationId: "legacy-upload", fieldId: "field-photo",
  });
  assert.equal(legacy.signals.uploadFailures[0].slotId, undefined);
});

test("removing a slot clears only its own failure, preserves other failures, and does not invent image receipts", () => {
  let draft = createProductCustomizationDraft({ productId: "product-frame", configurationRevision: "v1" });
  const failures = [
    { operationId: "upload-a", fieldId: "field-photo", slotId: "slot-a" },
    { operationId: "upload-b", fieldId: "field-photo", slotId: "slot-b" },
    { operationId: "upload-other", fieldId: "field-other", slotId: "slot-a" },
  ];
  for (const operation of failures) {
    draft = reduceProductCustomizationDraft(draft, { type: "upload_started", operation });
    draft = reduceProductCustomizationDraft(draft, { type: "upload_failed", operationId: operation.operationId, fieldId: operation.fieldId });
  }
  draft = reduceProductCustomizationDraft(draft, { type: "upload_failed", operationId: "legacy", fieldId: "field-photo" });

  const clearActions = createRemovedImageSlotActions({ draft, fieldId: "field-photo", slotId: "slot-a" });
  assert.deepEqual(clearActions, [{ type: "clear_upload_failure", operationId: "upload-a" }]);
  for (const action of clearActions) draft = reduceProductCustomizationDraft(draft, action);
  assert.deepEqual(draft.signals.uploadFailures.map((failure) => failure.operationId), ["upload-b", "upload-other", "legacy"]);
  assert.equal(draft.acceptedReceipts.length, 0);
  assert.equal(toOrderedProductCustomizationImageValue({
    fieldId: "field-photo",
    fieldCode: "photo",
    slots: [createEmptyProductCustomizationImageSlot("slot-b")],
  }), undefined);
});

test("removing a failed replacement preserves the other ordered receipt positions", () => {
  let draft = createProductCustomizationDraft({ productId: "product-frame", configurationRevision: "v1" });
  for (const receiptId of ["receipt-a", "receipt-b", "receipt-c"]) {
    draft = reduceProductCustomizationDraft(draft, {
      type: "record_accepted_receipt",
      receipt: {
        receiptId, contentType: "image/jpeg", byteSize: 10, dimensions: { width: 100, height: 100 },
        createdAt: "2026-08-13T00:00:00.000Z", expiresAt: "2026-08-15T00:00:00.000Z", lifecycle: "active",
      },
    });
  }
  draft = reduceProductCustomizationDraft(draft, {
    type: "upload_started",
    operation: { operationId: "replacement-b", fieldId: "field-photo", slotId: "slot-b" },
  });
  draft = reduceProductCustomizationDraft(draft, {
    type: "upload_failed", operationId: "replacement-b", fieldId: "field-photo",
  });

  for (const action of createRemovedImageSlotActions({ draft, fieldId: "field-photo", slotId: "slot-b" })) {
    draft = reduceProductCustomizationDraft(draft, action);
  }
  const remaining = removeProductCustomizationImageSlot([
    slot("slot-a", "receipt-a"), slot("slot-b", "receipt-b"), slot("slot-c", "receipt-c"),
  ], "slot-b");
  assert.deepEqual(toOrderedProductCustomizationImageValue({
    fieldId: "field-photo", fieldCode: "photo", slots: remaining,
  })?.images.map((image) => image.receiptId), ["receipt-a", "receipt-c"]);
  assert.equal(draft.signals.uploadFailures.length, 0);
  assert.deepEqual(draft.acceptedReceipts.map((receipt) => receipt.receiptId), ["receipt-a", "receipt-b", "receipt-c"]);
});

test("Task 10.1 source exposes equivalent multi-file button/drop controls and accessible order/status feedback", async () => {
  const [component, slots, flow] = await Promise.all([
    readFile(new URL("../app/storefront/ProductCustomizationImageField.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/application/product-customization-image-slots.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/application/product-customization-image-upload-flow.ts", import.meta.url), "utf8"),
  ]);
  assert.match(component, /ProductCustomizationImageSlotState/);
  assert.match(component, /Add another image/);
  assert.match(component, /t\("Move image"\)[\s\S]*index \+ 1[\s\S]*t\("up"\)/);
  assert.match(component, /t\("Move image"\)[\s\S]*index \+ 1[\s\S]*t\("down"\)/);
  assert.match(component, /slotId,/);
  assert.match(component, /slotsRef\.current\.forEach\(\(slot\) => disposeLocalCustomerInputPreview/);
  assert.match(component, /replaceLocalCustomerInputPreview\(slot\.preview, file\)/);
  assert.match(component, /selectedFileAccepted/);
  assert.match(component, /maxImageCount/);
  assert.match(component, /type="file"[\s\S]*multiple[\s\S]*onChange=\{handleMultipleFileChange\}/);
  assert.match(component, /onDrop=\{handleFileDrop\}/);
  assert.match(component, /handleMultipleFiles\(Array\.from\(event\.currentTarget\.files/);
  assert.match(component, /handleMultipleFiles\(Array\.from\(event\.dataTransfer\.files\)\)/);
  assert.match(component, /Remaining capacity/);
  assert.match(component, /Not accepted — image limit reached/);
  assert.match(component, /data-current-order=\{index \+ 1\}/);
  assert.match(component, /Awaiting image[\s\S]*Decoding image[\s\S]*Pending server confirmation[\s\S]*Uploading image[\s\S]*Confirmed[\s\S]*Failed/);
  assert.match(component, /api\/customer-uploads\/preview\?receiptId=/);
  assert.doesNotMatch(component, /canvas\.toBlob|canvas\.toDataURL|OffscreenCanvas|FileReader|localStorage|sessionStorage|indexedDB|@supabase\/supabase-js|SUPABASE_UPLOAD_BUCKET|R2Bucket|S3Client|storageKey|objectKey|signedUrl|photoPath|Stripe|PayPal|api\/orders/i);
  assert.match(slots, /setProductCustomizationImageSlotReceipt/);
  assert.match(slots, /receipt cannot occupy two local/i);
  assert.doesNotMatch(slots, /fetch\s*\(|:\s*(?:File|Blob)\b|\bURL\.|provider|storage|bucket|objectKey/i);
  assert.match(flow, /failure\.slotId === input\.slotId/);
  assert.match(flow, /createRemovedImageSlotActions/);
  assert.match(flow, /failure\.fieldId === input\.fieldId && failure\.slotId === input\.slotId/);
  assert.match(flow, /slotId: input\.slotId/);

  const addHandler = component.slice(component.indexOf("function handleAddSlot"), component.indexOf("function handleMove"));
  const multipleHandler = component.slice(component.indexOf("function handleMultipleFiles"), component.indexOf("function handleFileDrop"));
  const moveHandler = component.slice(component.indexOf("function handleMove"), component.indexOf("function handleRemove"));
  const removeHandler = component.slice(component.indexOf("function handleRemove"), component.indexOf("return ("));
  assert.doesNotMatch(addHandler, /fetch\s*\(|uploadCustomerCustomizationImage|\/api\/uploads/);
  assert.doesNotMatch(multipleHandler, /fetch\s*\(|uploadCustomerCustomizationImage|\/api\/uploads|onDraftAction/);
  assert.doesNotMatch(moveHandler, /fetch\s*\(|uploadCustomerCustomizationImage|\/api\/uploads/);
  assert.match(removeHandler, /createRemovedImageSlotActions/);
  assert.ok(removeHandler.indexOf("createRemovedImageSlotActions") < removeHandler.indexOf("disposeLocalCustomerInputPreview"));
  assert.doesNotMatch(removeHandler, /fetch\s*\(|uploadCustomerCustomizationImage|\/api\/uploads|replaceCustomerUpload|removeCustomerUpload/);
});
