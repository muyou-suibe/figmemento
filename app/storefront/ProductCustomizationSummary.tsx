"use client";

import type {
  ProductCustomizationSummaryModel,
  ProductCustomizationSummaryRow,
} from "../application/product-customization-summary.ts";
import styles from "./catalog-storefront.module.css";
import { useReferenceLanguage } from "./ReferenceLanguageProvider";

function missingText(state: "provided" | "not_provided" | "not_provided_yet", t: (value: string) => string): string {
  return state === "not_provided_yet" ? t("Not provided yet") : t("Not provided");
}

function SummaryRow({ row }: { readonly row: ProductCustomizationSummaryRow }) {
  const { t } = useReferenceLanguage();
  if (row.kind === "image") {
    return (
      <div className={styles.customizationSummaryRow}>
        <dt>{row.label}</dt>
        <dd>
          {row.images.length === 0 ? (
            missingText(row.state, t)
          ) : (
            <ul className={styles.customizationSummaryImages}>
              {row.images.map((image) => (
                <li key={image.renderKey}>
                  <strong>{image.label}</strong>
                  {image.state === "needs_review" ? (
                    <span>{t("Image metadata needs review.")}</span>
                  ) : (
                    <>
                      {image.filename && <span>{image.filename}</span>}
                      {image.metadata && <span>{image.metadata}</span>}
                      {image.crop ? (
                        <span>{t("Customer crop selection: Left")} {image.crop.left}, {t("Top")} {image.crop.top}, {t("Width")} {image.crop.width}, {t("Height")} {image.crop.height}. {t("Production framing may differ.")}</span>
                      ) : (
                        <span>{t("Full image selected.")}</span>
                      )}
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </dd>
      </div>
    );
  }
  return (
    <div className={styles.customizationSummaryRow}>
      <dt>{row.label}</dt>
      <dd className={row.kind === "long_text" ? styles.customizationSummaryLongText : undefined}>
        {row.state === "provided" ? row.value : missingText(row.state, t)}
      </dd>
    </div>
  );
}

/** Display-only view of the existing parent draft; it never submits or resolves a SKU. */
export function ProductCustomizationSummary({ model }: { readonly model: ProductCustomizationSummaryModel }) {
  const { t } = useReferenceLanguage();
  return (
    <section className={styles.customizationSummary} aria-labelledby="customization-summary-heading">
      <h2 className={styles.selectorHeading} id="customization-summary-heading">{t("Customization summary")}</h2>
      <section aria-labelledby="selected-configuration-heading">
        <h3 id="selected-configuration-heading">{t("Selected configuration")}</h3>
        <dl className={styles.customizationSummaryList}>
          <div className={styles.customizationSummaryRow}>
            <dt>{t("Selected SKU")}</dt>
            <dd>{model.configuration.sku ?? t("Exact SKU not resolved yet.")}</dd>
          </div>
          {model.configuration.options.map((option) => (
            <div className={styles.customizationSummaryRow} key={option.renderKey}>
              <dt>{option.label}</dt>
              <dd>{option.value}</dd>
            </div>
          ))}
        </dl>
        {model.configuration.needsReview && <p className={styles.customizationSummaryNotice} aria-live="polite">{t("Selection needs review.")}</p>}
      </section>
      <section aria-labelledby="your-personalization-heading">
        <h3 id="your-personalization-heading">{t("Your personalization")}</h3>
        {model.personalization.status === "empty_configuration" ? (
          <p>{t("No personalization is configured for this product.")}</p>
        ) : model.personalization.status === "needs_review" ? (
          <p className={styles.customizationSummaryNotice} aria-live="polite">{t("Personalization configuration needs review.")}</p>
        ) : (
          <dl className={styles.customizationSummaryList}>
            {model.personalization.rows.map((row) => <SummaryRow key={row.renderKey} row={row} />)}
          </dl>
        )}
        <p className={styles.customizationSummaryBoundary}>{t("Customer input summary — not a production preview.")}</p>
      </section>
    </section>
  );
}
