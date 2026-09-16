import {
  createLocalShipment,
  isLocalShipmentPublicReference,
  isLocalTrackingNumber,
  parseLocalTrackingActionInput,
  transitionLocalShipment,
  type LocalShipment,
  type LocalTrackingIssue,
} from "../../domain/local-tracking.ts";
import type { LocalFulfillmentAggregateRecord } from "../../application/local-fulfillment-repository.ts";
import type {
  LocalTrackingActionBindingRequest,
  LocalTrackingAggregateCommitInput,
  LocalTrackingAggregateReadResult,
  LocalTrackingAggregateRecord,
  LocalTrackingAggregateRepository,
  LocalTrackingAggregateResult,
  LocalTrackingAggregateTestCounts,
  LocalTrackingCanonicalReadPorts,
  LocalTrackingCommittedBinding,
  LocalTrackingActionResult,
  LocalMemoryLocalTrackingRepositoryOptions,
  LocalTrackingIdentityGenerator,
} from "../../application/local-tracking-repository.ts";

const MAX_ID_ATTEMPTS = 8;

function issue(code: LocalTrackingIssue["code"], message: string): LocalTrackingIssue {
  return { path: "$", code, message };
}
function failure(status: "conflict" | "rejected" | "unavailable" | "failed", code: LocalTrackingIssue["code"], message: string): LocalTrackingAggregateResult {
  return { status, issues: [issue(code, message)] };
}
function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  return value;
}
function cloneShipment(shipment: LocalShipment): LocalShipment {
  return deepFreeze({ ...shipment, canonicalOrder: { ...shipment.canonicalOrder }, canonicalFulfillment: { ...shipment.canonicalFulfillment }, protectedDestination: { ...shipment.protectedDestination }, carrier: { ...shipment.carrier }, events: shipment.events.map((event) => ({ ...event })) });
}
function cloneAggregate(aggregate: LocalTrackingAggregateRecord): LocalTrackingAggregateRecord {
  return deepFreeze({ ...aggregate, canonicalOrder: { ...aggregate.canonicalOrder }, canonicalFulfillment: { ...aggregate.canonicalFulfillment }, shipment: cloneShipment(aggregate.shipment), actionBindings: aggregate.actionBindings.map((binding) => ({ ...binding, request: { ...binding.request, canonicalOrder: { ...binding.request.canonicalOrder }, canonicalFulfillment: { ...binding.request.canonicalFulfillment } }, committedFrom: binding.committedFrom, result: { ...binding.result } })) });
}
function fulfillmentIdentity(internalOrderId: string): string {
  return `local-fulfillment:${internalOrderId}`;
}
function sameBinding(left: LocalTrackingActionBindingRequest, right: LocalTrackingActionBindingRequest): boolean {
  return left.trackingActionId === right.trackingActionId
    && left.actorKind === right.actorKind
    && left.actorContextId === right.actorContextId
    && left.actionKind === right.actionKind
    && left.canonicalOrder.internalId === right.canonicalOrder.internalId
    && left.canonicalOrder.publicReference === right.canonicalOrder.publicReference
    && left.canonicalFulfillment.internalId === right.canonicalFulfillment.internalId
    && left.canonicalFulfillment.canonicalOrderInternalId === right.canonicalFulfillment.canonicalOrderInternalId
    && left.publicShipmentReference === right.publicShipmentReference;
}
function defaultIds(): LocalTrackingIdentityGenerator {
  return {
    nextInternalShipmentId: () => globalThis.crypto.randomUUID(),
    nextPublicShipmentReference: () => `FM-LOCAL-SHP-${globalThis.crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`,
    nextTrackingNumber: () => `FM-LOCAL-TRK-${globalThis.crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`,
  };
}

/** One canonical synchronous process-memory Shipment aggregate. */
export class LocalMemoryLocalTrackingRepository implements LocalTrackingAggregateRepository {
  private readonly aggregatesByFulfillmentId = new Map<string, LocalTrackingAggregateRecord>();
  private readonly ports: LocalTrackingCanonicalReadPorts;
  private readonly ids: LocalTrackingIdentityGenerator;
  private readonly now: () => string;
  private readonly failureInjector?: LocalMemoryLocalTrackingRepositoryOptions["failureInjector"];

  constructor(ports: LocalTrackingCanonicalReadPorts, options: LocalMemoryLocalTrackingRepositoryOptions = {}) {
    this.ports = ports;
    this.ids = options.ids ?? defaultIds();
    this.now = options.now ?? (() => new Date().toISOString());
    this.failureInjector = options.failureInjector;
  }

  commit(input: LocalTrackingAggregateCommitInput): LocalTrackingAggregateResult {
    const parsed = parseLocalTrackingActionInput(input.action);
    if (!parsed.ok || input.actorKind !== "operator" || !input.actorContextId.trim()) return failure("rejected", "invalid_format", "Tracking action is invalid.");
    const order = this.ports.orders.findSnapshotForFulfillment(input.publicOrderReference);
    if (order.status !== "found" || order.snapshot.publicReference !== input.publicOrderReference) return failure("unavailable", "unavailable", "The canonical Local Order is unavailable.");
    const canonicalOrder = { kind: "canonical_local_order_reference" as const, internalId: order.snapshot.internalId, publicReference: order.snapshot.publicReference };
    const fulfillment = this.ports.fulfillments.findByOrderIdentity({ internalOrderId: order.snapshot.internalId, publicOrderReference: order.snapshot.publicReference });
    if (fulfillment.status !== "found") return failure("unavailable", "unavailable", "The canonical Local Fulfillment is unavailable.");
    const canonicalFulfillment = { kind: "canonical_local_fulfillment_reference" as const, internalId: fulfillmentIdentity(order.snapshot.internalId), canonicalOrderInternalId: order.snapshot.internalId };
    const currentRecord = this.aggregatesByFulfillmentId.get(canonicalFulfillment.internalId);
    const request: LocalTrackingActionBindingRequest = { trackingActionId: parsed.value.trackingActionId, actorKind: "operator", actorContextId: input.actorContextId, canonicalOrder, canonicalFulfillment, actionKind: parsed.value.actionKind, ...(currentRecord ? { publicShipmentReference: currentRecord.shipment.publicShipmentReference } : {}) };
    const priorBinding = this.findBinding(parsed.value.trackingActionId);
    if (priorBinding) {
      if (!sameBinding(request, priorBinding.binding.request)) return failure("conflict", "conflict", "Tracking action selector is already bound to different context.");
      return { status: "replayed", aggregate: cloneAggregate(priorBinding.aggregate), shipment: cloneShipment(priorBinding.aggregate.shipment), binding: { ...priorBinding.binding }, result: { ...priorBinding.binding.result } };
    }

    if (parsed.value.actionKind === "create_shipment" && currentRecord) return failure("conflict", "conflict", "A Shipment already exists for this Fulfillment.");
    if (parsed.value.actionKind !== "create_shipment" && !currentRecord) return failure("unavailable", "unavailable", "The Shipment is unavailable.");
    if (parsed.value.actionKind === "create_shipment") {
      if (order.snapshot.status !== "paid" || order.snapshot.paymentStatus !== "succeeded") return failure("rejected", "unavailable", "Shipment requires a paid and succeeded Local Order.");
      if (fulfillment.aggregate.state.status !== "quality_check") return failure("rejected", "not_quality_check", "Shipment creation requires canonical Fulfillment quality_check.");
    }

    const committedAt = this.now();
    let shipment: LocalShipment;
    if (parsed.value.actionKind === "create_shipment") {
      let created: LocalShipment | undefined;
      for (let attempt = 0; attempt < MAX_ID_ATTEMPTS; attempt += 1) {
        const internalShipmentId = this.ids.nextInternalShipmentId();
        const publicShipmentReference = this.ids.nextPublicShipmentReference();
        const trackingNumber = this.ids.nextTrackingNumber();
        if (!internalShipmentId.trim() || !isLocalShipmentPublicReference(publicShipmentReference) || !isLocalTrackingNumber(trackingNumber)) continue;
        if ([...this.aggregatesByFulfillmentId.values()].some((entry) => entry.shipment.publicShipmentReference === publicShipmentReference || entry.shipment.trackingNumber === trackingNumber)) continue;
        const candidate = createLocalShipment({ internalShipmentId, publicShipmentReference, canonicalOrder, canonicalFulfillment, fulfillmentStatus: fulfillment.aggregate.state.status, trackingNumber, createdAt: committedAt });
        if (candidate.ok) { created = candidate.value; break; }
      }
      if (!created) return failure("failed", "unavailable", "Tracking identity could not be generated safely.");
      shipment = created;
    } else {
      if (!currentRecord) return failure("unavailable", "unavailable", "The Shipment is unavailable.");
      const target = parsed.value.actionKind === "mark_shipped" ? "shipped" : parsed.value.actionKind === "mark_in_transit" ? "in_transit" : "delivered";
      const transitioned = transitionLocalShipment({ current: currentRecord.shipment, targetStatus: target, occurredAt: committedAt });
      if (!transitioned.ok) return failure("rejected", transitioned.issues[0]?.code ?? "invalid_transition", transitioned.issues[0]?.message ?? "Shipment transition is not allowed.");
      shipment = transitioned.value;
    }
    const result: LocalTrackingActionResult = { kind: "local_tracking_action_result", actionKind: parsed.value.actionKind, publicOrderReference: canonicalOrder.publicReference, publicShipmentReference: shipment.publicShipmentReference, status: shipment.status, committedAt, notice: "DEVELOPMENT / TEST ONLY" };
    const binding: LocalTrackingCommittedBinding = { request: { ...request, ...(parsed.value.actionKind === "create_shipment" ? { publicShipmentReference: shipment.publicShipmentReference } : {}) }, committedFrom: currentRecord?.shipment.status ?? null, result };
    const nextAggregate = deepFreeze({ kind: "local_tracking_aggregate" as const, canonicalOrder, canonicalFulfillment, shipment, actionBindings: [...(currentRecord?.actionBindings ?? []), binding] });
    try { this.failureInjector?.beforeCommit?.(); } catch { return failure("failed", "unavailable", "Tracking mutation could not be committed."); }
    this.aggregatesByFulfillmentId.set(canonicalFulfillment.internalId, nextAggregate);
    return { status: "committed", aggregate: cloneAggregate(nextAggregate), shipment: cloneShipment(shipment), binding: { ...binding }, result: { ...result } };
  }

  findByOrderIdentity(input: { readonly internalOrderId: string; readonly publicOrderReference: string }): LocalTrackingAggregateReadResult {
    const aggregate = this.aggregatesByFulfillmentId.get(fulfillmentIdentity(input.internalOrderId));
    if (!aggregate || aggregate.canonicalOrder.publicReference !== input.publicOrderReference) return { status: "unavailable" };
    return { status: "found", aggregate: cloneAggregate(aggregate) };
  }
  getCountsForTests(): LocalTrackingAggregateTestCounts {
    return { shipmentCount: this.aggregatesByFulfillmentId.size, eventCount: [...this.aggregatesByFulfillmentId.values()].reduce((count, entry) => count + entry.shipment.events.length, 0), actionBindingCount: [...this.aggregatesByFulfillmentId.values()].reduce((count, entry) => count + entry.actionBindings.length, 0) };
  }
  private findBinding(actionId: string): { aggregate: LocalTrackingAggregateRecord; binding: LocalTrackingCommittedBinding } | undefined {
    for (const aggregate of this.aggregatesByFulfillmentId.values()) {
      const binding = aggregate.actionBindings.find((entry) => entry.request.trackingActionId === actionId);
      if (binding) return { aggregate, binding };
    }
    return undefined;
  }
}

export type { LocalFulfillmentAggregateRecord };
