import type { RuntimeEnvironment } from "../config/server.ts";
import { resolveLocalPersistentComposition } from "../application/local-persistent-commerce-composition.server.ts";
import { createLocalPersistentSupabaseAdapter } from "../infrastructure/local-commerce/local-persistent-supabase-adapter.server.ts";
import { createPersistentOrderCapabilityCodec, readPersistentOrderCapabilityCookie } from "./local-order-capability.server.ts";
import { persistentOwnerVerifier } from "./local-persistent-purchase-authority.server.ts";
import { hashGuestResourceCapability } from "../application/guest-resource-ownership.server.ts";
import { hashOpaqueCustomerSessionToken } from "../application/customer-auth-session-persistence.server.ts";
import { readCustomerAuthSessionId } from "./customer-auth-http.server.ts";
import { createLocalPersistentCustomerAuthProvider } from "../application/customer-auth-persistent-provider.server.ts";
import { isSameOriginCartMutation } from "./cart-http.server.ts";
import { isRecord } from "../domain/catalog/validation.ts";

const REFERENCE = /^FM-LOCAL-[A-Z0-9]{16}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTION = /^[A-Za-z0-9_-]{16,200}$/;
const MAX_BODY_BYTES = 4096;

export interface SafeDigitalGrant {
  readonly grantId: string;
  readonly publicReference: string;
  readonly orderItemId: string;
  readonly activatedAt: string;
  readonly expiresAt: string;
  readonly maxDownloads: 5;
  readonly consumedAttempts: number;
  readonly status: "active";
}

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, "0")).join("");
}

async function digest(value: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

function project(value: unknown): SafeDigitalGrant | null {
  if (!isRecord(value) || !UUID.test(String(value.grantId))
    || !REFERENCE.test(String(value.publicReference)) || !UUID.test(String(value.orderItemId))
    || typeof value.activatedAt !== "string" || typeof value.expiresAt !== "string"
    || !Number.isFinite(Date.parse(value.activatedAt)) || !Number.isFinite(Date.parse(value.expiresAt))
    || Date.parse(value.expiresAt) - Date.parse(value.activatedAt) !== 2_592_000_000
    || value.maxDownloads !== 5 || !Number.isSafeInteger(value.consumedAttempts)
    || Number(value.consumedAttempts) < 0 || Number(value.consumedAttempts) > 5
    || value.status !== "active") return null;
  return value as unknown as SafeDigitalGrant;
}

async function readBoundedBody(request: Request): Promise<unknown> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw new Error("body_too_large");
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) throw new Error("body_too_large");
  return JSON.parse(text) as unknown;
}

export async function handleLocalPersistentDigitalGrantActivation(
  request: Request,
  publicReference: string,
  environment: RuntimeEnvironment = process.env,
): Promise<Response> {
  const response = (body: unknown, status: number) => Response.json(body, { status, headers: {
    "cache-control": "private, no-store", "referrer-policy": "no-referrer",
  } });
  if (request.method !== "POST") return response({ status: "unavailable" }, 405);
  if (!isSameOriginCartMutation(request)) return response({ status: "unavailable" }, 403);
  if (!REFERENCE.test(publicReference)) return response({ status: "unavailable" }, 404);
  let raw: unknown;
  try { raw = await readBoundedBody(request); } catch { return response({ status: "invalid_request" }, 400); }
  if (!isRecord(raw) || Object.keys(raw).some(key => !["orderItemId","grantActionId"].includes(key))
    || !UUID.test(String(raw.orderItemId)) || !ACTION.test(String(raw.grantActionId))) {
    return response({ status: "invalid_request" }, 400);
  }
  try {
    const composition = resolveLocalPersistentComposition(environment, { requiredCapabilities: ["delivery"] });
    if (composition.status !== "ready") return response({ status: "unavailable" }, 503);
    const codec = await createPersistentOrderCapabilityCodec(environment, composition.value);
    const capability = await codec?.verify(readPersistentOrderCapabilityCookie(request), Math.floor(Date.now()/1000));
    const initial = await persistentOwnerVerifier(request, environment)();
    if (!capability || !initial) return response({ status: "unavailable" }, 404);
    const connection = await createLocalPersistentSupabaseAdapter(environment);
    if (connection.status !== "ready" || connection.composition.projectId !== composition.value.projectId
      || connection.composition.markerDigest !== composition.value.markerDigest) return response({ status: "unavailable" }, 503);
    const keyDigest = await digest(String(raw.grantActionId));
    const contextDigest = await digest(JSON.stringify([publicReference, raw.orderItemId, "grant-30-days", 5]));
    const activate = async (verified: typeof initial) => {
      const owner = verified.owner;
      const sessionToken = readCustomerAuthSessionId(request);
      if (owner.projectId !== composition.value.projectId || owner.kind === "customer" && !sessionToken) return null;
      const selector = owner.kind === "guest" ? await hashGuestResourceCapability(owner.ownerId) : owner.ownerId;
      if (!selector) return null;
      const rpc = await connection.adapter.callRestrictedRpc<unknown>("digital_grant_activate", {
        p_project_id: composition.value.projectId,
        p_marker_digest: composition.value.markerDigest,
        p_owner_kind: owner.kind,
        p_owner_selector: selector,
        p_customer_id: owner.kind === "customer" ? owner.customerId : null,
        p_session_hash: owner.kind === "customer" ? await hashOpaqueCustomerSessionToken(sessionToken!) : null,
        p_authority_expires_at: new Date(Math.min(verified.expiresAt, capability.expiresAtSeconds)*1000).toISOString(),
        p_capability_hash: capability.digest,
        p_public_reference: publicReference,
        p_order_item_id: String(raw.orderItemId),
        p_operation: "activate",
        p_key_digest: keyDigest,
        p_context_digest: contextDigest,
      });
      if (rpc.status !== "found" || !isRecord(rpc.value)) return null;
      if (rpc.value.status === "conflict") return { status: "conflict" as const };
      if (rpc.value.status !== "found") return null;
      const grant = project(rpc.value.value);
      return grant ? { status: rpc.value.replayed === true ? "replayed" as const : "activated" as const, grant } : null;
    };
    let result = await activate(initial);
    if (!result && initial.owner.kind === "guest") {
      const session = await createLocalPersistentCustomerAuthProvider(environment).getSession(readCustomerAuthSessionId(request));
      if (session.status === "ok" && session.value.authenticated && session.value.ownerId) {
        const verified = await persistentOwnerVerifier(request, environment, { kind: "customer",
          projectId: composition.value.projectId, ownerId: session.value.ownerId,
          customerId: session.value.customer.id })();
        if (verified) result = await activate(verified);
      }
    }
    if (!result) return response({ status: "unavailable" }, 404);
    if (result.status === "conflict") return response({ status: "conflict" }, 409);
    return response(result, 200);
  } catch {
    return response({ status: "unavailable" }, 503);
  }
}
