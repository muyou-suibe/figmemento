import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { loadPublicProductDetailWithCustomization } from "../app/application/customization-product-detail.ts";
import { evaluateProductCustomizationHandoff } from "../app/application/product-customization-handoff-gate.ts";
import { parseCustomizationField } from "../app/domain/customization-field.ts";
import { createProductCustomizationDraft, reduceProductCustomizationDraft } from "../app/domain/product-customization-draft.ts";
import {
  DEVELOPMENT_CUSTOMIZATION_FIELD_FIXTURE_NOTICE,
  createDevelopmentCustomizationFieldFixtures,
} from "../app/infrastructure/customization/development-customization-field-fixtures.ts";
import {
  FixtureCustomizationFieldRepository,
  createDevelopmentCustomizationFieldRepository,
} from "../app/infrastructure/customization/development-customization-field-repository.ts";

const configuredProductIds = [
  "fixture-product-couple-figure",
  "fixture-product-glass-light-picture",
  "fixture-product-digital-portrait",
  "fixture-product-temporary-tattoo",
];

test("development customization fixtures are explicitly non-production synthetic field definitions", () => {
  assert.match(DEVELOPMENT_CUSTOMIZATION_FIELD_FIXTURE_NOTICE, /DEVELOPMENT FIXTURE ONLY/);
  assert.match(DEVELOPMENT_CUSTOMIZATION_FIELD_FIXTURE_NOTICE, /NON-PRODUCTION/);
  assert.match(DEVELOPMENT_CUSTOMIZATION_FIELD_FIXTURE_NOTICE, /NOT BUSINESS APPROVED/);
  assert.match(DEVELOPMENT_CUSTOMIZATION_FIELD_FIXTURE_NOTICE, /NOT SUPPLIER DATA/);
  assert.match(DEVELOPMENT_CUSTOMIZATION_FIELD_FIXTURE_NOTICE, /NOT MIGRATION DATA/);

  const first = createDevelopmentCustomizationFieldFixtures();
  const second = createDevelopmentCustomizationFieldFixtures();
  assert.deepEqual(first, second);
  assert.notEqual(first, second);
  assert.deepEqual(first.map((configuration) => configuration.productId), configuredProductIds);
  assert.deepEqual(
    first.map((configuration) => configuration.configurationRevision),
    [
      "fixture-customization-revision-couple-figure-v1",
      "fixture-customization-revision-glass-light-picture-v1",
      "fixture-customization-revision-digital-portrait-v1",
      "fixture-customization-revision-temporary-tattoo-v1",
    ],
  );
  assert.equal(new Set(first.map((configuration) => configuration.configurationRevision)).size, first.length);
});

test("fixture fields use the existing parser with stable Product ownership, revisions, and positions", () => {
  for (const configuration of createDevelopmentCustomizationFieldFixtures()) {
    assert.equal(new Set(configuration.fields.map((field) => field.id)).size, configuration.fields.length);
    assert.equal(new Set(configuration.fields.map((field) => field.code)).size, configuration.fields.length);
    assert.equal(new Set(configuration.fields.map((field) => field.position)).size, configuration.fields.length);
    for (const field of configuration.fields) {
      assert.equal(parseCustomizationField(field).ok, true);
      assert.equal(field.productId, configuration.productId);
      assert.equal(field.configurationRevision, configuration.configurationRevision);
    }
  }

  const fields = createDevelopmentCustomizationFieldFixtures().flatMap((configuration) => configuration.fields);
  assert.ok(fields.some((field) => field.kind === "image" && field.required && field.constraints.cropEnabled));
  assert.ok(fields.some((field) => field.kind === "image" && !field.constraints.cropEnabled));
  assert.ok(fields.some((field) => field.kind === "image" && field.constraints.maxImageCount > 1));
  assert.ok(fields.some((field) => field.kind === "short_text" && !field.required));
  assert.ok(fields.some((field) => field.kind === "long_text" && !field.required));
});

test("fixture repository is deterministic, position ordered, and returns not_found outside the small configured set", async () => {
  const repository = new FixtureCustomizationFieldRepository();
  const first = await repository.getCustomizationFieldsForProduct("fixture-product-glass-light-picture");
  const second = await repository.getCustomizationFieldsForProduct("fixture-product-glass-light-picture");
  assert.equal(first.status, "found");
  assert.deepEqual(second, first);
  assert.deepEqual(first.value.fields.map((field) => field.position), [0, 1]);
  assert.deepEqual(first.value.fields.map((field) => field.productId), [first.value.productId, first.value.productId]);
  assert.deepEqual(
    await repository.getCustomizationFieldsForProduct("fixture-product-pet-figure"),
    { status: "not_found" },
  );
});

test("temporary tattoo has an explicit configured-empty development fixture", async () => {
  const repository = new FixtureCustomizationFieldRepository();
  const result = await repository.getCustomizationFieldsForProduct("fixture-product-temporary-tattoo");

  assert.deepEqual(result, {
    status: "found",
    value: {
      productId: "fixture-product-temporary-tattoo",
      configurationRevision: "fixture-customization-revision-temporary-tattoo-v1",
      fields: [],
    },
  });
});

test("temporary tattoo composition is configured-empty and does not invent customer fields", async () => {
  const productId = "fixture-product-temporary-tattoo";
  const configurationRevision = "fixture-customization-revision-temporary-tattoo-v1";
  const catalog = {
    category: { id: "category-custom-crafts", slug: "custom-crafts", name: "Custom Crafts", description: "Development fixtures.", seo: {}, lifecycle: "published" },
    product: { id: productId, slug: "temporary-tattoo", categoryId: "category-custom-crafts", name: "Custom Temporary Tattoos", description: "A local demo product.", seo: {}, lifecycle: "published" },
    listingPrice: { kind: "single", priceCents: 990, currency: "USD" },
    options: [],
    optionValues: [],
    variants: [{ id: "fixture-variant-temporary-tattoo", productId, skuCode: "DEV-TEMPORARY-TATTOO", priceCents: 990, currency: "USD", weightGrams: 5, isActive: true, isAvailable: true, isDefault: true, supplyMethod: "made_to_order", selectedOptions: [] }],
    assets: [],
    fulfillment: { id: "fulfillment-temporary-tattoo", productId, fulfillmentType: "physical", requiresShipping: true, productionMode: "custom_manufacturing", leadTime: { minBusinessDays: 5, maxBusinessDays: 10 } },
  };
  const result = await loadPublicProductDetailWithCustomization(
    { async findPublicProductBySlug() { return { status: "found", value: catalog }; } },
    new FixtureCustomizationFieldRepository(),
    "temporary-tattoo",
  );

  assert.equal(result.status, "found");
  assert.deepEqual(result.value.customization, { status: "configured", configurationRevision, fields: [] });
  assert.equal(result.value.customization.fields.some((field) => ["image", "short_text", "long_text"].includes(field.kind)), false);
});

test("temporary tattoo configured-empty handoff reaches locally_ready with no customization values", () => {
  const productId = "fixture-product-temporary-tattoo";
  const configurationRevision = "fixture-customization-revision-temporary-tattoo-v1";
  let draft = createProductCustomizationDraft({ productId, configurationRevision });
  draft = reduceProductCustomizationDraft(draft, {
    type: "set_variant_selection",
    selection: { variantId: "fixture-variant-temporary-tattoo", skuCode: "DEV-TEMPORARY-TATTOO" },
  });
  const result = evaluateProductCustomizationHandoff({
    draft,
    productId,
    configurationRevision,
    fields: [],
    options: [],
    optionValues: [],
    variants: [{ id: "fixture-variant-temporary-tattoo", productId, skuCode: "DEV-TEMPORARY-TATTOO", priceCents: 990, currency: "USD", isActive: true, isAvailable: true, selectedOptions: [] }],
    observedAt: "2026-09-09T00:00:00.000Z",
  });

  assert.equal(result.status, "locally_ready");
  assert.deepEqual(result.handoff.customizationValues, []);
  assert.equal("supplierSpecificationKey" in result.handoff, false);
});

test("temporary tattoo configuration is not a production fallback", () => {
  assert.throws(
    () => createDevelopmentCustomizationFieldRepository({ NODE_ENV: "production", PHOTOGIFT_PRODUCT_SOURCE: "supabase" }),
    /explicit fixture source selection/,
  );
});

test("development repository requires the existing explicit fixture source selection", () => {
  assert.ok(createDevelopmentCustomizationFieldRepository({
    NODE_ENV: "test",
    PHOTOGIFT_PRODUCT_SOURCE: "fixture",
  }) instanceof FixtureCustomizationFieldRepository);
  assert.throws(
    () => createDevelopmentCustomizationFieldRepository({ NODE_ENV: "test" }),
    /explicit fixture source selection/,
  );
});

test("fixture modules are provider-neutral definitions with no private input, catalog asset, order, payment, or legacy dependencies", async () => {
  const paths = [
    "../app/infrastructure/customization/development-customization-field-fixtures.ts",
    "../app/infrastructure/customization/development-customization-field-repository.ts",
  ];
  const source = (await Promise.all(paths.map((path) => readFile(new URL(path, import.meta.url), "utf8")))).join("\n");

  assert.doesNotMatch(source, /@supabase\/supabase-js|supabase-server|storage|productasset|product_asset|order|payment|legacy|seed/i);
  assert.doesNotMatch(source, /receipt|owner_binding|draft|bucket|object[_-]?key|preview|signed[_-]?url|customer[_-]?(?:id|file|text|value)/i);
  assert.doesNotMatch(source, /priceCents|currency|surcharge|skuCode|variantId|optionId|weightGrams|leadTime/i);
  assert.doesNotMatch(source, /supplier[-_]?data|supplier[-_]?instruction|supplier[-_]?id/i);
  assert.doesNotMatch(source, /customization_schema|fetch\s*\(|randomuuid|math\.random|date\.now/i);
});

test("fixture reads stay offline", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("network must not be used"); };
  try {
    const repository = new FixtureCustomizationFieldRepository();
    assert.equal((await repository.getCustomizationFieldsForProduct(configuredProductIds[0])).status, "found");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
