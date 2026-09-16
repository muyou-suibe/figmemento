import type { CustomerUploadOwnerId } from "../domain/customer-upload.ts";
import { parseCustomerUploadOwnerId } from "../domain/customer-upload.ts";

const CONTEXT_VERSION = "v1";
const OWNER_ID_BYTES = 32;
const MAX_FUTURE_ISSUED_AT_SKEW_SECONDS = 60;

export interface GuestDraftOwnerContextConfiguration {
  readonly signingSecret: string;
  readonly contextLifetimeSeconds: number;
}

export interface GuestDraftOwnerContextDependencies {
  readonly nowSeconds?: () => number;
  readonly randomBytes?: (byteLength: number) => Uint8Array;
}

export interface IssuedGuestDraftOwnerContext {
  readonly ownerId: CustomerUploadOwnerId;
  /** Server-only cookie value. It must never be serialized into JSON or props. */
  readonly context: string;
  readonly issuedAt: number;
  readonly expiresAt: number;
}

export type GuestDraftOwnerContextIssueResult =
  | { status: "issued"; value: IssuedGuestDraftOwnerContext }
  | { status: "source_failure" };

export type GuestDraftOwnerContextVerification =
  | { status: "valid"; ownerId: CustomerUploadOwnerId; issuedAt: number; expiresAt: number }
  | { status: "missing" }
  | { status: "invalid" }
  | { status: "expired" }
  | { status: "source_failure" };

export interface GuestDraftOwnerContextCodec {
  issueGuestDraftOwner(): Promise<GuestDraftOwnerContextIssueResult>;
  verifyGuestDraftOwnerContext(
    context: string | null | undefined,
  ): Promise<GuestDraftOwnerContextVerification>;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlDecode(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - value.length % 4) % 4);
  try {
    const binary = atob(base64);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

function defaultRandomBytes(byteLength: number): Uint8Array {
  const bytes = new Uint8Array(byteLength);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

function validPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function canonicalPayload(ownerId: CustomerUploadOwnerId, issuedAt: number, expiresAt: number): string {
  return `${CONTEXT_VERSION}.${ownerId}.${issuedAt}.${expiresAt}`;
}

function parseTimestamp(value: string): number | null {
  if (!/^(?:0|[1-9]\d*)$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

async function importSigningKey(secret: string, usages: KeyUsage[]): Promise<CryptoKey> {
  return globalThis.crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usages,
  );
}

async function signCanonicalPayload(payload: string, secret: string): Promise<Uint8Array> {
  const key = await importSigningKey(secret, ["sign"]);
  const signature = await globalThis.crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return new Uint8Array(signature);
}

async function verifyCanonicalPayload(payload: string, signature: Uint8Array, secret: string): Promise<boolean> {
  const key = await importSigningKey(secret, ["verify"]);
  const signatureBuffer = new ArrayBuffer(signature.byteLength);
  new Uint8Array(signatureBuffer).set(signature);
  return globalThis.crypto.subtle.verify("HMAC", key, signatureBuffer, new TextEncoder().encode(payload));
}

/**
 * Pure server-side codec: a five-segment canonical context is signed with
 * HMAC-SHA-256. It does not know cookies, requests, databases, or providers.
 */
export function createGuestDraftOwnerContextCodec(
  configuration: GuestDraftOwnerContextConfiguration,
  dependencies: GuestDraftOwnerContextDependencies = {},
): GuestDraftOwnerContextCodec {
  const nowSeconds = dependencies.nowSeconds ?? (() => Math.floor(Date.now() / 1000));
  const randomBytes = dependencies.randomBytes ?? defaultRandomBytes;

  return {
    async issueGuestDraftOwner(): Promise<GuestDraftOwnerContextIssueResult> {
      try {
        const issuedAt = Math.floor(nowSeconds());
        if (!validPositiveInteger(configuration.contextLifetimeSeconds) || !Number.isSafeInteger(issuedAt) || issuedAt < 0) {
          return { status: "source_failure" };
        }
        const bytes = randomBytes(OWNER_ID_BYTES);
        if (!(bytes instanceof Uint8Array) || bytes.byteLength !== OWNER_ID_BYTES) return { status: "source_failure" };
        const ownerId = `gdo_${base64UrlEncode(bytes)}`;
        if (!parseCustomerUploadOwnerId(ownerId).ok) return { status: "source_failure" };
        const expiresAt = issuedAt + configuration.contextLifetimeSeconds;
        if (!Number.isSafeInteger(expiresAt)) return { status: "source_failure" };
        const payload = canonicalPayload(ownerId, issuedAt, expiresAt);
        const signature = await signCanonicalPayload(payload, configuration.signingSecret);
        return {
          status: "issued",
          value: { ownerId, context: `${payload}.${base64UrlEncode(signature)}`, issuedAt, expiresAt },
        };
      } catch {
        return { status: "source_failure" };
      }
    },

    async verifyGuestDraftOwnerContext(
      context: string | null | undefined,
    ): Promise<GuestDraftOwnerContextVerification> {
      if (context === null || context === undefined || context === "") return { status: "missing" };
      if (typeof context !== "string" || context.length > 1_024 || /\s/.test(context)) return { status: "invalid" };
      const segments = context.split(".");
      if (segments.length !== 5) return { status: "invalid" };
      const [version, ownerIdValue, issuedAtValue, expiresAtValue, signatureValue] = segments;
      if (version !== CONTEXT_VERSION || !ownerIdValue || !signatureValue) return { status: "invalid" };
      const parsedOwnerId = parseCustomerUploadOwnerId(ownerIdValue);
      const issuedAt = parseTimestamp(issuedAtValue);
      const expiresAt = parseTimestamp(expiresAtValue);
      const signature = base64UrlDecode(signatureValue);
      if (!parsedOwnerId.ok || issuedAt === null || expiresAt === null || expiresAt <= issuedAt || signature === null) {
        return { status: "invalid" };
      }
      try {
        const valid = await verifyCanonicalPayload(
          canonicalPayload(parsedOwnerId.value, issuedAt, expiresAt),
          signature,
          configuration.signingSecret,
        );
        if (!valid) return { status: "invalid" };
        const observedAt = Math.floor(nowSeconds());
        if (!Number.isSafeInteger(observedAt) || observedAt < 0) return { status: "source_failure" };
        if (issuedAt - observedAt > MAX_FUTURE_ISSUED_AT_SKEW_SECONDS) return { status: "invalid" };
        if (observedAt >= expiresAt) return { status: "expired" };
        return { status: "valid", ownerId: parsedOwnerId.value, issuedAt, expiresAt };
      } catch {
        return { status: "source_failure" };
      }
    },
  };
}
