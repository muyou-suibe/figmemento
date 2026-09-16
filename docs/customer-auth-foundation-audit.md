# Customer Auth Foundation Audit

Status: completed for Customer Auth Batch 1 planning and implementation boundary.

This audit records repository evidence only. Local Supabase Auth configuration is not evidence that the application already has customer authentication.

## IMPLEMENTED CUSTOMER AUTH

- No customer sign-up, sign-in, sign-out, current-session, callback, or Account route existed before this change.
- No application Customer Auth client or provider adapter was found.
- No customer-auth cookie existed before the dedicated local foundation cookie introduced by this change.
- No application call to `supabase.auth.signUp`, `supabase.auth.signInWithPassword`, `supabase.auth.signOut`, `supabase.auth.getUser`, or `supabase.auth.getSession` was found.

## LOCAL AUTH CONFIG ONLY

`supabase/config.toml` contains local Supabase Auth configuration:

- `[auth].enabled = true`
- local `site_url = "http://127.0.0.1:3000"`
- an additional local redirect entry
- signup is enabled in local configuration
- email confirmations are disabled in local configuration
- SMS signup is disabled
- no application route currently consumes this Auth configuration

This configuration belongs to a possible future Supabase Auth adapter. Batch 1 does not connect to local or remote Supabase Auth and does not change this file.

## ADMIN AUTH — SEPARATE

- Admin authentication uses the configured `ADMIN_PASSWORD`.
- Admin sessions use the existing `photogift-admin-session` cookie.
- Admin route/session verification is implemented separately in `app/lib/admin-auth.ts` and the existing admin server boundaries.
- Customer authentication MUST NOT reuse, rename, expire, or reinterpret this cookie.

## GUEST OWNER — SEPARATE

- Guest draft ownership uses the existing `photogift-guest-draft-owner` cookie.
- The cookie carries a signed server-managed guest owner context; it is not a customer identity.
- Customer uploads, upload previews, customization drafts, and related protected flows use this guest-owner boundary where applicable.
- Sign-in/sign-up MUST NOT delete the cookie, transfer its owner, claim its drafts/uploads, or merge its data.

## ORDER AND CHECKOUT COMPATIBILITY BOUNDARY

- Checkout currently accepts an email address as guest/order input and uses it for order creation and Stripe checkout email behavior.
- Order lookup uses order number plus checkout email; it does not use a Customer identity or authenticated session.
- No customer account ID is added to orders or order_items by this change.
- Authenticated Account access MUST NOT change order lookup, order ownership, checkout email, historical order claims, or payment behavior.

## CUSTOMIZATION AND UPLOAD COMPATIBILITY BOUNDARY

- Customization drafts and customer uploads retain their existing guest-owner and receipt/ownership rules.
- The current ownership model remains server-authoritative and does not interpret a customer session as guest ownership.
- No automatic guest-to-customer transition, cart merge, upload transfer, draft transfer, or order claim is implemented.

## FUTURE PROVIDER DEPENDENCY

The following remain future work and are not active customer authentication:

- production Supabase Auth adapter and session semantics;
- production/staging Site URL and narrow Redirect URL configuration;
- Google OAuth or other social login;
- OTP, magic links, email verification, password reset, and provider-owned password policy;
- production rate limiting and multi-instance session behavior;
- explicit guest-to-customer transition and ownership reconciliation.

## NOT IMPLEMENTED BEFORE THIS CHANGE

- Customer profile database, addresses, saved payment methods, order history, wishlist, cart merge, checkout activation, or customer account persistence.
- OAuth callback routes, email delivery, verification claims, recovery flows, or provider dashboard setup.
- Production customer authentication activation or deployment configuration.

## Evidence Locations

- `app/config/server.ts`: existing server configuration, product source, Stripe, admin password, and guest-owner configuration.
- `app/lib/admin-auth.ts`: separate admin password/session cookie boundary.
- `app/lib/guest-draft-owner.ts` and `app/application/guest-draft-owner-context.ts`: separate guest-owner service and signed context.
- `app/server/customer-upload-ownership.server.ts`: guest-owner and same-origin protected upload boundary.
- `app/api/orders/route.ts` and `app/api/order-lookup/route.ts`: email-based guest checkout/order lookup behavior.
- `supabase/config.toml`: local Auth configuration only.
