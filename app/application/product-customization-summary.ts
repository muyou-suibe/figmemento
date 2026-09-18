import { normalizeCustomizationValue } from "../domain/customization-validation.ts";
import type { ProductOption, ProductOptionValue } from "../domain/catalog/variant.ts";
import type { CustomizationField } from "../domain/customization-field.ts";
import type { ProductCustomizationDraft } from "../domain/product-customization-draft.ts";
import type { CustomizationCropRegion, CustomizationValue } from "../domain/customization-value.ts";

export interface ProductCustomizationSummaryOption {
  /** Stable internal render identity; never shown to the customer. */
  readonly renderKey: string;
  readonly label: string;
  readonly value: string;
}

export interface ProductCustomizationSummaryCrop {
  readonly left: string;
  readonly top: string;
  readonly width: string;
  readonly height: string;
}

export interface ProductCustomizationSummaryImage {
  /** Stable position identity only; opaque receipt identity is deliberately excluded. */
  readonly renderKey: string;
  readonly label: string;
  readonly state: "available" | "needs_review";
  readonly filename?: string;
  readonly metadata?: string;
  readonly crop?: ProductCustomizationSummaryCrop;
}

export type ProductCustomizationSummaryRow =
  | {
      /** Stable internal field identity; never shown to the customer. */
      readonly renderKey: string;
      readonly kind: "short_text" | "long_text" | "single_select" | "multi_select" | "numeric" | "generic_file";
      readonly label: string;
      readonly state: "provided" | "not_provided" | "not_provided_yet";
      readonly value?: string;
    }
  | {
      /** Stable internal field identity; never shown to the customer. */
      readonly renderKey: string;
      readonly kind: "image";
      readonly label: string;
      readonly state: "provided" | "not_provided" | "not_provided_yet";
      readonly images: readonly ProductCustomizationSummaryImage[];
    };

export interface ProductCustomizationSummaryModel {
  readonly configuration: {
    readonly sku: string | null;
    readonly options: readonly ProductCustomizationSummaryOption[];
    readonly needsReview: boolean;
  };
  readonly personalization: {
    readonly status: "empty_configuration" | "current" | "needs_review";
    readonly rows: readonly ProductCustomizationSummaryRow[];
  };
}

function toPercent(value: number): string {
  return `${value * 100}%`;
}

function summarizeCrop(crop: CustomizationCropRegion): ProductCustomizationSummaryCrop {
  return {
    left: toPercent(crop.x),
    top: toPercent(crop.y),
    width: toPercent(crop.width),
    height: toPercent(crop.height),
  };
}

function imageMetadata(contentType: string, width: number, height: number): string {
  const format = {
    "image/jpeg": "JPEG",
    "image/png": "PNG",
    "image/webp": "WebP",
  }[contentType] ?? "Image";
  return `${format} / ${width} × ${height}`;
}

function missingState(required: boolean): "not_provided" | "not_provided_yet" {
  return required ? "not_provided_yet" : "not_provided";
}

function sameFieldValue(
  value: CustomizationValue | undefined,
  field: CustomizationField,
): boolean {
  return value !== undefined && value.fieldCode === field.code && value.kind === field.kind;
}

/**
 * Builds a bounded, display-only model. Receipt identity is used only for the
 * internal metadata lookup and is deliberately absent from the returned shape.
 */
export function createProductCustomizationSummary(input: {
  readonly draft: ProductCustomizationDraft;
  readonly configurationRevision: string;
  readonly fields: readonly CustomizationField[];
  readonly options: readonly ProductOption[];
  readonly optionValues: readonly ProductOptionValue[];
}): ProductCustomizationSummaryModel {
  const productId = input.draft.productId;
  const productOptions = input.options
    .filter((option) => option.productId === productId)
    .sort((left, right) => left.position - right.position || left.id.localeCompare(right.id));
  const optionsById = new Map(productOptions.map((option) => [option.id, option]));
  const selectedByOptionId = new Map<string, string>();
  let configurationNeedsReview = input.draft.selectedOptions.length !== new Set(input.draft.selectedOptions.map((entry) => entry.optionId)).size;
  input.draft.selectedOptions.forEach((selection) => {
    const option = optionsById.get(selection.optionId);
    const value = input.optionValues.find((candidate) => candidate.id === selection.valueId);
    if (!option || !value || value.productId !== productId || value.optionId !== option.id || selectedByOptionId.has(option.id)) {
      configurationNeedsReview = true;
      return;
    }
    selectedByOptionId.set(option.id, value.label);
  });

  const options = productOptions.map((option) => ({
    renderKey: option.id,
    label: option.name,
    value: selectedByOptionId.get(option.id) ?? "Not selected",
  }));
  const sku = input.draft.selectedVariant?.skuCode ?? null;

  if (input.draft.configurationRevision !== input.configurationRevision) {
    return {
      configuration: { sku, options, needsReview: configurationNeedsReview },
      personalization: { status: "needs_review", rows: [] },
    };
  }

  const activeFields = input.fields
    .filter((field) => field.productId === productId && field.isActive)
    .sort((left, right) => left.position - right.position || left.id.localeCompare(right.id));
  if (activeFields.length === 0) {
    return {
      configuration: { sku, options, needsReview: configurationNeedsReview },
      personalization: { status: "empty_configuration", rows: [] },
    };
  }

  const currentFieldsById = new Map(input.fields.map((field) => [field.id, field]));
  const valuesByFieldId = new Map<string, CustomizationValue>();
  let personalizationNeedsReview = false;
  input.draft.values.forEach((value) => {
    const field = currentFieldsById.get(value.fieldId);
    if (!field || !field.isActive || field.productId !== productId || !sameFieldValue(value, field) || valuesByFieldId.has(value.fieldId)) {
      personalizationNeedsReview = true;
      return;
    }
    valuesByFieldId.set(value.fieldId, value);
  });
  const receiptsById = new Map(input.draft.acceptedReceipts.map((receipt) => [receipt.receiptId, receipt]));
  const rows = activeFields.map((field): ProductCustomizationSummaryRow => {
    const value = valuesByFieldId.get(field.id);
    if (!sameFieldValue(value, field) || value === undefined) {
      return field.kind === "image"
        ? { renderKey: field.id, kind: "image", label: field.label, state: missingState(field.required), images: [] }
        : { renderKey: field.id, kind: field.kind, label: field.label, state: missingState(field.required) };
    }
    const normalized = normalizeCustomizationValue(value);
    if (normalized.kind === "image") {
      const images = normalized.images.map((image, index): ProductCustomizationSummaryImage => {
        const receipt = receiptsById.get(image.receiptId);
        return receipt
          ? {
              renderKey: `${field.id}:${index}`,
              label: `Image ${index + 1}`,
              state: "available",
              ...(receipt.originalFilename ? { filename: receipt.originalFilename } : {}),
              metadata: imageMetadata(receipt.contentType as "image/jpeg" | "image/png" | "image/webp", receipt.dimensions!.width, receipt.dimensions!.height),
              ...(image.crop ? { crop: summarizeCrop(image.crop) } : {}),
            }
          : { renderKey: `${field.id}:${index}`, label: `Image ${index + 1}`, state: "needs_review" };
      });
      return {
        renderKey: field.id,
        kind: "image",
        label: field.label,
        state: images.length > 0 ? "provided" : missingState(field.required),
        images,
      };
    }
    if (normalized.kind === "single_select") {
      const choice = field.kind === "single_select"
        ? field.constraints.choices.find((candidate) => candidate.id === normalized.choiceId && candidate.isActive)
        : undefined;
      return choice
        ? { renderKey: field.id, kind: "single_select", label: field.label, state: "provided", value: choice.label }
        : { renderKey: field.id, kind: "single_select", label: field.label, state: missingState(field.required) };
    }
    if (normalized.kind === "multi_select") {
      const choices = field.kind === "multi_select"
        ? field.constraints.choices.filter((choice) => choice.isActive && normalized.choiceIds.includes(choice.id)).sort((a, b) => a.position - b.position)
        : [];
      return choices.length > 0
        ? { renderKey: field.id, kind: "multi_select", label: field.label, state: "provided", value: choices.map((choice) => choice.label).join(", ") }
        : { renderKey: field.id, kind: "multi_select", label: field.label, state: missingState(field.required) };
    }
    if (normalized.kind === "numeric") {
      return { renderKey: field.id, kind: "numeric", label: field.label, state: "provided", value: String(normalized.value) };
    }
    if (normalized.kind === "generic_file") {
      return normalized.files.length > 0
        ? { renderKey: field.id, kind: "generic_file", label: field.label, state: "provided", value: `${normalized.files.length} file${normalized.files.length === 1 ? "" : "s"}` }
        : { renderKey: field.id, kind: "generic_file", label: field.label, state: missingState(field.required) };
    }
    return normalized.value.length > 0
      ? { renderKey: field.id, kind: normalized.kind, label: field.label, state: "provided", value: normalized.value }
      : { renderKey: field.id, kind: normalized.kind, label: field.label, state: missingState(field.required) };
  });

  return {
    configuration: { sku, options, needsReview: configurationNeedsReview },
    personalization: { status: personalizationNeedsReview ? "needs_review" : "current", rows },
  };
}
