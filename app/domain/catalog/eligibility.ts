import type { CatalogProduct, Category } from "./category-product.ts";
import {
  validateProductFulfillmentConfig,
  type ProductFulfillmentConfig,
} from "./fulfillment.ts";
import {
  deriveVariantListingPrice,
  validateVariantCombinations,
  type ListingPrice,
  type ProductOption,
  type ProductOptionValue,
  type ProductVariant,
} from "./variant.ts";
import {
  validationIssue,
  type CatalogValidationIssue,
} from "./validation.ts";

export interface CatalogGraph {
  category: Category;
  product: CatalogProduct;
  fulfillment: ProductFulfillmentConfig;
  options: readonly ProductOption[];
  optionValues: readonly ProductOptionValue[];
  variants: readonly ProductVariant[];
  catalogVariants?: readonly ProductVariant[];
}

export type PublicEligibilityResult =
  | {
      eligible: true;
      listingPrice: ListingPrice;
      eligibleVariantIds: readonly string[];
    }
  | { eligible: false; issues: CatalogValidationIssue[] };

export function evaluatePublicEligibility(
  graph: CatalogGraph,
): PublicEligibilityResult {
  const issues: CatalogValidationIssue[] = [];
  if (graph.category.lifecycle !== "published") {
    issues.push(validationIssue("$.category.lifecycle", "unavailable", "Category is not published."));
  }
  if (graph.product.lifecycle !== "published") {
    issues.push(validationIssue("$.product.lifecycle", "unavailable", "Product is not published."));
  }
  if (graph.product.categoryId !== graph.category.id) {
    issues.push(validationIssue("$.product.categoryId", "ownership", "Product does not belong to the supplied Category."));
  }
  if (graph.fulfillment.productId !== graph.product.id) {
    issues.push(validationIssue("$.fulfillment.productId", "ownership", "Fulfillment config does not belong to the Product."));
  }
  const fulfillment = validateProductFulfillmentConfig(graph.fulfillment);
  if (!fulfillment.ok) {
    issues.push(...fulfillment.issues);
  }
  const combinations = validateVariantCombinations({
    productId: graph.product.id,
    options: graph.options,
    optionValues: graph.optionValues,
    variants: graph.variants,
    ...(graph.catalogVariants ? { catalogVariants: graph.catalogVariants } : {}),
  });
  if (!combinations.ok) {
    issues.push(...combinations.issues);
  }
  const listingPrice = deriveVariantListingPrice(graph.product.id, graph.variants);
  if (!listingPrice.ok) {
    issues.push(...listingPrice.issues);
  }
  if (issues.length > 0 || !listingPrice.ok) {
    return { eligible: false, issues };
  }
  return {
    eligible: true,
    listingPrice: listingPrice.value,
    eligibleVariantIds: graph.variants
      .filter(
        (variant) =>
          variant.productId === graph.product.id &&
          variant.isActive &&
          variant.isAvailable,
      )
      .map((variant) => variant.id),
  };
}
