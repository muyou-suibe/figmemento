import {
  customerAuthError,
  normalizeCustomerAuthCredentials,
  type AuthenticatedCustomerAuthSession,
  type CustomerAuthCredentials,
  type CustomerAuthResult,
  type CustomerAuthSession,
  type CustomerIdentity,
} from "../domain/customer-auth.ts";
import type {
  CustomerAuthAuthenticatedResult,
  CustomerAuthProvider,
} from "./customer-auth-provider.ts";

const LOCAL_SESSION_LIFETIME_SECONDS = 60 * 60 * 24 * 7;

interface LocalCustomerRecord {
  readonly identity: CustomerIdentity;
  readonly passwordDigest: string;
}

interface LocalSessionRecord {
  readonly customerId: string;
  readonly issuedAt: number;
  readonly expiresAt: number;
}

export interface LocalFakeCustomerAuthDependencies {
  readonly nowMilliseconds?: () => number;
  readonly randomId?: () => string;
}

function nowMilliseconds(): number {
  return Date.now();
}

function randomId(): string {
  return globalThis.crypto.randomUUID();
}

async function digestPassword(password: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(password),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function authenticatedSession(
  record: LocalCustomerRecord,
  session: LocalSessionRecord,
): AuthenticatedCustomerAuthSession {
  return {
    authenticated: true,
    customer: record.identity,
    issuedAt: new Date(session.issuedAt).toISOString(),
    expiresAt: new Date(session.expiresAt).toISOString(),
  };
}

function unauthenticatedSession(): CustomerAuthSession {
  return { authenticated: false };
}

/**
 * Development/test-only provider. Its records are intentionally process-local
 * and are not a production credential or persistence system.
 */
export function createLocalFakeCustomerAuthProvider(
  dependencies: LocalFakeCustomerAuthDependencies = {},
): CustomerAuthProvider {
  const usersByEmail = new Map<string, LocalCustomerRecord>();
  const usersById = new Map<string, LocalCustomerRecord>();
  const sessions = new Map<string, LocalSessionRecord>();
  const getNowMilliseconds = dependencies.nowMilliseconds ?? nowMilliseconds;
  const createRandomId = dependencies.randomId ?? randomId;

  async function issueSession(record: LocalCustomerRecord): Promise<CustomerAuthAuthenticatedResult> {
    const issuedAt = getNowMilliseconds();
    const sessionId = createRandomId();
    const session = {
      customerId: record.identity.id,
      issuedAt,
      expiresAt: issuedAt + LOCAL_SESSION_LIFETIME_SECONDS * 1000,
    } satisfies LocalSessionRecord;
    sessions.set(sessionId, session);
    return { session: authenticatedSession(record, session), sessionId };
  }

  async function findAuthenticatedSession(sessionId: string | null): Promise<CustomerAuthResult<CustomerAuthSession>> {
    if (!sessionId) return { status: "ok", value: unauthenticatedSession() };
    const session = sessions.get(sessionId);
    if (!session) return { status: "ok", value: unauthenticatedSession() };
    if (session.expiresAt <= getNowMilliseconds()) {
      sessions.delete(sessionId);
      return { status: "ok", value: unauthenticatedSession() };
    }
    const record = usersById.get(session.customerId);
    if (!record) {
      sessions.delete(sessionId);
      return { status: "ok", value: unauthenticatedSession() };
    }
    return { status: "ok", value: authenticatedSession(record, session) };
  }

  return {
    async signUp(input: CustomerAuthCredentials) {
      const parsed = normalizeCustomerAuthCredentials(input);
      if (parsed.status === "error") return parsed;
      if (usersByEmail.has(parsed.value.email)) {
        return { status: "error", error: customerAuthError("EMAIL_ALREADY_REGISTERED") };
      }
      const identity: CustomerIdentity = { id: createRandomId(), email: parsed.value.email };
      const record: LocalCustomerRecord = {
        identity,
        passwordDigest: await digestPassword(parsed.value.password),
      };
      usersByEmail.set(identity.email, record);
      usersById.set(identity.id, record);
      return { status: "ok", value: await issueSession(record) };
    },

    async signIn(input: CustomerAuthCredentials) {
      const parsed = normalizeCustomerAuthCredentials(input);
      if (parsed.status === "error") return parsed;
      const record = usersByEmail.get(parsed.value.email);
      const digest = await digestPassword(parsed.value.password);
      if (!record || record.passwordDigest !== digest) {
        return { status: "error", error: customerAuthError("INVALID_CREDENTIALS") };
      }
      return { status: "ok", value: await issueSession(record) };
    },

    getSession: (sessionId) => findAuthenticatedSession(sessionId),

    async signOut(sessionId) {
      if (sessionId) sessions.delete(sessionId);
      return { status: "ok", value: { session: unauthenticatedSession() } };
    },
  };
}

export function createDisabledCustomerAuthProvider(): CustomerAuthProvider {
  const unavailable = () => ({
    status: "error" as const,
    error: customerAuthError("AUTH_UNAVAILABLE"),
  });
  return {
    async signUp() { return unavailable(); },
    async signIn() { return unavailable(); },
    async getSession() { return unavailable(); },
    async signOut() { return unavailable(); },
  };
}
