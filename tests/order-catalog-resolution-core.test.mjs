import assert from "node:assert/strict";
import test from "node:test";

import { resolveLegacyOrderItemCompatibility } from "../app/application/legacy-order-compatibility.ts";
import {
  calculateResolvedOrderSubtotal,
  resolveOrderCatalogItems,
} from "../app/application/order-catalog-resolution.ts";
import {
  parseCatalogOrderRequestItem,
  parseDeprecatedLegacyProductOrderItem,
} from "../app/domain/order-catalog-compatibility.ts";
import { createDevelopmentCatalogRepository } from "../app/infrastructure/catalog/development-catalog-repository.ts";

const fixtureEnvironment = {
  NODE_ENV: "development",
  PHOTOGIFT_PRODUCT_SOURCE: "fixture",
};

function fixtureRepository() {
  return createDevelopmentCatalogRepository(fixtureEnvironment);
}

async function fixtureProduct() {
  const repository = fixtureRepository();
  const detail = await repository.findPublicProductById("fixture-product-couple-figure");
  assert.equal(detail.status, "found");
  const mini = detail.value.variants.find((variant) => variant.skuCode === "DEV-COUPLE-FIGURE-MINI");
  const standard = detail.value.variants.find((variant) => variant.skuCode === "DEV-COUPLE-FIGURE-STANDARD");
  assert.ok(mini && standard);
  return { repository, detail: structuredClone(detail.value), mini, standard };
}

function nativeItem(variant, overrides = {}) {
  return {
    productId: variant.productId,
    variantId: variant.id,
    skuCode: variant.skuCode,
    selectedOptions: variant.selectedOptions.map((selection) => ({ ...selection })),
    quantity: 1,
    customization: { note: "Separate customer input", photoPath: "drafts/test.jpg" },
    ...overrides,
  };
}

function repositoryResult(result) {
  return { findPublicProductById: async () => result };
}

test("1-2: valid native Variant resolves without a browser slug", async () => {
  const { repository, mini } = await fixtureProduct();
  const result = await resolveOrderCatalogItems([nativeItem(mini)], repository);
  assert.equal(result.status, "resolved");
  assert.deepEqual(result.status === "resolved" ? {
    productId: result.items[0].productId,
    productName: result.items[0].productName,
    productSlug: result.items[0].productSlug,
    variantId: result.items[0].variantId,
    skuCode: result.items[0].skuCode,
    fulfillmentType: result.items[0].fulfillmentType,
  } : null, {
    productId: "fixture-product-couple-figure",
    productName: "Custom Couple Figure",
    productSlug: "couple-figure",
    variantId: mini.id,
    skuCode: mini.skuCode,
    fulfillmentType: "physical",
  });
});

test("3: Task 7.2 legacy output enters the same native validation and pricing path", async () => {
  const repository = fixtureRepository();
  const legacy = parseCatalogOrderRequestItem({
    slug: "couple-figure",
    quantity: 2,
    customization: { photoPath: "drafts/legacy.jpg" },
  });
  assert.ok(legacy);
  const compatible = await resolveLegacyOrderItemCompatibility(legacy, repository);
  assert.equal(compatible.status, "resolved");
  const resolved = compatible.status === "resolved"
    ? await resolveOrderCatalogItems([compatible.item], repository)
    : compatible;
  assert.equal(resolved.status, "resolved");
  assert.equal(resolved.status === "resolved" ? resolved.items[0].unitBasePriceCents : null, 6_990);
});

test("4: unknown Product ID is rejected", async () => {
  const { repository, mini } = await fixtureProduct();
  const result = await resolveOrderCatalogItems([
    nativeItem(mini, { productId: "unknown-product" }),
  ], repository);
  assert.deepEqual(result, { status: "rejected", reason: "product_not_found" });
});

test("5: unknown Variant ID is rejected without fallback", async () => {
  const { repository, mini } = await fixtureProduct();
  const result = await resolveOrderCatalogItems([
    nativeItem(mini, { variantId: "unknown-variant" }),
  ], repository);
  assert.deepEqual(result, { status: "rejected", reason: "variant_not_found" });
});

test("6: Product and Variant ownership mismatch is rejected", async () => {
  const { detail, mini } = await fixtureProduct();
  detail.variants = detail.variants.map((variant) =>
    variant.id === mini.id ? { ...variant, productId: "different-product" } : variant,
  );
  const result = await resolveOrderCatalogItems(
    [nativeItem(mini)],
    repositoryResult({ status: "found", value: detail }),
  );
  assert.equal(result.status, "rejected");
});

test("7: browser SKU code must equal the resolved Variant SKU code", async () => {
  const { repository, mini } = await fixtureProduct();
  const result = await resolveOrderCatalogItems([
    nativeItem(mini, { skuCode: "DEV-COUPLE-FIGURE-STANDARD" }),
  ], repository);
  assert.deepEqual(result, { status: "rejected", reason: "sku_mismatch" });
});

test("8-9: selected Options require canonical equality and ignore ordering only", async () => {
  const { detail, mini } = await fixtureProduct();
  const materialOption = {
    id: "fixture-option-couple-figure-material",
    productId: detail.product.id,
    code: "material",
    name: "Material",
    kind: "material",
    required: false,
    position: 2,
  };
  const materialValue = {
    id: "fixture-value-couple-figure-material-resin",
    productId: detail.product.id,
    optionId: materialOption.id,
    code: "resin",
    label: "Resin",
    position: 1,
  };
  detail.options = [...detail.options, materialOption];
  detail.optionValues = [...detail.optionValues, materialValue];
  detail.variants = detail.variants.map((variant) =>
    variant.id === mini.id
      ? { ...variant, selectedOptions: [...variant.selectedOptions, { optionId: materialOption.id, valueId: materialValue.id }] }
      : variant,
  );
  const authoritative = detail.variants.find((variant) => variant.id === mini.id);
  const result = await resolveOrderCatalogItems([
    nativeItem(authoritative, { selectedOptions: [...authoritative.selectedOptions].reverse() }),
  ], repositoryResult({ status: "found", value: detail }));
  assert.equal(result.status, "resolved");
});

test("10: stale, missing, and extra selected Options are rejected", async () => {
  const { repository, mini } = await fixtureProduct();
  const candidates = [
    [],
    [{ optionId: mini.selectedOptions[0].optionId, valueId: "stale-value" }],
    [...mini.selectedOptions, { optionId: "extra-option", valueId: "extra-value" }],
  ];
  for (const selectedOptions of candidates) {
    const result = await resolveOrderCatalogItems([
      nativeItem(mini, { selectedOptions }),
    ], repository);
    assert.deepEqual(result, { status: "rejected", reason: "selected_options_mismatch" });
  }
});

test("11-12: inactive and unavailable exact Variants are rejected", async () => {
  for (const change of [{ isActive: false }, { isAvailable: false }]) {
    const { detail, mini } = await fixtureProduct();
    detail.variants = detail.variants.map((variant) =>
      variant.id === mini.id ? { ...variant, ...change } : variant,
    );
    const result = await resolveOrderCatalogItems(
      [nativeItem(mini)],
      repositoryResult({ status: "found", value: detail }),
    );
    assert.deepEqual(result, { status: "rejected", reason: "variant_unavailable" });
  }
});

test("13: unpublished Product or Category is ineligible", async () => {
  for (const field of ["product", "category"]) {
    const { detail, mini } = await fixtureProduct();
    detail[field] = { ...detail[field], lifecycle: "draft" };
    const result = await resolveOrderCatalogItems(
      [nativeItem(mini)],
      repositoryResult({ status: "found", value: detail }),
    );
    assert.deepEqual(result, { status: "rejected", reason: "product_not_eligible" });
  }
});

test("14: invalid FulfillmentConfig is rejected", async () => {
  const { detail, mini } = await fixtureProduct();
  detail.fulfillment = {
    ...detail.fulfillment,
    fulfillmentType: "digital",
    requiresShipping: true,
  };
  const result = await resolveOrderCatalogItems(
    [nativeItem(mini)],
    repositoryResult({ status: "found", value: detail }),
  );
  assert.deepEqual(result, { status: "rejected", reason: "invalid_catalog_configuration" });
});

test("15-16: source failures and invalid catalog configuration fail closed", async () => {
  const { mini } = await fixtureProduct();
  assert.deepEqual(
    await resolveOrderCatalogItems([nativeItem(mini)], repositoryResult({ status: "source_failure", operation: "catalog.read" })),
    { status: "rejected", reason: "catalog_source_failure" },
  );
  assert.deepEqual(
    await resolveOrderCatalogItems([nativeItem(mini)], repositoryResult({ status: "invalid_configuration", issues: [] })),
    { status: "rejected", reason: "invalid_catalog_configuration" },
  );
});

test("17-20: Variant prices are authoritative and same-Product Variants remain independently priced", async () => {
  const { repository, mini, standard } = await fixtureProduct();
  const result = await resolveOrderCatalogItems([
    nativeItem(mini, { quantity: 2 }),
    nativeItem(standard, { quantity: 3 }),
  ], repository);
  assert.equal(result.status, "resolved");
  assert.deepEqual(
    result.status === "resolved" ? result.items.map((item) => [item.skuCode, item.unitBasePriceCents, item.quantity]) : [],
    [
      ["DEV-COUPLE-FIGURE-MINI", 6_990, 2],
      ["DEV-COUPLE-FIGURE-STANDARD", 8_990, 3],
    ],
  );
  assert.equal(result.status === "resolved" ? calculateResolvedOrderSubtotal(result.items) : 0, 40_950);
});

test("18, 21: legacy/browser prices and currency cannot override the Variant price", async () => {
  const repository = fixtureRepository();
  const legacy = parseDeprecatedLegacyProductOrderItem({
    slug: "couple-figure",
    quantity: 1,
    customization: { photoPath: "drafts/legacy-price.jpg" },
    price: 0.01,
    priceCents: 1,
    currency: "EUR",
  });
  assert.ok(legacy);
  const compatible = await resolveLegacyOrderItemCompatibility(legacy, repository);
  assert.equal(compatible.status, "resolved");
  const result = compatible.status === "resolved"
    ? await resolveOrderCatalogItems([compatible.item], repository)
    : compatible;
  assert.equal(result.status === "resolved" ? result.items[0].unitBasePriceCents : null, 6_990);
  assert.equal(result.status === "resolved" ? result.items[0].currency : null, "USD");
});

test("25: Customization remains separate from authoritative Variant Options", async () => {
  const { repository, mini } = await fixtureProduct();
  const customization = { note: "Do not merge this into options", photoPath: "drafts/separate.jpg" };
  const result = await resolveOrderCatalogItems([
    nativeItem(mini, { customization }),
  ], repository);
  assert.equal(result.status, "resolved");
  assert.deepEqual(result.status === "resolved" ? result.items[0].customization : null, customization);
  assert.deepEqual(result.status === "resolved" ? result.items[0].selectedOptions : [], mini.selectedOptions);
});

test("26: resolution is offline and never invokes fetch or live Supabase", async () => {
  const { repository, mini } = await fixtureProduct();
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("Network access is forbidden.");
  };
  try {
    assert.equal((await resolveOrderCatalogItems([nativeItem(mini)], repository)).status, "resolved");
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
