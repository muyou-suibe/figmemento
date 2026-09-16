export interface SupplierOperatorProductionUnitFields {
  readonly internalOrderId: string;
  readonly publicOrderReference: string;
  readonly orderItemId: string;
}

export interface SupplierOperatorCandidateIdentity {
  readonly supplierId: string;
  readonly offerId: string;
  readonly supplierOfferVariantId: string;
}

export interface SupplierOperatorProductionUnit {
  readonly canonicalOrder: {
    readonly internalOrderId: string;
    readonly publicReference: string;
  };
  readonly orderItemId: string;
}

export interface SupplierOperatorActionRequest {
  readonly action: string;
  readonly input: Record<string, unknown>;
}

export function buildResolveProductionUnitsAction(publicOrderReference: string): SupplierOperatorActionRequest {
  return {
    action: "resolve_production_units",
    input: { publicOrderReference },
  };
}

function productionUnit(fields: SupplierOperatorProductionUnitFields): SupplierOperatorProductionUnit {
  return {
    canonicalOrder: {
      internalOrderId: fields.internalOrderId,
      publicReference: fields.publicOrderReference,
    },
    orderItemId: fields.orderItemId,
  };
}

export function buildInspectCandidatesAction(
  fields: SupplierOperatorProductionUnitFields,
  shanghaiWarehouseRequired: boolean,
): SupplierOperatorActionRequest {
  return {
    action: "inspect_candidates",
    input: { productionUnit: productionUnit(fields), shanghaiWarehouseRequired },
  };
}

export function buildAssignSupplierAction(
  fields: SupplierOperatorProductionUnitFields,
  assignmentActionId: string,
  selectedCandidate: SupplierOperatorCandidateIdentity,
  shanghaiWarehouseRequired: boolean,
): SupplierOperatorActionRequest {
  return {
    action: "assign",
    input: {
      assignmentActionId,
      productionUnit: productionUnit(fields),
      selectedCandidate,
      shanghaiWarehouseRequired,
    },
  };
}

export function buildCreateWorkOrderAction(
  fields: SupplierOperatorProductionUnitFields,
  workOrderActionId: string,
): SupplierOperatorActionRequest {
  return {
    action: "create_work_order",
    input: { workOrderActionId, productionUnit: productionUnit(fields) },
  };
}

export function buildAdvanceProductionAction(
  fields: SupplierOperatorProductionUnitFields,
  supplierOperationActionId: string,
  expectedCurrentStatus: string,
  nextStatus: string,
): SupplierOperatorActionRequest {
  return {
    action: "advance_production",
    input: {
      supplierOperationActionId,
      productionUnit: productionUnit(fields),
      expectedCurrentStatus,
      nextStatus,
    },
  };
}

export function buildInitializeSupplierProductionAction(
  fields: SupplierOperatorProductionUnitFields,
  supplierOperationActionId: string,
): SupplierOperatorActionRequest {
  return buildAdvanceProductionAction(fields, supplierOperationActionId, "unassigned", "assigned");
}

export function productionActionKind(
  currentStatus: string,
  nextStatus: string | null,
): "advance_production" | "record_receipt" | null {
  if (currentStatus === "en_route_to_warehouse") return "record_receipt";
  return nextStatus === null ? null : "advance_production";
}

export function buildRecordReceiptAction(input: {
  readonly fields: SupplierOperatorProductionUnitFields;
  readonly warehouseReceiptActionId: string;
  readonly supplierAssignmentId: string;
  readonly supplierWorkOrderId: string;
  readonly supplierProductionOperationId: string;
  readonly expectedQuantity: number;
  readonly receivedQuantity: number;
  readonly damageReported: boolean;
  readonly notes: string | null;
}): SupplierOperatorActionRequest {
  return {
    action: "record_receipt",
    input: {
      warehouseReceiptActionId: input.warehouseReceiptActionId,
      productionUnit: productionUnit(input.fields),
      supplierAssignmentId: input.supplierAssignmentId,
      supplierWorkOrderId: input.supplierWorkOrderId,
      supplierProductionOperationId: input.supplierProductionOperationId,
      expectedQuantity: input.expectedQuantity,
      receivedQuantity: input.receivedQuantity,
      damageReported: input.damageReported,
      notes: input.notes,
    },
  };
}

export function buildRecordQcAction(input: {
  readonly fields: SupplierOperatorProductionUnitFields;
  readonly warehouseQcActionId: string;
  readonly warehouseReceiptId: string;
  readonly supplierAssignmentId: string;
  readonly supplierWorkOrderId: string;
  readonly supplierProductionOperationId: string;
  readonly qcDecision: "accepted" | "blocked";
  readonly notes: string | null;
}): SupplierOperatorActionRequest {
  return {
    action: "record_qc",
    input: {
      warehouseQcActionId: input.warehouseQcActionId,
      productionUnit: productionUnit(input.fields),
      warehouseReceiptId: input.warehouseReceiptId,
      supplierAssignmentId: input.supplierAssignmentId,
      supplierWorkOrderId: input.supplierWorkOrderId,
      supplierProductionOperationId: input.supplierProductionOperationId,
      qcDecision: input.qcDecision,
      notes: input.notes,
    },
  };
}

export function buildReadyForOutboundAction(input: {
  readonly fields: SupplierOperatorProductionUnitFields;
  readonly warehouseOutboundActionId: string;
  readonly warehouseReceiptId: string;
  readonly supplierAssignmentId: string;
  readonly supplierWorkOrderId: string;
  readonly supplierProductionOperationId: string;
}): SupplierOperatorActionRequest {
  return {
    action: "mark_ready_for_outbound",
    input: {
      warehouseOutboundActionId: input.warehouseOutboundActionId,
      productionUnit: productionUnit(input.fields),
      warehouseReceiptId: input.warehouseReceiptId,
      supplierAssignmentId: input.supplierAssignmentId,
      supplierWorkOrderId: input.supplierWorkOrderId,
      supplierProductionOperationId: input.supplierProductionOperationId,
    },
  };
}
