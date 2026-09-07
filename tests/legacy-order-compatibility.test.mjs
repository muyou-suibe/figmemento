import assert from "node:assert/strict";
import test from "node:test";

import { resolveLegacyOrderItemCompatibility } from "../app/application/legacy-order-compatibility.ts";
import {
  parseCatalogOrderRequestItem,
  parseDeprecatedLegacyProductOrderItem,
} from "../app/domain/order-catalog-compatibility.ts";
import { createDevelopmentCatalogRepository } from "../app/infrastructure/catalog/development-catalog-repository.ts";

const fixtureEnvironment = {
  NODE_ENV: "development",
  PHOTOGIFT_PRODUCT_SOURCE: "fixture",
};

function legacyItem(overrides = {}) {
  return {
    slug: "couple-figure",
    quantity: 2,
    customization: { note: "Keep this separate", photoPath: "drafts/test.jpg" },
    ...overrides,
  };
}

async function fixtureDetail() {
  const repository = createDevelopmentCatalogRepository(fixtureEnvironment);
  const result = await repository.findPublicProductBySlug("couple-figure");
  assert.equal(result.status, "found");
  return structuredClone(result.value);
}

function repositoryResult(result) {
  return { findPublicProductBySlug: async () => result };
}

async function resolve(item = legacyItem(), repository) {
  const source = repository ?? createDevelopmentCatalogRepository(fixtureEnvironment);
  return resolveLegacyOrderItemCompatibility(item, source);
}

test("1-2: exact legacy Product slug resolves the active available default Variant native identity", async () => {
  const result = await resolve();
  assert.equal(result.status, "resolved");
  assert.deepEqual(
    result.status === "resolved" ? {
      productId: result.item.productId,
      variantId: result.item.variantId,
      skuCode: result.item.skuCode,
      selectedOptions: result.item.selectedOptions,
    } : null,
    {
      productId: "fixture-product-couple-figure",
      variantId: "fixture-variant-couple-figure-mini",
      skuCode: "DEV-COUPLE-FIGURE-MINI",
      selectedOptions: [{
        optionId: "fixture-option-couple-figure-size",
        valueId: "fixture-value-couple-figure-size-mini",
      }],
    },
  );
});

test("3: legacy quantity is preserved without changing aggregation semantics", async () => {
  const result = await resolve(legacyItem({ quantity: 7 }));
  assert.equal(result.status, "resolved");
  assert.equal(result.status === "resolved" ? result.item.quantity : null, 7);
});

test("4: Customization is preserved as a separate sibling payload", async () => {
  const customization = { note: "A separate note", photoPath: "drafts/separate.jpg" };
  const result = await resolve(legacyItem({ customization }));
  assert.equal(result.status, "resolved");
  assert.deepEqual(result.status === "resolved" ? result.item.customization : null, customization);
  assert.equal(result.status === "resolved" && "customization" in result.item.selectedOptions[0], false);
});

test("5-6: deprecated legacy transport drops browser price and currency", () => {
  assert.deepEqual(
    parseDeprecatedLegacyProductOrderItem({
      ...legacyItem(),
      price: 0.01,
      priceCents: 1,
      currency: "EUR",
    }),
    legacyItem(),
  );
});

test("7: unknown Product slug is rejected", async () => {
  const result = await resolve(legacyItem({ slug: "unknown-product" }));
  assert.deepEqual(result, { status: "rejected", reason: "product_not_found" });
});

test("8: unavailable or ineligible Product is rejected", async () => {
  const result = await resolve(legacyItem(), repositoryResult({ status: "unavailable", reason: "not_public" }));
  assert.deepEqual(result, { status: "rejected", reason: "product_not_eligible" });
});

test("9: Product with no default Variant is rejected despite available Variants", async () => {
  const detail = await fixtureDetail();
  detail.variants = detail.variants.map((variant) => ({ ...variant, isDefault: false }));
  const result = await resolve(legacyItem(), repositoryResult({ status: "found", value: detail }));
  assert.deepEqual(result, { status: "rejected", reason: "default_variant_missing" });
});

test("10: multiple default Variants fail closed", async () => {
  const detail = await fixtureDetail();
  detail.variants = detail.variants.map((variant) => ({ ...variant, isDefault: true }));
  const result = await resolve(legacyItem(), repositoryResult({ status: "found", value: detail }));
  assert.equal(result.status, "rejected");
});

test("11: inactive default Variant is rejected without another-Variant fallback", async () => {
  const detail = await fixtureDetail();
  detail.variants = detail.variants.map((variant) =>
    variant.isDefault ? { ...variant, isActive: false } : variant,
  );
  const result = await resolve(legacyItem(), repositoryResult({ status: "found", value: detail }));
  assert.deepEqual(result, { status: "rejected", reason: "default_variant_unavailable" });
});

test("12: unavailable default Variant is rejected without another-Variant fallback", async () => {
  const detail = await fixtureDetail();
  detail.variants = detail.variants.map((variant) =>
    variant.isDefault ? { ...variant, isAvailable: false } : variant,
  );
  const result = await resolve(legacyItem(), repositoryResult({ status: "found", value: detail }));
  assert.deepEqual(result, { status: "rejected", reason: "default_variant_unavailable" });
});

test("13: malformed default Variant is rejected", async () => {
  const detail = await fixtureDetail();
  detail.variants = detail.variants.map((variant) =>
    variant.isDefault ? { ...variant, skuCode: "malformed sku" } : variant,
  );
  const result = await resolve(legacyItem(), repositoryResult({ status: "found", value: detail }));
  assert.deepEqual(result, { status: "rejected", reason: "invalid_catalog_configuration" });
});

test("14: Product/Variant ownership mismatch is rejected", async () => {
  const detail = await fixtureDetail();
  detail.variants = detail.variants.map((variant) =>
    variant.isDefault ? { ...variant, productId: "different-product" } : variant,
  );
  const result = await resolve(legacyItem(), repositoryResult({ status: "found", value: detail }));
  assert.equal(result.status, "rejected");
});

test("15: selected Option ownership mismatch is rejected", async () => {
  const detail = await fixtureDetail();
  detail.variants = detail.variants.map((variant) =>
    variant.isDefault
      ? { ...variant, selectedOptions: [{ optionId: "other-option", valueId: "other-value" }] }
      : variant,
  );
  const result = await resolve(legacyItem(), repositoryResult({ status: "found", value: detail }));
  assert.equal(result.status, "rejected");
});

test("16: catalog source failure is rejected without fixture fallback", async () => {
  const result = await resolve(legacyItem(), repositoryResult({ status: "source_failure", operation: "catalog.read" }));
  assert.deepEqual(result, { status: "rejected", reason: "catalog_source_failure" });
});

test("16b: thrown catalog source failure is rejected safely", async () => {
  const result = await resolveLegacyOrderItemCompatibility(legacyItem(), {
    findPublicProductBySlug: async () => { throw new Error("offline source failure"); },
  });
  assert.deepEqual(result, { status: "rejected", reason: "catalog_source_failure" });
});

test("17: invalid catalog configuration is rejected", async () => {
  const result = await resolve(legacyItem(), repositoryResult({
    status: "invalid_configuration",
    issues: [{ path: "$.variants", code: "duplicate", message: "invalid" }],
  }));
  assert.deepEqual(result, { status: "rejected", reason: "invalid_catalog_configuration" });
});

test("18: no default never falls back to first or cheapest eligible Variant", async () => {
  const detail = await fixtureDetail();
  detail.variants = detail.variants.map((variant, index) => ({
    ...variant,
    isDefault: false,
    isActive: true,
    isAvailable: true,
    priceCents: index === 0 ? 1 : variant.priceCents,
  }));
  const result = await resolve(legacyItem(), repositoryResult({ status: "found", value: detail }));
  assert.deepEqual(result, { status: "rejected", reason: "default_variant_missing" });
});

test("19: native Task 7.1 request bypasses legacy slug resolution", async () => {
  let repositoryCalls = 0;
  const native = parseCatalogOrderRequestItem({
    productId: "product-native",
    variantId: "variant-native",
    skuCode: "SKU-NATIVE",
    selectedOptions: [],
    quantity: 1,
  });
  assert.ok(native);
  const result = await resolveLegacyOrderItemCompatibility(native, {
    findPublicProductBySlug: async () => {
      repositoryCalls += 1;
      return { status: "source_failure", operation: "must-not-run" };
    },
  });
  assert.deepEqual(result, { status: "resolved", item: native });
  assert.equal(repositoryCalls, 0);
});

test("20: compatibility resolution is offline and invokes no network API", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("Network access is forbidden.");
  };
  try {
    assert.equal((await resolve()).status, "resolved");
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("legacy compatibility transport remains narrow and cannot carry native metadata", () => {
  assert.equal(parseDeprecatedLegacyProductOrderItem({
    ...legacyItem(),
    variantId: "browser-variant",
  }), null);
});
