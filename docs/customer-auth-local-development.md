# Customer Auth Local Development

This is a development/test-only Customer Auth foundation. It does not connect to Supabase Auth and it is not a production credential system.

## Enable the local fake provider

In an ignored local `.env.local`, add only:

```env
CUSTOMER_AUTH_SOURCE=local_fake
```

Do not commit `.env.local`, add credentials to `.env.example`, set `NODE_ENV` in `.env.local`, or set `local_fake` in a production environment. The runtime mode is determined by the application runtime. `local_fake` fails closed outside development and test.

Leave the value empty or use `CUSTOMER_AUTH_SOURCE=disabled` to render the safe account-unavailable state.

## Routes

- `/account` — signed-out or authenticated Account state
- `/account/sign-in` — local sign-in form
- `/account/sign-up` — local sign-up form
- `/api/customer-auth/session` — current safe session projection
- `/api/customer-auth/sign-up` — same-origin POST
- `/api/customer-auth/sign-in` — same-origin POST
- `/api/customer-auth/sign-out` — same-origin POST

Start the normal local development server with `npm run dev`, then open `http://localhost:3000/account/sign-up`.

The repository rendered regression harness uses the default disabled build so it
can prove the safe unavailable state without any provider. Its built artifact
does not switch `CUSTOMER_AUTH_SOURCE` per request. The enabled `local_fake`
Account branches and HTTP workflow are therefore covered by deterministic
offline contract/source tests; they do not imply a production provider or a
remote Supabase dependency.

## Intentional limitations

- Synthetic users and opaque sessions live only in process memory.
- Restarting the server clears all local users and sessions.
- Multiple local Worker instances do not share fake-auth state.
- USE THROWAWAY TEST PASSWORDS ONLY. Never use a real or reused personal password with `local_fake`.
- No email is sent and no email verification is claimed.
- The local SHA-256 verifier is development/test-only and is not a production password storage design.
- Google OAuth, OTP, magic links, password reset, profile data, addresses, saved payment methods, order history, wishlist, and checkout activation are not implemented.
- The fake provider does not claim or merge guest drafts, uploads, carts, or historical orders.

## Identity separation

Customer Auth uses `figmemento-local-customer-session` only. It never reuses, renames, expires, or interprets:

- `photogift-admin-session` — Admin authentication;
- `photogift-guest-draft-owner` — guest draft/upload ownership.

## Production prohibition

Do not deploy the local fake provider. Production customer authentication remains `NOT ACTIVATED` until a later approved change implements and verifies the Supabase Auth adapter and its Site URL, Redirect URL, provider, email, and security configuration.
