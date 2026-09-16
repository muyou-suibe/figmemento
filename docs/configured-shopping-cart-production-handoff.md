# Configured Shopping Cart Production Handoff

This document completes the planning handoff for Tasks 6.1–6.4. It does not
create a production provider, database schema, migration, checkout route, or
payment behavior.

## 6.1 Future persistence/provider requirements

The current `local_fake` Cart is process-memory only. A future production
provider must be approved separately and must define:

- opaque Cart and CartLine identity, ownership, and current-session lookup;
- server-side Product/Variant/customization authority at Add and final
  checkout;
- RLS, grants, tenant/session ownership, and authorization failure mapping;
- retention, expiry, cleanup, abandoned-cart behavior, and privacy boundaries;
- concurrency and idempotency for line mutation, clear, and retries;
- multi-instance behavior and deployment/runtime consistency;
- safe serialization that excludes Cart IDs, cookies, owner bindings, receipt
  IDs, storage keys, signed URLs, provider metadata, and secrets.

No table, trigger, RPC, migration, storage provider, or production persistence
is selected by this change. The local provider clears on process restart and
is not suitable for production or multi-instance traffic.

## 6.2 Customer session coexistence

The dedicated `figmemento-local-cart` cookie is separate from:

- `photogift-guest-draft-owner`;
- `figmemento-local-customer-session`;
- `photogift-admin-session`.

Sign-in does not claim or merge a Cart. Sign-out does not destroy it. Guest →
Customer merge, authenticated Cart merge, claim, conflict resolution,
idempotency, rollback, and retention semantics require a later approved change.

For local development only, `CART_SOURCE=local_fake` plus
`CUSTOMER_UPLOAD_SOURCE=local_fake` composes the existing verified guest-owner
boundary with the shared process-local receipt repository. A receipt ID alone
is never ownership proof. The Cart route does not invent an owner ID, and the
local runtime is not production persistence. Production private-image Cart Add
remains stopped until receipt persistence and a storage provider are approved.

## 6.3 Cart → existing order/checkout boundary

The future checkout adapter must reuse, in order:

1. `ConfiguredItemHandoff` as the configured-item input boundary;
2. `acceptConfiguredItemHandoff` for server acceptance and ownership checks;
3. `order-catalog-resolution.ts` for authoritative Product/Variant/SKU,
   price, currency, eligibility, and subtotal resolution;
4. `configured-item-order-compatibility.ts` and the normalized order request
   boundary for customization/upload compatibility;
5. the existing order route only after the approved order persistence and
   payment changes are complete.

No second order request model is introduced. Batch 1 does not change
`order_items`, order snapshots, Stripe, PayPal, shipping, coupons, or payment
status.

## 6.4 Final checkout revalidation

Before any future payment session or order mutation, the server must
revalidate the current Product, Category/public eligibility, Variant/SKU,
selected options, availability, authoritative base price, currency,
fulfillment, customization configuration/revision, customer-upload ownership
and lifecycle, quantity, shipping, discounts, and final totals. Cart subtotal
is display-only and is never payment authority.

Current blockers remain explicit:

- C1 is 41/61 with Task 3.5 blocked and `BACKFILL AUTHORIZED: NO`;
- Customization is 64/70;
- production Customer Auth is not activated;
- production CustomerUpload receipt persistence is not activated;
- production Cart persistence is not activated;
- final checkout/payment/shipping changes are not part of this change.

This handoff does not authorize remote Supabase access, migration execution,
deployment, DNS/Cloudflare changes, or reopening any frozen change.
