import type { PublicCatalogProductSummary } from "./catalog-repository.ts";
import type { CatalogProduct, CatalogSeo, Category, ProductAsset } from "../domain/catalog/index.ts";

export interface CatalogMetadataModel {
  title: string;
  description: string;
  canonicalUrl?: string;
  imageUrl?: string;
}

export interface CatalogSiteIdentity {
  siteUrl?: string;
  brandName: string;
}

function absoluteUrl(siteUrl: string | undefined, path: string): string | undefined {
  if (!siteUrl) return undefined;
  const normalizedBase = siteUrl.endsWith("/") ? siteUrl : `${siteUrl}/`;
  return new URL(path.replace(/^\//, ""), normalizedBase).toString();
}

function contentMetadata(
  content: {
    name: string;
    description: string;
    seo?: CatalogSeo | null;
  },
  fallbackPath: string,
  site: CatalogSiteIdentity,
): CatalogMetadataModel {
  const seo = content.seo ?? {};
  return {
    title: `${seo.title ?? content.name} | ${site.brandName}`,
    description: seo.description ?? content.description,
    canonicalUrl: absoluteUrl(site.siteUrl, seo.canonicalPath ?? fallbackPath),
  };
}

export function buildShopMetadataModel(site: CatalogSiteIdentity): CatalogMetadataModel {
  return {
    title: `Shop | ${site.brandName}`,
    description: `Browse published ${site.brandName} collections and currently available personalized gifts.`,
    canonicalUrl: absoluteUrl(site.siteUrl, "/shop"),
  };
}

export function buildCategoryMetadataModel(
  category: Category,
  site: CatalogSiteIdentity,
): CatalogMetadataModel {
  return contentMetadata(category, `/category/${category.slug}`, site);
}

export function buildProductMetadataModel(
  product: CatalogProduct,
  assets: readonly ProductAsset[],
  site: CatalogSiteIdentity,
): CatalogMetadataModel {
  const metadata = contentMetadata(product, `/product/${product.slug}`, site);
  const seoAsset = assets.find(
    (asset) =>
      asset.productId === product.id &&
      asset.role === "seo" &&
      asset.mediaType === "image" &&
      asset.source.kind === "url",
  );
  if (!seoAsset || /\s/.test(seoAsset.source.value)) return metadata;
  try {
    if (new URL(seoAsset.source.value).protocol !== "https:") return metadata;
  } catch {
    return metadata;
  }
  return { ...metadata, imageUrl: seoAsset.source.value };
}

export function buildPublicCatalogSitemapPaths(
  categories: readonly Category[],
  products: readonly PublicCatalogProductSummary[],
): readonly string[] {
  const activeCategoryIds = new Set(
    categories.filter((category) => category.lifecycle === "published").map((category) => category.id),
  );
  return [
    "/shop",
    ...categories
      .filter((category) => category.lifecycle === "published")
      .map((category) => `/category/${category.slug}`),
    ...products
      .filter(
        (item) =>
          item.product.lifecycle === "published" &&
          item.category.lifecycle === "published" &&
          activeCategoryIds.has(item.product.categoryId),
      )
      .map((item) => `/product/${item.product.slug}`),
  ].sort((left, right) => left.localeCompare(right));
}
