"use client";

import Link from "next/link";
import { brandName } from "../config/identity.ts";
import { CatalogShell } from "./CatalogShell";
import styles from "./catalog-storefront.module.css";
import { useReferenceLanguage } from "./ReferenceLanguageProvider";

type CatalogStatusKind = "source_failure" | "invalid_configuration" | "unavailable";

const messages: Record<CatalogStatusKind, { title: string; copy: string }> = {
  source_failure: {
    title: "The shop is taking a quiet moment.",
    copy: "We cannot load the catalog right now. Please try again shortly.",
  },
  invalid_configuration: {
    title: "This collection is not ready to browse.",
    copy: "The catalog is temporarily unavailable while we make sure every product is configured safely.",
  },
  unavailable: {
    title: "This gift is not available right now.",
    copy: "It cannot be purchased at the moment. You can return to the shop to discover another keepsake.",
  },
};

export function CatalogStatus({ kind }: { kind: CatalogStatusKind }) {
  return <CatalogShell><CatalogStatusContent kind={kind} /></CatalogShell>;
}

function CatalogStatusContent({ kind }: { kind: CatalogStatusKind }) {
  const { t } = useReferenceLanguage();
  const message = messages[kind];
  return (
    <main className={styles.main} id="main-content">
      <section className={styles.status} role="status">
        <p className={styles.eyebrow}>{brandName} {t("catalog")}</p>
        <h1>{t(message.title)}</h1>
        <p>{t(message.copy)}</p>
        <Link className={styles.resetButton} href="/shop">{t("Return to the shop")}</Link>
      </section>
    </main>
  );
}
