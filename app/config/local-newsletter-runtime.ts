import type { RuntimeEnvironment } from "./server.ts";
import { ServerConfigurationError } from "./server.ts";

export type LocalNewsletterSource = "disabled" | "local_fake";
export type LocalNewsletterRuntimeMode = "development" | "test" | "production" | "unknown";

export interface LocalNewsletterConfiguration {
  readonly source: LocalNewsletterSource;
  readonly runtimeMode: LocalNewsletterRuntimeMode;
}

function normalizeRuntimeMode(value: string | undefined): LocalNewsletterRuntimeMode {
  if (value === "development" || value === "test" || value === "production") return value;
  return "unknown";
}

/** Local process-memory Newsletter is explicit and never a production fallback. */
export function readLocalNewsletterConfig(
  environment: RuntimeEnvironment = process.env,
  runtimeMode: string | undefined = process.env.NODE_ENV,
): LocalNewsletterConfiguration {
  const source = environment.LOCAL_NEWSLETTER_SOURCE?.trim() || "disabled";
  if (source !== "disabled" && source !== "local_fake") {
    throw new ServerConfigurationError(
      "LOCAL_NEWSLETTER_SOURCE",
      "Invalid server configuration: LOCAL_NEWSLETTER_SOURCE",
    );
  }

  const normalizedRuntimeMode = normalizeRuntimeMode(runtimeMode);
  if (source === "local_fake" && !["development", "test"].includes(normalizedRuntimeMode)) {
    throw new ServerConfigurationError(
      "LOCAL_NEWSLETTER_SOURCE",
      "Local fake Newsletter is allowed only in development or test",
    );
  }

  return { source, runtimeMode: normalizedRuntimeMode };
}

/** Runtime mode is taken from the actual server process, not a request value. */
export function readTrustedLocalNewsletterConfig(
  environment: RuntimeEnvironment = process.env,
): LocalNewsletterConfiguration {
  return readLocalNewsletterConfig(environment, process.env.NODE_ENV);
}
