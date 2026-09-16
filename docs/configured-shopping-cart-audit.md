# Configured Shopping Cart Boundary Audit

Status: Batch 1 implementation baseline, 2026-08-18

This audit is the input for `build-configured-shopping-cart`. It records what
already exists, what is intentionally reused, and what remains deferred. It
does not activate checkout, persistence, payment, or production Cart behavior.

## Implemented and reusable

- `app/domain/configured-item.ts` defines the existing structural
  `ConfiguredItemHandoff`: Product, Variant, SKU, selected SKU options,
  configuration revision, and normalized customization values. It is not a
  Cart model and is never treated as browser authority.
- `app/application/configured-item-handoff-acceptance.ts` re-resolves the
  public Product graph, eligible Variant/SKU, current customization
  configuration, and owner-scoped upload receipts. Cart Add uses this service
  rather than creating a second parser or validator.
- `app/application/catalog-repository.ts` and the catalog implementations are
  the Product/Variant authority. Browser price, currency, availability,
  fulfillment, and SKU claims are not authoritative.
- `app/application/product-customization-summary.ts` is the existing safe
  presentation projection. The Cart boundary derives a narrower summary from
  it and excludes receipt identity, storage/provider data, and private object
  topology.
- `app/application/normalized-order-request-boundary.ts`,
  `app/application/order-catalog-resolution.ts`, and
  `app/application/configured-item-order-compatibility.ts` are the existing
  future order handoff boundaries. Batch 1 does not call checkout or change
  order persistence.
- `app/server/customer-upload-ownership.server.ts` and the guest draft owner
  codec define the private upload ownership boundary. Cart never accepts an
  owner ID, receipt ownership, object path, signed URL, or storage key from a
  browser request.

## Legacy compatibility only

`app/domain/cart.ts` currently exports `CartItem` and
`CartOrderItemPayload`. It is a legacy Product-plus-customization shape used
by existing order compatibility code. It is not promoted, deleted, or reused
as the new configured-copy CartLine identity.

The legacy order route remains responsible for order creation, shipping,
coupons, Stripe, and payment behavior. The Cart change does not modify it.

## Partial or deferred

- No provider-neutral `ShoppingCart`, `CartLine`, Cart provider, Cart cookie,
  Cart HTTP routes, or `/cart` page existed at audit time.
- Normalized personalized checkout is intentionally unavailable in the
  current order route. The Cart therefore stops at local pre-checkout display.
- No production Cart persistence, RLS policy, multi-instance behavior,
  authenticated Cart merge, guest-to-customer merge, checkout handoff, or
  payment activation is implemented in Batch 1.
- The production repository still has no receipt-repository factory that a
  Cart route can construct without choosing a future upload persistence
  provider. For local development, the Final Batch composes the process-local
  repository only when the explicit `local_fake` source and a verified guest
  owner are available. The Cart route does not use a placeholder owner ID: no
  owner is passed for a handoff without private receipts, and a handoff
  containing receipts is rejected unless the route has both a real verified
  owner and an owner-scoped repository.

## Private ownership firewall

Customer upload receipts may be referenced inside server-side acceptance, but
the public Cart projection contains no receipt ID, owner ID, storage key,
bucket, provider metadata, private path, signed URL, or raw customization
object. Text values may be shown back to the same shopper as a safe summary;
image rows are represented only as bounded status/count information.

## Required Cart semantics

Every successful explicit Add creates a new configured-copy line with quantity
one. Same SKU with different customization, and even identical customization
added twice, remains two lines. Only an exact line-scoped quantity mutation
changes quantity. Cart subtotal is display-only and is calculated from the
authoritative Variant/SKU price accepted at Add; future checkout must
revalidate every authority again.

## Frozen boundaries

- C1 catalog remains 41/61 with Task 3.5 blocked and `BACKFILL AUTHORIZED: NO`.
- Customization remains a parallel approved change; no new field, rule,
  upload, or persistence semantics are introduced here.
- Customer Auth is archived at 30/30 but production activation and Cart merge
  are not authorized.
- Brand/Domain and Visual changes remain frozen. Cart styling uses existing
  scoped storefront tokens and does not redesign the visual system.
- No remote Supabase access, migration, payment, Stripe/PayPal, shipping,
  coupon, inventory reservation, DNS, Cloudflare, deployment, or production
  persistence is part of this batch.

## Not implemented before this change

There was no public Cart API/provider/cookie/UI. The new Batch 1 implementation
adds only the local, process-memory, explicitly configured foundation described
by the approved Cart change. Production persistence and final checkout remain
the later Batch 2 tasks.
