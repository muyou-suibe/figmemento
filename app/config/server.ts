export type RuntimeEnvironment = Record<string, string | undefined>;
export type ProductSource = "supabase" | "fixture";

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

export function readUploadConfig(environment: RuntimeEnvironment = process.env) {
  return { bucket: environment.SUPABASE_UPLOAD_BUCKET?.trim() || "photogift-uploads" };
}

export function readProductSource(environment: RuntimeEnvironment = process.env): ProductSource {
  const source = environment.PHOTOGIFT_PRODUCT_SOURCE?.trim() || "supabase";
  if (source !== "supabase" && source !== "fixture") {
    throw new ServerConfigurationError("PHOTOGIFT_PRODUCT_SOURCE", "Invalid server configuration: PHOTOGIFT_PRODUCT_SOURCE");
  }
  if (source === "fixture" && environment.NODE_ENV !== "development" && environment.NODE_ENV !== "test") {
    throw new ServerConfigurationError("PHOTOGIFT_PRODUCT_SOURCE", "Fixture product source is allowed only in development or test");
  }
  return source;
}
