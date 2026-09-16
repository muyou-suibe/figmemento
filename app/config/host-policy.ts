import type { DeploymentEnvironment } from "./public.ts";
import { canonicalHostname, stagingHostname } from "./identity.ts";

export type HostClassification =
  | "PRODUCTION_APEX"
  | "PRODUCTION_WWW_ALIAS"
  | "STAGING"
  | "PROVIDER_PREVIEW"
  | "DEVELOPMENT"
  | "TEST"
  | "UNKNOWN";

function parseHost(value: string): string | undefined {
  const normalized = value.trim();
  if (!normalized || /\s/.test(normalized) || /[/?#@]/.test(normalized)) return undefined;
  try {
    const parsed = new URL(`http://${normalized}`);
    if (parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) return undefined;
    return parsed.hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

export function normalizeHostname(value?: string): string | undefined {
  return value === undefined ? undefined : parseHost(value);
}

export function classifyHost(
  value: string | undefined,
  deploymentEnvironment?: DeploymentEnvironment,
): HostClassification {
  const hostname = normalizeHostname(value);
  if (hostname === canonicalHostname) return "PRODUCTION_APEX";
  if (hostname === `www.${canonicalHostname}`) return "PRODUCTION_WWW_ALIAS";
  if (hostname === stagingHostname) return "STAGING";
  if (hostname === "localhost" || hostname === "127.0.0.1") return "DEVELOPMENT";
  if (hostname?.endsWith(".test")) return "TEST";
  if (deploymentEnvironment === "preview") return "PROVIDER_PREVIEW";
  if (!hostname && deploymentEnvironment === "development") return "DEVELOPMENT";
  if (!hostname && deploymentEnvironment === "test") return "TEST";
  return "UNKNOWN";
}
