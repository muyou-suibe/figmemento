## MODIFIED Requirements

### Requirement: Explicit and fail-closed Admin acceptance source

The Admin acceptance runtime SHALL use an explicit server-only local source selection, represented by `ADMIN_ACCEPTANCE_SOURCE=local_fake`, `local_persistent`, or an equivalent documented name. An absent selection SHALL preserve the existing production Admin source path. Local sources SHALL be accepted only in development and test runtimes; production SHALL reject the configuration before local Admin data can be served, and staging SHALL also reject `local_persistent`. A provider failure SHALL never fall back between local and production sources or between persistent and fake commerce sources, and a browser request SHALL not select the source. An unknown or unsupported `ADMIN_ACCEPTANCE_SOURCE` value SHALL fail closed as a bounded server configuration error and SHALL NOT select either the local or production source. Persistent Admin commerce SHALL resolve only the independent Docker local Supabase project's PostgreSQL and private Storage used by the same local Order, payment, fulfillment, tracking, media, and delivery authorities. Its scope SHALL NOT enable persistent Catalog CRUD.

#### Scenario: Explicit local source in development

- **WHEN** the server runs in development or test with the local Admin source explicitly selected
- **THEN** Admin source resolution returns only the selected local acceptance adapters and Admin pages may render clearly non-production local data; fake mode continues to render synthetic fixtures

#### Scenario: Absent source preserves production behavior

- **WHEN** the Admin acceptance source is absent in a supported production path
- **THEN** the existing production Admin repository/client composition remains authoritative and no local fixture is substituted

#### Scenario: Production local source is rejected

- **WHEN** a production runtime is configured with the local Admin source
- **THEN** source resolution fails closed with a bounded configuration result before local Catalog or Order data is served

#### Scenario: Unknown Admin acceptance source is rejected

- **WHEN** the server receives an unknown or unsupported Admin acceptance source value
- **THEN** source resolution fails closed with a bounded configuration result and neither local nor production Admin data source is selected

#### Scenario: Local source failure does not fall back

- **WHEN** a selected local Admin adapter fails to load or apply a bounded operation
- **THEN** the request returns a safe unavailable/error result and does not construct or query an alternate Supabase, Storage, or production source; fake mode constructs no Supabase or Storage source at all

#### Scenario: Persistent Admin project is invalid

- **WHEN** persistent Admin is selected in staging or uses a non-local project, unavailable database/Storage, or a different project/mode from related commerce authorities
- **THEN** it returns a bounded configuration/unavailable result without memory commerce writes or production source fallback

### Requirement: Local Admin Catalog uses existing typed boundaries

In explicit `local_fake` Catalog mode, `/admin/products` and its existing Catalog APIs SHALL read a complete synthetic Catalog graph through the existing provider-neutral Catalog contracts. The graph SHALL cover Category, Product, ProductOption, ProductOptionValue, ProductVariant/SKU, public ProductAsset metadata, ProductFulfillmentConfig, publication/lifecycle state, and any existing Catalog-adjacent CustomizationField surface already required by the page. Local Catalog commands, if exercised, SHALL be limited to the existing typed bounded commands and validation; they SHALL change only process-memory state, never claim production persistence, and never introduce new Product, SKU, customization, inventory, supplier, fulfillment, or lifecycle semantics. Selecting persistent Admin commerce SHALL preserve this existing Catalog fake boundary and its restart-loss behavior rather than promote it to durable Catalog CRUD. That explicitly separate fake Catalog MUST NOT become Catalog authority for persistent commerce acceptance, which SHALL read the isolated database's synthetic Catalog through its own selected authority. The distinction SHALL be visible and documented rather than a silent fallback.

#### Scenario: Authorized local Products read

- **WHEN** a valid Admin session opens `/admin/products` with the local fake Catalog source selected
- **THEN** the existing page renders a synthetic, internally consistent Catalog graph through the existing Admin query boundary and no production data appears

#### Scenario: Existing Catalog editor command is bounded locally

- **WHEN** an authorized local request submits one of the existing Product, Category, option, option-value, Variant, asset, or fulfillment commands
- **THEN** the command uses the same domain parsing/validation and bounded intent as the existing boundary, updates only the local process-memory graph, and returns an honest applied or validation result

#### Scenario: Local lifecycle command remains bounded

- **WHEN** an authorized local request uses an existing publish, unpublish, or retire control
- **THEN** the existing lifecycle validation is used against local state, successful state changes remain process-local, and no hard delete or production lifecycle mutation occurs

#### Scenario: Persistent commerce does not persist Catalog edits

- **WHEN** Admin commerce is persistent and an existing local Catalog editor is used
- **THEN** the editor remains explicitly Catalog `local_fake`, changes no database Catalog record, and cannot silently alter persistent storefront purchase authority

### Requirement: Local Admin Orders is a separate synthetic read boundary

In explicit `local_fake` mode, `/admin/orders` SHALL use a provider-neutral Admin Orders read boundary separate from the Catalog repository. Its data SHALL be synthetic development/test data clearly identified as local and SHALL be limited to safe presentation fields needed for acceptance, including long order references, payment/fulfillment/tracking states, line items, long customization copy, and safe empty/error states. It MUST NOT contain real customer PII, production Order data, payment identifiers, upload keys, storage paths, carrier credentials, or other provider secrets. In `local_persistent`, the same authorized Orders surface SHALL instead read canonical local commerce Orders and immutable item snapshots from the selected independent local project, never synthetic memory substitutes or Catalog reconstruction. It MAY show only the bounded local test contact/fulfillment information needed by the authorized operation, with no production data or raw secrets. Private input/preview/delivery media SHALL be accessed only through their separately authorized local private boundaries, not public/provider locators. Bounded persistent local workflow controls SHALL use the shared commerce command authority, not production or legacy Order APIs.

#### Scenario: Authorized local Orders read

- **WHEN** a valid Admin session opens `/admin/orders` with `local_fake` selected
- **THEN** the existing Orders presentation renders only the synthetic local read model and remains clearly non-production

#### Scenario: Local Orders never accesses Storage

- **WHEN** a local fake synthetic order contains a photo or digital-delivery-shaped presentation case
- **THEN** the local read path uses no private storage locator and makes no Supabase Storage or signed-URL request

#### Scenario: Orders mutation controls are not production workflow

- **WHEN** an existing Order, payment, photo-review, digital-delivery, fulfillment, or tracking control is shown in `local_fake` mode
- **THEN** it is disabled, safely unavailable, or otherwise bounded without claiming a production Order mutation or implementing a new workflow

#### Scenario: Persistent Admin reads the same customer Order

- **WHEN** an authorized Admin opens a persistent Order created through the local customer flow
- **THEN** it reads the same canonical Order/item identities, original purchase facts, and current committed commerce lifecycle without copying a memory Order or consulting current Catalog for history

### Requirement: All relevant Admin routes share one server-side source boundary

Every existing Admin route that contributes to the authorized Products or Orders acceptance surface SHALL resolve its source through the same server-only runtime policy after authorization. This includes Catalog content, SKU graph, assets, fulfillment, lifecycle, and existing Catalog-adjacent customization routes where they are surfaced by the real page. No route may read local data while a related mutation silently writes production Supabase, and no local Orders route may re-enter the Catalog source to obtain Order data. With persistent commerce selected, every Orders, review, preview, fulfillment, delivery, and tracking route SHALL use the same selected local project's canonical commerce authority or explicitly fail closed if unadapted. Catalog read/write routes SHALL remain together on their existing explicitly separate `local_fake` boundary; this exception MUST NOT allow memory Catalog or Order data to satisfy persistent commerce decisions. Browser-supplied source selectors MUST NOT affect either choice.

#### Scenario: Local Catalog route family is consistent

- **WHEN** an authorized local Admin session uses a Catalog read or bounded mutation route exposed by `/admin/products`
- **THEN** every route uses the local fake Catalog source and no Supabase factory is called

#### Scenario: Production route family is preserved

- **WHEN** the local selector is absent and an authorized Admin request uses an existing Catalog or Orders route
- **THEN** the current production composition remains in force without a local fallback or route-specific source exception

#### Scenario: Persistent Order control targets an old write route

- **WHEN** an Order action would use a legacy production interface or a memory-only local operation while persistent commerce is selected
- **THEN** the route rejects it before any write unless it has been explicitly adapted to the same persistent shared command authority

### Requirement: Provider isolation and safe failure are observable

The `local_fake` acceptance runtime SHALL be verifiable with deterministic provider sentinels showing zero Supabase client construction, zero remote fetches, zero Storage-provider calls, and zero production Order repository calls. For `local_persistent`, the only permitted database/Storage access SHALL be the explicitly selected independent Docker local project, with zero hosted/production Supabase, production Order repository, real payment, email, carrier, or other external-provider calls. Persistent Catalog CRUD SHALL not be introduced, and fake Catalog route sentinels SHALL retain their zero-provider contract. Local source errors SHALL map to bounded public unavailable/error states without exposing stacks, secrets, filesystem paths, environment values, SQL details, or synthetic data as production data.

#### Scenario: Zero-provider authorized acceptance

- **WHEN** an authorized `local_fake` Admin browser session loads Products and Orders and exercises the allowed read paths
- **THEN** provider sentinels observe zero Supabase, remote-network, Storage, and production-Order-repository calls

#### Scenario: Safe local source failure

- **WHEN** a local Catalog or Orders adapter is unavailable or malformed
- **THEN** the page or API shows a bounded unavailable/error state with no provider, secret, filesystem, stack, or environment leakage and no fallback

#### Scenario: Persistent provider access is local-only

- **WHEN** authorized persistent commerce reads or mutations use database or private media access
- **THEN** all observed database/Storage access belongs to the selected independent local project and no production/hosted provider or memory commerce substitute is used

### Requirement: Local state is process-memory only and isolated from storefront

Local Admin Catalog changes SHALL be process-memory only and SHALL reset after process restart, including when Admin commerce is separately `local_persistent`. The Catalog runtime MUST NOT provide durability through filesystem, SQLite, Supabase, browser localStorage, or another persistence layer. `local_fake` Orders presentation SHALL remain synthetic memory-only state. The sole persistent Admin exception SHALL be canonical local commerce Orders/fulfillment/delivery and their associated payment/tracking/media reads or bounded commands in the independent local project; its records and audit/idempotency facts SHALL survive restart. Local Admin fixtures SHALL remain development/test authority only and SHALL not alter the default public Home, Shop, Category, PDP, Cart, Checkout, Order, Fulfillment, or Tracking source selection. Persistent public commerce and Admin commerce must each be explicitly selected and agree on the same project; selecting Admin alone SHALL NOT activate storefront persistence.

#### Scenario: Restart resets local Admin state

- **WHEN** a local Admin command changes process-memory Catalog state and the development process restarts
- **THEN** the synthetic graph returns to its deterministic initial state and no durability claim is made

#### Scenario: Public storefront remains isolated

- **WHEN** the local Admin source is selected for an authorized Admin session
- **THEN** public storefront and downstream local runtime source selection do not read the Admin acceptance fixtures unless their own independently documented local source is selected

#### Scenario: Persistent commerce and fake Catalog have different lifetimes

- **WHEN** persistent Admin commerce has a committed Order action and fake Catalog has an editor change before restart
- **THEN** the authorized commerce action/history survives in the same local project while the fake Catalog returns to its initial state, with both behaviors clearly identified

### Requirement: Authorized Admin browser acceptance is bounded and truthful

The acceptance target SHALL use the real `/admin/login`, `/admin/products`, and `/admin/orders` routes with a real signed Admin session and SHALL record desktop, 375px, keyboard, coarse-pointer, reduced-motion, safe-error, long-content, and no-horizontal-overflow evidence. `local_fake` acceptance SHALL remain authorized rendering and safe control presentation, without a new production Admin mutation workflow. `local_persistent` acceptance SHALL additionally verify canonical local Order/fulfillment/delivery actions, restart recovery, private-media authorization, shared server gates, and safe unavailable states for unadapted entry points; Catalog editors SHALL remain fake. Evidence SHALL identify local/test mode and SHALL not claim production persistence, remote-provider behavior, completion of the separate high-fidelity change, C1 backfill completion, or full supplier restoration when supplier entries remain stopped.

#### Scenario: Authorized Products browser acceptance

- **WHEN** a reviewer logs in through the real local Admin login and visits `/admin/products`
- **THEN** the authorized Catalog page and existing editors render from local synthetic fake data at desktop and 375px, with keyboard/coarse-pointer/reduced-motion controls usable and no provider request observed

#### Scenario: Authorized Orders browser acceptance

- **WHEN** the same valid Admin session visits `/admin/orders` in `local_fake`
- **THEN** the existing Orders presentation renders synthetic local read data at desktop and 375px, long content wraps safely, controls remain bounded, no Storage/provider request occurs, and no production Order claim is made

#### Scenario: Browser cannot choose backend

- **WHEN** a browser submits a query, body, cookie, or client-visible value attempting to select the local or production Admin source
- **THEN** server-side configuration remains authoritative and the request cannot switch the repository/provider boundary

#### Scenario: Persistent Orders acceptance reports actual coverage

- **WHEN** persistent Admin acceptance is reported after authorized local Order/fulfillment/delivery exercises
- **THEN** evidence separates durable commerce from fake Catalog, lists unsupported supplier or legacy entries, and does not present local evidence as deployment or production workflow completion

## ADDED Requirements

### Requirement: Persistent Admin commands preserve shared commerce gates

Persistent Admin commerce SHALL use the existing signed Admin session verifier before privileged source construction and the established same-origin mutation gate. No new dual-Admin role model SHALL be introduced. Every Order, photo-review, preview, production, Quality Check, tracking, or delivery mutation SHALL use the same canonical server command rules as customer/operator/supplier boundaries, with durable actor/action/input/version bindings and atomic lifecycle/audit/idempotency results. Direct state patches MUST NOT bypass simulated paid/succeeded, applicable photo review, complete latest required-preview approval, at most two customer revision requests per Order with v1-v3, or Quality Check before physical dispatch. Preview-disabled items MUST NOT need fake preview approvals. Admin timeout confirmation SHALL require a passed stored deadline, current manifest/version, bounded reason, actual Admin actor and audit, and MUST NOT forge customer approval or bypass the revision limit. Unsupported controls SHALL fail closed at the server, not only in the UI.

#### Scenario: Direct Admin request attempts a gate bypass

- **WHEN** an authorized Admin invokes an API directly to start production or dispatch without required canonical payment/review/preview/Quality Check facts
- **THEN** the shared command rejects it without a partial lifecycle, audit, or idempotency mutation

#### Scenario: Current approved preview is required across all relevant items

- **WHEN** one of an Order's preview-required items is absent from the current manifest or an old version is submitted
- **THEN** Admin cannot start production using partial or stale approval, while preview-disabled items remain exempt from preview media requirements

#### Scenario: Admin timeout does not impersonate the customer

- **WHEN** the Admin confirms a preview after its configured deadline with a valid reason and current version
- **THEN** the distinct audited Admin decision records the real actor and does not create customer approval, reset revision counts, or start production automatically

#### Scenario: Mutation result is lost and retried

- **WHEN** an authorized equivalent persistent Admin command is retried after a lost response or restart
- **THEN** its original committed result is returned after fresh authorization without duplicate action, version, counter, delivery publication, or audit effects

### Requirement: Persistent Admin private digital delivery is item-authorized

Persistent Admin MAY perform bounded local private digital-delivery publication, replacement, and revocation only through the same selected project's canonical Order/item/media and fulfillment authority. Each published delivery SHALL have a server-owned immutable version and exact Order-item relationship with authorized private file access, configured expiry and download limits, revocation state, and durable audit. A replacement SHALL publish a new version rather than rewrite prior delivery facts; replaced/revoked versions MUST NOT remain claimable. Customer claim/download SHALL require current Order ownership and exact digital-item entitlement, with atomic download-limit enforcement; Order number plus email MUST NOT issue a grant or link. Digital-only Orders SHALL not require physical tracking, while mixed Orders SHALL check digital and physical eligibility separately. Admin projections MUST NOT expose Storage keys or permanent public links, and delivery persistence MUST NOT be represented as production Storage approval.

#### Scenario: Authorized Admin publishes a local digital item

- **WHEN** a valid Admin session publishes an eligible digital item's private file after local paid and applicable item-specific photo-review/preview gates pass
- **THEN** a versioned exact-item delivery record and audit fact become authoritative without a public file URL, real email, or physical Shipment requirement for a digital-only Order

#### Scenario: Delivery targets another or non-digital item

- **WHEN** a publication or claim supplies a mismatched Order/item pair, non-digital item, or unproven private file
- **THEN** the server rejects it without publishing or exposing another item's media

#### Scenario: Concurrent download claims reach the limit

- **WHEN** multiple authorized claims race for the last permitted download of an active unexpired version
- **THEN** at most the configured remaining number of claims succeeds and exhausted, expired, replaced, or revoked versions remain unavailable without incrementing beyond the limit

#### Scenario: Email-based old download path is invoked

- **WHEN** a request presents only an Order number and email to an existing download/lookup path
- **THEN** it cannot obtain persistent private delivery access and the incompatible path remains stopped for persistent Orders

### Requirement: Persistent Admin scope and supplier stop gates remain explicit

Persistent Admin work SHALL remain limited to local commerce Order/fulfillment/delivery operation composition and associated payment/tracking/media authority, not persistent Catalog CRUD or a new supplier-management system. New records SHALL use the independent local commerce namespace and MUST NOT touch legacy `orders/order_items`, C1 backfill, Phase C production migration, normalized `/api/orders` 503, or existing incompatible legacy stop gates. Persistent Catalog acceptance SHALL read synthetic data from the isolated local database without marking C1 complete. Supplier entry points that cannot use this same persistent Order and shared command authority SHALL reject persistent operations before memory repository construction or writes and SHALL be openly listed as unsupported, not claimed as fully restored. No deployment, remote migration, real payment, supplier/factory call, carrier, or email integration is authorized.

#### Scenario: Persistent supplier path has no adapted authority

- **WHEN** a supplier operation would fall back to memory to read or write a new persistent Order
- **THEN** the entry fails closed with an explicit unavailable/unsupported result and creates no memory Order, assignment, or fulfillment state

#### Scenario: Local acceptance does not complete blocked migrations

- **WHEN** persistent Admin and synthetic isolated Catalog acceptance are reviewed
- **THEN** C1 backfill remains unauthorized, Phase C production migration remains incomplete, old `orders/order_items` and normalized `/api/orders` 503 remain unchanged, and no deployment is inferred