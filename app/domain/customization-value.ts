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

export type CustomizationValue = CustomizationTextValue | CustomizationImageValue;
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
