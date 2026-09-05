import type { ProductRepository } from "../../application/product-catalog";
import type { Product } from "../../domain/product";
import {
  createDevelopmentCatalogFixtures,
  developmentCatalogFixtureDefinitions,
} from "../catalog/development-catalog-fixtures.ts";

function legacyProductFixtures(): Product[] {
  const catalog = createDevelopmentCatalogFixtures();
  return developmentCatalogFixtureDefinitions.map((definition) => {
    const product = catalog.products.find((candidate) => candidate.slug === definition.slug);
    const variant = catalog.variants.find((candidate) => candidate.productId === product?.id);
    const fulfillment = catalog.fulfillmentConfigs.find((candidate) => candidate.productId === product?.id);
    if (!product || !variant || !fulfillment) {
      throw new Error(`Invalid development catalog fixture: ${definition.slug}`);
    }
    const category = definition.categorySlug === "digital-gifts"
      ? "Digital gifts" as const
      : definition.categorySlug === "pet-memories"
        ? "Pet memories" as const
        : "3D keepsakes" as const;
    return {
      id: definition.slug,
      name: product.name,
      category,
      price: variant.priceCents / 100,
      ...(definition.tag ? { tag: definition.tag } : {}),
      description: product.description,
      art: definition.art,
      materials: fulfillment.fulfillmentType === "digital"
        ? "High-resolution digital file"
        : "Made to order from your photo",
      size: fulfillment.fulfillmentType === "digital"
        ? "Ready for screen or print"
        : "Finished size varies by design",
      leadTime: `${fulfillment.leadTime.minBusinessDays}–${fulfillment.leadTime.maxBusinessDays} business days`,
    };
  });
}

export const developmentProductFixtures: readonly Product[] = legacyProductFixtures();

export class FixtureProductRepository implements ProductRepository {
  async listPublishedProducts(): Promise<Product[]> {
    return developmentProductFixtures.map((product) => ({ ...product }));
  }
}
