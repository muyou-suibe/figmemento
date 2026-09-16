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
import { parseLocalPaymentMutationInput, type LocalPaymentMutationInput, type LocalPaymentPublicProjection } from "../domain/local-payment.ts";
import type { LocalCommercePaymentPort } from "../application/local-commerce-provider-ports.server.ts";

const unavailable = { status: "unavailable" as const };
const conflict = { status: "conflict" as const };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
type PaidResult = { readonly replayed: boolean; readonly payment: LocalPaymentPublicProjection };
export type PersistentPaymentResult = { readonly status: "found"; readonly value: PaidResult }
  | typeof unavailable | typeof conflict;
async function digest(value: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), b => b.toString(16).padStart(2,"0")).join("");
}

/** Allowlisted projection, never spreads the RPC result (which has internal IDs). */
export function projectPersistentPayment(value: unknown, input: LocalPaymentMutationInput): PaidResult | null {
  if (!isRecord(value) || typeof value.replayed !== "boolean" || !isRecord(value.payment)) return null;
  const p = value.payment;
  const terminal = input.outcome === "success" ? "succeeded" : input.outcome;
  if (p.kind !== "local_payment_projection" || typeof p.paymentReference !== "string"
    || !/^LP-LOCAL-[A-Z0-9]{16}$/.test(p.paymentReference) || p.orderReference !== input.publicReference
    || p.status !== terminal || p.outcome !== input.outcome || typeof p.simulatedAmountCents !== "number"
    || !Number.isSafeInteger(p.simulatedAmountCents) || p.simulatedAmountCents < 0 || p.simulatedCurrency !== "USD"
    || typeof p.timestamp !== "string" || !Number.isFinite(Date.parse(p.timestamp))
    || p.notice !== "Development/test simulation only. No real money was charged.") return null;
  return { replayed: value.replayed, payment: { kind: "local_payment_projection", paymentReference: p.paymentReference,
    orderReference: input.publicReference, status: terminal, outcome: input.outcome,
    simulatedAmountCents: p.simulatedAmountCents, simulatedCurrency: "USD", timestamp: p.timestamp, notice: p.notice } };
}

/** Existing verified owner + original Order capability; no Cart/Catalog/points
 * or notification access. Prepare is read-only, attempt is the unified CAS port. */
export async function executePersistentPayment(request: Request, input: LocalPaymentMutationInput,
  environment: RuntimeEnvironment): Promise<PersistentPaymentResult> {
  try {
    if (!parseLocalPaymentMutationInput(input).ok) return unavailable;
    const composition = resolveLocalPersistentComposition(environment, { requiredCapabilities: ["payment"] });
    if (composition.status !== "ready") return unavailable;
    const codec = await createPersistentOrderCapabilityCodec(environment, composition.value);
    const capability = await codec?.verify(readPersistentOrderCapabilityCookie(request), Math.floor(Date.now()/1000));
    if (!capability) return unavailable;
    const initial = await persistentOwnerVerifier(request, environment)();
    if (!initial) return unavailable;
    const connection = await createLocalPersistentSupabaseAdapter(environment);
    if (connection.status !== "ready" || connection.composition.projectId !== composition.value.projectId
      || connection.composition.markerDigest !== composition.value.markerDigest) return unavailable;
    const keyDigest = await digest(input.paymentAttemptId);
    const perform = async (verified: typeof initial): Promise<PersistentPaymentResult> => {
      const owner = verified.owner, token = readCustomerAuthSessionId(request);
      if (owner.projectId !== composition.value.projectId || owner.kind === "customer" && !token) return unavailable;
      const selector = owner.kind === "guest" ? await hashGuestResourceCapability(owner.ownerId) : owner.ownerId;
      if (!selector) return unavailable;
      const base = {
        p_project_id: composition.value.projectId, p_marker_digest: composition.value.markerDigest,
        p_owner_kind: owner.kind, p_owner_selector: selector, p_customer_id: owner.kind === "customer" ? owner.customerId : null,
        p_session_hash: owner.kind === "customer" ? await hashOpaqueCustomerSessionToken(token!) : null,
        p_authority_expires_at: new Date(Math.min(verified.expiresAt, capability.expiresAtSeconds)*1000).toISOString(),
        p_capability_hash: capability.digest, p_public_reference: input.publicReference, p_key_digest: keyDigest, p_outcome: input.outcome,
      };
      const prepared = await connection.adapter.callRestrictedRpc<unknown>("payment_command", {
        ...base, p_operation: "prepare", p_order_id: null, p_expected_version: null, p_context_digest: null,
      });
      if (prepared.status !== "found" || !isRecord(prepared.value)) return unavailable;
      if (prepared.value.status === "conflict") return conflict;
      if (prepared.value.status !== "found" || !isRecord(prepared.value.value)) return unavailable;
      const p = prepared.value.value;
      if (p.replayed === true) {
        const projection = projectPersistentPayment(p,input);
        return projection ? { status: "found", value: projection } : unavailable;
      }
      if (p.replayed !== false || typeof p.orderId !== "string" || !uuid.test(p.orderId)
        || typeof p.ownerId !== "string" || !uuid.test(p.ownerId) || typeof p.version !== "number"
        || !Number.isSafeInteger(p.version) || p.version < 1 || typeof p.contextDigest !== "string"
        || !/^[0-9a-f]{64}$/.test(p.contextDigest)) return unavailable;
      const {orderId,ownerId,version,contextDigest} = p;
      const port: LocalCommercePaymentPort<PaidResult> = {
        async attempt(command) {
          if (command.authority.kind !== "verified_server_authority" || command.authority.projectId !== base.p_project_id
            || command.authority.ownerId !== ownerId || command.authority.actorKind !== "customer"
            || command.authority.actorId !== ownerId || command.internalOrderId !== orderId
            || command.publicReference !== input.publicReference || command.expectedVersion !== version
            || command.idempotency.key !== keyDigest || command.idempotency.fingerprint !== contextDigest
            || command.outcome !== input.outcome) return {status:"unavailable",reason:"invalid_authority"};
          const result = await connection.adapter.callRestrictedRpc<unknown>("payment_command", {
            ...base, p_operation: "commit", p_order_id: command.internalOrderId,
            p_expected_version: command.expectedVersion, p_context_digest: command.idempotency.fingerprint,
          });
          if (result.status !== "found" || !isRecord(result.value)) return {status:"unavailable",reason:"source_failure"};
          if (result.value.status === "conflict") return {status:"conflict",reason:"version_mismatch"};
          const projection = result.value.status === "found" ? projectPersistentPayment(result.value.value,input) : null;
          return projection ? {status:"found",value:projection} : {status:"unavailable",reason:"rejected"};
        },
      };
      return port.attempt({authority:{kind:"verified_server_authority",projectId:base.p_project_id,ownerId,actorKind:"customer",actorId:ownerId},
        expectedVersion:version,idempotency:{key:keyDigest,fingerprint:contextDigest},internalOrderId:orderId,
        publicReference:input.publicReference,outcome:input.outcome});
    };
    const result = await perform(initial);
    if (result.status !== "unavailable" || initial.owner.kind !== "guest") return result;
    // Guest and member may coexist; each exact Order remains independently owned.
    const member = await createLocalPersistentCustomerAuthProvider(environment).getSession(readCustomerAuthSessionId(request));
    if (member.status !== "ok" || !member.value.authenticated || !member.value.ownerId) return unavailable;
    const verified = await persistentOwnerVerifier(request, environment, {kind:"customer",projectId:composition.value.projectId,
      ownerId:member.value.ownerId,customerId:member.value.customer.id})();
    return verified ? await perform(verified) : unavailable;
  } catch { return unavailable; }
}
