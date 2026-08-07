import type { MetadataRoute } from "next";
import { getPublicSiteConfig } from "./config/public";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getPublicSiteConfig().siteUrl;
  return { rules: [{ userAgent: "*", allow: "/", disallow: ["/admin/", "/api/"] }], sitemap: `${baseUrl}/sitemap.xml` };
}
