"use client";
/* eslint-disable @next/next/no-img-element -- public ProductAsset URLs are provider-neutral. */

import { useMemo, useState } from "react";
import {
  isRenderablePublicAssetUrl,
  recordProductAssetFailure,
  selectProductAssetViews,
  type PublicProductAssetView,
} from "../application/catalog-assets";
import styles from "./catalog-storefront.module.css";
import { useReferenceLanguage } from "./ReferenceLanguageProvider";

function AssetFallback({ asset }: { asset?: PublicProductAssetView }) {
  const { t } = useReferenceLanguage();
  return (
    <div className={styles.assetFallback} role="img" aria-label={asset?.description ?? t("Product media unavailable")}>
      <span aria-hidden="true">✦</span>
      <small>{asset ? `${t(asset.role)} ${t("media unavailable")}` : t("Product media coming soon")}</small>
    </div>
  );
}

function AssetMedia({
  asset,
  failed,
  onFailure,
  compact = false,
}: {
  asset: PublicProductAssetView;
  failed: boolean;
  onFailure: () => void;
  compact?: boolean;
}) {
  if (failed || !isRenderablePublicAssetUrl(asset.source)) return <AssetFallback asset={asset} />;
  if (asset.mediaType === "video") {
    return (
      <video
        className={compact ? styles.assetThumbnailMedia : styles.heroImage}
        src={asset.source.value}
        controls={!compact}
        muted={compact}
        preload="metadata"
        aria-label={asset.description}
        onError={onFailure}
      />
    );
  }
  return (
    <img
      className={compact ? styles.assetThumbnailMedia : styles.heroImage}
      src={asset.source.value}
      alt={asset.description}
      onError={onFailure}
    />
  );
}

export function ProductAssetGallery({
  productId,
  assets,
  selectedVariantId,
}: {
  productId: string;
  assets: readonly PublicProductAssetView[];
  selectedVariantId: string | null;
}) {
  const { t } = useReferenceLanguage();
  const selection = useMemo(
    () => selectProductAssetViews(assets, productId, selectedVariantId),
    [assets, productId, selectedVariantId],
  );
  const selectionKey = selectedVariantId ?? "product-level";
  const [manualSelection, setManualSelection] = useState<{
    selectionKey: string;
    assetId: string;
  } | null>(null);
  const [failedAssetIds, setFailedAssetIds] = useState<ReadonlySet<string>>(() => new Set());
  const activeAssetId = manualSelection?.selectionKey === selectionKey
    ? manualSelection.assetId
    : selection.primary?.id;
  const activeAsset = selection.items.find((asset) => asset.id === activeAssetId) ?? selection.primary;
  const markFailed = (assetId: string) => {
    setFailedAssetIds((current) => recordProductAssetFailure(current, assetId));
  };

  return (
    <section className={styles.assetGallery} aria-label={t("Product media")}>
      <div
        className={styles.heroMedia}
        data-asset-id={activeAsset?.id}
        data-asset-role={activeAsset?.role}
      >
        {activeAsset ? (
          <AssetMedia
            asset={activeAsset}
            failed={failedAssetIds.has(activeAsset.id)}
            onFailure={() => markFailed(activeAsset.id)}
          />
        ) : (
          <AssetFallback />
        )}
      </div>
      {activeAsset && <p className={styles.fusionPdpAssetCaption}>{activeAsset.description}</p>}
      {selection.items.length > 1 && (
        <div className={styles.assetThumbnails} role="group" aria-label={t("Choose product media")}>
          {selection.items.map((asset) => (
            <button
              className={`${styles.assetThumbnail} ${activeAsset?.id === asset.id ? styles.assetThumbnailActive : ""}`}
              type="button"
              key={asset.id}
              onClick={() => setManualSelection({ selectionKey, assetId: asset.id })}
              aria-label={`${t("Show")} ${asset.description}`}
              aria-pressed={activeAsset?.id === asset.id}
              data-media-type={asset.mediaType}
              data-asset-role={asset.role}
            >
              <AssetMedia
                asset={asset}
                failed={failedAssetIds.has(asset.id)}
                onFailure={() => markFailed(asset.id)}
                compact
              />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
