# customer-auth Specification

## Purpose

Provide a provider-neutral customer identity and session foundation that supports safe local workflow testing while preserving strict separation from admin authentication, guest ownership, orders, customization data, and production provider activation.

## Requirements

### Requirement: Provider-neutral customer identity and session

The system SHALL expose a customer identity containing only an opaque provider-owned identifier and a normalized email address. A customer session SHALL expose only authenticated state, the safe customer identity, and timing metadata when required; it MUST NOT expose passwords, access tokens, refresh tokens, JWTs, provider cookie payloads, or provider-specific session objects.

#### Scenario: Safe authenticated session projection
- **WHEN** an authenticated customer requests the current session
- **THEN** the response contains authenticated state and safe identity data only

#### Scenario: Unauthenticated session projection
- **WHEN** no valid customer session is present
- **THEN** the response reports unauthenticated state without revealing provider internals

### Requirement: Customer authentication provider port

The system SHALL define provider-neutral operations for sign-up, sign-in, session retrieval, and sign-out or session revocation. Application routes SHALL depend on this contract rather than directly coupling customer authentication behavior to a provider SDK.

#### Scenario: Provider-independent route behavior
- **WHEN** a supported customer-auth provider handles a sign-in request
- **THEN** the route returns the same normalized application result shape regardless of provider implementation

#### Scenario: Unknown provider failure
- **WHEN** a provider returns an error outside the normalized application vocabulary
- **THEN** the application returns a safe generic provider failure without raw provider details

### Requirement: Normalized customer auth inputs and errors

The system SHALL trim and consistently case-normalize customer email identity, reject malformed email input, apply bounded non-empty password input validation for the local workflow, and normalize failures into a safe vocabulary including invalid request, invalid credentials, already registered email, not authenticated, unavailable, rate limited, and provider failure states where applicable. The final production password policy SHALL remain provider/security owned.

#### Scenario: Email normalization
- **WHEN** a valid email contains surrounding whitespace or case differences
- **THEN** identity comparison and the returned safe identity use the normalized address

#### Scenario: Invalid request
- **WHEN** email or password input is missing, malformed, or outside bounded input limits
- **THEN** the request is rejected with a normalized invalid-request result

#### Scenario: Safe sign-in failure
- **WHEN** credentials cannot authenticate a customer
- **THEN** the application returns a safe sign-in failure without exposing unnecessary account-existence detail

### Requirement: Explicit customer auth runtime modes

The system SHALL support only `disabled` and `local_fake` customer-auth source modes in this foundation. `local_fake` SHALL be permitted only in development and test runtime modes. Selecting `local_fake` in production SHALL fail closed, and an absent or disabled source SHALL never silently authenticate a customer.

#### Scenario: Disabled customer auth
- **WHEN** customer auth source is disabled or unavailable
- **THEN** auth operations return a safe unavailable/not-enabled result and do not create a session

#### Scenario: Development fake auth
- **WHEN** source is `local_fake` in development or test
- **THEN** local customer auth operations are available without remote provider access

#### Scenario: Production fake-auth rejection
- **WHEN** source is `local_fake` in production
- **THEN** the application rejects the configuration and does not authenticate anyone

### Requirement: Development-only local fake customer provider

The local fake provider SHALL use synthetic process-local customer records and opaque cryptographically random session identifiers. It SHALL not make remote calls, persist a production credential system, encode customer data in session identifiers, or retain plaintext passwords in cookies, responses, logs, or serialized session results. Restarting the process SHALL clear fake users and sessions; multi-instance persistence is unsupported and SHALL be documented.

#### Scenario: Local sign-up creates a session
- **WHEN** a valid new email and bounded non-empty password are submitted in allowed local mode
- **THEN** a synthetic customer identity is created, a new opaque session is issued, and the password is not returned

#### Scenario: Duplicate local registration
- **WHEN** a normalized email is already registered in the local fake provider
- **THEN** sign-up fails with a normalized registration error and does not create a second identity

#### Scenario: Session reset on restart
- **WHEN** the local process restarts
- **THEN** previously synthetic users and sessions are unavailable and no durable fake-auth claim is made

### Requirement: Isolated customer session cookie

When local customer authentication succeeds, the application SHALL use a new local-only customer session cookie with an opaque session identifier, HttpOnly, SameSite=Lax unless a stricter existing rule applies, Path=/, host-only scope with no Domain attribute, and Secure behavior appropriate to the runtime. The cookie MUST NOT contain email, customer ID, password, profile JSON, JWT-like content, or provider tokens.

#### Scenario: Secure local customer cookie
- **WHEN** a local fake sign-up or sign-in succeeds
- **THEN** only the dedicated customer session cookie is set with the required security attributes

#### Scenario: Customer cookie isolation
- **WHEN** customer sign-in or sign-out occurs
- **THEN** the admin session cookie and guest draft-owner cookie remain unchanged

### Requirement: Customer auth HTTP surface

The system SHALL provide POST sign-up, POST sign-in, POST sign-out, and GET current-session operations under a customer-auth route namespace. Successful responses SHALL contain only safe identity/session projections. Sign-out SHALL revoke the current customer session and expire only the customer session cookie; there SHALL be no GET sign-out operation.

#### Scenario: Successful sign-in and session read
- **WHEN** a local customer signs in and then requests the current session
- **THEN** the session read reports that customer as authenticated without returning the session token

#### Scenario: Sign-out
- **WHEN** an authenticated customer submits the sign-out mutation
- **THEN** the current fake session is revoked and subsequent session reads are unauthenticated

#### Scenario: Invalid session
- **WHEN** a session cookie is missing, unknown, or revoked
- **THEN** current-session access returns unauthenticated state without disclosing session internals

### Requirement: Same-origin mutation protection

Customer sign-up, sign-in, and sign-out mutations SHALL use the repository’s trusted same-origin validation convention. Same-origin requests SHALL be accepted according to that convention; cross-origin, attacker-origin, missing, or invalid origin input SHALL be rejected according to the established security policy. Host and forwarded-host values MUST NOT be treated as sufficient authorization for mutation.

#### Scenario: Same-origin mutation
- **WHEN** a customer-auth mutation includes an accepted same-origin request context
- **THEN** the mutation proceeds to normal input and provider validation

#### Scenario: Cross-origin mutation
- **WHEN** a customer-auth mutation originates from a different or attacker-controlled origin
- **THEN** the mutation is rejected before authentication state changes

### Requirement: Account UI reflects real customer auth state

The system SHALL provide Account, sign-in, and sign-up routes using the existing FigMemento visual and accessibility system. Signed-out Account UI SHALL link to sign-in and account creation. Authenticated Account UI SHALL show only the safe customer email/basic signed-in state and a POST sign-out action. Forms SHALL have labels, autocomplete attributes, visible focus, keyboard-usable controls, bounded error/status feedback, and controls suitable for touch interaction.

#### Scenario: Signed-out Account
- **WHEN** an unauthenticated visitor opens the Account route
- **THEN** the page shows a signed-out state with sign-in and create-account links and no pretend profile data

#### Scenario: Authenticated Account
- **WHEN** an authenticated customer opens the Account route
- **THEN** the page shows the normalized customer email, signed-in state, and sign-out action only

#### Scenario: Auth form accessibility
- **WHEN** a visitor opens sign-in or sign-up
- **THEN** each field has a semantic label and autocomplete metadata, errors are associated accessibly, and submission is keyboard and focus usable

### Requirement: Customer identity boundaries remain separate

Customer authentication SHALL NOT reuse or reinterpret `photogift-admin-session` or `photogift-guest-draft-owner`. Sign-in and sign-up SHALL NOT automatically transfer customization drafts, customer uploads, carts, historical orders, or guest ownership; SHALL NOT delete the guest-owner cookie; and SHALL NOT change order, checkout, customization, or upload ownership behavior.

#### Scenario: No implicit guest merge
- **WHEN** a guest with a draft-owner cookie signs up or signs in
- **THEN** the guest-owner cookie and guest-owned data remain unchanged and no merge is performed

#### Scenario: No order/account ownership change
- **WHEN** an authenticated customer uses the Account or customer-auth routes
- **THEN** order lookup, checkout email, customization ownership, upload ownership, and historical order association remain unchanged

### Requirement: Production handoff remains explicit

The foundation SHALL document the future Supabase Auth adapter requirements, narrow staging/production Site URL and Redirect URL dependencies, deferred OAuth/Google, OTP, email verification, password reset, rate limiting, and guest-to-customer transition gates. It SHALL NOT activate a production provider, production callback, social login, email delivery, or database-backed customer profile in this change.

#### Scenario: Future provider boundary
- **WHEN** the local foundation is reviewed for production activation
- **THEN** it reports production provider configuration as an explicit later dependency rather than treating the local fake as deployable
