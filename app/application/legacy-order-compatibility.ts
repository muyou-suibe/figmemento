import type {
  CatalogRepositoryResult,
  PublicCatalogProductDetail,
  PublicCatalogReadRepository,
} from "./catalog-repository.ts";
import {
  evaluatePublicEligibility,
  parseProductVariant,
} from "../domain/catalog/index.ts";
import {
  isCatalogOrderRequestItem,
  isLegacyProductOrderRequestItem,
  type NativeCatalogOrderRequestItem,
  type CatalogOrderRequestItem,
} from "../domain/order-catalog-compatibility.ts";

export type LegacyOrderCompatibilityRejection =
  | "product_not_found"
  | "product_not_eligible"
  | "default_variant_missing"
  | "default_variant_ambiguous"
  | "default_variant_unavailable"
  | "invalid_catalog_configuration"
  | "catalog_source_failure";

export type LegacyOrderCompatibilityResult =
  | { status: "resolved"; item: NativeCatalogOrderRequestItem }
  | { status: "rejected"; reason: LegacyOrderCompatibilityRejection };

type LegacyCatalogRepository = Pick<
  PublicCatalogReadRepository,
  "findPublicProductBySlug"
>;

function mapCatalogFailure(
  result: Exclude<CatalogRepositoryResult<PublicCatalogProductDetail>, { status: "found" }>,
): LegacyOrderCompatibilityResult {
  if (result.status === "source_failure") {
    return { status: "rejected", reason: "catalog_source_failure" };
  }
  if (result.status === "invalid_configuration") {
    return { status: "rejected", reason: "invalid_catalog_configuration" };
  }
  return {
    status: "rejected",
    reason: result.status === "not_found" ? "product_not_found" : "product_not_eligible",
  };
}

// C1 transitional compatibility debt: convert a legacy Product slug to one exact
// eligible default Variant. Native requests bypass this adapter. The later
// cart/order change removes the slug-only path entirely.
export async function resolveLegacyOrderItemCompatibility(
  item: CatalogOrderRequestItem,
  repository: LegacyCatalogRepository,
): Promise<LegacyOrderCompatibilityResult> {
  // The normalized request family has a separate acceptance seam. It must
  // never be reinterpreted as a legacy slug/native order item here.
  if (!isCatalogOrderRequestItem(item)) {
    return { status: "rejected", reason: "invalid_catalog_configuration" };
  }
  if (!isLegacyProductOrderRequestItem(item)) {
    return { status: "resolved", item };
  }

  let resolved: CatalogRepositoryResult<PublicCatalogProductDetail>;
  try {
    resolved = await repository.findPublicProductBySlug(item.slug);
  } catch {
    return { status: "rejected", reason: "catalog_source_failure" };
  }
  if (resolved.status !== "found") return mapCatalogFailure(resolved);
  if (resolved.value.product.slug !== item.slug) {
    return { status: "rejected", reason: "invalid_catalog_configuration" };
  }

  const eligibility = evaluatePublicEligibility({
    category: resolved.value.category,
    product: resolved.value.product,
    fulfillment: resolved.value.fulfillment,
    options: resolved.value.options,
    optionValues: resolved.value.optionValues,
    variants: resolved.value.variants,
  });
  if (!eligibility.eligible) {
    return { status: "rejected", reason: "product_not_eligible" };
  }

  const defaults = resolved.value.variants.filter((variant) => variant.isDefault);
  if (defaults.length === 0) {
    return { status: "rejected", reason: "default_variant_missing" };
  }
  if (defaults.length !== 1) {
    return { status: "rejected", reason: "default_variant_ambiguous" };
  }
  const parsedDefault = parseProductVariant(defaults[0]);
  if (!parsedDefault.ok || parsedDefault.value.productId !== resolved.value.product.id) {
    return { status: "rejected", reason: "invalid_catalog_configuration" };
  }
  const defaultVariant = parsedDefault.value;
  if (
    !defaultVariant.isActive
    || !defaultVariant.isAvailable
    || !eligibility.eligibleVariantIds.includes(defaultVariant.id)
  ) {
    return { status: "rejected", reason: "default_variant_unavailable" };
  }

  return {
    status: "resolved",
    item: {
      productId: resolved.value.product.id,
      variantId: defaultVariant.id,
      skuCode: defaultVariant.skuCode,
      selectedOptions: defaultVariant.selectedOptions.map((selection) => ({ ...selection })),
      // Retained only so the pre-7.3 order route can continue its current slug-based
      // behavior. It is not used to choose the Variant and is not the purchase identity.
      slug: item.slug,
      quantity: item.quantity,
      customization: item.customization,
    },
  };
}
