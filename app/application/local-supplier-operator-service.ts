import { isLocalSupplierRuntimeEnabled } from "../config/local-supplier-runtime.ts";
import {
  isLocalOrderItemId,
  isLocalOrderPublicReference,
  type LocalOrderLineSnapshot,
  type LocalOrderSnapshot,
} from "../domain/local-order.ts";
import {
  matchSupplierCandidates,
  validateSupplierProductionUnitIdentity,
  sameSupplierProductionUnit,
  sameSupplierCandidateIdentity,
  type SupplierAssignment,
  type SupplierAssignmentRequest,
  type SupplierAssignmentResult,
  type SupplierCandidate,
  type SupplierCandidateMatchResult,
  type SupplierCandidateIdentity,
  type SupplierCandidateInput,
  type SupplierDomainDataset,
  type SupplierOperatorAuthority,
  type SupplierProductionUnitIdentity,
} from "../domain/supplier-operations.ts";
import {
  SUPPLIER_PRODUCTION_LIFECYCLE,
  type SupplierProductionLifecycleStatus,
  type SupplierProductionOperation,
} from "../domain/supplier-production-lifecycle.ts";
import type { WarehouseReceipt } from "../domain/supplier-warehouse-receipt.ts";
import type { SupplierWorkOrder } from "../domain/supplier-work-order.ts";
import { LocalSupplierProductionService } from "./local-supplier-production-service.ts";
import { LocalSupplierWarehouseService } from "./local-supplier-warehouse-service.ts";
import { LocalSupplierWorkOrderService } from "./local-supplier-work-order-service.ts";
import type { LocalSupplierRuntime } from "../server/local-supplier-runtime.server.ts";
import { readCanonicalSupplierSelection } from "./local-supplier-canonical-selection.ts";
import { createLocalConfiguredItemReadAdapter } from "./local-configured-item-read-port.ts";
import { projectSupplierEconomics, projectSupplierProductionLeadTime, readSupplierCustomerRevenue, type SupplierEconomicsProjection } from "./local-supplier-economics.ts";
import type { LocalOrderFulfillmentReadPort } from "./local-order-repository.ts";
import {
  resolveLocalSupplierOperatorAuthority,
  type LocalSupplierOperatorVerifier,
} from "../server/local-supplier-operator.server.ts";

export const LOCAL_SUPPLIER_OPERATOR_NOTICE = "DEVELOPMENT / TEST ONLY" as const;

type OperatorIssue = { readonly path: string; readonly code: string; readonly message: string };

export type LocalSupplierOperatorFailure = {
  readonly status: "invalid" | "unavailable" | "conflict" | "rejected";
  readonly issues: readonly OperatorIssue[];
};

export interface LocalSupplierOperatorProjection {
  readonly notice: typeof LOCAL_SUPPLIER_OPERATOR_NOTICE;
  readonly source: "local_fake";
  readonly suppliers: readonly SupplierProjection[];
  readonly offers: readonly OfferProjection[];
  readonly variants: readonly VariantProjection[];
  readonly candidateEvidence: CandidateEvidenceProjection;
  readonly queues: SupplierQueuesProjection;
}

export interface SupplierProvenanceProjection {
  readonly sourceRow: number;
  readonly sourceUrl: string | null;
  readonly reviewStatus: string;
  readonly reviewNote: string;
}

export interface SupplierProjection {
  readonly supplierId: string;
  readonly displayName: string;
  readonly platform: string;
  readonly sourceUrl: string | null;
  readonly status: string;
  readonly canShipToShanghaiWarehouse: boolean | null;
  readonly videoCapability: string;
  readonly returnReworkPolicy: string | null;
  readonly notes: string | null;
  readonly provenance: readonly SupplierProvenanceProjection[];
}

export interface OfferProjection {
  readonly productionLeadTime: SupplierEconomicsProjection["productionLeadTime"];
  readonly offerId: string;
  readonly supplierId: string;
  readonly sourceProductLabel: string;
  readonly fulfillmentType: string;
  readonly status: string;
  readonly catalogMappingStatus: string;
  readonly catalogMappingReason: string;
  readonly minProductionBusinessDays: number | null;
  readonly maxProductionBusinessDays: number | null;
  readonly canShipToShanghaiWarehouse: boolean | null;
  readonly sourcePackagedWeightText: string | null;
  readonly provenance: readonly SupplierProvenanceProjection[];
}

export interface VariantProjection {
  readonly economics: SupplierEconomicsProjection;
  readonly supplierOfferVariantId: string;
  readonly offerId: string;
  readonly supplierSpecificationKey: string;
  readonly label: string;
  readonly status: string;
  readonly supplierCostCents: number | null;
  readonly currency: string | null;
  readonly pricingBasis: string;
  readonly priceUnit: string;
  readonly optionSurchargeCents: number | null;
  readonly packagedWeightGrams: number | null;
  readonly packagedWeightRawText: string | null;
  readonly packagedWeightReviewStatus: string;
  readonly minProductionBusinessDays: number | null;
  readonly maxProductionBusinessDays: number | null;
  readonly dimensionsCm: null;
  readonly rawSourceValue: string;
  readonly reviewStatus: string;
  readonly provenance: readonly SupplierProvenanceProjection[];
}

export interface CandidateEvidenceProjection {
  readonly status: "review_required" | "not_evaluated";
  readonly eligibleCandidateCount: 0;
  readonly message: string;
}

export interface QueueProductionUnitProjection {
  readonly internalOrderId: string;
  readonly publicOrderReference: string;
  readonly orderItemId: string;
}

export interface AssignmentProjection {
  readonly economics: SupplierEconomicsProjection;
  readonly assignmentId: string;
  readonly assignmentActionId: string;
  readonly productionUnit: QueueProductionUnitProjection;
  readonly supplierId: string;
  readonly offerId: string;
  readonly supplierOfferVariantId: string;
  readonly supplierSpecificationKey: string;
  readonly assignedAt: string;
}

export interface WorkOrderProjection {
  readonly economics: SupplierEconomicsProjection;
  readonly workOrderId: string;
  readonly workOrderActionId: string;
  readonly productionUnit: QueueProductionUnitProjection;
  readonly supplierAssignmentId: string;
  readonly status: string;
  readonly createdAt: string;
}

export interface ProductionInitializationProjection {
  readonly productionUnit: QueueProductionUnitProjection;
  readonly supplierAssignmentId: string;
  readonly supplierWorkOrderId: string;
  readonly workOrderStatus: "work_order_ready";
  readonly actionAvailable: boolean;
}

export interface ProductionProjection {
  readonly operationId: string;
  readonly productionUnit: QueueProductionUnitProjection;
  readonly assignmentId: string;
  readonly workOrderId: string | null;
  readonly currentStatus: SupplierProductionLifecycleStatus;
  readonly nextStatus: SupplierProductionLifecycleStatus | null;
  readonly actionAvailable: boolean;
  readonly expectedQuantity: number | null;
  readonly updatedAt: string;
}

export interface WarehouseProjection {
  readonly warehouseReceiptId: string;
  readonly productionUnit: QueueProductionUnitProjection;
  readonly supplierAssignmentId: string;
  readonly supplierWorkOrderId: string;
  readonly supplierProductionOperationId: string;
  readonly receiptStatus: string;
  readonly expectedQuantity: number;
  readonly receivedQuantity: number;
  readonly discrepancy: WarehouseReceipt["discrepancy"];
  readonly damageReported: boolean;
  readonly qcStatus: string;
  readonly readyForOutbound: boolean;
  readonly receivedAt: string;
}

export interface SupplierQueuesProjection {
  readonly awaitingAssignment: { readonly supported: false; readonly items: readonly []; readonly message: string };
  readonly assigned: readonly AssignmentProjection[];
  readonly workOrders: readonly WorkOrderProjection[];
  readonly productionInitialization: readonly ProductionInitializationProjection[];
  readonly production: readonly ProductionProjection[];
  readonly warehouse: readonly WarehouseProjection[];
  readonly readyForOutbound: readonly ProductionProjection[];
}

export type LocalSupplierOperatorResult =
  | LocalSupplierOperatorFailure
  | { readonly status: "found"; readonly value: LocalSupplierOperatorProjection }
  | { readonly status: "found"; readonly value: CandidateInspectionProjection }
  | { readonly status: "found"; readonly value: ProductionUnitResolutionProjection }
  | { readonly status: "committed" | "replayed"; readonly result: unknown };

export interface ResolvedSupplierProductionUnitProjection extends QueueProductionUnitProjection {
  readonly productName: string;
  readonly productSlug: string;
  readonly variantId: string;
  readonly skuCode: string;
  readonly selectedOptions: readonly { readonly optionId: string; readonly valueId: string }[];
  readonly quantity: number;
  readonly fulfillmentType: "physical";
}

export interface ProductionUnitResolutionProjection {
  readonly notice: typeof LOCAL_SUPPLIER_OPERATOR_NOTICE;
  readonly publicOrderReference: string;
  readonly status: "resolved" | "no_physical_units";
  readonly productionUnits: readonly ResolvedSupplierProductionUnitProjection[];
}

export interface CandidateInspectionProjection {
  readonly notice: typeof LOCAL_SUPPLIER_OPERATOR_NOTICE;
  readonly candidateResult: SafeCandidateResult;
}

type SafeCandidate = Omit<SupplierCandidate, "provenance"> & {
  readonly provenance: readonly SupplierProvenanceProjection[];
  readonly economics: SupplierEconomicsProjection;
};
type SafeCandidateResult =
  | { readonly status: "eligible"; readonly input: SupplierCandidateInput; readonly candidates: readonly SafeCandidate[] }
  | { readonly status: "no_eligible_candidates" | "review_required"; readonly input: SupplierCandidateInput; readonly candidates: readonly []; readonly issues: readonly OperatorIssue[] }
  | { readonly status: "invalid"; readonly issues: readonly OperatorIssue[] };

function issue(code: string, message: string, path = "$"): OperatorIssue {
  return { path, code, message };
}

function failure(status: LocalSupplierOperatorFailure["status"], code: string, message: string): LocalSupplierOperatorFailure {
  return { status, issues: [issue(code, message)] };
}

function projectionProvenance(value: readonly { readonly sourceRow: number; readonly sourceUrl: string | null; readonly reviewStatus: string; readonly reviewNote: string }[]): readonly SupplierProvenanceProjection[] {
  return value.map((entry) => ({
    sourceRow: entry.sourceRow,
    sourceUrl: entry.sourceUrl,
    reviewStatus: entry.reviewStatus,
    reviewNote: entry.reviewNote,
  }));
}

function productionUnitProjection(value: SupplierProductionUnitIdentity): QueueProductionUnitProjection {
  return {
    internalOrderId: value.canonicalOrder.internalOrderId,
    publicOrderReference: value.canonicalOrder.publicReference,
    orderItemId: value.orderItemId,
  };
}

function assignmentProjection(value: SupplierAssignment, orders: LocalOrderFulfillmentReadPort): AssignmentProjection {
  return {
    economics: projectSupplierEconomics(value.snapshot, "committed_assignment", readSupplierCustomerRevenue(orders, value.productionUnit)),
    assignmentId: value.assignmentId,
    assignmentActionId: value.assignmentActionId,
    productionUnit: productionUnitProjection(value.productionUnit),
    supplierId: value.snapshot.supplierId,
    offerId: value.snapshot.offerId,
    supplierOfferVariantId: value.snapshot.supplierOfferVariantId,
    supplierSpecificationKey: value.snapshot.supplierSpecificationKey,
    assignedAt: value.snapshot.assignedAt,
  };
}

function workOrderProjection(value: SupplierWorkOrder, orders: LocalOrderFulfillmentReadPort): WorkOrderProjection {
  return {
    economics: projectSupplierEconomics(value.supplier, "committed_assignment", readSupplierCustomerRevenue(orders, { canonicalOrder: value.canonicalOrder, orderItemId: value.orderItemId })),
    workOrderId: value.workOrderId,
    workOrderActionId: value.workOrderActionId,
    productionUnit: { internalOrderId: value.canonicalOrder.internalOrderId, publicOrderReference: value.canonicalOrder.publicReference, orderItemId: value.orderItemId },
    supplierAssignmentId: value.supplier.assignmentId,
    status: "work_order_ready",
    createdAt: value.createdAt,
  };
}

function productionProjection(value: SupplierProductionOperation, expectedQuantity: number | null): ProductionProjection {
  const index = SUPPLIER_PRODUCTION_LIFECYCLE.indexOf(value.currentStatus);
  const nextStatus = index >= 0 && index < SUPPLIER_PRODUCTION_LIFECYCLE.length - 1
    ? SUPPLIER_PRODUCTION_LIFECYCLE[index + 1]
    : null;
  return {
    operationId: value.operationId,
    productionUnit: productionUnitProjection(value.productionUnit),
    assignmentId: value.assignmentId,
    workOrderId: value.workOrderId,
    currentStatus: value.currentStatus,
    nextStatus,
    actionAvailable: nextStatus !== null,
    expectedQuantity,
    updatedAt: value.updatedAt,
  };
}

function warehouseProjection(value: WarehouseReceipt): WarehouseProjection {
  return {
    warehouseReceiptId: value.warehouseReceiptId,
    productionUnit: productionUnitProjection(value.productionUnit),
    supplierAssignmentId: value.supplierAssignmentId,
    supplierWorkOrderId: value.supplierWorkOrderId,
    supplierProductionOperationId: value.supplierProductionOperationId,
    receiptStatus: value.receiptStatus,
    expectedQuantity: value.expectedQuantity,
    receivedQuantity: value.receivedQuantity,
    discrepancy: value.discrepancy,
    damageReported: value.damageReported,
    qcStatus: value.qc.status,
    readyForOutbound: value.readyForOutbound,
    receivedAt: value.receivedAt,
  };
}

function candidateProjection(value: SupplierCandidate): SafeCandidate {
  return {
    ...value,
    economics: projectSupplierEconomics(value, "current_source"),
    provenance: projectionProvenance(value.provenance),
  };
}

function candidateResultProjection(value: SupplierCandidateMatchResult): SafeCandidateResult {
  if (value.status === "eligible") return { ...value, candidates: value.candidates.map(candidateProjection) };
  return {
    ...value,
    issues: value.issues.map((entry) => issue(entry.code, entry.message, entry.path)),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function resolveProductionUnitProjection(
  order: LocalOrderSnapshot,
  line: LocalOrderLineSnapshot,
): ResolvedSupplierProductionUnitProjection | null {
  if (
    !isLocalOrderItemId(line.orderItemId)
    || line.fulfillmentType !== "physical"
    || !isString(line.productName)
    || !isString(line.productSlug)
    || !isString(line.variantId)
    || !isString(line.skuCode)
    || !Array.isArray(line.selectedOptions)
    || !Number.isInteger(line.quantity)
    || line.quantity < 1
  ) return null;

  const selectedOptions = line.selectedOptions.map((selection) => {
    if (!isRecord(selection) || !isString(selection.optionId) || !isString(selection.valueId)) return null;
    return { optionId: selection.optionId, valueId: selection.valueId };
  });
  if (selectedOptions.some((selection) => selection === null)) return null;

  return {
    internalOrderId: order.internalId,
    publicOrderReference: order.publicReference,
    orderItemId: line.orderItemId,
    productName: line.productName,
    productSlug: line.productSlug,
    variantId: line.variantId,
    skuCode: line.skuCode,
    selectedOptions: selectedOptions as readonly { readonly optionId: string; readonly valueId: string }[],
    quantity: line.quantity,
    fulfillmentType: "physical",
  };
}

function rejectBrowserAuthority(input: unknown): LocalSupplierOperatorFailure | null {
  return isRecord(input) && "operatorAuthority" in input
    ? failure("invalid", "authority_field", "Operator authority is server-resolved.")
    : null;
}

function mapAssignmentResult(result: SupplierAssignmentResult, orders: LocalOrderFulfillmentReadPort): LocalSupplierOperatorResult {
  if (result.status === "committed" || result.status === "replayed") return { status: result.status, result: { assignment: assignmentProjection(result.assignment, orders) } };
  if (result.status === "conflict") return { status: "conflict", issues: result.issues };
  if (result.status === "rejected") return { status: "rejected", issues: result.issues };
  return { status: "unavailable", issues: "issues" in result ? result.issues : [issue("unavailable", "Supplier assignment is unavailable.")] };
}

export class LocalSupplierOperatorService {
  private readonly runtime: LocalSupplierRuntime;
  private readonly verifier: LocalSupplierOperatorVerifier | undefined;

  constructor(input: { readonly runtime: LocalSupplierRuntime; readonly verifier: LocalSupplierOperatorVerifier | undefined }) {
    this.runtime = input.runtime;
    this.verifier = input.verifier;
  }

  read(): LocalSupplierOperatorResult {
    const authority = this.authorize();
    if ("status" in authority) return authority;
    return { status: "found", value: this.buildProjection() };
  }

  resolveProductionUnits(input: unknown): LocalSupplierOperatorResult {
    if (
      !isRecord(input)
      || Object.keys(input).some((key) => key !== "publicOrderReference")
      || !isLocalOrderPublicReference(input.publicOrderReference)
    ) return failure("invalid", "invalid_format", "Supplier Order reference input is invalid.");

    const authority = this.authorize();
    if ("status" in authority) return authority;

    let orderResult;
    try {
      orderResult = this.runtime.orders.findSnapshotForFulfillment(input.publicOrderReference);
    } catch {
      return failure("unavailable", "unavailable", "Supplier production units are unavailable.");
    }
    if (orderResult.status !== "found" || orderResult.snapshot.publicReference !== input.publicOrderReference || !Array.isArray(orderResult.snapshot.lines)) {
      return failure("unavailable", "unavailable", "Supplier production units are unavailable.");
    }

    const units: ResolvedSupplierProductionUnitProjection[] = [];
    for (const line of orderResult.snapshot.lines) {
      if (!isRecord(line) || line.fulfillmentType !== "physical") continue;
      const unit = resolveProductionUnitProjection(orderResult.snapshot, line as unknown as LocalOrderLineSnapshot);
      if (!unit || units.some((existing) => existing.orderItemId === unit.orderItemId)) {
        return failure("unavailable", "unavailable", "Supplier production units are unavailable.");
      }
      units.push(unit);
    }

    return {
      status: "found",
      value: {
        notice: LOCAL_SUPPLIER_OPERATOR_NOTICE,
        publicOrderReference: input.publicOrderReference,
        status: units.length === 0 ? "no_physical_units" : "resolved",
        productionUnits: units,
      },
    };
  }

  inspectCandidates(input: unknown): LocalSupplierOperatorResult {
    const authority = this.authorize();
    if ("status" in authority) return authority;
    const rejected = rejectBrowserAuthority(input);
    if (rejected) return rejected;
    const candidateInput = this.resolveCandidateInput(input);
    if (!candidateInput.ok) return candidateInput.failure;
    const matched = matchSupplierCandidates(candidateInput.value, this.runtime.dataset);
    return { status: "found", value: { notice: LOCAL_SUPPLIER_OPERATOR_NOTICE, candidateResult: candidateResultProjection(matched) } };
  }

  assign(input: unknown): LocalSupplierOperatorResult {
    const authority = this.authorize();
    if ("status" in authority) return authority;
    const rejected = rejectBrowserAuthority(input);
    if (rejected) return rejected;
    if (!isRecord(input)) return failure("invalid", "invalid_type", "Supplier assignment input is invalid.");
    const productionUnit = validateSupplierProductionUnitIdentity(input.productionUnit);
    if (!productionUnit.ok || !isString(input.assignmentActionId) || !isRecord(input.selectedCandidate)) {
      return failure("invalid", "invalid_format", "Supplier assignment input is invalid.");
    }
    const candidateInput = this.resolveCandidateInput({
      productionUnit: productionUnit.value,
      shanghaiWarehouseRequired: input.shanghaiWarehouseRequired,
    });
    if (!candidateInput.ok) return candidateInput.failure;
    const selectedCandidate: SupplierCandidateIdentity = {
      supplierId: isString(input.selectedCandidate.supplierId) ? input.selectedCandidate.supplierId : "",
      offerId: isString(input.selectedCandidate.offerId) ? input.selectedCandidate.offerId : "",
      supplierOfferVariantId: isString(input.selectedCandidate.supplierOfferVariantId) ? input.selectedCandidate.supplierOfferVariantId : "",
    };
    if (!selectedCandidate.supplierId || !selectedCandidate.offerId || !selectedCandidate.supplierOfferVariantId) return failure("invalid", "invalid_format", "Selected supplier candidate is invalid.");
    const candidateResult = matchSupplierCandidates(candidateInput.value, this.runtime.dataset);
    if (candidateResult.status !== "eligible") return { status: "rejected", issues: [issue("missing_mapping", "Supplier assignment requires an approved exact candidate.")] };
    const selected = candidateResult.candidates.find((candidate) => sameSupplierCandidateIdentity(candidate, selectedCandidate));
    if (!selected) return failure("rejected", "unsupported", "Selected supplier candidate is not eligible.");
    const request: SupplierAssignmentRequest = {
      assignmentActionId: input.assignmentActionId,
      productionUnit: productionUnit.value,
      operatorAuthority: authority.authority,
      candidateResult,
      selectedCandidate,
    };
    try {
      return mapAssignmentResult(this.runtime.assignments.commit(request), this.runtime.orders);
    } catch {
      return failure("unavailable", "unavailable", "Supplier assignment is unavailable.");
    }
  }

  async execute(input: unknown): Promise<LocalSupplierOperatorResult> {
    if (!isRecord(input) || !isString(input.action)) return failure("invalid", "invalid_format", "Supplier operator action is invalid.");
    const browserAuthority = rejectBrowserAuthority(input);
    if (browserAuthority) return browserAuthority;
    if (input.action === "read") return this.read();
    if (input.action === "resolve_production_units") return this.resolveProductionUnits(input.input);
    if (input.action === "inspect_candidates") return this.inspectCandidates(input.input);
    if (input.action === "assign") return this.assign(input.input);
    const authority = this.authorize();
    if ("status" in authority) return authority;
    const rejected = rejectBrowserAuthority(input.input);
    if (rejected) return rejected;
    const actionInput = isRecord(input.input) ? { ...input.input, operatorAuthority: authority.authority } : input.input;
    if (input.action === "create_work_order") return this.mapServiceResult(new LocalSupplierWorkOrderService({ ports: this.workOrderPorts(), repository: this.runtime.workOrders }).create(actionInput));
    if (input.action === "advance_production") {
      const initializationAdmission = this.requireProductionInitializationAdmission(actionInput);
      if (initializationAdmission) return initializationAdmission;
      return this.mapServiceResult(new LocalSupplierProductionService({ configuration: this.runtime.configuration, ports: this.productionPorts(), repository: this.runtime.production }).advance(actionInput, { requireWorkOrderForInitialAssignment: true }));
    }
    if (input.action === "record_receipt") return this.mapServiceResult(new LocalSupplierWarehouseService({ configuration: this.runtime.configuration, ports: this.productionPorts(), repository: this.runtime.production }).recordReceipt(actionInput));
    if (input.action === "record_qc") return this.mapServiceResult(new LocalSupplierWarehouseService({ configuration: this.runtime.configuration, ports: this.productionPorts(), repository: this.runtime.production }).recordQc(actionInput));
    if (input.action === "mark_ready_for_outbound") return this.mapServiceResult(new LocalSupplierWarehouseService({ configuration: this.runtime.configuration, ports: this.productionPorts(), repository: this.runtime.production }).markReadyForOutbound(actionInput));
    return failure("invalid", "unsupported", "Supplier operator action is not available.");
  }

  private authorize(): { readonly authority: SupplierOperatorAuthority } | LocalSupplierOperatorFailure {
    if (!isLocalSupplierRuntimeEnabled(this.runtime.configuration)) return failure("unavailable", "runtime_disabled", "Local Supplier Operations are unavailable.");
    const resolved = resolveLocalSupplierOperatorAuthority(this.runtime.configuration, this.verifier);
    return resolved.status === "authorized"
      ? { authority: resolved.authority }
      : failure("unavailable", "unauthorized", "Local Supplier Operations are unavailable.");
  }

  private buildProjection(): LocalSupplierOperatorProjection {
    const assignments = this.runtime.assignments.list?.() ?? [];
    const workOrders = this.runtime.workOrders.list?.() ?? [];
    const production = this.runtime.production.list?.() ?? [];
    const warehouse = this.runtime.production.listWarehouseReceipts?.() ?? [];
    const productionProjections = production.map((operation) => productionProjection(operation, this.readExpectedQuantity(operation.productionUnit)));
    const productionInitialization = this.buildProductionInitialization(workOrders);
    return {
      notice: LOCAL_SUPPLIER_OPERATOR_NOTICE,
      source: "local_fake",
      suppliers: this.runtime.dataset.suppliers.map((supplier) => ({
        supplierId: supplier.supplierId,
        displayName: supplier.displayName,
        platform: supplier.platform,
        sourceUrl: supplier.sourceUrl,
        status: supplier.status,
        canShipToShanghaiWarehouse: supplier.canShipToShanghaiWarehouse,
        videoCapability: supplier.videoCapability,
        returnReworkPolicy: supplier.returnReworkPolicy,
        notes: supplier.notes,
        provenance: projectionProvenance(supplier.provenance),
      })),
      offers: this.runtime.dataset.offers.map((offer) => ({
        productionLeadTime: projectSupplierProductionLeadTime(offer.minProductionBusinessDays, offer.maxProductionBusinessDays),
        offerId: offer.offerId,
        supplierId: offer.supplierId,
        sourceProductLabel: offer.sourceProductLabel,
        fulfillmentType: offer.fulfillmentType,
        status: offer.status,
        catalogMappingStatus: offer.catalogMapping.status,
        catalogMappingReason: offer.catalogMapping.reason,
        minProductionBusinessDays: offer.minProductionBusinessDays,
        maxProductionBusinessDays: offer.maxProductionBusinessDays,
        canShipToShanghaiWarehouse: offer.canShipToShanghaiWarehouse,
        sourcePackagedWeightText: offer.sourcePackagedWeightText,
        provenance: projectionProvenance(offer.provenance),
      })),
      variants: this.runtime.dataset.variants.map((variant) => ({
        economics: projectSupplierEconomics(variant, "current_source"),
        supplierOfferVariantId: variant.supplierOfferVariantId,
        offerId: variant.offerId,
        supplierSpecificationKey: variant.supplierSpecificationKey,
        label: variant.label,
        status: variant.status,
        supplierCostCents: variant.supplierCostCents,
        currency: variant.currency,
        pricingBasis: variant.pricingBasis,
        priceUnit: variant.priceUnit,
        optionSurchargeCents: variant.optionSurchargeCents,
        packagedWeightGrams: variant.packagedWeightGrams,
        packagedWeightRawText: variant.packagedWeightRawText,
        packagedWeightReviewStatus: variant.packagedWeightReviewStatus,
        minProductionBusinessDays: variant.minProductionBusinessDays,
        maxProductionBusinessDays: variant.maxProductionBusinessDays,
        dimensionsCm: variant.dimensionsCm,
        rawSourceValue: variant.rawSourceValue,
        reviewStatus: variant.reviewStatus,
        provenance: projectionProvenance(variant.provenance),
      })),
      candidateEvidence: {
        status: "review_required",
        eligibleCandidateCount: 0,
        message: "No approved Product/SKU/specification mapping is available. Supplier selection requires explicit review.",
      },
      queues: {
        awaitingAssignment: { supported: false, items: [], message: "Awaiting-assignment queue is unavailable until an authoritative Order-item list exists." },
        assigned: assignments.map((value) => assignmentProjection(value, this.runtime.orders)),
        workOrders: workOrders.map((value) => workOrderProjection(value, this.runtime.orders)),
        productionInitialization,
        production: productionProjections,
        warehouse: warehouse.map(warehouseProjection),
        readyForOutbound: productionProjections.filter((operation) => operation.currentStatus === "ready_for_outbound"),
      },
    };
  }

  private buildProductionInitialization(workOrders: readonly SupplierWorkOrder[]): readonly ProductionInitializationProjection[] {
    const result: ProductionInitializationProjection[] = [];
    for (const workOrder of workOrders) {
      const productionUnit: SupplierProductionUnitIdentity = {
        canonicalOrder: { ...workOrder.canonicalOrder },
        orderItemId: workOrder.orderItemId,
      };
      const parsedUnit = validateSupplierProductionUnitIdentity(productionUnit);
      if (!parsedUnit.ok) continue;
      try {
        const order = this.runtime.orders.findSnapshotForFulfillmentById(productionUnit.canonicalOrder.internalOrderId);
        if (order.status !== "found"
          || order.snapshot.publicReference !== productionUnit.canonicalOrder.publicReference
          || order.snapshot.status !== "paid"
          || order.snapshot.paymentStatus !== "succeeded") continue;
        const assignment = this.runtime.assignments.findByProductionUnit(productionUnit);
        if (assignment.status !== "found"
          || !sameSupplierProductionUnit(assignment.assignment.productionUnit, productionUnit)
          || assignment.assignment.assignmentId !== workOrder.supplier.assignmentId) continue;
        const canonicalWorkOrder = this.runtime.workOrders.findByProductionUnit(productionUnit);
        if (canonicalWorkOrder.status !== "found"
          || canonicalWorkOrder.workOrder.workOrderId !== workOrder.workOrderId
          || !sameSupplierProductionUnit({ canonicalOrder: canonicalWorkOrder.workOrder.canonicalOrder, orderItemId: canonicalWorkOrder.workOrder.orderItemId }, productionUnit)
          || canonicalWorkOrder.workOrder.supplier.assignmentId !== assignment.assignment.assignmentId) continue;
        if (this.runtime.production.findByProductionUnit(productionUnit).status === "found") continue;
      } catch {
        continue;
      }
      result.push({
        productionUnit: productionUnitProjection(productionUnit),
        supplierAssignmentId: workOrder.supplier.assignmentId,
        supplierWorkOrderId: workOrder.workOrderId,
        workOrderStatus: "work_order_ready",
        actionAvailable: true,
      });
    }
    return result;
  }

  private requireProductionInitializationAdmission(input: unknown): LocalSupplierOperatorFailure | null {
    if (!isRecord(input)
      || input.expectedCurrentStatus !== "unassigned"
      || input.nextStatus !== "assigned"
      || typeof input.supplierOperationActionId !== "string") return null;
    const parsedUnit = validateSupplierProductionUnitIdentity(input.productionUnit);
    if (!parsedUnit.ok) return null;
    try {
      if (this.runtime.production.findByActionId(input.supplierOperationActionId).status === "found") return null;
      const order = this.runtime.orders.findSnapshotForFulfillmentById(parsedUnit.value.canonicalOrder.internalOrderId);
      if (order.status !== "found" || order.snapshot.publicReference !== parsedUnit.value.canonicalOrder.publicReference) {
        return failure("unavailable", "order_unavailable", "The canonical Local Order is unavailable.");
      }
      const assignment = this.runtime.assignments.findByProductionUnit(parsedUnit.value);
      if (assignment.status !== "found" || !sameSupplierProductionUnit(assignment.assignment.productionUnit, parsedUnit.value)) {
        return failure("unavailable", "assignment_unavailable", "The supplier assignment is unavailable.");
      }
      const workOrder = this.runtime.workOrders.findByProductionUnit(parsedUnit.value);
      if (workOrder.status !== "found"
        || !sameSupplierProductionUnit({ canonicalOrder: workOrder.workOrder.canonicalOrder, orderItemId: workOrder.workOrder.orderItemId }, parsedUnit.value)
        || workOrder.workOrder.supplier.assignmentId !== assignment.assignment.assignmentId) {
        return failure("unavailable", "work_order_unavailable", "The SupplierWorkOrder is unavailable.");
      }
      if (this.runtime.production.findByProductionUnit(parsedUnit.value).status === "found") return null;
    } catch {
      return failure("unavailable", "unavailable", "Supplier Production Operations are unavailable.");
    }
    return null;
  }

  private workOrderPorts() {
    return {
      orders: this.runtime.orders,
      configuredItems: this.runtime.configuredItems ?? createLocalConfiguredItemReadAdapter(this.runtime.orders),
      fulfillments: this.runtime.fulfillments,
      assignments: this.runtime.assignments,
    };
  }

  private resolveCandidateInput(value: unknown):
    | { readonly ok: true; readonly value: SupplierCandidateInput }
    | { readonly ok: false; readonly failure: LocalSupplierOperatorFailure } {
    if (!isRecord(value)) return { ok: false, failure: failure("invalid", "invalid_type", "Supplier candidate input is invalid.") };
    if ("candidateInput" in value || "selection" in value || "productId" in value || "productSlug" in value || "catalogVariantId" in value || "skuCode" in value || "selectedOptions" in value) {
      return { ok: false, failure: failure("invalid", "authority_field", "Canonical Supplier selection is server-resolved.") };
    }
    const productionUnit = validateSupplierProductionUnitIdentity(value.productionUnit);
    if (!productionUnit.ok) return { ok: false, failure: failure("invalid", "invalid_format", "Supplier production unit is invalid.") };
    if (typeof value.shanghaiWarehouseRequired !== "boolean") return { ok: false, failure: failure("invalid", "invalid_format", "Shanghai warehouse requirement must be boolean.") };
    const selection = readCanonicalSupplierSelection(
      this.runtime.configuredItems ?? createLocalConfiguredItemReadAdapter(this.runtime.orders),
      productionUnit.value,
    );
    if (!selection.ok) return { ok: false, failure: failure("unavailable", "configured_item_unavailable", "Canonical configured Order item is unavailable.") };
    return { ok: true, value: { selection: selection.value, shanghaiWarehouseRequired: value.shanghaiWarehouseRequired } };
  }

  private productionPorts() {
    return {
      orders: this.runtime.orders,
      configuredItems: this.runtime.configuredItems ?? createLocalConfiguredItemReadAdapter(this.runtime.orders),
      assignments: this.runtime.assignments,
      workOrders: this.runtime.workOrders,
      fulfillments: this.runtime.fulfillments,
    };
  }

  private readExpectedQuantity(value: SupplierProductionUnitIdentity): number | null {
    const configuredItems = this.runtime.configuredItems ?? createLocalConfiguredItemReadAdapter(this.runtime.orders);
    try {
      const result = configuredItems.findConfiguredItem({
        internalOrderId: value.canonicalOrder.internalOrderId,
        publicOrderReference: value.canonicalOrder.publicReference,
        orderItemId: value.orderItemId,
      });
      return result.status === "found" && result.item.fulfillmentType === "physical" && Number.isInteger(result.item.quantity) && result.item.quantity > 0
        ? result.item.quantity
        : null;
    } catch {
      return null;
    }
  }

  private mapServiceResult(result: unknown): LocalSupplierOperatorResult {
    if (isRecord(result) && (result.status === "committed" || result.status === "replayed")) return { status: result.status, result };
    if (isRecord(result) && (result.status === "conflict" || result.status === "rejected" || result.status === "unavailable" || result.status === "invalid")) return { status: result.status, issues: Array.isArray(result.issues) ? result.issues as OperatorIssue[] : [issue("unavailable", "Supplier operation is unavailable.")] };
    return failure("unavailable", "unavailable", "Supplier operation is unavailable.");
  }
}

export type { SupplierDomainDataset };
