import type { RuntimeEnvironment } from "./server.ts";
import { ServerConfigurationError } from "./server.ts";

export type LocalAnalyticsSource = "disabled" | "local_fake";
export type LocalAnalyticsRuntimeMode = "development" | "test" | "production" | "unknown";

export interface LocalAnalyticsConfiguration {
  readonly source: LocalAnalyticsSource;
  readonly runtimeMode: LocalAnalyticsRuntimeMode;
}

function normalizeRuntimeMode(value: string | undefined): LocalAnalyticsRuntimeMode {
  if (value === "development" || value === "test" || value === "production") return value;
  return "unknown";
}

export function readLocalAnalyticsConfig(environment: RuntimeEnvironment = process.env, runtimeMode: string | undefined = process.env.NODE_ENV): LocalAnalyticsConfiguration {
  const source = environment.LOCAL_ANALYTICS_SOURCE?.trim() || "disabled";
  if (source !== "disabled" && source !== "local_fake") throw new ServerConfigurationError("LOCAL_ANALYTICS_SOURCE", "Invalid server configuration: LOCAL_ANALYTICS_SOURCE");
  const normalizedRuntimeMode = normalizeRuntimeMode(runtimeMode);
  if (source === "local_fake" && !["development", "test"].includes(normalizedRuntimeMode)) throw new ServerConfigurationError("LOCAL_ANALYTICS_SOURCE", "Local fake Analytics is allowed only in development or test");
  return { source, runtimeMode: normalizedRuntimeMode };
}

export function readTrustedLocalAnalyticsConfig(environment: RuntimeEnvironment = process.env): LocalAnalyticsConfiguration {
  return readLocalAnalyticsConfig(environment, process.env.NODE_ENV);
}
