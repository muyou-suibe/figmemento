import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  readLocalSupplierConfig,
  readTrustedLocalSupplierConfig,
} from "../app/config/local-supplier-runtime.ts";
import { ServerConfigurationError } from "../app/config/server.ts";
import {
  makeSupplierCatalogMappingKey,
  normalizeLocalSupplierSourceFixtures,
} from "../app/domain/supplier-operations.ts";
import { LOCAL_SUPPLIER_SOURCE_FIXTURES } from "../app/infrastructure/suppliers/local-supplier-source-fixtures.ts";
import { LocalMemoryLocalSupplierAssignmentRepository } from "../app/infrastructure/suppliers/local-memory-local-supplier-assignment-repository.server.ts";
import { LocalMemoryLocalSupplierProductionRepository } from "../app/infrastructure/suppliers/local-memory-local-supplier-production-repository.server.ts";
import { LocalMemoryLocalSupplierWorkOrderRepository } from "../app/infrastructure/suppliers/local-memory-local-supplier-work-order-repository.server.ts";
import { LocalSupplierOperatorService } from "../app/application/local-supplier-operator-service.ts";
import { createLocalSupplierOperatorHttpHandler } from "../app/server/local-supplier-operator-http.server.ts";
import {
  buildAdvanceProductionAction,
  buildAssignSupplierAction,
  buildCreateWorkOrderAction,
  buildInitializeSupplierProductionAction,
  buildResolveProductionUnitsAction,
  buildReadyForOutboundAction,
  buildRecordQcAction,
  buildRecordReceiptAction,
} from "../app/client/local-supplier-operator-actions.ts";

const AUTHORITY = { actorKind: "operator", actorContextId: "test-local-supplier-operator" };
const VERIFIER = { verify: () => AUTHORITY };
const ORDER = { internalOrderId: "local-supplier-order-1", publicReference: "FM-LOCAL-ABCDEFGHIJKLMNOP" };
const UNIT = { canonicalOrder: ORDER, orderItemId: "local-supplier-item-1" };
const UNIT_FIELDS = {
  internalOrderId: ORDER.internalOrderId,
  publicOrderReference: ORDER.publicReference,
  orderItemId: UNIT.orderItemId,
};
const CANONICAL_ITEM = {
  internalOrderId: ORDER.internalOrderId,
  publicOrderReference: ORDER.publicReference,
  orderItemId: UNIT.orderItemId,
  productId: "product-test-1",
  productName: "TEST Product",
  productSlug: "test-product",
  variantId: "catalog-variant-test",
  skuCode: "TEST-SKU",
  selectedOptions: [{ optionId: "size", valueId: "6cm" }],
  quantity: 1,
  fulfillmentType: "physical",
  configurationRevision: "configuration-test-1",
  customizationValues: [],
};

function runtime(dataset, repositories = {}) {
  return {
    configuration: { source: "local_fake", runtimeMode: "test" },
    dataset,
    orders: repositories.orders ?? { findSnapshotForFulfillmentById: () => ({ status: "unavailable" }) },
    configuredItems: repositories.configuredItems ?? { findConfiguredItem: () => ({ status: "found", item: CANONICAL_ITEM }) },
    fulfillments: repositories.fulfillments ?? { findByOrderIdentity: () => ({ status: "unavailable" }) },
    assignments: repositories.assignments ?? new LocalMemoryLocalSupplierAssignmentRepository(),
    workOrders: repositories.workOrders ?? new LocalMemoryLocalSupplierWorkOrderRepository(),
    production: repositories.production ?? new LocalMemoryLocalSupplierProductionRepository(),
  };
}

function operator(dataset, repositories) {
  return new LocalSupplierOperatorService({ runtime: runtime(dataset, repositories), verifier: VERIFIER });
}

function candidateDataset() {
  const mappingKey = makeSupplierCatalogMappingKey({ productId: "product-test-1", productSlug: "test-product", catalogVariantId: "catalog-variant-test", skuCode: "TEST-SKU", selectedOptions: CANONICAL_ITEM.selectedOptions, supplierOfferId: "offer-test", supplierOfferVariantId: "variant-test" });
  return {
    suppliers: [{ kind: "supplier", supplierId: "supplier-test", displayName: "TEST Supplier", platform: "1688", sourceUrl: "https://supplier.test/source", status: "active", canShipToShanghaiWarehouse: true, videoCapability: "unknown", returnReworkPolicy: null, notes: null, provenance: [] }],
    offers: [{ kind: "supplier_offer", offerId: "offer-test", supplierId: "supplier-test", sourceProductLabel: "TEST offer", fulfillmentType: "physical", status: "active", catalogMapping: { status: "approved", productId: "product-test-1", productSlug: "test-product", catalogVariantId: "catalog-variant-test", skuCode: "TEST-SKU", selectedOptions: CANONICAL_ITEM.selectedOptions, supplierOfferId: "offer-test", supplierOfferVariantId: "variant-test", mappingKey, reason: "TEST approved mapping" }, minProductionBusinessDays: 2, maxProductionBusinessDays: 4, canShipToShanghaiWarehouse: true, sourcePackagedWeightText: null, notes: null, provenance: [] }],
    variants: [{ kind: "supplier_offer_variant", supplierOfferVariantId: "variant-test", offerId: "offer-test", supplierSpecificationKey: "6cm", label: "6cm", status: "active", supplierCostCents: 1200, currency: "CNY", pricingBasis: "variant_fixed", priceUnit: "per_unit", optionSurchargeCents: null, packagedWeightGrams: 60, packagedWeightRawText: "about 60g", packagedWeightReviewStatus: "provisional", minProductionBusinessDays: 2, maxProductionBusinessDays: 4, dimensionsCm: null, rawSourceValue: "TEST source", reviewStatus: "approved", provenance: [] }],
  };
}

function candidateInput() {
  return { productionUnit: UNIT, shanghaiWarehouseRequired: true };
}

function orderSnapshot(lines = [{ ...CANONICAL_ITEM, customization: { configurationRevision: CANONICAL_ITEM.configurationRevision, values: CANONICAL_ITEM.customizationValues } }]) {
  return {
    internalId: ORDER.internalOrderId,
    publicReference: ORDER.publicReference,
    status: "paid",
    paymentStatus: "succeeded",
    commercial: {
      currency: "USD",
      subtotalCents: 8990,
      shipping: { status: "eligible", method: "development", amountCents: 0, currency: "USD", requiresShipping: true },
      coupon: { status: "not_applicable", discountCents: 0 },
      tax: { status: "not_activated", amountCents: null },
      localArithmeticTotalCents: 8990,
      developmentOnly: true,
    },
    lines,
  };
}

function request(method = "GET", body) {
  return new Request("http://localhost:3000/api/local-suppliers/operator", {
    method,
    headers: { origin: "http://localhost:3000", "sec-fetch-site": "same-origin", ...(body ? { "content-type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

function productionRepositories() {
  return {
    assignments: new LocalMemoryLocalSupplierAssignmentRepository({ nextAssignmentId: () => "supplier-assignment-init-test" }),
    workOrders: new LocalMemoryLocalSupplierWorkOrderRepository({ nextWorkOrderId: () => "supplier-work-order-init-test" }),
    production: new LocalMemoryLocalSupplierProductionRepository({ nextOperationId: () => "supplier-production-operation-init-test" }),
    orders: { findSnapshotForFulfillmentById: () => ({ status: "found", snapshot: orderSnapshot() }) },
    fulfillments: {
      findByOrderIdentity: () => ({
        status: "found",
        aggregate: { state: {
          internalOrderId: ORDER.internalOrderId,
          publicOrderReference: ORDER.publicReference,
          status: "preview_approved",
          currentPreview: { previewVersion: 1 },
        } },
      }),
    },
  };
}

async function prepareSupplierAssignment(repositories = productionRepositories()) {
  const service = operator(candidateDataset(), repositories);
  const inspected = service.inspectCandidates(candidateInput());
  assert.equal(inspected.status, "found");
  if (inspected.status !== "found") throw new Error("candidate inspection failed in test setup");
  const candidate = inspected.value.candidateResult.candidates[0];
  assert.ok(candidate);
  const assigned = await service.execute(buildAssignSupplierAction(
    UNIT_FIELDS,
    "supplier-assignment-init-test",
    { supplierId: candidate.supplierId, offerId: candidate.offerId, supplierOfferVariantId: candidate.supplierOfferVariantId },
    true,
  ));
  assert.equal(assigned.status, "committed", JSON.stringify(assigned));
  return { service, repositories };
}

async function prepareSupplierWorkOrder() {
  const prepared = await prepareSupplierAssignment();
  const workOrder = await prepared.service.execute(buildCreateWorkOrderAction(UNIT_FIELDS, "supplier-work-order-init-test"));
  assert.equal(workOrder.status, "committed", JSON.stringify(workOrder));
  return prepared;
}

test("supplier source configuration is explicit, bounded, and production fail-closed", () => {
  assert.deepEqual(readLocalSupplierConfig({ NODE_ENV: "development" }, "development"), { source: "disabled", runtimeMode: "development" });
  assert.deepEqual(readLocalSupplierConfig({ LOCAL_SUPPLIER_SOURCE: "local_fake" }, "test"), { source: "local_fake", runtimeMode: "test" });
  assert.throws(() => readLocalSupplierConfig({ LOCAL_SUPPLIER_SOURCE: "local_fake" }, "production"), (error) => error instanceof ServerConfigurationError && error.key === "LOCAL_SUPPLIER_SOURCE");
  assert.throws(() => readLocalSupplierConfig({ LOCAL_SUPPLIER_SOURCE: "unknown" }, "development"), (error) => error instanceof ServerConfigurationError && error.key === "LOCAL_SUPPLIER_SOURCE");
});

test("trusted supplier config takes NODE_ENV from the server process", () => {
  const prior = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    assert.throws(() => readTrustedLocalSupplierConfig({ LOCAL_SUPPLIER_SOURCE: "local_fake", NODE_ENV: "development" }), (error) => error instanceof ServerConfigurationError && error.key === "LOCAL_SUPPLIER_SOURCE");
  } finally {
    if (prior === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prior;
  }
});

test("real reviewed fixtures expose all source records and keep unresolved mappings review-required", () => {
  const normalized = normalizeLocalSupplierSourceFixtures(LOCAL_SUPPLIER_SOURCE_FIXTURES);
  assert.equal(normalized.ok, true);
  const service = operator(normalized.value);
  const result = service.read();
  assert.equal(result.status, "found");
  assert.equal(result.value.notice, "DEVELOPMENT / TEST ONLY");
  assert.equal(result.value.suppliers.length, 8);
  assert.equal(result.value.offers.length, 13);
  assert.equal(result.value.variants.length, 31);
  assert.equal(result.value.candidateEvidence.eligibleCandidateCount, 0);
  assert.equal(result.value.candidateEvidence.status, "review_required");
});

test("production-unit resolution authorizes before reading the public Order reference", async () => {
  let publicReferenceReads = 0;
  const orders = {
    findSnapshotForFulfillment() {
      publicReferenceReads += 1;
      return { status: "found", snapshot: orderSnapshot() };
    },
  };
  const action = buildResolveProductionUnitsAction(ORDER.publicReference);
  const unauthorized = new LocalSupplierOperatorService({ runtime: runtime(candidateDataset(), { orders }), verifier: undefined });
  assert.equal((await unauthorized.execute(action)).status, "unavailable");
  assert.equal(publicReferenceReads, 0);

  const authorized = operator(candidateDataset(), { orders });
  const resolved = await authorized.execute(action);
  assert.equal(resolved.status, "found", JSON.stringify(resolved));
  assert.equal(publicReferenceReads, 1);
});

test("production-unit resolution returns one exact server-owned physical line without browser IDs", async () => {
  const orders = { findSnapshotForFulfillment: () => ({ status: "found", snapshot: orderSnapshot() }) };
  const service = operator(candidateDataset(), { orders });
  const result = await service.execute(buildResolveProductionUnitsAction(ORDER.publicReference));
  assert.equal(result.status, "found", JSON.stringify(result));
  if (result.status !== "found") return;
  assert.equal(result.value.status, "resolved");
  assert.deepEqual(result.value.productionUnits, [{
    internalOrderId: ORDER.internalOrderId,
    publicOrderReference: ORDER.publicReference,
    orderItemId: UNIT.orderItemId,
    productName: CANONICAL_ITEM.productName,
    productSlug: CANONICAL_ITEM.productSlug,
    variantId: CANONICAL_ITEM.variantId,
    skuCode: CANONICAL_ITEM.skuCode,
    selectedOptions: CANONICAL_ITEM.selectedOptions,
    quantity: CANONICAL_ITEM.quantity,
    fulfillmentType: "physical",
  }]);
});

test("production-unit resolution returns all physical lines, excludes digital lines, and requires explicit multiple-item selection", async () => {
  const secondPhysical = { ...CANONICAL_ITEM, orderItemId: "local-supplier-item-2", productName: "SECOND TEST Product", skuCode: "TEST-SKU-2" };
  const digital = { ...CANONICAL_ITEM, orderItemId: "local-supplier-item-3", fulfillmentType: "digital" };
  const orders = { findSnapshotForFulfillment: () => ({ status: "found", snapshot: orderSnapshot([CANONICAL_ITEM, secondPhysical, digital]) }) };
  const service = operator(candidateDataset(), { orders });
  const result = await service.execute(buildResolveProductionUnitsAction(ORDER.publicReference));
  assert.equal(result.status, "found", JSON.stringify(result));
  if (result.status !== "found") return;
  assert.equal(result.value.productionUnits.length, 2);
  assert.deepEqual(result.value.productionUnits.map((unit) => unit.orderItemId), [UNIT.orderItemId, secondPhysical.orderItemId]);
  assert.equal(result.value.productionUnits.every((unit) => unit.fulfillmentType === "physical"), true);
});

test("production-unit resolution returns a bounded empty result for Orders without physical lines", async () => {
  const digital = { ...CANONICAL_ITEM, fulfillmentType: "digital" };
  const orders = { findSnapshotForFulfillment: () => ({ status: "found", snapshot: orderSnapshot([digital]) }) };
  const service = operator(candidateDataset(), { orders });
  const result = await service.execute(buildResolveProductionUnitsAction(ORDER.publicReference));
  assert.equal(result.status, "found", JSON.stringify(result));
  if (result.status !== "found") return;
  assert.equal(result.value.status, "no_physical_units");
  assert.deepEqual(result.value.productionUnits, []);
});

test("production-unit resolution rejects browser-supplied internal identity fields before any lookup", async () => {
  let publicReferenceReads = 0;
  const orders = { findSnapshotForFulfillment: () => { publicReferenceReads += 1; return { status: "found", snapshot: orderSnapshot() }; } };
  const service = operator(candidateDataset(), { orders });
  const result = await service.execute({
    action: "resolve_production_units",
    input: { publicOrderReference: ORDER.publicReference, internalOrderId: ORDER.internalOrderId, orderItemId: UNIT.orderItemId },
  });
  assert.equal(result.status, "invalid");
  assert.equal(publicReferenceReads, 0);
});

test("candidate inspection reuses the bounded matcher and assignment is explicit and replayable", () => {
  const dataset = candidateDataset();
  const assignments = new LocalMemoryLocalSupplierAssignmentRepository({ nextAssignmentId: () => "supplier-assignment-test" });
  const service = operator(dataset, { assignments });
  const inspected = service.inspectCandidates(candidateInput());
  assert.equal(inspected.status, "found");
  assert.equal(inspected.value.candidateResult.status, "eligible");
  assert.equal(inspected.value.candidateResult.candidates.length, 1);
  const selectedCandidate = { supplierId: "supplier-test", offerId: "offer-test", supplierOfferVariantId: "variant-test" };
  const input = { assignmentActionId: "supplier-assignment-action-1", productionUnit: UNIT, shanghaiWarehouseRequired: true, selectedCandidate };
  const committed = service.assign(input);
  assert.equal(committed.status, "committed");
  const replayed = service.assign(input);
  assert.equal(replayed.status, "replayed");
  assert.equal(assignments.getCountsForTests().assignmentCount, 1);
  const projection = service.read();
  assert.equal(projection.status, "found");
  assert.equal(projection.value.queues.assigned.length, 1);
});

test("operator action endpoint uses the Model C selection and WorkOrder authority server-side", async () => {
  const dataset = candidateDataset();
  const assignments = new LocalMemoryLocalSupplierAssignmentRepository({ nextAssignmentId: () => "supplier-assignment-model-c" });
  const workOrders = new LocalMemoryLocalSupplierWorkOrderRepository({ nextWorkOrderId: () => "supplier-work-order-model-c" });
  const service = operator(dataset, {
    assignments,
    workOrders,
      orders: {
        findSnapshotForFulfillmentById: () => ({
          status: "found",
          snapshot: {
            internalId: ORDER.internalOrderId,
            publicReference: ORDER.publicReference,
            status: "paid",
            paymentStatus: "succeeded",
            commercial: {
              currency: "USD",
              subtotalCents: 8990,
              shipping: { status: "eligible", method: "development", amountCents: 0, currency: "USD", requiresShipping: true },
              coupon: { status: "not_applicable", discountCents: 0 },
              tax: { status: "not_activated", amountCents: null },
              localArithmeticTotalCents: 8990,
              developmentOnly: true,
            },
            lines: [{
              ...CANONICAL_ITEM,
              customization: { configurationRevision: CANONICAL_ITEM.configurationRevision, values: CANONICAL_ITEM.customizationValues },
            }],
          },
        }),
      },
      fulfillments: {
        findByOrderIdentity: () => ({
          status: "found",
          aggregate: { state: {
            internalOrderId: ORDER.internalOrderId,
            publicOrderReference: ORDER.publicReference,
            status: "preview_approved",
            currentPreview: { previewVersion: 1 },
          } },
        }),
      },
  });
  const inspected = service.inspectCandidates(candidateInput());
  assert.equal(inspected.status, "found");
  if (inspected.status !== "found") return;
  const candidate = inspected.value.candidateResult.candidates[0];
  assert.ok(candidate);
  const assigned = service.assign({
    assignmentActionId: "assignment-action-model-c",
    productionUnit: UNIT,
    shanghaiWarehouseRequired: true,
    selectedCandidate: { supplierId: candidate.supplierId, offerId: candidate.offerId, supplierOfferVariantId: candidate.supplierOfferVariantId },
  });
  assert.equal(assigned.status, "committed");
  const create = await service.execute({
    action: "create_work_order",
    input: { workOrderActionId: "work-order-action-model-c", productionUnit: UNIT },
  });
  assert.equal(create.status, "committed");
  const replay = await service.execute({
    action: "create_work_order",
    input: { workOrderActionId: "work-order-action-model-c", productionUnit: UNIT },
  });
  assert.equal(replay.status, "replayed");
  assert.equal(workOrders.getCountsForTests().workOrderCount, 1);
  assert.equal(workOrders.getCountsForTests().bindingCount, 1);
});

test("WorkOrder-only state exposes explicit production initialization and preserves WorkOrder identity", async () => {
  const { service, repositories } = await prepareSupplierWorkOrder();
  const before = service.read();
  assert.equal(before.status, "found");
  if (before.status !== "found") return;
  assert.equal(before.value.queues.workOrders.length, 1);
  assert.equal(before.value.queues.production.length, 0);
  assert.deepEqual(before.value.queues.productionInitialization, [{
    productionUnit: {
      internalOrderId: ORDER.internalOrderId,
      publicOrderReference: ORDER.publicReference,
      orderItemId: UNIT.orderItemId,
    },
    supplierAssignmentId: "supplier-assignment-init-test",
    supplierWorkOrderId: "supplier-work-order-init-test",
    workOrderStatus: "work_order_ready",
    actionAvailable: true,
  }]);

  const initialized = await service.execute(buildInitializeSupplierProductionAction(UNIT_FIELDS, "supplier-production-init-test"));
  assert.equal(initialized.status, "committed", JSON.stringify(initialized));
  assert.deepEqual(repositories.production.getCountsForTests(), { operationCount: 1, bindingCount: 1, historyCount: 1 });
  const afterInitialization = service.read();
  assert.equal(afterInitialization.status, "found");
  if (afterInitialization.status !== "found") return;
  assert.equal(afterInitialization.value.queues.productionInitialization.length, 0);
  assert.equal(afterInitialization.value.queues.production.length, 1);
  const production = afterInitialization.value.queues.production[0];
  assert.ok(production);
  assert.equal(production.currentStatus, "assigned");
  assert.equal(production.workOrderId, "supplier-work-order-init-test");

  const next = await service.execute(buildAdvanceProductionAction(UNIT_FIELDS, "supplier-production-work-order-ready-test", "assigned", "work_order_ready"));
  assert.equal(next.status, "committed", JSON.stringify(next));
  assert.equal(repositories.production.getCountsForTests().operationCount, 1);
  assert.equal(repositories.production.getCountsForTests().historyCount, 2);
  const completed = repositories.production.findByProductionUnit(UNIT);
  assert.equal(completed.status, "found");
  if (completed.status !== "found") return;
  assert.equal(completed.operation.currentStatus, "work_order_ready");
  assert.equal(completed.operation.workOrderId, "supplier-work-order-init-test");
});

test("production initialization is replay-first and serializes distinct action selectors", async () => {
  const prepared = await prepareSupplierWorkOrder();
  const { service, repositories } = prepared;
  const exact = buildInitializeSupplierProductionAction(UNIT_FIELDS, "supplier-production-init-replay-test");
  const [committed, replayed] = await Promise.all([service.execute(exact), service.execute(exact)]);
  assert.equal(committed.status, "committed", JSON.stringify(committed));
  assert.equal(replayed.status, "replayed", JSON.stringify(replayed));
  assert.deepEqual(repositories.production.getCountsForTests(), { operationCount: 1, bindingCount: 1, historyCount: 1 });

  const concurrentPrepared = await prepareSupplierWorkOrder();
  const concurrentService = operator(candidateDataset(), concurrentPrepared.repositories);
  const concurrentA = buildInitializeSupplierProductionAction(UNIT_FIELDS, "supplier-production-init-concurrent-a");
  const concurrentB = buildInitializeSupplierProductionAction(UNIT_FIELDS, "supplier-production-init-concurrent-b");
  const [first, second] = await Promise.all([concurrentPrepared.service.execute(concurrentA), concurrentService.execute(concurrentB)]);
  assert.equal(first.status, "committed", JSON.stringify(first));
  assert.equal(second.status, "rejected", JSON.stringify(second));
  if (second.status === "rejected") assert.equal(second.issues[0].code, "stale");
  assert.deepEqual(concurrentPrepared.repositories.production.getCountsForTests(), { operationCount: 1, bindingCount: 1, historyCount: 1 });

  const conflictingPrepared = await prepareSupplierWorkOrder();
  const conflicting = buildInitializeSupplierProductionAction(UNIT_FIELDS, "supplier-production-init-conflict-test");
  const conflictingNext = buildAdvanceProductionAction(UNIT_FIELDS, "supplier-production-init-conflict-test", "unassigned", "work_order_ready");
  const [winner, conflict] = await Promise.all([conflictingPrepared.service.execute(conflicting), conflictingPrepared.service.execute(conflictingNext)]);
  assert.equal(winner.status, "committed", JSON.stringify(winner));
  assert.equal(conflict.status, "conflict", JSON.stringify(conflict));
  assert.deepEqual(conflictingPrepared.repositories.production.getCountsForTests(), { operationCount: 1, bindingCount: 1, historyCount: 1 });
});

test("production initialization fails closed without an exact assignment or WorkOrder", async () => {
  const noAssignmentRepositories = productionRepositories();
  const noAssignment = operator(candidateDataset(), noAssignmentRepositories);
  const noAssignmentResult = await noAssignment.execute(buildInitializeSupplierProductionAction(UNIT_FIELDS, "supplier-production-init-no-assignment"));
  assert.equal(noAssignmentResult.status, "unavailable", JSON.stringify(noAssignmentResult));
  if (noAssignmentResult.status === "unavailable") assert.equal(noAssignmentResult.issues[0].code, "assignment_unavailable");
  assert.equal(noAssignmentRepositories.production.getCountsForTests().operationCount, 0);

  const noWorkOrderRepositories = productionRepositories();
  const { service: noWorkOrder } = await prepareSupplierAssignment(noWorkOrderRepositories);
  const noWorkOrderResult = await noWorkOrder.execute(buildInitializeSupplierProductionAction(UNIT_FIELDS, "supplier-production-init-no-work-order"));
  assert.equal(noWorkOrderResult.status, "unavailable", JSON.stringify(noWorkOrderResult));
  if (noWorkOrderResult.status === "unavailable") assert.equal(noWorkOrderResult.issues[0].code, "work_order_unavailable");
  assert.equal(noWorkOrderRepositories.production.getCountsForTests().operationCount, 0);
});

test("F.1 operator actions require the production transition before warehouse receipt and reach terminal outbound readiness", async () => {
  const dataset = candidateDataset();
  const assignments = new LocalMemoryLocalSupplierAssignmentRepository({ nextAssignmentId: () => "supplier-assignment-f1-sequence" });
  const workOrders = new LocalMemoryLocalSupplierWorkOrderRepository({ nextWorkOrderId: () => "supplier-work-order-f1-sequence" });
  const production = new LocalMemoryLocalSupplierProductionRepository({
    nextOperationId: () => "supplier-production-operation-f1-sequence",
    nextWarehouseReceiptId: () => "warehouse-receipt-f1-sequence",
  });
  const orderSnapshot = {
    internalId: ORDER.internalOrderId,
    publicReference: ORDER.publicReference,
    status: "paid",
    paymentStatus: "succeeded",
    commercial: {
      currency: "USD",
      subtotalCents: 8990,
      shipping: { status: "eligible", method: "development", amountCents: 0, currency: "USD", requiresShipping: true },
      coupon: { status: "not_applicable", discountCents: 0 },
      tax: { status: "not_activated", amountCents: null },
      localArithmeticTotalCents: 8990,
      developmentOnly: true,
    },
    lines: [{ ...CANONICAL_ITEM, customization: { configurationRevision: CANONICAL_ITEM.configurationRevision, values: CANONICAL_ITEM.customizationValues } }],
  };
  const service = operator(dataset, {
    assignments,
    workOrders,
    production,
    orders: { findSnapshotForFulfillmentById: () => ({ status: "found", snapshot: orderSnapshot }) },
    fulfillments: {
      findByOrderIdentity: () => ({
        status: "found",
        aggregate: { state: {
          internalOrderId: ORDER.internalOrderId,
          publicOrderReference: ORDER.publicReference,
          status: "in_production",
          currentPreview: { previewVersion: 1 },
        } },
      }),
    },
  });
  const inspected = service.inspectCandidates(candidateInput());
  assert.equal(inspected.status, "found");
  if (inspected.status !== "found") return;
  const candidate = inspected.value.candidateResult.candidates[0];
  assert.ok(candidate);

  const assigned = await service.execute(buildAssignSupplierAction(
    UNIT_FIELDS,
    "supplier-assignment-action-f1-sequence",
    { supplierId: candidate.supplierId, offerId: candidate.offerId, supplierOfferVariantId: candidate.supplierOfferVariantId },
    true,
  ));
  assert.equal(assigned.status, "committed", JSON.stringify(assigned));
  const workOrder = await service.execute(buildCreateWorkOrderAction(UNIT_FIELDS, "supplier-work-order-action-f1-sequence"));
  assert.equal(workOrder.status, "committed", JSON.stringify(workOrder));

  const transitionSteps = [
    ["unassigned", "assigned"],
    ["assigned", "work_order_ready"],
    ["work_order_ready", "submitted_to_supplier"],
    ["submitted_to_supplier", "supplier_confirmed"],
    ["supplier_confirmed", "in_production"],
    ["in_production", "supplier_completed"],
  ];
  for (const [currentStatus, nextStatus] of transitionSteps) {
    const result = await service.execute(currentStatus === "unassigned"
      ? buildInitializeSupplierProductionAction(UNIT_FIELDS, `supplier-production-action-f1-${nextStatus}`)
      : buildAdvanceProductionAction(
        UNIT_FIELDS,
        `supplier-production-action-f1-${nextStatus}`,
        currentStatus,
        nextStatus,
      ));
    assert.equal(result.status, "committed", JSON.stringify(result));
  }

  const completedProjection = service.read();
  assert.equal(completedProjection.status, "found");
  if (completedProjection.status !== "found") return;
  const completed = completedProjection.value.queues.production[0];
  assert.ok(completed);
  assert.equal(completed.currentStatus, "supplier_completed");
  assert.equal(completed.nextStatus, "en_route_to_warehouse");
  const prematureReceipt = await service.execute(buildRecordReceiptAction({
    fields: UNIT_FIELDS,
    warehouseReceiptActionId: "warehouse-receipt-action-f1-premature",
    supplierAssignmentId: completed.assignmentId,
    supplierWorkOrderId: completed.workOrderId,
    supplierProductionOperationId: completed.operationId,
    expectedQuantity: completed.expectedQuantity,
    receivedQuantity: completed.expectedQuantity,
    damageReported: false,
    notes: null,
  }));
  assert.equal(prematureReceipt.status, "rejected", JSON.stringify(prematureReceipt));
  assert.equal(prematureReceipt.issues[0].code, "invalid_transition");

  const enRoute = await service.execute(buildAdvanceProductionAction(
    UNIT_FIELDS,
    "supplier-production-action-f1-en-route",
    "supplier_completed",
    "en_route_to_warehouse",
  ));
  assert.equal(enRoute.status, "committed", JSON.stringify(enRoute));
  const enRouteProjection = service.read();
  assert.equal(enRouteProjection.status, "found");
  if (enRouteProjection.status !== "found") return;
  const enRouteValue = enRouteProjection.value.queues.production[0];
  assert.ok(enRouteValue);
  assert.equal(enRouteValue.currentStatus, "en_route_to_warehouse");

  const receipt = await service.execute(buildRecordReceiptAction({
    fields: UNIT_FIELDS,
    warehouseReceiptActionId: "warehouse-receipt-action-f1-sequence",
    supplierAssignmentId: enRouteValue.assignmentId,
    supplierWorkOrderId: enRouteValue.workOrderId,
    supplierProductionOperationId: enRouteValue.operationId,
    expectedQuantity: enRouteValue.expectedQuantity,
    receivedQuantity: enRouteValue.expectedQuantity,
    damageReported: false,
    notes: null,
  }));
  assert.equal(receipt.status, "committed", JSON.stringify(receipt));
  const receivedProjection = service.read();
  assert.equal(receivedProjection.status, "found");
  if (receivedProjection.status !== "found") return;
  const warehouse = receivedProjection.value.queues.warehouse[0];
  assert.ok(warehouse);
  assert.equal(production.findByProductionUnit(UNIT).operation.currentStatus, "warehouse_received");
  assert.equal(warehouse.receiptStatus, "received");
  assert.equal(warehouse.qcStatus, "pending");

  const qc = await service.execute(buildRecordQcAction({
    fields: UNIT_FIELDS,
    warehouseQcActionId: "warehouse-qc-action-f1-sequence",
    warehouseReceiptId: warehouse.warehouseReceiptId,
    supplierAssignmentId: warehouse.supplierAssignmentId,
    supplierWorkOrderId: warehouse.supplierWorkOrderId,
    supplierProductionOperationId: warehouse.supplierProductionOperationId,
    qcDecision: "accepted",
    notes: null,
  }));
  assert.equal(qc.status, "committed", JSON.stringify(qc));
  const qcProjection = service.read();
  assert.equal(qcProjection.status, "found");
  if (qcProjection.status !== "found") return;
  const qcWarehouse = qcProjection.value.queues.warehouse[0];
  assert.ok(qcWarehouse);
  assert.equal(production.findByProductionUnit(UNIT).operation.currentStatus, "warehouse_qc");
  assert.equal(qcWarehouse.qcStatus, "accepted");

  const ready = await service.execute(buildReadyForOutboundAction({
    fields: UNIT_FIELDS,
    warehouseOutboundActionId: "warehouse-outbound-action-f1-sequence",
    warehouseReceiptId: qcWarehouse.warehouseReceiptId,
    supplierAssignmentId: qcWarehouse.supplierAssignmentId,
    supplierWorkOrderId: qcWarehouse.supplierWorkOrderId,
    supplierProductionOperationId: qcWarehouse.supplierProductionOperationId,
  }));
  assert.equal(ready.status, "committed", JSON.stringify(ready));
  const finalProjection = service.read();
  assert.equal(finalProjection.status, "found");
  if (finalProjection.status !== "found") return;
  assert.equal(finalProjection.value.queues.readyForOutbound.length, 1);
  assert.equal(production.findByProductionUnit(UNIT).operation.currentStatus, "ready_for_outbound");
  assert.equal(finalProjection.value.queues.warehouse[0].readyForOutbound, true);
  assert.match(JSON.stringify(finalProjection.value.queues.readyForOutbound), /ready_for_outbound/);
  assert.doesNotMatch(JSON.stringify(finalProjection.value.queues.readyForOutbound), /Shipment|Tracking/);
});

test("operator authority is required before supplier projections and browser authority is rejected", () => {
  const normalized = normalizeLocalSupplierSourceFixtures(LOCAL_SUPPLIER_SOURCE_FIXTURES);
  assert.equal(normalized.ok, true);
  const unauthorized = new LocalSupplierOperatorService({ runtime: runtime(normalized.value), verifier: undefined });
  assert.equal(unauthorized.read().status, "unavailable");
  const service = operator(normalized.value);
  const result = service.inspectCandidates({ ...candidateInput(), operatorAuthority: AUTHORITY });
  assert.equal(result.status, "invalid");
  const browserCanonicalOverride = service.inspectCandidates({ ...candidateInput(), selection: CANONICAL_ITEM });
  assert.equal(browserCanonicalOverride.status, "invalid");
  const projection = service.read();
  assert.equal(projection.status, "found");
  const serialized = JSON.stringify(projection);
  assert.equal(/customerCapability|storageKey|storageLocator|secret|token|cookie|sql/i.test(serialized), false);
});

test("operator HTTP is same-origin, bounded, and returns only safe errors", async () => {
  const normalized = normalizeLocalSupplierSourceFixtures(LOCAL_SUPPLIER_SOURCE_FIXTURES);
  assert.equal(normalized.ok, true);
  const service = operator(normalized.value);
  const handler = createLocalSupplierOperatorHttpHandler({ createService: () => service, environment: {} });
  assert.equal((await handler(request("GET"))).status, 200);
  assert.equal((await handler(new Request("http://localhost:3000/api/local-suppliers/operator", { method: "GET", headers: { origin: "https://evil.example" } }))).status, 403);
  assert.equal((await handler(request("POST", { action: "not-an-action" }))).status, 400);
  const body = { action: "read", operatorAuthority: { actorKind: "operator", actorContextId: "browser" } };
  const response = await handler(request("POST", body));
  assert.equal(response.status, 400);
  assert.equal(/stack|detail|hint|secret|token/i.test(await response.text()), false);
});

test("persistent commerce rejects Supplier before constructing the memory runtime", async () => {
  let serviceConstructions = 0;
  const handler = createLocalSupplierOperatorHttpHandler({
    environment: { LOCAL_ORDER_SOURCE: "local_persistent" },
    createService: () => {
      serviceConstructions += 1;
      return operator(normalizeLocalSupplierSourceFixtures(LOCAL_SUPPLIER_SOURCE_FIXTURES).value);
    },
  });

  const response = await handler(request("GET"));
  assert.equal(response.status, 503);
  assert.equal(serviceConstructions, 0);
  assert.deepEqual(await response.json(), {
    status: "unavailable",
    issues: [{
      code: "LOCAL_PERSISTENT_SUPPLIER_UNSUPPORTED",
      message: "Supplier Operations are not available for local persistent commerce.",
    }],
  });
});

test("browser input cannot select the Supplier backend", async () => {
  const normalized = normalizeLocalSupplierSourceFixtures(LOCAL_SUPPLIER_SOURCE_FIXTURES);
  assert.equal(normalized.ok, true);
  let serviceConstructions = 0;
  const handler = createLocalSupplierOperatorHttpHandler({
    environment: {},
    createService: () => {
      serviceConstructions += 1;
      return operator(normalized.value);
    },
  });

  const response = await handler(new Request(
    "http://localhost:3000/api/local-suppliers/operator?LOCAL_ORDER_SOURCE=local_persistent",
    {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
        "sec-fetch-site": "same-origin",
        "content-type": "application/json",
      },
      body: JSON.stringify({ LOCAL_ORDER_SOURCE: "local_persistent" }),
    },
  ));
  assert.equal(response.status, 400);
  assert.equal(serviceConstructions, 1);
});

test("operator surface remains keyboard-friendly, responsive, and free of browser persistence", async () => {
  const client = await readFile(new URL("../app/storefront/LocalSupplierOperatorTool.tsx", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/local-suppliers/operator/page.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/storefront/catalog-storefront.module.css", import.meta.url), "utf8");
  assert.match(client, /<button/);
  assert.match(client, /<table/);
  assert.match(client, /Public Order reference/);
  assert.match(client, /Resolve Order items/);
  assert.match(client, /Server-resolved production units/);
  assert.doesNotMatch(client, /supplier-internal-order-id|supplier-order-item-id/);
  assert.match(client, /DEVELOPMENT \/ TEST ONLY/);
  assert.doesNotMatch(client, /localStorage|sessionStorage|URLSearchParams/);
  assert.match(page, /readTrustedLocalSupplierConfig/);
  assert.match(css, /supplierTableWrap/);
  assert.match(css, /@media \(max-width: 720px\)/);
});
