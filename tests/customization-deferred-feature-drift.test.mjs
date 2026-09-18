import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { parseConfiguredItemHandoff } from "../app/domain/configured-item.ts";
import { inspectCustomerImageBytes } from "../app/domain/customer-image-inspection.ts";
import { parseCustomizationField } from "../app/domain/customization-field.ts";
import { parseCustomizationCropRegion, parseCustomizationValue } from "../app/domain/customization-value.ts";
import { acceptConfiguredItemHandoff } from "../app/application/configured-item-handoff-acceptance.ts";
import { preserveConfiguredItemCopies } from "../app/application/configured-item-copy-sequence.ts";
import { mapConfiguredItemToOrderCustomizationCompatibility } from "../app/application/configured-item-order-compatibility.ts";
import { parseReplaceCustomizationConfigurationIntent } from "../app/application/admin-customization-field-boundary.ts";
import { parseOrderRequestItem } from "../app/domain/order.ts";
import { createLocalCustomerInputPreview, disposeLocalCustomerInputPreview } from "../app/client/local-customer-input-preview.ts";
import { createDevelopmentCatalogRepository } from "../app/infrastructure/catalog/development-catalog-repository.ts";
import { createServerCustomizationFieldRepository } from "../app/infrastructure/customization/server-customization-field-repository.ts";
import { POST as uploadRoute } from "../app/api/uploads/route.ts";

const productId = "fixture-product-couple-figure";
const variantConfig = { NODE_ENV: "development", PHOTOGIFT_PRODUCT_SOURCE: "fixture" };
const revision = "customization-v1";
const ownerId = "owner-a";
const observedAt = "2026-08-14T00:00:00.000Z";

const imageConstraints = {
  allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  maxBytes: 10_000,
  minDimensions: { width: 100, height: 100 },
  recommendedDimensions: { width: 300, height: 300 },
  minImageCount: 1,
  maxImageCount: 2,
  cropEnabled: true,
};

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
    configurationRevision: revision,
    constraints: { maxLength: 80 },
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
    configurationRevision: revision,
    constraints: imageConstraints,
    ...overrides,
  };
}

function textValue(value = "Ada") {
  return { fieldId: "field-name", fieldCode: "name", kind: "short_text", value };
}

function imageValue(receiptId = "receipt-a", extra = {}) {
  return {
    fieldId: "field-photo",
    fieldCode: "photo",
    kind: "image",
    images: [{ receiptId, ...extra }],
  };
}

function baseHandoff(overrides = {}) {
  return {
    productId,
    variantId: "fixture-variant-couple-figure-mini",
    skuCode: "DEV-COUPLE-FIGURE-MINI",
    selectedOptions: [{ optionId: "fixture-option-couple-figure-size", valueId: "fixture-value-couple-figure-size-mini" }],
    configurationRevision: revision,
    customizationValues: [],
    ...overrides,
  };
}

function adminField(overrides = {}) {
  return {
    identity: { kind: "new", draftId: "new:field-1", code: "name" },
    label: "Name",
    kind: "short_text",
    required: true,
    isActive: true,
    position: 0,
    constraints: { maxLength: 80 },
    ...overrides,
  };
}

function receipt(receiptId) {
  return {
    receiptId,
    contentType: "image/png",
    byteSize: 800,
    dimensions: { width: 600, height: 600 },
    createdAt: "2026-08-13T00:00:00.000Z",
    expiresAt: "2026-08-15T00:00:00.000Z",
    lifecycle: "active",
  };
}

async function acceptedWith(values) {
  const catalog = createDevelopmentCatalogRepository(variantConfig);
  const catalogResult = await catalog.findPublicProductById(productId);
  assert.equal(catalogResult.status, "found");
  const detail = catalogResult.value;
  const handoff = baseHandoff({ customizationValues: values });
  return acceptConfiguredItemHandoff({
    rawInput: handoff,
    verifiedOwnerId: ownerId,
    observedAt,
  }, {
    catalogRepository: { async findPublicProductById() { return catalogResult; } },
    customizationFieldRepository: {
      async getCustomizationFieldsForProduct() {
        return { status: "found", value: { productId, configurationRevision: revision, fields: [textField(), imageField()] } };
      },
    },
    receiptRepository: {
      async findOwnedReceipt(receiptId) {
        return { status: "found", value: receipt(receiptId) };
      },
    },
  }).then((result) => ({ result, detail, handoff }));
}

function uint32BE(value) {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function png(width, height) {
  const chunk = (type, data) => [
    ...uint32BE(data.length),
    ...type.split("").map((character) => character.charCodeAt(0)),
    ...data,
    0, 0, 0, 0,
  ];
  return new Uint8Array([
    137, 80, 78, 71, 13, 10, 26, 10,
    ...chunk("IHDR", [...uint32BE(width), ...uint32BE(height), 8, 6, 0, 0, 0]),
    ...chunk("IDAT", [0]),
    ...chunk("IEND", []),
  ]);
}

test("9.5-1: admin and domain field configuration reject deferred pricing, rule, supplier, AI, preview, and media properties", () => {
  const fieldDeferredAttempts = [
    ["surcharge", { surcharge: 100 }],
    ["pricingFormula", { constraints: { maxLength: 80, pricingFormula: "value.length * 2" } }],
    ["condition", { constraints: { maxLength: 80, condition: "field-photo exists" } }],
    ["dependsOn", { constraints: { maxLength: 80, dependsOn: "field-style" } }],
    ["supplierInstruction", { supplierInstruction: "use factory A" }],
    ["productionRoute", { productionRoute: "route-a" }],
    ["aiInstruction", { aiInstruction: "enhance portrait" }],
    ["backgroundRemoval", { backgroundRemoval: true }],
    ["faceDetection", { faceDetection: true }],
    ["moderation", { moderation: true }],
    ["productionPreview", { productionPreview: true }],
  ];
  for (const [name, addition] of fieldDeferredAttempts) {
    const field = { ...adminField(), ...addition };
    assert.equal(parseReplaceCustomizationConfigurationIntent({ productId, expectedCurrentRevision: revision, fields: [field] }).ok, false, name);
    assert.equal(parseCustomizationField({ ...textField(), ...addition }).ok, false, name);
  }
  assert.equal(parseCustomizationField({ ...textField(), metadata: { arbitrary: true } }).ok, false);
});

test("9.5-2: customer values reject browser commercial, supplier, routing, AI, preview, and approval authority", () => {
  for (const name of ["price", "surcharge", "supplierId", "routing", "aiPrompt", "productionPreview", "approval"]) {
    assert.equal(parseCustomizationValue({ ...textValue(), [name]: name }).ok, false, name);
  }
});

test("9.5-3: Variant price/currency remain authoritative across different customer text and image values", async () => {
  const first = await acceptedWith([textValue("Ada"), imageValue("receipt-a")]);
  const second = await acceptedWith([textValue("Grace"), imageValue("receipt-b")]);
  assert.equal(first.result.status, "accepted");
  assert.equal(second.result.status, "accepted");
  const firstVariant = first.detail.variants.find((variant) => variant.id === first.result.handoff.variantId);
  const secondVariant = second.detail.variants.find((variant) => variant.id === second.result.handoff.variantId);
  assert.ok(firstVariant);
  assert.ok(secondVariant);
  assert.equal(firstVariant.id, secondVariant.id);
  assert.equal(firstVariant.priceCents, secondVariant.priceCents);
  assert.equal(firstVariant.currency, secondVariant.currency);
  assert.deepEqual(first.result.handoff.customizationValues.map((value) => value.kind), ["short_text", "image"]);
  assert.deepEqual(second.result.handoff.customizationValues.map((value) => value.kind), ["short_text", "image"]);
});

test("9.5-4: configured handoff rejects deferred and browser-authoritative fields at top level and nested value level", () => {
  for (const name of ["price", "currency", "surcharge", "mergeKey", "cartKey", "fingerprint", "provider", "bucket", "storageKey", "productionPreview"]) {
    assert.equal(parseConfiguredItemHandoff({ ...baseHandoff(), [name]: name }).ok, false, name);
  }
  for (const name of ["price", "currency", "surcharge", "provider", "bucket", "storageKey", "productionPreview"]) {
    assert.equal(parseConfiguredItemHandoff({
      ...baseHandoff(),
      customizationValues: [{ ...imageValue(), [name]: name }],
    }).ok, false, `nested ${name}`);
  }
});

test("9.5-5: normalized order request rejects the same deferred and commercial authority without downgrade", () => {
  const base = {
    ...baseHandoff(),
    customizationValues: [textValue()],
  };
  for (const name of ["price", "currency", "surcharge", "mergeKey", "cartKey", "fingerprint", "provider", "bucket", "storageKey", "productionPreview"]) {
    assert.equal(parseOrderRequestItem({ ...base, [name]: name }), null, name);
  }
  assert.equal(parseOrderRequestItem({ ...base, customizationValues: [{ ...textValue(), price: 1 }] }), null);
});

test("9.5-6: compatibility projection contains only normalized customer input and receipt references", () => {
  const projection = mapConfiguredItemToOrderCustomizationCompatibility(baseHandoff({
    customizationValues: [textValue(), imageValue("receipt-a", { crop: { x: 0, y: 0, width: 1, height: 1 } })],
  }));
  const serialized = JSON.stringify(projection);
  for (const forbidden of ["price", "currency", "surcharge", "supplierId", "routing", "provider", "bucket", "storageKey", "productionPreview"]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
  assert.deepEqual(projection.uploadReferences[0], {
    fieldId: "field-photo",
    fieldCode: "photo",
    imagePosition: 0,
    receiptId: "receipt-a",
    crop: { x: 0, y: 0, width: 1, height: 1 },
  });
});

test("9.5-7: two identical configured copies remain two entries without quantity aggregation or identity generation", () => {
  const input = [baseHandoff({ customizationValues: [textValue("Ada")] }), baseHandoff({ customizationValues: [textValue("Ada")] })];
  const output = preserveConfiguredItemCopies(input);
  assert.equal(output.length, 2);
  assert.deepEqual(output[0], output[1]);
  assert.equal("quantity" in output[0], false);
  assert.equal("copyId" in output[0], false);
});

test("9.5-8: deterministic image MIME, byte-size, dimension, and crop metadata behavior remains allowed", () => {
  const valid = inspectCustomerImageBytes({ bytes: png(300, 300), originalFilename: "portrait.png" }, imageConstraints);
  assert.equal(valid.accepted, true);
  assert.equal(valid.image.contentType, "image/png");
  assert.deepEqual(valid.image.dimensions, { width: 300, height: 300 });
  assert.equal(inspectCustomerImageBytes({ bytes: new Uint8Array(), originalFilename: "empty.png" }, imageConstraints).accepted, false);
  assert.equal(inspectCustomerImageBytes({ bytes: png(99, 300), originalFilename: "small.png" }, imageConstraints).accepted, false);
  assert.equal(parseCustomizationCropRegion({ x: 0, y: 0, width: 0.5, height: 0.5 }).ok, true);
  assert.equal(parseCustomizationCropRegion({ x: 0.8, y: 0, width: 0.3, height: 1 }).ok, false);
});

test("9.5-9: customer-input preview remains available and is not a production-preview authority", () => {
  const calls = [];
  const urlApi = {
    createObjectURL() { calls.push("create"); return "blob:customer-input"; },
    revokeObjectURL(url) { calls.push(["revoke", url]); },
  };
  const preview = createLocalCustomerInputPreview(new File([new Uint8Array([1])], "photo.png", { type: "image/png" }), urlApi);
  assert.equal(preview.url, "blob:customer-input");
  disposeLocalCustomerInputPreview(preview);
  assert.deepEqual(calls, ["create", ["revoke", "blob:customer-input"]]);
});

const productionCustomizationSources = [
  "app/domain/customization-field.ts",
  "app/domain/customization-value.ts",
  "app/domain/customization-validation.ts",
  "app/domain/customer-image-inspection.ts",
  "app/domain/product-customization-draft.ts",
  "app/domain/configured-item.ts",
  "app/application/configured-item-handoff-acceptance.ts",
  "app/application/configured-item-copy-sequence.ts",
  "app/application/configured-item-order-compatibility.ts",
  "app/application/normalized-order-request-boundary.ts",
  "app/application/product-customization-handoff-gate.ts",
  "app/application/product-customization-crop-editor.ts",
  "app/application/customer-upload-acceptance-service.ts",
  "app/application/customer-upload-lifecycle-service.ts",
  "app/application/customer-upload-object-store.ts",
  "app/application/customer-upload-repository.ts",
  "app/server/customer-upload-http-handler.server.ts",
  "app/server/customer-upload-preview-handler.server.ts",
  "app/storefront/ProductCustomizationImageField.tsx",
  "app/storefront/ProductCustomizationTextField.tsx",
  "app/storefront/ProductCustomizationFormShell.tsx",
  "app/storefront/ProductCustomizationSummary.tsx",
  "app/storefront/ProductCustomizationHandoffGate.tsx",
  "app/storefront/ProductDetailExperience.tsx",
];

const uploadProductionSources = [
  "app/application/customer-upload-acceptance-service.ts",
  "app/application/customer-upload-lifecycle-service.ts",
  "app/application/customer-upload-object-store.ts",
  "app/application/customer-upload-repository.ts",
  "app/server/customer-upload-http-handler.server.ts",
  "app/server/customer-upload-preview-handler.server.ts",
  "app/api/uploads/route.ts",
];

async function sourceMap(paths) {
  return new Map(await Promise.all(paths.map(async (path) => [
    path,
    await readFile(new URL(`../${path}`, import.meta.url), "utf8"),
  ])));
}

test("9.5-10: production customization source contains no deferred AI, background, face, moderation, or production-preview processing", async () => {
  const sources = await sourceMap(productionCustomizationSources);
  const source = [...sources.values()].join("\n");
  assert.match(source, /CustomerInputPreview|customer input preview/i);
  assert.doesNotMatch(source, /\b(?:OpenAI|vision\s+model|generative\s+AI|inference\s+pipeline|aiPrompt)\b/i);
  assert.doesNotMatch(source, /\b(?:removeBackground|backgroundRemoval|segmentForeground|matting|maskGeneration|backgroundSegmentation)\b/);
  assert.doesNotMatch(source, /\b(?:faceDetection|faceRecognition|faceAnalysis|faceLandmarks|faceCount|facialEmbedding|identityMatching)\b/);
  assert.doesNotMatch(source, /\b(?:moderationApi|NSFWClassifier|contentSafetyModel|automaticModeration)\b/i);
  assert.doesNotMatch(source, /\b(?:ProductionPreview|CustomizationMockup|GeneratedPreview|ProductionProof|MockupApproval|productionPreview)\b/);
});

test("9.5-11: production customization source has no surcharge formula, arbitrary rule, supplier, or routing execution", async () => {
  const sources = await sourceMap(productionCustomizationSources);
  const source = [...sources.values()].join("\n");
  assert.doesNotMatch(source, /\b(?:priceDelta|additionalPrice|priceFormula|pricingFormula|customizationPrice|customerInputPrice|percentagePrice)\b/i);
  assert.doesNotMatch(source, /\b(?:condition|conditions|dependsOn|dependencyExpression|visibilityExpression|script)\s*:/i);
  assert.doesNotMatch(source, /\b(?:eval|Function)\s*\(/i);
  assert.doesNotMatch(source, /\b(?:supplierId|supplierCode|supplierInstruction|factoryId|factoryCode|routingRule|productionRoute|productionRouting|productionDestination)\b/);
});

test("9.5-12: cart identity and durable cart persistence remain absent from the customization runtime", async () => {
  const paths = [
    "app/domain/product-customization-draft.ts",
    "app/domain/configured-item.ts",
    "app/application/configured-item-copy-sequence.ts",
    "app/application/configured-item-order-compatibility.ts",
    "app/application/normalized-order-request-boundary.ts",
    "app/application/product-customization-handoff-gate.ts",
    "app/storefront/ProductDetailExperience.tsx",
    "app/storefront/ProductCustomizationFormShell.tsx",
  ];
  const sources = await sourceMap(paths);
  const source = [...sources.values()].join("\n");
  assert.doesNotMatch(source, /\b(?:cartKey|mergeKey|fingerprint|contentHash|customizationHash|configuredItemHash|dedupeKey|lineIdentity|cartLineIdentity)\b/);
  assert.doesNotMatch(source, /JSON\.stringify\s*\([^)]*(?:configured|customization)/i);
  assert.doesNotMatch(source, /\b(?:localStorage|sessionStorage|indexedDB|document\.cookie)\b/i);
});

test("9.5-13: upload production composition remains provider-stopped and provider-neutral", async () => {
  const sources = await sourceMap(uploadProductionSources);
  const source = [...sources.values()].join("\n");
  assert.doesNotMatch(source, /@supabase\/supabase-js|Supabase\s+Storage|SUPABASE_UPLOAD_BUCKET|R2Bucket|Cloudflare\s+R2|S3Client|storageKey|objectKey|signedUrl|\bbucket\b/i);
  const response = await uploadRoute(new Request("https://photogift.test/api/uploads", { method: "POST" }));
  assert.equal(response.status, 503);
  assert.equal((await response.text()).includes("Customer upload is temporarily unavailable."), true);
});

test("9.5-14: fixture/fake/local-smoke support remains explicit and cannot become production source data", async () => {
  const selectedFixture = createServerCustomizationFieldRepository(variantConfig);
  assert.equal(selectedFixture.source, "fixture");
  assert.throws(() => createServerCustomizationFieldRepository({ NODE_ENV: "production", PHOTOGIFT_PRODUCT_SOURCE: "fixture" }));

  const sources = await sourceMap([
    "app/api/uploads/route.ts",
    "app/product/[slug]/page.tsx",
  ]);
  const productionRoutes = [...sources.values()].join("\n");
  assert.doesNotMatch(productionRoutes, /development-customization-field|customer-upload-fakes|customer-upload-failure-controls|customer-upload-local-smoke-harness/);
});

test("9.5-15: crop implementation remains metadata-only without binary transformation", async () => {
  const sources = await sourceMap([
    "app/domain/customization-value.ts",
    "app/application/product-customization-crop-editor.ts",
    "app/client/local-customer-input-preview.ts",
    "app/storefront/ProductCustomizationImageField.tsx",
  ]);
  const source = [...sources.values()].join("\n");
  assert.doesNotMatch(source, /canvas\.toBlob|canvas\.toDataURL|OffscreenCanvas|drawImage|FileReader/);
  const parsed = parseCustomizationValue({
    ...imageValue(),
    images: [{ receiptId: "receipt-a", crop: { x: 0.1, y: 0.2, width: 0.5, height: 0.5 } }],
  });
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.value.images[0].crop, { x: 0.1, y: 0.2, width: 0.5, height: 0.5 });
});
