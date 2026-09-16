import type { RuntimeEnvironment } from "./server.ts";

export type AdminAcceptanceRuntimeMode = "development" | "test" | "production" | "unknown";
export type AdminAcceptanceSource = "production" | "local_fake" | "local_persistent";

export type AdminAcceptanceConfiguration =
  | {
      readonly status: "production_default";
      readonly source: "production";
      readonly runtimeMode: AdminAcceptanceRuntimeMode;
    }
  | {
      readonly status: "local_fake";
      readonly source: "local_fake";
      readonly runtimeMode: "development" | "test";
    }
  | {
      readonly status: "local_persistent";
      readonly source: "local_persistent";
      readonly runtimeMode: "development" | "test";
    }
  | {
      readonly status: "configuration_failure";
      readonly key: "ADMIN_ACCEPTANCE_SOURCE";
      readonly reason: "unknown_source" | "local_source_not_allowed";
      readonly runtimeMode: AdminAcceptanceRuntimeMode;
    };

export type AdminAuthorizationGate =
  | "authorized"
  | "unauthorized"
  | "authentication_failure";

export type AdminAcceptanceSourceResult<T> =
  | { readonly status: "resolved"; readonly source: AdminAcceptanceSource; readonly value: T }
  | { readonly status: "unauthorized" }
  | { readonly status: "authentication_failure" }
  | {
      readonly status: "configuration_failure";
      readonly key: "ADMIN_ACCEPTANCE_SOURCE";
      readonly reason: "unknown_source" | "local_source_not_allowed";
    }
  | { readonly status: "source_failure"; readonly source: AdminAcceptanceSource };

export interface AdminAcceptanceSourceFactories<T> {
  readonly production: () => T;
  readonly localFake: () => T;
  readonly localPersistent?: () => T;
}

/** A bounded internal marker used to map invalid server configuration safely. */
export class AdminAcceptanceConfigurationError extends Error {
  readonly reason: "unknown_source" | "local_source_not_allowed";

  constructor(reason: "unknown_source" | "local_source_not_allowed") {
    super("Admin acceptance configuration is invalid.");
    this.name = "AdminAcceptanceConfigurationError";
    this.reason = reason;
  }
}

export function isAdminAcceptanceConfigurationError(
  value: unknown,
): value is AdminAcceptanceConfigurationError {
  return value instanceof AdminAcceptanceConfigurationError;
}

export function adminAcceptanceConfigurationIssue() {
  return {
    path: "$",
    code: "invalid_value" as const,
    message: "Admin acceptance configuration is invalid.",
  };
}

function runtimeMode(value: string | undefined): AdminAcceptanceRuntimeMode {
  if (value === "development" || value === "test" || value === "production") return value;
  return "unknown";
}

/**
 * Reads only the Admin acceptance selector and runtime mode. It does not
 * construct a repository, load fixtures, create a provider client, or inspect
 * the request. The `.server.ts` boundary keeps this configuration out of
 * client modules.
 */
export function readAdminAcceptanceConfiguration(
  environment: RuntimeEnvironment = process.env,
  currentRuntimeMode: string | undefined = process.env.NODE_ENV,
): AdminAcceptanceConfiguration {
  const normalizedRuntimeMode = runtimeMode(currentRuntimeMode);
  const selectedSource = environment.ADMIN_ACCEPTANCE_SOURCE?.trim() || "";

  if (selectedSource === "") {
    return {
      status: "production_default",
      source: "production",
      runtimeMode: normalizedRuntimeMode,
    };
  }

  if (selectedSource !== "local_fake" && selectedSource !== "local_persistent") {
    return {
      status: "configuration_failure",
      key: "ADMIN_ACCEPTANCE_SOURCE",
      reason: "unknown_source",
      runtimeMode: normalizedRuntimeMode,
    };
  }

  if (normalizedRuntimeMode !== "development" && normalizedRuntimeMode !== "test") {
    return {
      status: "configuration_failure",
      key: "ADMIN_ACCEPTANCE_SOURCE",
      reason: "local_source_not_allowed",
      runtimeMode: normalizedRuntimeMode,
    };
  }

  return selectedSource === "local_persistent"
    ? { status: "local_persistent", source: "local_persistent", runtimeMode: normalizedRuntimeMode }
    : { status: "local_fake", source: "local_fake", runtimeMode: normalizedRuntimeMode };
}

/**
 * Selects one deferred source only after the caller has established Admin
 * authorization. The factories are deliberately invoked at most once and a
 * thrown source failure is never retried through the other source.
 */
export function resolveAdminAcceptanceSource<T>(
  authorization: AdminAuthorizationGate,
  factories: AdminAcceptanceSourceFactories<T>,
  environment: RuntimeEnvironment = process.env,
  currentRuntimeMode: string | undefined = process.env.NODE_ENV,
): AdminAcceptanceSourceResult<T> {
  if (authorization === "unauthorized") return { status: "unauthorized" };
  if (authorization === "authentication_failure") return { status: "authentication_failure" };

  const configuration = readAdminAcceptanceConfiguration(environment, currentRuntimeMode);
  if (configuration.status === "configuration_failure") {
    return {
      status: "configuration_failure",
      key: configuration.key,
      reason: configuration.reason,
    };
  }

  const source = configuration.source;
  try {
    return {
      status: "resolved",
      source,
      value: source === "local_fake"
        ? factories.localFake()
        : source === "local_persistent"
          ? (factories.localPersistent ? factories.localPersistent() : (() => { throw new Error("Persistent Admin source is unavailable."); })())
          : factories.production(),
    };
  } catch {
    return { status: "source_failure", source };
  }
}
