"use client";

import type { ProductCustomizationHandoffGateResult } from "../application/product-customization-handoff-gate.ts";
import styles from "./catalog-storefront.module.css";
import { useReferenceLanguage } from "./ReferenceLanguageProvider";

/**
 * Presentation only: this panel has no callback, network client, or purchase
 * action because Task 8.1 server acceptance has not been implemented.
 */
export function ProductCustomizationHandoffGate({
  result,
}: {
  readonly result: ProductCustomizationHandoffGateResult;
}) {
  const { t } = useReferenceLanguage();
  const message = result.status === "locally_ready"
    ? t("Personalization is locally ready for server verification.")
    : t(result.message);

  return (
    <section className={styles.customizationHandoffGate} aria-labelledby="customization-status-heading">
      <h2 className={styles.selectorHeading} id="customization-status-heading">{t("Personalization status")}</h2>
      <p className={result.status === "locally_ready" ? styles.customizationHandoffReady : styles.customizationHandoffBlocked} aria-live="polite">
        {message}
      </p>
      {result.status === "locally_ready" && (
        <p className={styles.customizationHandoffBoundary}>
          {t("Server verification is required before a future configured-item handoff can be accepted.")}
        </p>
      )}
    </section>
  );
}
