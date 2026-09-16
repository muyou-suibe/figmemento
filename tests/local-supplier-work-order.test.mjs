import assert from "node:assert/strict";
import test from "node:test";

import { LocalMemoryLocalSupplierAssignmentRepository } from "../app/infrastructure/suppliers/local-memory-local-supplier-assignment-repository.server.ts";
import { LocalMemoryLocalSupplierWorkOrderRepository } from "../app/infrastructure/suppliers/local-memory-local-supplier-work-order-repository.server.ts";
import { LocalSupplierWorkOrderService } from "../app/application/local-supplier-work-order-service.ts";
import {
  makeSupplierCatalogMappingKey,
  matchSupplierCandidates,
} from "../app/domain/supplier-operations.ts";

const ORDER = {
  internalOrderId: "local-order-work-order-1",
  publicReference: "FM-LOCAL-ABCDEFGHIJKLMNOP",
};
const ORDER_ITEM_ID = "order-item-work-order-1";
const OPERATOR = { actorKind: "operator", actorContextId: "operator-context" };

function line(overrides = {}) {
  return {
    orderItemId: ORDER_ITEM_ID,
    productId: "product-work-order-1",
    productName: "TEST-ONLY Canonical Product",
    productSlug: "test-product",
    variantId: "variant-work-order-1",
    skuCode: "TEST-SKU",
    selectedOptions: [{ optionId: "size", valueId: "6cm" }],
    quantity: 2,
    fulfillmentType: "physical",
    unitBasePriceCents: 8990,
    currency: "USD",
    lineSubtotalCents: 17980,
    customization: {
      configurationRevision: "configuration-work-order-1",
      values: [
        { fieldId: "field-text-1", fieldCode: "dedication", kind: "short_text", value: "TEST-ONLY customer text" },
        { fieldId: "field-image-1", fieldCode: "reference", kind: "image", images: [{ receiptId: "receipt-work-order-1" }] },
      ],
    },
    ...overrides,
  };
}

function orderSnapshot(overrides = {}) {
  return {
    kind: "local_order_snapshot",
    internalId: ORDER.internalOrderId,
    publicReference: ORDER.publicReference,
    createdAt: "2026-09-04T10:00:00.000Z",
    status: "paid",
    paymentStatus: "succeeded",
    contact: {
      email: "customer@example.test",
      firstName: "Test",
      lastName: "Customer",
      country: "CN",
      stateProvince: "Shanghai",
      city: "Shanghai",
      addressLine1: "TEST-ONLY address",
      postalCode: "200000",
      phone: "+8600000000000",
    },
    commercial: {
      currency: "USD",
      subtotalCents: 17980,
      shipping: { status: "eligible", method: "development", amountCents: 0, currency: "USD", requiresShipping: true },
      coupon: { status: "not_applicable", discountCents: 0 },
      tax: { status: "not_activated", amountCents: null },
      localArithmeticTotalCents: 17980,
      developmentOnly: true,
    },
    lines: [line()],
    ...overrides,
  };
}

function fulfillmentState(overrides = {}) {
  return {
    kind: "local_fulfillment_state",
    internalOrderId: ORDER.internalOrderId,
    publicOrderReference: ORDER.publicReference,
    status: "preview_approved",
    currentPreview: {
      kind: "local_fulfillment_preview",
      previewVersion: 2,
      displayLabel: "Development/test preview placeholder",
      publishedAt: "2026-09-04T10:05:00.000Z",
      developmentOnly: true,
    },
    revisionRequestsUsed: 0,
    createdAt: "2026-09-04T10:01:00.000Z",
    updatedAt: "2026-09-04T10:05:00.000Z",
    ...overrides,
  };
}

function fulfillmentResult(overrides = {}) {
  return {
    status: "found",
    aggregate: {
      kind: "local_fulfillment_aggregate",
      internalOrderId: ORDER.internalOrderId,
      publicOrderReference: ORDER.publicReference,
      state: fulfillmentState(overrides),
      previewHistory: [],
      revisionRecords: [],
      actionBindings: [],
    },
  };
}

function candidateResult(productionUnit = { canonicalOrder: ORDER, orderItemId: ORDER_ITEM_ID }) {
  const result = matchSupplierCandidates(
    {
      selection: {
        internalOrderId: productionUnit.canonicalOrder.internalOrderId,
        publicOrderReference: productionUnit.canonicalOrder.publicReference,
        orderItemId: productionUnit.orderItemId,
        productId: "product-work-order-1",
        productSlug: "test-product",
        catalogVariantId: "variant-work-order-1",
        skuCode: "TEST-SKU",
        selectedOptions: [{ optionId: "size", valueId: "6cm" }],
        fulfillmentType: "physical",
        quantity: 2,
      },
      shanghaiWarehouseRequired: true,
    },
    {
      suppliers: [{
        kind: "supplier",
        supplierId: "supplier-work-order-1",
        displayName: "TEST-ONLY Supplier",
        platform: "1688",
        sourceUrl: null,
        status: "active",
        canShipToShanghaiWarehouse: true,
        videoCapability: "unknown",
        returnReworkPolicy: null,
        notes: "TEST-ONLY DOMAIN FIXTURE",
        provenance: [],
      }],
      offers: [{
        kind: "supplier_offer",
        offerId: "offer-work-order-1",
        supplierId: "supplier-work-order-1",
        sourceProductLabel: "TEST-ONLY source label",
        fulfillmentType: "physical",
        status: "active",
        catalogMapping: {
          status: "approved",
          productId: "product-work-order-1",
          productSlug: "test-product",
          catalogVariantId: "variant-work-order-1",
          skuCode: "TEST-SKU",
          selectedOptions: [{ optionId: "size", valueId: "6cm" }],
          supplierOfferId: "offer-work-order-1",
          supplierOfferVariantId: "variant-supplier-work-order-1",
          mappingKey: makeSupplierCatalogMappingKey({ productId: "product-work-order-1", productSlug: "test-product", catalogVariantId: "variant-work-order-1", skuCode: "TEST-SKU", selectedOptions: [{ optionId: "size", valueId: "6cm" }], supplierOfferId: "offer-work-order-1", supplierOfferVariantId: "variant-supplier-work-order-1" }),
          reason: "TEST-ONLY DOMAIN FIXTURE",
        },
        minProductionBusinessDays: 3,
        maxProductionBusinessDays: 4,
        canShipToShanghaiWarehouse: true,
        sourcePackagedWeightText: "TEST-ONLY 60g",
        notes: "TEST-ONLY DOMAIN FIXTURE",
        provenance: [],
      }],
      variants: [{
        kind: "supplier_offer_variant",
        supplierOfferVariantId: "variant-supplier-work-order-1",
        offerId: "offer-work-order-1",
        supplierSpecificationKey: "6cm",
        label: "6cm",
        status: "active",
        supplierCostCents: 1300,
        currency: "CNY",
        pricingBasis: "variant_fixed",
        priceUnit: "per_unit",
        optionSurchargeCents: null,
        packagedWeightGrams: 60,
        packagedWeightRawText: "TEST-ONLY 60g",
        packagedWeightReviewStatus: "approved",
        minProductionBusinessDays: 3,
        maxProductionBusinessDays: 4,
        dimensionsCm: null,
        rawSourceValue: "TEST-ONLY DOMAIN FIXTURE",
        reviewStatus: "approved",
        provenance: [],
      }],
    },
  );
  assert.equal(result.status, "eligible", JSON.stringify(result));
  return result;
}

function assignment(overrides = {}) {
  const unit = { canonicalOrder: ORDER, orderItemId: ORDER_ITEM_ID };
  const result = candidateResult(unit);
  const candidate = result.candidates[0];
  const repository = new LocalMemoryLocalSupplierAssignmentRepository({
    nextAssignmentId: () => "supplier-assignment-work-order-1",
    now: () => "2026-09-04T10:06:00.000Z",
  });
  const committed = repository.commit({
    assignmentActionId: "supplier-assignment-action-1",
    productionUnit: unit,
    operatorAuthority: OPERATOR,
    candidateResult: result,
    selectedCandidate: { supplierId: candidate.supplierId, offerId: candidate.offerId, supplierOfferVariantId: candidate.supplierOfferVariantId },
  });
  assert.equal(committed.status, "committed");
  return { ...committed.assignment, ...overrides };
}

function ports(overrides = {}) {
  const snapshot = orderSnapshot();
  const item = {
    internalOrderId: ORDER.internalOrderId,
    publicOrderReference: ORDER.publicReference,
    orderItemId: ORDER_ITEM_ID,
    productId: snapshot.lines[0].productId,
    productName: snapshot.lines[0].productName,
    productSlug: snapshot.lines[0].productSlug,
    variantId: snapshot.lines[0].variantId,
    skuCode: snapshot.lines[0].skuCode,
    selectedOptions: snapshot.lines[0].selectedOptions,
    quantity: snapshot.lines[0].quantity,
    fulfillmentType: "physical",
    configurationRevision: snapshot.lines[0].customization.configurationRevision,
    customizationValues: snapshot.lines[0].customization.values,
  };
  const assigned = assignment();
  return {
    orders: {
      findSnapshotForFulfillmentById: () => ({ status: "found", snapshot }),
    },
    configuredItems: {
      findConfiguredItem: () => ({ status: "found", item }),
    },
    fulfillments: {
      findByOrderIdentity: () => fulfillmentResult(),
    },
    assignments: {
      findByProductionUnit: () => ({ status: "found", assignment: assigned }),
    },
    ...overrides,
  };
}

function serviceWith(options = {}) {
  const repository = options.repository ?? new LocalMemoryLocalSupplierWorkOrderRepository({
    nextWorkOrderId: () => "supplier-work-order-0001",
    now: () => "2026-09-04T10:07:00.000Z",
  });
  return {
    repository,
    service: new LocalSupplierWorkOrderService({ ports: options.ports ?? ports(), repository }),
  };
}

function createRequest(overrides = {}) {
  return {
    workOrderActionId: "supplier-work-order-action-1",
    productionUnit: { canonicalOrder: ORDER, orderItemId: ORDER_ITEM_ID },
    operatorAuthority: OPERATOR,
    ...overrides,
  };
}

test("valid paid/succeeded configured Order with assignment and approval creates a privacy-safe WorkOrder", () => {
  const { service } = serviceWith();
  const result = service.create(createRequest());
  assert.equal(result.status, "committed");
  if (result.status !== "committed") return;
  assert.equal(result.workOrder.canonicalOrder.publicReference, ORDER.publicReference);
  assert.equal(result.workOrder.orderItemId, ORDER_ITEM_ID);
  assert.equal(result.workOrder.product.quantity, 2);
  assert.equal(result.workOrder.product.skuCode, "TEST-SKU");
  assert.equal(result.workOrder.product.catalogVariantId, "variant-work-order-1");
  assert.equal(result.workOrder.customerConfiguration.configurationRevision, "configuration-work-order-1");
  assert.equal(result.workOrder.approvedPreview.previewVersion, 2);
  assert.equal(result.workOrder.supplier.supplierCostCents, 1300);
  assert.equal(result.workOrder.productionWindow.minProductionBusinessDays, 3);
  assert.equal(result.workOrder.shanghaiWarehouseRequired, true);
  assert.equal(result.workOrder.notice, "Development/test SupplierWorkOrder only.");
  assert.equal("customizationData" in result.workOrder, false);
  assert.equal("style" in result.workOrder.customerConfiguration.values[0], false);
  assert.equal("pose" in result.workOrder.customerConfiguration.values[0], false);
  assert.equal(result.workOrder.customerConfiguration.values[1].images[0].receiptId, "receipt-work-order-1");
  const serialized = JSON.stringify(result.workOrder);
  for (const forbidden of ["bucket", "storageKey", "objectPath", "signedUrl", "browserCapability", "authToken", "providerLocator"]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test("Order and Payment gates distinguish unpaid and non-succeeded states", () => {
  for (const [field, value, expected] of [
    ["status", "pending_payment", "unpaid"],
    ["status", "payment_failed", "unpaid"],
    ["paymentStatus", "failed", "payment_not_succeeded"],
  ]) {
    const snapshot = orderSnapshot({ [field]: value });
    const result = serviceWith({ ports: ports({ orders: { findSnapshotForFulfillmentById: () => ({ status: "found", snapshot }) } }) }).service.create(createRequest());
    assert.equal(result.status, "rejected");
    assert.equal(result.issues[0]?.code, expected);
  }
});

test("missing Order, configured item, assignment, or Fulfillment are bounded unavailable results", () => {
  const missingOrder = serviceWith({ ports: ports({ orders: { findSnapshotForFulfillmentById: () => ({ status: "unavailable" }) } }) }).service.create(createRequest());
  assert.equal(missingOrder.status, "unavailable");
  assert.equal(missingOrder.issues[0]?.code, "order_unavailable");

  const missingItem = serviceWith({ ports: ports({ configuredItems: { findConfiguredItem: () => ({ status: "unavailable" }) } }) }).service.create(createRequest());
  assert.equal(missingItem.status, "unavailable");
  assert.equal(missingItem.issues[0]?.code, "configured_item_unavailable");

  const missingAssignment = serviceWith({ ports: ports({ assignments: { findByProductionUnit: () => ({ status: "unavailable" }) } }) }).service.create(createRequest());
  assert.equal(missingAssignment.status, "unavailable");
  assert.equal(missingAssignment.issues[0]?.code, "assignment_unavailable");

  const missingFulfillment = serviceWith({ ports: ports({ fulfillments: { findByOrderIdentity: () => ({ status: "unavailable" }) } }) }).service.create(createRequest());
  assert.equal(missingFulfillment.status, "unavailable");
  assert.equal(missingFulfillment.issues[0]?.code, "fulfillment_unavailable");
});

test("Order item identity and configured physical scope are exact and fail closed", () => {
  const wrongItem = serviceWith({ ports: ports({ configuredItems: { findConfiguredItem: () => ({ status: "found", item: {
    internalOrderId: ORDER.internalOrderId,
    publicOrderReference: ORDER.publicReference,
    orderItemId: "other-order-item",
    productId: "product-work-order-1",
    productName: "TEST-ONLY Canonical Product",
    productSlug: "test-product",
    variantId: "variant-work-order-1",
    skuCode: "TEST-SKU",
    selectedOptions: [{ optionId: "size", valueId: "6cm" }],
    quantity: 2,
    fulfillmentType: "physical",
    configurationRevision: "configuration-work-order-1",
    customizationValues: orderSnapshot().lines[0].customization.values,
  } }) } }) }).service.create(createRequest());
  assert.equal(wrongItem.status, "unavailable");
  assert.equal(wrongItem.issues[0]?.code, "configured_item_unavailable");

  for (const item of [
    { ...ports().configuredItems.findConfiguredItem().item, fulfillmentType: "digital" },
    { ...ports().configuredItems.findConfiguredItem().item, configurationRevision: "" },
    { ...ports().configuredItems.findConfiguredItem().item, productId: "different-product" },
  ]) {
    const result = serviceWith({ ports: ports({ configuredItems: { findConfiguredItem: () => ({ status: "found", item }) } }) }).service.create(createRequest());
    assert.equal(result.status, "unavailable");
    assert.equal(result.issues[0]?.code, "configured_item_unavailable");
  }
});

test("preview_approved and later canonical Fulfillment states are accepted", () => {
  for (const status of ["preview_approved", "in_production", "quality_check"]) {
    const result = serviceWith({ ports: ports({ fulfillments: { findByOrderIdentity: () => fulfillmentResult({ status }) } }) }).service.create(createRequest());
    assert.equal(result.status, "committed", status);
  }
});

test("photo review and pending/revision states are rejected before WorkOrder commit", () => {
  for (const status of ["photo_review", "preview_pending", "preview_revision_requested"]) {
    const { service, repository } = serviceWith({ ports: ports({ fulfillments: { findByOrderIdentity: () => fulfillmentResult({ status }) } }) });
    const result = service.create(createRequest());
    assert.equal(result.status, "rejected", status);
    assert.equal(result.issues[0]?.code, "preview_not_approved", status);
    assert.deepEqual(repository.getCountsForTests(), { workOrderCount: 0, bindingCount: 0 });
  }
});

test("assignment ownership and Fulfillment identity cannot cross Orders", () => {
  const crossAssignment = assignment({ productionUnit: { canonicalOrder: { internalOrderId: "other-order", publicReference: "FM-LOCAL-ZYXWVUTSRQPONMLK" }, orderItemId: ORDER_ITEM_ID } });
  const assignmentResult = serviceWith({ ports: ports({ assignments: { findByProductionUnit: () => ({ status: "found", assignment: crossAssignment }) } }) }).service.create(createRequest());
  assert.equal(assignmentResult.status, "unavailable");
  assert.equal(assignmentResult.issues[0]?.code, "assignment_ownership_mismatch");

  const crossFulfillment = serviceWith({ ports: ports({ fulfillments: { findByOrderIdentity: () => fulfillmentResult({ internalOrderId: "other-order", publicOrderReference: "FM-LOCAL-ZYXWVUTSRQPONMLK" }) } }) }).service.create(createRequest());
  assert.equal(crossFulfillment.status, "unavailable");
  assert.equal(crossFulfillment.issues[0]?.code, "invalid_identity");
});

test("WorkOrder snapshots immutable Order/configuration and assignment facts", () => {
  const { service } = serviceWith();
  const result = service.create(createRequest());
  assert.equal(result.status, "committed");
  if (result.status !== "committed") return;
  const original = JSON.stringify(result.workOrder);
  const source = ports();
  const current = source.configuredItems.findConfiguredItem().item;
  current.productName = "MUTATED CURRENT CATALOG LABEL";
  current.customizationValues[0].value = "MUTATED CURRENT CUSTOMER TEXT";
  assert.equal(JSON.stringify(result.workOrder), original);
  assert.equal(result.workOrder.product.productName, "TEST-ONLY Canonical Product");
  assert.equal(result.workOrder.customerConfiguration.values[0].value, "TEST-ONLY customer text");
});

test("WorkOrder creation does not mutate the canonical Order, Fulfillment, or Assignment boundaries", () => {
  const source = ports();
  const beforeOrder = JSON.stringify(source.orders.findSnapshotForFulfillmentById(ORDER.internalOrderId));
  const beforeFulfillment = JSON.stringify(source.fulfillments.findByOrderIdentity(ORDER));
  const beforeAssignment = JSON.stringify(source.assignments.findByProductionUnit({ canonicalOrder: ORDER, orderItemId: ORDER_ITEM_ID }));
  const { service } = serviceWith({ ports: source });
  assert.equal(service.create(createRequest()).status, "committed");
  assert.equal(JSON.stringify(source.orders.findSnapshotForFulfillmentById(ORDER.internalOrderId)), beforeOrder);
  assert.equal(JSON.stringify(source.fulfillments.findByOrderIdentity(ORDER)), beforeFulfillment);
  assert.equal(JSON.stringify(source.assignments.findByProductionUnit({ canonicalOrder: ORDER, orderItemId: ORDER_ITEM_ID })), beforeAssignment);
});

test("unknown supplier economics remain null in the WorkOrder snapshot", () => {
  const source = ports();
  const original = source.assignments.findByProductionUnit({ canonicalOrder: ORDER, orderItemId: ORDER_ITEM_ID }).assignment;
  const assignmentWithUnknownEconomics = {
    ...original,
    snapshot: {
      ...original.snapshot,
      supplierCostCents: null,
      packagedWeightGrams: null,
      minProductionBusinessDays: null,
      maxProductionBusinessDays: null,
    },
  };
  const { service } = serviceWith({ ports: ports({ assignments: { findByProductionUnit: () => ({ status: "found", assignment: assignmentWithUnknownEconomics }) } }) });
  const result = service.create(createRequest());
  assert.equal(result.status, "committed");
  if (result.status !== "committed") return;
  assert.equal(result.workOrder.supplier.supplierCostCents, null);
  assert.equal(result.workOrder.supplier.packagedWeightGrams, null);
  assert.equal(result.workOrder.productionWindow.minProductionBusinessDays, null);
  assert.equal(result.workOrder.productionWindow.maxProductionBusinessDays, null);
});

test("customer capability, public reference alone, and missing operator authority cannot create WorkOrder", () => {
  for (const operatorAuthority of [
    { actorKind: "customer", actorContextId: "customer-context" },
    undefined,
  ]) {
    const { service, repository } = serviceWith();
    const result = service.create(createRequest({ operatorAuthority }));
    assert.equal(result.status, "invalid");
    assert.equal(result.issues[0]?.code, "invalid_format");
    assert.deepEqual(repository.getCountsForTests(), { workOrderCount: 0, bindingCount: 0 });
  }
});

test("replay is resolved before new Fulfillment admission and returns the same WorkOrder", () => {
  const { service, repository } = serviceWith();
  const first = service.create(createRequest());
  assert.equal(first.status, "committed");
  if (first.status !== "committed") return;
  const replay = service.create(createRequest());
  assert.equal(replay.status, "replayed");
  if (replay.status !== "replayed") return;
  assert.equal(replay.workOrder.workOrderId, first.workOrder.workOrderId);
  assert.deepEqual(repository.getCountsForTests(), { workOrderCount: 1, bindingCount: 1 });

  const failAfterCommit = serviceWith({ ports: ports({ fulfillments: { findByOrderIdentity: () => { throw new Error("TEST-ONLY should not run on replay"); } } }), repository }).service;
  const replayAfterFulfillmentUnavailable = failAfterCommit.create(createRequest());
  assert.equal(replayAfterFulfillmentUnavailable.status, "replayed");
});

test("same action reuse conflicts and a second action cannot replace one WorkOrder", () => {
  const { service, repository } = serviceWith();
  assert.equal(service.create(createRequest()).status, "committed");

  const differentItem = service.create(createRequest({ productionUnit: { canonicalOrder: ORDER, orderItemId: "other-order-item" } }));
  assert.equal(differentItem.status, "conflict");

  const differentAssignment = serviceWith({ ports: ports({ assignments: { findByProductionUnit: () => ({ status: "found", assignment: assignment({ assignmentId: "supplier-assignment-other" }) }) } }), repository }).service.create(createRequest());
  assert.equal(differentAssignment.status, "conflict");

  const secondAction = service.create(createRequest({ workOrderActionId: "supplier-work-order-action-2" }));
  assert.equal(secondAction.status, "conflict");
  assert.deepEqual(repository.getCountsForTests(), { workOrderCount: 1, bindingCount: 1 });
});

test("atomic WorkOrder commit failure leaves no record or binding and a retry can commit", () => {
  let fail = true;
  const repository = new LocalMemoryLocalSupplierWorkOrderRepository({
    nextWorkOrderId: () => "supplier-work-order-0001",
    failureInjector: { beforeCommit: () => { if (fail) throw new Error("TEST-ONLY commit failure"); } },
  });
  const { service } = serviceWith({ repository });
  const failed = service.create(createRequest());
  assert.equal(failed.status, "unavailable");
  assert.deepEqual(repository.getCountsForTests(), { workOrderCount: 0, bindingCount: 0 });
  fail = false;
  const retry = service.create(createRequest());
  assert.equal(retry.status, "committed");
  assert.deepEqual(repository.getCountsForTests(), { workOrderCount: 1, bindingCount: 1 });
});

test("WorkOrder repository restart is empty and does not resurrect state from client data", () => {
  const first = serviceWith();
  assert.equal(first.service.create(createRequest()).status, "committed");
  const restarted = serviceWith();
  assert.equal(restarted.repository.findByActionId("supplier-work-order-action-1").status, "unavailable");
  assert.equal(restarted.repository.findByProductionUnit({ canonicalOrder: ORDER, orderItemId: ORDER_ITEM_ID }).status, "unavailable");
});
