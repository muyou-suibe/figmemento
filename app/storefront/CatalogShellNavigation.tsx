"use client";
/* eslint-disable @next/next/no-img-element -- the uploaded PNG is the official brand source. */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { brandName } from "../config/identity.ts";
import type { Category } from "../domain/catalog/index.ts";
import { cartChangedEventName } from "./cart-presentation";
import styles from "./catalog-storefront.module.css";
import { useReferenceLanguage } from "./ReferenceLanguageProvider";

const navigationItems = [
  { href: "/shop", label: "Shop" },
  { href: "/journal", label: "Journal" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
] as const;

function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  if (href === "/shop" && pathname.startsWith("/category/")) return true;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function categoryDisplayLabel(category: Category): string {
  const labels: Record<string, string> = {
    "3d-figures": "3D Figurines",
    "custom-crafts": "Custom Art",
    "pet-memories": "Pet Memorial",
    "digital-gifts": "Digital Art",
  };
  return labels[category.slug] ?? category.name;
}

function readCartQuantity(payload: unknown): number | null {
  if (payload === null || typeof payload !== "object") return null;
  const lines = (payload as { lines?: unknown }).lines;
  if (!Array.isArray(lines)) return null;

  let quantity = 0;
  for (const line of lines) {
    if (line === null || typeof line !== "object") return null;
    const value = (line as { quantity?: unknown }).quantity;
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return null;
    quantity += value;
    if (!Number.isSafeInteger(quantity)) return null;
  }
  return quantity;
}

export function CatalogShellCategoryPills({ categories }: { categories: readonly Category[] }) {
  const pathname = usePathname() ?? "/";
  const { t } = useReferenceLanguage();
  const referenceCategories = [
    ["3d-figures", "3D Figurines"],
    ["custom-crafts", "Custom Art"],
    ["pet-memories", "Pet Memorial"],
    ["home-living", "Home & Living"],
    ["digital-gifts", "Digital Art"],
  ] as const;
  const extraCategories = categories.filter((category) => !referenceCategories.some(([slug]) => slug === category.slug));

  return (
    <nav className={styles.shellCategoryPills} aria-label={t("Browse catalog categories")}>
      <Link className={`${styles.discoveryCategoryPill} ${pathname === "/shop" ? styles.discoveryCategoryPillActive : ""}`} href="/shop" aria-current={pathname === "/shop" ? "page" : undefined}>
        {t("All Works")}
      </Link>
      {referenceCategories.map(([slug, label]) => {
        const category = categories.find((candidate) => candidate.slug === slug);
        const href = `/category/${slug}`;
        const active = pathname === href;
        return category ? (
          <Link className={`${styles.discoveryCategoryPill} ${active ? styles.discoveryCategoryPillActive : ""}`} href={href} key={category.id} aria-current={active ? "page" : undefined}>
            {t(label)}
          </Link>
        ) : (
          <span className={`${styles.discoveryCategoryPill} ${styles.discoveryCategoryPillUnavailable}`} key={slug} aria-disabled="true" title={t("Unavailable in the current catalog source")}>
            {t(label)}
          </span>
        );
      })}
      {extraCategories.map((category) => {
        const href = `/category/${category.slug}`;
        const active = pathname === href;
        return <Link className={`${styles.discoveryCategoryPill} ${active ? styles.discoveryCategoryPillActive : ""}`} href={href} key={category.id} aria-current={active ? "page" : undefined}>{categoryDisplayLabel(category)}</Link>;
      })}
    </nav>
  );
}

function CartIndicator({ pathname }: { pathname: string }) {
  const { t } = useReferenceLanguage();
  const [quantity, setQuantity] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/cart", {
        cache: "no-store",
        credentials: "same-origin",
        headers: { accept: "application/json" },
      });
      if (!response.ok) {
        setQuantity(null);
        return;
      }
      const payload: unknown = await response.json();
      setQuantity(readCartQuantity(payload));
    } catch {
      setQuantity(null);
    }
  }, []);

  useEffect(() => {
    const loadCart = async () => { await refresh(); };
    void loadCart();
  }, [pathname, refresh]);

  useEffect(() => {
    const refreshOnFocus = () => { void refresh(); };
    const refreshOnPageShow = () => { void refresh(); };
    const refreshOnCartChange = () => { void refresh(); };
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };

    window.addEventListener("focus", refreshOnFocus);
    window.addEventListener("pageshow", refreshOnPageShow);
    window.addEventListener(cartChangedEventName, refreshOnCartChange);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.removeEventListener("focus", refreshOnFocus);
      window.removeEventListener("pageshow", refreshOnPageShow);
      window.removeEventListener(cartChangedEventName, refreshOnCartChange);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refresh]);

  const label = quantity === null
    ? t("Cart")
    : quantity === 0
      ? t("Cart, empty")
      : `${t("Cart")}, ${quantity === 1 ? t("1 item") : `${quantity} ${t("items")}`}`;

  return (
    <Link
      className={`${styles.cartLink} ${isActivePath(pathname, "/cart") ? styles.activeNav : ""}`}
      href="/cart"
      aria-current={isActivePath(pathname, "/cart") ? "page" : undefined}
      aria-label={label}
    >
      <span className={styles.cartLabel}>{t("Cart")}</span>
      {quantity !== null && quantity > 0 ? <span className={styles.cartCount} aria-hidden="true">{quantity}</span> : null}
    </Link>
  );
}

export function CatalogShellNavigation() {
  const pathname = usePathname() ?? "/";
  const { language, setLanguage, t } = useReferenceLanguage();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const firstMobileLinkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const frame = window.requestAnimationFrame(() => firstMobileLinkRef.current?.focus());
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      menuButtonRef.current?.focus();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  const closeMenu = () => {
    setMenuOpen(false);
    menuButtonRef.current?.focus();
  };

  return (
    <>
      <div className={styles.headerRow}>
        <Link className={styles.brand} href="/" aria-label={`${brandName} ${t("Home")}`}>
          <span className={styles.brandMark}>
            <img src="/brand/figmemento-logo.png" alt="" />
          </span>
        </Link>
        <div className={styles.headerControls}>
          <nav className={styles.nav} aria-label={t("Main navigation")}>
            {navigationItems.map((item) => {
              const active = isActivePath(pathname, item.href);
              return (
                <Link
                  className={active ? styles.activeNav : ""}
                  href={item.href}
                  key={item.href}
                  aria-current={active ? "page" : undefined}
                >
                    {t(item.label)}
                </Link>
              );
            })}
          </nav>
          <form className={styles.headerSearch} role="search" action="/shop" method="get">
            <label className={styles.searchLabel} htmlFor="shell-search">{t("Search the journal and catalog")}</label>
            <input
              className={styles.headerSearchInput}
              id="shell-search"
              name="q"
              type="search"
              placeholder={t("search a memory...")}
              aria-label={t("Search a memory")}
            />
            <button className={styles.searchButton} type="submit" aria-label={t("Search")}>⌕</button>
          </form>
        </div>
        <div className={styles.headerActions}>
          <div className={styles.languageLinks} aria-label={t("Language / Idioma / 语言")}>
            {([ ["en", "EN"], ["es", "ES"], ["zh", "中文"] ] as const).map(([value, label], index) => (
              <span key={value}>
                {index > 0 && <span aria-hidden="true">·</span>}
                <button className={language === value ? styles.languageActive : ""} type="button" aria-pressed={language === value} onClick={() => setLanguage(value)}>{label}</button>
              </span>
            ))}
          </div>
          <CartIndicator pathname={pathname} />
          <button
            ref={menuButtonRef}
            className={styles.menuButton}
            type="button"
            aria-expanded={menuOpen}
            aria-controls="catalog-mobile-menu"
            aria-label={menuOpen ? t("Close navigation menu") : t("Open navigation menu")}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span aria-hidden="true">☰</span>
          </button>
        </div>
      </div>
      {menuOpen ? (
        <nav className={styles.mobileNav} id="catalog-mobile-menu" aria-label={t("Mobile navigation")}>
          <Link ref={firstMobileLinkRef} className={pathname === "/" ? styles.activeNav : ""} href="/" aria-current={pathname === "/" ? "page" : undefined} onClick={closeMenu}>{t("Home")}</Link>
          <Link className={isActivePath(pathname, "/shop") ? styles.activeNav : ""} href="/shop" aria-current={isActivePath(pathname, "/shop") ? "page" : undefined} onClick={closeMenu}>{t("Shop")}</Link>
          <Link className={isActivePath(pathname, "/journal") ? styles.activeNav : ""} href="/journal" aria-current={isActivePath(pathname, "/journal") ? "page" : undefined} onClick={closeMenu}>{t("Journal")}</Link>
          <Link className={isActivePath(pathname, "/about") ? styles.activeNav : ""} href="/about" aria-current={isActivePath(pathname, "/about") ? "page" : undefined} onClick={closeMenu}>{t("About")}</Link>
          <Link className={isActivePath(pathname, "/contact") ? styles.activeNav : ""} href="/contact" aria-current={isActivePath(pathname, "/contact") ? "page" : undefined} onClick={closeMenu}>{t("Contact")}</Link>
          <Link className={isActivePath(pathname, "/cart") ? styles.activeNav : ""} href="/cart" aria-current={isActivePath(pathname, "/cart") ? "page" : undefined} onClick={closeMenu}>{t("Cart")}</Link>
          <Link className={isActivePath(pathname, "/account") ? styles.activeNav : ""} href="/account" aria-current={isActivePath(pathname, "/account") ? "page" : undefined} onClick={closeMenu}>{t("Account")}</Link>
          <Link className={isActivePath(pathname, "/track-order") ? styles.activeNav : ""} href="/track-order" aria-current={isActivePath(pathname, "/track-order") ? "page" : undefined} onClick={closeMenu}>{t("Track order")}</Link>
        </nav>
      ) : null}
    </>
  );
}
