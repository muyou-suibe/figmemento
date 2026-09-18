import type {
  ImmutableConfiguredItemOrderSnapshot,
  LocalConfiguredItemReadPort,
} from "../application/local-configured-item-read-port.ts";
import type {
  LocalFulfillmentAggregateReadResult,
  LocalFulfillmentStatus,
} from "../application/local-fulfillment-repository.ts";
import type { LocalOrderReadResult } from "../application/local-order-repository.ts";
import type { LocalOrderLineSnapshot, LocalOrderSnapshot } from "./local-order.ts";
import type {
  SupplierAssignment,
  SupplierAssignmentSnapshot,
  SupplierOperatorAuthority,
  SupplierProductionUnitIdentity,
} from "./supplier-operations.ts";
import {
  isSupplierOperatorAuthority,
  sameSupplierProductionUnit,
  supplierProductionUnitKey,
  validateSupplierProductionUnitIdentity,
} from "./supplier-operations.ts";
import type { LocalFulfillmentState } from "./local-fulfillment.ts";
import type {
  CustomizationCropRegion,
  CustomizationImageValue,
  CustomizationSingleSelectValue,
  CustomizationTextValue,
  CustomizationNumericValue,
  CustomizationGenericFileValue,
  CustomizationValues,
} from "./customization-value.ts";

export type SupplierWorkOrderValidationCode =
  | "invalid_type"
  | "invalid_format"
  | "invalid_identity"
  | "order_unavailable"
  | "unpaid"
  | "payment_not_succeeded"
  | "configured_item_unavailable"
  | "assignment_unavailable"
  | "assignment_ownership_mismatch"
  | "fulfillment_unavailable"
  | "preview_not_approved"
  | "unauthorized"
  | "conflict"
  | "unavailable";

export interface SupplierWorkOrderIssue {
  readonly path: string;
  readonly code: SupplierWorkOrderValidationCode;
  readonly message: string;
}

export type SupplierWorkOrderResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly SupplierWorkOrderIssue[] };

export type SupplierWorkOrderFulfillmentStatus = Extract<
  LocalFulfillmentStatus,
  "preview_approved" | "in_production" | "quality_check"
>;

/** Fresh server-owned resolution of one Local Order item. */
export type SupplierWorkOrderConfiguredItem = ImmutableConfiguredItemOrderSnapshot;

export type SupplierWorkOrderConfiguredItemReadResult =
  | { readonly status: "found"; readonly item: SupplierWorkOrderConfiguredItem }
  | { readonly status: "unavailable" };

export interface SupplierWorkOrderCanonicalReadPorts {
  readonly orders: {
    findSnapshotForFulfillmentById(internalOrderId: string): LocalOrderReadResult;
  };
  readonly configuredItems: LocalConfiguredItemReadPort;
  readonly fulfillments: {
    findByOrderIdentity(input: {
      readonly internalOrderId: string;
      readonly publicOrderReference: string;
    }): LocalFulfillmentAggregateReadResult;
  };
  readonly assignments: {
    findByProductionUnit(input: SupplierProductionUnitIdentity):
      | { readonly status: "found"; readonly assignment: SupplierAssignment }
      | { readonly status: "unavailable" };
  };
}

export interface SupplierWorkOrderCanonicalFacts {
  readonly productionUnit: SupplierProductionUnitIdentity;
  readonly order: LocalOrderSnapshot;
  readonly configuredItem: SupplierWorkOrderConfiguredItem;
  readonly fulfillment: LocalFulfillmentState;
  readonly assignment: SupplierAssignment;
}

export type SupplierWorkOrderAdmissionResult =
  | { readonly status: "eligible"; readonly facts: SupplierWorkOrderCanonicalFacts }
  | {
      readonly status:
        | "order_unavailable"
        | "unpaid"
        | "payment_not_succeeded"
        | "configured_item_unavailable"
        | "assignment_unavailable"
        | "assignment_ownership_mismatch"
        | "fulfillment_unavailable"
        | "preview_not_approved"
        | "invalid_identity";
      readonly issues: readonly SupplierWorkOrderIssue[];
    };

export const SUPPLIER_WORK_ORDER_NOTICE = "Development/test SupplierWorkOrder only." as const;

export interface SupplierWorkOrderPreviewApprovalSnapshot {
  readonly status: "approved";
  readonly previewVersion: 1 | 2 | 3;
  readonly fulfillmentStatusAtAdmission: SupplierWorkOrderFulfillmentStatus;
  readonly approvedAt: string;
}

export interface SupplierWorkOrderProductionWindow {
  readonly minProductionBusinessDays: number | null;
  readonly maxProductionBusinessDays: number | null;
}

export interface SupplierWorkOrderProductSnapshot {
  readonly productId: string;
  readonly productName: string;
  readonly productSlug: string;
  readonly catalogVariantId: string;
  readonly skuCode: string;
  readonly quantity: number;
  readonly selectedOptions: LocalOrderLineSnapshot["selectedOptions"];
  readonly fulfillmentType: "physical";
}

export interface SupplierWorkOrderCustomerConfigurationSnapshot {
  readonly configurationRevision: string;
  readonly values: CustomizationValues;
}

export interface SupplierWorkOrderSupplierSnapshot extends SupplierAssignmentSnapshot {
  readonly assignmentId: string;
  readonly assignmentActionId: string;
}

export interface SupplierWorkOrder {
  readonly kind: "supplier_work_order";
  readonly workOrderId: string;
  readonly workOrderActionId: string;
  readonly canonicalOrder: SupplierProductionUnitIdentity["canonicalOrder"];
  readonly orderItemId: string;
  readonly product: SupplierWorkOrderProductSnapshot;
  readonly customerConfiguration: SupplierWorkOrderCustomerConfigurationSnapshot;
  readonly approvedPreview: SupplierWorkOrderPreviewApprovalSnapshot;
  readonly supplier: SupplierWorkOrderSupplierSnapshot;
  readonly productionWindow: SupplierWorkOrderProductionWindow;
  readonly shanghaiWarehouseRequired: true;
  readonly createdAt: string;
  readonly notice: typeof SUPPLIER_WORK_ORDER_NOTICE;
}

export interface SupplierWorkOrderCreateRequest {
  readonly workOrderActionId: string;
  readonly productionUnit: SupplierProductionUnitIdentity;
  readonly operatorAuthority: SupplierOperatorAuthority;
}

export interface SupplierWorkOrderCommitRequest extends SupplierWorkOrderCreateRequest {
  readonly facts: SupplierWorkOrderCanonicalFacts;
}

export type SupplierWorkOrderCommitResult =
  | { readonly status: "committed" | "replayed"; readonly workOrder: SupplierWorkOrder }
  | {
      readonly status: "rejected" | "conflict" | "unavailable" | "failed";
      readonly issues: readonly SupplierWorkOrderIssue[];
    };

const ACTION_ID_PATTERN = /^[A-Za-z0-9_-]{16,200}$/;

function issue(
  code: SupplierWorkOrderValidationCode,
  message: string,
  path = "$",
): SupplierWorkOrderIssue {
  return { path, code, message };
}

function failure<T = never>(...issues: SupplierWorkOrderIssue[]): SupplierWorkOrderResult<T> {
  return { ok: false, issues };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  return value;
}

function cloneCrop(crop: CustomizationCropRegion | undefined): CustomizationCropRegion | undefined {
  return crop ? { ...crop } : undefined;
}

function cloneCustomizationValues(values: CustomizationValues): CustomizationValues {
  return values.map((value) => {
    if (value.kind === "image") {
      return {
        ...value,
        images: value.images.map((image) => ({
          receiptId: image.receiptId,
          ...(image.crop ? { crop: cloneCrop(image.crop) } : {}),
        })),
      } satisfies CustomizationImageValue;
    }
    return value.kind === "multi_select"
      ? { ...value, choiceIds: [...value.choiceIds] }
      : value.kind === "single_select"
      ? { ...value } satisfies CustomizationSingleSelectValue
      : value.kind === "numeric"
        ? { ...value } satisfies CustomizationNumericValue
        : value.kind === "generic_file"
          ? { ...value, files: value.files.map((file) => ({ ...file })) } satisfies CustomizationGenericFileValue
          : { ...value } satisfies CustomizationTextValue;
  });
}

function cloneLine(line: LocalOrderLineSnapshot): LocalOrderLineSnapshot {
  return {
    ...line,
    selectedOptions: line.selectedOptions.map((selection) => ({ ...selection })),
    ...(line.customization
      ? {
          customization: {
            configurationRevision: line.customization.configurationRevision,
            values: cloneCustomizationValues(line.customization.values),
          },
        }
      : {}),
  };
}

function cloneOrder(snapshot: LocalOrderSnapshot): LocalOrderSnapshot {
  return {
    ...snapshot,
    contact: { ...snapshot.contact },
    commercial: {
      ...snapshot.commercial,
      shipping: { ...snapshot.commercial.shipping },
      coupon: { ...snapshot.commercial.coupon },
      tax: { ...snapshot.commercial.tax },
    },
    lines: snapshot.lines.map(cloneLine),
  };
}

function cloneFulfillment(state: LocalFulfillmentState): LocalFulfillmentState {
  return {
    ...state,
    ...(state.currentPreview ? { currentPreview: { ...state.currentPreview } } : {}),
  };
}

function cloneProvenance(value: SupplierAssignmentSnapshot["provenance"]) {
  return value.map((entry) => ({
    ...entry,
    workbook: { ...entry.workbook },
    rawValues: { ...entry.rawValues },
  }));
}

function cloneAssignment(value: SupplierAssignment): SupplierAssignment {
  return {
    ...value,
    productionUnit: {
      canonicalOrder: { ...value.productionUnit.canonicalOrder },
      orderItemId: value.productionUnit.orderItemId,
    },
    snapshot: {
      ...value.snapshot,
      provenance: cloneProvenance(value.snapshot.provenance),
    },
  };
}

function sameConfiguredItemLine(left: LocalOrderLineSnapshot, right: SupplierWorkOrderConfiguredItem): boolean {
  return left.productId === right.productId
    && left.productName === right.productName
    && left.productSlug === right.productSlug
    && left.variantId === right.variantId
    && left.skuCode === right.skuCode
    && left.quantity === right.quantity
    && JSON.stringify(left.selectedOptions) === JSON.stringify(right.selectedOptions)
    && left.fulfillmentType === right.fulfillmentType
    && left.customization?.configurationRevision === right.configurationRevision
    && JSON.stringify(left.customization?.values) === JSON.stringify(right.customizationValues);
}

function isApprovedFulfillmentStatus(value: unknown): value is SupplierWorkOrderFulfillmentStatus {
  return value === "preview_approved" || value === "in_production" || value === "quality_check";
}

function fulfillmentIssue(status: "preview_not_approved" | "fulfillment_unavailable"): SupplierWorkOrderAdmissionResult {
  return {
    status,
    issues: [issue(status, status === "preview_not_approved"
      ? "Customer Fulfillment has not reached preview approval."
      : "Customer Fulfillment is unavailable.")],
  };
}

/**
 * Freshly resolves all upstream authorities needed to admit a SupplierWorkOrder.
 * This is a read-only gate; it never creates a repository or mutates an upstream
 * Order, Payment, or Customer Fulfillment aggregate.
 */
export function resolveSupplierWorkOrderAdmission(
  productionUnitValue: unknown,
  ports: SupplierWorkOrderCanonicalReadPorts,
): SupplierWorkOrderAdmissionResult {
  const productionUnit = validateSupplierProductionUnitIdentity(productionUnitValue);
  if (!productionUnit.ok) {
    return { status: "invalid_identity", issues: productionUnit.issues.map((entry) => issue("invalid_identity", entry.message, entry.path)) };
  }

  let orderResult: LocalOrderReadResult;
  try {
    orderResult = ports.orders.findSnapshotForFulfillmentById(productionUnit.value.canonicalOrder.internalOrderId);
  } catch {
    return { status: "order_unavailable", issues: [issue("order_unavailable", "Canonical Local Order is unavailable.")] };
  }
  if (orderResult.status !== "found") {
    return { status: "order_unavailable", issues: [issue("order_unavailable", "Canonical Local Order is unavailable.")] };
  }
  const order = orderResult.snapshot;
  if (order.publicReference !== productionUnit.value.canonicalOrder.publicReference) {
    return { status: "invalid_identity", issues: [issue("invalid_identity", "Canonical Order identity does not match.")] };
  }
  if (order.status !== "paid") return { status: "unpaid", issues: [issue("unpaid", "SupplierWorkOrder requires a paid Local Order.")] };
  if (order.paymentStatus !== "succeeded") {
    return { status: "payment_not_succeeded", issues: [issue("payment_not_succeeded", "Local Payment has not succeeded.")] };
  }

  let itemResult: SupplierWorkOrderConfiguredItemReadResult;
  try {
    itemResult = ports.configuredItems.findConfiguredItem({
      internalOrderId: productionUnit.value.canonicalOrder.internalOrderId,
      publicOrderReference: productionUnit.value.canonicalOrder.publicReference,
      orderItemId: productionUnit.value.orderItemId,
    });
  } catch {
    return { status: "configured_item_unavailable", issues: [issue("configured_item_unavailable", "Configured Order item is unavailable.")] };
  }
  if (itemResult.status !== "found") {
    return { status: "configured_item_unavailable", issues: [issue("configured_item_unavailable", "Configured Order item is unavailable.")] };
  }
  const configuredItem = itemResult.item;
  const canonicalLine = order.lines.find((line) => line.orderItemId === configuredItem.orderItemId);
  if (
    configuredItem.orderItemId !== productionUnit.value.orderItemId
    || !canonicalLine
    || !sameConfiguredItemLine(canonicalLine, configuredItem)
    || configuredItem.fulfillmentType !== "physical"
  ) {
    return { status: "configured_item_unavailable", issues: [issue("configured_item_unavailable", "Configured Order item is not eligible for supplier production.")] };
  }

  let fulfillmentResult: LocalFulfillmentAggregateReadResult;
  try {
    fulfillmentResult = ports.fulfillments.findByOrderIdentity({
      internalOrderId: productionUnit.value.canonicalOrder.internalOrderId,
      publicOrderReference: productionUnit.value.canonicalOrder.publicReference,
    });
  } catch {
    return fulfillmentIssue("fulfillment_unavailable");
  }
  if (fulfillmentResult.status !== "found") return fulfillmentIssue("fulfillment_unavailable");
  const fulfillment = fulfillmentResult.aggregate.state;
  if (
    fulfillment.internalOrderId !== productionUnit.value.canonicalOrder.internalOrderId
    || fulfillment.publicOrderReference !== productionUnit.value.canonicalOrder.publicReference
  ) {
    return { status: "invalid_identity", issues: [issue("invalid_identity", "Customer Fulfillment identity does not match.")] };
  }
  if (!isApprovedFulfillmentStatus(fulfillment.status) || !fulfillment.currentPreview) {
    return fulfillmentIssue("preview_not_approved");
  }

  let assignmentResult;
  try {
    assignmentResult = ports.assignments.findByProductionUnit(productionUnit.value);
  } catch {
    return { status: "assignment_unavailable", issues: [issue("assignment_unavailable", "Supplier assignment is unavailable.")] };
  }
  if (assignmentResult.status !== "found") {
    return { status: "assignment_unavailable", issues: [issue("assignment_unavailable", "Supplier assignment is unavailable.")] };
  }
  const assignment = assignmentResult.assignment;
  if (
    !sameSupplierProductionUnit(assignment.productionUnit, productionUnit.value)
    || assignment.snapshot.productId !== configuredItem.productId
    || assignment.snapshot.productSlug !== configuredItem.productSlug
    || assignment.snapshot.catalogVariantId !== configuredItem.variantId
    || assignment.snapshot.skuCode !== configuredItem.skuCode
    || JSON.stringify(assignment.snapshot.selectedOptions) !== JSON.stringify(configuredItem.selectedOptions)
  ) {
    return { status: "assignment_ownership_mismatch", issues: [issue("assignment_ownership_mismatch", "Supplier assignment does not belong to this production unit.")] };
  }

  return {
    status: "eligible",
    facts: {
      productionUnit: productionUnit.value,
      order: cloneOrder(order),
      configuredItem: {
        ...configuredItem,
      },
      fulfillment: cloneFulfillment(fulfillment),
      assignment: cloneAssignment(assignment),
    },
  };
}

function cloneWorkOrder(value: SupplierWorkOrder): SupplierWorkOrder {
  return deepFreeze({
    ...value,
    canonicalOrder: { ...value.canonicalOrder },
    product: {
      ...value.product,
      selectedOptions: value.product.selectedOptions.map((selection) => ({ ...selection })),
    },
    customerConfiguration: {
      configurationRevision: value.customerConfiguration.configurationRevision,
      values: cloneCustomizationValues(value.customerConfiguration.values),
    },
    approvedPreview: { ...value.approvedPreview },
    supplier: {
      ...value.supplier,
      provenance: cloneProvenance(value.supplier.provenance),
    },
    productionWindow: { ...value.productionWindow },
  });
}

export function buildSupplierWorkOrderFromAdmission(
  workOrderId: string,
  request: SupplierWorkOrderCreateRequest,
  facts: SupplierWorkOrderCanonicalFacts,
  createdAt: string,
): SupplierWorkOrder {
  const preview = facts.fulfillment.currentPreview;
  if (!preview || !isApprovedFulfillmentStatus(facts.fulfillment.status)) {
    throw new Error("SupplierWorkOrder requires an approved preview.");
  }
  return cloneWorkOrder({
    kind: "supplier_work_order",
    workOrderId,
    workOrderActionId: request.workOrderActionId,
    canonicalOrder: { ...facts.productionUnit.canonicalOrder },
    orderItemId: facts.productionUnit.orderItemId,
    product: {
      productId: facts.configuredItem.productId,
      productName: facts.configuredItem.productName,
      productSlug: facts.configuredItem.productSlug,
      catalogVariantId: facts.configuredItem.variantId,
      skuCode: facts.configuredItem.skuCode,
      quantity: facts.configuredItem.quantity,
      selectedOptions: facts.configuredItem.selectedOptions.map((selection) => ({ ...selection })),
      fulfillmentType: "physical",
    },
    customerConfiguration: {
      configurationRevision: facts.configuredItem.configurationRevision,
      values: cloneCustomizationValues(facts.configuredItem.customizationValues),
    },
    approvedPreview: {
      status: "approved",
      previewVersion: preview.previewVersion,
      fulfillmentStatusAtAdmission: facts.fulfillment.status,
      approvedAt: preview.publishedAt,
    },
    supplier: {
      ...facts.assignment.snapshot,
      assignmentId: facts.assignment.assignmentId,
      assignmentActionId: facts.assignment.assignmentActionId,
      provenance: cloneProvenance(facts.assignment.snapshot.provenance),
    },
    productionWindow: {
      minProductionBusinessDays: facts.assignment.snapshot.minProductionBusinessDays,
      maxProductionBusinessDays: facts.assignment.snapshot.maxProductionBusinessDays,
    },
    shanghaiWarehouseRequired: true,
    createdAt,
    notice: SUPPLIER_WORK_ORDER_NOTICE,
  });
}

export function isSupplierWorkOrderActionId(value: unknown): value is string {
  return typeof value === "string" && ACTION_ID_PATTERN.test(value);
}

export function supplierWorkOrderIssue(
  code: SupplierWorkOrderValidationCode,
  message: string,
  path = "$",
): SupplierWorkOrderIssue {
  return issue(code, message, path);
}

export function supplierWorkOrderKey(input: SupplierProductionUnitIdentity): string {
  return supplierProductionUnitKey(input);
}

export function sameSupplierWorkOrderIdentity(
  left: SupplierWorkOrder,
  right: SupplierWorkOrderCreateRequest,
): boolean {
  return left.workOrderActionId === right.workOrderActionId
    && sameSupplierProductionUnit(
      { canonicalOrder: left.canonicalOrder, orderItemId: left.orderItemId },
      right.productionUnit,
    );
}

export function sameSupplierWorkOrderRequestIdentity(
  left: SupplierWorkOrder,
  right: SupplierWorkOrderCreateRequest,
  assignmentId: string,
): boolean {
  return sameSupplierWorkOrderIdentity(left, right) && left.supplier.assignmentId === assignmentId;
}

export function validateSupplierWorkOrderCreateRequest(
  value: unknown,
): SupplierWorkOrderResult<SupplierWorkOrderCreateRequest> {
  if (!isRecord(value)) return failure(issue("invalid_type", "SupplierWorkOrder request must be an object."));
  const productionUnit = validateSupplierProductionUnitIdentity(value.productionUnit);
  const issues: SupplierWorkOrderIssue[] = productionUnit.ok
    ? []
    : productionUnit.issues.map((entry) => issue("invalid_identity", entry.message, entry.path));
  if (!isSupplierWorkOrderActionId(value.workOrderActionId)) issues.push(issue("invalid_format", "WorkOrder action identity is invalid.", "$.workOrderActionId"));
  if (!isSupplierOperatorAuthority(value.operatorAuthority)) issues.push(issue("unauthorized", "Separate operator authority is required.", "$.operatorAuthority"));
  if (issues.length > 0 || !productionUnit.ok) return failure(...issues);
  return {
    ok: true,
    value: {
      workOrderActionId: value.workOrderActionId as string,
      productionUnit: productionUnit.value,
      operatorAuthority: value.operatorAuthority as SupplierOperatorAuthority,
    },
  };
}
