"use client";

import { FormEvent, useState } from "react";
import styles from "./track-order.module.css";

type OrderResult = {
  order_number: string;
  payment_status: string;
  fulfillment_status: string;
  tracking_carrier: string | null;
  tracking_number: string | null;
  tracking_status: string | null;
  created_at: string;
  total_cents: number;
  currency: string;
  items: Array<{ product_name: string; quantity: number; is_digital: boolean; digital_delivery_name: string | null; digital_download_url: string | null }>;
};

function label(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

const fulfillmentSteps = ["awaiting_review", "in_production", "quality_check", "shipped", "delivered"];

export function TrackOrderForm() {
  const [orderNumber, setOrderNumber] = useState("");
  const [email, setEmail] = useState("");
  const [order, setOrder] = useState<OrderResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedOrderNumber = orderNumber.trim().toUpperCase();
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^PG-[A-Z0-9]+-[A-Z0-9]+$/.test(normalizedOrderNumber)) {
      setError("Enter the order number exactly as shown in your confirmation.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError("Enter the email address used at checkout.");
      return;
    }
    setLoading(true);
    setError("");
    setOrder(null);
    try {
      const response = await fetch("/api/order-lookup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderNumber: normalizedOrderNumber, email: normalizedEmail }) });
      const result = await response.json() as { error?: string; order?: OrderResult };
      if (!response.ok || !result.order) throw new Error(result.error || "Order lookup failed.");
      setOrder(result.order);
      setCopied(false);
    } catch (lookupError) {
      setError(lookupError instanceof Error ? lookupError.message : "Order lookup failed.");
    } finally {
      setLoading(false);
    }
  }

  return <>
    <form className={styles.form} onSubmit={submit}>
      <label htmlFor="track-order-number">Order number<input id="track-order-number" value={orderNumber} onChange={(event) => setOrderNumber(event.target.value)} placeholder="PG-XXXXXXXX-XXXXXX" autoComplete="off" required /></label>
      <label htmlFor="track-order-email">Checkout email<input id="track-order-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" required /></label>
      <button type="submit" disabled={loading}>{loading ? "Looking up..." : "Track order ↗"}</button>
      {error && <p className={styles.error}>{error}</p>}
    </form>
    {order && <section className={styles.result} aria-live="polite">
      <div><span>Order</span><strong>{order.order_number}</strong></div>
      <div><span>Payment</span><strong>{label(order.payment_status)}</strong></div>
      <div><span>Fulfillment</span><strong>{label(order.fulfillment_status)}</strong></div>
      <div><span>Placed</span><strong>{new Date(order.created_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</strong></div>
      <div><span>Total</span><strong>{new Intl.NumberFormat("en-US", { style: "currency", currency: order.currency }).format(order.total_cents / 100)}</strong></div>
      <div><span>Tracking</span><strong>{order.tracking_number ? <span className={styles.trackingValue}>{order.tracking_carrier || "Carrier"} · {order.tracking_number}<button type="button" className={styles.copyButton} onClick={() => { void navigator.clipboard?.writeText(order.tracking_number || ""); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }}>{copied ? "Copied" : "Copy number"}</button></span> : order.tracking_status || "Not available yet"}</strong></div>
      {order.fulfillment_status === "issue" && <div className={styles.issue} role="status"><span>Next step</span><strong>Our team is reviewing this order. Please contact support if you need help.</strong></div>}
      <div className={styles.timeline} aria-label="Fulfillment progress"><span className={styles.timelineTitle}>Progress</span><div>{fulfillmentSteps.map((step) => <span className={`${styles.timelineStep} ${fulfillmentSteps.indexOf(step) <= fulfillmentSteps.indexOf(order.fulfillment_status) ? styles.timelineStepActive : ""}`} key={step}><i aria-hidden="true" />{label(step)}</span>)}</div></div>
      {order.items.map((item) => <div key={`${item.product_name}-${item.quantity}`}><span>{item.product_name}</span><strong>{item.is_digital ? item.digital_download_url ? <a href={item.digital_download_url} target="_blank" rel="noreferrer">Download {item.digital_delivery_name || "digital file"} ↗</a> : "Digital delivery in preparation" : "Physical item"}</strong></div>)}
    </section>}
  </>;
}
