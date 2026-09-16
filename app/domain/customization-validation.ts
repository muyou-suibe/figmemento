import {
  isIdentifier,
  isRecord,
  unknownFieldIssues,
} from "./catalog/validation.ts";
import type { AllowedImageMimeType, CustomizationField } from "./customization-field.ts";
import type {
  CustomizationImageValue,
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
  | "crop_not_allowed";

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

export interface ValidateCustomizationValuesInput {
  productId: string;
  /** Browser/draft claim, which must be compared against current authority. */
  configurationRevision: string;
  /** Current configuration authority; it remains meaningful when fields are empty. */
  authoritativeConfigurationRevision: string;
  fields: readonly CustomizationField[];
  values: CustomizationValues;
  resolvedImageMetadata: readonly CustomizationResolvedImageMetadata[];
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

function normalizeImageValue(value: CustomizationImageValue): CustomizationImageValue {
  return {
    ...value,
    images: value.images.map((image) => ({
      receiptId: image.receiptId,
      ...(image.crop ? { crop: { ...image.crop } } : {}),
    })),
  };
}

/**
 * Normalizes an already parsed domain value. This does not validate field
 * authority, ownership, configuration revision, receipt lifecycle, or input
 * shape; callers must preserve those boundaries separately.
 */
export function normalizeCustomizationValue(value: CustomizationValue): CustomizationValue {
  return value.kind === "image"
    ? normalizeImageValue(value)
    : { ...value, value: value.value.trim() };
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
  const issues = [...fieldAuthority.issues, ...metadataIndex.issues];
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

    const normalized = normalizeCustomizationValue(value);
    if (field.kind === "image" && normalized.kind === "image") {
      issues.push(...validateImageValue(normalized, field, metadataIndex.byReceiptId, valuePath));
    } else if (field.kind !== "image" && normalized.kind !== "image") {
      if (normalized.value.length > field.constraints.maxLength) {
        issues.push(issue(`${valuePath}.value`, "text_too_long", "Text value exceeds the configured maximum length."));
      }
      if (field.required && normalized.value.length === 0) {
        issues.push(issue(`${valuePath}.value`, "required_field_empty", "Required text customization value is empty."));
      }
    }
    normalizedValues.push(normalized);
  });

  input.fields.forEach((field, index) => {
    if (field.productId === input.productId && field.isActive && field.required && !valuesByFieldId.has(field.id)) {
      issues.push(issue(`$.fields[${index}].id`, "required_field_missing", "Required customization field has no customer value."));
    }
  });

  return issues.length > 0 ? failure(...issues) : success(normalizedValues);
}
