import type {
  CatalogRepositoryResult,
  PublicCatalogProductDetail,
  PublicCatalogProductSummary,
  PublicCatalogReadRepository,
} from "./catalog-repository.ts";
import type { Category } from "../domain/catalog/index.ts";

export interface PublicShopPageData {
  categories: readonly Category[];
  products: readonly PublicCatalogProductSummary[];
}

export interface PublicCategoryPageData extends PublicShopPageData {
  category: Category;
}

function forwardFailure<T>(
  result: Exclude<CatalogRepositoryResult<unknown>, { status: "found" }>,
): CatalogRepositoryResult<T> {
  return result as CatalogRepositoryResult<T>;
}

export async function loadPublicShopPage(
  repository: PublicCatalogReadRepository,
): Promise<CatalogRepositoryResult<PublicShopPageData>> {
  const [categories, products] = await Promise.all([
    repository.listPublicCategories(),
    repository.listPublicProducts(),
  ]);
  if (categories.status !== "found") return forwardFailure(categories);
  if (products.status !== "found") return forwardFailure(products);
  return { status: "found", value: { categories: categories.value, products: products.value } };
}

export async function loadPublicCategoryPage(
  repository: PublicCatalogReadRepository,
  slug: string,
): Promise<CatalogRepositoryResult<PublicCategoryPageData>> {
  const categories = await repository.listPublicCategories();
  if (categories.status !== "found") return forwardFailure(categories);
  const category = categories.value.find((candidate) => candidate.slug === slug);
  if (!category) return { status: "not_found" };
  const products = await repository.listPublicProducts();
  if (products.status !== "found") return forwardFailure(products);
  return {
    status: "found",
    value: {
      category,
      categories: categories.value,
      products: products.value.filter((item) => item.product.categoryId === category.id),
    },
  };
}

export function loadPublicProductPage(
  repository: PublicCatalogReadRepository,
  slug: string,
): Promise<CatalogRepositoryResult<PublicCatalogProductDetail>> {
  return repository.findPublicProductBySlug(slug);
}
