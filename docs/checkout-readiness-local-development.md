# Checkout Readiness: Local Development Boundary

This document describes the read-only readiness observation added by
`build-checkout-readiness-boundary`. It is a pre-checkout diagnostic boundary,
not a checkout implementation.

## Local verification

Prerequisites:

- Node.js dependencies installed with the repository lockfile.
- No Supabase, Stripe, PayPal, storage, shipping, tax, discount, or order
  provider is required for the offline evaluator tests.

Run the focused contract tests with:

```sh
node --experimental-strip-types --test tests/checkout-readiness.test.mjs
```

The normal offline suite remains the project-level regression gate:

```sh
npm run test:offline
```

The HTTP surface is `GET /api/checkout-readiness`. It reads the existing
server-owned `figmemento-local-cart` cookie only. It does not accept Cart IDs,
prices, currencies, amounts, upload receipts, owner IDs, or checkout data from
the browser as authority.

## Meaning of the result

- `ready` means only that injected/readable current authorities passed a
  point-in-time pre-checkout observation. It does not authorize an Order,
  payment, price lock, shipping quote, reservation, or production handoff.
- `blocked` means the required authorities were evaluated and a bounded Cart
  or deferred dependency issue must be resolved.
- `unavailable` means a required authority could not be evaluated safely.
  Production private-image readiness remains stopped because durable receipt
  persistence/provider activation is not approved. In development/test,
  `CUSTOMER_UPLOAD_SOURCE=local_fake` can supply the verified owner-scoped
  process-local receipt authority described in
  `docs/local-customer-upload-development.md`.

An empty Cart is `blocked` with `EMPTY_CART`. The read does not create a Cart or
issue a Cart cookie. A stale line is reported; it is never silently refreshed,
removed, or replaced.

The archived Cart line has no historical FulfillmentConfig snapshot. Readiness
therefore validates only the current Product fulfillment authority and does not
claim to detect a historical fulfillment change. `FULFILLMENT_CHANGED` is not
inferred from the absence of a baseline.

The current runtime classifies durable Order persistence, shipping, tax,
discount, and payment as not activated. The route therefore cannot be used as
a working Checkout, Buy, Pay, or order-creation flow.

## Synthetic ready evidence

Offline tests inject deterministic Cart, Catalog, Customization, and (where
needed) verified owner-scoped receipt fakes. This makes the evaluator's
`ready` branch testable without live providers. Synthetic readiness is not
production checkout authorization and must not be represented as a production
fixture source or a `CHECKOUT_SOURCE` setting.

Any future checkout implementation must reuse the accepted configured-item and
normalized OrderRequest boundaries and repeat fresh authority checks immediately
before Order or payment side effects. A readiness report is observational and
subject to time-of-check/time-of-use drift.

## Explicit exclusions

This boundary does not create Orders or OrderItems, persist snapshots, call
Stripe or PayPal, calculate shipping/tax/discount/payment totals, reserve
inventory, claim uploads, choose Supabase Storage or R2, or change the Cart.
