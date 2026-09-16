## Purpose

Defines PhotoGift's data-driven catalog contracts so categories, products, SKU combinations, marketing assets, fulfillment attributes, authoritative base prices, and purchase snapshots remain consistent across storefront, administration, and later commerce capabilities.

## ADDED Requirements

### Requirement: Remote schema baseline gates the first catalog migration

Before any C1 catalog migration is created or applied, the implementation SHALL record and reconcile the actual connected Supabase schema, including tables, columns, types, constraints, foreign keys, indexes, row-level-security state and policies, relevant grants, current product-related records, order and order-item references, and available migration history. Legacy bootstrap SQL MUST NOT be treated as proof of the connected database state.

#### Scenario: Baseline evidence is complete
- **WHEN** C1 implementation is ready to design its first timestamped catalog migration
- **THEN** a catalog schema baseline record exists with every required database area inspected and any difference from repository legacy SQL documented

#### Scenario: Baseline evidence is unavailable or incomplete
- **WHEN** the connected Supabase state or a required schema area cannot be inspected reliably
- **THEN** migration creation and application stop without changing remote schema or product data

#### Scenario: Remote state differs from legacy SQL
- **WHEN** the actual database contains a different column, constraint, policy, record shape, or migration history than the legacy bootstrap files describe
- **THEN** the migration design uses the actual state as its starting point, records the conflict, and does not overwrite remote behavior merely to match a legacy file

### Requirement: Catalog uses single-level categories and products

The catalog SHALL represent Category and Product as separate provider-neutral concepts. Each Product SHALL have a stable identifier, unique slug, one single-level Category, customer-facing content, SEO metadata, and publication state. C1 MUST NOT introduce parent categories or an unlimited category tree.

#### Scenario: Product belongs to an active category
- **WHEN** a valid product is created or read
- **THEN** it references one existing single-level category and exposes that category's stable slug and customer-facing name

#### Scenario: Nested category is submitted
- **WHEN** an administrator attempts to assign a parent category or create a category hierarchy
- **THEN** the catalog rejects the unsupported relationship without creating a partial category

#### Scenario: Duplicate slug is submitted
- **WHEN** a category or product is assigned a slug already used by another record of the same type
- **THEN** the catalog rejects the duplicate and leaves the existing record unchanged

### Requirement: Variant options form valid SKU combinations

The catalog SHALL define data-driven Variant Option definitions and allowed Option Values for each Product, and each Product Variant/SKU SHALL reference one valid combination of those values. SKU codes SHALL be unique, and one Product MUST NOT contain duplicate active option combinations.

#### Scenario: Product has multiple SKU combinations
- **WHEN** a product defines option values such as size, person count, material, or color
- **THEN** each purchasable combination resolves to one Variant/SKU with a stable identifier and SKU code

#### Scenario: Variant contains an invalid option value
- **WHEN** a Variant/SKU references an option value not assigned to its Product or omits a value required for its combination
- **THEN** the catalog rejects the Variant/SKU without creating a partially valid combination

#### Scenario: Product has no variant options
- **WHEN** a Product does not require customer-selectable SKU dimensions
- **THEN** it can use one default Variant/SKU with an empty selected-option set

### Requirement: Variant options remain separate from customization input

Variant Options SHALL describe selections that determine a SKU, base price, weight, or supply method. They MUST NOT store customer-provided photos, files, names, free text, notes, style instructions, or other CustomizationField values, and C1 SHALL NOT define CustomizationRule behavior or customization surcharges.

#### Scenario: Size changes the SKU
- **WHEN** size is configured as a Variant Option
- **THEN** selecting a size resolves a specific SKU combination rather than creating customer customization content

#### Scenario: Customer text field is submitted as a variant option
- **WHEN** a catalog configuration attempts to model an engraving name, note, photo, or file as a Variant Option Value
- **THEN** the configuration is rejected or left to the later customization capability rather than becoming a SKU dimension

### Requirement: Variant is the authoritative base-price source

Each Variant/SKU SHALL own its non-negative base unit price in integer minor units and its currency. C1 SHALL support USD as the confirmed launch currency and MUST reject unsupported catalog currencies rather than convert them implicitly. Product-level price fields retained for compatibility MUST NOT act as a second authoritative target-model price. Product-level displayed pricing SHALL be derived from eligible Variants/SKUs, and all order pricing SHALL resolve the selected Variant/SKU on the server.

#### Scenario: Product has differently priced variants
- **WHEN** a published Product has multiple available Variants/SKUs with different base prices
- **THEN** its listing price is derived from the eligible Variants and its selected detail price comes from the selected Variant/SKU

#### Scenario: Browser submits a different price
- **WHEN** a guest order request includes or preserves a client-visible price that differs from the current selected Variant/SKU price
- **THEN** the server ignores the browser price and uses the authoritative Variant/SKU base price or rejects the stale request clearly

#### Scenario: Variant has an invalid price or currency
- **WHEN** an administrator submits a negative base price, a fractional minor-unit value, or a currency outside the C1-supported catalog currency policy
- **THEN** the catalog rejects the Variant/SKU without changing an existing valid price

### Requirement: SKU availability does not imply exact inventory management

Each Variant/SKU SHALL expose a basic availability state and the constrained `made_to_order` or `digital_delivery` supply method sufficient to decide whether it may be selected and purchased. These values describe basic fulfillment supply only and MUST NOT imply supplier, factory, procurement, purchase-cost, warehouse, or routing behavior. C1 MUST NOT introduce exact stock counts, reservation, warehouse decrement, procurement, or inventory-allocation behavior.

#### Scenario: Available SKU is selected
- **WHEN** a published Product has an active and available SKU
- **THEN** the SKU may be shown and resolved for purchase subject to the other catalog rules

#### Scenario: Unavailable SKU is requested
- **WHEN** a storefront or order request selects an inactive or unavailable SKU
- **THEN** the request is rejected as unavailable without substituting a different SKU silently

### Requirement: Product assets are provider-neutral marketing media

ProductAsset SHALL represent metadata for ordered, already-public marketing media with `media_type` of `image` or `video`, a role of `thumbnail`, `gallery`, `detail`, `example`, or `seo`, a provider-neutral public URL/reference, alternative or descriptive metadata where applicable, and an optional Variant/SKU association. C1 MUST NOT implement a binary ProductAsset upload pipeline or select Supabase Storage versus Cloudflare R2. ProductAssets MUST remain separate from customer-private uploads, order customization files, production previews, and digital-delivery files.

#### Scenario: Product-level gallery is read
- **WHEN** a published Product has ordered ProductAssets without a Variant/SKU association
- **THEN** the storefront receives those assets in configured order with their media type, role, and safe public source information

#### Scenario: SKU-specific asset is selected
- **WHEN** a ProductAsset references a Variant/SKU belonging to the same Product
- **THEN** the asset may be presented for that SKU while remaining part of the Product's marketing-media collection

#### Scenario: Asset references another product's SKU
- **WHEN** a ProductAsset is assigned to a Variant/SKU owned by a different Product
- **THEN** the catalog rejects the association without moving or exposing either record

#### Scenario: Customer upload is submitted as a ProductAsset
- **WHEN** customer-private photo or order-file data is sent to the ProductAsset boundary
- **THEN** it is rejected and is not exposed through a public catalog response

### Requirement: Fulfillment configuration remains basic and product-scoped

Each Product SHALL have a basic ProductFulfillmentConfig that owns `fulfillment_type` of `physical` or `digital`, `requires_shipping`, `production_mode` of `custom_manufacturing` or `digital_creation`, and a basic production lead-time range. Each Variant/SKU SHALL separately own `supply_method` of `made_to_order` or `digital_delivery`. ProductFulfillmentConfig MUST NOT store `supply_method`, and ProductVariant/SKU MUST NOT store `production_mode`. `fulfillment_type` describes what the customer receives, `production_mode` describes how the Product is produced or generated, and `supply_method` describes only the SKU's basic fulfillment supply. These codes MUST NOT model or imply suppliers, factories, purchase prices, supplier routing, procurement orders, warehouses, detailed production stages, or the production-preview workflow.

#### Scenario: Physical product requires shipping
- **WHEN** a Product is configured for physical fulfillment
- **THEN** its catalog data indicates whether shipping is required and exposes its configured production mode and basic lead-time range

#### Scenario: Digital product is configured to require physical shipping
- **WHEN** a Product is configured as digital while also requiring physical shipment
- **THEN** the catalog rejects the contradictory fulfillment configuration

#### Scenario: Supplier data is submitted
- **WHEN** an administrator attempts to attach supplier purchasing, cost, or routing data through FulfillmentConfig
- **THEN** C1 rejects or ignores the unsupported fields and leaves supplier operations to a later change

### Requirement: Publication requires a purchasable catalog state

A Product SHALL be publicly discoverable only when its Product and Category are published or active as applicable and it has at least one active, available, structurally valid Variant/SKU. Public catalog responses MUST exclude drafts, inactive categories, unavailable-only products, and unpublished variants.

#### Scenario: Valid product is published
- **WHEN** an administrator publishes a valid Product in an active Category with at least one purchasable Variant/SKU
- **THEN** it becomes eligible for public listing and detail responses

#### Scenario: Product lacks a purchasable SKU
- **WHEN** publication is requested for a Product with no active and available Variant/SKU
- **THEN** publication fails with actionable validation feedback and the Product remains non-public

#### Scenario: Last purchasable SKU becomes unavailable
- **WHEN** an already published Product loses its last active and available Variant/SKU
- **THEN** the Product is excluded from public purchase responses until a valid SKU is restored, without deleting the Product

### Requirement: Legacy catalog expansion preserves remote state

After the baseline gate passes, C1 SHALL keep the ordered expand-schema and guarded-backfill migrations separate and SHALL place the additive server-only atomic SKU-graph RPC migration between them. Before the guarded backfill migration is created or executed, a reviewed preflight mapping SHALL account for every legacy Product that requires migration and SHALL resolve its identity, authoritative legacy price, currency, fulfillment mapping, and SKU/default-Variant mapping. Any ambiguity MUST produce a reviewed exception list and stop backfill creation, execution, and application cutover until every affected Product is safely mapped or its mapping receives explicit human approval. C1 MUST NOT invent business data, silently skip ambiguous Products, treat a partially migrated catalog as deployable, remove legacy product price compatibility fields, or automatically publish, unpublish, delete, or destructively rewrite existing remote products.

#### Scenario: Compatible legacy product is expanded
- **WHEN** the preflight accounts for every Product requiring migration and all mappings are unambiguous or explicitly approved
- **THEN** the guarded backfill can create one default Variant/SKU per mapped Product idempotently with an empty option combination while preserving identifiers, slugs, publication/deletion state, and order references

#### Scenario: Preflight mapping is ambiguous
- **WHEN** any Product has ambiguous identity, authoritative legacy price, currency, fulfillment, or SKU/default-Variant mapping
- **THEN** the implementation creates a reviewed exception list and stops before creating or executing the guarded backfill or cutting the application over

#### Scenario: Human mapping approval resolves an exception
- **WHEN** every ambiguous Product receives an explicit reviewed mapping decision
- **THEN** the preflight is updated and the guarded backfill may proceed only after all Products requiring migration are safely accounted for

#### Scenario: Partial mapping exists
- **WHEN** only some Products can be mapped safely
- **THEN** C1 does not silently skip the remaining Products and does not treat the partially migrated catalog as deployable

#### Scenario: Migration is rerun in a verified test environment
- **WHEN** the additive migration or backfill is executed more than once where reruns are supported
- **THEN** it does not create duplicate default SKUs or alter Product publication state

#### Scenario: Legacy fixtures are available
- **WHEN** the repository's 22 legacy seed or fixture products are used for development or migration verification
- **THEN** they remain explicitly non-production inputs and are not automatically imported or published in the connected production catalog

### Requirement: Orders use SKU authority and preserve a basic purchase snapshot

The minimum C1-compatible order path SHALL resolve the requested active Variant/SKU and its Product on the server, calculate the base unit price from that SKU, and persist `product_id`, `variant_id`, product name and slug snapshot, Variant/SKU snapshot, selected option-value snapshot, `unit_price_cents`, and currency. During C1, a temporary Product-only compatibility adapter SHALL accept a Product slug only when it resolves exactly one active, default, eligible Variant; it SHALL ignore browser price/currency, reject ambiguous, inactive, or unavailable resolution, persist the same snapshot as a native Variant request, and remain recorded for removal by the later cart/order change. This requirement MUST NOT define complete cart-line identity or assert aggregation of differently customized copies as desired behavior.

#### Scenario: Guest orders an active SKU
- **WHEN** a guest submits a valid order item identifying an active SKU of a published Product
- **THEN** the server prices the item from that SKU and saves the required basic Product/SKU snapshot independently of later catalog edits

#### Scenario: Legacy product-only cart item is compatible
- **WHEN** a preserved C1-transition cart item identifies only a Product slug that resolves exactly one active, default, eligible Variant
- **THEN** the server ignores browser price/currency, uses the Variant's authoritative price/currency, and saves the same required SKU snapshot as a native Variant request

#### Scenario: Legacy product-only cart item is ambiguous or unavailable
- **WHEN** a Product slug resolves no active/default eligible Variant or resolves more than one candidate
- **THEN** the server rejects the item without creating an order, selecting a fallback SKU, or trusting browser price

#### Scenario: SKU changes after order creation
- **WHEN** an administrator later changes or disables the purchased SKU
- **THEN** the existing order item retains its purchased Product name, Product slug, SKU, selected options, unit base price, and currency snapshot

#### Scenario: SKU does not belong to the requested product
- **WHEN** an order request combines a Product identifier with a Variant/SKU owned by another Product
- **THEN** the server rejects the item without creating an order or charging a price
