import {
  brandName,
  productionOrigin,
  stagingHostname,
} from "./identity.ts";

export { brandName, canonicalHostname, productionOrigin, publicIdentity, stagingHostname } from "./identity.ts";

export type PublicSupabaseConfig = {
  url: string;
  publishableKey: string;
};

export type DeploymentEnvironment = "production" | "staging" | "preview" | "development" | "test";

export type DeploymentConfiguration = {
  environment: DeploymentEnvironment;
  origin: string;
};

export type PublicSiteConfig = {
  siteUrl: string;
  brandName: typeof brandName;
  deploymentEnvironment: DeploymentEnvironment;
  supportEmail?: string;
};

export class PublicConfigurationError extends Error {
  readonly key: string;

  constructor(key: string, message = `Invalid public configuration: ${key}`) {
    super(message);
    this.name = "PublicConfigurationError";
    this.key = key;
  }
}

function required(value: string | undefined, key: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new PublicConfigurationError(key, `Missing public configuration: ${key}`);
  return normalized;
}

export function parsePublicSupabaseConfig(input: {
  url?: string;
  publishableKey?: string;
}): PublicSupabaseConfig {
  return {
    url: required(input.url, "NEXT_PUBLIC_SUPABASE_URL"),
    publishableKey: required(input.publishableKey, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
  };
}

export function getPublicSupabaseConfig(): PublicSupabaseConfig {
  return parsePublicSupabaseConfig({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}

const deploymentEnvironments = new Set<DeploymentEnvironment>([
  "production",
  "staging",
  "preview",
  "development",
  "test",
]);

function inferDeploymentEnvironment(appDeploymentEnv: string | undefined, nodeEnv: string | undefined): DeploymentEnvironment {
  const explicit = appDeploymentEnv?.trim();
  if (explicit) {
    if (!deploymentEnvironments.has(explicit as DeploymentEnvironment)) {
      throw new PublicConfigurationError("APP_DEPLOYMENT_ENV");
    }
    return explicit as DeploymentEnvironment;
  }

  if (nodeEnv === "production") return "production";
  if (nodeEnv === "test") return "test";
  return "development";
}

export function parseDeploymentEnvironment(input: {
  appDeploymentEnv?: string;
  nodeEnv?: string;
} = {}): DeploymentEnvironment {
  return inferDeploymentEnvironment(input.appDeploymentEnv, input.nodeEnv);
}

export function parsePublicOrigin(value: string, key = "NEXT_PUBLIC_DEPLOYMENT_ORIGIN"): string {
  const normalized = value.trim();
  if (!normalized || /\s/.test(normalized)) throw new PublicConfigurationError(key);

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new PublicConfigurationError(key);
  }

  if (!(["http:", "https:"].includes(parsed.protocol))) throw new PublicConfigurationError(key);
  if (parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new PublicConfigurationError(key);
  }

  return parsed.origin;
}

export function parseDeploymentConfiguration(input: {
  appDeploymentEnv?: string;
  deploymentOrigin?: string;
  nodeEnv?: string;
} = {}): DeploymentConfiguration {
  const environment = parseDeploymentEnvironment(input);
  const configuredOrigin = input.deploymentOrigin?.trim();

  if (environment === "production") {
    const origin = configuredOrigin ? parsePublicOrigin(configuredOrigin) : productionOrigin;
    if (origin !== productionOrigin) throw new PublicConfigurationError("NEXT_PUBLIC_DEPLOYMENT_ORIGIN");
    return { environment, origin };
  }

  if (environment === "preview" && !configuredOrigin) {
    throw new PublicConfigurationError("NEXT_PUBLIC_DEPLOYMENT_ORIGIN");
  }

  if (configuredOrigin) return { environment, origin: parsePublicOrigin(configuredOrigin) };
  if (environment === "staging") return { environment, origin: `https://${stagingHostname}` };
  return { environment, origin: "http://localhost:3000" };
}

const supportedEmailShape = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseSupportEmail(value?: string): string | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  if (normalized.toLowerCase() === "hello@photogift.example" || !supportedEmailShape.test(normalized)) {
    throw new PublicConfigurationError("NEXT_PUBLIC_SUPPORT_EMAIL");
  }
  return normalized;
}

export function getSupportContactText(supportEmail?: string): string {
  return supportEmail
    ? `For order help, email ${supportEmail} and include your order number.`
    : "For order help, contact the support team through the channel provided with your order and include your order number.";
}

export function parsePublicSiteConfig(input: {
  appDeploymentEnv?: string;
  deploymentOrigin?: string;
  nodeEnv?: string;
  supportEmail?: string;
} = {}): PublicSiteConfig {
  const deployment = parseDeploymentConfiguration(input);
  return {
    siteUrl: deployment.origin,
    brandName,
    deploymentEnvironment: deployment.environment,
    supportEmail: parseSupportEmail(input.supportEmail),
  };
}

export function getPublicSiteConfig(): PublicSiteConfig {
  return parsePublicSiteConfig({
    appDeploymentEnv: process.env.APP_DEPLOYMENT_ENV,
    deploymentOrigin: process.env.NEXT_PUBLIC_DEPLOYMENT_ORIGIN,
    nodeEnv: process.env.NODE_ENV,
    supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL,
  });
}
