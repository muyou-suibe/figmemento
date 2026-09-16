## Why

FigMemento now has an approved Product → Variant/SKU catalog, a validated configured-item/customization handoff, and a guest-owned private-upload boundary, but it has no safe Cart foundation that can preserve differently personalized copies. The existing `app/domain/cart.ts` is only a legacy `CartItem` alias around `Product` plus legacy customization and there is no public Cart API, Cart provider, Cart cookie, or Cart UI; this change establishes the missing pre-checkout boundary before checkout/payment work is considered.

## What Changes

- Audit and document the existing Cart-shaped, ConfiguredItem, customization summary, upload ownership, catalog-resolution, normalized-order, legacy-order, payment, and identity-boundary contracts.
- Define a provider-neutral `ShoppingCart`, `CartLine`, safe Cart state, Cart totals, quantity, and configured-copy identity contract.
- Make every explicit Add to Cart create a new opaque CartLine; never automatically merge lines by Product, Variant/SKU, options, customization hash, photo, text, or configured-item hash.
- Define an explicit `CART_SOURCE` boundary with only `disabled` and development/test-only `local_fake` modes, plus a process-memory guest Cart provider for later implementation.
- Define a dedicated host-only `figmemento-local-cart` cookie with lazy Cart creation and strict separation from Customer Auth, Admin Auth, and guest draft-owner cookies.
- Define safe Cart read/add/update/remove/clear HTTP behavior using the established same-origin mutation convention and exact Cart-line ownership checks.
- Define a `/cart` storefront surface and navigation treatment that presents safe configured-copy summaries, explicit quantity changes, remove/clear behavior, and display-only subtotal information.
- Document the future production Cart provider/persistence handoff and the narrow Cart → existing normalized order/checkout boundary without activating checkout, payment, shipping, coupons, tax, or order persistence redesign.
- Add deterministic offline and rendered verification requirements for configured-copy separation, price authority, privacy, cookie isolation, stale catalog behavior, and deferred checkout boundaries.

The future implementation must reuse the existing `ConfiguredItemHandoff`, `acceptConfiguredItemHandoff`, safe customization summary, Variant/catalog resolution, and normalized order compatibility contracts rather than creating incompatible duplicates. Cart totals remain display/pre-checkout facts; checkout or order creation must revalidate authoritative Product, Variant/SKU, availability, price, currency, fulfillment, customization, and other checkout-owned facts.

## Capabilities

### New Capabilities

- `shopping-cart`: Provider-neutral guest Cart contracts, configured-copy Cart lines, local-only Cart source/provider, Cart HTTP/UI boundaries, privacy/security rules, and deferred production/checkout handoff.

### Modified Capabilities

None. Existing catalog, customization, customer-auth, guest-owner, upload, order, payment, brand/domain, and visual requirements remain unchanged. Any future changes to order snapshot persistence, Guest → Customer merge, checkout, or payment require separate approved changes.

## Impact

- Future implementation areas include `app/domain/`, `app/application/`, `app/server/`, `app/api/cart/`, `app/cart/`, storefront navigation, tests, docs, and the non-secret `CART_SOURCE` entry in `.env.example`.
- Existing `app/domain/cart.ts` remains a legacy compatibility shape until a later implementation replaces or isolates it; this planning change does not edit it.
- The Cart boundary depends on the current authoritative catalog resolution and accepted configured-item handoff, but does not alter C1 migration/backfill state or Customization Phase C.
- Private CustomerUpload receipt IDs, storage keys, bucket names, signed URLs, owner bindings, and lifecycle/provider metadata remain outside public Cart projections.
- No Cart database table, `cart_items` table, migration, RLS policy, trigger, RPC, Supabase persistence, remote provider, DNS, Cloudflare, deployment, Stripe, PayPal, tax, shipping, coupon, inventory, or production checkout activation is included.
- Customer Auth remains archived at 30/30 but production Customer Auth is not activated; signing in or out does not claim, merge, or destroy a guest Cart.

## Batch Plan

### CART BATCH 1 — 29/36 planned

Tasks 1.1–1.4, 2.1–2.7, 3.1–3.7, 4.1–4.5, and 5.1–5.6: audit, provider-neutral domain contract, local guest Cart foundation, HTTP/security boundary, and Cart UI.

### CART FINAL BATCH 2 — 7/36 planned

Tasks 6.1–6.4 and 7.1–7.3: production/provider handoff, existing order/checkout boundary documentation, final offline/rendered verification, and stop gate.

Implementation remains **NOT STARTED** until a later explicit Apply request.
