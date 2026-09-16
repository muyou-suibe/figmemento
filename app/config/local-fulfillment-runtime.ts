import type { RuntimeEnvironment } from "./server.ts";
import { ServerConfigurationError } from "./server.ts";

export type LocalFulfillmentSource = "disabled" | "local_fake";
export type LocalFulfillmentRuntimeMode = "development" | "test" | "production" | "unknown";

export interface LocalFulfillmentConfiguration {
  readonly source: LocalFulfillmentSource;
  readonly runtimeMode: LocalFulfillmentRuntimeMode;
}

function normalizeRuntimeMode(value: string | undefined): LocalFulfillmentRuntimeMode {
  if (value === "development" || value === "test" || value === "production") return value;
  return "unknown";
}

/**
 * Fulfillment is an explicit local workflow. It is never enabled implicitly
 * and never acts as a fallback for a production or provider-backed source.
 */
export function readLocalFulfillmentConfig(
  environment: RuntimeEnvironment = process.env,
  runtimeMode: string | undefined = process.env.NODE_ENV,
): LocalFulfillmentConfiguration {
  const source = environment.LOCAL_FULFILLMENT_SOURCE?.trim() || "disabled";
  if (source !== "disabled" && source !== "local_fake") {
    throw new ServerConfigurationError(
      "LOCAL_FULFILLMENT_SOURCE",
      "Invalid server configuration: LOCAL_FULFILLMENT_SOURCE",
    );
  }

  const normalizedRuntimeMode = normalizeRuntimeMode(runtimeMode);
  if (source === "local_fake" && !["development", "test"].includes(normalizedRuntimeMode)) {
    throw new ServerConfigurationError(
      "LOCAL_FULFILLMENT_SOURCE",
      "Local fake Fulfillment is allowed only in development or test",
    );
  }

  return { source, runtimeMode: normalizedRuntimeMode };
}

/** Runtime mode comes from the server process, never from a browser or binding. */
export function readTrustedLocalFulfillmentConfig(
  environment: RuntimeEnvironment = process.env,
): LocalFulfillmentConfiguration {
  return readLocalFulfillmentConfig(environment, process.env.NODE_ENV);
}
