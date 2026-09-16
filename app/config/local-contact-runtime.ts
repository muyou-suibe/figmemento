import type { RuntimeEnvironment } from "./server.ts";
import { ServerConfigurationError } from "./server.ts";

export type LocalContactSource = "disabled" | "local_fake";
export type LocalContactRuntimeMode = "development" | "test" | "production" | "unknown";

export interface LocalContactConfiguration {
  readonly source: LocalContactSource;
  readonly runtimeMode: LocalContactRuntimeMode;
}

function normalizeRuntimeMode(value: string | undefined): LocalContactRuntimeMode {
  if (value === "development" || value === "test" || value === "production") return value;
  return "unknown";
}

export function readLocalContactConfig(
  environment: RuntimeEnvironment = process.env,
  runtimeMode: string | undefined = process.env.NODE_ENV,
): LocalContactConfiguration {
  const source = environment.LOCAL_CONTACT_SOURCE?.trim() || "disabled";
  if (source !== "disabled" && source !== "local_fake") {
    throw new ServerConfigurationError("LOCAL_CONTACT_SOURCE", "Invalid server configuration: LOCAL_CONTACT_SOURCE");
  }

  const normalizedRuntimeMode = normalizeRuntimeMode(runtimeMode);
  if (source === "local_fake" && !["development", "test"].includes(normalizedRuntimeMode)) {
    throw new ServerConfigurationError("LOCAL_CONTACT_SOURCE", "Local fake Contact is allowed only in development or test");
  }

  return { source, runtimeMode: normalizedRuntimeMode };
}

export function readTrustedLocalContactConfig(
  environment: RuntimeEnvironment = process.env,
): LocalContactConfiguration {
  return readLocalContactConfig(environment, process.env.NODE_ENV);
}
