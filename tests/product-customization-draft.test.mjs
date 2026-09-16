import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createRemovedImageSlotActions } from "../app/application/product-customization-image-upload-flow.ts";
import {
  createProductCustomizationDraft,
  evaluateProductCustomizationDraft,
  reduceProductCustomizationDraft,
} from "../app/domain/product-customization-draft.ts";

const productId = "product-couple-figure";
const otherProductId = "product-other";
const revision = "customization-v1";
const observedAt = "2026-08-13T00:00:00.000Z";

const fields = [
  {
    id: "field-name", productId, code: "name", label: "Name", kind: "short_text",
    required: true, isActive: true, position: 0, configurationRevision: revision,
    constraints: { maxLength: 12 },
  },
  {
    id: "field-photo", productId, code: "photo", label: "Photo", kind: "image",
    required: true, isActive: true, position: 1, configurationRevision: revision,
    constraints: {
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"], maxBytes: 1_000,
      minDimensions: { width: 100, height: 100 }, minImageCount: 1, maxImageCount: 2, cropEnabled: true,
    },
  },
];

function authority(overrides = {}) {
  return { productId, configurationRevision: revision, fields, ...overrides };
}

function receipt(overrides = {}) {
  return {
    receiptId: "receipt-photo-a", contentType: "image/jpeg", byteSize: 500,
    dimensions: { width: 400, height: 300 },
    createdAt: "2026-08-12T00:00:00.000Z", expiresAt: "2026-08-14T00:00:00.000Z", lifecycle: "active",
    ...overrides,
  };
}

function variant() {
  return { variantId: "variant-couple-figure-mini", skuCode: "DEV-COUPLE-FIGURE-MINI" };
}

function setText(draft, value = "  Ada  ") {
  return reduceProductCustomizationDraft(draft, {
    type: "set_text_value",
    value: { fieldId: "field-name", fieldCode: "name", kind: "short_text", value },
  });
}

function setPhoto(draft, receiptId = "receipt-photo-a") {
  return reduceProductCustomizationDraft(draft, {
    type: "set_image_value",
    value: { fieldId: "field-photo", fieldCode: "photo", kind: "image", images: [{ receiptId }] },
  });
}

function readyDraft() {
  let draft = createProductCustomizationDraft({ productId, configurationRevision: revision });
  draft = reduceProductCustomizationDraft(draft, { type: "set_variant_selection", selection: variant() });
  draft = setText(draft);
  draft = reduceProductCustomizationDraft(draft, { type: "record_accepted_receipt", receipt: receipt() });
  return setPhoto(draft);
}

function hasCode(result, code) {
  return result.issues.some((issue) => issue.code === code);
}

test("initial Product-scoped draft is empty even with required fields", () => {
  const draft = createProductCustomizationDraft({ productId, configurationRevision: revision });
  const result = evaluateProductCustomizationDraft(draft, authority(), observedAt);
  assert.equal(result.state, "empty");
  assert.equal(hasCode(result, "required_field_missing"), true);
  assert.equal(hasCode(result, "variant_required"), true);
});

test("text-first editing preserves raw text until one resolved Variant and valid image receipt make it locally ready", () => {
  let draft = setText(createProductCustomizationDraft({ productId, configurationRevision: revision }));
  assert.equal(draft.values[0].kind, "short_text");
  assert.equal(draft.values[0].value, "  Ada  ");
  assert.equal(evaluateProductCustomizationDraft(draft, authority(), observedAt).state, "editing");

  draft = reduceProductCustomizationDraft(draft, { type: "set_variant_selection", selection: variant() });
  draft = reduceProductCustomizationDraft(draft, { type: "record_accepted_receipt", receipt: receipt() });
  draft = setPhoto(draft);
  const result = evaluateProductCustomizationDraft(draft, authority(), observedAt);
  assert.equal(result.state, "ready");
  assert.ok(result.normalizedValues);
  assert.equal(result.normalizedValues[0].kind, "short_text");
  assert.equal(result.normalizedValues[0].value, "Ada");
  assert.equal(draft.values[0].value, "  Ada  ");
});

test("configured-empty uses the current configuration revision without inventing field authority", () => {
  let draft = createProductCustomizationDraft({ productId, configurationRevision: revision });
  draft = reduceProductCustomizationDraft(draft, { type: "set_variant_selection", selection: variant() });
  const ready = evaluateProductCustomizationDraft(draft, authority({ fields: [] }), observedAt);
  assert.equal(ready.state, "ready");
  assert.deepEqual(ready.normalizedValues, []);

  const stale = evaluateProductCustomizationDraft(draft, authority({ fields: [], configurationRevision: "customization-v2" }), observedAt);
  assert.equal(stale.state, "invalid");
  assert.equal(hasCode(stale, "stale_configuration"), true);

  const withUnknownValue = setText(draft);
  const invalid = evaluateProductCustomizationDraft(withUnknownValue, authority({ fields: [] }), observedAt);
  assert.equal(invalid.state, "invalid");
  assert.equal(hasCode(invalid, "unknown_field"), true);

  const invalidAuthority = evaluateProductCustomizationDraft(draft, authority({ fields: [], configurationRevision: " " }), observedAt);
  assert.equal(invalidAuthority.state, "invalid");
  assert.equal(hasCode(invalidAuthority, "invalid_authoritative_configuration"), true);
});

test("Variant-first and option-first choices remain independent from customization values", () => {
  let draft = createProductCustomizationDraft({ productId, configurationRevision: revision });
  draft = reduceProductCustomizationDraft(draft, {
    type: "set_selected_options",
    selectedOptions: [{ optionId: "option-size", valueId: "value-mini" }],
  });
  draft = reduceProductCustomizationDraft(draft, { type: "set_variant_selection", selection: variant() });
  assert.equal(evaluateProductCustomizationDraft(draft, authority(), observedAt).state, "editing");

  const beforeText = draft.selectedOptions;
  draft = setText(draft);
  assert.deepEqual(draft.selectedOptions, beforeText);
  const beforeOptions = draft.values;
  draft = reduceProductCustomizationDraft(draft, {
    type: "set_selected_options",
    selectedOptions: [{ optionId: "option-size", valueId: "value-standard" }],
  });
  assert.deepEqual(draft.values, beforeOptions);
  draft = reduceProductCustomizationDraft(draft, { type: "record_accepted_receipt", receipt: receipt() });
  draft = setPhoto(draft);
  assert.equal(evaluateProductCustomizationDraft(draft, authority(), observedAt).state, "ready");
});

test("required incompleteness is editing, while too-long text is invalid without truncation", () => {
  let draft = createProductCustomizationDraft({ productId, configurationRevision: revision });
  draft = reduceProductCustomizationDraft(draft, { type: "set_variant_selection", selection: variant() });
  const incomplete = evaluateProductCustomizationDraft(draft, authority(), observedAt);
  assert.equal(incomplete.state, "editing");
  assert.equal(hasCode(incomplete, "required_field_missing"), true);

  draft = setText(draft, "Ada Lovelace III");
  const invalid = evaluateProductCustomizationDraft(draft, authority(), observedAt);
  assert.equal(invalid.state, "invalid");
  assert.equal(hasCode(invalid, "text_too_long"), true);
  assert.equal(draft.values[0].value, "Ada Lovelace III");
});

test("active uploads are deduplicated and outrank invalidity, but expiry outranks pending", () => {
  let draft = readyDraft();
  draft = reduceProductCustomizationDraft(draft, {
    type: "upload_started", operation: { operationId: "upload-photo-a", fieldId: "field-photo" },
  });
  draft = reduceProductCustomizationDraft(draft, {
    type: "upload_started", operation: { operationId: "upload-photo-a", fieldId: "field-photo" },
  });
  draft = setText(draft, "Ada Lovelace III");
  const pending = evaluateProductCustomizationDraft(draft, authority(), observedAt);
  assert.equal(draft.activeUploads.length, 1);
  assert.equal(pending.state, "upload_pending");
  assert.equal(hasCode(pending, "text_too_long"), true);

  draft = reduceProductCustomizationDraft(draft, { type: "owner_context_expired" });
  assert.equal(evaluateProductCustomizationDraft(draft, authority(), observedAt).state, "expired");
});

test("finished or failed upload never fabricates a receipt or ready state", () => {
  let draft = createProductCustomizationDraft({ productId, configurationRevision: revision });
  draft = reduceProductCustomizationDraft(draft, { type: "set_variant_selection", selection: variant() });
  draft = setText(draft);
  draft = reduceProductCustomizationDraft(draft, {
    type: "upload_started", operation: { operationId: "upload-photo-a", fieldId: "field-photo" },
  });
  assert.equal(evaluateProductCustomizationDraft(draft, authority(), observedAt).state, "upload_pending");
  draft = reduceProductCustomizationDraft(draft, { type: "upload_finished", operationId: "upload-photo-a" });
  assert.equal(evaluateProductCustomizationDraft(draft, authority(), observedAt).state, "editing");
  draft = reduceProductCustomizationDraft(draft, { type: "upload_failed", operationId: "upload-photo-b", fieldId: "field-photo" });
  const failed = evaluateProductCustomizationDraft(draft, authority(), observedAt);
  assert.equal(failed.state, "invalid");
  assert.equal(hasCode(failed, "upload_failed"), true);
});

test("removing a failed local image position clears its hard issue without fabricating readiness", () => {
  let draft = readyDraft();
  draft = reduceProductCustomizationDraft(draft, {
    type: "record_accepted_receipt",
    receipt: receipt({ receiptId: "receipt-photo-c" }),
  });
  draft = reduceProductCustomizationDraft(draft, {
    type: "set_image_value",
    value: {
      fieldId: "field-photo", fieldCode: "photo", kind: "image",
      images: [{ receiptId: "receipt-photo-a" }, { receiptId: "receipt-photo-c" }],
    },
  });
  draft = reduceProductCustomizationDraft(draft, {
    type: "upload_started",
    operation: { operationId: "failed-pending-b", fieldId: "field-photo", slotId: "slot-b" },
  });
  draft = reduceProductCustomizationDraft(draft, {
    type: "upload_failed", operationId: "failed-pending-b", fieldId: "field-photo",
  });
  const beforeRemoval = evaluateProductCustomizationDraft(draft, authority(), observedAt);
  assert.equal(beforeRemoval.state, "invalid");
  assert.equal(hasCode(beforeRemoval, "upload_failed"), true);

  for (const action of createRemovedImageSlotActions({ draft, fieldId: "field-photo", slotId: "slot-b" })) {
    draft = reduceProductCustomizationDraft(draft, action);
  }
  const afterRemoval = evaluateProductCustomizationDraft(draft, authority(), observedAt);
  assert.equal(hasCode(afterRemoval, "upload_failed"), false);
  assert.equal(afterRemoval.state, "ready");
  assert.deepEqual(afterRemoval.normalizedValues?.find((value) => value.kind === "image")?.images.map((image) => image.receiptId), ["receipt-photo-a", "receipt-photo-c"]);
});

test("image values require matching safe accepted receipt metadata and enforce non-active/expired receipt behavior", () => {
  let missing = createProductCustomizationDraft({ productId, configurationRevision: revision });
  missing = reduceProductCustomizationDraft(missing, { type: "set_variant_selection", selection: variant() });
  missing = setText(missing);
  missing = setPhoto(missing, "receipt-unknown");
  const missingResult = evaluateProductCustomizationDraft(missing, authority(), observedAt);
  assert.equal(missingResult.state, "invalid");
  assert.equal(hasCode(missingResult, "receipt_metadata_missing"), true);

  let replaced = readyDraft();
  replaced = reduceProductCustomizationDraft(replaced, { type: "record_accepted_receipt", receipt: receipt({ lifecycle: "replaced" }) });
  const replacedResult = evaluateProductCustomizationDraft(replaced, authority(), observedAt);
  assert.equal(replacedResult.state, "invalid");
  assert.equal(hasCode(replacedResult, "receipt_inactive"), true);

  let expired = readyDraft();
  expired = reduceProductCustomizationDraft(expired, { type: "record_accepted_receipt", receipt: receipt({ expiresAt: observedAt }) });
  const expiredResult = evaluateProductCustomizationDraft(expired, authority(), observedAt);
  assert.equal(expiredResult.state, "expired");
  assert.equal(hasCode(expiredResult, "receipt_expired"), true);
});

test("stale configuration and Product changes fail closed without silently rebasing or carrying values", () => {
  const draft = readyDraft();
  const stale = evaluateProductCustomizationDraft(draft, authority({ configurationRevision: "customization-v2" }), observedAt);
  assert.equal(stale.state, "invalid");
  assert.equal(hasCode(stale, "stale_configuration"), true);
  assert.equal(draft.configurationRevision, revision);

  const mismatch = evaluateProductCustomizationDraft(draft, authority({ productId: otherProductId }), observedAt);
  assert.equal(mismatch.state, "invalid");
  assert.equal(hasCode(mismatch, "product_mismatch"), true);

  const reset = createProductCustomizationDraft({ productId: otherProductId, configurationRevision: "other-v1" });
  assert.equal(reset.values.length, 0);
  assert.equal(reset.acceptedReceipts.length, 0);
  assert.equal(reset.selectedVariant, null);
});

test("reducer is immutable and action payload mutation cannot rewrite stored values or selections", () => {
  const initial = createProductCustomizationDraft({ productId, configurationRevision: revision });
  const selectedOptions = [{ optionId: "option-size", valueId: "value-mini" }];
  const withOptions = reduceProductCustomizationDraft(initial, { type: "set_selected_options", selectedOptions });
  selectedOptions[0].valueId = "value-standard";
  assert.equal(initial.selectedOptions.length, 0);
  assert.deepEqual(withOptions.selectedOptions, [{ optionId: "option-size", valueId: "value-mini" }]);

  const value = { fieldId: "field-name", fieldCode: "name", kind: "short_text", value: "Ada" };
  const withText = reduceProductCustomizationDraft(withOptions, { type: "set_text_value", value });
  value.value = "Grace";
  assert.equal(withOptions.values.length, 0);
  assert.equal(withText.values[0].kind, "short_text");
  assert.equal(withText.values[0].value, "Ada");
});

test("Task 7.1 stays pure, local, provider-neutral, and does not add a browser-settable lifecycle or generic patch", async () => {
  const [source, productDetailFiles, variantSelectorFiles] = await Promise.all([
    readFile(new URL("../app/domain/product-customization-draft.ts", import.meta.url), "utf8"),
    Promise.resolve([]),
    Promise.resolve([]),
  ]);
  void productDetailFiles;
  void variantSelectorFiles;
  assert.match(source, /expired > upload_pending > invalid > ready > editing > empty/);
  assert.doesNotMatch(source, /setStatus|setState|markReady|patchDraft|mergeState|Record<string, unknown>/);
  assert.doesNotMatch(source, /@supabase\/supabase-js|SUPABASE_UPLOAD_BUCKET|R2Bucket|S3Client|storageKey|objectKey|signedUrl|photoPath|ProductAsset|Stripe|PayPal|fetch\(|React|Request|Response|cookies\(/);
  assert.doesNotMatch(source, /cartKey|fingerprint|mergeKey|configuredLineId|priceCents|currency|surcharge|shipping|fulfillment/);

  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("Network access is forbidden in pure draft tests.");
  };
  try {
    assert.equal(evaluateProductCustomizationDraft(readyDraft(), authority(), observedAt).state, "ready");
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
