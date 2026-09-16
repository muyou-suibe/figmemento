import type { RuntimeEnvironment } from "./server.ts";
import { ServerConfigurationError } from "./server.ts";

export type LocalCheckoutSource = "disabled" | "local_fake" | "local_persistent";
export type LocalCheckoutRuntimeMode = "development" | "test" | "production" | "unknown";

export interface LocalCheckoutConfiguration {
  readonly source: LocalCheckoutSource;
  readonly runtimeMode: LocalCheckoutRuntimeMode;
}

function normalizeRuntimeMode(value: string | undefined): LocalCheckoutRuntimeMode {
  if (value === "development" || value === "test" || value === "production") return value;
  return "unknown";
}

/**
 * Local Checkout is independently selectable and never defaults to a fake
 * provider. Runtime mode is read directly from process.env by default so a
 * caller cannot weaken production authority through a binding value.
 */
export function readLocalCheckoutConfig(
  environment: RuntimeEnvironment = process.env,
  runtimeMode: string | undefined = process.env.NODE_ENV,
): LocalCheckoutConfiguration {
  const source = environment.LOCAL_CHECKOUT_SOURCE?.trim() || "disabled";
  if (source !== "disabled" && source !== "local_fake" && source !== "local_persistent") {
    throw new ServerConfigurationError(
      "LOCAL_CHECKOUT_SOURCE",
      "Invalid server configuration: LOCAL_CHECKOUT_SOURCE",
    );
  }

  const normalizedRuntimeMode = normalizeRuntimeMode(runtimeMode);
  if ((source === "local_fake" || source === "local_persistent") && !["development", "test"].includes(normalizedRuntimeMode)) {
    throw new ServerConfigurationError(
      "LOCAL_CHECKOUT_SOURCE",
      "Local fake Checkout is allowed only in development or test",
    );
  }

  return { source, runtimeMode: normalizedRuntimeMode };
}

/**
 * Production composition entry point. The environment may supply the
 * explicit source selection, but runtime mode always comes directly from the
 * actual process runtime and cannot be downgraded by a binding or request.
 */
export function readTrustedLocalCheckoutConfig(
  environment: RuntimeEnvironment = process.env,
): LocalCheckoutConfiguration {
  return readLocalCheckoutConfig(environment, process.env.NODE_ENV);
}
