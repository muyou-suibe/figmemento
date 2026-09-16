## Purpose

Provide a development/test-only local Admin runtime that uses the real Admin
login and session boundary while rendering synthetic Catalog and Order data
without contacting Supabase, object storage, production databases, or live
production orders.

## ADDED Requirements

### Requirement: Explicit and fail-closed Admin acceptance source

The Admin acceptance runtime SHALL use an explicit server-only local source
selection, represented by `ADMIN_ACCEPTANCE_SOURCE=local_fake` or an equivalent
documented name. An absent selection SHALL preserve the existing production
Admin source path. The local source SHALL be accepted only in development and
test runtimes; production SHALL reject the configuration before local Admin
data can be served. A provider failure SHALL never fall back between the local
and production sources, and a browser request SHALL not select the source.
An unknown or unsupported `ADMIN_ACCEPTANCE_SOURCE` value SHALL fail closed as
a bounded server configuration error and SHALL NOT select either the local or
production source.

#### Scenario: Explicit local source in development

- **WHEN** the server runs in development or test with the local Admin source
  explicitly selected
- **THEN** Admin source resolution returns only the local acceptance adapters
  and the Admin pages may render synthetic local data

#### Scenario: Absent source preserves production behavior

- **WHEN** the Admin acceptance source is absent in a supported production path
- **THEN** the existing production Admin repository/client composition remains
  authoritative and no local fixture is substituted

#### Scenario: Production local source is rejected

- **WHEN** a production runtime is configured with the local Admin source
- **THEN** source resolution fails closed with a bounded configuration result
  before local Catalog or Order data is served

#### Scenario: Unknown Admin acceptance source is rejected

- **WHEN** the server receives an unknown or unsupported Admin acceptance
  source value
- **THEN** source resolution fails closed with a bounded configuration result
  and neither local nor production Admin data source is selected

#### Scenario: Local source failure does not fall back

- **WHEN** a selected local Admin adapter fails to load or apply a bounded
  operation
- **THEN** the request returns a safe unavailable/error result and does not
  construct or query a Supabase, Storage, or alternate production source

### Requirement: Existing Admin authentication remains authoritative

Every local Admin acceptance page and Admin API request SHALL use the existing
`/admin/login` and signed Admin session cookie flow and SHALL validate that
session through the existing server-side Admin verifier before constructing a
local or production repository. The local source selection SHALL not bypass,
replace, or weaken Admin authentication, and customer authentication or a
browser-provided backend selector SHALL not authorize Admin access.

#### Scenario: Real local Admin login creates access

- **WHEN** a user submits the configured Admin password to the existing Admin
  login route in an allowed local runtime
- **THEN** the existing signed Admin session cookie is issued and subsequent
  authorized Admin requests use the existing verifier

#### Scenario: Unauthorized request stops before source construction

- **WHEN** an Admin page or API request has no valid Admin session
- **THEN** it is redirected or rejected through the existing bounded behavior
  and no local, Supabase, or Storage repository is constructed

#### Scenario: Customer authority cannot substitute for Admin authority

- **WHEN** a request has customer or guest state but no valid Admin session
- **THEN** the Admin request is rejected without exposing Admin data or source
  existence

### Requirement: Local Admin Catalog uses existing typed boundaries

In explicit local mode, `/admin/products` and its existing Catalog APIs SHALL
read a complete synthetic Catalog graph through the existing provider-neutral
Catalog contracts. The graph SHALL cover Category, Product, ProductOption,
ProductOptionValue, ProductVariant/SKU, public ProductAsset metadata,
ProductFulfillmentConfig, publication/lifecycle state, and any existing
Catalog-adjacent CustomizationField surface already required by the page.
Local Catalog commands, if exercised, SHALL be limited to the existing typed
bounded commands and validation; they SHALL change only process-memory state,
never claim production persistence, and never introduce new Product, SKU,
customization, inventory, supplier, fulfillment, or lifecycle semantics.

#### Scenario: Authorized local Products read

- **WHEN** a valid Admin session opens `/admin/products` with the local source
  selected
- **THEN** the existing page renders a synthetic, internally consistent Catalog
  graph through the existing Admin query boundary and no production data
  appears

#### Scenario: Existing Catalog editor command is bounded locally

- **WHEN** an authorized local request submits one of the existing Product,
  Category, option, option-value, Variant, asset, or fulfillment commands
- **THEN** the command uses the same domain parsing/validation and bounded intent
  as the existing boundary, updates only the local process-memory graph, and
  returns an honest applied or validation result

#### Scenario: Local lifecycle command remains bounded

- **WHEN** an authorized local request uses an existing publish, unpublish, or
  retire control
- **THEN** the existing lifecycle validation is used against local state,
  successful state changes remain process-local, and no hard delete or
  production lifecycle mutation occurs

### Requirement: Local Admin Orders is a separate synthetic read boundary

In explicit local mode, `/admin/orders` SHALL use a provider-neutral Admin
Orders read boundary separate from the Catalog repository. Its data SHALL be
synthetic development/test data clearly identified as local and SHALL be
limited to safe presentation fields needed for acceptance, including long
order references, payment/fulfillment/tracking states, line items, long
customization copy, and safe empty/error states. It MUST NOT contain real
customer PII, production Order data, payment identifiers, upload keys,
storage paths, carrier credentials, or other provider secrets.

#### Scenario: Authorized local Orders read

- **WHEN** a valid Admin session opens `/admin/orders` with the local source
  selected
- **THEN** the existing Orders presentation renders only the synthetic local
  read model and remains clearly non-production

#### Scenario: Local Orders never accesses Storage

- **WHEN** a local synthetic order contains a photo or digital-delivery-shaped
  presentation case
- **THEN** the local read path uses no private storage locator and makes no
  Supabase Storage or signed-URL request

#### Scenario: Orders mutation controls are not production workflow

- **WHEN** an existing Order, payment, photo-review, digital-delivery,
  fulfillment, or tracking control is shown in local mode
- **THEN** it is disabled, safely unavailable, or otherwise bounded without
  claiming a production Order mutation or implementing a new workflow

### Requirement: All relevant Admin routes share one server-side source boundary

Every existing Admin route that contributes to the authorized Products or
Orders acceptance surface SHALL resolve its source through the same server-only
runtime policy after authorization. This includes Catalog content, SKU graph,
assets, fulfillment, lifecycle, and existing Catalog-adjacent customization
routes where they are surfaced by the real page. No route may read local data
while a related mutation silently writes Supabase, and no local Orders route
may re-enter the Catalog source to obtain Order data.

#### Scenario: Local Catalog route family is consistent

- **WHEN** an authorized local Admin session uses a Catalog read or bounded
  mutation route exposed by `/admin/products`
- **THEN** every route uses the local Catalog source and no Supabase factory is
  called

#### Scenario: Production route family is preserved

- **WHEN** the local selector is absent and an authorized Admin request uses an
  existing Catalog or Orders route
- **THEN** the current production composition remains in force without a local
  fallback or route-specific source exception

### Requirement: Provider isolation and safe failure are observable

The local acceptance runtime SHALL be verifiable with deterministic provider
sentinels showing zero Supabase client construction, zero remote fetches, zero
Storage-provider calls, and zero production Order repository calls. Local
source errors SHALL map to bounded public unavailable/error states without
exposing stacks, secrets, filesystem paths, environment values, SQL details,
or synthetic data as production data.

#### Scenario: Zero-provider authorized acceptance

- **WHEN** an authorized local Admin browser session loads Products and Orders
  and exercises the allowed read paths
- **THEN** provider sentinels observe zero Supabase, remote-network, Storage,
  and production-Order-repository calls

#### Scenario: Safe local source failure

- **WHEN** a local Catalog or Orders adapter is unavailable or malformed
- **THEN** the page or API shows a bounded unavailable/error state with no
  provider, secret, filesystem, stack, or environment leakage and no fallback

### Requirement: Local state is process-memory only and isolated from storefront

Local Admin Catalog changes SHALL be process-memory only and SHALL reset after
process restart. The runtime MUST NOT provide durability through filesystem,
SQLite, Supabase, browser localStorage, or another persistence layer. Local
Admin fixtures SHALL remain development/test authority only and SHALL not alter
the default public Home, Shop, Category, PDP, Cart, Checkout, Order,
Fulfillment, or Tracking source selection.

#### Scenario: Restart resets local Admin state

- **WHEN** a local Admin command changes process-memory Catalog state and the
  development process restarts
- **THEN** the synthetic graph returns to its deterministic initial state and
  no durability claim is made

#### Scenario: Public storefront remains isolated

- **WHEN** the local Admin source is selected for an authorized Admin session
- **THEN** public storefront and downstream local runtime source selection do
  not read the Admin acceptance fixtures unless their own independently
  documented local source is selected

### Requirement: Authorized Admin browser acceptance is bounded and truthful

The acceptance target SHALL use the real `/admin/login`, `/admin/products`, and
`/admin/orders` routes with a real signed Admin session and shall record
desktop, 375px, keyboard, coarse-pointer, reduced-motion, safe-error,
long-content, and no-horizontal-overflow evidence. The acceptance target is
authorized rendering and safe control presentation; it does not require a new
production Admin mutation workflow. Evidence SHALL identify local/test mode
and SHALL not claim production persistence, remote-provider behavior, or
completion of the separate high-fidelity change.

#### Scenario: Authorized Products browser acceptance

- **WHEN** a reviewer logs in through the real local Admin login and visits
  `/admin/products`
- **THEN** the authorized Catalog page and existing editors render from local
  synthetic data at desktop and 375px, with keyboard/coarse-pointer/reduced-
  motion controls usable and no provider request observed

#### Scenario: Authorized Orders browser acceptance

- **WHEN** the same valid Admin session visits `/admin/orders`
- **THEN** the existing Orders presentation renders synthetic local read data
  at desktop and 375px, long content wraps safely, controls remain bounded,
  no Storage/provider request occurs, and no production Order claim is made

#### Scenario: Browser cannot choose backend

- **WHEN** a browser submits a query, body, cookie, or client-visible value
  attempting to select the local or production Admin source
- **THEN** server-side configuration remains authoritative and the request
  cannot switch the repository/provider boundary
