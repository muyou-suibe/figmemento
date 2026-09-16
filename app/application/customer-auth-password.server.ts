const PASSWORD_HASH_ALGORITHM = "pbkdf2-sha256" as const;
const PASSWORD_HASH_VERSION = "v1" as const;
const PASSWORD_HASH_ITERATIONS = 210_000;
const PASSWORD_SALT_BYTES = 16;
const PASSWORD_DERIVED_BYTES = 32;

const PASSWORD_HASH_PATTERN = new RegExp(
  `^${PASSWORD_HASH_ALGORITHM}\\$${PASSWORD_HASH_VERSION}\\$([0-9]+)\\$([A-Za-z0-9_-]+)\\$([A-Za-z0-9_-]+)$`,
);

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

async function derivePassword(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as unknown as BufferSource, iterations },
    key,
    PASSWORD_DERIVED_BYTES * 8,
  );
  return new Uint8Array(bits);
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

/**
 * Server-only password hash. The encoded value contains a version, work
 * factor, random salt and derived key, never the source password.
 */
export async function hashCustomerPassword(password: string): Promise<string> {
  if (typeof password !== "string" || password.length === 0) throw new TypeError("password is required");
  const salt = crypto.getRandomValues(new Uint8Array(PASSWORD_SALT_BYTES));
  const derived = await derivePassword(password, salt, PASSWORD_HASH_ITERATIONS);
  return `${PASSWORD_HASH_ALGORITHM}$${PASSWORD_HASH_VERSION}$${PASSWORD_HASH_ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(derived)}`;
}

export function isCustomerPasswordHash(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = PASSWORD_HASH_PATTERN.exec(value);
  if (!match) return false;
  const iterations = Number(match[1]);
  const salt = fromBase64Url(match[2]);
  const derived = fromBase64Url(match[3]);
  return Number.isSafeInteger(iterations)
    && iterations >= 100_000
    && iterations <= 1_000_000
    && salt?.length === PASSWORD_SALT_BYTES
    && derived?.length === PASSWORD_DERIVED_BYTES;
}

/** Verifies an internal credential record without exposing hash material. */
export async function verifyCustomerPassword(password: string, encodedHash: string): Promise<boolean> {
  const match = PASSWORD_HASH_PATTERN.exec(encodedHash);
  if (!match || !isCustomerPasswordHash(encodedHash)) return false;
  const iterations = Number(match[1]);
  const salt = fromBase64Url(match[2]);
  const expected = fromBase64Url(match[3]);
  if (!salt || !expected) return false;
  const actual = await derivePassword(password, salt, iterations);
  return sameBytes(actual, expected);
}

/** A stable opaque subject value generated once and persisted with the account. */
export function createCustomerSubjectHash(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}
