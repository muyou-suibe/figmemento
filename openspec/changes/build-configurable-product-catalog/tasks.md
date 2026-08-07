## 1. Approved Decisions and Supabase Baseline Gate

- [x] 1.1 Record the five final approved C1 inputs in the planning artifacts: public URL/reference-only ProductAssets, the constrained fulfillment/production/supply vocabulary, separate expand and guarded-backfill migrations with full preflight, durable catalog audit persistence, and temporary exact Product-slug-to-default-Variant compatibility.
- [ ] 1.2 Establish a read-only method for inspecting the connected Supabase project without exposing credentials, changing remote schema, or changing remote records; if reliable access is unavailable, stop before any migration file is created.
- [ ] 1.3 Record the actual remote tables, columns, types, defaults, constraints, foreign keys, indexes, RLS state and policies, relevant grants, and available migration history in `docs/catalog-schema-baseline.md`.
- [ ] 1.4 Record current Product and related record counts/shapes/publication states plus `orders` and `order_items` references needed to preserve identifiers and history, without publishing, unpublishing, deleting, or rewriting any remote record.
- [ ] 1.5 Compare the recorded remote state with `supabase/schema.sql`, `seed.sql`, `coupons.sql`, and `operations.sql`; document every relevant difference and explicitly keep those files classified as legacy bootstrap inputs.
- [ ] 1.6 Review baseline conflicts against the approved specs and design; if any conflict changes identity, data preservation, order compatibility, RLS/grants, or safe migration order, stop and report it for approval rather than silently revising C1 behavior.
- [ ] 1.7 Mark the baseline gate complete only after all required evidence is present and reviewed; verify that no `supabase/migrations/` catalog migration was created before this point and no remote write was performed.

## 2. Catalog Domain and Validation Contracts

- [ ] 2.1 Define provider-neutral shared contracts and runtime parsers for single-level Category and Product identity, content, SEO, lifecycle/publication state, and Product-to-Category ownership without introducing nested categories.
- [ ] 2.2 Define provider-neutral ProductOption, ProductOptionValue, ProductVariant/SKU, selected-option, availability, price/currency, weight, default-Variant, and `made_to_order | digital_delivery` supply-method contracts without adding CustomizationField content, supplier semantics, or exact inventory.
- [ ] 2.3 Implement and test canonical SKU-combination validation, including required-option completeness, same-Product ownership, one value per required option, duplicate combination rejection, globally unique SKU codes, and the empty default combination.
- [ ] 2.4 Implement and test Variant-authoritative base-price and listing-price derivation, including same-price, starting-price, confirmed USD-only launch policy, invalid price/currency, stale browser price, inactive SKU, and no-eligible-SKU cases.
- [ ] 2.5 Define and test provider-neutral ProductAsset contracts for already-public URL/reference metadata, `image`/`video`, supported roles, order, descriptive metadata, and optional same-Product Variant association; reject customer-private, production-preview, digital-delivery, binary-upload, and cross-Product inputs.
- [ ] 2.6 Define and test ProductFulfillmentConfig contracts for `fulfillment_type` (`physical | digital`), `requires_shipping`, `production_mode` (`custom_manufacturing | digital_creation`), and a valid lead-time range without storing Variant/SKU `supply_method` or adding supplier, factory, cost, warehouse, routing, preview, procurement, or detailed production fields.
- [ ] 2.7 Centralize and test public eligibility and publication validation across Category, Product, FulfillmentConfig, and at least one active/available structurally valid Variant.

## 3. Ordered Supabase Schema Expansion

- [ ] 3.1 After Tasks 1.1–1.7 pass, translate the approved logical model and actual baseline into a timestamped expand-schema migration under `supabase/migrations/`; do not modify legacy bootstrap SQL to impersonate migration history.
- [ ] 3.2 Add baseline-compatible Category, Product Option, Option Value, Product Variant, Variant Value, ProductAsset, and Product FulfillmentConfig entities with additive foreign keys, uniqueness rules, checks, timestamps, and indexes; retain all legacy Product compatibility fields.
- [ ] 3.3 Add explicit RLS enablement, public-read policies where appropriate, server/admin write restrictions, and relevant grants for every new catalog entity, preserving stricter compatible remote policies discovered during baseline inspection.
- [ ] 3.4 Reuse a compatible durable audit facility found during baseline inspection or add a narrow catalog/admin audit facility for publish, unpublish, retire, and destructive-state mutation attempts without recording secrets, customer-private content, or payment-sensitive data.
- [ ] 3.5 Before creating or executing the guarded backfill migration, produce a reviewed preflight mapping for every remote Product requiring migration, covering identity, authoritative legacy price, currency, fulfillment mapping, and SKU/default-Variant mapping.
- [ ] 3.6 If any preflight mapping is ambiguous, generate a reviewed exception list and STOP before backfill creation, execution, or application cutover; do not invent data, silently skip Products, import the 22 fixtures, or treat a partially mapped/migrated catalog as deployable. Resume only after every exception has an explicit human-approved mapping.
- [ ] 3.7 After the complete preflight passes, create the separate ordered guarded-backfill migration so every mapped legacy Product receives one default Variant/SKU while identifiers, slugs, publication/deletion state, and order references remain unchanged; make it duplicate-safe and rerun-safe.
- [ ] 3.8 Add `order_items` Variant reference and immutable Product/SKU/selected-option/base-price/currency snapshot storage additively while retaining existing columns and compatible foreign-key behavior.
- [ ] 3.9 Verify both migrations in an isolated disposable Supabase-compatible environment, including schema shape, constraints, indexes, RLS/policies, grants, full preflight coverage, legacy Product preservation, default-SKU uniqueness, backfill duplicate/rerun safety, and existing-order compatibility; do not apply them to the connected remote project as part of this task.
- [ ] 3.10 Document baseline-specific rollback where safe and a forward-fix plan once orders can reference Variants; verify C1 contains no contract/drop migration for legacy Product price fields.

## 4. Catalog Repositories and Fixtures

- [ ] 4.1 Expand the provider-neutral catalog repository boundaries for public Category lists, published Product lists, Product detail, exact Variant resolution, admin reads, and admin commands without leaking Supabase row shapes into domain/UI code.
- [ ] 4.2 Implement Supabase adapters and strict row mapping for the expanded catalog graph, including deterministic asset/option order and explicit unavailable/configuration results rather than production fixture fallback.
- [ ] 4.3 Derive Product listing prices only from eligible Variant rows and remove active catalog/order dependence on legacy Product price as a target-model authority while preserving the legacy columns for migration compatibility.
- [ ] 4.4 Evolve the existing 22-product development fixtures into deterministic non-production Category/Product/default-Variant/Fulfillment data and clearly separate them from migration data and production source selection.
- [ ] 4.5 Add offline repository tests for published filtering, draft exclusion, Category ownership, exact SKU resolution, starting-price derivation, assets, fulfillment, Supabase mapping failures, explicit fixture selection, and rejected production fixture activation.

## 5. Public Catalog Experience

- [ ] 5.1 Add `/shop` backed by the public catalog read model with published Product cards, Variant-derived price presentation, single-level Category filtering, basic text search/filtering, loading/empty/unavailable states, and no hardcoded production catalog.
- [ ] 5.2 Add `/category/[slug]` with active Category metadata, eligible Products only, not-found handling for inactive/unknown categories, basic discovery controls, and safe catalog-failure behavior.
- [ ] 5.3 Add `/product/[slug]` with Product content, ordered marketing media, eligible Variant Options and combinations, selected-SKU base price/availability, basic fulfillment and lead-time information, and not-found handling for draft/unknown Products.
- [ ] 5.4 Implement a mobile-compatible Variant selector that resolves one eligible SKU from complete option selections, prevents incomplete/unavailable combinations, and emits only Variant/Option identifiers rather than CustomizationField values.
- [ ] 5.5 Render ProductAsset image/video roles and optional SKU-specific media from safe public references with accessible descriptions and per-asset failure handling; do not query or render customer uploads, previews, or delivery files.
- [ ] 5.6 Generate shop, Category, and Product metadata/canonical information from catalog SEO content with safe public fallbacks, and update sitemap behavior to include only eligible public catalog routes.
- [ ] 5.7 Move the homepage catalog sections to the same public read model and remove hardcoded production categories, prices, art defaults, lead times, and preview claims that conflict with C1 data or later workflows.
- [ ] 5.8 Add offline tests for public route filtering, Product detail SKU selection, price updates, asset ordering/failures, SEO fallbacks, not-found behavior, search/filter empty state, and authoritative-source outages with no fixture substitution.

## 6. Basic Catalog Administration

- [ ] 6.1 Add server-only admin catalog query/command boundaries that verify the existing administrator session before privileged Supabase access and validate every request through shared provider-neutral parsers.
- [ ] 6.2 Add `/admin/products` list and basic editing flows for single-level Categories and draft/published/retired Products, including content, slug, SEO, Category assignment, actionable validation errors, and preserved stable identities.
- [ ] 6.3 Add Product Option/Option Value and Variant/SKU management for approved attributes, combination selection, SKU code, authoritative price/currency, weight, availability, default state, and `supply_method` (`made_to_order | digital_delivery`) without exact-stock controls.
- [ ] 6.4 Add ProductAsset metadata management for already-public image/video URL/references, supported roles, display order, descriptive metadata, and optional same-Product SKU association; do not add binary ingestion or access to customer uploads, production previews, or digital-delivery files, and do not select Supabase Storage versus Cloudflare R2.
- [ ] 6.5 Add Product FulfillmentConfig management for `fulfillment_type` (`physical | digital`), `requires_shipping`, `production_mode` (`custom_manufacturing | digital_creation`), and a valid lead-time range without storing SKU `supply_method` or adding supplier, factory, procurement, purchase-cost, warehouse, routing, production-preview, or workflow operations.
- [ ] 6.6 Implement atomic publication eligibility checks and safe unpublish/retire behavior that never hard-deletes purchase history, plus durable audit events for publication and destructive-state mutations.
- [ ] 6.7 Add offline admin tests for unauthorized read/write rejection, duplicate slug/SKU/combination handling, cross-Product references, invalid fulfillment, partial-write rollback, repeated equivalent requests, publication validation, audit events, and preservation of order snapshots.

## 7. Minimal Order and Cart Compatibility

- [ ] 7.1 Extend the shared cart/order request contract minimally to carry Product identity, Variant/SKU identity, and selected Variant Option identifiers while leaving Customization data separate and not redesigning complete cart-line identity.
- [ ] 7.2 Add the temporary legacy Product-slug compatibility adapter, accepting only an exact resolution to one active, default, eligible Variant; ignore browser price/currency, reject ambiguous/inactive/unavailable resolution without fallback, persist the native Variant snapshot, and label the adapter as debt for the later cart/order change to remove.
- [ ] 7.3 Update server order creation to resolve Product and Variant ownership, public eligibility, selected-option consistency, authoritative SKU price/currency, and availability before calculating base subtotal or creating an order.
- [ ] 7.4 Persist the required immutable Product name/slug, SKU identity/code, selected-option, unit base price, and currency snapshots with Product/Variant references so later catalog edits do not rewrite purchase history.
- [ ] 7.5 Keep Stripe request construction compatible with the server-resolved item totals without adding new Stripe validation, PayPal, payment status, shipping-rule, promotion, or webhook behavior in C1.
- [ ] 7.6 Add offline guest-order tests for active SKU purchase, browser-price rejection, stale/unavailable SKU handling, Product/Variant mismatch, default-Variant compatibility, snapshot immutability, and no order mutation on invalid catalog data.
- [ ] 7.7 Verify C1 tests do not assert the current aggregation of separately customized copies as desired behavior and record complete cart-line identity plus compatibility-adapter removal for the later cart/order change.

## 8. Documentation, Security, and Completion Verification

- [ ] 8.1 Update architecture and developer documentation for the new catalog entities, repository/read/command boundaries, Variant price authority, ProductAsset privacy separation, fixture policy, approved code vocabularies, and dependencies on later changes.
- [ ] 8.2 Document the expand-schema → full Product preflight → guarded-backfill order, reviewed exception handling and STOP behavior, disposable verification evidence, deployment ordering, rollback/forward-fix plan, legacy-field retention, and explicit fact that no connected remote migration was applied automatically.
- [ ] 8.3 Run `npm run lint` and resolve every C1-scope failure without disabling rules.
- [ ] 8.4 Run strict TypeScript typecheck and resolve every error without broad `any`, `@ts-ignore`, disabled strictness, or exclusion of active application code.
- [ ] 8.5 Run the offline automated-test gate with no live Supabase, Stripe, PayPal, Resend, storage, or 17TRACK dependency and verify all catalog, admin, migration, storefront, and guest-order assertions pass.
- [ ] 8.6 Run the production build and verify the active vinext/Cloudflare runtime supports the new dynamic routes, server-only admin boundaries, and catalog source behavior.
- [ ] 8.7 Run the aggregate verification command and confirm lint, typecheck, offline tests, and build remain independently attributable.
- [ ] 8.8 Verify production catalog code cannot import or silently use the 22 development fixtures and scan tracked source, examples, tests, migrations, baseline evidence, and planning artifacts for committed secrets.
- [ ] 8.9 Review the implementation diff against `独立站构建项目需求.md`, the `engineering-foundation` main spec, and all C1 artifacts; confirm the backfill covered every required Product or had approved mappings for every exception, no partial catalog was treated as deployable, no remote product publication/deletion state was changed, no migration was applied without separate authorization, no legacy price field was destructively removed, and no out-of-scope customization, cart identity, shipping, payment, authentication, preview, supplier, or inventory feature was introduced.
- [ ] 8.10 Record remaining deferred work and final verification evidence, including CustomizationField/rules/surcharges, private uploads, complete cart/order line identity, advanced pricing/promotions, shipping, production preview, final storage choice, and later contract cleanup.
