import Link from "next/link";
import styles from "./info-page.module.css";

export function InfoPage({ eyebrow, title, intro, children }: { eyebrow: string; title: string; intro: string; children: React.ReactNode }) {
  return <main className={styles.page}><header className={styles.header}><Link className={styles.brand} href="/"><span>✦</span>Photo<span>Gift</span></Link><Link className={styles.back} href="/">Back to storefront ↗</Link></header><article className={styles.article}><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className={styles.intro}>{intro}</p><div className={styles.content}>{children}</div><p className={styles.updated}>MVP policy draft · Review and replace before public launch.</p></article></main>;
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section><h2>{title}</h2>{children}</section>;
}
