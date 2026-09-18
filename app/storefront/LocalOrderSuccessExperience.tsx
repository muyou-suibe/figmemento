"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatCurrencyCents } from "../application/catalog-storefront.ts";
import {
  getOrCreateFulfillmentSelector,
  settleFulfillmentSelector,
  type FulfillmentSelector,
} from "../client/local-fulfillment-selector-lifecycle.ts";
import type {
  LocalFulfillmentCustomerActionKind,
  LocalFulfillmentPreviewVersion,
} from "../domain/local-fulfillment.ts";
import type { LocalOrderPublicProjection } from "../domain/local-order.ts";
import { LocalCustomerTracking } from "./LocalTrackingExperience";
import styles from "./catalog-storefront.module.css";
import { useReferenceLanguage } from "./ReferenceLanguageProvider";

type LocalOrderReadState =
  | { readonly status: "loading" }
  | { readonly status: "unavailable" }
  | { readonly status: "found"; readonly value: LocalOrderPublicProjection };

type LocalPaymentScenario = "success" | "failed" | "cancelled";

interface LocalPaymentProjection {
  readonly paymentReference: string;
  readonly orderReference: string;
  readonly status: "succeeded" | "failed" | "cancelled";
  readonly outcome: LocalPaymentScenario;
  readonly simulatedAmountCents: number;
  readonly simulatedCurrency: "USD";
  readonly timestamp: string;
  readonly notice: string;
}

interface LocalPaymentSuccessResponse {
  readonly status: "committed" | "replayed";
  readonly payment: LocalPaymentProjection;
  readonly order: {
    readonly publicReference: string;
    readonly status: LocalOrderPublicProjection["status"];
    readonly paymentStatus: LocalOrderPublicProjection["paymentStatus"];
  };
}

interface LocalFulfillmentPreviewProjection {
  readonly previewVersion: LocalFulfillmentPreviewVersion;
  readonly displayLabel: "Development/test preview placeholder";
  readonly publishedAt: string;
  readonly developmentOnly: true;
}

interface LocalFulfillmentProjection {
  readonly source: "local_fake" | "local_persistent";
  readonly publicOrderReference: string;
  readonly status: "photo_review" | "preview_pending" | "preview_revision_requested" | "preview_approved" | "in_production" | "quality_check";
  readonly currentPreviewVersion: LocalFulfillmentPreviewVersion | null;
  readonly preview: LocalFulfillmentPreviewProjection | null;
  readonly revisionRequestsUsed: 0 | 1 | 2;
  readonly revisionRequestsRemaining: 0 | 1 | 2;
  readonly allowedActions: readonly LocalFulfillmentCustomerActionKind[];
  readonly version: number;
}

type LocalFulfillmentReadState =
  | { readonly status: "loading" }
  | { readonly status: "unavailable" }
  | { readonly status: "found"; readonly value: LocalFulfillmentProjection };

type FulfillmentAttemptInput = {
  readonly actionKind: LocalFulfillmentCustomerActionKind;
  readonly expectedPreviewVersion: LocalFulfillmentPreviewVersion;
  readonly revisionNote?: string;
};
type FulfillmentAttempt = FulfillmentSelector<FulfillmentAttemptInput>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPaymentSuccess(value: unknown): value is LocalPaymentSuccessResponse {
  if (!isRecord(value) || (value.status !== "committed" && value.status !== "replayed")) return false;
  const payment = value.payment;
  const order = value.order;
  return isRecord(payment)
    && typeof payment.paymentReference === "string"
    && typeof payment.orderReference === "string"
    && (payment.status === "succeeded" || payment.status === "failed" || payment.status === "cancelled")
    && (payment.outcome === "success" || payment.outcome === "failed" || payment.outcome === "cancelled")
    && typeof payment.simulatedAmountCents === "number"
    && payment.simulatedCurrency === "USD"
    && typeof payment.timestamp === "string"
    && typeof payment.notice === "string"
    && isRecord(order)
    && typeof order.publicReference === "string"
    && (order.status === "pending_payment" || order.status === "payment_failed" || order.status === "paid")
    && (order.paymentStatus === "pending" || order.paymentStatus === "failed" || order.paymentStatus === "succeeded");
}

function parseFulfillmentProjection(value: unknown, publicReference: string): LocalFulfillmentProjection | null {
  if (!isRecord(value)) return null;
  const versions = [1, 2, 3];
  const statuses = ["photo_review", "preview_pending", "preview_revision_requested", "preview_approved", "in_production", "quality_check"];
  const actions = ["approve_preview", "request_revision"];
  if (value.publicReference === publicReference
    && typeof value.status === "string" && statuses.includes(value.status)
    && Number.isSafeInteger(value.version) && (value.version as number) >= 1
    && versions.includes(value.manifestVersion as number)
    && [0, 1, 2].includes(value.revisionRequestsUsed as number)
    && Array.isArray(value.entries) && value.entries.length > 0
    && value.entries.every((entry) => isRecord(entry)
      && typeof entry.previewMediaId === "string"
      && entry.contentType === "image/png"
      && Number.isSafeInteger(entry.width) && (entry.width as number) > 0
      && Number.isSafeInteger(entry.height) && (entry.height as number) > 0)) {
    const revisionRequestsUsed = value.revisionRequestsUsed as 0 | 1 | 2;
    const status = value.status as LocalFulfillmentProjection["status"];
    return {
      source: "local_persistent",
      publicOrderReference: publicReference,
      status,
      version: value.version as number,
      currentPreviewVersion: value.manifestVersion as LocalFulfillmentPreviewVersion,
      preview: {
        previewVersion: value.manifestVersion as LocalFulfillmentPreviewVersion,
        displayLabel: "Development/test preview placeholder",
        publishedAt: "",
        developmentOnly: true,
      },
      revisionRequestsUsed,
      revisionRequestsRemaining: (2 - revisionRequestsUsed) as 0 | 1 | 2,
      allowedActions: status === "preview_pending" ? ["approve_preview", "request_revision"] : [],
    };
  }
  const preview = value.preview;
  if (!(typeof value.publicOrderReference === "string"
    && value.publicOrderReference === publicReference
    && typeof value.status === "string"
    && statuses.includes(value.status)
    && (value.currentPreviewVersion === null || versions.includes(value.currentPreviewVersion as number))
    && (preview === null || (isRecord(preview)
      && versions.includes(preview.previewVersion as number)
      && preview.displayLabel === "Development/test preview placeholder"
      && typeof preview.publishedAt === "string"
      && preview.developmentOnly === true))
    && [0, 1, 2].includes(value.revisionRequestsUsed as number)
    && [0, 1, 2].includes(value.revisionRequestsRemaining as number)
    && Array.isArray(value.allowedActions)
    && value.allowedActions.every((action) => actions.includes(action as string))
    && typeof value.createdAt === "string"
    && typeof value.updatedAt === "string"
    && value.notice === "Development/test Fulfillment only.")) return null;
  return {
    source: "local_fake",
    publicOrderReference: value.publicOrderReference,
    status: value.status as LocalFulfillmentProjection["status"],
    version: 1,
    currentPreviewVersion: value.currentPreviewVersion as LocalFulfillmentPreviewVersion | null,
    preview: value.preview as LocalFulfillmentPreviewProjection | null,
    revisionRequestsUsed: value.revisionRequestsUsed as 0 | 1 | 2,
    revisionRequestsRemaining: value.revisionRequestsRemaining as 0 | 1 | 2,
    allowedActions: value.allowedActions as readonly LocalFulfillmentCustomerActionKind[],
  };
}

function fulfillmentStatusCopy(status: LocalFulfillmentProjection["status"], t: (value: string) => string): string {
  switch (status) {
    case "photo_review": return t("Photo Review is ready for the local operator.");
    case "preview_pending": return t("A development/test preview is waiting for your review.");
    case "preview_revision_requested": return t("Revision requested — waiting for an updated local preview.");
    case "preview_approved": return t("Preview approved — waiting for local production.");
    case "in_production": return t("Local production has started.");
    case "quality_check": return t("Quality Check reached. Shipping / Tracking not started in this local stage.");
  }
}

function couponStatusLabel(status: string, t: (value: string) => string): string {
  const labels: Record<string, string> = {
    valid: "Valid coupon",
    expired: "Expired",
    not_applicable: "Not applicable",
    invalid: "Invalid coupon",
    not_selected: "No coupon selected",
  };
  return t(labels[status] ?? status.replaceAll("_", " "));
}

function paymentStatusCopy(
  order: LocalOrderPublicProjection,
  payment: LocalPaymentProjection | null,
  t: (value: string) => string,
): { readonly heading: string; readonly message: string } {
  if (payment?.status === "cancelled") {
    return {
      heading: t("Payment simulation cancelled"),
      message: t("No real money was charged. You can start a new local simulation attempt."),
    };
  }
  if (order.paymentStatus === "succeeded") {
    return {
      heading: t("Paid — Local simulation"),
      message: t("No real money was charged. This development result is not a production payment."),
    };
  }
  if (order.paymentStatus === "failed") {
    return {
      heading: t("Payment failed — Local simulation"),
      message: t("No real money was charged. This Local Order remains eligible for an explicit retry."),
    };
  }
  return {
    heading: t("Pending payment"),
    message: t("Payment has not occurred. This local simulation has not created a production order."),
  };
}

export function LocalOrderSuccessExperience({
  publicReference,
  localPaymentEnabled = false,
}: {
  readonly publicReference: string;
  readonly localPaymentEnabled?: boolean;
}) {
  const { t } = useReferenceLanguage();
  const [state, setState] = useState<LocalOrderReadState>({ status: "loading" });
  const [payment, setPayment] = useState<LocalPaymentProjection | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentLifecycle, setPaymentLifecycle] = useState<"idle" | "submitting" | "transport_retry">("idle");
  const [retryOutcome, setRetryOutcome] = useState<LocalPaymentScenario | null>(null);
  const paymentInFlight = useRef(false);
  const paymentAttemptId = useRef<string | null>(null);
  const paymentOutcome = useRef<LocalPaymentScenario | null>(null);
  const [fulfillment, setFulfillment] = useState<LocalFulfillmentReadState>({ status: "loading" });
  const [fulfillmentError, setFulfillmentError] = useState<string | null>(null);
  const [fulfillmentLifecycle, setFulfillmentLifecycle] = useState<"idle" | "submitting" | "transport_retry">("idle");
  const [fulfillmentRetryAction, setFulfillmentRetryAction] = useState<LocalFulfillmentCustomerActionKind | null>(null);
  const [revisionNote, setRevisionNote] = useState("");
  const fulfillmentInFlight = useRef(false);
  const fulfillmentAttempt = useRef<FulfillmentAttempt | null>(null);

  const loadOrder = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(`/api/local-orders/${encodeURIComponent(publicReference)}`, {
        credentials: "same-origin",
        cache: "no-store",
        signal,
      });
      if (!response.ok) {
        if (!signal?.aborted) setState({ status: "unavailable" });
        return;
      }
      const value = await response.json() as LocalOrderPublicProjection;
      if (value.publicReference !== publicReference) {
        if (!signal?.aborted) setState({ status: "unavailable" });
        return;
      }
      if (!signal?.aborted) setState({ status: "found", value });
    } catch {
      if (!signal?.aborted) setState({ status: "unavailable" });
    }
  }, [publicReference]);

  const loadFulfillment = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(`/api/local-fulfillment/${encodeURIComponent(publicReference)}`, {
        credentials: "same-origin",
        cache: "no-store",
        signal,
      });
      if (!response.ok) {
        if (!signal?.aborted) setFulfillment({ status: "unavailable" });
        return;
      }
      const value = parseFulfillmentProjection(await response.json() as unknown, publicReference);
      if (!value) {
        if (!signal?.aborted) setFulfillment({ status: "unavailable" });
        return;
      }
      if (!signal?.aborted) {
        setFulfillment({ status: "found", value });
        setFulfillmentError(null);
      }
    } catch {
      if (!signal?.aborted) setFulfillment({ status: "unavailable" });
    }
  }, [publicReference]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => { void loadOrder(controller.signal); }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [loadOrder]);

  const paidOrderReference = state.status === "found" && state.value.paymentStatus === "succeeded"
    ? state.value.publicReference
    : null;

  useEffect(() => {
    if (!paidOrderReference) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => { void loadFulfillment(controller.signal); }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [loadFulfillment, paidOrderReference]);

  async function submitPayment(requestedOutcome: LocalPaymentScenario) {
    if (!localPaymentEnabled || state.status !== "found" || state.value.paymentStatus === "succeeded" || paymentInFlight.current) return;
    const attemptId = paymentAttemptId.current ?? window.crypto.randomUUID();
    const outcome = paymentOutcome.current ?? requestedOutcome;
    paymentAttemptId.current = attemptId;
    paymentOutcome.current = outcome;
    paymentInFlight.current = true;
    setPaymentLifecycle("submitting");
    setRetryOutcome(null);
    setPaymentError(null);
    try {
      const response = await fetch("/api/local-payments", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ publicReference, paymentAttemptId: attemptId, outcome }),
      });
      const body = await response.json().catch(() => null) as unknown;
      if (!response.ok) {
        paymentAttemptId.current = null;
        paymentOutcome.current = null;
        setPaymentLifecycle("idle");
        setRetryOutcome(null);
        setPaymentError("Local Payment could not be completed. Please try the approved next action.");
        return;
      }
      if (!isPaymentSuccess(body)) throw new Error("invalid_payment_response");
      setPayment(body.payment);
      setPaymentLifecycle("idle");
      paymentAttemptId.current = null;
      paymentOutcome.current = null;
      setRetryOutcome(null);
      setState((current) => current.status === "found"
        ? { status: "found", value: { ...current.value, status: body.order.status, paymentStatus: body.order.paymentStatus } }
        : current);
      await loadOrder();
    } catch {
      // An unknown transport result keeps the exact selector for an explicit
      // retry of the same logical request.
      setPaymentLifecycle("transport_retry");
      setRetryOutcome(outcome);
      setPaymentError("The connection was interrupted. Retry the same local Payment request.");
    } finally {
      paymentInFlight.current = false;
    }
  }

  async function submitFulfillment(requestedAction: LocalFulfillmentCustomerActionKind) {
    if (
      fulfillment.status !== "found"
      || !fulfillment.value.allowedActions.includes(requestedAction)
      || fulfillmentInFlight.current
    ) return;

    const expectedPreviewVersion = fulfillment.value.currentPreviewVersion;
    if (expectedPreviewVersion === null) return;
    const normalizedNote = requestedAction === "request_revision" ? revisionNote.trim() : undefined;
    const attempt = getOrCreateFulfillmentSelector<FulfillmentAttemptInput>(
      fulfillmentAttempt.current,
      {
        actionKind: requestedAction,
        expectedPreviewVersion,
        ...(normalizedNote ? { revisionNote: normalizedNote } : {}),
      },
      () => window.crypto.randomUUID(),
    );

    fulfillmentAttempt.current = attempt;
    fulfillmentInFlight.current = true;
    setFulfillmentLifecycle("submitting");
    setFulfillmentRetryAction(null);
    setFulfillmentError(null);
    try {
      const response = await fetch(`/api/local-fulfillment/${encodeURIComponent(publicReference)}`, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          fulfillmentActionId: attempt.fulfillmentActionId,
          actionKind: attempt.actionKind,
          expectedPreviewVersion: attempt.expectedPreviewVersion,
          ...(fulfillment.value.source === "local_persistent"
            ? { expectedAggregateVersion: fulfillment.value.version }
            : {}),
          ...(attempt.revisionNote ? { revisionNote: attempt.revisionNote } : {}),
        }),
      });
      const body = await response.json().catch(() => null) as unknown;
      if (!response.ok) {
        fulfillmentAttempt.current = settleFulfillmentSelector(fulfillmentAttempt.current, "definitive_rejection");
        setFulfillmentLifecycle("idle");
        setFulfillmentRetryAction(null);
        setFulfillmentError("This Fulfillment action could not be completed. Refresh and try the approved next action.");
        return;
      }
      if (!isRecord(body) || (body.status !== "committed" && body.status !== "replayed")) throw new Error("invalid_fulfillment_response");
      fulfillmentAttempt.current = settleFulfillmentSelector(fulfillmentAttempt.current, body.status);
      setFulfillmentLifecycle("idle");
      setFulfillmentRetryAction(null);
      setFulfillmentError(null);
      await loadFulfillment();
    } catch {
      fulfillmentAttempt.current = settleFulfillmentSelector(attempt, "transport_retry");
      setFulfillmentLifecycle("transport_retry");
      setFulfillmentRetryAction(attempt.actionKind);
      setFulfillmentError("The connection was interrupted. Retry the same Fulfillment request.");
    } finally {
      fulfillmentInFlight.current = false;
    }
  }

  if (state.status === "loading") return <section className={styles.fusionOrder} aria-label={t("Local order loading")}><p className={styles.status} role="status">{t("Loading your local order…")}</p></section>;
  if (state.status === "unavailable") {
    return (
      <section className={`${styles.fusionOrder} ${styles.empty}`} role="status">
        <p className={styles.eyebrow}>{t("Local order")}</p>
        <h1>{t("Local Order is unavailable.")}</h1>
        <p>{t("This development-only order may have been lost after a runtime restart, or this browser may not have access.")}</p>
      </section>
    );
  }

  const order = state.value;
  const copy = paymentStatusCopy(order, payment, t);
  const canSimulate = localPaymentEnabled && order.paymentStatus !== "succeeded";
  return (
    <section className={`${styles.fusionOrder} ${styles.checkoutLayout}`} aria-labelledby="local-order-heading" data-payment-state={order.paymentStatus}>
      <div className={styles.checkoutMain}>
        <p className={styles.eyebrow}>{t("Local order created")}</p>
        <h1 className={styles.title} id="local-order-heading">{t("Your order is held")}<br /><em>{t("for the next step.")}</em></h1>
        <p className={styles.fixtureNotice} role="status">{t("DEVELOPMENT / TEST ONLY — This is a process-memory Local Order. No real money was charged.")}</p>
        <section className={order.paymentStatus === "succeeded" ? styles.checkoutFeedbackSuccess : styles.checkoutFeedback} aria-label={t("Local order status")}>
          <h2>{copy.heading}</h2>
          <p>{copy.message}</p>
          <p>{t("Order reference")}: <strong>{order.publicReference}</strong></p>
        </section>

        {paymentError && <p className={styles.checkoutFeedback} role="alert">{t(paymentError)}</p>}
        {payment && <p className={styles.checkoutHelp}>{t("Simulation reference")}: {payment.paymentReference} · {formatCurrencyCents(payment.simulatedAmountCents, payment.simulatedCurrency)} · {payment.timestamp}</p>}

        {order.paymentStatus === "succeeded" && (
          <section className={styles.fulfillmentCard} aria-labelledby="local-fulfillment-heading" data-preview-state={fulfillment.status === "found" ? fulfillment.value.status : "unavailable"}>
            <p className={styles.eyebrow}>{t("Local Fulfillment")}</p>
            <h2 id="local-fulfillment-heading">{t("Photo review and preview")}</h2>
            <p className={styles.fixtureNotice}>{t("DEVELOPMENT / TEST ONLY — No production preview or shipping workflow is active.")}</p>
            {fulfillment.status === "loading" && <p role="status">{t("Loading local Fulfillment…")}</p>}
            {fulfillment.status === "unavailable" && (
              <div className={styles.checkoutFeedback} role="status">
                <h3>{t("Fulfillment preview not yet available")}</h3>
                <p>{t("Payment complete. A local operator must enter Photo Review before a preview can be shown.")}</p>
              </div>
            )}
            {fulfillment.status === "found" && (
              <>
                {fulfillment.value.status === "preview_approved" && <span className={styles.visualV2ApprovedStamp} aria-label={t("Preview approved")}>{t("APPROVED")}</span>}
                <p><strong>{t("Status")}:</strong> {fulfillmentStatusCopy(fulfillment.value.status, t)}</p>
                <p><strong>{t("Preview Version")}:</strong> {fulfillment.value.currentPreviewVersion ?? t("Not published")}</p>
                <p><strong>{t("Revision requests remaining")}:</strong> {fulfillment.value.revisionRequestsRemaining}</p>
                {fulfillment.value.preview && <p className={styles.checkoutHelp}>{t(fulfillment.value.preview.displayLabel)}</p>}
                {fulfillment.value.allowedActions.includes("approve_preview") && (
                  <div className={styles.fulfillmentActions}>
                    <button className={styles.primaryLink} type="button" onClick={() => void submitFulfillment("approve_preview")} disabled={fulfillmentLifecycle === "submitting"}>
                      {t("Approve Preview")}
                    </button>
                    {fulfillment.value.allowedActions.includes("request_revision") && (
                      <>
                        <label className={styles.fulfillmentNoteLabel} htmlFor="fulfillment-revision-note">{t("Revision note")}</label>
                        <textarea
                          className={styles.fulfillmentNote}
                          id="fulfillment-revision-note"
                          value={revisionNote}
                          onChange={(event) => setRevisionNote(event.target.value)}
                          maxLength={500}
                          rows={3}
                          placeholder={t("Tell the local operator what to adjust.")}
                          disabled={fulfillmentLifecycle === "submitting"}
                        />
                        <button className={styles.secondaryLink} type="button" onClick={() => void submitFulfillment("request_revision")} disabled={fulfillmentLifecycle === "submitting"}>
                          {t("Request Revision")}
                        </button>
                      </>
                    )}
                  </div>
                )}
                {fulfillmentLifecycle === "transport_retry" && fulfillmentRetryAction && (
                  <button className={styles.primaryLink} type="button" onClick={() => void submitFulfillment(fulfillmentRetryAction)}>
                    {t("Retry same Fulfillment request")}
                  </button>
                )}
                {fulfillmentError && <p className={styles.checkoutFeedback} role="alert">{t(fulfillmentError)}</p>}
                <LocalCustomerTracking publicReference={publicReference} fulfillmentStatus={fulfillment.value.status} />
              </>
            )}
          </section>
        )}

        {canSimulate && (
          <section className={styles.checkoutFeedback} aria-labelledby="local-payment-heading">
            <h2 id="local-payment-heading">{t("Local Payment simulation")}</h2>
            <p>{t("DEVELOPMENT / TEST ONLY. Choose a deterministic scenario; no card or provider details are requested.")}</p>
            <div className={styles.paymentActions} aria-busy={paymentLifecycle === "submitting"}>
              {paymentLifecycle === "transport_retry" && retryOutcome
                ? <button className={styles.primaryLink} type="button" onClick={() => void submitPayment(retryOutcome)}>{t("Retry same simulation request")}</button>
                : <>
                  <button className={styles.primaryLink} type="button" onClick={() => void submitPayment("success")} disabled={paymentLifecycle === "submitting"}>{t("Simulate successful Payment")}</button>
                  <button className={styles.secondaryLink} type="button" onClick={() => void submitPayment("failed")} disabled={paymentLifecycle === "submitting"}>{t("Simulate failed Payment")}</button>
                  <button className={styles.secondaryLink} type="button" onClick={() => void submitPayment("cancelled")} disabled={paymentLifecycle === "submitting"}>{t("Cancel simulation")}</button>
                </>}
            </div>
          </section>
        )}

        <section className={styles.checkoutFeedback} aria-labelledby="local-order-contact-heading">
          <h2 id="local-order-contact-heading">{t("Contact and shipping snapshot")}</h2>
          <p>{order.contact.firstName} {order.contact.lastName} · {order.contact.email}</p>
          <p>{order.contact.addressLine1}, {order.contact.city}{order.contact.stateProvince ? `, ${order.contact.stateProvince}` : ""} {order.contact.postalCode}, {order.contact.country}</p>
          {order.contact.phone && <p>{order.contact.phone}</p>}
        </section>
      </div>
      <aside className={styles.checkoutSummary} aria-labelledby="local-order-summary-heading">
        <h2 id="local-order-summary-heading">{t("Order summary")}</h2>
        <div className={styles.checkoutLines}>
          {order.lines.map((line, index) => (
            <article className={styles.checkoutLine} key={`${line.productId}-${line.variantId}-${index}`}>
              <div>
                <strong>{line.productName}</strong>
                <span>{line.skuCode} · {t("Qty")} {line.quantity}</span>
                {line.selectedOptions.length > 0 && <span>{line.selectedOptions.map((selection) => `${selection.optionId}: ${selection.valueId}`).join(" · ")}</span>}
                {line.customization?.map((value) => value.kind === "image"
                  ? <span key={`${value.fieldId}-image`}>{value.fieldCode}: {value.imageCount} {t(value.imageCount === 1 ? "image" : "images")}</span>
                  : value.kind === "single_select"
                    ? <span key={value.fieldId}>{value.fieldCode}: {value.choiceLabel ?? value.choiceId}</span>
                    : value.kind === "multi_select"
                      ? <span key={value.fieldId}>{value.fieldCode}: {(value.selectedChoices ?? []).map((choice) => choice.choiceLabel).join(", ") || value.choiceIds.join(", ")}</span>
                    : <span key={value.fieldId}>{value.fieldCode}: {value.value}</span>)}
              </div>
              <strong>{formatCurrencyCents(line.lineSubtotalCents, line.currency)}</strong>
            </article>
          ))}
        </div>
        <dl className={styles.checkoutTotals}>
          <div><dt>{t("Subtotal")}</dt><dd>{formatCurrencyCents(order.commercial.subtotalCents, order.commercial.currency)}</dd></div>
          <div><dt>{t("Shipping fixture")}</dt><dd>{formatCurrencyCents(order.commercial.shipping.amountCents, order.commercial.shipping.currency)}</dd></div>
          <div><dt>{t("Coupon")} · {couponStatusLabel(order.commercial.coupon.status, t)}</dt><dd>{formatCurrencyCents(order.commercial.coupon.discountCents, order.commercial.currency)}</dd></div>
          <div><dt>{t("Tax")}</dt><dd>{t("Not activated")}</dd></div>
          <div className={styles.checkoutTotalRow}><dt>{t("Local demo total")}</dt><dd>{formatCurrencyCents(order.commercial.localArithmeticTotalCents, order.commercial.currency)}</dd></div>
        </dl>
        <p className={styles.checkoutTaxNotice}>{t("Tax is not activated. This local demo total is arithmetic only; it is not payable and does not authorize payment.")}</p>
      </aside>
    </section>
  );
}
