import assert from "node:assert/strict";
import test from "node:test";

import {
  SUPPLIER_PRODUCTION_LIFECYCLE,
  evaluateSupplierProductionTransition,
} from "../app/domain/supplier-production-lifecycle.ts";
import { LocalSupplierProductionService } from "../app/application/local-supplier-production-service.ts";
import { LocalMemoryLocalSupplierProductionRepository } from "../app/infrastructure/suppliers/local-memory-local-supplier-production-repository.server.ts";

const OPERATOR = { actorKind: "operator", actorContextId: "operator-batch-d-context" };
const ORDER = { internalOrderId: "order-batch-d-1", publicReference: "FM-LOCAL-ZYXWVUTSRQPONMLK" };
const ORDER_ITEM_ID = "order-item-batch-d-1";
const UNIT = { canonicalOrder: ORDER, orderItemId: ORDER_ITEM_ID };

function actionId(number) {
  return `supplier-production-action-${number}`;
}

function assignmentFor(unit = UNIT, overrides = {}) {
  return {
    kind: "supplier_assignment",
    assignmentId: "supplier-assignment-batch-d-1",
    assignmentActionId: "supplier-assignment-action-batch-d-1",
    productionUnit: unit,
    snapshot: {
      supplierId: "supplier-test-only-batch-d",
      offerId: "offer-test-only-batch-d",
      variantId: "variant-test-only-batch-d",
      productSlug: "test-product",
      skuCode: "TEST-SKU",
      specificationKey: "6cm",
      supplierCostCents: null,
      currency: null,
      pricingBasis: "manual_quote_required",
      priceUnit: "manual_quote",
      optionSurchargeCents: null,
      packagedWeightGrams: null,
      minProductionBusinessDays: null,
      maxProductionBusinessDays: null,
      canShipToShanghaiWarehouse: true,
      assignedAt: "2026-09-04T10:00:00.000Z",
      provenance: [],
    },
    assignedByActorContextId: OPERATOR.actorContextId,
    ...overrides,
  };
}

function workOrderFor(unit = UNIT, assignment = assignmentFor(unit), overrides = {}) {
  return {
    kind: "supplier_work_order",
    workOrderId: "supplier-work-order-batch-d-1",
    workOrderActionId: "supplier-work-order-action-batch-d-1",
    canonicalOrder: unit.canonicalOrder,
    orderItemId: unit.orderItemId,
    supplier: { assignmentId: assignment.assignmentId },
    ...overrides,
  };
}

function makePorts({
  unit = UNIT,
  assignment = assignmentFor(unit),
  workOrder,
  fulfillmentStatus = "in_production",
  order = { internalId: unit.canonicalOrder.internalOrderId, publicReference: unit.canonicalOrder.publicReference, status: "paid", paymentStatus: "succeeded" },
  counters = { order: 0, assignment: 0, workOrder: 0, fulfillment: 0 },
} = {}) {
  if (workOrder === undefined) workOrder = assignment ? workOrderFor(unit, assignment) : null;
  const state = {
    internalOrderId: unit.canonicalOrder.internalOrderId,
    publicOrderReference: unit.canonicalOrder.publicReference,
    status: fulfillmentStatus,
    currentPreview: null,
  };
  return {
    counters,
    state,
    ports: {
      orders: {
        findSnapshotForFulfillmentById() {
          counters.order += 1;
          return { status: "found", snapshot: order };
        },
      },
      assignments: {
        findByProductionUnit(requested) {
          counters.assignment += 1;
          return requested.orderItemId === unit.orderItemId
            && requested.canonicalOrder.internalOrderId === unit.canonicalOrder.internalOrderId
            ? { status: "found", assignment }
            : { status: "unavailable" };
        },
      },
      workOrders: {
        findByProductionUnit(requested) {
          counters.workOrder += 1;
          return requested.orderItemId === unit.orderItemId
            && requested.canonicalOrder.internalOrderId === unit.canonicalOrder.internalOrderId
            ? { status: "found", workOrder }
            : { status: "unavailable" };
        },
      },
      fulfillments: {
        findByOrderIdentity() {
          counters.fulfillment += 1;
          return {
            status: "found",
            aggregate: { state: { ...state } },
          };
        },
      },
    },
  };
}

function makeEnvironment(options = {}) {
  const source = makePorts(options);
  let sequence = 0;
  const repository = options.repository ?? new LocalMemoryLocalSupplierProductionRepository({
    nextOperationId: () => "supplier-production-operation-batch-d-1",
    now: () => `2026-09-04T10:0${sequence++}:00.000Z`,
  });
  const service = new LocalSupplierProductionService({
    configuration: options.configuration ?? { source: "local_fake", runtimeMode: "test" },
    ports: options.ports ?? source.ports,
    repository,
  });
  return { ...source, repository, service };
}

function request(expectedCurrentStatus, nextStatus, number, overrides = {}) {
  return {
    supplierOperationActionId: actionId(number),
    productionUnit: UNIT,
    expectedCurrentStatus,
    nextStatus,
    operatorAuthority: OPERATOR,
    ...overrides,
  };
}

function advance(service, current, next, number, overrides = {}) {
  return service.advance(request(current, next, number, overrides));
}

function assertCommitted(result, status) {
  assert.equal(result.status, "committed", JSON.stringify(result));
  assert.equal(result.result.status, status);
}

function advanceTo(service, target, startNumber = 1) {
  const targetIndex = SUPPLIER_PRODUCTION_LIFECYCLE.indexOf(target);
  let current = "unassigned";
  let number = startNumber;
  for (let index = 1; index <= targetIndex; index += 1) {
    const next = SUPPLIER_PRODUCTION_LIFECYCLE[index];
    const result = advance(service, current, next, number);
    assertCommitted(result, next);
    current = next;
    number += 1;
  }
  return { current, nextActionNumber: number };
}

test("Task 4.1: every exact consecutive pre-warehouse state commits and generic warehouse bypass is rejected", () => {
  const environment = makeEnvironment();
  let current = "unassigned";
  let number = 1;
  const warehouseStartIndex = SUPPLIER_PRODUCTION_LIFECYCLE.indexOf("en_route_to_warehouse");
  for (let index = 1; index <= warehouseStartIndex; index += 1) {
    const next = SUPPLIER_PRODUCTION_LIFECYCLE[index];
    const result = advance(environment.service, current, next, number);
    assertCommitted(result, next);
    current = next;
    number += 1;
  }

  const stored = environment.repository.findByProductionUnit(UNIT);
  assert.equal(stored.status, "found");
  assert.deepEqual(stored.operation.history.map((entry) => [entry.fromStatus, entry.toStatus]),
    SUPPLIER_PRODUCTION_LIFECYCLE.slice(1, warehouseStartIndex + 1).map((status, index) => [SUPPLIER_PRODUCTION_LIFECYCLE[index], status]));
  assert.equal(stored.operation.currentStatus, "en_route_to_warehouse");
  const bypass = advance(environment.service, "en_route_to_warehouse", "warehouse_received", number);
  assert.equal(bypass.status, "rejected");
  assert.equal(bypass.issues[0].code, "warehouse_evidence_required");
  assert.equal(environment.repository.findByProductionUnit(UNIT).operation.history.length, warehouseStartIndex);
});

test("Task 4.2: assignment and WorkOrder are fresh admission gates and cross-Order references fail closed", () => {
  const missingAssignment = makeEnvironment({
    ports: makePorts({ assignment: null }).ports,
  });
  assert.equal(missingAssignment.service.advance(request("unassigned", "assigned", 1)).issues[0].code, "assignment_unavailable");
  assert.deepEqual(missingAssignment.repository.getCountsForTests(), { operationCount: 0, bindingCount: 0, historyCount: 0 });

  const missingWorkOrder = makeEnvironment({
    ports: makePorts({ workOrder: null }).ports,
  });
  assertCommitted(missingWorkOrder.service.advance(request("unassigned", "assigned", 1)), "assigned");
  const noWorkOrder = missingWorkOrder.service.advance(request("assigned", "work_order_ready", 2));
  assert.equal(noWorkOrder.status, "unavailable");
  assert.equal(noWorkOrder.issues[0].code, "work_order_unavailable");

  const otherUnit = {
    canonicalOrder: { internalOrderId: "order-batch-d-2", publicReference: "FM-LOCAL-ABCDEFGHIJKLMNOP" },
    orderItemId: "order-item-batch-d-2",
  };
  const crossWorkOrder = makeEnvironment({
    workOrder: workOrderFor(otherUnit),
  });
  assertCommitted(crossWorkOrder.service.advance(request("unassigned", "assigned", 1)), "assigned");
  const cross = crossWorkOrder.service.advance(request("assigned", "work_order_ready", 2));
  assert.equal(cross.status, "unavailable");
  assert.equal(cross.issues[0].code, "work_order_ownership_mismatch");

  const crossAssignment = makeEnvironment({
    assignment: assignmentFor({
      canonicalOrder: { internalOrderId: "order-batch-d-2", publicReference: "FM-LOCAL-ABCDEFGHIJKLMNOP" },
      orderItemId: "order-item-batch-d-2",
    }),
  });
  const crossAssignmentResult = crossAssignment.service.advance(request("unassigned", "assigned", 1));
  assert.equal(crossAssignmentResult.status, "unavailable");
  assert.equal(crossAssignmentResult.issues[0].code, "assignment_ownership_mismatch");
});

test("Task 4.2: supplier_confirmed to in_production requires fresh Customer Fulfillment in_production or quality_check", () => {
  for (const fulfillmentStatus of ["photo_review", "preview_pending", "preview_revision_requested", "preview_approved"]) {
    const environment = makeEnvironment({ fulfillmentStatus });
    advanceTo(environment.service, "supplier_confirmed");
    const result = advance(environment.service, "supplier_confirmed", "in_production", 6);
    assert.equal(result.status, "rejected", fulfillmentStatus);
    assert.equal(result.issues[0].code, "customer_production_not_started", fulfillmentStatus);
    const operation = environment.repository.findByProductionUnit(UNIT);
    assert.equal(operation.operation.currentStatus, "supplier_confirmed");
    assert.equal(operation.operation.history.length, 4);
    assert.equal(environment.state.status, fulfillmentStatus);
  }

  for (const fulfillmentStatus of ["in_production", "quality_check"]) {
    const environment = makeEnvironment({ fulfillmentStatus });
    advanceTo(environment.service, "supplier_confirmed");
    const result = advance(environment.service, "supplier_confirmed", "in_production", 6);
    assertCommitted(result, "in_production");
    assert.equal(environment.state.status, fulfillmentStatus);
  }
});

test("Task 4.1/4.2: skipped, backwards, and stale transitions do not mutate the aggregate", () => {
  assert.equal(evaluateSupplierProductionTransition("assigned", "in_production").issues[0].code, "invalid_transition");
  assert.equal(evaluateSupplierProductionTransition("ready_for_outbound", "assigned").issues[0].code, "terminal");

  const environment = makeEnvironment();
  assertCommitted(advance(environment.service, "unassigned", "assigned", 1), "assigned");
  const skipped = advance(environment.service, "assigned", "in_production", 2);
  assert.equal(skipped.status, "rejected");
  assert.equal(skipped.issues[0].code, "invalid_transition");
  const stale = advance(environment.service, "unassigned", "assigned", 3);
  assert.equal(stale.status, "rejected");
  assert.equal(stale.issues[0].code, "stale");
  assert.equal(environment.repository.findByProductionUnit(UNIT).operation.history.length, 1);

  const inProduction = makeEnvironment();
  advanceTo(inProduction.service, "in_production");
  const backwards = advance(inProduction.service, "in_production", "supplier_confirmed", 7);
  assert.equal(backwards.status, "rejected");
  assert.equal(backwards.issues[0].code, "invalid_transition");
  assert.equal(inProduction.repository.findByProductionUnit(UNIT).operation.currentStatus, "in_production");
});

test("Task 4.3: replay is exact, non-equivalent action reuse conflicts, and original history remains unchanged", () => {
  const environment = makeEnvironment();
  const firstRequest = request("unassigned", "assigned", 1);
  const first = environment.service.advance(firstRequest);
  assertCommitted(first, "assigned");
  const replay = environment.service.advance(firstRequest);
  assert.equal(replay.status, "replayed");
  assert.equal(replay.result.committedAt, first.result.committedAt);

  const conflict = environment.service.advance({ ...firstRequest, nextStatus: "work_order_ready" });
  assert.equal(conflict.status, "conflict");
  assert.deepEqual(environment.repository.getCountsForTests(), { operationCount: 1, bindingCount: 1, historyCount: 1 });
});

test("Task 4.3: same-unit concurrent actions serialize against latest canonical operation state", async () => {
  const environment = makeEnvironment();
  const results = await Promise.all([
    Promise.resolve().then(() => advance(environment.service, "unassigned", "assigned", 1)),
    Promise.resolve().then(() => advance(environment.service, "unassigned", "assigned", 2)),
  ]);
  assert.equal(results.filter((result) => result.status === "committed").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  assert.equal(results.find((result) => result.status === "rejected").issues[0].code, "stale");
  const stored = environment.repository.findByProductionUnit(UNIT);
  assert.equal(stored.operation.currentStatus, "assigned");
  assert.equal(stored.operation.history.length, 1);
  assert.deepEqual(environment.repository.getCountsForTests(), { operationCount: 1, bindingCount: 1, historyCount: 1 });
});

test("Task 4.3: separate production units remain isolated", async () => {
  const unitB = {
    canonicalOrder: { internalOrderId: "order-batch-d-2", publicReference: "FM-LOCAL-ABCDEFGHIJKLMNOP" },
    orderItemId: "order-item-batch-d-2",
  };
  const assignmentA = assignmentFor(UNIT);
  const assignmentB = assignmentFor(unitB, { assignmentId: "supplier-assignment-batch-d-2" });
  const workOrderA = workOrderFor(UNIT, assignmentA);
  const workOrderB = workOrderFor(unitB, assignmentB, { workOrderId: "supplier-work-order-batch-d-2" });
  const map = new Map([
    ["order-batch-d-1::order-item-batch-d-1", { unit: UNIT, assignment: assignmentA, workOrder: workOrderA }],
    ["order-batch-d-2::order-item-batch-d-2", { unit: unitB, assignment: assignmentB, workOrder: workOrderB }],
  ]);
  const ports = {
    orders: { findSnapshotForFulfillmentById(id) {
      const entry = [...map.values()].find((value) => value.unit.canonicalOrder.internalOrderId === id);
      return { status: "found", snapshot: { internalId: entry.unit.canonicalOrder.internalOrderId, publicReference: entry.unit.canonicalOrder.publicReference, status: "paid", paymentStatus: "succeeded" } };
    } },
    assignments: { findByProductionUnit(unit) { return { status: "found", assignment: map.get(`${unit.canonicalOrder.internalOrderId}::${unit.orderItemId}`).assignment }; } },
    workOrders: { findByProductionUnit(unit) { return { status: "found", workOrder: map.get(`${unit.canonicalOrder.internalOrderId}::${unit.orderItemId}`).workOrder }; } },
    fulfillments: { findByOrderIdentity(unit) { return { status: "found", aggregate: { state: { ...unit, status: "in_production", currentPreview: null } } }; } },
  };
  const repository = new LocalMemoryLocalSupplierProductionRepository({
    nextOperationId: (() => { let number = 0; return () => `supplier-production-operation-batch-d-${++number}`; })(),
    now: () => "2026-09-04T10:00:00.000Z",
  });
  const serviceA = new LocalSupplierProductionService({ configuration: { source: "local_fake", runtimeMode: "test" }, ports, repository });
  const serviceB = new LocalSupplierProductionService({ configuration: { source: "local_fake", runtimeMode: "test" }, ports, repository });
  const [resultA, resultB] = await Promise.all([
    Promise.resolve().then(() => serviceA.advance(request("unassigned", "assigned", 1))),
    Promise.resolve().then(() => serviceB.advance({ ...request("unassigned", "assigned", 2), productionUnit: unitB })),
  ]);
  assert.equal(resultA.status, "committed");
  assert.equal(resultB.status, "committed", JSON.stringify(resultB));
  assert.deepEqual(repository.getCountsForTests(), { operationCount: 2, bindingCount: 2, historyCount: 2 });
});

test("Task 4.3: atomic failure leaves state invisible and retry commits; restart loses local state", () => {
  let fail = true;
  const repository = new LocalMemoryLocalSupplierProductionRepository({
    nextOperationId: () => "supplier-production-operation-batch-d-1",
    failureInjector: { beforeCommit: () => { if (fail) throw new Error("TEST-ONLY commit failure"); } },
  });
  const environment = makeEnvironment({ repository });
  const failed = environment.service.advance(request("unassigned", "assigned", 1));
  assert.equal(failed.status, "unavailable");
  assert.deepEqual(repository.getCountsForTests(), { operationCount: 0, bindingCount: 0, historyCount: 0 });
  fail = false;
  assertCommitted(environment.service.advance(request("unassigned", "assigned", 1)), "assigned");
  const restarted = new LocalMemoryLocalSupplierProductionRepository();
  assert.equal(restarted.findByProductionUnit(UNIT).status, "unavailable");
  assert.equal(restarted.findByActionId(actionId(1)).status, "unavailable");
});

test("Task 4.2/4.4: runtime and customer authority fail closed before canonical reads, and upstream Fulfillment stays unchanged", () => {
  const disabled = makeEnvironment({
    configuration: { source: "disabled", runtimeMode: "test" },
  });
  const disabledResult = disabled.service.advance(request("unassigned", "assigned", 1));
  assert.equal(disabledResult.status, "unavailable");
  assert.equal(disabledResult.issues[0].code, "runtime_disabled");
  assert.equal(disabled.counters.order, 0);

  const unauthorized = makeEnvironment();
  const unauthorizedResult = unauthorized.service.advance(request("unassigned", "assigned", 1, {
    operatorAuthority: { actorKind: "customer", actorContextId: "customer-context" },
  }));
  assert.equal(unauthorizedResult.status, "invalid");
  assert.equal(unauthorized.counters.order, 0);

  const environment = makeEnvironment({ fulfillmentStatus: "in_production" });
  const beforeFulfillment = JSON.stringify(environment.state);
  advanceTo(environment.service, "en_route_to_warehouse");
  const bypass = advance(environment.service, "en_route_to_warehouse", "warehouse_received", 8);
  assert.equal(bypass.status, "rejected");
  assert.equal(bypass.issues[0].code, "warehouse_evidence_required");
  assert.equal(JSON.stringify(environment.state), beforeFulfillment);
  const serialized = JSON.stringify(environment.repository.findByProductionUnit(UNIT));
  for (const forbidden of ["Shipment", "Tracking", "WarehouseReceipt", "carrier", "provider"]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});
