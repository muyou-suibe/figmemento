export type RuntimeEnvironment = Record<string, string | undefined>;
export type ProductSource = "supabase" | "fixture" | "local_persistent";
export type CustomerAuthSource = "disabled" | "local_fake" | "local_persistent";
export type CustomerAuthRuntimeMode = "development" | "test" | "production" | "unknown";
export type CartSource = "disabled" | "local_fake" | "local_persistent";
export type CartRuntimeMode = "development" | "test" | "production" | "unknown";
export type CustomerUploadSource = "disabled" | "local_fake";
export type CustomerUploadRuntimeMode = "development" | "test" | "production" | "unknown";

export interface CustomerAuthConfiguration {
  readonly source: CustomerAuthSource;
  readonly runtimeMode: CustomerAuthRuntimeMode;
}

export interface CartConfiguration {
  readonly source: CartSource;
  readonly runtimeMode: CartRuntimeMode;
}

export interface CustomerUploadConfiguration {
  readonly source: CustomerUploadSource;
  readonly runtimeMode: CustomerUploadRuntimeMode;
}

export class ServerConfigurationError extends Error {
  readonly key: string;

  constructor(key: string, message = `Missing server configuration: ${key}`) {
    super(message);
    this.name = "ServerConfigurationError";
    this.key = key;
  }
}

function required(environment: RuntimeEnvironment, key: string): string {
  const value = environment[key];
  if (!value?.trim()) throw new ServerConfigurationError(key);
  return value;
}

export function readSupabaseServerConfig(environment: RuntimeEnvironment = process.env) {
  return {
    url: required(environment, "NEXT_PUBLIC_SUPABASE_URL"),
    secretKey: required(environment, "SUPABASE_SECRET_KEY"),
  };
}

export function readStripeServerConfig(environment: RuntimeEnvironment = process.env) {
  return { secretKey: required(environment, "STRIPE_SECRET_KEY") };
}

export function isStripeConfigured(environment: RuntimeEnvironment = process.env): boolean {
  return Boolean(environment.STRIPE_SECRET_KEY?.trim());
}

export function readStripeWebhookConfig(environment: RuntimeEnvironment = process.env) {
  return { secret: required(environment, "STRIPE_WEBHOOK_SECRET") };
}

export function readAdminPassword(environment: RuntimeEnvironment = process.env): string | null {
  const password = environment.ADMIN_PASSWORD;
  return password?.trim() ? password : null;
}

function normalizeCustomerAuthRuntimeMode(value: string | undefined): CustomerAuthRuntimeMode {
  if (value === "development" || value === "test" || value === "production") return value;
  return "unknown";
}

function normalizeCartRuntimeMode(value: string | undefined): CartRuntimeMode {
  if (value === "development" || value === "test" || value === "production") return value;
  return "unknown";
}

function normalizeCustomerUploadRuntimeMode(value: string | undefined): CustomerUploadRuntimeMode {
  if (value === "development" || value === "test" || value === "production") return value;
  return "unknown";
}

/**
 * Selects the customer-upload runtime independently from the catalog source.
 * The default is deliberately disabled; local_fake is never a production
 * provider and is rejected outside development/test.
 */
export function readCustomerUploadConfig(
  environment: RuntimeEnvironment = process.env,
  runtimeMode: string | undefined = process.env.NODE_ENV,
): CustomerUploadConfiguration {
  const source = environment.CUSTOMER_UPLOAD_SOURCE?.trim() || "disabled";
  if (source !== "disabled" && source !== "local_fake") {
    throw new ServerConfigurationError(
      "CUSTOMER_UPLOAD_SOURCE",
      "Invalid server configuration: CUSTOMER_UPLOAD_SOURCE",
    );
  }
  const normalizedRuntimeMode = normalizeCustomerUploadRuntimeMode(runtimeMode);
  if (source === "local_fake" && !["development", "test"].includes(normalizedRuntimeMode)) {
    throw new ServerConfigurationError(
      "CUSTOMER_UPLOAD_SOURCE",
      "Local fake customer upload is allowed only in development or test",
    );
  }
  return { source, runtimeMode: normalizedRuntimeMode };
}

export function readCartConfig(
  environment: RuntimeEnvironment = process.env,
  runtimeMode: string | undefined = process.env.NODE_ENV,
): CartConfiguration {
  const source = environment.CART_SOURCE?.trim() || "disabled";
  if (source !== "disabled" && source !== "local_fake" && source !== "local_persistent") {
    throw new ServerConfigurationError("CART_SOURCE", "Invalid server configuration: CART_SOURCE");
  }
  const normalizedRuntimeMode = normalizeCartRuntimeMode(runtimeMode);
  if (source !== "disabled" && !["development", "test"].includes(normalizedRuntimeMode)) {
    throw new ServerConfigurationError(
      "CART_SOURCE",
      "Local fake Cart is allowed only in development or test",
    );
  }
  return { source, runtimeMode: normalizedRuntimeMode };
}

export function readCustomerAuthConfig(
  environment: RuntimeEnvironment = process.env,
  runtimeMode: string | undefined = process.env.NODE_ENV,
): CustomerAuthConfiguration {
  const source = environment.CUSTOMER_AUTH_SOURCE?.trim() || "disabled";
  if (source !== "disabled" && source !== "local_fake" && source !== "local_persistent") {
    throw new ServerConfigurationError(
      "CUSTOMER_AUTH_SOURCE",
      "Invalid server configuration: CUSTOMER_AUTH_SOURCE",
    );
  }
  const normalizedRuntimeMode = normalizeCustomerAuthRuntimeMode(runtimeMode);
  if (source === "local_fake" && !["development", "test"].includes(normalizedRuntimeMode)) {
    throw new ServerConfigurationError(
      "CUSTOMER_AUTH_SOURCE",
      "Local fake customer authentication is allowed only in development or test",
    );
  }
  if (source === "local_persistent" && !["development", "test"].includes(normalizedRuntimeMode)) {
    throw new ServerConfigurationError(
      "CUSTOMER_AUTH_SOURCE",
      "Persistent local customer authentication is allowed only in development or test",
    );
  }
  return { source, runtimeMode: normalizedRuntimeMode };
}

export interface GuestDraftOwnerContextConfig {
  signingSecret: string;
  contextLifetimeSeconds: number;
}

const MINIMUM_GUEST_DRAFT_OWNER_SECRET_LENGTH = 32;
const MINIMUM_GUEST_DRAFT_OWNER_CONTEXT_LIFETIME_SECONDS = 60 * 5;
const MAXIMUM_GUEST_DRAFT_OWNER_CONTEXT_LIFETIME_SECONDS = 60 * 60 * 24 * 7;

/**
 * Cookie validity is an independently configured security-session limit. It
 * does not set customer-upload retention or any receipt expiry duration.
 */
export function readGuestDraftOwnerContextConfig(
  environment: RuntimeEnvironment = process.env,
): GuestDraftOwnerContextConfig {
  const signingSecret = required(environment, "PHOTOGIFT_GUEST_DRAFT_OWNER_SECRET");
  if (
    signingSecret.trim() !== signingSecret ||
    signingSecret.length < MINIMUM_GUEST_DRAFT_OWNER_SECRET_LENGTH ||
    new Set(signingSecret).size < 4
  ) {
    throw new ServerConfigurationError(
      "PHOTOGIFT_GUEST_DRAFT_OWNER_SECRET",
      "Invalid server configuration: PHOTOGIFT_GUEST_DRAFT_OWNER_SECRET",
    );
  }
  const lifetimeRaw = required(environment, "PHOTOGIFT_GUEST_DRAFT_OWNER_CONTEXT_TTL_SECONDS");
  if (!/^\d+$/.test(lifetimeRaw)) {
    throw new ServerConfigurationError(
      "PHOTOGIFT_GUEST_DRAFT_OWNER_CONTEXT_TTL_SECONDS",
      "Invalid server configuration: PHOTOGIFT_GUEST_DRAFT_OWNER_CONTEXT_TTL_SECONDS",
    );
  }
  const contextLifetimeSeconds = Number(lifetimeRaw);
  if (
    !Number.isSafeInteger(contextLifetimeSeconds) ||
    contextLifetimeSeconds < MINIMUM_GUEST_DRAFT_OWNER_CONTEXT_LIFETIME_SECONDS ||
    contextLifetimeSeconds > MAXIMUM_GUEST_DRAFT_OWNER_CONTEXT_LIFETIME_SECONDS
  ) {
    throw new ServerConfigurationError(
      "PHOTOGIFT_GUEST_DRAFT_OWNER_CONTEXT_TTL_SECONDS",
      "Invalid server configuration: PHOTOGIFT_GUEST_DRAFT_OWNER_CONTEXT_TTL_SECONDS",
    );
  }
  return { signingSecret, contextLifetimeSeconds };
}

export function readUploadConfig(environment: RuntimeEnvironment = process.env) {
  return { bucket: environment.SUPABASE_UPLOAD_BUCKET?.trim() || "photogift-uploads" };
}

export function readProductSource(environment: RuntimeEnvironment = process.env): ProductSource {
  const source = environment.PHOTOGIFT_PRODUCT_SOURCE?.trim() || "supabase";
  if (source !== "supabase" && source !== "fixture" && source !== "local_persistent") {
    throw new ServerConfigurationError("PHOTOGIFT_PRODUCT_SOURCE", "Invalid server configuration: PHOTOGIFT_PRODUCT_SOURCE");
  }
  if (source === "fixture" && environment.NODE_ENV !== "development" && environment.NODE_ENV !== "test") {
    throw new ServerConfigurationError("PHOTOGIFT_PRODUCT_SOURCE", "Fixture product source is allowed only in development or test");
  }
  if (source === "local_persistent" && environment.NODE_ENV !== "development" && environment.NODE_ENV !== "test") {
    throw new ServerConfigurationError("PHOTOGIFT_PRODUCT_SOURCE", "Persistent product source is allowed only in development or test");
  }
  return source;
}
