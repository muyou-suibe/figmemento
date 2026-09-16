## 1. Current Checkout / Order Boundary Audit

- [x] 1.1 Audit the current Cart, configured-item acceptance, Catalog/Variant resolution, Customization, CustomerUpload, normalized order request, order persistence, fulfillment, shipping, tax, discount, payment, and checkout stop-gate boundaries before designing the evaluator.
- [x] 1.2 Create `docs/checkout-readiness-boundary-audit.md` classifying each authority as implemented/reusable, legacy compatibility, partial/deferred, unavailable runtime dependency, or not implemented, without printing secrets or provider diagnostics.
- [x] 1.3 Record the exact existing contracts the readiness evaluator must reuse, including the Cart server boundary, configured-item acceptance, Catalog/Variant resolution, Customization validation, CustomerUpload ownership, normalized OrderRequest, order catalog resolution, and compatibility projections; stop on incompatible duplicate authority.
- [x] 1.4 Record frozen C1, Customization, archived Shopping Cart, archived Customer Auth, Brand/Domain, Visual, payment, migration, remote, and deployment boundaries, including C1 41/61, Task 3.5 blocked, `BACKFILL AUTHORIZED: NO`, and Customization 64/70.

## 2. Provider-Neutral Checkout Readiness Contract

- [x] 2.1 Define `CheckoutReadinessReport` with only `ready`, `blocked`, and `unavailable` states, including empty-Cart behavior and deterministic fail-closed aggregation precedence.
- [x] 2.2 Define the smallest coherent bounded readiness issue-code/message vocabulary and safe public/private diagnostic split without task numbers, migration names, SQL, provider errors, secrets, or private identifiers.
- [x] 2.3 Define a safe per-CartLine readiness projection that preserves opaque configured-copy identity and excludes private handoff, receipt, owner, storage, and provider data.
- [x] 2.4 Define fresh Product, Variant/SKU, selected-option, availability, price, and currency revalidation requirements, including Cart-snapshot non-authority and no silent Cart refresh or mutation.
- [x] 2.5 Define fulfillment and stale-data readiness semantics without shipping-price, carrier, SLA, tax, inventory-reservation, production-capacity, delivery-guarantee, or price-lock claims.
- [x] 2.6 Define Customization and CustomerUpload readiness semantics by reusing existing acceptance/ownership boundaries, preserving fail-closed behavior when the owner-scoped receipt runtime provider is unavailable.
- [x] 2.7 Define order-persistence, shipping, tax, discount, payment, and deployment dependency classification while keeping Cart subtotal display-only and checkout/payment inactive.

## 3. Checkout Readiness Evaluator

- [x] 3.1 Implement the provider-neutral `CheckoutReadinessEvaluator` application boundary with injected existing repositories/services and no second Product, Variant, pricing, Customization, upload, or order validator.
- [x] 3.2 Acquire the current Cart through the existing server boundary using server-owned identity only; prove empty reads do not create Cart state or a Cart cookie.
- [x] 3.3 Revalidate every CartLine independently against current Product, Variant/SKU, selected options, price, currency, availability, and fulfillment authority while preserving same-SKU configured copies.
- [x] 3.4 Revalidate current Customization revision and values through the existing configured-item acceptance boundary without creating a competing Customization validator or changing Cart state.
- [x] 3.5 Verify CustomerUpload ownership/readiness only through an existing verified owner-scoped authority; preserve the private-image fail-closed limitation when the runtime receipt provider is unavailable.
- [x] 3.6 Implement deterministic line and overall aggregation with unavailable-first precedence, bounded safe issues, no silent stale-line removal, and no Cart/order/payment/database side effects.
- [x] 3.7 Encode the time-of-check/time-of-use boundary: readiness is observational only, and future transactional checkout must freshly revalidate before durable Order or payment side effects.

## 4. Read-Only HTTP / Presentation Boundary

- [x] 4.1 Add a narrow read-only HTTP surface equivalent to `GET /api/checkout-readiness` that reads Cart identity server-side and accepts no Cart ID, Customer ID, owner ID, receipt ID, price, currency, or amount authority.
- [x] 4.2 Define and implement safe HTTP projection/status semantics for `ready`, `blocked`, and `unavailable`, mapping internal failures without exposing provider diagnostics, private identifiers, storage details, or internal C1/Customization task numbers.
- [x] 4.3 Prove the readiness endpoint has no side effects: no Cart creation/update, cookie issuance for empty reads, stale-line removal, upload claim, Order creation, inventory reservation, checkout session, payment call, or database mutation.
- [x] 4.4 If a user-facing presentation is useful, add only a read-only non-checkout status using the existing visual/accessibility system; otherwise leave the Cart UI unchanged and ensure no Checkout/Buy/Pay CTA is introduced.
- [x] 4.5 Document local/offline developer usage and the exact distinction between synthetic `ready` test evidence and production checkout authorization, without adding `CHECKOUT_SOURCE=local_fake` unless a later audit proves a real need.

## 5. Production Checkout Handoff

- [x] 5.1 Create readiness handoff documentation mapping Cart/readiness to the existing accepted configured-item and normalized OrderRequest boundaries, prohibiting a second order DTO and direct Cart snapshot persistence as OrderItem authority.
- [x] 5.2 Document final transactional checkout revalidation, TOCTOU, concurrency, idempotency, rollback, and Order/payment sequencing requirements without implementing them or changing the current order stop gate.
- [x] 5.3 Document unresolved shipping, tax, discount, payment/provider, fraud/risk, production Cart, CustomerUpload, and deployment dependencies without configuring providers or inventing business values.
- [x] 5.4 Document the current C1, Customization, CustomerUpload, Cart persistence, Customer Auth, and production deployment blockers that must be resolved before real checkout activation.

## 6. Verification and Stop Gate

- [x] 6.1 Add deterministic offline readiness evaluator/security/privacy tests covering ready/blocked/unavailable, empty Cart, per-line issues, same-SKU separation, stale Catalog, price/currency changes, fulfillment, Customization/upload fail-closed behavior, Cart identity, aggregation precedence, and no side effects.
- [x] 6.2 Add HTTP/rendered/source regression coverage for the read-only readiness surface and any approved presentation, proving no Checkout/payment action, private data leakage, client Cart-ID authority, or internal blocker leakage.
- [x] 6.3 Run focused readiness tests, `npm run test:offline`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test:rendered`, `openspec validate --all --strict`, and `git diff --check`; confirm no remote Supabase, migration, Order, payment, DNS, Cloudflare, deployment, or frozen-change action occurred.

## Batch Plan

### CHECKOUT READINESS BATCH 1 — 23/30

Implement only Tasks 1.1–1.4, 2.1–2.7, 3.1–3.7, and 4.1–4.5: audit,
provider-neutral readiness contract, evaluator, and read-only HTTP/presentation
boundary.

### CHECKOUT READINESS FINAL BATCH — 7/30

Implement only Tasks 5.1–5.4 and 6.1–6.3: production checkout/order/payment
handoff documentation and final deterministic verification.

Implementation status at planning completion: **0/30 — NOT STARTED**.
