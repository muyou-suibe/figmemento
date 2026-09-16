import type { LocalFulfillmentConfiguration } from "../config/local-fulfillment-runtime.ts";

export interface LocalFulfillmentOperatorAuthority {
  readonly actorKind: "operator";
  /** Stable server-derived context identity; never a credential or cookie. */
  readonly actorContextId: string;
}

export interface LocalFulfillmentOperatorVerifier {
  /** Implemented by a server-only caller; browser input never reaches this seam. */
  readonly verify: () => LocalFulfillmentOperatorAuthority | null;
}

export type LocalFulfillmentOperatorAuthorization =
  | { readonly status: "authorized"; readonly authority: LocalFulfillmentOperatorAuthority }
  | { readonly status: "disabled" | "unauthorized" };

const ACTOR_CONTEXT_ID_PATTERN = /^[A-Za-z0-9_-]{8,200}$/;

function isSafeAuthority(value: unknown): value is LocalFulfillmentOperatorAuthority {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return candidate.actorKind === "operator"
    && typeof candidate.actorContextId === "string"
    && ACTOR_CONTEXT_ID_PATTERN.test(candidate.actorContextId);
}

/**
 * Resolves the deliberately separate local operator authority. Runtime
 * enablement is checked independently and never creates operator authority.
 */
export function resolveLocalFulfillmentOperatorAuthority(
  configuration: LocalFulfillmentConfiguration,
  verifier: LocalFulfillmentOperatorVerifier | undefined,
): LocalFulfillmentOperatorAuthorization {
  if (configuration.source !== "local_fake" || !["development", "test"].includes(configuration.runtimeMode)) {
    return { status: "disabled" };
  }
  if (!verifier) return { status: "unauthorized" };

  try {
    const authority = verifier.verify();
    return isSafeAuthority(authority)
      ? { status: "authorized", authority }
      : { status: "unauthorized" };
  } catch {
    return { status: "unauthorized" };
  }
}
