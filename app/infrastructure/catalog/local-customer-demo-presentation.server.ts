import type {
  CatalogRepositoryResult,
  ExactVariantRequest,
  PublicCatalogProductDetail,
  PublicCatalogProductSummary,
  PublicCatalogReadRepository,
} from "../../application/catalog-repository.ts";
import type { Category, ProductVariant } from "../../domain/catalog/index.ts";
import type { RuntimeEnvironment } from "../../config/server.ts";

export const LOCAL_CUSTOMER_DEMO_CATEGORY_SLUGS = [
  "3d-figures",
  "custom-crafts",
  "pet-memories",
  "digital-gifts",
] as const;

export function shouldUseLocalCustomerDemoPresentation(environment: RuntimeEnvironment): boolean {
  return environment.NODE_ENV === "development"
    && environment.LOCAL_COMMERCE_ENVIRONMENT === "development"
    && environment.LOCAL_COMMERCE_PROJECT_KIND === "retained_development"
    && environment.LOCAL_COMMERCE_PROJECT_ID === "figmemento-local-commerce"
    && environment.PHOTOGIFT_PRODUCT_SOURCE === "local_persistent";
}

function demoCategories(categories: readonly Category[]): readonly Category[] | null {
  const selected = LOCAL_CUSTOMER_DEMO_CATEGORY_SLUGS
    .map((slug) => categories.find((category) => category.slug === slug))
    .filter((category): category is Category => Boolean(category));
  return selected.length === LOCAL_CUSTOMER_DEMO_CATEGORY_SLUGS.length ? selected : null;
}

/**
 * Development presentation only. Exact Product/SKU/configuration reads still
 * delegate to the canonical Catalog repository; no purchase fact is replaced.
 */
export class LocalCustomerDemoPresentationRepository implements PublicCatalogReadRepository {
  private readonly authority: PublicCatalogReadRepository;

  constructor(authority: PublicCatalogReadRepository) {
    this.authority = authority;
  }

  async listPublicCategories(): Promise<CatalogRepositoryResult<readonly Category[]>> {
    const result = await this.authority.listPublicCategories();
    if (result.status !== "found") return result;
    const selected = demoCategories(result.value);
    return selected ? { status: "found", value: selected } : result;
  }

  async listPublicProducts(): Promise<CatalogRepositoryResult<readonly PublicCatalogProductSummary[]>> {
    const [categories, products] = await Promise.all([
      this.authority.listPublicCategories(),
      this.authority.listPublicProducts(),
    ]);
    if (categories.status !== "found") return categories;
    if (products.status !== "found") return products;
    const selected = demoCategories(categories.value);
    if (!selected) return products;
    const categoryIds = new Set(selected.map((category) => category.id));
    return { status: "found", value: products.value.filter((item) => categoryIds.has(item.product.categoryId)) };
  }

  findPublicProductById(productId: string): Promise<CatalogRepositoryResult<PublicCatalogProductDetail>> {
    return this.authority.findPublicProductById(productId);
  }

  findPublicProductBySlug(slug: string): Promise<CatalogRepositoryResult<PublicCatalogProductDetail>> {
    return this.authority.findPublicProductBySlug(slug);
  }

  resolveExactVariant(request: ExactVariantRequest): Promise<CatalogRepositoryResult<ProductVariant>> {
    return this.authority.resolveExactVariant(request);
  }
}
