import type {
  CatalogRepositoryResult,
  PublicCatalogProductDetail,
  PublicCatalogReadRepository,
} from "./catalog-repository.ts";
import {
  canonicalVariantSignature,
  evaluatePublicEligibility,
  parseProductVariant,
  resolveAuthoritativeVariantPrice,
  type CatalogCurrency,
  type SelectedOptionValue,
} from "../domain/catalog/index.ts";
import type { Customization } from "../domain/customization.ts";
import type { NativeCatalogOrderRequestItem } from "../domain/order-catalog-compatibility.ts";

export interface ResolvedOrderCatalogItem {
  productId: string;
  productName: string;
  productSlug: string;
  variantId: string;
  skuCode: string;
  selectedOptions: readonly SelectedOptionValue[];
  unitBasePriceCents: number;
  currency: CatalogCurrency;
  fulfillmentType: "physical" | "digital";
  quantity: number;
  customization?: Customization;
}

export type OrderCatalogResolutionRejection =
  | "product_not_found"
  | "product_not_eligible"
  | "variant_not_found"
  | "variant_mismatch"
  | "variant_unavailable"
  | "sku_mismatch"
  | "selected_options_mismatch"
  | "invalid_quantity"
  | "invalid_catalog_configuration"
  | "catalog_source_failure";

export type OrderCatalogResolutionResult =
  | { status: "resolved"; items: readonly ResolvedOrderCatalogItem[] }
  | { status: "rejected"; reason: OrderCatalogResolutionRejection };

type OrderCatalogRepository = Pick<PublicCatalogReadRepository, "findPublicProductById">;

function mapProductFailure(
  result: Exclude<CatalogRepositoryResult<PublicCatalogProductDetail>, { status: "found" }>,
): OrderCatalogResolutionRejection {
  if (result.status === "source_failure") return "catalog_source_failure";
  if (result.status === "invalid_configuration") return "invalid_catalog_configuration";
  return result.status === "not_found" ? "product_not_found" : "product_not_eligible";
}

function normalizeOrderQuantity(value: number | undefined): number | null {
  const requested = value ?? 1;
  if (!Number.isFinite(requested)) return null;
  return Math.min(Math.max(Math.floor(requested), 1), 20);
}

function selectionsMatch(
  requested: readonly SelectedOptionValue[],
  authoritative: readonly SelectedOptionValue[],
): boolean {
  return requested.length === authoritative.length
    && canonicalVariantSignature(requested) === canonicalVariantSignature(authoritative);
}

async function resolveOrderCatalogItem(
  item: NativeCatalogOrderRequestItem,
  repository: OrderCatalogRepository,
): Promise<OrderCatalogResolutionResult> {
  let productResult: CatalogRepositoryResult<PublicCatalogProductDetail>;
  try {
    productResult = await repository.findPublicProductById(item.productId);
  } catch {
    return { status: "rejected", reason: "catalog_source_failure" };
  }
  if (productResult.status !== "found") {
    return { status: "rejected", reason: mapProductFailure(productResult) };
  }

  const detail = productResult.value;
  if (detail.product.id !== item.productId || (item.slug !== undefined && detail.product.slug !== item.slug)) {
    return { status: "rejected", reason: "invalid_catalog_configuration" };
  }
  const eligibility = evaluatePublicEligibility({
    category: detail.category,
    product: detail.product,
    fulfillment: detail.fulfillment,
    options: detail.options,
    optionValues: detail.optionValues,
    variants: detail.variants,
  });
  if (!eligibility.eligible) {
    return {
      status: "rejected",
      reason: eligibility.issues.every((issue) => issue.code === "unavailable")
        ? "product_not_eligible"
        : "invalid_catalog_configuration",
    };
  }

  const matches = detail.variants.filter((variant) => variant.id === item.variantId);
  if (matches.length === 0) return { status: "rejected", reason: "variant_not_found" };
  if (matches.length !== 1) return { status: "rejected", reason: "invalid_catalog_configuration" };
  const parsedVariant = parseProductVariant(matches[0]);
  if (!parsedVariant.ok) return { status: "rejected", reason: "invalid_catalog_configuration" };
  const variant = parsedVariant.value;
  if (variant.productId !== item.productId) {
    return { status: "rejected", reason: "variant_mismatch" };
  }
  if (!variant.isActive || !variant.isAvailable || !eligibility.eligibleVariantIds.includes(variant.id)) {
    return { status: "rejected", reason: "variant_unavailable" };
  }
  if (variant.skuCode !== item.skuCode) {
    return { status: "rejected", reason: "sku_mismatch" };
  }
  if (!selectionsMatch(item.selectedOptions, variant.selectedOptions)) {
    return { status: "rejected", reason: "selected_options_mismatch" };
  }
  const authoritativePrice = resolveAuthoritativeVariantPrice({
    productId: item.productId,
    variantId: item.variantId,
  }, detail.variants);
  if (!authoritativePrice.ok) {
    return {
      status: "rejected",
      reason: authoritativePrice.issues.every((issue) => issue.code === "unavailable")
        ? "variant_unavailable"
        : "invalid_catalog_configuration",
    };
  }
  const quantity = normalizeOrderQuantity(item.quantity);
  if (quantity === null) return { status: "rejected", reason: "invalid_quantity" };

  return {
    status: "resolved",
    items: [{
      productId: detail.product.id,
      productName: detail.product.name,
      productSlug: detail.product.slug,
      variantId: variant.id,
      skuCode: variant.skuCode,
      selectedOptions: variant.selectedOptions.map((selection) => ({ ...selection })),
      unitBasePriceCents: authoritativePrice.value.priceCents,
      currency: authoritativePrice.value.currency,
      fulfillmentType: detail.fulfillment.fulfillmentType,
      quantity,
      customization: item.customization,
    }],
  };
}

export async function resolveOrderCatalogItems(
  items: readonly NativeCatalogOrderRequestItem[],
  repository: OrderCatalogRepository,
): Promise<OrderCatalogResolutionResult> {
  const resolvedItems: ResolvedOrderCatalogItem[] = [];
  for (const item of items) {
    const result = await resolveOrderCatalogItem(item, repository);
    if (result.status !== "resolved") return result;
    resolvedItems.push(...result.items);
  }
  return { status: "resolved", items: resolvedItems };
}

export function calculateResolvedOrderSubtotal(
  items: readonly ResolvedOrderCatalogItem[],
): number {
  return items.reduce(
    (sum, item) => sum + item.unitBasePriceCents * item.quantity,
    0,
  );
}
