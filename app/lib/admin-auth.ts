import { createSignedAdminSession, verifySignedAdminSession } from "../application/admin-session";
import { readAdminPassword } from "../config/server";

const sessionCookie = "photogift-admin-session";
const sessionLifetimeSeconds = 60 * 60 * 24 * 7;

export function getAdminPassword(): string | null {
  return readAdminPassword();
}

export async function createAdminSession(): Promise<string> {
  const password = getAdminPassword();
  if (!password) throw new Error("ADMIN_PASSWORD_NOT_CONFIGURED");
  return createSignedAdminSession(password);
}

export async function isValidAdminSession(token: string | null | undefined): Promise<boolean> {
  return verifySignedAdminSession(token, getAdminPassword());
}

export function getSessionCookieName(): string {
  return sessionCookie;
}

export function getSessionCookieHeader(token: string): string {
  const secureAttribute = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${sessionCookie}=${token}; Path=/; Max-Age=${sessionLifetimeSeconds}; HttpOnly; SameSite=Lax${secureAttribute}`;
}
