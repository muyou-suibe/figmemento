## Purpose

Establishes a trustworthy, testable engineering foundation for PhotoGift so later MVP capabilities can rely on explicit data sources, configuration boundaries, domain contracts, migration policy, and repeatable verification gates.

## ADDED Requirements

### Requirement: Reliable repository verification gates

The repository SHALL provide documented commands for linting, strict TypeScript checking, offline automated tests, and a production build, and each command SHALL return a non-zero exit status when its verification fails. These gates MUST NOT pass by disabling strictness, suppressing existing errors broadly, skipping failing tests, or requiring live third-party APIs.

#### Scenario: All gates pass on a valid checkout
- **WHEN** a developer runs the documented lint, typecheck, offline-test, and production-build commands in a correctly configured development checkout
- **THEN** every command completes successfully without contacting live Supabase, Stripe, PayPal, Resend, or 17TRACK services for the offline-test gate

#### Scenario: Type error fails the gate
- **WHEN** source code contains a TypeScript error covered by the project configuration
- **THEN** the typecheck command exits unsuccessfully and reports the error

#### Scenario: Missing live credentials do not invalidate offline tests
- **WHEN** third-party secret values are absent from the test process
- **THEN** the offline automated-test command uses controlled test doubles or fixtures and does not attempt a live network call

### Requirement: Supabase is the authoritative production business data source

Production product reads and other existing MVP business-persistence reads SHALL use Supabase PostgreSQL as their authoritative data source. A missing Supabase configuration, unavailable Supabase service, or failed production product query MUST produce an explicit unavailable or configuration error outcome and MUST NOT silently substitute a hardcoded catalog.

#### Scenario: Production catalog read succeeds
- **WHEN** production requests published product data and the configured Supabase source returns successfully
- **THEN** the storefront receives product data derived from that Supabase result

#### Scenario: Production catalog query fails
- **WHEN** the production Supabase product query returns a network, authorization, or service error
- **THEN** the application exposes a controlled unavailable state and does not display hardcoded fixture products as if they were production data

#### Scenario: Production Supabase configuration is missing
- **WHEN** a production code path requiring Supabase business data starts without the required server configuration
- **THEN** the application reports a clear configuration failure without exposing secret values

### Requirement: Development and test fixtures are explicitly isolated

Development and test product fixtures SHALL be stored and selected separately from production product data. Fixture use MUST require an explicit non-production selection, and a production process MUST reject or ignore any attempt to activate the fixture source.

#### Scenario: Developer explicitly selects fixtures
- **WHEN** a developer starts an approved non-production environment with the documented fixture-source selection
- **THEN** the application uses the deterministic development fixture catalog and clearly identifies that source through diagnostics or documentation

#### Scenario: Test selects deterministic fixtures
- **WHEN** an offline automated test supplies a fixture repository or fixture-source configuration
- **THEN** the test receives deterministic product data without requiring Supabase connectivity

#### Scenario: Production fixture selection is attempted
- **WHEN** a production process is configured to use the development or test fixture source
- **THEN** startup or the affected request fails clearly instead of serving fixture products

### Requirement: Shared existing-domain contracts

The existing Product, Cart, Customization, Upload, Order, and Payment concepts SHALL each have a shared typed contract that can be consumed by UI, server/application logic, and integration adapters without importing UI state or provider-specific response types into the domain contract. This change MUST NOT add future SKU, shipping-rule, production-preview, authentication, or payment-provider behavior to those contracts.

#### Scenario: UI and server use the same contract
- **WHEN** an existing domain payload crosses from storefront code to an existing server route
- **THEN** both sides validate or type the payload against the same shared domain contract rather than maintaining incompatible local duplicates

#### Scenario: Provider shape changes internally
- **WHEN** an integration adapter maps a Supabase or Stripe response into an existing domain concept
- **THEN** provider-specific fields remain inside the adapter boundary and the shared domain contract remains provider-neutral

#### Scenario: Future behavior is encountered during extraction
- **WHEN** implementation identifies a missing SKU, multi-image, shipping, authentication, or production-preview field required only by a later approved change
- **THEN** the field is recorded as deferred and is not silently introduced by this foundation change

### Requirement: Explicit configuration and secret boundaries

Configuration SHALL be parsed through documented browser-safe and server-only boundaries. Required values SHALL be validated at the earliest safe lifecycle point for their usage, server secrets MUST NOT be included in browser bundles or responses, and validation errors MUST name the missing configuration key without printing its value.

#### Scenario: Browser requests public configuration
- **WHEN** browser code accesses application configuration
- **THEN** only explicitly allowlisted public values are available and no Supabase secret key, payment secret, webhook secret, or admin secret is included

#### Scenario: Server integration lacks required configuration
- **WHEN** an existing server integration is invoked without its required configuration
- **THEN** the integration returns or throws a controlled configuration error that identifies the missing key but not any secret value

#### Scenario: Cloudflare injects secrets at runtime
- **WHEN** a production build is created before runtime-only secrets are injected by the hosting environment
- **THEN** the build can complete while the affected server integration still validates those secrets before first use at runtime

### Requirement: D1 and Drizzle paths are classified before isolation

Every D1-, Drizzle-, Cloudflare-binding-, starter-example-, and generated-support path in the repository SHALL be documented as runtime-required, unused template residue, or intentionally retained for a named future purpose before implementation removes, relocates, excludes, or changes it. Runtime-required vinext/Cloudflare behavior MUST remain operational.

#### Scenario: Unreferenced D1 business path is reviewed
- **WHEN** a D1 or Drizzle file has no active application import and no configured production binding
- **THEN** the classification record identifies the evidence and the approved isolation action before that action is performed

#### Scenario: Runtime-support path resembles a template remnant
- **WHEN** a Cloudflare or build-support file participates in the active vinext build or Worker entry point
- **THEN** it is classified as runtime-required and is retained or changed only with verification that the production build still passes

#### Scenario: Classification is uncertain
- **WHEN** repository evidence cannot establish whether a path is runtime-required
- **THEN** the path is retained, marked unresolved, and not deleted by this change

### Requirement: Supabase migration management contract

The repository SHALL document one canonical migration workflow for future Supabase PostgreSQL business-schema changes, including ordered migration naming, local or test verification expectations, deployment ordering, rollback or forward-fix guidance, and handling of the current flat SQL bootstrap files. This change MUST NOT create a future Product/SKU business migration.

#### Scenario: Later change needs a business schema update
- **WHEN** a later approved OpenSpec change introduces a Supabase schema modification
- **THEN** its implementation follows the documented canonical migration workflow rather than adding an unordered standalone SQL script

#### Scenario: Foundation change is applied
- **WHEN** this foundation change completes
- **THEN** no Product/SKU, configurable-catalog, authentication, shipping, preview, or other future-feature business migration has been created

### Requirement: Foundational characterization tests

Offline automated tests SHALL characterize the existing critical server-route invariants that this refactor touches, including server-authoritative base product pricing, coupon revalidation, upload input rejection, Stripe webhook signature rejection and replay safety where practical, order lookup data minimization, and admin authorization rejection. Tests SHALL use controlled repositories and network doubles rather than live services.

#### Scenario: Browser submits an arbitrary product price
- **WHEN** a route-level test supplies a client payload containing a price that differs from the repository product price
- **THEN** the characterized order logic uses the server-side repository price or rejects the unsupported payload

#### Scenario: Invalid upload input is submitted
- **WHEN** an upload route test submits an unsupported content type or an oversized file
- **THEN** the route rejects the upload without invoking live object storage

#### Scenario: Invalid webhook signature is submitted
- **WHEN** a webhook route test submits a payload with an invalid Stripe signature
- **THEN** the route rejects the event and performs no order mutation

#### Scenario: Unauthenticated admin mutation is attempted
- **WHEN** a test calls an existing protected admin route without a valid admin session
- **THEN** the route returns an unauthorized result and performs no business-data mutation

### Requirement: Known prototype assumptions remain visible

Known defects and prototype assumptions discovered during foundation work that are outside this change's scope SHALL be recorded as deferred work and MUST NOT be encoded in shared contracts, fixtures, or characterization tests as desired future behavior.

#### Scenario: Out-of-scope order-item defect is encountered
- **WHEN** foundation work encounters the existing behavior that aggregates separately customized copies of the same product
- **THEN** the behavior is documented for the later cart/order change and no test asserts that aggregation as the required contract

#### Scenario: Out-of-scope production-preview claim is encountered
- **WHEN** foundation work encounters UI text or state assumptions for a production-preview workflow that is not implemented
- **THEN** the discrepancy is recorded for the production-preview change without implementing that workflow here

#### Scenario: Missing webhook payment-value verification is encountered
- **WHEN** foundation work confirms that the existing Stripe webhook does not verify the expected order amount and currency
- **THEN** the gap is recorded for the later `integrate-stripe-and-paypal-payments` change and no new payment-validation behavior is implemented by this foundation change

### Requirement: Accurate architecture and security documentation

Repository documentation SHALL describe the actual PhotoGift architecture, authoritative persistence source, explicit fixture workflow, configuration categories, local setup, verification gates, migration policy, deployment shape, and known deferred MVP changes. Committed source SHALL contain no real secret values, and example configuration SHALL use empty or clearly non-secret placeholders.

#### Scenario: New developer follows repository documentation
- **WHEN** a developer reads the repository documentation from a clean checkout
- **THEN** they can identify the active runtime, Supabase persistence path, fixture opt-in, required configuration names, and commands for lint, typecheck, offline tests, and production build

#### Scenario: Repository is scanned for secrets
- **WHEN** tracked source and planning artifacts are checked before completion
- **THEN** no real Supabase secret, payment secret, webhook secret, admin password, or other credential is present
