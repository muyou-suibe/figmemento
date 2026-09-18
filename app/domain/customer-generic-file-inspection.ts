import type { GenericFileCustomizationFieldConstraints } from "./customization-field.ts";
import { normalizeCustomerUploadFilename } from "./customer-image-inspection.ts";
import type { CustomerUploadContentType } from "./customer-upload.ts";

export interface CustomerGenericFileValidationIssue {
  readonly code: "file_count_too_low" | "file_count_too_high" | "file_metadata_missing" | "file_mime_not_allowed" | "file_too_large" | "invalid_file_metadata";
  readonly message: string;
}

export interface CustomerGenericFileWarning {
  readonly code: "declared_mime_ignored";
  readonly message: string;
}

export interface CustomerGenericFileInspectionAccepted {
  readonly accepted: true;
  readonly file: {
    readonly safeOriginalFilename?: string;
    readonly contentType: CustomerUploadContentType;
    readonly byteSize: number;
  };
  readonly warnings: readonly CustomerGenericFileWarning[];
}

export interface CustomerGenericFileInspectionRejected {
  readonly accepted: false;
  readonly issues: readonly CustomerGenericFileValidationIssue[];
  readonly warnings: readonly CustomerGenericFileWarning[];
}

export type CustomerGenericFileInspection = CustomerGenericFileInspectionAccepted | CustomerGenericFileInspectionRejected;

function startsWith(bytes: Uint8Array, prefix: readonly number[]): boolean {
  return prefix.every((byte, index) => bytes[index] === byte);
}

function isUtf8Text(bytes: Uint8Array): boolean {
  if (bytes.includes(0)) return false;
  try {
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return decoded.length > 0;
  } catch {
    return false;
  }
}

function detectContentType(bytes: Uint8Array): CustomerUploadContentType | null {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf";
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) || startsWith(bytes, [0x50, 0x4b, 0x05, 0x06])) {
    const text = new TextDecoder("latin1").decode(bytes);
    return text.includes("[Content_Types].xml") && text.includes("word/document.xml")
      ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      : "application/zip";
  }
  return isUtf8Text(bytes) ? "text/plain" : null;
}

/**
 * Detects a deliberately small, provider-neutral generic-file set from the
 * actual bytes. Browser MIME, dimensions, and size claims are never authority.
 */
export function inspectCustomerGenericFileBytes(input: {
  readonly bytes: Uint8Array;
  readonly constraints: GenericFileCustomizationFieldConstraints;
  readonly originalFilename?: string;
  readonly declaredContentType?: string;
}): CustomerGenericFileInspection {
  const warnings: CustomerGenericFileWarning[] = [];
  const issues: CustomerGenericFileValidationIssue[] = [];
  if (input.bytes.byteLength <= 0) {
    issues.push({ code: "file_metadata_missing", message: "The private file is empty." });
  }
  if (input.bytes.byteLength > input.constraints.maxBytes) {
    issues.push({ code: "file_too_large", message: "The private file exceeds the configured maximum." });
  }
  if (input.constraints.minFileCount > 1) {
    issues.push({ code: "file_count_too_low", message: "This upload request must contain the configured minimum number of files." });
  }
  if (input.constraints.maxFileCount < 1) {
    issues.push({ code: "file_count_too_high", message: "This field does not accept a private file." });
  }
  if (input.originalFilename !== undefined) {
    const filename = normalizeCustomerUploadFilename(input.originalFilename);
    if (!filename.ok) issues.push({ code: "invalid_file_metadata", message: "The private file name is invalid." });
  }
  const detected = detectContentType(input.bytes);
  if (!detected || !input.constraints.allowedMimeTypes.includes(detected as never)) {
    issues.push({ code: "file_mime_not_allowed", message: "The private file MIME type is not allowed." });
  }
  if (input.declaredContentType && detected && input.declaredContentType !== detected) {
    warnings.push({ code: "declared_mime_ignored", message: "The browser MIME claim was ignored; the file bytes were inspected." });
  }
  if (issues.length > 0 || !detected) return { accepted: false, issues, warnings };
  const filename = input.originalFilename === undefined ? undefined : normalizeCustomerUploadFilename(input.originalFilename);
  return {
    accepted: true,
    file: {
      ...(filename?.ok ? { safeOriginalFilename: filename.value } : {}),
      contentType: detected,
      byteSize: input.bytes.byteLength,
    },
    warnings,
  };
}
