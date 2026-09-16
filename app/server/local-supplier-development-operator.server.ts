import type { LocalSupplierOperatorVerifier } from "./local-supplier-operator.server.ts";

/** Explicit local operator switch. The authority is never serialized. */
export function createLocalSupplierDevelopmentOperatorVerifier(): LocalSupplierOperatorVerifier {
  return {
    verify: () => process.env.LOCAL_SUPPLIER_OPERATOR === "enabled"
      ? { actorKind: "operator", actorContextId: "local-supplier-development-operator" }
      : null,
  };
}
