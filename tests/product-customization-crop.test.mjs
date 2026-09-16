import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  applyProductCustomizationCropPointerDelta,
  createProductCustomizationCropEditorValues,
  parseProductCustomizationCropEditorValues,
} from "../app/application/product-customization-crop-editor.ts";
import {
  clearProductCustomizationImageSlotCrop,
  moveProductCustomizationImageSlot,
  reorderProductCustomizationImageSlot,
  removeProductCustomizationImageSlot,
  setProductCustomizationImageSlotCrop,
  setProductCustomizationImageSlotReceipt,
  toOrderedProductCustomizationImageValue,
} from "../app/application/product-customization-image-slots.ts";
import {
  parseCustomizationCropRegion,
  validateCustomizationCropPolicy,
} from "../app/domain/customization-value.ts";

function slot(slotId, receiptId, crop) {
  return { slotId, image: { receiptId, ...(crop ? { crop } : {}) } };
}

test("crop editor converts local percent strings through the authoritative normalized crop parser", () => {
  assert.deepEqual(createProductCustomizationCropEditorValues(), {
    x: "0", y: "0", width: "100", height: "100",
  });
  assert.deepEqual(createProductCustomizationCropEditorValues({ x: 0.125, y: 0.25, width: 0.5, height: 0.6 }), {
    x: "12.5", y: "25", width: "50", height: "60",
  });
  const valid = parseProductCustomizationCropEditorValues({ x: "10", y: "20", width: "50", height: "60" });
  assert.deepEqual(valid, { ok: true, value: { x: 0.1, y: 0.2, width: 0.5, height: 0.6 } });
  assert.equal(parseProductCustomizationCropEditorValues({ x: "80", y: "0", width: "40", height: "100" }).ok, false);
  assert.equal(parseProductCustomizationCropEditorValues({ x: "", y: "0", width: "100", height: "100" }).ok, false);
});

test("crop application and clearing change exactly one accepted receipt reference without changing receipt identity or order", () => {
  const cropA = { x: 0.1, y: 0.1, width: 0.8, height: 0.8 };
  const initial = [slot("slot-a", "receipt-a", cropA), slot("slot-b", "receipt-b"), slot("slot-c", "receipt-c")];
  const applied = setProductCustomizationImageSlotCrop({
    slots: initial,
    slotId: "slot-b",
    crop: { x: 0.1, y: 0.2, width: 0.5, height: 0.6 },
  });
  assert.deepEqual(toOrderedProductCustomizationImageValue({ fieldId: "field-photo", fieldCode: "photo", slots: applied })?.images, [
    { receiptId: "receipt-a", crop: cropA },
    { receiptId: "receipt-b", crop: { x: 0.1, y: 0.2, width: 0.5, height: 0.6 } },
    { receiptId: "receipt-c" },
  ]);
  const cleared = clearProductCustomizationImageSlotCrop({ slots: applied, slotId: "slot-b" });
  assert.deepEqual(toOrderedProductCustomizationImageValue({ fieldId: "field-photo", fieldCode: "photo", slots: cleared })?.images, [
    { receiptId: "receipt-a", crop: cropA },
    { receiptId: "receipt-b" },
    { receiptId: "receipt-c" },
  ]);
  assert.equal(setProductCustomizationImageSlotCrop({ slots: initial, slotId: "missing", crop: cropA }), initial);
  assert.equal(clearProductCustomizationImageSlotCrop({ slots: initial, slotId: "slot-c" }), initial);

  const replaced = setProductCustomizationImageSlotReceipt({
    slots: applied,
    slotId: "slot-b",
    image: { receiptId: "receipt-x" },
  });
  assert.deepEqual(replaced.map((entry) => entry.image), [
    { receiptId: "receipt-a", crop: cropA },
    { receiptId: "receipt-x" },
    { receiptId: "receipt-c" },
  ]);
  const withoutB = removeProductCustomizationImageSlot(applied, "slot-b");
  assert.deepEqual(withoutB.map((entry) => entry.image), [
    { receiptId: "receipt-a", crop: cropA },
    { receiptId: "receipt-c" },
  ]);
});

test("crop follows its receipt through reorder and parser/policy boundaries remain fail-closed", () => {
  const crop = { x: 0.2, y: 0.2, width: 0.5, height: 0.5 };
  const moved = moveProductCustomizationImageSlot({
    slots: [slot("slot-a", "receipt-a", crop), slot("slot-b", "receipt-b")],
    slotId: "slot-a",
    direction: "down",
  });
  assert.deepEqual(moved.map((entry) => entry.image), [{ receiptId: "receipt-b" }, { receiptId: "receipt-a", crop }]);
  for (const candidate of [
    { x: Number.NaN, y: 0, width: 1, height: 1 },
    { x: 0, y: Number.POSITIVE_INFINITY, width: 1, height: 1 },
    { x: -0.1, y: 0, width: 1, height: 1 },
    { x: 0, y: 0, width: 0, height: 1 },
    { x: 0.8, y: 0, width: 0.4, height: 1 },
    { x: 0, y: 0, width: 1, height: 1, rotation: 10 },
  ]) assert.equal(parseCustomizationCropRegion(candidate).ok, false);
  const disabledField = {
    id: "field-photo", productId: "product-frame", code: "photo", label: "Photo", kind: "image",
    required: false, isActive: true, position: 0, configurationRevision: "v1",
    constraints: {
      allowedMimeTypes: ["image/jpeg"], maxBytes: 100, minDimensions: { width: 1, height: 1 },
      minImageCount: 0, maxImageCount: 3, cropEnabled: false,
    },
  };
  assert.equal(validateCustomizationCropPolicy(disabledField, {
    fieldId: "field-photo", fieldCode: "photo", kind: "image", images: [{ receiptId: "receipt-a", crop }],
  }).ok, false);
});

test("crop UI stays optional and accepted-receipt-bound while persistent mode confirms a private server crop", async () => {
  const [component, slots, editor, css] = await Promise.all([
    readFile(new URL("../app/storefront/ProductCustomizationImageField.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/application/product-customization-image-slots.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/application/product-customization-crop-editor.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/storefront/catalog-storefront.module.css", import.meta.url), "utf8"),
  ]);
  assert.match(component, /props\.field\.constraints\.cropEnabled && slot\.image/);
  assert.match(component, /slot\.preview && slot\.selectedFileAccepted && slot\.status === "accepted"/);
  assert.match(component, /Adjust crop/);
  assert.match(component, /Crop left/);
  assert.match(component, /Crop top/);
  assert.match(component, /Crop width/);
  assert.match(component, /Crop height/);
  assert.match(component, /Apply crop/);
  assert.match(component, /Use full image/);
  assert.match(component, /Cancel/);
  assert.match(component, /Crop preview is unavailable in this local session\./);
  assert.match(component, /Upload the replacement image before adjusting its crop\./);
  assert.match(component, /Crop selection — customer input only\. Final production framing may differ\./);
  assert.match(component, /aria-live="polite"/);
  assert.match(component, /setProductCustomizationImageSlotCrop/);
  assert.match(component, /clearProductCustomizationImageSlotCrop/);
  assert.match(slots, /setProductCustomizationImageSlotCrop/);
  assert.match(slots, /clearProductCustomizationImageSlotCrop/);
  assert.match(editor, /parseCustomizationCropRegion/);
  assert.match(component, /api\/customer-uploads\/preview\?receiptId=/);
  assert.doesNotMatch(component, /canvas\.toBlob|canvas\.toDataURL|OffscreenCanvas|FileReader|fetch\s*\(|@supabase\/supabase-js|R2Bucket|S3Client|storageKey|objectKey|signedUrl|api\/orders|Stripe|PayPal/i);
  assert.doesNotMatch(editor, /fetch\s*\(|File|Blob|URL|provider|storage|bucket|objectKey/i);
  const cropHandlers = component.slice(component.indexOf("function handleOpenCropEditor"), component.indexOf("function handleRemove"));
  assert.match(cropHandlers, /parseProductCustomizationCropEditorValues/);
  assert.match(cropHandlers, /setProductCustomizationImageSlotCrop/);
  assert.match(cropHandlers, /clearProductCustomizationImageSlotCrop/);
  assert.match(cropHandlers, /synchronizeDraftImageValue/);
  assert.match(cropHandlers, /cropPersistentCustomizationImage/);
  assert.match(cropHandlers, /record_accepted_receipt/);
  assert.doesNotMatch(cropHandlers, /fetch\s*\(|uploadCustomerCustomizationImage|createAcceptedImageUploadActions|FormData|Blob|URL\./);
  for (const className of ["customizationCropOverlay", "customizationCropEditor", "customizationCropControls", "customizationCropFeedback"]) {
    assert.match(css, new RegExp(`\\.${className}`));
  }
});

test("Task 10.3 pointer crop movement and resize use normalized bounded geometry", () => {
  const crop = { x: 0.2, y: 0.25, width: 0.5, height: 0.4 };
  const moved = applyProductCustomizationCropPointerDelta({
    crop, mode: "move", deltaX: 20, deltaY: -10, boundsWidth: 200, boundsHeight: 100,
  });
  assert.ok(Math.abs(moved.x - 0.3) < Number.EPSILON);
  assert.deepEqual({ ...moved, x: 0.3 }, { x: 0.3, y: 0.15, width: 0.5, height: 0.4 });
  assert.deepEqual(applyProductCustomizationCropPointerDelta({
    crop, mode: "resize", deltaX: 40, deltaY: 20, boundsWidth: 200, boundsHeight: 100,
  }), { x: 0.2, y: 0.25, width: 0.7, height: 0.6000000000000001 });
  assert.deepEqual(applyProductCustomizationCropPointerDelta({
    crop, mode: "move", deltaX: Number.NaN, deltaY: 0, boundsWidth: 200, boundsHeight: 100,
  }), crop);
});

test("Task 10.3 pointer reorder moves the whole stable slot and its receipt/crop", () => {
  const crop = { x: 0.1, y: 0.2, width: 0.5, height: 0.6 };
  const initial = [slot("a", "receipt-a", crop), slot("b", "receipt-b"), slot("c", "receipt-c")];
  const reordered = reorderProductCustomizationImageSlot({ slots: initial, slotId: "a", targetSlotId: "c" });
  assert.deepEqual(reordered.map((entry) => [entry.slotId, entry.image]), [
    ["b", { receiptId: "receipt-b" }],
    ["c", { receiptId: "receipt-c" }],
    ["a", { receiptId: "receipt-a", crop }],
  ]);
  assert.equal(reorderProductCustomizationImageSlot({ slots: reordered, slotId: "a", targetSlotId: "a" }), reordered);
});

test("Task 10.3 source keeps pointer and keyboard/button alternatives while invalid crop stays uncommitted", async () => {
  const [component, editor, css] = await Promise.all([
    readFile(new URL("../app/storefront/ProductCustomizationImageField.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/application/product-customization-crop-editor.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/storefront/catalog-storefront.module.css", import.meta.url), "utf8"),
  ]);
  assert.match(component, /onPointerDown=.*handleReorderPointerDown/);
  assert.match(component, /document\.elementFromPoint/);
  assert.match(component, /reorderProductCustomizationImageSlot/);
  assert.match(component, /handleCropPointerDown/);
  assert.match(component, /mode: ProductCustomizationCropPointerMode/);
  assert.match(component, /type="number"/);
  assert.match(component, /Move image/);
  assert.match(component, /Use full image/);
  const applyHandler = component.slice(component.indexOf("function handleApplyCrop"), component.indexOf("function handleClearCrop"));
  assert.ok(applyHandler.indexOf("if (!parsed.ok)") < applyHandler.indexOf("setProductCustomizationImageSlotCrop"));
  assert.match(editor, /applyProductCustomizationCropPointerDelta/);
  assert.match(editor, /parseCustomizationCropRegion\(candidate\)/);
  assert.match(css, /touch-action: none/);
});
