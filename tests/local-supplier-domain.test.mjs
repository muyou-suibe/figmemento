import assert from "node:assert/strict";
import test from "node:test";

import {
  LOCAL_SUPPLIER_SOURCE_FIXTURES,
  LOCAL_SUPPLIER_OFFER_FIXTURES,
} from "../app/infrastructure/suppliers/local-supplier-source-fixtures.ts";
import { LocalMemoryLocalSupplierAssignmentRepository } from "../app/infrastructure/suppliers/local-memory-local-supplier-assignment-repository.server.ts";
import {
  makeSupplierCatalogMappingKey,
  matchSupplierCandidates,
  normalizeLocalSupplierSourceFixtures,
  supplierCandidateIdentityKey,
} from "../app/domain/supplier-operations.ts";

const PRODUCT_SLUG = "test-product";
const PRODUCT_ID = "product-test-1";
const SKU_CODE = "TEST-SKU";
const CATALOG_VARIANT_ID = "catalog-variant-test-a";
const SELECTED_OPTIONS = [{ optionId: "size", valueId: "6cm" }];
const ORDER = { internalOrderId: "local-order-test-1", publicReference: "FM-LOCAL-ABCDEFGHIJKLMNOP" };

function productionUnit(overrides = {}) {
  return { canonicalOrder: { ...ORDER }, orderItemId: "order-item-test-1", ...overrides };
}

function selection(overrides = {}) {
  return {
    internalOrderId: ORDER.internalOrderId,
    publicOrderReference: ORDER.publicReference,
    orderItemId: "order-item-test-1",
    productId: PRODUCT_ID,
    productSlug: PRODUCT_SLUG,
    catalogVariantId: CATALOG_VARIANT_ID,
    skuCode: SKU_CODE,
    selectedOptions: SELECTED_OPTIONS,
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

function supplier(overrides = {}) {
  return {
    kind: "supplier",
    supplierId: "supplier-test-a",
    displayName: "TEST-ONLY DOMAIN FIXTURE Supplier A",
    platform: "1688",
    sourceUrl: null,
    status: "active",
    canShipToShanghaiWarehouse: true,
    videoCapability: "unknown",
    returnReworkPolicy: null,
    notes: "TEST-ONLY DOMAIN FIXTURE",
    provenance: [],
    ...overrides,
  };
}

function mapping(status = "approved", overrides = {}) {
  return status === "approved"
    ? {
        status,
        productId: PRODUCT_ID,
        productSlug: PRODUCT_SLUG,
        catalogVariantId: CATALOG_VARIANT_ID,
        skuCode: SKU_CODE,
        selectedOptions: SELECTED_OPTIONS,
        supplierOfferId: "offer-test-a",
        supplierOfferVariantId: "variant-test-a",
        mappingKey: makeSupplierCatalogMappingKey({ productId: PRODUCT_ID, productSlug: PRODUCT_SLUG, catalogVariantId: CATALOG_VARIANT_ID, skuCode: SKU_CODE, selectedOptions: SELECTED_OPTIONS, supplierOfferId: "offer-test-a", supplierOfferVariantId: "variant-test-a" }),
        reason: "TEST-ONLY DOMAIN FIXTURE",
        ...overrides,
      }
    : {
        status,
        productId: null,
        productSlug: null,
        catalogVariantId: null,
        skuCode: null,
        selectedOptions: null,
        supplierOfferId: null,
        supplierOfferVariantId: null,
        mappingKey: null,
        reason: "TEST-ONLY DOMAIN FIXTURE requires business review.",
        ...overrides,
      };
}

function offer(overrides = {}) {
  return {
    kind: "supplier_offer",
    offerId: "offer-test-a",
    supplierId: "supplier-test-a",
    sourceProductLabel: "unrelated label; never used for matching",
    fulfillmentType: "physical",
    status: "active",
    catalogMapping: mapping(),
    minProductionBusinessDays: 3,
    maxProductionBusinessDays: 4,
    canShipToShanghaiWarehouse: true,
    sourcePackagedWeightText: "TEST-ONLY DOMAIN FIXTURE",
    notes: "TEST-ONLY DOMAIN FIXTURE",
    provenance: [],
    ...overrides,
  };
}

function variant(overrides = {}) {
  return {
    kind: "supplier_offer_variant",
    supplierOfferVariantId: "variant-test-a",
    offerId: "offer-test-a",
    supplierSpecificationKey: "supplier-6cm",
    label: "6cm",
    status: "active",
    supplierCostCents: 1300,
    currency: "CNY",
    pricingBasis: "variant_fixed",
    priceUnit: "per_unit",
    optionSurchargeCents: null,
    packagedWeightGrams: 60,
    packagedWeightRawText: "TEST-ONLY DOMAIN FIXTURE 60g",
    packagedWeightReviewStatus: "approved",
    minProductionBusinessDays: 3,
    maxProductionBusinessDays: 4,
    dimensionsCm: null,
    rawSourceValue: "TEST-ONLY DOMAIN FIXTURE",
    reviewStatus: "approved",
    provenance: [],
    ...overrides,
  };
}

function dataset({ suppliers = [supplier()], offers = [offer()], variants = [variant()] } = {}) {
  return { suppliers, offers, variants };
}

function eligibleResult(overrides = {}, source = dataset()) {
  const result = matchSupplierCandidates(candidateInput(overrides), source);
  assert.equal(result.status, "eligible", JSON.stringify(result));
  return result;
}

function assignmentRequest(result, overrides = {}) {
  const candidate = result.candidates[0];
  assert.ok(candidate);
  return {
    assignmentActionId: "supplier-assignment-action-0001",
    productionUnit: productionUnit(),
    operatorAuthority: { actorKind: "operator", actorContextId: "operator-context" },
    candidateResult: result,
    selectedCandidate: { supplierId: candidate.supplierId, offerId: candidate.offerId, supplierOfferVariantId: candidate.supplierOfferVariantId },
    ...overrides,
  };
}

test("strictly normalizes the real Batch A source without approving mappings", () => {
  const normalized = normalizeLocalSupplierSourceFixtures(LOCAL_SUPPLIER_SOURCE_FIXTURES);
  assert.equal(normalized.ok, true);
  if (!normalized.ok) return;
  assert.equal(normalized.value.suppliers.length, 8);
  assert.equal(normalized.value.offers.length, 13);
  assert.equal(normalized.value.variants.length, 31);
  assert.equal(normalized.value.offers.filter((entry) => entry.catalogMapping.status === "approved").length, 0);
  assert.equal(normalized.value.offers.filter((entry) => entry.catalogMapping.status === "ambiguous").length, 4);
  assert.equal(normalized.value.offers.filter((entry) => entry.catalogMapping.status === "unmapped").length, 9);
});

test("real Batch A mappings remain review-required and produce no assignable candidate", () => {
  const normalized = normalizeLocalSupplierSourceFixtures(LOCAL_SUPPLIER_SOURCE_FIXTURES);
  assert.equal(normalized.ok, true);
  if (!normalized.ok) return;
  const result = matchSupplierCandidates(candidateInput({ selection: { productSlug: "pet-figure", skuCode: "DEV-PET-FIGURE" } }), normalized.value);
  assert.equal(result.status, "review_required");
  assert.deepEqual(result.candidates, []);
  for (const label of ["3D宠物", "摇头娃娃"]) {
    assert.ok(LOCAL_SUPPLIER_OFFER_FIXTURES.filter((entry) => entry.sourceProductLabel === label).every((entry) => entry.catalogMapping.status === "ambiguous"));
  }
});

test("approved exact Product/SKU/specification mapping is eligible", () => {
  const result = eligibleResult();
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].productId, PRODUCT_ID);
  assert.equal(result.candidates[0].productSlug, PRODUCT_SLUG);
  assert.equal(result.candidates[0].catalogVariantId, CATALOG_VARIANT_ID);
  assert.equal(result.candidates[0].skuCode, SKU_CODE);
  assert.equal(result.candidates[0].supplierOfferVariantId, "variant-test-a");
  assert.equal(result.candidates[0].supplierSpecificationKey, "supplier-6cm");
});

test("unmapped, ambiguous, provisional, and missing mappings never become candidates", () => {
  for (const status of ["unmapped", "ambiguous", "provisional", "unknown"]) {
    const result = matchSupplierCandidates(candidateInput(), dataset({ offers: [offer({ catalogMapping: mapping(status) })] }));
    assert.notEqual(result.status, "eligible", status);
    assert.deepEqual(result.candidates, []);
  }
  const missing = matchSupplierCandidates(candidateInput(), dataset({ offers: [offer({ catalogMapping: undefined })] }));
  assert.equal(missing.status, "invalid");
});

test("inactive and unknown Supplier, Offer, and Variant states fail closed", () => {
  for (const current of ["inactive", "unknown"]) {
    assert.notEqual(matchSupplierCandidates(candidateInput(), dataset({ suppliers: [supplier({ status: current })] })).status, "eligible", `supplier ${current}`);
    assert.notEqual(matchSupplierCandidates(candidateInput(), dataset({ offers: [offer({ status: current })] })).status, "eligible", `offer ${current}`);
    assert.notEqual(matchSupplierCandidates(candidateInput(), dataset({ variants: [variant({ status: current })] })).status, "eligible", `variant ${current}`);
  }
});

test("exact Product and SKU matching rejects wrong identities and never uses source label similarity", () => {
  assert.equal(matchSupplierCandidates(candidateInput({ selection: { productSlug: "different-product" } }), dataset()).status, "no_eligible_candidates");
  assert.equal(matchSupplierCandidates(candidateInput({ selection: { skuCode: "DIFFERENT-SKU" } }), dataset()).status, "no_eligible_candidates");
  assert.equal(matchSupplierCandidates(candidateInput({ selection: { productSlug: "unrelated-label", skuCode: "UNRELATED-SKU" } }), dataset({ offers: [offer({ sourceProductLabel: PRODUCT_SLUG })] })).status, "no_eligible_candidates");
});

test("exact specification matching rejects wrong size, method, or count", () => {
  for (const valueId of ["8cm", "spray", "500-pieces"]) {
    assert.equal(matchSupplierCandidates(candidateInput({ selection: { selectedOptions: [{ optionId: "size", valueId }] } }), dataset()).status, "no_eligible_candidates", valueId);
  }
});

test("canonical mapping requires exact catalog Variant and selected option identity", () => {
  assert.equal(matchSupplierCandidates(candidateInput({ selection: { catalogVariantId: "different-catalog-variant" } }), dataset()).status, "no_eligible_candidates");
  assert.equal(matchSupplierCandidates(candidateInput({ selection: { selectedOptions: [{ optionId: "finish", valueId: "matte" }] } }), dataset()).status, "no_eligible_candidates");
});

test("empty selectedOptions is a valid exact canonical selection", () => {
  const emptyOptions = [];
  const mapped = mapping("approved", {
    selectedOptions: emptyOptions,
    mappingKey: makeSupplierCatalogMappingKey({ productId: PRODUCT_ID, productSlug: PRODUCT_SLUG, catalogVariantId: CATALOG_VARIANT_ID, skuCode: SKU_CODE, selectedOptions: emptyOptions, supplierOfferId: "offer-test-a", supplierOfferVariantId: "variant-test-a" }),
  });
  const result = matchSupplierCandidates(candidateInput({ selection: { selectedOptions: emptyOptions } }), dataset({ offers: [offer({ catalogMapping: mapped })], variants: [variant({ supplierSpecificationKey: "supplier-empty-options" })] }));
  assert.equal(result.status, "eligible");
  if (result.status === "eligible") assert.equal(result.candidates[0].supplierSpecificationKey, "supplier-empty-options");
});

test("legacy selectedSpecificationKey cannot override the canonical selection", () => {
  const result = matchSupplierCandidates({ ...candidateInput(), selectedSpecificationKey: "6cm" }, dataset());
  assert.equal(result.status, "invalid");
  if (result.status === "invalid") assert.ok(result.issues.some((entry) => entry.code === "unknown_field"));
});

test("digital fulfillment has no physical supplier candidate", () => {
  const result = matchSupplierCandidates(candidateInput({ selection: { fulfillmentType: "digital" } }), dataset());
  assert.equal(result.status, "no_eligible_candidates");
  assert.equal(result.issues[0]?.code, "unsupported");
});

test("Shanghai warehouse is eligible only when Supplier and Offer explicitly support it", () => {
  assert.equal(matchSupplierCandidates(candidateInput(), dataset()).status, "eligible");
  for (const current of [false, null]) {
    assert.notEqual(matchSupplierCandidates(candidateInput(), dataset({ suppliers: [supplier({ canShipToShanghaiWarehouse: current })] })).status, "eligible");
    assert.notEqual(matchSupplierCandidates(candidateInput(), dataset({ offers: [offer({ canShipToShanghaiWarehouse: current })] })).status, "eligible");
  }
  assert.equal(matchSupplierCandidates(candidateInput({ shanghaiWarehouseRequired: false }), dataset({ suppliers: [supplier({ canShipToShanghaiWarehouse: null })], offers: [offer({ canShipToShanghaiWarehouse: null })] })).status, "eligible");
});

test("multiple eligible suppliers are all returned without cheapest-supplier selection", () => {
  const result = eligibleResult({}, dataset({
    suppliers: [supplier(), supplier({ supplierId: "supplier-test-b", displayName: "TEST-ONLY DOMAIN FIXTURE Supplier B" })],
    offers: [offer(), offer({
      offerId: "offer-test-b",
      supplierId: "supplier-test-b",
      catalogMapping: mapping("approved", {
        supplierOfferId: "offer-test-b",
        supplierOfferVariantId: "variant-test-b",
        mappingKey: makeSupplierCatalogMappingKey({ productId: PRODUCT_ID, productSlug: PRODUCT_SLUG, catalogVariantId: CATALOG_VARIANT_ID, skuCode: SKU_CODE, selectedOptions: SELECTED_OPTIONS, supplierOfferId: "offer-test-b", supplierOfferVariantId: "variant-test-b" }),
      }),
    })],
    variants: [variant(), variant({ supplierOfferVariantId: "variant-test-b", offerId: "offer-test-b", supplierCostCents: 1 })],
  }));
  assert.deepEqual(result.candidates.map((entry) => entry.supplierId), ["supplier-test-a", "supplier-test-b"]);
  assert.equal(result.candidates.some((entry) => entry.supplierCostCents === 1), true);
});

test("domain dataset rejects duplicate and cross-entity references", () => {
  assert.equal(matchSupplierCandidates(candidateInput(), dataset({ suppliers: [supplier(), supplier()] })).status, "invalid");
  assert.equal(matchSupplierCandidates(candidateInput(), dataset({ offers: [offer({ supplierId: "missing-supplier" })] })).status, "invalid");
  assert.equal(matchSupplierCandidates(candidateInput(), dataset({ variants: [variant({ offerId: "missing-offer" })] })).status, "invalid");
});

test("authorized operator commits one immutable assignment snapshot", () => {
  const result = eligibleResult();
  const source = dataset();
  const repository = new LocalMemoryLocalSupplierAssignmentRepository({ now: () => "2026-09-04T10:00:00.000Z", nextAssignmentId: () => "assignment-test-0001" });
  const committed = repository.commit(assignmentRequest(result));
  assert.equal(committed.status, "committed");
  if (committed.status !== "committed") return;
  assert.deepEqual(committed.assignment.snapshot, {
    productId: PRODUCT_ID, productSlug: PRODUCT_SLUG, catalogVariantId: CATALOG_VARIANT_ID, skuCode: SKU_CODE, selectedOptions: SELECTED_OPTIONS,
    supplierId: "supplier-test-a", offerId: "offer-test-a", supplierOfferVariantId: "variant-test-a", supplierSpecificationKey: "supplier-6cm",
    supplierCostCents: 1300, currency: "CNY", pricingBasis: "variant_fixed", priceUnit: "per_unit", optionSurchargeCents: null,
    packagedWeightGrams: 60, packagedWeightRawText: "TEST-ONLY DOMAIN FIXTURE 60g", packagedWeightReviewStatus: "approved", reviewStatus: "approved",
    minProductionBusinessDays: 3, maxProductionBusinessDays: 4, canShipToShanghaiWarehouse: true,
    assignedAt: "2026-09-04T10:00:00.000Z", provenance: [],
  });
  source.variants[0].supplierCostCents = 9900;
  source.variants[0].packagedWeightGrams = 900;
  source.variants[0].minProductionBusinessDays = 9;
  const stored = repository.findByProductionUnit(productionUnit());
  assert.equal(stored.status, "found");
  if (stored.status === "found") {
    assert.equal(stored.assignment.snapshot.supplierCostCents, 1300);
    assert.equal(stored.assignment.snapshot.packagedWeightGrams, 60);
    assert.equal(stored.assignment.snapshot.minProductionBusinessDays, 3);
  }
});

test("customer authority and public Order reference alone cannot assign", () => {
  const result = eligibleResult();
  const customer = new LocalMemoryLocalSupplierAssignmentRepository({ nextAssignmentId: () => "assignment-test-0001" });
  assert.equal(customer.commit(assignmentRequest(result, { operatorAuthority: { actorKind: "customer", actorContextId: "customer-context" } })).status, "rejected");
  const noAuthority = new LocalMemoryLocalSupplierAssignmentRepository({ nextAssignmentId: () => "assignment-test-0001" });
  assert.equal(noAuthority.commit(assignmentRequest(result, { operatorAuthority: undefined })).status, "rejected");
});

test("non-candidate selection is rejected and does not create assignment", () => {
  const result = eligibleResult();
  const repository = new LocalMemoryLocalSupplierAssignmentRepository({ nextAssignmentId: () => "assignment-test-0001" });
  const rejected = repository.commit(assignmentRequest(result, { selectedCandidate: { supplierId: "supplier-test-z", offerId: "offer-test-z", supplierOfferVariantId: "variant-test-z" } }));
  assert.equal(rejected.status, "rejected");
  assert.deepEqual(repository.getCountsForTests(), { assignmentCount: 0, bindingCount: 0 });
});

test("assignment commit failure leaves no partial assignment or action binding", () => {
  const result = eligibleResult();
  let fail = true;
  const repository = new LocalMemoryLocalSupplierAssignmentRepository({
    nextAssignmentId: () => "assignment-test-0001",
    failureInjector: { beforeCommit: () => { if (fail) throw new Error("TEST-ONLY commit failure"); } },
  });
  const request = assignmentRequest(result);
  assert.equal(repository.commit(request).status, "failed");
  assert.deepEqual(repository.getCountsForTests(), { assignmentCount: 0, bindingCount: 0 });
  fail = false;
  assert.equal(repository.commit(request).status, "committed");
  assert.deepEqual(repository.getCountsForTests(), { assignmentCount: 1, bindingCount: 1 });
});

test("same assignment action replays, while non-equivalent reuse conflicts", () => {
  const result = eligibleResult();
  const repository = new LocalMemoryLocalSupplierAssignmentRepository({ nextAssignmentId: () => "assignment-test-0001", now: () => "2026-09-04T10:00:00.000Z" });
  const request = assignmentRequest(result);
  const first = repository.commit(request);
  const replay = repository.commit(request);
  assert.equal(first.status, "committed");
  assert.equal(replay.status, "replayed");
  if (first.status === "committed" && replay.status === "replayed") assert.deepEqual(replay.assignment, first.assignment);
  const conflict = repository.commit({ ...request, selectedCandidate: { supplierId: "supplier-test-b", offerId: "offer-test-b", supplierOfferVariantId: "variant-test-b" } });
  assert.equal(conflict.status, "conflict");
  assert.deepEqual(repository.getCountsForTests(), { assignmentCount: 1, bindingCount: 1 });
});

test("a second different assignment for one production unit is rejected", () => {
  const result = eligibleResult({}, dataset({
    suppliers: [supplier(), supplier({ supplierId: "supplier-test-b", displayName: "TEST-ONLY DOMAIN FIXTURE Supplier B" })],
    offers: [offer(), offer({
      offerId: "offer-test-b",
      supplierId: "supplier-test-b",
      catalogMapping: mapping("approved", {
        supplierOfferId: "offer-test-b",
        supplierOfferVariantId: "variant-test-b",
        mappingKey: makeSupplierCatalogMappingKey({ productId: PRODUCT_ID, productSlug: PRODUCT_SLUG, catalogVariantId: CATALOG_VARIANT_ID, skuCode: SKU_CODE, selectedOptions: SELECTED_OPTIONS, supplierOfferId: "offer-test-b", supplierOfferVariantId: "variant-test-b" }),
      }),
    })],
    variants: [variant(), variant({ supplierOfferVariantId: "variant-test-b", offerId: "offer-test-b" })],
  }));
  let assignmentIndex = 0;
  const repository = new LocalMemoryLocalSupplierAssignmentRepository({ nextAssignmentId: () => `assignment-test-000${++assignmentIndex}` });
  assert.equal(repository.commit(assignmentRequest(result)).status, "committed");
  const second = result.candidates[1];
  assert.ok(second);
  const rejected = repository.commit(assignmentRequest(result, {
    assignmentActionId: "supplier-assignment-action-0002",
    selectedCandidate: { supplierId: second.supplierId, offerId: second.offerId, supplierOfferVariantId: second.supplierOfferVariantId },
  }));
  assert.equal(rejected.status, "conflict");
  assert.equal(repository.getCountsForTests().assignmentCount, 1);
});

test("cross-Order candidate cannot be assigned to another production unit", () => {
  const result = eligibleResult();
  const repository = new LocalMemoryLocalSupplierAssignmentRepository({ nextAssignmentId: () => "assignment-test-0001" });
  const rejected = repository.commit(assignmentRequest(result, {
    productionUnit: productionUnit({ canonicalOrder: { internalOrderId: "local-order-test-2", publicReference: "FM-LOCAL-QRSTUVWXYZ123456" } }),
  }));
  assert.equal(rejected.status, "unavailable");
  assert.deepEqual(repository.getCountsForTests(), { assignmentCount: 0, bindingCount: 0 });
});

test("unknown supplier economics remain null in the assignment snapshot", () => {
  const result = eligibleResult({}, dataset({
    offers: [offer({ minProductionBusinessDays: null, maxProductionBusinessDays: null })],
    variants: [variant({ supplierCostCents: null, currency: null, packagedWeightGrams: null, minProductionBusinessDays: null, maxProductionBusinessDays: null, packagedWeightReviewStatus: "unknown" })],
  }));
  const repository = new LocalMemoryLocalSupplierAssignmentRepository({ nextAssignmentId: () => "assignment-test-0001" });
  const committed = repository.commit(assignmentRequest(result));
  assert.equal(committed.status, "committed");
  if (committed.status === "committed") {
    assert.equal(committed.assignment.snapshot.supplierCostCents, null);
    assert.equal(committed.assignment.snapshot.currency, null);
    assert.equal(committed.assignment.snapshot.packagedWeightGrams, null);
    assert.equal(committed.assignment.snapshot.minProductionBusinessDays, null);
    assert.equal(committed.assignment.snapshot.maxProductionBusinessDays, null);
  }
});

test("candidate identity key remains an explicit three-identity key", () => {
  const result = eligibleResult();
  assert.equal(supplierCandidateIdentityKey(result.candidates[0]), "supplier-test-a::offer-test-a::variant-test-a");
});
