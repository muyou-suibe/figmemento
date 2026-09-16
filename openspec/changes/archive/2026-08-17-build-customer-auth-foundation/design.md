## Context

The repository currently has an admin password/session boundary using `photogift-admin-session`, a signed guest draft-owner boundary using `photogift-guest-draft-owner`, and local Supabase Auth configuration in `supabase/config.toml`. No customer-facing Auth route, customer provider adapter, or customer session cookie is part of the active application surface. Existing same-origin mutation checks compare the request Origin with the request URL and reject missing or mismatched origins; this convention is already used by protected upload and admin mutations.

This design follows the completed FigMemento visual system and preserves the frozen Brand/Domain, Catalog, Customization, order, upload, payment, and deployment boundaries. See `proposal.md` and `specs/customer-auth/spec.md` for motivation and observable requirements.

## Goals / Non-Goals

**Goals:**

- Establish a small provider-neutral customer identity/session port.
- Make local sign-up, sign-in, current-session, and sign-out testable without remote services.
- Keep customer authentication server-only at the provider boundary and expose only safe projections to UI.
- Isolate the local fake session cookie from admin and guest-owner cookies.
- Reuse the existing same-origin mutation security convention.
- Provide accessible Account, sign-in, and sign-up surfaces using current FigMemento tokens.
- Leave an explicit, documented handoff boundary for a future Supabase Auth adapter.

**Non-Goals:**

- No customer/profile database, migration, RLS policy, or durable fake-auth store.
- No production Supabase Auth adapter or Supabase Auth SDK calls.
- No Google OAuth, OTP, magic links, email verification, password reset, or callback routes.
- No guest-to-customer merge, cart merge, order claim, upload transfer, or customization ownership change.
- No order history, addresses, saved payment methods, wishlist, checkout activation, payment, DNS, Cloudflare, or deployment work.

## Decisions

### 1. Keep the domain contract provider-neutral

Define `CustomerIdentity`, `CustomerAuthSession`, normalized request/result types, and `CustomerAuthProvider` in the application/domain boundary. The provider port accepts normalized credentials and a request-scoped session context, while route adapters translate HTTP input/output. UI modules consume safe result projections and never import a provider SDK.

**Alternative considered:** importing Supabase Auth directly from routes. Rejected because it would activate a provider before the approved handoff and make local offline tests depend on remote or local Supabase.

### 2. Use an explicit server configuration source

Add `CUSTOMER_AUTH_SOURCE` to server configuration with only `disabled` and `local_fake`. The parser receives an injectable environment for deterministic tests, while the runtime adapter reads server-side environment values. `local_fake` is rejected when the direct runtime mode is production; no fallback to fake authentication is permitted.

**Alternative considered:** infer fake mode from missing Supabase credentials. Rejected because missing credentials must fail closed rather than silently changing authentication behavior.

### 3. Implement a process-memory fake provider

Use a server-only provider instance with synthetic in-memory users and sessions. Generate session IDs with the platform crypto random API and keep them opaque. Store only bounded local verification state needed for the test workflow; do not establish or document a production password-hashing scheme. Restarting the process intentionally clears all fake users and sessions.

**Alternative considered:** adding a local database or customer table. Rejected because it expands the change into persistence, migrations, RLS, profile ownership, and production data decisions.

### 4. Use a dedicated local customer cookie

Use `figmemento-local-customer-session` as an application-owned, host-only cookie. Set HttpOnly, SameSite=Lax, Path=/, and Secure only when the runtime requires HTTPS. Cookie serialization and clearing are centralized so sign-in/sign-up/sign-out cannot mutate `photogift-admin-session` or `photogift-guest-draft-owner`.

**Alternative considered:** reusing the guest-owner cookie. Rejected because guest ownership is not customer identity and must remain available for a later explicit transition.

### 5. Preserve the existing mutation security model

Customer POST routes use a narrow shared helper that validates exact request Origin against the request URL and follows the repository’s existing `Sec-Fetch-Site` convention. Missing, malformed, cross-origin, and attacker-origin requests fail before provider state changes. Host and forwarded-host headers are not authorization inputs.

**Alternative considered:** introducing a new CSRF token framework. Rejected because the repository already has a consistent same-origin boundary and a new framework would enlarge the security surface without a current requirement.

### 6. Keep HTTP and UI boundaries separate

Route handlers own JSON parsing, same-origin checks, normalized response mapping, and cookie headers. Account pages render state from the safe current-session projection; sign-in/sign-up controls submit same-origin POST requests and show safe errors. The UI does not receive or inspect session identifiers.

### 7. Document production handoff without implementing it

The handoff documentation records the future Supabase adapter port, Site URL/Redirect URL dependencies, provider-specific password/email behavior, OAuth/OTP/email verification/password reset gates, rate limiting, and guest-to-customer transition ownership. These remain later changes and are not represented as working controls in the UI.

## Risks / Trade-offs

- [Risk] Process-memory fake users and sessions disappear on restart and do not work across instances. → Make the limitation visible in local documentation and fail closed in production.
- [Risk] A developer could accidentally set `local_fake` in a deploy environment. → Validate the direct runtime mode and reject production configuration before creating a provider or session.
- [Risk] A customer-auth route could accidentally affect admin or guest cookies. → Centralize the dedicated cookie name and add explicit cookie-preservation tests.
- [Risk] Error responses could leak account existence or provider details. → Normalize errors at the provider boundary and use safe public messages.
- [Risk] Same-origin validation could drift from existing upload/admin behavior. → Reuse or mirror the established exact-Origin and `Sec-Fetch-Site` helper and test same-origin, cross-origin, and missing-origin cases.
- [Risk] Future Supabase Auth semantics may differ from the fake provider. → Keep the provider port small, document provider-owned password/email policy, and avoid promising verification or recovery behavior in this batch.

## Migration Plan

No database migration or remote configuration is required. Implementation is local-only and can be rolled back by removing the customer-auth routes, provider modules, UI routes, tests, and documentation. Production activation remains prohibited until a later approved change supplies and verifies the Supabase Auth adapter and deployment configuration.

## Open Questions

- The future Supabase Auth adapter’s email-confirmation, password-recovery, OAuth, and session-refresh policy remains intentionally deferred to the production-provider change.
- The explicit guest-to-customer transition and ownership reconciliation policy remains a separate future change.
