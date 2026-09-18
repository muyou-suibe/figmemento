import {
  isIdentifier,
  isRecord,
  unknownFieldIssues,
  validationFailure,
  validationIssue,
  validationSuccess,
  type CatalogValidationResult,
} from "./catalog/validation.ts";
import type { AllowedGenericFileMimeType, AllowedImageMimeType, CustomizationDimensions } from "./customization-field.ts";
import { normalizeCustomerUploadFilename } from "./customer-image-inspection.ts";

/**
 * Opaque application identities. Allocation and guest-owner verification are
 * deliberately deferred to Task 5.2; these values never encode a provider
 * location or authorize access by themselves.
 */
export type CustomerUploadReceiptId = string;
export type CustomerUploadOwnerId = string;

export type CustomerUploadLifecycle =
  | "active"
  | "replaced"
  | "removed"
  | "expired"
  | "cleanup_pending"
  | "cleanup_failed"
  | "cleanup_completed";

export type CustomerUploadTimestamp = string;
export type CustomerUploadContentType = AllowedImageMimeType | AllowedGenericFileMimeType;

/**
 * Safe, server-derived receipt data. It contains no owner credential, object
 * locator, provider detail, order operation metadata, or preview URL, and is
 * the only receipt form suitable for a future browser/application boundary.
 */
export interface CustomerUploadReceipt {
  receiptId: CustomerUploadReceiptId;
  originalFilename?: string;
  contentType: CustomerUploadContentType;
  byteSize: number;
  dimensions?: CustomizationDimensions;
  createdAt: CustomerUploadTimestamp;
  expiresAt: CustomerUploadTimestamp;
  lifecycle: CustomerUploadLifecycle;
}

/** Server-only extension used by application and persistence boundaries. */
export interface OwnedCustomerUploadReceipt extends CustomerUploadReceipt {
  ownerId: CustomerUploadOwnerId;
}

const CUSTOMER_UPLOAD_LIFECYCLES: readonly CustomerUploadLifecycle[] = [
  "active",
  "replaced",
  "removed",
  "expired",
  "cleanup_pending",
  "cleanup_failed",
  "cleanup_completed",
];

const IMAGE_CONTENT_TYPES: readonly AllowedImageMimeType[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
];
const GENERIC_FILE_CONTENT_TYPES: readonly AllowedGenericFileMimeType[] = [
  "application/pdf",
  "text/plain",
  "application/zip",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

function isSafeOriginalFilename(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const normalized = normalizeCustomerUploadFilename(value);
  return normalized.ok && normalized.value === value;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isTimestamp(value: unknown): value is CustomerUploadTimestamp {
  return typeof value === "string" && TIMESTAMP_PATTERN.test(value) && Number.isFinite(Date.parse(value));
}

function parseDimensions(
  value: unknown,
  path: string,
): CatalogValidationResult<CustomizationDimensions> {
  if (!isRecord(value)) {
    return validationFailure(validationIssue(path, "invalid_type", "Customer upload dimensions must be an object."));
  }
  const issues = unknownFieldIssues(value, ["width", "height"], path);
  if (!isPositiveInteger(value.width)) {
    issues.push(validationIssue(`${path}.width`, "invalid_value", "Customer upload width must be a positive integer."));
  }
  if (!isPositiveInteger(value.height)) {
    issues.push(validationIssue(`${path}.height`, "invalid_value", "Customer upload height must be a positive integer."));
  }
  return issues.length > 0
    ? validationFailure(...issues)
    : validationSuccess({ width: value.width as number, height: value.height as number });
}

function parseCustomerUploadReceiptFields(
  value: Record<string, unknown>,
  allowOwnerId: boolean,
): CatalogValidationResult<CustomerUploadReceipt | OwnedCustomerUploadReceipt> {
  const issues = unknownFieldIssues(value, [
    "receiptId",
    "originalFilename",
    "contentType",
    "byteSize",
    "dimensions",
    "createdAt",
    "expiresAt",
    "lifecycle",
    ...(allowOwnerId ? ["ownerId"] : []),
  ]);

  if (!isIdentifier(value.receiptId)) {
    issues.push(validationIssue("$.receiptId", "invalid_format", "Customer upload receipt ID is invalid."));
  }
  if (allowOwnerId && !isIdentifier(value.ownerId)) {
    issues.push(validationIssue("$.ownerId", "invalid_format", "Customer upload owner ID is invalid."));
  }
  if (value.originalFilename !== undefined && !isSafeOriginalFilename(value.originalFilename)) {
    issues.push(validationIssue("$.originalFilename", "invalid_value", "Original filename must be a safe normalized display value."));
  }
  const contentType = value.contentType as CustomerUploadContentType;
  const isImage = IMAGE_CONTENT_TYPES.includes(contentType as AllowedImageMimeType);
  const isGenericFile = GENERIC_FILE_CONTENT_TYPES.includes(contentType as AllowedGenericFileMimeType);
  if (!isImage && !isGenericFile) {
    issues.push(validationIssue("$.contentType", "invalid_value", "Customer upload MIME type is not allowed."));
  }
  if (!isPositiveInteger(value.byteSize)) {
    issues.push(validationIssue("$.byteSize", "invalid_value", "Customer upload byte size must be a positive integer."));
  }
  const dimensions = isImage ? parseDimensions(value.dimensions, "$.dimensions") : validationSuccess<CustomizationDimensions | undefined>(undefined);
  if (isGenericFile && value.dimensions !== undefined) {
    issues.push(validationIssue("$.dimensions", "invalid_value", "Generic file receipts must not contain image dimensions."));
  }
  if (!isTimestamp(value.createdAt)) {
    issues.push(validationIssue("$.createdAt", "invalid_format", "Customer upload creation time is invalid."));
  }
  if (!isTimestamp(value.expiresAt)) {
    issues.push(validationIssue("$.expiresAt", "invalid_format", "Customer upload expiry time is invalid."));
  }
  if (
    isTimestamp(value.createdAt) &&
    isTimestamp(value.expiresAt) &&
    Date.parse(value.expiresAt) <= Date.parse(value.createdAt)
  ) {
    issues.push(validationIssue("$.expiresAt", "invalid_value", "Customer upload expiry must be after creation."));
  }
  if (!CUSTOMER_UPLOAD_LIFECYCLES.includes(value.lifecycle as CustomerUploadLifecycle)) {
    issues.push(validationIssue("$.lifecycle", "invalid_value", "Customer upload lifecycle is not approved."));
  }

  if (issues.length > 0 || !dimensions.ok) return validationFailure(...issues);
  const receipt: CustomerUploadReceipt = {
    receiptId: value.receiptId as CustomerUploadReceiptId,
    ...(typeof value.originalFilename === "string" ? { originalFilename: value.originalFilename } : {}),
    contentType,
    byteSize: value.byteSize as number,
    ...(dimensions.value ? { dimensions: dimensions.value } : {}),
    createdAt: value.createdAt as CustomerUploadTimestamp,
    expiresAt: value.expiresAt as CustomerUploadTimestamp,
    lifecycle: value.lifecycle as CustomerUploadLifecycle,
  };
  return allowOwnerId
    ? validationSuccess({ ...receipt, ownerId: value.ownerId as CustomerUploadOwnerId })
    : validationSuccess(receipt);
}

/**
 * Parses the safe receipt representation only. Provider paths, URLs, and
 * owner data are rejected rather than being accepted as browser authority.
 */
export function parseCustomerUploadReceipt(
  value: unknown,
): CatalogValidationResult<CustomerUploadReceipt> {
  if (!isRecord(value)) {
    return validationFailure(validationIssue("$", "invalid_type", "Customer upload receipt must be an object."));
  }
  const parsed = parseCustomerUploadReceiptFields(value, false);
  return parsed.ok ? validationSuccess(parsed.value as CustomerUploadReceipt) : parsed;
}

/**
 * Parses server-side receipt data after the owner verifier has derived the
 * opaque owner identity. This does not verify a guest cookie or token.
 */
export function parseOwnedCustomerUploadReceipt(
  value: unknown,
): CatalogValidationResult<OwnedCustomerUploadReceipt> {
  if (!isRecord(value)) {
    return validationFailure(validationIssue("$", "invalid_type", "Owned customer upload receipt must be an object."));
  }
  const parsed = parseCustomerUploadReceiptFields(value, true);
  return parsed.ok ? validationSuccess(parsed.value as OwnedCustomerUploadReceipt) : parsed;
}

export function parseCustomerUploadOwnerId(
  value: unknown,
): CatalogValidationResult<CustomerUploadOwnerId> {
  return isIdentifier(value)
    ? validationSuccess(value)
    : validationFailure(validationIssue("$", "invalid_format", "Customer upload owner ID is invalid."));
}

/**
 * Phase B state transitions are explicit. Equivalent retries may retain the
 * same state, but no command may use a generic arbitrary state update.
 */
export function canTransitionCustomerUploadLifecycle(
  from: CustomerUploadLifecycle,
  to: CustomerUploadLifecycle,
): boolean {
  return (
    (from === "active" && (to === "replaced" || to === "removed" || to === "expired")) ||
    ((from === "replaced" || from === "removed" || from === "expired" || from === "cleanup_failed") && to === "cleanup_pending") ||
    (from === "cleanup_pending" && (to === "cleanup_completed" || to === "cleanup_failed"))
  );
}

/**
 * Uses an explicit observation time so tests and callers do not need a hidden
 * global clock. An expiry duration remains a deployment/business decision.
 */
export function hasCustomerUploadExpiryElapsed(
  receipt: CustomerUploadReceipt,
  observedAt: CustomerUploadTimestamp,
): boolean {
  return isTimestamp(observedAt) && Date.parse(receipt.expiresAt) <= Date.parse(observedAt);
}
