import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createServer } from "vite";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  createAcceptedImageUploadActions,
  createFailedImageUploadAction,
  createImageUploadStartedActions,
} from "../app/application/product-customization-image-upload-flow.ts";
import {
  moveProductCustomizationImageSlot,
  setProductCustomizationImageSlotCrop,
  setProductCustomizationImageSlotReceipt,
  toOrderedProductCustomizationImageValue,
} from "../app/application/product-customization-image-slots.ts";
import { resolveVariantSelection } from "../app/application/catalog-storefront.ts";
import {
  applyProductCustomizationActionForConfiguration,
  applyVariantSelectionToProductCustomizationDraft,
  createProductDetailVariantSelectionEvent,
  initializeProductCustomizationDraftForConfiguration,
} from "../app/application/product-detail-customization-composition.ts";
import { evaluateProductCustomizationHandoff } from "../app/application/product-customization-handoff-gate.ts";
import { createProductCustomizationSummary } from "../app/application/product-customization-summary.ts";
import { preflightCustomerImage } from "../app/domain/customer-image-inspection.ts";
import { validateCustomizationCropPolicy } from "../app/domain/customization-value.ts";
import {
  createProductCustomizationDraft,
  reduceProductCustomizationDraft,
} from "../app/domain/product-customization-draft.ts";
import {
  createLocalCustomerInputPreview,
  disposeLocalCustomerInputPreview,
  replaceLocalCustomerInputPreview,
} from "../app/client/local-customer-input-preview.ts";

const productId = "product-ux-frame";
const revision = "customization-ux-v1";
const observedAt = "2026-08-14T12:00:00.000Z";

const size = {
  id: "option-size",
  productId,
  code: "size",
  name: "Size",
  kind: "size",
  required: true,
  position: 0,
};
const mini = { id: "value-mini", productId, optionId: size.id, code: "mini", label: "Mini", position: 0 };
const standard = { id: "value-standard", productId, optionId: size.id, code: "standard", label: "Standard", position: 1 };
const selectedMini = [{ optionId: size.id, valueId: mini.id }];
const selectedStandard = [{ optionId: size.id, valueId: standard.id }];

const nameField = {
  id: "field-name",
  productId,
  code: "name",
  label: "Name",
  kind: "short_text",
  required: true,
  isActive: true,
  position: 0,
  configurationRevision: revision,
  constraints: { maxLength: 30, helpText: "The name shown on your gift." },
};
const photoField = {
  id: "field-photo",
  productId,
  code: "photo",
  label: "Photo",
  kind: "image",
  required: true,
  isActive: true,
  position: 1,
  configurationRevision: revision,
  constraints: {
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
    maxBytes: 10_000,
    minDimensions: { width: 100, height: 100 },
    recommendedDimensions: { width: 1000, height: 1000 },
    minImageCount: 1,
    maxImageCount: 3,
    cropEnabled: true,
  },
};
const messageField = {
  id: "field-message",
  productId,
  code: "message",
  label: "Message",
  kind: "long_text",
  required: false,
  isActive: true,
  position: 2,
  configurationRevision: revision,
  constraints: { maxLength: 140, helpText: "An optional note for the recipient." },
};
const fields = [nameField, photoField, messageField];

function variant(overrides = {}) {
  return {
    id: "variant-mini",
    productId,
    skuCode: "UX-FRAME-MINI",
    priceCents: 6_990,
    currency: "USD",
    isActive: true,
    isAvailable: true,
    selectedOptions: selectedMini,
    ...overrides,
  };
}

function receipt(receiptId, overrides = {}) {
  return {
    receiptId,
    originalFilename: "customer-photo.png",
    contentType: "image/png",
    byteSize: 800,
    dimensions: { width: 500, height: 500 },
    createdAt: "2026-08-14T11:00:00.000Z",
    expiresAt: "2026-08-15T11:00:00.000Z",
    lifecycle: "active",
    ...overrides,
  };
}

function selectionInput(selectedOptions = selectedMini, variants = [variant()]) {
  return { productId, options: [size], optionValues: [mini, standard], variants, selectedOptions };
}

function selectedDraft(selectedOptions = selectedMini, variants = [variant()]) {
  const resolution = resolveVariantSelection(selectionInput(selectedOptions, variants));
  let draft = createProductCustomizationDraft({ productId, configurationRevision: revision });
  return applyVariantSelectionToProductCustomizationDraft(
    draft,
    createProductDetailVariantSelectionEvent(selectedOptions, resolution),
  );
}

function applyActions(draft, actions) {
  return actions.reduce((current, action) => reduceProductCustomizationDraft(current, action), draft);
}

function readyDraft() {
  let draft = selectedDraft();
  draft = reduceProductCustomizationDraft(draft, {
    type: "set_text_value",
    value: { fieldId: nameField.id, fieldCode: nameField.code, kind: "short_text", value: "  Ada  " },
  });
  draft = reduceProductCustomizationDraft(draft, {
    type: "set_text_value",
    value: { fieldId: messageField.id, fieldCode: messageField.code, kind: "long_text", value: "  For you  " },
  });
  for (const entry of [
    receipt("receipt-a", { originalFilename: "a.png" }),
    receipt("receipt-b", { originalFilename: "b.png" }),
    receipt("receipt-c", { originalFilename: "c.png" }),
  ]) {
    draft = reduceProductCustomizationDraft(draft, { type: "record_accepted_receipt", receipt: entry });
  }
  return reduceProductCustomizationDraft(draft, {
    type: "set_image_value",
    value: {
      fieldId: photoField.id,
      fieldCode: photoField.code,
      kind: "image",
      images: [{ receiptId: "receipt-a" }, { receiptId: "receipt-b" }, { receiptId: "receipt-c" }],
    },
  });
}

function handoff(draft, overrides = {}) {
  return evaluateProductCustomizationHandoff({
    draft,
    productId,
    configurationRevision: revision,
    fields,
    options: [size],
    optionValues: [mini, standard],
    variants: [variant()],
    observedAt,
    ...overrides,
  });
}

function summary(draft, overrides = {}) {
  return createProductCustomizationSummary({
    draft,
    configurationRevision: revision,
    fields,
    options: [size],
    optionValues: [mini, standard],
    ...overrides,
  });
}

async function renderStaticComponents() {
  const silentViteLogger = {
    hasWarned: false,
    info() {},
    warn() {},
    warnOnce() {},
    error() {},
    clearScreen() {},
  };
  const server = await createServer({
    root: process.cwd(),
    configFile: false,
    appType: "custom",
    customLogger: silentViteLogger,
    server: { middlewareMode: true, hmr: false, watch: null },
  });
  try {
    const [formModule, summaryModule, handoffModule, detailModule] = await Promise.all([
      server.ssrLoadModule("/app/storefront/ProductCustomizationFormShell.tsx"),
      server.ssrLoadModule("/app/storefront/ProductCustomizationSummary.tsx"),
      server.ssrLoadModule("/app/storefront/ProductCustomizationHandoffGate.tsx"),
      server.ssrLoadModule("/app/storefront/ProductDetailExperience.tsx"),
    ]);
    const emptyDraft = createProductCustomizationDraft({ productId, configurationRevision: revision });
    const current = readyDraft();
    const ready = handoff(current);
    assert.equal(ready.status, "locally_ready");
    return {
      form: renderToStaticMarkup(createElement(formModule.ProductCustomizationFormShell, {
        configurationRevision: revision,
        fields,
        draft: emptyDraft,
        onDraftAction() {},
      })),
      customizationSummary: renderToStaticMarkup(createElement(summaryModule.ProductCustomizationSummary, {
        model: summary(current),
      })),
      handoff: renderToStaticMarkup(createElement(handoffModule.ProductCustomizationHandoffGate, { result: ready })),
      notConfiguredDetail: renderToStaticMarkup(createElement(detailModule.ProductDetailExperience, {
        productId,
        productName: "Test Frame",
        productDescription: "Static component regression fixture.",
        categoryName: "Frames",
        listingPrice: { kind: "single", priceCents: 6990, currency: "USD" },
        fulfillment: {
          fulfillmentType: "physical",
          productionMode: "custom_manufacturing",
          leadTimeLabel: "5–10 business days",
          requiresShipping: true,
        },
        options: [size],
        optionValues: [mini, standard],
        variants: [variant()],
        assets: [],
        customization: { status: "not_configured" },
      })),
    };
  } finally {
    await server.close();
  }
}

test("Task 7.9 actual component static render exposes text/image controls, summary, handoff, and not-configured separation", async () => {
  let fetchCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("network is forbidden in static component rendering");
  };
  try {
    const rendered = await renderStaticComponents();
    assert.match(rendered.form, /<label[^>]*for="[^"]+"[^>]*>.*Name.*Required/s);
    assert.match(rendered.form, /The name shown on your gift\./);
    assert.match(rendered.form, /Maximum 30 characters/);
    assert.match(rendered.form, /<input[^>]*type="text"[^>]*name="customization-field-name"/);
    assert.match(rendered.form, /<textarea[^>]*name="customization-field-message"/);
    assert.match(rendered.form, /Message.*Optional/s);
    assert.match(rendered.form, /aria-describedby="[^"]+-help [^"]+-limit"/);
    assert.match(rendered.form, /Photo.*Required/s);
    assert.match(rendered.form, /<input[^>]*type="file"[^>]*accept="image\/jpeg,image\/png,image\/webp"/);
    assert.match(rendered.form, /Accepted formats: JPEG, PNG, WebP/);
    assert.match(rendered.form, /Maximum file size: 9\.8 KB/);
    assert.match(rendered.form, /Minimum dimensions: 100 × 100px/);
    assert.match(rendered.form, /Recommended dimensions: 1000 × 1000px/);
    assert.match(rendered.form, /Upload image 1/);
    assert.match(rendered.form, /Replace image/);
    assert.match(rendered.form, /Remove image/);
    assert.doesNotMatch(rendered.form.slice(0, rendered.form.indexOf("data-customization-field-id=\"field-photo\"")), /type="file"/);

    assert.match(rendered.customizationSummary, /Selected configuration/);
    assert.match(rendered.customizationSummary, /Your personalization/);
    assert.match(rendered.customizationSummary, /Customer input summary — not a production preview\./);
    assert.match(rendered.customizationSummary, /Ada/);
    assert.doesNotMatch(rendered.customizationSummary, /receipt-a|storageKey|objectKey|bucket|signedUrl|provider/i);

    assert.match(rendered.handoff, /Personalization is locally ready for server verification\./);
    assert.match(rendered.handoff, /Server verification is required before a future configured-item handoff can be accepted\./);
    assert.doesNotMatch(rendered.handoff, /Ready to checkout|Server accepted|Verified|Order ready/i);

    assert.match(rendered.notConfiguredDetail, /Choose your gift/);
    assert.doesNotMatch(rendered.notConfiguredDetail, /Personalize your gift|Customization summary|Personalization status/);
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Task 7.9 Variant-first and upload-first flows retain independent catalog and customer state", () => {
  let variantFirst = selectedDraft();
  const initialSelection = structuredClone(variantFirst.selectedOptions);
  const initialVariant = structuredClone(variantFirst.selectedVariant);
  variantFirst = reduceProductCustomizationDraft(variantFirst, {
    type: "set_text_value",
    value: { fieldId: nameField.id, fieldCode: nameField.code, kind: "short_text", value: "  Ada  " },
  });
  variantFirst = applyActions(variantFirst, createAcceptedImageUploadActions({
    fieldId: photoField.id,
    fieldCode: photoField.code,
    operationId: "variant-first-photo",
    receipt: receipt("receipt-variant-first"),
  }));
  assert.deepEqual(variantFirst.selectedOptions, initialSelection);
  assert.deepEqual(variantFirst.selectedVariant, initialVariant);

  let uploadFirst = createProductCustomizationDraft({ productId, configurationRevision: revision });
  uploadFirst = applyActions(uploadFirst, createAcceptedImageUploadActions({
    fieldId: photoField.id,
    fieldCode: photoField.code,
    operationId: "upload-first-photo",
    receipt: receipt("receipt-upload-first"),
  }));
  uploadFirst = reduceProductCustomizationDraft(uploadFirst, {
    type: "set_text_value",
    value: { fieldId: nameField.id, fieldCode: nameField.code, kind: "short_text", value: "Ada" },
  });
  uploadFirst = applyVariantSelectionToProductCustomizationDraft(
    uploadFirst,
    createProductDetailVariantSelectionEvent(selectedMini, resolveVariantSelection(selectionInput())),
  );
  assert.deepEqual(uploadFirst.selectedVariant, { variantId: "variant-mini", skuCode: "UX-FRAME-MINI" });
  assert.deepEqual(uploadFirst.selectedOptions, selectedMini);
  assert.deepEqual(uploadFirst.values.find((value) => value.fieldId === photoField.id)?.images, [{ receiptId: "receipt-upload-first" }]);
  assert.equal(uploadFirst.values.find((value) => value.fieldId === nameField.id)?.value, "Ada");
});

test("Task 7.9 customer content cannot change authoritative Variant price, currency, SKU, or availability", () => {
  const before = resolveVariantSelection(selectionInput());
  assert.equal(before.status, "resolved");
  let current = readyDraft();
  current = reduceProductCustomizationDraft(current, {
    type: "set_text_value",
    value: { fieldId: nameField.id, fieldCode: nameField.code, kind: "short_text", value: "Grace" },
  });
  current = reduceProductCustomizationDraft(current, {
    type: "set_image_value",
    value: {
      fieldId: photoField.id, fieldCode: photoField.code, kind: "image",
      images: [{ receiptId: "receipt-c" }, { receiptId: "receipt-a", crop: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 } }],
    },
  });
  const after = resolveVariantSelection(selectionInput(current.selectedOptions));
  assert.equal(after.status, "resolved");
  assert.deepEqual(
    { skuCode: after.variant.skuCode, priceCents: after.variant.priceCents, currency: after.variant.currency, available: after.variant.isAvailable },
    { skuCode: before.variant.skuCode, priceCents: before.variant.priceCents, currency: before.variant.currency, available: before.variant.isAvailable },
  );

  const unavailableVariant = variant({
    id: "variant-standard",
    skuCode: "UX-FRAME-STANDARD",
    isAvailable: false,
    selectedOptions: selectedStandard,
  });
  let unavailable = readyDraft();
  unavailable = applyVariantSelectionToProductCustomizationDraft(
    unavailable,
    createProductDetailVariantSelectionEvent(selectedStandard, resolveVariantSelection(selectionInput(selectedStandard, [unavailableVariant]))),
  );
  const unavailableGate = handoff(unavailable, { variants: [unavailableVariant] });
  assert.equal(unavailableGate.status, "blocked");
  assert.equal(unavailableGate.reason, "variant_unavailable");
  assert.equal(unavailable.values.find((value) => value.fieldId === nameField.id)?.value, "  Ada  ");
  assert.deepEqual(unavailable.values.find((value) => value.fieldId === photoField.id)?.images.map((image) => image.receiptId), ["receipt-a", "receipt-b", "receipt-c"]);
});

test("Task 7.9 integrated replace/remove, ordering, crop, duplicate, and maximum rules preserve current customer references", () => {
  const crop = { x: 0.1, y: 0.2, width: 0.5, height: 0.6 };
  const initialSlots = [
    { slotId: "slot-a", image: { receiptId: "receipt-a" } },
    { slotId: "slot-b", image: { receiptId: "receipt-b" } },
    { slotId: "slot-c", image: { receiptId: "receipt-c" } },
  ];
  const withCrop = setProductCustomizationImageSlotCrop({ slots: initialSlots, slotId: "slot-b", crop });
  const moved = moveProductCustomizationImageSlot({
    slots: moveProductCustomizationImageSlot({ slots: withCrop, slotId: "slot-c", direction: "up" }),
    slotId: "slot-c",
    direction: "up",
  });
  const ordered = toOrderedProductCustomizationImageValue({ fieldId: photoField.id, fieldCode: photoField.code, slots: moved });
  assert.deepEqual(ordered?.images, [
    { receiptId: "receipt-c" },
    { receiptId: "receipt-a" },
    { receiptId: "receipt-b", crop },
  ]);
  assert.equal(setProductCustomizationImageSlotReceipt({
    slots: moved,
    slotId: "slot-a",
    image: { receiptId: "receipt-b" },
  }), moved, "one receipt cannot enter two positions");
  assert.equal(preflightCustomerImage({
    declaredContentType: "image/png", declaredByteSize: 800, decodedDimensions: { width: 500, height: 500 }, intendedImageCount: 4,
  }, photoField.constraints).issues.some((issue) => issue.code === "count_too_high"), true, "configured maxImageCount remains authoritative");

  let current = readyDraft();
  current = reduceProductCustomizationDraft(current, { type: "set_image_value", value: ordered });
  const currentSummary = summary(current);
  const imageRow = currentSummary.personalization.rows.find((row) => row.kind === "image");
  assert.equal(imageRow.kind, "image");
  assert.deepEqual(imageRow.images.map((image) => image.filename), ["c.png", "a.png", "b.png"]);
  assert.deepEqual(imageRow.images[2].crop, { left: "10%", top: "20%", width: "50%", height: "60%" });
  const currentHandoff = handoff(current);
  assert.equal(currentHandoff.status, "locally_ready");
  assert.deepEqual(currentHandoff.handoff.customizationValues.find((value) => value.kind === "image")?.images, ordered.images);

  const replacementFailed = applyActions(current, [
    ...createImageUploadStartedActions({ draft: current, fieldId: photoField.id, slotId: "slot-b", operationId: "replacement-failed" }),
    createFailedImageUploadAction({ fieldId: photoField.id, operationId: "replacement-failed" }),
  ]);
  assert.deepEqual(summary(replacementFailed).personalization.rows.find((row) => row.kind === "image")?.images.map((image) => image.filename), ["c.png", "a.png", "b.png"]);
  assert.equal(handoff(replacementFailed).reason, "upload_failed");

  const replacementReceipt = receipt("receipt-x", { originalFilename: "x.png" });
  const replacementValue = {
    ...ordered,
    images: [{ receiptId: "receipt-c" }, { receiptId: "receipt-a" }, { receiptId: "receipt-x" }],
  };
  const replacementSucceeded = applyActions(replacementFailed, createAcceptedImageUploadActions({
    fieldId: photoField.id,
    fieldCode: photoField.code,
    operationId: "replacement-succeeded",
    receipt: replacementReceipt,
    value: replacementValue,
  }));
  const replacementRow = summary(replacementSucceeded).personalization.rows.find((row) => row.kind === "image");
  assert.equal(replacementRow.kind, "image");
  assert.deepEqual(replacementRow.images.map((image) => image.filename), ["c.png", "a.png", "x.png"]);
  assert.equal(replacementRow.images[2].crop, undefined, "a replacement never inherits the old receipt crop");

  const removed = reduceProductCustomizationDraft(replacementSucceeded, {
    type: "set_image_value",
    value: { ...replacementValue, images: [replacementValue.images[0], replacementValue.images[2]] },
  });
  const removedRow = summary(removed).personalization.rows.find((row) => row.kind === "image");
  assert.equal(removedRow.kind, "image");
  assert.deepEqual(removedRow.images.map((image) => image.filename), ["c.png", "x.png"]);
  assert.equal(removed.acceptedReceipts.some((entry) => entry.receiptId === "receipt-b"), true, "local removal does not claim provider deletion");
});

test("Task 7.9 preview lifecycle and image preflight remain local, bounded, and retryable", () => {
  const calls = { created: [], revoked: [] };
  const urlApi = {
    createObjectURL(file) { calls.created.push(file.name); return `blob:local-${calls.created.length}`; },
    revokeObjectURL(url) { calls.revoked.push(url); },
  };
  const previewA = createLocalCustomerInputPreview(new File(["a"], "a.png", { type: "image/png" }), urlApi);
  const previewB = replaceLocalCustomerInputPreview(previewA, new File(["b"], "b.png", { type: "image/png" }), urlApi);
  const previewC = createLocalCustomerInputPreview(new File(["c"], "c.png", { type: "image/png" }), urlApi);
  const previewD = replaceLocalCustomerInputPreview(previewC, new File(["d"], "d.png", { type: "image/png" }), urlApi);
  disposeLocalCustomerInputPreview(previewB);
  disposeLocalCustomerInputPreview(previewD);
  assert.deepEqual(calls.revoked, ["blob:local-1", "blob:local-3", "blob:local-2", "blob:local-4"]);

  const warning = preflightCustomerImage({
    declaredContentType: "image/png", declaredByteSize: 800, originalFilename: "safe.png", decodedDimensions: { width: 500, height: 500 }, intendedImageCount: 1,
  }, photoField.constraints);
  assert.equal(warning.canAttemptUpload, true);
  assert.deepEqual(warning.warnings.map((entry) => entry.code), ["below_recommended_dimensions"]);
  for (const candidate of [
    { declaredContentType: "image/gif", declaredByteSize: 800, decodedDimensions: { width: 500, height: 500 } },
    { declaredContentType: "image/png", declaredByteSize: 10_001, decodedDimensions: { width: 500, height: 500 } },
    { declaredContentType: "image/png", declaredByteSize: 800, decodedDimensions: { width: 99, height: 100 } },
  ]) assert.equal(preflightCustomerImage(candidate, photoField.constraints).canAttemptUpload, false);
  const cropDisabled = { ...photoField, constraints: { ...photoField.constraints, cropEnabled: false } };
  assert.equal(validateCustomizationCropPolicy(cropDisabled, {
    fieldId: photoField.id,
    fieldCode: photoField.code,
    kind: "image",
    images: [{ receiptId: "receipt-a", crop: { x: 0, y: 0, width: 1, height: 1 } }],
  }).ok, false);

  let failed = readyDraft();
  failed = reduceProductCustomizationDraft(failed, createFailedImageUploadAction({ fieldId: photoField.id, operationId: "retry-me" }));
  const failedGate = handoff(failed);
  assert.equal(failedGate.status, "blocked");
  assert.equal(failedGate.reason, "upload_failed");
  assert.match(failedGate.message, /Retry.*remove/i);
  assert.doesNotMatch(failedGate.message, /Error|stack|provider/i);
});

test("Task 7.9 configured-empty, stale, expired, and duplicate customer-label regressions preserve existing boundaries", () => {
  const configuredEmpty = handoff(selectedDraft(), { fields: [] });
  assert.equal(configuredEmpty.status, "locally_ready");
  assert.deepEqual(configuredEmpty.handoff.customizationValues, []);

  const stale = handoff(readyDraft(), { configurationRevision: "customization-ux-v2" });
  assert.equal(stale.status, "blocked");
  assert.equal(stale.reason, "stale_configuration");
  let expiredDraft = readyDraft();
  expiredDraft = reduceProductCustomizationDraft(expiredDraft, {
    type: "record_accepted_receipt",
    receipt: receipt("receipt-a", { expiresAt: observedAt }),
  });
  const expired = handoff(expiredDraft);
  assert.equal(expired.status, "blocked");
  assert.equal(expired.reason, "expired");

  const duplicateLabelOption = { ...size, id: "option-finish", code: "finish", name: "Size", position: 1 };
  const duplicateLabelValue = { id: "value-finish", productId, optionId: duplicateLabelOption.id, code: "matte", label: "Matte", position: 0 };
  const duplicateLabelFields = [
    { ...nameField, id: "field-message-a", code: "message-a", label: "Message" },
    { ...messageField, id: "field-message-b", code: "message-b", label: "Message", position: 1 },
  ];
  const duplicateDraft = reduceProductCustomizationDraft(
    reduceProductCustomizationDraft(selectedDraft(), {
      type: "set_text_value",
      value: { fieldId: "field-message-a", fieldCode: "message-a", kind: "short_text", value: "First" },
    }),
    {
      type: "set_text_value",
      value: { fieldId: "field-message-b", fieldCode: "message-b", kind: "long_text", value: "Second" },
    },
  );
  const duplicateSummary = createProductCustomizationSummary({
    draft: duplicateDraft,
    configurationRevision: revision,
    fields: duplicateLabelFields,
    options: [size, duplicateLabelOption],
    optionValues: [mini, standard, duplicateLabelValue],
  });
  assert.deepEqual(duplicateSummary.configuration.options.map((entry) => entry.renderKey), [size.id, duplicateLabelOption.id]);
  assert.deepEqual(duplicateSummary.personalization.rows.map((entry) => entry.renderKey), ["field-message-a", "field-message-b"]);
  assert.equal(JSON.stringify(duplicateSummary).includes("receipt"), false);
});

test("Task 7.9 same-Product configuration initialization creates only an absent draft and never silently rebases a current one", () => {
  const initialized = initializeProductCustomizationDraftForConfiguration(null, {
    productId,
    configurationRevision: revision,
  });
  assert.deepEqual(initialized, createProductCustomizationDraft({ productId, configurationRevision: revision }));

  const existing = readyDraft();
  const retained = initializeProductCustomizationDraftForConfiguration(existing, {
    productId,
    configurationRevision: "customization-ux-v2",
  });
  assert.equal(retained, existing);
  assert.equal(retained.configurationRevision, revision);
  assert.deepEqual(retained.selectedVariant, existing.selectedVariant);
  assert.deepEqual(retained.values, existing.values);
  assert.equal(handoff(retained, { configurationRevision: "customization-ux-v2" }).reason, "stale_configuration");

  const retainedSelection = initializeProductCustomizationDraftForConfiguration(null, {
    productId,
    configurationRevision: revision,
    variantSelection: createProductDetailVariantSelectionEvent(selectedMini, resolveVariantSelection(selectionInput())),
  });
  assert.deepEqual(retainedSelection.selectedVariant, { variantId: "variant-mini", skuCode: "UX-FRAME-MINI" });
  assert.deepEqual(retainedSelection.selectedOptions, selectedMini);
});

test("Task 7.9 parent lazy action path persists the first text and image edits after same-Product activation", () => {
  const selectionEvent = createProductDetailVariantSelectionEvent(
    selectedMini,
    resolveVariantSelection(selectionInput()),
  );
  let persisted = null;
  persisted = applyProductCustomizationActionForConfiguration(persisted, {
    productId,
    configurationRevision: revision,
    variantSelection: selectionEvent,
    action: {
      type: "set_text_value",
      value: { fieldId: nameField.id, fieldCode: nameField.code, kind: "short_text", value: "Ada" },
    },
  });
  assert.ok(persisted);
  assert.equal(persisted.configurationRevision, revision);
  assert.deepEqual(persisted.selectedVariant, { variantId: "variant-mini", skuCode: "UX-FRAME-MINI" });
  assert.deepEqual(persisted.selectedOptions, selectedMini);
  assert.deepEqual(persisted.values, [{ fieldId: nameField.id, fieldCode: nameField.code, kind: "short_text", value: "Ada" }]);

  persisted = applyProductCustomizationActionForConfiguration(persisted, {
    productId,
    configurationRevision: revision,
    variantSelection: selectionEvent,
    action: {
      type: "set_text_value",
      value: { fieldId: messageField.id, fieldCode: messageField.code, kind: "long_text", value: "Hello" },
    },
  });
  assert.deepEqual(persisted.values.map((value) => value.value), ["Ada", "Hello"]);
  assert.deepEqual(persisted.selectedOptions, selectedMini);

  let imageFirst = null;
  imageFirst = applyProductCustomizationActionForConfiguration(imageFirst, {
    productId,
    configurationRevision: revision,
    variantSelection: selectionEvent,
    action: {
      type: "set_image_value",
      value: { fieldId: photoField.id, fieldCode: photoField.code, kind: "image", images: [{ receiptId: "receipt-first-image" }] },
    },
  });
  assert.deepEqual(imageFirst.selectedVariant, persisted.selectedVariant);
  assert.deepEqual(imageFirst.selectedOptions, persisted.selectedOptions);
  assert.deepEqual(imageFirst.values, [{ fieldId: photoField.id, fieldCode: photoField.code, kind: "image", images: [{ receiptId: "receipt-first-image" }] }]);
});

test("Task 7.9 parent lazy action path preserves an old revision and customer values when authority changes", () => {
  let persisted = readyDraft();
  const originalValues = structuredClone(persisted.values);
  persisted = applyProductCustomizationActionForConfiguration(persisted, {
    productId,
    configurationRevision: "customization-ux-v2",
    variantSelection: null,
    action: {
      type: "set_text_value",
      value: { fieldId: messageField.id, fieldCode: messageField.code, kind: "long_text", value: "Still local" },
    },
  });
  assert.equal(persisted.configurationRevision, revision);
  assert.deepEqual(persisted.selectedVariant, readyDraft().selectedVariant);
  assert.equal(persisted.values.find((value) => value.fieldId === messageField.id)?.value, "Still local");
  assert.equal(persisted.values.some((value) => value.fieldId === originalValues[0].fieldId), true);
  const stale = handoff(persisted, { configurationRevision: "customization-ux-v2" });
  assert.equal(stale.status, "blocked");
  assert.equal(stale.reason, "stale_configuration");
});

test("Task 7.9 source safety assertions cover local cleanup wiring, accessible native controls, source boundaries, and same-Product initialization", async () => {
  const [image, text, summaryComponent, summaryModel, detail, handoffComponent] = await Promise.all([
    readFile(new URL("../app/storefront/ProductCustomizationImageField.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/storefront/ProductCustomizationTextField.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/storefront/ProductCustomizationSummary.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/application/product-customization-summary.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/storefront/ProductDetailExperience.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/storefront/ProductCustomizationHandoffGate.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(image, /useEffect\(\(\) => \(\) => \{\s*slotsRef\.current\.forEach\(\(slot\) => disposeLocalCustomerInputPreview\(slot\.preview\)\);/s);
  assert.match(image, /<label className=\{styles\.customizationFileLabel\} htmlFor=\{controlId\}>/);
  assert.match(image, /type="file"/);
  assert.match(image, /accept=\{props\.field\.constraints\.allowedMimeTypes\.join/);
  assert.match(image, /type="button"/);
  assert.match(image, /t\("Move image"\)[\s\S]*index \+ 1[\s\S]*t\("up"\)/);
  assert.match(image, /Adjust crop/);
  assert.match(image, /<label key=\{key\} htmlFor=\{inputId\}>/);
  assert.match(image, /aria-live="polite"/);
  assert.match(text, /htmlFor=\{controlId\}/);
  assert.match(text, /aria-describedby/);
  assert.match(text, /aria-invalid/);
  assert.match(handoffComponent, /aria-live="polite"/);
  const selectionHandler = image.slice(image.indexOf("function handleFileChange"), image.indexOf("function handlePreviewLoad"));
  assert.doesNotMatch(selectionHandler, /fetch\s*\(|uploadCustomerCustomizationImage|\/api\/uploads/);
  assert.doesNotMatch(`${image}\n${text}\n${summaryComponent}\n${detail}`, /@supabase\/supabase-js|storageKey|objectKey|signedUrl|bucket|provider path|Stripe|PayPal|api\/orders/i);
  assert.match(summaryModel, /readonly renderKey: string/);
  assert.match(summaryComponent, /key=\{option\.renderKey\}/);
  assert.match(summaryComponent, /key=\{row\.renderKey\}/);
  assert.match(summaryComponent, /key=\{image\.renderKey\}/);
  assert.match(detail, /const visibleDraft = customizationConfiguration\s+\? initializeProductCustomizationDraftForConfiguration/s);
  const customizationHandler = detail.slice(detail.indexOf("const handleCustomizationAction"), detail.indexOf("const summary"));
  assert.match(customizationHandler, /setDraft\(\(current\) => applyProductCustomizationActionForConfiguration\(current/s);
  assert.match(customizationHandler, /variantSelection: lastVariantSelection/);
  const variantHandler = detail.slice(detail.indexOf("const handleVariantSelection"), detail.indexOf("const handleCustomizationAction"));
  assert.match(variantHandler, /setLastVariantSelection\(event\)/);
  assert.match(variantHandler, /applyVariantSelectionToProductCustomizationDraft/);
  assert.match(detail, /variantSelection: lastVariantSelection/);
  assert.match(detail, /observedAt: new Date\(\)\.toISOString\(\)/);
});
