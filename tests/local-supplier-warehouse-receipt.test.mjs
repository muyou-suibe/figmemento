import assert from "node:assert/strict";
import test from "node:test";

import { LocalSupplierProductionService } from "../app/application/local-supplier-production-service.ts";
import { LocalSupplierWarehouseService } from "../app/application/local-supplier-warehouse-service.ts";
import { LocalMemoryLocalSupplierProductionRepository } from "../app/infrastructure/suppliers/local-memory-local-supplier-production-repository.server.ts";
import { SUPPLIER_PRODUCTION_LIFECYCLE } from "../app/domain/supplier-production-lifecycle.ts";

const OPERATOR = { actorKind: "operator", actorContextId: "operator-batch-e-context" };
const ORDER = { internalOrderId: "order-batch-e-1", publicReference: "FM-LOCAL-ZYXWVUTSRQPONMLK" };
const UNIT = { canonicalOrder: ORDER, orderItemId: "order-item-batch-e-1" };

function assignmentFor(unit = UNIT, overrides = {}) {
  return {
    kind: "supplier_assignment",
    assignmentId: "supplier-assignment-batch-e-1",
    assignmentActionId: "supplier-assignment-action-batch-e-1",
    productionUnit: unit,
    snapshot: {
      supplierId: "supplier-test-only-batch-e",
      offerId: "offer-test-only-batch-e",
      variantId: "variant-test-only-batch-e",
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
    workOrderId: "supplier-work-order-batch-e-1",
    workOrderActionId: "supplier-work-order-action-batch-e-1",
    canonicalOrder: unit.canonicalOrder,
    orderItemId: unit.orderItemId,
    supplier: { assignmentId: assignment.assignmentId },
    ...overrides,
  };
}

function makePorts({
  unit = UNIT,
  assignment = assignmentFor(unit),
  workOrder = assignment ? workOrderFor(unit, assignment) : null,
  fulfillmentStatus = "in_production",
  order = { internalId: unit.canonicalOrder.internalOrderId, publicReference: unit.canonicalOrder.publicReference, status: "paid", paymentStatus: "succeeded" },
  counters = { order: 0, assignment: 0, workOrder: 0, fulfillment: 0 },
} = {}) {
  const state = {
    internalOrderId: unit.canonicalOrder.internalOrderId,
    publicOrderReference: unit.canonicalOrder.publicReference,
    status: fulfillmentStatus,
    currentPreview: null,
  };
  let currentWorkOrder = workOrder;
  return {
    state,
    counters,
    setWorkOrder(value) { currentWorkOrder = value; },
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
            && currentWorkOrder
            ? { status: "found", workOrder: currentWorkOrder }
            : { status: "unavailable" };
        },
      },
      fulfillments: {
        findByOrderIdentity() {
          counters.fulfillment += 1;
          return { status: "found", aggregate: { state: { ...state } } };
        },
      },
    },
  };
}

function makeEnvironment(options = {}) {
  const source = makePorts(options);
  let sequence = 0;
  const repository = options.repository ?? new LocalMemoryLocalSupplierProductionRepository({
    nextOperationId: () => "supplier-production-operation-batch-e-1",
    nextWarehouseReceiptId: () => "warehouse-receipt-batch-e-1",
    now: () => `2026-09-04T10:0${sequence++}:00.000Z`,
  });
  const configuration = options.configuration ?? { source: "local_fake", runtimeMode: "test" };
  const production = new LocalSupplierProductionService({ configuration, ports: options.ports ?? source.ports, repository });
  const warehouse = new LocalSupplierWarehouseService({ configuration, ports: options.ports ?? source.ports, repository });
  return { ...source, repository, production, warehouse };
}

function supplierAction(expectedCurrentStatus, nextStatus, number, overrides = {}) {
  return {
    supplierOperationActionId: `supplier-production-action-batch-e-${number}`,
    productionUnit: UNIT,
    expectedCurrentStatus,
    nextStatus,
    operatorAuthority: OPERATOR,
    ...overrides,
  };
}

function advance(environment, expectedCurrentStatus, nextStatus, number) {
  return environment.production.advance(supplierAction(expectedCurrentStatus, nextStatus, number));
}

function advanceTo(environment, target) {
  const targetIndex = SUPPLIER_PRODUCTION_LIFECYCLE.indexOf(target);
  let current = "unassigned";
  for (let index = 1; index <= targetIndex; index += 1) {
    const next = SUPPLIER_PRODUCTION_LIFECYCLE[index];
    const result = advance(environment, current, next, index);
    assert.equal(result.status, "committed", JSON.stringify(result));
    current = next;
  }
}

function operationRefs(environment) {
  const stored = environment.repository.findByProductionUnit(UNIT);
  assert.equal(stored.status, "found");
  return {
    supplierAssignmentId: stored.operation.assignmentId,
    supplierWorkOrderId: stored.operation.workOrderId,
    supplierProductionOperationId: stored.operation.operationId,
  };
}

function receiptAction(environment, overrides = {}) {
  return receiptInput({
    ...operationRefs(environment),
    ...overrides,
  });
}

function receiptInput(overrides = {}) {
  return {
    warehouseReceiptActionId: "warehouse-receipt-action-batch-e-1",
    productionUnit: UNIT,
    supplierAssignmentId: "supplier-assignment-batch-e-1",
    supplierWorkOrderId: "supplier-work-order-batch-e-1",
    supplierProductionOperationId: "supplier-production-operation-batch-e-1",
    expectedQuantity: 2,
    receivedQuantity: 2,
    damageReported: false,
    notes: null,
    operatorAuthority: OPERATOR,
    ...overrides,
  };
}

function qcAction(environment, receiptId, overrides = {}) {
  return {
    warehouseQcActionId: "warehouse-qc-action-batch-e-1",
    productionUnit: UNIT,
    warehouseReceiptId: receiptId,
    ...operationRefs(environment),
    qcDecision: "accepted",
    notes: null,
    operatorAuthority: OPERATOR,
    ...overrides,
  };
}

function outboundAction(environment, receiptId, overrides = {}) {
  return {
    warehouseOutboundActionId: "warehouse-outbound-action-batch-e-1",
    productionUnit: UNIT,
    warehouseReceiptId: receiptId,
    ...operationRefs(environment),
    operatorAuthority: OPERATOR,
    ...overrides,
  };
}

function assertNoWarehouseMutation(environment, expectedHistory) {
  assert.deepEqual(environment.repository.getWarehouseCountsForTests(), {
    receiptCount: 0,
    receiptBindingCount: 0,
    qcBindingCount: 0,
    outboundBindingCount: 0,
  });
  const operation = environment.repository.findByProductionUnit(UNIT);
  assert.equal(operation.status, "found");
  assert.equal(operation.operation.currentStatus, "en_route_to_warehouse");
  assert.equal(operation.operation.history.length, expectedHistory);
}

test("Task 5.1: valid receipt records exact identity, quantity facts, and warehouse_received atomically", () => {
  const environment = makeEnvironment();
  advanceTo(environment, "en_route_to_warehouse");
  const beforeFulfillment = JSON.stringify(environment.state);
  const result = environment.warehouse.recordReceipt(receiptAction(environment));

  assert.equal(result.status, "committed", JSON.stringify(result));
  assert.equal(result.receipt.receiptStatus, "received");
  assert.equal(result.receipt.receivedQuantity, 2);
  assert.equal(result.receipt.expectedQuantity, 2);
  assert.equal(result.receipt.discrepancy, null);
  assert.equal(result.receipt.damageReported, false);
  assert.equal(result.receipt.qc.status, "pending");
  assert.equal(result.receipt.readyForOutbound, false);
  assert.equal(result.operation.currentStatus, "warehouse_received");
  assert.equal(result.transition.status, "warehouse_received");
  assert.equal(JSON.stringify(environment.state), beforeFulfillment);
  assert.deepEqual(environment.repository.getWarehouseCountsForTests(), {
    receiptCount: 1,
    receiptBindingCount: 1,
    qcBindingCount: 0,
    outboundBindingCount: 0,
  });
});

test("Task 5.1: receipt admission is fresh and rejects earlier, missing, and cross-owned identities", () => {
  const earlier = makeEnvironment();
  advanceTo(earlier, "supplier_completed");
  const earlierResult = earlier.warehouse.recordReceipt(receiptAction(earlier));
  assert.equal(earlierResult.status, "rejected");
  assert.equal(earlierResult.issues[0].code, "invalid_transition");

  const missingAssignment = makeEnvironment({ assignment: null, workOrder: null });
  const missingAssignmentResult = missingAssignment.warehouse.recordReceipt({
    ...receiptInput(),
    supplierAssignmentId: "missing-assignment-batch-e",
    supplierWorkOrderId: "missing-work-order-batch-e",
    supplierProductionOperationId: "missing-operation-batch-e",
  });
  assert.equal(missingAssignmentResult.status, "unavailable");
  assert.equal(missingAssignmentResult.issues[0].code, "assignment_unavailable");

  const missingWorkOrder = makeEnvironment();
  advanceTo(missingWorkOrder, "en_route_to_warehouse");
  missingWorkOrder.setWorkOrder(null);
  const missingWorkOrderResult = missingWorkOrder.warehouse.recordReceipt(receiptAction(missingWorkOrder));
  assert.equal(missingWorkOrderResult.status, "unavailable");
  assert.equal(missingWorkOrderResult.issues[0].code, "work_order_unavailable");

  const missingOperation = makeEnvironment();
  const missingOperationResult = missingOperation.warehouse.recordReceipt({
    ...receiptInput(),
    supplierProductionOperationId: "missing-operation-batch-e",
  });
  assert.equal(missingOperationResult.status, "unavailable");
  assert.equal(missingOperationResult.issues[0].code, "warehouse_receipt_unavailable");

  const crossOrder = makeEnvironment();
  advanceTo(crossOrder, "en_route_to_warehouse");
  const crossOrderResult = crossOrder.warehouse.recordReceipt({
    ...receiptAction(crossOrder),
    productionUnit: {
      canonicalOrder: { internalOrderId: "order-batch-e-other", publicReference: "FM-LOCAL-ABCDEFGHIJKLMNOP" },
      orderItemId: "order-item-batch-e-other",
    },
  });
  assert.equal(crossOrderResult.status, "unavailable");
  assert.equal(crossOrderResult.issues[0].code, "invalid_identity");
});

test("Task 5.1: quantity is explicit, positive integer, and discrepancy is derived without mutation", () => {
  const short = makeEnvironment();
  advanceTo(short, "en_route_to_warehouse");
  const shortResult = short.warehouse.recordReceipt(receiptAction(short, { receivedQuantity: 1 }));
  assert.equal(shortResult.status, "committed");
  assert.deepEqual(shortResult.receipt.discrepancy, { kind: "quantity_discrepancy", direction: "short", expectedQuantity: 2, receivedQuantity: 1 });

  const over = makeEnvironment();
  advanceTo(over, "en_route_to_warehouse");
  const overResult = over.warehouse.recordReceipt(receiptAction(over, { receivedQuantity: 3 }));
  assert.equal(overResult.status, "committed");
  assert.equal(overResult.receipt.discrepancy.direction, "over");

  for (const invalid of [
    { expectedQuantity: 0 },
    { receivedQuantity: 0 },
    { expectedQuantity: -1 },
    { receivedQuantity: -1 },
    { expectedQuantity: 1.5 },
    { receivedQuantity: "2" },
  ]) {
    const environment = makeEnvironment();
    advanceTo(environment, "en_route_to_warehouse");
    const result = environment.warehouse.recordReceipt(receiptAction(environment, invalid));
    assert.equal(result.status, "invalid", JSON.stringify(invalid));
    assert.equal(result.issues[0].code, "invalid_quantity");
    assertNoWarehouseMutation(environment, 7);
  }
});

test("F.1: warehouse receipt expected quantity is checked against the canonical configured item when available", () => {
  const source = makePorts();
  const environment = makeEnvironment({
    ports: {
      ...source.ports,
      configuredItems: {
        findConfiguredItem: () => ({ status: "found", item: { fulfillmentType: "physical", quantity: 2 } }),
      },
    },
  });
  advanceTo(environment, "en_route_to_warehouse");
  const result = environment.warehouse.recordReceipt(receiptAction(environment, { expectedQuantity: 1 }));
  assert.equal(result.status, "rejected");
  assert.equal(result.issues[0].code, "invalid_quantity");
  assertNoWarehouseMutation(environment, 7);
});

test("Task 5.1/5.4: receipt replay and duplicate receipt are bounded, and failure leaves no partial state", () => {
  const environment = makeEnvironment();
  advanceTo(environment, "en_route_to_warehouse");
  const firstAction = receiptAction(environment);
  const first = environment.warehouse.recordReceipt(firstAction);
  assert.equal(first.status, "committed");
  const replay = environment.warehouse.recordReceipt(firstAction);
  assert.equal(replay.status, "replayed");
  assert.equal(replay.receipt.warehouseReceiptId, first.receipt.warehouseReceiptId);
  assert.equal(replay.operation.history.length, 8);
  const duplicate = environment.warehouse.recordReceipt({ ...firstAction, warehouseReceiptActionId: "warehouse-receipt-action-batch-e-2" });
  assert.equal(duplicate.status, "rejected");
  assert.deepEqual(environment.repository.getWarehouseCountsForTests(), { receiptCount: 1, receiptBindingCount: 1, qcBindingCount: 0, outboundBindingCount: 0 });

  let shouldFail = false;
  const failingRepository = new LocalMemoryLocalSupplierProductionRepository({
    nextOperationId: () => "supplier-production-operation-batch-e-failure",
    nextWarehouseReceiptId: () => "warehouse-receipt-batch-e-failure",
    failureInjector: { beforeCommit: () => { if (shouldFail) throw new Error("TEST-ONLY receipt failure"); } },
  });
  const failing = makeEnvironment({ repository: failingRepository });
  advanceTo(failing, "en_route_to_warehouse");
  shouldFail = true;
  const failed = failing.warehouse.recordReceipt(receiptAction(failing));
  assert.equal(failed.status, "unavailable");
  assertNoWarehouseMutation(failing, 7);
  shouldFail = false;
  assert.equal(failing.warehouse.recordReceipt(receiptAction(failing)).status, "committed");
});

test("Task 5.2: QC preserves discrepancy and damage, while accepted QC permits bounded outbound readiness", () => {
  const environment = makeEnvironment();
  advanceTo(environment, "en_route_to_warehouse");
  const receipt = environment.warehouse.recordReceipt(receiptAction(environment, { receivedQuantity: 1, damageReported: true, notes: "outer carton corner damaged" }));
  assert.equal(receipt.status, "committed");
  const receiptId = receipt.receipt.warehouseReceiptId;

  const pendingOutbound = environment.warehouse.markReadyForOutbound(outboundAction(environment, receiptId));
  assert.equal(pendingOutbound.status, "rejected");
  assert.equal(pendingOutbound.issues[0].code, "invalid_transition");

  const qcActionValue = qcAction(environment, receiptId, { notes: "accepted after bounded warehouse inspection" });
  const qc = environment.warehouse.recordQc(qcActionValue);
  assert.equal(qc.status, "committed");
  assert.equal(qc.receipt.qc.status, "accepted");
  assert.equal(qc.receipt.discrepancy.direction, "short");
  assert.equal(qc.receipt.damageReported, true);
  assert.equal(qc.operation.currentStatus, "warehouse_qc");

  const qcReplay = environment.warehouse.recordQc(qcActionValue);
  assert.equal(qcReplay.status, "replayed");
  const qcConflict = environment.warehouse.recordQc({ ...qcActionValue, qcDecision: "blocked" });
  assert.equal(qcConflict.status, "conflict");
  const duplicateQc = environment.warehouse.recordQc({ ...qcActionValue, warehouseQcActionId: "warehouse-qc-action-batch-e-2" });
  assert.equal(duplicateQc.status, "rejected");
  assert.equal(duplicateQc.issues[0].code, "invalid_transition");

  const outbound = environment.warehouse.markReadyForOutbound(outboundAction(environment, receiptId));
  assert.equal(outbound.status, "committed");
  assert.equal(outbound.projection.readyForOutbound, true);
  assert.equal(outbound.projection.qcAccepted, true);
  assert.equal(outbound.operation.currentStatus, "ready_for_outbound");
  assert.equal(outbound.receipt.damageReported, true);
  assert.equal(outbound.receipt.discrepancy.direction, "short");
});

test("Task 5.2: blocked QC and wrong or missing receipt identities fail closed", () => {
  const blocked = makeEnvironment();
  advanceTo(blocked, "en_route_to_warehouse");
  const receipt = blocked.warehouse.recordReceipt(receiptAction(blocked));
  assert.equal(receipt.status, "committed");
  const receiptId = receipt.receipt.warehouseReceiptId;
  const qc = blocked.warehouse.recordQc(qcAction(blocked, receiptId, { qcDecision: "blocked" }));
  assert.equal(qc.status, "committed");
  const outbound = blocked.warehouse.markReadyForOutbound(outboundAction(blocked, receiptId));
  assert.equal(outbound.status, "rejected");
  assert.equal(outbound.issues[0].code, "warehouse_qc_blocked");
  assert.equal(blocked.repository.findByProductionUnit(UNIT).operation.currentStatus, "warehouse_qc");

  const wrongReceipt = makeEnvironment();
  advanceTo(wrongReceipt, "en_route_to_warehouse");
  const validReceipt = wrongReceipt.warehouse.recordReceipt(receiptAction(wrongReceipt));
  const wrong = wrongReceipt.warehouse.recordQc(qcAction(wrongReceipt, validReceipt.receipt.warehouseReceiptId, { warehouseReceiptId: "warehouse-receipt-other" }));
  assert.equal(wrong.status, "unavailable");
  assert.equal(wrong.issues[0].code, "warehouse_receipt_ownership_mismatch");

  const missing = makeEnvironment();
  advanceTo(missing, "en_route_to_warehouse");
  const missingResult = missing.warehouse.recordQc({
    ...qcAction(missing, "warehouse-receipt-missing"),
  });
  assert.equal(missingResult.status, "rejected");
  assert.equal(missingResult.issues[0].code, "invalid_transition");
});

test("Task 5.2/5.3: QC and outbound commits are atomic, and generic lifecycle bypass is impossible", () => {
  let shouldFail = false;
  const repository = new LocalMemoryLocalSupplierProductionRepository({
    nextOperationId: () => "supplier-production-operation-batch-e-atomic",
    nextWarehouseReceiptId: () => "warehouse-receipt-batch-e-atomic",
    failureInjector: { beforeCommit: () => { if (shouldFail) throw new Error("TEST-ONLY warehouse failure"); } },
  });
  const environment = makeEnvironment({ repository });
  advanceTo(environment, "en_route_to_warehouse");
  const receipt = environment.warehouse.recordReceipt(receiptAction(environment));
  assert.equal(receipt.status, "committed");
  const receiptId = receipt.receipt.warehouseReceiptId;

  const genericQcBypass = advance(environment, "warehouse_received", "warehouse_qc", 8);
  assert.equal(genericQcBypass.status, "rejected");
  assert.equal(genericQcBypass.issues[0].code, "warehouse_evidence_required");

  shouldFail = true;
  const qcFailed = environment.warehouse.recordQc(qcAction(environment, receiptId));
  assert.equal(qcFailed.status, "unavailable");
  assert.deepEqual(environment.repository.getWarehouseCountsForTests(), { receiptCount: 1, receiptBindingCount: 1, qcBindingCount: 0, outboundBindingCount: 0 });
  assert.equal(environment.repository.findWarehouseReceiptByProductionUnit(UNIT).receipt.qc.status, "pending");
  assert.equal(environment.repository.findByProductionUnit(UNIT).operation.currentStatus, "warehouse_received");
  assert.equal(environment.repository.findByProductionUnit(UNIT).operation.history.length, 8);

  shouldFail = false;
  const qc = environment.warehouse.recordQc(qcAction(environment, receiptId));
  assert.equal(qc.status, "committed");
  const genericOutboundBypass = advance(environment, "warehouse_qc", "ready_for_outbound", 9);
  assert.equal(genericOutboundBypass.status, "rejected");
  assert.equal(genericOutboundBypass.issues[0].code, "warehouse_evidence_required");

  shouldFail = true;
  const outboundFailed = environment.warehouse.markReadyForOutbound(outboundAction(environment, receiptId));
  assert.equal(outboundFailed.status, "unavailable");
  assert.deepEqual(environment.repository.getWarehouseCountsForTests(), { receiptCount: 1, receiptBindingCount: 1, qcBindingCount: 1, outboundBindingCount: 0 });
  assert.equal(environment.repository.findWarehouseReceiptByProductionUnit(UNIT).receipt.readyForOutbound, false);
  assert.equal(environment.repository.findByProductionUnit(UNIT).operation.currentStatus, "warehouse_qc");
  assert.equal(environment.repository.findByProductionUnit(UNIT).operation.history.length, 9);

  shouldFail = false;
  assert.equal(environment.warehouse.markReadyForOutbound(outboundAction(environment, receiptId)).status, "committed");
});

test("Task 5.4: unauthorized or disabled runtime fails before reads and notes stay bounded internal text", () => {
  const disabled = makeEnvironment({ configuration: { source: "disabled", runtimeMode: "test" } });
  const disabledResult = disabled.warehouse.recordReceipt(receiptInput());
  assert.equal(disabledResult.status, "unavailable");
  assert.equal(disabledResult.issues[0].code, "runtime_disabled");
  assert.equal(disabled.counters.order, 0);

  const unauthorized = makeEnvironment();
  const unauthorizedResult = unauthorized.warehouse.recordReceipt({
    ...receiptInput(),
    operatorAuthority: { actorKind: "customer", actorContextId: "customer-context" },
  });
  assert.equal(unauthorizedResult.status, "invalid");
  assert.equal(unauthorized.counters.order, 0);

  const unsafeNotes = makeEnvironment();
  advanceTo(unsafeNotes, "en_route_to_warehouse");
  const unsafe = unsafeNotes.warehouse.recordReceipt(receiptAction(unsafeNotes, { notes: "<script>alert(1)</script>" }));
  assert.equal(unsafe.status, "invalid");
  assert.equal(unsafe.issues[0].code, "invalid_notes");
  assertNoWarehouseMutation(unsafeNotes, 7);
});

test("Task 5.3/5.4: ready_for_outbound is terminal, replayable, process-local, and has no downstream side effects", () => {
  const environment = makeEnvironment();
  const beforeFulfillment = JSON.stringify(environment.state);
  advanceTo(environment, "en_route_to_warehouse");
  const receipt = environment.warehouse.recordReceipt(receiptAction(environment));
  const receiptId = receipt.receipt.warehouseReceiptId;
  assert.equal(environment.warehouse.recordQc(qcAction(environment, receiptId)).status, "committed");
  const outboundActionValue = outboundAction(environment, receiptId);
  const outbound = environment.warehouse.markReadyForOutbound(outboundActionValue);
  assert.equal(outbound.status, "committed");
  const historyCount = outbound.operation.history.length;
  const replay = environment.warehouse.markReadyForOutbound(outboundActionValue);
  assert.equal(replay.status, "replayed");
  assert.equal(replay.operation.history.length, historyCount);

  const afterReceipt = environment.warehouse.recordReceipt({ ...receiptAction(environment), warehouseReceiptActionId: "warehouse-receipt-action-batch-e-terminal" });
  assert.equal(afterReceipt.status, "rejected");
  const afterQc = environment.warehouse.recordQc({ ...qcAction(environment, receiptId), warehouseQcActionId: "warehouse-qc-action-batch-e-terminal" });
  assert.equal(afterQc.status, "rejected");
  const afterOutbound = environment.warehouse.markReadyForOutbound({ ...outboundActionValue, warehouseOutboundActionId: "warehouse-outbound-action-batch-e-terminal" });
  assert.equal(afterOutbound.status, "rejected");
  assert.equal(afterOutbound.issues[0].code, "invalid_transition");
  assert.equal(environment.repository.findByProductionUnit(UNIT).operation.history.length, historyCount);
  assert.equal(JSON.stringify(environment.state), beforeFulfillment);

  const serialized = JSON.stringify({ receipt: outbound.receipt, projection: outbound.projection });
  for (const forbidden of ["carrier", "trackingNumber", "Shipment", "Tracking", "provider", "sourceUrl", "supplierCost"]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
  const restarted = new LocalMemoryLocalSupplierProductionRepository();
  assert.equal(restarted.findWarehouseReceiptByProductionUnit(UNIT).status, "unavailable");
  assert.equal(restarted.findByProductionUnit(UNIT).status, "unavailable");
});
