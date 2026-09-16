## Purpose

Define independently verifiable completion boundaries for external authentication, payment and transactional-email adapters, without treating local simulation, sandbox evidence, real business integration or production activation as interchangeable outcomes.

## ADDED Requirements

### Requirement: Explicit service environments fail closed
The system SHALL require explicit service-test configuration with provider account/project, approved origins and isolated data authority before enabling external adapters. Disabled SHALL remain the default. Missing or mismatched settings SHALL fail closed without fixture fallback. Live payment execution and production activation SHALL remain disabled under this change.

Supabase authentication SHALL use `CUSTOMER_AUTH_SOURCE=supabase` together with the independent `SERVICE_INTEGRATION_MODE=test` gate and approved test-project identity. Source selection alone MUST NOT activate integrations; this change's production-disabled policy does not define the `supabase` source name as permanently test-only. All provider sessions SHALL remain server-only BFF owned, with no new frontend token clients or public server secrets.

#### Scenario: Missing configuration does not simulate success
- **WHEN** a provider route is selected without its required test configuration
- **THEN** it returns a typed unavailable result without making a provider request or returning simulated success

#### Scenario: Cross-environment credentials or callbacks
- **WHEN** a request, resource, credential identity, project or callback origin does not match the configured test boundary
- **THEN** it is rejected without changing authentication, order, payment or mail state

#### Scenario: Existing local modes remain isolated
- **WHEN** disabled, local_fake or separately implemented local_persistent mode is selected
- **THEN** no real service adapter is used as an implicit fallback and no real payment or email result is written into the simulation authority

### Requirement: Service code and business wiring have independent completion gates
The implementation SHALL provide testable real protocol adapters, repositories and an isolated synthetic integration-order authority without requiring live merchant credentials. These artifacts SHALL NOT be represented as a working canonical storefront order pipeline. Canonical customer ownership, payment and fulfillment wiring SHALL require separately approved schema, authorization, snapshot and atomic command contracts; the existing normalized-order unavailable boundary SHALL remain until its own prerequisites are satisfied.

#### Scenario: Adapter development before business authority approval
- **WHEN** C1, customization Phase C or canonical order persistence remains unavailable
- **THEN** real adapter code, network-denied contract tests and isolated database tests can complete, while actual storefront payment/claim/event wiring is explicitly BUSINESS_BINDING_BLOCKED

#### Scenario: Simulated payment is not a provider gateway
- **WHEN** an implementer attempts to connect a Stripe or PayPal result to a local simulated order
- **THEN** the composition rejects the authority mismatch instead of marking that order paid or enabling fulfillment

### Requirement: Isolated integration data is reproducible and protected
Local integration testing SHALL use a dedicated Supabase PostgreSQL work directory, unique project/ports and schema marker separate from the root legacy database and the pending local-commerce project. Destructive lifecycle operations SHALL verify loopback endpoint, exact project and current-run ownership marker before action. Tests SHALL exercise the HTTP/RPC path used by the Worker and SHALL NOT substitute Maps for transaction or restart assertions.

#### Scenario: Unsafe reset target
- **WHEN** a reset target is remote, the root project, another local project, or missing its matching disposable-run marker
- **THEN** reset is refused before mutation and reports the failed safety condition

#### Scenario: Real concurrent restart verification
- **WHEN** two application processes race a payment event or mail lease and are restarted against retained test data
- **THEN** unique effects and ownership remain durable and the evidence identifies distinct process IDs and the database run

#### Scenario: Missing Docker or database
- **WHEN** local integration prerequisites are unavailable
- **THEN** B database acceptance and every C execution dependent on that durable store are BLOCKED with the cause, not skipped tests reported as passing; independent A remains runnable and each C execution requires that service's A/B to have passed

### Requirement: Evidence is split by service and acceptance tier
Reports SHALL record per-service implementation state, A offline protocol tests, B local database integration, C external test-service integration, D canonical business binding, and production enablement separately. Each passed claim SHALL link to fresh commands or case evidence and sanitized environment identity. An external prerequisite SHALL NOT excuse a missing adapter implementation.

#### Scenario: No provider account yet
- **WHEN** adapter functions and offline/local tests exist but test credentials are absent
- **THEN** the report can mark A/B passed and C EXTERNAL_BLOCKED, lists the precise external prerequisite, and does not call the service end-to-end complete

#### Scenario: Only fixtures have been exercised
- **WHEN** webhook tests use signed fixtures or a provider simulator without a real attempted checkout
- **THEN** they count as protocol/contract evidence, not actual external payment, capture or callback evidence

#### Scenario: Baseline changes since historical review
- **WHEN** implementation starts or ends
- **THEN** it rebuilds before rendered tests, records fresh results without requiring historical failures to remain, and distinguishes inherited failures from new regressions without disabling tests

### Requirement: External integration requires explicit side-effect authorization
External test execution SHALL require an explicit opt-in, a dedicated test project/account, approved recipients, permitted endpoint list and callback-forwarding scope. Test mail SHALL be considered a real external send unless the provider documents otherwise. No secrets SHALL be requested through model-visible prompts or stored in evidence. No deployment, remote schema push, DNS change, live charge, bulk send or git publication SHALL be performed by this change.

#### Scenario: Test mail recipient is not allowlisted
- **WHEN** an external mail test targets an unapproved recipient or lacks send authorization
- **THEN** it is blocked before the request and offline template tests remain independently runnable

#### Scenario: External webhook ingress is not approved
- **WHEN** a PayPal, Resend or Stripe callback requires forwarding or a reachable test URL not yet approved
- **THEN** the external callback case is blocked and no tunnel, endpoint registration or deployment is started automatically

### Requirement: Existing contracts are reconciled without silently applying other changes
Implementation SHALL inspect the current main specifications and active deltas before changing shared source-mode or customer ownership contracts. It SHALL retain separately approved local persistence behavior if already implemented, without claiming that a pending delta is current code or applying that change implicitly.

#### Scenario: Authentication deltas overlap
- **WHEN** local_persistent authentication lands before or after the Supabase authentication delta
- **THEN** the combined specification explicitly preserves each mode's isolation and reconciles complete requirement blocks before sync/archive rather than letting the last delta overwrite the other mode