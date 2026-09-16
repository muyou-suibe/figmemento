"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { ShoppingCart } from "../domain/shopping-cart.ts";
import type { CheckoutReadinessReport } from "../domain/checkout-readiness.ts";
import { formatCurrencyCents } from "../application/catalog-storefront.ts";
import { notifyCartChanged } from "./cart-presentation";
import styles from "./catalog-storefront.module.css";
import { useReferenceLanguage } from "./ReferenceLanguageProvider";
import { trackLocalAnalyticsEvent } from "../client/local-analytics.ts";
import { loadPublicShoppingCart } from "./public-shopping-cart-response.ts";

function initialCart(): ShoppingCart { return { status: "empty", lines: [] }; }
function unavailableCart(): ShoppingCart { return { status: "failure", lines: [] }; }

function readinessStateLabel(state: CheckoutReadinessReport["state"], t: (value: string) => string): string {
  return t(state === "ready" ? "Ready" : state === "blocked" ? "Blocked" : "Unavailable");
}

export function CartExperience() {
  const { t } = useReferenceLanguage();
  const [cart, setCart] = useState<ShoppingCart>(initialCart);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [readiness, setReadiness] = useState<CheckoutReadinessReport | null>(null);
  const [readinessLoading, setReadinessLoading] = useState(false);

  const refreshReadiness = useCallback(async () => {
    setReadinessLoading(true);
    try {
      const response = await fetch("/api/checkout-readiness", { credentials: "same-origin", cache: "no-store" });
      const next = await response.json() as CheckoutReadinessReport;
      setReadiness(next);
    } catch {
      setReadiness(null);
    } finally {
      setReadinessLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await loadPublicShoppingCart(() => fetch("/api/cart", { credentials: "same-origin", cache: "no-store" }));
    if (result.status === "unavailable") {
      setCart(unavailableCart());
      setMessage("Your local cart is temporarily unavailable.");
      setReadiness(null);
      setLoading(false);
      return;
    }
    setCart(result.cart);
    trackLocalAnalyticsEvent({ eventName: "view_cart", metadata: { lineCount: String(result.cart.lines.length) } });
    setMessage(null);
    if (result.cart.lines.length > 0) void refreshReadiness();
    else setReadiness(null);
    setLoading(false);
  }, [refreshReadiness]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh(); }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  async function mutate(url: string, init?: RequestInit) {
    setMessage(null);
    const result = await loadPublicShoppingCart(() => fetch(url, { ...init, credentials: "same-origin", headers: { ...(init?.headers ?? {}), accept: "application/json" } }));
    if (result.status === "unavailable") {
      setMessage("We could not update that cart line.");
      return;
    }
    const next = result.cart;
    setCart(next);
    notifyCartChanged();
    if (next.lines.length > 0) void refreshReadiness();
    else setReadiness(null);
  }

  if (loading) return <div className={styles.fusionCart}><p className={styles.status} role="status">{t("Loading your local cart…")}</p></div>;
  if (cart.status === "unavailable_source" || cart.status === "failure") {
    return <div className={styles.fusionCart}><section className={styles.status} role="status"><h1>{t("Cart unavailable")}</h1><p>{t("This local Cart source is not enabled right now.")}</p><Link className={styles.secondaryLink} href="/shop">{t("Return to the shop")}</Link></section></div>;
  }
  if (cart.lines.length === 0) {
    return <div className={styles.fusionCart}><section className={styles.empty} role="status"><p className={styles.eyebrow}>{t("Your FigMemento cart")}</p><h1>{t("Your cart is empty.")}</h1><p>{t("Configured gifts you add locally will appear here for review.")}</p><Link className={styles.primaryLink} href="/shop">{t("Explore the shop")}</Link></section></div>;
  }

  return (
    <div className={styles.fusionCart} data-cart-state="ready" data-cart-lines={cart.lines.length}>
      <section className={styles.cartLayout} aria-labelledby="cart-heading">
        <div>
          <p className={styles.eyebrow}>{t("Your FigMemento cart")}</p>
          <h1 className={styles.title} id="cart-heading">{t("A few meaningful")}<br /><em>{t("pieces in progress.")}</em></h1>
          {cart.status === "stale" && <p className={styles.fixtureNotice} role="status">{t("One or more configured items needs review before it can be continued.")}</p>}
          {message && <p className={styles.cartMessage} role="alert">{t(message)}</p>}
          <div className={styles.cartLines}>
            {cart.lines.map((line) => (
              <article className={styles.cartLine} key={line.lineId}>
                <div className={styles.cartLineCopy}>
                  <p className={styles.cardCategory}>{line.skuCode}</p>
                  <h2>{line.productName}</h2>
                  <p className={styles.cartLineMeta}>{line.customization.configuration.options.map((option) => `${option.label}: ${option.value}`).join(" · ") || t("Configured item")}</p>
                  <p className={styles.cartLineMeta}>{line.customization.personalization.rows.filter((row) => row.state === "provided").map((row) => row.kind === "image" ? `${row.label}: ${row.imageCount} ${t(row.imageCount === 1 ? "image" : "images")}` : `${row.label}: ${t("provided")}`).join(" · ") || t("Personalization summary ready")}</p>
                </div>
                <div className={styles.cartLineControls}>
                  <strong>{formatCurrencyCents(line.lineSubtotalCents, line.currency)}</strong>
                  <label>{t("Quantity")} <input aria-label={`${t("Quantity for")} ${line.productName}`} type="number" min="1" max="20" value={line.quantity} onChange={(event) => void mutate(`/api/cart/items/${line.lineId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ quantity: Number(event.target.value) }) })} /></label>
                  <button className={styles.cartRemoveButton} type="button" onClick={() => void mutate(`/api/cart/items/${line.lineId}`, { method: "DELETE" })}>{t("Remove")}</button>
                </div>
              </article>
            ))}
          </div>
        </div>
        <aside className={styles.cartSummary} aria-labelledby="cart-summary-heading">
          <h2 id="cart-summary-heading">{t("Cart subtotal")}</h2>
          <p className={styles.cartTotal}>{formatCurrencyCents(cart.subtotalCents ?? 0, cart.currency ?? "USD")}</p>
          <p>{t("Display subtotal only. Shipping, taxes, discounts, payment, and checkout are not active in this local Cart. The separate local checkout review derives a development-only summary.")}</p>
          <Link className={styles.secondaryLink} href="/checkout">{t("Review local checkout")}</Link>
          <button className={styles.secondaryButton} type="button" onClick={() => void mutate("/api/cart", { method: "DELETE" })}>{t("Clear cart")}</button>
        </aside>
        <section className={styles.cartSummary} aria-labelledby="readiness-heading">
          <h2 id="readiness-heading">{t("Pre-checkout readiness")}</h2>
          <p>{t("This is a read-only server observation. It is not checkout authorization, an order, or a payment approval.")}</p>
          {readinessLoading && <p role="status">{t("Checking the current Cart…")}</p>}
          {!readinessLoading && readiness && (
            <>
              <p role="status">{t("Current observation")}: {readinessStateLabel(readiness.state, t)}.</p>
              {readiness.lines.map((line) => (
                <p key={line.lineId}>{line.skuCode}: {readinessStateLabel(line.state, t)}{line.issues.length > 0 ? ` — ${line.issues.map((issue) => t(issue.message)).join(" ")}` : ""}</p>
              ))}
              {readiness.issues.map((issue) => <p key={issue.code}>{t(issue.message)}</p>)}
            </>
          )}
          <button className={styles.secondaryButton} type="button" onClick={() => void refreshReadiness()} disabled={readinessLoading}>{t("Refresh readiness")}</button>
        </section>
      </section>
    </div>
  );
}
