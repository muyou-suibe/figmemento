import type { LocalTrackingConfiguration } from "../config/local-tracking-runtime.ts";

export interface LocalTrackingOperatorAuthority {
  readonly actorKind: "operator";
  /** Stable server-derived context identity; never a credential or cookie. */
  readonly actorContextId: string;
}

export interface LocalTrackingOperatorVerifier {
  /** Implemented by a server-only caller; browser input never reaches this seam. */
  readonly verify: () => LocalTrackingOperatorAuthority | null;
}

export type LocalTrackingOperatorAuthorization =
  | { readonly status: "authorized"; readonly authority: LocalTrackingOperatorAuthority }
  | { readonly status: "disabled" | "unauthorized" };

const ACTOR_CONTEXT_ID_PATTERN = /^[A-Za-z0-9_-]{8,200}$/;

function isSafeAuthority(value: unknown): value is LocalTrackingOperatorAuthority {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return candidate.actorKind === "operator"
    && typeof candidate.actorContextId === "string"
    && ACTOR_CONTEXT_ID_PATTERN.test(candidate.actorContextId);
}

function normalizeAuthority(value: LocalTrackingOperatorAuthority): LocalTrackingOperatorAuthority {
  return { actorKind: "operator", actorContextId: value.actorContextId };
}

/**
 * Resolves Tracking operator authority independently from runtime enablement.
 * The runtime source alone never authorizes an operator, and this seam does
 * not accept customer capabilities or browser-provided role claims.
 */
export function resolveLocalTrackingOperatorAuthority(
  configuration: LocalTrackingConfiguration,
  verifier: LocalTrackingOperatorVerifier | undefined,
): LocalTrackingOperatorAuthorization {
  if (configuration.source === "disabled" || !["development", "test"].includes(configuration.runtimeMode)) {
    return { status: "disabled" };
  }
  if (!verifier) return { status: "unauthorized" };

  try {
    const authority = verifier.verify();
    return isSafeAuthority(authority)
      ? { status: "authorized", authority: normalizeAuthority(authority) }
      : { status: "unauthorized" };
  } catch {
    return { status: "unauthorized" };
  }
}
