import type { MetadataRoute } from "next";
import { buildPublicCatalogSitemapPaths } from "./application/catalog-seo.ts";
import type { SeoPolicy } from "./config/seo-policy.ts";
import { getSeoPolicy } from "./config/seo-policy.ts";
import { createServerCatalogRepository } from "./infrastructure/catalog/server-catalog-repository.ts";

const staticPaths = ["", "/track-order", "/faq", "/shipping-returns", "/privacy", "/terms"] as const;

type SitemapRepositoryFactory = () => ReturnType<typeof createServerCatalogRepository>;

export async function buildSitemap(
  policy: SeoPolicy,
  createRepository: SitemapRepositoryFactory = createServerCatalogRepository,
): Promise<MetadataRoute.Sitemap> {
  if (!policy.canPublishSitemap || !policy.canonicalOrigin) return [];

  const baseUrl = policy.canonicalOrigin;
  const staticEntries: MetadataRoute.Sitemap = staticPaths.map((path, index) => ({
    url: new URL(path || "/", baseUrl).toString(),
    changeFrequency: index === 0 ? "weekly" : "monthly",
    priority: index === 0 ? 1 : 0.5,
  }));
  const source: Awaited<ReturnType<SitemapRepositoryFactory>> = await createRepository();
  if (source.status !== "found") return staticEntries;
  const [categories, products] = await Promise.all([
    source.value.repository.listPublicCategories(),
    source.value.repository.listPublicProducts(),
  ]);
  if (categories.status !== "found" || products.status !== "found") return staticEntries;
  return [
    ...staticEntries,
    ...buildPublicCatalogSitemapPaths(categories.value, products.value).map((path) => ({
      url: new URL(path, baseUrl).toString(),
      changeFrequency: "weekly" as const,
      priority: path === "/shop" ? 0.9 : 0.7,
    })),
  ];
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return buildSitemap(getSeoPolicy());
}
