import type { CustomerAuthResult, CustomerAuthSession, CustomerIdentity } from "../domain/customer-auth.ts";
import { normalizeCustomerAuthCredentials, safeCustomerAuthError } from "../domain/customer-auth.ts";
import type { CustomerAuthAuthenticatedResult } from "../application/customer-auth-provider.ts";
import { getCustomerAuthRuntime, type CustomerAuthRuntime } from "./customer-auth-runtime.server.ts";

export const customerAuthCookieName = "figmemento-local-customer-session";

function readCookie(request: Request, name: string): string | null {
  const value = request.headers
    .get("cookie")
    ?.split(";")
    .find((part) => part.trim().startsWith(`${name}=`));
  if (!value) return null;
  try {
    const decoded = decodeURIComponent(value.trim().slice(name.length + 1));
    return decoded.length > 0 && decoded.length <= 256 ? decoded : null;
  } catch {
    return null;
  }
}

export function readCustomerAuthSessionId(request: Request): string | null {
  return readCookie(request, customerAuthCookieName);
}

/** Server-only identity lookup. A public reference or browser body is never used as ownership. */
export async function readAuthenticatedCustomer(
  request: Request,
  runtimeFactory: () => CustomerAuthRuntime = getCustomerAuthRuntime,
): Promise<CustomerIdentity | null> {
  try {
    const runtime = runtimeFactory();
    const result = await runtime.provider.getSession(readCustomerAuthSessionId(request));
    return result.status === "ok" && result.value.authenticated ? result.value.customer : null;
  } catch {
    return null;
  }
}

export function isSameOriginCustomerAuthMutation(request: Request): boolean {
  const originValue = request.headers.get("origin");
  if (!originValue) return false;
  try {
    const origin = new URL(originValue);
    const destination = new URL(request.url);
    if (origin.origin !== destination.origin) return false;
    const fetchSite = request.headers.get("sec-fetch-site");
    return fetchSite === null || fetchSite === "same-origin";
  } catch {
    return false;
  }
}

function customerCookieHeader(sessionId: string, runtimeMode: CustomerAuthRuntime["runtimeMode"]): string {
  const secure = runtimeMode === "production" ? "; Secure" : "";
  return `${customerAuthCookieName}=${encodeURIComponent(sessionId)}; Path=/; Max-Age=604800; HttpOnly; SameSite=Lax${secure}`;
}

export function clearCustomerAuthCookie(runtimeMode: CustomerAuthRuntime["runtimeMode"]): string {
  const secure = runtimeMode === "production" ? "; Secure" : "";
  return `${customerAuthCookieName}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure}`;
}

function responseForAuthError(error: unknown): Response {
  const normalized = safeCustomerAuthError(error);
  const status = normalized.code === "INVALID_REQUEST" || normalized.code === "INVALID_EMAIL"
    ? 400
    : normalized.code === "INVALID_CREDENTIALS" || normalized.code === "NOT_AUTHENTICATED"
      ? 401
      : normalized.code === "EMAIL_ALREADY_REGISTERED"
        ? 409
        : normalized.code === "AUTH_UNAVAILABLE" || normalized.code === "PROVIDER_FAILURE"
          ? 503
          : 429;
  return Response.json({ status: "error", code: normalized.code, message: normalized.message }, { status });
}

function safeSessionBody(session: CustomerAuthSession): Record<string, unknown> {
  if (!session.authenticated) return { authenticated: false };
  return {
    authenticated: true,
    customer: session.customer,
    customerId: session.customer.id,
    ...(session.ownerId ? { ownerId: session.ownerId } : {}),
    sessionStatus: session.sessionStatus ?? "active",
    issuedAt: session.issuedAt,
    expiresAt: session.expiresAt,
  };
}

function runtimeOrUnavailable(
  runtimeFactory: () => CustomerAuthRuntime,
): CustomerAuthRuntime | Response {
  try {
    return runtimeFactory();
  } catch {
    return Response.json(
      { status: "error", code: "AUTH_UNAVAILABLE", message: "Customer authentication is unavailable." },
      { status: 503 },
    );
  }
}

export async function handleCustomerAuthCredentialsMutation(
  request: Request,
  operation: "signUp" | "signIn",
  runtimeFactory: () => CustomerAuthRuntime = getCustomerAuthRuntime,
): Promise<Response> {
  if (request.method !== "POST") {
    return Response.json({ status: "error", code: "INVALID_REQUEST", message: "POST request required." }, { status: 405 });
  }
  if (!isSameOriginCustomerAuthMutation(request)) {
    return Response.json({ status: "error", code: "INVALID_REQUEST", message: "Same-origin request required." }, { status: 403 });
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return Response.json({ status: "error", code: "INVALID_REQUEST", message: "JSON request required." }, { status: 400 });
  }
  const body: unknown = await request.json().catch(() => null);
  const credentials = normalizeCustomerAuthCredentials(body);
  if (credentials.status === "error") return responseForAuthError(credentials.error);
  const runtime = runtimeOrUnavailable(runtimeFactory);
  if (runtime instanceof Response) return runtime;
  let result: Awaited<ReturnType<CustomerAuthRuntime["provider"][typeof operation]>>;
  try {
    result = await runtime.provider[operation](credentials.value);
  } catch {
    return responseForAuthError({ code: "AUTH_UNAVAILABLE" });
  }
  if (result.status === "error") return responseForAuthError(result.error);
  const response = Response.json({ status: "ok", ...safeSessionBody(result.value.session) });
  const headers = new Headers(response.headers);
  headers.set("set-cookie", customerCookieHeader(result.value.sessionId, runtime.runtimeMode));
  return new Response(response.body, { status: response.status, headers });
}

export async function handleCustomerAuthSession(
  request: Request,
  runtimeFactory: () => CustomerAuthRuntime = getCustomerAuthRuntime,
): Promise<Response> {
  if (request.method !== "GET") {
    return Response.json({ status: "error", code: "INVALID_REQUEST", message: "GET request required." }, { status: 405 });
  }
  const runtime = runtimeOrUnavailable(runtimeFactory);
  if (runtime instanceof Response) return runtime;
  let result: Awaited<ReturnType<CustomerAuthRuntime["provider"]["getSession"]>>;
  try {
    result = await runtime.provider.getSession(readCustomerAuthSessionId(request));
  } catch {
    return responseForAuthError({ code: "AUTH_UNAVAILABLE" });
  }
  if (result.status === "error") return responseForAuthError(result.error);
  return Response.json({ status: "ok", ...safeSessionBody(result.value) });
}

export async function handleCustomerAuthSignOut(
  request: Request,
  runtimeFactory: () => CustomerAuthRuntime = getCustomerAuthRuntime,
): Promise<Response> {
  if (request.method !== "POST") {
    return Response.json({ status: "error", code: "INVALID_REQUEST", message: "POST request required." }, { status: 405 });
  }
  if (!isSameOriginCustomerAuthMutation(request)) {
    return Response.json({ status: "error", code: "INVALID_REQUEST", message: "Same-origin request required." }, { status: 403 });
  }
  const runtime = runtimeOrUnavailable(runtimeFactory);
  if (runtime instanceof Response) return runtime;
  let result: CustomerAuthResult<{ readonly session: CustomerAuthSession }>;
  try {
    result = await runtime.provider.signOut(readCustomerAuthSessionId(request));
  } catch {
    return responseForAuthError({ code: "AUTH_UNAVAILABLE" });
  }
  if (result.status === "error") return responseForAuthError(result.error);
  const response = Response.json({ status: "ok", authenticated: false });
  const headers = new Headers(response.headers);
  headers.set("set-cookie", clearCustomerAuthCookie(runtime.runtimeMode));
  return new Response(response.body, { status: response.status, headers });
}

export function safeAuthenticatedResult(result: CustomerAuthResult<CustomerAuthAuthenticatedResult>): CustomerAuthSession | null {
  return result.status === "ok" ? result.value.session : null;
}
