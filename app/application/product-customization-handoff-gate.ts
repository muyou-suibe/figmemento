import {
  resolveVariantSelection,
  type PublicSelectorVariant,
} from "./catalog-storefront.ts";
import type { ProductOption, ProductOptionValue } from "../domain/catalog/variant.ts";
import {
  parseConfiguredItemHandoff,
  type ConfiguredItemHandoff,
} from "../domain/configured-item.ts";
import type { CustomizationField } from "../domain/customization-field.ts";
import {
  evaluateProductCustomizationDraft,
  type ProductCustomizationDraft,
  type ProductCustomizationDraftIssue,
} from "../domain/product-customization-draft.ts";
import type { CustomerUploadTimestamp } from "../domain/customer-upload.ts";

export type ProductCustomizationHandoffBlockReason =
  | "empty"
  | "incomplete"
  | "variant_incomplete"
  | "variant_unavailable"
  | "variant_invalid"
  | "variant_mismatch"
  | "upload_pending"
  | "upload_failed"
  | "expired"
  | "stale_configuration"
  | "invalid";

export type ProductCustomizationHandoffGateResult =
  | {
      readonly status: "blocked";
      readonly reason: ProductCustomizationHandoffBlockReason;
      readonly message: string;
      readonly issues: readonly ProductCustomizationDraftIssue[];
    }
  | {
      readonly status: "locally_ready";
      readonly handoff: ConfiguredItemHandoff;
      /** Task 8.1 must re-resolve all server authorities before acceptance. */
      readonly requiresServerVerification: true;
    };

function hasIssue(
  issues: readonly ProductCustomizationDraftIssue[],
  code: ProductCustomizationDraftIssue["code"],
): boolean {
  return issues.some((issue) => issue.code === code);
}

function blocked(
  reason: ProductCustomizationHandoffBlockReason,
  message: string,
  issues: readonly ProductCustomizationDraftIssue[],
): ProductCustomizationHandoffGateResult {
  return { status: "blocked", reason, message, issues };
}

/**
 * Evaluates browser-local eligibility only. Locally accepted receipt metadata
 * is not ownership proof: Task 8.1 must verify current ownership and every
 * other server authority before accepting this handoff.
 */
export function evaluateProductCustomizationHandoff(input: {
  readonly draft: ProductCustomizationDraft;
  readonly productId: string;
  readonly configurationRevision: string;
  readonly fields: readonly CustomizationField[];
  readonly options: readonly ProductOption[];
  readonly optionValues: readonly ProductOptionValue[];
  readonly variants: readonly PublicSelectorVariant[];
  readonly observedAt: CustomerUploadTimestamp;
}): ProductCustomizationHandoffGateResult {
  const evaluation = evaluateProductCustomizationDraft(
    input.draft,
    {
      productId: input.productId,
      configurationRevision: input.configurationRevision,
      fields: input.fields,
    },
    input.observedAt,
  );

  if (evaluation.state === "empty") {
    return blocked(
      "empty",
      "Choose your product options and complete the personalization fields.",
      evaluation.issues,
    );
  }
  if (evaluation.state === "expired") {
    return blocked(
      "expired",
      input.draft.signals.ownerContextExpired
        ? "Your upload session expired. Re-upload your images before continuing."
        : "Your upload session or image expired. Re-upload the affected image before continuing.",
      evaluation.issues,
    );
  }
  if (evaluation.state === "upload_pending") {
    return blocked("upload_pending", "Wait for the current image upload to finish.", evaluation.issues);
  }
  if (hasIssue(evaluation.issues, "stale_configuration")) {
    return blocked(
      "stale_configuration",
      "Personalization requirements changed. Review the current requirements before continuing.",
      evaluation.issues,
    );
  }
  if (hasIssue(evaluation.issues, "upload_failed")) {
    return blocked("upload_failed", "Retry the failed image upload or remove that image.", evaluation.issues);
  }

  const resolution = resolveVariantSelection({
    productId: input.productId,
    options: input.options,
    optionValues: input.optionValues,
    variants: input.variants,
    selectedOptions: input.draft.selectedOptions,
  });
  if (resolution.status === "incomplete") {
    return blocked(
      "variant_incomplete",
      "Choose all required product options to resolve an available SKU.",
      evaluation.issues,
    );
  }
  if (resolution.status === "unavailable") {
    return blocked("variant_unavailable", "Choose a different product option combination.", evaluation.issues);
  }
  if (resolution.status === "invalid") {
    return blocked("variant_invalid", "Review your product option selections.", evaluation.issues);
  }
  if (
    input.draft.selectedVariant === null
    || input.draft.selectedVariant.variantId !== resolution.variant.id
    || input.draft.selectedVariant.skuCode !== resolution.variant.skuCode
  ) {
    return blocked("variant_mismatch", "Review your product options to resolve the current SKU.", evaluation.issues);
  }
  if (evaluation.state === "editing") {
    return blocked("incomplete", "Complete the remaining personalization requirements.", evaluation.issues);
  }
  if (evaluation.state !== "ready" || !evaluation.normalizedValues) {
    return blocked("invalid", "Review the personalization requirements and correct the highlighted input.", evaluation.issues);
  }

  const parsed = parseConfiguredItemHandoff({
    productId: input.draft.productId,
    variantId: resolution.variant.id,
    skuCode: resolution.variant.skuCode,
    selectedOptions: input.draft.selectedOptions,
    configurationRevision: input.draft.configurationRevision,
    customizationValues: evaluation.normalizedValues,
  });
  if (!parsed.ok) {
    return blocked("invalid", "Review the personalization requirements and correct the highlighted input.", evaluation.issues);
  }
  return {
    status: "locally_ready",
    handoff: parsed.value,
    requiresServerVerification: true,
  };
}
