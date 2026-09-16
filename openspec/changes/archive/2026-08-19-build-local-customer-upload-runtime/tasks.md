## 1. Current Runtime / Ownership Audit

- [x] 1.1 Audit the existing CustomerUpload domain, object-store port, receipt repository, acceptance, lifecycle, preview, guest-owner, HTTP routes, local fakes, smoke harness, Cart integration, and Checkout Readiness integration.
- [x] 1.2 Create `docs/local-customer-upload-runtime-audit.md` classifying current components as reusable provider-neutral authority, local/test-only evidence, legacy/prototype compatibility, production-stopped dependency, or not implemented.
- [x] 1.3 Record the exact contracts the local runtime MUST reuse and identify any conflicting or duplicate CustomerUpload runtime/source boundary.
- [x] 1.4 Record frozen Customization, C1, Shopping Cart, Checkout Readiness, Customer Auth, production provider, migration, payment, DNS, Cloudflare, and deployment boundaries.

## 2. Local Runtime Source and Composition Contract

- [x] 2.1 Define `CUSTOMER_UPLOAD_SOURCE` with only `disabled` and `local_fake`, unless the audit finds an already-approved equivalent source.
- [x] 2.2 Define development/test-only `local_fake` activation and production fail-closed behavior with no automatic fallback.
- [x] 2.3 Define one process-local shared runtime bundle implementing existing object store, receipt repository, preview, ID allocation, expiry, and required provider-neutral dependencies.
- [x] 2.4 Define reuse of the existing signed `photogift-guest-draft-owner` boundary with no new upload-owner identity or Customer/Auth/Cart substitution.
- [x] 2.5 Define process-restart, hot-reload where relevant, and multi-instance limitations without database/filesystem/remote persistence.

## 3. Process-Memory CustomerUpload Runtime

- [x] 3.1 Plan a legitimate server/infrastructure local-memory object-store adapter that keeps bytes private and exposes no provider locator.
- [x] 3.2 Plan a local-memory owner-scoped receipt repository implementing the current receipt lifecycle contract and coarse cross-owner behavior.
- [x] 3.3 Plan cryptographically opaque runtime receipt IDs while preserving injectable deterministic ID generation for tests.
- [x] 3.4 Plan local-only receipt expiry/preview timing policy without converting test values into production retention policy.
- [x] 3.5 Plan one shared runtime instance per process so upload, preview, Cart, and Readiness observe the same local receipts/objects.
- [x] 3.6 Plan deterministic test reset/isolation without exposing a runtime reset endpoint or importing test-only modules into public routes.

## 4. Upload and Preview HTTP Runtime

- [x] 4.1 Plan activation of the existing `POST /api/uploads` route through local_fake with the minimal non-authoritative `productId` + `fieldId` lookup selector, while preserving disabled/production fail-closed behavior and independent Product/CustomerUpload source guards.
- [x] 4.2 Plan exact same-origin, guest-owner, selector parsing, current server-side Product/CustomizationField re-resolution, Product ownership/active/image-kind checks, browser-constraint rejection, multipart/image inspection, and mutation ordering so missing, invalid, cross-Product, inactive, or non-image targets create no object/receipt.
- [x] 4.3 Plan local activation of the existing customer-input preview route using verified owner-scoped receipt lookup and private `no-store` responses.
- [x] 4.4 Plan safe HTTP projection that returns opaque receipt metadata only and never provider locator, owner ID, bucket, object key, permanent URL, or diagnostics.
- [x] 4.5 Plan cross-owner, expired, inactive, malformed, source-failure, size/type/dimension rejection, and partial-write failure behavior with safe failure, no receipt/object existence leakage, and existing best-effort compensation where currently supported; do not promise HTTP retry deduplication.

## 5. Cart and Checkout Readiness Composition

- [x] 5.1 Plan Cart Add composition so private-image configured items use the existing guest-owner verification plus the same local receipt repository through `acceptConfiguredItemHandoff`.
- [x] 5.2 Plan preservation of text-only Cart behavior and ensure Cart identity never becomes CustomerUpload ownership authority.
- [x] 5.3 Plan Checkout Readiness local composition using the same verified owner-scoped receipt repository without changing its archived canonical semantics.
- [x] 5.4 Plan the local browser end-to-end configured-copy flow: upload → receipt → customization → Cart Add → Checkout Readiness, including process-restart fail-closed behavior.

## 6. Local Development and Production Handoff

- [x] 6.1 Plan `docs/local-customer-upload-development.md` with exact local source setup, same-process limitations, guest-owner behavior, test-only retention caveat, and safe manual verification steps.
- [x] 6.2 Plan production-handoff documentation preserving unresolved provider, receipt-persistence, bucket/binding, retention, preview TTL, cleanup, and deployment decisions.
- [x] 6.3 Document that local upload success is not evidence for production provider, durability, retention, scaling, security approval, checkout activation, or deployment authorization.

## 7. Verification and Stop Gate

- [x] 7.1 Plan deterministic domain/runtime/security tests for source parsing, production fail-closed, Product/field selector validation and server re-resolution, cross-Product/inactive/non-image rejection, browser-constraint non-authority, independent source modes, process-memory object/receipt lifecycle, owner isolation, preview, expiry, restart, no secret/provider leakage, safe partial failure/compensation, and two explicit successful POSTs that may produce two different opaque receipts without HTTP idempotency.
- [x] 7.2 Plan integration regression for actual upload/preview routes plus Customization→Cart Add→Checkout Readiness local flow, including text-only non-coupling and private-image fail-closed disabled-source cases.
- [x] 7.3 Plan full offline/lint/typecheck/build/rendered/OpenSpec/diff verification and confirm no remote Supabase, migration, production provider, Order, payment, DNS, Cloudflare, deployment, or frozen-task action.

## Batch Plan

### Local CustomerUpload Batch 1 — 20/30

Tasks 1.1–1.4, 2.1–2.5, 3.1–3.6, and 4.1–4.5 cover audit, explicit source
selection, process-memory runtime, and upload/preview HTTP activation. Cart and
Checkout Readiness composition are intentionally deferred to the final batch.

### Local CustomerUpload Final Batch — 10/30

Tasks 5.1–5.4, 6.1–6.3, and 7.1–7.3 cover Cart/Checkout Readiness composition,
developer and production handoff, and final verification.

## Stop Gate

This change starts at 0/30. Apply MUST stop if the audit discovers an existing
active owner for local CustomerUpload runtime, an incompatible source selector,
an ownership contract that cannot support guest local runtime, a materially
incompatible archived Cart/Readiness contract, or a requirement for migration or
production provider selection. Planning does not authorize implementation,
remote Supabase access, migration, production storage, Order, payment, DNS,
Cloudflare, or deployment actions.
