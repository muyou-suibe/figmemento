## MODIFIED Requirements

### Requirement: Customer authentication provider port

The system SHALL define provider-neutral operations for sign-up, sign-in, session retrieval, and sign-out or session revocation. Application routes SHALL depend on this contract rather than directly coupling customer authentication behavior to a provider SDK. The contract SHALL additionally support email OTP request/verification and Google authorization start/callback in explicitly gated `supabase` test mode, with normalized outcomes for authentication, unavailable capabilities, local revocation, remote revocation uncertainty, and pending order association. Local email/password operations MUST retain their existing behavior; unsupported operations MUST NOT fall back to a different authority or create a self-hosted production password system.

#### Scenario: Provider-independent route behavior
- **WHEN** a supported customer-auth provider handles a sign-in request
- **THEN** the route returns the same normalized application result shape regardless of provider implementation

#### Scenario: Unknown provider failure
- **WHEN** a provider returns an error outside the normalized application vocabulary
- **THEN** the application returns a safe generic provider failure without raw provider details

#### Scenario: Unsupported credential method
- **WHEN** a caller submits the local password method to a Supabase-only OTP or Google operation
- **THEN** the operation returns a bounded unsupported/invalid-request result without saving passwords or falling back to local authentication

### Requirement: Normalized customer auth inputs and errors

The system SHALL trim and consistently case-normalize customer email identity, reject malformed email input, apply bounded non-empty password input validation for the local workflow, and normalize failures into a safe vocabulary including invalid request, invalid credentials, already registered email, not authenticated, unavailable, rate limited, and provider failure states where applicable. The final production password policy SHALL remain provider/security owned. Supabase OTP request inputs SHALL validate email without requiring a password; verification SHALL additionally require a bounded numeric email code matching the configured provider format. Identity normalization MUST NOT strip plus-tags or remove Gmail dots. Error responses MUST NOT reveal raw provider messages, tokens, codes, or unnecessary account-existence information.

The retained Invalid request scenario SHALL apply to the fields required by the selected method: email/password for the local workflow, email for OTP issuance, and email/code for OTP verification. It MUST NOT impose a password on OTP or Google login.

#### Scenario: Email normalization
- **WHEN** a valid email contains surrounding whitespace or case differences
- **THEN** identity comparison and the returned safe identity use the normalized address

#### Scenario: Invalid request
- **WHEN** email or password input is missing, malformed, or outside bounded input limits
- **THEN** the request is rejected with a normalized invalid-request result

#### Scenario: Safe sign-in failure
- **WHEN** credentials cannot authenticate a customer
- **THEN** the application returns a safe sign-in failure without exposing unnecessary account-existence detail

#### Scenario: OTP input is method specific
- **WHEN** a caller requests an email code with a valid email and no password, or verifies it with a valid-format numeric code
- **THEN** method-specific validation permits the request without invoking the local password requirement; a missing or malformed required code is rejected

#### Scenario: Similar email aliases are not equivalent
- **WHEN** two addresses differ by plus-tag or Gmail dot placement
- **THEN** they remain distinct identity comparison values and cannot claim one another's orders

### Requirement: Explicit customer auth runtime modes

The current main-spec baseline SHALL remain `disabled` and development/test-only `local_fake`. Source selection SHALL use `CUSTOMER_AUTH_SOURCE=supabase`, independently gated by `SERVICE_INTEGRATION_MODE=test`, an explicitly approved test project/environment identity, and complete validated configuration; a source enum alone MUST NOT enable it. Absent/disabled source, invalid configuration, project mismatch, or closed gate SHALL fail closed without silently authenticating, selecting fake users, or changing authority. `local_fake` MUST remain rejected in production, process-local, and free of remote provider access. Production/live Supabase activation is out of scope and MUST be rejected under this change, with customer-auth production remaining disabled. This is a current activation restriction, not a definition that the `supabase` source name is permanently test-only. No alternate auth-source configuration name or new frontend token client SHALL be introduced, and public configuration MUST NOT expose server secrets.

`local_persistent` is planned separately in `complete-local-commerce-persistence`, not implemented by this delta and not asserted as current main-spec behavior. If that change has actually landed before integration, this change MUST preserve its independent Docker-local project restriction, development/test-only identity, staging/production rejection, durable credentials/session/revocation, and no guest migration semantics; it MUST NOT downgrade them to fake memory or reinterpret them as Supabase Auth identities. Before either overlapping delta is applied or archived, the handoff SHALL require re-reading the then-current main spec and rebasing BOTH customer-auth deltas against it, including overlapping runtime, HTTP, and handoff requirements and the local-only guest restriction. This round MUST NOT modify the earlier change or claim that either plan is implemented.

#### Scenario: Disabled customer auth
- **WHEN** customer auth source is disabled or unavailable
- **THEN** auth operations return a safe unavailable/not-enabled result and do not create a session

#### Scenario: Development fake auth
- **WHEN** source is `local_fake` in development or test
- **THEN** local customer auth operations are available without remote provider access

#### Scenario: Production fake-auth rejection
- **WHEN** source is `local_fake` in production
- **THEN** the application rejects the configuration and does not authenticate anyone

#### Scenario: Explicit Supabase test gate
- **WHEN** `supabase` is selected with an open test gate and the approved test-project configuration
- **THEN** only that project's test auth adapter is eligible and no live provider or local commerce authority is activated

#### Scenario: Gate or authority mismatch
- **WHEN** the gate is closed, the target is live/production, configuration is incomplete, or the project differs from the approved project
- **THEN** authentication fails closed without a session or fallback to local users

#### Scenario: Rebase after local persistence lands
- **WHEN** the independent local persistence change is implemented before these auth deltas are integrated
- **THEN** the handoff requires reconciling both deltas with the new main spec while preserving durable local revocation, isolated test identity, and no local guest migration rather than replacing the runtime enum with only disabled/local_fake/supabase

### Requirement: Isolated customer session cookie

When local customer authentication succeeds, the application SHALL use a new local-only customer session cookie with an opaque session identifier, HttpOnly, SameSite=Lax unless a stricter existing rule applies, Path=/, host-only scope with no Domain attribute, and Secure behavior appropriate to the runtime. The cookie MUST NOT contain email, customer ID, password, profile JSON, JWT-like content, or provider tokens. Supabase mode SHALL use a separately namespaced BFF application cookie carrying only a cryptographically random opaque token, with HttpOnly, Secure on HTTPS test endpoints, SameSite=Lax or stricter compatible policy, Path=/, and host-only scope; it MUST NOT be accepted as a fake, local-persistent, guest, or admin cookie. Server state SHALL store only a secure hash of the application token and separately encrypted provider access/refresh tokens, using a server-held encryption key separate from cookie tokens, hashes, provider credentials, and database contents. Only the server SHALL create, refresh, or consume provider sessions; the browser MUST NOT be required to read Supabase SSR cookies or provider tokens.

#### Scenario: Secure local customer cookie
- **WHEN** a local fake sign-up or sign-in succeeds
- **THEN** only the dedicated customer session cookie is set with the required security attributes

#### Scenario: Customer cookie isolation
- **WHEN** customer sign-in or sign-out occurs
- **THEN** the admin session cookie and guest draft-owner cookie remain unchanged

#### Scenario: BFF session and secret separation
- **WHEN** Supabase verification succeeds and the server durably creates an application session
- **THEN** the browser receives only the protected opaque app cookie and safe identity while the server retains the app-token hash and encrypted provider tokens under the separate encryption key

#### Scenario: Server persistence or encryption unavailable
- **WHEN** the app-session authority cannot commit or provider tokens cannot be securely encrypted/decrypted
- **THEN** no usable authenticated session is issued or authorized through stale memory or browser-readable provider cookies

### Requirement: Customer auth HTTP surface

The system SHALL provide POST sign-up, POST sign-in, POST sign-out, and GET current-session operations under a customer-auth route namespace. Successful responses SHALL contain only safe identity/session projections. Sign-out SHALL revoke the current customer session and expire only the customer session cookie; there SHALL be no GET sign-out operation. Supabase mode SHALL additionally expose same-origin POST OTP request/verify and OAuth start operations, plus an allowlisted provider callback supporting code exchange, without changing local email/password behavior. Callback responses MUST NOT expose tokens in page content, application redirects, or logs. If `local_persistent` has landed, its durable revocation-before-success and store-unavailable failure semantics MUST remain intact. Supabase logout SHALL durably revoke the current app session before local success is reported, independently attempt the configured provider revocation scope, and separately report remote failure/uncertainty without claiming successful global logout.

The retained Sign-out scenario below SHALL describe the `local_fake` branch; Supabase and any separately implemented `local_persistent` branch SHALL instead use the durable current-app-session revocation rules above, without claiming a fake session exists in those modes.

#### Scenario: Successful sign-in and session read
- **WHEN** a local customer signs in and then requests the current session
- **THEN** the session read reports that customer as authenticated without returning the session token

#### Scenario: Sign-out
- **WHEN** an authenticated customer submits the sign-out mutation
- **THEN** the current fake session is revoked and subsequent session reads are unauthenticated

#### Scenario: Invalid session
- **WHEN** a session cookie is missing, unknown, or revoked
- **THEN** current-session access returns unauthenticated state without disclosing session internals

#### Scenario: Provider logout is unavailable
- **WHEN** Supabase remote sign-out fails after durable local app-session revocation
- **THEN** subsequent use of that cookie is unauthenticated, the customer cookie expires, and the result distinguishes local logout success from remote revocation failure or uncertainty without claiming global logout

#### Scenario: Local revocation authority unavailable
- **WHEN** durable revocation of a Supabase app session or an already implemented local-persistent session cannot commit
- **THEN** the operation reports a bounded unavailable/failure result without claiming authoritative revocation, even if it clears the browser cookie

### Requirement: Same-origin mutation protection

Customer sign-up, sign-in, and sign-out mutations SHALL use the repository’s trusted same-origin validation convention. Same-origin requests SHALL be accepted according to that convention; cross-origin, attacker-origin, missing, or invalid origin input SHALL be rejected according to the established security policy. Host and forwarded-host values MUST NOT be treated as sufficient authorization for mutation. These protections SHALL also cover OTP request/verify, OAuth initiation, and explicit retry mutations. The OAuth callback flow SHALL instead require OAuth state management/validation owned by Supabase/provider, PKCE exchange performed by the SDK using the application's request-scoped server-side storage isolated per single intent, and the application's short-lived single-use browser-bound auth-intent context. Server storage of the verifier MUST NOT replace or claim ownership of provider OAuth state; the callback MUST NOT weaken origin checks on ordinary mutations or trust arbitrary callback/return URLs.

#### Scenario: Same-origin mutation
- **WHEN** a customer-auth mutation includes an accepted same-origin request context
- **THEN** the mutation proceeds to normal input and provider validation

#### Scenario: Cross-origin mutation
- **WHEN** a customer-auth mutation originates from a different or attacker-controlled origin
- **THEN** the mutation is rejected before authentication state changes

#### Scenario: Callback is not a general CSRF exemption
- **WHEN** an attacker submits a cross-origin OTP/logout mutation or an OAuth callback without the matching auth intent
- **THEN** the request is rejected without creating, switching, or revoking an authenticated session

### Requirement: Account UI reflects real customer auth state

The system SHALL provide Account, sign-in, and sign-up routes using the existing FigMemento visual and accessibility system. Signed-out Account UI SHALL link to sign-in and account creation. Authenticated Account UI SHALL show only the safe customer email/basic signed-in state and a POST sign-out action. Forms SHALL have labels, autocomplete attributes, visible focus, keyboard-usable controls, bounded error/status feedback, and controls suitable for touch interaction. Local fake email/password forms SHALL remain available in their existing mode. Supabase test mode SHALL expose numeric email-code entry, resend cooldown feedback, Google sign-in, safe retry/error states, and the existing account-creation entry through provider-owned OTP flow, not a fabricated local password form. Pending association and uncertain remote logout SHALL be truthfully distinguished from login failure or global logout; no pretend history SHALL appear before authorized business projection exists.

#### Scenario: Signed-out Account
- **WHEN** an unauthenticated visitor opens the Account route
- **THEN** the page shows a signed-out state with sign-in and create-account links and no pretend profile data

#### Scenario: Authenticated Account
- **WHEN** an authenticated customer opens the Account route
- **THEN** the page shows the normalized customer email, signed-in state, and sign-out action only

#### Scenario: Auth form accessibility
- **WHEN** a visitor opens sign-in or sign-up
- **THEN** each field has a semantic label and autocomplete metadata, errors are associated accessibly, and submission is keyboard and focus usable

#### Scenario: Test OTP entry and cooldown
- **WHEN** a visitor requests a Supabase email code in the enabled test mode
- **THEN** accessible code entry and bounded resend timing are shown without implying a magic-link email alone completed numeric OTP verification

### Requirement: Customer identity boundaries remain separate

Customer authentication SHALL NOT reuse or reinterpret `photogift-admin-session` or `photogift-guest-draft-owner`. Sign-in and sign-up SHALL NOT automatically transfer customization drafts, customer uploads, carts, historical orders, or guest ownership; SHALL NOT delete the guest-owner cookie; and SHALL NOT change order, checkout, customization, or upload ownership behavior, except for the single narrowly defined Supabase verified-email order association below. The two retained legacy scenarios in this requirement SHALL continue to apply to `local_fake`, to `local_persistent` if separately implemented, and to Supabase attempts without eligible orders and fresh verified-email proof.

The ONLY historical-order exception SHALL be `supabase` mode's automatic association of same-project, eligible, unowned, explicitly approved business guest orders after fresh provider verified-email proof, as specified by `verified-guest-order-association`. This exception MUST NOT require an additional guest cookie or second identity challenge after that proof, migrate any local simulated order or credential, overwrite an existing owner, or independently transfer drafts, carts, uploads, or their capabilities. Customer identity or verified email MUST NOT grant administrator privileges; linked order access SHALL continue to enforce resource-specific authorization, including private media rules.

#### Scenario: No implicit guest merge
- **WHEN** a guest with a draft-owner cookie signs up or signs in
- **THEN** the guest-owner cookie and guest-owned data remain unchanged and no merge is performed

#### Scenario: No order/account ownership change
- **WHEN** an authenticated customer uses the Account or customer-auth routes
- **THEN** order lookup, checkout email, customization ownership, upload ownership, and historical order association remain unchanged

#### Scenario: Sole verified provider association exception
- **WHEN** a Supabase customer supplies fresh provider verified-email proof matching eligible unowned approved business orders in the same project
- **THEN** those orders are automatically associated without an extra guest cookie or second challenge while local simulated orders, guest cookies, drafts, carts, and upload ownership remain unchanged

#### Scenario: Customer cannot become administrator
- **WHEN** an authenticated Supabase customer invokes an administrator route, including with an email resembling an administrator's email
- **THEN** customer authentication does not satisfy admin authorization and the request is denied without an independent valid admin authority

### Requirement: Production handoff remains explicit

The foundation SHALL document Supabase Auth adapter requirements, narrow test/staging/production Site URL and Redirect URL dependencies, OAuth/Google, OTP, email verification, rate limiting, and guest-to-customer transition gates. Password reset and production password policy SHALL remain provider-owned deferred scope; this change MUST NOT self-host production passwords or migrate fake/local-persistent credentials into Supabase. The explicitly gated test OTP/Google/session/association contract SHALL replace deferral only for approved test integration, not activate production/live providers, production callbacks, production email sending, or production database-backed profiles.

Evidence SHALL distinguish A offline contract/harness verification, B isolated durable-database verification, C explicitly authorized external test service integration, and D approved canonical business-order wiring. Supabase test-project credentials, Google client configuration, allowed callbacks, and working custom SMTP/code template SHALL be C external prerequisites, not proof that code or D wiring exists. vinext/Cloudflare Worker request isolation, crypto, cookie headers, callback exchange, refresh, and logout SHALL require actual runtime evidence; incompatibility MUST block acceptance rather than weaken HttpOnly/Secure/cookie isolation. The handoff MUST require rebasing both overlapping customer-auth deltas without editing `complete-local-commerce-persistence` in this round, following the concrete future target sentence and retained-scenario checklist in `verified-guest-order-association`'s added `Evidence and overlapping-delta handoff` requirement. `Durable membership does not claim guest commerce` exists only as an earlier added delta, not current main; this change MUST NOT emit a MODIFIED block for that absent requirement. This round SHALL create planning documents only, with no implementation, database setup, deployment, remote login, or email sends.

#### Scenario: Future provider boundary
- **WHEN** the local foundation is reviewed for production activation
- **THEN** it reports production provider configuration as an explicit later dependency rather than treating the local fake as deployable

#### Scenario: Missing external test prerequisites
- **WHEN** test-project credentials, Google client/callback setup, SMTP, or authorized test recipients are unavailable
- **THEN** the affected C evidence is blocked and neither offline fixtures nor B database results are reported as real provider integration or D business acceptance

#### Scenario: Worker cookie incompatibility
- **WHEN** actual vinext/Worker verification cannot preserve secure BFF cookies, refresh behavior, or OAuth request isolation
- **THEN** runtime acceptance remains blocked without exposing tokens to JavaScript, relaxing cookie security, or asserting deployment readiness

## ADDED Requirements

### Requirement: Supabase numeric email OTP lifecycle

In gated Supabase mode the server SHALL use genuine `signInWithOtp` for email-code issuance and `verifyOtp` with the submitted email numeric token and `type: email` for verification. The configured provider email template MUST render the numeric code; a default magic-link template alone MUST NOT count as numeric OTP support. Supabase Auth SHALL own code creation, expiry, verification, and SMTP delivery, optionally through externally configured Resend SMTP; the application MUST NOT mint its own code, send a duplicate through Resend API, or store plaintext codes. Session creation SHALL occur only after successful provider verification and durable BFF-session commit. Issuance/verification SHALL have bounded network deadlines, server-enforced per-email and per-source abuse limits, resend cooldown, and brute-force attempt limits that remain effective across instances; uncertain issuance MUST NOT trigger unbounded automatic resends.

#### Scenario: Numeric code sign-in
- **WHEN** an authorized test user requests a code and submits the correct unexpired code from the configured Supabase email
- **THEN** provider verification succeeds and the server creates a protected BFF session without a second application OTP email

#### Scenario: Magic-link-only template
- **WHEN** the configured default template sends only a magic link and does not render the required numeric code
- **THEN** numeric OTP acceptance remains blocked until the external template configuration is corrected

#### Scenario: Wrong expired or replayed code
- **WHEN** verification receives a wrong, expired, or already consumed code
- **THEN** the request returns a safe failure, creates no session or association, and cannot bypass attempt limits

#### Scenario: Resend or brute-force abuse
- **WHEN** a caller exceeds the resend cooldown, issuance quota, or verification attempt threshold across repeated requests or instances
- **THEN** the server returns a bounded rate-limited result and timing guidance without sending or verifying additional codes outside policy

#### Scenario: Provider network failure
- **WHEN** issuance or verification times out or Supabase is unavailable
- **THEN** the server returns a safe unavailable/uncertain result without claiming delivery, creating an unverified session, or replaying sends without rate-limit control

### Requirement: Google PKCE and single-use auth intent

The server SHALL initiate Google login with Supabase `signInWithOAuth` using PKCE and complete the callback with `exchangeCodeForSession`. Provider OAuth state SHALL be managed and validated by Supabase/provider; the application MUST NOT replace, fabricate, or double-own that state. The SDK SHALL generate/store/read the PKCE verifier through application-supplied request-scoped server-side storage, with each short-lived single-use intent's verifier isolated from every other intent/user and available to the matching callback request only. Request-scoped clients SHALL use that protected durable intent storage across requests, not global mutable SDK state, frontend token clients or a verifier in a browser-readable cookie. The BFF SHALL also bind initiation and callback to a short-lived, single-use, browser/session-bound auth-intent context containing the expected project/provider and approved redirect destination. Application intent binding and SDK verifier storage are distinct from and MUST NOT replace provider OAuth state; the intent SHALL be consumed atomically before session creation, and callback races or consumed/expired context MUST NOT establish a second session. Redirects SHALL use a strict configured allowlist, not arbitrary browser, Host, or forwarded-host input. The flow MUST prevent login CSRF and session swapping; a changed initiating session SHALL require a new intent rather than silently linking a different user. Google login success alone MUST NOT imply verified email eligibility for order association.

#### Scenario: Valid Google callback
- **WHEN** the expected browser returns an authorized code within the intent lifetime and provider state/PKCE checks and code exchange succeed
- **THEN** the intent is consumed once, a new BFF session is established for the verified provider subject, and navigation uses only the approved destination

#### Scenario: Invalid or replayed callback
- **WHEN** a callback has missing, expired, mismatched, or consumed auth-intent context, invalid provider state/PKCE, or a replayed code
- **THEN** it cannot create or replace a customer session and returns a bounded sign-in failure

#### Scenario: Redirect injection or session swapping
- **WHEN** callback input proposes an external unapproved destination or a different browser/session attempts to consume the intent
- **THEN** the attempt is rejected without redirecting to the attacker or linking their provider identity

#### Scenario: Google cancellation or exchange failure
- **WHEN** Google consent is denied or code exchange fails or times out
- **THEN** no new authenticated state or order ownership is committed and a fresh safe initiation is available without leaking callback codes

### Requirement: Request-scoped provider verification and session renewal

Supabase clients and mutable auth context SHALL be created per request and never shared across users. The server MUST NOT trust `getSession` user data, decoded-but-unverified JWTs, or browser email as authentication authority. Server authorization SHALL check the durable app-session hash, project/subject, expiry, and revocation and use `getClaims` with verified signature and expected issuer, audience, and expiry; unverifiable claims MUST fail closed. Fresh server-side `getUser` proof of the same project/subject and confirmed email SHALL additionally be required for every automatic order-association attempt, including retries. Provider access/refresh tokens SHALL remain encrypted server-side, rotate through concurrency-safe refresh, and never appear in responses, cookies, URLs, or logs. Logout revocation SHALL win over concurrent refresh; expired, rejected, or unavailable refresh MUST NOT restore a revoked session or authorize from stale cached identity.

#### Scenario: Untrusted session payload
- **WHEN** browser input or a `getSession` payload claims an identity without valid authoritative app state and cryptographically verified claims
- **THEN** protected access is denied and no guest association is attempted

#### Scenario: Invalid JWT authority
- **WHEN** signature verification fails or the issuer, audience, expiry, subject, or project is invalid
- **THEN** the request fails closed without falling back to decoded claims or a local identity

#### Scenario: Two concurrent customers
- **WHEN** two requests authenticate different customers on the same Worker instance
- **THEN** each uses its own provider client and token context and cannot observe or authorize as the other customer

#### Scenario: Concurrent refresh and logout
- **WHEN** requests race to refresh a session while another request durably revokes it
- **THEN** token updates are serialized or fenced and no refresh result can reactivate the revoked app session

#### Scenario: Fresh email verification unavailable
- **WHEN** an otherwise valid login succeeds but fresh `getUser` verified-email proof is unavailable
- **THEN** login can remain successful while association is pending and no order access is granted until a later fresh proof succeeds