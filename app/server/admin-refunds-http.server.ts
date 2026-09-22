import type { RuntimeEnvironment } from "../config/server.ts";
import type { AdminSessionVerifier } from "../application/admin-catalog-boundary.ts";
import { readAdminAcceptanceConfiguration } from "../config/admin-acceptance-runtime.server.ts";
import { resolveCanonicalLocalCommerceCapability } from "../config/server-runtime-composition.server.ts";
import { createLocalPersistentSupabaseAdapter } from "../infrastructure/local-commerce/local-persistent-supabase-adapter.server.ts";
import { createExistingAdminMutationVerifier, isSameOriginAdminMutation } from "./admin-catalog-http.server.ts";

type RefundProjection = {
  readonly refundReference: string; readonly paymentReference: string;
  readonly amountCents: number; readonly currency: string;
  readonly remainingRefundableCents: number; readonly aggregateVersion: number;
  readonly createdAt: string; readonly status: "committed";
};
type RefundResult = { readonly status: "found"; readonly replayed: boolean; readonly value: RefundProjection }
  | { readonly status: "conflict" | "non_refundable" | "unavailable" };

export interface AdminRefundDependencies {
  readonly environment?: RuntimeEnvironment;
  readonly verifier?: AdminSessionVerifier;
  readonly execute?: (input: { readonly paymentReference: string; readonly actionKeyDigest: string;
    readonly amountCents: number; readonly expectedVersion: number }, environment: RuntimeEnvironment) => Promise<RefundResult>;
}

function json(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: { "cache-control": "private, no-store",
    "referrer-policy": "no-referrer", "x-content-type-options": "nosniff" } });
}

function validBody(value: unknown): value is { paymentReference: string; refundAttemptId: string;
  amountCents: number; expectedVersion: number } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === 4
    && Object.keys(record).every(key => ["paymentReference", "refundAttemptId", "amountCents", "expectedVersion"].includes(key))
    && typeof record.paymentReference === "string" && /^LP-LOCAL-[A-Z0-9]{16}$/.test(record.paymentReference)
    && typeof record.refundAttemptId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(record.refundAttemptId)
    && Number.isSafeInteger(record.amountCents) && (record.amountCents as number) > 0
    && (record.amountCents as number) <= 2147483647
    && Number.isSafeInteger(record.expectedVersion) && (record.expectedVersion as number) >= 1;
}

function validProjection(value: unknown): value is RefundProjection {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.refundReference === "string" && /^RF-LOCAL-[A-F0-9]{32}$/.test(row.refundReference)
    && typeof row.paymentReference === "string" && /^LP-LOCAL-[A-Z0-9]{16}$/.test(row.paymentReference)
    && Number.isSafeInteger(row.amountCents) && (row.amountCents as number) > 0
    && typeof row.currency === "string" && /^[A-Z]{3}$/.test(row.currency)
    && Number.isSafeInteger(row.remainingRefundableCents) && (row.remainingRefundableCents as number) >= 0
    && Number.isSafeInteger(row.aggregateVersion) && (row.aggregateVersion as number) >= 2
    && typeof row.createdAt === "string" && Number.isFinite(Date.parse(row.createdAt))
    && row.status === "committed";
}

async function hash(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), part => part.toString(16).padStart(2, "0")).join("");
}

async function execute(input: { paymentReference: string; actionKeyDigest: string; amountCents: number;
  expectedVersion: number }, environment: RuntimeEnvironment): Promise<RefundResult> {
  const connection = await createLocalPersistentSupabaseAdapter(environment);
  if (connection.status !== "ready") return { status: "unavailable" };
  const result = await connection.adapter.callRestrictedRpc<unknown>("admin_refund_command", {
    p_project_id: connection.composition.projectId,
    p_marker_digest: connection.composition.markerDigest,
    p_actor_id: "configured-admin", p_payment_reference: input.paymentReference,
    p_action_key_digest: input.actionKeyDigest, p_amount_cents: input.amountCents,
    p_expected_version: input.expectedVersion,
  });
  if (result.status !== "found" || !result.value || typeof result.value !== "object") return { status: "unavailable" };
  const row = result.value as Record<string, unknown>;
  if (row.status === "conflict" || row.status === "non_refundable") return { status: row.status };
  if (row.status !== "found" || typeof row.replayed !== "boolean" || !validProjection(row.value)
    || row.value.paymentReference !== input.paymentReference || row.value.amountCents !== input.amountCents) {
    return { status: "unavailable" };
  }
  const projection = row.value;
  return { status: "found", replayed: row.replayed,
    value: { refundReference: projection.refundReference, paymentReference: projection.paymentReference,
      amountCents: projection.amountCents, currency: projection.currency,
      remainingRefundableCents: projection.remainingRefundableCents,
      aggregateVersion: projection.aggregateVersion, createdAt: projection.createdAt, status: "committed" } };
}

/** Fresh signed Admin authority precedes every command, including replay. */
export async function handleAdminRefund(request: Request, dependencies: AdminRefundDependencies = {}): Promise<Response> {
  const environment = dependencies.environment ?? process.env;
  try {
    const authorization = await (dependencies.verifier ?? createExistingAdminMutationVerifier(request)).verifyAdminSession();
    if (authorization.status !== "authorized" || authorization.principal.role !== "admin"
      || authorization.principal.identity !== "configured-admin") return json({ status: "unauthorized" }, 401);
    if (request.method !== "POST") return json({ status: "unavailable" }, 405);
    if (!isSameOriginAdminMutation(request)) return json({ status: "forbidden" }, 403);
    if (readAdminAcceptanceConfiguration(environment, environment.NODE_ENV).status !== "local_persistent"
      || resolveCanonicalLocalCommerceCapability("admin", environment) !== "selected") return json({ status: "unavailable" }, 503);
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return json({ status: "invalid_request" }, 400);
    const declared = Number(request.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > 4096) return json({ status: "invalid_request" }, 400);
    const bodyText = await request.text();
    if (new TextEncoder().encode(bodyText).byteLength > 4096) return json({ status: "invalid_request" }, 400);
    let body: unknown;
    try { body = JSON.parse(bodyText); }
    catch { return json({ status: "invalid_request" }, 400); }
    if (!validBody(body)) return json({ status: "invalid_request" }, 400);
    const result = await (dependencies.execute ?? execute)({ paymentReference: body.paymentReference,
      actionKeyDigest: await hash(`e07.refund:${body.refundAttemptId.toLowerCase()}`),
      amountCents: body.amountCents, expectedVersion: body.expectedVersion }, environment);
    if (result.status === "conflict") return json({ status: "conflict" }, 409);
    if (result.status === "non_refundable") return json({ status: "non_refundable" }, 409);
    if (result.status !== "found") return json({ status: "unavailable" }, 503);
    return json({ status: result.replayed ? "replayed" : "committed", refund: result.value }, 200);
  } catch {
    return json({ status: "unavailable" }, 503);
  }
}
