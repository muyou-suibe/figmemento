import type { RuntimeEnvironment } from "./server.ts";
import { ServerConfigurationError } from "./server.ts";

export type LocalPaymentSource = "disabled" | "local_fake" | "local_persistent";
export type LocalPaymentRuntimeMode = "development" | "test" | "production" | "unknown";

export interface LocalPaymentConfiguration {
  readonly source: LocalPaymentSource;
  readonly runtimeMode: LocalPaymentRuntimeMode;
}

function normalizeRuntimeMode(value: string | undefined): LocalPaymentRuntimeMode {
  if (value === "development" || value === "test" || value === "production") return value;
  return "unknown";
}

/**
 * Local Payment is an explicit deterministic simulation source. It is never
 * an implicit fallback for a provider or production Payment source.
 */
export function readLocalPaymentConfig(
  environment: RuntimeEnvironment = process.env,
  runtimeMode: string | undefined = process.env.NODE_ENV,
): LocalPaymentConfiguration {
  const source = environment.LOCAL_PAYMENT_SOURCE?.trim() || "disabled";
  if (source !== "disabled" && source !== "local_fake" && source !== "local_persistent") {
    throw new ServerConfigurationError(
      "LOCAL_PAYMENT_SOURCE",
      "Invalid server configuration: LOCAL_PAYMENT_SOURCE",
    );
  }

  const normalizedRuntimeMode = normalizeRuntimeMode(runtimeMode);
  if (source !== "disabled" && !["development", "test"].includes(normalizedRuntimeMode)) {
    throw new ServerConfigurationError(
      "LOCAL_PAYMENT_SOURCE",
      "Local fake Payment is allowed only in development or test",
    );
  }

  return { source, runtimeMode: normalizedRuntimeMode };
}

/** Runtime mode is read from the actual process, not an injected binding. */
export function readTrustedLocalPaymentConfig(
  environment: RuntimeEnvironment = process.env,
): LocalPaymentConfiguration {
  return readLocalPaymentConfig(environment, process.env.NODE_ENV);
}
