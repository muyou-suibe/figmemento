import type { RuntimeEnvironment } from "../config/server.ts";
import type { AdminSessionVerifier } from "../application/admin-catalog-boundary.ts";
import { readAdminAcceptanceConfiguration } from "../config/admin-acceptance-runtime.server.ts";
import { resolveCanonicalLocalCommerceCapability } from "../config/server-runtime-composition.server.ts";
import { createExistingAdminMutationVerifier, isSameOriginAdminMutation } from "./admin-catalog-http.server.ts";
import { processLocalPaymentEvidence, readLocalPaymentInbox } from "./local-payment-webhook-inbox.server.ts";

export interface AdminPaymentEventsDependencies {
  readonly environment?: RuntimeEnvironment;
  readonly verifier?: AdminSessionVerifier;
  readonly read?: typeof readLocalPaymentInbox;
  readonly process?: typeof processLocalPaymentEvidence;
}

const sourcePattern = /^[a-z][a-z0-9._-]{0,39}$/;
const eventIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const states = ["received", "processing", "reconciled", "unmatched", "unknown", "stale", "failed"] as const;
type State = (typeof states)[number];
function json(value: unknown, status: number): Response {
  return Response.json(value, { status, headers: { "cache-control": "private, no-store",
    "referrer-policy": "no-referrer", "x-content-type-options": "nosniff" } });
}

/** Uses the existing signed configured-Admin verifier; no provider intake is exposed. */
export async function handleAdminPaymentEvents(request: Request,
  dependencies: AdminPaymentEventsDependencies = {}): Promise<Response> {
  const environment = dependencies.environment ?? process.env;
  try {
    const authorization = await (dependencies.verifier ?? createExistingAdminMutationVerifier(request)).verifyAdminSession();
    if (authorization.status !== "authorized" || authorization.principal.role !== "admin"
      || authorization.principal.identity !== "configured-admin") return json({ status: "unauthorized" }, 401);
    if (request.method !== "GET" && request.method !== "POST") return json({ status: "unavailable" }, 405);
    if (request.method === "POST" && !isSameOriginAdminMutation(request)) return json({ status: "forbidden" }, 403);
    if (readAdminAcceptanceConfiguration(environment, environment.NODE_ENV).status !== "local_persistent"
      || resolveCanonicalLocalCommerceCapability("admin", environment) !== "selected") return json({ status: "unavailable" }, 503);
    if (request.method === "GET") {
      const url = new URL(request.url);
      const source = url.searchParams.get("source");
      const externalEventId = url.searchParams.get("externalEventId");
      const state = url.searchParams.get("state");
      const limit = Number(url.searchParams.get("limit") ?? "25");
      if ([...url.searchParams.keys()].some(key => !["source", "externalEventId", "state", "limit"].includes(key))
        || (source !== null && !sourcePattern.test(source))
        || (externalEventId !== null && (!source || !eventIdPattern.test(externalEventId)))
        || (state !== null && !states.includes(state as State))
        || !Number.isSafeInteger(limit) || limit < 1 || limit > 50) return json({ status: "invalid_request" }, 400);
      const result = await (dependencies.read ?? readLocalPaymentInbox)({ source, externalEventId,
        state: state as State | null, limit }, environment);
      return result.status === "found" ? json(result, 200)
        : json({ status: result.status }, result.status === "not_found" ? 404 : 503);
    }
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return json({ status: "invalid_request" }, 400);
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 1024) return json({ status: "invalid_request" }, 400);
    let body: unknown;
    try { body = JSON.parse(raw); }
    catch { return json({ status: "invalid_request" }, 400); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ status: "invalid_request" }, 400);
    const input = body as Record<string, unknown>;
    if (Object.keys(input).length !== 2 || typeof input.source !== "string" || !sourcePattern.test(input.source)
      || typeof input.externalEventId !== "string" || !eventIdPattern.test(input.externalEventId)) return json({ status: "invalid_request" }, 400);
    const result = await (dependencies.process ?? processLocalPaymentEvidence)(input.source, input.externalEventId, environment);
    return result.status === "found" ? json(result, 200)
      : json({ status: result.status }, result.status === "conflict" ? 409 : result.status === "not_found" ? 404 : 503);
  } catch { return json({ status: "unavailable" }, 503); }
}
