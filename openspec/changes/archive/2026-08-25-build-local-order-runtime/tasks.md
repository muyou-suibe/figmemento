## 1. Boundary Audit and Local Runtime Configuration

- [x] 1.1 Re-read the canonical local-checkout-runtime, shopping-cart, local-customer-upload-runtime, customer-auth, and engineering-foundation specs; record the Local Order reuse boundary and prohibited production/legacy Order paths.
- [x] 1.2 Audit the current Cart cookie/runtime, configured-item acceptance, Catalog/SKU resolution, local shipping/coupon/tax evaluation, CustomerUpload owner/receipt authority, and existing Order API/repository seams; document only currently implemented contracts used by Local Order.
- [x] 1.3 Add a server-only Local Order runtime configuration parser with explicit local selection, direct runtime-mode authority, disabled-by-default behavior, and production rejection; do not add a Supabase fallback or expose configuration to client code.
- [x] 1.4 Add focused configuration/runtime tests covering explicit development/test enablement, absent selection rejection, production rejection, direct runtime-mode precedence, and no environment-object disclosure.

## 2. Local Order Domain and Snapshot Contracts

- [x] 2.1 Add strict Local Order domain types for protected immutable snapshots, safe public projections, local-only public reference, pending_payment Order state, pending payment state, and bounded create/read issues without modifying legacy production Order types.
- [x] 2.2 Add bounded parsers for Local Order create input and opaque UUID-format creationAttemptId; accept only checkout structural input and selector, and reject browser Order facts, prices, discounts, shipping/tax amounts, configuration facts, receipt facts, accepted-checkout results, and payment state.
- [x] 2.3 Define server-only snapshot builders that capture immutable contact/address, commercial summary, Product/Variant/SKU/options/quantity/base-price/currency, and accepted customization revision/value facts for each configured Cart copy.
- [x] 2.4 Define controlled image-customization snapshot/reference rules that retain only required server-side receipt and accepted crop/configuration facts, and safe projection rules that omit owner IDs, storage keys, object URLs, signed URLs, capabilities, and private upload content.
- [x] 2.5 Add deterministic domain tests for snapshot deep-copy/immutability, separate configured copies, pending-payment wording/state, safe projection omission, public-reference format, and input-boundary rejection.

## 3. Process-Memory Repository, Idempotency, and Access Authorization

- [x] 3.1 Define a Local Order repository port for atomic context-bound find-or-create, protected snapshot lookup, and same-browser access authorization validation; keep it independent from Supabase and existing production Order repositories.
- [x] 3.2 Implement the development/test-only process-memory Local Order repository with generated internal IDs, local-only public references, defensively immutable storage, and no process-external persistence.
- [x] 3.3 Implement repository-atomic idempotency binding for server-resolved Cart/current-authority context plus creationAttemptId and canonical server-side normalized-input fingerprint; return the original result only for an equivalent retry, restore access authorization after a lost response/Set-Cookie, and safely reject mismatched reuse.
- [x] 3.4 Implement one opaque browser-local access capability bound server-side to multiple authorized Local Order references in the running process; reissue it for equivalent retries when needed, ensure Order B does not invalidate Order A, and ensure public references/capabilities never enter JSON, URLs, or logs.
- [x] 3.5 Add offline repository tests for first create, equivalent retry, changed-context/fingerprint rejection, distinct-attempt creation, concurrent same-attempt protection, rapid duplicate-submit protection, multi-Order access, lost-response access restoration, rollback/no-readable-partial failure behavior, unauthorized read, and restart loss.

## 4. Fresh Authority Evaluation and Local HTTP Boundaries

- [x] 4.1 Implement a Local Order creation application service that fresh-reads the server Cart and reuses current configured-item acceptance, Catalog/Variant authority, CustomerUpload owner/active-receipt checks, and local shipping/coupon/tax arithmetic without accepting AcceptedCheckout or browser commercial facts.
- [x] 4.2 Add server-side canonical creation-context/fingerprint derivation from authorized current state and normalized input; ensure no raw upload owner, receipt capability, storage locator, or secret is included in the browser surface.
- [x] 4.3 Implement protected snapshot assembly and repository commit as one all-or-nothing Local Order creation operation; retain the Cart unchanged after success and preserve local tax not_activated/null semantics.
- [x] 4.4 Add a dedicated local-only create HTTP endpoint with same-origin enforcement, bounded request parsing, Cart-cookie resolution, local runtime gate, safe issue mapping, idempotent Set-Cookie access authorization, and no production Order/payment/provider calls.
- [x] 4.5 Add a dedicated local-only read HTTP endpoint requiring both a valid public reference and matching HttpOnly access authorization; return only a safe public projection and a non-enumerating bounded response for missing/mismatched/lost state.
- [x] 4.6 Add focused application/HTTP integration tests for fresh authority success; empty/stale/ineligible Cart; invalid/missing/cross-owner/inactive image receipt; unsupported shipping; mixed currency; coupon statuses; tax semantics; no Cart mutation; no provider calls; safe error/privacy behavior; and post-restart fail-closed read.

## 5. Checkout Handoff and Local Order Success Experience

- [x] 5.1 Extend the existing Local Checkout client handoff only in explicit Local Order runtime mode with an IDLE → SUBMITTING → terminal creation lifecycle; generate one opaque attempt selector per explicit action, guard the CTA while submitting, reuse the selector for retries, submit structural checkout fields only, and redirect using only the public reference.
- [x] 5.2 Add the local Order Success route/page that performs the protected server read, renders the safe pending-payment development-only summary, and handles unavailable/unauthorized/restart-lost state without existence leakage.
- [x] 5.3 Render immutable safe line details for Product, Variant/SKU, selected options, quantity, accepted customization summary, local shipping/coupon/tax status, and local arithmetic total without paid, charged, delivery, or fulfillment claims.
- [x] 5.4 Add client/rendered tests for rapid duplicate-submit prevention, same-selector retry, lost-response access restoration, no browser authority fields, pending-payment-only state, safe summary display for multiple Orders, Cart preservation, protected success-page access, and absence of payment-success language.

## 6. Fixture Coverage, Documentation, and Final Gates

- [x] 6.1 Add deterministic shipping-required text-only domain/HTTP integration coverage without changing public fixtures; preserve the no-public-physical-text-only-fixture limitation.
- [x] 6.2 Add real browser acceptance coverage using glass-light-picture with required image receipt and optional text; do not repurpose digital-portrait, add a fake physical text-only Product, or implement Digital Checkout.
- [x] 6.3 Add browser/restart/privacy/idempotency acceptance evidence for guarded rapid double-submit, same-browser reads of Orders A and B, public-reference-only rejection, image-receipt authority, equivalent retry with access-cookie restoration, mismatched selector reuse, distinct attempts after terminal completion, immutable snapshot read, and runtime-restart fail-closed behavior.
- [x] 6.4 Update local development and future-production handoff documentation to explain explicit Local Order mode, process-memory loss, safe same-browser access, Cart preservation, pending payment, fixture limits, and excluded payment/production behavior without adding secrets.
- [x] 6.5 Run focused Local Order tests, relevant Cart/Checkout/CustomerUpload/Catalog regressions, full offline tests, typecheck, lint, production build, rendered tests, and real browser acceptance; fix only in-scope defects.
- [x] 6.6 Run openspec validate --all --strict and git diff --check; verify no remote Supabase, migration, storage-provider, payment, OrderItem persistence, C1 backfill, DNS, Cloudflare, or deployment operation occurred before marking this change complete.
