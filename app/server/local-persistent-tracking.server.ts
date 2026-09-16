import type { RuntimeEnvironment } from "../config/server.ts";
import type {
  LocalCommerceTrackingPort,
  VerifiedAuthorityContext,
} from "../application/local-commerce-provider-ports.server.ts";
import { resolveLocalPersistentComposition } from "../application/local-persistent-commerce-composition.server.ts";
import { createLocalPersistentSupabaseAdapter } from "../infrastructure/local-commerce/local-persistent-supabase-adapter.server.ts";
import { createLocalTrackingDevelopmentOperatorVerifier } from "./local-tracking-development-operator.server.ts";
import { isRecord } from "../domain/catalog/validation.ts";
import {
  projectLocalShipment,
  type LocalShipment,
  type LocalTrackingActionInput,
  type LocalTrackingActionKind,
  type LocalShipmentStatus,
  type LocalTrackingSafeProjection,
} from "../domain/local-tracking.ts";
import type {
  LocalTrackingActionResult,
  LocalTrackingAggregateRecord,
} from "../application/local-tracking-repository.ts";

export interface PersistentShipmentAction extends LocalTrackingActionInput {
  readonly expectedShipmentVersion: number;
}

type PersistentTrackingResult =
  | { readonly status: "committed" | "replayed"; readonly value: LocalTrackingSafeProjection; readonly version: number }
  | { readonly status: "conflict" | "unavailable" };

const unavailable = { status: "unavailable" as const };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const actionPattern = /^[A-Za-z0-9_-]{16,200}$/;
const optionalTimestamp = (value: unknown): string | null | undefined => value == null
  ? null
  : typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : undefined;

const persistentActions = new Set<LocalTrackingActionKind>([
  "create_shipment", "mark_shipped", "mark_in_transit", "mark_delivered",
]);

export function parsePersistentShipmentAction(raw: unknown): PersistentShipmentAction | null {
  if (!isRecord(raw) || Object.keys(raw).some((key) => !["trackingActionId", "actionKind", "expectedShipmentVersion"].includes(key))) return null;
  if (typeof raw.trackingActionId !== "string" || !actionPattern.test(raw.trackingActionId)
    || typeof raw.actionKind !== "string" || !persistentActions.has(raw.actionKind as LocalTrackingActionKind)
    || !Number.isSafeInteger(raw.expectedShipmentVersion) || (raw.expectedShipmentVersion as number) < 0
    || (raw.actionKind === "create_shipment" ? raw.expectedShipmentVersion !== 0 : (raw.expectedShipmentVersion as number) < 1)) return null;
  return {
    trackingActionId: raw.trackingActionId,
    actionKind: raw.actionKind as LocalTrackingActionKind,
    expectedShipmentVersion: raw.expectedShipmentVersion as number,
  };
}

async function sha256(value: string): Promise<string> {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

function shipmentFromRpc(value: unknown, expected: {
  readonly orderId: string;
  readonly fulfillmentId: string;
  readonly publicReference: string;
  readonly action: PersistentShipmentAction;
  readonly actorId: string;
}): { readonly shipment: LocalShipment; readonly result: LocalTrackingActionResult; readonly aggregate: LocalTrackingAggregateRecord; readonly version: number } | null {
  if (!isRecord(value) || !isRecord(value.shipment)) return null;
  const shipment = value.shipment;
  const expectedStatus: Record<LocalTrackingActionKind, LocalShipmentStatus> = {
    create_shipment: "shipment_created",
    mark_shipped: "shipped",
    mark_in_transit: "in_transit",
    mark_delivered: "delivered",
  };
  const statusSequence: readonly LocalShipmentStatus[] = ["shipment_created", "shipped", "in_transit", "delivered"];
  const expectedVersion = expected.action.expectedShipmentVersion + 1;
  const events = Array.isArray(shipment.events) ? shipment.events : [];
  const safeEvents = events.map((event, index) => {
    if (!isRecord(event) || event.status !== statusSequence[index]
      || typeof event.label !== "string" || event.label.length === 0
      || typeof event.occurredAt !== "string" || !Number.isFinite(Date.parse(event.occurredAt))) return null;
    return { kind: "local_tracking_event" as const, status: event.status, label: event.label, occurredAt: event.occurredAt, developmentOnly: true as const };
  });
  const shippedAt = optionalTimestamp(shipment.shippedAt);
  const inTransitAt = optionalTimestamp(shipment.inTransitAt);
  const deliveredAt = optionalTimestamp(shipment.deliveredAt);
  if (shipment.internalOrderId !== expected.orderId || shipment.internalFulfillmentId !== expected.fulfillmentId
    || shipment.publicOrderReference !== expected.publicReference
    || typeof shipment.internalShipmentId !== "string" || !uuidPattern.test(shipment.internalShipmentId)
    || typeof shipment.publicShipmentReference !== "string" || !/^FM-LOCAL-SHP-[A-Z0-9]{12}$/.test(shipment.publicShipmentReference)
    || shipment.carrierCode !== "local_demo_carrier" || shipment.carrierLabel !== "Local Demo Carrier"
    || typeof shipment.trackingNumber !== "string" || !/^FM-LOCAL-TRK-[A-Z0-9]{12}$/.test(shipment.trackingNumber)
    || shipment.status !== expectedStatus[expected.action.actionKind] || shipment.version !== expectedVersion
    || typeof shipment.createdAt !== "string" || !Number.isFinite(Date.parse(shipment.createdAt))
    || typeof shipment.updatedAt !== "string" || !Number.isFinite(Date.parse(shipment.updatedAt))
    || events.length !== expectedVersion || safeEvents.some((event) => event === null)
    || shippedAt === undefined || inTransitAt === undefined || deliveredAt === undefined
    || (expectedVersion === 1 ? shippedAt !== null : typeof shippedAt !== "string" || !Number.isFinite(Date.parse(shippedAt)))
    || (expectedVersion < 3 ? inTransitAt !== null : typeof inTransitAt !== "string" || !Number.isFinite(Date.parse(inTransitAt)))
    || (expectedVersion < 4 ? deliveredAt !== null : typeof deliveredAt !== "string" || !Number.isFinite(Date.parse(deliveredAt)))) return null;
  const canonicalOrder = { kind: "canonical_local_order_reference" as const, internalId: expected.orderId, publicReference: expected.publicReference };
  const canonicalFulfillment = { kind: "canonical_local_fulfillment_reference" as const, internalId: expected.fulfillmentId, canonicalOrderInternalId: expected.orderId };
  const localShipment: LocalShipment = {
    kind: "local_shipment",
    internalShipmentId: shipment.internalShipmentId,
    publicShipmentReference: shipment.publicShipmentReference,
    canonicalOrder,
    canonicalFulfillment,
    protectedDestination: { kind: "protected_local_order_destination", canonicalOrderInternalId: expected.orderId },
    carrier: { kind: "local_tracking_carrier_fixture", code: "local_demo_carrier", displayLabel: "Local Demo Carrier", developmentOnly: true },
    trackingNumber: shipment.trackingNumber,
    status: expectedStatus[expected.action.actionKind],
    events: safeEvents as LocalShipment["events"],
    createdAt: shipment.createdAt,
    shippedAt,
    inTransitAt,
    deliveredAt,
    updatedAt: shipment.updatedAt,
    developmentOnly: true,
  };
  const result: LocalTrackingActionResult = {
    kind: "local_tracking_action_result",
    actionKind: expected.action.actionKind,
    publicOrderReference: expected.publicReference,
    publicShipmentReference: localShipment.publicShipmentReference,
    status: localShipment.status,
    committedAt: shipment.createdAt,
    notice: "DEVELOPMENT / TEST ONLY",
  };
  const binding = {
    request: {
      trackingActionId: expected.action.trackingActionId,
      actorKind: "operator" as const,
      actorContextId: expected.actorId,
      canonicalOrder,
      canonicalFulfillment,
      actionKind: "create_shipment" as const,
      publicShipmentReference: localShipment.publicShipmentReference,
    },
    committedFrom: null,
    result,
  };
  return {
    shipment: localShipment,
    result,
    aggregate: { kind: "local_tracking_aggregate", canonicalOrder, canonicalFulfillment, shipment: localShipment, actionBindings: [binding] },
    version: expectedVersion,
  };
}

export async function persistentShipmentCommand(
  publicReference: string,
  action: PersistentShipmentAction,
  environment: RuntimeEnvironment = process.env,
): Promise<PersistentTrackingResult> {
  try {
    const composition = resolveLocalPersistentComposition(environment, { requiredCapabilities: ["tracking"] });
    const actor = createLocalTrackingDevelopmentOperatorVerifier().verify();
    if (composition.status !== "ready" || !actor || actor.actorKind !== "operator"
      || !/^FM-LOCAL-[A-Z0-9]{16}$/.test(publicReference)) return unavailable;
    const connection = await createLocalPersistentSupabaseAdapter(environment);
    if (connection.status !== "ready" || connection.composition.projectId !== composition.value.projectId
      || connection.composition.markerDigest !== composition.value.markerDigest) return unavailable;
    const key = await sha256(action.trackingActionId);
    const base = {
      p_project_id: composition.value.projectId,
      p_marker_digest: composition.value.markerDigest,
      p_actor_kind: "operator" as const,
      p_actor_id: actor.actorContextId,
      p_public_reference: publicReference,
      p_action: action.actionKind,
      p_expected_version: action.expectedShipmentVersion,
      p_key_digest: key,
    };
    const rpc = async (operation: "prepare" | "commit", contextDigest: string | null): Promise<Record<string, unknown> | null> => {
      const current = createLocalTrackingDevelopmentOperatorVerifier().verify();
      if (!current || current.actorKind !== actor.actorKind || current.actorContextId !== actor.actorContextId) return null;
      const response = await connection.adapter.callRestrictedRpc<unknown>("shipment_command", {
        ...base,
        p_operation: operation,
        p_context_digest: contextDigest,
      });
      return response.status === "found" && isRecord(response.value) ? response.value : null;
    };
    const prepared = await rpc("prepare", null);
    if (!prepared) return unavailable;
    if (prepared.status === "conflict") return { status: "conflict" };
    if (prepared.status !== "found" || !isRecord(prepared.value)) return unavailable;
    const details = prepared.value;
    if (typeof details.orderId !== "string" || !uuidPattern.test(details.orderId)
      || typeof details.ownerId !== "string" || !uuidPattern.test(details.ownerId)
      || typeof details.fulfillmentId !== "string" || !uuidPattern.test(details.fulfillmentId)
      || typeof details.contextDigest !== "string" || !/^[0-9a-f]{64}$/.test(details.contextDigest)) return unavailable;
    const orderId = details.orderId;
    const ownerId = details.ownerId;
    const fulfillmentId = details.fulfillmentId;
    const contextDigest = details.contextDigest;
    const authority: VerifiedAuthorityContext = {
      kind: "verified_server_authority",
      projectId: composition.value.projectId,
      ownerId,
      actorKind: "operator",
      actorId: actor.actorContextId,
    };
    const port: LocalCommerceTrackingPort = {
      async readExact() { return { status: "unavailable", reason: "not_supported" }; },
      async command(input) {
        if (input.authority !== authority || input.internalOrderId !== orderId
          || input.publicReference !== publicReference || input.action !== action
          || input.expectedVersion !== action.expectedShipmentVersion
          || input.idempotency.key !== key || input.idempotency.fingerprint !== contextDigest) {
          return { status: "unavailable", reason: "invalid_authority" };
        }
        const committed = await rpc("commit", input.idempotency.fingerprint);
        if (!committed) return { status: "unavailable", reason: "rejected" };
        if (committed.status === "conflict") return { status: "conflict", reason: "idempotency_mismatch" };
        if (committed.status !== "found" || !isRecord(committed.value) || typeof committed.replayed !== "boolean") {
          return { status: "unavailable", reason: "rejected" };
        }
        const mapped = shipmentFromRpc(committed.value, {
          orderId,
          fulfillmentId,
          publicReference,
          action,
          actorId: actor.actorContextId,
        });
        return mapped
          ? { status: "found", value: { state: { projectId: authority.projectId, ownerId: authority.ownerId, version: mapped.version, aggregate: mapped.aggregate }, result: mapped.result } }
          : { status: "unavailable", reason: "source_failure" };
      },
    };
    const result = await port.command({
      authority,
      internalOrderId: orderId,
      publicReference,
      action,
      expectedVersion: action.expectedShipmentVersion,
      idempotency: { key, fingerprint: contextDigest },
    });
    if (result.status === "conflict") return { status: "conflict" };
    if (result.status !== "found") return unavailable;
    const projection = projectLocalShipment(result.value.state.aggregate.shipment);
    if (projection.status !== "found") return unavailable;
    return {
      status: prepared.replayed === true ? "replayed" : "committed",
      value: projection.value,
      version: result.value.state.version,
    };
  } catch {
    return unavailable;
  }
}
