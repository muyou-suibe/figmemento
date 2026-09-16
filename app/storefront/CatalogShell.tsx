"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { brandName } from "../config/identity.ts";
import type { Category } from "../domain/catalog/index.ts";
import { CatalogShellCategoryPills, CatalogShellNavigation } from "./CatalogShellNavigation";
import styles from "./catalog-storefront.module.css";
import { ReferenceLanguageProvider, useReferenceLanguage } from "./ReferenceLanguageProvider";

export function CatalogShell({
  children,
  categoryLinks = [],
  page = "default",
}: {
  children: ReactNode;
  categoryLinks?: readonly Category[];
  page?: "default" | "home-reference" | "shop-reference" | "category-reference" | "editorial-reference";
}) {
  return <ReferenceLanguageProvider><CatalogShellContent categoryLinks={categoryLinks} page={page}>{children}</CatalogShellContent></ReferenceLanguageProvider>;
}

function CatalogShellContent({ children, categoryLinks, page }: { children: ReactNode; categoryLinks: readonly Category[]; page: "default" | "home-reference" | "shop-reference" | "category-reference" | "editorial-reference" }) {
  const { t } = useReferenceLanguage();
  const isHomeReference = page === "home-reference";
  const isShopReference = page === "shop-reference";
  const isReferenceFooter = isHomeReference || page === "category-reference" || page === "editorial-reference";

  return (
    <div className={`${styles.shell} ${styles.referenceShell} ${styles.visualV2} ${isHomeReference ? styles.homeReferenceShell : ""}`} data-visual-version="v2">
      <a className={styles.skipLink} href="#main-content">{t("Skip to content")}</a>
      <div className={styles.topNote} role="note" aria-label={t("FigMemento storefront preview")}>
        <span className={styles.visuallyHidden}>{t("FigMemento storefront preview")}</span>
        <div className={styles.marqueeViewport} aria-hidden="true">
          <div className={styles.marqueeTrack}>
            {["Free worldwide shipping over $69", "Handmade in our little workshop, one piece at a time", "Preview every order before it ships", "10% off your first keepsake", "Envíos a todo el mundo", "Free worldwide shipping over $69", "Handmade in our little workshop, one piece at a time", "Preview every order before it ships", "10% off your first keepsake", "Envíos a todo el mundo"].map((note, index) => <span key={`${note}-${index}`}>✦ {t(note)} <b>✦</b></span>)}
          </div>
        </div>
      </div>
      <header className={styles.header}>
        <CatalogShellNavigation />
      </header>
      <CatalogShellCategoryPills categories={categoryLinks} />
      {children}
      <footer className={`${styles.footer} ${isShopReference ? styles.shopReferenceFooter : ""}`}>
        {isReferenceFooter ? (
          <>
            <div className={styles.homeReferenceFooterOrnament} aria-hidden="true">◆ &ensp; {t("MADE SLOWLY, SHIPPED EVERYWHERE")} &ensp; ◆</div>
            <nav className={styles.homeReferenceFooterLinks} aria-label={t("Footer links")}>
              <Link href="/shop">{t("Shop")}</Link>
              <Link href="/category/3d-figures">{t("Figurines")}</Link>
              <Link href="/category/custom-crafts">{t("Custom Art")}</Link>
              <Link href="/category/pet-memories">{t("Pet Memorial")}</Link>
              <Link href="/category/digital-gifts">{t("Digital")}</Link>
              <Link href="/journal">{t("Journal")}</Link>
              <Link href="/about">{t("About")}</Link>
              <Link href="/contact">{t("Contact")}</Link>
              <Link href="/privacy">{t("Privacy")}</Link>
              <Link href="/terms">{t("Terms")}</Link>
              <Link href="/shipping-returns">{t("Shipping")}</Link>
            </nav>
            <div className={styles.homeReferenceFooterCopy}>© {new Date().getFullYear()} {brandName} — {t("handcrafted with patience, OPC project")}</div>
          </>
        ) : isShopReference ? (
          <>
            <div className={styles.shopReferenceFooterOrnament} aria-hidden="true">◆ &ensp; {t("MADE SLOWLY, SHIPPED EVERYWHERE")} &ensp; ◆</div>
            <nav className={styles.shopReferenceFooterLinks} aria-label={t("Footer links")}>
              <Link href="/shop">{t("Shop")}</Link>
              <Link href="/category/3d-figures">{t("Figurines")}</Link>
              <Link href="/category/custom-crafts">{t("Custom Art")}</Link>
              <Link href="/category/pet-memories">{t("Pet Memorial")}</Link>
              <span aria-disabled="true">{t("Home & Living")}</span>
              <Link href="/category/digital-gifts">{t("Digital")}</Link>
              <Link href="/journal">{t("Journal")}</Link>
              <Link href="/about">{t("About")}</Link>
              <Link href="/contact">{t("Contact")}</Link>
              <Link href="/privacy">{t("Privacy")}</Link>
              <Link href="/terms">{t("Terms")}</Link>
              <Link href="/shipping-returns">{t("Shipping")}</Link>
            </nav>
            <div className={styles.shopReferenceFooterCopy}>© {new Date().getFullYear()} {brandName} — {t("handcrafted with patience, OPC project")}</div>
          </>
        ) : (
          <>
            <div className={styles.footerInner}>
              <div>
                <p className={styles.footerBrand}>{brandName}</p>
                <p className={styles.footerCopy}>{t("A quiet storefront for published keepsakes and the stories around them.")}</p>
              </div>
              <nav className={styles.footerLinks} aria-label={t("Helpful links")}>
                <Link href="/journal">{t("Journal")}</Link>
                <Link href="/about">{t("About")}</Link>
                <Link href="/contact">{t("Contact")}</Link>
                <Link href="/track-order">{t("Track order")}</Link>
                <Link href="/faq">{t("FAQ")}</Link>
                <Link href="/shipping-returns">{t("Shipping & returns")}</Link>
                <Link href="/privacy">{t("Privacy")}</Link>
                <Link href="/terms">{t("Terms")}</Link>
              </nav>
            </div>
            <div className={styles.footerOrnament} aria-hidden="true">◆ FIGMEMENTO ◆</div>
            <p className={styles.footerBottom}>
              <span aria-hidden="true">✦ </span>
              © {new Date().getFullYear()} {brandName}. {t("Made for meaningful moments.")}
              <span aria-hidden="true"> ✦</span>
            </p>
          </>
        )}
      </footer>
    </div>
  );
}

export function FixtureCatalogNotice() {
  const { t } = useReferenceLanguage();
  return (
    <p className={styles.fixtureNotice} role="status">
      {t("DEVELOPMENT / TEST ONLY — Development fixture catalog — this content is not a production catalog source.")}
    </p>
  );
}
