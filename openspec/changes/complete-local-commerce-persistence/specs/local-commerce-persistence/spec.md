## Purpose

Provide a development/test-only commerce environment whose authoritative business records, private media and access grants survive application and local-stack restarts. Define isolation, safe data lifecycle, transactional behavior and verifiable acceptance boundaries without authorizing production migration or claiming production readiness.

## ADDED Requirements

### Requirement: Explicit isolated local persistent environment
The system SHALL offer `local_persistent` only in explicitly recognized development/test environments, using the user-selected independent Docker local Supabase project with PostgreSQL and private Storage. The project MUST have dedicated non-conflicting ports, an explicit project identity and a database identity marker verified against the selected environment; an ambiguous, mismatched, remote or production target MUST be refused before business access or mutation. Local Storage is a validation adapter, not approval of a production Supabase Storage or R2 decision. Existing `disabled` and `local_fake` behavior MUST remain unchanged when explicitly selected; D1 and SQLite MUST NOT become business persistence alternatives.

#### Scenario: Start the selected local project
- **WHEN** a developer selects `local_persistent` in development/test and its loopback endpoints, dedicated ports, project identity and database marker match the independently provisioned local project
- **THEN** commerce operates only against that project and visibly identifies its development/test-only scope

#### Scenario: Reject an unsafe or ambiguous target
- **WHEN** the runtime is production or unknown, an endpoint is non-loopback, a port points to another project, or project identity or database marker is absent or mismatched
- **THEN** local persistent access is refused before reading or writing business data, without silently choosing another project or mode

### Requirement: Retained development data and guarded disposable reconstruction
Normal development start and stop SHALL retain the selected project's database records and private objects. Reset/reconstruction MUST be restricted to a test project explicitly identified as disposable for the current test run, with loopback target, exact project identity and database marker all verified before any destructive action. A disposable declaration alone MUST NOT override a failed check. The repository's default root reset, old development data, remote projects and production targets MUST NOT be reset by this capability.

#### Scenario: Stop and restart without data loss
- **WHEN** a developer stops and starts the selected development stack without requesting a disposable test reset
- **THEN** existing accounts, grants, carts, drafts, orders, payment and fulfillment history, delivery quotas and private objects remain available to their authorized owners

#### Scenario: Reconstruct only this run's disposable test project
- **WHEN** an operator explicitly requests reconstruction of this run's disposable project and all target checks match
- **THEN** only that test project's isolated records and objects are reconstructed, and retained development projects and legacy data are untouched

#### Scenario: Reject reset despite a disposable label
- **WHEN** a reset names the default root project, an earlier run's project, retained development data, a remote endpoint, or a project whose database marker cannot be verified
- **THEN** the operation refuses before deletion even if a disposable label was supplied, and reports the failed safety boundary without exposing credentials

### Requirement: Independent local namespace preserves production migration gates
Local schema evolution and seed data SHALL be confined to this change's independent local namespace. Seeds MUST be synthetic and MUST NOT copy customer accounts, orders, photos, credentials or other customer data. Local verification MUST NOT alter legacy `orders` or `order_items`, approve or complete the existing C1/Customization Phase C production migration and backfill dependencies, or remove the normalized-request 503 gate on `/api/orders`. This local scope MUST NOT activate real payments, email, carrier services, OTP or Google login, or redefine the deferred production requirements for authentication, guest-order association or image-content recognition.

#### Scenario: Exercise snapshots in an isolated namespace
- **WHEN** synthetic local purchases and media attachments are persisted and verified
- **THEN** they use only the independent local namespace while legacy order data and C1/Phase C approval gates remain unchanged

#### Scenario: Keep the production checkout stop gate
- **WHEN** a normalized customization request is sent to the existing production order boundary after local persistence is enabled
- **THEN** it remains blocked by the existing 503 stop gate without order, upload-attachment or payment side effects

#### Scenario: Reject customer-data seeding
- **WHEN** initialization is offered an export of existing customer records or private customer media
- **THEN** that input is rejected rather than treated as a local fixture or approved production backfill

### Requirement: One authoritative project throughout the commerce journey
All sources participating in a `local_persistent` journey SHALL consistently use the same selected local project: local accounts and sessions, cart, catalog and SKU configuration, pricing inputs, uploads, drafts, orders and grants, simulated payments, fulfillment, supplier-facing order actions, tracking and digital delivery. Customer, administrator and local operator reads and writes MUST agree on that authority. Any enabled supporting source that affects a commerce decision MUST satisfy the same consistency rule. Missing configuration, incompatible source selections or unavailable database/Storage MUST fail closed with a safe unavailable result, never fall back to process-memory data, hardcoded catalog fixtures, legacy tables, another database or a remote provider.

#### Scenario: Observe one persisted purchase across roles
- **WHEN** a customer creates a configured cart, checks out and simulates payment, and authorized local operators review, fulfill, track or deliver its items
- **THEN** every view refers to the same persisted order, media and state transitions in the selected project

#### Scenario: Reject a mixed or unavailable composition
- **WHEN** any participating source selects `local_fake`, another project, legacy authority or an unavailable required local service
- **THEN** the affected persistent journey reports unavailable before committing partial commerce state and returns no substitute order, catalog, upload or delivery result

### Requirement: Durable local accounts and server-verified access grants
The user-selected existing local test account/password workflow and its sessions SHALL be persisted without implementing production Supabase Auth OTP or Google login. Passwords MUST NOT be stored in plaintext. Random bearer credentials for customer sessions, order capabilities and delivery tickets MUST be opaque; durable verification records MUST retain credential hashes, owner/resource scope, server-issued expiry and revocation state, rather than plaintext bearer credentials. The existing signed guest-draft-owner cookie SHALL retain its signed-context format and HMAC/server-time verification instead of being converted into an opaque hash bearer; its database records SHALL preserve only the verified owner/resource binding, lifecycle and revocation state, never the raw cookie. Signing configuration SHALL remain stable across ordinary restarts. Valid customer sessions and guest grants MUST survive application restarts. Every protected cart, draft, upload, order, fulfillment, tracking and delivery operation MUST derive ownership from verified server-side authority, not client-provided owner fields, email, order number or knowledge of an object identifier. Login MUST NOT claim guest orders by matching email.

#### Scenario: Restore a customer session and a guest grant
- **WHEN** the application is restarted and an existing customer or guest presents their original unexpired and unrevoked credential
- **THEN** the server validates the applicable persisted bearer hash or existing guest-context signature, server expiry and durable scope, and restores only that principal's authorized resources without requiring a replacement grant

#### Scenario: Reject forged or cross-user authority
- **WHEN** another user supplies a forged cookie, an altered owner identifier, a known order number, or the owner's email instead of a valid scoped credential
- **THEN** no protected records, media, mutations or download tickets are authorized, and the response does not disclose whether another user's resource exists

#### Scenario: Revoke or expire across a restart
- **WHEN** a customer logs out, a session or guest grant is revoked, or server time reaches its expiry and the application subsequently restarts
- **THEN** the old credential remains unusable; changing the browser clock or replaying the cookie cannot restore access

#### Scenario: Same email does not transfer guest ownership
- **WHEN** a user registers or signs in with the email recorded on a guest order
- **THEN** login alone does not add that order to the account or grant its media or downloads; the separately valid guest capability remains required for guest access

### Requirement: Transactional purchase and idempotent local state changes
The system SHALL revalidate authoritative cart, current catalog/SKU/configuration, upload eligibility, quantities, currency and server-derived prices, discounts, tax and shipping before creating a local order. Order header, complete immutable item snapshots, attach-once receipt bindings, order access grant and creation-idempotency result MUST commit as one database transaction or have no committed purchase effects. Equivalent retries by the same authorized principal MUST return the original order, including after restart or response loss, without consuming receipts again; changed payloads or ownership under a reused key MUST be rejected as conflicts or unauthorized requests. A successful replay MUST not depend on a receipt still being unattached or on later catalog edits. Simulated payment and consequential authoritative order-state updates, including their idempotency records, MUST be atomic and validate expected amount/currency rather than browser payment claims.

#### Scenario: Roll back a partially prepared purchase
- **WHEN** any item snapshot, receipt attachment, access grant or idempotency write fails before the order transaction commits
- **THEN** no new order or item, consumed receipt, order grant or successful creation result remains committed, and a legitimate retry can start from the preceding state

#### Scenario: Replay after losing the success response
- **WHEN** an order transaction committed but the response was lost, and the same owner retries the same request after restart or a subsequent catalog change
- **THEN** the original order and unchanged snapshots are returned without creating a second order or consuming attached receipts again

#### Scenario: Reject changed purchase input
- **WHEN** a creation key is reused with changed quantities, configuration, crop/order of images, contact or other purchase input, or by a different principal
- **THEN** the request is rejected and neither the original order nor its ownership is overwritten

#### Scenario: Concurrent simulated payment and failure
- **WHEN** equivalent simulated-payment requests reach independent application processes, or a failure occurs while persisting the payment and its order transition
- **THEN** at most one matching payment effect commits; a failure leaves neither a paid order without its payment record nor a successful payment without the corresponding order state, and replay returns the original committed result

### Requirement: Persistent fulfillment and tracking retain shared business gates
Every local customer, administrator, supplier and tracking write entry point SHALL enforce the same authoritative fulfillment rules: photo review where configured, approval of the latest required production preview, at most two customer modification requests per order, verified local paid state for gated progress, and quality check plus required preview approval before shipment. Revision counts, preview versions, decisions, audit history, shipment records and idempotency results MUST persist across restarts and be enforced across processes. Legacy interfaces MUST NOT bypass these rules for local persistent orders. Digital-only items MUST follow their delivery gates rather than an artificial shipping lifecycle.

#### Scenario: Reject a third revision and stale approval
- **WHEN** two customer modification requests have committed and a restarted application receives a third request or an approval for an older preview version
- **THEN** it refuses the request without changing revision counts or approving the current preview

#### Scenario: No alternate path around shipment gates
- **WHEN** an administrator, supplier or tracking tool attempts shipment while required photo review, latest-preview approval, payment or quality check is incomplete
- **THEN** every entry point rejects shipment and no shipment, tracking success or bypass audit result is committed

### Requirement: Separate offline evidence from real persistent integration acceptance
Acceptance SHALL report offline and local-stack integration suites separately. Offline suites MUST NOT connect to any database. Persistent acceptance MUST use the real isolated PostgreSQL/private Storage stack, independently started application processes and actual process termination/recreation, not an in-memory reset presented as a restart. It MUST demonstrate synthetic disposable reconstruction separately from retained-data recovery, cross-process concurrency, authorization rejection and fault behavior. All expiry decisions MUST use server time, with a controlled clock available for deterministic boundary verification. Missing local-stack prerequisites MUST be reported as `blocked`, not silently skipped and counted as passed. Reports MUST distinguish new-capability evidence from the full repository verification result, retain visibility of existing failures and MUST NOT claim production readiness.

#### Scenario: Prove retention with two distinct application processes
- **WHEN** process A creates synthetic accounts, grants, configured items, private media, an order and commerce history, is terminated, and process B starts against the retained project
- **THEN** process B restores the same authorized records, bytes, image order/crops, idempotency history, revision counts and delivery quota using the original credentials without recreating them from fixtures

#### Scenario: Prove concurrent behavior without process-local shortcuts
- **WHEN** two independent application processes contend for order creation, receipt attachment, payment or the last download allowance
- **THEN** their externally observed results satisfy the transaction and quota contracts using the shared project rather than independent in-memory state

#### Scenario: Report an unavailable integration environment honestly
- **WHEN** Docker, the selected database or private Storage is unavailable during persistent acceptance
- **THEN** integration acceptance is recorded as blocked with its missing prerequisite, while offline verification remains database-free and is not represented as persistent acceptance

#### Scenario: Verify expiry at controlled server time
- **WHEN** the test clock moves just before, to and after a session, guest grant or delivery expiry while the browser clock disagrees
- **THEN** the server accepts only before the expiry boundary and reports the later attempts as expired regardless of browser time