import {
  evaluatePublicEligibility,
  type CatalogProduct,
  type CatalogValidationIssue,
  type Category,
  type ListingPrice,
  type ProductAsset,
  type ProductFulfillmentConfig,
  type ProductOption,
  type ProductOptionValue,
  type ProductVariant,
} from "../domain/catalog/index.ts";
import {
  catalogGraphForProduct,
  sortCatalogDataSet,
  validateCatalogDataSet,
  type CatalogDataSet,
} from "./catalog-data-set.ts";

export type CatalogUnavailableReason = "not_public" | "no_eligible_variant";

export type CatalogRepositoryResult<T> =
  | { status: "found"; value: T }
  | { status: "not_found" }
  | { status: "unavailable"; reason: CatalogUnavailableReason }
  | { status: "invalid_configuration"; issues: readonly CatalogValidationIssue[] }
  | { status: "source_failure"; operation: string };

export interface CatalogDataSource {
  loadCatalogDataSet(): Promise<CatalogRepositoryResult<CatalogDataSet>>;
}

export interface PublicCatalogProductSummary {
  category: Category;
  product: CatalogProduct;
  listingPrice: ListingPrice;
  thumbnail?: ProductAsset;
}

export interface PublicCatalogProductDetail {
  category: Category;
  product: CatalogProduct;
  listingPrice: ListingPrice;
  options: readonly ProductOption[];
  optionValues: readonly ProductOptionValue[];
  variants: readonly ProductVariant[];
  assets: readonly ProductAsset[];
  fulfillment: ProductFulfillmentConfig;
}

export type ExactVariantRequest =
  | { productId: string; variantId: string }
  | { productId: string; skuCode: string };

export interface PublicCatalogReadRepository {
  listPublicCategories(): Promise<CatalogRepositoryResult<readonly Category[]>>;
  listPublicProducts(): Promise<CatalogRepositoryResult<readonly PublicCatalogProductSummary[]>>;
  findPublicProductById(productId: string): Promise<CatalogRepositoryResult<PublicCatalogProductDetail>>;
  findPublicProductBySlug(slug: string): Promise<CatalogRepositoryResult<PublicCatalogProductDetail>>;
  resolveExactVariant(request: ExactVariantRequest): Promise<CatalogRepositoryResult<ProductVariant>>;
}

export interface CatalogAdminReadRepository {
  readAdminCatalogGraph(): Promise<CatalogRepositoryResult<CatalogDataSet>>;
}

export type CatalogAdminCommandResult<T> =
  | { status: "applied"; value: T }
  | { status: "not_found" }
  | { status: "unavailable"; reason: CatalogUnavailableReason }
  | { status: "invalid_configuration"; issues: readonly CatalogValidationIssue[] }
  | { status: "source_failure"; operation: string };

// Task 4 establishes this provider-neutral boundary only. Authorization,
// transactions, audit writes, and concrete commands are implemented in Section 6.
export interface CatalogAdminCommandRepository {
  saveCategory(category: Category): Promise<CatalogAdminCommandResult<Category>>;
  saveProduct(product: CatalogProduct): Promise<CatalogAdminCommandResult<CatalogProduct>>;
  saveOption(option: ProductOption): Promise<CatalogAdminCommandResult<ProductOption>>;
  saveOptionValue(value: ProductOptionValue): Promise<CatalogAdminCommandResult<ProductOptionValue>>;
  saveVariant(variant: ProductVariant): Promise<CatalogAdminCommandResult<ProductVariant>>;
  saveAsset(asset: ProductAsset): Promise<CatalogAdminCommandResult<ProductAsset>>;
  saveFulfillmentConfig(config: ProductFulfillmentConfig): Promise<CatalogAdminCommandResult<ProductFulfillmentConfig>>;
}

function publicFailureFromIssues(
  issues: readonly CatalogValidationIssue[],
): CatalogRepositoryResult<never> {
  return issues.every((issue) => issue.code === "unavailable")
    ? { status: "unavailable", reason: "no_eligible_variant" }
    : { status: "invalid_configuration", issues };
}

export class CatalogRepositoryService
  implements PublicCatalogReadRepository, CatalogAdminReadRepository
{
  private readonly source: CatalogDataSource;

  constructor(source: CatalogDataSource) {
    this.source = source;
  }

  private async loadValidatedDataSet(): Promise<CatalogRepositoryResult<CatalogDataSet>> {
    const loaded = await this.source.loadCatalogDataSet();
    if (loaded.status !== "found") return loaded;
    const value = sortCatalogDataSet(loaded.value);
    const validation = validateCatalogDataSet(value);
    return validation.ok
      ? { status: "found", value }
      : { status: "invalid_configuration", issues: validation.issues };
  }

  async readAdminCatalogGraph(): Promise<CatalogRepositoryResult<CatalogDataSet>> {
    return this.loadValidatedDataSet();
  }

  async listPublicCategories(): Promise<CatalogRepositoryResult<readonly Category[]>> {
    const loaded = await this.loadValidatedDataSet();
    if (loaded.status !== "found") return loaded;
    return {
      status: "found",
      value: loaded.value.categories.filter((category) => category.lifecycle === "published"),
    };
  }

  async listPublicProducts(): Promise<CatalogRepositoryResult<readonly PublicCatalogProductSummary[]>> {
    const loaded = await this.loadValidatedDataSet();
    if (loaded.status !== "found") return loaded;
    const summaries: PublicCatalogProductSummary[] = [];
    for (const product of loaded.value.products) {
      if (product.lifecycle !== "published") continue;
      const category = loaded.value.categories.find((candidate) => candidate.id === product.categoryId);
      if (category?.lifecycle !== "published") continue;
      const graph = catalogGraphForProduct(loaded.value, product);
      if (!graph.ok) return { status: "invalid_configuration", issues: graph.issues };
      const eligibility = evaluatePublicEligibility(graph.value);
      if (!eligibility.eligible) {
        const failure = publicFailureFromIssues(eligibility.issues);
        if (failure.status === "unavailable") continue;
        return failure;
      }
      const eligibleVariantIds = new Set(eligibility.eligibleVariantIds);
      const thumbnail = graph.value.assets.find(
        (asset) => asset.role === "thumbnail" &&
          (asset.variantId === undefined || eligibleVariantIds.has(asset.variantId)),
      );
      summaries.push({
        category: graph.value.category,
        product,
        listingPrice: eligibility.listingPrice,
        ...(thumbnail ? { thumbnail } : {}),
      });
    }
    return { status: "found", value: summaries };
  }

  private async findPublicProduct(
    matches: (product: CatalogProduct) => boolean,
  ): Promise<CatalogRepositoryResult<PublicCatalogProductDetail>> {
    const loaded = await this.loadValidatedDataSet();
    if (loaded.status !== "found") return loaded;
    const product = loaded.value.products.find(matches);
    if (!product || product.lifecycle !== "published") return { status: "not_found" };
    const category = loaded.value.categories.find((candidate) => candidate.id === product.categoryId);
    if (!category || category.lifecycle !== "published") return { status: "not_found" };
    const graph = catalogGraphForProduct(loaded.value, product);
    if (!graph.ok) return { status: "invalid_configuration", issues: graph.issues };
    const eligibility = evaluatePublicEligibility(graph.value);
    if (!eligibility.eligible) return publicFailureFromIssues(eligibility.issues);
    const eligibleVariantIds = new Set(eligibility.eligibleVariantIds);
    return {
      status: "found",
      value: {
        category,
        product,
        listingPrice: eligibility.listingPrice,
        options: graph.value.options,
        optionValues: graph.value.optionValues,
        variants: graph.value.variants.filter((variant) => eligibleVariantIds.has(variant.id)),
        assets: graph.value.assets.filter(
          (asset) => asset.variantId === undefined || eligibleVariantIds.has(asset.variantId),
        ),
        fulfillment: graph.value.fulfillment,
      },
    };
  }

  findPublicProductById(
    productId: string,
  ): Promise<CatalogRepositoryResult<PublicCatalogProductDetail>> {
    return this.findPublicProduct((product) => product.id === productId);
  }

  findPublicProductBySlug(
    slug: string,
  ): Promise<CatalogRepositoryResult<PublicCatalogProductDetail>> {
    return this.findPublicProduct((product) => product.slug === slug);
  }

  async resolveExactVariant(
    request: ExactVariantRequest,
  ): Promise<CatalogRepositoryResult<ProductVariant>> {
    const loaded = await this.loadValidatedDataSet();
    if (loaded.status !== "found") return loaded;
    const product = loaded.value.products.find((candidate) => candidate.id === request.productId);
    if (!product || product.lifecycle !== "published") return { status: "not_found" };
    const category = loaded.value.categories.find((candidate) => candidate.id === product.categoryId);
    if (!category || category.lifecycle !== "published") return { status: "not_found" };
    const graph = catalogGraphForProduct(loaded.value, product);
    if (!graph.ok) return { status: "invalid_configuration", issues: graph.issues };
    const eligibility = evaluatePublicEligibility(graph.value);
    if (!eligibility.eligible) return publicFailureFromIssues(eligibility.issues);
    const matches = graph.value.variants.filter((variant) =>
      "variantId" in request
        ? variant.id === request.variantId
        : variant.skuCode === request.skuCode,
    );
    if (matches.length === 0) return { status: "not_found" };
    if (matches.length !== 1) {
      return {
        status: "invalid_configuration",
        issues: [{ path: "$.variants", code: "duplicate", message: "Exact Variant resolution returned more than one result." }],
      };
    }
    const variant = matches[0];
    return variant.isActive && variant.isAvailable
      ? { status: "found", value: variant }
      : { status: "unavailable", reason: "no_eligible_variant" };
  }
}
