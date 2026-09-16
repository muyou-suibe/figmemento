import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  applyVariantSelectionToProductCustomizationDraft,
  createProductDetailVariantSelectionEvent,
} from "../app/application/product-detail-customization-composition.ts";
import { resolveVariantSelection } from "../app/application/catalog-storefront.ts";
import {
  createProductCustomizationDraft,
  reduceProductCustomizationDraft,
} from "../app/domain/product-customization-draft.ts";

const productId = "product-couple-figure";
const otherProductId = "product-photo-frame";
const revision = "customization-v1";
const sizeOption = {
  id: "option-size",
  productId,
  code: "size",
  name: "Size",
  kind: "size",
  required: true,
  position: 0,
};
const materialOption = {
  id: "option-material",
  productId,
  code: "material",
  name: "Material",
  kind: "material",
  required: true,
  position: 1,
};
const miniValue = {
  id: "value-mini",
  productId,
  optionId: sizeOption.id,
  code: "mini",
  label: "Mini",
  position: 0,
};
const standardValue = {
  id: "value-standard",
  productId,
  optionId: sizeOption.id,
  code: "standard",
  label: "Standard",
  position: 1,
};
const resinValue = {
  id: "value-resin",
  productId,
  optionId: materialOption.id,
  code: "resin",
  label: "Resin",
  position: 0,
};

function variant(id, skuCode, priceCents, selectedOptions, overrides = {}) {
  return {
    id,
    productId,
    skuCode,
    priceCents,
    currency: "USD",
    isActive: true,
    isAvailable: true,
    selectedOptions,
    ...overrides,
  };
}

const mini = variant("variant-mini", "COUPLE-MINI", 6_990, [
  { optionId: sizeOption.id, valueId: miniValue.id },
  { optionId: materialOption.id, valueId: resinValue.id },
]);
const standard = variant("variant-standard", "COUPLE-STANDARD", 8_990, [
  { optionId: sizeOption.id, valueId: standardValue.id },
  { optionId: materialOption.id, valueId: resinValue.id },
]);
const unavailableStandard = { ...standard, id: "variant-standard-unavailable", isAvailable: false };

function selectionInput(selectedOptions, variants = [mini, standard]) {
  return {
    productId,
    options: [sizeOption, materialOption],
    optionValues: [miniValue, standardValue, resinValue],
    variants,
    selectedOptions,
  };
}

function withText(draft, value) {
  return reduceProductCustomizationDraft(draft, {
    type: "set_text_value",
    value: { fieldId: "field-name", fieldCode: "name", kind: "short_text", value },
  });
}

function withImageReceiptReference(draft, receiptId) {
  return reduceProductCustomizationDraft(draft, {
    type: "set_image_value",
    value: {
      fieldId: "field-photo",
      fieldCode: "photo",
      kind: "image",
      images: [{ receiptId }],
    },
  });
}

function resolvedEvent(selectedOptions, variants) {
  return createProductDetailVariantSelectionEvent(
    selectedOptions,
    resolveVariantSelection(selectionInput(selectedOptions, variants)),
  );
}

test("partial Option selections reach the parent draft without fabricating a Variant", () => {
  const selectedOptions = [{ optionId: sizeOption.id, valueId: miniValue.id }];
  const event = resolvedEvent(selectedOptions);
  assert.equal(event.resolved, null);

  const draft = applyVariantSelectionToProductCustomizationDraft(
    createProductCustomizationDraft({ productId, configurationRevision: revision }),
    event,
  );
  assert.deepEqual(draft.selectedOptions, selectedOptions);
  assert.equal(draft.selectedVariant, null);
});

test("customization-first Variant resolution preserves existing customer values", () => {
  const selectedOptions = [
    { optionId: sizeOption.id, valueId: miniValue.id },
    { optionId: materialOption.id, valueId: resinValue.id },
  ];
  const before = withImageReceiptReference(
    withText(
      createProductCustomizationDraft({ productId, configurationRevision: revision }),
      "Ada and Grace",
    ),
    "receipt-customer-photo-a",
  );
  const draft = applyVariantSelectionToProductCustomizationDraft(before, resolvedEvent(selectedOptions));

  assert.deepEqual(draft.values, before.values);
  assert.deepEqual(draft.selectedOptions, selectedOptions);
  assert.deepEqual(draft.selectedVariant, { variantId: mini.id, skuCode: mini.skuCode });
});

test("Variant-first customization actions preserve the current Variant and selected Options", () => {
  const selectedOptions = [
    { optionId: sizeOption.id, valueId: standardValue.id },
    { optionId: materialOption.id, valueId: resinValue.id },
  ];
  const selected = applyVariantSelectionToProductCustomizationDraft(
    createProductCustomizationDraft({ productId, configurationRevision: revision }),
    resolvedEvent(selectedOptions),
  );
  const draft = withText(selected, "Lina");

  assert.deepEqual(draft.selectedOptions, selected.selectedOptions);
  assert.deepEqual(draft.selectedVariant, selected.selectedVariant);
  assert.equal(draft.values[0].kind, "short_text");
  assert.equal(draft.values[0].value, "Lina");
});

test("incomplete and unavailable Option changes clear only resolved SKU identity", () => {
  const fullSelection = [
    { optionId: sizeOption.id, valueId: miniValue.id },
    { optionId: materialOption.id, valueId: resinValue.id },
  ];
  const seeded = withText(
    applyVariantSelectionToProductCustomizationDraft(
      createProductCustomizationDraft({ productId, configurationRevision: revision }),
      resolvedEvent(fullSelection),
    ),
    "Maya",
  );
  const partial = applyVariantSelectionToProductCustomizationDraft(
    seeded,
    resolvedEvent([{ optionId: sizeOption.id, valueId: standardValue.id }]),
  );
  assert.equal(partial.selectedVariant, null);
  assert.deepEqual(partial.values, seeded.values);

  const unavailableSelection = [
    { optionId: sizeOption.id, valueId: standardValue.id },
    { optionId: materialOption.id, valueId: resinValue.id },
  ];
  const unavailable = applyVariantSelectionToProductCustomizationDraft(
    seeded,
    resolvedEvent(unavailableSelection, [mini, unavailableStandard]),
  );
  assert.equal(unavailable.selectedVariant, null);
  assert.deepEqual(unavailable.selectedOptions, unavailableSelection);
  assert.deepEqual(unavailable.values, seeded.values);
});

test("different customer content cannot change the canonical Variant resolver input or result", () => {
  const selectedOptions = [
    { optionId: sizeOption.id, valueId: miniValue.id },
    { optionId: materialOption.id, valueId: resinValue.id },
  ];
  const draftA = withImageReceiptReference(
    withText(
      createProductCustomizationDraft({ productId, configurationRevision: revision }),
      "Ada",
    ),
    "receipt-photo-a",
  );
  const draftB = withImageReceiptReference(
    withText(
      createProductCustomizationDraft({ productId, configurationRevision: revision }),
      "Grace",
    ),
    "receipt-photo-b",
  );
  const resolverInputA = selectionInput(selectedOptions);
  const resolverInputB = selectionInput(selectedOptions);

  assert.notDeepEqual(draftA.values, draftB.values);
  assert.deepEqual(resolverInputA, resolverInputB);
  assert.deepEqual(resolveVariantSelection(resolverInputA), resolveVariantSelection(resolverInputB));
  assert.deepEqual(resolvedEvent(selectedOptions).resolved, {
    productId,
    variantId: mini.id,
    skuCode: mini.skuCode,
    selectedOptions: [
      { optionId: materialOption.id, valueId: resinValue.id },
      { optionId: sizeOption.id, valueId: miniValue.id },
    ],
  });
});

test("a Product-scoped draft is reset by constructing the next Product draft, not by rewriting identity", () => {
  const productADraft = withText(
    createProductCustomizationDraft({ productId, configurationRevision: revision }),
    "Ada",
  );
  const productBDraft = createProductCustomizationDraft({
    productId: otherProductId,
    configurationRevision: "customization-v2",
  });

  assert.equal(productADraft.productId, productId);
  assert.equal(productBDraft.productId, otherProductId);
  assert.equal(productBDraft.values.length, 0);
  assert.equal(productBDraft.selectedVariant, null);
});

test("Task 7.2 keeps Variant and customization concerns in separate client boundaries", async () => {
  const [parent, selector, shell, route] = await Promise.all([
    readFile(new URL("../app/storefront/ProductDetailExperience.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/storefront/VariantSelector.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/storefront/ProductCustomizationFormShell.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/product/[slug]/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(parent, /key=\{props\.productId\}/);
  assert.match(parent, /ProductCustomizationFormShell/);
  assert.match(parent, /applyVariantSelectionToProductCustomizationDraft/);
  assert.doesNotMatch(parent, /useState\s*\(\s*["']ready["']\s*\)/);

  assert.match(selector, /createProductDetailVariantSelectionEvent/);
  assert.match(selector, /resolveVariantSelection/);
  assert.doesNotMatch(selector, /CustomizationField|CustomizationValue|ProductCustomizationDraft|receiptId|photoPath|api\/uploads/);

  assert.doesNotMatch(shell, /resolveVariantSelection|canSelectOptionValue|variantId|skuCode|selectedOptions/);
  assert.doesNotMatch(shell, /<input|<textarea|type=\{?["']file|api\/uploads|blob:|preview|replace|remove/i);
  assert.doesNotMatch(shell, /price|currency|surcharge|payment|Stripe|PayPal|cart|order/i);

  assert.match(route, /loadPublicProductDetailWithCustomization/);
  assert.match(route, /createServerCustomizationFieldRepository/);
  assert.match(route, /customizationSource\.source !== source\.value\.source/);
  assert.doesNotMatch(route, /customization_schema|createDevelopmentCustomization|fixture.*fallback/i);
});
