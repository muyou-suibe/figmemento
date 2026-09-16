import type { MetadataRoute } from "next";
import type { SeoPolicy } from "./config/seo-policy.ts";
import { getSeoPolicy } from "./config/seo-policy.ts";

export function buildRobots(policy: SeoPolicy): MetadataRoute.Robots {
  if (!policy.isIndexable || !policy.canonicalOrigin) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin/", "/api/"] }],
    sitemap: `${policy.canonicalOrigin}/sitemap.xml`,
  };
}

export default function robots(): MetadataRoute.Robots {
  return buildRobots(getSeoPolicy());
}
