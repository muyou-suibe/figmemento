import { isLocalSupplierProductionRuntimeEnabled } from "./local-supplier-production-service.ts";
import type {
  LocalSupplierProductionCanonicalReadPorts,
  LocalSupplierProductionRuntimeConfiguration,
} from "./local-supplier-production-service.ts";
import type { LocalOrderSnapshot } from "../domain/local-order.ts";
import type { LocalConfiguredItemReadPort } from "./local-configured-item-read-port.ts";
import {
  sameSupplierProductionUnit,
  type SupplierAssignment,
  type SupplierProductionUnitIdentity,
} from "../domain/supplier-operations.ts";
import type { SupplierWorkOrder } from "../domain/supplier-work-order.ts";
import {
  type SupplierProductionIssue,
  type SupplierProductionOperation,
} from "../domain/supplier-production-lifecycle.ts";
import {
  sameWarehouseOutboundAction,
  sameWarehouseQcAction,
  sameWarehouseReceiptAction,
  type WarehouseActionBinding,
  type WarehouseOutboundActionInput,
  type WarehouseOutboundMutationResult,
  type WarehouseQcActionInput,
  type WarehouseReceiptActionInput,
  type WarehouseReceiptMutationResult,
  type WarehouseReceipt,
  validateWarehouseOutboundAction,
  validateWarehouseQcAction,
  validateWarehouseReceiptAction,
} from "../domain/supplier-warehouse-receipt.ts";
import type {
  LocalSupplierProductionRepository,
} from "./local-supplier-production-repository.ts";

export type LocalSupplierWarehouseServiceFailure = {
  readonly status: "invalid" | "unavailable" | "conflict" | "rejected";
  readonly issues: readonly SupplierProductionIssue[];
};

export type LocalSupplierWarehouseReceiptServiceResult =
  | LocalSupplierWarehouseServiceFailure
  | {
      readonly status: "committed" | "replayed";
      readonly receipt: WarehouseReceipt;
      readonly operation: SupplierProductionOperation;
      readonly transition: import("../domain/supplier-production-lifecycle.ts").SupplierProductionTransitionResult;
    };

export type LocalSupplierWarehouseOutboundServiceResult =
  | LocalSupplierWarehouseServiceFailure
  | {
      readonly status: "committed" | "replayed";
      readonly receipt: import("../domain/supplier-warehouse-receipt.ts").WarehouseReceipt;
      readonly operation: SupplierProductionOperation;
      readonly transition: import("../domain/supplier-production-lifecycle.ts").SupplierProductionTransitionResult;
      readonly projection: import("../domain/supplier-warehouse-receipt.ts").WarehouseOutboundProjection;
    };

type WarehouseIdentityAction = {
  readonly productionUnit: SupplierProductionUnitIdentity;
  readonly supplierAssignmentId: string;
  readonly supplierWorkOrderId: string;
  readonly supplierProductionOperationId: string;
};

type Admission = {
  readonly order: LocalOrderSnapshot;
  readonly assignment: SupplierAssignment;
  readonly workOrder: SupplierWorkOrder;
  readonly operation: SupplierProductionOperation;
};

function failure(
  status: "invalid" | "unavailable" | "conflict" | "rejected",
  code: SupplierProductionIssue["code"],
  message: string,
): LocalSupplierWarehouseServiceFailure {
  return { status, issues: [{ path: "$", code, message }] };
}

function mapCommitFailure(
  result: WarehouseReceiptMutationResult | WarehouseOutboundMutationResult,
): LocalSupplierWarehouseServiceFailure {
  if (result.status === "committed" || result.status === "replayed") {
    return failure("unavailable", "unavailable", "Shanghai Warehouse Receipt is unavailable.");
  }
  if (result.status === "conflict") return failure("conflict", "conflict", "Warehouse action conflicts with existing state.");
  if (result.status === "unavailable" || result.status === "failed") return failure("unavailable", "unavailable", "Shanghai Warehouse Receipt is unavailable.");
  if (!("issues" in result)) return failure("unavailable", "unavailable", "Shanghai Warehouse Receipt is unavailable.");
  const code = result.issues[0]?.code ?? "unavailable";
  const messages: Partial<Record<SupplierProductionIssue["code"], string>> = {
    invalid_transition: "The Warehouse Receipt lifecycle transition is not allowed.",
    warehouse_evidence_required: "Warehouse Receipt or QC evidence is required for this transition.",
    warehouse_receipt_unavailable: "The Warehouse Receipt is unavailable.",
    warehouse_receipt_ownership_mismatch: "The Warehouse Receipt identity is unavailable.",
    warehouse_qc_required: "Accepted Warehouse QC is required before outbound readiness.",
    warehouse_qc_blocked: "Warehouse QC does not allow outbound readiness.",
    warehouse_qc_unavailable: "Warehouse QC has already been recorded.",
  };
  return failure("rejected", code, messages[code] ?? "Warehouse action was rejected.");
}

function readCanonicalOrder(
  ports: LocalSupplierProductionCanonicalReadPorts,
  unit: SupplierProductionUnitIdentity,
): { readonly ok: true; readonly snapshot: LocalOrderSnapshot } | LocalSupplierWarehouseServiceFailure {
  let result;
  try {
    result = ports.orders.findSnapshotForFulfillmentById(unit.canonicalOrder.internalOrderId);
  } catch {
    return failure("unavailable", "order_unavailable", "The canonical Local Order is unavailable.");
  }
  if (result.status !== "found") return failure("unavailable", "order_unavailable", "The canonical Local Order is unavailable.");
  if (result.snapshot.internalId !== unit.canonicalOrder.internalOrderId
    || result.snapshot.publicReference !== unit.canonicalOrder.publicReference) {
    return failure("unavailable", "invalid_identity", "The canonical production identity is unavailable.");
  }
  return { ok: true, snapshot: result.snapshot };
}

function readCanonicalExpectedQuantity(
  configuredItems: LocalConfiguredItemReadPort | undefined,
  action: WarehouseIdentityAction,
): number | null {
  if (!configuredItems) return null;
  try {
    const result = configuredItems.findConfiguredItem({
      internalOrderId: action.productionUnit.canonicalOrder.internalOrderId,
      publicOrderReference: action.productionUnit.canonicalOrder.publicReference,
      orderItemId: action.productionUnit.orderItemId,
    });
    return result.status === "found" && result.item.fulfillmentType === "physical"
      ? result.item.quantity
      : null;
  } catch {
    return null;
  }
}

function readAdmission(
  ports: LocalSupplierProductionCanonicalReadPorts,
  repository: LocalSupplierProductionRepository,
  action: WarehouseIdentityAction,
  expectedStatus: "en_route_to_warehouse" | "warehouse_received" | "warehouse_qc",
): Admission | LocalSupplierWarehouseServiceFailure {
  const order = readCanonicalOrder(ports, action.productionUnit);
  if (!("ok" in order)) return order;
  if (order.snapshot.status !== "paid") return failure("rejected", "unpaid", "Supplier warehouse operations require a paid Local Order.");
  if (order.snapshot.paymentStatus !== "succeeded") return failure("rejected", "payment_not_succeeded", "Local Payment has not succeeded.");

  let assignmentResult;
  try {
    assignmentResult = ports.assignments.findByProductionUnit(action.productionUnit);
  } catch {
    return failure("unavailable", "assignment_unavailable", "The supplier assignment is unavailable.");
  }
  if (assignmentResult.status !== "found") return failure("unavailable", "assignment_unavailable", "The supplier assignment is unavailable.");
  const assignment = assignmentResult.assignment;
  if (!assignment) return failure("unavailable", "assignment_unavailable", "The supplier assignment is unavailable.");
  if (!sameSupplierProductionUnit(assignment.productionUnit, action.productionUnit)
    || assignment.assignmentId !== action.supplierAssignmentId) {
    return failure("unavailable", "warehouse_receipt_ownership_mismatch", "The supplier assignment is unavailable for this production unit.");
  }

  let workOrderResult;
  try {
    workOrderResult = ports.workOrders.findByProductionUnit(action.productionUnit);
  } catch {
    return failure("unavailable", "work_order_unavailable", "The SupplierWorkOrder is unavailable.");
  }
  if (workOrderResult.status !== "found") return failure("unavailable", "work_order_unavailable", "The SupplierWorkOrder is unavailable.");
  const workOrder = workOrderResult.workOrder;
  if (!sameSupplierProductionUnit({ canonicalOrder: workOrder.canonicalOrder, orderItemId: workOrder.orderItemId }, action.productionUnit)
    || workOrder.workOrderId !== action.supplierWorkOrderId
    || workOrder.supplier.assignmentId !== assignment.assignmentId) {
    return failure("unavailable", "warehouse_receipt_ownership_mismatch", "The SupplierWorkOrder is unavailable for this production unit.");
  }

  let operationResult;
  try {
    operationResult = repository.findByProductionUnit(action.productionUnit);
  } catch {
    return failure("unavailable", "warehouse_receipt_unavailable", "Supplier Production operation is unavailable.");
  }
  if (operationResult.status !== "found") return failure("unavailable", "warehouse_receipt_unavailable", "Supplier Production operation is unavailable.");
  const operation = operationResult.operation;
  if (operation.operationId !== action.supplierProductionOperationId
    || operation.assignmentId !== assignment.assignmentId
    || operation.workOrderId !== workOrder.workOrderId) {
    return failure("unavailable", "warehouse_receipt_ownership_mismatch", "Supplier Production operation identity is unavailable.");
  }
  if (operation.currentStatus !== expectedStatus) {
    return failure("rejected", "invalid_transition", "The current Supplier Production state does not admit this Warehouse action.");
  }
  if (expectedStatus === "en_route_to_warehouse" && "expectedQuantity" in action && ports.configuredItems) {
    const canonicalQuantity = readCanonicalExpectedQuantity(ports.configuredItems, action);
    if (canonicalQuantity === null || canonicalQuantity !== action.expectedQuantity) {
      return failure("rejected", "invalid_quantity", "Warehouse quantity does not match the canonical Order item.");
    }
  }
  return { order: order.snapshot, assignment, workOrder, operation };
}

function replayReceipt(
  binding: WarehouseActionBinding,
  action: WarehouseReceiptActionInput,
): LocalSupplierWarehouseReceiptServiceResult | null {
  if (binding.kind !== "warehouse_receipt_action_binding") return failure("conflict", "conflict", "Warehouse action identity is already bound to different input.");
  if (!sameWarehouseReceiptAction(binding.action, action)) return failure("conflict", "conflict", "Warehouse action identity is already bound to different input.");
  return { status: "replayed", receipt: binding.receipt, operation: binding.operation, transition: binding.transition };
}

function replayQc(
  binding: WarehouseActionBinding,
  action: WarehouseQcActionInput,
): LocalSupplierWarehouseReceiptServiceResult | null {
  if (binding.kind !== "warehouse_qc_action_binding") return failure("conflict", "conflict", "Warehouse action identity is already bound to different input.");
  if (!sameWarehouseQcAction(binding.action, action)) return failure("conflict", "conflict", "Warehouse action identity is already bound to different input.");
  return { status: "replayed", receipt: binding.receipt, operation: binding.operation, transition: binding.transition };
}

export class LocalSupplierWarehouseService {
  private readonly configuration: LocalSupplierProductionRuntimeConfiguration;
  private readonly ports: LocalSupplierProductionCanonicalReadPorts;
  private readonly repository: LocalSupplierProductionRepository;

  constructor(input: {
    readonly configuration: LocalSupplierProductionRuntimeConfiguration;
    readonly ports: LocalSupplierProductionCanonicalReadPorts;
    readonly repository: LocalSupplierProductionRepository;
  }) {
    this.configuration = input.configuration;
    this.ports = input.ports;
    this.repository = input.repository;
  }

  recordReceipt(input: unknown): LocalSupplierWarehouseReceiptServiceResult {
    const parsed = validateWarehouseReceiptAction(input);
    if (!parsed.ok) return failure("invalid", parsed.issues[0]?.code ?? "invalid_format", "Warehouse Receipt action is invalid.");
    if (!isLocalSupplierProductionRuntimeEnabled(this.configuration)) return failure("unavailable", "runtime_disabled", "Shanghai Warehouse Receipt is unavailable.");
    const action = parsed.value;
    const order = readCanonicalOrder(this.ports, action.productionUnit);
    if (!("ok" in order)) return order;
    let existing;
    try {
      existing = this.repository.findWarehouseActionById(action.warehouseReceiptActionId);
    } catch {
      return failure("unavailable", "unavailable", "Shanghai Warehouse Receipt is unavailable.");
    }
    if (existing.status === "found") return replayReceipt(existing.binding, action) ?? failure("unavailable", "unavailable", "Warehouse Receipt is unavailable.");
    const admission = readAdmission(this.ports, this.repository, action, "en_route_to_warehouse");
    if (!isAdmission(admission)) return admission;
    return this.commitReceipt(action);
  }

  recordQc(input: unknown): LocalSupplierWarehouseReceiptServiceResult {
    const parsed = validateWarehouseQcAction(input);
    if (!parsed.ok) return failure("invalid", parsed.issues[0]?.code ?? "invalid_format", "Warehouse QC action is invalid.");
    if (!isLocalSupplierProductionRuntimeEnabled(this.configuration)) return failure("unavailable", "runtime_disabled", "Shanghai Warehouse QC is unavailable.");
    const action = parsed.value;
    const order = readCanonicalOrder(this.ports, action.productionUnit);
    if (!("ok" in order)) return order;
    let existing;
    try {
      existing = this.repository.findWarehouseActionById(action.warehouseQcActionId);
    } catch {
      return failure("unavailable", "unavailable", "Shanghai Warehouse QC is unavailable.");
    }
    if (existing.status === "found") return replayQc(existing.binding, action) ?? failure("unavailable", "unavailable", "Warehouse QC is unavailable.");
    const admission = readAdmission(this.ports, this.repository, action, "warehouse_received");
    if (!isAdmission(admission)) return admission;
    const receipt = this.repository.findWarehouseReceiptByProductionUnit(action.productionUnit);
    if (receipt.status !== "found"
      || receipt.receipt.warehouseReceiptId !== action.warehouseReceiptId
      || receipt.receipt.supplierProductionOperationId !== admission.operation.operationId
      || receipt.receipt.supplierAssignmentId !== action.supplierAssignmentId
      || receipt.receipt.supplierWorkOrderId !== action.supplierWorkOrderId) {
      return failure("unavailable", "warehouse_receipt_ownership_mismatch", "The Warehouse Receipt is unavailable for this operation.");
    }
    return this.commitQc(action);
  }

  markReadyForOutbound(input: unknown): LocalSupplierWarehouseOutboundServiceResult {
    const parsed = validateWarehouseOutboundAction(input);
    if (!parsed.ok) return failure("invalid", parsed.issues[0]?.code ?? "invalid_format", "Warehouse outbound action is invalid.");
    if (!isLocalSupplierProductionRuntimeEnabled(this.configuration)) return failure("unavailable", "runtime_disabled", "Shanghai Warehouse outbound readiness is unavailable.");
    const action = parsed.value;
    const order = readCanonicalOrder(this.ports, action.productionUnit);
    if (!("ok" in order)) return order;
    let existing;
    try {
      existing = this.repository.findWarehouseActionById(action.warehouseOutboundActionId);
    } catch {
      return failure("unavailable", "unavailable", "Shanghai Warehouse outbound readiness is unavailable.");
    }
    if (existing.status === "found") {
      if (existing.binding.kind !== "warehouse_outbound_action_binding") return failure("conflict", "conflict", "Warehouse action identity is already bound to different input.");
      if (!sameWarehouseOutboundAction(existing.binding.action, action)) return failure("conflict", "conflict", "Warehouse action identity is already bound to different input.");
      return {
        status: "replayed",
        receipt: existing.binding.receipt,
        operation: existing.binding.operation,
        transition: existing.binding.transition,
        projection: existing.binding.projection,
      };
    }
    const admission = readAdmission(this.ports, this.repository, action, "warehouse_qc");
    if (!isAdmission(admission)) return admission;
    const receipt = this.repository.findWarehouseReceiptByProductionUnit(action.productionUnit);
    if (receipt.status !== "found"
      || receipt.receipt.warehouseReceiptId !== action.warehouseReceiptId
      || receipt.receipt.supplierProductionOperationId !== admission.operation.operationId
      || receipt.receipt.supplierAssignmentId !== action.supplierAssignmentId
      || receipt.receipt.supplierWorkOrderId !== action.supplierWorkOrderId) {
      return failure("unavailable", "warehouse_receipt_ownership_mismatch", "The Warehouse Receipt is unavailable for this operation.");
    }
    return this.commitOutbound(action);
  }

  private commitReceipt(action: WarehouseReceiptActionInput): LocalSupplierWarehouseReceiptServiceResult {
    let committed: WarehouseReceiptMutationResult;
    try {
      committed = this.repository.commitWarehouseReceipt(action);
    } catch {
      return failure("unavailable", "unavailable", "Shanghai Warehouse Receipt is unavailable.");
    }
    if (committed.status === "committed" || committed.status === "replayed") return committed;
    return mapCommitFailure(committed);
  }

  private commitQc(action: WarehouseQcActionInput): LocalSupplierWarehouseReceiptServiceResult {
    let committed: WarehouseReceiptMutationResult;
    try {
      committed = this.repository.commitWarehouseQc(action);
    } catch {
      return failure("unavailable", "unavailable", "Shanghai Warehouse QC is unavailable.");
    }
    if (committed.status === "committed" || committed.status === "replayed") return committed;
    return mapCommitFailure(committed);
  }

  private commitOutbound(action: WarehouseOutboundActionInput): LocalSupplierWarehouseOutboundServiceResult {
    let committed: WarehouseOutboundMutationResult;
    try {
      committed = this.repository.commitWarehouseOutbound(action);
    } catch {
      return failure("unavailable", "unavailable", "Shanghai Warehouse outbound readiness is unavailable.");
    }
    if (committed.status === "committed" || committed.status === "replayed") return committed;
    return mapCommitFailure(committed);
  }
}

function isAdmission(value: Admission | LocalSupplierWarehouseServiceFailure): value is Admission {
  return "operation" in value;
}
