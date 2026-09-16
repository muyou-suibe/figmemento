## Purpose

Defines how PhotoGift presents Product-specific customization requirements, maintains a local customer draft, and composes validated customer input with a separately selected Variant/SKU for downstream purchase workflows.

## ADDED Requirements

### Requirement: Customization fields are Product-owned configuration

The system SHALL represent each customization input definition as a stable Product-owned `CustomizationField` with a unique code within that Product, customer-facing label, `image`, `short_text`, or `long_text` kind, required flag, deterministic position, active state, and bounded kind-specific validation constraints. Production field definitions MUST come from authoritative catalog configuration and MUST NOT be inferred from development fixtures or legacy seed examples.

#### Scenario: Product has configured customization fields
- **WHEN** a shopper opens an eligible Product with active customization fields
- **THEN** the system returns the fields in deterministic position order with stable identity, kind, required state, label, and only the validation constraints applicable to each kind

#### Scenario: Field belongs to another Product
- **WHEN** a customization value references a field that is not active for the requested Product
- **THEN** the server rejects the value without transferring or reinterpreting the field across Products

#### Scenario: Production Product has no approved field configuration
- **WHEN** an eligible Product has no authoritative customization-field configuration
- **THEN** the production storefront does not invent requirements from fixtures, legacy seed JSON, or Product names

### Requirement: Variant Options and Customization remain structurally separate

The system SHALL keep SKU-defining Product Option selections and customer Customization values in separate structures. Customization values MUST NOT determine Variant identity, base price, currency, weight, availability, or supply method, and photos, files, names, notes, pose instructions, and free text MUST NOT be submitted as Product Option values.

#### Scenario: Shopper selects an SKU and supplies a photo
- **WHEN** a shopper selects a Variant/SKU and completes an image CustomizationField
- **THEN** the configured item contains the Product and Variant identities, selected Variant Options, and a separate customization payload without modifying the Variant combination

#### Scenario: Same SKU receives different customer content
- **WHEN** two configured items use the same Product, Variant, and selected Variant Options but different image or text values
- **THEN** the customization handoff preserves the two distinct sets of customer content for the later cart-line workflow

#### Scenario: Customization attempts to override base price
- **WHEN** a browser includes a customization price, surcharge, currency, or SKU override
- **THEN** the server ignores or rejects that authority and continues to resolve base price and currency from the selected Variant/SKU

### Requirement: Field values use bounded kind-specific validation

The system SHALL validate customization values against the current authoritative field definitions on both the client for prompt feedback and the server for acceptance. Required fields MUST be complete; text MUST be normalized and bounded by configured limits; image values MUST reference valid private upload receipts owned by the current draft and satisfy configured count and metadata constraints. The server MUST reject unknown fields, duplicate single-value fields, incompatible value kinds, and stale configuration.

#### Scenario: Required values are complete
- **WHEN** every required active field has a valid value and all supplied optional values satisfy their constraints
- **THEN** the customization draft is eligible to become ready

#### Scenario: Required field is missing
- **WHEN** the shopper attempts handoff without a valid value for a required active field
- **THEN** the system keeps the draft non-ready and identifies the field that requires attention

#### Scenario: Text exceeds configured length
- **WHEN** a short-text or long-text value exceeds its authoritative maximum length after normalization
- **THEN** both client feedback and server validation reject the value without truncating it silently

#### Scenario: Field configuration changed during editing
- **WHEN** the submitted draft was built against field configuration that is no longer current
- **THEN** the server fails closed, returns a safe stale-configuration result, and requires the shopper to review the current requirements

### Requirement: Customization draft is local-first and explicit

The storefront SHALL maintain a local in-page customization draft containing Product identity, selected Variant/SKU identity, selected Variant Options, field values, upload receipts, validation issues, and a configuration version or equivalent staleness marker. Text edits and Variant changes MUST NOT require a database write. The draft lifecycle SHALL be derived from data and activity as `empty`, `editing`, `upload_pending`, `ready`, `invalid`, or `expired`, rather than trusted from a browser-supplied status.

#### Scenario: Shopper edits text before selecting a Variant
- **WHEN** a shopper enters valid text before completing Variant selection
- **THEN** the local draft preserves the text while remaining non-ready until the SKU and all required customization values are valid

#### Scenario: Upload is in progress
- **WHEN** one or more required image uploads have not completed
- **THEN** the draft reports `upload_pending` and cannot be handed off as ready

#### Scenario: Shopper replaces or removes an image
- **WHEN** the shopper replaces or removes a selected image
- **THEN** the local draft and visible summary update immediately, the prior receipt is no longer an active value, and server-side lifecycle cleanup is requested without falsely reporting deletion success

#### Scenario: Draft expires
- **WHEN** a server-recognized upload receipt or draft ownership context has expired
- **THEN** the draft reports an expired or invalid state, does not submit the stale receipt, and offers an actionable path to upload again

### Requirement: Product detail provides accessible customization UX

The Product detail experience SHALL render configured fields, concise input requirements, client validation feedback, upload progress/failure states, accessible customer-input previews, replacement/removal controls, ordering controls when an image field allows multiple values, and a customization summary. It MUST clearly label previews as customer input and MUST NOT represent them as production mockups or finished-product previews.

#### Scenario: Shopper previews a selected image
- **WHEN** a supported image passes local selection checks
- **THEN** the page shows an accessible local customer-input preview with the filename or configured field label and controls to replace or remove it

#### Scenario: Image field allows multiple values
- **WHEN** an image field is configured with a maximum count greater than one
- **THEN** the shopper can add up to that count, see their order, and reorder the values without changing Variant identity

#### Scenario: Image metadata triggers a quality warning
- **WHEN** decoded image dimensions fall below a configured recommended threshold but do not violate a required minimum
- **THEN** the page displays a non-authoritative quality warning and allows the server to apply the same configured distinction

#### Scenario: Image violates a required constraint
- **WHEN** an image violates a configured MIME, byte-size, dimension, or count limit
- **THEN** the page rejects it with an understandable error and does not present the field as complete

### Requirement: Customer crop data is non-destructive input metadata

When an image field explicitly enables crop input, the system SHALL preserve a normalized non-destructive crop region separately from the original private upload and validate that the region is finite and contained within image bounds. Crop data MUST NOT overwrite the original file or imply that a production rendering has been generated.

#### Scenario: Shopper adjusts an enabled crop
- **WHEN** the shopper chooses a valid crop region for a crop-enabled image field
- **THEN** the draft stores normalized crop metadata while retaining the original private upload

#### Scenario: Crop is not configured for the field
- **WHEN** a browser submits crop metadata for an image field that does not enable it
- **THEN** the server rejects the unsupported crop metadata

### Requirement: Configured-item handoff is normalized and server-validatable

The workflow SHALL produce a provider-neutral configured-item handoff containing Product identity, Variant/SKU identity, selected Variant Options, customization configuration version, and ordered field values that use field IDs/codes and opaque upload receipt IDs rather than storage paths. The server MUST re-resolve the Product, Variant, field configuration, and upload ownership before accepting the handoff. This capability MUST NOT define cart merge, hashing, persistence, or complete order snapshot behavior.

#### Scenario: Guest submits a ready configured item
- **WHEN** a guest submits a locally ready item with a valid SKU and owned customization values
- **THEN** the server returns a normalized accepted handoff suitable for the existing order boundary or the later cart workflow

#### Scenario: Browser supplies a storage path
- **WHEN** a configured-item payload supplies a bucket, object key, permanent URL, or unrecognized upload identifier as customer authority
- **THEN** the server rejects the private-media value without probing or exposing the referenced object

#### Scenario: Downstream cart integration is not yet present
- **WHEN** the customization workflow produces a valid configured item before complete cart-line identity exists
- **THEN** the handoff remains a distinct structured payload and does not invent a merge key or claim durable cart persistence

### Requirement: Local fixtures are explicit and contain no customer data

Development and offline tests MAY use explicit deterministic customization-field definitions and fake upload receipts, but production MUST NOT fall back to them. Fixture data MUST contain no real customer media, private object reference, secret, or claim that example Product requirements are approved production configuration.

#### Scenario: Explicit fixture mode renders a sample customizer
- **WHEN** the application runs in the existing authorized development/test fixture mode
- **THEN** deterministic sample field definitions may exercise the customization UX without contacting live Supabase or object storage

#### Scenario: Production configuration read fails
- **WHEN** the authoritative production customization source is unavailable
- **THEN** the system fails closed and does not substitute development fields or a permissive empty schema

### Requirement: Advanced customization behavior remains deferred

This capability MUST NOT implement arbitrary conditional display rules, customization surcharges, promotions, shipping prices, supplier instructions, production routing, AI processing, automated moderation, face detection, background removal, or production-preview generation/approval. Variant base pricing SHALL remain authoritative until a separately approved pricing change adds server-calculated customization charges.

#### Scenario: Configuration requests a deferred rule
- **WHEN** an administrator or data source supplies a pricing formula, arbitrary dependency expression, AI instruction, or production-preview action as a basic CustomizationField constraint
- **THEN** the configuration is rejected or left inactive for a later approved capability rather than executed by this workflow
