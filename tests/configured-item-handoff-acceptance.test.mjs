import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  acceptConfiguredItemHandoff,
} from "../app/application/configured-item-handoff-acceptance.ts";
import { preserveConfiguredItemCopies } from "../app/application/configured-item-copy-sequence.ts";
import { createDevelopmentCatalogRepository } from "../app/infrastructure/catalog/development-catalog-repository.ts";

const productId = "fixture-product-couple-figure";
const observedAt = "2026-08-14T00:00:00.000Z";
const configurationRevision = "configuration-v1";
const ownerId = "owner-a";

const fixtureCatalog = createDevelopmentCatalogRepository({
  NODE_ENV: "development",
  PHOTOGIFT_PRODUCT_SOURCE: "fixture",
});

function textField(overrides = {}) {
  return {
    id: "field-name",
    productId,
    code: "name",
    label: "Name",
    kind: "short_text",
    required: true,
    isActive: true,
    position: 0,
    configurationRevision,
    constraints: { maxLength: 40 },
    ...overrides,
  };
}

function imageField(overrides = {}) {
  return {
    id: "field-photo",
    productId,
    code: "photo",
    label: "Photo",
    kind: "image",
    required: true,
    isActive: true,
    position: 0,
    configurationRevision,
    constraints: {
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
      maxBytes: 10_000,
      minDimensions: { width: 600, height: 600 },
      minImageCount: 1,
      maxImageCount: 2,
      cropEnabled: true,
    },
    ...overrides,
  };
}

function receipt(receiptId = "receipt-a", overrides = {}) {
  return {
    receiptId,
    contentType: "image/png",
    byteSize: 800,
    dimensions: { width: 1200, height: 900 },
    createdAt: "2026-08-13T00:00:00.000Z",
    expiresAt: "2026-08-15T00:00:00.000Z",
    lifecycle: "active",
    ...overrides,
  };
}

async function fixtureDetail() {
  const result = await fixtureCatalog.findPublicProductById(productId);
  assert.equal(result.status, "found");
  const variant = result.value.variants.find((candidate) => candidate.skuCode === "DEV-COUPLE-FIGURE-MINI");
  assert.ok(variant);
  return { detail: result.value, variant };
}

async function setup({ fields = [textField()], handoffOverrides = {}, receipts = {}, catalogResult, fieldResult } = {}) {
  const { detail, variant } = await fixtureDetail();
  const calls = { catalog: 0, fields: 0, receipts: [] };
  const handoff = {
    productId,
    variantId: variant.id,
    skuCode: variant.skuCode,
    selectedOptions: variant.selectedOptions.map((selection) => ({ ...selection })),
    configurationRevision,
    customizationValues: [{
      fieldId: "field-name",
      fieldCode: "name",
      kind: "short_text",
      value: "Ada",
    }],
    ...handoffOverrides,
  };
  const dependencies = {
    catalogRepository: {
      async findPublicProductById() {
        calls.catalog += 1;
        return catalogResult ?? { status: "found", value: detail };
      },
    },
    customizationFieldRepository: {
      async getCustomizationFieldsForProduct() {
        calls.fields += 1;
        return fieldResult ?? {
          status: "found",
          value: { productId, configurationRevision, fields },
        };
      },
    },
    receiptRepository: {
      async findOwnedReceipt(receiptId, requestedOwnerId) {
        calls.receipts.push({ receiptId, ownerId: requestedOwnerId });
        const value = receipts[receiptId];
        return value === undefined ? { status: "not_found" } : { status: "found", value };
      },
    },
  };
  return { handoff, dependencies, calls, detail, variant };
}

async function accept(options = {}) {
  const setupValue = await setup(options);
  const result = await acceptConfiguredItemHandoff({
    rawInput: setupValue.handoff,
    verifiedOwnerId: ownerId,
    observedAt,
  }, setupValue.dependencies);
  return { ...setupValue, result };
}

test("8.1-1: accepts valid text handoff and normalizes text", async () => {
  const value = await accept({ handoffOverrides: {
    customizationValues: [{ fieldId: "field-name", fieldCode: "name", kind: "short_text", value: "  Ada  " }],
  } });
  assert.equal(value.result.status, "accepted");
  assert.equal(value.result.handoff.customizationValues[0].value, "Ada");
  assert.equal(value.calls.receipts.length, 0);
});

test("8.1-2: accepts valid image handoff using receipt metadata", async () => {
  const value = await accept({
    fields: [imageField()],
    handoffOverrides: {
      customizationValues: [{ fieldId: "field-photo", fieldCode: "photo", kind: "image", images: [{ receiptId: "receipt-a" }] }],
    },
    receipts: { "receipt-a": receipt() },
  });
  assert.equal(value.result.status, "accepted");
  assert.deepEqual(value.calls.receipts, [{ receiptId: "receipt-a", ownerId }]);
});

test("8.1-3: authoritative receipt metadata, not browser metadata, controls image acceptance", async () => {
  const value = await accept({
    fields: [imageField()],
    handoffOverrides: {
      customizationValues: [{ fieldId: "field-photo", fieldCode: "photo", kind: "image", images: [{ receiptId: "receipt-a" }] }],
    },
    receipts: { "receipt-a": receipt("receipt-a", { byteSize: 900, dimensions: { width: 900, height: 900 } }) },
  });
  assert.equal(value.result.status, "accepted");
});

test("8.1-4/5: malformed and browser-authoritative handoffs are rejected before repositories", async () => {
  const value = await setup();
  const malformed = await acceptConfiguredItemHandoff({ rawInput: { productId }, verifiedOwnerId: ownerId, observedAt }, value.dependencies);
  const browserAuthority = await acceptConfiguredItemHandoff({
    rawInput: { ...value.handoff, priceCents: 1, currency: "USD", ownerId: "owner-b", storageKey: "private/key" },
    verifiedOwnerId: ownerId,
    observedAt,
  }, value.dependencies);
  assert.deepEqual(malformed, { status: "rejected", reason: "invalid_handoff" });
  assert.deepEqual(browserAuthority, { status: "rejected", reason: "invalid_handoff" });
  assert.deepEqual(value.calls, { catalog: 0, fields: 0, receipts: [] });
});

for (const [name, catalogResult, expected] of [
  ["not_found", { status: "not_found" }, "product_not_available"],
  ["unavailable", { status: "unavailable", reason: "not_public" }, "product_not_available"],
  ["invalid configuration", { status: "invalid_configuration", issues: [] }, "catalog_failure"],
  ["source failure", { status: "source_failure", operation: "catalog.read" }, "catalog_failure"],
]) {
  test(`8.1-6..9: catalog ${name} fails closed`, async () => {
    const value = await accept({ catalogResult });
    assert.deepEqual(value.result, { status: "rejected", reason: expected });
    assert.equal(value.calls.fields, 0);
  });
}

test("8.1-10: catalog exceptions become safe failure", async () => {
  const value = await setup();
  value.dependencies.catalogRepository.findPublicProductById = async () => { throw new Error("SQL detail"); };
  assert.deepEqual(await acceptConfiguredItemHandoff({ rawInput: value.handoff, verifiedOwnerId: ownerId, observedAt }, value.dependencies), {
    status: "rejected", reason: "catalog_failure",
  });
});

test("8.1-11: internally inconsistent Product identity fails closed", async () => {
  const value = await setup();
  value.dependencies.catalogRepository.findPublicProductById = async () => ({ status: "found", value: {
    ...value.detail, product: { ...value.detail.product, id: "other-product" },
  } });
  assert.deepEqual((await acceptConfiguredItemHandoff({ rawInput: value.handoff, verifiedOwnerId: ownerId, observedAt }, value.dependencies)), {
    status: "rejected", reason: "catalog_failure",
  });
});

test("8.1-12..14: Variant ID, SKU, and selected Options must match authority", async () => {
  for (const handoffOverrides of [
    { variantId: "other-variant" },
    { skuCode: "OTHER-SKU" },
    { selectedOptions: [] },
  ]) {
    const value = await accept({ handoffOverrides });
    assert.deepEqual(value.result, { status: "rejected", reason: handoffOverrides.selectedOptions ? "variant_incomplete" : "variant_mismatch" });
  }
});

test("8.1-15: incomplete selection is rejected", async () => {
  const value = await accept({ handoffOverrides: { selectedOptions: [] } });
  assert.deepEqual(value.result, { status: "rejected", reason: "variant_incomplete" });
});

test("8.1-16: unavailable Variant selection is rejected", async () => {
  const value = await setup();
  const unavailable = { ...value.detail, variants: value.detail.variants.map((candidate) => ({ ...candidate, isAvailable: false })) };
  value.dependencies.catalogRepository.findPublicProductById = async () => ({ status: "found", value: unavailable });
  assert.deepEqual(await acceptConfiguredItemHandoff({ rawInput: value.handoff, verifiedOwnerId: ownerId, observedAt }, value.dependencies), {
    status: "rejected", reason: "product_not_available",
  });
});

test("8.1-17: invalid or cross-Product option graphs are rejected", async () => {
  const value = await accept({ handoffOverrides: { selectedOptions: [{ optionId: "other-option", valueId: "other-value" }] } });
  assert.deepEqual(value.result, { status: "rejected", reason: "variant_invalid" });
});

test("8.1-18/19: missing or cross-Product configuration is not permissive", async () => {
  const missing = await accept({ fieldResult: { status: "not_found" } });
  assert.deepEqual(missing.result, { status: "rejected", reason: "customization_not_configured" });
  const crossProduct = await accept({ fieldResult: { status: "found", value: { productId: "other-product", configurationRevision, fields: [] } } });
  assert.deepEqual(crossProduct.result, { status: "rejected", reason: "invalid_customization" });
});

test("8.1-20: stale configuration is rejected before receipt lookup", async () => {
  const value = await accept({
    fields: [imageField()],
    handoffOverrides: { configurationRevision: "old-revision", customizationValues: [{ fieldId: "field-photo", fieldCode: "photo", kind: "image", images: [{ receiptId: "receipt-a" }] }] },
    receipts: { "receipt-a": receipt() },
  });
  assert.deepEqual(value.result, { status: "rejected", reason: "stale_configuration" });
  assert.equal(value.calls.receipts.length, 0);
});

for (const [name, customizationValues] of [
  ["unknown field", [{ fieldId: "unknown", fieldCode: "unknown", kind: "short_text", value: "Ada" }]],
  ["wrong field code", [{ fieldId: "field-name", fieldCode: "wrong", kind: "short_text", value: "Ada" }]],
  ["wrong field kind", [{ fieldId: "field-name", fieldCode: "name", kind: "image", images: [{ receiptId: "receipt-a" }] }]],
  ["missing required value", []],
  ["empty required text", [{ fieldId: "field-name", fieldCode: "name", kind: "short_text", value: "   " }]],
  ["too-long text", [{ fieldId: "field-name", fieldCode: "name", kind: "short_text", value: "A".repeat(41) }]],
]) {
  test(`8.1-21..26: pre-receipt ${name} is rejected without receipt probing`, async () => {
    const value = await accept({ handoffOverrides: { customizationValues } });
    assert.deepEqual(value.result, { status: "rejected", reason: "invalid_customization" });
    assert.equal(value.calls.receipts.length, 0);
  });
}

test("8.1-27: crop metadata is rejected before receipt lookup when disabled", async () => {
  const value = await accept({
    fields: [imageField({ constraints: { ...imageField().constraints, cropEnabled: false } })],
    handoffOverrides: { customizationValues: [{ fieldId: "field-photo", fieldCode: "photo", kind: "image", images: [{ receiptId: "receipt-a", crop: { x: 0, y: 0, width: 0.5, height: 0.5 } }] }] },
    receipts: { "receipt-a": receipt() },
  });
  assert.deepEqual(value.result, { status: "rejected", reason: "invalid_customization" });
  assert.equal(value.calls.receipts.length, 0);
});

for (const [name, repositoryResult, expected] of [
  ["unowned", { status: "not_found" }, "receipt_not_owned_or_missing"],
  ["missing", { status: "not_found" }, "receipt_not_owned_or_missing"],
  ["inactive", { status: "found", value: receipt("receipt-a", { lifecycle: "replaced" }) }, "receipt_inactive"],
  ["expired", { status: "found", value: receipt("receipt-a", { expiresAt: observedAt }) }, "receipt_expired"],
  ["invalid metadata", { status: "found", value: { ...receipt(), byteSize: 0 } }, "source_failure"],
  ["source failure", { status: "source_failure", operation: "customer_upload_receipt.lookup_owned" }, "source_failure"],
]) {
  test(`8.1-28..33: receipt ${name} is rejected safely`, async () => {
    const value = await accept({
      fields: [imageField()],
      handoffOverrides: { customizationValues: [{ fieldId: "field-photo", fieldCode: "photo", kind: "image", images: [{ receiptId: "receipt-a" }] }] },
      receipts: { "receipt-a": repositoryResult.value },
    });
    if (name === "source failure" || name === "unowned" || name === "missing") {
      value.dependencies.receiptRepository.findOwnedReceipt = async () => repositoryResult;
      value.result = await acceptConfiguredItemHandoff({ rawInput: value.handoff, verifiedOwnerId: ownerId, observedAt }, value.dependencies);
    }
    assert.deepEqual(value.result, { status: "rejected", reason: expected });
  });
}

test("8.1-34: receipt repository exceptions become safe failure", async () => {
  const value = await accept({ fields: [imageField()], handoffOverrides: {
    customizationValues: [{ fieldId: "field-photo", fieldCode: "photo", kind: "image", images: [{ receiptId: "receipt-a" }] }],
  } });
  value.dependencies.receiptRepository.findOwnedReceipt = async () => { throw new Error("provider detail"); };
  value.result = await acceptConfiguredItemHandoff({ rawInput: value.handoff, verifiedOwnerId: ownerId, observedAt }, value.dependencies);
  assert.deepEqual(value.result, { status: "rejected", reason: "source_failure" });
});

test("8.1-35: duplicate receipt IDs across fields are rejected before any lookup", async () => {
  const fields = [imageField(), imageField({ id: "field-photo-2", code: "photo-two", position: 1 })];
  const value = await accept({
    fields,
    handoffOverrides: { customizationValues: [
      { fieldId: "field-photo-2", fieldCode: "photo-two", kind: "image", images: [{ receiptId: "receipt-a" }] },
      { fieldId: "field-photo", fieldCode: "photo", kind: "image", images: [{ receiptId: "receipt-a" }] },
    ] },
    receipts: { "receipt-a": receipt() },
  });
  assert.deepEqual(value.result, { status: "rejected", reason: "invalid_customization" });
  assert.equal(value.calls.receipts.length, 0);
});

test("8.1-36: configured-empty is accepted only when explicitly found", async () => {
  const value = await accept({ fields: [], handoffOverrides: { customizationValues: [] } });
  assert.deepEqual(value.result, {
    status: "accepted",
    handoff: {
      ...value.handoff,
      customizationValues: [],
    },
  });
});

test("8.1-37: canonical output follows field positions and preserves image order", async () => {
  const first = textField({ id: "field-first", code: "first", position: 0, required: false });
  const second = imageField({ id: "field-second", code: "second", position: 1, required: true });
  const value = await accept({
    fields: [first, second],
    handoffOverrides: { customizationValues: [
      { fieldId: "field-second", fieldCode: "second", kind: "image", images: [{ receiptId: "receipt-b" }, { receiptId: "receipt-c" }] },
      { fieldId: "field-first", fieldCode: "first", kind: "short_text", value: "Ada" },
    ] },
    receipts: { "receipt-b": receipt("receipt-b"), "receipt-c": receipt("receipt-c") },
  });
  assert.equal(value.result.status, "accepted");
  assert.deepEqual(value.result.handoff.customizationValues.map((entry) => entry.fieldId), ["field-first", "field-second"]);
  assert.deepEqual(value.result.handoff.customizationValues[1].images.map((entry) => entry.receiptId), ["receipt-b", "receipt-c"]);
});

test("8.1-38: only the read ports are used and raw private/provider data is absent", async () => {
  const source = await readFile(new URL("../app/application/configured-item-handoff-acceptance.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /replaceOwnedReceipt|removeOwnedReceipt|attachOwnedReceiptOnce|expireReceipt|claimReceiptsForCleanup|completeReceiptCleanup|failReceiptCleanup/);
  assert.doesNotMatch(source, /storageKey|objectKey|bucket|signedUrl|priceCents|currency|ownerId.*rawInput/);
  const value = await accept();
  assert.equal(value.result.status, "accepted");
  assert.equal(JSON.stringify(value.result).includes(ownerId), false);
});

test("8.2-18: two canonical Task 8.1 acceptances for one SKU remain distinct copies", async () => {
  const ada = await accept({ handoffOverrides: {
    customizationValues: [{ fieldId: "field-name", fieldCode: "name", kind: "short_text", value: "Ada" }],
  } });
  const grace = await accept({ handoffOverrides: {
    customizationValues: [{ fieldId: "field-name", fieldCode: "name", kind: "short_text", value: "Grace" }],
  } });
  assert.equal(ada.result.status, "accepted");
  assert.equal(grace.result.status, "accepted");
  const copies = preserveConfiguredItemCopies([ada.result.handoff, grace.result.handoff]);
  assert.equal(copies.length, 2);
  assert.deepEqual(copies.map((copy) => copy.skuCode), [ada.variant.skuCode, grace.variant.skuCode]);
  assert.deepEqual(copies.map((copy) => copy.customizationValues[0].value), ["Ada", "Grace"]);
  assert.notEqual(copies[0], copies[1]);
});
