"use client";

import { useState, type FormEvent } from "react";
import styles from "./catalog-storefront.module.css";
import { trackLocalAnalyticsEvent } from "../client/local-analytics.ts";
import { useReferenceLanguage } from "./ReferenceLanguageProvider";

type NewsletterUiStatus = "idle" | "submitting" | "subscribed" | "already_subscribed" | "invalid_email" | "unavailable";

export function NewsletterSignup() {
  const { t } = useReferenceLanguage();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<NewsletterUiStatus>("idle");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "submitting") return;

    setStatus("submitting");
    try {
      const response = await fetch("/api/local-newsletter", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = await response.json() as { status?: string };
      if (body.status === "subscribed" || body.status === "already_subscribed") {
        setStatus(body.status);
        if (body.status === "subscribed") trackLocalAnalyticsEvent({ eventName: "newsletter_signup" });
        return;
      }
      if (body.status === "invalid_email") {
        setStatus("invalid_email");
        return;
      }
      setStatus("unavailable");
    } catch {
      setStatus("unavailable");
    }
  }

  const feedback = status === "idle" || status === "submitting" ? null : {
    subscribed: t("Subscription saved for this local demo. No marketing email or coupon is sent in local mode."),
    already_subscribed: t("You’re already subscribed in this local demo. No marketing email or coupon is sent."),
    invalid_email: t("Enter a valid email address."),
    unavailable: t("Newsletter signup is unavailable in this local demo. Please try again later."),
  }[status];

  return (
    <>
      <form className={styles.fusionNewsletterForm} aria-label={t("Newsletter signup")} onSubmit={submit}>
        <label className={styles.visuallyHidden} htmlFor="home-newsletter-email">{t("Email address")}</label>
        <input
          id="home-newsletter-email"
          type="email"
          value={email}
          placeholder={t("your email address")}
          autoComplete="email"
          maxLength={254}
          required
          onChange={(event) => setEmail(event.currentTarget.value)}
          aria-describedby={feedback ? "home-newsletter-status" : undefined}
        />
        <button type="submit" disabled={status === "submitting"}>
          {status === "submitting" ? t("SAVING…") : t("SUBSCRIBE")}
        </button>
      </form>
      {feedback && <p id="home-newsletter-status" className={styles.fusionNewsletterStatus} role="status">{feedback}</p>}
    </>
  );
}
