## ADDED Requirements

### Requirement: Explicit local persistent catalog source

The system SHALL recognize server-only `PHOTOGIFT_PRODUCT_SOURCE=local_persistent` as a separately explicit Catalog read source only in recognized development/test runtimes. It SHALL resolve synthetic Product, Category, Variant/SKU/options, public asset metadata, customization definitions, fulfillment configuration, authoritative prices, and relevant rule versions from the independent Docker local Supabase project's isolated local commerce namespace through existing provider-neutral read contracts. Required Catalog/configuration and commerce authorities, including persistent Cart, Checkout and its synthetic shipping/coupon rules, and any required Upload/Order/Auth boundaries, MUST use the same verified loopback project identity and database marker. Staging, production, unknown environments, non-local targets, missing configuration, mismatched project/mode, and unavailable database authority MUST fail closed before fallback business reads. The source MUST NOT fall back to hardcoded products, `fixture`, memory Admin Catalog, legacy tables, another project, or a hosted provider.

Existing production Supabase authority, the default `supabase` source, explicit development/test `fixture` behavior, and production fixture rejection SHALL remain unchanged. Offline fixture tests MUST remain database-free. Source selection MUST remain server-controlled and MUST NOT implicitly activate Cart, Checkout, Auth, Upload, Order, or Admin. This source SHALL provide reads only, not persistent Catalog CRUD, an editor API/UI, or a public seed/price-write endpoint. Synthetic setup and controlled drift tests MAY populate/change the isolated namespace only through separately authorized local harness setup. Existing explicitly fake Admin Catalog commands SHALL remain process-memory-only and MUST NOT change persistent purchase authority. Local catalog evidence MUST NOT approve production backfill, complete C1/Phase C, or change legacy Order/normalized-request stop gates.

#### Scenario: Explicit persistent catalog reads from the selected local project
- **WHEN** development/test explicitly selects `PHOTOGIFT_PRODUCT_SOURCE=local_persistent` with verified loopback endpoints, project identity, and database marker matching the required commerce authorities
- **THEN** public selection and configured-item resolution read synthetic authoritative Catalog/configuration facts from that project's database and identify their development/test-only scope

#### Scenario: Persistent catalog environment or authority is unsafe
- **WHEN** the source is selected in staging/production/unknown runtime or uses a remote/mismatched project, mixed memory commerce authority, missing configuration, or an unavailable database
- **THEN** the affected read fails with a bounded configuration/unavailable result without hardcoded, fixture, Admin memory, legacy, or alternate-provider fallback

#### Scenario: Production Supabase and explicit fixture behavior remain unchanged
- **WHEN** a supported production path uses the default or explicit `supabase` source, or an offline development/test path explicitly selects `fixture`
- **THEN** the existing production Supabase authority or deterministic database-free fixture behavior remains in force, production fixture selection is still rejected, and neither source silently selects `local_persistent`

#### Scenario: Catalog selection does not activate other capabilities
- **WHEN** the local persistent Product source is selected without independently enabling Checkout, Cart, Upload, Auth, Order, or Admin
- **THEN** those boundaries retain their own existing source-selection behavior and are not implicitly activated by Catalog access

#### Scenario: Persistent catalog has no CRUD surface
- **WHEN** an Admin uses an existing explicitly fake Catalog editor or a browser attempts to seed or change persistent Product/price/configuration records
- **THEN** fake editor changes remain memory-only and the browser receives no persistent Catalog write authority or new CRUD endpoint; only separately authorized isolated test setup may change synthetic records

## MODIFIED Requirements

### Requirement: Supabase migration management contract

The repository SHALL document one canonical migration workflow for future Supabase PostgreSQL business-schema changes, including ordered migration naming, local or test verification expectations, deployment ordering, rollback or forward-fix guidance, and handling of the current flat SQL bootstrap files. The original engineering-foundation change MUST NOT create a future Product/SKU business migration; its no-feature-migration completion contract remains scoped to that foundation change. Production business-schema migrations SHALL continue to use canonical `supabase/migrations/`, with reviewed ordered names and explicit reconciliation against the actual approved target rather than assuming the legacy flat bootstrap is its baseline.

The separately approved planning scope of `complete-local-commerce-persistence` SHALL permit an isolated migration workflow only under the independent `local/commerce/` Supabase workdir for this change's synthetic `local_commerce` namespace and restricted supporting RPC/Storage policies. Its migrations MUST be ordered, version-controlled, tracked by an independent migration ledger with checksums, and verified against the identity-checked independent local project, with rollback or forward-fix guidance. Already-applied migrations MUST be identified by that ledger rather than requiring arbitrary repeated execution of raw CREATE SQL. Initial setup and reconstruction MUST use only synthetic seed data and the retained-development/disposable-test safety gates. This local exception MUST NOT replace production canonical `supabase/migrations/`, modify or execute the old root reset/seed/bootstrap as an assumed safe baseline, inspect/copy existing customer data, mutate legacy `orders/order_items`, or approve/complete the still-unapproved C1 backfill or Customization Phase C migration/reconciliation scope. The normalized `/api/orders` 503 and incompatible legacy-path stop gates MUST remain in force. Planning completion MUST NOT authorize applying migrations, remote link/db push, deployment, or production provider activation; later local implementation requires its own execution and safety checks.

#### Scenario: Later change needs a business schema update
- **WHEN** a later approved OpenSpec change introduces a Supabase schema modification
- **THEN** its implementation follows the documented canonical migration workflow rather than adding an unordered standalone SQL script

#### Scenario: Foundation change is applied
- **WHEN** this foundation change completes
- **THEN** no Product/SKU, configurable-catalog, authentication, shipping, preview, or other future-feature business migration has been created

#### Scenario: Independent local commerce migration uses its own ordered ledger
- **WHEN** later implementation of this change verifies migrations against a safely identified independent local development/test project
- **THEN** only this change's synthetic namespace and restricted supporting policies are evolved through its ordered `local/commerce/` workflow, with ledger/checksum, permissions/constraints, and rollback or forward-fix evidence; production canonical migration management remains unchanged

#### Scenario: Rerun and disposable reconstruction are distinct from retained-data recovery
- **WHEN** the isolated migration workflow is rerun or an explicitly authorized current-run disposable test project is reconstructed
- **THEN** the ledger prevents duplicate migration application, reconstruction first verifies loopback/project/database marker and disposable-run authorization, and no retained development or old root project is reset or seeded

#### Scenario: Local verification does not approve production migration or backfill
- **WHEN** isolated Catalog, commerce schema, and synthetic seed verification succeeds
- **THEN** that evidence neither reconciles nor migrates the old business database, leaves C1/Phase C unapproved work and normalized `/api/orders` 503 stopped, and does not replace `supabase/migrations/` or imply production deployment permission