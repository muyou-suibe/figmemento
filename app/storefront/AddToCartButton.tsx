"use client";

import { useState } from "react";
import type { ConfiguredItemHandoff } from "../domain/configured-item.ts";
import { notifyCartChanged } from "./cart-presentation";
import { trackLocalAnalyticsEvent } from "../client/local-analytics.ts";
import styles from "./catalog-storefront.module.css";
import { useReferenceLanguage } from "./ReferenceLanguageProvider";

export function AddToCartButton({ handoff }: { readonly handoff: ConfiguredItemHandoff }) {
  const { t } = useReferenceLanguage();
  const [state, setState] = useState<"idle" | "adding" | "added" | "error">("idle");

  async function addToCart() {
    setState("adding");
    try {
      const response = await fetch("/api/cart", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ handoff }),
      });
      if (!response.ok) {
        setState("error");
        return;
      }
      notifyCartChanged();
      trackLocalAnalyticsEvent({ eventName: "add_to_cart", productId: handoff.productId, metadata: { skuCode: handoff.skuCode } });
      setState("added");
    } catch {
      setState("error");
    }
  }

  return (
    <section className={styles.cartAction} aria-labelledby="add-to-cart-heading">
      <h2 className={styles.selectorHeading} id="add-to-cart-heading">{t("Ready to save this configuration?")}</h2>
      <button className={styles.primaryLink} type="button" onClick={addToCart} disabled={state === "adding"}>
        {state === "adding" ? t("Adding…") : t("Add to cart")}
      </button>
      <p className={styles.cartActionStatus} role={state === "error" ? "alert" : "status"}>
        {state === "added" ? t("Added as a new configured item. View your cart to review it.") : null}
        {state === "error" ? t("This configured item could not be added. Please review it and try again.") : null}
      </p>
    </section>
  );
}
