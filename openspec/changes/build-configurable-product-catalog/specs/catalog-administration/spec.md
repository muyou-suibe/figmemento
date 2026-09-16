## Purpose

Defines PhotoGift's protected basic catalog operations so an authorized administrator can manage categories, products, SKU combinations, marketing assets, fulfillment attributes, and publication state without gaining unrelated procurement, inventory, or production capabilities.

## ADDED Requirements

### Requirement: Catalog administration requires administrator authorization

The `/admin/products` experience and every catalog mutation SHALL require the existing administrator authorization boundary. Browser clients MUST NOT receive service-role credentials, and unauthenticated or non-admin callers MUST NOT read draft administration data or mutate catalog records.

#### Scenario: Authorized administrator opens catalog management
- **WHEN** a valid administrator session requests `/admin/products`
- **THEN** the administrator can view the catalog management data required by C1

#### Scenario: Unauthenticated caller requests catalog administration
- **WHEN** a caller without a valid administrator session requests an admin page or catalog mutation
- **THEN** access is rejected and no catalog data is changed

#### Scenario: Public shopper calls a mutation endpoint
- **WHEN** a public browser attempts to create, update, publish, or delete a catalog record
- **THEN** the request is rejected without exposing privileged configuration or secret values

### Requirement: Administrator can manage single-level categories and products

An authorized administrator SHALL be able to create, view, update, and safely retire single-level Categories and Products, including slugs, customer-facing content, SEO metadata, category assignment, and publication state. Category hierarchy, supplier management, and procurement data MUST NOT be offered.

#### Scenario: Administrator creates a draft product
- **WHEN** valid Product data and an existing Category are submitted
- **THEN** a draft Product is created without becoming publicly discoverable until publication validation succeeds

#### Scenario: Administrator changes product content
- **WHEN** an authorized administrator updates valid customer-facing or SEO fields
- **THEN** the Product reflects the update while its stable identity, Variants/SKUs, and existing order snapshots remain intact

#### Scenario: Administrator submits invalid category or slug
- **WHEN** a Product references a missing Category or uses an invalid or duplicate slug
- **THEN** the mutation fails with actionable validation feedback and leaves the prior Product state unchanged

### Requirement: Administrator can manage SKU option definitions and combinations

An authorized administrator SHALL be able to define Product-specific Variant Options and Option Values and create, update, activate, deactivate, or mark unavailable their valid Variant/SKU combinations. The management surface SHALL expose SKU code, selected option combination, base price, currency, weight, `supply_method` (`made_to_order | digital_delivery`), and availability, but MUST NOT expose exact inventory operations.

#### Scenario: Administrator creates a valid SKU combination
- **WHEN** the administrator selects one allowed value for each required Variant Option and supplies valid SKU attributes
- **THEN** one Variant/SKU is created for that Product and becomes eligible according to its activation and availability state

#### Scenario: Duplicate SKU mutation is submitted
- **WHEN** a request repeats an existing SKU code or Product option combination
- **THEN** the mutation is rejected idempotently without producing duplicate SKUs

#### Scenario: Exact stock count is submitted
- **WHEN** an administrator attempts to configure reservation, warehouse quantity, or decrement behavior in C1
- **THEN** the management boundary rejects or omits that unsupported inventory operation

### Requirement: Administrator can manage ProductAssets

An authorized administrator SHALL be able to create, update, order, associate, and remove metadata for already-public ProductAsset URL/references using supported media types and roles, including an optional Variant/SKU association belonging to the same Product. C1 MUST NOT implement binary asset upload or select Supabase Storage versus Cloudflare R2, and the interface MUST distinguish public marketing media from customer-private uploads, production previews, and digital-delivery files.

#### Scenario: Administrator adds product gallery image
- **WHEN** a valid public image source, gallery role, order, and descriptive metadata are submitted
- **THEN** the ProductAsset is attached to the Product and becomes eligible for public display only with that Product

#### Scenario: Administrator adds SKU-specific video
- **WHEN** a supported video asset references a SKU owned by the Product
- **THEN** the asset is saved with that optional SKU association

#### Scenario: Unsupported asset role or cross-product SKU is submitted
- **WHEN** an asset uses an unsupported media type or role, or references another Product's SKU
- **THEN** the mutation fails without exposing or reassigning unrelated media

### Requirement: Administrator can manage basic fulfillment configuration

An authorized administrator SHALL be able to manage a Product's ProductFulfillmentConfig by setting `fulfillment_type` (`physical | digital`), `requires_shipping`, `production_mode` (`custom_manufacturing | digital_creation`), and a basic production lead-time range. SKU `supply_method` remains managed through Variant/SKU management and MUST NOT be stored in ProductFulfillmentConfig. These codes MUST NOT add or imply supplier, factory, procurement, supplier routing, purchase-cost, warehouse, production-preview, or detailed production-state behavior.

#### Scenario: Administrator configures a physical product
- **WHEN** physical fulfillment, a valid production mode, shipping behavior, and valid lead-time range are submitted
- **THEN** the Product's basic FulfillmentConfig is saved and available to public catalog reads

#### Scenario: Contradictory fulfillment configuration is submitted
- **WHEN** a digital Product is marked as requiring physical shipment or a lead-time range is invalid
- **THEN** the mutation is rejected with actionable feedback and the previous valid configuration remains

### Requirement: Publication mutations enforce catalog integrity

The administration boundary SHALL validate Category state, Product fields, FulfillmentConfig, and at least one active and available valid Variant/SKU before publishing a Product. Publication, unpublication, and availability changes MUST preserve Product and order history rather than deleting purchased records.

#### Scenario: Administrator publishes a valid product
- **WHEN** all publication prerequisites pass
- **THEN** the Product becomes eligible for public catalog reads and its eligible SKUs can be selected

#### Scenario: Publication validation fails
- **WHEN** the Product lacks a valid Category, basic fulfillment configuration, or purchasable SKU
- **THEN** publication is rejected with field-level or actionable errors and no partial public state is created

#### Scenario: Administrator unpublishes a purchased product
- **WHEN** a previously purchased Product is unpublished
- **THEN** it disappears from new public purchases while existing order-item snapshots and references remain available

### Requirement: Catalog mutations are atomic, repeat-safe, and auditable

Important catalog mutations SHALL either complete their related changes atomically or leave the prior valid state intact. Repeated equivalent submissions MUST NOT create duplicate records. A complete Product SKU-graph mutation SHALL be validated by the authorized server and persisted through one server-only `SECURITY INVOKER` PostgreSQL RPC call using the service-role Supabase client. The RPC SHALL lock the target Product, reconcile only its Product Options, Option Values, Variants, and Variant Values in one transaction, and grant no execution access to browser roles. Baseline inspection SHALL reuse an existing compatible durable audit facility when available; otherwise C1 SHALL add a narrow catalog/admin audit facility. Publish, unpublish, retire, and destructive-state mutation attempts SHALL record enough information to identify the action, target, actor boundary, and time without storing secrets, customer-private content, or payment-sensitive data.

#### Scenario: Multi-record SKU update fails validation
- **WHEN** part of an option or SKU-combination mutation is invalid
- **THEN** the operation leaves no orphan option value, incomplete combination, or partially updated authoritative price

#### Scenario: Equivalent create request is repeated
- **WHEN** the same logical Category, Product slug, SKU code, or option combination is submitted again
- **THEN** uniqueness and mutation handling prevent duplicate catalog records

#### Scenario: Publication state changes
- **WHEN** an administrator publishes, unpublishes, or retires a catalog record
- **THEN** an audit record or equivalent durable audit event identifies the action, target, administrator boundary, and timestamp without storing secrets

#### Scenario: Destructive-state mutation is rejected
- **WHEN** an administrator attempts a destructive catalog-state mutation that validation rejects
- **THEN** the durable audit facility records the attempt and outcome without storing secrets, customer-private content, or payment-sensitive data

### Requirement: Administration preserves production data during C1 transition

C1 administration and migration tooling SHALL NOT automatically publish, unpublish, delete, or replace remote Products based on repository seed or fixture content. The 22 legacy fixtures may be used only in explicitly non-production development and compatibility verification.

#### Scenario: Admin starts after schema expansion
- **WHEN** the new administration experience first reads a migrated remote catalog
- **THEN** it reflects the preserved remote publication state instead of applying fixture publication defaults

#### Scenario: Fixture record matches a remote product slug
- **WHEN** an explicitly non-production fixture shares a slug with a connected remote Product
- **THEN** no production mutation occurs unless an authorized administrator separately submits and confirms a valid catalog change
