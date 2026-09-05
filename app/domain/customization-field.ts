import {
  isCode,
  isIdentifier,
  isRecord,
  unknownFieldIssues,
  validationFailure,
  validationIssue,
  validationSuccess,
  type CatalogValidationResult,
} from "./catalog/validation.ts";

export type CustomizationFieldKind = "image" | "short_text" | "long_text";
export type AllowedImageMimeType = "image/jpeg" | "image/png" | "image/webp";

export interface CustomizationDimensions {
  width: number;
  height: number;
}

export interface TextCustomizationFieldConstraints {
  maxLength: number;
  helpText?: string;
}

export interface ImageCustomizationFieldConstraints {
  allowedMimeTypes: readonly AllowedImageMimeType[];
  maxBytes: number;
  minDimensions: CustomizationDimensions;
  recommendedDimensions?: CustomizationDimensions;
  minImageCount: number;
  maxImageCount: number;
  cropEnabled: boolean;
}

/**
 * Core field configuration only. Kind-specific constraints are added by Task 2.2.
 * A string revision is intentionally provider-neutral and carries no timestamp or
 * database-sequence authority.
 */
export interface CustomizationFieldCore {
  id: string;
  productId: string;
  code: string;
  label: string;
  kind: CustomizationFieldKind;
  required: boolean;
  isActive: boolean;
  position: number;
  configurationRevision: string;
}

export type CustomizationField =
  | (CustomizationFieldCore & {
      kind: "image";
      constraints: ImageCustomizationFieldConstraints;
    })
  | ((CustomizationFieldCore & {
      kind: "short_text" | "long_text";
      constraints: TextCustomizationFieldConstraints;
    }));

export interface CustomizationFieldDefinition {
  code: string;
  label: string;
  kind: CustomizationFieldKind;
  required: boolean;
  isActive: boolean;
  position: number;
  constraints: TextCustomizationFieldConstraints | ImageCustomizationFieldConstraints;
}

const FIELD_KINDS: readonly CustomizationFieldKind[] = [
  "image",
  "short_text",
  "long_text",
];

function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value >= 0;
}

function parseDimensions(
  value: unknown,
  path: string,
): CatalogValidationResult<CustomizationDimensions> {
  if (!isRecord(value)) {
    return validationFailure(validationIssue(path, "invalid_type", "Dimensions must be an object."));
  }
  const issues = unknownFieldIssues(value, ["width", "height"], path);
  if (!isPositiveInteger(value.width)) {
    issues.push(validationIssue(`${path}.width`, "invalid_value", "Width must be a positive integer."));
  }
  if (!isPositiveInteger(value.height)) {
    issues.push(validationIssue(`${path}.height`, "invalid_value", "Height must be a positive integer."));
  }
  return issues.length > 0
    ? validationFailure(...issues)
    : validationSuccess({ width: value.width as number, height: value.height as number });
}

function parseTextConstraints(
  value: unknown,
  path: string,
): CatalogValidationResult<TextCustomizationFieldConstraints> {
  if (!isRecord(value)) {
    return validationFailure(validationIssue(path, "invalid_type", "Text constraints must be an object."));
  }
  const issues = unknownFieldIssues(value, ["maxLength", "helpText"], path);
  if (!isPositiveInteger(value.maxLength)) {
    issues.push(validationIssue(`${path}.maxLength`, "invalid_value", "Maximum text length must be a positive integer."));
  }
  if (value.helpText !== undefined && !isNonBlankString(value.helpText)) {
    issues.push(validationIssue(`${path}.helpText`, "invalid_value", "Help text must not be blank."));
  }
  return issues.length > 0
    ? validationFailure(...issues)
    : validationSuccess({
        maxLength: value.maxLength as number,
        ...(typeof value.helpText === "string" ? { helpText: value.helpText } : {}),
      });
}

const ALLOWED_IMAGE_MIME_TYPES: readonly AllowedImageMimeType[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

function parseImageConstraints(
  value: unknown,
  path: string,
): CatalogValidationResult<ImageCustomizationFieldConstraints> {
  if (!isRecord(value)) {
    return validationFailure(validationIssue(path, "invalid_type", "Image constraints must be an object."));
  }
  const issues = unknownFieldIssues(value, [
    "allowedMimeTypes",
    "maxBytes",
    "minDimensions",
    "recommendedDimensions",
    "minImageCount",
    "maxImageCount",
    "cropEnabled",
  ], path);

  if (!Array.isArray(value.allowedMimeTypes) || value.allowedMimeTypes.length === 0) {
    issues.push(validationIssue(`${path}.allowedMimeTypes`, "invalid_value", "At least one allowed image MIME type is required."));
  } else {
    const mimeTypes = value.allowedMimeTypes;
    if (mimeTypes.some((mimeType) => !ALLOWED_IMAGE_MIME_TYPES.includes(mimeType as AllowedImageMimeType))) {
      issues.push(validationIssue(`${path}.allowedMimeTypes`, "invalid_value", "Only JPEG, PNG, and WebP MIME types are allowed."));
    }
    if (new Set(mimeTypes).size !== mimeTypes.length) {
      issues.push(validationIssue(`${path}.allowedMimeTypes`, "duplicate", "Allowed image MIME types must be unique."));
    }
  }
  if (!isPositiveInteger(value.maxBytes)) {
    issues.push(validationIssue(`${path}.maxBytes`, "invalid_value", "Maximum image bytes must be a positive integer."));
  }

  const minDimensions = parseDimensions(value.minDimensions, `${path}.minDimensions`);
  if (!minDimensions.ok) issues.push(...minDimensions.issues);
  const recommendedDimensions = value.recommendedDimensions === undefined
    ? validationSuccess<CustomizationDimensions | undefined>(undefined)
    : parseDimensions(value.recommendedDimensions, `${path}.recommendedDimensions`);
  if (!recommendedDimensions.ok) {
    issues.push(...recommendedDimensions.issues);
  } else if (minDimensions.ok && recommendedDimensions.value && (
    recommendedDimensions.value.width < minDimensions.value.width ||
    recommendedDimensions.value.height < minDimensions.value.height
  )) {
    issues.push(validationIssue(`${path}.recommendedDimensions`, "invalid_value", "Recommended dimensions cannot be below minimum dimensions."));
  }

  if (!isNonNegativeInteger(value.minImageCount)) {
    issues.push(validationIssue(`${path}.minImageCount`, "invalid_value", "Minimum image count must be a non-negative integer."));
  }
  if (!isPositiveInteger(value.maxImageCount)) {
    issues.push(validationIssue(`${path}.maxImageCount`, "invalid_value", "Maximum image count must be a positive integer."));
  }
  if (isNonNegativeInteger(value.minImageCount) && isPositiveInteger(value.maxImageCount) && value.minImageCount > value.maxImageCount) {
    issues.push(validationIssue(`${path}.minImageCount`, "invalid_value", "Minimum image count cannot exceed maximum image count."));
  }
  if (typeof value.cropEnabled !== "boolean") {
    issues.push(validationIssue(`${path}.cropEnabled`, "invalid_type", "Crop enabled must be boolean."));
  }

  if (issues.length > 0 || !minDimensions.ok || !recommendedDimensions.ok) {
    return validationFailure(...issues);
  }
  return validationSuccess({
    allowedMimeTypes: [...(value.allowedMimeTypes as AllowedImageMimeType[])],
    maxBytes: value.maxBytes as number,
    minDimensions: minDimensions.value,
    ...(recommendedDimensions.value ? { recommendedDimensions: recommendedDimensions.value } : {}),
    minImageCount: value.minImageCount as number,
    maxImageCount: value.maxImageCount as number,
    cropEnabled: value.cropEnabled as boolean,
  });
}

export function parseCustomizationFieldCore(
  value: unknown,
): CatalogValidationResult<CustomizationFieldCore> {
  if (!isRecord(value)) {
    return validationFailure(
      validationIssue("$", "invalid_type", "Customization field must be an object."),
    );
  }

  const issues = unknownFieldIssues(value, [
    "id",
    "productId",
    "code",
    "label",
    "kind",
    "required",
    "isActive",
    "position",
    "configurationRevision",
  ]);

  if (!isIdentifier(value.id)) {
    issues.push(validationIssue("$.id", "invalid_format", "Customization field ID is invalid."));
  }
  if (!isIdentifier(value.productId)) {
    issues.push(validationIssue("$.productId", "invalid_format", "Customization field Product ID is invalid."));
  }
  if (!isCode(value.code)) {
    issues.push(validationIssue("$.code", "invalid_format", "Customization field code is invalid."));
  }
  if (!isNonBlankString(value.label)) {
    issues.push(validationIssue("$.label", "invalid_value", "Customization field label must not be blank."));
  }
  if (!FIELD_KINDS.includes(value.kind as CustomizationFieldKind)) {
    issues.push(validationIssue("$.kind", "invalid_value", "Customization field kind is not approved."));
  }
  if (typeof value.required !== "boolean") {
    issues.push(validationIssue("$.required", "invalid_type", "Customization field required must be boolean."));
  }
  if (typeof value.isActive !== "boolean") {
    issues.push(validationIssue("$.isActive", "invalid_type", "Customization field isActive must be boolean."));
  }
  if (
    typeof value.position !== "number" ||
    !Number.isFinite(value.position) ||
    !Number.isInteger(value.position) ||
    value.position < 0
  ) {
    issues.push(validationIssue("$.position", "invalid_value", "Customization field position must be a finite non-negative integer."));
  }
  if (!isNonBlankString(value.configurationRevision)) {
    issues.push(validationIssue("$.configurationRevision", "invalid_value", "Customization field configuration revision must not be blank."));
  }

  if (issues.length > 0) {
    return validationFailure(...issues);
  }

  return validationSuccess({
    id: value.id as string,
    productId: value.productId as string,
    code: value.code as string,
    label: value.label as string,
    kind: value.kind as CustomizationFieldKind,
    required: value.required as boolean,
    isActive: value.isActive as boolean,
    position: value.position as number,
    configurationRevision: value.configurationRevision as string,
  });
}

/**
 * Parses the revision-editable portion of a field without manufacturing a
 * stable identity, Product owner, or configuration revision. Server-side
 * administration uses this to validate complete replacement intent before
 * allocating any persistent identity.
 */
export function parseCustomizationFieldDefinition(
  value: unknown,
): CatalogValidationResult<CustomizationFieldDefinition> {
  if (!isRecord(value)) {
    return validationFailure(
      validationIssue("$", "invalid_type", "Customization field definition must be an object."),
    );
  }
  const issues = unknownFieldIssues(value, [
    "code", "label", "kind", "required", "isActive", "position", "constraints",
  ]);
  if (!isCode(value.code)) {
    issues.push(validationIssue("$.code", "invalid_format", "Customization field code is invalid."));
  }
  if (!isNonBlankString(value.label)) {
    issues.push(validationIssue("$.label", "invalid_value", "Customization field label must not be blank."));
  }
  if (!FIELD_KINDS.includes(value.kind as CustomizationFieldKind)) {
    issues.push(validationIssue("$.kind", "invalid_value", "Customization field kind is not approved."));
  }
  if (typeof value.required !== "boolean") {
    issues.push(validationIssue("$.required", "invalid_type", "Customization field required must be boolean."));
  }
  if (typeof value.isActive !== "boolean") {
    issues.push(validationIssue("$.isActive", "invalid_type", "Customization field isActive must be boolean."));
  }
  if (!isNonNegativeInteger(value.position)) {
    issues.push(validationIssue("$.position", "invalid_value", "Customization field position must be a finite non-negative integer."));
  }
  if (!isRecord(value.constraints)) {
    issues.push(validationIssue("$.constraints", "invalid_type", "Customization field constraints must be an object."));
  }
  if (issues.length > 0 || !isRecord(value.constraints) || !FIELD_KINDS.includes(value.kind as CustomizationFieldKind)) {
    return validationFailure(...issues);
  }

  const constraints = value.kind === "image"
    ? parseImageConstraints(value.constraints, "$.constraints")
    : parseTextConstraints(value.constraints, "$.constraints");
  if (!constraints.ok) return validationFailure(...constraints.issues);
  return validationSuccess({
    code: value.code as string,
    label: value.label as string,
    kind: value.kind as CustomizationFieldKind,
    required: value.required as boolean,
    isActive: value.isActive as boolean,
    position: value.position as number,
    constraints: constraints.value,
  });
}

export function parseCustomizationField(
  value: unknown,
): CatalogValidationResult<CustomizationField> {
  if (!isRecord(value)) {
    return validationFailure(
      validationIssue("$", "invalid_type", "Customization field must be an object."),
    );
  }
  const issues = unknownFieldIssues(value, [
    "id", "productId", "code", "label", "kind", "required", "isActive",
    "position", "configurationRevision", "constraints",
  ]);
  const coreInput = { ...value };
  delete coreInput.constraints;
  const core = parseCustomizationFieldCore(coreInput);
  if (!core.ok) issues.push(...core.issues);
  if (!isRecord(value.constraints)) {
    issues.push(validationIssue("$.constraints", "invalid_type", "Customization field constraints must be an object."));
  }
  if (issues.length > 0 || !core.ok || !isRecord(value.constraints)) {
    return validationFailure(...issues);
  }

  const definition = parseCustomizationFieldDefinition({
    code: value.code,
    label: value.label,
    kind: value.kind,
    required: value.required,
    isActive: value.isActive,
    position: value.position,
    constraints: value.constraints,
  });
  if (!definition.ok) return validationFailure(...definition.issues);
  return validationSuccess({
    ...core.value,
    constraints: definition.value.constraints,
  } as CustomizationField);
}
