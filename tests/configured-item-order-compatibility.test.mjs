import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  acceptConfiguredItemHandoff,
} from "../app/application/configured-item-handoff-acceptance.ts";
import {
  mapConfiguredItemToOrderCustomizationCompatibility,
} from "../app/application/configured-item-order-compatibility.ts";
import { preserveConfiguredItemCopies } from "../app/application/configured-item-copy-sequence.ts";
import { createDevelopmentCatalogRepository } from "../app/infrastructure/catalog/development-catalog-repository.ts";
import { parseCustomization } from "../app/domain/customization.ts";
import { readLegacyOrderUploadReference } from "../app/application/legacy-order-upload-reference.ts";
import { parseOrderRequestItem } from "../app/domain/order.ts";

const productId = "product-couple";
const revision = "customization-v1";
const selectedOptions = [{ optionId: "option-size", valueId: "value-standard" }];

function textValue(fieldId, fieldCode, kind, value) {
  return { fieldId, fieldCode, kind, value };
}

function imageValue(fieldId, fieldCode, images) {
  return { fieldId, fieldCode, kind: "image", images };
}

function handoff(overrides = {}) {
  return {
    productId,
    variantId: "variant-standard",
    skuCode: "COUPLE-STANDARD",
    selectedOptions: selectedOptions.map((selection) => ({ ...selection })),
    configurationRevision: revision,
    customizationValues: [
      textValue("field-name", "name", "short_text", "Ada"),
      imageValue("field-photo", "photo", [{ receiptId: "receipt-a" }]),
    ],
    ...overrides,
  };
}

test("8.3-1: configured-empty keeps its revision and has no upload references", () => {
  const result = mapConfiguredItemToOrderCustomizationCompatibility(handoff({ customizationValues: [] }));
  assert.deepEqual(result, {
    customerInput: { configurationRevision: revision, values: [] },
    uploadReferences: [],
  });
});

test("8.3-2/3: text-only values preserve order and kind", () => {
  const result = mapConfiguredItemToOrderCustomizationCompatibility(handoff({ customizationValues: [
    textValue("field-name", "name", "short_text", "Ada"),
    textValue("field-message", "message", "long_text", "Hello"),
  ] }));
  assert.deepEqual(result.customerInput.values, [
    textValue("field-name", "name", "short_text", "Ada"),
    textValue("field-message", "message", "long_text", "Hello"),
  ]);
  assert.deepEqual(result.uploadReferences, []);
});

test("8.3-4/5: single and multiple images become ordered opaque references", () => {
  const result = mapConfiguredItemToOrderCustomizationCompatibility(handoff({ customizationValues: [
    imageValue("field-photo", "photo", [
      { receiptId: "receipt-a" },
      { receiptId: "receipt-b" },
      { receiptId: "receipt-c" },
    ]),
  ] }));
  assert.deepEqual(result.uploadReferences, [
    { fieldId: "field-photo", fieldCode: "photo", imagePosition: 0, receiptId: "receipt-a" },
    { fieldId: "field-photo", fieldCode: "photo", imagePosition: 1, receiptId: "receipt-b" },
    { fieldId: "field-photo", fieldCode: "photo", imagePosition: 2, receiptId: "receipt-c" },
  ]);
});

test("8.3-6/7: multiple image fields flatten by field order and preserve crop", () => {
  const crop = { x: 0.1, y: 0.2, width: 0.6, height: 0.7 };
  const result = mapConfiguredItemToOrderCustomizationCompatibility(handoff({ customizationValues: [
    imageValue("field-a", "first-photo", [{ receiptId: "a1", crop }, { receiptId: "a2" }]),
    imageValue("field-b", "second-photo", [{ receiptId: "b1" }]),
  ] }));
  assert.deepEqual(result.uploadReferences, [
    { fieldId: "field-a", fieldCode: "first-photo", imagePosition: 0, receiptId: "a1", crop },
    { fieldId: "field-a", fieldCode: "first-photo", imagePosition: 1, receiptId: "a2" },
    { fieldId: "field-b", fieldCode: "second-photo", imagePosition: 0, receiptId: "b1" },
  ]);
});

test("8.3-8: mixed text and image values preserve outer order while uploads remain image-only", () => {
  const values = [
    textValue("field-first", "first", "short_text", "Ada"),
    imageValue("field-photo", "photo", [{ receiptId: "receipt-a" }]),
    textValue("field-last", "last", "long_text", "Hello"),
  ];
  const result = mapConfiguredItemToOrderCustomizationCompatibility(handoff({ customizationValues: values }));
  assert.deepEqual(result.customerInput.values, values);
  assert.deepEqual(result.uploadReferences.map((reference) => reference.fieldId), ["field-photo"]);
});

test("8.3-9..17: mapper does not project legacy, operational, commercial, or delivery authority", () => {
  const result = mapConfiguredItemToOrderCustomizationCompatibility(handoff());
  const serialized = JSON.stringify(result);
  for (const forbidden of [
    "note",
    "photoPath",
    "storageKey",
    "photoReviewStatus",
    "digitalDeliveryPath",
    "digitalDeliveryName",
    "paymentStatus",
    "fulfillmentStatus",
    "priceCents",
    "currency",
    "surcharge",
    "orderItemId",
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
  assert.deepEqual(Object.keys(result), ["customerInput", "uploadReferences"]);
});

test("8.3-18/19: input and nested mapped values remain structurally independent", () => {
  const input = handoff();
  const before = structuredClone(input);
  const first = mapConfiguredItemToOrderCustomizationCompatibility(input);
  const second = mapConfiguredItemToOrderCustomizationCompatibility(input);
  first.customerInput.values[0].value = "Changed";
  first.customerInput.values[1].images[0].receiptId = "changed-receipt";
  first.customerInput.values[1].images[0].crop = { x: 0, y: 0, width: 0.5, height: 0.5 };
  first.uploadReferences[0].receiptId = "changed-reference";
  assert.deepEqual(input, before);
  assert.equal(second.customerInput.values[0].value, "Ada");
  assert.equal(second.customerInput.values[1].images[0].receiptId, "receipt-a");
  assert.equal(second.uploadReferences[0].receiptId, "receipt-a");
});

test("8.3-20: Task 8.2 copies map independently without grouping", () => {
  const copies = preserveConfiguredItemCopies([
    handoff({ customizationValues: [imageValue("field-photo", "photo", [{ receiptId: "receipt-a" }])] }),
    handoff({ customizationValues: [imageValue("field-photo", "photo", [{ receiptId: "receipt-b" }])] }),
  ]);
  const projections = copies.map(mapConfiguredItemToOrderCustomizationCompatibility);
  assert.equal(projections.length, 2);
  assert.deepEqual(projections.map((projection) => projection.uploadReferences.map((reference) => reference.receiptId)), [["receipt-a"], ["receipt-b"]]);
  assert.notEqual(projections[0], projections[1]);
});

test("8.3-21: Task 8.1 acceptance supplies normalized values, canonical field order, and receipt IDs", async () => {
  const catalogRepository = createDevelopmentCatalogRepository({
    NODE_ENV: "development",
    PHOTOGIFT_PRODUCT_SOURCE: "fixture",
  });
  const catalogResult = await catalogRepository.findPublicProductById("fixture-product-couple-figure");
  assert.equal(catalogResult.status, "found");
  const variant = catalogResult.value.variants.find((candidate) => candidate.skuCode === "DEV-COUPLE-FIGURE-MINI");
  assert.ok(variant);
  const accepted = await acceptConfiguredItemHandoff({
    rawInput: {
      productId: "fixture-product-couple-figure",
      variantId: variant.id,
      skuCode: variant.skuCode,
      selectedOptions: variant.selectedOptions,
      configurationRevision: "compat-v1",
      customizationValues: [
        imageValue("field-photo", "photo", [{ receiptId: "receipt-a" }]),
        textValue("field-name", "name", "short_text", "  Ada  "),
      ],
    },
    verifiedOwnerId: "owner-a",
    observedAt: "2026-08-14T00:00:00.000Z",
  }, {
    catalogRepository,
    customizationFieldRepository: {
      async getCustomizationFieldsForProduct() {
        return {
          status: "found",
          value: {
            productId: "fixture-product-couple-figure",
            configurationRevision: "compat-v1",
            fields: [
              {
                id: "field-name", productId: "fixture-product-couple-figure", code: "name", label: "Name", kind: "short_text", required: true, isActive: true, position: 0, configurationRevision: "compat-v1", constraints: { maxLength: 40 },
              },
              {
                id: "field-photo", productId: "fixture-product-couple-figure", code: "photo", label: "Photo", kind: "image", required: true, isActive: true, position: 1, configurationRevision: "compat-v1", constraints: { allowedMimeTypes: ["image/png"], maxBytes: 10_000, minDimensions: { width: 1, height: 1 }, minImageCount: 1, maxImageCount: 1, cropEnabled: true },
              },
            ],
          },
        };
      },
    },
    receiptRepository: {
      async findOwnedReceipt() {
        return {
          status: "found",
          value: {
            receiptId: "receipt-a", contentType: "image/png", byteSize: 800, dimensions: { width: 1200, height: 900 }, createdAt: "2026-08-13T00:00:00.000Z", expiresAt: "2026-08-15T00:00:00.000Z", lifecycle: "active",
          },
        };
      },
    },
  });
  assert.equal(accepted.status, "accepted");
  const result = mapConfiguredItemToOrderCustomizationCompatibility(accepted.handoff);
  assert.deepEqual(result.customerInput.values.map((value) => value.fieldId), ["field-name", "field-photo"]);
  assert.equal(result.customerInput.values[0].value, "Ada");
  assert.deepEqual(result.uploadReferences.map((reference) => reference.receiptId), ["receipt-a"]);
  assert.equal(JSON.stringify(result).includes("photoReviewStatus"), false);
});

test("8.3-22..24: mapper source has no external access, order mutation, or receipt attachment", async () => {
  const source = await readFile(new URL("../app/application/configured-item-order-compatibility.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /fetch|Supabase|Storage|R2|S3|Stripe|PayPal|repository|readFile|writeFile|cookie|Date\.now|crypto|random/);
  assert.doesNotMatch(source, /attachOwnedReceiptOnce|CustomerUploadLifecycleService|orderItemId|storageKey|objectKey|bucket|signedUrl|permanentUrl|previewUrl/);
});

test("8.3-25/26: legacy parsers and historical upload reference remain unchanged", () => {
  assert.deepEqual(parseCustomization({ note: "legacy", photoPath: "drafts/abc-123.png" }), {
    note: "legacy", photoPath: "drafts/abc-123.png",
  });
  assert.deepEqual(readLegacyOrderUploadReference({ photoPath: "drafts/abc-123.png" }), {
    storageKey: "drafts/abc-123.png",
  });
  assert.ok(parseOrderRequestItem({ slug: "couple-figure", quantity: 1, customization: { photoPath: "drafts/abc-123.png" } }));
});
