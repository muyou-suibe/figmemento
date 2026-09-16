import { productionOrigin } from "./identity.ts";
import { normalizeHostname } from "./host-policy.ts";

export interface PermanentRedirectDecision {
  status: 308;
  location: string;
}

export function getWwwRedirect(requestUrl: string): PermanentRedirectDecision | null {
  let parsed: URL;
  try {
    parsed = new URL(requestUrl);
  } catch {
    return null;
  }

  if (!(parsed.protocol === "http:" || parsed.protocol === "https:")) return null;
  if (normalizeHostname(parsed.host) !== "www.figmemento.com") return null;

  const target = new URL(productionOrigin);
  target.pathname = parsed.pathname;
  target.search = parsed.search;
  return { status: 308, location: target.toString() };
}
