"use client";

import { useState, type FormEvent } from "react";
import type { AdminSettingsProjection } from "../../application/admin-settings-boundary.server.ts";
import styles from "../products/admin-products.module.css";

export function AdminSettingsEditor({ initial }: { readonly initial: AdminSettingsProjection }) {
  const [projection, setProjection] = useState(initial);
  const [supportEmail, setSupportEmail] = useState(initial.settings.supportEmail ?? "");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/settings", {
        method: "PATCH",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          expectedVersion: projection.settings.version,
          supportEmail: supportEmail.trim() || null,
        }),
      });
      const result = await response.json().catch(() => null) as {
        status?: string;
        value?: AdminSettingsProjection;
      } | null;
      if (!response.ok || !result?.value || (result.status !== "updated" && result.status !== "replayed")) {
        setMessage(result?.status === "stale"
          ? "This settings version is stale. Refresh and try again."
          : result?.status === "conflict"
            ? "This update conflicts with another Admin action."
            : result?.status === "invalid_request"
              ? "Enter a valid support email or clear the field."
              : "Admin settings are temporarily unavailable.");
        return;
      }
      setProjection(result.value);
      setSupportEmail(result.value.settings.supportEmail ?? "");
      setMessage(result.status === "replayed" ? "The previous update was recovered." : "Support email saved.");
    } catch {
      setMessage("Admin settings are temporarily unavailable.");
    } finally {
      setSaving(false);
    }
  }

  return <div className={styles.settingsStack}>
    <section className={styles.settingsCard}>
      <div className={styles.settingsCardHeading}>
        <div><p className="eyebrow">Editable setting</p><h2>Support email</h2></div>
        <span className={styles.settingsVersion}>v{projection.settings.version}</span>
      </div>
      <p className={styles.settingsHint}>Shown only in the customer support wording. Leave blank to publish no support email.</p>
      <form className={styles.settingsForm} onSubmit={submit}>
        <label htmlFor="support-email">Support email</label>
        <input id="support-email" type="email" value={supportEmail} onChange={(event) => setSupportEmail(event.target.value)} autoComplete="email" placeholder="support@example.com" maxLength={254} />
        <button type="submit" disabled={saving}>{saving ? "Saving…" : "Save support email"}</button>
        {message && <p className={styles.settingsMessage} role="status">{message}</p>}
      </form>
    </section>
    <section className={styles.settingsCard}>
      <div className={styles.settingsCardHeading}><div><p className="eyebrow">Read only</p><h2>Runtime information</h2></div></div>
      <dl className={styles.settingsReadOnly}>
        <div><dt>Brand name</dt><dd>{projection.readOnly.brandName}</dd></div>
        <div><dt>Site origin</dt><dd>{projection.readOnly.siteOrigin}</dd></div>
        <div><dt>Deployment</dt><dd>{projection.readOnly.deploymentEnvironment}</dd></div>
        <div><dt>Provider activation</dt><dd>{projection.readOnly.providerActivation}</dd></div>
        <div><dt>Digital delivery policy</dt><dd>{projection.readOnly.digitalDeliveryPolicy.durationDays} days · {projection.readOnly.digitalDeliveryPolicy.maxDownloads} downloads</dd></div>
      </dl>
    </section>
  </div>;
}
