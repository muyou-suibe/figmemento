"use client";

import { CatalogShell } from "./CatalogShell";
import styles from "./catalog-storefront.module.css";
import { useReferenceLanguage } from "./ReferenceLanguageProvider";

export function CatalogLoading() {
  return <CatalogShell><CatalogLoadingContent /></CatalogShell>;
}

function CatalogLoadingContent() {
  const { t } = useReferenceLanguage();
  return (
    <main className={styles.main} aria-busy="true" aria-label={t("Loading catalog")}>
      <span className={styles.loadingLine} style={{ display: "block", width: "120px" }} />
      <span className={styles.loadingLine} style={{ display: "block", height: "54px", width: "70%" }} />
      <span className={styles.loadingLine} style={{ display: "block", width: "45%" }} />
      <div className={styles.loadingGrid} aria-hidden="true">
        {[1, 2, 3, 4, 5, 6].map((item) => <span className={styles.loadingCard} key={item} />)}
      </div>
    </main>
  );
}
