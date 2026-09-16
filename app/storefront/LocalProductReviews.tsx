"use client";

import { useEffect, useState } from "react";
import styles from "./catalog-storefront.module.css";
import { trackLocalAnalyticsEvent } from "../client/local-analytics.ts";
import { useReferenceLanguage } from "./ReferenceLanguageProvider";

interface Review { id: string; rating: number; title?: string; body: string; createdAt: string; }
interface Eligible { publicOrderReference: string; orderItemId: string; }

export function LocalProductReviews({ productId }: { readonly productId: string }) {
  const { language, t } = useReferenceLanguage();
  const reviewDateLocale = language === "zh" ? "zh-CN" : language === "es" ? "es" : "en";
  const [reviews, setReviews] = useState<Review[]>([]);
  const [eligible, setEligible] = useState<Eligible[]>([]);
  const [rating, setRating] = useState("5");
  const [body, setBody] = useState("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => { void fetch(`/api/local-reviews?productId=${encodeURIComponent(productId)}`, { credentials: "same-origin" }).then((response) => response.json()).then((value: { reviews?: Review[]; eligible?: Eligible[] }) => { setReviews(Array.isArray(value.reviews) ? value.reviews : []); setEligible(Array.isArray(value.eligible) ? value.eligible : []); }).catch(() => undefined); }, [productId]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const item = eligible[0];
    if (!item || submitting) return;
    setSubmitting(true); setMessage(null);
    try {
      const response = await fetch("/api/local-reviews", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ publicOrderReference: item.publicOrderReference, orderItemId: item.orderItemId, productId, rating: Number(rating), title, body }) });
      const value = await response.json() as { status?: string; review?: Review };
      if (!response.ok || !value.review) { setMessage(value.status === "unauthorized" ? "Sign in with a delivered local order to review." : "Local review could not be submitted."); return; }
      trackLocalAnalyticsEvent({ eventName: "review_submit", productId });
      setReviews((current) => [value.review!, ...current]); setEligible((current) => current.slice(1)); setBody(""); setTitle(""); setMessage("Review submitted for this local demo. Thank you.");
    } catch { setMessage("Local review could not be submitted."); } finally { setSubmitting(false); }
  }
  return <section className={styles.localReviews} aria-labelledby="local-reviews-heading"><div className={styles.fusionPdpSpecHeading}><span>{t("Local customer notes")}</span><h2 id="local-reviews-heading">{t("Reviews")}</h2></div>{reviews.length === 0 ? <p className={styles.checkoutHelp}>{t("No local reviews yet.")}</p> : <div className={styles.localReviewList}>{reviews.map((review) => <article key={review.id}><strong>{"★".repeat(review.rating)}</strong>{review.title && <h3>{review.title}</h3>}<p>{review.body}</p><small>{new Date(review.createdAt).toLocaleDateString(reviewDateLocale)}</small></article>)}</div>}{eligible.length > 0 && <form className={styles.localReviewForm} onSubmit={submit}><h3>{t("Share your delivered-order note")}</h3><label>{t("Rating")}<select value={rating} onChange={(event) => setRating(event.target.value)}><option value="5">5 — {t("wonderful")}</option><option value="4">4 — {t("lovely")}</option><option value="3">3 — {t("good")}</option><option value="2">2 — {t("needs work")}</option><option value="1">1 — {t("poor")}</option></select></label><label>{t("Title")} <span>({t("optional")})</span><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} /></label><label>{t("Review")}<textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={2000} required /></label><button className={styles.primaryLink} type="submit" disabled={submitting}>{submitting ? t("Publishing…") : t("Publish local review")}</button>{message && <p role="status">{t(message)}</p>}</form>}{eligible.length === 0 && message && <p role="status">{t(message)}</p>}</section>;
}
