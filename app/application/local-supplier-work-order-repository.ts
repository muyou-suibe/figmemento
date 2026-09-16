import type {
  SupplierWorkOrder,
  SupplierWorkOrderCommitRequest,
  SupplierWorkOrderCommitResult,
  SupplierWorkOrderCreateRequest,
  SupplierWorkOrderIssue,
} from "../domain/supplier-work-order.ts";
import type { SupplierProductionUnitIdentity } from "../domain/supplier-operations.ts";

export interface LocalSupplierWorkOrderCommitFailureInjector {
  readonly beforeCommit?: () => void;
}

export interface LocalMemoryLocalSupplierWorkOrderRepositoryOptions {
  readonly now?: () => string;
  readonly nextWorkOrderId?: () => string;
  readonly failureInjector?: LocalSupplierWorkOrderCommitFailureInjector;
}

export interface LocalSupplierWorkOrderTestCounts {
  readonly workOrderCount: number;
  readonly bindingCount: number;
}

export interface LocalSupplierWorkOrderRepository {
  findByActionId(actionId: string):
    | { readonly status: "found"; readonly workOrder: SupplierWorkOrder }
    | { readonly status: "unavailable" };
  findByProductionUnit(input: SupplierProductionUnitIdentity):
    | { readonly status: "found"; readonly workOrder: SupplierWorkOrder }
    | { readonly status: "unavailable" };
  commit(input: SupplierWorkOrderCommitRequest): SupplierWorkOrderCommitResult;
  list?(): readonly SupplierWorkOrder[];
}

export type LocalSupplierWorkOrderServiceFailure = {
  readonly status: "invalid" | "unavailable" | "conflict" | "rejected";
  readonly issues: readonly SupplierWorkOrderIssue[];
};

export type LocalSupplierWorkOrderServiceResult =
  | LocalSupplierWorkOrderServiceFailure
  | { readonly status: "committed" | "replayed"; readonly workOrder: SupplierWorkOrder };

export type { SupplierWorkOrderCreateRequest };
