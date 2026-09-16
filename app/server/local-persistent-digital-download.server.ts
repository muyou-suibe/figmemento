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
const DIGEST = /^[0-9a-f]{64}$/;
const MAX_BYTES = 15 * 1024 * 1024;
const TICKET_HEADER = "x-figmemento-download-ticket";

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, "0")).join("");
}
async function digest(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const exact = new Uint8Array(bytes.byteLength);
  exact.set(bytes);
  return hex(await crypto.subtle.digest("SHA-256", exact.buffer));
}
function safeFailure(status = 404): Response {
  return Response.json({ status: "unavailable" }, { status, headers: {
    "cache-control": "private, no-store", "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
  } });
}
function safeEmpty(status = 204): Response {
  return new Response(null, { status, headers: {
    "cache-control": "private, no-store", "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff", "accept-ranges": "none",
  } });
}
function isExplicitDownload(request: Request): boolean {
  const purpose = `${request.headers.get("purpose") ?? ""} ${request.headers.get("sec-purpose") ?? ""}`.toLowerCase();
  if (/prefetch|preload|prerender/.test(purpose) || request.headers.get("x-moz")?.toLowerCase() === "prefetch") return false;
  return request.headers.get("x-figmemento-download-intent")?.toLowerCase() === "explicit";
}
type Prepared = {
  readonly ticketId: string; readonly grantId: string; readonly orderId: string;
  readonly orderItemId: string; readonly digitalVersionId: string;
  readonly contentReference: string; readonly contentDigest: string;
  readonly byteSize: number; readonly contentType: string; readonly fileName: string;
};
function prepared(value: unknown): Prepared | null {
  if (!isRecord(value) || !UUID.test(String(value.ticketId)) || !UUID.test(String(value.grantId))
    || !UUID.test(String(value.orderId)) || !UUID.test(String(value.orderItemId))
    || !UUID.test(String(value.digitalVersionId)) || typeof value.contentReference !== "string"
    || value.contentReference.length < 1 || value.contentReference.length > 512
    || !DIGEST.test(String(value.contentDigest)) || !Number.isSafeInteger(value.byteSize)
    || Number(value.byteSize) < 1 || Number(value.byteSize) > MAX_BYTES
    || !["image/jpeg","image/png","image/webp","application/pdf","application/zip"].includes(String(value.contentType))
    || typeof value.fileName !== "string" || value.fileName.length < 1 || value.fileName.length > 160) return null;
  return value as unknown as Prepared;
}
function disposition(name: string): string {
  const safe = name.normalize("NFKC").replace(/[^A-Za-z0-9._ -]/g, "-").replace(/[\r\n"]/g, "-").trim().slice(0, 160) || "digital-delivery";
  return `attachment; filename="${safe}"`;
}

export async function handleLocalPersistentDigitalDownload(
  request: Request,
  publicReference: string,
  environment: RuntimeEnvironment = process.env,
): Promise<Response> {
  if (request.method === "HEAD") return safeEmpty();
  if (request.method !== "GET") return safeFailure(405);
  if (request.headers.has("range")) return safeEmpty(416);
  if (!isExplicitDownload(request)) return safeEmpty();
  if (!isSameOriginCartMutation(request) || !REFERENCE.test(publicReference)) return safeFailure();
  const rawTicket = request.headers.get(TICKET_HEADER)?.trim() ?? "";
  if (!/^[0-9a-f]{64}$/.test(rawTicket)) return safeFailure();
  const ticketHash = await digest(rawTicket);
  try {
    const composition = resolveLocalPersistentComposition(environment, { requiredCapabilities: ["delivery"] });
    if (composition.status !== "ready") return safeFailure(503);
    const codec = await createPersistentOrderCapabilityCodec(environment, composition.value);
    const capability = await codec?.verify(readPersistentOrderCapabilityCookie(request), Math.floor(Date.now() / 1000));
    if (!capability) return safeFailure();
    const connection = await createLocalPersistentSupabaseAdapter(environment);
    if (connection.status !== "ready" || connection.composition.projectId !== composition.value.projectId
      || connection.composition.markerDigest !== composition.value.markerDigest) return safeFailure(503);

    const command = async (operation: "prepare" | "claim", candidate?: Prepared) => {
      const initial = await persistentOwnerVerifier(request, environment)();
      if (!initial) return null;
      const invoke = async (verified: typeof initial) => {
        const owner = verified.owner;
        const sessionToken = readCustomerAuthSessionId(request);
        if (owner.projectId !== composition.value.projectId || owner.kind === "customer" && !sessionToken) return null;
        const selector = owner.kind === "guest" ? await hashGuestResourceCapability(owner.ownerId) : owner.ownerId;
        if (!selector) return null;
        const authority = {
          p_project_id: composition.value.projectId, p_marker_digest: composition.value.markerDigest,
          p_owner_kind: owner.kind, p_owner_selector: selector,
          p_customer_id: owner.kind === "customer" ? owner.customerId : null,
          p_session_hash: owner.kind === "customer" ? await hashOpaqueCustomerSessionToken(sessionToken!) : null,
          p_authority_expires_at: new Date(Math.min(verified.expiresAt, capability.expiresAtSeconds) * 1000).toISOString(),
          p_capability_hash: capability.digest, p_public_reference: publicReference, p_ticket_hash: ticketHash,
        } as const;
        if (operation === "prepare") return connection.adapter.callRestrictedRpc<unknown>("digital_download_prepare", authority);
        if (!candidate) return null;
        const claimKey = await digest(`digital-claim:${ticketHash}`);
        const claimContext = await digest(JSON.stringify([
          publicReference, candidate.orderId, candidate.orderItemId, candidate.grantId,
          candidate.ticketId, candidate.digitalVersionId, candidate.contentDigest, candidate.byteSize,
        ]));
        return connection.adapter.callRestrictedRpc<unknown>("digital_download_claim", {
          ...authority, p_opened_version_id: candidate.digitalVersionId,
          p_opened_content_digest: candidate.contentDigest, p_opened_byte_size: candidate.byteSize,
          p_claim_key: claimKey, p_claim_context_digest: claimContext,
        });
      };
      let result = await invoke(initial);
      if ((!result || result.status !== "found") && initial.owner.kind === "guest") {
        const session = await createLocalPersistentCustomerAuthProvider(environment).getSession(readCustomerAuthSessionId(request));
        if (session.status === "ok" && session.value.authenticated && session.value.ownerId) {
          const verified = await persistentOwnerVerifier(request, environment, { kind: "customer",
            projectId: composition.value.projectId, ownerId: session.value.ownerId,
            customerId: session.value.customer.id })();
          if (verified) result = await invoke(verified);
        }
      }
      return result?.status === "found" ? result.value : null;
    };

    const preparedRpc = await command("prepare");
    if (!isRecord(preparedRpc) || preparedRpc.status !== "found") return safeFailure();
    const candidate = prepared(preparedRpc.value);
    if (!candidate) return safeFailure(503);
    const object = await connection.adapter.downloadPrivateObject(candidate.contentReference);
    if (object.status !== "found") return safeFailure(503);
    const bytes = new Uint8Array(await object.value.arrayBuffer());
    if (bytes.length !== candidate.byteSize || await digest(bytes) !== candidate.contentDigest) return safeFailure(503);
    const claimedRpc = await command("claim", candidate);
    if (!isRecord(claimedRpc) || claimedRpc.status !== "found" || !isRecord(claimedRpc.value)
      || !UUID.test(String(claimedRpc.value.attemptId))
      || String(claimedRpc.value.digitalVersionId) !== candidate.digitalVersionId) return safeFailure();
    const attemptId = String(claimedRpc.value.attemptId);
    const streamContextDigest = await digest(JSON.stringify([
      publicReference, candidate.orderId, candidate.orderItemId, candidate.grantId,
      candidate.ticketId, candidate.digitalVersionId, candidate.contentDigest,
      candidate.byteSize, attemptId,
    ]));
    const recordStreamResult = async (result: "streamed" | "failed"): Promise<void> => {
      try {
        await connection.adapter.callRestrictedRpc("digital_download_stream_result", {
          p_project_id: composition.value.projectId,
          p_marker_digest: composition.value.markerDigest,
          p_attempt_id: attemptId,
          p_result: result,
          p_context_digest: streamContextDigest,
        });
      } catch {
        // Claim/quota already committed. A missing result update deliberately
        // remains durable `unknown`; it never refunds or revives the ticket.
      }
    };
    let streamStarted = false;
    let streamCancelled = request.signal.aborted;
    let streamOutcomeRecorded = false;
    const recordStreamOutcome = async (result: "streamed" | "failed"): Promise<void> => {
      if (streamOutcomeRecorded) return;
      streamOutcomeRecorded = true;
      await recordStreamResult(result);
    };
    const markRequestAborted = (): void => {
      streamCancelled = true;
      void recordStreamOutcome("failed");
    };
    request.signal.addEventListener("abort", markRequestAborted, { once: true });
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        if (streamStarted) return;
        streamStarted = true;
        try {
          controller.enqueue(bytes);
          controller.close();
          // The current vinext boundary does not expose a trustworthy
          // transport-completion signal. Producing the Response body therefore
          // leaves the durable result as `unknown`; only a positively observed
          // abort, cancellation, or stream exception may record `failed`.
          if (streamCancelled || request.signal.aborted) await recordStreamOutcome("failed");
        } catch {
          await recordStreamOutcome("failed");
          try { controller.error(new Error("Digital delivery stream failed.")); } catch {}
        } finally {
          request.signal.removeEventListener("abort", markRequestAborted);
        }
      },
      async cancel() {
        streamCancelled = true;
        await recordStreamOutcome("failed");
        request.signal.removeEventListener("abort", markRequestAborted);
      },
    });

    return new Response(stream, { status: 200, headers: {
      "content-type": candidate.contentType, "content-length": String(bytes.length),
      "content-disposition": disposition(candidate.fileName), "cache-control": "private, no-store",
      "referrer-policy": "no-referrer", "x-content-type-options": "nosniff", "accept-ranges": "none",
    } });
  } catch {
    return safeFailure(503);
  }
}
