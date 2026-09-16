import { isSupplierOperatorAuthority, type SupplierOperatorAuthority } from "../domain/supplier-operations.ts";
import type { LocalSupplierConfiguration } from "../config/local-supplier-runtime.ts";
import { isLocalSupplierRuntimeEnabled } from "../config/local-supplier-runtime.ts";

export interface LocalSupplierOperatorVerifier {
  /** Server-only authority seam; browser input is never passed through. */
  readonly verify: () => SupplierOperatorAuthority | null;
}

export type LocalSupplierOperatorAuthorization =
  | { readonly status: "authorized"; readonly authority: SupplierOperatorAuthority }
  | { readonly status: "disabled" | "unauthorized" };

/** Runtime enablement is independent from operator authorization. */
export function resolveLocalSupplierOperatorAuthority(
  configuration: LocalSupplierConfiguration,
  verifier: LocalSupplierOperatorVerifier | undefined,
): LocalSupplierOperatorAuthorization {
  if (!isLocalSupplierRuntimeEnabled(configuration)) return { status: "disabled" };
  if (!verifier) return { status: "unauthorized" };
  try {
    const authority = verifier.verify();
    return isSupplierOperatorAuthority(authority)
      ? { status: "authorized", authority: { actorKind: "operator", actorContextId: authority.actorContextId } }
      : { status: "unauthorized" };
  } catch {
    return { status: "unauthorized" };
  }
}
