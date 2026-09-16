import type {
  SupplierProductionActionBinding,
  SupplierProductionCommitInput,
  SupplierProductionCommitResult,
  SupplierProductionOperation,
  SupplierProductionIssue,
  SupplierProductionUnitIdentity,
} from "../domain/supplier-production-lifecycle.ts";
import type {
  WarehouseActionBinding,
  WarehouseOutboundActionInput,
  WarehouseOutboundMutationResult,
  WarehouseQcActionInput,
  WarehouseReceipt,
  WarehouseReceiptActionInput,
  WarehouseReceiptMutationResult,
} from "../domain/supplier-warehouse-receipt.ts";

export interface LocalSupplierProductionCommitFailureInjector {
  readonly beforeCommit?: () => void;
}

export interface LocalMemoryLocalSupplierProductionRepositoryOptions {
  readonly now?: () => string;
  readonly nextOperationId?: () => string;
  readonly nextWarehouseReceiptId?: () => string;
  readonly failureInjector?: LocalSupplierProductionCommitFailureInjector;
}

export interface LocalSupplierProductionTestCounts {
  readonly operationCount: number;
  readonly bindingCount: number;
  readonly historyCount: number;
}

export interface LocalSupplierWarehouseTestCounts {
  readonly receiptCount: number;
  readonly receiptBindingCount: number;
  readonly qcBindingCount: number;
  readonly outboundBindingCount: number;
}

export type LocalSupplierWarehouseActionLookup =
  | { readonly status: "found"; readonly binding: WarehouseActionBinding }
  | { readonly status: "unavailable" };

export interface LocalSupplierProductionRepository {
  findByActionId(actionId: string):
    | { readonly status: "found"; readonly binding: SupplierProductionActionBinding }
    | { readonly status: "unavailable" };
  findByProductionUnit(input: SupplierProductionUnitIdentity):
    | { readonly status: "found"; readonly operation: SupplierProductionOperation }
    | { readonly status: "unavailable" };
  list?(): readonly SupplierProductionOperation[];
  commit(input: SupplierProductionCommitInput): SupplierProductionCommitResult;
  findWarehouseActionById(actionId: string): LocalSupplierWarehouseActionLookup;
  findWarehouseReceiptByProductionUnit(input: SupplierProductionUnitIdentity):
    | { readonly status: "found"; readonly receipt: WarehouseReceipt }
    | { readonly status: "unavailable" };
  listWarehouseReceipts?(): readonly WarehouseReceipt[];
  commitWarehouseReceipt(input: WarehouseReceiptActionInput): WarehouseReceiptMutationResult;
  commitWarehouseQc(input: WarehouseQcActionInput): WarehouseReceiptMutationResult;
  commitWarehouseOutbound(input: WarehouseOutboundActionInput): WarehouseOutboundMutationResult;
  getCountsForTests?(): LocalSupplierProductionTestCounts;
  getWarehouseCountsForTests?(): LocalSupplierWarehouseTestCounts;
}

export type LocalSupplierProductionServiceFailure = {
  readonly status: "invalid" | "unavailable" | "conflict" | "rejected";
  readonly issues: readonly SupplierProductionIssue[];
};

export type LocalSupplierProductionServiceResult =
  | LocalSupplierProductionServiceFailure
  | {
      readonly status: "committed" | "replayed";
      readonly operation: SupplierProductionOperation;
      readonly result: import("../domain/supplier-production-lifecycle.ts").SupplierProductionTransitionResult;
    };
