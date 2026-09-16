export interface CustomerIdentity {
  readonly id: string;
  readonly email: string;
}

export interface UnauthenticatedCustomerAuthSession {
  readonly authenticated: false;
}

export interface AuthenticatedCustomerAuthSession {
  readonly authenticated: true;
  readonly customer: CustomerIdentity;
  /** Present for durable sessions; omitted by the legacy local_fake adapter. */
  readonly ownerId?: string;
  readonly sessionStatus?: "active";
  readonly issuedAt: string;
  readonly expiresAt: string;
}

export type CustomerAuthSession =
  | UnauthenticatedCustomerAuthSession
  | AuthenticatedCustomerAuthSession;

export interface CustomerAuthCredentials {
  readonly email: string;
  readonly password: string;
}

export type CustomerAuthErrorCode =
  | "INVALID_CREDENTIALS"
  | "EMAIL_ALREADY_REGISTERED"
  | "INVALID_EMAIL"
  | "INVALID_REQUEST"
  | "NOT_AUTHENTICATED"
  | "AUTH_UNAVAILABLE"
  | "RATE_LIMITED"
  | "PROVIDER_FAILURE";

export interface CustomerAuthError {
  readonly code: CustomerAuthErrorCode;
  readonly message: string;
}

export type CustomerAuthResult<T> =
  | { readonly status: "ok"; readonly value: T }
  | { readonly status: "error"; readonly error: CustomerAuthError };

export type NormalizedCredentialsResult =
  | { readonly status: "ok"; readonly value: CustomerAuthCredentials }
  | { readonly status: "error"; readonly error: CustomerAuthError };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;
const MAX_PASSWORD_LENGTH = 1024;

const publicErrorMessages: Readonly<Record<CustomerAuthErrorCode, string>> = {
  INVALID_CREDENTIALS: "Unable to sign in with those details.",
  EMAIL_ALREADY_REGISTERED: "Unable to create an account with those details.",
  INVALID_EMAIL: "Enter a valid email address.",
  INVALID_REQUEST: "Check the form and try again.",
  NOT_AUTHENTICATED: "You are not signed in.",
  AUTH_UNAVAILABLE: "Customer accounts are not enabled in this environment.",
  RATE_LIMITED: "Too many attempts. Please try again later.",
  PROVIDER_FAILURE: "Customer authentication is temporarily unavailable.",
};

export function customerAuthError(code: CustomerAuthErrorCode): CustomerAuthError {
  return { code, message: publicErrorMessages[code] };
}

export function normalizeCustomerEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length === 0 || email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) return null;
  return email;
}

export function normalizeCustomerAuthCredentials(value: unknown): NormalizedCredentialsResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { status: "error", error: customerAuthError("INVALID_REQUEST") };
  }
  const input = value as { email?: unknown; password?: unknown };
  const email = normalizeCustomerEmail(input.email);
  if (!email) return { status: "error", error: customerAuthError("INVALID_EMAIL") };
  if (
    typeof input.password !== "string" ||
    input.password.length < 1 ||
    input.password.length > MAX_PASSWORD_LENGTH
  ) {
    return { status: "error", error: customerAuthError("INVALID_REQUEST") };
  }
  return { status: "ok", value: { email, password: input.password } };
}

export function safeCustomerAuthError(error: unknown): CustomerAuthError {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && code in publicErrorMessages) {
      return customerAuthError(code as CustomerAuthErrorCode);
    }
  }
  return customerAuthError("PROVIDER_FAILURE");
}
