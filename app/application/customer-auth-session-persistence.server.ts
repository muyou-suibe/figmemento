const SESSION_TOKEN_BYTES = 32;
const DEFAULT_SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_OPAQUE_TOKEN_LENGTH = 32;
const MAX_OPAQUE_TOKEN_LENGTH = 256;

export interface PersistentCustomerSessionIdentity {
  readonly projectId: string;
  readonly sessionId: string;
  readonly customerId: string;
  readonly ownerId: string;
  readonly subjectHash: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly revokedAt: string | null;
}

export type PersistentCustomerSessionCreate =
  | { readonly status: "found"; readonly value: PersistentCustomerSessionIdentity }
  | { readonly status: "unavailable"; readonly reason: "source_failure" };

export type PersistentCustomerSessionLookup =
  | { readonly status: "found"; readonly value: PersistentCustomerSessionIdentity }
  | { readonly status: "not_found" }
  | { readonly status: "expired" }
  | { readonly status: "revoked" }
  | { readonly status: "unavailable"; readonly reason: "source_failure" };

export type PersistentCustomerSessionRevoke =
  | { readonly status: "found"; readonly value: PersistentCustomerSessionIdentity }
  | { readonly status: "not_found" }
  | { readonly status: "expired" }
  | { readonly status: "revoked" }
  | { readonly status: "unavailable"; readonly reason: "source_failure" };

/**
 * Server-only durable session port. The port receives a token hash, never the
 * browser bearer token, and returns no credential material.
 */
export interface PersistentCustomerSessionPort {
  createSession(input: {
    readonly projectId: string;
    readonly ownerId: string;
    readonly customerId: string;
    readonly subjectHash: string;
    readonly sessionHash: string;
    readonly issuedAt: string;
    readonly expiresAt: string;
  }): Promise<PersistentCustomerSessionCreate>;
  lookupSession(input: {
    readonly projectId: string;
    readonly sessionHash: string;
    readonly now: string;
  }): Promise<PersistentCustomerSessionLookup>;
  revokeSession(input: {
    readonly projectId: string;
    readonly sessionHash: string;
    readonly now: string;
  }): Promise<PersistentCustomerSessionRevoke>;
}

export async function hashOpaqueCustomerSessionToken(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as BufferSource);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function isValidProjectId(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value);
}

function isOpaqueCustomerSessionToken(value: string): boolean {
  return value.length >= MIN_OPAQUE_TOKEN_LENGTH
    && value.length <= MAX_OPAQUE_TOKEN_LENGTH
    && /^[A-Za-z0-9_-]+$/.test(value);
}

function isValidTimestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function unavailable(): { readonly status: "unavailable"; readonly reason: "source_failure" } {
  return { status: "unavailable", reason: "source_failure" };
}

function randomOpaqueToken(): string {
  const bytes = new Uint8Array(SESSION_TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  let encoded = "";
  for (const byte of bytes) encoded += String.fromCharCode(byte);
  return btoa(encoded).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function createPersistentCustomerSession(input: {
  readonly projectId: string;
  readonly ownerId: string;
  readonly customerId: string;
  readonly subjectHash: string;
  readonly port: PersistentCustomerSessionPort;
  readonly nowMilliseconds?: number;
  readonly lifetimeMilliseconds?: number;
}): Promise<
  | { readonly status: "found"; readonly value: { readonly sessionToken: string; readonly session: PersistentCustomerSessionIdentity } }
  | { readonly status: "unavailable"; readonly reason: "source_failure" }
> {
  const nowMilliseconds = input.nowMilliseconds ?? Date.now();
  const lifetimeMilliseconds = input.lifetimeMilliseconds ?? DEFAULT_SESSION_LIFETIME_MS;
  if (
    !isValidProjectId(input.projectId)
    || !input.ownerId.trim()
    || !input.customerId.trim()
    || input.subjectHash.trim().length < 32
    || !Number.isFinite(nowMilliseconds)
    || !Number.isFinite(lifetimeMilliseconds)
    || lifetimeMilliseconds <= 0
    || lifetimeMilliseconds > DEFAULT_SESSION_LIFETIME_MS
  ) return unavailable();

  try {
    const sessionToken = randomOpaqueToken();
    const issuedAt = new Date(nowMilliseconds).toISOString();
    const expiresAt = new Date(nowMilliseconds + lifetimeMilliseconds).toISOString();
    const result = await input.port.createSession({
      projectId: input.projectId,
      ownerId: input.ownerId,
      customerId: input.customerId,
      subjectHash: input.subjectHash,
      sessionHash: await hashOpaqueCustomerSessionToken(sessionToken),
      issuedAt,
      expiresAt,
    });
    if (result.status !== "found") return result;
    return { status: "found", value: { sessionToken, session: result.value } };
  } catch {
    return unavailable();
  }
}

export async function lookupPersistentCustomerSession(
  input: { readonly projectId: string; readonly sessionToken: string; readonly nowMilliseconds?: number },
  port: PersistentCustomerSessionPort,
): Promise<PersistentCustomerSessionLookup> {
  if (!isValidProjectId(input.projectId) || !isOpaqueCustomerSessionToken(input.sessionToken)) return { status: "not_found" };
  try {
    const result = await port.lookupSession({
      projectId: input.projectId,
      sessionHash: await hashOpaqueCustomerSessionToken(input.sessionToken),
      now: new Date(input.nowMilliseconds ?? Date.now()).toISOString(),
    });
    return result;
  } catch {
    return unavailable();
  }
}

export async function revokePersistentCustomerSession(
  input: { readonly projectId: string; readonly sessionToken: string; readonly nowMilliseconds?: number },
  port: PersistentCustomerSessionPort,
): Promise<PersistentCustomerSessionRevoke> {
  if (!isValidProjectId(input.projectId) || !isOpaqueCustomerSessionToken(input.sessionToken)) return { status: "not_found" };
  try {
    const result = await port.revokeSession({
      projectId: input.projectId,
      sessionHash: await hashOpaqueCustomerSessionToken(input.sessionToken),
      now: new Date(input.nowMilliseconds ?? Date.now()).toISOString(),
    });
    return result;
  } catch {
    return unavailable();
  }
}

export function isPersistentCustomerSessionIdentity(value: unknown): value is PersistentCustomerSessionIdentity {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.projectId === "string"
    && typeof candidate.sessionId === "string"
    && typeof candidate.customerId === "string"
    && typeof candidate.ownerId === "string"
    && typeof candidate.subjectHash === "string"
    && candidate.subjectHash.length >= 32
    && typeof candidate.issuedAt === "string"
    && isValidTimestamp(candidate.issuedAt)
    && typeof candidate.expiresAt === "string"
    && isValidTimestamp(candidate.expiresAt)
    && (candidate.revokedAt === null || (typeof candidate.revokedAt === "string" && isValidTimestamp(candidate.revokedAt)));
}
