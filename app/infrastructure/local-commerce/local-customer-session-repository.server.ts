import type {
  PersistentCustomerSessionCreate,
  PersistentCustomerSessionIdentity,
  PersistentCustomerSessionLookup,
  PersistentCustomerSessionPort,
  PersistentCustomerSessionRevoke,
} from "../../application/customer-auth-session-persistence.server.ts";
import type {
  LocalPersistentCustomerSessionRpcResult,
  LocalPersistentSupabaseAdapter,
} from "./local-persistent-supabase-adapter.server.ts";

function validProjectId(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value);
}

function validHash(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}

function validTimestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function unavailable(): { readonly status: "unavailable"; readonly reason: "source_failure" } {
  return { status: "unavailable", reason: "source_failure" };
}

function mapIdentity(
  projectId: string,
  result: LocalPersistentCustomerSessionRpcResult,
): PersistentCustomerSessionIdentity | null {
  if ((result.status !== "created" && result.status !== "found")
    || result.project_id !== projectId
    || typeof result.session_id !== "string"
    || typeof result.customer_id !== "string"
    || typeof result.owner_id !== "string"
    || typeof result.subject_hash !== "string"
    || result.subject_hash.length < 32
    || typeof result.created_at !== "string"
    || !validTimestamp(result.created_at)
    || typeof result.expires_at !== "string"
    || !validTimestamp(result.expires_at)
    || (result.revoked_at !== null && (typeof result.revoked_at !== "string" || !validTimestamp(result.revoked_at)))) {
    return null;
  }
  return {
    projectId,
    sessionId: result.session_id,
    customerId: result.customer_id,
    ownerId: result.owner_id,
    subjectHash: result.subject_hash,
    issuedAt: result.created_at,
    expiresAt: result.expires_at,
    revokedAt: result.revoked_at,
  };
}

function mapLookup(
  projectId: string,
  result: LocalPersistentCustomerSessionRpcResult,
): PersistentCustomerSessionLookup | PersistentCustomerSessionRevoke {
  if (result.status === "not_found" || result.status === "expired" || result.status === "revoked") return { status: result.status };
  const identity = mapIdentity(projectId, result);
  return identity ? { status: "found", value: identity } : unavailable();
}

/** Server-only repository over the local_commerce durable customer session RPCs. */
export class LocalPersistentCustomerSessionRepository implements PersistentCustomerSessionPort {
  private readonly adapter: LocalPersistentSupabaseAdapter;
  private readonly projectId: string;

  constructor(adapter: LocalPersistentSupabaseAdapter, projectId: string) {
    this.adapter = adapter;
    this.projectId = projectId;
  }

  async createSession(input: {
    readonly projectId: string;
    readonly ownerId: string;
    readonly customerId: string;
    readonly subjectHash: string;
    readonly sessionHash: string;
    readonly issuedAt: string;
    readonly expiresAt: string;
  }): Promise<PersistentCustomerSessionCreate> {
    if (
      !validProjectId(this.projectId)
      || input.projectId !== this.projectId
      || !input.ownerId.trim()
      || !input.customerId.trim()
      || input.subjectHash.trim().length < 32
      || !validHash(input.sessionHash)
      || !validTimestamp(input.issuedAt)
      || !validTimestamp(input.expiresAt)
      || Date.parse(input.expiresAt) <= Date.parse(input.issuedAt)
    ) return unavailable();

    const result = await this.adapter.createCustomerSession({
      p_project_id: input.projectId,
      p_owner_id: input.ownerId,
      p_customer_id: input.customerId,
      p_subject_hash: input.subjectHash,
      p_session_hash: input.sessionHash,
      p_created_at: input.issuedAt,
      p_expires_at: input.expiresAt,
    });
    if (result.status !== "found" || result.value.status !== "created") return unavailable();
    const identity = mapIdentity(this.projectId, result.value);
    return identity ? { status: "found", value: identity } : unavailable();
  }

  async lookupSession(input: {
    readonly projectId: string;
    readonly sessionHash: string;
    readonly now: string;
  }): Promise<PersistentCustomerSessionLookup> {
    if (!validProjectId(this.projectId) || input.projectId !== this.projectId || !validHash(input.sessionHash) || !validTimestamp(input.now)) return { status: "not_found" };
    const result = await this.adapter.lookupCustomerSession({
      p_project_id: input.projectId,
      p_session_hash: input.sessionHash,
      p_now: input.now,
    });
    if (result.status !== "found") return unavailable();
    return mapLookup(this.projectId, result.value) as PersistentCustomerSessionLookup;
  }

  async revokeSession(input: {
    readonly projectId: string;
    readonly sessionHash: string;
    readonly now: string;
  }): Promise<PersistentCustomerSessionRevoke> {
    if (!validProjectId(this.projectId) || input.projectId !== this.projectId || !validHash(input.sessionHash) || !validTimestamp(input.now)) return { status: "not_found" };
    const result = await this.adapter.revokeCustomerSession({
      p_project_id: input.projectId,
      p_session_hash: input.sessionHash,
      p_now: input.now,
    });
    if (result.status !== "found") return unavailable();
    return mapLookup(this.projectId, result.value) as PersistentCustomerSessionRevoke;
  }
}
