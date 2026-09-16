import type { LocalFulfillmentAggregateReadResult } from "./local-fulfillment-repository.ts";
import type { LocalOrderReadResult } from "./local-order-repository.ts";
import type { LocalConfiguredItemReadPort } from "./local-configured-item-read-port.ts";
import type { LocalSupplierAssignmentRepository } from "./local-supplier-assignment-repository.ts";
import type { LocalSupplierWorkOrderRepository } from "./local-supplier-work-order-repository.ts";
import {
  sameSupplierProductionUnit,
  type SupplierAssignment,
  type SupplierOperatorAuthority,
  type SupplierProductionUnitIdentity,
} from "../domain/supplier-operations.ts";
import {
  sameSupplierProductionAction,
  validateSupplierProductionAction,
  type SupplierProductionActionInput,
  type SupplierProductionCommitResult,
  type SupplierProductionIssue,
  type SupplierProductionLifecycleStatus,
} from "../domain/supplier-production-lifecycle.ts";
import type {
  LocalSupplierProductionRepository,
  LocalSupplierProductionServiceResult,
} from "./local-supplier-production-repository.ts";

export type LocalSupplierProductionRuntimeMode = "development" | "test" | "production" | "unknown";
export type LocalSupplierProductionSource = "disabled" | "local_fake";

export interface LocalSupplierProductionRuntimeConfiguration {
  readonly source: LocalSupplierProductionSource;
  readonly runtimeMode: LocalSupplierProductionRuntimeMode;
}

export interface LocalSupplierProductionCanonicalReadPorts {
  readonly orders: {
    findSnapshotForFulfillmentById(internalOrderId: string): LocalOrderReadResult;
  };
  readonly assignments: LocalSupplierAssignmentRepository;
  readonly workOrders: Pick<LocalSupplierWorkOrderRepository, "findByProductionUnit">;
  readonly fulfillments: {
    findByOrderIdentity(input: {
      readonly internalOrderId: string;
      readonly publicOrderReference: string;
    }): LocalFulfillmentAggregateReadResult;
  };
  /** Optional for legacy lifecycle-only callers; the operator runtime supplies it for quantity authority. */
  readonly configuredItems?: LocalConfiguredItemReadPort;
}

function failure(
  status: "invalid" | "unavailable" | "conflict" | "rejected",
  code: SupplierProductionIssue["code"],
  message: string,
): LocalSupplierProductionServiceResult {
  return { status, issues: [{ path: "$", code, message }] };
}

export function isLocalSupplierProductionRuntimeEnabled(configuration: LocalSupplierProductionRuntimeConfiguration): boolean {
  return configuration.source === "local_fake"
    && (configuration.runtimeMode === "development" || configuration.runtimeMode === "test");
}

function mapCommitFailure(
  result: Exclude<SupplierProductionCommitResult, { status: "committed" | "replayed" }>,
): LocalSupplierProductionServiceResult {
  if (result.status === "conflict") return failure("conflict", "conflict", "Supplier operation action conflicts with existing state.");
  if (result.status === "unavailable" || result.status === "failed") return failure("unavailable", "unavailable", "Supplier Production Operations are unavailable.");
  const code = result.issues[0]?.code ?? "unavailable";
  const messages: Partial<Record<SupplierProductionIssue["code"], string>> = {
    invalid_transition: "Only the next consecutive Supplier Production state is allowed.",
    stale: "Supplier operation state is stale.",
    terminal: "Ready-for-outbound is terminal.",
    customer_production_not_started: "Customer Fulfillment production approval is required.",
    warehouse_evidence_required: "Warehouse Receipt or QC evidence is required for this transition.",
  };
  return failure("rejected", code, messages[code] ?? "Supplier Production action was rejected.");
}

function isLaterThanAssignment(status: SupplierProductionLifecycleStatus): boolean {
  return status !== "unassigned" && status !== "assigned";
}

function findAssignment(
  ports: LocalSupplierProductionCanonicalReadPorts,
  unit: SupplierProductionUnitIdentity,
): SupplierAssignment | null {
  try {
    const result = ports.assignments.findByProductionUnit(unit);
    return result.status === "found" ? result.assignment : null;
  } catch {
    return null;
  }
}

/**
 * Server-side application boundary for the internal supplier lifecycle. The
 * supplied operator authority is expected to have been resolved server-side;
 * public references and customer capabilities never create it.
 */
export class LocalSupplierProductionService {
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

  advance(input: unknown, options: { readonly requireWorkOrderForInitialAssignment?: boolean } = {}): LocalSupplierProductionServiceResult {
    const parsed = validateSupplierProductionAction(input);
    if (!parsed.ok) return failure("invalid", parsed.issues[0]?.code ?? "invalid_format", "Supplier Production action is invalid.");
    if (!isLocalSupplierProductionRuntimeEnabled(this.configuration)) return failure("unavailable", "runtime_disabled", "Supplier Production Operations are unavailable.");
    const action = parsed.value;

    let order: LocalOrderReadResult;
    try {
      order = this.ports.orders.findSnapshotForFulfillmentById(action.productionUnit.canonicalOrder.internalOrderId);
    } catch {
      return failure("unavailable", "order_unavailable", "The canonical Local Order is unavailable.");
    }
    if (order.status !== "found") return failure("unavailable", "order_unavailable", "The canonical Local Order is unavailable.");
    if (order.snapshot.internalId !== action.productionUnit.canonicalOrder.internalOrderId
      || order.snapshot.publicReference !== action.productionUnit.canonicalOrder.publicReference) {
      return failure("unavailable", "invalid_identity", "The canonical production identity is unavailable.");
    }

    // Replay is intentionally resolved before new lifecycle/upstream gates.
    let existingBinding;
    try {
      existingBinding = this.repository.findByActionId(action.supplierOperationActionId);
    } catch {
      return failure("unavailable", "unavailable", "Supplier Production Operations are unavailable.");
    }
    if (existingBinding.status === "found") {
      return sameSupplierProductionAction(existingBinding.binding.action, action)
        ? {
            status: "replayed",
            operation: existingBinding.binding.operation,
            result: existingBinding.binding.result,
          }
        : failure("conflict", "conflict", "Supplier operation action is already bound to different input.");
    }

    if (order.snapshot.status !== "paid") return failure("rejected", "unpaid", "Supplier operations require a paid Local Order.");
    if (order.snapshot.paymentStatus !== "succeeded") return failure("rejected", "payment_not_succeeded", "Local Payment has not succeeded.");

    let operation;
    try {
      const existing = this.repository.findByProductionUnit(action.productionUnit);
      operation = existing.status === "found" ? existing.operation : null;
    } catch {
      return failure("unavailable", "unavailable", "Supplier Production Operations are unavailable.");
    }
    const currentStatus = operation?.currentStatus ?? "unassigned";
    if (action.expectedCurrentStatus !== currentStatus) return failure("rejected", "stale", "Supplier operation state is stale.");

    const assignment = findAssignment(this.ports, action.productionUnit);
    if (!assignment) return failure("unavailable", "assignment_unavailable", "The supplier assignment is unavailable.");
    if (!sameSupplierProductionUnit(assignment.productionUnit, action.productionUnit)) {
      return failure("unavailable", "assignment_ownership_mismatch", "The supplier assignment is unavailable for this production unit.");
    }
    if (operation && operation.assignmentId !== assignment.assignmentId) {
      return failure("unavailable", "assignment_ownership_mismatch", "The supplier assignment is unavailable for this production unit.");
    }

    let workOrderId: string | null = operation?.workOrderId ?? null;
    const workOrderRequired = isLaterThanAssignment(action.nextStatus)
      || (options.requireWorkOrderForInitialAssignment === true && action.nextStatus === "assigned" && !operation);
    if (workOrderRequired) {
      let workOrder;
      try {
        const found = this.ports.workOrders.findByProductionUnit(action.productionUnit);
        workOrder = found.status === "found" ? found.workOrder : null;
      } catch {
        return failure("unavailable", "work_order_unavailable", "The SupplierWorkOrder is unavailable.");
      }
      if (workOrder) {
        if (!sameSupplierProductionUnit({ canonicalOrder: workOrder.canonicalOrder, orderItemId: workOrder.orderItemId }, action.productionUnit)) {
          return failure("unavailable", "work_order_ownership_mismatch", "The SupplierWorkOrder is unavailable for this production unit.");
        }
        if (workOrder.supplier.assignmentId !== assignment.assignmentId) {
          return failure("unavailable", "work_order_ownership_mismatch", "The SupplierWorkOrder is unavailable for this assignment.");
        }
        workOrderId = workOrder.workOrderId;
      } else if (workOrderRequired) {
        return failure("unavailable", "work_order_unavailable", "The SupplierWorkOrder is unavailable.");
      }
      if (operation?.workOrderId && operation.workOrderId !== workOrderId) {
        return failure("unavailable", "work_order_ownership_mismatch", "The SupplierWorkOrder is unavailable for this operation.");
      }
    }

    let fulfillmentStatus: import("../domain/local-fulfillment.ts").LocalFulfillmentStatus | null = null;
    if (currentStatus === "supplier_confirmed" && action.nextStatus === "in_production") {
      let fulfillment;
      try {
        fulfillment = this.ports.fulfillments.findByOrderIdentity({
          internalOrderId: action.productionUnit.canonicalOrder.internalOrderId,
          publicOrderReference: action.productionUnit.canonicalOrder.publicReference,
        });
      } catch {
        return failure("unavailable", "fulfillment_unavailable", "Customer Fulfillment is unavailable.");
      }
      if (fulfillment.status !== "found") return failure("unavailable", "fulfillment_unavailable", "Customer Fulfillment is unavailable.");
      const state = fulfillment.aggregate.state;
      if (state.internalOrderId !== action.productionUnit.canonicalOrder.internalOrderId
        || state.publicOrderReference !== action.productionUnit.canonicalOrder.publicReference) {
        return failure("unavailable", "invalid_identity", "Customer Fulfillment identity is unavailable.");
      }
      fulfillmentStatus = state.status;
      if (state.status !== "in_production" && state.status !== "quality_check") {
        return failure("rejected", "customer_production_not_started", "Customer Fulfillment must be in production before supplier production starts.");
      }
    }

    let committed: SupplierProductionCommitResult;
    try {
      committed = this.repository.commit({
        action,
        assignmentId: assignment.assignmentId,
        workOrderId,
        fulfillmentStatus,
      });
    } catch {
      return failure("unavailable", "unavailable", "Supplier Production Operations are unavailable.");
    }
    if (committed.status === "committed" || committed.status === "replayed") {
      return {
        status: committed.status,
        operation: committed.operation,
        result: committed.result,
      };
    }
    return mapCommitFailure(committed as Exclude<SupplierProductionCommitResult, { status: "committed" | "replayed" }>);
  }
}

export type { SupplierOperatorAuthority, SupplierProductionUnitIdentity, SupplierProductionActionInput };
