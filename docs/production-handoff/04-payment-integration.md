# 04 — Stripe and PayPal integration

Overall status: **PRODUCTION INTEGRATION REQUIRED**.

## Current local authority

Classification: **LOCAL SIMULATION ONLY**.

The local core provides canonical Order totals, immutable pricing snapshots,
atomic Payment attempts/actions, idempotent selectors, failure/cancel/success
simulation and an atomic canonical paid transition. It explicitly states that
no real money was charged.

The browser, success redirect and `AcceptedCheckout` are not payment authority.
Existing legacy Stripe-shaped code is not evidence of a production transaction
ledger, webhook recovery or PayPal support.

## Adapter rule

Stripe and PayPal adapters must feed verified provider facts into the existing
canonical Payment command boundary. They must not redesign Order totals around
provider payloads or write Order/Payment lifecycle rows directly.

Before initiating payment, the server must bind:

- exact canonical Order and owner;
- amount in integer minor units and exact currency;
- provider environment/account;
- stable application operation/idempotency key;
- provider transaction/session/order reference after verified creation.

Only verified server-side provider state may authorize the canonical paid
transition.

## Required provider work

| Capability | Classification | Acceptance requirement |
| --- | --- | --- |
| Stripe Checkout initiation | PRODUCTION INTEGRATION REQUIRED | Create against exact Order amount/currency/account; safely bind provider Session/PaymentIntent. |
| PayPal Order initiation/capture | PRODUCTION INTEGRATION REQUIRED | Server create/capture/GET with sandbox/live separation and payer/payee/resource validation. |
| Signed webhooks | PRODUCTION INTEGRATION REQUIRED | Raw-body verification, durable inbox, replay protection and ACK only after durable handling. |
| Success | PRODUCTION INTEGRATION REQUIRED | Reconcile exact provider transaction, amount, currency and canonical Order before paid transition. |
| Failure/cancel/expiry | PRODUCTION INTEGRATION REQUIRED | Preserve monotonic history; never reverse an already verified paid state. |
| Duplicate/out-of-order events | PRODUCTION INTEGRATION REQUIRED | Idempotent inbox/action semantics and deterministic reconciliation. |
| Lost HTTP response | PRODUCTION INTEGRATION REQUIRED | Recover using the original operation key and provider retrieve API; never create blind duplicate payments. |
| Refund | PRODUCTION INTEGRATION REQUIRED | Approved Admin `full_remaining` policy, provider refund binding, concurrent reservation and reconciliation. |
| Dispute/reversal | NEEDS PROVIDER DECISION | Decide hold/manual-review and downstream Fulfillment policy without deleting financial history. |
| Zero-amount Order policy | NEEDS PROVIDER DECISION | Do not charge one cent, fabricate paid state or silently disable valid discounts. |

## Reconciliation requirements

- Provider create/capture can succeed while application binding fails; retain an
  unmatched/unknown reconciliation state rather than deleting the Order.
- Payment response, webhook and retrieve may arrive in any order. Preserve all
  genuine financial facts while allowing only one canonical business winner.
- A second provider charge must not trigger duplicate paid, Fulfillment, email
  or Shipment effects.
- Amount, currency, account and exact provider resource linkage must match.
- Retry budgets, timeouts and provider rate limits must be bounded and audited.

## Production credentials/configuration

- Stripe test/live secret and publishable keys.
- Stripe expected account identity and webhook endpoint secret.
- PayPal sandbox/live application credentials, merchant/buyer accounts and
  webhook ID.
- Approved callback/forwarding endpoints and test windows.
- Refund authorization owner and financial reconciliation runbook.

Actual values must remain outside the repository.

## Acceptance checklist

- [ ] Stripe test Checkout → payment → signed webhook → retrieve → canonical paid.
- [ ] PayPal sandbox approval → capture → official webhook verification → GET/reconcile.
- [ ] Exact amount/currency/account mismatch rejection.
- [ ] Duplicate and out-of-order webhook replay.
- [ ] Lost-response recovery without duplicate transaction.
- [ ] Failure/cancel/expiry behavior.
- [ ] Admin full-remaining refund and concurrent last-refundable race.
- [ ] Cross-provider duplicate-payment hold/manual reconciliation.
- [ ] No browser redirect or submitted total can mark an Order paid.
