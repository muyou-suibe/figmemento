import type { ProductAsset } from "../domain/catalog/index.ts";

export interface PublicProductAssetView {
  id: string;
  productId: string;
  variantId?: string;
  mediaType: "image" | "video";
  role: "thumbnail" | "gallery" | "detail" | "example" | "seo";
  position: number;
  description: string;
  source: { kind: "url" | "public_reference"; value: string };
}

export interface ProductAssetSelection {
  primary?: PublicProductAssetView;
  items: readonly PublicProductAssetView[];
}

export function recordProductAssetFailure(
  failedAssetIds: ReadonlySet<string>,
  assetId: string,
): ReadonlySet<string> {
  return new Set([...failedAssetIds, assetId]);
}

export function isRenderablePublicAssetUrl(source: PublicProductAssetView["source"]): boolean {
  if (source.kind !== "url" || /\s/.test(source.value)) return false;
  try {
    return new URL(source.value).protocol === "https:";
  } catch {
    return false;
  }
}

function compareAssets(left: PublicProductAssetView, right: PublicProductAssetView): number {
  return left.position - right.position || left.id.localeCompare(right.id);
}

export function toPublicProductAssetViews(
  productId: string,
  productName: string,
  assets: readonly ProductAsset[],
): readonly PublicProductAssetView[] {
  return assets
    .filter((asset) => asset.productId === productId && asset.visibility === "public")
    .map((asset) => ({
      id: asset.id,
      productId: asset.productId,
      ...(asset.variantId ? { variantId: asset.variantId } : {}),
      mediaType: asset.mediaType,
      role: asset.role,
      position: asset.position,
      description: asset.altText ?? asset.title ?? `${productName} ${asset.role} ${asset.mediaType}`,
      source: { ...asset.source },
    }))
    .sort(compareAssets);
}

export function selectProductAssetViews(
  assets: readonly PublicProductAssetView[],
  productId: string,
  selectedVariantId: string | null,
): ProductAssetSelection {
  const productAssets = assets
    .filter((asset) => asset.productId === productId && asset.variantId === undefined)
    .sort(compareAssets);
  const selectedVariantAssets = selectedVariantId
    ? assets
        .filter((asset) => asset.productId === productId && asset.variantId === selectedVariantId)
        .sort(compareAssets)
    : [];
  const primary = selectedVariantAssets[0] ?? productAssets[0];
  const items = [...selectedVariantAssets, ...productAssets]
    .filter((asset, index, values) => values.findIndex((candidate) => candidate.id === asset.id) === index);
  return {
    ...(primary ? { primary } : {}),
    items,
  };
}
