import {
  buildSupplierAssignmentFromCandidate,
  isSupplierAssignmentActionId,
  sameSupplierCandidateIdentity,
  sameSupplierProductionUnit,
  supplierAssignmentIssue,
  supplierProductionUnitKey,
  type SupplierAssignment,
  type SupplierAssignmentRequest,
  type SupplierAssignmentResult,
  type SupplierCandidate,
  type SupplierProductionUnitIdentity,
} from "../../domain/supplier-operations.ts";
import {
  validateSupplierAssignmentRequest,
  type SupplierValidationIssue,
} from "../../domain/supplier-operations.ts";
import type {
  LocalMemoryLocalSupplierAssignmentRepositoryOptions,
  LocalSupplierAssignmentRepository,
  LocalSupplierAssignmentTestCounts,
} from "../../application/local-supplier-assignment-repository.ts";

interface SupplierAssignmentBinding {
  readonly assignmentActionId: string;
  readonly actorContextId: string;
  readonly productionUnit: SupplierProductionUnitIdentity;
  readonly selectedCandidate: SupplierCandidate;
  readonly assignment: SupplierAssignment;
}

function failure(
  status: "rejected" | "conflict" | "unavailable" | "failed",
  code: SupplierValidationIssue["code"],
  message: string,
): SupplierAssignmentResult {
  return { status, issues: [supplierAssignmentIssue(code, message)] };
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  return value;
}

function cloneProvenance(value: SupplierCandidate["provenance"]) {
  return value.map((entry) => ({
    ...entry,
    workbook: { ...entry.workbook },
    rawValues: { ...entry.rawValues },
  }));
}

function cloneAssignment(value: SupplierAssignment): SupplierAssignment {
  return deepFreeze({
    ...value,
    productionUnit: {
      canonicalOrder: { ...value.productionUnit.canonicalOrder },
      orderItemId: value.productionUnit.orderItemId,
    },
    snapshot: {
      ...value.snapshot,
      provenance: cloneProvenance(value.snapshot.provenance),
    },
  });
}

function cloneCandidate(value: SupplierCandidate): SupplierCandidate {
  return deepFreeze({
    ...value,
    productionUnit: {
      canonicalOrder: { ...value.productionUnit.canonicalOrder },
      orderItemId: value.productionUnit.orderItemId,
    },
    provenance: cloneProvenance(value.provenance),
  });
}

function defaultAssignmentId(): string {
  return `supplier-assignment-${globalThis.crypto.randomUUID()}`;
}

function sameBindingRequest(
  left: SupplierAssignmentBinding,
  right: SupplierAssignmentRequest,
): boolean {
  return left.assignmentActionId === right.assignmentActionId
    && left.actorContextId === right.operatorAuthority.actorContextId
    && sameSupplierProductionUnit(left.productionUnit, right.productionUnit)
    && sameSupplierCandidateIdentity(left.selectedCandidate, right.selectedCandidate);
}

/**
 * Process-memory SupplierAssignment aggregate. It stores no Catalog/Order
 * copy, accepts only a server-resolved operator authority, and exposes no
 * browser or provider persistence seam.
 */
export class LocalMemoryLocalSupplierAssignmentRepository implements LocalSupplierAssignmentRepository {
  private readonly assignmentsByProductionUnit = new Map<string, SupplierAssignment>();
  private readonly bindingsByActionId = new Map<string, SupplierAssignmentBinding>();
  private readonly now: () => string;
  private readonly nextAssignmentId: () => string;
  private readonly failureInjector?: LocalMemoryLocalSupplierAssignmentRepositoryOptions["failureInjector"];

  constructor(options: LocalMemoryLocalSupplierAssignmentRepositoryOptions = {}) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.nextAssignmentId = options.nextAssignmentId ?? defaultAssignmentId;
    this.failureInjector = options.failureInjector;
  }

  commit(input: SupplierAssignmentRequest): SupplierAssignmentResult {
    const parsed = validateSupplierAssignmentRequest(input);
    if (!parsed.ok) return { status: "rejected", issues: parsed.issues };
    const request = parsed.value;
    if (!isSupplierAssignmentActionId(request.assignmentActionId)) {
      return failure("rejected", "invalid_format", "Assignment action identity is invalid.");
    }

    const existingBinding = this.bindingsByActionId.get(request.assignmentActionId);
    if (existingBinding) {
      if (!sameBindingRequest(existingBinding, request)) {
        return failure("conflict", "conflict", "Assignment action selector is already bound to different context.");
      }
      return { status: "replayed", assignment: cloneAssignment(existingBinding.assignment) };
    }

    if (request.candidateResult.status !== "eligible") {
      return failure("rejected", "missing_mapping", "Supplier assignment requires an eligible exact candidate.");
    }
    const candidateProductionUnit = {
      canonicalOrder: {
        internalOrderId: request.candidateResult.input.selection.internalOrderId,
        publicReference: request.candidateResult.input.selection.publicOrderReference,
      },
      orderItemId: request.candidateResult.input.selection.orderItemId,
    };
    if (!sameSupplierProductionUnit(candidateProductionUnit, request.productionUnit)) {
      return failure("unavailable", "ownership", "Supplier candidate is bound to a different production unit.");
    }
    const selected = request.candidateResult.candidates.find((candidate) =>
      sameSupplierCandidateIdentity(candidate, request.selectedCandidate)
      && sameSupplierProductionUnit(candidate.productionUnit, request.productionUnit));
    if (!selected) {
      return failure("rejected", "unavailable", "Selected supplier candidate is not eligible for this production unit.");
    }

    const productionUnitKey = supplierProductionUnitKey(request.productionUnit);
    if (this.assignmentsByProductionUnit.has(productionUnitKey)) {
      return failure("conflict", "conflict", "This production unit already has an active supplier assignment.");
    }

    const assignmentId = this.nextAssignmentId();
    if (typeof assignmentId !== "string" || assignmentId.trim().length === 0) {
      return failure("failed", "unavailable", "Supplier assignment identity could not be generated safely.");
    }
    const committedAt = this.now();
    const assignment = buildSupplierAssignmentFromCandidate(
      assignmentId,
      request,
      selected,
      committedAt,
    );
    const binding: SupplierAssignmentBinding = {
      assignmentActionId: request.assignmentActionId,
      actorContextId: request.operatorAuthority.actorContextId,
      productionUnit: request.productionUnit,
      selectedCandidate: cloneCandidate(selected),
      assignment,
    };

    try {
      this.failureInjector?.beforeCommit?.();
    } catch {
      return failure("failed", "unavailable", "Supplier assignment could not be committed.");
    }

    // One synchronous visible commit point for the assignment and binding.
    this.assignmentsByProductionUnit.set(productionUnitKey, assignment);
    this.bindingsByActionId.set(request.assignmentActionId, binding);
    return { status: "committed", assignment: cloneAssignment(assignment) };
  }

  findByProductionUnit(input: SupplierProductionUnitIdentity):
    | { readonly status: "found"; readonly assignment: SupplierAssignment }
    | { readonly status: "unavailable" } {
    const assignment = this.assignmentsByProductionUnit.get(supplierProductionUnitKey(input));
    return assignment ? { status: "found", assignment: cloneAssignment(assignment) } : { status: "unavailable" };
  }

  list(): readonly SupplierAssignment[] {
    return [...this.assignmentsByProductionUnit.values()].map(cloneAssignment);
  }

  getCountsForTests(): LocalSupplierAssignmentTestCounts {
    return {
      assignmentCount: this.assignmentsByProductionUnit.size,
      bindingCount: this.bindingsByActionId.size,
    };
  }
}
