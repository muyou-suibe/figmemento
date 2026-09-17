import {
  resolveLocalPersistentComposition,
  type LocalPersistentCapability,
  type LocalPersistentComposition,
} from "../application/local-persistent-commerce-composition.server.ts";
import { isLoopbackUrl } from "../application/local-commerce-environment.ts";
import {
  parsePublicSiteConfig,
  type DeploymentEnvironment,
  type PublicSiteConfig,
} from "./public.ts";
import {
  readGuestDraftOwnerContextConfig,
  ServerConfigurationError,
  type RuntimeEnvironment,
} from "./server.ts";

export type ServerRuntimeMode = "development" | "test" | "production";
export type ConfiguredSource =
  | "disabled"
  | "fixture"
  | "local_fake"
  | "local_persistent"
  | "production"
  | "supabase";

export type ServerRuntimeConfigurationIssueCode =
  | "browser_authority_forbidden"
  | "invalid_deployment_configuration"
  | "invalid_runtime_mode"
  | "invalid_source"
  | "local_origin_required"
  | "local_persistent_unavailable"
  | "local_source_not_allowed"
  | "missing_required_secret"
  | "invalid_required_configuration"
  | "provider_activation_not_supported"
  | "provider_authority_deferred"
  | "runtime_deployment_mismatch";

export interface ServerRuntimeConfigurationIssue {
  readonly code: ServerRuntimeConfigurationIssueCode;
  readonly name: string;
}

export interface ServerRuntimeSources {
  readonly admin: ConfiguredSource;
  readonly analytics: ConfiguredSource;
  readonly auth: ConfiguredSource;
  readonly cart: ConfiguredSource;
  readonly catalog: ConfiguredSource;
  readonly checkout: ConfiguredSource;
  readonly contact: ConfiguredSource;
  readonly fulfillment: ConfiguredSource;
  readonly newsletter: ConfiguredSource;
  readonly order: ConfiguredSource;
  readonly payment: ConfiguredSource;
  readonly supplier: ConfiguredSource;
  readonly tracking: ConfiguredSource;
  readonly upload: ConfiguredSource;
}

export interface InactiveProviderConfiguration {
  readonly activation: "inactive";
}

export interface ServerRuntimeConfiguration {
  readonly runtimeMode: ServerRuntimeMode;
  readonly deploymentEnvironment: DeploymentEnvironment;
  readonly public: PublicSiteConfig;
  readonly sources: ServerRuntimeSources;
  readonly localPersistent: LocalPersistentComposition | null;
  readonly providers: InactiveProviderConfiguration;
}

export type ServerRuntimeConfigurationResult =
  | {
      readonly status: "ready";
      readonly value: ServerRuntimeConfiguration;
      readonly issues: readonly [];
    }
  | {
      readonly status: "unavailable";
      readonly value: null;
      readonly issues: readonly ServerRuntimeConfigurationIssue[];
    };

const SOURCE_RULES = {
  ADMIN_ACCEPTANCE_SOURCE: ["production", "local_fake", "local_persistent"],
  CART_SOURCE: ["disabled", "local_fake", "local_persistent"],
  CUSTOMER_AUTH_SOURCE: ["disabled", "local_fake", "local_persistent"],
  CUSTOMER_UPLOAD_SOURCE: ["disabled", "local_fake", "local_persistent"],
  LOCAL_ANALYTICS_SOURCE: ["disabled", "local_fake"],
  LOCAL_CHECKOUT_SOURCE: ["disabled", "local_fake", "local_persistent"],
  LOCAL_CONTACT_SOURCE: ["disabled", "local_fake"],
  LOCAL_FULFILLMENT_SOURCE: ["disabled", "local_fake", "local_persistent"],
  LOCAL_NEWSLETTER_SOURCE: ["disabled", "local_fake"],
  LOCAL_ORDER_SOURCE: ["disabled", "local_fake", "local_persistent"],
  LOCAL_PAYMENT_SOURCE: ["disabled", "local_fake", "local_persistent"],
  LOCAL_SUPPLIER_SOURCE: ["disabled", "local_fake"],
  LOCAL_TRACKING_SOURCE: ["disabled", "local_fake", "local_persistent"],
  PHOTOGIFT_PRODUCT_SOURCE: ["supabase", "fixture", "local_persistent"],
} as const satisfies Readonly<Record<string, readonly ConfiguredSource[]>>;

const SOURCE_DEFAULTS: Readonly<Record<keyof typeof SOURCE_RULES, ConfiguredSource>> = {
  ADMIN_ACCEPTANCE_SOURCE: "production",
  CART_SOURCE: "disabled",
  CUSTOMER_AUTH_SOURCE: "disabled",
  CUSTOMER_UPLOAD_SOURCE: "disabled",
  LOCAL_ANALYTICS_SOURCE: "disabled",
  LOCAL_CHECKOUT_SOURCE: "disabled",
  LOCAL_CONTACT_SOURCE: "disabled",
  LOCAL_FULFILLMENT_SOURCE: "disabled",
  LOCAL_NEWSLETTER_SOURCE: "disabled",
  LOCAL_ORDER_SOURCE: "disabled",
  LOCAL_PAYMENT_SOURCE: "disabled",
  LOCAL_SUPPLIER_SOURCE: "disabled",
  LOCAL_TRACKING_SOURCE: "disabled",
  PHOTOGIFT_PRODUCT_SOURCE: "supabase",
};

const BROWSER_AUTHORITY_KEYS = [
  "NEXT_PUBLIC_CART_SOURCE",
  "NEXT_PUBLIC_CUSTOMER_AUTH_SOURCE",
  "NEXT_PUBLIC_LOCAL_COMMERCE_API_URL",
  "NEXT_PUBLIC_LOCAL_COMMERCE_MARKER_DIGEST",
  "NEXT_PUBLIC_LOCAL_COMMERCE_PROJECT_ID",
  "NEXT_PUBLIC_PHOTOGIFT_PRODUCT_SOURCE",
] as const;

const PROVIDER_ACTIVATION_KEYS = [
  "GA4_SOURCE",
  "GOOGLE_OAUTH_SOURCE",
  "META_SOURCE",
  "PAYPAL_SOURCE",
  "PRODUCTION_STORAGE_SOURCE",
  "RESEND_SOURCE",
  "STRIPE_SOURCE",
  "TIKTOK_SOURCE",
  "TRACKING_PROVIDER_SOURCE",
] as const;

const LOCAL_OPERATOR_KEYS = [
  "LOCAL_FULFILLMENT_OPERATOR",
  "LOCAL_SUPPLIER_OPERATOR",
  "LOCAL_TRACKING_OPERATOR",
] as const;

function normalized(environment: RuntimeEnvironment, name: string): string | undefined {
  return environment[name]?.trim() || undefined;
}

function runtimeMode(value: string | undefined): ServerRuntimeMode | null {
  return value === "development" || value === "test" || value === "production" ? value : null;
}

function sourceValue<K extends keyof typeof SOURCE_RULES>(
  environment: RuntimeEnvironment,
  name: K,
  issues: ServerRuntimeConfigurationIssue[],
): ConfiguredSource {
  const value = normalized(environment, name) ?? SOURCE_DEFAULTS[name];
  if (!(SOURCE_RULES[name] as readonly string[]).includes(value)) {
    issues.push({ code: "invalid_source", name });
    return SOURCE_DEFAULTS[name];
  }
  return value as ConfiguredSource;
}

function deploymentMatchesRuntime(deployment: DeploymentEnvironment, runtime: ServerRuntimeMode): boolean {
  if (deployment === "development" || deployment === "test") return deployment === runtime;
  return runtime === "production";
}

function hasLocalSource(sources: ServerRuntimeSources, environment: RuntimeEnvironment): boolean {
  return Object.values(sources).some((source) => source === "fixture" || source === "local_fake" || source === "local_persistent")
    || LOCAL_OPERATOR_KEYS.some((name) => normalized(environment, name) === "enabled");
}

function requiredPersistentSecrets(
  environment: RuntimeEnvironment,
  selectedCapabilities: readonly string[],
  issues: ServerRuntimeConfigurationIssue[],
) {
  if (selectedCapabilities.length === 0) return;
  const required = new Set(["LOCAL_COMMERCE_SERVICE_ROLE_KEY"]);
  if (selectedCapabilities.includes("upload")) required.add("LOCAL_COMMERCE_IMAGE_HELPER_SECRET");
  if (selectedCapabilities.includes("order")) {
    required.add("LOCAL_ORDER_CAPABILITY_SECRET");
    required.add("LOCAL_ORDER_CAPABILITY_TTL_SECONDS");
  }
  for (const name of required) {
    if (!normalized(environment, name)) issues.push({ code: "missing_required_secret", name });
  }

  // Guest ownership is a dependency of the durable cart/draft/media/order
  // journey. Authentication-only or Catalog-only compositions may remain
  // ready for member-only operations, but a selected commerce capability
  // that can resolve guest resources must validate the existing owner-context
  // parser at the canonical boundary.
  const guestScoped = ["cart", "upload", "checkout", "order", "payment", "fulfillment", "tracking"];
  if (selectedCapabilities.some((capability) => guestScoped.includes(capability))) {
    const guestSecret = normalized(environment, "PHOTOGIFT_GUEST_DRAFT_OWNER_SECRET");
    const guestTtl = normalized(environment, "PHOTOGIFT_GUEST_DRAFT_OWNER_CONTEXT_TTL_SECONDS");
    if (!guestSecret) issues.push({ code: "missing_required_secret", name: "PHOTOGIFT_GUEST_DRAFT_OWNER_SECRET" });
    if (!guestTtl) issues.push({ code: "missing_required_secret", name: "PHOTOGIFT_GUEST_DRAFT_OWNER_CONTEXT_TTL_SECONDS" });
    if (guestSecret && guestTtl) {
      try {
        readGuestDraftOwnerContextConfig(environment);
      } catch (error) {
        issues.push({
          code: "invalid_required_configuration",
          name: error instanceof ServerConfigurationError ? error.key : "PHOTOGIFT_GUEST_DRAFT_OWNER_CONTEXT_TTL_SECONDS",
        });
      }
    }
  }

  const imageSecret = normalized(environment, "LOCAL_COMMERCE_IMAGE_HELPER_SECRET");
  if (selectedCapabilities.includes("upload") && imageSecret && !/^[A-Za-z0-9_-]{43,128}$/.test(imageSecret)) {
    issues.push({ code: "invalid_required_configuration", name: "LOCAL_COMMERCE_IMAGE_HELPER_SECRET" });
  }

  const orderSecret = normalized(environment, "LOCAL_ORDER_CAPABILITY_SECRET");
  const orderTtl = normalized(environment, "LOCAL_ORDER_CAPABILITY_TTL_SECONDS");
  if (selectedCapabilities.includes("order") && orderSecret && orderTtl
    && (!/^[0-9a-f]{64,128}$/.test(orderSecret) || orderSecret.length % 2 !== 0
      || !/^[1-9][0-9]*$/.test(orderTtl) || !Number.isSafeInteger(Number(orderTtl))
      || Number(orderTtl) > 2_592_000)) {
    issues.push({ code: "invalid_required_configuration", name: "LOCAL_ORDER_CAPABILITY_TTL_SECONDS" });
  }
}

function persistentCapabilities(sources: ServerRuntimeSources): readonly LocalPersistentCapability[] {
  const candidates: readonly [LocalPersistentCapability, ConfiguredSource][] = [
    ["admin", sources.admin],
    ["auth", sources.auth],
    ["cart", sources.cart],
    ["catalog", sources.catalog],
    ["checkout", sources.checkout],
    ["fulfillment", sources.fulfillment],
    ["order", sources.order],
    ["payment", sources.payment],
    ["tracking", sources.tracking],
    ["upload", sources.upload],
  ];
  return candidates.filter(([, source]) => source === "local_persistent").map(([capability]) => capability);
}

/**
 * Canonical K08 server-only composition. It accepts a server environment for
 * deterministic tests, but never a Request, browser projection, or caller
 * supplied authority override.
 */
export function composeServerRuntimeConfiguration(
  environment: RuntimeEnvironment = process.env,
): ServerRuntimeConfigurationResult {
  const issues: ServerRuntimeConfigurationIssue[] = [];
  const mode = runtimeMode(normalized(environment, "NODE_ENV"));
  if (!mode) issues.push({ code: "invalid_runtime_mode", name: "NODE_ENV" });

  for (const name of BROWSER_AUTHORITY_KEYS) {
    if (normalized(environment, name)) issues.push({ code: "browser_authority_forbidden", name });
  }
  for (const name of PROVIDER_ACTIVATION_KEYS) {
    const value = normalized(environment, name);
    if (value && value !== "disabled") issues.push({ code: "provider_activation_not_supported", name });
  }

  let publicConfiguration: PublicSiteConfig | null = null;
  try {
    publicConfiguration = parsePublicSiteConfig({
      appDeploymentEnv: environment.APP_DEPLOYMENT_ENV,
      deploymentOrigin: environment.NEXT_PUBLIC_DEPLOYMENT_ORIGIN,
      nodeEnv: environment.NODE_ENV,
      supportEmail: environment.NEXT_PUBLIC_SUPPORT_EMAIL,
    });
  } catch {
    issues.push({ code: "invalid_deployment_configuration", name: "APP_DEPLOYMENT_ENV" });
  }

  const sources: ServerRuntimeSources = {
    admin: sourceValue(environment, "ADMIN_ACCEPTANCE_SOURCE", issues),
    analytics: sourceValue(environment, "LOCAL_ANALYTICS_SOURCE", issues),
    auth: sourceValue(environment, "CUSTOMER_AUTH_SOURCE", issues),
    cart: sourceValue(environment, "CART_SOURCE", issues),
    catalog: sourceValue(environment, "PHOTOGIFT_PRODUCT_SOURCE", issues),
    checkout: sourceValue(environment, "LOCAL_CHECKOUT_SOURCE", issues),
    contact: sourceValue(environment, "LOCAL_CONTACT_SOURCE", issues),
    fulfillment: sourceValue(environment, "LOCAL_FULFILLMENT_SOURCE", issues),
    newsletter: sourceValue(environment, "LOCAL_NEWSLETTER_SOURCE", issues),
    order: sourceValue(environment, "LOCAL_ORDER_SOURCE", issues),
    payment: sourceValue(environment, "LOCAL_PAYMENT_SOURCE", issues),
    supplier: sourceValue(environment, "LOCAL_SUPPLIER_SOURCE", issues),
    tracking: sourceValue(environment, "LOCAL_TRACKING_SOURCE", issues),
    upload: sourceValue(environment, "CUSTOMER_UPLOAD_SOURCE", issues),
  };

  const localSelected = hasLocalSource(sources, environment);
  if (mode && publicConfiguration && !deploymentMatchesRuntime(publicConfiguration.deploymentEnvironment, mode)) {
    issues.push({ code: "runtime_deployment_mismatch", name: "APP_DEPLOYMENT_ENV" });
  }
  if (localSelected && (mode === "production" || !publicConfiguration
    || (publicConfiguration.deploymentEnvironment !== "development" && publicConfiguration.deploymentEnvironment !== "test"))) {
    issues.push({ code: "local_source_not_allowed", name: "NODE_ENV" });
  }
  if (localSelected && publicConfiguration && !isLoopbackUrl(publicConfiguration.siteUrl)) {
    issues.push({ code: "local_origin_required", name: "NEXT_PUBLIC_DEPLOYMENT_ORIGIN" });
  }

  const selectedPersistentCapabilities = persistentCapabilities(sources);
  requiredPersistentSecrets(environment, selectedPersistentCapabilities, issues);
  const persistent = resolveLocalPersistentComposition(environment, {
    requiredCapabilities: selectedPersistentCapabilities,
  });
  let localPersistent: LocalPersistentComposition | null = null;
  if (persistent.status === "ready") {
    localPersistent = persistent.value;
  } else if (persistent.status === "unavailable") {
    issues.push({ code: "local_persistent_unavailable", name: "LOCAL_COMMERCE_*" });
  }

  // Supabase is a provider-backed authority, not an inactive placeholder
  // that K08 can report as safely ready. Provider activation belongs to a
  // later change; credentials alone never authorize it.
  if (sources.catalog === "supabase") {
    issues.push({ code: "provider_authority_deferred", name: "PHOTOGIFT_PRODUCT_SOURCE" });
  }

  if (issues.length > 0 || !mode || !publicConfiguration) {
    return { status: "unavailable", value: null, issues };
  }

  return {
    status: "ready",
    value: {
      runtimeMode: mode,
      deploymentEnvironment: publicConfiguration.deploymentEnvironment,
      public: publicConfiguration,
      sources,
      localPersistent,
      providers: {
        activation: "inactive",
      },
    },
    issues: [],
  };
}

export type CanonicalLocalCommerceCapabilitySelection = "selected" | "not_selected" | "unavailable";

const CAPABILITY_SOURCE_KEYS: Readonly<Record<Exclude<LocalPersistentCapability, "delivery">, keyof RuntimeEnvironment>> = {
  admin: "ADMIN_ACCEPTANCE_SOURCE",
  auth: "CUSTOMER_AUTH_SOURCE",
  cart: "CART_SOURCE",
  catalog: "PHOTOGIFT_PRODUCT_SOURCE",
  checkout: "LOCAL_CHECKOUT_SOURCE",
  fulfillment: "LOCAL_FULFILLMENT_SOURCE",
  order: "LOCAL_ORDER_SOURCE",
  payment: "LOCAL_PAYMENT_SOURCE",
  tracking: "LOCAL_TRACKING_SOURCE",
  upload: "CUSTOMER_UPLOAD_SOURCE",
};

/**
 * The one source-selection seam for application/HTTP local commerce
 * consumers. Provider-specific readers may still validate their own adapter
 * settings, but they cannot select a persistent local authority around this
 * composition. The tri-state result prevents an invalid selected persistent
 * source from falling back to a fake or fixture provider.
 */
export function resolveCanonicalLocalCommerceCapability(
  capability: LocalPersistentCapability,
  environment: RuntimeEnvironment = process.env,
): CanonicalLocalCommerceCapabilitySelection {
  const key = capability === "delivery" ? "LOCAL_FULFILLMENT_SOURCE" : CAPABILITY_SOURCE_KEYS[capability];
  const persistentRequested = normalized(environment, key) === "local_persistent";
  if (!persistentRequested) return "not_selected";
  const composition = composeServerRuntimeConfiguration(environment);
  if (composition.status !== "ready") return "unavailable";
  if (capability === "delivery") return composition.value.sources.fulfillment === "local_persistent" ? "selected" : "unavailable";
  return composition.value.sources[capability] === "local_persistent" ? "selected" : "unavailable";
}

export function projectPublicRuntimeConfiguration(configuration: ServerRuntimeConfiguration) {
  return Object.freeze({
    brandName: configuration.public.brandName,
    deploymentEnvironment: configuration.public.deploymentEnvironment,
    siteUrl: configuration.public.siteUrl,
    ...(configuration.public.supportEmail ? { supportEmail: configuration.public.supportEmail } : {}),
  });
}
