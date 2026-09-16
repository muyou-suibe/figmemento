# local-catalog-demo Specification

## Purpose
Provides a deterministic, explicitly fixture-backed local storefront demonstration that exercises the real catalog presentation and Variant-selection behavior without depending on Supabase, migrations, production services, or simulated Admin persistence.
## Requirements
### Requirement: Local fixture mode is explicit and environment-safe
The system SHALL activate the development catalog only when fixture mode is explicitly selected through a local runtime configuration mechanism that is reliably available to the application Worker. The system MUST continue to use Supabase when no fixture source is selected, MUST NOT silently fall back to fixtures after a Supabase failure, and MUST reject fixture mode in production. Developer-specific local configuration MUST remain uncommitted and MUST NOT contain required production credentials.

#### Scenario: Explicit development fixture activation
- **WHEN** a developer starts the application in development with the documented ignored local configuration selecting the fixture catalog
- **THEN** the storefront reads the approved development fixtures through the normal catalog repository boundary
- **AND** the visible Demo is identified as fixture-backed

#### Scenario: No explicit fixture selection
- **WHEN** the application starts without an explicit fixture catalog selection
- **THEN** Supabase remains the configured catalog source
- **AND** the system does not substitute fixture data if Supabase is unavailable

#### Scenario: Production fixture rejection
- **WHEN** fixture mode is selected in a production runtime
- **THEN** startup or catalog-source resolution fails safely before fixture catalog data can be served

### Requirement: Demo fixture assets are deterministic and public-domain-safe
Development fixtures SHALL use ProductAsset metadata accepted by the existing catalog contract and capable of deterministic local rendering without fetching placeholder media from an external host. Fixture assets MUST remain public marketing references and MUST NOT represent customer-private uploads, production previews, order assets, digital-delivery files, or a storage-provider decision.

#### Scenario: Fixture asset renders without an external placeholder dependency
- **WHEN** a fixture-backed ProductAsset is shown on a supported storefront surface
- **THEN** the existing storefront renders its controlled ProductAsset fallback consistently
- **AND** no request to an external placeholder-media host is required

#### Scenario: Private asset semantics remain prohibited
- **WHEN** development fixture assets are validated
- **THEN** none uses a private, customer, order, preview, or delivery reference namespace

### Requirement: Representative fixture exercises real Variant selection
The development catalog SHALL contain one representative Product with one required SKU-defining Option, three distinct Option Values, and three valid Variants resolved through the existing catalog domain logic. At least two Variants MUST be active and available with different authoritative USD prices, and one Variant MUST be visibly unavailable using the existing availability semantics. The fixture MUST NOT model customer customization, exact inventory, supplier data, or new catalog schema behavior.

#### Scenario: Available Variant selection changes authoritative price
- **WHEN** a user selects each available Option Value on the representative Product detail page
- **THEN** the existing Variant resolver identifies the corresponding unique SKU
- **AND** the displayed price changes to that Variant's authoritative USD price

#### Scenario: Unavailable Variant cannot be selected as purchasable
- **WHEN** the user views the Option Value whose only matching Variant is unavailable
- **THEN** the storefront visibly communicates that the choice is unavailable
- **AND** the unavailable Variant is not treated as an eligible purchasable selection

#### Scenario: Required Option selection remains structurally valid
- **WHEN** the representative fixture graph is validated
- **THEN** every Variant has exactly one same-Product value for the required Option
- **AND** SKU codes and Option combinations are unique

### Requirement: Local Demo uses the existing storefront behavior
The fixture-backed Demo SHALL use the same Homepage, Shop, Category, Product Detail, ProductAsset presentation, Variant resolution, pricing, availability, and fulfillment presentation paths used by the application. It MUST NOT provide fake Admin success, database persistence, or alternate Demo-only storefront components.

#### Scenario: Public Demo route sequence renders
- **WHEN** the documented local Demo environment visits the Homepage, Shop, representative Category, and representative Product routes
- **THEN** each route renders from the approved fixture catalog without requiring Supabase
- **AND** the Product detail page displays Variant selection, authoritative price and availability, fulfillment type, and lead-time information

#### Scenario: Admin persistence is not presented as working
- **WHEN** the local Demo runbook reaches its intentional exclusions
- **THEN** it states that Admin catalog writes require a compatible Supabase database and unapplied C1 migrations
- **AND** it does not instruct the presenter to demonstrate Admin save or lifecycle operations

### Requirement: Demo readiness is verified offline
The project SHALL provide deterministic verification that fixture mode renders the required storefront path without contacting Supabase and that production continues to reject fixture activation. The verification MUST NOT require live Supabase or any other third-party API.

#### Scenario: Fixture storefront smoke makes no Supabase request
- **WHEN** the local fixture smoke verification exercises the required public routes
- **THEN** it completes using the fixture source
- **AND** observed Supabase request count is zero

#### Scenario: Demo runbook is reproducible
- **WHEN** a developer follows the local Demo runbook from a prepared repository
- **THEN** the documented non-secret configuration, verification commands, startup command, URLs, Demo sequence, and excluded actions are sufficient to reproduce the storefront Demo
