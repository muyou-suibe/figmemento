## Why

FigMemento currently has separate admin-session and guest-draft ownership boundaries, but no provider-neutral customer identity or account session abstraction. A development-only authentication foundation is needed now so the storefront can exercise sign-up, sign-in, session retrieval, sign-out, and Account UI locally without requiring production Supabase Auth or changing guest, order, or customization ownership semantics.

## What Changes

- Audit and document the current customer, admin, and guest session boundaries and the local Supabase Auth configuration.
- Define provider-neutral customer identity, session, request/result, error, and provider-port contracts.
- Add an explicit server-side customer-auth source with only `disabled` and development/test-only `local_fake` modes.
- Implement a server-only in-memory fake provider with opaque random sessions, safe password handling, session-cookie isolation, and same-origin mutation protection.
- Add customer auth sign-up, sign-in, sign-out, and current-session HTTP endpoints.
- Add FigMemento Account, sign-in, and sign-up routes with accessible signed-in and signed-out states.
- Document the future Supabase Auth adapter, staging/production redirect dependencies, and deferred OAuth/OTP/email-verification/password-reset work.
- Add deterministic offline, rendered, security-boundary, and configuration tests and local development documentation.

The local fake provider must fail closed when selected outside development or test. It must never silently replace a production provider, and it must not modify the existing admin-session or guest-draft-owner cookies.

## Capabilities

### New Capabilities

- `customer-auth`: Provider-neutral customer identity/session contracts, development-only fake authentication, isolated customer session handling, auth HTTP surface, and Account UI.

### Modified Capabilities

- None. Existing admin authentication, guest ownership, orders, customization, catalog, payment, and domain requirements remain unchanged.

## Impact

- Affected application areas include server configuration, authentication domain/application services, customer-auth API routes, public navigation, Account routes, CSS modules, tests, and local-auth documentation.
- No customer/profile database tables, migrations, RLS policies, order ownership changes, customization ownership changes, production Supabase Auth adapter, OAuth callback, or provider dashboard configuration are included.
- The future production adapter will depend on approved Supabase Auth configuration, narrow site/redirect URLs, and later decisions for OAuth, OTP, email verification, password reset, and guest-to-customer transition.
- Existing `photogift-admin-session` and `photogift-guest-draft-owner` cookies remain independent and unchanged.
