import Link from "next/link";
import { brandName } from "./config/identity.ts";
import styles from "./info-page.module.css";
import { ReferenceLanguageProvider, ReferenceText } from "./storefront/ReferenceLanguageProvider";

export function InfoPage({ eyebrow, title, intro, children }: { eyebrow: string; title: string; intro: string; children: React.ReactNode }) {
  return <ReferenceLanguageProvider><main className={styles.page} id="main-content"><header className={styles.header}><Link className={styles.brand} href="/"><span aria-hidden="true">✦</span>{brandName}</Link><Link className={styles.back} href="/"><ReferenceText>Back to storefront ↗</ReferenceText></Link></header><article className={styles.article}><p className={styles.eyebrow}><ReferenceText>{eyebrow}</ReferenceText></p><h1><ReferenceText>{title}</ReferenceText></h1><p className={styles.intro}><ReferenceText>{intro}</ReferenceText></p><div className={styles.content}>{children}</div><p className={styles.updated}><ReferenceText>MVP policy draft · Review and replace before public launch.</ReferenceText></p></article></main></ReferenceLanguageProvider>;
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section><h2><ReferenceText>{title}</ReferenceText></h2>{children}</section>;
}
