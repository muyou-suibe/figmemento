import type { RuntimeEnvironment } from "../config/server.ts";
import { resolveLocalPersistentComposition } from "../application/local-persistent-commerce-composition.server.ts";
import { createLocalPersistentSupabaseAdapter } from "../infrastructure/local-commerce/local-persistent-supabase-adapter.server.ts";
import { createExistingAdminMutationVerifier, isSameOriginAdminMutation } from "./admin-catalog-http.server.ts";
import { isRecord } from "../domain/catalog/validation.ts";
import { resolveCanonicalLocalCommerceCapability } from "../config/server-runtime-composition.server.ts";
import { LOCAL_PERSISTENT_DIGITAL_DELIVERY_POLICY } from "../application/local-persistent-digital-delivery-policy.server.ts";

const REFERENCE = /^FM-LOCAL-[A-Z0-9]{16}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTION = /^[A-Za-z0-9_-]{16,200}$/;
const MAX_BODY_BYTES = 4096;

export interface SafeDigitalRevocation {
  readonly publicReference: string;
  readonly orderItemId: string;
  readonly grantId: string;
  readonly status: "revoked";
  readonly revokedAt: string;
  readonly activatedAt: string;
  readonly expiresAt: string;
  readonly maxDownloads: typeof LOCAL_PERSISTENT_DIGITAL_DELIVERY_POLICY.maxDownloads;
  readonly consumedAttempts: number;
  readonly version: number;
}

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, "0")).join("");
}

async function digest(value: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

async function boundedJson(request: Request): Promise<unknown> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw new Error("body_too_large");
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) throw new Error("body_too_large");
  return JSON.parse(text) as unknown;
}

function projection(value: unknown): SafeDigitalRevocation | null {
  if (!isRecord(value) || !REFERENCE.test(String(value.publicReference))
    || !UUID.test(String(value.orderItemId)) || !UUID.test(String(value.grantId))
    || value.status !== "revoked" || !Number.isFinite(Date.parse(String(value.revokedAt)))
    || !Number.isFinite(Date.parse(String(value.activatedAt)))
    || !Number.isFinite(Date.parse(String(value.expiresAt))) || value.maxDownloads !== LOCAL_PERSISTENT_DIGITAL_DELIVERY_POLICY.maxDownloads
    || !Number.isSafeInteger(value.consumedAttempts) || Number(value.consumedAttempts) < 0
    || Number(value.consumedAttempts) > LOCAL_PERSISTENT_DIGITAL_DELIVERY_POLICY.maxDownloads || !Number.isSafeInteger(value.version)
    || Number(value.version) < 2) return null;
  return value as unknown as SafeDigitalRevocation;
}

export async function handleLocalPersistentDigitalGrantRevocation(
  request: Request,
  environment: RuntimeEnvironment = process.env,
): Promise<Response> {
  const reply = (body: unknown, status: number) => Response.json(body, { status, headers: {
    "cache-control": "private, no-store", "referrer-policy": "no-referrer",
  } });
  if (request.method !== "DELETE") return reply({ status: "unavailable" }, 405);
  const verifier = createExistingAdminMutationVerifier(request);
  const initial = await verifier.verifyAdminSession().catch(() => null);
  if (!initial || initial.status !== "authorized" || initial.principal.role !== "admin") {
    return reply({ status: "unauthorized" }, 401);
  }
  if (!isSameOriginAdminMutation(request)) return reply({ status: "forbidden" }, 403);
  let raw: unknown;
  try { raw = await boundedJson(request); } catch { return reply({ status: "invalid_request" }, 400); }
  if (!isRecord(raw) || Object.keys(raw).some(key => ![
    "orderNumber", "orderItemId", "grantId", "revocationActionId",
  ].includes(key)) || !REFERENCE.test(String(raw.orderNumber).trim().toUpperCase())
    || !UUID.test(String(raw.orderItemId)) || !UUID.test(String(raw.grantId))
    || !ACTION.test(String(raw.revocationActionId))) return reply({ status: "invalid_request" }, 400);
  try {
    if (resolveCanonicalLocalCommerceCapability("admin", environment) !== "selected") return reply({ status: "unavailable" }, 409);
    const composition = resolveLocalPersistentComposition(environment, { requiredCapabilities: ["admin"] });
    if (composition.status !== "ready") return reply({ status: "unavailable" }, 503);
    const connection = await createLocalPersistentSupabaseAdapter(environment);
    if (connection.status !== "ready" || connection.composition.projectId !== composition.value.projectId
      || connection.composition.markerDigest !== composition.value.markerDigest) return reply({ status: "unavailable" }, 503);
    const current = await verifier.verifyAdminSession();
    if (current.status !== "authorized" || current.principal.role !== "admin"
      || current.principal.identity !== initial.principal.identity || !isSameOriginAdminMutation(request)) {
      return reply({ status: "unauthorized" }, 401);
    }
    const publicReference = String(raw.orderNumber).trim().toUpperCase();
    const keyDigest = await digest(String(raw.revocationActionId));
    const contextDigest = await digest(JSON.stringify([
      publicReference, raw.orderItemId, raw.grantId, current.principal.identity, "revoke",
    ]));
    const rpc = await connection.adapter.callRestrictedRpc<unknown>("digital_grant_revoke", {
      p_project_id: composition.value.projectId,
      p_marker_digest: composition.value.markerDigest,
      p_actor_kind: "admin",
      p_actor_id: current.principal.identity,
      p_public_reference: publicReference,
      p_order_item_id: String(raw.orderItemId),
      p_grant_id: String(raw.grantId),
      p_operation: "revoke",
      p_key_digest: keyDigest,
      p_context_digest: contextDigest,
    });
    if (rpc.status !== "found" || !isRecord(rpc.value)) return reply({ status: "unavailable" }, 503);
    if (rpc.value.status === "conflict") return reply({ status: "conflict" }, 409);
    if (rpc.value.status !== "found") return reply({ status: "unavailable" }, 404);
    const revocation = projection(rpc.value.value);
    if (!revocation) return reply({ status: "unavailable" }, 503);
    return reply({ status: rpc.value.replayed === true ? "replayed" : "committed", revocation }, 200);
  } catch {
    return reply({ status: "unavailable" }, 503);
  }
}
