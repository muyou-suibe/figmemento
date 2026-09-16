"use client";

import { useRef, useState } from "react";
import { getOrCreateLocalTrackingSelector, settleLocalTrackingSelector, type LocalTrackingSelector } from "../client/local-tracking-selector-lifecycle.ts";
import type { LocalTrackingActionKind, LocalTrackingSafeProjection } from "../domain/local-tracking.ts";
import styles from "./catalog-storefront.module.css";
import { trackLocalAnalyticsEvent } from "../client/local-analytics.ts";
import { useReferenceLanguage } from "./ReferenceLanguageProvider";

type ReadState = { status: "idle" | "loading" | "unavailable" } | { status: "found"; value: LocalTrackingSafeProjection };
type OperatorProjection = { publicOrderReference: string; fulfillmentStatus: string; shipment: LocalTrackingSafeProjection | null; allowedActions: readonly LocalTrackingActionKind[]; notice: "DEVELOPMENT / TEST ONLY" };
type OperatorState = { status: "idle" | "loading" | "unavailable" } | { status: "found"; value: OperatorProjection };

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function isTracking(value: unknown): value is LocalTrackingSafeProjection {
  return isRecord(value) && typeof value.publicOrderReference === "string" && typeof value.publicShipmentReference === "string" && typeof value.trackingNumber === "string" && typeof value.carrierLabel === "string" && ["shipment_created", "shipped", "in_transit", "delivered"].includes(value.status as string) && Array.isArray(value.events) && value.notice === "DEVELOPMENT / TEST ONLY";
}
function statusCopy(status: LocalTrackingSafeProjection["status"], t: (value: string) => string): string {
  if (status === "shipment_created") return t("Shipment prepared locally");
  if (status === "shipped") return t("Marked shipped in local demo");
  if (status === "in_transit") return t("Marked in transit in local demo");
  return t("Delivered terminal state in local demo");
}
function actionCopy(action: LocalTrackingActionKind, t: (value: string) => string): string {
  if (action === "create_shipment") return t("Create Shipment");
  if (action === "mark_shipped") return t("Mark Shipped");
  if (action === "mark_in_transit") return t("Mark In Transit");
  return t("Mark Delivered");
}

function fulfillmentStatusLabel(status: string, t: (value: string) => string): string {
  const labels: Record<string, string> = {
    photo_review: "Photo Review",
    preview_pending: "Preview pending",
    preview_revision_requested: "Revision requested",
    preview_approved: "Preview approved",
    in_production: "In production",
    quality_check: "Quality check",
    awaiting_review: "Awaiting review",
    shipped: "Shipped",
    delivered: "Delivered",
    issue: "Issue",
  };
  return t(labels[status] ?? status.replaceAll("_", " "));
}
function TrackingCard({ tracking, unavailable }: { tracking: LocalTrackingSafeProjection | null; unavailable?: boolean }) {
  const { t } = useReferenceLanguage();
  if (!tracking) return <div className={styles.trackingUnavailable} role="status"><strong>{t(unavailable ? "Shipment not yet available" : "Shipment not yet created")}</strong><span>{t("Quality check complete · Shipment not yet created. This local read never creates a Shipment.")}</span></div>;
  return <div className={styles.trackingDetails}>
    <div className={styles.trackingStatus}><span>{t("Current status")}</span><strong>{statusCopy(tracking.status, t)}</strong></div>
    <dl className={styles.trackingMeta}><div><dt>{t("Shipment reference")}</dt><dd>{tracking.publicShipmentReference}</dd></div><div><dt>{t("Tracking number")}</dt><dd>{tracking.trackingNumber}</dd></div><div><dt>{t("Carrier fixture")}</dt><dd>{t(tracking.carrierLabel)}</dd></div></dl>
    <ol className={styles.trackingTimeline} aria-label={t("Local tracking progress")}>{tracking.events.map((event) => <li key={`${event.status}-${event.occurredAt}`}><span>{t(event.label)}</span><time dateTime={event.occurredAt}>{event.occurredAt}</time></li>)}</ol>
    {tracking.status === "delivered" && <p className={styles.trackingTerminal}>{t("Terminal state — no further local Tracking action is available.")}</p>}
  </div>;
}

export function LocalCustomerTracking({ publicReference, fulfillmentStatus }: { publicReference: string; fulfillmentStatus?: string }) {
  const { t } = useReferenceLanguage();
  const [state, setState] = useState<ReadState>({ status: "idle" });
  async function load() {
    setState({ status: "loading" });
    try { const response = await fetch(`/api/local-tracking/${encodeURIComponent(publicReference)}`, { credentials: "same-origin", cache: "no-store" }); const value = await response.json().catch(() => null) as unknown; setState(response.ok && isTracking(value) ? { status: "found", value } : { status: "unavailable" }); if (response.ok && isTracking(value)) trackLocalAnalyticsEvent({ eventName: "view_tracking", orderReference: publicReference }); } catch { setState({ status: "unavailable" }); }
  }
  return <section className={`${styles.fusionTracking} ${styles.trackingCard}`} aria-labelledby="local-tracking-heading"><p className={styles.eyebrow}>{t("Local Tracking")}</p><h2 id="local-tracking-heading">{t("A keepsake journey, locally noted.")}</h2><p className={styles.fixtureNotice}>{t("DEVELOPMENT / TEST ONLY — Local Demo Carrier fixture. No live carrier telemetry or 17TRACK lookup.")}</p>{state.status === "idle" && <button className={styles.secondaryLink} type="button" onClick={() => void load()}>{t("Check local Tracking")}</button>}{state.status === "loading" && <p role="status">{t("Loading local Tracking…")}</p>}{state.status === "unavailable" && <TrackingCard tracking={null} unavailable={fulfillmentStatus === "quality_check"} />}{state.status === "found" && <TrackingCard tracking={state.value} />}</section>;
}

type Attempt = LocalTrackingSelector;
export function LocalTrackingOperatorTool({ runtimeEnabled }: { runtimeEnabled: boolean }) {
  const { t } = useReferenceLanguage();
  const [reference, setReference] = useState("");
  const [state, setState] = useState<OperatorState>({ status: "idle" });
  const [error, setError] = useState<string | null>(null);
  const attempt = useRef<Attempt | null>(null);
  const [busy, setBusy] = useState(false);
  async function load(referenceOverride = reference) { const normalized = referenceOverride.trim(); if (!normalized) return; setState({ status: "loading" }); try { const response = await fetch(`/api/local-tracking/operator/${encodeURIComponent(normalized)}`, { credentials: "same-origin", cache: "no-store" }); const value = await response.json().catch(() => null) as unknown; setState(response.ok && isRecord(value) && typeof value.publicOrderReference === "string" ? { status: "found", value: value as OperatorProjection } : { status: "unavailable" }); } catch { setState({ status: "unavailable" }); } }
  async function submit(actionKind: LocalTrackingActionKind) { if (!runtimeEnabled || !reference.trim() || busy) return; const selector = getOrCreateLocalTrackingSelector(attempt.current, { actionKind }, () => window.crypto.randomUUID()); attempt.current = selector; setBusy(true); setError(null); try { const response = await fetch(`/api/local-tracking/operator/${encodeURIComponent(reference.trim())}`, { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ trackingActionId: selector.trackingActionId, actionKind: selector.actionKind }) }); if (!response.ok) { attempt.current = settleLocalTrackingSelector(attempt.current, "definitive_rejection"); setError("This local Tracking action was rejected."); return; } const body = await response.json() as unknown; if (!isRecord(body) || (body.status !== "committed" && body.status !== "replayed")) throw new Error("invalid_tracking_response"); attempt.current = settleLocalTrackingSelector(attempt.current, body.status); await load(reference.trim()); } catch { attempt.current = settleLocalTrackingSelector(selector, "transport_retry"); setError("The connection was interrupted. Retry the same local Tracking request."); } finally { setBusy(false); } }
  if (!runtimeEnabled) return <section className={`${styles.fusionTracking} ${styles.operatorTool}`} aria-label={t("Local Tracking operator tool")}><p className={styles.fixtureNotice}>{t("DEVELOPMENT / TEST ONLY — Local Tracking operator actions are unavailable in this runtime.")}</p></section>;
  const projection = state.status === "found" ? state.value : null;
  return <section className={`${styles.fusionTracking} ${styles.operatorTool}`} aria-labelledby="tracking-operator-heading"><p className={styles.eyebrow}>{t("Local operator tool")}</p><h1 className={styles.title} id="tracking-operator-heading">{t("Tracking control")}<br /><em>{t("for local review.")}</em></h1><p className={styles.fixtureNotice}>{t("DEVELOPMENT / TEST ONLY — Server-side operator authority. No production dashboard or carrier connection.")}</p><form className={styles.operatorToolForm} onSubmit={(event) => { event.preventDefault(); void load(); }}><div className={styles.operatorToolField}><label htmlFor="tracking-order-reference">{t("Local Order reference")}</label><input id="tracking-order-reference" value={reference} onChange={(event) => setReference(event.target.value)} placeholder="FM-LOCAL-…" autoComplete="off" /></div><button className={styles.primaryLink} type="submit" disabled={!reference.trim() || state.status === "loading"}>{t("Load Tracking")}</button></form>{state.status === "loading" && <p role="status">{t("Loading local Tracking…")}</p>}{state.status === "unavailable" && <p className={styles.checkoutFeedback} role="status">{t("Tracking is unavailable. Verify a paid local Order, Quality Check, and server-only operator mode.")}</p>}{projection && <div className={styles.checkoutFeedback} role="region" aria-live="polite" aria-label={t("Local Tracking result")}><p><strong>{t("Order")}:</strong> {projection.publicOrderReference}</p><p><strong>{t("Fulfillment")}:</strong> {fulfillmentStatusLabel(projection.fulfillmentStatus, t)}</p>{projection.shipment ? <TrackingCard tracking={projection.shipment} /> : <TrackingCard tracking={null} />}{projection.allowedActions.length > 0 && <div className={styles.operatorToolActions}>{projection.allowedActions.map((action) => <button className={styles.primaryLink} type="button" key={action} onClick={() => void submit(action)} disabled={busy}>{actionCopy(action, t)}</button>)}</div>}{error && <p role="alert">{t(error)}</p>}</div>}</section>;
}
