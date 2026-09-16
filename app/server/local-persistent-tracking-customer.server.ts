import type { RuntimeEnvironment } from "../config/server.ts";
import { resolveLocalPersistentComposition } from "../application/local-persistent-commerce-composition.server.ts";
import { createLocalPersistentSupabaseAdapter } from "../infrastructure/local-commerce/local-persistent-supabase-adapter.server.ts";
import { createPersistentOrderCapabilityCodec, readPersistentOrderCapabilityCookie } from "./local-order-capability.server.ts";
import { persistentOwnerVerifier } from "./local-persistent-purchase-authority.server.ts";
import { hashGuestResourceCapability } from "../application/guest-resource-ownership.server.ts";
import { hashOpaqueCustomerSessionToken } from "../application/customer-auth-session-persistence.server.ts";
import { readCustomerAuthSessionId } from "./customer-auth-http.server.ts";
import { createLocalPersistentCustomerAuthProvider } from "../application/customer-auth-persistent-provider.server.ts";
import { isRecord } from "../domain/catalog/validation.ts";
import type { LocalShipmentStatus, LocalTrackingSafeProjection } from "../domain/local-tracking.ts";

const unavailable = { status: "unavailable" as const };
const shipmentStatuses = ["shipment_created", "shipped", "in_transit", "delivered"] as const;
const shipmentStatusSet = new Set<string>(shipmentStatuses);
const timestamp = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));
const optionalTimestamp = (value: unknown): value is string | null => value === null || timestamp(value);

/** Explicit allowlist projection. Internal identities, actor/action data,
 * credentials, Storage locators and purchase details cannot pass this mapper. */
export function projectPersistentCustomerTracking(value: unknown, reference: string): LocalTrackingSafeProjection | null {
  if (!isRecord(value) || value.publicOrderReference !== reference
    || typeof value.publicShipmentReference !== "string" || !/^FM-LOCAL-SHP-[A-Z0-9]{12}$/.test(value.publicShipmentReference)
    || value.carrierLabel !== "Local Demo Carrier"
    || typeof value.trackingNumber !== "string" || !/^FM-LOCAL-TRK-[A-Z0-9]{12}$/.test(value.trackingNumber)
    || typeof value.status !== "string" || !shipmentStatusSet.has(value.status)
    || !Array.isArray(value.events) || value.events.length < 1 || value.events.length > 4
    || !timestamp(value.createdAt) || !optionalTimestamp(value.shippedAt)
    || !optionalTimestamp(value.inTransitAt) || !optionalTimestamp(value.deliveredAt)
    || value.notice !== "DEVELOPMENT / TEST ONLY") return null;
  const events = value.events.map((event, index) => {
    if (!isRecord(event) || event.status !== shipmentStatuses[index]
      || typeof event.label !== "string" || event.label.length < 1 || event.label.length > 80
      || !timestamp(event.occurredAt)) return null;
    return { status: event.status as LocalShipmentStatus, label: event.label, occurredAt: event.occurredAt };
  });
  if (events.some((event) => event === null) || events.at(-1)?.status !== value.status) return null;
  return {
    publicOrderReference: reference,
    publicShipmentReference: value.publicShipmentReference,
    carrierLabel: "Local Demo Carrier",
    trackingNumber: value.trackingNumber,
    status: value.status as LocalShipmentStatus,
    events: events as LocalTrackingSafeProjection["events"],
    createdAt: value.createdAt,
    shippedAt: value.shippedAt,
    inTransitAt: value.inTransitAt,
    deliveredAt: value.deliveredAt,
    notice: "DEVELOPMENT / TEST ONLY",
  };
}

/** Uses the existing Order capability plus guest/member owner verification.
 * The restricted RPC delegates authorization to read_order_history and only
 * projects already committed Shipment state. */
export async function readPersistentCustomerTracking(
  request: Request,
  reference: string,
  environment: RuntimeEnvironment = process.env,
): Promise<{ readonly status: "found"; readonly value: LocalTrackingSafeProjection } | typeof unavailable> {
  try {
    const composition = resolveLocalPersistentComposition(environment, { requiredCapabilities: ["tracking", "order"] });
    if (composition.status !== "ready" || !/^FM-LOCAL-[A-Z0-9]{16}$/.test(reference)) return unavailable;
    const codec = await createPersistentOrderCapabilityCodec(environment, composition.value);
    const capability = await codec?.verify(readPersistentOrderCapabilityCookie(request), Math.floor(Date.now() / 1000));
    const initial = await persistentOwnerVerifier(request, environment)();
    if (!capability || !initial) return unavailable;
    const connection = await createLocalPersistentSupabaseAdapter(environment);
    if (connection.status !== "ready" || connection.composition.projectId !== composition.value.projectId
      || connection.composition.markerDigest !== composition.value.markerDigest) return unavailable;
    const perform = async (verified: typeof initial) => {
      const owner = verified.owner;
      const token = readCustomerAuthSessionId(request);
      if (owner.projectId !== composition.value.projectId || owner.kind === "customer" && !token) return unavailable;
      const selector = owner.kind === "guest" ? await hashGuestResourceCapability(owner.ownerId) : owner.ownerId;
      if (!selector) return unavailable;
      const result = await connection.adapter.callRestrictedRpc<unknown>("read_customer_tracking", {
        p_project_id: composition.value.projectId,
        p_marker_digest: composition.value.markerDigest,
        p_owner_kind: owner.kind,
        p_owner_selector: selector,
        p_customer_id: owner.kind === "customer" ? owner.customerId : null,
        p_session_hash: owner.kind === "customer" ? await hashOpaqueCustomerSessionToken(token!) : null,
        p_authority_expires_at: new Date(Math.min(verified.expiresAt, capability.expiresAtSeconds) * 1000).toISOString(),
        p_capability_hash: capability.digest,
        p_public_reference: reference,
      });
      if (result.status !== "found" || !isRecord(result.value) || result.value.status !== "found") return unavailable;
      const projection = projectPersistentCustomerTracking(result.value.value, reference);
      return projection ? { status: "found" as const, value: projection } : unavailable;
    };
    const result = await perform(initial);
    if (result.status === "found" || initial.owner.kind !== "guest") return result;
    const member = await createLocalPersistentCustomerAuthProvider(environment).getSession(readCustomerAuthSessionId(request));
    if (member.status !== "ok" || !member.value.authenticated || !member.value.ownerId) return unavailable;
    const verified = await persistentOwnerVerifier(request, environment, {
      kind: "customer", projectId: composition.value.projectId,
      ownerId: member.value.ownerId, customerId: member.value.customer.id,
    })();
    return verified ? await perform(verified) : unavailable;
  } catch {
    return unavailable;
  }
}
