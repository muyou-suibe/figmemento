import type { RuntimeEnvironment } from "../config/server.ts";

export const PERSISTENT_ORDER_COOKIE = "figmemento-local-order-access";
const encoder = new TextEncoder();
const tokenPattern = /^v1_([1-9][0-9]{0,11})_([1-9][0-9]{0,11})_([0-9a-f]{64})_([0-9a-f]{64})$/;
const hex = (bytes: ArrayBuffer | Uint8Array) => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
const bytes = (value: string) => Uint8Array.from(value.match(/../g) ?? [], part => Number.parseInt(part, 16));
const verified: unique symbol = Symbol("verified persistent Order capability");

/** Only verification produces this transient server value. No raw bearer is
 * passed to a repository; no owner identity is inferred from the capability. */
export interface VerifiedPersistentOrderCapability {
  readonly [verified]: true;
  readonly digest: string;
  readonly expiresAtSeconds: number;
}

export interface PersistentOrderCapabilityCodec {
  issue(nowSeconds: number): Promise<string>;
  verify(token: string | undefined, nowSeconds: number): Promise<VerifiedPersistentOrderCapability | null>;
  cookie(token: string, nowSeconds: number, secure: boolean): string;
}

/** The signing configuration is deliberately independent of guest/session
 * signing. No default/generated-on-restart secret or implicit TTL exists. */
export async function createPersistentOrderCapabilityCodec(
  environment: RuntimeEnvironment,
  identity: { readonly projectId: string; readonly markerDigest: string },
): Promise<PersistentOrderCapabilityCodec | null> {
  try {
    const secret = environment.LOCAL_ORDER_CAPABILITY_SECRET;
    const ttlText = environment.LOCAL_ORDER_CAPABILITY_TTL_SECONDS;
    const ttl = Number(ttlText);
    if (!["development", "test"].includes(environment.NODE_ENV ?? "")
      || environment.LOCAL_ORDER_SOURCE !== "local_persistent"
      || !secret || !/^[0-9a-f]{64,128}$/.test(secret) || secret.length % 2 !== 0
      || !ttlText || !/^[1-9][0-9]*$/.test(ttlText) || !Number.isSafeInteger(ttl) || ttl > 2_592_000
      || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(identity.projectId)
      || !/^[0-9a-f]{64}$/.test(identity.markerDigest)) return null;
    const key = await crypto.subtle.importKey("raw", bytes(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
    const authenticated = (payload: string) => encoder.encode(JSON.stringify(["local-order-capability", identity.projectId, identity.markerDigest, payload]));
    const validTime = (now: number) => Number.isSafeInteger(now) && now > 0;
    return {
      async issue(now) {
        if (!validTime(now) || !Number.isSafeInteger(now + ttl)) throw new Error("capability unavailable");
        const payload = `v1_${now}_${now + ttl}_${hex(crypto.getRandomValues(new Uint8Array(32)))}`;
        return `${payload}_${hex(await crypto.subtle.sign("HMAC", key, authenticated(payload)))}`;
      },
      async verify(token, now) {
        if (!validTime(now) || !token || token.length > 200) return null;
        const match = tokenPattern.exec(token);
        if (!match) return null;
        const issuedAt = Number(match[1]), expiresAt = Number(match[2]);
        if (!Number.isSafeInteger(issuedAt) || !Number.isSafeInteger(expiresAt)
          || issuedAt > now || now >= expiresAt || expiresAt <= issuedAt || expiresAt - issuedAt > ttl) return null;
        const payload = token.slice(0, token.lastIndexOf("_"));
        if (!await crypto.subtle.verify("HMAC", key, bytes(match[4]), authenticated(payload))) return null;
        return Object.freeze({ [verified]: true as const, digest: hex(await crypto.subtle.digest("SHA-256", encoder.encode(token))), expiresAtSeconds: expiresAt });
      },
      cookie(token, now, secure) {
        const match = tokenPattern.exec(token);
        if (!match || !validTime(now) || Number(match[2]) <= now) throw new Error("capability unavailable");
        return `${PERSISTENT_ORDER_COOKIE}=${token}; Path=/; Max-Age=${Number(match[2]) - now}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
      },
    };
  } catch { return null; }
}

export function readPersistentOrderCapabilityCookie(request: Request): string | undefined {
  const header = request.headers.get("cookie");
  if (!header || header.length > 16_384) return undefined;
  const matches = header.split(";").map(part => part.trim()).filter(part => part.startsWith(`${PERSISTENT_ORDER_COOKIE}=`));
  // Ambiguous duplicate cookies are not an authentication mechanism.
  if (matches.length !== 1) return undefined;
  const value = matches[0].slice(PERSISTENT_ORDER_COOKIE.length + 1);
  return value.length <= 200 ? value : undefined;
}

/** All expiries use server seconds; callers must fresh-verify the selected
 * Cart owner (and, for members, session) independently of this capability. */
export function boundedPersistentOrderGrantExpiry(
  capability: VerifiedPersistentOrderCapability,
  ownerExpiresAtSeconds: number,
  nowSeconds: number,
): string | null {
  // Durable session timestamps retain milliseconds; verified member expiry is
  // therefore legitimately fractional seconds. Never round it upward.
  if (capability[verified] !== true || !Number.isFinite(ownerExpiresAtSeconds)
    || !Number.isSafeInteger(nowSeconds) || nowSeconds < 1) return null;
  const expiry = Math.min(capability.expiresAtSeconds, ownerExpiresAtSeconds);
  return expiry > nowSeconds ? new Date(expiry * 1000).toISOString() : null;
}

/** Called only after HTTP method/origin/body and source/project/marker gates.
 * Establishment has no repository/owner/mutation dependency whatsoever. */
export async function persistentOrderCapabilityGate(
  request: Request,
  codec: PersistentOrderCapabilityCodec,
  nowSeconds: number,
): Promise<{ readonly status: "verified"; readonly capability: VerifiedPersistentOrderCapability }
  | { readonly status: "established"; readonly response: Response }> {
  const capability = await codec.verify(readPersistentOrderCapabilityCookie(request), nowSeconds);
  if (capability) return { status: "verified", capability };
  const token = await codec.issue(nowSeconds);
  return { status: "established", response: new Response(null, { status: 204, headers: {
    "set-cookie": codec.cookie(token, nowSeconds, new URL(request.url).protocol === "https:"),
    "cache-control": "no-store", "referrer-policy": "no-referrer",
  } }) };
}
