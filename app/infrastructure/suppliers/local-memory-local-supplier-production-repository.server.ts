import {
  cloneSupplierProductionActionBinding,
  cloneSupplierProductionOperation,
  cloneSupplierProductionTransitionResult,
  evaluateSupplierProductionTransition,
  isSupplierProductionOperationActionId,
  sameSupplierProductionAction,
  supplierProductionIssue,
  supplierProductionOperationKey,
  supplierProductionStatusIndex,
  validateSupplierProductionAction,
  SUPPLIER_PRODUCTION_LIFECYCLE,
  SUPPLIER_PRODUCTION_NOTICE,
  type SupplierProductionActionBinding,
  type SupplierProductionCommitInput,
  type SupplierProductionCommitResult,
  type SupplierProductionOperation,
  type SupplierProductionLifecycleStatus,
  type SupplierProductionTransitionResult,
} from "../../domain/supplier-production-lifecycle.ts";
import {
  buildWarehouseReceipt,
  cloneWarehouseActionBinding,
  cloneWarehouseOutboundMutationResult,
  cloneWarehouseReceipt,
  cloneWarehouseMutationResult,
  sameWarehouseOutboundAction,
  sameWarehouseQcAction,
  sameWarehouseReceiptAction,
  validateWarehouseOutboundAction,
  validateWarehouseQcAction,
  validateWarehouseReceiptAction,
  SUPPLIER_WAREHOUSE_NOTICE,
  type WarehouseActionBinding,
  type WarehouseOutboundActionInput,
  type WarehouseOutboundMutationResult,
  type WarehouseQcActionInput,
  type WarehouseReceiptActionInput,
  type WarehouseReceiptMutationResult,
  type WarehouseOutboundProjection,
  type WarehouseReceipt,
} from "../../domain/supplier-warehouse-receipt.ts";
import type {
  LocalMemoryLocalSupplierProductionRepositoryOptions,
  LocalSupplierProductionRepository,
  LocalSupplierProductionTestCounts,
  LocalSupplierWarehouseActionLookup,
  LocalSupplierWarehouseTestCounts,
} from "../../application/local-supplier-production-repository.ts";
import type { SupplierProductionUnitIdentity } from "../../domain/supplier-operations.ts";

function failure(
  status: "rejected" | "conflict" | "unavailable" | "failed",
  code: Parameters<typeof supplierProductionIssue>[0],
  message: string,
): SupplierProductionCommitResult {
  return { status, issues: [supplierProductionIssue(code, message)] };
}

type WarehouseFailureResult = {
  readonly status: "rejected" | "conflict" | "unavailable" | "failed";
  readonly issues: readonly ReturnType<typeof supplierProductionIssue>[];
};

function warehouseFailure(
  status: WarehouseFailureResult["status"],
  code: Parameters<typeof supplierProductionIssue>[0],
  message: string,
): WarehouseFailureResult {
  return { status, issues: [supplierProductionIssue(code, message)] };
}

function defaultOperationId(): string {
  return `supplier-production-operation-${globalThis.crypto.randomUUID()}`;
}

function defaultWarehouseReceiptId(): string {
  return `warehouse-receipt-${globalThis.crypto.randomUUID()}`;
}

function cloneCommitBinding(value: SupplierProductionActionBinding): SupplierProductionActionBinding {
  return cloneSupplierProductionActionBinding(value);
}

function isProductionStateAfterAssignment(status: string): boolean {
  return supplierProductionStatusIndex(status as typeof SUPPLIER_PRODUCTION_LIFECYCLE[number])
    >= supplierProductionStatusIndex("work_order_ready");
}

function warehouseTransitionRequiresEvidence(
  currentStatus: SupplierProductionLifecycleStatus,
  nextStatus: SupplierProductionLifecycleStatus,
): boolean {
  return (currentStatus === "en_route_to_warehouse" && nextStatus === "warehouse_received")
    || (currentStatus === "warehouse_received" && nextStatus === "warehouse_qc")
    || (currentStatus === "warehouse_qc" && nextStatus === "ready_for_outbound");
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && Number.isFinite(Date.parse(value));
}

function sameWarehouseOperationIdentity(
  action: WarehouseReceiptActionInput | WarehouseQcActionInput | WarehouseOutboundActionInput,
  operation: SupplierProductionOperation,
): boolean {
  return supplierProductionOperationKey(action.productionUnit) === supplierProductionOperationKey(operation.productionUnit)
    && operation.assignmentId === action.supplierAssignmentId
    && operation.workOrderId === action.supplierWorkOrderId
    && operation.operationId === action.supplierProductionOperationId;
}

function buildWarehouseOperationTransition(
  current: SupplierProductionOperation,
  nextStatus: SupplierProductionLifecycleStatus,
  supplierOperationActionId: string,
  operatorContextId: string,
  committedAt: string,
): { readonly operation: SupplierProductionOperation; readonly result: SupplierProductionTransitionResult } {
  const historyEntry = {
    kind: "supplier_production_transition" as const,
    fromStatus: current.currentStatus,
    toStatus: nextStatus,
    supplierOperationActionId,
    operatorContextId,
    committedAt,
  };
  const operation: SupplierProductionOperation = {
    ...current,
    currentStatus: nextStatus,
    history: [...current.history, historyEntry],
    updatedAt: committedAt,
  };
  const result: SupplierProductionTransitionResult = {
    kind: "supplier_production_transition_result",
    productionUnit: {
      canonicalOrder: { ...current.productionUnit.canonicalOrder },
      orderItemId: current.productionUnit.orderItemId,
    },
    fromStatus: current.currentStatus,
    status: nextStatus,
    supplierOperationActionId,
    committedAt,
    notice: SUPPLIER_PRODUCTION_NOTICE,
  };
  return {
    operation: deepFreezeClone(operation),
    result: deepFreezeClone(result),
  };
}

/**
 * Process-memory-only supplier lifecycle aggregate. It owns only operation
 * state/history/bindings and never copies an upstream Order or Fulfillment.
 */
export class LocalMemoryLocalSupplierProductionRepository implements LocalSupplierProductionRepository {
  private readonly operationsByProductionUnit = new Map<string, SupplierProductionOperation>();
  private readonly bindingsByActionId = new Map<string, SupplierProductionActionBinding>();
  private readonly receiptsByProductionUnit = new Map<string, WarehouseReceipt>();
  private readonly warehouseBindingsByActionId = new Map<string, WarehouseActionBinding>();
  private readonly now: () => string;
  private readonly nextOperationId: () => string;
  private readonly nextWarehouseReceiptId: () => string;
  private readonly failureInjector?: LocalMemoryLocalSupplierProductionRepositoryOptions["failureInjector"];

  constructor(options: LocalMemoryLocalSupplierProductionRepositoryOptions = {}) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.nextOperationId = options.nextOperationId ?? defaultOperationId;
    this.nextWarehouseReceiptId = options.nextWarehouseReceiptId ?? defaultWarehouseReceiptId;
    this.failureInjector = options.failureInjector;
  }

  findByActionId(actionId: string):
    | { readonly status: "found"; readonly binding: SupplierProductionActionBinding }
    | { readonly status: "unavailable" } {
    const binding = this.bindingsByActionId.get(actionId);
    return binding ? { status: "found", binding: cloneCommitBinding(binding) } : { status: "unavailable" };
  }

  findByProductionUnit(input: SupplierProductionUnitIdentity):
    | { readonly status: "found"; readonly operation: SupplierProductionOperation }
    | { readonly status: "unavailable" } {
    const operation = this.operationsByProductionUnit.get(supplierProductionOperationKey(input));
    return operation
      ? { status: "found", operation: cloneSupplierProductionOperation(operation) }
      : { status: "unavailable" };
  }

  list(): readonly SupplierProductionOperation[] {
    return [...this.operationsByProductionUnit.values()].map(cloneSupplierProductionOperation);
  }

  commit(input: SupplierProductionCommitInput): SupplierProductionCommitResult {
    const parsed = validateSupplierProductionAction(input.action);
    if (!parsed.ok) return { status: "rejected", issues: parsed.issues };
    const action = parsed.value;
    if (!isSupplierProductionOperationActionId(action.supplierOperationActionId)) {
      return failure("rejected", "invalid_format", "Supplier operation action identity is invalid.");
    }

    const existingBinding = this.bindingsByActionId.get(action.supplierOperationActionId);
    if (existingBinding) {
      if (!sameSupplierProductionAction(existingBinding.action, action)
        || existingBinding.assignmentId !== input.assignmentId
        || existingBinding.workOrderId !== input.workOrderId) {
        return failure("conflict", "conflict", "Supplier operation action is already bound to different context.");
      }
      return {
        status: "replayed",
        operation: cloneSupplierProductionOperation(existingBinding.operation),
        result: cloneSupplierProductionTransitionResult(existingBinding.result),
      };
    }

    const key = supplierProductionOperationKey(action.productionUnit);
    const existingOperation = this.operationsByProductionUnit.get(key) ?? null;
    const currentStatus = existingOperation?.currentStatus ?? "unassigned";
    if (action.expectedCurrentStatus !== currentStatus) {
      return failure("rejected", "stale", "Supplier operation state is stale.");
    }
    const transition = evaluateSupplierProductionTransition(currentStatus, action.nextStatus);
    if (!transition.ok) return { status: "rejected", issues: transition.issues };
    if (warehouseTransitionRequiresEvidence(currentStatus, action.nextStatus)) {
      return failure("rejected", "warehouse_evidence_required", "Warehouse Receipt or QC evidence is required for this transition.");
    }

    if (!input.assignmentId) {
      return failure("unavailable", "assignment_unavailable", "Supplier assignment is unavailable.");
    }
    if (isProductionStateAfterAssignment(action.nextStatus) && !input.workOrderId) {
      return failure("unavailable", "work_order_unavailable", "SupplierWorkOrder is unavailable.");
    }
    if (currentStatus === "supplier_confirmed"
      && action.nextStatus === "in_production"
      && input.fulfillmentStatus !== "in_production"
      && input.fulfillmentStatus !== "quality_check") {
      return failure("rejected", "customer_production_not_started", "Customer Fulfillment has not entered production.");
    }

    let operationId: string;
    try {
      operationId = existingOperation?.operationId ?? this.nextOperationId();
    } catch {
      return failure("failed", "unavailable", "Supplier operation identity could not be generated safely.");
    }
    if (typeof operationId !== "string" || operationId.trim().length === 0) {
      return failure("failed", "unavailable", "Supplier operation identity could not be generated safely.");
    }

    let committedAt: string;
    try {
      committedAt = this.now();
    } catch {
      return failure("failed", "unavailable", "Supplier operation timestamp is unavailable.");
    }
    const assignmentId = existingOperation?.assignmentId ?? input.assignmentId;
    const workOrderId = existingOperation?.workOrderId ?? input.workOrderId;
    const historyEntry = {
      kind: "supplier_production_transition" as const,
      fromStatus: currentStatus,
      toStatus: action.nextStatus,
      supplierOperationActionId: action.supplierOperationActionId,
      operatorContextId: action.operatorAuthority.actorContextId,
      committedAt,
    };
    const operation: SupplierProductionOperation = {
      kind: "supplier_production_operation",
      operationId,
      productionUnit: {
        canonicalOrder: { ...action.productionUnit.canonicalOrder },
        orderItemId: action.productionUnit.orderItemId,
      },
      assignmentId,
      workOrderId,
      currentStatus: action.nextStatus,
      history: [...(existingOperation?.history ?? []), historyEntry],
      createdAt: existingOperation?.createdAt ?? committedAt,
      updatedAt: committedAt,
      notice: SUPPLIER_PRODUCTION_NOTICE,
    };
    const result = {
      kind: "supplier_production_transition_result" as const,
      productionUnit: {
        canonicalOrder: { ...action.productionUnit.canonicalOrder },
        orderItemId: action.productionUnit.orderItemId,
      },
      fromStatus: currentStatus,
      status: action.nextStatus,
      supplierOperationActionId: action.supplierOperationActionId,
      committedAt,
      notice: SUPPLIER_PRODUCTION_NOTICE,
    };
    const binding: SupplierProductionActionBinding = {
      action,
      assignmentId,
      workOrderId,
      result,
      operation,
    };

    try {
      this.failureInjector?.beforeCommit?.();
    } catch {
      return failure("failed", "unavailable", "Supplier operation could not be committed.");
    }

    // One synchronous visible commit point for operation, history, and binding.
    this.operationsByProductionUnit.set(key, deepFreezeClone(operation));
    this.bindingsByActionId.set(action.supplierOperationActionId, deepFreezeBinding(binding));
    return {
      status: "committed",
      operation: cloneSupplierProductionOperation(operation),
      result: cloneSupplierProductionTransitionResult(result),
    };
  }

  findWarehouseActionById(actionId: string): LocalSupplierWarehouseActionLookup {
    const binding = this.warehouseBindingsByActionId.get(actionId);
    if (!binding) return { status: "unavailable" };
    return { status: "found", binding: cloneWarehouseActionBinding(binding) };
  }

  findWarehouseReceiptByProductionUnit(input: SupplierProductionUnitIdentity):
    | { readonly status: "found"; readonly receipt: WarehouseReceipt }
    | { readonly status: "unavailable" } {
    const receipt = this.receiptsByProductionUnit.get(supplierProductionOperationKey(input));
    return receipt ? { status: "found", receipt: cloneWarehouseReceipt(receipt) } : { status: "unavailable" };
  }

  listWarehouseReceipts(): readonly WarehouseReceipt[] {
    return [...this.receiptsByProductionUnit.values()].map(cloneWarehouseReceipt);
  }

  commitWarehouseReceipt(input: WarehouseReceiptActionInput): WarehouseReceiptMutationResult {
    const parsed = validateWarehouseReceiptAction(input);
    if (!parsed.ok) return { status: "rejected", issues: parsed.issues };
    const action = parsed.value;
    const prior = this.warehouseBindingsByActionId.get(action.warehouseReceiptActionId);
    if (prior) {
      if (prior.kind !== "warehouse_receipt_action_binding" || !sameWarehouseReceiptAction(prior.action, action)) {
        return warehouseFailure("conflict", "conflict", "Warehouse action identity is already bound to different input.");
      }
      return cloneWarehouseMutationResult({
        status: "replayed",
        receipt: prior.receipt,
        operation: prior.operation,
        transition: prior.transition,
      });
    }

    const key = supplierProductionOperationKey(action.productionUnit);
    const operation = this.operationsByProductionUnit.get(key);
    if (!operation) return warehouseFailure("unavailable", "warehouse_receipt_unavailable", "Supplier Production operation is unavailable.");
    if (operation.currentStatus !== "en_route_to_warehouse") {
      return warehouseFailure("rejected", "invalid_transition", "Warehouse receipt requires an en-route Supplier Production operation.");
    }
    if (this.receiptsByProductionUnit.has(key)) {
      return warehouseFailure("conflict", "conflict", "A Warehouse Receipt already exists for this production unit.");
    }
    if (!sameWarehouseOperationIdentity(action, operation)) {
      return warehouseFailure("unavailable", "warehouse_receipt_ownership_mismatch", "Warehouse Receipt identity does not match the current operation.");
    }

    let warehouseReceiptId: string;
    let committedAt: string;
    try {
      warehouseReceiptId = this.nextWarehouseReceiptId();
      committedAt = this.now();
    } catch {
      return warehouseFailure("failed", "unavailable", "Warehouse Receipt identity or timestamp is unavailable.");
    }
    if (typeof warehouseReceiptId !== "string" || warehouseReceiptId.trim().length === 0 || !isTimestamp(committedAt)) {
      return warehouseFailure("failed", "unavailable", "Warehouse Receipt identity or timestamp is unavailable.");
    }
    const receipt = buildWarehouseReceipt({
      warehouseReceiptId,
      action,
      supplierProductionOperationId: operation.operationId,
      receivedAt: committedAt,
    });
    const transitioned = buildWarehouseOperationTransition(
      operation,
      "warehouse_received",
      `supplier-production-warehouse-receipt-${action.warehouseReceiptActionId}`,
      action.operatorAuthority.actorContextId,
      committedAt,
    );
    const binding: WarehouseActionBinding = {
      kind: "warehouse_receipt_action_binding",
      action,
      receipt,
      operation: transitioned.operation,
      transition: transitioned.result,
    };
    if (!this.beforeWarehouseCommit()) return warehouseFailure("failed", "unavailable", "Warehouse Receipt could not be committed.");
    this.receiptsByProductionUnit.set(key, receipt);
    this.operationsByProductionUnit.set(key, transitioned.operation);
    this.warehouseBindingsByActionId.set(action.warehouseReceiptActionId, cloneWarehouseActionBinding(binding));
    return cloneWarehouseMutationResult({
      status: "committed",
      receipt,
      operation: transitioned.operation,
      transition: transitioned.result,
    });
  }

  commitWarehouseQc(input: WarehouseQcActionInput): WarehouseReceiptMutationResult {
    const parsed = validateWarehouseQcAction(input);
    if (!parsed.ok) return { status: "rejected", issues: parsed.issues };
    const action = parsed.value;
    const prior = this.warehouseBindingsByActionId.get(action.warehouseQcActionId);
    if (prior) {
      if (prior.kind !== "warehouse_qc_action_binding" || !sameWarehouseQcAction(prior.action, action)) {
        return warehouseFailure("conflict", "conflict", "Warehouse action identity is already bound to different input.");
      }
      return cloneWarehouseMutationResult({
        status: "replayed",
        receipt: prior.receipt,
        operation: prior.operation,
        transition: prior.transition,
      });
    }

    const key = supplierProductionOperationKey(action.productionUnit);
    const operation = this.operationsByProductionUnit.get(key);
    const receipt = this.receiptsByProductionUnit.get(key);
    if (!operation || !receipt) return warehouseFailure("unavailable", "warehouse_receipt_unavailable", "Warehouse Receipt or Supplier Production operation is unavailable.");
    if (operation.currentStatus !== "warehouse_received") {
      return warehouseFailure("rejected", "invalid_transition", "Warehouse QC requires a received Warehouse Receipt.");
    }
    if (!sameWarehouseOperationIdentity(action, operation)
      || receipt.warehouseReceiptId !== action.warehouseReceiptId
      || receipt.supplierProductionOperationId !== action.supplierProductionOperationId
      || receipt.supplierAssignmentId !== action.supplierAssignmentId
      || receipt.supplierWorkOrderId !== action.supplierWorkOrderId) {
      return warehouseFailure("unavailable", "warehouse_receipt_ownership_mismatch", "Warehouse QC identity does not match the current receipt.");
    }
    if (receipt.qc.status !== "pending") {
      return warehouseFailure("rejected", "warehouse_qc_unavailable", "Warehouse QC has already been recorded for this receipt.");
    }

    let committedAt: string;
    try {
      committedAt = this.now();
    } catch {
      return warehouseFailure("failed", "unavailable", "Warehouse QC timestamp is unavailable.");
    }
    if (!isTimestamp(committedAt)) return warehouseFailure("failed", "unavailable", "Warehouse QC timestamp is unavailable.");
    const nextReceipt = deepFreezeClone({
      ...receipt,
      qc: {
        status: action.qcDecision,
        warehouseQcActionId: action.warehouseQcActionId,
        evaluatedAt: committedAt,
        notes: action.notes,
      },
    });
    const transitioned = buildWarehouseOperationTransition(
      operation,
      "warehouse_qc",
      `supplier-production-warehouse-qc-${action.warehouseQcActionId}`,
      action.operatorAuthority.actorContextId,
      committedAt,
    );
    const binding: WarehouseActionBinding = {
      kind: "warehouse_qc_action_binding",
      action,
      receipt: nextReceipt,
      operation: transitioned.operation,
      transition: transitioned.result,
    };
    if (!this.beforeWarehouseCommit()) return warehouseFailure("failed", "unavailable", "Warehouse QC could not be committed.");
    this.receiptsByProductionUnit.set(key, nextReceipt);
    this.operationsByProductionUnit.set(key, transitioned.operation);
    this.warehouseBindingsByActionId.set(action.warehouseQcActionId, cloneWarehouseActionBinding(binding));
    return cloneWarehouseMutationResult({
      status: "committed",
      receipt: nextReceipt,
      operation: transitioned.operation,
      transition: transitioned.result,
    });
  }

  commitWarehouseOutbound(input: WarehouseOutboundActionInput): WarehouseOutboundMutationResult {
    const parsed = validateWarehouseOutboundAction(input);
    if (!parsed.ok) return { status: "rejected", issues: parsed.issues };
    const action = parsed.value;
    const prior = this.warehouseBindingsByActionId.get(action.warehouseOutboundActionId);
    if (prior) {
      if (prior.kind !== "warehouse_outbound_action_binding" || !sameWarehouseOutboundAction(prior.action, action)) {
        return warehouseFailure("conflict", "conflict", "Warehouse action identity is already bound to different input.");
      }
      return cloneWarehouseOutboundMutationResult({
        status: "replayed",
        receipt: prior.receipt,
        operation: prior.operation,
        transition: prior.transition,
        projection: prior.projection,
      });
    }

    const key = supplierProductionOperationKey(action.productionUnit);
    const operation = this.operationsByProductionUnit.get(key);
    const receipt = this.receiptsByProductionUnit.get(key);
    if (!operation || !receipt) return warehouseFailure("unavailable", "warehouse_receipt_unavailable", "Warehouse Receipt or Supplier Production operation is unavailable.");
    if (operation.currentStatus !== "warehouse_qc") return warehouseFailure("rejected", "invalid_transition", "Ready-for-outbound requires completed Warehouse QC.");
    if (!sameWarehouseOperationIdentity(action, operation)
      || receipt.warehouseReceiptId !== action.warehouseReceiptId
      || receipt.supplierProductionOperationId !== action.supplierProductionOperationId
      || receipt.supplierAssignmentId !== action.supplierAssignmentId
      || receipt.supplierWorkOrderId !== action.supplierWorkOrderId) {
      return warehouseFailure("unavailable", "warehouse_receipt_ownership_mismatch", "Ready-for-outbound identity does not match the current receipt.");
    }
    if (receipt.qc.status === "pending") return warehouseFailure("rejected", "warehouse_qc_required", "Accepted Warehouse QC is required before outbound readiness.");
    if (receipt.qc.status === "blocked") return warehouseFailure("rejected", "warehouse_qc_blocked", "Warehouse QC does not allow outbound readiness.");

    let committedAt: string;
    try {
      committedAt = this.now();
    } catch {
      return warehouseFailure("failed", "unavailable", "Outbound readiness timestamp is unavailable.");
    }
    if (!isTimestamp(committedAt)) return warehouseFailure("failed", "unavailable", "Outbound readiness timestamp is unavailable.");
    const nextReceipt = deepFreezeClone({ ...receipt, readyForOutbound: true });
    const transitioned = buildWarehouseOperationTransition(
      operation,
      "ready_for_outbound",
      `supplier-production-warehouse-outbound-${action.warehouseOutboundActionId}`,
      action.operatorAuthority.actorContextId,
      committedAt,
    );
    const projection: WarehouseOutboundProjection = deepFreezeClone({
      kind: "warehouse_outbound_projection" as const,
      productionUnit: {
        canonicalOrder: { ...action.productionUnit.canonicalOrder },
        orderItemId: action.productionUnit.orderItemId,
      },
      supplierWorkOrderId: action.supplierWorkOrderId,
      warehouseReceiptId: action.warehouseReceiptId,
      warehouseStatus: "ready_for_outbound" as const,
      qcAccepted: true as const,
      readyForOutbound: true as const,
      notice: SUPPLIER_WAREHOUSE_NOTICE,
    });
    const binding: WarehouseActionBinding = {
      kind: "warehouse_outbound_action_binding",
      action,
      receipt: nextReceipt,
      operation: transitioned.operation,
      transition: transitioned.result,
      projection,
    };
    if (!this.beforeWarehouseCommit()) return warehouseFailure("failed", "unavailable", "Outbound readiness could not be committed.");
    this.receiptsByProductionUnit.set(key, nextReceipt);
    this.operationsByProductionUnit.set(key, transitioned.operation);
    this.warehouseBindingsByActionId.set(action.warehouseOutboundActionId, cloneWarehouseActionBinding(binding));
    return cloneWarehouseOutboundMutationResult({
      status: "committed",
      receipt: nextReceipt,
      operation: transitioned.operation,
      transition: transitioned.result,
      projection,
    });
  }

  getCountsForTests(): LocalSupplierProductionTestCounts {
    return {
      operationCount: this.operationsByProductionUnit.size,
      bindingCount: this.bindingsByActionId.size,
      historyCount: [...this.operationsByProductionUnit.values()].reduce((sum, operation) => sum + operation.history.length, 0),
    };
  }

  getWarehouseCountsForTests(): LocalSupplierWarehouseTestCounts {
    let receiptBindingCount = 0;
    let qcBindingCount = 0;
    let outboundBindingCount = 0;
    for (const binding of this.warehouseBindingsByActionId.values()) {
      if (binding.kind === "warehouse_receipt_action_binding") receiptBindingCount += 1;
      if (binding.kind === "warehouse_qc_action_binding") qcBindingCount += 1;
      if (binding.kind === "warehouse_outbound_action_binding") outboundBindingCount += 1;
    }
    return {
      receiptCount: this.receiptsByProductionUnit.size,
      receiptBindingCount,
      qcBindingCount,
      outboundBindingCount,
    };
  }

  private beforeWarehouseCommit(): boolean {
    try {
      this.failureInjector?.beforeCommit?.();
      return true;
    } catch {
      return false;
    }
  }
}

function deepFreezeClone<T>(value: T): T {
  if (typeof value !== "object" || value === null) return value;
  const clone = Array.isArray(value)
    ? value.map((entry) => deepFreezeClone(entry))
    : Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, deepFreezeClone(entry)]));
  return Object.freeze(clone) as T;
}

function deepFreezeBinding(value: SupplierProductionActionBinding): SupplierProductionActionBinding {
  return deepFreezeClone(value);
}
