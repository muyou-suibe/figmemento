import type { Metadata } from "next";
import type { CatalogMetadataModel } from "../application/catalog-seo.ts";
import { brandName } from "../config/identity.ts";

export function toNextCatalogMetadata(model: CatalogMetadataModel): Metadata {
  const openGraph = {
    title: model.title,
    description: model.description,
    ...(model.canonicalUrl ? { url: model.canonicalUrl } : {}),
    ...(model.imageUrl ? { images: [{ url: model.imageUrl }] } : {}),
  };
  return {
    title: model.title,
    description: model.description,
    ...(model.canonicalUrl
      ? { alternates: { canonical: model.canonicalUrl } }
      : { robots: { index: false, follow: false } }),
    openGraph,
  };
}

export const unavailableCatalogMetadata: Metadata = {
  title: `Catalog unavailable | ${brandName}`,
  description: "This catalog page is not currently available.",
  robots: { index: false, follow: false },
};
