## Why

The archived Shopping Cart foundation deliberately keeps Cart snapshots out of
checkout and payment authority, while the current normalized order boundary is
still fail-closed and production persistence is incomplete. A separate,
server-owned readiness boundary is needed now so the application can explain
whether the current Cart is technically eligible for a future checkout handoff
without implying that checkout, order creation, or payment is available.

## What Changes

- Add a provider-neutral `CheckoutReadinessReport` with only `ready`, `blocked`,
  and `unavailable` top-level states.
- Revalidate current Cart lines against existing Catalog, Variant/SKU,
  selected-option, fulfillment, Customization, and CustomerUpload authority
  without trusting Cart snapshots as current facts.
- Add deterministic, line-level readiness results and a bounded public issue
  vocabulary that does not expose internal task numbers, provider diagnostics,
  private upload identifiers, or storage details.
- Define a read-only readiness evaluator and a narrow HTTP surface equivalent to
  `GET /api/checkout-readiness`, using the existing server-side Cart identity.
- Classify unresolved order persistence, shipping, tax, discount, payment, and
  deployment dependencies without implementing any of them.
- Document the future readiness-to-normalized-order handoff and the mandatory
  time-of-check/time-of-use revalidation required by a later transactional
  checkout change.
- Add deterministic offline and read-only HTTP/rendered regression coverage.

This change is informational and pre-checkout only. A synthetic `ready` result
does not authorize Order creation, checkout sessions, payment, inventory
reservation, price locking, production launch, or shipping/tax finalization.

Out of scope:

- Product, Variant/SKU, price, fulfillment, CustomizationField, or upload
  authoring and persistence;
- production Cart persistence, Cart-to-Customer claiming, or guest merge;
- Order/OrderItem schema, snapshots, persistence, or `POST /api/orders`;
- Stripe, PayPal, payment webhooks, payment secrets, shipping-rate providers,
  tax, coupons, discounts, promotions, fraud, or inventory reservation;
- Supabase migrations, RLS, production provider configuration, DNS, Cloudflare,
  deployment, or production domain activation;
- a second Product resolver, Variant resolver, Customization validator,
  CustomerUpload ownership model, pricing engine, or normalized order DTO;
- changing the current private-image Cart limitation:
  `PRIVATE IMAGE CART ADD: FAIL-CLOSED — RUNTIME RECEIPT PROVIDER NOT ACTIVATED`.

## Capabilities

### New Capabilities

- `checkout-readiness`: Provide a provider-neutral, read-only assessment of
  whether the current server-owned Cart can be handed to a future checkout
  boundary, including safe line-level reasons and unresolved dependency states.

### Modified Capabilities

- None. The archived `shopping-cart` capability remains authoritative and is
  consumed as an input boundary without changing its requirements.

## Impact

- New planning and future implementation areas may include `app/domain`,
  `app/application`, `app/server`, `app/api/checkout-readiness`, `tests`, and
  readiness documentation.
- The evaluator will depend on the archived Cart server boundary,
  `acceptConfiguredItemHandoff`, existing Catalog/Variant resolution,
  Customization acceptance, CustomerUpload ownership contracts, normalized
  order request boundaries, and current order stop gates.
- Current project blockers remain external dependencies: C1 is 41/61 with Task
  3.5 blocked and `BACKFILL AUTHORIZED: NO`; Customization is 64/70; production
  Cart persistence, CustomerUpload persistence, Customer Auth, checkout, and
  payment are not activated.
- Readiness evaluation is read-only and must not create Cart state, mutate Cart
  snapshots, claim uploads, create Orders, call payment providers, or write
  database state.
- The main risk is falsely interpreting `ready` as executable checkout. The
  contract and documentation must explicitly require a second fresh
  authoritative validation immediately before any future durable order/payment
  side effect.
