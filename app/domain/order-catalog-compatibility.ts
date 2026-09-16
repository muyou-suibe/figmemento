import { parseCustomization, type Customization } from "./customization.ts";
import {
  parseSelectedOptions,
  type SelectedOptionValue,
} from "./catalog/variant.ts";
import {
  isIdentifier,
  isRecord,
  isSkuCode,
  isSlug,
  unknownFieldIssues,
} from "./catalog/validation.ts";

type CatalogOrderRequestItemCommon = {
  quantity?: number;
  /** Customization remains a separate sibling payload, not catalog identity. */
  customization?: Customization;
};

export type NativeCatalogOrderItemIdentity = {
  productId: string;
  variantId: string;
  skuCode: string;
  selectedOptions: readonly SelectedOptionValue[];
  slug?: string;
};

export type LegacyProductOrderItemIdentity = {
  slug: string;
  productId?: never;
  variantId?: never;
  skuCode?: never;
  selectedOptions?: never;
};

export type NativeCatalogOrderRequestItem = CatalogOrderRequestItemCommon &
  NativeCatalogOrderItemIdentity;

export type LegacyProductOrderRequestItem = CatalogOrderRequestItemCommon &
  LegacyProductOrderItemIdentity;

export type CatalogOrderRequestItem =
  | NativeCatalogOrderRequestItem
  | LegacyProductOrderRequestItem;

/**
 * Parse only the native Catalog identity and the temporary legacy slug shape.
 * Normalized customization requests are intentionally owned by the shared
 * order-request boundary and are not accepted by this Catalog compatibility
 * boundary.
 */
export function parseCatalogOrderRequestItem(
  value: unknown,
): CatalogOrderRequestItem | null {
  if (!isRecord(value)) return null;
  if (unknownFieldIssues(value, [
    "slug",
    "productId",
    "variantId",
    "skuCode",
    "selectedOptions",
    "quantity",
    "customization",
  ]).length > 0) return null;
  if (value.quantity !== undefined && typeof value.quantity !== "number") return null;

  const customization = value.customization === undefined
    ? undefined
    : parseCustomization(value.customization);
  if (value.customization !== undefined && !customization) return null;

  const common: CatalogOrderRequestItemCommon = {
    quantity: value.quantity,
    customization: customization ?? undefined,
  };
  const hasNativeCatalogIdentity = ["productId", "variantId", "skuCode", "selectedOptions"]
    .some((field) => Object.hasOwn(value, field));

  if (hasNativeCatalogIdentity) {
    if (
      !isIdentifier(value.productId)
      || !isIdentifier(value.variantId)
      || !isSkuCode(value.skuCode)
    ) return null;
    const selectedOptions = parseSelectedOptions(value.selectedOptions);
    if (!selectedOptions.ok) return null;
    if (value.slug !== undefined && !isSlug(value.slug)) return null;
    return {
      ...common,
      productId: value.productId,
      variantId: value.variantId,
      skuCode: value.skuCode,
      selectedOptions: selectedOptions.value,
      ...(value.slug === undefined ? {} : { slug: value.slug }),
    };
  }

  if (!isSlug(value.slug)) return null;
  return { ...common, slug: value.slug };
}

/**
 * Deprecated transport compatibility only. Browser price and currency are
 * deliberately dropped before the Catalog adapter resolves authoritative data.
 */
export function parseDeprecatedLegacyProductOrderItem(
  value: unknown,
): LegacyProductOrderRequestItem | null {
  if (!isRecord(value)) return null;
  if (unknownFieldIssues(value, [
    "slug",
    "quantity",
    "customization",
    "price",
    "priceCents",
    "currency",
  ]).length > 0) return null;
  const parsed = parseCatalogOrderRequestItem({
    slug: value.slug,
    quantity: value.quantity,
    customization: value.customization,
  });
  return parsed && isLegacyProductOrderRequestItem(parsed) ? parsed : null;
}

export function isCatalogOrderRequestItem(
  value: unknown,
): value is CatalogOrderRequestItem {
  return isRecord(value)
    && !Object.hasOwn(value, "configurationRevision")
    && !Object.hasOwn(value, "customizationValues")
    && (Object.hasOwn(value, "productId") || Object.hasOwn(value, "slug"));
}

export function isLegacyProductOrderRequestItem(
  item: CatalogOrderRequestItem,
): item is LegacyProductOrderRequestItem {
  return !Object.hasOwn(item, "productId");
}
