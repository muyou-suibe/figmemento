"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import {
  filterCatalogProducts,
} from "../application/catalog-storefront";
import type { PublicCatalogProductSummary } from "../application/catalog-repository";
import type { Category } from "../domain/catalog";
import { CatalogProductGrid, type ReferenceShopCardPresentation } from "./CatalogDiscovery";
import styles from "./catalog-storefront.module.css";
import { useReferenceLanguage } from "./ReferenceLanguageProvider";

// CatalogProductGrid owns formatListingPrice for every rendered listing.

export interface CatalogBrowserProps {
  categories: readonly Category[];
  products: readonly PublicCatalogProductSummary[];
  fixedCategoryId?: string;
  referenceShop?: boolean;
}

const REFERENCE_SHOP_FILTERS = [
  { label: "All 21" },
  { label: "3D Figurines (5)", slug: "3d-figures" },
  { label: "Custom Art (6)", slug: "custom-crafts" },
  { label: "Pet Memorial", slug: "pet-memories" },
  { label: "Home & Living (7)", slug: "home-living", unsupported: true },
  { label: "Digital (3)", slug: "digital-gifts" },
] as const;

const REFERENCE_SHOP_SORTS = [
  "workshop favourites",
  "price, low to high",
  "most reviewed",
  "newest",
] as const;

type ReferenceShopSort = typeof REFERENCE_SHOP_SORTS[number];

const REFERENCE_SHOP_CARD_DECORATIONS: readonly ReferenceShopCardPresentation[] = [
  { mediaLabel: "Figurine #1", peek: "bestseller", rating: "★ 4.9 · 128", badge: "Bestseller", badgeTone: "hot" },
  { mediaLabel: "Figurine #2", peek: "for two", rating: "★ 4.8 · 94", badge: "Anniversary", badgeTone: "soft" },
  { mediaLabel: "Figurine #3", peek: "any breed", rating: "★ 4.9 · 203", badge: "Most loved", badgeTone: "soft" },
  { mediaLabel: "Portrait #6", peek: "on canvas", rating: "★ 4.7 · 67", badge: "New", badgeTone: "soft" },
  { mediaLabel: "Leaf #10", peek: "one of a kind", rating: "★ 4.8 · 41", badge: "One of a kind", badgeTone: "soft" },
  { mediaLabel: "Pillow #12", peek: "so soft", rating: "★ 4.6 · 58", badge: "Cozy", badgeTone: "soft" },
  { mediaLabel: "Tattoo #15", peek: "temporary", rating: "★ 4.5 · 33", badge: "Under $15", badgeTone: "soft" },
  { mediaLabel: "Digital #19", peek: "in 1 hour", rating: "★ 4.6 · 87", badge: "1-hour delivery", badgeTone: "hot" },
];

/**
 * Shop decoration is presentation-only. The map is built from the current
 * visible product order so each discovery state keeps the reference card
 * treatment aligned with its visual slot.
 */
export function createReferenceShopPresentationMap(
  products: readonly PublicCatalogProductSummary[],
): ReadonlyMap<string, ReferenceShopCardPresentation> {
  const assignments = new Map<string, ReferenceShopCardPresentation>();
  products.forEach((item, index) => {
    const decoration = REFERENCE_SHOP_CARD_DECORATIONS[index % REFERENCE_SHOP_CARD_DECORATIONS.length];
    if (decoration) assignments.set(item.product.id, decoration);
  });
  return assignments;
}

function listingPriceCents(item: PublicCatalogProductSummary): number {
  return item.listingPrice.kind === "single" ? item.listingPrice.priceCents : item.listingPrice.minPriceCents;
}

function sortShopProducts(
  products: readonly PublicCatalogProductSummary[],
  sort: ReferenceShopSort,
): readonly PublicCatalogProductSummary[] {
  if (sort !== "price, low to high") return products;
  return [...products].sort((left, right) =>
    listingPriceCents(left) - listingPriceCents(right) || left.product.name.localeCompare(right.product.name, "en-US"),
  );
}

function subscribeToLocation(onChange: () => void): () => void {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
}

function readLocationQuery(): string {
  return new URLSearchParams(window.location.search).get("q")?.trim() ?? "";
}

export function CatalogBrowser({ categories, products, fixedCategoryId, referenceShop = false }: CatalogBrowserProps) {
  const { t } = useReferenceLanguage();
  const urlQuery = useSyncExternalStore(subscribeToLocation, readLocationQuery, () => "");
  const [localQuery, setLocalQuery] = useState<string | null>(null);
  const query = localQuery ?? urlQuery;
  const [categoryId, setCategoryId] = useState<string | undefined>(fixedCategoryId);
  const filteredProducts = useMemo(
    () => filterCatalogProducts(products, { query, categoryId: fixedCategoryId ?? categoryId }),
    [categoryId, fixedCategoryId, products, query],
  );
  const [sort, setSort] = useState<ReferenceShopSort>("workshop favourites");
  const visibleProducts = useMemo(() => sortShopProducts(filteredProducts, sort), [filteredProducts, sort]);
  const referenceShopPresentationMap = useMemo(
    () => createReferenceShopPresentationMap(visibleProducts),
    [visibleProducts],
  );

  const reset = () => {
    setLocalQuery("");
    if (!fixedCategoryId) setCategoryId(undefined);
  };

  return (
    <section className={`${styles.discoveryBrowser} ${referenceShop ? styles.referenceShopBrowser : ""}`} aria-label={t("Catalog discovery")}>
      <div className={styles.discoveryControls}>
        <label className={`${styles.searchLabel} ${referenceShop ? styles.referenceShopAccessibleSearch : ""}`}>
          {t("Find a keepsake")}
          <input
            className={styles.discoverySearchInput}
            id="catalog-search"
            type="search"
            value={query}
            onChange={(event) => setLocalQuery(event.target.value)}
            placeholder={t("Try portrait, pet, figure…")}
          />
        </label>
        {!fixedCategoryId && !referenceShop && (
          <div className={styles.discoveryCategoryFilters} aria-label={t("Filter by category")}>
            <button
              className={`${styles.discoveryFilterButton} ${categoryId === undefined ? styles.discoveryFilterActive : ""}`}
              type="button"
              onClick={() => setCategoryId(undefined)}
              aria-pressed={categoryId === undefined}
            >
              {t("All gifts")}
            </button>
            {categories.map((category) => (
              <button
                className={`${styles.discoveryFilterButton} ${categoryId === category.id ? styles.discoveryFilterActive : ""}`}
                type="button"
                key={category.id}
                onClick={() => setCategoryId(category.id)}
                aria-pressed={categoryId === category.id}
              >
                {category.name}
              </button>
            ))}
          </div>
        )}
        {referenceShop && !fixedCategoryId && (
          <div className={styles.referenceShopBar}>
            <div className={styles.referenceShopFilters} aria-label={t("Filter by collection")}>
              {REFERENCE_SHOP_FILTERS.map((filter, index) => {
                const filterSlug = "slug" in filter ? filter.slug : undefined;
                const category = filterSlug ? categories.find((candidate) => candidate.slug === filterSlug) : undefined;
                const active = index === 0 ? categoryId === undefined : categoryId === category?.id;
                const unavailable = Boolean(("unsupported" in filter && filter.unsupported) || (filterSlug && !category));
                return (
                  <button
                    className={`${styles.referenceShopFilter} ${active ? styles.referenceShopFilterActive : ""}`}
                    type="button"
                    key={filter.label}
                    onClick={() => { if (!unavailable) setCategoryId(index === 0 ? undefined : category?.id); }}
                    aria-pressed={active}
                    aria-disabled={unavailable}
                    disabled={unavailable}
                  >
                    {t(filter.label)}
                  </button>
                );
              })}
            </div>
            <label className={styles.referenceShopSort}>
              <span>{t("sorted by")}</span>
              <select value={sort} onChange={(event) => setSort(event.target.value as ReferenceShopSort)}>
                {REFERENCE_SHOP_SORTS.map((option) => <option key={option}>{t(option)}</option>)}
              </select>
            </label>
          </div>
        )}
      </div>
      <p className={`${styles.discoveryResultsSummary} ${referenceShop ? styles.referenceShopResultsSummary : ""}`} aria-live="polite">
        {visibleProducts.length} {t(visibleProducts.length === 1 ? "keepsake" : "keepsakes")} {t("in view")}
      </p>
      {visibleProducts.length > 0 ? (
        <CatalogProductGrid
          items={visibleProducts}
          shopPresentation={referenceShop ? visibleProducts.map((item) => referenceShopPresentationMap.get(item.product.id)) : undefined}
        />
      ) : (
        <div className={styles.discoveryEmpty} role="status">
          <p className={styles.discoveryEyebrow}>{t("A quiet corner")}</p>
          <h2>{t("No keepsakes match those filters.")}</h2>
          <p>{t("Try another phrase or return to the full collection.")}</p>
          <button className={styles.discoveryResetButton} type="button" onClick={reset}>{t("Show available keepsakes")}</button>
        </div>
      )}
    </section>
  );
}
