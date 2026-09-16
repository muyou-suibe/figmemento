## 1. Architecture and source boundary

- [x] 1.1 Record the current Admin Products, Catalog API, Admin Orders, export, Storage, and authentication composition points and define the exact routes covered by this change.
- [x] 1.2 Add a typed server-only parser for the explicit `ADMIN_ACCEPTANCE_SOURCE=local_fake` selector, with absent, unknown, development/test, and production outcomes.
- [x] 1.3 Add one deferred, server-side source composition boundary that is selected only after the existing Admin session verifier accepts the request and is shared by every covered Admin route.
- [x] 1.4 Verify production/default behavior, fail-closed production local-source behavior, no provider fallback, and absence of the selector from browser-visible bundles and request authority.

## 2. Local Admin Catalog runtime

- [x] 2.1 Create a typed process-memory Admin Catalog state graph seeded from the existing deterministic development Catalog fixture factory without copying test-only behavior.
- [x] 2.2 Implement the local Admin Catalog read adapter using existing provider-neutral Catalog contracts and validation, including the complete graph required by `/admin/products`.
- [x] 2.3 Implement process-memory content/option/option-value/Variant command adapters that reuse existing parsers, bounded command intent, and same-Product validation.
- [x] 2.4 Implement process-memory ProductAsset, ProductFulfillmentConfig, existing Catalog-adjacent CustomizationField, and lifecycle adapter composition without adding semantics or hard deletion.
- [x] 2.5 Provide test-only state injection/reset boundaries and verify that local changes are honest in-memory results, reset on process restart, and never use filesystem, SQLite, Supabase, D1, Drizzle, or network persistence.

## 3. Local Admin Orders read model

- [x] 3.1 Define the provider-neutral Admin Orders read contract and safe projection required by the existing Orders page, filters, pagination, and export boundary.
- [x] 3.2 Add clearly synthetic `LOCAL / TEST ONLY` Order fixtures covering long references, payment/fulfillment/tracking states, line items, long customization copy, empty state, and safe error state without real PII or provider identifiers.
- [x] 3.3 Integrate local Orders reads without private photo locators, Supabase Storage construction, signed URLs, or production Order repository access.
- [x] 3.4 Bound existing Order, payment, photo-review, digital-delivery, Fulfillment, and Tracking controls in local mode as disabled, unavailable, or otherwise non-mutating without creating a new workflow.

## 4. Real Admin route integration

- [x] 4.1 Route the real `/admin/products` page through the authorized shared source boundary while preserving the existing login redirect and Admin session behavior.
- [x] 4.2 Route the existing Catalog content API through the same local/production composition and preserve safe request parsing and error mapping.
- [x] 4.3 Route the SKU graph, ProductAsset, FulfillmentConfig, lifecycle, and any page-used Catalog-adjacent CustomizationField APIs through the same source family with no local-read/production-write split.
- [x] 4.4 Route the real `/admin/orders` page and its read/export path through the separate local Orders seam while preserving the production Supabase path when the selector is absent.
- [x] 4.5 Verify every covered route constructs no local or production repository before unauthorized/invalid Admin session rejection, and that local Orders never enters Catalog or Storage provider paths.

## 5. Offline security and regression tests

- [x] 5.1 Add deterministic parser/source-selection tests for explicit local mode, absent/default mode, unknown values, production rejection, and no browser-controlled backend selection.
- [x] 5.2 Add authorization-order tests proving unauthorized and invalid sessions cause zero local, Supabase, Storage, or production Order repository construction while valid sessions use the selected source.
- [x] 5.3 Add local Catalog graph/read/command/lifecycle tests covering existing validation, bounded mutations, honest applied results, no hard delete, and process-memory reset semantics.
- [x] 5.4 Add local Orders fixture/projection/privacy tests covering long data, empty/error states, no customer/provider secrets, no private locators, and no Storage/signed-URL access.
- [x] 5.5 Add route-level provider sentinels and safe-failure tests proving zero Supabase/fetch/Storage/production-Order calls in local mode, no fallback after local failure, and no stack/secret/filesystem/environment leakage.
- [x] 5.6 Add regression tests proving the local Admin selector does not alter public storefront or downstream Local Order, Payment, Fulfillment, or Tracking source semantics and that production composition remains unchanged when absent.

## 6. Authorized local browser acceptance

- [x] 6.1 Document non-secret local setup and the separate local Admin password handling without committing or printing credentials, and define the zero-provider observation procedure.
- [x] 6.2 Use the real local `/admin/login` to establish a signed Admin session and record authorized `/admin/products` desktop and 375px evidence for keyboard, coarse pointer, reduced motion, safe errors, editors, and no overflow.
- [x] 6.3 Using the same real session, record authorized `/admin/orders` desktop and 375px evidence for synthetic data, long wrapping, bounded controls, no Storage/provider calls, safe errors, and no production-data claim.

## 7. Final review and handoff

- [x] 7.1 Run focused tests, offline tests, typecheck, lint, build, rendered checks, strict OpenSpec validation, and diff checks required by the repository policy.
- [x] 7.2 Audit the final diff and runtime evidence for provider isolation, real authorization, no fallback, no production persistence, no business-capability drift, and no changes to active high-fidelity, Catalog, or Customization planning artifacts.
- [x] 7.3 Produce a review handoff linking the authorized local evidence back to high-fidelity Task 10.2 without checking that task, changing its artifacts, or claiming production Admin readiness.
