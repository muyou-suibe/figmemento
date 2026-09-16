# Checkout Readiness Boundary Audit

This document records the repository audit required by
`build-checkout-readiness-boundary` Tasks 1.1–1.4. It is developer-facing
documentation. It does not activate checkout, create Orders, call payment
providers, access remote Supabase, or change any frozen OpenSpec change.

## Current state

- Shopping Cart: 36/36, archived; local Cart foundation is pre-checkout only.
- Checkout: not activated.
- Payment: not activated.
- Production Cart persistence: not implemented.
- Customer Auth: 30/30, archived; production Customer Auth is not activated.
- C1: 41/61; Task 3.5 is blocked; `BACKFILL AUTHORIZED: NO`.
- Customization: 64/70; durable OrderItem attachment remains blocked by the
  ordered C1/Phase C work.
- Private image Cart Add/Readiness: **local `local_fake` only; production
  receipt provider not activated**.
- Production domain cutover: not authorized.

## Authority classification

| Authority | Classification | Evidence and readiness boundary |
|---|---|---|
| Current Cart reader | IMPLEMENTED / REUSABLE | `ShoppingCartProvider.getCart`, `readShoppingCartId`, and the server Cart runtime read the server-owned `figmemento-local-cart`. |
| Cart identity | IMPLEMENTED / REUSABLE | `figmemento-local-cart` is anonymous Cart identity only; it is not Customer Auth, Admin Auth, or upload ownership. |
| Internal configured CartLine | IMPLEMENTED / REUSABLE | `ShoppingCartRecord` retains an internal `ConfiguredItemHandoff`, catalog snapshot, safe customization summary, quantity, and opaque line ID. |
| Public Cart projection | IMPLEMENTED / REUSABLE | `toPublicShoppingCart` intentionally removes private/internal authority; it is not sufficient to reconstruct a private handoff. |
| `ConfiguredItemHandoff` parser | IMPLEMENTED / REUSABLE | `parseConfiguredItemHandoff` remains the structural configured-item contract. |
| `acceptConfiguredItemHandoff` | IMPLEMENTED / REUSABLE | Existing read-only acceptance revalidates catalog, Variant/SKU, selected options, configuration revision, values, and owned receipts when a verified owner is supplied. |
| Product resolution | IMPLEMENTED / REUSABLE | `PublicCatalogReadRepository.findPublicProductById` returns public Product, Category, graph, assets, options, Variants, and FulfillmentConfig. |
| Variant/SKU resolution | IMPLEMENTED / REUSABLE | `resolveExactVariant` and existing `resolveVariantSelection` are the current Variant/SKU authorities. |
| Selected options | IMPLEMENTED / REUSABLE | Variant selection and `canonicalVariantSignature` provide current option-combination authority. |
| Price/currency | IMPLEMENTED / REUSABLE | Variant `priceCents` and `currency` are authoritative; Cart snapshot values are comparison facts only. |
| FulfillmentConfig | IMPLEMENTED / REUSABLE, WITH EVIDENCE LIMIT | Public Catalog detail exposes the current Product FulfillmentConfig; it is not a shipping-rate engine. The archived Cart line stores no historical FulfillmentConfig snapshot/signature, so readiness validates only current ownership/configuration validity and cannot claim historical fulfillment-change detection. |
| Customization configuration | IMPLEMENTED / REUSABLE | `CustomizationFieldReadRepository` returns the current Product configuration and revision. |
| Customization values | IMPLEMENTED / REUSABLE | Existing configured-item acceptance and `validateCustomizationValuesAgainstFields` validate current values; readiness must not duplicate this validator. |
| CustomerUpload owner verification | IMPLEMENTED / LOCAL-ONLY | Final Batch composes the existing verified guest-owner boundary for local image Cart Add and readiness; Cart identity remains separate. |
| CustomerUpload receipt repository | LOCAL-ONLY / PRODUCTION DEFERRED | The process-local repository is shared by local upload, Cart, and readiness; the production receipt provider remains unactivated and image paths fail closed without local authority. |
| Normalized OrderRequest | IMPLEMENTED / REUSABLE | `parseOrderRequestItem`, normalized request types, and conversion to `ConfiguredItemHandoff` are existing structural boundaries. |
| `order-catalog-resolution` | IMPLEMENTED / REUSABLE | Current order-side Catalog/Variant/SKU resolution is reusable by later checkout, not duplicated by readiness. |
| `configured-item-order-compatibility` | IMPLEMENTED / REUSABLE | Existing compatibility projection keeps Customization separate from Catalog purchase authority. |
| `legacy-order-compatibility` | LEGACY COMPATIBILITY | Product-slug legacy requests remain a compatibility path and are not new readiness authority. |
| `/api/orders` | PARTIAL / DEFERRED | Legacy order creation exists, but normalized personalized order requests hit an explicit 503 stop gate before order side effects. Readiness must never call this route. |
| Order persistence | PARTIAL / DEFERRED | Legacy tables/paths exist, while the approved immutable C1 Product/SKU snapshot and Customization attachment chain are incomplete. |
| OrderItem snapshot persistence | PARTIAL / DEFERRED | Existing legacy item writes do not satisfy the pending C1 7.4/Customization Phase C contract. |
| Shipping | LEGACY COMPATIBILITY / PARTIAL | Existing order compatibility contains legacy shipping behavior; no approved data-driven shipping-rate authority is active for readiness. |
| Tax | NOT IMPLEMENTED | No approved tax authority or calculation engine is active. |
| Coupon/discount | LEGACY COMPATIBILITY / PARTIAL | Existing coupon validation/calculation paths exist, but they are not a final checkout total authority for this change. |
| Stripe | PARTIAL / DEFERRED | Existing Stripe signature/replay and legacy checkout code are present; readiness must not create a Checkout Session or PaymentIntent. |
| PayPal | NOT IMPLEMENTED | No PayPal execution or webhook authority is active. |
| Payment webhooks | PARTIAL / DEFERRED | Stripe webhook verification/idempotency exists; this does not activate payment or readiness side effects. |
| Runtime/source configuration | IMPLEMENTED / REUSABLE | Existing server-only source/runtime configuration is reused; no `CHECKOUT_SOURCE` selector is introduced. |

## Reused contracts

The evaluator is constrained to compose these existing boundaries:

1. `ShoppingCartProvider.getCart` and `readShoppingCartId` for the current
   server-owned Cart identity and internal stored handoff.
2. `ConfiguredItemHandoff` and `parseConfiguredItemHandoff` for configured-copy
   structure.
3. `acceptConfiguredItemHandoff` for one authoritative read-only revalidation
   of Product, Variant/SKU, selected options, Customization, and receipts.
4. `PublicCatalogReadRepository` and existing Catalog resolution for Product,
   Category/public eligibility, Variant, price, currency, options, and
   FulfillmentConfig.
5. `CustomizationFieldReadRepository` through the existing acceptance service,
   not a readiness-specific field validator.
6. Existing CustomerUpload owner/receipt ports only when a real verified owner
   boundary is injected; Cart identity never substitutes for upload ownership.
7. `order-catalog-resolution`, `configured-item-order-compatibility`,
   `legacy-order-compatibility`, and normalized OrderRequest contracts for a
   future handoff; readiness does not create a competing order model.

No incompatible duplicate Product resolver, Variant resolver, price resolver,
Customization validator, CustomerUpload ownership model, OrderRequest DTO, or
order compatibility model is authorized.

## Readiness-specific boundary

Readiness is an observational application boundary between the current Cart and
a future transactional checkout. It may compare Cart snapshots with fresh
authority, but it must not update snapshots, remove stale lines, change
quantity, claim uploads, create Orders, reserve inventory, call payment, or
write database state.

The public report may expose only safe line identity, safe Product/SKU display
facts, state, and bounded issue codes. It must not expose receipt IDs, owner IDs,
guest-owner tokens, handoffs, storage metadata, provider diagnostics, internal
task numbers, or migration details.

Overall precedence is deterministic:

1. `unavailable` if any required authority cannot be evaluated safely;
2. `blocked` if authorities were evaluated but any line or dependency blocks a
   future handoff;
3. `ready` only if every required readiness check passes.

An empty Cart is `blocked` with `EMPTY_CART` and does not create a Cart cookie.
The HTTP route reads the Cart cookie first, so a missing identity short-circuits
without requiring the Cart provider. For a valid-looking cookie it captures the
current Cart once; a provider-available not-found result and a zero-line Cart
then short-circuit before initializing Catalog or Customization authorities.
If the provider itself is unavailable, a claimed Cart cannot be safely resolved
and remains `CART_UNAVAILABLE`. Even a synthetic offline `ready` result is not
checkout authorization. A future checkout transaction must revalidate again
immediately before Order or payment side effects.

Fulfillment limitation: current FulfillmentConfig validity is checked, but
`FULFILLMENT_CHANGED` is not inferred because the archived Cart has no
historical fulfillment baseline. Adding such a baseline belongs to a later
approved Cart/order change.

## Frozen boundaries

This change does not modify:

- archived Shopping Cart 36/36 or its canonical spec;
- archived Customer Auth 30/30 or its canonical spec;
- C1 task state, the 3.5 business-input block, or backfill authorization;
- Customization task state or Phase C;
- Brand/Domain or Visual task state;
- migrations, database schema, remote Supabase, payment, DNS, Cloudflare, or
  deployment.

No production readiness claim can be made from development fixtures. The
current private-image limitation remains exactly:

**PRIVATE IMAGE CART ADD: FAIL-CLOSED — RUNTIME RECEIPT PROVIDER NOT ACTIVATED**
