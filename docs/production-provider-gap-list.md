# Production provider gap list

This list contains true external dependencies only. Missing local business logic is tracked in `local-mvp-completion-backlog.md`, not hidden here.

`Local groundwork` values describe only the adapter-neutral work already present.

| Provider/dependency | Original requirement | Local groundwork | External gap | Required owner input | Production acceptance |
| --- | --- | --- | --- | --- | --- |
| Supabase Auth | Email OTP, Google login and secure member identity | PARTIAL | Local password/session authority is development-only; no Supabase Auth BFF, OTP, OAuth, refresh or subject mapping. | Supabase project, redirect allowlist, SMTP, Google client, claim/link policy. | OTP and Google flows, revoke/refresh across two instances, forged/wrong-environment rejection. |
| SMTP for Auth OTP | Email-code delivery | NOT IMPLEMENTED | No OTP issuance path; no codes may be logged. | Sending domain, templates, rate limits and test recipients. | Real authorized mailbox receives one valid expiring code; replay/rate-limit tests pass. |
| Google OAuth | Google sign-in and same-email linking | NOT IMPLEMENTED | No PKCE/state callback or provider-subject binding. | Google consent/client settings and conflict policy. | Exact redirect, state/PKCE, replay and subject-link acceptance. |
| Stripe | Card/Stripe checkout and payment lifecycle | PARTIAL | Canonical Order totals and provider-neutral local Payment simulation are complete; legacy Stripe-shaped code is not accepted integration. | Test/live accounts, keys, expected account, webhook secret, refund policy. | Sandbox create/retrieve/webhook/reconciliation with exact amount/currency/account and lost-response recovery. |
| PayPal | PayPal approval/capture | NOT IMPLEMENTED | Canonical Payment port can receive verified facts; no PayPal adapter exists. | Sandbox/live apps, merchant/buyer accounts, webhook ID. | Server create/capture/GET, signed webhook, replay and mismatch rejection. |
| Transactional email provider such as Resend | Order, payment, preview, shipment, tracking and digital-ready mail | NOT IMPLEMENTED | Only an in-memory local outbox exists; durable provider-neutral email groundwork is also a local backlog item. | Sending domain, From/Reply-To, API/webhook keys, templates, allowlist and suppression policy. | Durable intent→dispatch→provider callback→observed mailbox test without duplicate sends. |
| 17TRACK | Real tracking updates | PARTIAL | Canonical Shipment/events, customer/operator auth and manual synthetic carrier lifecycle are complete. | Account/key, carrier map, polling/webhook policy and exception handling. | Real test tracking ID, signed/authenticated ingestion, duplicate/out-of-order and outage reconciliation. |
| Production private Storage | Customer originals/derived previews/digital files | PARTIAL | Local private Supabase Storage policies, cleanup, immutable media and ticketed download are complete. | Provider choice, region/residency, retention, backup and credentials. | Private upload/read/delete, no locator leak, cleanup races, recovery and digital stream acceptance. |
| Production image renderer/helper | Trusted orientation/crop/derived media | PARTIAL | Separate local Node/sharp helper and real-byte acceptance exist. | Runtime host, isolation, limits, monitoring and retention policy. | Malformed/bomb/timeout/restart/redirect/SSRF matrix under production-like load. |
| GA4 | Production analytics | PARTIAL | Safe local event intake and several storefront events exist. | Property/measurement ID, consent and reporting owner. | DebugView evidence, consent gating, test-traffic isolation and one purchase per paid Order. |
| Meta Pixel/Conversions API | Production advertising analytics | PARTIAL | Safe event vocabulary exists; no provider adapter. | Business/dataset ID, domain verification, consent and attribution policy. | Browser/server dedupe and privacy-safe event inspection. |
| TikTok Pixel/Events API | Production advertising analytics | PARTIAL | Safe event vocabulary exists; no provider adapter. | Pixel ID, API decision, consent and attribution policy. | Debug-tool evidence and privacy-safe dedupe. |
| Cloudflare/production hosting | Public deployment, TLS and runtime | PARTIAL | Vinext/Cloudflare build and host-policy code exist; deployment was explicitly not authorized. | Account/project, environments, domain, secrets, observability and rollback. | Staging/production smoke, TLS, redirects, rollback and production E2E. |
| Domain registrar/DNS | Canonical public domain | NOT IMPLEMENTED | `figmemento.com` is present as code configuration only. | Final brand/domain ownership and DNS authority. | DNS/TLS/www redirect verification. |
| Production Supabase database | Durable production commerce | PARTIAL | Isolated local schema 37/37, RLS/RPC, ledger, rebuild and security evidence exist. | Project, migration/cutover/backfill approval, backups and operator channel. | Approved migration dry run, backup/restore, RLS matrix and rollback. |
| Helpdesk/support delivery | Contact and manual exception handling | PARTIAL | Bounded local contact intake exists. | Support mailbox/system, retention and routing; service hours are optional owner-added readiness configuration, not an original atomic requirement. | Authorized delivery, injection resistance, duplicate handling and operator workflow. |

## Explicit non-provider gaps

Refund domain, promotion breadth, shipping selectors, image-content inspection, account deletion, same-email guest claim, 21-SKU assortment, Admin reporting, durable email outbox and the durable payment-webhook inbox are not external-provider excuses. They remain local/owner-decision backlog items even if a future provider participates.

Carrier quotation/label APIs are an optional production extension, not an original MVP provider gap: the source requires configured shipping rules and says 17TRACK handles tracking, not quotation. Production observability/SLO tooling is retained as quality-hardening recommendation `QH03`, not an original provider row.

## Atomic provider-row coverage

All 19 `PROVIDER` atoms in the audit are represented here; a provider handoff row may satisfy more than one source atom.

| Audit ID | Provider handoff coverage |
| --- | --- |
| A01 | Cloudflare/production hosting, domain/DNS and production Supabase |
| D11 | Transactional email provider |
| E08 | Stripe |
| E09 | PayPal |
| E10 | Stripe and PayPal verified provider transitions |
| E27 | Stripe and PayPal raw-payload signature verification |
| F09 | 17TRACK |
| G03 | Supabase Auth and Auth SMTP |
| G04 | Supabase Auth and Google OAuth |
| G10 | Google OAuth subject/email-linking acceptance |
| I08 | Transactional email provider |
| J09 | GA4 |
| J10 | Meta Pixel/Conversions API |
| J11 | TikTok Pixel/Events API |
| K12 | Transactional email provider |
| K13 | Transactional email provider |
| K14 | Transactional email provider plus 17TRACK event inputs |
| M04 | Cross-provider production-like end-to-end acceptance |
| M05 | Cloudflare/production hosting and domain registrar/DNS |
