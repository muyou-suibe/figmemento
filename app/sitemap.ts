import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3002";
  return ["", "/track-order", "/faq", "/shipping-returns", "/privacy", "/terms"].map((path, index) => ({ url: `${baseUrl}${path}`, lastModified: new Date(), changeFrequency: index === 0 ? "weekly" : "monthly", priority: index === 0 ? 1 : 0.5 }));
}
