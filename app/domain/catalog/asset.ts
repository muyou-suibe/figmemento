import type { ProductVariant } from "./variant.ts";
import {
  isIdentifier,
  isNonEmptyString,
  isNonNegativeInteger,
  isPositiveInteger,
  isRecord,
  unknownFieldIssues,
  validationFailure,
  validationIssue,
  validationSuccess,
  type CatalogValidationResult,
} from "./validation.ts";

export type ProductAssetMediaType = "image" | "video";
export type ProductAssetRole =
  | "thumbnail"
  | "gallery"
  | "detail"
  | "example"
  | "seo";

export type PublicAssetSource =
  | { kind: "url"; value: string }
  | { kind: "public_reference"; value: string };

export interface ProductAsset {
  id: string;
  productId: string;
  variantId?: string;
  mediaType: ProductAssetMediaType;
  role: ProductAssetRole;
  position: number;
  altText?: string;
  title?: string;
  width?: number;
  height?: number;
  visibility: "public";
  source: PublicAssetSource;
}

const MEDIA_TYPES: readonly ProductAssetMediaType[] = ["image", "video"];
const ASSET_ROLES: readonly ProductAssetRole[] = [
  "thumbnail",
  "gallery",
  "detail",
  "example",
  "seo",
];

function parsePublicSource(
  value: unknown,
): CatalogValidationResult<PublicAssetSource> {
  if (!isRecord(value)) {
    return validationFailure(validationIssue("$.source", "invalid_type", "Asset source must be an object."));
  }
  const issues = unknownFieldIssues(value, ["kind", "value"], "$.source");
  if (value.kind !== "url" && value.kind !== "public_reference") {
    issues.push(validationIssue("$.source.kind", "invalid_value", "Asset source must be a public URL or provider-neutral public reference."));
  }
  if (!isNonEmptyString(value.value, 2_048)) {
    issues.push(validationIssue("$.source.value", "invalid_value", "Public asset reference is invalid."));
  } else if (/\s/.test(value.value)) {
    issues.push(validationIssue("$.source.value", "invalid_format", "Public asset sources must not contain whitespace."));
  } else if (value.kind === "url") {
    try {
      const url = new URL(value.value);
      if (url.protocol !== "https:") {
        issues.push(validationIssue("$.source.value", "invalid_format", "Public asset URLs must use HTTPS."));
      }
    } catch {
      issues.push(validationIssue("$.source.value", "invalid_format", "Public asset URL is invalid."));
    }
  } else if (
    value.kind === "public_reference" &&
    /^(?:private|customer|order|preview|delivery):/i.test(value.value)
  ) {
    issues.push(validationIssue("$.source.value", "invalid_format", "Reference must identify an already-public marketing asset."));
  }
  if (issues.length > 0) {
    return validationFailure(...issues);
  }
  return validationSuccess({
    kind: value.kind as PublicAssetSource["kind"],
    value: value.value as string,
  });
}

export function parseProductAsset(
  value: unknown,
): CatalogValidationResult<ProductAsset> {
  if (!isRecord(value)) {
    return validationFailure(validationIssue("$", "invalid_type", "Product asset must be an object."));
  }
  const issues = unknownFieldIssues(value, [
    "id",
    "productId",
    "variantId",
    "mediaType",
    "role",
    "position",
    "altText",
    "title",
    "width",
    "height",
    "visibility",
    "source",
  ]);
  if (!isIdentifier(value.id)) {
    issues.push(validationIssue("$.id", "invalid_format", "Asset ID is invalid."));
  }
  if (!isIdentifier(value.productId)) {
    issues.push(validationIssue("$.productId", "invalid_format", "Product ID is invalid."));
  }
  if (value.variantId !== undefined && value.variantId !== null && !isIdentifier(value.variantId)) {
    issues.push(validationIssue("$.variantId", "invalid_format", "Variant ID is invalid."));
  }
  if (!MEDIA_TYPES.includes(value.mediaType as ProductAssetMediaType)) {
    issues.push(validationIssue("$.mediaType", "invalid_value", "Media type must be image or video."));
  }
  if (!ASSET_ROLES.includes(value.role as ProductAssetRole)) {
    issues.push(validationIssue("$.role", "invalid_value", "Product asset role is unsupported."));
  }
  if (!isNonNegativeInteger(value.position)) {
    issues.push(validationIssue("$.position", "invalid_value", "Asset position must be a non-negative integer."));
  }
  if (value.altText !== undefined && !isNonEmptyString(value.altText, 500)) {
    issues.push(validationIssue("$.altText", "invalid_value", "Alt text must be non-empty and at most 500 characters."));
  }
  if (value.title !== undefined && !isNonEmptyString(value.title, 200)) {
    issues.push(validationIssue("$.title", "invalid_value", "Asset title must be non-empty and at most 200 characters."));
  }
  if (value.width !== undefined && !isPositiveInteger(value.width)) {
    issues.push(validationIssue("$.width", "invalid_value", "Asset width must be a positive integer."));
  }
  if (value.height !== undefined && !isPositiveInteger(value.height)) {
    issues.push(validationIssue("$.height", "invalid_value", "Asset height must be a positive integer."));
  }
  if (value.visibility !== "public") {
    issues.push(validationIssue("$.visibility", "invalid_value", "C1 ProductAssets must be public marketing metadata."));
  }
  const source = parsePublicSource(value.source);
  if (!source.ok) {
    issues.push(...source.issues);
  }
  if (issues.length > 0 || !source.ok) {
    return validationFailure(...issues);
  }
  return validationSuccess({
    id: value.id as string,
    productId: value.productId as string,
    ...(typeof value.variantId === "string" ? { variantId: value.variantId } : {}),
    mediaType: value.mediaType as ProductAssetMediaType,
    role: value.role as ProductAssetRole,
    position: value.position as number,
    ...(typeof value.altText === "string" ? { altText: value.altText } : {}),
    ...(typeof value.title === "string" ? { title: value.title } : {}),
    ...(typeof value.width === "number" ? { width: value.width } : {}),
    ...(typeof value.height === "number" ? { height: value.height } : {}),
    visibility: "public",
    source: source.value,
  });
}

export function validateProductAssetAssociation(
  asset: ProductAsset,
  variants: readonly ProductVariant[],
): CatalogValidationResult<true> {
  if (asset.variantId === undefined) {
    return validationSuccess(true);
  }
  const variant = variants.find((candidate) => candidate.id === asset.variantId);
  if (!variant || variant.productId !== asset.productId) {
    return validationFailure(validationIssue("$.variantId", "ownership", "Asset Variant must belong to the same Product."));
  }
  return validationSuccess(true);
}
