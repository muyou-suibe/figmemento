"use client";

import { useEffect, useMemo, useState } from "react";
import {
  createProductDetailVariantSelectionEvent,
  type ProductDetailVariantSelectionEvent,
} from "../application/product-detail-customization-composition";
import {
  canSelectOptionValue,
  formatListingPrice,
  formatUsdPrice,
  resolveVariantSelection,
  type PublicSelectorVariant,
} from "../application/catalog-storefront";
import type { ListingPrice, ProductOption, ProductOptionValue } from "../domain/catalog";
import styles from "./catalog-storefront.module.css";
import { useReferenceLanguage } from "./ReferenceLanguageProvider";
import { trackLocalAnalyticsEvent } from "../client/local-analytics.ts";

export interface VariantSelectorProps {
  productId: string;
  options: readonly ProductOption[];
  optionValues: readonly ProductOptionValue[];
  variants: readonly PublicSelectorVariant[];
  listingPrice: ListingPrice;
  onSelectionChange?: (event: ProductDetailVariantSelectionEvent) => void;
}

export function VariantSelector({
  productId,
  options,
  optionValues,
  variants,
  listingPrice,
  onSelectionChange,
}: VariantSelectorProps) {
  const { t } = useReferenceLanguage();
  const [selectedByOption, setSelectedByOption] = useState<Record<string, string>>({});
  const selectedOptions = useMemo(
    () => Object.entries(selectedByOption).map(([optionId, valueId]) => ({ optionId, valueId })),
    [selectedByOption],
  );
  const input = useMemo(
    () => ({ productId, options, optionValues, variants }),
    [optionValues, options, productId, variants],
  );
  const resolution = useMemo(
    () => resolveVariantSelection({ ...input, selectedOptions }),
    [input, selectedOptions],
  );
  const selectionEvent = useMemo(
    () => createProductDetailVariantSelectionEvent(selectedOptions, resolution),
    [resolution, selectedOptions],
  );

  useEffect(() => {
    onSelectionChange?.(selectionEvent);
  }, [onSelectionChange, selectionEvent]);

  return (
    <section className={styles.selector} aria-labelledby="variant-selector-heading">
      <h2 className={styles.selectorHeading} id="variant-selector-heading">{t("Choose your gift")}</h2>
      {options.map((option) => {
        const values = optionValues.filter((value) => value.optionId === option.id);
        return (
          <fieldset className={styles.optionGroup} key={option.id}>
            <legend>{option.name}{option.required ? ` · ${t("Required")}` : ""}</legend>
            <div className={styles.optionValues}>
              {values.map((value) => {
                const selected = selectedByOption[option.id] === value.id;
                const selectable = canSelectOptionValue(input, selectedOptions, {
                  optionId: option.id,
                  valueId: value.id,
                });
                return (
                  <button
                    className={`${styles.optionButton} ${selected ? styles.optionSelected : ""}`}
                    type="button"
                    key={value.id}
                    disabled={!selectable}
                    aria-pressed={selected}
                    onClick={() => {
                      setSelectedByOption((current) => ({ ...current, [option.id]: value.id }));
                      trackLocalAnalyticsEvent({ eventName: "select_variant", productId, metadata: { optionId: option.id, valueId: value.id } });
                    }}
                  >
                    {value.label}
                  </button>
                );
              })}
            </div>
          </fieldset>
        );
      })}

      {resolution.status === "resolved" ? (
        <div className={`${styles.selectionStatus} ${styles.selectionReady}`} role="status">
          <strong>{formatUsdPrice(resolution.variant.priceCents)} · {t("Available")}</strong>
          <div className={styles.skuLine}>
          <span>{t("Selected SKU")}</span>
            <span>{resolution.variant.skuCode}</span>
          </div>
        </div>
      ) : resolution.status === "incomplete" ? (
        <p className={styles.selectionStatus} role="status">
          {t("Choose every required option to see the exact SKU price.")} {formatListingPrice(listingPrice)}
        </p>
      ) : (
        <p className={styles.selectionStatus} role="alert">
          {t("This option combination is unavailable. Please choose another combination.")}
        </p>
      )}
    </section>
  );
}
