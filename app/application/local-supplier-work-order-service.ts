import {
  isSupplierOperatorAuthority,
  type SupplierAssignment,
} from "../domain/supplier-operations.ts";
import {
  resolveSupplierWorkOrderAdmission,
  sameSupplierWorkOrderRequestIdentity,
  validateSupplierWorkOrderCreateRequest,
  type SupplierWorkOrderCanonicalReadPorts,
  type SupplierWorkOrderCommitResult,
  type SupplierWorkOrderCreateRequest,
  type SupplierWorkOrderIssue,
} from "../domain/supplier-work-order.ts";
import type {
  LocalSupplierWorkOrderRepository,
  LocalSupplierWorkOrderServiceResult,
} from "./local-supplier-work-order-repository.ts";

function failure(
  status: "invalid" | "unavailable" | "conflict" | "rejected",
  code: SupplierWorkOrderIssue["code"],
  message: string,
): LocalSupplierWorkOrderServiceResult {
  return { status, issues: [{ path: "$", code, message }] };
}

function mapAdmissionFailure(
  result: Exclude<ReturnType<typeof resolveSupplierWorkOrderAdmission>, { status: "eligible" }>,
): LocalSupplierWorkOrderServiceResult {
  if (result.status === "invalid_identity") {
    return failure("unavailable", "invalid_identity", "The canonical production identity is unavailable.");
  }
  if (result.status === "order_unavailable") return failure("unavailable", "order_unavailable", "The canonical Local Order is unavailable.");
  if (result.status === "assignment_unavailable") return failure("unavailable", "assignment_unavailable", "The supplier assignment is unavailable.");
  if (result.status === "fulfillment_unavailable") return failure("unavailable", "fulfillment_unavailable", "Customer Fulfillment is unavailable.");
  if (result.status === "unpaid") return failure("rejected", "unpaid", "SupplierWorkOrder requires a paid Local Order.");
  if (result.status === "payment_not_succeeded") return failure("rejected", "payment_not_succeeded", "Local Payment has not succeeded.");
  if (result.status === "preview_not_approved") return failure("rejected", "preview_not_approved", "Customer Fulfillment approval is required.");
  if (result.status === "assignment_ownership_mismatch") return failure("unavailable", "assignment_ownership_mismatch", "The supplier assignment is unavailable for this production unit.");
  return failure("unavailable", "configured_item_unavailable", "The configured Order item is unavailable.");
}

function assignmentFor(
  ports: SupplierWorkOrderCanonicalReadPorts,
  request: SupplierWorkOrderCreateRequest,
): SupplierAssignment | null {
  try {
    const result = ports.assignments.findByProductionUnit(request.productionUnit);
    return result.status === "found" ? result.assignment : null;
  } catch {
    return null;
  }
}

/**
 * Application boundary for internal SupplierWorkOrder creation. The caller
 * supplies a server-resolved operator authority; customer capabilities and
 * public references never create that authority.
 */
export class LocalSupplierWorkOrderService {
  private readonly ports: SupplierWorkOrderCanonicalReadPorts;
  private readonly repository: LocalSupplierWorkOrderRepository;

  constructor(input: {
    readonly ports: SupplierWorkOrderCanonicalReadPorts;
    readonly repository: LocalSupplierWorkOrderRepository;
  }) {
    this.ports = input.ports;
    this.repository = input.repository;
  }

  create(input: unknown): LocalSupplierWorkOrderServiceResult {
    const parsed = validateSupplierWorkOrderCreateRequest(input);
    if (!parsed.ok) return failure("invalid", "invalid_format", "SupplierWorkOrder input is invalid.");
    const request = parsed.value;
    if (!isSupplierOperatorAuthority(request.operatorAuthority)) {
      return failure("unavailable", "unauthorized", "SupplierWorkOrder is unavailable.");
    }

    // Resolve only canonical Order and assignment identity before replay lookup.
    // New-state gates are intentionally deferred until no exact binding exists.
    let order;
    try {
      order = this.ports.orders.findSnapshotForFulfillmentById(request.productionUnit.canonicalOrder.internalOrderId);
    } catch {
      return failure("unavailable", "order_unavailable", "The canonical Local Order is unavailable.");
    }
    if (order.status !== "found") return failure("unavailable", "order_unavailable", "The canonical Local Order is unavailable.");
    if (order.snapshot.publicReference !== request.productionUnit.canonicalOrder.publicReference) {
      return failure("unavailable", "invalid_identity", "The canonical production identity is unavailable.");
    }
    const assignment = assignmentFor(this.ports, request);
    if (!assignment) return failure("unavailable", "assignment_unavailable", "The supplier assignment is unavailable.");

    let existing;
    try {
      existing = this.repository.findByActionId(request.workOrderActionId);
    } catch {
      return failure("unavailable", "unavailable", "SupplierWorkOrder is unavailable.");
    }
    if (existing.status === "found") {
      return sameSupplierWorkOrderRequestIdentity(existing.workOrder, request, assignment.assignmentId)
        ? { status: "replayed", workOrder: existing.workOrder }
        : failure("conflict", "conflict", "WorkOrder action selector is already bound to different context.");
    }

    const admission = resolveSupplierWorkOrderAdmission(request.productionUnit, this.ports);
    if (admission.status !== "eligible") return mapAdmissionFailure(admission);

    let committed: SupplierWorkOrderCommitResult;
    try {
      committed = this.repository.commit({
        ...request,
        facts: admission.facts,
      });
    } catch {
      return failure("unavailable", "unavailable", "SupplierWorkOrder is unavailable.");
    }
    if (committed.status === "committed" || committed.status === "replayed") {
      return { status: committed.status, workOrder: committed.workOrder };
    }
    if (committed.status === "conflict") return failure("conflict", "conflict", "WorkOrder action conflicts with existing state.");
    if (committed.status === "rejected") return failure("rejected", committed.issues[0]?.code ?? "unavailable", "SupplierWorkOrder request was rejected.");
    if (committed.status === "unavailable" || committed.status === "failed") {
      return failure("unavailable", committed.issues[0]?.code ?? "unavailable", "SupplierWorkOrder is unavailable.");
    }
    return failure("unavailable", "unavailable", "SupplierWorkOrder is unavailable.");
  }
}
