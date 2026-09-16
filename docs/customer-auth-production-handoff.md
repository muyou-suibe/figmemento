# Customer Auth Production Handoff

Status: **PRODUCTION CUSTOMER AUTH: NOT ACTIVATED**

This document records the handoff boundary for a future production Supabase Auth adapter. It does not implement an adapter, configure Supabase, approve redirect routes, or activate production authentication.

## 1. Future provider adapter

The future adapter must implement the existing provider-neutral `CustomerAuthProvider` port:

| Port operation | Future Supabase responsibility | Required application result |
|---|---|---|
| `signUp` | Create/provider-register an identity according to approved email and password policy | Opaque customer ID, normalized email, safe session projection; never password or provider session object |
| `signIn` | Verify provider credentials and establish provider session | Same safe authenticated projection and server-owned session handling |
| `getSession` | Resolve the current provider/application session during SSR and API requests | Safe authenticated/unauthenticated projection only |
| `signOut` | Revoke/end the provider or application session according to approved strategy | Safe unauthenticated projection |

The provider implementation remains server-owned. Public UI must never receive access tokens, refresh tokens, JWTs, Supabase Session objects, provider cookie payloads, passwords, or OAuth tokens.

`CustomerIdentity` remains:

- opaque stable provider ID;
- normalized email.

`CustomerAuthSession` remains a safe authenticated projection with safe Customer identity and timing metadata only where required.

## 2. Future session strategy — unresolved

The production change must separately decide and review:

- server-side session/cookie integration;
- token refresh behavior;
- revocation behavior;
- SSR current-user resolution;
- expiration and refresh semantics;
- secure cookie ownership if application-managed cookies are used;
- multi-instance behavior and failure handling.

The local fake cookie is not a production cookie:

`figmemento-local-customer-session`

is development/test-only. A future Supabase adapter must not silently reuse it as a production session format.

## 3. Approved origin inputs

- Production Site URL: `https://figmemento.com`
- Planned staging origin: `https://staging.figmemento.com`
- Provider preview hostname: **UNRESOLVED / DEPLOYMENT-TIME INPUT**

Future Supabase Auth Redirect URLs must be narrow, exact, route-specific, and environment-specific where required. Do not approve convenience wildcards such as:

- `https://*.figmemento.com/**`
- `https://figmemento.com/**`

## 4. Callback state

No approved Customer Auth callback application route exists in the current repository.

Do not invent or approve any of the following in this foundation:

- `/auth/callback`
- `/account/callback`
- `/api/auth/callback`

Application Auth callback: **UNRESOLVED / FUTURE PROVIDER CHANGE**.

The actual Supabase Google-provider callback is not an application route and must be copied from the real Supabase project/provider configuration at deployment time:

`ACTUAL SUPABASE GOOGLE-PROVIDER CALLBACK: DEPLOYMENT-TIME INPUT`

Do not invent a Supabase project reference.

## 5. Deferred provider/security gates

All of the following remain **NOT IMPLEMENTED** and require a later approved change:

- Google OAuth and other social providers;
- OTP and magic links;
- email verification and confirmed-email semantics;
- password reset, password change, and email change;
- provider-owned production password policy;
- production rate limiting and abuse prevention for sign-up, sign-in, recovery, OTP, and OAuth;
- provider session refresh and revocation policy;
- transactional Auth email sender and delivery configuration;
- provider callback and redirect verification.

Final production password policy is **PROVIDER / SECURITY OWNED**. The current local fake verifier is development/test-only and is not a production password storage design.

The local fake provider does not claim verified email, confirmed Customer status, or trusted email ownership.

## 6. Guest → Customer transition handoff

Current sign-in/sign-up behavior intentionally does not:

- claim guest drafts;
- claim CustomerUpload receipts;
- transfer upload objects;
- merge carts;
- claim historical orders;
- change checkout email;
- rewrite owner IDs;
- delete `photogift-guest-draft-owner`.

A future transition change must decide, separately:

1. eligible guest resources;
2. proof that the current browser owns the guest context;
3. target authenticated Customer identity;
4. conflict handling;
5. duplicate handling;
6. transaction/atomicity requirements;
7. idempotency;
8. rollback;
9. security and audit evidence;
10. whether transition is automatic, prompted, or unsupported.

That future work must preserve CustomerUpload ownership checks, private receipt authorization, signed/server-owned guest context, upload lifecycle boundaries, customization ownership, and Phase C boundaries.

## 7. Orders, cart, and database

- Do not attach Customer IDs to historical orders in this foundation.
- Existing order lookup remains based on its approved order-number plus checkout-email contract.
- Authenticated order history is a separate feature and ownership model.
- Final cart merge semantics are future Cart + Guest→Customer work.
- No customer/profile table, migration, RLS policy, trigger, or database persistence is authorized here.

## 8. Required production review before activation

Before production activation, the authorized owner must review the provider adapter, Site URL, exact Redirect URLs, callback values, cookie/session strategy, email verification, password policy, rate limiting, abuse prevention, session refresh/revocation, staging evidence, rollback, and guest-transition boundary.

No remote Supabase, Auth dashboard, Google OAuth dashboard, DNS, Cloudflare, email provider, or deployment action was performed for this handoff.
