# FigMemento Production Cutover Readiness

Status: **LOCAL READINESS ARTIFACT — PRODUCTION CUTOVER NOT AUTHORIZED**

This is the final local readiness gate for the Brand/Domain change. It is not
a production approval and it does not execute domain cutover, DNS changes,
Cloudflare changes, provider deployment, or remote configuration.

## Current stop state

| Gate | Current state |
|---|---|
| Brand/Domain local implementation | Complete after local verification |
| C1 `build-configurable-product-catalog` | 41/61 |
| C1 Task 3.5 | BLOCKED / awaiting business input |
| C1 BACKFILL AUTHORIZED | **NO** |
| Customization change | 64/70; frozen for this change |
| Visual change | 8/15; frozen for this change |
| Full production catalog deployability | **NOT COMPLETE** |
| Production domain cutover / full public launch | **NOT AUTHORIZED** |

Brand/Domain 41/41 means local Brand/Domain implementation and readiness
artifacts are complete. It does not mean that C1 is unblocked, payment is
ready, or production is deployed.

## Required gates before domain launch

All applicable boxes must be reviewed by the authorized release owner. A
conditional feature gate applies only if that feature is enabled for the
launch.

### Catalog and application

- [ ] C1 migration and preflight chain is deployable.
- [ ] C1 Task 3.5 and all dependent blockers are resolved according to the C1
      change.
- [ ] `BACKFILL AUTHORIZED` is separately approved before any guarded backfill.
- [ ] Production catalog source and data-preservation checks are complete.
- [ ] Brand/Domain application verification has been reviewed.
- [ ] Staging verification is complete.
- [ ] Rollback evidence and owner are complete.

### Conditional Customer Auth gate

If Customer Auth is enabled for launch:

- [ ] Supabase Auth Site URL is configured as approved.
- [ ] Narrow exact production Redirect URL entries are configured only for
      implemented routes.
- [ ] Staging Redirect URL entries are configured only if staging Auth is
      enabled and the routes are implemented.
- [ ] Google provider callback is copied from the actual Supabase project.
- [ ] OTP/email-link targets and sender configuration are verified.
- [ ] Auth callback and session verification pass staging tests.

If Customer Auth is not enabled for launch, these gates remain deferred and
must not be represented as completed.

### Conditional payment gate

If production payment checkout is enabled:

- [ ] Trusted production return-origin behavior is approved by the payment
      integration change.
- [ ] Stripe success/cancel behavior is verified for the intended origin.
- [ ] Stripe webhook endpoint and signature configuration are verified.
- [ ] Expected amount/currency validation is complete in the payment change.
- [ ] PayPal routes and dashboard configuration exist only if PayPal is
      enabled and explicitly approved.

If payment checkout is not enabled for launch, payment activation remains
deferred and this Brand/Domain change does not claim payment readiness.

### Conditional email gate

If transactional email is enabled:

- [ ] Approved sender mailbox and domain are recorded.
- [ ] Provider selection and credentials are configured outside Git.
- [ ] Provider-specific MX/SPF/DKIM/DMARC values are supplied by the email
      owner and verified.
- [ ] Bounce/return-path behavior is verified where applicable.

If transactional email is not enabled for launch, no mailbox or DNS record is
inferred by this document.

### Public contact gate

- [ ] An approved support/contact policy exists if public contact is required.
- [ ] No placeholder or guessed `@figmemento.com` mailbox is published.

## Manual evidence worksheet

All values below remain blank until supplied by authorized operators. Do not
commit credentials, tokens, private keys, or provider secrets.

### Domain

- Authorized operator: `[deployment-time input]`
- Domain ownership evidence: `[deployment-time input]`
- Registrar/account: `[deployment-time input]`
- Registration/renewal state: `enabled / disabled / unknown`
- Evidence timestamp: `[deployment-time input]`
- Final operator approval: `[deployment-time input]`

### Cloudflare and provider

- Cloudflare account confirmed: `YES / NO / UNKNOWN`
- Cloudflare zone confirmed: `YES / NO / UNKNOWN`
- Provider-discovered deployment target: `[deployment-time input]`
- Custom-domain status: `unattached / pending / verified / failed`
- Edge redirect status: `not configured / pending / verified / failed`

### DNS and DNSSEC

- Current authoritative nameservers: `[deployment-time input]`
- Intended authoritative nameservers: `[deployment-time input]`
- Pre-cutover DNS snapshot: `[deployment-time evidence]`
- Current TTL values: `[deployment-time input]`
- DNSSEC state: `enabled / disabled / unknown`
- DS evidence, if relevant: `[deployment-time evidence]`
- Delegation verification: `pending / passed / failed`

### Staging — `staging.figmemento.com`

- DNS resolution evidence: `[deployment-time evidence]`
- TLS certificate evidence: `[deployment-time evidence]`
- HTTPS response evidence: `[deployment-time evidence]`
- Effective environment: `[deployment-time input]`
- Noindex verification: `pending / passed / failed`
- Canonical absence verification: `pending / passed / failed`
- Sitemap absence verification: `pending / passed / failed`
- Provider-preview hostname leakage check: `pending / passed / failed`
- Staging verification owner/time: `[deployment-time input]`

### Production apex — `figmemento.com`

- DNS evidence: `[deployment-time evidence]`
- TLS evidence: `[deployment-time evidence]`
- HTTP/HTTPS response evidence: `[deployment-time evidence]`
- Deployment identity: `[deployment-time input]`
- `APP_DEPLOYMENT_ENV`: `[deployment-time input]`
- Effective origin: `[deployment-time input]`
- Root canonical: `[deployment-time evidence]`
- Open Graph URL: `[deployment-time evidence]`
- Robots behavior: `[deployment-time evidence]`
- Sitemap behavior: `[deployment-time evidence]`
- Apex verification owner/time: `[deployment-time input]`

### WWW — `www.figmemento.com`

- Attachment status: `unattached / pending / verified / failed`
- Permanent redirect evidence: `[deployment-time evidence]`
- HTTPS target evidence: `[deployment-time evidence]`
- Path preservation evidence: `[deployment-time evidence]`
- Query preservation evidence: `[deployment-time evidence]`
- No-loop evidence: `[deployment-time evidence]`
- WWW verification owner/time: `[deployment-time input]`

### External dependencies

- Supabase/Auth status, if enabled: `[deployment-time evidence]`
- Google provider callback, if enabled: `[deployment-time evidence]`
- OTP/email-link status, if enabled: `[deployment-time evidence]`
- Stripe return-origin status, if enabled: `[deployment-time evidence]`
- Stripe webhook status, if enabled: `[deployment-time evidence]`
- PayPal status, if enabled: `[deployment-time evidence]`
- Support mailbox status, if needed: `[deployment-time evidence]`
- Transactional sender/email DNS, if enabled: `[deployment-time evidence]`
- Analytics status, if enabled: `[deployment-time evidence]`

### Operations

- Monitoring status: `[deployment-time evidence]`
- Rollback evidence location: `[deployment-time input]`
- Rollback owner: `[deployment-time input]`
- Verification timestamp: `[deployment-time input]`
- Final operator approval: `[deployment-time input]`

## Launch authorization decision

Current decision: **PRODUCTION DOMAIN CUTOVER / FULL PUBLIC LAUNCH: NOT
AUTHORIZED**.

The blocking reason is production catalog deployability: C1 remains at 41/61,
Task 3.5 is blocked, and `BACKFILL AUTHORIZED` remains `NO`. Completion of
Brand/Domain local readiness must not be interpreted as permission to deploy
or publish the catalog.

## Explicit stop gate

The following remain unexecuted and require separate authorization:

- registrar or nameserver mutation;
- A/AAAA/CNAME/MX/TXT/CAA mutation;
- DNSSEC mutation;
- Cloudflare custom-domain attachment or edge redirect activation;
- provider production deployment;
- Supabase Auth or Google OAuth dashboard configuration;
- Stripe or PayPal dashboard configuration;
- email provider setup or MX/SPF/DKIM/DMARC publication;
- analytics configuration;
- production launch.
