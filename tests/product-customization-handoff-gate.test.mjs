import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { resolveVariantSelection } from "../app/application/catalog-storefront.ts";
import { evaluateProductCustomizationHandoff } from "../app/application/product-customization-handoff-gate.ts";
import { parseConfiguredItemHandoff } from "../app/domain/configured-item.ts";
import {
  createProductCustomizationDraft,
  reduceProductCustomizationDraft,
} from "../app/domain/product-customization-draft.ts";

const productId = "product-frame";
const revision = "customization-v1";
const observedAt = "2026-08-14T00:00:00.000Z";
const size = { id: "option-size", productId, code: "size", name: "Size", kind: "size", required: true, position: 0 };
const mini = { id: "value-mini", productId, optionId: size.id, code: "mini", label: "Mini", position: 0 };
const standard = { id: "value-standard", productId, optionId: size.id, code: "standard", label: "Standard", position: 1 };
const selectedMini = [{ optionId: size.id, valueId: mini.id }];
const nameField = { id: "field-name", productId, code: "name", label: "Name", kind: "short_text", required: true, isActive: true, position: 0, configurationRevision: revision, constraints: { maxLength: 30 } };
const photoField = {
  id: "field-photo", productId, code: "photos", label: "Reference images", kind: "image", required: true, isActive: true, position: 1, configurationRevision: revision,
  constraints: { allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"], maxBytes: 10_000, minDimensions: { width: 1, height: 1 }, minImageCount: 1, maxImageCount: 3, cropEnabled: true },
};

function variant(overrides = {}) {
  return {
    id: "variant-mini", productId, skuCode: "FRAME-MINI", priceCents: 6_990, currency: "USD",
    isActive: true, isAvailable: true, selectedOptions: selectedMini,
    ...overrides,
  };
}

function receipt(receiptId = "receipt-a", overrides = {}) {
  return {
    receiptId, originalFilename: "portrait.png", contentType: "image/png", byteSize: 800,
    dimensions: { width: 1200, height: 900 }, createdAt: "2026-08-13T00:00:00.000Z",
    expiresAt: "2026-08-15T00:00:00.000Z", lifecycle: "active", ...overrides,
  };
}

function input(draft, overrides = {}) {
  return {
    draft,
    productId,
    configurationRevision: revision,
    fields: [nameField, photoField],
    options: [size],
    optionValues: [mini, standard],
    variants: [variant()],
    observedAt,
    ...overrides,
  };
}

function selectedDraft() {
  let draft = createProductCustomizationDraft({ productId, configurationRevision: revision });
  draft = reduceProductCustomizationDraft(draft, { type: "set_selected_options", selectedOptions: selectedMini });
  return reduceProductCustomizationDraft(draft, {
    type: "set_variant_selection",
    selection: { variantId: "variant-mini", skuCode: "FRAME-MINI" },
  });
}

function readyDraft() {
  let draft = selectedDraft();
  draft = reduceProductCustomizationDraft(draft, {
    type: "set_text_value",
    value: { fieldId: nameField.id, fieldCode: nameField.code, kind: "short_text", value: "  Ada  " },
  });
  for (const entry of [receipt("receipt-a"), receipt("receipt-b"), receipt("receipt-c")]) {
    draft = reduceProductCustomizationDraft(draft, { type: "record_accepted_receipt", receipt: entry });
  }
  return reduceProductCustomizationDraft(draft, {
    type: "set_image_value",
    value: {
      fieldId: photoField.id,
      fieldCode: photoField.code,
      kind: "image",
      images: [
        { receiptId: "receipt-a" },
        { receiptId: "receipt-b", crop: { x: 0.1, y: 0.2, width: 0.5, height: 0.6 } },
        { receiptId: "receipt-c" },
      ],
    },
  });
}

function blocked(result, reason) {
  assert.equal(result.status, "blocked");
  assert.equal(result.reason, reason);
  return result;
}

test("locally ready handoff re-resolves the current SKU and uses normalized values only", () => {
  const draft = readyDraft();
  const result = evaluateProductCustomizationHandoff(input(draft));
  assert.equal(result.status, "locally_ready");
  assert.equal(result.requiresServerVerification, true);
  assert.deepEqual(result.handoff, {
    productId,
    variantId: "variant-mini",
    skuCode: "FRAME-MINI",
    selectedOptions: selectedMini,
    configurationRevision: revision,
    customizationValues: [
      { fieldId: nameField.id, fieldCode: nameField.code, kind: "short_text", value: "Ada" },
      {
        fieldId: photoField.id,
        fieldCode: photoField.code,
        kind: "image",
        images: [
          { receiptId: "receipt-a" },
          { receiptId: "receipt-b", crop: { x: 0.1, y: 0.2, width: 0.5, height: 0.6 } },
          { receiptId: "receipt-c" },
        ],
      },
    ],
  });
  assert.equal(draft.values[0].kind, "short_text");
  assert.equal(draft.values[0].value, "  Ada  ");
  assert.equal(parseConfiguredItemHandoff(result.handoff).ok, true);
  assert.equal(JSON.stringify(result.handoff).includes("portrait.png"), false);
  assert.equal(JSON.stringify(result.handoff).includes("expiresAt"), false);
});

test("configured-empty is valid only with current authority and emits an empty normalized handoff", () => {
  const result = evaluateProductCustomizationHandoff(input(selectedDraft(), { fields: [] }));
  assert.equal(result.status, "locally_ready");
  assert.deepEqual(result.handoff.customizationValues, []);

  const stale = evaluateProductCustomizationHandoff(input(selectedDraft(), {
    fields: [],
    configurationRevision: "customization-v2",
  }));
  assert.match(blocked(stale, "stale_configuration").message, /requirements changed/i);

  let unknownValue = selectedDraft();
  unknownValue = reduceProductCustomizationDraft(unknownValue, {
    type: "set_text_value",
    value: { fieldId: "field-unknown", fieldCode: "unknown", kind: "short_text", value: "Ada" },
  });
  blocked(evaluateProductCustomizationHandoff(input(unknownValue, { fields: [] })), "invalid");
});

test("variant resolution blocks incomplete, unavailable, invalid, and mismatched local selections without rewriting the draft", () => {
  const material = { id: "option-material", productId, code: "material", name: "Material", kind: "material", required: true, position: 1 };
  const resin = { id: "value-resin", productId, optionId: material.id, code: "resin", label: "Resin", position: 0 };
  const fullOptions = [...selectedMini, { optionId: material.id, valueId: resin.id }];
  const partial = selectedDraft();
  const incomplete = evaluateProductCustomizationHandoff(input(partial, {
    options: [size, material],
    optionValues: [mini, standard, resin],
    variants: [variant({ selectedOptions: fullOptions })],
  }));
  assert.match(blocked(incomplete, "variant_incomplete").message, /Choose all required product options/i);

  const unavailableOptions = [{ optionId: size.id, valueId: standard.id }];
  let unavailable = createProductCustomizationDraft({ productId, configurationRevision: revision });
  unavailable = reduceProductCustomizationDraft(unavailable, { type: "set_selected_options", selectedOptions: unavailableOptions });
  blocked(evaluateProductCustomizationHandoff(input(unavailable, {
    variants: [variant({ selectedOptions: unavailableOptions, isAvailable: false })],
  })), "variant_unavailable");

  let invalid = createProductCustomizationDraft({ productId, configurationRevision: revision });
  invalid = reduceProductCustomizationDraft(invalid, {
    type: "set_selected_options",
    selectedOptions: [{ optionId: "option-unknown", valueId: "value-unknown" }],
  });
  blocked(evaluateProductCustomizationHandoff(input(invalid)), "variant_invalid");

  const mismatch = reduceProductCustomizationDraft(readyDraft(), {
    type: "set_variant_selection",
    selection: { variantId: "variant-other", skuCode: "FRAME-OTHER" },
  });
  const mismatchResult = evaluateProductCustomizationHandoff(input(mismatch));
  blocked(mismatchResult, "variant_mismatch");
  assert.deepEqual(mismatch.selectedVariant, { variantId: "variant-other", skuCode: "FRAME-OTHER" });
});

test("local gate gives bounded incomplete, upload, expiry, stale, and validation messages without a handoff", () => {
  let requiredMissing = selectedDraft();
  blocked(evaluateProductCustomizationHandoff(input(requiredMissing)), "incomplete");

  let tooLong = readyDraft();
  tooLong = reduceProductCustomizationDraft(tooLong, {
    type: "set_text_value",
    value: { fieldId: nameField.id, fieldCode: nameField.code, kind: "short_text", value: "A".repeat(31) },
  });
  blocked(evaluateProductCustomizationHandoff(input(tooLong)), "invalid");

  let pending = readyDraft();
  pending = reduceProductCustomizationDraft(pending, {
    type: "upload_started", operation: { operationId: "upload-new", fieldId: photoField.id },
  });
  assert.match(blocked(evaluateProductCustomizationHandoff(input(pending)), "upload_pending").message, /Wait for the current image upload/i);

  let failed = readyDraft();
  failed = reduceProductCustomizationDraft(failed, {
    type: "upload_failed", operationId: "upload-new", fieldId: photoField.id,
  });
  assert.match(blocked(evaluateProductCustomizationHandoff(input(failed)), "upload_failed").message, /Retry the failed image upload/i);

  let ownerExpired = readyDraft();
  ownerExpired = reduceProductCustomizationDraft(ownerExpired, { type: "owner_context_expired" });
  assert.match(blocked(evaluateProductCustomizationHandoff(input(ownerExpired)), "expired").message, /upload session expired/i);

  let expiredReceipt = readyDraft();
  expiredReceipt = reduceProductCustomizationDraft(expiredReceipt, {
    type: "record_accepted_receipt", receipt: receipt("receipt-a", { expiresAt: observedAt }),
  });
  blocked(evaluateProductCustomizationHandoff(input(expiredReceipt)), "expired");

  for (const lifecycle of ["removed", "replaced", "cleanup_pending", "cleanup_failed", "cleanup_completed"]) {
    let inactiveReceipt = readyDraft();
    inactiveReceipt = reduceProductCustomizationDraft(inactiveReceipt, {
      type: "record_accepted_receipt", receipt: receipt("receipt-a", { lifecycle }),
    });
    blocked(evaluateProductCustomizationHandoff(input(inactiveReceipt)), "invalid");
  }

  let missingReceipt = readyDraft();
  missingReceipt = reduceProductCustomizationDraft(missingReceipt, {
    type: "set_image_value",
    value: { fieldId: photoField.id, fieldCode: photoField.code, kind: "image", images: [{ receiptId: "receipt-missing" }] },
  });
  blocked(evaluateProductCustomizationHandoff(input(missingReceipt)), "invalid");

  const stale = evaluateProductCustomizationHandoff(input(readyDraft(), { configurationRevision: "customization-v2" }));
  assert.match(blocked(stale, "stale_configuration").message, /requirements changed/i);
});

test("different customer content never changes the catalog resolver input or invents a cart identity", () => {
  const first = readyDraft();
  let second = readyDraft();
  second = reduceProductCustomizationDraft(second, {
    type: "set_text_value",
    value: { fieldId: nameField.id, fieldCode: nameField.code, kind: "short_text", value: "Grace" },
  });
  const firstGate = evaluateProductCustomizationHandoff(input(first));
  const secondGate = evaluateProductCustomizationHandoff(input(second));
  assert.equal(firstGate.status, "locally_ready");
  assert.equal(secondGate.status, "locally_ready");
  assert.notDeepEqual(firstGate.handoff.customizationValues, secondGate.handoff.customizationValues);
  assert.deepEqual(
    resolveVariantSelection({ productId, options: [size], optionValues: [mini, standard], variants: [variant()], selectedOptions: first.selectedOptions }),
    resolveVariantSelection({ productId, options: [size], optionValues: [mini, standard], variants: [variant()], selectedOptions: second.selectedOptions }),
  );
  assert.equal(Object.keys(firstGate.handoff).some((key) => /cart|merge|fingerprint|hash/i.test(key)), false);
});

test("Task 7.8 sources are local, provider-neutral, accessible, and leave Task 8.1 authoritative", async () => {
  const [helper, component, detail] = await Promise.all([
    readFile(new URL("../app/application/product-customization-handoff-gate.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/storefront/ProductCustomizationHandoffGate.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/storefront/ProductDetailExperience.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(helper, /evaluateProductCustomizationDraft/);
  assert.match(helper, /resolveVariantSelection/);
  assert.match(helper, /parseConfiguredItemHandoff/);
  assert.match(helper, /Task 8\.1 must verify current ownership/);
  assert.doesNotMatch(helper, /fetch\s*\(|Date\.now|@supabase\/supabase-js|Supabase|R2|S3|storageKey|storage_key|objectKey|object_key|signedUrl|photoPath|bucket|Stripe|PayPal|cartKey|mergeKey|fingerprint|api\/orders/i);
  assert.match(component, /Personalization status/);
  assert.match(component, /aria-live="polite"/);
  assert.match(component, /locally ready for server verification/i);
  assert.doesNotMatch(component, /fetch\s*\(|receiptId|storageKey|objectKey|signedUrl|bucket|Add to cart|Ready to checkout|Order ready|Verified|api\/orders|Stripe|PayPal/i);
  assert.match(detail, /evaluateProductCustomizationHandoff/);
  assert.match(detail, /<ProductCustomizationHandoffGate result=\{handoffGate\}/);
  assert.ok(detail.indexOf("<ProductCustomizationSummary") < detail.indexOf("<ProductCustomizationHandoffGate"));

  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; throw new Error("network is forbidden"); };
  try {
    assert.equal(evaluateProductCustomizationHandoff(input(readyDraft())).status, "locally_ready");
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
