## 1. Approved Decisions and Current-State Gate

- [x] 1.1 Record an implementation-facing current-state audit covering the broad `Customization` compatibility type, Product detail/Variant UI, `/api/uploads`, `/api/orders`, `order_items.customization`, `order_uploads`, storage configuration, fixtures, tests, and all C1 deferred boundaries; do not infer behavior from filenames.
- [x] 1.2 Reconfirm before implementation that C1 remains at 41/61, Task 3.5 remains blocked, BACKFILL AUTHORIZED remains NO, and Tasks 3.5–3.8/7.4 have not been modified or bypassed; STOP if the parallel worktree no longer satisfies this boundary.
- [x] 1.3 Record the approved customization decisions: Product Options remain SKU-only; field kinds are limited to `image | short_text | long_text`; Product-specific production values require business approval; customer-input preview is not production preview; Variant base price remains authoritative; storage provider and full cart identity remain deferred.
- [x] 1.4 Verify the implementation plan does not depend on live Supabase, a production bucket, a storage-provider choice, production Product fixture import, payment/shipping changes, or completion of the blocked C1 migration chain; STOP and report any discovered dependency conflict.

## 2. Customization Domain and Validation Contracts

- [x] 2.1 Add provider-neutral `CustomizationField` contracts and strict parsers for stable identity, Product ownership, Product-scoped code, label, `image | short_text | long_text`, required/active flags, deterministic position, and configuration revision.
- [x] 2.2 Add discriminated, bounded field-constraint contracts that accept only kind-applicable text/image rules and reject unsupported keys, invalid count/size/dimension ranges, arbitrary conditions, pricing rules, supplier instructions, and production behavior.
- [x] 2.3 Add normalized customization value contracts for short/long text and ordered image receipt references with optional crop metadata, preserving stable field identity and rejecting duplicate single-value or mismatched-kind input.
- [x] 2.4 Add strict crop parsing for finite normalized in-bounds regions and enforce that crop metadata is accepted only for explicitly crop-enabled image fields without modifying original files or producing rendered output.
- [x] 2.5 Add pure Product/field ownership, required completeness, text normalization/length, image count/metadata, unknown-field, stale-configuration, and cross-Product validation with stable safe issue codes.
- [x] 2.6 Add deterministic image-quality classification using configured required and recommended dimensions only; do not claim blur, face, pose, occlusion, or people-count detection.
- [x] 2.7 Add a normalized configured-item handoff contract containing Product, Variant/SKU, selected Variant Options, field-configuration revision, and ordered Customization values while rejecting browser price/currency/surcharge and provider path authority.
- [x] 2.8 Add offline domain tests for every parser and validator, including wrong-kind constraints, duplicate fields, required values, cross-Product references, stale revisions, multi-image ordering/counts, crop bounds, quality warnings, unsupported deferred rules, and Variant/Customization separation.

## 3. Schema Compatibility and Migration Approval Gate

- [x] 3.1 Produce a read-only customization schema decision packet from `docs/catalog-schema-baseline.md`, current local migration artifacts, legacy SQL, and current read/write paths; classify `products.customization_schema`, `order_items.customization`, and `order_uploads` as exact reuse, compatibility-only reuse, or insufficient without accessing remote Supabase.
- [x] 3.2 Specify the exact additive schema proposal for normalized Product-owned fields, pre-order draft/upload ownership and expiry, Product/field/ordered-position association, safe order attachment, constraints, indexes, RLS/policies, grants, cleanup concurrency, and migration ordering relative to unapplied C1 artifacts; do not create SQL yet.
- [x] 3.3 STOP for explicit human approval of the schema and ordered migration scope; do not create a migration, repository implementation requiring new tables, or production persistence before approval.
- [ ] 3.4 After approval only, create ordered additive migration artifact(s) without applying them, preserving legacy `customization_schema`, every historical `order_items.customization` value, every `order_uploads` row, and all existing order relationships.
- [ ] 3.5 Add disposable-environment migration verification for fresh apply, rerun safety, constraints, indexes, field ownership, receipt lifecycle/attachment integrity, RLS/grants, historical-row preservation, and rollback/forward-fix assumptions; never use live Supabase.
- [ ] 3.6 STOP and obtain separate approval before any migration is applied to a connected database; record unapplied artifacts and deployment ordering as handoff items.

## 4. Product Customization Configuration

- [x] 4.1 Add a provider-neutral CustomizationField repository/query contract that returns only active, deterministically ordered fields for an eligible Product and distinguishes not found, invalid configuration, and source failure.
- [x] 4.2 Add Supabase-shaped field mapping and repository behavior only after the approved schema artifact exists, with strict parsing, no use of unrestricted legacy `customization_schema` as authority, and no production fallback to fixtures.
- [x] 4.3 Extend the public Product detail read model to include safe active CustomizationField definitions without exposing private uploads, operational metadata, provider details, inactive fields, or unrelated Product configuration.
- [x] 4.4 Add the minimum server-only administrator query/command boundary for field code/label/kind/required/position/active state and approved basic constraints, reusing existing admin authorization before privileged repository construction.
- [x] 4.5 Add a focused `/admin/products` CustomizationField editor that cannot configure Product Options, surcharges, conditional expressions, supplier/production instructions, storage providers, or production-preview behavior.
- [x] 4.6 Add deterministic development field fixtures only for explicit existing fixture mode, label them non-production, keep them free of customer data/private references, and prove production source failure never falls back to them or legacy seed examples.
- [x] 4.7 Add offline repository/admin tests for duplicate Product-scoped codes, invalid constraints, cross-Product mutation, authorization rejection, safe errors, ordering, stale revision changes, fixture isolation, and absence of customer-upload/ProductAsset boundary drift.

## 5. Private Upload and Guest Ownership Boundaries

- [x] 5.1 Define provider-neutral customer upload receipt, safe metadata, owner identity, lifecycle, expiry, object-store, receipt-repository, and preview-access contracts without Supabase Storage or R2 types in domain/application APIs.
- [x] 5.2 Implement a server-managed guest draft owner issuer/verifier using an unguessable draft identity and integrity-protected HttpOnly SameSite context (or the runtime-equivalent approved by the design), without requiring authentication or exposing ownership credentials to client JavaScript/logs.
- [x] 5.3 Ensure upload, preview, replace, remove, attach, and cleanup server boundaries reject missing/invalid ownership before constructing privileged repositories or provider clients and return indistinguishable not-found/unauthorized responses.
- [x] 5.4 Implement shared client preflight and authoritative server image inspection for JPEG/PNG/WebP, positive bounded bytes, decoded type/dimensions, field count/dimension constraints, safe filename metadata, and deterministic quality warning state.
- [x] 5.5 Implement the upload application service so an accepted opaque receipt is returned only after object storage and authoritative metadata persistence succeed; define compensation when either side partially fails without claiming distributed transaction atomicity.
- [x] 5.6 Implement idempotent provider-neutral lifecycle operations for replace, remove, attach-once, expire, cleanup-pending/completed, and retry while preventing removal/cleanup of order-attached content.
- [x] 5.7 Replace the new-browser upload response/request contract with opaque receipt identity and safe metadata only; reject bucket names, storage keys, permanent URLs, and arbitrary paths as browser authority while preserving historical server-side reads behind a compatibility boundary.
- [x] 5.8 Add authorized short-lived server-backed customer-input preview access and local-preview behavior without creating permanent public URLs or conflating the result with production preview.
- [x] 5.9 Add safe error/log mapping that excludes uploaded bytes, customization text, owner cookies/tokens, bucket/object keys, signed URLs, credentials, SQL details/hints, and cross-customer existence.

## 6. Deterministic Local and Offline Upload Adapters

- [x] 6.1 Add deterministic in-memory/local fake object-store and receipt repositories covering successful storage, receipt lookup, owner separation, lifecycle transitions, expiry, preview access, and cleanup without live services.
- [x] 6.2 Add failure controls for object-write failure, metadata-write failure, preview failure, delete failure, retry, and compensation so tests do not characterize partial success as accepted behavior.
- [x] 6.3 Add focused offline tests for cross-owner receipt rejection, browser metadata tampering, receipt ID guessing, duplicate attach, repeated remove/replace, expired drafts, order-attached preservation, cleanup retry, and no provider-path leakage.
- [x] 6.4 Add a local-only upload smoke harness using explicit fixture customization configuration and the fake adapter; prove it does not contact Supabase Storage, R2, remote Supabase, Stripe, PayPal, or another live service.
- [x] 6.5 STOP at the production provider adapter/configuration gate if no separately approved Supabase Storage versus Cloudflare R2 decision exists; record the provider adapter, bucket, retention, and deployment values as handoff items rather than inventing them.

## 7. Product Detail Draft and Customization UX

- [x] 7.1 Add a pure local draft reducer/evaluator for Product, selected Variant/SKU, selected Variant Options, configuration revision, text/image values, active upload operations, issues, and derived `empty | editing | upload_pending | ready | invalid | expired` state.
- [x] 7.2 Compose the existing Variant selector and a sibling customization form under `ProductDetailExperience` so either can be completed first without losing the other and no Customization value enters Variant resolution.
- [x] 7.3 Render active Product-specific short-text and long-text fields with labels, requirement/help text, limits, accessible validation feedback, and no database write per keystroke.
- [x] 7.4 Render image selection with JPEG/PNG/WebP requirements, local preflight, decoded metadata, progress/failure feedback, revocable accessible customer-input preview, replace/remove controls, and no automatic upload before explicit workflow action.
- [x] 7.5 Support configured bounded multi-image add/order/reorder behavior while preserving one receipt per image position and preventing values beyond the field maximum.
- [x] 7.6 Add minimal non-destructive crop interaction only for crop-enabled image fields, retaining the original file and visibly labeling the result as customer input rather than a production mockup.
- [x] 7.7 Add an accessible customization summary that displays the separately selected SKU/options and normalized customer inputs, never displaying a provider object path or claiming an unavailable production preview.
- [x] 7.8 Disable configured-item handoff until one eligible SKU is resolved, required fields are valid, no upload is pending, receipts are owned/active, and configuration is current; provide actionable stale/expired/retry states.
- [x] 7.9 Add focused component/render tests for text/image fields, Variant-first and upload-first flows, price/availability independence, local preview cleanup, replacement/removal, multi-image ordering, crop enablement, warnings/errors, keyboard/label accessibility, and summary separation.

## 8. Cart and Order Handoff Compatibility

- [x] 8.1 Add an application service that re-resolves authoritative Product, Variant/SKU, selected Variant Options, active field configuration, and owned receipts before accepting a configured-item handoff; reject stale, unavailable, mismatched, or browser-authoritative values without mutation.
- [x] 8.2 Preserve distinct ordered customization payloads for two copies of the same SKU with different customer content, but do not compute a fingerprint, merge key, hash, cart identity, or durable cart persistence.
- [x] 8.3 Add one isolated compatibility mapper from normalized field values/receipts to the current order customization and upload boundary while keeping operational `photoReviewStatus` and digital-delivery data outside customer input.
- [x] 8.4 Update the existing order request boundary minimally and backward-compatibly so new clients submit field values and receipt IDs rather than paths; do not implement or bypass C1 Task 7.4, Product/SKU snapshot persistence, payment, coupon, shipping, or fulfillment changes.
- [ ] 8.5 Attach each accepted owned receipt to the resulting order/customization boundary exactly once after the order item exists, preserve ordered field association, and ensure invalid customization produces no order, upload attachment, coupon, or payment mutation.
- [ ] 8.6 Preserve existing historical `order_items.customization` and `order_uploads` reads/admin review behavior and add safe adapters for the new normalized snapshot without rewriting old rows.
- [ ] 8.7 Add offline guest handoff/order tests for required completion, stale configuration, cross-Product fields, Product/Variant mismatch, unavailable SKU, unowned/expired/replaced receipt, duplicate attachment retry, browser path/price rejection, distinct customized copies, historical reads, and zero mutation on rejection.

## 9. Security, Privacy, and Boundary Regression

- [x] 9.1 Add regression tests proving ProductAsset, public catalog APIs/pages, sitemap, SEO output, and development fixture serialization never query or emit customer receipt IDs, filenames, preview URLs, object locators, or private metadata.
- [x] 9.2 Add authorization-order tests proving unauthenticated/unauthorized upload and admin requests are rejected before privileged Supabase/provider client construction, with no object-existence oracle.
- [x] 9.3 Add route/contract tests proving no new response exposes bucket names, object keys, permanent public URLs, cookies/tokens, SQL details/hints, secrets, or raw provider errors.
- [x] 9.4 Add production-source tests proving unavailable authoritative field/upload sources fail closed and never fall back to development fixtures, legacy seed JSON, or a permissive empty configuration.
- [x] 9.5 Audit tests and source for deferred-feature drift: no surcharge/pricing formula, arbitrary condition engine, supplier/routing semantics, AI/background/face/moderation behavior, production preview, complete cart identity, provider lock-in, or production fixture data.

## 10. Documentation and Final Verification

- [x] 10.1 Document the CustomizationField/value/draft contracts, Variant/Customization separation, browser/server responsibilities, customer-input preview terminology, legacy compatibility boundary, and future cart/order dependency.
- [x] 10.2 Document the private upload trust model, guest ownership, opaque receipts, lifecycle/cleanup, safe temporary preview access, ProductAsset separation, fixture policy, and unresolved production retention/provider values.
- [x] 10.3 Document the approved migration decision packet, additive migration order, disposable verification, historical preservation, production deployment STOP gates, and explicit fact that no remote migration/provider configuration is applied automatically.
- [x] 10.4 Add all new deterministic tests to the offline verification gate and run focused domain, repository, upload, UI, security, and handoff suites without live Supabase, storage, payment, email, tracking, DNS, or deployment services.
- [x] 10.5 Run `npm run typecheck` and resolve all in-scope errors without broad `any`, `@ts-ignore`, disabled strictness, or exclusion of active code.
- [x] 10.6 Run `npm run lint` and resolve all in-scope errors without disabling rules.
- [x] 10.7 Run `npm run test:offline`, `npm run build`, and `npm run test:rendered`; verify vinext/Cloudflare server/client boundaries keep secrets and private configuration out of client bundles.
- [x] 10.8 Run `npm run verify`, `openspec validate --all --strict`, `git diff --check`, and a tracked-secret/private-reference scan; record independently attributable results.
- [x] 10.9 Review the final implementation against the confirmed requirements, engineering-foundation spec, active C1 boundaries, and both customization specs; confirm C1 remains 41/61 with Task 3.5 blocked and BACKFILL AUTHORIZED NO unless changed later by an independent approved C1 workflow.
- [x] 10.10 Record deferred work for production Product field values, final storage provider/retention, complete cart-line identity, customization pricing, advanced conditional fields, automated image analysis, production preview, and legacy adapter removal; do not mark this change deployable while any required schema/provider gate remains unapproved.
