import {
  isIdentifier,
  isRecord,
  unknownFieldIssues,
} from "./catalog/validation.ts";
import type { AllowedGenericFileMimeType, AllowedImageMimeType, CustomizationField, CustomizationPredicate } from "./customization-field.ts";
import type {
  CustomizationGenericFileValue,
  CustomizationImageValue,
  CustomizationMultiSelectValue,
  CustomizationNumericValue,
  CustomizationValue,
  CustomizationValues,
} from "./customization-value.ts";
import { validateCustomizationCropPolicy } from "./customization-value.ts";

export type CustomizationValidationIssueCode =
  | "invalid_authoritative_configuration"
  | "stale_configuration"
  | "cross_product_field"
  | "unknown_field"
  | "inactive_field"
  | "field_code_mismatch"
  | "field_kind_mismatch"
  | "unknown_choice"
  | "inactive_choice"
  | "selection_count_too_low"
  | "selection_count_too_high"
  | "duplicate_field_value"
  | "required_field_missing"
  | "required_field_empty"
  | "text_too_long"
  | "image_count_too_low"
  | "image_count_too_high"
  | "image_metadata_missing"
  | "duplicate_image_metadata"
  | "invalid_image_metadata"
  | "image_mime_not_allowed"
  | "image_too_large"
  | "image_dimensions_too_small"
  | "crop_not_allowed"
  | "numeric_out_of_range"
  | "numeric_step_mismatch"
  | "file_count_too_low"
  | "file_count_too_high"
  | "file_metadata_missing"
  | "file_mime_not_allowed"
  | "file_too_large"
  | "duplicate_file_metadata"
  | "invalid_file_metadata"
  | "conditional_required"
  | "hidden_value"
  | "invalid_rule_graph";

export interface CustomizationValidationIssue {
  path: string;
  code: CustomizationValidationIssueCode;
  message: string;
}

export type CustomizationValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: CustomizationValidationIssue[] };

export interface CustomizationResolvedImageMetadata {
  receiptId: string;
  mimeType: AllowedImageMimeType;
  fileSizeBytes: number;
  width: number;
  height: number;
}

export interface CustomizationResolvedFileMetadata {
  receiptId: string;
  mimeType: AllowedGenericFileMimeType;
  fileSizeBytes: number;
}

export interface ValidateCustomizationValuesInput {
  productId: string;
  /** Browser/draft claim, which must be compared against current authority. */
  configurationRevision: string;
  /** Current configuration authority; it remains meaningful when fields are empty. */
  authoritativeConfigurationRevision: string;
  fields: readonly CustomizationField[];
  values: CustomizationValues;
  resolvedImageMetadata: readonly CustomizationResolvedImageMetadata[];
  resolvedFileMetadata?: readonly CustomizationResolvedFileMetadata[];
}

function issue(
  path: string,
  code: CustomizationValidationIssueCode,
  message: string,
): CustomizationValidationIssue {
  return { path, code, message };
}

function success<T>(value: T): CustomizationValidationResult<T> {
  return { ok: true, value };
}

function failure<T = never>(
  ...issues: CustomizationValidationIssue[]
): CustomizationValidationResult<T> {
  return { ok: false, issues };
}

function isPositiveFiniteInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value > 0;
}

const IMAGE_MIME_TYPES: readonly AllowedImageMimeType[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

const GENERIC_FILE_MIME_TYPES: readonly AllowedGenericFileMimeType[] = [
  "application/pdf",
  "text/plain",
  "application/zip",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

export function parseCustomizationResolvedImageMetadata(
  value: unknown,
): CustomizationValidationResult<CustomizationResolvedImageMetadata> {
  if (!isRecord(value)) {
    return failure(issue("$", "invalid_image_metadata", "Resolved image metadata must be an object."));
  }

  const issues = unknownFieldIssues(value, [
    "receiptId",
    "mimeType",
    "fileSizeBytes",
    "width",
    "height",
  ]).map((entry) => issue(entry.path, "invalid_image_metadata", entry.message));

  if (!isIdentifier(value.receiptId)) {
    issues.push(issue("$.receiptId", "invalid_image_metadata", "Resolved image receipt ID is invalid."));
  }
  if (!IMAGE_MIME_TYPES.includes(value.mimeType as AllowedImageMimeType)) {
    issues.push(issue("$.mimeType", "invalid_image_metadata", "Resolved image MIME type is invalid."));
  }
  for (const property of ["fileSizeBytes", "width", "height"] as const) {
    if (!isPositiveFiniteInteger(value[property])) {
      issues.push(issue(`$.${property}`, "invalid_image_metadata", `Resolved image ${property} must be a positive finite integer.`));
    }
  }

  return issues.length > 0
    ? failure(...issues)
    : success({
        receiptId: value.receiptId as string,
        mimeType: value.mimeType as AllowedImageMimeType,
        fileSizeBytes: value.fileSizeBytes as number,
        width: value.width as number,
        height: value.height as number,
      });
}

export function parseCustomizationResolvedFileMetadata(
  value: unknown,
): CustomizationValidationResult<CustomizationResolvedFileMetadata> {
  if (!isRecord(value)) return failure(issue("$", "invalid_file_metadata", "Resolved file metadata must be an object."));
  const issues = unknownFieldIssues(value, ["receiptId", "mimeType", "fileSizeBytes"]).map((entry) => issue(entry.path, "invalid_file_metadata", entry.message));
  if (!isIdentifier(value.receiptId)) issues.push(issue("$.receiptId", "invalid_file_metadata", "Resolved file receipt ID is invalid."));
  if (!GENERIC_FILE_MIME_TYPES.includes(value.mimeType as AllowedGenericFileMimeType)) issues.push(issue("$.mimeType", "invalid_file_metadata", "Resolved generic-file MIME type is not allowlisted."));
  if (!isPositiveFiniteInteger(value.fileSizeBytes)) issues.push(issue("$.fileSizeBytes", "invalid_file_metadata", "Resolved file size must be a positive finite integer."));
  return issues.length > 0 ? failure(...issues) : success({ receiptId: value.receiptId as string, mimeType: value.mimeType as AllowedGenericFileMimeType, fileSizeBytes: value.fileSizeBytes as number });
}

function normalizeImageValue(value: CustomizationImageValue): CustomizationImageValue {
  return {
    ...value,
    images: value.images.map((image) => ({
      receiptId: image.receiptId,
      ...(image.crop ? { crop: { ...image.crop } } : {}),
    })),
  };
}

function normalizeNumericValue(value: CustomizationNumericValue, field: Extract<CustomizationField, { kind: "numeric" }>): CustomizationNumericValue {
  const decimals = Math.max(0, Math.min(6, (field.constraints.step.toString().split(".")[1] ?? "").length));
  const factor = 10 ** decimals;
  return { ...value, value: Math.round(value.value * factor) / factor };
}

function normalizeMultiSelectValue(
  value: CustomizationMultiSelectValue,
  field: Extract<CustomizationField, { kind: "multi_select" }>,
): CustomizationMultiSelectValue {
  const positions = new Map(field.constraints.choices.map((choice) => [choice.id, choice.position]));
  return {
    ...value,
    choiceIds: [...value.choiceIds].sort((left, right) => (positions.get(left) ?? Number.MAX_SAFE_INTEGER) - (positions.get(right) ?? Number.MAX_SAFE_INTEGER)),
  };
}

/**
 * Normalizes an already parsed domain value. This does not validate field
 * authority, ownership, configuration revision, receipt lifecycle, or input
 * shape; callers must preserve those boundaries separately.
 */
export function normalizeCustomizationValue(value: CustomizationValue): CustomizationValue {
  if (value.kind === "image") return normalizeImageValue(value);
  if (value.kind === "single_select") return { ...value };
  if (value.kind === "multi_select") return { ...value, choiceIds: [...value.choiceIds] };
  if (value.kind === "numeric") return { ...value };
  if (value.kind === "generic_file") return { ...value, files: value.files.map((file) => ({ ...file })) };
  return { ...value, value: value.value.trim() };
}

function collectAuthoritativeFieldIssues(
  productId: string,
  authoritativeConfigurationRevision: string,
  fields: readonly CustomizationField[],
): { issues: CustomizationValidationIssue[]; authoritativeRevision?: string } {
  const issues: CustomizationValidationIssue[] = [];
  if (!isIdentifier(productId)) {
    issues.push(issue("$.productId", "invalid_authoritative_configuration", "Expected Product identity is invalid."));
  }
  if (typeof authoritativeConfigurationRevision !== "string" || authoritativeConfigurationRevision.trim().length === 0) {
    issues.push(issue("$.authoritativeConfigurationRevision", "invalid_authoritative_configuration", "Authoritative customization configuration revision must not be blank."));
  }

  const fieldIds = new Set<string>();
  const fieldCodes = new Set<string>();
  fields.forEach((field, index) => {
    if (field.productId !== productId) {
      issues.push(issue(`$.fields[${index}].productId`, "cross_product_field", "Authoritative field belongs to another Product."));
    }
    if (fieldIds.has(field.id)) {
      issues.push(issue(`$.fields[${index}].id`, "invalid_authoritative_configuration", "Authoritative field IDs must be unique."));
    }
    if (fieldCodes.has(field.code)) {
      issues.push(issue(`$.fields[${index}].code`, "invalid_authoritative_configuration", "Authoritative Product field codes must be unique."));
    }
    fieldIds.add(field.id);
    fieldCodes.add(field.code);
    if (field.configurationRevision !== authoritativeConfigurationRevision) {
      issues.push(issue(`$.fields[${index}].configurationRevision`, "invalid_authoritative_configuration", "Authoritative field revision does not match the current configuration revision."));
    }
  });

  return {
    issues,
    ...(typeof authoritativeConfigurationRevision === "string" && authoritativeConfigurationRevision.trim().length > 0
      ? { authoritativeRevision: authoritativeConfigurationRevision }
      : {}),
  };
}

function predicateReferences(predicate: CustomizationPredicate | undefined): string[] {
  return predicate ? [predicate.fieldId] : [];
}

/** Validates the bounded, non-expression predicate graph before it is used. */
export function validateCustomizationRuleGraph(
  fields: readonly CustomizationField[],
): CustomizationValidationResult<true> {
  const issues: CustomizationValidationIssue[] = [];
  const byId = new Map(fields.map((field) => [field.id, field]));
  const edges = new Map<string, string[]>();
  for (const field of fields) {
    const refs = [
      ...predicateReferences(field.rules?.requiredWhen),
      ...predicateReferences(field.rules?.visibleWhen),
    ];
    for (const ref of refs) {
      if (!byId.has(ref)) issues.push(issue(`$.fields[${fields.indexOf(field)}].rules`, "invalid_rule_graph", "Rule references an unknown field."));
      if (ref === field.id) issues.push(issue(`$.fields[${fields.indexOf(field)}].rules`, "invalid_rule_graph", "A field rule cannot reference itself."));
    }
    edges.set(field.id, refs);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) { issues.push(issue("$.fields", "invalid_rule_graph", "Customization rule dependencies cannot contain cycles.")); return; }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const next of edges.get(id) ?? []) if (byId.has(next)) visit(next);
    visiting.delete(id); visited.add(id);
  };
  for (const field of fields) visit(field.id);
  return issues.length > 0 ? failure(...issues) : success(true);
}

function valueIsPresent(value: CustomizationValue | undefined): boolean {
  if (!value) return false;
  if (value.kind === "image") return value.images.length > 0;
  if (value.kind === "generic_file") return value.files.length > 0;
  if (value.kind === "multi_select") return value.choiceIds.length > 0;
  if (value.kind === "single_select") return value.choiceId.length > 0;
  if (value.kind === "numeric") return Number.isFinite(value.value);
  return value.value.trim().length > 0;
}

function predicateMatches(
  predicate: CustomizationPredicate | undefined,
  valuesByFieldId: ReadonlyMap<string, CustomizationValue>,
): boolean {
  if (!predicate) return false;
  const value = valuesByFieldId.get(predicate.fieldId);
  if (predicate.kind === "field_present") return valueIsPresent(value);
  if (predicate.kind === "choice_selected") {
    return value?.kind === "single_select"
      ? value.choiceId === predicate.choiceId
      : value?.kind === "multi_select" && value.choiceIds.includes(predicate.choiceId);
  }
  if (value?.kind !== "numeric") return false;
  if (predicate.operator === "eq") return value.value === predicate.value;
  if (predicate.operator === "neq") return value.value !== predicate.value;
  if (predicate.operator === "gte") return value.value >= predicate.value;
  return value.value <= predicate.value;
}

export function isCustomizationFieldVisible(
  field: CustomizationField,
  values: CustomizationValues,
): boolean {
  return !field.rules?.visibleWhen || predicateMatches(field.rules.visibleWhen, new Map(values.map((value) => [value.fieldId, value])));
}

function validateNumericValue(
  value: CustomizationNumericValue,
  field: Extract<CustomizationField, { kind: "numeric" }>,
  path: string,
): CustomizationValidationIssue[] {
  const issues: CustomizationValidationIssue[] = [];
  const { min, max, step } = field.constraints;
  if (value.value < min || value.value > max) issues.push(issue(`${path}.value`, "numeric_out_of_range", "Numeric value is outside the configured range."));
  const quotient = (value.value - min) / step;
  if (Math.abs(quotient - Math.round(quotient)) > 1e-9) issues.push(issue(`${path}.value`, "numeric_step_mismatch", "Numeric value does not match the configured step."));
  return issues;
}

function validateGenericFileValue(
  value: CustomizationGenericFileValue,
  field: Extract<CustomizationField, { kind: "generic_file" }>,
  metadataByReceiptId: ReadonlyMap<string, CustomizationResolvedFileMetadata>,
  path: string,
): CustomizationValidationIssue[] {
  const issues: CustomizationValidationIssue[] = [];
  const minimum = Math.max(field.required ? 1 : 0, field.constraints.minFileCount);
  if (value.files.length < minimum) issues.push(issue(`${path}.files`, "file_count_too_low", "File count is below the configured minimum."));
  if (value.files.length > field.constraints.maxFileCount) issues.push(issue(`${path}.files`, "file_count_too_high", "File count exceeds the configured maximum."));
  value.files.forEach((file, index) => {
    const metadata = metadataByReceiptId.get(file.receiptId);
    const filePath = `${path}.files[${index}]`;
    if (!metadata) { issues.push(issue(`${filePath}.receiptId`, "file_metadata_missing", "Resolved file metadata is required.")); return; }
    if (!field.constraints.allowedMimeTypes.includes(metadata.mimeType)) issues.push(issue(`${filePath}.receiptId`, "file_mime_not_allowed", "File MIME type is not allowed for this field."));
    if (metadata.fileSizeBytes > field.constraints.maxBytes) issues.push(issue(`${filePath}.receiptId`, "file_too_large", "File byte size exceeds the configured maximum."));
  });
  return issues;
}

function collectMetadataIndex(
  metadata: readonly CustomizationResolvedImageMetadata[],
): { issues: CustomizationValidationIssue[]; byReceiptId: ReadonlyMap<string, CustomizationResolvedImageMetadata> } {
  const issues: CustomizationValidationIssue[] = [];
  const byReceiptId = new Map<string, CustomizationResolvedImageMetadata>();
  metadata.forEach((entry, index) => {
    if (byReceiptId.has(entry.receiptId)) {
      issues.push(issue(`$.resolvedImageMetadata[${index}].receiptId`, "duplicate_image_metadata", "Resolved image metadata receipt IDs must be unique."));
    }
    byReceiptId.set(entry.receiptId, entry);
  });
  return { issues, byReceiptId };
}

function collectFileMetadataIndex(
  metadata: readonly CustomizationResolvedFileMetadata[],
): { issues: CustomizationValidationIssue[]; byReceiptId: ReadonlyMap<string, CustomizationResolvedFileMetadata> } {
  const issues: CustomizationValidationIssue[] = [];
  const byReceiptId = new Map<string, CustomizationResolvedFileMetadata>();
  metadata.forEach((entry, index) => {
    if (byReceiptId.has(entry.receiptId)) issues.push(issue(`$.resolvedFileMetadata[${index}].receiptId`, "duplicate_file_metadata", "Resolved file metadata receipt IDs must be unique."));
    byReceiptId.set(entry.receiptId, entry);
  });
  return { issues, byReceiptId };
}

function validateImageValue(
  value: CustomizationImageValue,
  field: Extract<CustomizationField, { kind: "image" }>,
  metadataByReceiptId: ReadonlyMap<string, CustomizationResolvedImageMetadata>,
  path: string,
): CustomizationValidationIssue[] {
  const issues: CustomizationValidationIssue[] = [];
  const effectiveMinimum = Math.max(field.required ? 1 : 0, field.constraints.minImageCount);
  if (value.images.length < effectiveMinimum) {
    issues.push(issue(`${path}.images`, "image_count_too_low", "Image count is below the configured minimum."));
  }
  if (value.images.length > field.constraints.maxImageCount) {
    issues.push(issue(`${path}.images`, "image_count_too_high", "Image count exceeds the configured maximum."));
  }

  const cropPolicy = validateCustomizationCropPolicy(field, value);
  if (!cropPolicy.ok) {
    issues.push(...cropPolicy.issues.map((entry) => issue(
      `${path}${entry.path === "$.value.images" ? ".images" : ""}`,
      "crop_not_allowed",
      "Crop metadata is not enabled for this image field.",
    )));
  }

  value.images.forEach((image, index) => {
    const metadata = metadataByReceiptId.get(image.receiptId);
    const imagePath = `${path}.images[${index}]`;
    if (!metadata) {
      issues.push(issue(`${imagePath}.receiptId`, "image_metadata_missing", "Resolved image metadata is required."));
      return;
    }
    if (!field.constraints.allowedMimeTypes.includes(metadata.mimeType)) {
      issues.push(issue(`${imagePath}.receiptId`, "image_mime_not_allowed", "Image MIME type is not allowed for this field."));
    }
    if (metadata.fileSizeBytes > field.constraints.maxBytes) {
      issues.push(issue(`${imagePath}.receiptId`, "image_too_large", "Image byte size exceeds the configured maximum."));
    }
    if (
      metadata.width < field.constraints.minDimensions.width
      || metadata.height < field.constraints.minDimensions.height
    ) {
      issues.push(issue(`${imagePath}.receiptId`, "image_dimensions_too_small", "Image dimensions are below the configured minimum."));
    }
  });
  return issues;
}

/**
 * Validates caller-supplied authoritative fields and trusted resolved image
 * metadata only. It does not fetch configuration, authorize receipts, or access
 * Product, Variant, storage, or database services.
 */
export function validateCustomizationValuesAgainstFields(
  input: ValidateCustomizationValuesInput,
): CustomizationValidationResult<CustomizationValues> {
  const fieldAuthority = collectAuthoritativeFieldIssues(
    input.productId,
    input.authoritativeConfigurationRevision,
    input.fields,
  );
  const metadataIndex = collectMetadataIndex(input.resolvedImageMetadata);
  const fileMetadataIndex = collectFileMetadataIndex(input.resolvedFileMetadata ?? []);
  const ruleGraph = validateCustomizationRuleGraph(input.fields);
  const issues = [...fieldAuthority.issues, ...metadataIndex.issues, ...fileMetadataIndex.issues];
  if (!ruleGraph.ok) issues.push(...ruleGraph.issues);
  if (
    !fieldAuthority.authoritativeRevision
    || input.configurationRevision.trim().length === 0
    || input.configurationRevision !== fieldAuthority.authoritativeRevision
  ) {
    issues.push(issue("$.configurationRevision", "stale_configuration", "Customization configuration is no longer current."));
  }

  const fieldsById = new Map(input.fields.map((field) => [field.id, field]));
  const valuesByFieldId = new Set<string>();
  const normalizedValues: CustomizationValue[] = [];

  input.values.forEach((value, index) => {
    const valuePath = `$.values[${index}]`;
    if (valuesByFieldId.has(value.fieldId)) {
      issues.push(issue(`${valuePath}.fieldId`, "duplicate_field_value", "Only one customization value is allowed per field."));
      return;
    }
    valuesByFieldId.add(value.fieldId);

    const field = fieldsById.get(value.fieldId);
    if (!field) {
      issues.push(issue(`${valuePath}.fieldId`, "unknown_field", "Customization field is not configured for this Product."));
      return;
    }
    if (field.productId !== input.productId) {
      issues.push(issue(`${valuePath}.fieldId`, "cross_product_field", "Customization field belongs to another Product."));
      return;
    }
    if (value.fieldCode !== field.code) {
      issues.push(issue(`${valuePath}.fieldCode`, "field_code_mismatch", "Customization field code does not match the configured field."));
      return;
    }
    if (value.kind !== field.kind) {
      issues.push(issue(`${valuePath}.kind`, "field_kind_mismatch", "Customization value kind does not match the configured field."));
      return;
    }
    if (!field.isActive) {
      issues.push(issue(`${valuePath}.fieldId`, "inactive_field", "Inactive customization fields do not accept customer values."));
      return;
    }

    const normalized = field.kind === "numeric" && value.kind === "numeric"
      ? normalizeNumericValue(value, field)
      : normalizeCustomizationValue(value);
    if (field.kind === "image" && normalized.kind === "image") {
      issues.push(...validateImageValue(normalized, field, metadataIndex.byReceiptId, valuePath));
    } else if (field.kind === "single_select" && normalized.kind === "single_select") {
      const choice = field.constraints.choices.find((candidate) => candidate.id === normalized.choiceId);
      if (!choice) {
        issues.push(issue(`${valuePath}.choiceId`, "unknown_choice", "Single-select choice is not configured for this field."));
      } else if (!choice.isActive) {
        issues.push(issue(`${valuePath}.choiceId`, "inactive_choice", "Inactive single-select choices cannot be selected."));
      }
    } else if (field.kind === "multi_select" && normalized.kind === "multi_select") {
      const choiceIds = normalized.choiceIds;
      if (new Set(choiceIds).size !== choiceIds.length) issues.push(issue(`${valuePath}.choiceIds`, "duplicate_field_value", "Multi-select choice IDs must be unique."));
      for (const choiceId of choiceIds) {
        const choice = field.constraints.choices.find((candidate) => candidate.id === choiceId);
        if (!choice) issues.push(issue(`${valuePath}.choiceIds`, "unknown_choice", "Multi-select choice is not configured for this field."));
        else if (!choice.isActive) issues.push(issue(`${valuePath}.choiceIds`, "inactive_choice", "Inactive multi-select choices cannot be selected."));
      }
      const effectiveMinimum = Math.max(field.required ? 1 : 0, field.constraints.minSelections);
      if (choiceIds.length < effectiveMinimum) issues.push(issue(`${valuePath}.choiceIds`, "selection_count_too_low", "Selection count is below the configured minimum."));
      if (choiceIds.length > field.constraints.maxSelections) issues.push(issue(`${valuePath}.choiceIds`, "selection_count_too_high", "Selection count exceeds the configured maximum."));
      if (choiceIds.length === 0 && effectiveMinimum === 0) {
        valuesByFieldId.delete(value.fieldId);
      } else {
        normalizedValues.push(normalizeMultiSelectValue(normalized, field));
      }
      return;
    } else if (field.kind === "numeric" && normalized.kind === "numeric") {
      issues.push(...validateNumericValue(normalized, field, valuePath));
    } else if (field.kind === "generic_file" && normalized.kind === "generic_file") {
      issues.push(...validateGenericFileValue(normalized, field, fileMetadataIndex.byReceiptId, valuePath));
    } else if ((field.kind === "short_text" || field.kind === "long_text")
      && (normalized.kind === "short_text" || normalized.kind === "long_text")) {
      if (normalized.value.length > field.constraints.maxLength) {
        issues.push(issue(`${valuePath}.value`, "text_too_long", "Text value exceeds the configured maximum length."));
      }
      if (field.required && normalized.value.length === 0) {
        issues.push(issue(`${valuePath}.value`, "required_field_empty", "Required text customization value is empty."));
      }
    }
    normalizedValues.push(normalized);
  });

  const normalizedByFieldId = new Map(normalizedValues.map((value) => [value.fieldId, value]));
  input.fields.forEach((field, index) => {
    if (field.productId !== input.productId || !field.isActive) return;
    const submitted = normalizedByFieldId.get(field.id);
    if (field.rules?.visibleWhen && !predicateMatches(field.rules.visibleWhen, normalizedByFieldId) && submitted) {
      issues.push(issue(`$.values[${index}]`, "hidden_value", "Hidden customization fields cannot submit a value."));
    }
    const conditionalRequired = field.rules?.requiredWhen && predicateMatches(field.rules.requiredWhen, normalizedByFieldId);
    if (conditionalRequired && !valueIsPresent(submitted)) {
      issues.push(issue(`$.fields[${index}].id`, "conditional_required", "Customization field is required when its condition is satisfied."));
    }
  });

  input.fields.forEach((field, index) => {
    if (field.productId === input.productId && field.isActive && field.required && !valuesByFieldId.has(field.id)) {
      issues.push(issue(`$.fields[${index}].id`, "required_field_missing", "Required customization field has no customer value."));
    }
  });

  return issues.length > 0 ? failure(...issues) : success(normalizedValues);
}
