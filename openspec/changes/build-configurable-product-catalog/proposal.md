## Why

PhotoGift's current prototype treats each product as one hardcoded category and one base price, so it cannot safely support configurable SKU combinations, data-driven storefront pages, or basic catalog operations for multiple personalized-gift categories. The completed engineering foundation now provides authoritative Supabase access and reliable verification gates, making this the right time to establish the Product → Variant/SKU layer required by later customization, cart, pricing, shipping, and fulfillment changes.

## What Changes

- Establish a Supabase-backed, provider-neutral catalog model for single-level categories, products, variant option definitions and values, Product Variants/SKUs, ProductAssets, and basic FulfillmentConfig.
- Make each active Variant/SKU the sole authoritative source for base unit price, currency, weight, availability, option combination, and `supply_method`; product-level prices are compatibility inputs only during migration and are not a second target-model authority.
- Make Product/ProductFulfillmentConfig the authoritative source for `fulfillment_type`, `requires_shipping`, `production_mode`, and production lead-time range; `production_mode` describes how the Product is produced or generated and is not a Variant/SKU field.
- Represent ProductAssets as provider-neutral metadata for already-public URL/reference marketing media, with `image` or `video` media types, defined storefront roles, ordering, and an optional Variant/SKU association. C1 adds no binary upload pipeline and keeps public marketing assets separate from customer-private uploads, production previews, and digital-delivery files without selecting Supabase Storage or Cloudflare R2.
- Add data-driven public catalog experiences at `/shop`, `/category/[slug]`, and `/product/[slug]`, including category browsing, product detail, variant selection, variant-derived displayed pricing, media, SEO, publication filtering, and controlled unavailable/not-found states.
- Add an authorized `/admin/products` experience for basic Category, Product, Variant/SKU, ProductAsset, FulfillmentConfig, and publication-state management, without introducing procurement, supplier, production, or inventory operations.
- Use the approved constrained fulfillment vocabulary: `physical | digital` for delivery form, `custom_manufacturing | digital_creation` for how a Product is produced or generated, and `made_to_order | digital_delivery` for a SKU's basic supply method, without attaching supplier, factory, procurement, cost, warehouse, or routing semantics.
- Make the minimum compatible order-path adjustment needed for the server to resolve an active SKU, use its authoritative base price, and persist product/SKU/selected-option/base-price/currency snapshots. A temporary Product-slug adapter accepts only one exactly resolved active/default eligible Variant, ignores browser price, rejects ambiguous/inactive/unavailable resolution, and is assigned to the later cart/order change for removal; complete cart-line identity remains deferred.
- Use an expand-and-contract schema transition that keeps the expand-schema and guarded-backfill migrations separate, with one additive server-only atomic SKU-graph RPC migration ordered between them. Inspect and document the actual remote Supabase baseline first, create the expand-schema migration only after that gate passes, and complete a reviewed legacy Product → default Variant preflight mapping before creating or executing the guarded backfill migration. Any ambiguous identity, authoritative legacy price, currency, fulfillment, or SKU/default-Variant mapping produces an exception list and stops progress until explicit human mapping approval; partial migration MUST NOT be treated as deployable. Preserve legacy product price fields and remote publication/deletion state during C1 and defer destructive cleanup.
- Reuse a compatible durable remote audit facility when baseline inspection finds one; otherwise add a narrow catalog/admin audit facility for publish, unpublish, retire, and destructive-state mutation attempts without secrets or sensitive customer/payment content.
- Preserve all current remote product publication and deletion state during baseline reconciliation and migration; the 22 legacy seed/fixture records remain development and compatibility inputs and are not automatically treated as the production catalog.
- Keep exact inventory counts, CustomizationField/CustomizationRule behavior, customization surcharges, private uploads, complete cart-line identity, advanced pricing and discounts, shipping rules, payments, authentication, production preview, supplier procurement, and complex production workflows out of scope.

## Capabilities

### New Capabilities

- `configurable-product-catalog`: Defines the authoritative Category, Product, Variant Option, Variant/SKU, ProductAsset, and basic FulfillmentConfig contracts, publication rules, variant pricing authority, compatible order snapshots, and safe legacy expansion behavior.
- `catalog-storefront`: Defines public shop, category, and product-detail discovery, variant selection, data-driven display, SEO, and catalog failure behavior.
- `catalog-administration`: Defines authorized basic catalog management and validation for categories, products, variants, assets, fulfillment attributes, and publication state.

### Modified Capabilities

- None. The existing `engineering-foundation` capability remains authoritative and is a dependency rather than a changed requirement set.

## Impact

- **Data:** Supabase PostgreSQL catalog tables, constraints, indexes, RLS/policies, grants, compatibility fields, legacy data backfill, and order-item snapshot storage will be affected only after the remote baseline gate is satisfied. Existing flat SQL files remain legacy bootstrap inputs and no migration is created or run during planning.
- **Domain and application boundaries:** Product contracts, repository queries, variant resolution, publication validation, catalog read models, server-authoritative base pricing, and minimum order snapshot mapping will expand.
- **UI and routes:** New public routes and `/admin/products` will be introduced; the current single-page product grid/customizer must consume the new catalog read model without silently falling back to fixtures in production.
- **Security:** Public reads expose only published catalog data. Catalog writes remain server-side and require the existing administrator authorization boundary; service-role credentials and unpublished catalog records never enter browser responses.
- **Dependencies:** Requires the completed `stabilize-photogift-foundation` change and its main `engineering-foundation` spec. It unblocks later customization/private-upload, cart/order-line, pricing/promotion, shipping, and production-preview changes, which remain independently scoped.
- **Risks:** The connected Supabase project may differ from legacy SQL, legacy products may not be safely backfillable without reconciliation, premature publication changes could alter production behavior, and partial SKU adoption could create competing price sources. The design and tasks must make these conditions explicit gates rather than assumptions.
