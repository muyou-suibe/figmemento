import type { RuntimeEnvironment } from "../config/server.ts";
import { resolveLocalPersistentComposition } from "../application/local-persistent-commerce-composition.server.ts";
import { createLocalPersistentSupabaseAdapter } from "../infrastructure/local-commerce/local-persistent-supabase-adapter.server.ts";
import { createPersistentOrderCapabilityCodec, readPersistentOrderCapabilityCookie } from "./local-order-capability.server.ts";
import { persistentOwnerVerifier } from "./local-persistent-purchase-authority.server.ts";
import { hashGuestResourceCapability } from "../application/guest-resource-ownership.server.ts";
import { hashOpaqueCustomerSessionToken } from "../application/customer-auth-session-persistence.server.ts";
import { readCustomerAuthSessionId } from "./customer-auth-http.server.ts";
import { createLocalPersistentCustomerAuthProvider } from "../application/customer-auth-persistent-provider.server.ts";
import { parseCanonicalPersistentOrderItem } from "../application/local-order-history.server.ts";
import { isRecord } from "../domain/catalog/validation.ts";
import { validatePersistentHistoryModel } from "../application/local-order-consumer-projections.server.ts";

type HistorySelector = { readonly publicReference: string; readonly orderId: string; readonly orderItemId: string }
  | { readonly publicReference: string; readonly orderId?: never; readonly orderItemId?: never };

/** Customer-authorized acquisition is separate from pure internal projectors.
 * Future actor integrations must use their own approved acquisition boundary. */
export async function readPersistentOrderHistoryModel(request: Request,
  selector: Extract<HistorySelector,{orderId:string}>, environment: RuntimeEnvironment) {
  const result = await readPersistentOrderHistory(request,selector,environment);
  return result.status === "found" ? validatePersistentHistoryModel(result.value) : {status:"unavailable" as const};
}

/** Identifiers select only; original capability and fresh owner/session prove
 * access. Never consults the current Cart or Catalog to reconstruct a purchase. */
export async function readPersistentOrderHistory(request: Request, selector: HistorySelector, environment: RuntimeEnvironment) {
  const unavailable = { status: "unavailable" as const };
  try {
    const composition = resolveLocalPersistentComposition(environment, { requiredCapabilities: ["order"] });
    if (composition.status !== "ready" || !/^FM-LOCAL-[A-Z0-9]{16}$/.test(selector.publicReference)) return unavailable;
    const codec = await createPersistentOrderCapabilityCodec(environment, composition.value);
    const capability = await codec?.verify(readPersistentOrderCapabilityCookie(request), Math.floor(Date.now() / 1000));
    if (!capability) return unavailable;
    const initial = await persistentOwnerVerifier(request, environment)();
    if (!initial) return unavailable; // An invalid guest context cannot fall through to member authority.
    const connection = await createLocalPersistentSupabaseAdapter(environment);
    if (connection.status !== "ready" || connection.composition.projectId !== composition.value.projectId
      || connection.composition.markerDigest !== composition.value.markerDigest) return unavailable;
    const read = async (verified: typeof initial) => {
      const owner = verified.owner;
      const token = readCustomerAuthSessionId(request);
      if (owner.projectId !== composition.value.projectId || owner.kind === "customer" && !token) return unavailable;
      const ownerSelector = owner.kind === "guest" ? await hashGuestResourceCapability(owner.ownerId) : owner.ownerId;
      if (!ownerSelector) return unavailable;
      const result = await connection.adapter.callRestrictedRpc<unknown>("read_order_history", {
        p_project_id: composition.value.projectId, p_marker_digest: composition.value.markerDigest,
        p_owner_kind: owner.kind, p_owner_selector: ownerSelector,
        p_customer_id: owner.kind === "customer" ? owner.customerId : null,
        p_session_hash: owner.kind === "customer" ? await hashOpaqueCustomerSessionToken(token!) : null,
        p_authority_expires_at: new Date(Math.min(verified.expiresAt, capability.expiresAtSeconds) * 1000).toISOString(),
        p_capability_hash: capability.digest, p_order_id: selector.orderId ?? null,
        p_public_reference: selector.publicReference, p_order_item_id: selector.orderItemId ?? null,
        p_projection: selector.orderItemId ? "canonical_item" : "customer_summary",
      });
      if (result.status !== "found" || !isRecord(result.value) || result.value.status !== "found"
        || !isRecord(result.value.value) || result.value.value.publicReference !== selector.publicReference) return unavailable;
      if (selector.orderItemId) {
        if (result.value.value.orderId !== selector.orderId || result.value.value.orderItemId !== selector.orderItemId) return unavailable;
        return parseCanonicalPersistentOrderItem(result.value.value);
      }
      return { status: "found" as const, value: result.value.value };
    };
    const result = await read(initial);
    if (result.status === "found" || initial.owner.kind !== "guest") return result;
    // A valid guest cookie may coexist with a member-owned Order. This second
    // exact read proves member ownership independently; it cannot claim guest data.
    const member = await createLocalPersistentCustomerAuthProvider(environment).getSession(readCustomerAuthSessionId(request));
    if (member.status !== "ok" || !member.value.authenticated || !member.value.ownerId) return unavailable;
    const verified = await persistentOwnerVerifier(request, environment, { kind: "customer",
      projectId: composition.value.projectId, ownerId: member.value.ownerId, customerId: member.value.customer.id })();
    return verified ? await read(verified) : unavailable;
  } catch { return unavailable; }
}
