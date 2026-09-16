import Link from "next/link";
import { brandName } from "../config/identity.ts";
import { TrackOrderForm } from "./TrackOrderForm";
import { CatalogShell } from "../storefront/CatalogShell.tsx";
import styles from "../info-page.module.css";
import { ReferenceText } from "../storefront/ReferenceLanguageProvider";

export const metadata = { title: `Track your order — ${brandName}`, description: `Check your ${brandName} payment and fulfillment status with your order number and checkout email.` };

export default function TrackOrderPage() {
  return (
    <CatalogShell>
      <main className={`${styles.page} ${styles.trackingPage}`} id="main-content">
        <article className={styles.article}>
          <Link className={styles.back} href="/"><ReferenceText>Back to storefront ↗</ReferenceText></Link>
          <p className={styles.eyebrow}><ReferenceText>Customer care</ReferenceText></p>
          <h1><ReferenceText>Track your order</ReferenceText></h1>
          <p className={styles.intro}><ReferenceText>Enter the order number from your confirmation and the email used at checkout.</ReferenceText></p>
          <TrackOrderForm />
        </article>
      </main>
    </CatalogShell>
  );
}
