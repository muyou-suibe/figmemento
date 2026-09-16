"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { ShoppingCart } from "../domain/shopping-cart.ts";
import type {
  LocalCheckoutPublicAccepted,
  LocalCheckoutPublicFailure,
  LocalCheckoutPublicProjection,
} from "../application/local-checkout-public.ts";
import { formatCurrencyCents } from "../application/catalog-storefront.ts";
import styles from "./catalog-storefront.module.css";
import { trackLocalAnalyticsEvent } from "../client/local-analytics.ts";
import { useReferenceLanguage } from "./ReferenceLanguageProvider";
import { submitLocalOrderWithEstablishment } from "../client/local-order-submit.ts";

type FormState = {
  email: string;
  firstName: string;
  lastName: string;
  country: string;
  stateProvince: string;
  city: string;
  addressLine1: string;
  postalCode: string;
  phone: string;
  shippingMethod: string;
  couponCode: string;
  pointsToRedeem: string;
};

const initialForm: FormState = {
  email: "",
  firstName: "",
  lastName: "",
  country: "US",
  stateProvince: "",
  city: "",
  addressLine1: "",
  postalCode: "",
  phone: "",
  shippingMethod: "local_standard",
  couponCode: "",
  pointsToRedeem: "",
};

function initialCart(): ShoppingCart {
  return { status: "empty", lines: [] };
}

function isAccepted(result: LocalCheckoutPublicProjection | null): result is LocalCheckoutPublicAccepted {
  return result?.status === "accepted";
}

function isFailure(result: LocalCheckoutPublicProjection | null): result is LocalCheckoutPublicFailure {
  return result?.status === "blocked" || result?.status === "unavailable";
}

function couponLabel(status: LocalCheckoutPublicAccepted["coupon"]["status"], t: (value: string) => string): string {
  switch (status) {
    case "valid": return t("Valid coupon");
    case "expired": return t("Expired");
    case "not_applicable": return t("Not applicable");
    case "invalid": return t("Invalid coupon");
    case "not_selected": return t("No coupon selected");
  }
}

export function LocalCheckoutExperience({ localOrderEnabled = false }: { readonly localOrderEnabled?: boolean }) {
  const { t } = useReferenceLanguage();
  const [cart, setCart] = useState<ShoppingCart>(initialCart);
  const [form, setForm] = useState<FormState>(initialForm);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<LocalCheckoutPublicProjection | null>(null);
  const [loadMessage, setLoadMessage] = useState<string | null>(null);
  const [localOrderLifecycle, setLocalOrderLifecycle] = useState<"idle" | "submitting" | "retryable" | "rejected">("idle");
  const [localOrderMessage, setLocalOrderMessage] = useState<string | null>(null);
  const creationAttemptId = useRef<string | null>(null);

  const refreshCart = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/cart", { credentials: "same-origin", cache: "no-store" });
      const next = await response.json() as ShoppingCart;
      setCart(next);
      setLoadMessage(response.ok ? null : "Your local Cart is temporarily unavailable.");
    } catch {
      setLoadMessage("Your local Cart is temporarily unavailable.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void refreshCart(); }, 0);
    return () => window.clearTimeout(timer);
  }, [refreshCart]);

  function update(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setResult(null);
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ ...form, pointsToRedeem: form.pointsToRedeem ? Number(form.pointsToRedeem) : undefined, ...(form.stateProvince ? {} : { stateProvince: undefined }), ...(form.phone ? {} : { phone: undefined }), ...(form.couponCode ? {} : { couponCode: undefined }) }),
      });
      const next = await response.json() as LocalCheckoutPublicProjection;
      setResult(next);
      if (next.status === "accepted") {
        trackLocalAnalyticsEvent({ eventName: "begin_checkout", metadata: { currency: next.currency, subtotalCents: String(next.subtotalCents) } });
        if (form.couponCode.trim() || (next.promotionDiscountCents ?? 0) > 0) {
          trackLocalAnalyticsEvent({ eventName: "apply_coupon", metadata: { couponStatus: next.coupon.status, promotionDiscountCents: String(next.promotionDiscountCents ?? 0) } });
        }
      }
    } catch {
      setResult({ status: "unavailable", issues: [{ code: "CHECKOUT_UNAVAILABLE", message: "Checkout cannot be evaluated right now." }] });
    } finally {
      setSubmitting(false);
    }
  }

  async function createLocalOrder() {
    if (!localOrderEnabled || !isAccepted(result) || localOrderLifecycle === "submitting") return;
    const attemptId = creationAttemptId.current ?? window.crypto.randomUUID();
    creationAttemptId.current = attemptId;
    setLocalOrderLifecycle("submitting");
    setLocalOrderMessage(null);
    const body = {
      ...form,
      creationAttemptId: attemptId,
      ...(form.stateProvince ? {} : { stateProvince: undefined }),
      ...(form.phone ? {} : { phone: undefined }),
      ...(form.couponCode ? {} : { couponCode: undefined }),
      pointsToRedeem: form.pointsToRedeem ? Number(form.pointsToRedeem) : undefined,
    };
    try {
      const response = await submitLocalOrderWithEstablishment(JSON.stringify(body), init => fetch("/api/local-orders", init));
      if (!response.ok) {
        const failure = await response.json().catch(() => null) as LocalCheckoutPublicFailure | null;
        creationAttemptId.current = null;
        setLocalOrderLifecycle("rejected");
        setLocalOrderMessage(failure?.issues?.[0]?.message ?? "Local Order could not be created.");
        return;
      }
      const created = await response.json().catch(() => null) as { publicReference?: unknown } | null;
      if (!created || typeof created.publicReference !== "string" || !/^FM-LOCAL-[A-Z0-9]{16}$/.test(created.publicReference)) {
        setLocalOrderLifecycle("retryable");
        setLocalOrderMessage("The response was lost. Retry with the same Local Order attempt.");
        return;
      }
      trackLocalAnalyticsEvent({ eventName: "purchase", orderReference: created.publicReference });
      window.location.assign(`/order/success/${encodeURIComponent(created.publicReference)}`);
    } catch {
      setLocalOrderLifecycle("retryable");
      setLocalOrderMessage("The connection was interrupted. Retry with the same Local Order attempt.");
    }
  }

  const summaryLines = isAccepted(result)
    ? result.lines
    : cart.lines.map((line) => ({
        lineId: line.lineId,
        productId: line.productId,
        productName: line.productName,
        productSlug: line.productSlug,
        variantId: line.variantId,
        skuCode: line.skuCode,
        selectedOptions: line.selectedOptions,
        unitBasePriceCents: line.unitPriceCents,
        currency: line.currency,
        quantity: line.quantity,
        lineSubtotalCents: line.lineSubtotalCents,
      }));

  if (loading) return <div className={styles.fusionCheckout}><p className={styles.status} role="status">{t("Loading your local Cart…")}</p></div>;
  if (cart.lines.length === 0) {
    return (
      <div className={styles.fusionCheckout}>
        <section className={styles.empty} role="status">
          <p className={styles.eyebrow}>{t("Local checkout")}</p>
          <h1>{t("Your Cart is empty.")}</h1>
          <p>{t("Add a configured gift first, then return here to review a local checkout summary.")}</p>
          <Link className={styles.primaryLink} href="/shop">{t("Explore the shop")}</Link>
        </section>
      </div>
    );
  }

  return (
    <div className={styles.fusionCheckout}>
      <section className={styles.checkoutLayout} aria-labelledby="checkout-heading">
        <div className={styles.checkoutMain}>
        <p className={styles.eyebrow}>{t("Local checkout review")}</p>
        <h1 className={styles.title} id="checkout-heading">{t("A careful final look")}<br /><em>{t("before the next step.")}</em></h1>
        <p className={styles.checkoutIntro}>{t("This is a development checkout evaluation. It rechecks your current Cart and shows a local arithmetic summary without creating an order or taking payment.")}</p>
        <p className={styles.fixtureNotice} role="status">{t("DEVELOPMENT / TEST ONLY — local shipping and coupon fixtures are not production quotes.")}</p>
        {loadMessage && <p className={styles.cartMessage} role="alert">{t(loadMessage)}</p>}

        <form className={styles.checkoutForm} onSubmit={submit}>
          <fieldset className={styles.checkoutFieldset}>
            <legend className={styles.selectorHeading}>{t("Contact")}</legend>
            <label className={styles.checkoutField}>{t("Email")}<input className={styles.checkoutInput} type="email" value={form.email} onChange={(event) => update("email", event.target.value)} required /></label>
          </fieldset>

          <fieldset className={styles.checkoutFieldset}>
            <legend className={styles.selectorHeading}>{t("Shipping address")}</legend>
            <div className={styles.checkoutFieldGrid}>
              <label className={styles.checkoutField}>{t("First name")}<input className={styles.checkoutInput} value={form.firstName} onChange={(event) => update("firstName", event.target.value)} required /></label>
              <label className={styles.checkoutField}>{t("Last name")}<input className={styles.checkoutInput} value={form.lastName} onChange={(event) => update("lastName", event.target.value)} required /></label>
              <label className={styles.checkoutField}>{t("Country")}<select className={styles.checkoutInput} value={form.country} onChange={(event) => update("country", event.target.value)}><option value="US">{t("United States")}</option><option value="CA">{t("Canada (unsupported fixture)")}</option></select></label>
              <label className={styles.checkoutField}>{t("State / province")} <span className={styles.checkoutOptional}>{t("optional")}</span><input className={styles.checkoutInput} value={form.stateProvince} onChange={(event) => update("stateProvince", event.target.value)} /></label>
              <label className={styles.checkoutField}>{t("City")}<input className={styles.checkoutInput} value={form.city} onChange={(event) => update("city", event.target.value)} required /></label>
              <label className={styles.checkoutField}>{t("Postal code")}<input className={styles.checkoutInput} value={form.postalCode} onChange={(event) => update("postalCode", event.target.value)} required /></label>
            </div>
            <label className={styles.checkoutField}>{t("Address line 1")}<input className={styles.checkoutInput} value={form.addressLine1} onChange={(event) => update("addressLine1", event.target.value)} required /></label>
            <label className={styles.checkoutField}>{t("Phone")} <span className={styles.checkoutOptional}>{t("optional")}</span><input className={styles.checkoutInput} value={form.phone} onChange={(event) => update("phone", event.target.value)} /></label>
          </fieldset>

          <fieldset className={styles.checkoutFieldset}>
            <legend className={styles.selectorHeading}>{t("Local shipping")}</legend>
            <label className={styles.checkoutField}>{t("Shipping method")}<select className={styles.checkoutInput} value={form.shippingMethod} onChange={(event) => update("shippingMethod", event.target.value)}><option value="local_standard">{t("Local standard — $5.00 fixture")}</option><option value="unsupported_method">{t("Unsupported method (test)")}</option></select></label>
            <p className={styles.checkoutHelp}>{t("DEVELOPMENT / TEST ONLY · Orders of $49 or more receive free local shipping; lower totals use the $5 fixture.")}</p>
          </fieldset>

          <fieldset className={styles.checkoutFieldset}>
            <legend className={styles.selectorHeading}>{t("Coupon")}</legend>
            <label className={styles.checkoutField}>{t("Coupon code")} <span className={styles.checkoutOptional}>{t("optional")}</span><input className={styles.checkoutInput} value={form.couponCode} onChange={(event) => update("couponCode", event.target.value)} placeholder="WELCOME10" /></label>
            <p className={styles.checkoutHelp}>{t("Try WELCOME10, UNKNOWN, EXPIRED10, or NOT_APPLICABLE.")}</p>
          </fieldset>

          <fieldset className={styles.checkoutFieldset}>
            <legend className={styles.selectorHeading}>{t("Points")}</legend>
            <label className={styles.checkoutField}>{t("Points to redeem")} <span className={styles.checkoutOptional}>{t("optional")}</span><input className={styles.checkoutInput} type="number" min="0" step="1" value={form.pointsToRedeem} onChange={(event) => update("pointsToRedeem", event.target.value)} placeholder="0" /></label>
            <p className={styles.checkoutHelp}>{t("100 points = $1 · up to 30% of eligible order value · server evaluated for signed-in accounts.")}</p>
          </fieldset>

          <button className={styles.primaryLink} type="submit" disabled={submitting}>{submitting ? t("Reviewing…") : t("Review local checkout")}</button>
        </form>

        {isFailure(result) && <section className={styles.checkoutFeedback} role="alert"><h2>{result.status === "blocked" ? t("Checkout needs review") : t("Checkout is temporarily unavailable")}</h2>{result.issues.map((issue, index) => <p key={`${issue.code}-${index}`}>{t(issue.message)}</p>)}</section>}
        {isAccepted(result) && <section className={styles.checkoutFeedbackSuccess} role="status"><h2>{t("Local checkout summary ready")}</h2><p>{t("This is not a payable amount and does not create an order or payment.")}</p>{localOrderEnabled && <><p className={styles.checkoutHelp}>{t("DEVELOPMENT / TEST ONLY · Payment has not occurred. Create local pending order is a process-memory demonstration.")}</p><button className={styles.primaryLink} type="button" onClick={() => void createLocalOrder()} disabled={localOrderLifecycle === "submitting"}>{localOrderLifecycle === "submitting" ? t("Creating local order…") : localOrderLifecycle === "retryable" ? t("Retry create local order") : t("Create local pending order")}</button>{localOrderMessage && <p role="alert">{t(localOrderMessage)}</p>}</>}</section>}
      </div>

        <aside className={styles.checkoutSummary} aria-labelledby="checkout-summary-heading">
        <h2 id="checkout-summary-heading">{t("Your Cart")}</h2>
        <div className={styles.checkoutLines}>
          {summaryLines.map((line) => <article className={styles.checkoutLine} key={line.lineId}><div><strong>{line.productName}</strong><span>{line.skuCode} · Qty {line.quantity}</span>{line.selectedOptions.length > 0 && <span>{line.selectedOptions.map((selection) => `${selection.optionId}: ${selection.valueId}`).join(" · ")}</span>}</div><strong>{formatCurrencyCents(line.lineSubtotalCents, line.currency)}</strong></article>)}
        </div>
        {!isAccepted(result) && <dl className={styles.checkoutTotals}><div><dt>{t("Subtotal")}</dt><dd>{formatCurrencyCents(cart.subtotalCents ?? 0, cart.currency ?? "USD")}</dd></div><div><dt>{t("Shipping")}</dt><dd>—</dd></div><div><dt>{t("Discount")}</dt><dd>—</dd></div></dl>}
        {isAccepted(result) && <dl className={styles.checkoutTotals}><div><dt>{t("Subtotal")}</dt><dd>{formatCurrencyCents(result.subtotalCents, result.currency)}</dd></div><div><dt>{t("Shipping fixture")}</dt><dd>{result.shipping.amountCents === 0 ? t("Free") : formatCurrencyCents(result.shipping.amountCents, result.shipping.currency)}</dd></div><div><dt>{t("Coupon")} · {couponLabel(result.coupon.status, t)}</dt><dd>{formatCurrencyCents(result.coupon.discountCents, result.currency)}</dd></div>{result.promotionDiscountCents !== undefined && result.promotionDiscountCents > 0 && <div><dt>{t("Local promotion")}</dt><dd>-{formatCurrencyCents(result.promotionDiscountCents, result.currency)}</dd></div>}{result.pointsDiscountCents !== undefined && result.pointsDiscountCents > 0 && <div><dt>{t("Points")} · {result.pointsRedeemed} {t("redeemed")}</dt><dd>-{formatCurrencyCents(result.pointsDiscountCents, result.currency)}</dd></div>}<div><dt>{t("Tax")}</dt><dd>{t("Not activated")}</dd></div><div className={styles.checkoutTotalRow}><dt>{t("Local demo total")}</dt><dd>{formatCurrencyCents(result.localDemoTotalCents, result.currency)}</dd></div></dl>}
        {!isAccepted(result) && <p className={styles.checkoutTaxNotice}>{t("Tax is not activated in this local demo.")}</p>}
        {isAccepted(result) && <p className={styles.checkoutTaxNotice}>{t("Tax is not activated in this local demo. This local demo total is not payable, charged, or an order total.")}</p>}
        </aside>
      </section>
    </div>
  );
}
