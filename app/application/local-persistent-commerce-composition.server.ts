import type { RuntimeEnvironment } from "../config/server.ts";
import {
  LOCAL_COMMERCE_SCHEMA,
  readLocalCommerceConfig,
  type LocalCommerceConfig,
} from "./local-commerce-environment.ts";

export const LOCAL_PERSISTENT_SOURCE = "local_persistent" as const;
export const LOCAL_COMMERCE_MARKER_DIGEST_ENV = "LOCAL_COMMERCE_MARKER_DIGEST" as const;
export const LOCAL_COMMERCE_SERVICE_ROLE_KEY_ENV = "LOCAL_COMMERCE_SERVICE_ROLE_KEY" as const;
export const LOCAL_COMMERCE_PRIVATE_STORAGE_BUCKET = "local-commerce-private" as const;

export type LocalPersistentCapability =
  | "auth"
  | "cart"
  | "catalog"
  | "checkout"
  | "upload"
  | "order"
  | "payment"
  | "fulfillment"
  | "tracking"
  | "admin"
  | "delivery";

type SourceSelector =
  | "disabled"
  | "local_fake"
  | "supabase"
  | "fixture"
  | "production"
  | typeof LOCAL_PERSISTENT_SOURCE;

const SOURCE_SELECTOR_ENVIRONMENT_KEYS: Readonly<Record<Exclude<LocalPersistentCapability, "delivery">, string>> = {
  auth: "CUSTOMER_AUTH_SOURCE",
  cart: "CART_SOURCE",
  catalog: "PHOTOGIFT_PRODUCT_SOURCE",
  checkout: "LOCAL_CHECKOUT_SOURCE",
  upload: "CUSTOMER_UPLOAD_SOURCE",
  order: "LOCAL_ORDER_SOURCE",
  payment: "LOCAL_PAYMENT_SOURCE",
  fulfillment: "LOCAL_FULFILLMENT_SOURCE",
  tracking: "LOCAL_TRACKING_SOURCE",
  admin: "ADMIN_ACCEPTANCE_SOURCE",
};

const PERSISTENT_DEPENDENCIES: Readonly<Record<LocalPersistentCapability, readonly LocalPersistentCapability[]>> = {
  auth: [],
  cart: ["auth", "catalog"],
  catalog: [],
  checkout: ["auth", "cart", "catalog"], // Image lines separately require durable Upload; text-only does not.
  upload: ["auth"],
  order: ["auth", "cart", "catalog"], // Image receipts separately require the durable Upload authority.
  payment: ["auth", "order"],
  fulfillment: ["auth", "order", "payment"],
  tracking: ["auth", "order", "payment", "fulfillment"],
  admin: ["auth", "order", "payment", "fulfillment", "tracking"],
  delivery: ["auth", "order", "fulfillment"],
};

export interface LocalPersistentAuthorityDescriptor {
  readonly capability: LocalPersistentCapability;
  readonly projectId: string;
  readonly markerDigest: string;
  readonly runtimeMode: "development" | "test";
  readonly apiUrl: string;
  readonly rpcUrl: string;
  readonly storageUrl: string;
}

export interface LocalPersistentComposition {
  readonly schema: typeof LOCAL_COMMERCE_SCHEMA;
  readonly runtimeMode: "development" | "test";
  readonly projectId: string;
  readonly markerDigest: string;
  readonly config: LocalCommerceConfig;
  readonly selectedCapabilities: readonly LocalPersistentCapability[];
  readonly authorities: readonly LocalPersistentAuthorityDescriptor[];
}

export interface LocalPersistentCompositionIssue {
  readonly code:
    | "persistent_runtime_required"
    | "local_commerce_configuration_invalid"
    | "marker_digest_required"
    | "marker_digest_invalid"
    | "required_capability_not_selected"
    | "dependency_source_mismatch"
    | "authority_project_mismatch"
    | "authority_marker_mismatch"
    | "authority_runtime_mismatch"
    | "authority_endpoint_mismatch";
  readonly capability?: LocalPersistentCapability;
  readonly name?: string;
}

export type LocalPersistentCompositionResult =
  | { readonly status: "not_selected" }
  | {
      readonly status: "ready";
      readonly value: LocalPersistentComposition;
      readonly issues: readonly [];
    }
  | {
      readonly status: "unavailable";
      readonly issues: readonly LocalPersistentCompositionIssue[];
    };

function sourceValue(
  environment: Readonly<Record<string, string | undefined>>,
  capability: Exclude<LocalPersistentCapability, "delivery">,
): SourceSelector | undefined {
  const value = environment[SOURCE_SELECTOR_ENVIRONMENT_KEYS[capability]]?.trim();
  if (!value) return undefined;
  return value as SourceSelector;
}

function selectedCapabilities(
  environment: Readonly<Record<string, string | undefined>>,
): readonly LocalPersistentCapability[] {
  return (Object.keys(SOURCE_SELECTOR_ENVIRONMENT_KEYS) as Exclude<LocalPersistentCapability, "delivery">[])
    .filter((capability) => sourceValue(environment, capability) === LOCAL_PERSISTENT_SOURCE);
}

/**
 * Reports only whether a server-owned source selector has selected the
 * local_persistent composition. This does not validate or construct that
 * composition and therefore cannot create a database client as a side effect.
 */
export function hasLocalPersistentSourceSelection(
  environment: RuntimeEnvironment = process.env,
): boolean {
  return selectedCapabilities(environment).length > 0;
}

function markerDigest(environment: Readonly<Record<string, string | undefined>>):
  | { readonly status: "ready"; readonly value: string }
  | { readonly status: "unavailable"; readonly issue: LocalPersistentCompositionIssue } {
  const value = environment[LOCAL_COMMERCE_MARKER_DIGEST_ENV]?.trim();
  if (!value) {
    return {
      status: "unavailable",
      issue: { code: "marker_digest_required", name: LOCAL_COMMERCE_MARKER_DIGEST_ENV },
    };
  }
  if (!/^[0-9a-f]{64}$/.test(value)) {
    return {
      status: "unavailable",
      issue: { code: "marker_digest_invalid", name: LOCAL_COMMERCE_MARKER_DIGEST_ENV },
    };
  }
  return { status: "ready", value };
}

function runtimeMode(value: string | undefined): "development" | "test" | null {
  return value === "development" || value === "test" ? value : null;
}

/**
 * Resolves only an explicitly selected persistent composition. An absent
 * selector intentionally returns `not_selected`, preserving every existing
 * production, fixture, disabled, and local_fake default.
 */
export function resolveLocalPersistentComposition(
  environment: RuntimeEnvironment = process.env,
  options: { readonly requiredCapabilities?: readonly LocalPersistentCapability[] } = {},
): LocalPersistentCompositionResult {
  const selected = selectedCapabilities(environment);
  const required = options.requiredCapabilities ?? [];
  const issues: LocalPersistentCompositionIssue[] = [];

  if (selected.length === 0 && required.length === 0) return { status: "not_selected" };

  for (const capability of required) {
    if (capability === "delivery") continue;
    if (sourceValue(environment, capability) !== LOCAL_PERSISTENT_SOURCE) {
      issues.push({ code: "required_capability_not_selected", capability });
    }
    for (const dependency of PERSISTENT_DEPENDENCIES[capability]) {
      if (dependency === "delivery") continue;
      if (sourceValue(environment, dependency) !== LOCAL_PERSISTENT_SOURCE) {
        issues.push({ code: "dependency_source_mismatch", capability: dependency });
      }
    }
  }

  if (selected.length === 0) {
    return { status: "unavailable", issues };
  }

  const mode = runtimeMode(environment.NODE_ENV);
  if (!mode) issues.push({ code: "persistent_runtime_required", name: "NODE_ENV" });

  const localConfig = readLocalCommerceConfig(environment);
  if (localConfig.status !== "ready") {
    issues.push({ code: "local_commerce_configuration_invalid", name: "LOCAL_COMMERCE_*" });
  } else if (mode && localConfig.config.environment !== mode) {
    issues.push({ code: "persistent_runtime_required", name: "LOCAL_COMMERCE_ENVIRONMENT" });
  }

  const digest = markerDigest(environment);
  if (digest.status === "unavailable") issues.push(digest.issue);

  if (issues.length > 0 || localConfig.status !== "ready" || mode === null || digest.status !== "ready") {
    return { status: "unavailable", issues };
  }

  const authorities = selected.map((capability) => ({
    capability,
    projectId: localConfig.config.projectId,
    markerDigest: digest.value,
    runtimeMode: mode,
    apiUrl: localConfig.config.endpoints.apiUrl,
    rpcUrl: localConfig.config.endpoints.rpcUrl,
    storageUrl: localConfig.config.endpoints.storageUrl,
  }));
  const authorityCheck = validateLocalPersistentAuthoritySet(authorities);
  if (authorityCheck.status !== "ready") return authorityCheck;

  return {
    status: "ready",
    value: {
      schema: LOCAL_COMMERCE_SCHEMA,
      runtimeMode: mode,
      projectId: localConfig.config.projectId,
      markerDigest: digest.value,
      config: localConfig.config,
      selectedCapabilities: selected,
      authorities,
    },
    issues: [],
  };
}

export function validateLocalPersistentAuthoritySet(
  authorities: readonly LocalPersistentAuthorityDescriptor[],
):
  | { readonly status: "ready" }
  | { readonly status: "unavailable"; readonly issues: readonly LocalPersistentCompositionIssue[] } {
  if (authorities.length < 2) return { status: "ready" };
  const [first, ...rest] = authorities;
  const issues: LocalPersistentCompositionIssue[] = [];
  for (const authority of rest) {
    if (authority.projectId !== first.projectId) issues.push({ code: "authority_project_mismatch", capability: authority.capability });
    if (authority.markerDigest !== first.markerDigest) issues.push({ code: "authority_marker_mismatch", capability: authority.capability });
    if (authority.runtimeMode !== first.runtimeMode) issues.push({ code: "authority_runtime_mismatch", capability: authority.capability });
    if (authority.apiUrl !== first.apiUrl || authority.rpcUrl !== first.rpcUrl || authority.storageUrl !== first.storageUrl) {
      issues.push({ code: "authority_endpoint_mismatch", capability: authority.capability });
    }
  }
  return issues.length === 0 ? { status: "ready" } : { status: "unavailable", issues };
}

export function persistentDependenciesFor(
  capability: LocalPersistentCapability,
): readonly LocalPersistentCapability[] {
  return PERSISTENT_DEPENDENCIES[capability];
}
