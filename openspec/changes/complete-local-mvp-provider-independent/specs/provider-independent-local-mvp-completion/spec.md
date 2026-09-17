## Purpose

Defines the provider-independent behavior and evidence required to close the 59 frozen Local MVP engineering gaps while preserving accepted commerce authority, privacy, persistence, and lifecycle contracts.

## ADDED Requirements

### Requirement: Frozen engineering scope is exact and traceable
The change SHALL implement exactly the 59 `ENGINEERING` IDs frozen in `docs/local-mvp-gap-audit.md`. Every ID SHALL have exactly one primary implementation task, SHALL target `DONE`, and SHALL retain any applicable owner-input gate without reclassification.

#### Scenario: Traceability is complete
- **WHEN** the planning or completion traceability is mechanically inspected
- **THEN** all 59 frozen IDs are present exactly once as primary ownership, with no Provider, Phase 2, Owner Configuration, Owner Policy, quality-hardening, optional-extension, or non-software item included as implementation scope

#### Scenario: Owner input is missing
- **WHEN** an Engineering task requires an owner decision that has not been supplied
- **THEN** that task remains present and blocked with the exact decision identified, and the system does not invent a business value or mark the audit ID complete

### Requirement: Configuration boundaries remain safe and explicit
The system SHALL provide fail-closed environment/configuration composition and a restricted Admin settings surface for an explicitly approved allowlist of non-secret values. Provider credentials and security secrets SHALL remain server-only and outside browser state and source control.

#### Scenario: Unsupported or mixed environment
- **WHEN** configuration identifies production, staging, unknown, remote, mixed-project, or otherwise unapproved composition
- **THEN** local provider-independent authorities fail closed without falling back to browser, fixture, or process-memory authority

#### Scenario: Admin edits an allowlisted setting
- **WHEN** a freshly authorized Admin updates an approved non-secret setting with the expected version
- **THEN** the system persists an audited versioned update and rejects stale, non-allowlisted, credential, or cross-project writes

### Requirement: Customization rules and purchase facts are server authoritative
The system SHALL support server-priced customization surcharges, single-select, bounded multi-select, numeric, and safe generic-file fields; server-authoritative conditional-required and conditional-visibility rules; and restricted Admin editing for approved field/rule types. Accepted configuration revisions, normalized values, and surcharge allocations SHALL be immutable purchase facts.

#### Scenario: Valid configured item is purchased
- **WHEN** authoritative Product options and customization rules accept a submitted configured item
- **THEN** Cart, Checkout, and Order preserve the exact configuration revision, normalized values, file/receipt facts, and server-calculated surcharge allocation

#### Scenario: Browser forges or uses stale rules
- **WHEN** the browser submits hidden values, forged surcharges, stale rule versions, invalid option combinations, cyclic dependencies, or out-of-bounds values
- **THEN** the system rejects the configured item without mutating Cart or Order authority

### Requirement: Photo guidance uses bounded provider-neutral inspection
The system SHALL provide measurable clarity, blur, pose/side-face, occlusion, and configured person-count guidance through a provider-neutral inspection boundary. Product-specific upload requirements and approved example media SHALL be presented without making browser analysis authoritative.

#### Scenario: Inspection produces guidance
- **WHEN** trusted inspection evaluates a valid private image under an approved Product configuration
- **THEN** the customer receives bounded warning/pass guidance with recorded rule/threshold version and no disclosure of private object locators

#### Scenario: Inspection is unavailable or inconclusive
- **WHEN** inspection cannot safely decide or produces an inconclusive result
- **THEN** the system follows the approved warning-versus-rejection policy, reports a bounded state, and does not fabricate a result or accept browser-computed image facts as authority

### Requirement: Payment reliability groundwork is durable and provider neutral
The system SHALL support an authorized provider-neutral refund lifecycle and a durable provider-neutral webhook inbox with deduplication, ordering, reconciliation, restart recovery, and idempotent replay using local fixtures only.

#### Scenario: Refund command is replayed
- **WHEN** the same authorized refund action and normalized context is submitted more than once
- **THEN** the system returns the original durable result without duplicating the refund effect, and conflicting same-key context is rejected

#### Scenario: Webhook delivery is duplicated or out of order
- **WHEN** local signed fixture events arrive duplicated, delayed, out of order, or across a process restart
- **THEN** the durable inbox preserves all evidence, applies only legal canonical transitions, and supports bounded reconciliation without invoking a real payment provider

### Requirement: Promotions are durable, composable, and server calculated
The system SHALL support fixed-amount, free-shipping, constrained, registration-welcome, threshold, quantity, holiday, digital-add-on, and explicitly eligible abandoned-cart coupon capabilities; restricted Admin management; owner-scoped account projection; and authoritative PDP promotion-price projection. Coupon and discount totals SHALL be server calculated.

#### Scenario: Coupon has a non-applicable terminal evaluation
- **WHEN** a coupon is invalid, expired, exhausted, outside its Product/country/user constraints, or not applicable
- **THEN** the system returns an explicit bounded evaluation with zero discount where the existing Checkout contract permits continuation and never trusts a browser discount amount

#### Scenario: Concurrent redemption reaches a limit
- **WHEN** multiple authorized requests race for the last allowed redemption
- **THEN** durable server authority grants at most the allowed count, preserves exact allocation facts in the Order snapshot, and returns bounded conflict/unavailable outcomes for losers

### Requirement: Shipping rules are versioned and reflected safely
The system SHALL support server-owned product-type, weight, quantity, and free-shipping-threshold rules; restricted Admin configuration; and PDP production/shipping range and explanation projections. The system SHALL not call a carrier or promise an exact arrival date.

#### Scenario: Checkout evaluates shipping
- **WHEN** an eligible destination and Cart are evaluated under a current shipping-rule version
- **THEN** the system calculates method, amount/currency, bounded display range, and allocation from authoritative Product/Cart facts and snapshots the applied rule version

#### Scenario: Rule facts are stale or unavailable
- **WHEN** the expected shipping version is stale or authority cannot safely determine eligibility or amount
- **THEN** Checkout fails closed without using browser weight, quantity, method, amount, or ETA claims

### Requirement: Customer ownership and privacy operations remain explicit
The system SHALL provide member Order history/detail, account profile and sign-in compatibility routes, safe coupon projection, a secure verified-identity guest-Order claim contract, authenticated deletion requests, and an idempotent retention/erasure executor. Email text alone SHALL never authorize an Order claim.

#### Scenario: Verified customer claims an eligible guest Order
- **WHEN** a fresh verified identity satisfies the approved claim policy and exact guest Order authority
- **THEN** the claim commits atomically with audit and ownership continuity, while unrelated Orders, Drafts, media, and guest resources remain unchanged

#### Scenario: Erasure respects retained legal facts
- **WHEN** an authorized deletion request becomes executable
- **THEN** the system erases eligible personal data, preserves only explicitly approved retained facts with reason/version, supports retry after failure, and exposes a safe status without leaking other owners

### Requirement: Admin operations use canonical commands and safe projections
The system SHALL provide restricted pricing, coupon, shipping, settings, Order filtering/detail, canonical lifecycle commands, safe aggregate reporting, and quality redo/remake operations. Admin surfaces SHALL NOT permit arbitrary lifecycle/status writes.

#### Scenario: Admin performs a legal command
- **WHEN** a freshly authorized Admin submits an allowlisted command with expected version and idempotency context
- **THEN** the system applies the canonical transition atomically, records bounded audit, and returns an exact safe projection

#### Scenario: Admin attempts an illegal or stale mutation
- **WHEN** the request changes an arbitrary status, violates lifecycle rules, uses stale version, or lacks authorization
- **THEN** the system rejects with zero business mutation and no credential or private-data disclosure

### Requirement: Messaging and analytics groundwork is durable and privacy safe
The system SHALL provide durable transactional-email intents/outbox state without sending real email; server-confirmed upload-success events; exactly one canonical purchase event per paid Order; and safe upload/payment/preview error events. Provider adapters SHALL remain disabled.

#### Scenario: Producer transition and outbox/event write commit
- **WHEN** a canonical business transition produces an email intent or analytics event
- **THEN** the business fact and durable producer binding commit with stable deduplication so restart or replay cannot create duplicate logical output

#### Scenario: Dispatch or analytics provider is unavailable
- **WHEN** no real email or analytics provider is configured
- **THEN** durable local state remains inspectable and recoverable, no external call occurs, and the system does not report provider delivery

### Requirement: Customer-facing completeness is Catalog-backed and truthful
The system SHALL provide per-product social share-image fallback, meaningful non-decorative alt enforcement, Product/Offer structured metadata, an accessible Home before/after surface, explicit production-preview requirement, and Product-context PDP FAQ. Missing owner assets or copy SHALL remain an explicit readiness blocker rather than fabricated production content.

#### Scenario: Product metadata is rendered
- **WHEN** an available Catalog Product is rendered
- **THEN** share metadata, alt descriptions, Product/Offer structured data, preview requirement, and FAQ use safe authoritative Product/configuration facts and valid fallbacks

#### Scenario: Required launch content is missing
- **WHEN** a required non-decorative description, paired before/after asset, example, or FAQ content is absent
- **THEN** readiness reports the missing owner input and the system does not invent testimonial, result, shipping, price, or product claims

### Requirement: Existing commerce authority and migration history are preserved
All new capabilities SHALL compose through existing server-only authorization, version/CAS, idempotency, immutable snapshot, RLS/RPC, and private Storage boundaries. Migrations `0001`–`0037` SHALL remain byte-immutable; schema-bearing implementation SHALL use ordered migration `0038` or later with checksum, rollback/forward-fix, and isolated local acceptance.

#### Scenario: New command intersects an existing aggregate
- **WHEN** a new capability mutates Cart, Order, Payment, Fulfillment, media, customer, or configuration state
- **THEN** it uses the existing canonical command boundary and atomic persistence rules rather than browser authority, parallel business authority, fallback, or best-effort dual write

#### Scenario: Migration is required
- **WHEN** an implementation task proves a durable schema change is necessary
- **THEN** it adds a coherent ordered migration at `0038` or later, leaves `0001`–`0037` unchanged, and obtains checksum/security/real local database evidence before completion

### Requirement: Completion requires independent evidence for all 59 gaps
No phase or audit ID SHALL be considered complete solely because code compiles. Completion SHALL require focused task evidence, phase gates, preservation of baseline quality checks, and a final mechanical 59/59 traceability audit.

#### Scenario: Phase gate is evaluated
- **WHEN** all implementation tasks in a phase appear complete
- **THEN** focused domain, authorization, persistence/restart, concurrency/replay, fault, and rendered/browser evidence applicable to that phase must pass before its IDs are marked `DONE`

#### Scenario: Final Local Engineering Gate is evaluated
- **WHEN** the change is proposed for completion
- **THEN** all 59 IDs have accepted evidence, lint/typecheck/offline/build/rendered/verify/OpenSpec strict/diff checks pass without silently lowering baselines, migration integrity passes, and excluded Provider/Phase 2/owner-readiness work remains truthfully separate
