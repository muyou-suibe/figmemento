import type { Product } from "../domain/product";

export type ProductCatalogSource = "supabase" | "fixture";

export interface ProductRepository {
  listPublishedProducts(): Promise<Product[]>;
}

export type ProductCatalogResult =
  | { status: "available"; products: Product[]; source: ProductCatalogSource }
  | { status: "unavailable"; reason: "configuration" | "source" };

export async function loadProductCatalog(
  repository: ProductRepository,
  source: ProductCatalogSource,
): Promise<ProductCatalogResult> {
  try {
    return { status: "available", products: await repository.listPublishedProducts(), source };
  } catch {
    return { status: "unavailable", reason: "source" };
  }
}
