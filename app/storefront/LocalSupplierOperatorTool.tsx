"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  buildAdvanceProductionAction,
  buildAssignSupplierAction,
  buildCreateWorkOrderAction,
  buildInspectCandidatesAction,
  buildInitializeSupplierProductionAction,
  buildResolveProductionUnitsAction,
  buildReadyForOutboundAction,
  productionActionKind,
  buildRecordQcAction,
  buildRecordReceiptAction,
  type SupplierOperatorActionRequest,
  type SupplierOperatorCandidateIdentity,
  type SupplierOperatorProductionUnitFields,
} from "../client/local-supplier-operator-actions.ts";
import styles from "./catalog-storefront.module.css";
import type { SupplierEconomicsProjection } from "../application/local-supplier-economics.ts";
import { SupplierEconomicsDetails } from "./SupplierEconomicsDetails";

type SupplierRecord = {
  readonly provenance: readonly SourceReviewRecord[];
  readonly supplierId: string;
  readonly displayName: string;
  readonly platform: string;
  readonly sourceUrl: string | null;
  readonly status: string;
  readonly canShipToShanghaiWarehouse: boolean | null;
  readonly videoCapability: string;
  readonly returnReworkPolicy: string | null;
};

type OfferRecord = {
  readonly provenance: readonly SourceReviewRecord[];
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
};

type VariantRecord = {
  readonly economics: SupplierEconomicsProjection;
  readonly supplierOfferVariantId: string;
  readonly offerId: string;
  readonly supplierSpecificationKey: string;
  readonly label: string;
  readonly status: string;
  readonly supplierCostCents: number | null;
  readonly currency: string | null;
  readonly pricingBasis: string;
  readonly packagedWeightGrams: number | null;
  readonly packagedWeightRawText: string | null;
  readonly packagedWeightReviewStatus: string;
  readonly reviewStatus: string;
};

type QueueUnit = SupplierOperatorProductionUnitFields;
type ResolvedUnit = QueueUnit & {
  readonly productName: string;
  readonly productSlug: string;
  readonly variantId: string;
  readonly skuCode: string;
  readonly selectedOptions: readonly { readonly optionId: string; readonly valueId: string }[];
  readonly quantity: number;
  readonly fulfillmentType: "physical";
};
type ProductionUnitResolution = {
  readonly notice: "DEVELOPMENT / TEST ONLY";
  readonly publicOrderReference: string;
  readonly status: "resolved" | "no_physical_units";
  readonly productionUnits: readonly ResolvedUnit[];
};
type ProductionStatus = string;
type Selection = {
  readonly internalOrderId: string;
  readonly publicOrderReference: string;
  readonly orderItemId: string;
  readonly productId: string;
  readonly productSlug: string;
  readonly catalogVariantId: string;
  readonly skuCode: string;
  readonly selectedOptions: readonly { readonly optionId: string; readonly valueId: string }[];
  readonly fulfillmentType: string;
  readonly quantity: number;
};

type Candidate = {
  readonly economics: SupplierEconomicsProjection;
  readonly supplierId: string;
  readonly offerId: string;
  readonly supplierOfferVariantId: string;
  readonly supplierSpecificationKey: string;
  readonly supplierDisplayName: string;
  readonly sourceProductLabel: string;
  readonly productId: string;
  readonly productSlug: string;
  readonly catalogVariantId: string;
  readonly skuCode: string;
  readonly selectedOptions: readonly { readonly optionId: string; readonly valueId: string }[];
  readonly quantity: number;
  readonly fulfillmentType: string;
  readonly supplierCostCents: number | null;
  readonly currency: string | null;
  readonly packagedWeightGrams: number | null;
  readonly minProductionBusinessDays: number | null;
  readonly maxProductionBusinessDays: number | null;
  readonly canShipToShanghaiWarehouse: boolean | null;
  readonly reviewStatus: string;
  readonly productionUnit: { readonly canonicalOrder: { readonly internalOrderId: string; readonly publicReference: string }; readonly orderItemId: string };
};

type CandidateInspection = {
  readonly notice: "DEVELOPMENT / TEST ONLY";
  readonly candidateResult: {
    readonly status: string;
    readonly input?: { readonly selection: Selection; readonly shanghaiWarehouseRequired: boolean };
    readonly candidates: readonly Candidate[];
    readonly issues?: readonly { readonly message: string }[];
  };
};

type Assignment = {
  readonly economics: SupplierEconomicsProjection;
  readonly assignmentId: string;
  readonly assignmentActionId: string;
  readonly productionUnit: QueueUnit;
  readonly supplierId: string;
  readonly offerId: string;
  readonly supplierOfferVariantId: string;
  readonly supplierSpecificationKey: string;
  readonly assignedAt: string;
};

type WorkOrder = {
  readonly economics: SupplierEconomicsProjection;
  readonly workOrderId: string;
  readonly workOrderActionId: string;
  readonly productionUnit: QueueUnit;
  readonly supplierAssignmentId: string;
  readonly status: string;
  readonly createdAt: string;
};

type Production = {
  readonly operationId: string;
  readonly productionUnit: QueueUnit;
  readonly assignmentId: string;
  readonly workOrderId: string | null;
  readonly currentStatus: ProductionStatus;
  readonly nextStatus: ProductionStatus | null;
  readonly actionAvailable: boolean;
  readonly expectedQuantity: number | null;
  readonly updatedAt: string;
};

type ProductionInitialization = {
  readonly productionUnit: QueueUnit;
  readonly supplierAssignmentId: string;
  readonly supplierWorkOrderId: string;
  readonly workOrderStatus: "work_order_ready";
  readonly actionAvailable: boolean;
};

type Warehouse = {
  readonly warehouseReceiptId: string;
  readonly productionUnit: QueueUnit;
  readonly supplierAssignmentId: string;
  readonly supplierWorkOrderId: string;
  readonly supplierProductionOperationId: string;
  readonly receiptStatus: string;
  readonly expectedQuantity: number;
  readonly receivedQuantity: number;
  readonly discrepancy: { readonly direction: string; readonly expectedQuantity: number; readonly receivedQuantity: number } | null;
  readonly damageReported: boolean;
  readonly qcStatus: string;
  readonly readyForOutbound: boolean;
  readonly receivedAt: string;
};

type Projection = {
  readonly notice: "DEVELOPMENT / TEST ONLY";
  readonly source: "local_fake";
  readonly suppliers: readonly SupplierRecord[];
  readonly offers: readonly OfferRecord[];
  readonly variants: readonly VariantRecord[];
  readonly candidateEvidence: { readonly status: string; readonly eligibleCandidateCount: number; readonly message: string };
  readonly queues: {
    readonly awaitingAssignment: { readonly supported: false; readonly items: readonly []; readonly message: string };
    readonly assigned: readonly Assignment[];
    readonly workOrders: readonly WorkOrder[];
    readonly productionInitialization: readonly ProductionInitialization[];
    readonly production: readonly Production[];
    readonly warehouse: readonly Warehouse[];
    readonly readyForOutbound: readonly Production[];
  };
};

type ReceiptDraft = { readonly receivedQuantity: string; readonly damageReported: boolean; readonly notes: string };
type ReadState = "idle" | "loading" | "unavailable" | "found";
type MutationIntent = SupplierOperatorActionRequest & { readonly label: string };

type SourceReviewRecord = { readonly sourceRow: number; readonly sourceUrl: string | null; readonly reviewStatus: string; readonly reviewNote: string };

function SourceReview({ entries }: { readonly entries: readonly SourceReviewRecord[] }) {
  return <details><summary>Source review evidence</summary>{entries.length === 0 ? <p>Unknown</p> : <ul>{entries.map((entry, index) => <li key={`${entry.sourceRow}-${index}`}>Row {entry.sourceRow} · {entry.reviewStatus} · {entry.reviewNote}{entry.sourceUrl ? ` · ${entry.sourceUrl}` : ""}</li>)}</ul>}</details>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isProjection(value: unknown): value is Projection {
  return isRecord(value)
    && value.notice === "DEVELOPMENT / TEST ONLY"
    && value.source === "local_fake"
    && Array.isArray(value.suppliers)
    && Array.isArray(value.offers)
    && Array.isArray(value.variants)
    && isRecord(value.candidateEvidence)
    && isRecord(value.queues)
    && Array.isArray(value.queues.assigned)
    && Array.isArray(value.queues.workOrders)
    && Array.isArray(value.queues.productionInitialization)
    && Array.isArray(value.queues.production)
    && Array.isArray(value.queues.warehouse)
    && Array.isArray(value.queues.readyForOutbound)
    && isRecord(value.queues.awaitingAssignment);
}

function isCandidateInspection(value: unknown): value is CandidateInspection {
  return isRecord(value)
    && value.notice === "DEVELOPMENT / TEST ONLY"
    && isRecord(value.candidateResult)
    && typeof value.candidateResult.status === "string"
    && Array.isArray(value.candidateResult.candidates);
}

function isProductionUnitResolution(value: unknown): value is ProductionUnitResolution {
  return isRecord(value)
    && value.notice === "DEVELOPMENT / TEST ONLY"
    && typeof value.publicOrderReference === "string"
    && (value.status === "resolved" || value.status === "no_physical_units")
    && Array.isArray(value.productionUnits)
    && value.productionUnits.every((unit) => isRecord(unit)
      && typeof unit.internalOrderId === "string"
      && typeof unit.publicOrderReference === "string"
      && typeof unit.orderItemId === "string"
      && typeof unit.productName === "string"
      && typeof unit.productSlug === "string"
      && typeof unit.variantId === "string"
      && typeof unit.skuCode === "string"
      && Array.isArray(unit.selectedOptions)
      && typeof unit.quantity === "number"
      && Number.isInteger(unit.quantity)
      && unit.quantity > 0
      && unit.fulfillmentType === "physical");
}

function display(value: unknown): string {
  return value === null || value === undefined || value === "" ? "Unknown" : String(value);
}

function formatOptions(options: readonly { readonly optionId: string; readonly valueId: string }[]): string {
  return options.length === 0 ? "None" : options.map((option) => `${option.optionId}=${option.valueId}`).join(", ");
}

function formatStatus(value: string): string {
  return value.replaceAll("_", " ");
}

function unitKey(unit: QueueUnit): string {
  return `${unit.internalOrderId}:${unit.orderItemId}`;
}

function fieldsFromUnit(unit: QueueUnit): SupplierOperatorProductionUnitFields {
  return unit;
}

function fieldsFromCandidate(candidate: Candidate): SupplierOperatorProductionUnitFields {
  return {
    internalOrderId: candidate.productionUnit.canonicalOrder.internalOrderId,
    publicOrderReference: candidate.productionUnit.canonicalOrder.publicReference,
    orderItemId: candidate.productionUnit.orderItemId,
  };
}

function newActionId(): string {
  return window.crypto.randomUUID();
}

export function LocalSupplierOperatorTool({ runtimeEnabled }: { readonly runtimeEnabled: boolean }) {
  const [state, setState] = useState<ReadState>(runtimeEnabled ? "loading" : "idle");
  const [projection, setProjection] = useState<Projection | null>(null);
  const [publicOrderReference, setPublicOrderReference] = useState("");
  const [resolutionState, setResolutionState] = useState<ReadState>("idle");
  const [resolution, setResolution] = useState<ProductionUnitResolution | null>(null);
  const [selectedUnitKey, setSelectedUnitKey] = useState<string | null>(null);
  const [unit, setUnit] = useState<SupplierOperatorProductionUnitFields | null>(null);
  const [shanghaiWarehouseRequired, setShanghaiWarehouseRequired] = useState(true);
  const [candidateInspection, setCandidateInspection] = useState<CandidateInspection | null>(null);
  const [selectedCandidateKey, setSelectedCandidateKey] = useState<string | null>(null);
  const [candidateState, setCandidateState] = useState<"idle" | "loading" | "unavailable">("idle");
  const [receiptDrafts, setReceiptDrafts] = useState<Record<string, ReceiptDraft>>({});
  const [mutationState, setMutationState] = useState<"idle" | "submitting" | "transport_retry">("idle");
  const [mutationMessage, setMutationMessage] = useState<string | null>(null);
  const retryIntent = useRef<MutationIntent | null>(null);
  const [retryIntentState, setRetryIntentState] = useState<MutationIntent | null>(null);

  const load = useCallback(async () => {
    if (!runtimeEnabled) return;
    setState("loading");
    try {
      const response = await fetch("/api/local-suppliers/operator", { credentials: "same-origin", cache: "no-store" });
      const value = await response.json().catch(() => null) as unknown;
      if (!response.ok || !isProjection(value)) {
        setProjection(null);
        setState("unavailable");
        return;
      }
      setProjection(value);
      setState("found");
    } catch {
      setProjection(null);
      setState("unavailable");
    }
  }, [runtimeEnabled]);

  useEffect(() => {
    if (!runtimeEnabled) return;
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load, runtimeEnabled]);

  function resetResolvedUnitState(value: string) {
    setPublicOrderReference(value);
    setResolutionState("idle");
    setResolution(null);
    setSelectedUnitKey(null);
    setUnit(null);
    setCandidateInspection(null);
    setSelectedCandidateKey(null);
    setCandidateState("idle");
  }

  async function resolveProductionUnits() {
    setResolutionState("loading");
    setResolution(null);
    setSelectedUnitKey(null);
    setUnit(null);
    setCandidateInspection(null);
    setSelectedCandidateKey(null);
    setCandidateState("idle");
    try {
      const request = buildResolveProductionUnitsAction(publicOrderReference);
      const response = await fetch("/api/local-suppliers/operator", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(request),
      });
      const value = await response.json().catch(() => null) as unknown;
      if (!response.ok || !isProductionUnitResolution(value)) {
        setResolutionState("unavailable");
        return;
      }
      setResolution(value);
      setResolutionState("found");
      if (value.productionUnits.length === 1) {
        const onlyUnit = value.productionUnits[0];
        setSelectedUnitKey(unitKey(onlyUnit));
        setUnit(fieldsFromUnit(onlyUnit));
      }
    } catch {
      setResolutionState("unavailable");
    }
  }

  async function inspectCandidates() {
    if (!unit) {
      setCandidateState("unavailable");
      return;
    }
    setCandidateState("loading");
    setCandidateInspection(null);
    setSelectedCandidateKey(null);
    try {
      const request = buildInspectCandidatesAction(unit, shanghaiWarehouseRequired);
      const response = await fetch("/api/local-suppliers/operator", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(request),
      });
      const value = await response.json().catch(() => null) as unknown;
      if (!response.ok || !isCandidateInspection(value)) {
        setCandidateState("unavailable");
        return;
      }
      setCandidateInspection(value);
      setCandidateState("idle");
    } catch {
      setCandidateState("unavailable");
    }
  }

  async function sendMutation(intent: MutationIntent) {
    if (mutationState === "submitting") return;
    setMutationState("submitting");
    setMutationMessage(null);
    try {
      const response = await fetch("/api/local-suppliers/operator", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ action: intent.action, input: intent.input }),
      });
      const value = await response.json().catch(() => null) as unknown;
      if (!response.ok || !isRecord(value) || (value.status !== "committed" && value.status !== "replayed")) {
        retryIntent.current = null;
        setRetryIntentState(null);
        setMutationState("idle");
        setMutationMessage("The supplier action was rejected or is unavailable.");
        return;
      }
      retryIntent.current = null;
      setRetryIntentState(null);
      setMutationState("idle");
      setMutationMessage(`${intent.label} ${value.status}.`);
      await load();
    } catch {
      retryIntent.current = intent;
      setRetryIntentState(intent);
      setMutationState("transport_retry");
      setMutationMessage("The connection was interrupted. Retry the same supplier request.");
    }
  }

  function startMutation(request: SupplierOperatorActionRequest, label: string) {
    const intent = { ...request, label, input: { ...request.input } };
    retryIntent.current = intent;
    void sendMutation(intent);
  }

  function selectResolvedUnit(value: ResolvedUnit) {
    setSelectedUnitKey(unitKey(value));
    setUnit(fieldsFromUnit(value));
    setCandidateInspection(null);
    setSelectedCandidateKey(null);
  }

  function updateReceipt(unitId: string, update: Partial<ReceiptDraft>) {
    setReceiptDrafts((current) => {
      const existing = current[unitId] ?? { receivedQuantity: "1", damageReported: false, notes: "" };
      return { ...current, [unitId]: { ...existing, ...update } };
    });
  }

  function receiptDraftFor(value: Production): ReceiptDraft {
    return receiptDrafts[unitKey(value.productionUnit)] ?? { receivedQuantity: String(value.expectedQuantity ?? 1), damageReported: false, notes: "" };
  }

  function assignSelectedCandidate(candidate: Candidate) {
    const selectedCandidate: SupplierOperatorCandidateIdentity = {
      supplierId: candidate.supplierId,
      offerId: candidate.offerId,
      supplierOfferVariantId: candidate.supplierOfferVariantId,
    };
    startMutation(
      buildAssignSupplierAction(fieldsFromCandidate(candidate), newActionId(), selectedCandidate, shanghaiWarehouseRequired),
      "Supplier assignment",
    );
  }

  function createWorkOrder(value: Assignment) {
    startMutation(buildCreateWorkOrderAction(fieldsFromUnit(value.productionUnit), newActionId()), "WorkOrder creation");
  }

  function initializeSupplierProduction(value: ProductionInitialization) {
    startMutation(
      buildInitializeSupplierProductionAction(value.productionUnit, newActionId()),
      "Supplier Production initialization",
    );
  }

  function advanceProduction(value: Production) {
    if (!value.nextStatus) return;
    startMutation(
      buildAdvanceProductionAction(fieldsFromUnit(value.productionUnit), newActionId(), value.currentStatus, value.nextStatus),
      `Production ${formatStatus(value.nextStatus)}`,
    );
  }

  function recordReceipt(value: Production) {
    if (value.expectedQuantity === null || value.workOrderId === null) return;
    const draft = receiptDraftFor(value);
    const receivedQuantity = Number(draft.receivedQuantity);
    if (!Number.isInteger(receivedQuantity) || receivedQuantity < 1) {
      setMutationMessage("Received quantity must be a positive whole number.");
      return;
    }
    startMutation(buildRecordReceiptAction({
      fields: fieldsFromUnit(value.productionUnit),
      warehouseReceiptActionId: newActionId(),
      supplierAssignmentId: value.assignmentId,
      supplierWorkOrderId: value.workOrderId,
      supplierProductionOperationId: value.operationId,
      expectedQuantity: value.expectedQuantity,
      receivedQuantity,
      damageReported: draft.damageReported,
      notes: draft.notes.trim() || null,
    }), "Warehouse Receipt");
  }

  function recordQc(value: Warehouse, qcDecision: "accepted" | "blocked") {
    startMutation(buildRecordQcAction({
      fields: fieldsFromUnit(value.productionUnit),
      warehouseQcActionId: newActionId(),
      warehouseReceiptId: value.warehouseReceiptId,
      supplierAssignmentId: value.supplierAssignmentId,
      supplierWorkOrderId: value.supplierWorkOrderId,
      supplierProductionOperationId: value.supplierProductionOperationId,
      qcDecision,
      notes: null,
    }), "Warehouse QC");
  }

  function markReady(value: Warehouse) {
    startMutation(buildReadyForOutboundAction({
      fields: fieldsFromUnit(value.productionUnit),
      warehouseOutboundActionId: newActionId(),
      warehouseReceiptId: value.warehouseReceiptId,
      supplierAssignmentId: value.supplierAssignmentId,
      supplierWorkOrderId: value.supplierWorkOrderId,
      supplierProductionOperationId: value.supplierProductionOperationId,
    }), "Outbound readiness");
  }

  if (!runtimeEnabled) {
    return <section className={`${styles.fusionFulfillment} ${styles.operatorTool} ${styles.supplierOperator}`} aria-label="Local Supplier operator tool"><p className={styles.fixtureNotice}>DEVELOPMENT / TEST ONLY — Local Supplier Operations are unavailable in this runtime.</p></section>;
  }

  const selectedCandidate = candidateInspection?.candidateResult.candidates.find((candidate) => `${candidate.supplierId}:${candidate.offerId}:${candidate.supplierOfferVariantId}` === selectedCandidateKey) ?? null;
  const candidateResult = candidateInspection?.candidateResult;
  const queues = projection?.queues;

  return <section className={`${styles.fusionFulfillment} ${styles.operatorTool} ${styles.supplierOperator}`} aria-labelledby="supplier-operator-heading">
    <div className={styles.operatorToolHeader}>
      <p className={styles.eyebrow}>Internal operations</p>
      <h1 className={styles.title} id="supplier-operator-heading">Supplier operations<br /><em>for local review.</em></h1>
      <p className={styles.fixtureNotice}>DEVELOPMENT / TEST ONLY — Server-side operator authority. No supplier API, warehouse provider, Shipment, or Tracking integration.</p>
    </div>

    <form className={styles.operatorToolForm} onSubmit={(event) => { event.preventDefault(); void resolveProductionUnits(); }}>
      <div className={styles.operatorToolField}><label htmlFor="supplier-public-order-reference">Public Order reference</label><input id="supplier-public-order-reference" value={publicOrderReference} onChange={(event) => resetResolvedUnitState(event.target.value)} autoComplete="off" /></div>
      <button className={styles.primaryLink} type="submit" disabled={resolutionState === "loading"}>{resolutionState === "loading" ? "Resolving Order items…" : "Resolve Order items"}</button>
    </form>

    {state === "loading" && <p role="status">Loading supplier surface…</p>}
    {state === "unavailable" && <p className={styles.checkoutFeedback} role="alert">Supplier Operations are unavailable. Verify local source and server-only operator mode.</p>}
    {resolutionState === "unavailable" && <p className={styles.checkoutFeedback} role="alert">Order items are unavailable. No supplier or Order existence details were disclosed.</p>}
    {candidateState === "unavailable" && <p className={styles.checkoutFeedback} role="alert">Candidate inspection is unavailable. No supplier or Order existence details were disclosed.</p>}
    {mutationMessage && <p className={styles.checkoutFeedback} role="status">{mutationMessage}</p>}
    {mutationState === "transport_retry" && retryIntentState && <div className={styles.operatorToolActions}><button className={styles.primaryLink} type="button" onClick={() => void sendMutation(retryIntentState)}>Retry same supplier request</button></div>}

    {resolution && <section className={styles.supplierOperatorNotice} aria-labelledby="production-unit-result-heading">
      <h2 id="production-unit-result-heading">Server-resolved production units</h2>
      <p role="status"><strong>{formatStatus(resolution.status)}</strong> · {resolution.publicOrderReference}</p>
      {resolution.productionUnits.length === 0 && <p>No physical production unit is available for this Order.</p>}
      {resolution.productionUnits.length > 0 && <fieldset><legend>Select the Order item for Supplier operations</legend>{resolution.productionUnits.map((value) => <label key={unitKey(value)}><input type="radio" name="supplier-production-unit" aria-label={`Select ${value.productName}`} checked={selectedUnitKey === unitKey(value)} onChange={() => selectResolvedUnit(value)} /> <strong>{value.productName}</strong> · {value.productSlug} · {value.variantId} / {value.skuCode} · {formatOptions(value.selectedOptions)} · Qty {value.quantity} · {value.fulfillmentType}</label>)}</fieldset>}
    </section>}

    {resolution && resolution.productionUnits.length > 0 && <form className={styles.operatorToolForm} onSubmit={(event) => { event.preventDefault(); void inspectCandidates(); }}>
      <label><input type="checkbox" checked={shanghaiWarehouseRequired} onChange={(event) => setShanghaiWarehouseRequired(event.target.checked)} /> Shanghai warehouse required</label>
      <button className={styles.primaryLink} type="submit" disabled={!unit || candidateState === "loading"}>{candidateState === "loading" ? "Inspecting candidates…" : "Inspect Candidates"}</button>
    </form>}

    {candidateResult && <section className={styles.supplierOperatorNotice} aria-labelledby="candidate-result-heading">
      <h2 id="candidate-result-heading">Candidate evidence</h2>
      <p role="status"><strong>{formatStatus(candidateResult.status)}</strong>{candidateResult.issues?.[0]?.message ? ` · ${candidateResult.issues[0].message}` : ""}</p>
      {candidateResult.input?.selection && <div className={styles.supplierTableWrap}><table><caption className={styles.visuallyHidden}>Canonical configured item resolved by the server</caption><thead><tr><th scope="col">Product</th><th scope="col">Catalog Variant / SKU</th><th scope="col">Options</th><th scope="col">Quantity</th><th scope="col">Fulfillment</th></tr></thead><tbody><tr><th scope="row">{candidateResult.input.selection.productSlug}</th><td>{candidateResult.input.selection.catalogVariantId}<br />{candidateResult.input.selection.skuCode}</td><td>{formatOptions(candidateResult.input.selection.selectedOptions)}</td><td>{candidateResult.input.selection.quantity}</td><td>{candidateResult.input.selection.fulfillmentType}</td></tr></tbody></table></div>}
      {candidateResult.candidates.length > 0 && <div className={styles.supplierTableWrap}><table><caption className={styles.visuallyHidden}>Explicit supplier candidates</caption><thead><tr><th scope="col">Choose</th><th scope="col">Supplier</th><th scope="col">Offer / Supplier Variant</th><th scope="col">Supplier specification</th><th scope="col">Cost</th><th scope="col">Warehouse</th><th scope="col">Action</th></tr></thead><tbody>{candidateResult.candidates.map((candidate) => { const key = `${candidate.supplierId}:${candidate.offerId}:${candidate.supplierOfferVariantId}`; return <tr key={key}><td><input type="radio" name="supplier-candidate" aria-label={`Select ${candidate.supplierDisplayName}`} checked={selectedCandidateKey === key} onChange={() => setSelectedCandidateKey(key)} /></td><th scope="row">{candidate.supplierDisplayName}<br /><span>{candidate.supplierId}</span></th><td>{candidate.offerId}<br />{candidate.supplierOfferVariantId}</td><td>{candidate.supplierSpecificationKey}<br />{candidate.sourceProductLabel}</td><td><SupplierEconomicsDetails value={candidate.economics} /></td><td>{candidate.canShipToShanghaiWarehouse === true ? "Shanghai supported" : "Review required"}</td><td><button className={styles.secondaryLink} type="button" disabled={mutationState === "submitting" || selectedCandidate !== candidate} onClick={() => assignSelectedCandidate(candidate)}>Assign Supplier</button></td></tr>; })}</tbody></table></div>}
      {candidateResult.candidates.length === 0 && <p>No eligible candidate is available. No automatic cheapest, fastest, first, or heuristic assignment is performed.</p>}
    </section>}

    {projection && <div className={styles.supplierOperatorContent}>
      <section aria-labelledby="supplier-list-heading"><h2 id="supplier-list-heading">Suppliers ({projection.suppliers.length})</h2><div className={styles.supplierTableWrap}><table><caption className={styles.visuallyHidden}>Reviewed local suppliers</caption><thead><tr><th scope="col">Supplier</th><th scope="col">Platform</th><th scope="col">Warehouse</th><th scope="col">Review</th></tr></thead><tbody>{projection.suppliers.map((supplier) => <tr key={supplier.supplierId}><th scope="row">{supplier.displayName}</th><td>{supplier.platform}</td><td>{supplier.canShipToShanghaiWarehouse === true ? "Shanghai supported" : "Review required"}</td><td>{supplier.status}<SourceReview entries={supplier.provenance} /></td></tr>)}</tbody></table></div></section>
      <section aria-labelledby="supplier-offers-heading"><h2 id="supplier-offers-heading">Offers ({projection.offers.length})</h2><div className={styles.supplierTableWrap}><table><caption className={styles.visuallyHidden}>Source-backed supplier offers</caption><thead><tr><th scope="col">Offer</th><th scope="col">Supplier</th><th scope="col">Mapping</th><th scope="col">Production</th></tr></thead><tbody>{projection.offers.map((offer) => <tr key={offer.offerId}><th scope="row">{offer.sourceProductLabel}</th><td>{offer.supplierId}</td><td><strong>{offer.catalogMappingStatus}</strong><br /><span>{offer.catalogMappingReason}</span><SourceReview entries={offer.provenance} /></td><td>{offer.productionLeadTime.status === "known" ? `${offer.productionLeadTime.minProductionBusinessDays}–${offer.productionLeadTime.maxProductionBusinessDays} supplier production business days` : "Production range unavailable"} · excludes transit, customs and delivery</td></tr>)}</tbody></table></div></section>
      <section aria-labelledby="supplier-variants-heading"><h2 id="supplier-variants-heading">Offer variants ({projection.variants.length})</h2><div className={styles.supplierTableWrap}><table><caption className={styles.visuallyHidden}>Supplier specification variants</caption><thead><tr><th scope="col">Supplier Variant</th><th scope="col">Supplier specification</th><th scope="col">Pricing basis</th><th scope="col">Packaged weight</th><th scope="col">Evidence</th></tr></thead><tbody>{projection.variants.map((variant) => <tr key={variant.supplierOfferVariantId}><th scope="row">{variant.supplierOfferVariantId}</th><td>{variant.supplierSpecificationKey}<br />{variant.label}</td><td colSpan={3}><SupplierEconomicsDetails value={variant.economics} /></td></tr>)}</tbody></table></div></section>

      <section aria-labelledby="queue-heading"><h2 id="queue-heading">Operations queues</h2><p className={styles.supplierQueueMessage}>{queues?.awaitingAssignment.message}</p>
        <div className={styles.supplierTableWrap}><table><caption>Assigned supplier candidates</caption><thead><tr><th scope="col">Order / item</th><th scope="col">Supplier / offer</th><th scope="col">Supplier specification</th><th scope="col">Assigned</th><th scope="col">Action</th></tr></thead><tbody>{queues?.assigned.map((value) => <tr key={value.assignmentId}><th scope="row">{value.productionUnit.publicOrderReference}<br />{value.productionUnit.orderItemId}</th><td>{value.supplierId}<br />{value.offerId}<br />{value.supplierOfferVariantId}</td><td>{value.supplierSpecificationKey}</td><td>{value.assignedAt}<SupplierEconomicsDetails value={value.economics} /></td><td><button className={styles.secondaryLink} type="button" disabled={mutationState === "submitting"} onClick={() => createWorkOrder(value)}>Create WorkOrder</button></td></tr>)}</tbody></table></div>
        {queues?.assigned.length === 0 && <p>No assigned supplier items are available.</p>}
      </section>

      <section aria-labelledby="work-orders-heading"><h2 id="work-orders-heading">Work orders ({queues?.workOrders.length ?? 0})</h2><div className={styles.supplierTableWrap}><table><caption>Supplier WorkOrder queue</caption><thead><tr><th scope="col">WorkOrder</th><th scope="col">Order / item</th><th scope="col">Assignment</th><th scope="col">Status</th><th scope="col">Created</th></tr></thead><tbody>{queues?.workOrders.map((value) => <tr key={value.workOrderId}><th scope="row">{value.workOrderId}</th><td>{value.productionUnit.publicOrderReference}<br />{value.productionUnit.orderItemId}</td><td>{value.supplierAssignmentId}</td><td>{value.status}</td><td>{value.createdAt}<SupplierEconomicsDetails value={value.economics} /></td></tr>)}</tbody></table></div>{queues?.workOrders.length === 0 && <p>No SupplierWorkOrder records are available.</p>}</section>

      {queues && queues.productionInitialization.length > 0 && <section aria-labelledby="production-initialization-heading"><h2 id="production-initialization-heading">Initialize Supplier Production</h2><p role="status">A committed WorkOrder is ready for the explicit first Supplier Production action.</p><div className={styles.supplierTableWrap}><table><caption>Supplier Production initialization queue</caption><thead><tr><th scope="col">Order / item</th><th scope="col">Assignment</th><th scope="col">WorkOrder</th><th scope="col">State</th><th scope="col">Action</th></tr></thead><tbody>{queues.productionInitialization.map((value) => <tr key={`${value.productionUnit.internalOrderId}-${value.productionUnit.orderItemId}`}><th scope="row">{value.productionUnit.publicOrderReference}<br />{value.productionUnit.orderItemId}</th><td>{value.supplierAssignmentId}</td><td>{value.supplierWorkOrderId}</td><td>{value.workOrderStatus}</td><td><button className={styles.primaryLink} type="button" disabled={!value.actionAvailable || mutationState === "submitting"} onClick={() => initializeSupplierProduction(value)}>Initialize Supplier Production</button></td></tr>)}</tbody></table></div></section>}

      <section aria-labelledby="production-heading"><h2 id="production-heading">Supplier production ({queues?.production.length ?? 0})</h2><div className={styles.supplierTableWrap}><table><caption>Supplier Production lifecycle queue</caption><thead><tr><th scope="col">Order / item</th><th scope="col">Current state</th><th scope="col">Expected quantity</th><th scope="col">WorkOrder</th><th scope="col">Next server action</th></tr></thead><tbody>{queues?.production.map((value) => { const actionKind = productionActionKind(value.currentStatus, value.nextStatus); return <tr key={value.operationId}><th scope="row">{value.productionUnit.publicOrderReference}<br />{value.productionUnit.orderItemId}</th><td>{formatStatus(value.currentStatus)}</td><td>{value.expectedQuantity === null ? "Unavailable" : `${value.expectedQuantity} unit(s) — server authority`}</td><td>{display(value.workOrderId)}</td><td>{actionKind === "record_receipt" ? "Record Warehouse Receipt below" : actionKind === "advance_production" && value.nextStatus ? <button className={styles.secondaryLink} type="button" disabled={!value.actionAvailable || mutationState === "submitting"} onClick={() => advanceProduction(value)}>Advance to {formatStatus(value.nextStatus)}</button> : "Terminal — no next action"}</td></tr>; })}</tbody></table></div>{queues?.production.length === 0 && <p>No supplier production operations are available.</p>}
        {queues?.production.filter((value) => value.currentStatus === "en_route_to_warehouse").map((value) => { const draft = receiptDraftFor(value); return <form className={styles.operatorToolForm} key={`${value.operationId}-receipt`} onSubmit={(event) => { event.preventDefault(); recordReceipt(value); }}><div className={styles.operatorToolField}><label htmlFor={`receipt-quantity-${value.operationId}`}>Received quantity</label><input id={`receipt-quantity-${value.operationId}`} type="number" min="1" step="1" value={draft.receivedQuantity} onChange={(event) => updateReceipt(unitKey(value.productionUnit), { receivedQuantity: event.target.value })} /></div><label><input type="checkbox" checked={draft.damageReported} onChange={(event) => updateReceipt(unitKey(value.productionUnit), { damageReported: event.target.checked })} /> Damage reported</label><div className={styles.operatorToolField}><label htmlFor={`receipt-notes-${value.operationId}`}>Bounded warehouse notes</label><input id={`receipt-notes-${value.operationId}`} maxLength={500} value={draft.notes} onChange={(event) => updateReceipt(unitKey(value.productionUnit), { notes: event.target.value })} /></div><p>Expected quantity: <strong>{value.expectedQuantity ?? "Unavailable"}</strong> (read-only server projection)</p><button className={styles.primaryLink} type="submit" disabled={value.expectedQuantity === null || value.workOrderId === null || mutationState === "submitting"}>Record Receipt</button></form>; })}
      </section>

      <section aria-labelledby="warehouse-heading"><h2 id="warehouse-heading">Shanghai warehouse / QC ({queues?.warehouse.length ?? 0})</h2><div className={styles.supplierTableWrap}><table><caption>Shanghai Warehouse Receipt and QC queue</caption><thead><tr><th scope="col">Order / item</th><th scope="col">Receipt</th><th scope="col">Quantity</th><th scope="col">QC</th><th scope="col">Action</th></tr></thead><tbody>{queues?.warehouse.map((value) => <tr key={value.warehouseReceiptId}><th scope="row">{value.productionUnit.publicOrderReference}<br />{value.productionUnit.orderItemId}</th><td>{value.warehouseReceiptId}<br />{value.receiptStatus}</td><td>{value.receivedQuantity}/{value.expectedQuantity}{value.discrepancy ? ` · ${value.discrepancy.direction} discrepancy` : ""}{value.damageReported ? " · damage" : ""}</td><td>{value.qcStatus}</td><td>{value.qcStatus === "pending" ? <div className={styles.operatorToolActions}><button className={styles.secondaryLink} type="button" disabled={mutationState === "submitting"} onClick={() => recordQc(value, "accepted")}>Accept QC</button><button className={styles.secondaryLink} type="button" disabled={mutationState === "submitting"} onClick={() => recordQc(value, "blocked")}>Block QC</button></div> : value.qcStatus === "accepted" && !value.readyForOutbound ? <button className={styles.primaryLink} type="button" disabled={mutationState === "submitting"} onClick={() => markReady(value)}>Mark Ready for Outbound</button> : value.readyForOutbound ? "Ready for outbound — terminal" : "QC blocked"}</td></tr>)}</tbody></table></div>{queues?.warehouse.length === 0 && <p>No Shanghai Warehouse receipts are available.</p>}</section>

      <section aria-labelledby="ready-heading"><h2 id="ready-heading">Ready for outbound ({queues?.readyForOutbound.length ?? 0})</h2><div className={styles.supplierTableWrap}><table><caption>Terminal ready-for-outbound queue</caption><thead><tr><th scope="col">Order / item</th><th scope="col">Current state</th><th scope="col">WorkOrder</th><th scope="col">Action</th></tr></thead><tbody>{queues?.readyForOutbound.map((value) => <tr key={value.operationId}><th scope="row">{value.productionUnit.publicOrderReference}<br />{value.productionUnit.orderItemId}</th><td>{formatStatus(value.currentStatus)}</td><td>{display(value.workOrderId)}</td><td>Terminal — no Shipment or Tracking action</td></tr>)}</tbody></table></div>{queues?.readyForOutbound.length === 0 && <p>No ready-for-outbound items are available.</p>}</section>
    </div>}
  </section>;
}
