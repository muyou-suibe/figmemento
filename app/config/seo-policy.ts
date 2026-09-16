import {
  parseDeploymentConfiguration,
  parseDeploymentEnvironment,
  parsePublicOrigin,
  type DeploymentEnvironment,
} from "./public.ts";
import { productionOrigin } from "./identity.ts";
import { classifyHost, type HostClassification } from "./host-policy.ts";

export interface SeoPolicy {
  environment: DeploymentEnvironment;
  hostClassification: HostClassification;
  isApprovedProduction: boolean;
  isIndexable: boolean;
  canonicalOrigin?: typeof productionOrigin;
  canEmitCanonical: boolean;
  canPublishSitemap: boolean;
  canAdvertiseSitemap: boolean;
  robots: {
    index: boolean;
    follow: boolean;
  };
}

export interface SeoPolicyInput {
  appDeploymentEnv?: string;
  deploymentOrigin?: string;
  nodeEnv?: string;
  hostname?: string;
}

export function parseSeoPolicy(input: SeoPolicyInput = {}): SeoPolicy {
  const environment = parseDeploymentEnvironment(input);
  const explicitEnvironment = input.appDeploymentEnv?.trim();
  let configuredOrigin: string | undefined;

  if (environment === "production" || environment === "staging" || environment === "development" || environment === "test") {
    configuredOrigin = parseDeploymentConfiguration(input).origin;
  } else if (input.deploymentOrigin?.trim()) {
    configuredOrigin = parsePublicOrigin(input.deploymentOrigin);
  }

  const hostClassification = classifyHost(input.hostname, environment);
  const isApprovedProduction = explicitEnvironment === "production"
    && configuredOrigin === productionOrigin
    && (!input.hostname || hostClassification === "PRODUCTION_APEX");

  return {
    environment,
    hostClassification,
    isApprovedProduction,
    isIndexable: isApprovedProduction,
    ...(isApprovedProduction ? { canonicalOrigin: productionOrigin } : {}),
    canEmitCanonical: isApprovedProduction,
    canPublishSitemap: isApprovedProduction,
    canAdvertiseSitemap: isApprovedProduction,
    robots: { index: isApprovedProduction, follow: isApprovedProduction },
  };
}

export function getSeoPolicy(hostname?: string): SeoPolicy {
  return parseSeoPolicy({
    appDeploymentEnv: process.env.APP_DEPLOYMENT_ENV,
    deploymentOrigin: process.env.NEXT_PUBLIC_DEPLOYMENT_ORIGIN,
    nodeEnv: process.env.NODE_ENV,
    hostname,
  });
}
