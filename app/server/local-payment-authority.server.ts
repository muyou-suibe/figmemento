import type { LocalOrderBrowserCapability } from "../application/local-order-repository.ts";

const AUTHORITY_CONTEXT_DOMAIN = "figmemento-local-payment-authority-v1";

/**
 * Derives a stable, non-reversible server context identity without retaining
 * or exposing the raw same-browser capability.
 */
export async function deriveLocalPaymentAuthorityContext(
  capability: LocalOrderBrowserCapability,
): Promise<string> {
  const input = `${AUTHORITY_CONTEXT_DOMAIN}\u0000${capability}`;
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
