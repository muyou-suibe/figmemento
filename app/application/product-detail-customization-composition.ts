import type {
  ResolvedVariantSelectionPayload,
  VariantSelectionResult,
} from "./catalog-storefront.ts";
import {
  createProductCustomizationDraft,
  reduceProductCustomizationDraft,
  type ProductCustomizationDraft,
  type ProductCustomizationDraftAction,
} from "../domain/product-customization-draft.ts";
import type { SelectedOptionValue } from "../domain/catalog/variant.ts";

/**
 * Catalog-only event emitted by VariantSelector. It always carries the
 * shopper's current SKU-option selections, while `resolved` is present only
 * when the catalog resolver found one eligible Variant/SKU.
 */
export interface ProductDetailVariantSelectionEvent {
  readonly selectedOptions: readonly SelectedOptionValue[];
  readonly resolved: ResolvedVariantSelectionPayload | null;
}

function cloneSelectedOptions(
  selectedOptions: readonly SelectedOptionValue[],
): readonly SelectedOptionValue[] {
  return selectedOptions.map((selection) => ({
    optionId: selection.optionId,
    valueId: selection.valueId,
  }));
}

export function createProductDetailVariantSelectionEvent(
  selectedOptions: readonly SelectedOptionValue[],
  resolution: VariantSelectionResult,
): ProductDetailVariantSelectionEvent {
  return {
    selectedOptions: cloneSelectedOptions(selectedOptions),
    resolved: resolution.status === "resolved"
      ? {
          productId: resolution.payload.productId,
          variantId: resolution.payload.variantId,
          skuCode: resolution.payload.skuCode,
          selectedOptions: cloneSelectedOptions(resolution.payload.selectedOptions),
        }
      : null,
  };
}

/**
 * Initializes only an absent local draft when this Product gains an approved
 * customization configuration. An existing draft is intentionally retained so
 * a newer configuration revision is visibly stale instead of silently rebased.
 */
export function initializeProductCustomizationDraftForConfiguration(
  current: ProductCustomizationDraft | null,
  input: {
    readonly productId: string;
    readonly configurationRevision: string;
    readonly variantSelection?: ProductDetailVariantSelectionEvent | null;
  },
): ProductCustomizationDraft {
  if (current) return current;
  const draft = createProductCustomizationDraft({
    productId: input.productId,
    configurationRevision: input.configurationRevision,
  });
  return input.variantSelection
    ? applyVariantSelectionToProductCustomizationDraft(draft, input.variantSelection)
    : draft;
}

/**
 * Event-time lazy initialization for the mounted Product-detail parent. The
 * missing draft is created from the current authority, the latest catalog
 * selection is seeded, and the first customization action is applied before
 * the caller persists the returned value into React state.
 */
export function applyProductCustomizationActionForConfiguration(
  current: ProductCustomizationDraft | null,
  input: {
    readonly productId: string;
    readonly configurationRevision: string;
    readonly variantSelection?: ProductDetailVariantSelectionEvent | null;
    readonly action: ProductCustomizationDraftAction;
  },
): ProductCustomizationDraft {
  const base = initializeProductCustomizationDraftForConfiguration(current, input);
  return reduceProductCustomizationDraft(base, input.action);
}

/**
 * The Product-detail parent is the only place where catalog selection is
 * composed with an existing customization draft. Customer values never enter
 * the catalog resolver, and Variant changes never clear customer values.
 */
export function applyVariantSelectionToProductCustomizationDraft(
  draft: ProductCustomizationDraft,
  event: ProductDetailVariantSelectionEvent,
): ProductCustomizationDraft {
  const withSelectedOptions = reduceProductCustomizationDraft(draft, {
    type: "set_selected_options",
    selectedOptions: event.selectedOptions,
  });
  const resolved = event.resolved?.productId === draft.productId ? event.resolved : null;
  return reduceProductCustomizationDraft(withSelectedOptions, {
    type: "set_variant_selection",
    selection: resolved
      ? { variantId: resolved.variantId, skuCode: resolved.skuCode }
      : null,
  });
}
