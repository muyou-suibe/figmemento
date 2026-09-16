import type { RuntimeEnvironment } from "./server.ts";
import { ServerConfigurationError } from "./server.ts";

export type LocalSupplierSource = "disabled" | "local_fake";
export type LocalSupplierRuntimeMode = "development" | "test" | "production" | "unknown";

export interface LocalSupplierConfiguration {
  readonly source: LocalSupplierSource;
  readonly runtimeMode: LocalSupplierRuntimeMode;
}

function normalizeRuntimeMode(value: string | undefined): LocalSupplierRuntimeMode {
  if (value === "development" || value === "test" || value === "production") return value;
  return "unknown";
}

/** Supplier operations are an explicit local-only source, never a fallback. */
export function readLocalSupplierConfig(
  environment: RuntimeEnvironment = process.env,
  runtimeMode: string | undefined = process.env.NODE_ENV,
): LocalSupplierConfiguration {
  const source = environment.LOCAL_SUPPLIER_SOURCE?.trim() || "disabled";
  if (source !== "disabled" && source !== "local_fake") {
    throw new ServerConfigurationError(
      "LOCAL_SUPPLIER_SOURCE",
      "Invalid server configuration: LOCAL_SUPPLIER_SOURCE",
    );
  }
  const normalizedRuntimeMode = normalizeRuntimeMode(runtimeMode);
  if (source === "local_fake" && !["development", "test"].includes(normalizedRuntimeMode)) {
    throw new ServerConfigurationError(
      "LOCAL_SUPPLIER_SOURCE",
      "Local fake Supplier Operations are allowed only in development or test",
    );
  }
  return { source, runtimeMode: normalizedRuntimeMode };
}

/** Runtime mode is read from the actual server process, not a request. */
export function readTrustedLocalSupplierConfig(
  environment: RuntimeEnvironment = process.env,
): LocalSupplierConfiguration {
  return readLocalSupplierConfig(environment, process.env.NODE_ENV);
}

export function isLocalSupplierRuntimeEnabled(configuration: LocalSupplierConfiguration): boolean {
  return configuration.source === "local_fake"
    && (configuration.runtimeMode === "development" || configuration.runtimeMode === "test");
}
