import type { LocalFulfillmentOperatorVerifier } from "./local-fulfillment-operator.server.ts";

/**
 * Explicit server-only development authority. This is a local mode switch,
 * not a browser credential and is never serialized into a response.
 */
export function createLocalFulfillmentDevelopmentOperatorVerifier(): LocalFulfillmentOperatorVerifier {
  return {
    verify: () => process.env.LOCAL_FULFILLMENT_OPERATOR === "enabled"
      ? { actorKind: "operator", actorContextId: "local-development-operator" }
      : null,
  };
}
