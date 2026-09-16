import { brandName } from "./config/identity.ts";
import { CatalogShell } from "./storefront/CatalogShell";
import styles from "./storefront/catalog-storefront.module.css";
import { ReferenceText } from "./storefront/ReferenceLanguageProvider";

export default function Loading() {
  return (
    <CatalogShell>
      <main className={styles.main} id="main-content" aria-busy="true" aria-labelledby="loading-page-label">
        <span id="loading-page-label" className={styles.visuallyHidden}><ReferenceText>Loading</ReferenceText> {brandName}</span>
        <div className={styles.loadingIntro}>
          <span className={styles.loadingLine} />
          <span className={`${styles.loadingLine} ${styles.loadingLineLarge}`} />
          <span className={styles.loadingLine} />
        </div>
        <div className={styles.loadingGrid} aria-hidden="true">
          {[1, 2, 3, 4, 5, 6].map((item) => <span className={styles.loadingCard} key={item} />)}
        </div>
      </main>
    </CatalogShell>
  );
}
