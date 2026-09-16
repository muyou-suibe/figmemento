import type { LocalTrackingOperatorVerifier } from "./local-tracking-operator.server.ts";

/** Explicit server-only development authority; never serialized to the browser. */
export function createLocalTrackingDevelopmentOperatorVerifier(): LocalTrackingOperatorVerifier {
  return {
    verify: () => process.env.LOCAL_TRACKING_OPERATOR === "enabled"
      ? { actorKind: "operator", actorContextId: "local-tracking-development-operator" }
      : null,
  };
}
