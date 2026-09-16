# Checkout Readiness Production Handoff

This document is a handoff for a future checkout implementation. The current
readiness boundary is informational and read-only; it is not an Order or
payment authorization.

## Required conceptual handoff

```text
server-owned current Cart
  -> CheckoutReadinessReport (observation only)
  -> fresh transactional revalidation
  -> accepted ConfiguredItemHandoff
  -> existing normalized OrderRequest boundary
  -> future Order transaction
```

The future implementation must reuse:

- `ConfiguredItemHandoff`
- `acceptConfiguredItemHandoff`
- the existing normalized OrderRequest boundary
- `order-catalog-resolution`
- `configured-item-order-compatibility`

It must not introduce `CheckoutOrderRequest`, `ReadyOrderItem`,
`CartOrderSnapshot`, a durable readiness token, a checkout authorization nonce,
or a price-lock token. A prior `ready` response cannot authorize later side
effects.

Cart display snapshots identify what must be looked up; they are not immutable
OrderItem authority. Future checkout must freshly resolve Product, Variant/SKU,
selected options, price, currency, Customization, uploads, and current
fulfillment before writing the approved C1/order snapshots. Current C1 remains
incomplete, so durable Order persistence is not activated.

## Future transaction requirements

The later checkout change must define and test, without assuming a provider:

- one transaction boundary for Order and OrderItem snapshot writes;
- TOCTOU revalidation immediately before durable writes and payment effects;
- idempotency keys and safe retry behavior;
- concurrent checkout attempts and Cart mutation during checkout;
- price, availability, Customization, upload-expiry, and fulfillment races;
- deterministic Order then payment sequencing and rollback/compensation;
- payment-success/Order-failure and Order-success/payment-failure recovery;
- webhook reconciliation and double-submit prevention.

No concurrency lock, reservation, payment call, Order write, or compensation
policy is implemented by this change.

## Current commercial and provider dependencies

The following remain unresolved and must be explicitly approved in later
changes; this document invents no values:

- durable production Cart persistence;
- immutable Order/OrderItem snapshot persistence;
- CustomerUpload receipt persistence and verified owner-scoped runtime
  provider;
- shipping-rate authority and country/weight/product-type rules;
- tax authority;
- discount/coupon final-total authority;
- Stripe and PayPal payment authority and verified server-side state;
- fraud/risk policy if required by future checkout;
- Customer Auth activation and guest/customer ownership policy;
- production runtime, domain, and deployment configuration.

No shipping prices, tax rates, discounts, fraud thresholds, credentials, SLAs,
or provider values are defined here.

## Current activation blockers

Internal engineering handoff state:

- C1: `41/61`; Task 3.5 is blocked; `BACKFILL AUTHORIZED: NO`.
- Customization: `64/70`.
- Private Image Cart Add/Readiness: local `local_fake` composition is available
  only in one process; production receipt provider is not activated.
- Production Cart persistence: not implemented.
- Production Customer Auth: not activated.
- Checkout: not activated.
- Payment: not activated.
- Production domain cutover: not authorized.

These internal statuses must never be copied into shopper-facing readiness
messages. The current endpoint exposes only bounded public readiness states and
issue codes.

## Explicit non-actions

This handoff does not create or apply migrations, modify the remote database,
create Orders, call Stripe or PayPal, implement shipping/tax/discount engines,
activate Customer Auth, choose object storage, reserve inventory, change the
archived Cart contract, change DNS/Cloudflare, or deploy production.
