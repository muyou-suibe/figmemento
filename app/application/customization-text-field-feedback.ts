import type { CustomizationField } from "../domain/customization-field.ts";
import type {
  CustomizationValidationIssue,
} from "../domain/customization-validation.ts";
import { validateCustomizationValuesAgainstFields } from "../domain/customization-validation.ts";
import type {
  CustomizationTextValue,
} from "../domain/customization-value.ts";
import type {
  ProductCustomizationDraft,
  ProductCustomizationDraftAction,
} from "../domain/product-customization-draft.ts";

export interface CustomizationTextFieldFeedback {
  readonly rawValue: string;
  readonly issues: readonly CustomizationValidationIssue[];
}

const INCOMPLETE_ISSUE_CODES = new Set([
  "required_field_missing",
  "required_field_empty",
]);

function toResolvedImageMetadata(draft: ProductCustomizationDraft) {
  return draft.acceptedReceipts.map((receipt) => ({
    receiptId: receipt.receiptId,
    mimeType: receipt.contentType,
    fileSizeBytes: receipt.byteSize,
    width: receipt.dimensions.width,
    height: receipt.dimensions.height,
  }));
}

function isTextField(field: CustomizationField): field is Extract<CustomizationField, {
  kind: "short_text" | "long_text";
}> {
  return field.kind === "short_text" || field.kind === "long_text";
}

function findCurrentTextValue(
  draft: ProductCustomizationDraft,
  field: Extract<CustomizationField, { kind: "short_text" | "long_text" }>,
): CustomizationTextValue | undefined {
  const value = draft.values.find((candidate) => candidate.fieldId === field.id);
  return value?.kind === field.kind ? value : undefined;
}

/**
 * Returns field-specific presentation data by reusing the authoritative domain
 * validator. The helper neither normalizes nor mutates the raw local draft.
 */
export function getCustomizationTextFieldFeedback(input: {
  readonly draft: ProductCustomizationDraft;
  readonly fields: readonly CustomizationField[];
  readonly field: Extract<CustomizationField, { kind: "short_text" | "long_text" }>;
}): CustomizationTextFieldFeedback {
  const currentValue = findCurrentTextValue(input.draft, input.field);
  const valueIndex = input.draft.values.findIndex((candidate) => candidate.fieldId === input.field.id);
  const fieldIndex = input.fields.findIndex((candidate) => candidate.id === input.field.id);
  const validation = validateCustomizationValuesAgainstFields({
    productId: input.draft.productId,
    configurationRevision: input.draft.configurationRevision,
    authoritativeConfigurationRevision: input.field.configurationRevision,
    fields: input.fields,
    values: input.draft.values,
    resolvedImageMetadata: toResolvedImageMetadata(input.draft),
  });
  const issues = validation.ok
    ? []
    : validation.issues.filter((issue) =>
      issue.code === "stale_configuration"
      || (valueIndex >= 0 && issue.path.startsWith(`$.values[${valueIndex}]`))
      || (fieldIndex >= 0 && issue.path === `$.fields[${fieldIndex}].id`),
    );

  return {
    rawValue: currentValue?.value ?? "",
    issues,
  };
}

export function createTextCustomizationDraftAction(
  field: Extract<CustomizationField, { kind: "short_text" | "long_text" }>,
  rawValue: string,
): Extract<ProductCustomizationDraftAction, { type: "set_text_value" }> {
  return {
    type: "set_text_value",
    value: {
      fieldId: field.id,
      fieldCode: field.code,
      kind: field.kind,
      value: rawValue,
    },
  };
}

export function getVisibleCustomizationTextFieldIssues(
  issues: readonly CustomizationValidationIssue[],
  touched: boolean,
): readonly CustomizationValidationIssue[] {
  return issues.filter((issue) => !INCOMPLETE_ISSUE_CODES.has(issue.code) || touched);
}

export function isActiveTextCustomizationField(
  field: CustomizationField,
): field is Extract<CustomizationField, { kind: "short_text" | "long_text" }> {
  return field.isActive && isTextField(field);
}
