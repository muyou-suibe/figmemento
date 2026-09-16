import type {
  AllowedImageMimeType,
  CustomizationDimensions,
  ImageCustomizationFieldConstraints,
} from "./customization-field.ts";
import { classifyCustomizationImageDimensions } from "./customization-image-quality.ts";

/**
 * Browser-known values are deliberately hints only. A successful preflight
 * allows an upload attempt; it never creates receipt metadata or proves that
 * the bytes will pass server inspection.
 */
export interface CustomerImagePreflightInput {
  readonly declaredContentType?: string;
  readonly declaredByteSize: number;
  readonly originalFilename?: string;
  readonly decodedDimensions?: CustomizationDimensions;
  readonly intendedImageCount?: number;
}

/**
 * This is the server-derived input for a future receipt issuer. It has no
 * receipt, owner, expiry, lifecycle, object-store, or provider information.
 */
export interface InspectedCustomerImage {
  readonly contentType: AllowedImageMimeType;
  readonly byteSize: number;
  readonly dimensions: CustomizationDimensions;
  readonly safeOriginalFilename?: string;
}

export type CustomerImageValidationIssueCode =
  | "unsupported_type"
  | "invalid_image"
  | "too_large"
  | "dimensions_too_small"
  | "invalid_filename"
  | "count_too_low"
  | "count_too_high";

export type CustomerImageWarningCode =
  | "below_recommended_dimensions"
  | "declared_mime_mismatch"
  | "declared_byte_size_mismatch";

export interface CustomerImageValidationIssue {
  readonly code: CustomerImageValidationIssueCode;
  readonly message: string;
}

export interface CustomerImageWarning {
  readonly code: CustomerImageWarningCode;
  readonly message: string;
}

export interface CustomerImagePreflightResult {
  /** Advisory only: server inspection is still required before acceptance. */
  readonly canAttemptUpload: boolean;
  readonly issues: readonly CustomerImageValidationIssue[];
  readonly warnings: readonly CustomerImageWarning[];
}

export type CustomerImageInspectionResult =
  | {
      readonly accepted: true;
      readonly image: InspectedCustomerImage;
      readonly warnings: readonly CustomerImageWarning[];
    }
  | {
      readonly accepted: false;
      readonly issues: readonly CustomerImageValidationIssue[];
      readonly warnings: readonly CustomerImageWarning[];
    };

export type CustomerImageCountValidationResult =
  | { readonly valid: true; readonly issues: readonly [] }
  | { readonly valid: false; readonly issues: readonly CustomerImageValidationIssue[] };

const SUPPORTED_TYPES: readonly AllowedImageMimeType[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const JPEG_SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
  0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

function issue(
  code: CustomerImageValidationIssueCode,
  message: string,
): CustomerImageValidationIssue {
  return { code, message };
}

function warning(code: CustomerImageWarningCode, message: string): CustomerImageWarning {
  return { code, message };
}

function readUint16BE(bytes: Uint8Array, offset: number): number | undefined {
  if (offset < 0 || offset + 2 > bytes.length) return undefined;
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readUint16LE(bytes: Uint8Array, offset: number): number | undefined {
  if (offset < 0 || offset + 2 > bytes.length) return undefined;
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint24LE(bytes: Uint8Array, offset: number): number | undefined {
  if (offset < 0 || offset + 3 > bytes.length) return undefined;
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function readUint32BE(bytes: Uint8Array, offset: number): number | undefined {
  if (offset < 0 || offset + 4 > bytes.length) return undefined;
  return (
    bytes[offset] * 0x1_0000_00 +
    (bytes[offset + 1] << 16) +
    (bytes[offset + 2] << 8) +
    bytes[offset + 3]
  );
}

function readUint32LE(bytes: Uint8Array, offset: number): number | undefined {
  if (offset < 0 || offset + 4 > bytes.length) return undefined;
  return (
    bytes[offset] +
    bytes[offset + 1] * 0x100 +
    bytes[offset + 2] * 0x1_0000 +
    bytes[offset + 3] * 0x1_0000_00
  );
}

function hasBytes(bytes: Uint8Array, offset: number, expected: ArrayLike<number>): boolean {
  for (let index = 0; index < expected.length; index += 1) {
    if (bytes[offset + index] !== expected[index]) return false;
  }
  return true;
}

function isPositiveDimension(value: number | undefined): value is number {
  return value !== undefined && Number.isInteger(value) && value > 0;
}

function isValidPngColorDepth(colorType: number, bitDepth: number): boolean {
  return (
    (colorType === 0 && [1, 2, 4, 8, 16].includes(bitDepth)) ||
    (colorType === 2 && [8, 16].includes(bitDepth)) ||
    (colorType === 3 && [1, 2, 4, 8].includes(bitDepth)) ||
    (colorType === 4 && [8, 16].includes(bitDepth)) ||
    (colorType === 6 && [8, 16].includes(bitDepth))
  );
}

function inspectPngDimensions(bytes: Uint8Array): CustomizationDimensions | undefined {
  if (!hasBytes(bytes, 0, PNG_SIGNATURE)) return undefined;
  if (bytes.length < 45) return undefined;

  let offset = 8;
  let sawIhdr = false;
  let sawIdat = false;
  let sawIend = false;

  while (offset + 12 <= bytes.length) {
    const length = readUint32BE(bytes, offset);
    if (length === undefined) return undefined;
    const dataOffset = offset + 8;
    const nextOffset = dataOffset + length + 4;
    if (!Number.isSafeInteger(nextOffset) || nextOffset > bytes.length) return undefined;
    const type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));

    if (!sawIhdr) {
      if (type !== "IHDR" || length !== 13) return undefined;
      const width = readUint32BE(bytes, dataOffset);
      const height = readUint32BE(bytes, dataOffset + 4);
      const bitDepth = bytes[dataOffset + 8];
      const colorType = bytes[dataOffset + 9];
      if (
        !isPositiveDimension(width) || !isPositiveDimension(height) ||
        !isValidPngColorDepth(colorType, bitDepth) ||
        bytes[dataOffset + 10] !== 0 || bytes[dataOffset + 11] !== 0 ||
        ![0, 1].includes(bytes[dataOffset + 12])
      ) return undefined;
      sawIhdr = true;
      offset = nextOffset;
      continue;
    }

    if (type === "IDAT") sawIdat = true;
    if (type === "IEND") {
      if (length !== 0 || !sawIdat) return undefined;
      sawIend = true;
      break;
    }
    offset = nextOffset;
  }

  if (!sawIhdr || !sawIdat || !sawIend) return undefined;
  return {
    width: readUint32BE(bytes, 16) as number,
    height: readUint32BE(bytes, 20) as number,
  };
}

function inspectJpegDimensions(bytes: Uint8Array): CustomizationDimensions | undefined {
  if (!hasBytes(bytes, 0, [0xff, 0xd8])) return undefined;

  let offset = 2;
  let dimensions: CustomizationDimensions | undefined;
  let sawStartOfScan = false;

  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) return undefined;
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    offset += 1;
    if (marker === undefined || marker === 0x00) return undefined;
    if (marker === 0xd9) return sawStartOfScan && dimensions ? dimensions : undefined;
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) continue;

    const length = readUint16BE(bytes, offset);
    if (length === undefined || length < 2 || offset + length > bytes.length) return undefined;
    const dataOffset = offset + 2;

    if (JPEG_SOF_MARKERS.has(marker)) {
      const height = readUint16BE(bytes, dataOffset + 1);
      const width = readUint16BE(bytes, dataOffset + 3);
      const components = bytes[dataOffset + 5];
      if (
        !isPositiveDimension(width) || !isPositiveDimension(height) ||
        components === undefined || components === 0 || length !== 8 + components * 3
      ) return undefined;
      dimensions = { width, height };
    }

    if (marker === 0xda) {
      if (!dimensions || length < 8) return undefined;
      sawStartOfScan = true;
      offset += length;
      while (offset < bytes.length - 1) {
        if (bytes[offset] !== 0xff) {
          offset += 1;
          continue;
        }
        let markerOffset = offset + 1;
        while (bytes[markerOffset] === 0xff) markerOffset += 1;
        const scanMarker = bytes[markerOffset];
        if (scanMarker === undefined) return undefined;
        if (scanMarker === 0x00 || (scanMarker >= 0xd0 && scanMarker <= 0xd7)) {
          offset = markerOffset + 1;
          continue;
        }
        if (scanMarker === 0xd9) return dimensions;
        return undefined;
      }
      return undefined;
    }

    offset += length;
  }
  return undefined;
}

function fourCc(bytes: Uint8Array, offset: number): string | undefined {
  if (offset < 0 || offset + 4 > bytes.length) return undefined;
  return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
}

function inspectWebpChunkDimensions(
  type: string,
  bytes: Uint8Array,
  offset: number,
  length: number,
): CustomizationDimensions | undefined {
  if (type === "VP8 ") {
    if (length < 10 || !hasBytes(bytes, offset + 3, [0x9d, 0x01, 0x2a])) return undefined;
    const rawWidth = readUint16LE(bytes, offset + 6);
    const rawHeight = readUint16LE(bytes, offset + 8);
    const width = rawWidth === undefined ? undefined : rawWidth & 0x3fff;
    const height = rawHeight === undefined ? undefined : rawHeight & 0x3fff;
    return isPositiveDimension(width) && isPositiveDimension(height) ? { width, height } : undefined;
  }
  if (type === "VP8L") {
    if (length < 5 || bytes[offset] !== 0x2f) return undefined;
    const width = 1 + bytes[offset + 1] + ((bytes[offset + 2] & 0x3f) << 8);
    const height = 1 + (bytes[offset + 2] >> 6) + (bytes[offset + 3] << 2) + ((bytes[offset + 4] & 0x0f) << 10);
    return isPositiveDimension(width) && isPositiveDimension(height) ? { width, height } : undefined;
  }
  if (type === "VP8X") {
    if (length < 10) return undefined;
    const encodedWidth = readUint24LE(bytes, offset + 4);
    const encodedHeight = readUint24LE(bytes, offset + 7);
    const width = encodedWidth === undefined ? undefined : encodedWidth + 1;
    const height = encodedHeight === undefined ? undefined : encodedHeight + 1;
    return isPositiveDimension(width) && isPositiveDimension(height) ? { width, height } : undefined;
  }
  return undefined;
}

function inspectWebpDimensions(bytes: Uint8Array): CustomizationDimensions | undefined {
  if (fourCc(bytes, 0) !== "RIFF" || fourCc(bytes, 8) !== "WEBP") return undefined;
  const declaredSize = readUint32LE(bytes, 4);
  if (declaredSize === undefined || declaredSize + 8 !== bytes.length) return undefined;

  let offset = 12;
  let extendedCanvas: CustomizationDimensions | undefined;
  while (offset + 8 <= bytes.length) {
    const type = fourCc(bytes, offset);
    const length = readUint32LE(bytes, offset + 4);
    if (!type || length === undefined) return undefined;
    const dataOffset = offset + 8;
    const paddedLength = length + (length % 2);
    const nextOffset = dataOffset + paddedLength;
    if (!Number.isSafeInteger(nextOffset) || nextOffset > bytes.length) return undefined;

    if (type === "VP8X") {
      // VP8X is canvas metadata only. Static extended WebP remains unsupported
      // until a later VP8/VP8L image payload proves the bytes contain an image.
      if (extendedCanvas || length !== 10 || (bytes[dataOffset] & 0x02) !== 0) return undefined;
      extendedCanvas = inspectWebpChunkDimensions(type, bytes, dataOffset, length);
      if (!extendedCanvas) return undefined;
      offset = nextOffset;
      continue;
    }

    if (type === "ANIM" || type === "ANMF") return undefined;

    if (type === "VP8 " || type === "VP8L") {
      const payloadDimensions = inspectWebpChunkDimensions(type, bytes, dataOffset, length);
      if (!payloadDimensions) return undefined;
      if (!extendedCanvas) return payloadDimensions;
      return (
        payloadDimensions.width === extendedCanvas.width
        && payloadDimensions.height === extendedCanvas.height
      ) ? extendedCanvas : undefined;
    }
    offset = nextOffset;
  }
  return undefined;
}

function inspectImageStructure(bytes: Uint8Array): {
  contentType: AllowedImageMimeType;
  dimensions: CustomizationDimensions;
} | undefined {
  const png = inspectPngDimensions(bytes);
  if (png) return { contentType: "image/png", dimensions: png };
  const jpeg = inspectJpegDimensions(bytes);
  if (jpeg) return { contentType: "image/jpeg", dimensions: jpeg };
  const webp = inspectWebpDimensions(bytes);
  return webp ? { contentType: "image/webp", dimensions: webp } : undefined;
}

/**
 * Browser filename input is untrusted display metadata, never an object name.
 * It intentionally rejects paths (including browser fake paths), controls, and
 * overlong values rather than deriving a storage locator from them.
 */
export function normalizeCustomerUploadFilename(
  value: string | undefined,
): { readonly ok: true; readonly value?: string } | { readonly ok: false } {
  if (value === undefined) return { ok: true };
  if (typeof value !== "string" || /[\\/\u0000-\u001f\u007f]/.test(value)) return { ok: false };
  const normalized = value.normalize("NFC").trim();
  if (normalized.length === 0 || normalized.length > 255 || /[\\/\u0000-\u001f\u007f]/.test(normalized)) return { ok: false };
  return { ok: true, value: normalized };
}

export function validateCustomerImageFieldCount(
  constraints: ImageCustomizationFieldConstraints,
  imageCount: number,
): CustomerImageCountValidationResult {
  if (!Number.isInteger(imageCount) || imageCount < constraints.minImageCount) {
    return { valid: false, issues: [issue("count_too_low", "Image count is below the configured minimum.")] };
  }
  if (imageCount > constraints.maxImageCount) {
    return { valid: false, issues: [issue("count_too_high", "Image count exceeds the configured maximum.")] };
  }
  return { valid: true, issues: [] };
}

function qualityWarnings(
  constraints: ImageCustomizationFieldConstraints,
  dimensions: CustomizationDimensions,
): readonly CustomerImageWarning[] {
  return classifyCustomizationImageDimensions(constraints, dimensions).state === "below_recommended"
    ? [warning("below_recommended_dimensions", "Image dimensions are below the configured recommendation.")]
    : [];
}

/**
 * Pure client-side UX feedback. Browser File metadata and optional client
 * dimensions remain untrusted hints and this result cannot create a receipt.
 */
export function preflightCustomerImage(
  input: CustomerImagePreflightInput,
  constraints: ImageCustomizationFieldConstraints,
): CustomerImagePreflightResult {
  const issues: CustomerImageValidationIssue[] = [];
  const filename = normalizeCustomerUploadFilename(input.originalFilename);
  if (!filename.ok) issues.push(issue("invalid_filename", "Filename is not a safe display value."));
  if (!SUPPORTED_TYPES.includes(input.declaredContentType as AllowedImageMimeType)) {
    issues.push(issue("unsupported_type", "Choose a JPEG, PNG, or WebP image."));
  } else if (!constraints.allowedMimeTypes.includes(input.declaredContentType as AllowedImageMimeType)) {
    issues.push(issue("unsupported_type", "This image type is not allowed for this field."));
  }
  if (!Number.isInteger(input.declaredByteSize) || input.declaredByteSize <= 0) {
    issues.push(issue("invalid_image", "Choose a non-empty image file."));
  } else if (input.declaredByteSize > constraints.maxBytes) {
    issues.push(issue("too_large", "Image byte size exceeds the configured maximum."));
  }
  if (
    input.decodedDimensions &&
    (input.decodedDimensions.width < constraints.minDimensions.width || input.decodedDimensions.height < constraints.minDimensions.height)
  ) issues.push(issue("dimensions_too_small", "Image dimensions are below the configured minimum."));
  if (input.intendedImageCount !== undefined) {
    const count = validateCustomerImageFieldCount(constraints, input.intendedImageCount);
    if (!count.valid) issues.push(...count.issues);
  }
  return {
    canAttemptUpload: issues.length === 0,
    issues,
    warnings: input.decodedDimensions ? qualityWarnings(constraints, input.decodedDimensions) : [],
  };
}

/**
 * Server-authoritative inspection of received bytes. The Uint8Array's actual
 * length is used rather than declared size/Content-Length. A later streaming
 * boundary must cap bytes while reading before invoking this pure inspector.
 */
export function inspectCustomerImageBytes(
  input: {
    readonly bytes: Uint8Array;
    readonly originalFilename?: string;
    readonly declaredContentType?: string;
    readonly declaredByteSize?: number;
  },
  constraints: ImageCustomizationFieldConstraints,
): CustomerImageInspectionResult {
  const issues: CustomerImageValidationIssue[] = [];
  const warnings: CustomerImageWarning[] = [];
  const filename = normalizeCustomerUploadFilename(input.originalFilename);
  const safeOriginalFilename = filename.ok ? filename.value : undefined;
  if (!filename.ok) issues.push(issue("invalid_filename", "Filename is not a safe display value."));
  const byteSize = input.bytes.byteLength;
  if (byteSize === 0) issues.push(issue("invalid_image", "Image bytes must not be empty."));
  if (byteSize > constraints.maxBytes) issues.push(issue("too_large", "Image byte size exceeds the configured maximum."));

  const inspected = issues.some((entry) => entry.code === "invalid_filename" || entry.code === "too_large" || byteSize === 0)
    ? undefined
    : inspectImageStructure(input.bytes);
  if (!inspected && byteSize > 0 && !issues.some((entry) => entry.code === "too_large")) {
    issues.push(issue("invalid_image", "Image bytes are not a complete supported JPEG, PNG, or WebP structure."));
  }
  if (!inspected || issues.length > 0) return { accepted: false, issues, warnings };

  if (!constraints.allowedMimeTypes.includes(inspected.contentType)) {
    issues.push(issue("unsupported_type", "This detected image type is not allowed for this field."));
  }
  if (
    inspected.dimensions.width < constraints.minDimensions.width ||
    inspected.dimensions.height < constraints.minDimensions.height
  ) issues.push(issue("dimensions_too_small", "Image dimensions are below the configured minimum."));
  if (input.declaredContentType !== undefined && input.declaredContentType !== inspected.contentType) {
    warnings.push(warning("declared_mime_mismatch", "Declared image type does not match the detected image bytes."));
  }
  if (input.declaredByteSize !== undefined && input.declaredByteSize !== byteSize) {
    warnings.push(warning("declared_byte_size_mismatch", "Declared image byte size does not match received bytes."));
  }
  if (issues.length > 0) return { accepted: false, issues, warnings };
  return {
    accepted: true,
    image: {
      contentType: inspected.contentType,
      byteSize,
      dimensions: inspected.dimensions,
      ...(safeOriginalFilename ? { safeOriginalFilename } : {}),
    },
    warnings: [...warnings, ...qualityWarnings(constraints, inspected.dimensions)],
  };
}
