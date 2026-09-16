import Link from "next/link";
import { brandName } from "./config/identity.ts";
import { CatalogShell } from "./storefront/CatalogShell";
import styles from "./storefront/catalog-storefront.module.css";
import { ReferenceText } from "./storefront/ReferenceLanguageProvider";

export default function NotFound() {
  return (
    <CatalogShell>
      <main className={styles.notFound} id="main-content">
        <p className={styles.eyebrow}>{brandName} · <ReferenceText>Page not found</ReferenceText></p>
        <h1><ReferenceText>That little piece</ReferenceText><br /><em><ReferenceText>isn’t here.</ReferenceText></em></h1>
        <p className={styles.notFoundCopy}><ReferenceText>The page may have moved, but your favorite memories are still waiting for you.</ReferenceText></p>
        <div className={styles.homeActions}>
          <Link className={styles.primaryLink} href="/"><ReferenceText>Back to storefront</ReferenceText> <span>↗</span></Link>
          <Link className={styles.secondaryLink} href="/shop"><ReferenceText>Browse gifts</ReferenceText> <span>↓</span></Link>
        </div>
      </main>
    </CatalogShell>
  );
}
