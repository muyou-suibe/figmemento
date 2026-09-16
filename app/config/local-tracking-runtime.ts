import type { RuntimeEnvironment } from "./server.ts";
import { ServerConfigurationError } from "./server.ts";

export type LocalTrackingSource = "disabled" | "local_fake" | "local_persistent";
export type LocalTrackingRuntimeMode = "development" | "test" | "production" | "unknown";

export interface LocalTrackingConfiguration {
  readonly source: LocalTrackingSource;
  readonly runtimeMode: LocalTrackingRuntimeMode;
}

function normalizeRuntimeMode(value: string | undefined): LocalTrackingRuntimeMode {
  if (value === "development" || value === "test" || value === "production") return value;
  return "unknown";
}

/**
 * Local Tracking is an explicit development/test boundary. It is disabled by
 * default and never acts as a fallback for a provider-backed or production
 * shipping/tracking source.
 */
export function readLocalTrackingConfig(
  environment: RuntimeEnvironment = process.env,
  runtimeMode: string | undefined = process.env.NODE_ENV,
): LocalTrackingConfiguration {
  const source = environment.LOCAL_TRACKING_SOURCE?.trim() || "disabled";
  if (source !== "disabled" && source !== "local_fake" && source !== "local_persistent") {
    throw new ServerConfigurationError(
      "LOCAL_TRACKING_SOURCE",
      "Invalid server configuration: LOCAL_TRACKING_SOURCE",
    );
  }

  const normalizedRuntimeMode = normalizeRuntimeMode(runtimeMode);
  if ((source === "local_fake" || source === "local_persistent") && !["development", "test"].includes(normalizedRuntimeMode)) {
    throw new ServerConfigurationError(
      "LOCAL_TRACKING_SOURCE",
      "Local fake Tracking is allowed only in development or test",
    );
  }

  return { source, runtimeMode: normalizedRuntimeMode };
}

/** Runtime mode comes from the actual server process, not browser input. */
export function readTrustedLocalTrackingConfig(
  environment: RuntimeEnvironment = process.env,
): LocalTrackingConfiguration {
  return readLocalTrackingConfig(environment, process.env.NODE_ENV);
}
