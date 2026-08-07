import type { MetadataRoute } from "next";
import { getPublicSiteConfig } from "./config/public";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = getPublicSiteConfig().siteUrl;
  return ["", "/track-order", "/faq", "/shipping-returns", "/privacy", "/terms"].map((path, index) => ({ url: `${baseUrl}${path}`, lastModified: new Date(), changeFrequency: index === 0 ? "weekly" : "monthly", priority: index === 0 ? 1 : 0.5 }));
}
