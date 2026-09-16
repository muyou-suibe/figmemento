import type { ProductCustomizationSummaryModel } from "./product-customization-summary.ts";
import type { SafeCartCustomizationRow, SafeCartCustomizationSummary } from "../domain/shopping-cart.ts";

/**
 * Narrows the existing customization summary for a Cart response. Render
 * identities and image metadata are intentionally dropped at this boundary.
 */
export function toSafeCartCustomizationSummary(
  summary: ProductCustomizationSummaryModel,
): SafeCartCustomizationSummary {
  return {
    configuration: {
      sku: summary.configuration.sku,
      options: summary.configuration.options.map(({ label, value }) => ({ label, value })),
      needsReview: summary.configuration.needsReview,
    },
    personalization: {
      status: summary.personalization.status,
      rows: summary.personalization.rows.map((row): SafeCartCustomizationRow => {
        if (row.kind === "image") {
          return {
            kind: "image",
            label: row.label,
            state: row.state,
            imageCount: row.images.length,
          };
        }
        return {
          kind: row.kind,
          label: row.label,
          state: row.state,
          ...(row.value !== undefined ? { value: row.value } : {}),
        };
      }),
    },
  };
}
