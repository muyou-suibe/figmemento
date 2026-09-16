import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { loadPublicProductDetailWithCustomization } from "../app/application/customization-product-detail.ts";

const productId = "product-frame";
const configurationRevision = "revision-current";

const catalogDetail = {
  category: { id: "category-gifts", slug: "gifts", name: "Gifts", description: "Thoughtful gifts", seo: {}, lifecycle: "published" },
  product: { id: productId, slug: "custom-frame", categoryId: "category-gifts", name: "Custom Frame", description: "A custom frame", seo: {}, lifecycle: "published" },
  listingPrice: { kind: "single", priceCents: 5_990, currency: "USD" },
  options: [{ id: "option-size", productId, code: "size", name: "Size", kind: "size", required: true, position: 0 }],
  optionValues: [{ id: "value-small", productId, optionId: "option-size", code: "small", label: "Small", position: 0 }],
  variants: [{ id: "variant-small", productId, skuCode: "FRAME-SMALL", priceCents: 5_990, currency: "USD", weightGrams: 300, isActive: true, isAvailable: true, isDefault: true, supplyMethod: "made_to_order", selectedOptions: [{ optionId: "option-size", valueId: "value-small" }] }],
  assets: [{ id: "asset-marketing", productId, mediaType: "image", role: "thumbnail", position: 0, visibility: "public", source: { kind: "public_reference", value: "marketing:frame/thumbnail" } }],
  fulfillment: { id: "fulfillment-frame", productId, fulfillmentType: "physical", requiresShipping: true, productionMode: "custom_manufacturing", leadTime: { minBusinessDays: 5, maxBusinessDays: 10 } },
};

function field(overrides = {}) {
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
    constraints: { maxLength: 80 },
    ...overrides,
  };
}

function catalogRepository(result = { status: "found", value: catalogDetail }) {
  const calls = [];
  return {
    calls,
    async findPublicProductBySlug(slug) {
      calls.push(slug);
      return result;
    },
  };
}

function customizationRepository(result = {
  status: "found",
  value: { productId, configurationRevision, fields: [field({ position: 1 }), field({ id: "field-note", code: "note", label: "Note", kind: "long_text", position: 0, constraints: { maxLength: 500 } })] },
}) {
  const calls = [];
  return {
    calls,
    async getCustomizationFieldsForProduct(id) {
      calls.push(id);
      return result;
    },
  };
}

test("resolves an eligible public catalog detail first, then reads customization by Product identity", async () => {
  const catalog = catalogRepository();
  const customization = customizationRepository();
  const result = await loadPublicProductDetailWithCustomization(catalog, customization, "custom-frame");

  assert.equal(result.status, "found");
  assert.deepEqual(catalog.calls, ["custom-frame"]);
  assert.deepEqual(customization.calls, [productId]);
  assert.equal(result.value.customization.status, "configured");
  assert.equal(result.value.customization.configurationRevision, configurationRevision);
  assert.deepEqual(result.value.customization.fields.map((entry) => entry.id), ["field-name", "field-note"]);
  assert.equal(result.value.catalog, catalogDetail);
});

test("catalog failures do not query customization configuration", async () => {
  const failures = [
    { status: "not_found" },
    { status: "unavailable", reason: "not_public" },
    { status: "invalid_configuration", issues: [{ path: "$.catalog", code: "invalid_value", message: "Catalog is invalid." }] },
    { status: "source_failure", operation: "catalog.read" },
  ];
  for (const expected of failures) {
    const catalog = catalogRepository(expected);
    const customization = customizationRepository();
    const result = await loadPublicProductDetailWithCustomization(catalog, customization, "not-public");
    assert.deepEqual(result, expected);
    assert.deepEqual(customization.calls, []);
  }
});

test("an absent configuration remains a found public Product with explicit not_configured state", async () => {
  const result = await loadPublicProductDetailWithCustomization(
    catalogRepository(),
    customizationRepository({ status: "not_found" }),
    "custom-frame",
  );

  assert.equal(result.status, "found");
  assert.deepEqual(result.value.customization, { status: "not_configured" });
});

test("a valid configured empty field set is not collapsed into not_configured", async () => {
  const result = await loadPublicProductDetailWithCustomization(
    catalogRepository(),
    customizationRepository({ status: "found", value: { productId, configurationRevision, fields: [] } }),
    "custom-frame",
  );

  assert.equal(result.status, "found");
  assert.deepEqual(result.value.customization, {
    status: "configured",
    configurationRevision,
    fields: [],
  });
});

test("invalid and unavailable configuration fail closed without hiding catalog semantics", async () => {
  const invalid = await loadPublicProductDetailWithCustomization(
    catalogRepository(),
    customizationRepository({ status: "invalid_configuration", issues: [{ path: "$.fields", code: "duplicate", message: "Duplicate field." }] }),
    "custom-frame",
  );
  assert.equal(invalid.status, "invalid_configuration");

  const unavailable = await loadPublicProductDetailWithCustomization(
    catalogRepository(),
    customizationRepository({ status: "source_failure", operation: "customization_field_configuration.read" }),
    "custom-frame",
  );
  assert.deepEqual(unavailable, { status: "source_failure", operation: "customization_field_configuration.read" });
});

test("a mismatched configuration Product identity is rejected without re-parsing fields", async () => {
  const result = await loadPublicProductDetailWithCustomization(
    catalogRepository(),
    customizationRepository({ status: "found", value: { productId: "product-other", configurationRevision, fields: [field()] } }),
    "custom-frame",
  );
  assert.equal(result.status, "invalid_configuration");
  assert.ok(result.issues.some((issue) => issue.code === "ownership"));
});

test("composition preserves separate catalog price, Variant, Option, fulfillment, and ProductAsset values", async () => {
  const result = await loadPublicProductDetailWithCustomization(
    catalogRepository(),
    customizationRepository(),
    "custom-frame",
  );
  assert.equal(result.status, "found");
  assert.equal(result.value.catalog.listingPrice.priceCents, 5_990);
  assert.equal(result.value.catalog.variants[0].skuCode, "FRAME-SMALL");
  assert.equal(result.value.catalog.options[0].code, "size");
  assert.equal(result.value.catalog.fulfillment.requiresShipping, true);
  assert.equal(result.value.catalog.assets[0].source.value, "marketing:frame/thumbnail");
  assert.deepEqual(Object.keys(result.value.customization).sort(), ["configurationRevision", "fields", "status"]);
});

test("public composition imports only application/domain catalog and field contracts", async () => {
  const source = await readFile(
    new URL("../app/application/customization-product-detail.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /@supabase\/supabase-js|infrastructure\/customization|customer_upload|order_upload|\.\.\/domain\/customization\.ts|api\/uploads|storage|payment|order/i);
  assert.doesNotMatch(source, /customization_schema|fixture|ProductDetailExperience|VariantSelector|fetch\s*\(/i);
});
