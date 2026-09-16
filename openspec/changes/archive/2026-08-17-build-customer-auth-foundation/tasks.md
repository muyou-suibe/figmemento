## 1. Current Auth Audit

- [x] 1.1 Audit current customer, admin, and guest Auth/session code and record evidence in `docs/customer-auth-foundation-audit.md`.
- [x] 1.2 Record the local Supabase Auth configuration and confirm the absence or presence of active customer Auth routes, clients, providers, callbacks, OAuth, OTP, magic-link, and password-reset flows.
- [x] 1.3 Document protected compatibility boundaries for `photogift-admin-session`, `photogift-guest-draft-owner`, orders, customization drafts, customer uploads, and production deployment.
- [x] 1.4 Record deferred customer-auth features and production dependencies, explicitly separating implemented behavior, local configuration, admin Auth, guest ownership, future provider dependencies, and not-implemented features.

## 2. Provider-Neutral Auth Contract

- [x] 2.1 Define the provider-neutral `CustomerIdentity` contract with opaque stable identity and normalized email only.
- [x] 2.2 Define the safe `CustomerAuthSession` contract without passwords, tokens, JWTs, provider cookie payloads, or provider session objects.
- [x] 2.3 Define sign-up, sign-in, sign-out/session-revocation, current-session request/result contracts and safe public projections.
- [x] 2.4 Define normalized customer-auth error vocabulary and safe mapping for malformed input, invalid credentials, duplicate email, unavailable mode, unauthenticated access, rate limits, and provider failures.
- [x] 2.5 Define the provider-neutral `CustomerAuthProvider`/repository port for sign-up, sign-in, sign-out or revoke-session, and session retrieval.
- [x] 2.6 Define the server-side customer session context boundary and explicit separation from UI, admin identity, guest ownership, orders, uploads, and customization ownership.

## 3. Local Fake Provider

- [x] 3.1 Add explicit server-side `CUSTOMER_AUTH_SOURCE` configuration with only `disabled` and `local_fake`, preserving injectable environments for tests.
- [x] 3.2 Implement the server-only development/test fake provider with synthetic process-memory users, bounded password verification state, normalized email identity, and no remote calls.
- [x] 3.3 Implement opaque cryptographically random process-memory sessions that reset on process restart and never encode customer data or credentials.
- [x] 3.4 Add the dedicated `figmemento-local-customer-session` cookie with HttpOnly, SameSite, Path, host-only, and runtime-appropriate Secure behavior.
- [x] 3.5 Implement repository-consistent POST sign-up, POST sign-in, POST sign-out, and GET current-session endpoints with safe response/error mapping.
- [x] 3.6 Apply the established exact same-origin mutation protection to customer-auth POST routes and reject missing, invalid, cross-origin, and attacker-origin requests.
- [x] 3.7 Enforce production fail-closed behavior for `local_fake`, with no automatic fake-auth fallback when the source is absent, disabled, invalid, or unavailable.

## 4. Account UI

- [x] 4.1 Add the public Account navigation entry without adding unimplemented profile, wishlist, address, payment-method, or order-history claims.
- [x] 4.2 Add the signed-out `/account` landing route with links to sign-in and account creation.
- [x] 4.3 Add the `/account/sign-in` form with labels, autocomplete, safe errors, loading/disabled state, keyboard access, and same-origin POST behavior.
- [x] 4.4 Add the `/account/sign-up` form with minimal email/password inputs, local-only development disclosure where appropriate, and safe result handling.
- [x] 4.5 Add authenticated Account identity display and POST sign-out interaction without GET sign-out or destructive guest-data effects.
- [x] 4.6 Apply the existing FigMemento visual/accessibility system, including semantic headings, visible focus, 44px controls, accessible status feedback, responsive layout, and reduced-motion behavior.

## 5. Production Provider Handoff

- [x] 5.1 Document the future Supabase Auth adapter requirements against the provider-neutral port without implementing or activating the adapter.
- [x] 5.2 Document staging/production Site URL and narrow Redirect URL dependencies without changing Brand/Domain policy or deployment configuration.
- [x] 5.3 Document future gates for Google OAuth, OTP, email verification, password reset, callback configuration, and provider-owned password/security policy.
- [x] 5.4 Document guest-to-customer transition ownership and explicitly defer draft, upload, cart, and historical-order merge behavior.

## 6. Final Verification

- [x] 6.1 Add deterministic offline contract, fake-provider, session-cookie, origin-security, password-safety, and identity-separation tests.
- [x] 6.2 Add rendered Account/sign-in/sign-up accessibility regression coverage for enabled and disabled/signed-out states without remote providers.
- [x] 6.3 Run focused Customer Auth tests, offline tests, lint, typecheck, build, rendered tests, strict OpenSpec validation, and diff checks; confirm frozen changes, database schema, migrations, provider activation, DNS, Cloudflare, deployment, and secrets remain untouched.
