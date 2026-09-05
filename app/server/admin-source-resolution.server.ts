import {
  AdminAcceptanceConfigurationError,
  resolveAdminAcceptanceSource,
} from "../config/admin-acceptance-runtime.server.ts";

export { isAdminAcceptanceConfigurationError } from "../config/admin-acceptance-runtime.server.ts";

export function resolveAuthorizedSource<T>(
  production: () => T,
  localFake: () => T,
): T {
  const result = resolveAdminAcceptanceSource("authorized", { production, localFake });
  if (result.status === "resolved") return result.value;
  if (result.status === "configuration_failure") {
    throw new AdminAcceptanceConfigurationError(result.reason);
  }
  throw new Error("Admin acceptance source is unavailable.");
}
