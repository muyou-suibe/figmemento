import assert from "node:assert/strict";
import test from "node:test";

import {
  readLocalSupplierConfig,
} from "../app/config/local-supplier-runtime.ts";
import {
  applyLocalSupplierDemoMappingOverlay,
  TEMPORARY_TATTOO_DEMO_MAPPING,
} from "../app/infrastructure/suppliers/local-supplier-demo-mapping-overlay.ts";
import { LOCAL_SUPPLIER_SOURCE_FIXTURES } from "../app/infrastructure/suppliers/local-supplier-source-fixtures.ts";
import {
  makeSupplierCatalogMappingKey,
  matchSupplierCandidates,
  normalizeLocalSupplierSourceFixtures,
} from "../app/domain/supplier-operations.ts";

function sourceDataset() {
  const normalized = normalizeLocalSupplierSourceFixtures(LOCAL_SUPPLIER_SOURCE_FIXTURES);
  assert.equal(normalized.ok, true);
  return normalized.value;
}

function approvedMappingCount(dataset) {
  return dataset.offers.filter((offer) => offer.catalogMapping.status === "approved").length;
}

function selection(overrides = {}) {
  return {
    internalOrderId: "local-demo-order-1",
    publicOrderReference: "FM-LOCAL-ABCDEFGHIJKLMNOP",
    orderItemId: "local-demo-item-1",
    productId: TEMPORARY_TATTOO_DEMO_MAPPING.productId,
    productSlug: TEMPORARY_TATTOO_DEMO_MAPPING.productSlug,
    catalogVariantId: TEMPORARY_TATTOO_DEMO_MAPPING.catalogVariantId,
    skuCode: TEMPORARY_TATTOO_DEMO_MAPPING.skuCode,
    selectedOptions: [],
    fulfillmentType: "physical",
    quantity: 1,
    ...overrides,
  };
}

function candidateInput(overrides = {}) {
  const { selection: selectionOverrides = {}, ...rest } = overrides;
  return {
    selection: selection(selectionOverrides),
    shanghaiWarehouseRequired: true,
    ...rest,
  };
}

test("original source normalization remains 8 suppliers, 13 offers, 31 variants, and 0 approved mappings", () => {
  const dataset = sourceDataset();
  assert.equal(dataset.suppliers.length, 8);
  assert.equal(dataset.offers.length, 13);
  assert.equal(dataset.variants.length, 31);
  assert.equal(approvedMappingCount(dataset), 0);
  assert.equal(dataset.offers.find((offer) => offer.offerId === "offer-tmall-temporary-tattoo").catalogMapping.status, "unmapped");
});

test("local development/test overlay exposes exactly one owner-approved demo mapping", () => {
  const effective = applyLocalSupplierDemoMappingOverlay(sourceDataset(), { source: "local_fake", runtimeMode: "test" });
  assert.equal(effective.suppliers.length, 8);
  assert.equal(effective.offers.length, 13);
  assert.equal(effective.variants.length, 31);
  assert.equal(approvedMappingCount(effective), 1);

  const supplier = effective.suppliers.find((entry) => entry.supplierId === TEMPORARY_TATTOO_DEMO_MAPPING.supplierId);
  const offer = effective.offers.find((entry) => entry.offerId === TEMPORARY_TATTOO_DEMO_MAPPING.offerId);
  const variant = effective.variants.find((entry) => entry.supplierOfferVariantId === TEMPORARY_TATTOO_DEMO_MAPPING.supplierOfferVariantId);
  assert.equal(supplier.status, "active");
  assert.equal(offer.status, "active");
  assert.equal(variant.status, "active");
  assert.equal(variant.reviewStatus, "approved");
  assert.equal(variant.supplierCostCents, 880);
  assert.equal(variant.currency, "CNY");
  assert.equal(variant.packagedWeightGrams, 5);
  assert.equal(variant.packagedWeightRawText, "约5g");
  assert.deepEqual([variant.minProductionBusinessDays, variant.maxProductionBusinessDays], [1, 3]);
  assert.equal(offer.catalogMapping.mappingKey, makeSupplierCatalogMappingKey({
    productId: TEMPORARY_TATTOO_DEMO_MAPPING.productId,
    productSlug: TEMPORARY_TATTOO_DEMO_MAPPING.productSlug,
    catalogVariantId: TEMPORARY_TATTOO_DEMO_MAPPING.catalogVariantId,
    skuCode: TEMPORARY_TATTOO_DEMO_MAPPING.skuCode,
    selectedOptions: [],
    supplierOfferId: TEMPORARY_TATTOO_DEMO_MAPPING.offerId,
    supplierOfferVariantId: TEMPORARY_TATTOO_DEMO_MAPPING.supplierOfferVariantId,
  }));

  const result = matchSupplierCandidates(candidateInput(), effective);
  assert.equal(result.status, "eligible");
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].supplierId, TEMPORARY_TATTOO_DEMO_MAPPING.supplierId);
  assert.equal(result.candidates[0].offerId, TEMPORARY_TATTOO_DEMO_MAPPING.offerId);
  assert.equal(result.candidates[0].supplierOfferVariantId, TEMPORARY_TATTOO_DEMO_MAPPING.supplierOfferVariantId);
});

test("overlay does not change the original source dataset", () => {
  const source = sourceDataset();
  const effective = applyLocalSupplierDemoMappingOverlay(source, { source: "local_fake", runtimeMode: "development" });
  assert.notEqual(effective, source);
  assert.equal(source.offers.find((offer) => offer.offerId === TEMPORARY_TATTOO_DEMO_MAPPING.offerId).catalogMapping.status, "unmapped");
  assert.equal(source.suppliers.find((supplier) => supplier.supplierId === TEMPORARY_TATTOO_DEMO_MAPPING.supplierId).status, "unknown");
  assert.equal(source.variants.find((variant) => variant.supplierOfferVariantId === TEMPORARY_TATTOO_DEMO_MAPPING.supplierOfferVariantId).status, "unknown");
});

test("production and disabled runtimes do not apply the demo overlay", () => {
  const source = sourceDataset();
  for (const configuration of [
    { source: "local_fake", runtimeMode: "production" },
    { source: "disabled", runtimeMode: "development" },
  ]) {
    const effective = applyLocalSupplierDemoMappingOverlay(source, configuration);
    assert.equal(effective, source);
    assert.equal(approvedMappingCount(effective), 0);
  }
  assert.throws(() => readLocalSupplierConfig({ LOCAL_SUPPLIER_SOURCE: "local_fake" }, "production"));
});

test("exact candidate matching rejects every altered canonical identity", () => {
  const effective = applyLocalSupplierDemoMappingOverlay(sourceDataset(), { source: "local_fake", runtimeMode: "test" });
  const mutations = [
    { productId: "fixture-product-phone-case" },
    { productSlug: "phone-case" },
    { catalogVariantId: "fixture-variant-phone-case" },
    { skuCode: "DEV-PHONE-CASE" },
    { selectedOptions: [{ optionId: "size", valueId: "large" }] },
    { fulfillmentType: "digital" },
  ];
  for (const mutation of mutations) {
    const result = matchSupplierCandidates(candidateInput({ selection: mutation }), effective);
    assert.notEqual(result.status, "eligible", JSON.stringify(mutation));
    assert.equal(result.candidates.length, 0, JSON.stringify(mutation));
  }

  const wrongVariant = { ...effective, offers: effective.offers.map((offer) => offer.offerId === TEMPORARY_TATTOO_DEMO_MAPPING.offerId
    ? { ...offer, catalogMapping: { ...offer.catalogMapping, supplierOfferVariantId: "variant-phone-case-transparent" } }
    : offer) };
  const result = matchSupplierCandidates(candidateInput(), wrongVariant);
  assert.notEqual(result.status, "eligible");
  assert.equal(result.candidates.length, 0);
});
