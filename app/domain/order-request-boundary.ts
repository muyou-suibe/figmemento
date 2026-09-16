import {
  isCatalogOrderRequestItem,
  isLegacyProductOrderRequestItem as isLegacyCatalogOrderRequestItem,
  parseCatalogOrderRequestItem,
  type CatalogOrderRequestItem,
  type LegacyProductOrderRequestItem,
} from "./order-catalog-compatibility.ts";
import {
  parseConfiguredItemHandoff,
  type ConfiguredItemHandoff,
} from "./configured-item.ts";
import type { SelectedOptionValue } from "./catalog/variant.ts";
import type { CustomizationValues } from "./customization-value.ts";
import { isRecord, unknownFieldIssues } from "./catalog/validation.ts";

/**
 * The normalized customization request family. It carries only the same
 * Product/Variant/Customization authority claims as ConfiguredItemHandoff;
 * quantity remains an order concern and the legacy `customization` sibling is
 * deliberately absent.
 */
export type NormalizedCustomizationOrderRequestItem = {
  productId: string;
  variantId: string;
  skuCode: string;
  selectedOptions: readonly SelectedOptionValue[];
  slug?: never;
  quantity?: number;
  customization?: never;
  configurationRevision: string;
  customizationValues: CustomizationValues;
};

export type OrderRequestItem =
  | CatalogOrderRequestItem
  | NormalizedCustomizationOrderRequestItem;

/** A marker is enough to commit the payload to the normalized parser. */
export function isNormalizedCustomizationOrderRequestItem(value: unknown): boolean {
  return isRecord(value)
    && (Object.hasOwn(value, "configurationRevision") || Object.hasOwn(value, "customizationValues"));
}

function parseNormalizedCustomizationOrderRequestItem(
  value: Record<string, unknown>,
): NormalizedCustomizationOrderRequestItem | null {
  if (unknownFieldIssues(value, [
    "productId",
    "variantId",
    "skuCode",
    "selectedOptions",
    "quantity",
    "configurationRevision",
    "customizationValues",
  ]).length > 0) return null;
  if (value.quantity !== undefined && typeof value.quantity !== "number") return null;

  // Strictly reject unknown request authority before constructing the handoff
  // input. The handoff parser remains the one customization-value parser.
  const handoff: ConfiguredItemHandoff = {
    productId: value.productId as string,
    variantId: value.variantId as string,
    skuCode: value.skuCode as string,
    selectedOptions: value.selectedOptions as readonly SelectedOptionValue[],
    configurationRevision: value.configurationRevision as string,
    customizationValues: value.customizationValues as CustomizationValues,
  };
  const parsedHandoff = parseConfiguredItemHandoff(handoff);
  if (!parsedHandoff.ok) return null;

  return {
    ...parsedHandoff.value,
    ...(value.quantity === undefined ? {} : { quantity: value.quantity }),
  };
}

export function parseOrderRequestItem(value: unknown): OrderRequestItem | null {
  if (!isRecord(value)) return null;
  // Once either normalized marker is present, malformed input must not be
  // downgraded into a legacy slug/customization request.
  if (isNormalizedCustomizationOrderRequestItem(value)) {
    return parseNormalizedCustomizationOrderRequestItem(value);
  }
  return parseCatalogOrderRequestItem(value);
}

/**
 * Shared request discrimination delegates Catalog-specific legacy identity
 * rules to the Catalog compatibility owner without duplicating validation.
 */
export function isLegacyProductOrderRequestItem(
  item: OrderRequestItem,
): item is LegacyProductOrderRequestItem {
  return isCatalogOrderRequestItem(item) && isLegacyCatalogOrderRequestItem(item);
}

export function isNormalizedOrderRequestItem(
  item: OrderRequestItem,
): item is NormalizedCustomizationOrderRequestItem {
  return "configurationRevision" in item && "customizationValues" in item;
}

/**
 * Pure conversion for the normalized request boundary. Quantity is not part
 * of ConfiguredItemHandoff and is therefore intentionally not copied here.
 */
export function normalizedOrderRequestItemToConfiguredItemHandoff(
  item: NormalizedCustomizationOrderRequestItem,
): ConfiguredItemHandoff {
  return {
    productId: item.productId,
    variantId: item.variantId,
    skuCode: item.skuCode,
    selectedOptions: item.selectedOptions.map((selection) => ({ ...selection })),
    configurationRevision: item.configurationRevision,
    customizationValues: item.customizationValues.map((value) =>
      value.kind === "image"
        ? {
            ...value,
            images: value.images.map((image) => ({
              ...image,
              ...(image.crop === undefined ? {} : { crop: { ...image.crop } }),
            })),
          }
        : { ...value },
    ),
  };
}

export type {
  CatalogOrderRequestItem,
  LegacyProductOrderRequestItem,
} from "./order-catalog-compatibility.ts";
