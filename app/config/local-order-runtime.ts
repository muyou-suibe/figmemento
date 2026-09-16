import type { RuntimeEnvironment } from "./server.ts";
import { ServerConfigurationError } from "./server.ts";

export type LocalOrderSource = "disabled" | "local_fake" | "local_persistent";
export type LocalOrderRuntimeMode = "development" | "test" | "production" | "unknown";

export interface LocalOrderConfiguration {
  readonly source: LocalOrderSource;
  readonly runtimeMode: LocalOrderRuntimeMode;
}

function normalizeRuntimeMode(value: string | undefined): LocalOrderRuntimeMode {
  if (value === "development" || value === "test" || value === "production") return value;
  return "unknown";
}

/**
 * Local Orders are an explicit process-memory runtime. They never become a
 * hidden fallback for a production or Supabase source.
 */
export function readLocalOrderConfig(
  environment: RuntimeEnvironment = process.env,
  runtimeMode: string | undefined = process.env.NODE_ENV,
): LocalOrderConfiguration {
  const source = environment.LOCAL_ORDER_SOURCE?.trim() || "disabled";
  if (source !== "disabled" && source !== "local_fake" && source !== "local_persistent") {
    throw new ServerConfigurationError(
      "LOCAL_ORDER_SOURCE",
      "Invalid server configuration: LOCAL_ORDER_SOURCE",
    );
  }

  const normalizedRuntimeMode = normalizeRuntimeMode(runtimeMode);
  if (source !== "disabled" && !["development", "test"].includes(normalizedRuntimeMode)) {
    throw new ServerConfigurationError(
      "LOCAL_ORDER_SOURCE",
      "Local fake Order runtime is allowed only in development or test",
    );
  }

  return { source, runtimeMode: normalizedRuntimeMode };
}

/**
 * Production composition entry point. The source may be supplied through the
 * server environment, but the runtime mode is read directly from process.env
 * and cannot be downgraded by a Worker binding or request caller.
 */
export function readTrustedLocalOrderConfig(
  environment: RuntimeEnvironment = process.env,
): LocalOrderConfiguration {
  return readLocalOrderConfig(environment, process.env.NODE_ENV);
}
