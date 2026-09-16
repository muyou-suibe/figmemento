"use client";

import { useRef, useState } from "react";
import {
  getOrCreateFulfillmentSelector,
  settleFulfillmentSelector,
  type FulfillmentSelector,
} from "../client/local-fulfillment-selector-lifecycle.ts";
import styles from "./catalog-storefront.module.css";

type OperatorActionKind = "enter_photo_review" | "publish_preview" | "start_production" | "mark_quality_check";
type OperatorSelectorInput = { readonly actionKind: OperatorActionKind };
type OperatorProjection = {
  readonly publicOrderReference: string;
  readonly status: "photo_review" | "preview_pending" | "preview_revision_requested" | "preview_approved" | "in_production" | "quality_check";
  readonly currentPreviewVersion: 1 | 2 | 3 | null;
  readonly revisionRequestsRemaining: 0 | 1 | 2;
  readonly allowedActions: readonly OperatorActionKind[];
  readonly notice: "Development/test Fulfillment only.";
};

type ReadState =
  | { readonly status: "idle" | "loading" | "unavailable" }
  | { readonly status: "found"; readonly value: OperatorProjection };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isProjection(value: unknown): value is OperatorProjection {
  if (!isRecord(value)) return false;
  const statuses = ["photo_review", "preview_pending", "preview_revision_requested", "preview_approved", "in_production", "quality_check"];
  const actions = ["enter_photo_review", "publish_preview", "start_production", "mark_quality_check"];
  return typeof value.publicOrderReference === "string"
    && typeof value.status === "string"
    && statuses.includes(value.status)
    && (value.currentPreviewVersion === null || [1, 2, 3].includes(value.currentPreviewVersion as number))
    && [0, 1, 2].includes(value.revisionRequestsRemaining as number)
    && Array.isArray(value.allowedActions)
    && value.allowedActions.every((action) => actions.includes(action as string))
    && value.notice === "Development/test Fulfillment only.";
}

function statusCopy(status: OperatorProjection["status"]): string {
  switch (status) {
    case "photo_review": return "Photo Review";
    case "preview_pending": return "Preview pending customer review";
    case "preview_revision_requested": return "Revision requested";
    case "preview_approved": return "Preview approved";
    case "in_production": return "In production";
    case "quality_check": return "Quality Check — terminal local state";
  }
}

export function LocalFulfillmentOperatorTool({ runtimeEnabled }: { readonly runtimeEnabled: boolean }) {
  const [reference, setReference] = useState("");
  const [state, setState] = useState<ReadState>({ status: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [lifecycle, setLifecycle] = useState<"idle" | "submitting" | "transport_retry">("idle");
  const [retryAction, setRetryAction] = useState<OperatorActionKind | null>(null);
  const attempt = useRef<FulfillmentSelector<OperatorSelectorInput> | null>(null);

  async function read(referenceOverride = reference) {
    const normalized = referenceOverride.trim();
    if (!normalized) return;
    setReference(normalized);
    setState({ status: "loading" });
    setError(null);
    try {
      const response = await fetch(`/api/local-fulfillment/operator/${encodeURIComponent(normalized)}`, { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) {
        setState({ status: "unavailable" });
        return;
      }
      const value = await response.json() as unknown;
      if (!isProjection(value)) {
        setState({ status: "unavailable" });
        return;
      }
      setState({ status: "found", value });
    } catch {
      setState({ status: "unavailable" });
    }
  }

  async function submit(actionKind: OperatorActionKind) {
    const normalized = reference.trim();
    if (!normalized || !runtimeEnabled || lifecycle === "submitting") return;
    const currentAttempt = getOrCreateFulfillmentSelector(
      attempt.current,
      { actionKind },
      () => window.crypto.randomUUID(),
    );
    attempt.current = currentAttempt;
    setLifecycle("submitting");
    setRetryAction(null);
    setError(null);
    try {
      const response = await fetch(`/api/local-fulfillment/operator/${encodeURIComponent(normalized)}`, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ fulfillmentActionId: currentAttempt.fulfillmentActionId, actionKind: currentAttempt.actionKind }),
      });
      const body = await response.json().catch(() => null) as unknown;
      if (!response.ok) {
        attempt.current = settleFulfillmentSelector(attempt.current, "definitive_rejection");
        setLifecycle("idle");
        setRetryAction(null);
        setError("The local operator action was rejected or is unavailable.");
        return;
      }
      if (!isRecord(body) || (body.status !== "committed" && body.status !== "replayed")) throw new Error("invalid_operator_response");
      attempt.current = settleFulfillmentSelector(attempt.current, body.status);
      setLifecycle("idle");
      setRetryAction(null);
      await read(normalized);
    } catch {
      attempt.current = settleFulfillmentSelector(currentAttempt, "transport_retry");
      setLifecycle("transport_retry");
      setRetryAction(currentAttempt.actionKind);
      setError("The connection was interrupted. Retry the same operator request.");
    }
  }

  if (!runtimeEnabled) {
    return <section className={`${styles.fusionFulfillment} ${styles.operatorTool}`} aria-labelledby="local-operator-heading"><p className={styles.fixtureNotice}>DEVELOPMENT / TEST ONLY — Local operator actions are unavailable in this runtime.</p></section>;
  }

  const projection = state.status === "found" ? state.value : null;
  const actionButtons: readonly OperatorActionKind[] = projection?.allowedActions ?? ["enter_photo_review"];
  return (
    <section className={`${styles.fusionFulfillment} ${styles.operatorTool}`} aria-labelledby="local-operator-heading">
      <div className={styles.operatorToolHeader}>
        <p className={styles.eyebrow}>Local operator tool</p>
        <h1 className={styles.title} id="local-operator-heading">Fulfillment control<br /><em>for local review.</em></h1>
        <p className={styles.fixtureNotice}>DEVELOPMENT / TEST ONLY — Server-side local operator authority. No production dashboard, shipping, or tracking.</p>
      </div>
      <form className={styles.operatorToolForm} onSubmit={(event) => { event.preventDefault(); void read(); }}>
        <div className={styles.operatorToolField}>
          <label htmlFor="operator-order-reference">Local Order reference</label>
          <input id="operator-order-reference" value={reference} onChange={(event) => setReference(event.target.value)} placeholder="FM-LOCAL-…" autoComplete="off" />
        </div>
        <button className={styles.primaryLink} type="submit" disabled={!reference.trim() || state.status === "loading"}>Load Fulfillment</button>
      </form>
      {state.status === "loading" && <p role="status">Loading local Fulfillment…</p>}
      {state.status === "unavailable" && <p className={styles.checkoutFeedback} role="status">Fulfillment is unavailable. Verify a paid local Order and the server-only operator mode.</p>}
      {projection && <div className={styles.checkoutFeedback}>
        <h2>{statusCopy(projection.status)}</h2>
        <p>Order reference: <strong>{projection.publicOrderReference}</strong></p>
        <p>Preview Version: {projection.currentPreviewVersion ?? "Not published"}</p>
        <p>Revision requests remaining: {projection.revisionRequestsRemaining}</p>
        <div className={styles.operatorToolActions} aria-busy={lifecycle === "submitting"}>
          {actionButtons.map((action) => <button className={action === "enter_photo_review" ? styles.primaryLink : styles.secondaryLink} type="button" key={action} onClick={() => void submit(action)} disabled={lifecycle === "submitting"}>{action === "enter_photo_review" ? "Enter Photo Review" : action === "publish_preview" ? "Publish Preview" : action === "start_production" ? "Start Production" : "Mark Quality Check"}</button>)}
          {lifecycle === "transport_retry" && retryAction && <button className={styles.primaryLink} type="button" onClick={() => void submit(retryAction)}>Retry same operator request</button>}
        </div>
        {error && <p role="alert">{error}</p>}
      </div>}
      {!projection && state.status === "unavailable" && reference.trim() && <div className={styles.operatorToolActions} aria-busy={lifecycle === "submitting"}>
        <button className={styles.primaryLink} type="button" onClick={() => void submit("enter_photo_review")} disabled={lifecycle === "submitting"}>Enter Photo Review</button>
        {lifecycle === "transport_retry" && retryAction && <button className={styles.primaryLink} type="button" onClick={() => void submit(retryAction)}>Retry same operator request</button>}
      </div>}
    </section>
  );
}
