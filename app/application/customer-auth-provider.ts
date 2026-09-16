import type {
  AuthenticatedCustomerAuthSession,
  CustomerAuthCredentials,
  CustomerAuthResult,
  CustomerAuthSession,
} from "../domain/customer-auth.ts";

export interface CustomerAuthAuthenticatedResult {
  readonly session: AuthenticatedCustomerAuthSession;
  /** Server-only opaque identifier. It must never be part of a public response. */
  readonly sessionId: string;
}

export interface CustomerAuthProvider {
  signUp(input: CustomerAuthCredentials): Promise<CustomerAuthResult<CustomerAuthAuthenticatedResult>>;
  signIn(input: CustomerAuthCredentials): Promise<CustomerAuthResult<CustomerAuthAuthenticatedResult>>;
  getSession(sessionId: string | null): Promise<CustomerAuthResult<CustomerAuthSession>>;
  signOut(sessionId: string | null): Promise<CustomerAuthResult<{ readonly session: CustomerAuthSession }>>;
}
