"use client";

import { FormEvent, useState } from "react";
import type { OrderLookupResult } from "../domain/order";
import styles from "./track-order.module.css";
import { useReferenceLanguage } from "../storefront/ReferenceLanguageProvider";

function label(value: string, t: (value: string) => string): string {
  const labels: Record<string, string> = {
    pending: "Pending",
    succeeded: "Succeeded",
    failed: "Failed",
    cancelled: "Cancelled",
    awaiting_review: "Awaiting review",
    in_production: "In production",
    quality_check: "Quality check",
    shipped: "Shipped",
    in_transit: "In transit",
    delivered: "Delivered",
    issue: "Issue",
  };
  return t(labels[value] ?? value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase()));
}

const fulfillmentSteps = ["awaiting_review", "in_production", "quality_check", "shipped", "delivered"];

export function TrackOrderForm() {
  const { language, t } = useReferenceLanguage();
  const locale = language === "es" ? "es-ES" : language === "zh" ? "zh-CN" : "en-US";
  const [orderNumber, setOrderNumber] = useState("");
  const [email, setEmail] = useState("");
  const [order, setOrder] = useState<OrderLookupResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedOrderNumber = orderNumber.trim().toUpperCase();
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^PG-[A-Z0-9]+-[A-Z0-9]+$/.test(normalizedOrderNumber)) {
      setError(t("Enter the order number exactly as shown in your confirmation."));
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError(t("Enter the email address used at checkout."));
      return;
    }
    setLoading(true);
    setError("");
    setOrder(null);
    try {
      const response = await fetch("/api/order-lookup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderNumber: normalizedOrderNumber, email: normalizedEmail }) });
      const result = await response.json() as { error?: string; order?: OrderLookupResult };
      if (!response.ok || !result.order) throw new Error(result.error || t("Order lookup failed."));
      setOrder(result.order);
      setCopied(false);
    } catch {
      setError("Order lookup failed.");
    } finally {
      setLoading(false);
    }
  }

  return <>
    <form className={styles.form} onSubmit={submit}>
      <label htmlFor="track-order-number">{t("Order number")}<input id="track-order-number" value={orderNumber} onChange={(event) => setOrderNumber(event.target.value)} placeholder="PG-XXXXXXXX-XXXXXX" autoComplete="off" required /></label>
      <label htmlFor="track-order-email">{t("Checkout email")}<input id="track-order-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" required /></label>
      <button type="submit" disabled={loading}>{loading ? t("Looking up...") : t("Track order ↗")}</button>
      {error && <p className={styles.error}>{error}</p>}
    </form>
    {order && <section className={styles.result} aria-live="polite">
      <div><span>{t("Order")}</span><strong>{order.order_number}</strong></div>
      <div><span>{t("Payment")}</span><strong>{label(order.payment_status, t)}</strong></div>
      <div><span>{t("Fulfillment")}</span><strong>{label(order.fulfillment_status, t)}</strong></div>
      <div><span>{t("Placed")}</span><strong>{new Date(order.created_at).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })}</strong></div>
      <div><span>{t("Total")}</span><strong>{new Intl.NumberFormat(locale, { style: "currency", currency: order.currency }).format(order.total_cents / 100)}</strong></div>
      <div><span>{t("Tracking")}</span><strong>{order.tracking_number ? <span className={styles.trackingValue}>{order.tracking_carrier || t("Carrier")} · {order.tracking_number}<button type="button" className={styles.copyButton} onClick={() => { void navigator.clipboard?.writeText(order.tracking_number || ""); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }}>{copied ? t("Copied") : t("Copy number")}</button></span> : label(order.tracking_status || "Not available yet", t)}</strong></div>
      {order.fulfillment_status === "issue" && <div className={styles.issue} role="status"><span>{t("Next step")}</span><strong>{t("Our team is reviewing this order. Please contact support if you need help.")}</strong></div>}
      <div className={styles.timeline} aria-label={t("Fulfillment progress")}><span className={styles.timelineTitle}>{t("Progress")}</span><div>{fulfillmentSteps.map((step) => <span className={`${styles.timelineStep} ${fulfillmentSteps.indexOf(step) <= fulfillmentSteps.indexOf(order.fulfillment_status) ? styles.timelineStepActive : ""}`} key={step}><i aria-hidden="true" />{label(step, t)}</span>)}</div></div>
      {order.items.map((item) => <div key={`${item.product_name}-${item.quantity}`}><span>{item.product_name}</span><strong>{item.is_digital ? item.digital_download_url ? <a href={item.digital_download_url} target="_blank" rel="noreferrer">{t("Download")} {item.digital_delivery_name || t("Digital file")} ↗</a> : t("Digital delivery in preparation") : t("Physical item")}</strong></div>)}
    </section>}
  </>;
}
