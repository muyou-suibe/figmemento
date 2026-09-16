## Purpose

Automatically associate eligible historical guest business orders with a Supabase customer who freshly proves the same verified email, while preserving project isolation, unique ownership, existing guest capabilities, and the strict exclusion of simulated local commerce data.

## ADDED Requirements

### Requirement: Fresh provider verified-email eligibility

The system SHALL automatically associate eligible historical guest orders after a successful explicitly test-gated Supabase login, without requiring an additional guest cookie or a second identity challenge after fresh provider proof. Each association attempt SHALL obtain fresh server-side `getUser` evidence from the approved Supabase project, bind it to the authenticated provider subject and valid BFF session, and require a provider-confirmed email. This applies equally to numeric email OTP and Google identities. Google user metadata, OAuth success alone, browser email, a public order ID, an old verified JWT/email snapshot, and an email typed during checkout MUST NOT substitute for current verified-email proof. Email comparison SHALL trim and consistently case-normalize both addresses, without stripping plus-tags, removing Gmail dots, or fuzzy matching. Proof SHALL be attempt-bound and short-lived; a later retry requires a new provider read, not reuse of an old proof as durable claim authority.

#### Scenario: OTP customer without guest cookie
- **WHEN** a Supabase OTP customer has fresh confirmed-email proof matching eligible unowned business orders but has no guest cookie
- **THEN** those eligible orders are automatically associated without requesting an extra cookie or another email challenge

#### Scenario: Google exact verified-email match
- **WHEN** a Google-authenticated Supabase subject has a freshly confirmed email exactly matching the normalized order contact email
- **THEN** eligible same-project unowned orders are automatically associated without a second challenge

#### Scenario: Google email is missing unverified or different
- **WHEN** Google authentication succeeds but the fresh provider email is missing, unverified, or differs from the order email after allowed normalization
- **THEN** authentication alone grants no ownership or access to that order

#### Scenario: Browser order ID and email are insufficient
- **WHEN** a caller submits a matching email and order reference without fresh provider-confirmed identity
- **THEN** no association is committed and the response does not disclose another customer's order existence or private data

#### Scenario: Alias address mismatch
- **WHEN** the verified email differs from the order email by a plus-tag or Gmail dot placement
- **THEN** the addresses do not match and no automatic association occurs

### Requirement: Approved canonical order boundary

An eligible order SHALL belong to the same explicitly approved application/project/environment as the Supabase customer, have a valid server-owned normalized contact email matching fresh proof, have no existing customer owner, and be admitted by an approved canonical business-order adapter. Orders from another project/environment, ambiguous legacy data, or unapproved authorities MUST NOT be searched or claimed. `local_fake` and `local_persistent` simulated orders and identities MUST NOT be migrated, relabeled, backfilled, or treated as canonical business orders, even if their email matches. Fake/local-persistent passwords, sessions, customer subjects, and local queued notifications MUST remain separate. This change MUST NOT reopen C1/Customization Phase C, apply remote migrations, or treat legacy normalized order routes as a working canonical authority.

#### Scenario: Eligible approved order
- **WHEN** the approved adapter supplies a same-project unowned business order with a matching server-owned contact email
- **THEN** the order is eligible for transactional association to the freshly verified provider subject

#### Scenario: Cross-project or simulated order
- **WHEN** an order has a matching email but belongs to another project, local fake/local-persistent simulation, or an unapproved legacy source
- **THEN** it is excluded without querying or changing that source's ownership or issuing order access

#### Scenario: Existing owner is authoritative
- **WHEN** an order already has a customer owner, whether or not its current contact email matches another verified customer
- **THEN** automatic association never overwrites that owner or grants access to the other customer

### Requirement: Atomic unique ownership and claim audit

The authoritative order store SHALL enforce at most one customer owner per order and commit a conditional unowned-to-owned update and its immutable claim event in one transaction. The claim event SHALL identify the project, canonical order, provider subject, association reason, proof timestamp/reference, and audit time without retaining provider tokens or OTPs. Idempotency SHALL be enforced by durable uniqueness for the order's ownership claim, not by browser state, in-memory locks, or a batch-only key. Repeated association for the same already-linked subject SHALL be a no-op success; competing claims MUST NOT overwrite ownership. If the ownership write and claim event cannot commit together, neither SHALL be treated as completed. Batch association MAY be processed per order, but each order SHALL retain this atomicity and per-order outcome.

#### Scenario: Concurrent duplicate association
- **WHEN** the same verified subject retries or two workers attempt to associate the same eligible order
- **THEN** exactly one ownership transition and one claim event commit and subsequent attempts observe the existing same-subject result

#### Scenario: Competing subjects
- **WHEN** two eligible association attempts for different subjects race for the same unowned order
- **THEN** at most one wins the authoritative conditional claim and the other receives no ownership or access

#### Scenario: Transaction failure
- **WHEN** ownership or claim-event persistence fails before commit
- **THEN** the entire per-order transaction rolls back and no successful association or partial audit-only ownership is reported

#### Scenario: Crash after commit
- **WHEN** a worker crashes after committing the claim but before returning success
- **THEN** retry detects the durable existing ownership and claim event without creating another event or switching the owner

### Requirement: Successful authentication with pending association

Authentication and association SHALL expose separate outcomes. A valid provider login and durably committed BFF session MAY succeed when the approved order adapter, database, or fresh-email provider lookup is temporarily unavailable, but the system SHALL report association as pending/unavailable and MUST NOT manufacture order history or access. Automatic retry after recovery SHALL occur only after a new successful fresh provider verified-email read for a still-valid app session and the same project/subject, followed by eligibility re-evaluation. A durable pending marker or previously matching browser email MUST NOT grant authority to claim in a background job without fresh proof. Noneligible or already owned orders SHALL remain excluded rather than repeatedly treated as transient failures.

#### Scenario: Login succeeds while association fails
- **WHEN** login and app-session persistence succeed but order association cannot reach its authority
- **THEN** the customer is signed in with an explicit pending association state and has no access to unclaimed orders

#### Scenario: Automatic retry after fresh proof
- **WHEN** the next authorized automatic retry obtains new `getUser` confirmed-email proof and the approved order authority is available
- **THEN** eligibility is rechecked and matching unowned orders are claimed idempotently without another user challenge

#### Scenario: Stale proof or revoked session on retry
- **WHEN** a pending retry has only old proof, a revoked session, or an unavailable fresh provider lookup
- **THEN** it remains unclaimed/pending or stops safely and cannot authorize from the pending marker

### Requirement: Stable ownership after email change

Committed ownership SHALL bind to the project-scoped opaque provider subject rather than a mutable email address. Changing or removing a customer's email MUST NOT transfer, detach, or reassign previously linked orders to another account using the old email. New automatic association attempts SHALL use only the customer's new freshly verified email and MUST NOT use previous emails or move existing owners. Resolving disputed ownership or merging accounts SHALL require separately approved policy outside this automatic flow.

#### Scenario: Owner changes email
- **WHEN** a customer changes their verified email after orders were associated
- **THEN** previously linked orders retain the same opaque owner and new claims consider only the current fresh verified email

#### Scenario: Another customer acquires old email
- **WHEN** a different provider subject later verifies the previous owner's old email
- **THEN** already-owned historical orders remain with the original subject and are not transferred or exposed

### Requirement: Order-only authorization and guest continuity

Association SHALL change only eligible order ownership and its audit record; it MUST NOT merge guest carts, drafts, independent uploads, or local simulated commerce data, delete guest cookies, create admin privileges, or rewrite purchased product/SKU/price/customization snapshots or distinct configured line items. Existing guest capability signatures, expiry, issuance, and verification SHALL remain authoritative for guest access; the Supabase verified-email association is the sole alternate route to eligible member order access, not a general replacement by customer cookie/email. Subsequent order, media, preview, and digital-delivery reads SHALL recheck committed ownership and resource-specific policies. A notification's approved protected-page URL MUST NOT itself authorize private content: absent an original valid guest capability, the page SHALL offer secure sign-in followed by fresh verified-email eligible association, without exposing data before success or demanding an additional guest cookie after proof.

#### Scenario: Claim leaves guest context and line items intact
- **WHEN** an eligible order with multiple differently configured copies of the same product is associated
- **THEN** line items and their purchased snapshots stay separate and unchanged, and guest cart/draft/upload cookies and independent ownership remain intact

#### Scenario: Guest follows protected email link without capability
- **WHEN** a guest opens an approved order page link without an original valid guest capability
- **THEN** no private order content is shown until secure sign-in and eligible fresh verified-email association establish member access, without an extra guest-cookie or second-challenge requirement

#### Scenario: Nonowner or admin endpoint access
- **WHEN** a different customer guesses a claimed order reference or a customer requests an admin endpoint
- **THEN** authorization denies access without disclosing private content or granting admin rights

### Requirement: Evidence and overlapping-delta handoff

Acceptance SHALL separate A offline contract/harness evidence, B isolated transactional database/concurrency evidence, C authorized Supabase test-provider proof, and D approved canonical order business wiring. With no approved real canonical order authority/producer, synthetic harness claims SHALL demonstrate only the isolated contracts, D SHALL remain blocked, and the system MUST NOT claim actual historical business orders are connected. The handoff SHALL rebase this change's customer-auth delta and `complete-local-commerce-persistence`'s customer-auth delta against the then-current main spec before integration/archival, retaining the latter's no local guest migration semantics while making this Supabase-only exception explicit. The earlier change SHALL remain unmodified in this planning round; no test/live service access, remote migrations, deployment, or code execution is authorized by these acceptance scenarios.

The earlier added `Durable membership does not claim guest commerce` requirement is absent from current main and MUST NOT be emitted as MODIFIED in this change. Its concrete future rebase target sentence SHALL be: “This requirement's prohibition on claiming, merging, transferring or relabeling guest commerce applies to `local_fake`/`local_persistent` identities and all simulated local commerce data; the sole exception outside that local scope is automatic association by a Supabase identity with fresh provider verified-email proof of eligible same-project, unowned, approved canonical business orders under `verified-guest-order-association`, never of local simulated data or independently owned carts, drafts, uploads or capabilities.” Future three-way merging SHALL retain the complete requirement's local creation-time identity binding, durable authorization, guest capability rules, isolated namespace and legacy/C1/Phase C restrictions. It SHALL preserve all three original scenarios — `Member Order survives restart with its owner`, `Guest and member emails match`, and `Session changes leave guest cookies intact` — in full, explicitly scoped to local modes/simulated data, rather than deleting the matching-email scenario to allow Supabase business claims. Re-read current main plus both active deltas regardless of landing order, reconcile their complete runtime/HTTP/handoff/ownership blocks, and add the narrow Supabase exception without last-writer overwrite. This sentence is a future merge target only, not permission to edit the earlier file now.

#### Scenario: Harness is not business wiring
- **WHEN** isolated synthetic claims pass but no canonical order adapter has been approved and connected
- **THEN** A/B evidence is labeled as such and D is blocked rather than reported as automatic association of real business history

#### Scenario: Overlapping local membership restriction
- **WHEN** both auth deltas are prepared for application after local persistence changes the main spec
- **THEN** both deltas and current main are three-way merged using the explicit future target sentence, retaining all three original durable-membership scenarios and their local-only no-migration scope, with the verified-email exception confined to Supabase approved business orders