import {
  AdminAcceptanceConfigurationError,
  readAdminAcceptanceConfiguration,
  resolveAdminAcceptanceSource,
} from "../config/admin-acceptance-runtime.server.ts";
import type { RuntimeEnvironment } from "../config/server.ts";

export { isAdminAcceptanceConfigurationError } from "../config/admin-acceptance-runtime.server.ts";

export function resolveAuthorizedSource<T>(
  production: () => T,
  localFake: () => T,
  localPersistent: () => T = localFake,
): T {
  const result = resolveAdminAcceptanceSource("authorized", { production, localFake, localPersistent });
  if (result.status === "resolved") return result.value;
  if (result.status === "configuration_failure") {
    throw new AdminAcceptanceConfigurationError(result.reason);
  }
  throw new Error("Admin acceptance source is unavailable.");
}

export type AdminCatalogSourceConfiguration =
  | { readonly status: "production"; readonly source: "production" }
  | { readonly status: "local_fake"; readonly source: "local_fake"; readonly restartLoss: true }
  | {
      readonly status: "configuration_failure";
      readonly reason: "unknown_source" | "local_source_not_allowed";
    };

/**
 * Admin commerce may use local_persistent while Admin Catalog intentionally
 * remains the established process-memory local_fake graph. This projection
 * makes that split explicit instead of treating the persistent commerce
 * selector as persistent Catalog CRUD authority.
 */
export function readAdminCatalogSourceConfiguration(
  environment: RuntimeEnvironment = process.env,
  runtimeMode: string | undefined = process.env.NODE_ENV,
): AdminCatalogSourceConfiguration {
  const configuration = readAdminAcceptanceConfiguration(environment, runtimeMode);
  if (configuration.status === "configuration_failure") {
    return { status: "configuration_failure", reason: configuration.reason };
  }
  return configuration.source === "production"
    ? { status: "production", source: "production" }
    : { status: "local_fake", source: "local_fake", restartLoss: true };
}

/** Catalog/Customization never acquire persistent write authority in Task 8. */
export function resolveAuthorizedAdminCatalogSource<T>(
  production: () => T,
  localFake: () => T,
): T {
  return resolveAuthorizedSource(production, localFake, localFake);
}
