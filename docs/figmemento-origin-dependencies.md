# FigMemento External Origin Dependencies

Status: **handoff and dependency mapping only — no remote configuration changed**

This document records the production/staging origin dependencies discovered
from the current repository. It does not implement customer authentication,
change payment behavior, configure email or analytics providers, or mutate
Supabase, Stripe, PayPal, DNS, Cloudflare, or deployment settings.

## Approved origin inputs

- Production Site URL: `https://figmemento.com`
- Planned staging origin: `https://staging.figmemento.com`
- Provider preview hostname: **UNRESOLVED / DEPLOYMENT-TIME INPUT**

## Supabase Auth, OAuth, and OTP

### Repository evidence

The repository contains local Supabase Auth configuration in
`supabase/config.toml`:

- local Auth `site_url = "http://127.0.0.1:3000"`;
- local exact `additional_redirect_urls = ["https://127.0.0.1:3000"]`;
- local email signup/OTP template settings;
- no production SMTP values;
- no active customer Auth client or customer sign-in/sign-up route in `app/`;
- no implemented customer Google OAuth flow;
- no application callback route whose path can be approved as a production
  Auth redirect from this repository.

### Future policy

The future Supabase Auth Site URL should be exactly:

`https://figmemento.com`

The planned staging origin is:

`https://staging.figmemento.com`

Future Redirect URL entries must be narrow, exact, and route-specific where a
route is actually implemented. Add production/staging entries only when the
customer Auth change identifies the required route. Do not use broad wildcard
entries such as `https://*.figmemento.com/**` as a convenience default.

The actual Supabase Google-provider callback must be copied from the actual
Supabase project/provider configuration at deployment time:

`ACTUAL SUPABASE GOOGLE-PROVIDER CALLBACK: [deployment-time input]`

Do not invent a Supabase project reference or an application route such as
`/auth/callback` without repository evidence and an approved Auth change.

OTP/email-link target: **ROUTE UNRESOLVED / FUTURE AUTH CHANGE**. Only exact
routes implemented by that future change may be added to the Redirect URL
allowlist.

## Cookie compatibility

Current cookie names and host behavior are compatibility-sensitive:

| Cookie | Current implementation | Domain policy |
|---|---|---|
| `photogift-admin-session` | `app/lib/admin-auth.ts` | Host-only; no `Domain` attribute; `Secure` in production |
| `photogift-guest-draft-owner` | `app/lib/guest-draft-owner.ts` | Host-only; no `Domain` attribute; `Secure` when runtime mode is production |

The Brand/Domain change does not rename either cookie and does not introduce a
`Domain` attribute. A future cookie-name or Domain-scope migration requires a
separate compatibility review, security review, session migration strategy,
and rollback plan. Cosmetic brand consistency is not sufficient reason to
rename these cookies.

## Stripe and order origin behavior

Repository evidence:

- `app/api/orders/route.ts` creates Stripe Checkout sessions when Stripe is
  configured;
- success and cancel URLs are derived from `new URL(request.url).origin`;
- current paths are `/?checkout=success&order=...` and
  `/?checkout=cancelled&order=...`;
- `app/api/webhooks/stripe/route.ts` is the implemented webhook route;
- the webhook verifies the Stripe signature and resolves orders by checkout
  session or order number;
- no production dashboard configuration was changed.

Therefore current success/cancel behavior is **request-origin-derived**. This
Brand/Domain change does not replace it with a trusted production-origin
policy and does not change checkout or webhook behavior.

The repository evidence supports this expected future production webhook
endpoint:

`https://figmemento.com/api/webhooks/stripe`

Trusted return-origin handling, payment amount/currency verification, webhook
configuration, and checkout activation belong to
`integrate-stripe-and-paypal-payments` (or the approved successor payment
change), not this Brand/Domain change.

## PayPal

PayPal is not implemented in the current repository. The following are
future dependencies only:

- return URL: **NOT IMPLEMENTED / ROUTE UNRESOLVED**;
- cancel URL: **NOT IMPLEMENTED / ROUTE UNRESOLVED**;
- webhook URL: **NOT IMPLEMENTED / ROUTE UNRESOLVED**.

Do not create speculative routes such as `/api/webhooks/paypal`,
`/paypal/success`, or `/paypal/cancel`. Dashboard configuration belongs to the
future payment integration change and requires explicit authorization.

## Email and analytics

No approved support mailbox, transactional sender, mail provider, production
email DNS values, or analytics IDs/scripts were found.

Do not invent or publish any of the following:

- `support@figmemento.com`, `hello@figmemento.com`, `orders@figmemento.com`,
  or `noreply@figmemento.com`;
- MX, SPF, DKIM, DMARC, or provider return-path records;
- GA4 measurement IDs;
- Meta Pixel IDs;
- TikTok Pixel IDs or verification tokens.

The existing `hello@photogift.example` value is a temporary placeholder and
is not an approved FigMemento mailbox.

MX records control inbound mail routing. SPF, DKIM, and DMARC control sender
authentication and policy. All concrete records are provider-specific
deployment-time inputs and must be supplied by the authorized email owner.

## Origin dependency matrix

| Dependency | Current repository status | Production origin/domain | Staging relevance | Exact route/config point if known | Deployment-time input required | Owning future change/team | Remote mutation required | Authorization required | Current blocker/unresolved item |
|---|---|---|---|---|---|---|---|---|---|
| Supabase Auth Site URL | Local Auth only | `https://figmemento.com` | `https://staging.figmemento.com` planned | `supabase/config.toml` local `auth.site_url` | Project and environment confirmation | Customer Auth / deployment owner | Yes | Yes | No active customer Auth flow |
| Supabase Redirect URLs | Local exact loopback entry only | Narrow exact entries only | Narrow exact entries only | `supabase/config.toml` `additional_redirect_urls` | Implemented Auth routes | Customer Auth | Yes | Yes | Application routes unresolved |
| Google OAuth provider callback | Not implemented | Deployment-time Supabase value | Deployment-time Supabase value if enabled | Actual Supabase provider configuration | Actual callback URL/project | Customer Auth / Supabase owner | Yes | Yes | Callback not present in repository |
| OTP/email links | Local template/config only | Future exact route | Future exact route | `supabase/config.toml` email section | Implemented route and sender | Customer Auth / email owner | Yes | Yes | Route and sender unresolved |
| Admin cookie | Implemented | Host-only | Host-only | `app/lib/admin-auth.ts` | None for current behavior | Application/security owner | No | Separate migration approval only | Preserve name and scope |
| Guest cookie | Implemented | Host-only | Host-only | `app/lib/guest-draft-owner.ts` | None for current behavior | Application/security owner | No | Separate migration approval only | Preserve name and scope |
| Stripe success | Implemented, request-origin-derived | Future trusted origin policy | Future staging policy | `app/api/orders/route.ts` | Payment change decision | Payment integration | Possibly | Yes | Current behavior intentionally unchanged |
| Stripe cancel | Implemented, request-origin-derived | Future trusted origin policy | Future staging policy | `app/api/orders/route.ts` | Payment change decision | Payment integration | Possibly | Yes | Current behavior intentionally unchanged |
| Stripe webhook | Implemented route and signature verification | `https://figmemento.com/api/webhooks/stripe` expected future endpoint | Separate staging endpoint/config if enabled | `app/api/webhooks/stripe/route.ts` | Dashboard endpoint and secret | Payment integration | Yes | Yes | No dashboard mutation performed |
| PayPal return | Not implemented | Unresolved | Unresolved | None | Future route | Payment integration | Yes | Yes | Route unresolved |
| PayPal cancel | Not implemented | Unresolved | Unresolved | None | Future route | Payment integration | Yes | Yes | Route unresolved |
| PayPal webhook | Not implemented | Unresolved | Unresolved | None | Future route | Payment integration | Yes | Yes | Route unresolved |
| Support mailbox | Not configured | Unresolved | Unresolved | Optional support config only | Approved mailbox | Business/email owner | Yes | Yes | No approved mailbox |
| Transactional sender | Not implemented | Unresolved | Unresolved | No sender integration | Provider and sender approval | Email owner | Yes | Yes | Provider unresolved |
| Mail provider | Not implemented | Unresolved | Unresolved | No Resend/provider integration | Provider selection | Email owner | Yes | Yes | Provider unresolved |
| MX | No production values | Unresolved | Unresolved | None | Provider DNS record | Email owner | Yes | Yes | Do not invent records |
| SPF | No production values | Unresolved | Unresolved | None | Provider DNS record | Email owner | Yes | Yes | Do not invent records |
| DKIM | No production values | Unresolved | Unresolved | None | Provider DNS record | Email owner | Yes | Yes | Do not invent records |
| DMARC | No production values | Unresolved | Unresolved | None | Policy/provider DNS record | Email owner | Yes | Yes | Do not invent records |
| GA4 | Not configured; no ID/script | Unresolved | Unresolved | None | Measurement ID and consent decision | Analytics owner | Yes | Yes | No ID approved |
| Meta Pixel | Not configured; no ID/script | Unresolved | Unresolved | None | Pixel ID and consent decision | Analytics owner | Yes | Yes | No ID approved |
| TikTok | Not configured; no ID/script | Unresolved | Unresolved | None | Pixel/verification ID and consent decision | Analytics owner | Yes | Yes | No ID approved |

## Explicit non-actions

This handoff did not access or modify remote Supabase, Stripe, PayPal, email,
analytics, DNS, Cloudflare, or deployment environments. It did not add Auth,
payment, email, analytics, or runtime behavior.
