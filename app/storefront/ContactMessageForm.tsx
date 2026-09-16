"use client";

import { useState, type FormEvent } from "react";
import styles from "./reference-editorial.module.css";
import { trackLocalAnalyticsEvent } from "../client/local-analytics.ts";
import { ReferenceText, useReferenceLanguage } from "./ReferenceLanguageProvider";

type ContactUiStatus = "idle" | "submitting" | "received" | "invalid_message" | "unavailable";

export function ContactMessageForm() {
  const { t } = useReferenceLanguage();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [publicOrderReference, setPublicOrderReference] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<ContactUiStatus>("idle");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "submitting") return;
    setStatus("submitting");
    try {
      const response = await fetch("/api/local-contact", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ name, email, publicOrderReference: publicOrderReference || undefined, issueType: "general", message }),
      });
      const body = await response.json() as { status?: string };
      if (body.status === "received") {
        setStatus("received");
        trackLocalAnalyticsEvent({ eventName: "contact_submit" });
      } else if (body.status === "invalid_message") {
        setStatus("invalid_message");
      } else {
        setStatus("unavailable");
      }
    } catch {
      setStatus("unavailable");
    }
  }

  const feedback = status === "idle" || status === "submitting" ? null : {
    received: t("Message received by this local application. No email has been sent."),
    invalid_message: t("Please check your name, email, and message."),
    unavailable: t("Contact is unavailable in this local demo. Please try again later."),
  }[status];
  return (
    <form className={styles.contactForm} aria-label={t("Contact message")} onSubmit={submit}>
      <h2><ReferenceText>Write to the workshop</ReferenceText></h2>
      <p className={styles.contactFormSub}><ReferenceText>the pencil jar is full and the kettle is on</ReferenceText></p>
      <div className={styles.contactField}>
        <label htmlFor="contact-name"><ReferenceText>your name</ReferenceText></label>
        <input id="contact-name" name="name" type="text" placeholder={t("how should we greet you?")} value={name} maxLength={120} onChange={(event) => setName(event.currentTarget.value)} required />
      </div>
      <div className={styles.contactField}>
        <label htmlFor="contact-email"><ReferenceText>email</ReferenceText></label>
        <input id="contact-email" name="email" type="email" placeholder={t("where our reply should travel")} value={email} maxLength={254} onChange={(event) => setEmail(event.currentTarget.value)} required />
      </div>
      <div className={styles.contactField}>
        <label htmlFor="contact-order-reference"><ReferenceText>order number</ReferenceText> <span><ReferenceText>(optional)</ReferenceText></span></label>
        <input id="contact-order-reference" name="publicOrderReference" placeholder={t("starts with FM-")} value={publicOrderReference} maxLength={64} onChange={(event) => setPublicOrderReference(event.currentTarget.value)} />
      </div>
      <div className={styles.contactField}>
        <label htmlFor="contact-message"><ReferenceText>message</ReferenceText></label>
        <textarea id="contact-message" name="message" placeholder={t("tell us about the memory you want to keep…")} value={message} maxLength={4000} onChange={(event) => setMessage(event.currentTarget.value)} required />
      </div>
      <button type="submit" disabled={status === "submitting"}>{status === "submitting" ? t("SENDING…") : t("Send it over ✈")}</button>
      {feedback && <p className={styles.contactNote} role="status">{feedback}</p>}
    </form>
  );
}
