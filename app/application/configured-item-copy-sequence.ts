import type { ConfiguredItemHandoff } from "../domain/configured-item.ts";

function cloneSelectedOptions(
  selectedOptions: ConfiguredItemHandoff["selectedOptions"],
): ConfiguredItemHandoff["selectedOptions"] {
  return selectedOptions.map((selection) => ({ ...selection }));
}

function cloneCustomizationValues(
  values: ConfiguredItemHandoff["customizationValues"],
): ConfiguredItemHandoff["customizationValues"] {
  return values.map((value) => {
    if (value.kind !== "image") return { ...value };
    return {
      ...value,
      images: value.images.map((image) => ({
        ...image,
        ...(image.crop ? { crop: { ...image.crop } } : {}),
      })),
    };
  });
}

/**
 * Preserves an already accepted sequence of configured items as independent
 * in-memory payloads. Authority and acceptance belong to the preceding
 * server boundary; this operation only copies structure and order.
 */
export function preserveConfiguredItemCopies(
  handoffs: readonly ConfiguredItemHandoff[],
): readonly ConfiguredItemHandoff[] {
  return handoffs.map((handoff) => ({
    productId: handoff.productId,
    variantId: handoff.variantId,
    skuCode: handoff.skuCode,
    selectedOptions: cloneSelectedOptions(handoff.selectedOptions),
    configurationRevision: handoff.configurationRevision,
    customizationValues: cloneCustomizationValues(handoff.customizationValues),
  }));
}
