import {
  isCode,
  isIdentifier,
  isRecord,
  unknownFieldIssues,
  validationFailure,
  validationIssue,
  validationSuccess,
  type CatalogValidationIssue,
  type CatalogValidationResult,
} from "./catalog/validation.ts";
import type { CustomizationField } from "./customization-field.ts";

export interface CustomizationCropRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CustomizationTextValue {
  fieldId: string;
  fieldCode: string;
  kind: "short_text" | "long_text";
  value: string;
}

export interface CustomizationSingleSelectValue {
  fieldId: string;
  fieldCode: string;
  kind: "single_select";
  choiceId: string;
}

export interface CustomizationMultiSelectValue {
  fieldId: string;
  fieldCode: string;
  kind: "multi_select";
  choiceIds: readonly string[];
}

export interface CustomizationNumericValue {
  fieldId: string;
  fieldCode: string;
  kind: "numeric";
  value: number;
}

/**
 * Provider-neutral opaque identity with optional non-destructive customer-input
 * crop metadata. It contains no storage or rendered-output authority.
 */
export interface CustomizationImageReceiptReference {
  receiptId: string;
  crop?: CustomizationCropRegion;
}

export interface CustomizationImageValue {
  fieldId: string;
  fieldCode: string;
  kind: "image";
  images: readonly CustomizationImageReceiptReference[];
}

export interface CustomizationFileReceiptReference {
  receiptId: string;
}

export interface CustomizationGenericFileValue {
  fieldId: string;
  fieldCode: string;
  kind: "generic_file";
  files: readonly CustomizationFileReceiptReference[];
}

export type CustomizationValue = CustomizationTextValue | CustomizationImageValue | CustomizationSingleSelectValue | CustomizationMultiSelectValue | CustomizationNumericValue | CustomizationGenericFileValue;
export type CustomizationValues = readonly CustomizationValue[];

function collectFieldIdentityIssues(value: Record<string, unknown>): CatalogValidationIssue[] {
  const issues: CatalogValidationIssue[] = [];
  if (!isIdentifier(value.fieldId)) {
    issues.push(validationIssue("$.fieldId", "invalid_format", "Customization field ID is invalid."));
  }
  if (!isCode(value.fieldCode)) {
    issues.push(validationIssue("$.fieldCode", "invalid_format", "Customization field code is invalid."));
  }
  return issues;
}

function isFiniteNormalizedCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

export function parseCustomizationCropRegion(
  value: unknown,
): CatalogValidationResult<CustomizationCropRegion> {
  if (!isRecord(value)) {
    return validationFailure(
      validationIssue("$", "invalid_type", "Crop region must be an object."),
    );
  }

  const issues = unknownFieldIssues(value, ["x", "y", "width", "height"]);
  if (!isFiniteNormalizedCoordinate(value.x)) {
    issues.push(validationIssue("$.x", "invalid_value", "Crop x must be a finite normalized coordinate."));
  }
  if (!isFiniteNormalizedCoordinate(value.y)) {
    issues.push(validationIssue("$.y", "invalid_value", "Crop y must be a finite normalized coordinate."));
  }
  if (!isFiniteNormalizedCoordinate(value.width) || value.width === 0) {
    issues.push(validationIssue("$.width", "invalid_value", "Crop width must be finite, normalized, and greater than zero."));
  }
  if (!isFiniteNormalizedCoordinate(value.height) || value.height === 0) {
    issues.push(validationIssue("$.height", "invalid_value", "Crop height must be finite, normalized, and greater than zero."));
  }
  if (
    isFiniteNormalizedCoordinate(value.x)
    && isFiniteNormalizedCoordinate(value.width)
    && value.width > 0
    && value.x + value.width > 1
  ) {
    issues.push(validationIssue("$", "invalid_value", "Crop region extends beyond the normalized image width."));
  }
  if (
    isFiniteNormalizedCoordinate(value.y)
    && isFiniteNormalizedCoordinate(value.height)
    && value.height > 0
    && value.y + value.height > 1
  ) {
    issues.push(validationIssue("$", "invalid_value", "Crop region extends beyond the normalized image height."));
  }

  return issues.length > 0
    ? validationFailure(...issues)
    : validationSuccess({
        x: value.x as number,
        y: value.y as number,
        width: value.width as number,
        height: value.height as number,
      });
}

function parseImageReceiptReference(
  value: unknown,
  path: string,
): CatalogValidationResult<CustomizationImageReceiptReference> {
  if (!isRecord(value)) {
    return validationFailure(validationIssue(path, "invalid_type", "Image receipt reference must be an object."));
  }
  const issues = unknownFieldIssues(value, ["receiptId", "crop"], path);
  if (!isIdentifier(value.receiptId)) {
    issues.push(validationIssue(`${path}.receiptId`, "invalid_format", "Upload receipt ID is invalid."));
  }
  const crop = value.crop === undefined ? undefined : parseCustomizationCropRegion(value.crop);
  if (crop && !crop.ok) {
    issues.push(...crop.issues.map((issue) => ({
      ...issue,
      path: `${path}.crop${issue.path === "$" ? "" : issue.path.slice(1)}`,
    })));
  }
  return issues.length > 0
    ? validationFailure(...issues)
    : validationSuccess({
        receiptId: value.receiptId as string,
        ...(crop && crop.ok ? { crop: crop.value } : {}),
      });
}

function parseFileReceiptReference(value: unknown, path: string): CatalogValidationResult<CustomizationFileReceiptReference> {
  if (!isRecord(value)) return validationFailure(validationIssue(path, "invalid_type", "File receipt reference must be an object."));
  const issues = unknownFieldIssues(value, ["receiptId"], path);
  if (!isIdentifier(value.receiptId)) issues.push(validationIssue(`${path}.receiptId`, "invalid_format", "File receipt ID is invalid."));
  return issues.length > 0 ? validationFailure(...issues) : validationSuccess({ receiptId: value.receiptId as string });
}

export function parseCustomizationValue(
  value: unknown,
): CatalogValidationResult<CustomizationValue> {
  if (!isRecord(value)) {
    return validationFailure(
      validationIssue("$", "invalid_type", "Customization value must be an object."),
    );
  }

  if (value.kind === "short_text" || value.kind === "long_text") {
    const issues = [
      ...unknownFieldIssues(value, ["fieldId", "fieldCode", "kind", "value"]),
      ...collectFieldIdentityIssues(value),
    ];
    if (typeof value.value !== "string") {
      issues.push(validationIssue("$.value", "invalid_type", "Text customization value must be a string."));
    }
    return issues.length > 0
      ? validationFailure(...issues)
      : validationSuccess({
          fieldId: value.fieldId as string,
          fieldCode: value.fieldCode as string,
          kind: value.kind,
          value: value.value as string,
        });
  }

  if (value.kind === "image") {
    const issues = [
      ...unknownFieldIssues(value, ["fieldId", "fieldCode", "kind", "images"]),
      ...collectFieldIdentityIssues(value),
    ];
    if (!Array.isArray(value.images)) {
      issues.push(validationIssue("$.images", "invalid_type", "Image customization value images must be an array."));
    }

    const images: CustomizationImageReceiptReference[] = [];
    if (Array.isArray(value.images)) {
      value.images.forEach((candidate, index) => {
        const parsed = parseImageReceiptReference(candidate, `$.images[${index}]`);
        if (!parsed.ok) {
          issues.push(...parsed.issues);
        } else {
          images.push(parsed.value);
        }
      });
      if (new Set(images.map((image) => image.receiptId)).size !== images.length) {
        issues.push(validationIssue("$.images", "duplicate", "Image receipt references must be unique within one field."));
      }
    }

    return issues.length > 0
      ? validationFailure(...issues)
      : validationSuccess({
          fieldId: value.fieldId as string,
          fieldCode: value.fieldCode as string,
          kind: "image",
          images,
        });
  }

  if (value.kind === "single_select") {
    const issues = [
      ...unknownFieldIssues(value, ["fieldId", "fieldCode", "kind", "choiceId"]),
      ...collectFieldIdentityIssues(value),
    ];
    if (!isIdentifier(value.choiceId)) {
      issues.push(validationIssue("$.choiceId", "invalid_format", "Single-select choice ID is invalid."));
    }
    return issues.length > 0
      ? validationFailure(...issues)
      : validationSuccess({
          fieldId: value.fieldId as string,
          fieldCode: value.fieldCode as string,
          kind: "single_select",
          choiceId: value.choiceId as string,
        });
  }

  if (value.kind === "multi_select") {
    const issues = [
      ...unknownFieldIssues(value, ["fieldId", "fieldCode", "kind", "choiceIds"]),
      ...collectFieldIdentityIssues(value),
    ];
    if (!Array.isArray(value.choiceIds)) {
      issues.push(validationIssue("$.choiceIds", "invalid_type", "Multi-select choice IDs must be an array."));
    }
    const choiceIds: string[] = [];
    if (Array.isArray(value.choiceIds)) {
      value.choiceIds.forEach((choiceId, index) => {
        if (!isIdentifier(choiceId)) issues.push(validationIssue(`$.choiceIds[${index}]`, "invalid_format", "Multi-select choice ID is invalid."));
        else choiceIds.push(choiceId);
      });
      if (new Set(choiceIds).size !== choiceIds.length) issues.push(validationIssue("$.choiceIds", "duplicate", "Multi-select choice IDs must be unique."));
    }
    return issues.length > 0 ? validationFailure(...issues) : validationSuccess({
      fieldId: value.fieldId as string,
      fieldCode: value.fieldCode as string,
      kind: "multi_select",
      choiceIds,
    });
  }

  if (value.kind === "numeric") {
    const issues = [
      ...unknownFieldIssues(value, ["fieldId", "fieldCode", "kind", "value"]),
      ...collectFieldIdentityIssues(value),
    ];
    if (typeof value.value !== "number" || !Number.isFinite(value.value)) issues.push(validationIssue("$.value", "invalid_value", "Numeric customization value must be finite."));
    return issues.length > 0 ? validationFailure(...issues) : validationSuccess({
      fieldId: value.fieldId as string,
      fieldCode: value.fieldCode as string,
      kind: "numeric",
      value: value.value as number,
    });
  }

  if (value.kind === "generic_file") {
    const issues = [
      ...unknownFieldIssues(value, ["fieldId", "fieldCode", "kind", "files"]),
      ...collectFieldIdentityIssues(value),
    ];
    if (!Array.isArray(value.files)) issues.push(validationIssue("$.files", "invalid_type", "Generic-file value files must be an array."));
    const files: CustomizationFileReceiptReference[] = [];
    if (Array.isArray(value.files)) value.files.forEach((candidate, index) => {
      const parsed = parseFileReceiptReference(candidate, `$.files[${index}]`);
      if (!parsed.ok) issues.push(...parsed.issues); else files.push(parsed.value);
    });
    if (new Set(files.map((file) => file.receiptId)).size !== files.length) issues.push(validationIssue("$.files", "duplicate", "Generic-file receipt references must be unique within one field."));
    return issues.length > 0 ? validationFailure(...issues) : validationSuccess({
      fieldId: value.fieldId as string,
      fieldCode: value.fieldCode as string,
      kind: "generic_file",
      files,
    });
  }

  return validationFailure(
    validationIssue("$.kind", "invalid_value", "Customization value kind is not approved."),
  );
}

export function parseCustomizationValues(
  value: unknown,
): CatalogValidationResult<CustomizationValues> {
  if (!Array.isArray(value)) {
    return validationFailure(
      validationIssue("$", "invalid_type", "Customization values must be an array."),
    );
  }

  const issues: CatalogValidationIssue[] = [];
  const values: CustomizationValue[] = [];
  value.forEach((candidate, index) => {
    const parsed = parseCustomizationValue(candidate);
    if (!parsed.ok) {
      issues.push(...parsed.issues.map((issue) => ({
        ...issue,
        path: `$[${index}]${issue.path === "$" ? "" : issue.path.slice(1)}`,
      })));
    } else {
      values.push(parsed.value);
    }
  });

  const seenFieldIds = new Set<string>();
  values.forEach((candidate, index) => {
    if (seenFieldIds.has(candidate.fieldId)) {
      issues.push(validationIssue(`$[${index}].fieldId`, "duplicate", "Customization values must contain one value per field."));
    }
    seenFieldIds.add(candidate.fieldId);
  });

  return issues.length > 0 ? validationFailure(...issues) : validationSuccess(values);
}

/**
 * This intentionally checks only the crop policy. Field/value identity, Product
 * ownership, active state, requiredness, and count constraints remain Task 2.5.
 */
export function validateCustomizationCropPolicy(
  field: CustomizationField,
  value: CustomizationValue,
): CatalogValidationResult<CustomizationImageValue> {
  if (field.kind !== "image") {
    return validationFailure(
      validationIssue("$.field.kind", "invalid_value", "Only image fields can authorize crop metadata."),
    );
  }
  if (value.kind !== "image") {
    return validationFailure(
      validationIssue("$.value.kind", "invalid_value", "Crop policy applies only to image customization values."),
    );
  }
  if (!field.constraints.cropEnabled && value.images.some((image) => image.crop !== undefined)) {
    return validationFailure(
      validationIssue("$.value.images", "invalid_value", "Crop metadata is not enabled for this image field."),
    );
  }
  return validationSuccess(value);
}
