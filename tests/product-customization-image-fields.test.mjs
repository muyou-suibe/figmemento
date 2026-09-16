import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createAcceptedImageUploadActions,
  createFailedImageUploadAction,
  createImageUploadStartedActions,
} from "../app/application/product-customization-image-upload-flow.ts";
import { uploadCustomerCustomizationImage } from "../app/client/customer-customization-image-upload.ts";
import {
  createProductCustomizationDraft,
  reduceProductCustomizationDraft,
} from "../app/domain/product-customization-draft.ts";

const productId = "product-custom-frame";
const fieldId = "field-photo";
const fieldCode = "photo";
const safeReceipt = {
  receiptId: "receipt-photo-b",
  originalFilename: "photo.png",
  contentType: "image/png",
  byteSize: 800,
  dimensions: { width: 1200, height: 900 },
  createdAt: "2026-08-14T08:00:00.000Z",
  expiresAt: "2026-08-15T08:00:00.000Z",
  lifecycle: "active",
};

function file() {
  return new File(["image bytes"], "photo.jpg", { type: "image/jpeg" });
}

test("browser upload helper sends exactly one file field and accepts only an opaque active receipt", async () => {
  let receivedUrl;
  let receivedOptions;
  const result = await uploadCustomerCustomizationImage({ productId, fieldId, file: file() }, async (url, options) => {
    receivedUrl = url;
    receivedOptions = options;
    return Response.json({ receipt: safeReceipt, warnings: [] }, { status: 201 });
  });

  assert.equal(receivedUrl, `/api/uploads?productId=${productId}&fieldId=${fieldId}`);
  assert.equal(receivedOptions.method, "POST");
  assert.deepEqual([...receivedOptions.body.keys()], ["file"]);
  assert.equal(receivedOptions.body.get("file").name, "photo.jpg");
  assert.deepEqual(result, { status: "accepted", receipt: safeReceipt });
});

test("browser upload helper maps bounded failures and rejects malformed/provider-leaking success", async () => {
  for (const [status, expected] of [[400, "invalid_request"], [404, "session_unavailable"], [503, "temporarily_unavailable"]]) {
    const result = await uploadCustomerCustomizationImage({ productId, fieldId, file: file() }, async () => new Response(null, { status }));
    assert.deepEqual(result, { status: expected });
  }

  const malformed = await uploadCustomerCustomizationImage({ productId, fieldId, file: file() }, async () => Response.json({
    receipt: { ...safeReceipt, storageKey: "private-value" },
    warnings: [],
  }, { status: 201 }));
  assert.deepEqual(malformed, { status: "malformed_success" });

  const inactive = await uploadCustomerCustomizationImage({ productId, fieldId, file: file() }, async () => Response.json({
    receipt: { ...safeReceipt, lifecycle: "removed" },
    warnings: [],
  }, { status: 201 }));
  assert.deepEqual(inactive, { status: "malformed_success" });
});

test("retry actions clear same-field failure, and safe success preserves variant/options/text while replacing one receipt reference", () => {
  let draft = createProductCustomizationDraft({ productId, configurationRevision: "customization-v1" });
  draft = reduceProductCustomizationDraft(draft, {
    type: "set_variant_selection",
    selection: { variantId: "variant-mini", skuCode: "FRAME-MINI" },
  });
  draft = reduceProductCustomizationDraft(draft, {
    type: "set_selected_options",
    selectedOptions: [{ optionId: "option-size", valueId: "value-mini" }],
  });
  draft = reduceProductCustomizationDraft(draft, {
    type: "set_text_value",
    value: { fieldId: "field-name", fieldCode: "name", kind: "short_text", value: "Ada" },
  });
  draft = reduceProductCustomizationDraft(draft, createFailedImageUploadAction({ fieldId, operationId: "upload-old" }));

  const started = createImageUploadStartedActions({ draft, fieldId, operationId: "upload-new" });
  assert.deepEqual(started.map((action) => action.type), ["clear_upload_failure", "upload_started"]);
  for (const action of started) draft = reduceProductCustomizationDraft(draft, action);
  assert.equal(draft.signals.uploadFailures.length, 0);
  assert.deepEqual(draft.activeUploads, [{ operationId: "upload-new", fieldId }]);

  const accepted = createAcceptedImageUploadActions({ fieldId, fieldCode, operationId: "upload-new", receipt: safeReceipt });
  assert.deepEqual(accepted.map((action) => action.type), ["upload_finished", "record_accepted_receipt", "set_image_value"]);
  for (const action of accepted) draft = reduceProductCustomizationDraft(draft, action);
  assert.deepEqual(draft.selectedVariant, { variantId: "variant-mini", skuCode: "FRAME-MINI" });
  assert.deepEqual(draft.selectedOptions, [{ optionId: "option-size", valueId: "value-mini" }]);
  assert.equal(draft.values.find((value) => value.fieldId === "field-name")?.kind, "short_text");
  assert.deepEqual(draft.values.find((value) => value.fieldId === fieldId), {
    fieldId,
    fieldCode,
    kind: "image",
    images: [{ receiptId: safeReceipt.receiptId }],
  });
  assert.deepEqual(draft.acceptedReceipts, [safeReceipt]);
  assert.deepEqual(draft.activeUploads, []);
});

test("upload-first receipt stays separate from a later Variant selection, and local removal only removes the image draft value", () => {
  let draft = createProductCustomizationDraft({ productId, configurationRevision: "customization-v1" });
  for (const action of createAcceptedImageUploadActions({ fieldId, fieldCode, operationId: "upload-first", receipt: safeReceipt })) {
    draft = reduceProductCustomizationDraft(draft, action);
  }
  assert.equal(draft.selectedVariant, null);
  draft = reduceProductCustomizationDraft(draft, {
    type: "set_variant_selection",
    selection: { variantId: "variant-standard", skuCode: "FRAME-STANDARD" },
  });
  draft = reduceProductCustomizationDraft(draft, {
    type: "set_text_value",
    value: { fieldId: "field-name", fieldCode: "name", kind: "short_text", value: "Ada" },
  });
  const removed = reduceProductCustomizationDraft(draft, { type: "remove_customization_value", fieldId });
  assert.equal(removed.values.some((value) => value.fieldId === fieldId), false);
  assert.equal(removed.acceptedReceipts[0].receiptId, safeReceipt.receiptId);
  assert.deepEqual(removed.selectedVariant, draft.selectedVariant);
  assert.equal(removed.values.find((value) => value.fieldId === "field-name")?.kind, "short_text");
});

test("a failed local replacement retains the prior referenced receipt, while a later success replaces only the draft reference", () => {
  const receiptA = { ...safeReceipt, receiptId: "receipt-photo-a" };
  let draft = createProductCustomizationDraft({ productId, configurationRevision: "customization-v1" });
  for (const action of createAcceptedImageUploadActions({ fieldId, fieldCode, operationId: "upload-a", receipt: receiptA })) {
    draft = reduceProductCustomizationDraft(draft, action);
  }

  const failedReplacement = reduceProductCustomizationDraft(
    reduceProductCustomizationDraft(draft, { type: "upload_started", operation: { operationId: "upload-b", fieldId } }),
    createFailedImageUploadAction({ fieldId, operationId: "upload-b" }),
  );
  assert.equal(failedReplacement.values.find((value) => value.fieldId === fieldId)?.kind, "image");
  assert.deepEqual(failedReplacement.values.find((value) => value.fieldId === fieldId)?.images, [{ receiptId: receiptA.receiptId }]);

  let replaced = failedReplacement;
  for (const action of createAcceptedImageUploadActions({ fieldId, fieldCode, operationId: "upload-c", receipt: safeReceipt })) {
    replaced = reduceProductCustomizationDraft(replaced, action);
  }
  assert.deepEqual(replaced.values.find((value) => value.fieldId === fieldId)?.images, [{ receiptId: safeReceipt.receiptId }]);
  assert.deepEqual(replaced.acceptedReceipts.map((receipt) => receipt.receiptId), [receiptA.receiptId, safeReceipt.receiptId]);
});

test("Task 7.4 UI source keeps selection local and Task 10.5 restores only exact private receipt previews", async () => {
  const [shell, imageField, clientUpload, css, textField] = await Promise.all([
    readFile(new URL("../app/storefront/ProductCustomizationFormShell.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/storefront/ProductCustomizationImageField.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/client/customer-customization-image-upload.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/storefront/catalog-storefront.module.css", import.meta.url), "utf8"),
    readFile(new URL("../app/storefront/ProductCustomizationTextField.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(shell, /const activeFields = props\.fields\.filter\(\(field\) => field\.isActive\)/);
  assert.match(shell, /activeFields\.length > 0 \? activeFields\.map/);
  assert.match(shell, /<ProductCustomizationImageField/);
  assert.doesNotMatch(shell, /textFields/);

  assert.match(imageField, /type="file"/);
  assert.match(imageField, /accept=\{props\.field\.constraints\.allowedMimeTypes\.join/);
  assert.match(imageField, /preflightCustomerImage/);
  assert.match(imageField, /replaceLocalCustomerInputPreview/);
  assert.match(imageField, /disposeLocalCustomerInputPreview/);
  assert.match(imageField, /naturalWidth/);
  assert.match(imageField, /Customer input preview — this is not a production mockup\./);
  assert.match(imageField, /t\("Upload image"\)[\s\S]*index \+ 1/);
  assert.match(imageField, /<progress aria-label=\{`\$\{t\("Image"\)\} \$\{index \+ 1\} \$\{t\("upload in progress"\)\}/);
  assert.match(imageField, /selectionGeneration/);
  assert.match(imageField, /const defaultSlotCounter = useRef\(0\)/);
  assert.match(imageField, /controlPrefix\}-image-slot-\$\{defaultSlotCounter\.current\+\+\}/);
  assert.match(imageField, /slot\.preview\?\.url !== observedPreviewUrl/);
  assert.match(imageField, /activeOperationId/);
  assert.match(imageField, /api\/customer-uploads\/preview\?receiptId=/);
  assert.doesNotMatch(imageField, /canvas\.toBlob|canvas\.toDataURL|OffscreenCanvas|FileReader|localStorage|sessionStorage|indexedDB|@supabase\/supabase-js|SUPABASE_UPLOAD_BUCKET|R2Bucket|S3Client|storageKey|objectKey|signedUrl|photoPath|Stripe|PayPal|api\/orders/i);
  assert.match(clientUpload, /formData\.append\("file", file\)/);
  assert.match(clientUpload, /fetchImplementation\(`\/api\/uploads\?\$\{query\.toString\(\)\}`/);
  assert.doesNotMatch(clientUpload, /ownerId|receiptId|bucket|storageKey|objectKey|signedUrl|photoPath|@supabase\/supabase-js|R2Bucket|S3Client/i);

  const selectionHandler = imageField.slice(
    imageField.indexOf("function handleFileChange"),
    imageField.indexOf("function handlePreviewLoad"),
  );
  assert.doesNotMatch(selectionHandler, /fetch\s*\(|uploadCustomerCustomizationImage|\/api\/uploads/);

  for (const className of [
    "customizationTextField",
    "customizationFieldLabel",
    "customizationRequirement",
    "customizationFieldMeta",
    "customizationHelpText",
    "customizationFeedback",
    "customizationTextInput",
    "customizationTextarea",
  ]) assert.match(css, new RegExp(`\\.${className}`));
  assert.match(textField, /aria-live="polite"/);
});
