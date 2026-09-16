"use client";
/* eslint-disable @next/next/no-img-element -- ProductAsset URLs are provider-neutral public references. */

import Link from "next/link";
import { useState } from "react";
import { formatListingPrice } from "../application/catalog-storefront";
import type { PublicCatalogProductSummary } from "../application/catalog-repository";
import { isRenderablePublicAssetUrl } from "../application/catalog-assets";
import type { Category, ProductAsset } from "../domain/catalog";
import styles from "./catalog-storefront.module.css";
import { useFusionReveal } from "./FusionReveal";
import { ReferenceText, useReferenceLanguage } from "./ReferenceLanguageProvider";

function ProductAssetMedia({
  asset,
  label,
  fallbackLabel,
}: {
  asset?: ProductAsset;
  label: string;
  fallbackLabel?: string;
}) {
  const [failed, setFailed] = useState(false);
  const { t } = useReferenceLanguage();
  const isRenderableUrl = asset?.source.kind === "url" && isRenderablePublicAssetUrl(asset.source);

  if (!asset || !isRenderableUrl || failed) {
    if (fallbackLabel) {
      return (
        <span className={`${styles.discoveryMediaFallback} ${styles.referenceMediaFallback}`} role="img" aria-label={t(fallbackLabel)}>
          <small><ReferenceText>{fallbackLabel}</ReferenceText></small>
        </span>
      );
    }

    return (
      <span className={styles.discoveryMediaFallback} role="img" aria-label={`${label} ${t("marketing preview unavailable")}`}>
        <span aria-hidden="true">✦</span>
        <small>{t("Marketing preview unavailable")}</small>
      </span>
    );
  }

  if (asset.mediaType === "video") {
    return (
      <video
        className={styles.discoveryMedia}
        muted
        loop
        playsInline
        autoPlay
        preload="metadata"
        aria-label={label}
        onError={() => setFailed(true)}
      >
        <source src={asset.source.value} />
      </video>
    );
  }

  return (
    <img
      className={styles.discoveryMedia}
      src={asset.source.value}
      alt={asset.altText ?? label}
      onError={() => setFailed(true)}
    />
  );
}

export function CatalogProductCard({
  item,
  index = 0,
  presentation,
  shopPresentation,
}: {
  item: PublicCatalogProductSummary;
  index?: number;
  presentation?: ReferenceProductPresentation;
  shopPresentation?: ReferenceShopCardPresentation;
}) {
  const revealRef = useFusionReveal();
  const { t } = useReferenceLanguage();
  // Reference presentation controls geometry and decorative copy only. The
  // historical Catalog projection remains authoritative for all product facts.
  const visibleName = item.product.name;
  const visibleDescription = item.product.description;
  const visibleCategory = item.category.name;
  const hasReferencePresentation = Boolean(presentation || shopPresentation);
  const badgeText = shopPresentation?.badge ?? presentation?.badge;

  return (
    <article ref={hasReferencePresentation ? revealRef : undefined} className={`${styles.discoveryCard} ${hasReferencePresentation ? `${styles.referenceProductCard} ${styles.fusionReveal}` : ""}`} data-card-index={index}>
      <Link className={styles.discoveryCardLink} href={`/product/${item.product.slug}`} aria-label={`${t("View")} ${item.product.name}`}>
        <span className={styles.discoveryCardPin} aria-hidden="true" />
        <div className={styles.discoveryCardMedia}>
          <ProductAssetMedia asset={item.thumbnail} label={visibleName} fallbackLabel={presentation?.mediaLabel ?? shopPresentation?.mediaLabel} />
          <span className={styles.discoveryCardPeek} aria-hidden="true">{shopPresentation ? <ReferenceText>{shopPresentation.peek}</ReferenceText> : presentation ? <ReferenceText>{presentation.peek}</ReferenceText> : t("View details →")}</span>
        </div>
        <div className={styles.discoveryCardCopy}>
          <p className={styles.discoveryCardCategory}>{visibleCategory}</p>
          <h2 className={styles.discoveryCardName}>{visibleName}</h2>
          <p className={styles.discoveryCardDescription}>{visibleDescription}</p>
          <div className={styles.discoveryCardMeta}>
            <strong>{formatListingPrice(item.listingPrice)}</strong>
            {shopPresentation ? (
              <span className={styles.referenceProductRating}><ReferenceText>{shopPresentation.rating}</ReferenceText></span>
            ) : presentation ? (
              <span className={styles.referenceProductRating}><ReferenceText>{presentation.rating}</ReferenceText></span>
            ) : (
              <span className={styles.discoveryCardStatus}>{t("Available to explore")}</span>
            )}
          </div>
          {badgeText && <div className={`${styles.referenceProductBadge} ${shopPresentation?.badgeTone === "hot" ? styles.referenceProductBadgeHot : ""}`}><ReferenceText>{badgeText}</ReferenceText></div>}
        </div>
      </Link>
    </article>
  );
}

export type ReferenceProductPresentation = {
  category: string;
  mediaLabel: string;
  peek: string;
  name: string;
  description: string;
  price: string;
  rating: string;
  badge: string;
};

export type ReferenceShopCardPresentation = {
  peek: string;
  rating: string;
  badge: string;
  badgeTone: "hot" | "soft";
  mediaLabel?: string;
};

export function CatalogProductGrid({
  items,
  presentation,
  shopPresentation,
}: {
  items: readonly PublicCatalogProductSummary[];
  presentation?: readonly ReferenceProductPresentation[];
  shopPresentation?: readonly (ReferenceShopCardPresentation | undefined)[];
}) {
  return (
    <div className={styles.discoveryProductGrid}>
      {items.map((item, index) => <CatalogProductCard item={item} index={index} key={item.product.id} presentation={presentation?.[index]} shopPresentation={shopPresentation?.[index]} />)}
    </div>
  );
}

export function CatalogCategoryGuide({
  categories,
  products,
  reference = false,
}: {
  categories: readonly Category[];
  products: readonly PublicCatalogProductSummary[];
  reference?: boolean;
}) {
  const { t } = useReferenceLanguage();
  if (reference) {
    const referenceGuides = [
      { number: "No. 01–05", title: "3D Figurines", slug: "3d-figures", description: "Mini sculptures printed and painted by hand — keychains, couples, pets and families. Each begins with three photographs and ends with a 3–4 week wait that customers tell us is worth it." },
      { number: "No. 06–10, 14", title: "Custom Art", slug: "custom-crafts", description: "Portraits on canvas, leaf engravings carved from a single leaf, wood art burned and sealed by hand. The slowest pieces we make, and the ones we sign." },
      { number: "◆", title: "Pet Memorial", slug: "pet-memories", description: "Figurines, portraits and keepsakes for the ones who waited at the door — gathered from every drawer of the workshop into one quiet corner of the shop." },
      { number: "No. 11–13, 15–18", title: "Home & Living", slug: "home-living", description: "Pillows, puzzles, night lights, fridge magnets — and two-week tattoos — for memories that live on shelves, sofas and skin rather than frames. Made to be touched daily." },
      { number: "No. 19–21", title: "Digital Keepsakes", slug: "digital-gifts", description: "AI cartoon and painted portraits delivered within the hour, straight to your inbox. For gifts that cannot wait until tomorrow morning." },
      { number: "◆", title: "Gift Notes", description: "Every physical order ships with a handwritten card. Tell us what to write — or let us improvise. We are, apparently, good at this part." },
    ] as const;

    return (
      <section className={`${styles.discoveryCategoryGuide} ${styles.referenceFieldGuide}`} aria-labelledby="catalog-category-guide-title">
        <div className={styles.referenceFieldGuideHeading}>
          <h2 id="catalog-category-guide-title"><ReferenceText>A Field Guide to the Collections</ReferenceText></h2>
          <p><ReferenceText>what lives inside each drawer of the workshop</ReferenceText></p>
        </div>
        <div className={styles.referenceCategoryGrid}>
          {referenceGuides.map((guide) => {
            const guideSlug = "slug" in guide ? guide.slug : undefined;
            const category = guideSlug ? categories.find((candidate) => candidate.slug === guideSlug) : undefined;
            const content = (
              <>
                <span className={styles.referenceCategoryNumber}><ReferenceText>{guide.number}</ReferenceText></span>
                <h3><ReferenceText>{guide.title}</ReferenceText></h3>
                <p><ReferenceText>{guide.description}</ReferenceText></p>
              </>
            );
            return category ? (
              <Link className={styles.referenceCategoryCard} href={`/category/${category.slug}`} key={guide.title}>{content}</Link>
            ) : (
              <div className={styles.referenceCategoryCard} key={guide.title} aria-disabled="true">{content}</div>
            );
          })}
        </div>
      </section>
    );
  }

  const counts = new Map<string, number>();
  for (const item of products) counts.set(item.product.categoryId, (counts.get(item.product.categoryId) ?? 0) + 1);
  return (
    <section className={styles.discoveryCategoryGuide} aria-labelledby="catalog-category-guide-title">
      <div className={styles.discoverySectionHeading}>
        <div>
          <p className={styles.discoveryEyebrow}>{t("Find your way in")}</p>
          <h2 id="catalog-category-guide-title">{t("A small guide to the")} <em>{t("collection.")}</em></h2>
        </div>
        <p>{t("Each entry comes from the selected catalog source and leads to its own collection route.")}</p>
      </div>
      <div className={styles.discoveryCategoryGrid}>
        {categories.map((category, index) => (
          <Link className={styles.discoveryCategoryCard} href={`/category/${category.slug}`} key={category.id}>
            <span className={styles.discoveryCategoryNumber}>{String(index + 1).padStart(2, "0")} · {counts.get(category.id) ?? 0} {t("available")}</span>
            <h3>{category.name}</h3>
            <p>{category.description}</p>
            <span className={styles.discoveryTextLink}>{t("Open collection")} <span aria-hidden="true">→</span></span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function CatalogPolaroid({
  item,
  position,
  presentation,
}: {
  item?: PublicCatalogProductSummary;
  position: 1 | 2 | 3;
  presentation?: ReferencePolaroidPresentation;
}) {
  const { t } = useReferenceLanguage();
  const label = presentation?.mediaLabel ?? item?.product.name ?? "Catalog preview";
  return (
    <Link
      className={`${styles.discoveryPolaroid} ${styles[`discoveryPolaroid${position}`]}`}
      href={item ? `/product/${item.product.slug}` : "/shop"}
      aria-label={item ? `${t("View")} ${item.product.name}` : t("Open the catalog")}
    >
      {presentation && position !== 1 ? <span className={styles.referencePolaroidPin} aria-hidden="true">📌</span> : <span className={styles.discoveryPolaroidPin} aria-hidden="true" />}
      <div className={styles.discoveryPolaroidMedia}>
        {presentation ? <span className={styles.referencePolaroidMedia}><ReferenceText>{presentation.mediaLabel}</ReferenceText></span> : <ProductAssetMedia asset={item?.thumbnail} label={label} />}
      </div>
      <p>{presentation ? <ReferenceText>{presentation.caption}</ReferenceText> : item?.product.name ?? t("Catalog preview unavailable")}</p>
    </Link>
  );
}

export type ReferencePolaroidPresentation = {
  mediaLabel: string;
  caption: string;
};
