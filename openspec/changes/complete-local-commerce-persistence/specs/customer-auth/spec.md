## MODIFIED Requirements

### Requirement: Explicit customer auth runtime modes

The system SHALL support `disabled`, `local_fake`, and `local_persistent` customer-auth source modes. `local_fake` SHALL retain its development/test-only process-memory behavior and production rejection. `local_persistent` SHALL be permitted only in development and test against the explicitly selected independent Docker local Supabase project's PostgreSQL, and MUST be rejected in production and staging. An absent or disabled source SHALL never silently authenticate a customer. Missing configuration, database failure, or another authority using a different local project MUST fail closed without selecting fake users, another database, or a production provider.

#### Scenario: Disabled customer auth
- **WHEN** customer auth source is disabled or unavailable
- **THEN** auth operations return a safe unavailable/not-enabled result and do not create a session

#### Scenario: Development fake auth
- **WHEN** source is `local_fake` in development or test
- **THEN** local customer auth operations are available without remote provider access

#### Scenario: Production fake-auth rejection
- **WHEN** source is `local_fake` in production
- **THEN** the application rejects the configuration and does not authenticate anyone

#### Scenario: Explicit persistent test identity
- **WHEN** source is `local_persistent` in development/test with a valid independent local project
- **THEN** local test identity and session operations use that project's authoritative local commerce state without activating production Supabase Auth

#### Scenario: Persistent source is forbidden or unavailable
- **WHEN** `local_persistent` is selected in staging/production, targets a non-local project, has inconsistent commerce project identity, or its database is unavailable
- **THEN** authentication fails closed with a bounded result and does not authenticate through `local_fake` or a different source

### Requirement: Customer auth HTTP surface

The system SHALL provide POST sign-up, POST sign-in, POST sign-out, and GET current-session operations under a customer-auth route namespace. Successful responses SHALL contain only safe identity/session projections. Sign-out SHALL revoke the current customer session and expire only the customer session cookie; there SHALL be no GET sign-out operation. In `local_persistent`, successful revocation MUST be durable before success is reported; an unavailable revocation store MUST NOT be reported as successful server-side revocation.

#### Scenario: Successful sign-in and session read
- **WHEN** a local customer signs in and then requests the current session
- **THEN** the session read reports that customer as authenticated without returning the session token

#### Scenario: Sign-out
- **WHEN** an authenticated customer submits the sign-out mutation in `local_fake`
- **THEN** the current fake session is revoked and subsequent session reads are unauthenticated

#### Scenario: Invalid session
- **WHEN** a session cookie is missing, unknown, or revoked
- **THEN** current-session access returns unauthenticated state without disclosing session internals

#### Scenario: Persistent sign-out survives restart
- **WHEN** an authenticated persistent customer signs out successfully and the application restarts
- **THEN** the previously issued session remains revoked and cannot authorize account or commerce access

#### Scenario: Revocation persistence fails
- **WHEN** the persistent session authority cannot commit revocation
- **THEN** sign-out returns a bounded unavailable/failure result without claiming durable revocation or switching to fake session state

### Requirement: Production handoff remains explicit

The foundation SHALL document the future Supabase Auth adapter requirements, narrow staging/production Site URL and Redirect URL dependencies, deferred OAuth/Google, OTP, email verification, password reset, rate limiting, and guest-to-customer transition gates. It SHALL NOT activate a production provider, production callback, social login, email delivery, or production database-backed customer profile. The sole new database-backed identity exception SHALL be explicitly non-production test accounts and sessions in the independent local commerce namespace for `local_persistent`; `local_fake` remains process-memory only. This exception MUST NOT be represented as production Supabase Auth, production credential readiness, or approval of remote migrations.

#### Scenario: Future provider boundary
- **WHEN** the local foundation is reviewed for production activation
- **THEN** it reports production provider configuration as an explicit later dependency rather than treating the local fake as deployable

#### Scenario: Persistent test accounts are not production authentication
- **WHEN** durable local test accounts are demonstrated
- **THEN** documentation and UI identify them as development/test identities and leave production Auth, email, OAuth, and remote schema activation deferred

## ADDED Requirements

### Requirement: Durable local test credentials and session lifecycle

`local_persistent` SHALL preserve opaque customer identity across application restarts in the selected independent Docker local Supabase PostgreSQL project. Passwords MUST retain the existing secure salted password-hash discipline; plaintext passwords MUST NOT be stored, logged, returned, or serialized into session state. Sessions SHALL use cryptographically random opaque cookie tokens with the existing isolated cookie protections, and SHALL persist only their secure token hashes, opaque customer association, expiry, and revocation state, not raw tokens. Session reads SHALL freshly verify the durable authority, expiry, and revocation; an unavailable database MUST NOT authorize from stale process memory. Concurrent normalized-email registration MUST create at most one test identity.

#### Scenario: Restart restores a valid session
- **WHEN** the application restarts against the same local project and a browser retains its unexpired, unrevoked session cookie
- **THEN** the verified session resolves the same opaque test customer without exposing a password hash, session hash, or raw token

#### Scenario: Expired or revoked session stays invalid
- **WHEN** a persistent session has expired or been revoked before or after restart
- **THEN** it cannot authenticate the customer and is not reissued from email or browser identity claims

#### Scenario: Concurrent duplicate registration
- **WHEN** two registrations race with equivalent normalized email addresses
- **THEN** at most one customer is created and the other receives the existing normalized registration failure without overwriting credentials

#### Scenario: Account or session commit fails
- **WHEN** sign-up or sign-in cannot commit the required durable identity/session state
- **THEN** no successful authenticated result or usable session cookie is issued and provider details remain private

### Requirement: Durable membership does not claim guest commerce

New member-owned persistent Orders SHALL bind only to the server-verified opaque local customer identity at creation. Valid sessions and persisted Order authorization MUST preserve that association after restart. Sign-up, sign-in, sign-out, and email equality MUST NOT claim, merge, transfer, or relabel guest Orders, Carts, drafts, uploads, or access capabilities. Existing guest capability signatures, expiry, issuance, and verification rules SHALL remain authoritative and independent; no email, public Order reference, or Customer cookie alone SHALL substitute for guest authorization. New identity tables SHALL stay in the independent local commerce namespace and MUST NOT mutate legacy `orders/order_items`, perform C1 backfill, or activate Phase C production migration.

#### Scenario: Member Order survives restart with its owner
- **WHEN** a customer creates a persistent Order from a Cart resolved under that verified customer's ownership and later presents the original valid session and required Order authorization after restart
- **THEN** the Order still belongs to that same opaque customer and cannot be read by a different customer's session

#### Scenario: Guest and member emails match
- **WHEN** a guest Order contact email equals a newly registered or signed-in customer's normalized email
- **THEN** no ownership claim or access grant is created and the existing guest authorization remains required

#### Scenario: Session changes leave guest cookies intact
- **WHEN** a persistent customer signs in or signs out while guest Cart and draft-owner cookies exist
- **THEN** those cookies and their independent guest-owned data remain unchanged

#### Scenario: Customer session is incidental to guest purchase
- **WHEN** a valid customer session accompanies a selected Cart successfully resolved under valid guest authorization
- **THEN** the new Order remains guest-owned and the session does not create member ownership, transfer resources or grant member access
