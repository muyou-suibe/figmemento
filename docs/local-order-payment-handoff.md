# Local Order to Future Payment Handoff

This document records a boundary for a future, separately approved
`build-local-payment-simulation` change. It does not authorize or implement
payment behavior.

## Current Local Order contract

- Local Order status: `pending_payment`.
- Local Order `paymentStatus`: `pending`.
- These values only state that no payment has occurred in the local demo.
- There is no Payment entity, payment repository, payment session,
  PaymentIntent, authorization, capture, refund, or webhook event.
- `localArithmeticTotal` is a development/test calculation with tax
  `not_activated` and amount `null`; it is not a production payable amount.

## Required future re-evaluation

A future payment change must not trust a browser Local Order projection,
public reference alone, capability round-trip, or local arithmetic field as
payment authority. It must define fresh server-side checks for:

1. authorized Local Order access and current pending state;
2. the commercial facts required by the approved local payment simulation;
3. amount and currency semantics, including the inactive tax boundary;
4. payment idempotency, event handling, replay, and failure behavior.

The future change must explicitly decide whether a local payment simulation is
only a test harness or a separate local state machine. It must not imply that
the local result is Stripe, PayPal, or production payment authority.

## Still excluded

Stripe, PayPal, PaymentIntent, webhooks, capture, refund, paid transitions,
production Order persistence, Supabase migrations, production tax/shipping,
email, fulfillment, tracking, and deployment remain outside this handoff.
