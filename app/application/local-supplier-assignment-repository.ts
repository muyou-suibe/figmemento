import type {
  SupplierAssignment,
  SupplierAssignmentRequest,
  SupplierAssignmentResult,
  SupplierProductionUnitIdentity,
} from "../domain/supplier-operations.ts";

export interface LocalSupplierAssignmentCommitFailureInjector {
  readonly beforeCommit?: () => void;
}

export interface LocalMemoryLocalSupplierAssignmentRepositoryOptions {
  readonly now?: () => string;
  readonly nextAssignmentId?: () => string;
  readonly failureInjector?: LocalSupplierAssignmentCommitFailureInjector;
}

export interface LocalSupplierAssignmentTestCounts {
  readonly assignmentCount: number;
  readonly bindingCount: number;
}

export interface LocalSupplierAssignmentRepository {
  commit(input: SupplierAssignmentRequest): SupplierAssignmentResult;
  findByProductionUnit(input: SupplierProductionUnitIdentity):
    | { readonly status: "found"; readonly assignment: SupplierAssignment }
    | { readonly status: "unavailable" };
  list?(): readonly SupplierAssignment[];
}
