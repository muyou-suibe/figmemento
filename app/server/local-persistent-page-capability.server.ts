import type { LocalPersistentCapability } from "../application/local-persistent-commerce-composition.server.ts";
import { resolveLocalPersistentComposition } from "../application/local-persistent-commerce-composition.server.ts";

/** Server-only page feature projection. It exposes one boolean and keeps the
 * environment/project/marker authority outside presentation components. */
export function isLocalPersistentPageCapabilityReady(
  runtimeMode: string | undefined,
  capability: LocalPersistentCapability,
): boolean {
  return resolveLocalPersistentComposition(
    { ...process.env, NODE_ENV: runtimeMode },
    { requiredCapabilities: [capability] },
  ).status === "ready";
}
