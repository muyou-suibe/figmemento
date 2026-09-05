import type {
  PublicCatalogProductSummary,
} from "./catalog-repository.ts";
import type {
  ListingPrice,
  ProductOption,
  ProductOptionValue,
  ProductVariant,
  SelectedOptionValue,
} from "../domain/catalog/index.ts";
import { canonicalVariantSignature } from "../domain/catalog/index.ts";

export interface CatalogFilterInput {
  query?: string;
  categoryId?: string;
}

export function filterCatalogProducts(
  products: readonly PublicCatalogProductSummary[],
  input: CatalogFilterInput,
): readonly PublicCatalogProductSummary[] {
  const query = input.query?.trim().toLocaleLowerCase("en-US") ?? "";
  return products
    .filter((item) => {
      if (input.categoryId && item.product.categoryId !== input.categoryId) return false;
      if (!query) return true;
      return [
        item.product.name,
        item.product.description,
        item.category.name,
      ].some((value) => value.toLocaleLowerCase("en-US").includes(query));
    })
    .sort(
      (left, right) =>
        left.product.name.localeCompare(right.product.name, "en-US") ||
        left.product.slug.localeCompare(right.product.slug, "en-US") ||
        left.product.id.localeCompare(right.product.id, "en-US"),
    );
}

export function formatUsdPrice(priceCents: number): string {
  return formatCurrencyCents(priceCents, "USD");
}

/** Presentation-only formatter; it never converts amounts or changes authority. */
export function formatCurrencyCents(priceCents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(priceCents / 100);
}

export function formatListingPrice(price: ListingPrice): string {
  return price.kind === "single"
    ? formatCurrencyCents(price.priceCents, price.currency)
    : `From ${formatCurrencyCents(price.minPriceCents, price.currency)}`;
}

export interface ResolvedVariantSelectionPayload {
  productId: string;
  variantId: string;
  skuCode: string;
  selectedOptions: readonly SelectedOptionValue[];
}

export interface PublicSelectorVariant {
  id: string;
  productId: string;
  skuCode: string;
  priceCents: number;
  currency: "USD";
  isActive: boolean;
  isAvailable: boolean;
  selectedOptions: readonly SelectedOptionValue[];
}

export function toPublicSelectorVariants(
  variants: readonly ProductVariant[],
): readonly PublicSelectorVariant[] {
  return variants.map((variant) => ({
    id: variant.id,
    productId: variant.productId,
    skuCode: variant.skuCode,
    priceCents: variant.priceCents,
    currency: variant.currency,
    isActive: variant.isActive,
    isAvailable: variant.isAvailable,
    selectedOptions: variant.selectedOptions.map((selection) => ({ ...selection })),
  }));
}

export type VariantSelectionResult =
  | { status: "incomplete"; missingOptionIds: readonly string[] }
  | { status: "invalid" }
  | { status: "unavailable" }
  | {
      status: "resolved";
      variant: PublicSelectorVariant;
      payload: ResolvedVariantSelectionPayload;
    };

export interface VariantSelectionInput {
  productId: string;
  options: readonly ProductOption[];
  optionValues: readonly ProductOptionValue[];
  variants: readonly PublicSelectorVariant[];
  selectedOptions: readonly SelectedOptionValue[];
}

function validateSelectionOwnership(input: VariantSelectionInput): boolean {
  if (
    input.options.some((option) => option.productId !== input.productId) ||
    input.optionValues.some((value) => value.productId !== input.productId) ||
    input.variants.some((variant) => variant.productId !== input.productId)
  ) {
    return false;
  }

  const options = new Map(input.options.map((option) => [option.id, option]));
  const values = new Map(input.optionValues.map((value) => [value.id, value]));
  const selectedOptionIds = new Set<string>();
  for (const selection of input.selectedOptions) {
    if (selectedOptionIds.has(selection.optionId)) return false;
    selectedOptionIds.add(selection.optionId);
    const option = options.get(selection.optionId);
    const value = values.get(selection.valueId);
    if (
      !option ||
      !value ||
      value.optionId !== option.id ||
      option.productId !== input.productId ||
      value.productId !== input.productId
    ) {
      return false;
    }
  }
  return true;
}

export function resolveVariantSelection(
  input: VariantSelectionInput,
): VariantSelectionResult {
  if (!validateSelectionOwnership(input)) return { status: "invalid" };

  const selectedIds = new Set(input.selectedOptions.map((selection) => selection.optionId));
  const missingOptionIds = input.options
    .filter((option) => option.required && !selectedIds.has(option.id))
    .map((option) => option.id);
  if (missingOptionIds.length > 0) {
    return { status: "incomplete", missingOptionIds };
  }

  const signature = canonicalVariantSignature(input.selectedOptions);
  const allCombinationMatches = input.variants.filter(
    (variant) => canonicalVariantSignature(variant.selectedOptions) === signature,
  );
  const eligibleMatches = allCombinationMatches.filter(
    (variant) => variant.isActive && variant.isAvailable,
  );

  if (eligibleMatches.length === 0) {
    return allCombinationMatches.length > 0
      ? { status: "unavailable" }
      : { status: "invalid" };
  }
  if (eligibleMatches.length !== 1) return { status: "invalid" };

  const variant = eligibleMatches[0];
  return {
    status: "resolved",
    variant,
    payload: {
      productId: input.productId,
      variantId: variant.id,
      skuCode: variant.skuCode,
      selectedOptions: [...variant.selectedOptions].sort((left, right) =>
        left.optionId.localeCompare(right.optionId),
      ),
    },
  };
}

export function canSelectOptionValue(
  input: Omit<VariantSelectionInput, "selectedOptions">,
  selectedOptions: readonly SelectedOptionValue[],
  candidate: SelectedOptionValue,
): boolean {
  const nextSelections = [
    ...selectedOptions.filter((selection) => selection.optionId !== candidate.optionId),
    candidate,
  ];
  if (!validateSelectionOwnership({ ...input, selectedOptions: nextSelections })) return false;

  return input.variants.some(
    (variant) =>
      variant.isActive &&
      variant.isAvailable &&
      nextSelections.every((selection) =>
        variant.selectedOptions.some(
          (variantSelection) =>
            variantSelection.optionId === selection.optionId &&
            variantSelection.valueId === selection.valueId,
        ),
      ),
  );
}
