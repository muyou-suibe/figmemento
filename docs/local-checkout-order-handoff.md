# Future Local Checkout to Local Order Handoff

The Local Checkout result is a server-only, non-durable evaluation. It is not
an Order, a checkout session, a durable ID, a browser token, a payment amount,
or a price lock. A future Local Order change must not accept a browser
round-trip of this result as authority.

## Required fresh read before any Order side effect

A future order path must freshly read and validate:

1. the current server-owned Cart and each distinct configured copy;
2. current public Product and Category eligibility;
3. current Variant/SKU identity, selected options, availability, base price,
   and currency;
4. current Customization configuration, revision, and normalized values;
5. verified owner-scoped CustomerUpload receipt lifecycle for image values;
6. current approved shipping, coupon, tax, and final-total authority.

Only after those reads succeed may a later change decide how to persist an
Order. The local `localDemoTotal` cannot be reused as a payable amount.

## Existing compatibility seams to reuse

The future implementation should compose the current boundaries rather than
recreate their models:

- `app/application/order-catalog-resolution.ts` for Product/Variant/SKU,
  selected-option, price, currency, and subtotal authority;
- `app/application/configured-item-order-compatibility.ts` for configured-item
  compatibility;
- `app/application/normalized-order-request-boundary.ts` for the later
  normalized order request contract;
- `app/application/legacy-order-compatibility.ts` only where historic order
  compatibility remains required.

This document does not authorize an Order route, Order persistence, payment,
or any database/schema work.

## Still deferred

The future change must separately define durable Order and OrderItem snapshots,
transaction boundaries, authorization, payment semantics, final shipping/tax
authority, retry/idempotency policy, and production provider configuration. It
must also respect the deferred C1 and Customization work rather than assuming
their active OpenSpec changes are complete.
