## MODIFIED Requirements

### Requirement: Shared existing-domain contracts

The existing Product, Cart, Customization, Upload, Order, and Payment concepts SHALL each have a shared typed contract that can be consumed by UI, server/application logic, and integration adapters without importing UI state or provider-specific response types into the domain contract. The original engineering-foundation change MUST NOT add future SKU, shipping-rule, production-preview, authentication, or payment-provider behavior to those contracts. That extraction-only restriction remains scoped to the original foundation work; `integrate-auth-payments-transactional-email` SHALL permit its explicitly planned provider-neutral Auth, Money, PaymentQuote, PaymentAttempt, payment/refund, verified-order-claim and transactional-email ports and adapter code to be implemented and verified in A/B without production activation or canonical business wiring approval. Unrelated SKU, shipping-rule and production-preview behavior remains deferred to its separately approved scope; this exception MUST NOT silently implement other changes or weaken their gates.

#### Scenario: UI and server use the same contract
- **WHEN** an existing domain payload crosses from storefront code to an existing server route
- **THEN** both sides validate or type the payload against the same shared domain contract rather than maintaining incompatible local duplicates

#### Scenario: Provider shape changes internally
- **WHEN** an integration adapter maps a Supabase or Stripe response into an existing domain concept
- **THEN** provider-specific fields remain inside the adapter boundary and the shared domain contract remains provider-neutral

#### Scenario: Future behavior is encountered during extraction
- **WHEN** implementation identifies a missing SKU, multi-image, shipping, authentication, or production-preview field required only by a later approved change
- **THEN** the field is recorded as deferred and is not silently introduced by this foundation change

#### Scenario: Approved adapter contracts are implemented without production activation
- **WHEN** later implementation follows the A/B scope of `integrate-auth-payments-transactional-email`
- **THEN** its provider-neutral contracts and real protocol adapter code may be implemented and independently tested while production activation, canonical D wiring and unrelated deferred behavior remain gated

### Requirement: Supabase migration management contract

The repository SHALL document one canonical migration workflow for future Supabase PostgreSQL business-schema changes, including ordered migration naming, local or test verification expectations, deployment ordering, rollback or forward-fix guidance, and handling of the current flat SQL bootstrap files. The original engineering-foundation change MUST NOT create a future Product/SKU business migration; its no-feature-migration completion contract remains scoped to that foundation change. Production business-schema migrations SHALL continue to use canonical `supabase/migrations/`, with reviewed ordered names and explicit reconciliation against the actual approved target rather than assuming the legacy flat bootstrap is its baseline.

The separately approved planning scope of `complete-local-commerce-persistence` SHALL permit an isolated migration workflow only under the independent `local/commerce/` Supabase workdir for that change's synthetic `local_commerce` namespace and restricted supporting RPC/Storage policies. Its migrations MUST be ordered, version-controlled, tracked by an independent migration ledger with checksums, and verified against the identity-checked independent local project, with rollback or forward-fix guidance. Already-applied migrations MUST be identified by that ledger rather than requiring arbitrary repeated execution of raw CREATE SQL. Initial setup and reconstruction MUST use only synthetic seed data and the retained-development/disposable-test safety gates. This local exception MUST NOT replace production canonical `supabase/migrations/`, modify or execute the old root reset/seed/bootstrap as an assumed safe baseline, inspect/copy existing customer data, mutate legacy `orders/order_items`, or approve/complete the still-unapproved C1 backfill or Customization Phase C migration/reconciliation scope. The normalized `/api/orders` 503 and incompatible legacy-path stop gates MUST remain in force. Planning completion MUST NOT authorize applying migrations, remote link/db push, deployment, or production provider activation; later local implementation requires its own execution and safety checks.

`integrate-auth-payments-transactional-email` SHALL additionally permit an isolated ordered, version-controlled migration workflow under its independent `local/service-integrations/` Supabase workdir, solely for its synthetic `service_integrations` namespace, restricted RPC/permissions and integration session/payment/outbox store. It SHALL use its own migration ledger/checksums, verified loopback/project/ports/schema marker/current-run ownership, synthetic seeds and rollback or forward-fix evidence. It MUST remain separate from root legacy and `local/commerce/` projects, retain development volumes, and reset only an explicitly authorized current-run disposable test project. Neither isolated workflow SHALL replace or become a second production canonical workflow. Canonical business migrations and D bridges remain subject to approved target reconciliation, authorization and payment/order/outbox atomicity; no local migration evidence approves C1, Phase C, remote push, deployment or live activation. Before apply/sync/archive, this full migration requirement SHALL be three-way reconciled with current main and the earlier persistence delta, preserving all earlier scenarios and isolation guarantees without modifying the earlier file in this planning round.

The retained foundation-completion scenario refers to the original foundation change. The retained independent-local-commerce scenarios refer only to `complete-local-commerce-persistence`; their references to “this change” MUST NOT authorize integration migrations in its workdir.

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

#### Scenario: Service integration migrations use an independent isolated ledger
- **WHEN** later authorized implementation verifies `integrate-auth-payments-transactional-email` migrations against its safely identified independent local project
- **THEN** only the `local/service-integrations/` ordered workflow evolves its synthetic namespace and restricted supporting permissions, with independent ledger/checksum and rebuild/rollback evidence, without touching root or local-commerce projects or replacing the one production canonical workflow

### Requirement: Known prototype assumptions remain visible

Known defects and prototype assumptions discovered during foundation work that are outside the original foundation change's scope SHALL be recorded as deferred work and MUST NOT be encoded in shared contracts, fixtures, or characterization tests as desired future behavior. The payment-value gap is assigned to `integrate-auth-payments-transactional-email`: its later A/B implementation SHALL implement exact amount/currency validation and the explicitly bounded Stripe legacy safety seam, rather than retain this gap as desired behavior or describe adapter code as waiting only for credentials. Production activation, approved canonical migration/wiring and unrelated cart/order or production-preview work SHALL remain deferred; no A/B adapter evidence or legacy regression test can discharge those independent gates.

#### Scenario: Out-of-scope order-item defect is encountered
- **WHEN** foundation work encounters the existing behavior that aggregates separately customized copies of the same product
- **THEN** the behavior is documented for the later cart/order change and no test asserts that aggregation as the required contract

#### Scenario: Out-of-scope production-preview claim is encountered
- **WHEN** foundation work encounters UI text or state assumptions for a production-preview workflow that is not implemented
- **THEN** the discrepancy is recorded for the production-preview change without implementing that workflow here

#### Scenario: Missing webhook payment-value verification is encountered
- **WHEN** foundation work confirms that the existing Stripe webhook does not verify the expected order amount and currency
- **THEN** the gap is recorded for the later `integrate-auth-payments-transactional-email` change and no new payment-validation behavior is implemented by this foundation change

#### Scenario: Adapter implementation and production deferral are reported separately
- **WHEN** payment-validation adapter code has current A/B evidence but canonical or production prerequisites are unapproved
- **THEN** documentation records the implemented safety behavior and remaining C/D/production blockers separately, retains unrelated deferred scope and never promotes historical test counts to current evidence