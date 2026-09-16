import type { LocalFulfillmentStatus } from "./local-fulfillment.ts";
import { isLocalOrderPublicReference } from "./local-order.ts";

export type LocalShipmentStatus = "shipment_created" | "shipped" | "in_transit" | "delivered";
export type LocalTrackingActionKind = "create_shipment" | "mark_shipped" | "mark_in_transit" | "mark_delivered";

export type LocalTrackingIssueCode =
  | "invalid_type"
  | "invalid_format"
  | "unknown_field"
  | "authority_field"
  | "invalid_transition"
  | "not_quality_check"
  | "terminal"
  | "conflict"
  | "unavailable"
  | "unauthorized";

export interface LocalTrackingIssue {
  readonly path: string;
  readonly code: LocalTrackingIssueCode;
  readonly message: string;
}

export type LocalTrackingResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly LocalTrackingIssue[] };

/** Server-resolved identity only; mutable Order facts remain in Local Order. */
export interface LocalTrackingCanonicalOrderReference {
  readonly kind: "canonical_local_order_reference";
  readonly internalId: string;
  readonly publicReference: string;
}

/** Server-resolved Fulfillment identity only; its lifecycle remains upstream. */
export interface LocalTrackingCanonicalFulfillmentReference {
  readonly kind: "canonical_local_fulfillment_reference";
  readonly internalId: string;
  readonly canonicalOrderInternalId: string;
}

/** Destination authority is a reference back to the protected Local Order, not a copied address. */
export interface LocalTrackingProtectedDestinationReference {
  readonly kind: "protected_local_order_destination";
  readonly canonicalOrderInternalId: string;
}

export interface LocalTrackingCarrierFixture {
  readonly kind: "local_tracking_carrier_fixture";
  readonly code: "local_demo_carrier";
  readonly displayLabel: "Local Demo Carrier";
  readonly developmentOnly: true;
}

export const LOCAL_TRACKING_CARRIER_FIXTURE: LocalTrackingCarrierFixture = Object.freeze({
  kind: "local_tracking_carrier_fixture",
  code: "local_demo_carrier",
  displayLabel: "Local Demo Carrier",
  developmentOnly: true,
});

export interface LocalTrackingEvent {
  readonly kind: "local_tracking_event";
  readonly status: LocalShipmentStatus;
  readonly label: string;
  readonly occurredAt: string;
  readonly developmentOnly: true;
}

export interface LocalShipment {
  readonly kind: "local_shipment";
  /** Internal identity is server-owned and is never part of the safe projection. */
  readonly internalShipmentId: string;
  readonly publicShipmentReference: string;
  readonly canonicalOrder: LocalTrackingCanonicalOrderReference;
  readonly canonicalFulfillment: LocalTrackingCanonicalFulfillmentReference;
  readonly protectedDestination: LocalTrackingProtectedDestinationReference;
  readonly carrier: LocalTrackingCarrierFixture;
  /** Display data only; it is never an authority token. */
  readonly trackingNumber: string;
  readonly status: LocalShipmentStatus;
  readonly events: readonly LocalTrackingEvent[];
  readonly createdAt: string;
  readonly shippedAt: string | null;
  readonly inTransitAt: string | null;
  readonly deliveredAt: string | null;
  readonly updatedAt: string;
  readonly developmentOnly: true;
}

export interface LocalTrackingActionInput {
  readonly trackingActionId: string;
  readonly actionKind: LocalTrackingActionKind;
}

export interface LocalTrackingAdmissionInput {
  readonly canonicalOrder: LocalTrackingCanonicalOrderReference;
  readonly canonicalFulfillment: LocalTrackingCanonicalFulfillmentReference;
  readonly fulfillmentStatus: LocalFulfillmentStatus;
}

export interface LocalTrackingTransitionInput {
  readonly current: LocalShipment;
  readonly targetStatus: LocalShipmentStatus;
  /** Server-observed time; browser input is not accepted as an authority. */
  readonly occurredAt: string;
}

export interface LocalTrackingSafeEvent {
  readonly status: LocalShipmentStatus;
  readonly label: string;
  readonly occurredAt: string;
}

export interface LocalTrackingSafeProjection {
  readonly publicOrderReference: string;
  readonly publicShipmentReference: string;
  readonly carrierLabel: "Local Demo Carrier";
  readonly trackingNumber: string;
  readonly status: LocalShipmentStatus;
  readonly events: readonly LocalTrackingSafeEvent[];
  readonly createdAt: string;
  readonly shippedAt: string | null;
  readonly inTransitAt: string | null;
  readonly deliveredAt: string | null;
  readonly notice: "DEVELOPMENT / TEST ONLY";
}

export type LocalTrackingReadResult =
  | { readonly status: "found"; readonly value: LocalTrackingSafeProjection }
  | { readonly status: "unavailable"; readonly issues: readonly LocalTrackingIssue[] };

const SHIPMENT_REFERENCE_PATTERN = /^FM-LOCAL-SHP-[A-Z0-9]{12}$/;
const TRACKING_NUMBER_PATTERN = /^FM-LOCAL-TRK-[A-Z0-9]{12}$/;
const ACTION_ID_PATTERN = /^[A-Za-z0-9_-]{16,200}$/;
const ACTION_KINDS = new Set<LocalTrackingActionKind>([
  "create_shipment",
  "mark_shipped",
  "mark_in_transit",
  "mark_delivered",
]);
const SHIPMENT_STATUSES = new Set<LocalShipmentStatus>([
  "shipment_created",
  "shipped",
  "in_transit",
  "delivered",
]);
const FULFILLMENT_STATUSES = new Set<LocalFulfillmentStatus>([
  "photo_review",
  "preview_pending",
  "preview_revision_requested",
  "preview_approved",
  "in_production",
  "quality_check",
]);
const AUTHORITY_FIELDS = new Set([
  "address",
  "addressLine1",
  "carrier",
  "carrierTrackingNumber",
  "coupon",
  "currency",
  "discount",
  "fulfillmentStatus",
  "payment",
  "paymentStatus",
  "provider",
  "providerId",
  "providerTrackingId",
  "shippingAmount",
  "shippingPrice",
  "stateProvince",
  "tax",
  "trackingId",
  "trackingNumber",
  "webhookPayload",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function issue(path: string, code: LocalTrackingIssueCode, message: string): LocalTrackingIssue {
  return { path, code, message };
}

function success<T>(value: T): LocalTrackingResult<T> {
  return { ok: true, value };
}

function failure<T = never>(...issues: LocalTrackingIssue[]): LocalTrackingResult<T> {
  return { ok: false, issues };
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && Number.isFinite(Date.parse(value));
}

function isLocalShipmentStatus(value: unknown): value is LocalShipmentStatus {
  return typeof value === "string" && SHIPMENT_STATUSES.has(value as LocalShipmentStatus);
}

function isLocalTrackingActionKind(value: unknown): value is LocalTrackingActionKind {
  return typeof value === "string" && ACTION_KINDS.has(value as LocalTrackingActionKind);
}

export function isLocalShipmentPublicReference(value: unknown): value is string {
  return typeof value === "string" && SHIPMENT_REFERENCE_PATTERN.test(value);
}

export function isLocalTrackingNumber(value: unknown): value is string {
  return typeof value === "string" && TRACKING_NUMBER_PATTERN.test(value);
}

export function isLocalTrackingActionId(value: unknown): value is string {
  return typeof value === "string"
    && ACTION_ID_PATTERN.test(value)
    && !value.includes("@")
    && !isLocalOrderPublicReference(value);
}

export function isLocalTrackingStatus(value: unknown): value is LocalShipmentStatus {
  return isLocalShipmentStatus(value);
}

/** Parses only bounded selectors; identity, time, destination, and lifecycle are server-owned. */
export function parseLocalTrackingActionInput(value: unknown): LocalTrackingResult<LocalTrackingActionInput> {
  if (!isRecord(value)) return failure(issue("$", "invalid_type", "Tracking action must be an object."));

  const issues: LocalTrackingIssue[] = [];
  for (const field of Object.keys(value)) {
    if (field !== "trackingActionId" && field !== "actionKind") {
      issues.push(issue(
        `$.${field}`,
        AUTHORITY_FIELDS.has(field) ? "authority_field" : "unknown_field",
        AUTHORITY_FIELDS.has(field) ? "Server-owned Tracking authority is not accepted." : "Field is not part of the Tracking action contract.",
      ));
    }
  }

  if (!isLocalTrackingActionId(value.trackingActionId)) {
    issues.push(issue("$.trackingActionId", "invalid_format", "Tracking action selector is invalid."));
  }
  if (!isLocalTrackingActionKind(value.actionKind)) {
    issues.push(issue("$.actionKind", "invalid_format", "Tracking action is not supported."));
  }
  if (issues.length > 0) return failure(...issues);
  return success({
    trackingActionId: value.trackingActionId as string,
    actionKind: value.actionKind as LocalTrackingActionKind,
  });
}

function validateCanonicalReferences(input: LocalTrackingAdmissionInput): LocalTrackingResult<true> {
  if (!input.canonicalOrder.internalId.trim() || !isLocalOrderPublicReference(input.canonicalOrder.publicReference)) {
    return failure(issue("$.canonicalOrder", "invalid_format", "Canonical Local Order reference is invalid."));
  }
  if (
    !input.canonicalFulfillment.internalId.trim()
    || input.canonicalFulfillment.canonicalOrderInternalId !== input.canonicalOrder.internalId
  ) {
    return failure(issue("$.canonicalFulfillment", "invalid_format", "Canonical Fulfillment reference is invalid."));
  }
  return success(true);
}

/** The only accepted Shipment entry precondition is a server-resolved Fulfillment at quality_check. */
export function validateLocalTrackingAdmission(input: LocalTrackingAdmissionInput): LocalTrackingResult<true> {
  const references = validateCanonicalReferences(input);
  if (!references.ok) return references;
  if (!FULFILLMENT_STATUSES.has(input.fulfillmentStatus) || input.fulfillmentStatus !== "quality_check") {
    return failure(issue("$.fulfillmentStatus", "not_quality_check", "Shipment creation requires canonical Fulfillment quality_check."));
  }
  return success(true);
}

export function createLocalTrackingDestinationReference(
  canonicalOrder: LocalTrackingCanonicalOrderReference,
): LocalTrackingResult<LocalTrackingProtectedDestinationReference> {
  if (!canonicalOrder.internalId.trim() || !isLocalOrderPublicReference(canonicalOrder.publicReference)) {
    return failure(issue("$.canonicalOrder", "invalid_format", "Canonical Local Order reference is invalid."));
  }
  return success(Object.freeze({
    kind: "protected_local_order_destination" as const,
    canonicalOrderInternalId: canonicalOrder.internalId,
  }));
}

export function areSameCanonicalFulfillment(
  left: LocalTrackingCanonicalFulfillmentReference,
  right: LocalTrackingCanonicalFulfillmentReference,
): boolean {
  return left.internalId === right.internalId
    && left.canonicalOrderInternalId === right.canonicalOrderInternalId;
}

function eventLabel(status: LocalShipmentStatus): string {
  switch (status) {
    case "shipment_created": return "Local shipment created";
    case "shipped": return "Local shipment marked shipped";
    case "in_transit": return "Local shipment marked in transit";
    case "delivered": return "Local shipment delivered in local demo";
  }
}

function createEvent(status: LocalShipmentStatus, occurredAt: string): LocalTrackingEvent {
  return Object.freeze({
    kind: "local_tracking_event" as const,
    status,
    label: eventLabel(status),
    occurredAt,
    developmentOnly: true as const,
  });
}

/** Creates the initial pure value; server code supplies all identities and timestamps. */
export function createLocalShipment(input: {
  readonly internalShipmentId: string;
  readonly publicShipmentReference: string;
  readonly canonicalOrder: LocalTrackingCanonicalOrderReference;
  readonly canonicalFulfillment: LocalTrackingCanonicalFulfillmentReference;
  readonly fulfillmentStatus: LocalFulfillmentStatus;
  readonly trackingNumber: string;
  readonly createdAt: string;
}): LocalTrackingResult<LocalShipment> {
  const admission = validateLocalTrackingAdmission({
    canonicalOrder: input.canonicalOrder,
    canonicalFulfillment: input.canonicalFulfillment,
    fulfillmentStatus: input.fulfillmentStatus,
  });
  if (!admission.ok) return admission;
  if (!input.internalShipmentId.trim()) return failure(issue("$.internalShipmentId", "invalid_format", "Shipment identity is invalid."));
  if (!isLocalShipmentPublicReference(input.publicShipmentReference)) {
    return failure(issue("$.publicShipmentReference", "invalid_format", "Shipment reference is invalid."));
  }
  if (!isLocalTrackingNumber(input.trackingNumber)) {
    return failure(issue("$.trackingNumber", "invalid_format", "Local Tracking identity is invalid."));
  }
  if (!isTimestamp(input.createdAt)) return failure(issue("$.createdAt", "invalid_format", "Shipment creation time is invalid."));
  const destination = createLocalTrackingDestinationReference(input.canonicalOrder);
  if (!destination.ok) return destination;
  const event = createEvent("shipment_created", input.createdAt);
  return success(Object.freeze({
    kind: "local_shipment" as const,
    internalShipmentId: input.internalShipmentId,
    publicShipmentReference: input.publicShipmentReference,
    canonicalOrder: Object.freeze({ ...input.canonicalOrder }),
    canonicalFulfillment: Object.freeze({ ...input.canonicalFulfillment }),
    protectedDestination: destination.value,
    carrier: LOCAL_TRACKING_CARRIER_FIXTURE,
    trackingNumber: input.trackingNumber,
    status: "shipment_created" as const,
    events: Object.freeze([event]),
    createdAt: input.createdAt,
    shippedAt: null,
    inTransitAt: null,
    deliveredAt: null,
    updatedAt: input.createdAt,
    developmentOnly: true as const,
  }));
}

function expectedNextStatus(current: LocalShipmentStatus): LocalShipmentStatus | null {
  if (current === "shipment_created") return "shipped";
  if (current === "shipped") return "in_transit";
  if (current === "in_transit") return "delivered";
  return null;
}

/** Pure transition contract; repository atomicity and replay are later tasks. */
export function transitionLocalShipment(
  input: LocalTrackingTransitionInput,
): LocalTrackingResult<LocalShipment> {
  if (!isLocalShipmentStatus(input.targetStatus)) {
    return failure(issue("$.targetStatus", "invalid_format", "Shipment status is not supported."));
  }
  if (!isTimestamp(input.occurredAt)) return failure(issue("$.occurredAt", "invalid_format", "Tracking event time is invalid."));
  if (input.current.status === "delivered") {
    return failure(issue("$.current.status", "terminal", "Delivered is terminal."));
  }
  if (expectedNextStatus(input.current.status) !== input.targetStatus) {
    return failure(issue("$.targetStatus", "invalid_transition", "Shipment transition is not allowed."));
  }

  const event = createEvent(input.targetStatus, input.occurredAt);
  return success(Object.freeze({
    ...input.current,
    events: Object.freeze([...input.current.events, event]),
    status: input.targetStatus,
    shippedAt: input.targetStatus === "shipped" ? input.occurredAt : input.current.shippedAt,
    inTransitAt: input.targetStatus === "in_transit" ? input.occurredAt : input.current.inTransitAt,
    deliveredAt: input.targetStatus === "delivered" ? input.occurredAt : input.current.deliveredAt,
    updatedAt: input.occurredAt,
  }));
}

export function projectLocalShipment(shipment: LocalShipment): LocalTrackingReadResult {
  return {
    status: "found",
    value: {
      publicOrderReference: shipment.canonicalOrder.publicReference,
      publicShipmentReference: shipment.publicShipmentReference,
      carrierLabel: shipment.carrier.displayLabel,
      trackingNumber: shipment.trackingNumber,
      status: shipment.status,
      events: shipment.events.map((event) => ({
        status: event.status,
        label: event.label,
        occurredAt: event.occurredAt,
      })),
      createdAt: shipment.createdAt,
      shippedAt: shipment.shippedAt,
      inTransitAt: shipment.inTransitAt,
      deliveredAt: shipment.deliveredAt,
      notice: "DEVELOPMENT / TEST ONLY",
    },
  };
}
