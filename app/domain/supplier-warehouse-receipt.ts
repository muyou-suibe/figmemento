import {
  isSupplierOperatorAuthority,
  sameSupplierProductionUnit,
  type SupplierOperatorAuthority,
  type SupplierProductionUnitIdentity,
} from "./supplier-operations.ts";
import {
  cloneSupplierProductionOperation,
  cloneSupplierProductionTransitionResult,
  type SupplierProductionIssue,
  type SupplierProductionOperation,
  type SupplierProductionResult,
  type SupplierProductionTransitionResult,
} from "./supplier-production-lifecycle.ts";

export type WarehouseQcStatus = "pending" | "accepted" | "blocked";
export type WarehouseQcDecision = Exclude<WarehouseQcStatus, "pending">;

export const SUPPLIER_WAREHOUSE_NOTICE = "Development/test Shanghai Warehouse Receipt only." as const;

export interface WarehouseQuantityDiscrepancy {
  readonly kind: "quantity_discrepancy";
  readonly direction: "short" | "over";
  readonly expectedQuantity: number;
  readonly receivedQuantity: number;
}

export interface WarehouseQcFacts {
  readonly status: WarehouseQcStatus;
  readonly warehouseQcActionId: string | null;
  readonly evaluatedAt: string | null;
  readonly notes: string | null;
}

export interface WarehouseReceipt {
  readonly kind: "warehouse_receipt";
  readonly warehouseReceiptId: string;
  readonly warehouseReceiptActionId: string;
  readonly productionUnit: SupplierProductionUnitIdentity;
  readonly supplierAssignmentId: string;
  readonly supplierWorkOrderId: string;
  readonly supplierProductionOperationId: string;
  readonly receiptStatus: "received";
  readonly receivedAt: string;
  readonly expectedQuantity: number;
  readonly receivedQuantity: number;
  readonly discrepancy: WarehouseQuantityDiscrepancy | null;
  readonly damageReported: boolean;
  readonly notes: string | null;
  readonly qc: WarehouseQcFacts;
  readonly readyForOutbound: boolean;
  readonly notice: typeof SUPPLIER_WAREHOUSE_NOTICE;
}

export interface WarehouseReceiptActionInput {
  readonly warehouseReceiptActionId: string;
  readonly productionUnit: SupplierProductionUnitIdentity;
  /** Client-carried references are checked against fresh server state. */
  readonly supplierAssignmentId: string;
  readonly supplierWorkOrderId: string;
  readonly supplierProductionOperationId: string;
  readonly expectedQuantity: number;
  readonly receivedQuantity: number;
  readonly damageReported: boolean;
  readonly notes: string | null;
  readonly operatorAuthority: SupplierOperatorAuthority;
}

export interface WarehouseQcActionInput {
  readonly warehouseQcActionId: string;
  readonly productionUnit: SupplierProductionUnitIdentity;
  readonly warehouseReceiptId: string;
  readonly supplierAssignmentId: string;
  readonly supplierWorkOrderId: string;
  readonly supplierProductionOperationId: string;
  readonly qcDecision: WarehouseQcDecision;
  readonly notes: string | null;
  readonly operatorAuthority: SupplierOperatorAuthority;
}

export interface WarehouseOutboundActionInput {
  readonly warehouseOutboundActionId: string;
  readonly productionUnit: SupplierProductionUnitIdentity;
  readonly warehouseReceiptId: string;
  readonly supplierAssignmentId: string;
  readonly supplierWorkOrderId: string;
  readonly supplierProductionOperationId: string;
  readonly operatorAuthority: SupplierOperatorAuthority;
}

export type WarehouseReceiptAction = WarehouseReceiptActionInput;
export type WarehouseAction = WarehouseReceiptActionInput | WarehouseQcActionInput | WarehouseOutboundActionInput;

export type WarehouseActionBinding =
  | {
      readonly kind: "warehouse_receipt_action_binding";
      readonly action: WarehouseReceiptActionInput;
      readonly receipt: WarehouseReceipt;
      readonly operation: SupplierProductionOperation;
      readonly transition: SupplierProductionTransitionResult;
    }
  | {
      readonly kind: "warehouse_qc_action_binding";
      readonly action: WarehouseQcActionInput;
      readonly receipt: WarehouseReceipt;
      readonly operation: SupplierProductionOperation;
      readonly transition: SupplierProductionTransitionResult;
    }
  | {
      readonly kind: "warehouse_outbound_action_binding";
      readonly action: WarehouseOutboundActionInput;
      readonly receipt: WarehouseReceipt;
      readonly operation: SupplierProductionOperation;
      readonly transition: SupplierProductionTransitionResult;
      readonly projection: WarehouseOutboundProjection;
    };

export interface WarehouseOutboundProjection {
  readonly kind: "warehouse_outbound_projection";
  readonly productionUnit: SupplierProductionUnitIdentity;
  readonly supplierWorkOrderId: string;
  readonly warehouseReceiptId: string;
  readonly warehouseStatus: "ready_for_outbound";
  readonly qcAccepted: true;
  readonly readyForOutbound: true;
  readonly notice: typeof SUPPLIER_WAREHOUSE_NOTICE;
}

export type WarehouseReceiptMutationResult =
  | {
      readonly status: "committed" | "replayed";
      readonly receipt: WarehouseReceipt;
      readonly operation: SupplierProductionOperation;
      readonly transition: SupplierProductionTransitionResult;
    }
  | {
      readonly status: "rejected" | "conflict" | "unavailable" | "failed";
      readonly issues: readonly SupplierProductionIssue[];
    };

export type WarehouseQcMutationResult = WarehouseReceiptMutationResult;

export type WarehouseOutboundMutationResult =
  | {
      readonly status: "committed" | "replayed";
      readonly receipt: WarehouseReceipt;
      readonly operation: SupplierProductionOperation;
      readonly transition: SupplierProductionTransitionResult;
      readonly projection: WarehouseOutboundProjection;
    }
  | {
      readonly status: "rejected" | "conflict" | "unavailable" | "failed";
      readonly issues: readonly SupplierProductionIssue[];
    };

const ACTION_ID_PATTERN = /^[A-Za-z0-9_-]{16,200}$/;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const MAX_NOTE_LENGTH = 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function issue(
  code: SupplierProductionIssue["code"],
  message: string,
  path = "$",
): SupplierProductionIssue {
  return { path, code, message };
}

function failure<T = never>(...issues: SupplierProductionIssue[]): SupplierProductionResult<T> {
  return { ok: false, issues };
}

function success<T>(value: T): SupplierProductionResult<T> {
  return { ok: true, value };
}

function hasOnlyFields(value: Record<string, unknown>, allowed: ReadonlySet<string>): SupplierProductionIssue[] {
  return Object.keys(value)
    .filter((field) => !allowed.has(field))
    .map((field) => issue("invalid_format", "Field is not part of the Warehouse Receipt contract.", `$.${field}`));
}

function isNonEmptyIdentifier(value: unknown): value is string {
  return typeof value === "string" && IDENTIFIER_PATTERN.test(value);
}

function isActionId(value: unknown): value is string {
  return typeof value === "string"
    && ACTION_ID_PATTERN.test(value)
    && !value.includes("@")
    && !value.startsWith("FM-");
}

function isQuantity(value: unknown, allowZero: boolean): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && (allowZero ? value >= 0 : value > 0);
}

function isSafeNotes(value: unknown): value is string | null {
  if (value === null || value === undefined) return value === null || value === undefined;
  return typeof value === "string"
    && value.length <= MAX_NOTE_LENGTH
    && !/[<>]/.test(value)
    && !/(?:https?|ftp):\/\//i.test(value)
    && !/(?:token|secret|cookie|password|authorization)\s*[:=]/i.test(value);
}

function isValidProductionUnit(value: unknown): value is SupplierProductionUnitIdentity {
  if (!isRecord(value) || !isRecord(value.canonicalOrder)) return false;
  return isNonEmptyIdentifier(value.canonicalOrder.internalOrderId)
    && typeof value.canonicalOrder.publicReference === "string"
    && value.canonicalOrder.publicReference.startsWith("FM-LOCAL-")
    && isNonEmptyIdentifier(value.orderItemId);
}

function parseCommonAction(
  value: unknown,
  allowedFields: ReadonlySet<string>,
  actionIdField: string,
): { readonly value: Record<string, unknown>; readonly issues: SupplierProductionIssue[] } | null {
  if (!isRecord(value)) return { value: {}, issues: [issue("invalid_type", "Warehouse action must be an object.")] };
  const issues = hasOnlyFields(value, allowedFields);
  if (!isActionId(value[actionIdField])) issues.push(issue("invalid_format", "Warehouse action identity is invalid.", `$.${actionIdField}`));
  if (!isValidProductionUnit(value.productionUnit)) issues.push(issue("invalid_identity", "Production unit identity is invalid.", "$.productionUnit"));
  if (!isNonEmptyIdentifier(value.supplierAssignmentId)) issues.push(issue("invalid_identity", "Supplier assignment identity is invalid.", "$.supplierAssignmentId"));
  if (!isNonEmptyIdentifier(value.supplierWorkOrderId)) issues.push(issue("invalid_identity", "SupplierWorkOrder identity is invalid.", "$.supplierWorkOrderId"));
  if (!isNonEmptyIdentifier(value.supplierProductionOperationId)) issues.push(issue("invalid_identity", "Supplier Production operation identity is invalid.", "$.supplierProductionOperationId"));
  if (!isSupplierOperatorAuthority(value.operatorAuthority)) issues.push(issue("unauthorized", "Separate server-only operator authority is required.", "$.operatorAuthority"));
  return { value, issues };
}

export function validateWarehouseReceiptAction(value: unknown): SupplierProductionResult<WarehouseReceiptActionInput> {
  const parsed = parseCommonAction(
    value,
    new Set([
      "warehouseReceiptActionId",
      "productionUnit",
      "supplierAssignmentId",
      "supplierWorkOrderId",
      "supplierProductionOperationId",
      "expectedQuantity",
      "receivedQuantity",
      "damageReported",
      "notes",
      "operatorAuthority",
    ]),
    "warehouseReceiptActionId",
  );
  if (!parsed) return failure(issue("invalid_type", "Warehouse Receipt action must be an object."));
  const { value: input, issues } = parsed;
  if (!isQuantity(input.expectedQuantity, false)) issues.push(issue("invalid_quantity", "Expected quantity must be a positive integer.", "$.expectedQuantity"));
  if (!isQuantity(input.receivedQuantity, false)) issues.push(issue("invalid_quantity", "Received quantity must be a positive integer.", "$.receivedQuantity"));
  if (typeof input.damageReported !== "boolean") issues.push(issue("invalid_format", "Damage flag is invalid.", "$.damageReported"));
  if (!isSafeNotes(input.notes)) issues.push(issue("invalid_notes", "Warehouse notes are not valid bounded operational text.", "$.notes"));
  if (issues.length > 0) return failure(...issues);
  return success({
    warehouseReceiptActionId: input.warehouseReceiptActionId as string,
    productionUnit: input.productionUnit as SupplierProductionUnitIdentity,
    supplierAssignmentId: input.supplierAssignmentId as string,
    supplierWorkOrderId: input.supplierWorkOrderId as string,
    supplierProductionOperationId: input.supplierProductionOperationId as string,
    expectedQuantity: input.expectedQuantity as number,
    receivedQuantity: input.receivedQuantity as number,
    damageReported: input.damageReported as boolean,
    notes: input.notes === undefined ? null : input.notes as string | null,
    operatorAuthority: input.operatorAuthority as SupplierOperatorAuthority,
  });
}

export function validateWarehouseQcAction(value: unknown): SupplierProductionResult<WarehouseQcActionInput> {
  const parsed = parseCommonAction(
    value,
    new Set([
      "warehouseQcActionId",
      "productionUnit",
      "warehouseReceiptId",
      "supplierAssignmentId",
      "supplierWorkOrderId",
      "supplierProductionOperationId",
      "qcDecision",
      "notes",
      "operatorAuthority",
    ]),
    "warehouseQcActionId",
  );
  if (!parsed) return failure(issue("invalid_type", "Warehouse QC action must be an object."));
  const { value: input, issues } = parsed;
  if (!isNonEmptyIdentifier(input.warehouseReceiptId)) issues.push(issue("invalid_identity", "Warehouse Receipt identity is invalid.", "$.warehouseReceiptId"));
  if (input.qcDecision !== "accepted" && input.qcDecision !== "blocked") issues.push(issue("invalid_state", "Warehouse QC decision is invalid.", "$.qcDecision"));
  if (!isSafeNotes(input.notes)) issues.push(issue("invalid_notes", "Warehouse QC notes are not valid bounded operational text.", "$.notes"));
  if (issues.length > 0) return failure(...issues);
  return success({
    warehouseQcActionId: input.warehouseQcActionId as string,
    productionUnit: input.productionUnit as SupplierProductionUnitIdentity,
    warehouseReceiptId: input.warehouseReceiptId as string,
    supplierAssignmentId: input.supplierAssignmentId as string,
    supplierWorkOrderId: input.supplierWorkOrderId as string,
    supplierProductionOperationId: input.supplierProductionOperationId as string,
    qcDecision: input.qcDecision as WarehouseQcDecision,
    notes: input.notes === undefined ? null : input.notes as string | null,
    operatorAuthority: input.operatorAuthority as SupplierOperatorAuthority,
  });
}

export function validateWarehouseOutboundAction(value: unknown): SupplierProductionResult<WarehouseOutboundActionInput> {
  const parsed = parseCommonAction(
    value,
    new Set([
      "warehouseOutboundActionId",
      "productionUnit",
      "warehouseReceiptId",
      "supplierAssignmentId",
      "supplierWorkOrderId",
      "supplierProductionOperationId",
      "operatorAuthority",
    ]),
    "warehouseOutboundActionId",
  );
  if (!parsed) return failure(issue("invalid_type", "Warehouse outbound action must be an object."));
  const { value: input, issues } = parsed;
  if (!isNonEmptyIdentifier(input.warehouseReceiptId)) issues.push(issue("invalid_identity", "Warehouse Receipt identity is invalid.", "$.warehouseReceiptId"));
  if (issues.length > 0) return failure(...issues);
  return success({
    warehouseOutboundActionId: input.warehouseOutboundActionId as string,
    productionUnit: input.productionUnit as SupplierProductionUnitIdentity,
    warehouseReceiptId: input.warehouseReceiptId as string,
    supplierAssignmentId: input.supplierAssignmentId as string,
    supplierWorkOrderId: input.supplierWorkOrderId as string,
    supplierProductionOperationId: input.supplierProductionOperationId as string,
    operatorAuthority: input.operatorAuthority as SupplierOperatorAuthority,
  });
}

export function sameWarehouseReceiptAction(left: WarehouseReceiptActionInput, right: WarehouseReceiptActionInput): boolean {
  return left.warehouseReceiptActionId === right.warehouseReceiptActionId
    && sameSupplierProductionUnit(left.productionUnit, right.productionUnit)
    && left.supplierAssignmentId === right.supplierAssignmentId
    && left.supplierWorkOrderId === right.supplierWorkOrderId
    && left.supplierProductionOperationId === right.supplierProductionOperationId
    && left.expectedQuantity === right.expectedQuantity
    && left.receivedQuantity === right.receivedQuantity
    && left.damageReported === right.damageReported
    && left.notes === right.notes
    && left.operatorAuthority.actorContextId === right.operatorAuthority.actorContextId;
}

export function sameWarehouseQcAction(left: WarehouseQcActionInput, right: WarehouseQcActionInput): boolean {
  return left.warehouseQcActionId === right.warehouseQcActionId
    && sameSupplierProductionUnit(left.productionUnit, right.productionUnit)
    && left.warehouseReceiptId === right.warehouseReceiptId
    && left.supplierAssignmentId === right.supplierAssignmentId
    && left.supplierWorkOrderId === right.supplierWorkOrderId
    && left.supplierProductionOperationId === right.supplierProductionOperationId
    && left.qcDecision === right.qcDecision
    && left.notes === right.notes
    && left.operatorAuthority.actorContextId === right.operatorAuthority.actorContextId;
}

export function sameWarehouseOutboundAction(left: WarehouseOutboundActionInput, right: WarehouseOutboundActionInput): boolean {
  return left.warehouseOutboundActionId === right.warehouseOutboundActionId
    && sameSupplierProductionUnit(left.productionUnit, right.productionUnit)
    && left.warehouseReceiptId === right.warehouseReceiptId
    && left.supplierAssignmentId === right.supplierAssignmentId
    && left.supplierWorkOrderId === right.supplierWorkOrderId
    && left.supplierProductionOperationId === right.supplierProductionOperationId
    && left.operatorAuthority.actorContextId === right.operatorAuthority.actorContextId;
}

export function warehouseReceiptDiscrepancy(expectedQuantity: number, receivedQuantity: number): WarehouseQuantityDiscrepancy | null {
  if (expectedQuantity === receivedQuantity) return null;
  return {
    kind: "quantity_discrepancy",
    direction: receivedQuantity < expectedQuantity ? "short" : "over",
    expectedQuantity,
    receivedQuantity,
  };
}

export function buildWarehouseReceipt(input: {
  readonly warehouseReceiptId: string;
  readonly action: WarehouseReceiptActionInput;
  readonly supplierProductionOperationId: string;
  readonly receivedAt: string;
}): WarehouseReceipt {
  return deepFreeze({
    kind: "warehouse_receipt" as const,
    warehouseReceiptId: input.warehouseReceiptId,
    warehouseReceiptActionId: input.action.warehouseReceiptActionId,
    productionUnit: cloneProductionUnit(input.action.productionUnit),
    supplierAssignmentId: input.action.supplierAssignmentId,
    supplierWorkOrderId: input.action.supplierWorkOrderId,
    supplierProductionOperationId: input.supplierProductionOperationId,
    receiptStatus: "received" as const,
    receivedAt: input.receivedAt,
    expectedQuantity: input.action.expectedQuantity,
    receivedQuantity: input.action.receivedQuantity,
    discrepancy: warehouseReceiptDiscrepancy(input.action.expectedQuantity, input.action.receivedQuantity),
    damageReported: input.action.damageReported,
    notes: input.action.notes,
    qc: {
      status: "pending" as const,
      warehouseQcActionId: null,
      evaluatedAt: null,
      notes: null,
    },
    readyForOutbound: false,
    notice: SUPPLIER_WAREHOUSE_NOTICE,
  });
}

export function cloneWarehouseReceipt(value: WarehouseReceipt): WarehouseReceipt {
  return deepFreeze({
    ...value,
    productionUnit: cloneProductionUnit(value.productionUnit),
    discrepancy: value.discrepancy ? { ...value.discrepancy } : null,
    qc: { ...value.qc },
  });
}

export function cloneWarehouseOutboundProjection(value: WarehouseOutboundProjection): WarehouseOutboundProjection {
  return deepFreeze({ ...value, productionUnit: cloneProductionUnit(value.productionUnit) });
}

export function cloneWarehouseActionBinding(value: WarehouseActionBinding): WarehouseActionBinding {
  if (value.kind === "warehouse_receipt_action_binding") {
    return deepFreeze({
      ...value,
      action: cloneWarehouseReceiptAction(value.action),
      receipt: cloneWarehouseReceipt(value.receipt),
      operation: cloneSupplierProductionOperation(value.operation),
      transition: cloneSupplierProductionTransitionResult(value.transition),
    });
  }
  if (value.kind === "warehouse_qc_action_binding") {
    return deepFreeze({
      ...value,
      action: cloneWarehouseQcAction(value.action),
      receipt: cloneWarehouseReceipt(value.receipt),
      operation: cloneSupplierProductionOperation(value.operation),
      transition: cloneSupplierProductionTransitionResult(value.transition),
    });
  }
  return deepFreeze({
    ...value,
    action: cloneWarehouseOutboundAction(value.action),
    receipt: cloneWarehouseReceipt(value.receipt),
    operation: cloneSupplierProductionOperation(value.operation),
    transition: cloneSupplierProductionTransitionResult(value.transition),
    projection: cloneWarehouseOutboundProjection(value.projection),
  });
}

export function cloneWarehouseMutationResult(value: WarehouseReceiptMutationResult): WarehouseReceiptMutationResult {
  if (value.status !== "committed" && value.status !== "replayed") return value;
  return {
    status: value.status,
    receipt: cloneWarehouseReceipt(value.receipt),
    operation: cloneSupplierProductionOperation(value.operation),
    transition: cloneSupplierProductionTransitionResult(value.transition),
  };
}

export function cloneWarehouseOutboundMutationResult(value: WarehouseOutboundMutationResult): WarehouseOutboundMutationResult {
  if (value.status !== "committed" && value.status !== "replayed") return value;
  return {
    status: value.status,
    receipt: cloneWarehouseReceipt(value.receipt),
    operation: cloneSupplierProductionOperation(value.operation),
    transition: cloneSupplierProductionTransitionResult(value.transition),
    projection: cloneWarehouseOutboundProjection(value.projection),
  };
}

function cloneProductionUnit(value: SupplierProductionUnitIdentity): SupplierProductionUnitIdentity {
  return {
    canonicalOrder: { ...value.canonicalOrder },
    orderItemId: value.orderItemId,
  };
}

function cloneWarehouseReceiptAction(value: WarehouseReceiptActionInput): WarehouseReceiptActionInput {
  return deepFreeze({ ...value, productionUnit: cloneProductionUnit(value.productionUnit), operatorAuthority: { ...value.operatorAuthority } });
}

function cloneWarehouseQcAction(value: WarehouseQcActionInput): WarehouseQcActionInput {
  return deepFreeze({ ...value, productionUnit: cloneProductionUnit(value.productionUnit), operatorAuthority: { ...value.operatorAuthority } });
}

function cloneWarehouseOutboundAction(value: WarehouseOutboundActionInput): WarehouseOutboundActionInput {
  return deepFreeze({ ...value, productionUnit: cloneProductionUnit(value.productionUnit), operatorAuthority: { ...value.operatorAuthority } });
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  return value;
}
