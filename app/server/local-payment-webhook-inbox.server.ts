import type { RuntimeEnvironment } from "../config/server.ts";
import { createLocalPersistentSupabaseAdapter } from "../infrastructure/local-commerce/local-persistent-supabase-adapter.server.ts";

type InboxState = "received" | "processing" | "reconciled" | "unmatched" | "unknown" | "stale" | "failed";
export interface SafeInboxEvent {
  readonly source: string; readonly externalEventId: string; readonly eventType: string;
  readonly occurredAt: string | null; readonly receivedAt: string; readonly bodyByteSize: number;
  readonly payloadDigest: string; readonly subjectKind: "payment" | "refund" | "unknown";
  readonly subjectReference: string | null;
  readonly facts: Readonly<Record<string, string | number>>;
  readonly state: InboxState; readonly version: number; readonly attemptCount: number;
  readonly reconciledAt: string | null;
}
type InboxResult = { readonly status: "found"; readonly replayed?: boolean; readonly value: SafeInboxEvent }
  | { readonly status: "conflict" | "not_found" | "unavailable" };
const unavailable = { status: "unavailable" as const };
const sourcePattern = /^[a-z][a-z0-9._-]{0,39}$/;
const eventIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function safeEvent(value: unknown): SafeInboxEvent | null {
  if (!record(value) || typeof value.source !== "string" || !sourcePattern.test(value.source)
    || typeof value.externalEventId !== "string" || !eventIdPattern.test(value.externalEventId)
    || typeof value.eventType !== "string" || !/^[a-z][a-z0-9._-]{0,63}$/.test(value.eventType)
    || (value.occurredAt !== null && (typeof value.occurredAt !== "string" || !Number.isFinite(Date.parse(value.occurredAt))))
    || typeof value.receivedAt !== "string" || !Number.isFinite(Date.parse(value.receivedAt))
    || !Number.isSafeInteger(value.bodyByteSize) || (value.bodyByteSize as number) < 1
    || (value.bodyByteSize as number) > 16384 || typeof value.payloadDigest !== "string"
    || !/^[0-9a-f]{64}$/.test(value.payloadDigest)
    || !["payment", "refund", "unknown"].includes(String(value.subjectKind))
    || (value.subjectReference !== null && (typeof value.subjectReference !== "string" || value.subjectReference.length > 96))
    || !record(value.facts) || Object.keys(value.facts).some(key => key !== "amountCents" && key !== "currency")
    || (value.facts.amountCents !== undefined && (!Number.isSafeInteger(value.facts.amountCents)
      || (value.facts.amountCents as number) < 0))
    || (value.facts.currency !== undefined && (typeof value.facts.currency !== "string"
      || !/^[A-Z]{3}$/.test(value.facts.currency)))
    || !["received", "processing", "reconciled", "unmatched", "unknown", "stale", "failed"].includes(String(value.state))
    || !Number.isSafeInteger(value.version) || (value.version as number) < 1
    || !Number.isSafeInteger(value.attemptCount) || (value.attemptCount as number) < 0
    || (value.reconciledAt !== null && (typeof value.reconciledAt !== "string" || !Number.isFinite(Date.parse(value.reconciledAt))))) return null;
  return {
    source: value.source, externalEventId: value.externalEventId, eventType: value.eventType,
    occurredAt: value.occurredAt as string | null, receivedAt: value.receivedAt,
    bodyByteSize: value.bodyByteSize as number, payloadDigest: value.payloadDigest,
    subjectKind: value.subjectKind as SafeInboxEvent["subjectKind"],
    subjectReference: value.subjectReference as string | null,
    facts: value.facts as SafeInboxEvent["facts"], state: value.state as InboxState,
    version: value.version as number, attemptCount: value.attemptCount as number,
    reconciledAt: value.reconciledAt as string | null,
  };
}

function parseResult(value: unknown): InboxResult {
  if (!record(value)) return unavailable;
  if (value.status === "conflict" || value.status === "not_found") return { status: value.status };
  const event = safeEvent(value.value);
  return value.status === "found" && event
    ? { status: "found", replayed: value.replayed === true, value: event } : unavailable;
}

async function digest(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(hash), part => part.toString(16).padStart(2, "0")).join("");
}

/** Internal verified-fixture intake only. No browser or provider route calls this. */
export async function ingestLocalPaymentEvidence(source: string, bytes: Uint8Array,
  environment: RuntimeEnvironment = process.env): Promise<InboxResult> {
  if (!sourcePattern.test(source) || bytes.length < 1 || bytes.length > 16384) return unavailable;
  const payloadDigest = await digest(bytes); // Exact bytes BEFORE parsing.
  let input: unknown;
  try { input = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { return unavailable; }
  if (!record(input) || Object.keys(input).some(key => !["id", "type", "occurredAt", "subjectReference", "amountCents", "currency"].includes(key))
    || typeof input.id !== "string" || !eventIdPattern.test(input.id)
    || typeof input.type !== "string" || !/^[a-z][a-z0-9._-]{0,63}$/.test(input.type)
    || typeof input.occurredAt !== "string" || !Number.isFinite(Date.parse(input.occurredAt))
    || (input.subjectReference !== undefined && (typeof input.subjectReference !== "string" || input.subjectReference.length > 96))
    || (input.amountCents !== undefined && (!Number.isSafeInteger(input.amountCents) || (input.amountCents as number) < 0))
    || (input.currency !== undefined && (typeof input.currency !== "string" || !/^[A-Z]{3}$/.test(input.currency)))) return unavailable;
  const subjectKind = input.type.startsWith("payment.") ? "payment" : input.type.startsWith("refund.") ? "refund" : "unknown";
  const subjectReference = subjectKind === "payment"
    ? (typeof input.subjectReference === "string" && /^LP-LOCAL-[A-Z0-9]{16}$/.test(input.subjectReference) ? input.subjectReference : null)
    : subjectKind === "refund"
      ? (typeof input.subjectReference === "string" && /^RF-LOCAL-[A-F0-9]{32}$/.test(input.subjectReference) ? input.subjectReference : null)
      : null;
  if (subjectKind !== "unknown" && !subjectReference) return unavailable;
  const facts: Record<string, string | number> = {};
  if (typeof input.amountCents === "number") facts.amountCents = input.amountCents;
  if (typeof input.currency === "string") facts.currency = input.currency;
  const connection = await createLocalPersistentSupabaseAdapter(environment);
  if (connection.status !== "ready") return unavailable;
  const result = await connection.adapter.callRestrictedRpc<unknown>("webhook_inbox_ingest", {
    p_project_id: connection.composition.projectId, p_marker_digest: connection.composition.markerDigest,
    p_source: source, p_external_event_id: input.id, p_payload_digest: payloadDigest,
    p_body_byte_size: bytes.length, p_event_type: input.type, p_occurred_at: input.occurredAt,
    p_subject_kind: subjectKind, p_subject_reference: subjectReference,
    p_facts: facts,
  });
  return result.status === "found" ? parseResult(result.value) : unavailable;
}

/** Claim and finalize use a DB-owned lease/fence. A process crash leaves an
 * expiring processing lease; a second process may retry after expiry. */
export async function processLocalPaymentEvidence(source: string, externalEventId: string,
  environment: RuntimeEnvironment = process.env): Promise<InboxResult> {
  if (!sourcePattern.test(source) || !eventIdPattern.test(externalEventId)) return unavailable;
  const connection = await createLocalPersistentSupabaseAdapter(environment);
  if (connection.status !== "ready") return unavailable;
  const common = { p_project_id: connection.composition.projectId,
    p_marker_digest: connection.composition.markerDigest, p_source: source, p_external_event_id: externalEventId };
  const claim = await connection.adapter.callRestrictedRpc<unknown>("webhook_inbox_claim", common);
  if (claim.status !== "found" || !record(claim.value)) return unavailable;
  if (claim.value.status === "conflict" || claim.value.status === "not_found") return { status: claim.value.status };
  if (claim.value.status !== "claimed" || typeof claim.value.leaseToken !== "string"
    || !/^[0-9a-f-]{36}$/.test(claim.value.leaseToken) || !Number.isSafeInteger(claim.value.version)) return unavailable;
  const finalized = await connection.adapter.callRestrictedRpc<unknown>("webhook_inbox_finalize", {
    ...common, p_lease_token: claim.value.leaseToken, p_expected_version: claim.value.version as number,
  });
  return finalized.status === "found" ? parseResult(finalized.value) : unavailable;
}

export async function readLocalPaymentInbox(input: { source: string | null; externalEventId: string | null;
  state: InboxState | null; limit: number }, environment: RuntimeEnvironment = process.env): Promise<
    { readonly status: "found"; readonly value: SafeInboxEvent | readonly SafeInboxEvent[] }
    | { readonly status: "not_found" | "unavailable" }> {
  const connection = await createLocalPersistentSupabaseAdapter(environment);
  if (connection.status !== "ready") return unavailable;
  const result = await connection.adapter.callRestrictedRpc<unknown>("admin_webhook_inbox_read", {
    p_project_id: connection.composition.projectId, p_marker_digest: connection.composition.markerDigest,
    p_actor_id: "configured-admin", p_source: input.source,
    p_external_event_id: input.externalEventId, p_state: input.state, p_limit: input.limit,
  });
  if (result.status !== "found" || !record(result.value)) return unavailable;
  if (result.value.status === "not_found") return { status: "not_found" };
  if (result.value.status !== "found") return unavailable;
  if (Array.isArray(result.value.value)) {
    const events = result.value.value.map(safeEvent);
    return events.some(event => !event) ? unavailable : { status: "found", value: events as SafeInboxEvent[] };
  }
  const event = safeEvent(result.value.value);
  return event ? { status: "found", value: event } : unavailable;
}
