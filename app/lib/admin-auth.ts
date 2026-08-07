const sessionCookie = "photogift-admin-session";
const sessionLifetimeSeconds = 60 * 60 * 24 * 7;

function bytesToHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

async function sign(value: string, password: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return bytesToHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
}

export function getAdminPassword(): string | null {
  return process.env.ADMIN_PASSWORD || null;
}

export async function createAdminSession(): Promise<string> {
  const password = getAdminPassword();
  if (!password) throw new Error("ADMIN_PASSWORD_NOT_CONFIGURED");
  const timestamp = Math.floor(Date.now() / 1000).toString();
  return `${timestamp}.${await sign(`admin:${timestamp}`, password)}`;
}

export async function isValidAdminSession(token: string | null | undefined): Promise<boolean> {
  const password = getAdminPassword();
  if (!password || !token) return false;
  const [timestampValue, signature] = token.split(".");
  const timestamp = Number(timestampValue);
  const now = Date.now() / 1000;
  if (!timestampValue || !signature || !Number.isFinite(timestamp) || now - timestamp > sessionLifetimeSeconds || timestamp - now > 60) return false;
  return safeEqual(signature, await sign(`admin:${timestampValue}`, password));
}

export function getSessionCookieName(): string {
  return sessionCookie;
}

export function getSessionCookieHeader(token: string): string {
  const secureAttribute = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${sessionCookie}=${token}; Path=/; Max-Age=${sessionLifetimeSeconds}; HttpOnly; SameSite=Lax${secureAttribute}`;
}
