## Context

See `proposal.md` for motivation and the three delta specs for behavior. The current application reads a flat `products` table into a small Product card contract, hardcodes three categories and presentation defaults, and prices orders from `products.price_cents`. The legacy SQL has no Category, Variant/SKU, option, ProductAsset, or FulfillmentConfig entities; the current order item stores only product identity/name, unit price, quantity, and a broad customization JSON value.

`stabilize-photogift-foundation` established Supabase PostgreSQL as the authoritative production source, explicit non-production fixtures, shared provider-neutral boundaries, offline tests, and ordered migration policy. It also deliberately did not establish a Product/SKU schema. The connected Supabase schema has not been inspected in this planning workflow, the Supabase CLI is not configured in the repository, and the flat SQL files are legacy bootstrap inputs rather than evidence of applied state. Therefore C1 is the first schema-bearing change and cannot safely design executable migration SQL from repository files alone.

The current Next.js-compatible App Router, React, TypeScript, vinext/Cloudflare runtime, Supabase adapters, existing administrator session, and Stripe flow remain in place. Product marketing assets are public catalog content; customer photos, production previews, and digital-delivery files remain separate private domains whose final storage provider is unresolved.

## Goals / Non-Goals

**Goals:**

- Establish normalized provider-neutral catalog domain contracts and Supabase persistence for one-level Categories, Products, Product Options/Values, Variants/SKUs, ProductAssets, and basic FulfillmentConfig.
- Make Variant/SKU base price and currency authoritative while preserving legacy compatibility during an additive transition.
- Provide public read models and protected admin commands with explicit publication, validation, authorization, and failure boundaries.
- Preserve remote publication state, order references, and legacy product fields while backfilling safe default SKUs.
- Give later customization, cart/order, pricing/promotion, shipping, private-upload, and production-preview changes stable identifiers and snapshots to build on.
- Keep lint, strict typecheck, offline tests, production build, production-source isolation, and secret scanning as required verification gates.

**Non-Goals:**

- No final CustomizationField/CustomizationRule schema, conditional customizer, customization surcharge engine, photo/file ingestion, crop, or multi-image implementation.
- No complete cart-line identity redesign or correction of differently customized copies being aggregated; tests must not characterize that defect as desired behavior.
- No shipping quote/rule engine, advanced promotion engine, payment behavior, customer authentication, production-preview workflow, supplier/procurement model, detailed production state, or exact inventory system.
- No destructive removal of legacy Product columns, remote record cleanup, fixture-to-production import, or automatic publication changes.
- No choice between Supabase Storage and Cloudflare R2 for customer-private files or ProductAsset ingestion, and no binary ProductAsset upload pipeline in C1.

## Decisions

### 1. The schema baseline is an implementation stop gate, not a documentation afterthought

Apply begins with read-only inspection of the connected Supabase project and creates `docs/catalog-schema-baseline.md`. The record includes tables, columns/types/defaults, constraints and foreign keys, indexes, RLS enablement and policies, relevant grants, current Product data shape/count/publication state, related order/order-item references, and any Supabase migration history. It compares those observations with `supabase/schema.sql`, `seed.sql`, `coupons.sql`, and `operations.sql` without treating those files as authoritative.

No file under `supabase/migrations/` may be created until the baseline record is complete and reviewed against the approved C1 model. If access is unavailable, state is ambiguous, or a conflict changes the safe migration approach, Apply stops and reports the conflict. Remote inspection is read-only; migration application requires a later explicit deployment action and is not implied merely by implementing C1 source.

**Alternatives considered:** Assuming legacy SQL matches remote state violates the foundation migration contract. Generating a speculative migration during Propose would create false confidence and is explicitly prohibited.

### 2. Use normalized catalog identities with a constrained SKU-combination signature

The target logical model is:

```text
Category 1 ─── * Product 1 ─── 1 FulfillmentConfig
                       │
                       ├── * ProductOption 1 ─── * ProductOptionValue
                       │
                       ├── * ProductVariant 1 ─── * ProductVariantValue ─── 1 ProductOptionValue
                       │
                       └── * ProductAsset ─── 0..1 ProductVariant
```

Recommended target entities are `categories`, `products`, `product_options`, `product_option_values`, `product_variants`, `product_variant_values`, `product_assets`, and `product_fulfillment_configs`. Existing `orders` and `order_items` are expanded only as required by the snapshot contract. Final SQL names may be adjusted only when baseline evidence reveals an existing compatible name that should be preserved.

Category and Product slugs use normalized lowercase kebab-case and unique constraints. ProductOption codes are unique within a Product; OptionValue codes are unique within an Option. ProductVariant SKU code is globally unique. A canonical combination signature plus normalized join rows enforces one SKU per Product option combination; service validation verifies all selected values belong to the Product and exactly one value exists for every required Option. A Product with no Options uses one default Variant with an empty combination and a partial uniqueness rule permits only one default.

The signature is a data-integrity aid, not customer content. Order snapshots store a provider-neutral JSON representation of option codes/labels/values so later catalog edits do not alter purchase history.

**Alternatives considered:** A single unrestricted JSONB customization schema cannot enforce SKU identity or combinations reliably. Encoding every possible option as Product columns would recreate category-specific hardcoding. Fully deriving set equality from join rows without a signature makes duplicate-combination enforcement unnecessarily complex.

### 3. Variants own price, currency, weight, availability, and basic supply data

`product_variants` owns integer `price_cents`, currency, weight in a single documented base unit, activation/availability, default state, SKU code, and basic supply method. C1 constrains catalog currency to the confirmed launch currency USD and performs no implicit currency conversion. Product listing read models calculate the minimum eligible Variant price and whether prices vary; Product detail returns eligible combinations and resolves the selected exact Variant. No target-domain Product price property is authoritative.

Legacy `products.price_cents` and currency remain untouched during C1 and are used only to backfill a safe default Variant. New application writes do not maintain those legacy fields as a second live price source. Existing code paths are switched together to the Variant repository before the new catalog path is considered deployable. A later contract change may remove legacy fields only after production evidence proves nothing reads them.

Availability is deliberately coarse: active/available state plus supply method. There is no stock quantity, reservation, warehouse, or decrement table.

**Alternatives considered:** Dual-writing Product and Variant price would preserve ambiguity indefinitely. A computed Product price column can become stale and is unnecessary when repository queries can derive listing prices from eligible Variants.

### 4. Variant Options and CustomizationFields use different modules and storage

The catalog domain owns ProductOption, ProductOptionValue, Variant combination, and selected-option snapshots because these determine SKU identity and base price/weight/supply behavior. The existing broad `Customization` contract remains a compatibility boundary only; C1 does not define photos, customer text, notes, uploads, conditional fields, validation rules, or surcharges as Product Options.

The storefront variant selector emits only option/value identifiers needed to resolve one SKU. A later customization change can associate CustomizationFields with Product or SKU without changing the catalog's SKU authority. If a future field changes SKU identity, it must be modeled as a Variant Option through an explicit later spec update rather than hidden in customization data.

**Alternatives considered:** One generic "option" table for both SKU dimensions and customer input would blur pricing authority, enable arbitrary unvalidated content in SKU resolution, and make order snapshots ambiguous.

### 5. ProductAssets store public provider-neutral references and never customer files

`product_assets` records Product ownership, optional same-Product Variant ownership, `media_type`, role, display order, public source reference, descriptive metadata, and optional media dimensions/provider-neutral metadata. The catalog response never returns storage credentials or private object keys. Asset ordering uses a stable integer sort and deterministic identity fallback.

The approved C1 admin surface manages already-public URL/reference metadata rather than uploading binary files. This keeps the schema and UI provider-neutral and avoids selecting Supabase Storage or Cloudflare R2. A future Product media-ingestion change may produce the same public reference after upload without changing storefront contracts. Customer uploads, production previews, and digital-delivery files remain in their private order/storage modules and are rejected by the ProductAsset boundary.

**Alternatives considered:** Reusing the private upload tables would make marketing assets subject to customer authorization semantics and risk public leakage. Binding ProductAsset directly to a Supabase Storage or R2 bucket would prematurely choose infrastructure.

### 6. FulfillmentConfig is one-to-one and intentionally shallow

`product_fulfillment_configs` owns `fulfillment_type` (`physical | digital`), `requires_shipping`, `production_mode` (`custom_manufacturing | digital_creation`), and minimum/maximum basic production lead time in documented units. `product_variants` owns `supply_method` (`made_to_order | digital_delivery`). `fulfillment_type` describes what the customer ultimately receives, `production_mode` describes how the Product is produced or generated, and `supply_method` describes only the SKU's basic fulfillment supply. Validation prevents contradictory physical/digital shipping combinations, incompatible code combinations, and inverted lead-time ranges.

These constrained values do not identify or imply a supplier, factory, procurement process, purchase cost, warehouse, supplier route, production-preview state, or detailed workflow transition. Adding any such semantics requires a later approved change.

**Alternatives considered:** Product columns would be simpler initially but would mix merchandising with fulfillment policy and make later extension harder. A detailed production model belongs after production-preview and supplier decisions are confirmed.

### 7. Public reads use dedicated read models; admin writes use commands behind the existing admin boundary

The product repository expands into explicit public list, Category list/detail, Product detail, SKU-resolution, and admin read/write interfaces. Supabase row shapes remain inside infrastructure adapters. Public responses are assembled from only active/published entities and safe ProductAsset references; unavailable data returns typed failure results rather than fixtures.

The App Router adds `/shop`, `/category/[slug]`, `/product/[slug]`, and `/admin/products`. Public pages may use server-rendered data where compatible with vinext and small client components for search/filter and variant selection. Admin commands run server-side, validate provider-neutral request contracts, verify the existing admin session first, and then use server-only Supabase credentials. No browser performs privileged direct database writes.

The existing homepage consumes the same public catalog read model so it does not remain a parallel hardcoded catalog. The current product customizer may link to or embed the C1 variant selector but cannot claim complete customization or production-preview behavior.

**Alternatives considered:** Extending the current monolithic client page and one list endpoint would make admin validation, SEO detail pages, and SKU resolution difficult to test. Direct browser Supabase writes would enlarge the RLS surface and expose draft data risks.

### 8. Publication is validated as an atomic state transition

Products use a lifecycle that distinguishes at least draft/non-public, published, and safely retired/unavailable behavior without deleting purchase history. The exact physical representation may be a constrained status or compatible booleans selected after baseline review, but public eligibility always requires an active Category, valid FulfillmentConfig, and at least one active/available Variant. Losing the last eligible Variant removes the Product from purchasable reads without deleting it.

Admin mutations use transactions or database functions where multiple records must change atomically. Unique constraints make equivalent creates repeat-safe. Baseline inspection first looks for a compatible durable audit facility; C1 reuses it when it satisfies the catalog contract and otherwise adds a narrow catalog/admin audit facility. Publish, unpublish, retire, and destructive-state mutation attempts emit a durable record with action, outcome, resource type/ID, available administrator identity boundary, and timestamp; no secret, customer-private content, or payment-sensitive data is stored.

The approved Product SKU-graph persistence mechanism is one additive `SECURITY INVOKER` PostgreSQL RPC migration ordered after schema expansion and before guarded legacy backfill. An authorized server validates and normalizes the complete provider-neutral graph, then invokes the RPC once through the server-only service-role Supabase client. The function locks the target Product and reconciles Options, Option Values, Variants, and Variant Values in the single transaction inherent to that RPC call. Browser roles receive no execute privilege. This RPC does not perform lifecycle transitions or audit writes, which remain Task 6.6 responsibilities.

**Alternatives considered:** Allowing partial client-orchestrated writes can leave orphan options and broken combinations. Hard deletion conflicts with order references and the snapshot requirements.

### 9. Order integration is a compatibility adapter, not the cart redesign

New order requests identify `variantId` or SKU plus Product identity and selected option values. The server resolves the Variant and Product together, confirms public eligibility and option membership, ignores client price/currency, and builds base line totals from the current SKU. `order_items` is additively expanded with `variant_id` and explicit immutable snapshot storage for Product name/slug, SKU code/identity, selected options, price, and currency. Existing `product_id`, product name, unit price, quantity, and customization columns remain during C1.

For saved pre-C1 carts, the approved temporary adapter accepts a Product-only slug only when it resolves exactly one active, default, eligible Variant. This compatibility path ignores browser price/currency, uses the Variant's authoritative values, persists the same purchase snapshot as a native Variant request, and rejects ambiguous, inactive, or unavailable resolution without selecting a fallback. It is explicitly tracked as temporary compatibility debt for removal by the later cart/order change.

C1 does not repair the current aggregation of separately customized copies. Tests cover SKU ownership, server price authority, stale/unavailable SKU rejection, and immutable base snapshots, but must not assert aggregation as desired behavior.

**Alternatives considered:** Requiring all local carts to disappear at deployment harms compatibility. Fixing complete cart-line identity here would overlap the approved later cart/order change.

### 10. Database security and fixture isolation remain defense in depth

Every new table receives explicit RLS enablement, policies, grants, foreign keys, and indexes based on the reconciled baseline. Public browser code does not query draft tables directly. Public server reads enforce publication predicates even if a server credential can bypass RLS; admin writes verify authorization before constructing the privileged client. ProductAsset responses include only public references.

The 22 existing fixture records evolve only as deterministic non-production catalog fixtures. Migration tests can use equivalent legacy rows to prove default-SKU backfill and rerun safety, but no production code imports fixture modules and no migration inserts or publishes them automatically.

### 11. Verification is layered and offline-first

Pure domain tests cover SKU combinations, publication eligibility, price derivation, fulfillment consistency, asset ownership, snapshots, and runtime narrowing. Repository tests use controlled Supabase-shaped fakes. Route/page tests cover public filtering, not-found/unavailable behavior, admin rejection, mutation atomicity where practical, guest SKU pricing, and legacy default-Variant compatibility. Migration verification runs against a disposable Supabase-compatible environment only after baseline reconciliation and checks schema, data backfill, constraints, indexes, policies, grants, and rerun behavior.

The aggregate verification gate remains lint, strict TypeScript, offline tests, and production build. No offline test contacts live Supabase or any payment, email, storage, or tracking service.

## Risks / Trade-offs

- **[Remote schema differs materially from legacy SQL]** → Stop before migration creation, document the difference in the baseline, and revise only the migration design needed to preserve actual state; do not force legacy SQL onto remote.
- **[Default-SKU backfill invents incorrect business data or leaves a partial catalog]** → Complete a preflight mapping for every Product requiring migration before creating the guarded backfill; ambiguity in identity, authoritative legacy price, currency, fulfillment, or SKU/default-Variant mapping creates a reviewed exception list and stops progress until explicit mappings are approved. Never skip ambiguous Products or treat a partial migration as deployable.
- **[Legacy and Variant prices diverge]** → Treat legacy price as one-time backfill input, switch active reads/writes to Variant pricing together, add tests prohibiting target-domain Product price authority, and defer column removal.
- **[Option combinations become inconsistent]** → Combine normalized ownership constraints, a canonical combination signature, transactional validation, and duplicate/rerun tests.
- **[Publishing exposes incomplete or draft data]** → Centralize eligibility rules, enforce them in admin commands and public repositories, and test direct public-route attempts.
- **[Asset references leak private files]** → Accept only public marketing references, maintain a separate domain type/table, reject order/customer storage paths, and never return storage credentials.
- **[Admin scope expands into a full PIM or operations suite]** → Limit routes and commands to approved C1 entities and fields; record supplier, procurement, inventory, production, and customization requests as later-change work.
- **[Order compatibility becomes permanent debt]** → Isolate Product-only default-Variant resolution, document it, and assign its removal plus complete line identity to the later cart/order change.
- **[Migration rollback is unsafe after orders reference new SKUs]** → Prefer forward-fix once production writes begin; before cutover, rollback application code and additive tables only if the baseline-specific plan proves references are absent.

## Migration Plan

1. Perform read-only remote inspection and create `docs/catalog-schema-baseline.md`; record all required schema/data/security/history evidence and compare it with legacy bootstrap SQL.
2. Review baseline conflicts against this design. If any conflict changes identifiers, constraints, data preservation, RLS, or order compatibility, stop Apply and request approval before migration creation.
3. Finalize the approved Category/Product/Option/Variant/Asset/Fulfillment schema, constrained vocabularies, audit approach, and migration rollback/forward-fix notes. Create the first timestamped expand-schema migration only after the gate passes; do not apply it to production as an implicit implementation step.
4. Verify the expand migration in a disposable Supabase-compatible environment, including tables, constraints, indexes, RLS/policies, grants, and compatibility with existing Product/order rows.
5. Add the separately reviewed atomic Product SKU-graph RPC migration after schema expansion. Keep it `SECURITY INVOKER`, callable only by `service_role`, and verify complete-graph reconciliation and rollback behavior before wiring application mutations.
6. Before creating or executing the guarded backfill migration, produce a preflight mapping for every remote Product requiring migration. Record identity, authoritative legacy price, currency, fulfillment mapping, and SKU/default-Variant mapping.
7. If any mapping is ambiguous, generate a reviewed exception list and stop. Do not invent data, silently skip Products, create or execute the backfill, or continue application cutover. Resume only after every Product is safely mapped or each exception has an explicit human-approved mapping.
8. Create the ordered guarded-backfill migration only after the preflight is complete. It adds one default Variant to each mapped legacy Product, preserves publication/deletion state and references, and is duplicate-safe and rerun-safe.
9. Add the order-item Variant reference and immutable basic snapshot fields additively, preserving all current columns and foreign-key behavior required by existing orders.
10. Deploy schema expansion and the reviewed RPC before application code that depends on them. Treat C1 as deployable only after the guarded backfill accounts for all Products requiring migration. Switch catalog reads, public routes, admin commands, and server order pricing to the new model as one verified application release; keep the temporary legacy default-Variant compatibility adapter active.
11. Verify all ordered C1 migrations, public filtering, admin authorization, SKU price authority, order snapshots, fixtures, RLS/grants, and the complete lint/typecheck/offline-test/build gates. Perform a production-readiness review before any separately authorized remote apply or publication change.
12. Do not contract legacy Product price/schema fields in C1. A later OpenSpec change may remove compatibility fields only after production evidence and rollback planning confirm no remaining readers or dependent records.

Rollback before application cutover is removal or reversal of additive test schema according to the baseline-specific migration plan. After production orders reference Variants, destructive rollback is not assumed safe; prefer a forward fix while retaining legacy fields and snapshots. No migration may alter current remote publication state as a rollback shortcut.

## Approved Pre-Apply Decisions

The following choices are final C1 inputs and require no further architecture approval before baseline inspection:

1. **ProductAsset input mode:** manage metadata for already-public URL/reference assets only; no binary upload pipeline and no Supabase Storage versus Cloudflare R2 decision.
2. **Constrained vocabulary:** `fulfillment_type = physical | digital`, `production_mode = custom_manufacturing | digital_creation`, and `supply_method = made_to_order | digital_delivery`, with no supplier, factory, procurement, cost, warehouse, or routing semantics.
3. **Migration split and preflight:** use separate ordered expand-schema and guarded-backfill migrations. Complete and review every legacy Product mapping before backfill creation or execution; any ambiguity stops progress until explicitly resolved, and a partial catalog is not deployable.
4. **Catalog audit persistence:** reuse a compatible durable audit facility discovered during baseline inspection or create a narrow catalog/admin facility covering publish, unpublish, retire, and destructive-state mutation attempts.
5. **Legacy cart compatibility:** temporarily accept Product slug only when it resolves exactly one active, default, eligible Variant, then remove the adapter in the later cart/order change.
