import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createTextCustomizationDraftAction,
  getCustomizationTextFieldFeedback,
  getVisibleCustomizationTextFieldIssues,
  isActiveTextCustomizationField,
} from "../app/application/customization-text-field-feedback.ts";
import {
  applyVariantSelectionToProductCustomizationDraft,
  createProductDetailVariantSelectionEvent,
} from "../app/application/product-detail-customization-composition.ts";
import { resolveVariantSelection } from "../app/application/catalog-storefront.ts";
import {
  createProductCustomizationDraft,
  reduceProductCustomizationDraft,
} from "../app/domain/product-customization-draft.ts";
import { validateCustomizationValuesAgainstFields } from "../app/domain/customization-validation.ts";

const productId = "product-custom-frame";
const revision = "customization-v1";
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
  constraints: { maxLength: 12, helpText: "Use the name to print on the gift." },
};
const imageField = {
  id: "field-photo",
  productId,
  code: "photo",
  label: "Reference image",
  kind: "image",
  required: true,
  isActive: true,
  position: 1,
  configurationRevision: revision,
  constraints: {
    allowedMimeTypes: ["image/jpeg"],
    maxBytes: 1_000,
    minDimensions: { width: 100, height: 100 },
    minImageCount: 1,
    maxImageCount: 1,
    cropEnabled: false,
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
  constraints: { maxLength: 5, helpText: "A short note for the recipient." },
};
const inactiveTextField = { ...messageField, id: "field-archived", code: "archived", isActive: false, position: 3 };
const fields = [nameField, imageField, messageField, inactiveTextField];

function draft() {
  return createProductCustomizationDraft({ productId, configurationRevision: revision });
}

function setText(current, field, value) {
  return reduceProductCustomizationDraft(current, createTextCustomizationDraftAction(field, value));
}

function issueCodes(feedback) {
  return feedback.issues.map((issue) => issue.code);
}

test("active text filter preserves authoritative relative position and excludes image/inactive fields", () => {
  assert.deepEqual(fields.filter(isActiveTextCustomizationField).map((field) => field.id), [
    nameField.id,
    messageField.id,
  ]);
});

test("short and long text actions retain stable field identity, kind, and raw browser value", () => {
  const shortAction = createTextCustomizationDraftAction(nameField, "  Ada  ");
  const longAction = createTextCustomizationDraftAction(messageField, "Hello");
  assert.deepEqual(shortAction, {
    type: "set_text_value",
    value: { fieldId: nameField.id, fieldCode: nameField.code, kind: "short_text", value: "  Ada  " },
  });
  assert.deepEqual(longAction, {
    type: "set_text_value",
    value: { fieldId: messageField.id, fieldCode: messageField.code, kind: "long_text", value: "Hello" },
  });

  const updated = reduceProductCustomizationDraft(
    reduceProductCustomizationDraft(draft(), shortAction),
    longAction,
  );
  assert.deepEqual(updated.values, [shortAction.value, longAction.value]);
});

test("raw whitespace stays in the draft while existing validation derives normalized text", () => {
  const current = setText(draft(), nameField, "  Ada  ");
  assert.equal(current.values[0].kind, "short_text");
  assert.equal(current.values[0].value, "  Ada  ");

  const validation = validateCustomizationValuesAgainstFields({
    productId,
    configurationRevision: revision,
    authoritativeConfigurationRevision: revision,
    fields: [nameField],
    values: current.values,
    resolvedImageMetadata: [],
  });
  assert.equal(validation.ok, true);
  assert.ok(validation.ok);
  const normalized = validation.value;
  assert.equal(normalized[0].kind, "short_text");
  assert.equal(normalized[0].value, "Ada");
});

test("feedback reuses validator length and required issue semantics without truncating raw text", () => {
  const overLimit = setText(draft(), messageField, "  too long  ");
  const overLimitFeedback = getCustomizationTextFieldFeedback({ draft: overLimit, fields, field: messageField });
  assert.equal(overLimitFeedback.rawValue, "  too long  ");
  assert.ok(issueCodes(overLimitFeedback).includes("text_too_long"));
  assert.equal(getVisibleCustomizationTextFieldIssues(overLimitFeedback.issues, false).length, 1);

  const whitespaceWithinNormalizedLimit = setText(draft(), messageField, "  Ada  ");
  const whitespaceFeedback = getCustomizationTextFieldFeedback({
    draft: whitespaceWithinNormalizedLimit,
    fields,
    field: messageField,
  });
  assert.equal(whitespaceFeedback.rawValue.length > messageField.constraints.maxLength, true);
  assert.equal(issueCodes(whitespaceFeedback).includes("text_too_long"), false);

  const missingFeedback = getCustomizationTextFieldFeedback({ draft: draft(), fields, field: nameField });
  assert.ok(issueCodes(missingFeedback).includes("required_field_missing"));
  assert.deepEqual(getVisibleCustomizationTextFieldIssues(missingFeedback.issues, false), []);
  assert.ok(getVisibleCustomizationTextFieldIssues(missingFeedback.issues, true).some((issue) => issue.code === "required_field_missing"));

  const emptied = setText(setText(draft(), nameField, "Ada"), nameField, "");
  const emptyFeedback = getCustomizationTextFieldFeedback({ draft: emptied, fields, field: nameField });
  assert.equal(emptyFeedback.rawValue, "");
  assert.ok(issueCodes(emptyFeedback).includes("required_field_empty"));
});

test("typing text preserves already-resolved Variant/SKU and selected Options", () => {
  const selectedOptions = [{ optionId: "option-size", valueId: "value-mini" }];
  const resolution = resolveVariantSelection({
    productId,
    options: [{ id: "option-size", productId, code: "size", name: "Size", kind: "size", required: true, position: 0 }],
    optionValues: [{ id: "value-mini", productId, optionId: "option-size", code: "mini", label: "Mini", position: 0 }],
    variants: [{
      id: "variant-mini", productId, skuCode: "FRAME-MINI", priceCents: 6_990, currency: "USD",
      isActive: true, isAvailable: true, selectedOptions,
    }],
    selectedOptions,
  });
  const selected = applyVariantSelectionToProductCustomizationDraft(
    draft(),
    createProductDetailVariantSelectionEvent(selectedOptions, resolution),
  );
  const typed = setText(selected, nameField, "Ada");
  assert.deepEqual(typed.selectedVariant, selected.selectedVariant);
  assert.deepEqual(typed.selectedOptions, selected.selectedOptions);
});

test("text-first local input survives a later canonical Variant event without network activity", () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("Text editing must not perform network I/O.");
  };
  try {
    const textFirst = setText(draft(), nameField, "  Ada  ");
    const selectedOptions = [{ optionId: "option-size", valueId: "value-mini" }];
    const event = {
      selectedOptions,
      resolved: {
        productId,
        variantId: "variant-mini",
        skuCode: "FRAME-MINI",
        selectedOptions,
      },
    };
    const composed = applyVariantSelectionToProductCustomizationDraft(textFirst, event);
    assert.equal(composed.values[0].kind, "short_text");
    assert.equal(composed.values[0].value, "  Ada  ");
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Task 7.3 text UI source enforces bounded local controls and accessibility boundaries", async () => {
  const [shell, textField, helper] = await Promise.all([
    readFile(new URL("../app/storefront/ProductCustomizationFormShell.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/storefront/ProductCustomizationTextField.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/application/customization-text-field-feedback.ts", import.meta.url), "utf8"),
  ]);

  assert.match(shell, /const activeFields = props\.fields\.filter\(\(field\) => field\.isActive\)/);
  assert.match(shell, /isActiveTextCustomizationField\(field\)/);
  assert.match(shell, /<ProductCustomizationTextField/);
  assert.match(shell, /ReadonlySet<string>/);
  assert.doesNotMatch(shell, /textValues|localStorage|sessionStorage|fetch\s*\(|<form/i);

  assert.match(textField, /useId/);
  assert.match(textField, /<label[^>]+htmlFor=\{controlId\}/);
  assert.match(textField, /<input[^>]+type="text"/);
  assert.match(textField, /<textarea/);
  assert.match(textField, /aria-describedby/);
  assert.match(textField, /aria-live="polite"/);
  assert.match(textField, /t\("Maximum"\)[\s\S]*props\.field\.constraints\.maxLength[\s\S]*t\("characters"\)/);
  assert.doesNotMatch(textField, /maxLength=/);
  assert.doesNotMatch(textField, /resolveVariantSelection|canSelectOptionValue|FileReader|URL\.createObjectURL|api\/uploads|preview|priceCents|currency|surcharge|cartKey|api\/orders|Stripe|PayPal/i);

  assert.match(helper, /validateCustomizationValuesAgainstFields/);
  assert.doesNotMatch(helper, /fetch\s*\(|Date\.now|@supabase\/supabase-js|bucket|storageKey|objectKey|signedUrl|photoPath|cookie/i);
});
