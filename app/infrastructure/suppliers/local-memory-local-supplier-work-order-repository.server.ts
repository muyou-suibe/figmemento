import {
  buildSupplierWorkOrderFromAdmission,
  isSupplierWorkOrderActionId,
  sameSupplierWorkOrderIdentity,
  supplierWorkOrderIssue,
  supplierWorkOrderKey,
  validateSupplierWorkOrderCreateRequest,
  type SupplierWorkOrder,
  type SupplierWorkOrderCommitRequest,
  type SupplierWorkOrderCommitResult,
} from "../../domain/supplier-work-order.ts";
import type {
  LocalMemoryLocalSupplierWorkOrderRepositoryOptions,
  LocalSupplierWorkOrderRepository,
  LocalSupplierWorkOrderTestCounts,
} from "../../application/local-supplier-work-order-repository.ts";
import type { SupplierProductionUnitIdentity } from "../../domain/supplier-operations.ts";

interface SupplierWorkOrderBinding {
  readonly workOrderActionId: string;
  readonly workOrder: SupplierWorkOrder;
}

function failure(
  status: "rejected" | "conflict" | "unavailable" | "failed",
  code: Parameters<typeof supplierWorkOrderIssue>[0],
  message: string,
): SupplierWorkOrderCommitResult {
  return { status, issues: [supplierWorkOrderIssue(code, message)] };
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  return value;
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
      values: value.customerConfiguration.values.map((entry) => entry.kind === "image"
        ? {
            ...entry,
            images: entry.images.map((image) => ({
              receiptId: image.receiptId,
              ...(image.crop ? { crop: { ...image.crop } } : {}),
            })),
          }
        : { ...entry }),
    },
    approvedPreview: { ...value.approvedPreview },
    supplier: {
      ...value.supplier,
      provenance: value.supplier.provenance.map((entry) => ({
        ...entry,
        workbook: { ...entry.workbook },
        rawValues: { ...entry.rawValues },
      })),
    },
    productionWindow: { ...value.productionWindow },
  });
}

/**
 * Process-memory-only SupplierWorkOrder aggregate. It stores no Order copy,
 * Catalog cache, browser state, filesystem state, or provider locator.
 */
export class LocalMemoryLocalSupplierWorkOrderRepository implements LocalSupplierWorkOrderRepository {
  private readonly workOrdersByProductionUnit = new Map<string, SupplierWorkOrder>();
  private readonly bindingsByActionId = new Map<string, SupplierWorkOrderBinding>();
  private readonly now: () => string;
  private readonly nextWorkOrderId: () => string;
  private readonly failureInjector?: LocalMemoryLocalSupplierWorkOrderRepositoryOptions["failureInjector"];

  constructor(options: LocalMemoryLocalSupplierWorkOrderRepositoryOptions = {}) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.nextWorkOrderId = options.nextWorkOrderId ?? (() => `supplier-work-order-${globalThis.crypto.randomUUID()}`);
    this.failureInjector = options.failureInjector;
  }

  findByActionId(actionId: string):
    | { readonly status: "found"; readonly workOrder: SupplierWorkOrder }
    | { readonly status: "unavailable" } {
    const binding = this.bindingsByActionId.get(actionId);
    return binding
      ? { status: "found", workOrder: cloneWorkOrder(binding.workOrder) }
      : { status: "unavailable" };
  }

  findByProductionUnit(input: SupplierProductionUnitIdentity):
    | { readonly status: "found"; readonly workOrder: SupplierWorkOrder }
    | { readonly status: "unavailable" } {
    const workOrder = this.workOrdersByProductionUnit.get(supplierWorkOrderKey(input));
    return workOrder
      ? { status: "found", workOrder: cloneWorkOrder(workOrder) }
      : { status: "unavailable" };
  }

  list(): readonly SupplierWorkOrder[] {
    return [...this.workOrdersByProductionUnit.values()].map(cloneWorkOrder);
  }

  commit(input: SupplierWorkOrderCommitRequest): SupplierWorkOrderCommitResult {
    const parsed = validateSupplierWorkOrderCreateRequest(input);
    if (!parsed.ok) return { status: "rejected", issues: parsed.issues };
    const request = parsed.value;
    if (!isSupplierWorkOrderActionId(request.workOrderActionId)) {
      return failure("rejected", "invalid_format", "WorkOrder action identity is invalid.");
    }

    const existingBinding = this.bindingsByActionId.get(request.workOrderActionId);
    if (existingBinding) {
      if (!sameSupplierWorkOrderIdentity(existingBinding.workOrder, request)) {
        return failure("conflict", "conflict", "WorkOrder action selector is already bound to different context.");
      }
      return { status: "replayed", workOrder: cloneWorkOrder(existingBinding.workOrder) };
    }

    const productionUnitKey = supplierWorkOrderKey(request.productionUnit);
    if (this.workOrdersByProductionUnit.has(productionUnitKey)) {
      return failure("conflict", "conflict", "This production unit already has a SupplierWorkOrder.");
    }

    if (input.facts.productionUnit.canonicalOrder.internalOrderId !== request.productionUnit.canonicalOrder.internalOrderId
      || input.facts.productionUnit.canonicalOrder.publicReference !== request.productionUnit.canonicalOrder.publicReference
      || input.facts.productionUnit.orderItemId !== request.productionUnit.orderItemId) {
      return failure("unavailable", "invalid_identity", "SupplierWorkOrder identity is unavailable.");
    }
    if (input.facts.order.status !== "paid") return failure("rejected", "unpaid", "SupplierWorkOrder requires a paid Local Order.");
    if (input.facts.order.paymentStatus !== "succeeded") return failure("rejected", "payment_not_succeeded", "Local Payment has not succeeded.");
    if (input.facts.configuredItem.fulfillmentType !== "physical" || input.facts.configuredItem.configurationRevision.length === 0) {
      return failure("rejected", "configured_item_unavailable", "Configured Order item is not eligible for supplier production.");
    }
    if (input.facts.fulfillment.currentPreview === null
      || (input.facts.fulfillment.status !== "preview_approved"
        && input.facts.fulfillment.status !== "in_production"
        && input.facts.fulfillment.status !== "quality_check")) {
      return failure("rejected", "preview_not_approved", "Customer Fulfillment approval is required.");
    }
    if (input.facts.assignment.snapshot.productId !== input.facts.configuredItem.productId
      || input.facts.assignment.snapshot.productSlug !== input.facts.configuredItem.productSlug
      || input.facts.assignment.snapshot.catalogVariantId !== input.facts.configuredItem.variantId
      || input.facts.assignment.snapshot.skuCode !== input.facts.configuredItem.skuCode
      || JSON.stringify(input.facts.assignment.snapshot.selectedOptions) !== JSON.stringify(input.facts.configuredItem.selectedOptions)) {
      return failure("unavailable", "assignment_ownership_mismatch", "The supplier assignment is unavailable for this production unit.");
    }

    let workOrderId: string;
    try {
      workOrderId = this.nextWorkOrderId();
    } catch {
      return failure("failed", "unavailable", "SupplierWorkOrder identity could not be generated safely.");
    }
    if (typeof workOrderId !== "string" || workOrderId.trim().length === 0) {
      return failure("failed", "unavailable", "SupplierWorkOrder identity could not be generated safely.");
    }

    let workOrder: SupplierWorkOrder;
    try {
      workOrder = buildSupplierWorkOrderFromAdmission(
        workOrderId,
        {
          workOrderActionId: request.workOrderActionId,
          productionUnit: request.productionUnit,
          operatorAuthority: request.operatorAuthority,
        },
        input.facts,
        this.now(),
      );
    } catch {
      return failure("failed", "unavailable", "SupplierWorkOrder could not be prepared safely.");
    }
    const binding: SupplierWorkOrderBinding = {
      workOrderActionId: request.workOrderActionId,
      workOrder,
    };

    try {
      this.failureInjector?.beforeCommit?.();
    } catch {
      return failure("failed", "unavailable", "SupplierWorkOrder could not be committed.");
    }

    // One synchronous visible commit point for both record and action binding.
    this.workOrdersByProductionUnit.set(productionUnitKey, workOrder);
    this.bindingsByActionId.set(request.workOrderActionId, binding);
    return { status: "committed", workOrder: cloneWorkOrder(workOrder) };
  }

  getCountsForTests(): LocalSupplierWorkOrderTestCounts {
    return {
      workOrderCount: this.workOrdersByProductionUnit.size,
      bindingCount: this.bindingsByActionId.size,
    };
  }
}
