import { isLocalOrderPublicReference } from "./local-order.ts";
import {
  isSupplierOperatorAuthority,
  sameSupplierProductionUnit,
  supplierProductionUnitKey,
  type SupplierOperatorAuthority,
  type SupplierProductionUnitIdentity,
} from "./supplier-operations.ts";
import type { LocalFulfillmentStatus } from "./local-fulfillment.ts";

export const SUPPLIER_PRODUCTION_LIFECYCLE = [
  "unassigned",
  "assigned",
  "work_order_ready",
  "submitted_to_supplier",
  "supplier_confirmed",
  "in_production",
  "supplier_completed",
  "en_route_to_warehouse",
  "warehouse_received",
  "warehouse_qc",
  "ready_for_outbound",
] as const;

export type { SupplierProductionUnitIdentity };

export type SupplierProductionLifecycleStatus = typeof SUPPLIER_PRODUCTION_LIFECYCLE[number];

export type SupplierProductionValidationCode =
  | "invalid_type"
  | "invalid_format"
  | "invalid_identity"
  | "invalid_transition"
  | "invalid_state"
  | "stale"
  | "terminal"
  | "unauthorized"
  | "runtime_disabled"
  | "order_unavailable"
  | "unpaid"
  | "payment_not_succeeded"
  | "assignment_unavailable"
  | "assignment_ownership_mismatch"
  | "work_order_unavailable"
  | "work_order_ownership_mismatch"
  | "fulfillment_unavailable"
  | "customer_production_not_started"
  | "warehouse_evidence_required"
  | "warehouse_receipt_unavailable"
  | "warehouse_receipt_ownership_mismatch"
  | "warehouse_qc_required"
  | "warehouse_qc_blocked"
  | "warehouse_qc_unavailable"
  | "invalid_quantity"
  | "invalid_notes"
  | "conflict"
  | "unavailable";

export interface SupplierProductionIssue {
  readonly path: string;
  readonly code: SupplierProductionValidationCode;
  readonly message: string;
}

export type SupplierProductionResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly SupplierProductionIssue[] };

export interface SupplierProductionActionInput {
  readonly supplierOperationActionId: string;
  readonly productionUnit: SupplierProductionUnitIdentity;
  /** A client may provide an expected state, but it is never authoritative. */
  readonly expectedCurrentStatus: SupplierProductionLifecycleStatus;
  readonly nextStatus: SupplierProductionLifecycleStatus;
  /** Server-resolved operator authority; browser/customer authority is invalid. */
  readonly operatorAuthority: SupplierOperatorAuthority;
}

export interface SupplierProductionTransitionRecord {
  readonly kind: "supplier_production_transition";
  readonly fromStatus: SupplierProductionLifecycleStatus;
  readonly toStatus: SupplierProductionLifecycleStatus;
  readonly supplierOperationActionId: string;
  readonly operatorContextId: string;
  readonly committedAt: string;
}

export const SUPPLIER_PRODUCTION_NOTICE = "Development/test Supplier Production Operations only." as const;

export interface SupplierProductionOperation {
  readonly kind: "supplier_production_operation";
  readonly operationId: string;
  readonly productionUnit: SupplierProductionUnitIdentity;
  readonly assignmentId: string;
  readonly workOrderId: string | null;
  readonly currentStatus: SupplierProductionLifecycleStatus;
  readonly history: readonly SupplierProductionTransitionRecord[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly notice: typeof SUPPLIER_PRODUCTION_NOTICE;
}

export interface SupplierProductionTransitionResult {
  readonly kind: "supplier_production_transition_result";
  readonly productionUnit: SupplierProductionUnitIdentity;
  readonly fromStatus: SupplierProductionLifecycleStatus;
  readonly status: SupplierProductionLifecycleStatus;
  readonly supplierOperationActionId: string;
  readonly committedAt: string;
  readonly notice: typeof SUPPLIER_PRODUCTION_NOTICE;
}

export interface SupplierProductionActionBinding {
  readonly action: SupplierProductionActionInput;
  readonly assignmentId: string;
  readonly workOrderId: string | null;
  readonly result: SupplierProductionTransitionResult;
  readonly operation: SupplierProductionOperation;
}

export interface SupplierProductionCommitInput {
  readonly action: SupplierProductionActionInput;
  readonly assignmentId: string | null;
  readonly workOrderId: string | null;
  readonly fulfillmentStatus: LocalFulfillmentStatus | null;
}

export type SupplierProductionCommitResult =
  | {
      readonly status: "committed" | "replayed";
      readonly operation: SupplierProductionOperation;
      readonly result: SupplierProductionTransitionResult;
    }
  | {
      readonly status: "rejected" | "conflict" | "unavailable" | "failed";
      readonly issues: readonly SupplierProductionIssue[];
    };

const ACTION_ID_PATTERN = /^[A-Za-z0-9_-]{16,200}$/;

function issue(
  code: SupplierProductionValidationCode,
  message: string,
  path = "$",
): SupplierProductionIssue {
  return { path, code, message };
}

function failure<T = never>(...issues: SupplierProductionIssue[]): SupplierProductionResult<T> {
  return { ok: false, issues };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isSupplierProductionLifecycleStatus(value: unknown): value is SupplierProductionLifecycleStatus {
  return typeof value === "string"
    && (SUPPLIER_PRODUCTION_LIFECYCLE as readonly string[]).includes(value);
}

export function isSupplierProductionOperationActionId(value: unknown): value is string {
  return typeof value === "string"
    && ACTION_ID_PATTERN.test(value)
    && !value.includes("@")
    && !isLocalOrderPublicReference(value);
}

export function supplierProductionIssue(
  code: SupplierProductionValidationCode,
  message: string,
  path = "$",
): SupplierProductionIssue {
  return issue(code, message, path);
}

export function supplierProductionOperationKey(input: SupplierProductionUnitIdentity): string {
  return supplierProductionUnitKey(input);
}

export function supplierProductionStatusIndex(status: SupplierProductionLifecycleStatus): number {
  return SUPPLIER_PRODUCTION_LIFECYCLE.indexOf(status);
}

export function evaluateSupplierProductionTransition(
  currentStatus: SupplierProductionLifecycleStatus,
  nextStatus: SupplierProductionLifecycleStatus,
): SupplierProductionResult<true> {
  if (currentStatus === "ready_for_outbound") {
    return failure(issue("terminal", "Ready-for-outbound is terminal for Supplier Production Operations."));
  }
  if (!isSupplierProductionLifecycleStatus(nextStatus)) {
    return failure(issue("invalid_state", "Supplier Production Operations state is invalid."));
  }
  if (supplierProductionStatusIndex(nextStatus) !== supplierProductionStatusIndex(currentStatus) + 1) {
    return failure(issue("invalid_transition", "Only the next consecutive Supplier Production Operations state is allowed."));
  }
  return { ok: true, value: true };
}

export function sameSupplierProductionAction(
  left: SupplierProductionActionInput,
  right: SupplierProductionActionInput,
): boolean {
  return left.supplierOperationActionId === right.supplierOperationActionId
    && sameSupplierProductionUnit(left.productionUnit, right.productionUnit)
    && left.expectedCurrentStatus === right.expectedCurrentStatus
    && left.nextStatus === right.nextStatus
    && left.operatorAuthority.actorKind === right.operatorAuthority.actorKind
    && left.operatorAuthority.actorContextId === right.operatorAuthority.actorContextId;
}

export function validateSupplierProductionAction(
  value: unknown,
): SupplierProductionResult<SupplierProductionActionInput> {
  if (!isRecord(value)) return failure(issue("invalid_type", "Supplier Production action must be an object."));
  const allowedFields = new Set([
    "supplierOperationActionId",
    "productionUnit",
    "expectedCurrentStatus",
    "nextStatus",
    "operatorAuthority",
  ]);
  const issues: SupplierProductionIssue[] = [];
  for (const field of Object.keys(value)) {
    if (!allowedFields.has(field)) {
      issues.push(issue("invalid_format", "Field is not part of the Supplier Production action contract.", `$.${field}`));
    }
  }

  const productionUnitValue = value.productionUnit;
  if (!isRecord(productionUnitValue)) {
    issues.push(issue("invalid_identity", "Production unit identity is invalid.", "$.productionUnit"));
  } else {
    const canonicalOrder = productionUnitValue.canonicalOrder;
    if (!isRecord(canonicalOrder)
      || typeof canonicalOrder.internalOrderId !== "string"
      || canonicalOrder.internalOrderId.trim().length === 0
      || !isLocalOrderPublicReference(canonicalOrder.publicReference)
      || typeof productionUnitValue.orderItemId !== "string"
      || productionUnitValue.orderItemId.trim().length === 0) {
      issues.push(issue("invalid_identity", "Production unit identity is invalid.", "$.productionUnit"));
    }
  }
  if (!isSupplierProductionOperationActionId(value.supplierOperationActionId)) {
    issues.push(issue("invalid_format", "Supplier operation action identity is invalid.", "$.supplierOperationActionId"));
  }
  if (!isSupplierProductionLifecycleStatus(value.expectedCurrentStatus)) {
    issues.push(issue("invalid_state", "Expected Supplier Production state is invalid.", "$.expectedCurrentStatus"));
  }
  if (!isSupplierProductionLifecycleStatus(value.nextStatus)) {
    issues.push(issue("invalid_state", "Next Supplier Production state is invalid.", "$.nextStatus"));
  }
  if (!isSupplierOperatorAuthority(value.operatorAuthority)) {
    issues.push(issue("unauthorized", "Separate server-only operator authority is required.", "$.operatorAuthority"));
  }
  if (issues.length > 0) return failure(...issues);

  const productionUnit = productionUnitValue as SupplierProductionUnitIdentity;
  return {
    ok: true,
    value: {
      supplierOperationActionId: value.supplierOperationActionId as string,
      productionUnit: {
        canonicalOrder: { ...productionUnit.canonicalOrder },
        orderItemId: productionUnit.orderItemId,
      },
      expectedCurrentStatus: value.expectedCurrentStatus as SupplierProductionLifecycleStatus,
      nextStatus: value.nextStatus as SupplierProductionLifecycleStatus,
      operatorAuthority: value.operatorAuthority as SupplierOperatorAuthority,
    },
  };
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  return value;
}

export function cloneSupplierProductionOperation(value: SupplierProductionOperation): SupplierProductionOperation {
  return deepFreeze({
    ...value,
    productionUnit: {
      canonicalOrder: { ...value.productionUnit.canonicalOrder },
      orderItemId: value.productionUnit.orderItemId,
    },
    history: value.history.map((entry) => ({ ...entry })),
  });
}

export function cloneSupplierProductionTransitionResult(
  value: SupplierProductionTransitionResult,
): SupplierProductionTransitionResult {
  return deepFreeze({
    ...value,
    productionUnit: {
      canonicalOrder: { ...value.productionUnit.canonicalOrder },
      orderItemId: value.productionUnit.orderItemId,
    },
  });
}

export function cloneSupplierProductionActionBinding(
  value: SupplierProductionActionBinding,
): SupplierProductionActionBinding {
  return deepFreeze({
    ...value,
    action: {
      ...value.action,
      productionUnit: {
        canonicalOrder: { ...value.action.productionUnit.canonicalOrder },
        orderItemId: value.action.productionUnit.orderItemId,
      },
      operatorAuthority: { ...value.action.operatorAuthority },
    },
    result: cloneSupplierProductionTransitionResult(value.result),
    operation: cloneSupplierProductionOperation(value.operation),
  });
}
