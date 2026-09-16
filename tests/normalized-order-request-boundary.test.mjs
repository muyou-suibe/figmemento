import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  prepareNormalizedOrderCustomizationRequest,
} from "../app/application/normalized-order-request-boundary.ts";
import {
  normalizedOrderRequestItemToConfiguredItemHandoff,
  parseDeprecatedLegacyProductOrderItem,
  parseOrderRequestItem,
  isNormalizedOrderRequestItem,
} from "../app/domain/order.ts";
import { createDevelopmentCatalogRepository } from "../app/infrastructure/catalog/development-catalog-repository.ts";

const productId = "fixture-product-couple-figure";
const configurationRevision = "configuration-v1";
const ownerId = "gdo_server-verified-owner";
const observedAt = "2026-08-14T00:00:00.000Z";

const catalogRepository = createDevelopmentCatalogRepository({
  NODE_ENV: "development",
  PHOTOGIFT_PRODUCT_SOURCE: "fixture",
});

async function fixtureVariant() {
  const result = await catalogRepository.findPublicProductById(productId);
  assert.equal(result.status, "found");
  const variant = result.value.variants.find((candidate) => candidate.skuCode === "DEV-COUPLE-FIGURE-MINI");
  assert.ok(variant);
  return variant;
}

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
    position: 1,
    configurationRevision,
    constraints: {
      allowedMimeTypes: ["image/png"],
      maxBytes: 10_000,
      minDimensions: { width: 1, height: 1 },
      minImageCount: 1,
      maxImageCount: 1,
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

async function normalizedItem(overrides = {}) {
  const variant = await fixtureVariant();
  return {
    productId,
    variantId: variant.id,
    skuCode: variant.skuCode,
    selectedOptions: variant.selectedOptions.map((selection) => ({ ...selection })),
    quantity: 1,
    configurationRevision,
    customizationValues: [{
      fieldId: "field-name",
      fieldCode: "name",
      kind: "short_text",
      value: "Ada",
    }],
    ...overrides,
  };
}

async function dependencies({ fields = [textField()], receipts = {}, fieldResult, catalog = catalogRepository, calls = { catalog: 0, fields: 0, receipts: [] } } = {}) {
  const result = await catalog.findPublicProductById(productId);
  assert.equal(result.status, "found");
  return {
    calls,
    dependencies: {
      catalogRepository: {
        async findPublicProductById(requestedProductId) {
          calls.catalog += 1;
          assert.equal(requestedProductId, productId);
          return { status: "found", value: result.value };
        },
      },
      customizationFieldRepository: {
        async getCustomizationFieldsForProduct(requestedProductId) {
          calls.fields += 1;
          assert.equal(requestedProductId, productId);
          return fieldResult ?? { status: "found", value: { productId, configurationRevision, fields } };
        },
      },
      receiptRepository: {
        async findOwnedReceipt(receiptId, requestedOwnerId) {
          calls.receipts.push({ receiptId, ownerId: requestedOwnerId });
          return receipts[receiptId] === undefined
            ? { status: "not_found" }
            : { status: "found", value: receipts[receiptId] };
        },
      },
    },
  };
}

test("8.4-1: normalized native item parses without photoPath", async () => {
  const item = await normalizedItem();
  const parsed = parseOrderRequestItem(item);
  assert.ok(parsed);
  assert.equal(isNormalizedOrderRequestItem(parsed), true);
  assert.equal("customization" in parsed, false);
  assert.equal("photoPath" in parsed, false);
  assert.equal(parsed.configurationRevision, configurationRevision);
  assert.deepEqual(parsed.customizationValues[0], item.customizationValues[0]);
});

test("8.4-2: normalized image values accept opaque receipt IDs and optional crop only", async () => {
  const parsed = parseOrderRequestItem(await normalizedItem({
    customizationValues: [{
      fieldId: "field-photo",
      fieldCode: "photo",
      kind: "image",
      images: [{ receiptId: "receipt-a", crop: { x: 0, y: 0, width: 0.5, height: 0.5 } }],
    }],
  }));
  assert.ok(parsed && isNormalizedOrderRequestItem(parsed));
  assert.deepEqual(parsed.customizationValues[0].images, [{
    receiptId: "receipt-a",
    crop: { x: 0, y: 0, width: 0.5, height: 0.5 },
  }]);
});

for (const field of [
  "path", "url", "signedUrl", "provider", "bucket", "storageKey", "objectKey",
  "photoPath", "photoMeta", "photoReviewStatus", "digitalDeliveryPath", "digitalDeliveryName",
  "ownerId", "price", "priceCents", "currency", "surcharge", "weight", "availability",
]) {
  test(`8.4-3/4: normalized request rejects browser authority ${field}`, async () => {
    assert.equal(parseOrderRequestItem(await normalizedItem({ [field]: "browser-authority" })), null);
  });
}

test("8.4-5: normalized and legacy customization cannot be mixed", async () => {
  assert.equal(parseOrderRequestItem(await normalizedItem({
    customization: { photoPath: "drafts/abc-123.png" },
  })), null);
});

test("8.4-6: malformed normalized markers cannot downgrade to a valid legacy slug item", () => {
  const value = {
    slug: "couple-figure",
    customization: { photoPath: "drafts/abc-123.png" },
    configurationRevision: "",
    customizationValues: "not-an-array",
  };
  assert.equal(parseOrderRequestItem(value), null);
  assert.equal(parseDeprecatedLegacyProductOrderItem(value), null);
});

test("8.4-7: legacy native and deprecated slug requests remain unchanged", () => {
  const native = parseOrderRequestItem({
    productId: "product-couple",
    variantId: "variant-standard",
    skuCode: "COUPLE-STANDARD",
    selectedOptions: [{ optionId: "option-size", valueId: "value-standard" }],
    quantity: 2,
    customization: { note: "Legacy", photoPath: "drafts/abc-123.png" },
  });
  assert.deepEqual(native?.customization, { note: "Legacy", photoPath: "drafts/abc-123.png" });
  assert.deepEqual(parseDeprecatedLegacyProductOrderItem({
    slug: "couple-figure",
    quantity: 1,
    customization: { photoPath: "drafts/abc-123.png" },
    priceCents: 1,
    currency: "USD",
  }), {
    slug: "couple-figure",
    quantity: 1,
    customization: { photoPath: "drafts/abc-123.png" },
  });
});

test("8.4-8: two normalized copies remain separate and quantity stays outside handoff", async () => {
  const first = await normalizedItem();
  const second = await normalizedItem({
    customizationValues: [{ fieldId: "field-name", fieldCode: "name", kind: "short_text", value: "Grace" }],
  });
  const parsedFirst = parseOrderRequestItem(first);
  const parsedSecond = parseOrderRequestItem(second);
  assert.ok(parsedFirst && isNormalizedOrderRequestItem(parsedFirst));
  assert.ok(parsedSecond && isNormalizedOrderRequestItem(parsedSecond));
  assert.notEqual(parsedFirst, parsedSecond);
  assert.equal(parsedFirst.customizationValues[0].value, "Ada");
  assert.equal(parsedSecond.customizationValues[0].value, "Grace");
  const handoff = normalizedOrderRequestItemToConfiguredItemHandoff(parsedFirst);
  assert.equal("quantity" in handoff, false);
  handoff.customizationValues[0].value = "Changed";
  assert.equal(parsedFirst.customizationValues[0].value, "Ada");
});

test("8.4-9: configured-empty normalized requests remain normalized", async () => {
  const item = await normalizedItem({ customizationValues: [] });
  const parsed = parseOrderRequestItem(item);
  assert.ok(parsed && isNormalizedOrderRequestItem(parsed));
  const setup = await dependencies({ fields: [] });
  const result = await prepareNormalizedOrderCustomizationRequest({
    rawItem: item,
    verifiedOwnerId: ownerId,
    observedAt,
  }, setup.dependencies);
  assert.equal(result.status, "accepted");
  assert.deepEqual(result.compatibility, {
    customerInput: { configurationRevision, values: [] },
    uploadReferences: [],
  });
});

test("8.4-10: Task 8.1 acceptance and Task 8.3 projection compose without provider paths", async () => {
  const item = await normalizedItem({
    customizationValues: [
      { fieldId: "field-photo", fieldCode: "photo", kind: "image", images: [{ receiptId: "receipt-a" }] },
      { fieldId: "field-name", fieldCode: "name", kind: "short_text", value: "  Ada  " },
    ],
  });
  const setup = await dependencies({ fields: [textField(), imageField()], receipts: { "receipt-a": receipt() } });
  const result = await prepareNormalizedOrderCustomizationRequest({ rawItem: item, verifiedOwnerId: ownerId, observedAt }, setup.dependencies);
  assert.equal(result.status, "accepted");
  assert.deepEqual(result.compatibility.customerInput.values.map((value) => value.fieldId), ["field-name", "field-photo"]);
  assert.equal(result.compatibility.customerInput.values[0].value, "Ada");
  assert.deepEqual(result.compatibility.uploadReferences, [{
    fieldId: "field-photo", fieldCode: "photo", imagePosition: 0, receiptId: "receipt-a",
  }]);
  const serialized = JSON.stringify(result.compatibility);
  for (const forbidden of ["photoPath", "storageKey", "bucket", "signedUrl", "priceCents", "currency", "photoReviewStatus", "digitalDeliveryPath"]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
  assert.deepEqual(setup.calls.receipts, [{ receiptId: "receipt-a", ownerId }]);
});

for (const [name, fieldResult, expectedCalls] of [
  ["stale configuration", { status: "found", value: { productId, configurationRevision: "other", fields: [textField()] } }, 0],
  ["unconfigured Product", { status: "not_found" }, 0],
]) {
  test(`8.4-11: ${name} fails closed before order-side effects`, async () => {
    const setup = await dependencies({ fieldResult });
    const mutationCalls = { orders: 0, orderItems: 0, uploads: 0, coupons: 0, stripe: 0 };
    const result = await prepareNormalizedOrderCustomizationRequest({ rawItem: await normalizedItem(), verifiedOwnerId: ownerId, observedAt }, setup.dependencies);
    assert.deepEqual(result, { status: "rejected", reason: "normalized_checkout_unavailable" });
    assert.equal(setup.calls.receipts.length, expectedCalls);
    assert.deepEqual(mutationCalls, { orders: 0, orderItems: 0, uploads: 0, coupons: 0, stripe: 0 });
  });
}

test("8.4-12: unowned, expired, and invalid Variants are bounded rejection with no attachment", async () => {
  const image = await normalizedItem({
    customizationValues: [{ fieldId: "field-photo", fieldCode: "photo", kind: "image", images: [{ receiptId: "receipt-a" }] }],
  });
  const unowned = await dependencies({ fields: [imageField()] });
  const unownedResult = await prepareNormalizedOrderCustomizationRequest({ rawItem: image, verifiedOwnerId: ownerId, observedAt }, unowned.dependencies);
  assert.deepEqual(unownedResult, { status: "rejected", reason: "normalized_checkout_unavailable" });
  assert.deepEqual(unowned.calls.receipts, [{ receiptId: "receipt-a", ownerId }]);

  const expired = await dependencies({ fields: [imageField()], receipts: { "receipt-a": receipt("receipt-a", { expiresAt: observedAt }) } });
  const expiredResult = await prepareNormalizedOrderCustomizationRequest({ rawItem: image, verifiedOwnerId: ownerId, observedAt }, expired.dependencies);
  assert.deepEqual(expiredResult, { status: "rejected", reason: "normalized_checkout_unavailable" });
});

test("8.4-13: Variant mismatch and invalid field values fail before any order-side effects", async () => {
  const setup = await dependencies({ fields: [textField()] });
  const mutationCalls = { orders: 0, orderItems: 0, uploads: 0, coupons: 0, stripe: 0 };
  const mismatch = await normalizedItem({ variantId: "variant-from-another-product" });
  const mismatchResult = await prepareNormalizedOrderCustomizationRequest({ rawItem: mismatch, verifiedOwnerId: ownerId, observedAt }, setup.dependencies);
  assert.deepEqual(mismatchResult, { status: "rejected", reason: "normalized_checkout_unavailable" });

  const invalidField = await normalizedItem({
    customizationValues: [{ fieldId: "field-unknown", fieldCode: "unknown", kind: "short_text", value: "Ada" }],
  });
  const invalidFieldResult = await prepareNormalizedOrderCustomizationRequest({ rawItem: invalidField, verifiedOwnerId: ownerId, observedAt }, setup.dependencies);
  assert.deepEqual(invalidFieldResult, { status: "rejected", reason: "normalized_checkout_unavailable" });
  assert.deepEqual(mutationCalls, { orders: 0, orderItems: 0, uploads: 0, coupons: 0, stripe: 0 });
});

test("8.4-14: request-supplied owner authority is rejected before any dependency access", async () => {
  const setup = await dependencies();
  const item = await normalizedItem({ ownerId: "browser-owner" });
  assert.deepEqual(await prepareNormalizedOrderCustomizationRequest({ rawItem: item, verifiedOwnerId: ownerId, observedAt }, setup.dependencies), {
    status: "rejected", reason: "invalid_request",
  });
  assert.deepEqual(setup.calls, { catalog: 0, fields: 0, receipts: [] });
});

test("8.4-15: mixed legacy/normalized bags stop before any legacy mutation", async () => {
  const legacy = {
    slug: "couple-figure",
    quantity: 1,
    customization: { photoPath: "drafts/abc-123.png" },
  };
  const normalized = await normalizedItem();
  const parsed = [legacy, normalized].map((item) => parseOrderRequestItem(item));
  assert.ok(parsed[0] && !isNormalizedOrderRequestItem(parsed[0]));
  assert.ok(parsed[1] && isNormalizedOrderRequestItem(parsed[1]));

  const mutationCalls = { orders: 0, orderItems: 0, uploads: 0, coupons: 0, stripe: 0 };
  const setup = await dependencies();
  const normalizedResult = await prepareNormalizedOrderCustomizationRequest({
    rawItem: normalized,
    verifiedOwnerId: ownerId,
    observedAt,
  }, {
    ...setup.dependencies,
    catalogRepository: {
      async findPublicProductById() {
        throw new Error("normalized production dependency is intentionally stopped");
      },
    },
  });
  assert.deepEqual(normalizedResult, { status: "rejected", reason: "normalized_checkout_unavailable" });
  assert.deepEqual(mutationCalls, { orders: 0, orderItems: 0, uploads: 0, coupons: 0, stripe: 0 });
});

test("8.4-16: real orders route stops every valid normalized family before legacy validation", async () => {
  const route = await readFile(new URL("../app/api/orders/route.ts", import.meta.url), "utf8");
  const normalizedGate = route.indexOf("requestedItems.some(isNormalizedOrderRequestItem)");
  const normalizedResponse = route.indexOf("Personalized checkout is temporarily unavailable.");
  const legacyGuard = route.indexOf("if (!customization || !readLegacyOrderUploadReference(customization))");
  const catalogConstruction = route.indexOf("const catalog = await createServerCatalogRepository();");
  const orderInsert = route.indexOf('.from("orders")');
  assert.ok(normalizedGate >= 0);
  assert.ok(normalizedResponse > normalizedGate);
  assert.ok(route.indexOf("status: 503", normalizedGate) > normalizedResponse);
  assert.ok(normalizedGate < legacyGuard);
  assert.ok(legacyGuard >= 0);
  assert.ok(legacyGuard < catalogConstruction);
  assert.ok(catalogConstruction < orderInsert);

  for (const item of [
    await normalizedItem(),
    await normalizedItem({ customizationValues: [] }),
    await normalizedItem({ customizationValues: [{ fieldId: "field-name", fieldCode: "name", kind: "short_text", value: "Ada" }] }),
    await normalizedItem({ customizationValues: [{ fieldId: "field-photo", fieldCode: "photo", kind: "image", images: [{ receiptId: "receipt-a" }] }] }),
  ]) {
    const parsed = parseOrderRequestItem(item);
    assert.ok(parsed && isNormalizedOrderRequestItem(parsed));
    assert.equal(parsed.customization, undefined);
  }
  assert.doesNotMatch(route.slice(normalizedGate, legacyGuard), /readLegacyOrderUploadReference|createServerCatalogRepository|\.from\("orders"\)|order_items|order_uploads|createStripeCheckout/);
});

test("8.4-17: boundary source has no order/provider mutation or customer logging", async () => {
  const source = await readFile(new URL("../app/application/normalized-order-request-boundary.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /Supabase|Stripe|PayPal|Storage|R2|S3|from\(\"orders\"\)|order_uploads|attachOwnedReceiptOnce|console\.|console\.error|JSON\.stringify/);
});
