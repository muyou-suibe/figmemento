import {
  authenticatePersistentCustomerAccountForSession,
  registerPersistentCustomerAccountForSession,
  type PersistentCustomerAccountPort,
  type PersistentCustomerAccountSessionIdentity,
} from "./customer-account-persistence.server.ts";
import {
  createPersistentCustomerSession,
  lookupPersistentCustomerSession,
  revokePersistentCustomerSession,
  type PersistentCustomerSessionIdentity,
} from "./customer-auth-session-persistence.server.ts";
import {
  type CustomerAuthProvider,
} from "./customer-auth-provider.ts";
import {
  customerAuthError,
  type AuthenticatedCustomerAuthSession,
  type CustomerAuthCredentials,
  type CustomerAuthResult,
  type CustomerAuthSession,
  type CustomerIdentity,
} from "../domain/customer-auth.ts";
import type { RuntimeEnvironment } from "../config/server.ts";
import {
  createLocalPersistentSupabaseAdapter,
  type LocalPersistentCustomerAccountIdentity,
} from "../infrastructure/local-commerce/local-persistent-supabase-adapter.server.ts";
import { LocalPersistentCustomerAccountRepository } from "../infrastructure/local-commerce/local-customer-account-repository.server.ts";
import { LocalPersistentCustomerSessionRepository } from "../infrastructure/local-commerce/local-customer-session-repository.server.ts";

type CustomerAccountIdentityReadResult =
  | LocalPersistentCustomerAccountIdentity
  | null
  | { readonly status: "unavailable" };

type PersistentCustomerAccountIdentityPort = PersistentCustomerAccountPort & {
  findByCustomerId(input: {
    readonly projectId: string;
    readonly customerId: string;
  }): Promise<CustomerAccountIdentityReadResult>;
};

type PersistentAdapterFactory = (
  environment: RuntimeEnvironment,
) => Promise<Awaited<ReturnType<typeof createLocalPersistentSupabaseAdapter>>>;

export interface PersistentCustomerAuthProviderDependencies {
  readonly adapterFactory?: PersistentAdapterFactory;
}

interface PersistentCustomerAuthPorts {
  readonly projectId: string;
  readonly accounts: PersistentCustomerAccountIdentityPort;
  readonly sessions: LocalPersistentCustomerSessionRepository;
}

function unauthenticatedSession(): CustomerAuthSession {
  return { authenticated: false };
}

function unavailable(): CustomerAuthResult<never> {
  return { status: "error", error: customerAuthError("AUTH_UNAVAILABLE") };
}

function authenticatedSession(
  account: PersistentCustomerAccountSessionIdentity,
  session: PersistentCustomerSessionIdentity,
): AuthenticatedCustomerAuthSession {
  const customer: CustomerIdentity = {
    id: account.customerId,
    email: account.normalizedEmail,
  };
  return {
    authenticated: true,
    customer,
    ownerId: account.ownerId,
    sessionStatus: "active",
    issuedAt: session.issuedAt,
    expiresAt: session.expiresAt,
  };
}

function authenticatedResult(
  account: PersistentCustomerAccountSessionIdentity,
  result: { readonly sessionToken: string; readonly session: PersistentCustomerSessionIdentity },
): CustomerAuthResult<{
  readonly session: AuthenticatedCustomerAuthSession;
  readonly sessionId: string;
}> {
  return {
    status: "ok",
    value: {
      session: authenticatedSession(account, result.session),
      sessionId: result.sessionToken,
    },
  };
}

async function resolvePorts(
  environment: RuntimeEnvironment,
  adapterFactory: PersistentAdapterFactory,
): Promise<PersistentCustomerAuthPorts | null> {
  try {
    const result = await adapterFactory(environment);
    if (result.status !== "ready") return null;
    const accounts = new LocalPersistentCustomerAccountRepository(
      result.adapter,
      result.composition.projectId,
    ) as PersistentCustomerAccountIdentityPort;
    return {
      projectId: result.composition.projectId,
      accounts,
      sessions: new LocalPersistentCustomerSessionRepository(
        result.adapter,
        result.composition.projectId,
      ),
    };
  } catch {
    return null;
  }
}

async function readCustomerIdentity(
  ports: PersistentCustomerAuthPorts,
  customerId: string,
): Promise<CustomerIdentity | null | "unavailable"> {
  const result = await ports.accounts.findByCustomerId({
    projectId: ports.projectId,
    customerId,
  });
  if (!result || "status" in result) return result === null ? null : "unavailable";
  if (result.ownerId.trim() === "") return "unavailable";
  return { id: result.customerId, email: result.normalizedEmail };
}

/**
 * Server-only local_persistent provider. Each operation resolves the
 * selected HTTP/RPC authority afresh; it never caches sessions or falls back
 * to local_fake when the durable authority is unavailable.
 */
export function createLocalPersistentCustomerAuthProvider(
  environment: RuntimeEnvironment = process.env,
  dependencies: PersistentCustomerAuthProviderDependencies = {},
): CustomerAuthProvider {
  const adapterFactory = dependencies.adapterFactory ?? createLocalPersistentSupabaseAdapter;

  async function portsOrUnavailable(): Promise<PersistentCustomerAuthPorts | null> {
    return resolvePorts(environment, adapterFactory);
  }

  return {
    async signUp(input: CustomerAuthCredentials) {
      const ports = await portsOrUnavailable();
      if (!ports) return unavailable();
      const accountResult = await registerPersistentCustomerAccountForSession(input, ports.accounts, ports.projectId);
      if (accountResult.status === "error") return accountResult;
      const sessionResult = await createPersistentCustomerSession({
        projectId: ports.projectId,
        ownerId: accountResult.value.account.ownerId,
        customerId: accountResult.value.account.customerId,
        subjectHash: accountResult.value.account.subjectHash,
        port: ports.sessions,
      });
      if (sessionResult.status !== "found") return unavailable();
      return authenticatedResult(accountResult.value.account, sessionResult.value);
    },

    async signIn(input: CustomerAuthCredentials) {
      const ports = await portsOrUnavailable();
      if (!ports) return unavailable();
      const accountResult = await authenticatePersistentCustomerAccountForSession(input, ports.accounts, ports.projectId);
      if (accountResult.status === "error") return accountResult;
      const sessionResult = await createPersistentCustomerSession({
        projectId: ports.projectId,
        ownerId: accountResult.value.account.ownerId,
        customerId: accountResult.value.account.customerId,
        subjectHash: accountResult.value.account.subjectHash,
        port: ports.sessions,
      });
      if (sessionResult.status !== "found") return unavailable();
      return authenticatedResult(accountResult.value.account, sessionResult.value);
    },

    async getSession(sessionId) {
      if (!sessionId) return { status: "ok", value: unauthenticatedSession() };
      const ports = await portsOrUnavailable();
      if (!ports) return unavailable();
      const sessionResult = await lookupPersistentCustomerSession(
        { projectId: ports.projectId, sessionToken: sessionId },
        ports.sessions,
      );
      if (sessionResult.status === "unavailable") return unavailable();
      if (sessionResult.status !== "found") return { status: "ok", value: unauthenticatedSession() };
      const customer = await readCustomerIdentity(ports, sessionResult.value.customerId);
      if (customer === "unavailable") return unavailable();
      if (!customer || customer.id !== sessionResult.value.customerId) {
        return { status: "ok", value: unauthenticatedSession() };
      }
      return {
        status: "ok",
        value: {
          authenticated: true,
          customer,
          ownerId: sessionResult.value.ownerId,
          sessionStatus: "active" as const,
          issuedAt: sessionResult.value.issuedAt,
          expiresAt: sessionResult.value.expiresAt,
        },
      };
    },

    async signOut(sessionId) {
      if (!sessionId) return { status: "error", error: customerAuthError("NOT_AUTHENTICATED") };
      const ports = await portsOrUnavailable();
      if (!ports) return unavailable();
      const revokeResult = await revokePersistentCustomerSession(
        { projectId: ports.projectId, sessionToken: sessionId },
        ports.sessions,
      );
      if (revokeResult.status === "unavailable") return unavailable();
      if (revokeResult.status !== "found") {
        return { status: "error", error: customerAuthError("NOT_AUTHENTICATED") };
      }
      return { status: "ok", value: { session: unauthenticatedSession() } };
    },
  };
}
