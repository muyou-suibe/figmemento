## 1. Current Cart / Configured-Item Audit

- [x] 1.1 Audit the current Cart-shaped types, ConfiguredItem handoff and acceptance, Variant/SKU resolution, customization summary/values, CustomerUpload and guest-owner boundaries, normalized order request, order compatibility, checkout, Stripe, and payment boundaries before implementing any Cart contract.
- [x] 1.2 Create `docs/configured-shopping-cart-audit.md` classifying existing code as implemented/reusable, partial/deferred, private ownership boundary, order handoff, or not implemented; explicitly record that no public Cart API/provider/cookie/UI currently exists and that `app/domain/cart.ts` is legacy compatibility only.
- [x] 1.3 Record the exact existing `ConfiguredItemHandoff`, accepted configured-item result, safe customization-summary projection, normalized order request, order catalog resolution, and legacy compatibility contracts that Cart will reuse; stop and report any incompatible duplicate concept before implementation.
- [x] 1.4 Record frozen C1, Customization, archived Customer Auth, Brand/Domain, Visual, payment, database, migration, DNS/Cloudflare, and deployment boundaries, including C1 41/61 with Task 3.5 blocked and `BACKFILL AUTHORIZED: NO`.

## 2. Provider-Neutral Cart Domain Contract

- [x] 2.1 Define provider-neutral `ShoppingCart` states for safe empty, available, stale/unavailable, unavailable-source, and bounded failure outcomes without exposing provider or private-upload details.
- [x] 2.2 Define `CartLine` as an opaque configured-copy line with server-owned identity, Product/Variant/SKU identity, safe selected options, safe customization summary, quantity, display unit price, currency, and any necessary safe snapshot; do not duplicate `ConfiguredItemHandoff`.
- [x] 2.3 Define the safe configured-item summary composition and private customization firewall, including explicit exclusion of receipt IDs when private, object/storage keys, bucket names, signed URLs, owner bindings, provider metadata, and raw paths.
- [x] 2.4 Define positive-integer quantity validation with a documented bounded anti-abuse limit and explicit exact-line mutation semantics; prove quantity does not imply inventory, reservation, production-slot, price-lock, or shipping-capacity authority.
- [x] 2.5 Define Variant/SKU-authoritative display price and currency semantics, display-only Cart subtotal, incompatible-currency failure, stale catalog handling, and the mandatory future checkout/order revalidation boundary.
- [x] 2.6 Define no-auto-merge semantics so every explicit Add creates a new configured-copy line, including same SKU plus different/equal customization cases; explicit quantity mutation is the only path to changing an existing line's quantity.
- [x] 2.7 Define the provider-neutral `ShoppingCartProvider`/repository port, safe public projection, ownership-scoped line operations, bounded failures, and no network/provider assumptions.

## 3. Local Guest Cart Foundation

- [x] 3.1 Add explicit server-side `CART_SOURCE` configuration with only `disabled` and `local_fake`, preserving injectable environments for offline tests and rejecting `local_fake` in production.
- [x] 3.2 Implement the development/test process-memory Cart provider with opaque cryptographically secure Cart and line IDs, deterministic injected fakes, no database/filesystem/remote persistence, and restart/multi-instance limitations.
- [x] 3.3 Define and implement the dedicated local Cart cookie (`figmemento-local-cart` unless an audited repository convention requires another name), including lazy creation, HttpOnly, SameSite=Lax, Path=/, host-only scope, no Domain, runtime-appropriate Secure behavior, and separation from Customer/Admin/guest-owner cookies.
- [x] 3.4 Implement Add-line behavior from an already accepted configured-item handoff and authoritative Catalog resolution; reject browser price, currency, availability, fulfillment, private storage, or unvalidated customization as authority.
- [x] 3.5 Implement exact-line quantity updates with server validation, current-Cart ownership, no implicit merge, bounded errors, and no mutation of other lines.
- [x] 3.6 Implement exact-line removal and optional clear-Cart behavior; keep cross-Cart lines private and ensure clear does not delete customization drafts, CustomerUploads, guest-owner identity, auth sessions, orders, or payment state.
- [x] 3.7 Implement stale/unavailable Product/Variant handling and safe source-failure behavior, and document that process restart clears local Carts and that no inventory reservation or production persistence exists.

## 4. HTTP and Security Boundary

- [x] 4.1 Define and implement safe `GET /api/cart` behavior (or an explicitly justified repository-equivalent) with lazy-empty semantics, safe serialization, no Cart cookie leakage, and no unrelated state mutation.
- [x] 4.2 Define and implement `POST /api/cart/items` accepting only the minimum configured-item input and returning safe Cart state; revalidate authoritative catalog/customization/upload facts before mutation.
- [x] 4.3 Define and implement `PATCH /api/cart/items/[lineId]` quantity and `DELETE /api/cart/items/[lineId]` removal semantics with exact current-Cart ownership and bounded unknown/cross-Cart responses.
- [x] 4.4 If clear Cart is included, implement `DELETE /api/cart` as a current-Cart-only mutation with no draft/upload/guest-owner/customer/order/payment deletion effects; otherwise document why it remains deferred.
- [x] 4.5 Apply exact same-origin and `Sec-Fetch-Site` mutation protection to Cart POST/PATCH/DELETE routes, reject missing/malformed/cross/attacker origins and hostile Host/X-Forwarded-Host reliance, and verify rejection occurs before state mutation.

## 5. Cart Storefront UI

- [x] 5.1 Add the future public Cart navigation entry and `/cart` route without a misleading badge/count or checkout activation; preserve the completed FigMemento visual system.
- [x] 5.2 Define and render empty Cart, unavailable-source, and stale/unavailable states with safe recovery links and no fake product/catalog fallback.
- [x] 5.3 Render configured CartLines using only safe Product/SKU/options/customization summaries, keeping same-SKU configured copies visibly distinct and excluding private upload/storage internals.
- [x] 5.4 Add accessible line-scoped quantity and remove interactions, plus clear behavior only if the HTTP contract supports it; prove repeated Add creates separate lines rather than merging.
- [x] 5.5 Present display-only subtotal and currency with no tax, shipping, discount, coupon, final-charge, payment, or checkout-readiness claims; do not add a working Checkout CTA.
- [x] 5.6 Apply the completed FigMemento visual/accessibility system: semantic headings, visible focus, keyboard and touch-usable controls, responsive layout, loading/status/error feedback, and reduced-motion behavior.

## 6. Production Persistence and Checkout Handoff

- [x] 6.1 Document future production Cart persistence/provider requirements, including schema, RLS, ownership, retention, cleanup, concurrency, multi-instance behavior, and deployment gates, without creating tables, migrations, triggers, RPCs, or choosing Supabase Storage/R2.
- [x] 6.2 Document Customer-session/guest-Cart coexistence and explicitly defer Guest → Customer Cart merge, authenticated Cart merge, claim, conflict, idempotency, and rollback semantics to a later approved change.
- [x] 6.3 Document the Cart → existing normalized order/checkout contract mapping, reusing `ConfiguredItemHandoff`, order catalog resolution, and existing order compatibility without creating a second order request model or changing order snapshots.
- [x] 6.4 Document final checkout revalidation requirements for Product, Variant/SKU, availability, price, currency, fulfillment, customization, uploads, and other checkout-owned facts; record current C1/Customization blockers and confirm Cart subtotal is not payment authority.

## 7. Verification and Stop Gate

- [x] 7.1 Add deterministic offline Cart domain/provider/cookie/security/privacy tests covering configured-copy identity, no-auto-merge, quantity, currency, availability, source modes, process reset, cookie isolation, same-origin protection, cross-Cart ownership, and private-upload exclusion.
- [x] 7.2 Add rendered Cart UI and configured-copy distinction regression coverage for empty, available, stale/unavailable, safe summaries, quantity/remove behavior, accessibility, responsive/reduced-motion boundaries, and absence of checkout/payment claims.
- [x] 7.3 Run focused Cart tests, `npm run test:offline`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test:rendered`, `openspec validate --all --strict`, and `git diff --check`; confirm no remote Supabase, migration, payment, DNS, Cloudflare, deployment, or frozen-change action occurred.

## Batch Plan

### CART BATCH 1 — 29/36

Implement only Tasks 1.1–1.4, 2.1–2.7, 3.1–3.7, 4.1–4.5, and 5.1–5.6: audit, domain contract, local guest Cart, HTTP/security boundary, and Cart UI.

### CART FINAL BATCH 2 — 7/36

Implement only Tasks 6.1–6.4 and 7.1–7.3: production/provider handoff, existing order/checkout boundary, final verification, and stop gate.

Implementation status at planning completion: **0/36 — NOT STARTED**.
