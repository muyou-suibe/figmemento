import {
  customerAuthError,
  normalizeCustomerAuthCredentials,
  type CustomerAuthResult,
  type CustomerIdentity,
} from "../domain/customer-auth.ts";
import {
  createCustomerSubjectHash,
  hashCustomerPassword,
  verifyCustomerPassword,
} from "./customer-auth-password.server.ts";

export interface PersistentCustomerAccountIdentity {
  readonly projectId: string;
  readonly customerId: string;
  readonly ownerId: string;
  readonly normalizedEmail: string;
}

/** Internal server-only credential projection. It is never a public result. */
export interface PersistentCustomerAccountCredential extends PersistentCustomerAccountIdentity {
  /** Internal stable subject copied from the canonical customer owner. */
  readonly subjectHash: string;
  readonly passwordHash: string;
  readonly accountStatus: "active" | "disabled";
}

export interface PersistentCustomerAccountSessionIdentity extends PersistentCustomerAccountIdentity {
  /** Internal stable subject used to bind a durable session. */
  readonly subjectHash: string;
}

export type PersistentCustomerAccountRegistration =
  | { readonly status: "created"; readonly value: PersistentCustomerAccountIdentity }
  | { readonly status: "conflict"; readonly reason: "email_already_registered" }
  | { readonly status: "unavailable"; readonly reason: "source_failure" };

export type PersistentCustomerAccountLookup =
  | { readonly status: "found"; readonly value: PersistentCustomerAccountCredential }
  | { readonly status: "not_found" }
  | { readonly status: "unavailable"; readonly reason: "source_failure" };

/**
 * Narrow account persistence seam. It receives normalized server-side input
 * and returns only an opaque identity projection for registration.
 */
export interface PersistentCustomerAccountPort {
  register(input: {
    readonly projectId: string;
    readonly normalizedEmail: string;
    readonly passwordHash: string;
    readonly subjectHash: string;
  }): Promise<PersistentCustomerAccountRegistration>;
  findByEmail(input: {
    readonly projectId: string;
    readonly normalizedEmail: string;
  }): Promise<PersistentCustomerAccountLookup>;
}

export async function registerPersistentCustomerAccount(
  input: unknown,
  port: PersistentCustomerAccountPort,
  projectId: string,
): Promise<CustomerAuthResult<{ readonly customer: CustomerIdentity }>> {
  const credentials = normalizeCustomerAuthCredentials(input);
  if (credentials.status === "error") return credentials;
  if (!projectId.trim()) return { status: "error", error: customerAuthError("AUTH_UNAVAILABLE") };

  try {
    const passwordHash = await hashCustomerPassword(credentials.value.password);
    const result = await port.register({
      projectId,
      normalizedEmail: credentials.value.email,
      passwordHash,
      subjectHash: createCustomerSubjectHash(),
    });
    if (result.status === "conflict") {
      return { status: "error", error: customerAuthError("EMAIL_ALREADY_REGISTERED") };
    }
    if (result.status === "unavailable") {
      return { status: "error", error: customerAuthError("AUTH_UNAVAILABLE") };
    }
    return {
      status: "ok",
      value: { customer: { id: result.value.customerId, email: result.value.normalizedEmail } },
    };
  } catch {
    return { status: "error", error: customerAuthError("AUTH_UNAVAILABLE") };
  }
}

/**
 * Registration projection for the server-side session provider. The subject
 * hash is retained only inside the server application boundary and is never
 * returned by the customer-auth HTTP surface.
 */
export async function registerPersistentCustomerAccountForSession(
  input: unknown,
  port: PersistentCustomerAccountPort,
  projectId: string,
): Promise<CustomerAuthResult<{ readonly account: PersistentCustomerAccountSessionIdentity }>> {
  const credentials = normalizeCustomerAuthCredentials(input);
  if (credentials.status === "error") return credentials;
  if (!projectId.trim()) return { status: "error", error: customerAuthError("AUTH_UNAVAILABLE") };

  try {
    const passwordHash = await hashCustomerPassword(credentials.value.password);
    const subjectHash = createCustomerSubjectHash();
    const result = await port.register({
      projectId,
      normalizedEmail: credentials.value.email,
      passwordHash,
      subjectHash,
    });
    if (result.status === "conflict") {
      return { status: "error", error: customerAuthError("EMAIL_ALREADY_REGISTERED") };
    }
    if (result.status === "unavailable") {
      return { status: "error", error: customerAuthError("AUTH_UNAVAILABLE") };
    }
    return {
      status: "ok",
      value: {
        account: {
          ...result.value,
          subjectHash,
        },
      },
    };
  } catch {
    return { status: "error", error: customerAuthError("AUTH_UNAVAILABLE") };
  }
}

/**
 * Authentication projection for the server-side session provider. Password
 * verification remains owned by the existing account persistence boundary.
 */
export async function authenticatePersistentCustomerAccountForSession(
  input: unknown,
  port: PersistentCustomerAccountPort,
  projectId: string,
): Promise<CustomerAuthResult<{ readonly account: PersistentCustomerAccountSessionIdentity }>> {
  const credentials = normalizeCustomerAuthCredentials(input);
  if (credentials.status === "error") return credentials;
  if (!projectId.trim()) return { status: "error", error: customerAuthError("AUTH_UNAVAILABLE") };

  try {
    const result = await port.findByEmail({ projectId, normalizedEmail: credentials.value.email });
    if (result.status === "unavailable") {
      return { status: "error", error: customerAuthError("AUTH_UNAVAILABLE") };
    }
    if (
      result.status === "not_found"
      || result.value.accountStatus !== "active"
      || !result.value.subjectHash
    ) {
      return { status: "error", error: customerAuthError("INVALID_CREDENTIALS") };
    }
    if (!(await verifyCustomerPassword(credentials.value.password, result.value.passwordHash))) {
      return { status: "error", error: customerAuthError("INVALID_CREDENTIALS") };
    }
    return {
      status: "ok",
      value: {
        account: {
          projectId: result.value.projectId,
          customerId: result.value.customerId,
          ownerId: result.value.ownerId,
          normalizedEmail: result.value.normalizedEmail,
          subjectHash: result.value.subjectHash,
        },
      },
    };
  } catch {
    return { status: "error", error: customerAuthError("AUTH_UNAVAILABLE") };
  }
}

export async function authenticatePersistentCustomerAccount(
  input: unknown,
  port: PersistentCustomerAccountPort,
  projectId: string,
): Promise<CustomerAuthResult<{ readonly customer: CustomerIdentity }>> {
  const credentials = normalizeCustomerAuthCredentials(input);
  if (credentials.status === "error") return credentials;
  if (!projectId.trim()) return { status: "error", error: customerAuthError("AUTH_UNAVAILABLE") };

  try {
    const result = await port.findByEmail({ projectId, normalizedEmail: credentials.value.email });
    if (result.status === "unavailable") {
      return { status: "error", error: customerAuthError("AUTH_UNAVAILABLE") };
    }
    if (result.status === "not_found" || result.value.accountStatus !== "active") {
      return { status: "error", error: customerAuthError("INVALID_CREDENTIALS") };
    }
    if (!(await verifyCustomerPassword(credentials.value.password, result.value.passwordHash))) {
      return { status: "error", error: customerAuthError("INVALID_CREDENTIALS") };
    }
    return {
      status: "ok",
      value: { customer: { id: result.value.customerId, email: result.value.normalizedEmail } },
    };
  } catch {
    return { status: "error", error: customerAuthError("AUTH_UNAVAILABLE") };
  }
}
