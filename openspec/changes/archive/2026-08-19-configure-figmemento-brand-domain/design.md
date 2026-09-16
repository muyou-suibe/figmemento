## Context

See `proposal.md` for motivation and `specs/brand-domain-configuration/spec.md` for the behavior contract.

The current repository has two overlapping identity sources: `app/site-config.ts` hardcodes PhotoGift copy and a temporary support email, while `app/config/public.ts` reads `NEXT_PUBLIC_SITE_URL` and `NEXT_PUBLIC_BRAND_NAME` with localhost/PhotoGift fallbacks. Root metadata and structured data use the first source; sitemap, robots, and catalog canonical URLs use the second. The order route independently derives Stripe return URLs from the request origin. This permits public SEO and callback origins to disagree.

The occurrence audit found these classes:

| Classification | Current examples | Planned treatment |
| --- | --- | --- |
| Public identity | root metadata/structured data, storefront shell, loading/not-found/catalog status, shop/category/home copy, admin headings/login, information-page metadata/copy | Migrate application-controlled brand text to FigMemento through centralized identity where practical. |
| Public origin/SEO | `NEXT_PUBLIC_SITE_URL`, catalog SEO URL composition, sitemap, robots sitemap reference; no `metadataBase` currently | Replace public canonical derivation with the approved production-origin policy and environment-aware indexation. |
| Public temporary contact | `hello@photogift.example` in site config, FAQ, terms, privacy, and shipping/returns | Remove hardcoded copies; accept only an explicitly configured/approved public contact and otherwise render contact instructions without a fabricated address. |
| Operational/current documentation | README, `.env.example`, active architecture/configuration guidance, OpenSpec project context | Update current identity and configuration guidance while preserving still-valid technical names. |
| Compatibility-sensitive technical identity | `PHOTOGIFT_PRODUCT_SOURCE`, `photogift-uploads`, `photogift-admin-session`, `PG-` order-number prefix, package/runtime template identifiers | Preserve in this change and record as technical-name debt; do not invalidate environments, storage access, sessions, or order lookup. |
| Offline/local fixture | `photogift.test`, `example.test`, `example.com` fixture assets, `localhost`, placeholder customer emails, `app.local` URL-parsing sentinel | Keep offline. New brand assertions use `figmemento.test`; existing request-security fixtures may retain `photogift.test`. Never substitute the real production origin. |
| Historical evidence | migrations, migration history, archived OpenSpec changes, schema/preflight baselines, historical foundation records, Git history | Preserve unchanged. |
| External dependency | Supabase Auth/OAuth/OTP, Stripe and future PayPal callbacks/webhooks, sender/mailbox DNS, GA4/Meta/TikTok domains | Document exact later operator/configuration points; do not mutate behavior or remote services. |

There is currently no repository literal for a concrete `pages.dev` hostname, no implemented PayPal or customer Google OAuth integration, and no analytics IDs. These absences are recorded rather than filled with guesses.

The active `build-configurable-product-catalog` change owns catalog semantics and is not modified here. Some of its new storefront/SEO files are integration surfaces; implementation must re-run the occurrence audit against the then-current worktree before editing them.

## Goals / Non-Goals

**Goals:**

- Make approved public identity immutable and easy to consume without creating a secret-bearing global configuration object.
- Make production canonical output independent of untrusted request hosts while retaining valid local/staging/preview behavior.
- Prevent staging and preview indexing and prevent provider hostnames from becoming canonical.
- Separate reversible application preparation from externally authorized DNS, provider, and deployment operations.
- Preserve compatibility-sensitive and historical identities and leave an explicit debt register.

**Non-Goals:**

- Changing catalog, checkout, payment, authentication, storage, email-provider, analytics, or database behavior.
- Renaming internal technical identifiers, order prefixes, package names, buckets, cookies, migrations, constraints, or archived records.
- Choosing a Cloudflare project hostname, DNS target, email provider, mailbox policy, or analytics identifier before those values are approved.
- Producing a visual identity, logo, typography, color, or marketing-copy redesign.

## Decisions

### 1. Use immutable public brand constants plus a validated deployment context

Create a small provider-neutral configuration boundary (expected near `app/config/`) with immutable public values:

- `brandName = "FigMemento"`
- `productionOrigin = "https://figmemento.com"`
- `canonicalHostname = "figmemento.com"`
- `stagingHostname = "staging.figmemento.com"`

These are approved product facts, not environment-specific secrets, so they are compile-time public constants. They are not overridable by arbitrary production environment values; this prevents a stale deployment variable from redefining canonical identity.

A separate parser owns deployment context:

- `APP_DEPLOYMENT_ENV`: server/build setting constrained to `production | staging | preview | development | test`.
- `NEXT_PUBLIC_DEPLOYMENT_ORIGIN`: optional non-secret current origin for staging, preview, and local rendering where a concrete current origin is needed; it must be an absolute HTTP(S) origin with no credentials, path, query, or fragment. Production must match the approved production origin if supplied.
- `NEXT_PUBLIC_SUPPORT_EMAIL`: optional non-secret, explicitly approved public contact. Its absence is valid and causes address-free contact copy; no guessed mailbox is substituted.

Secrets remain in existing server-only parsers. `NEXT_PUBLIC_BRAND_NAME` and `NEXT_PUBLIC_SITE_URL` are migrated out of authoritative use; any temporary compatibility read must be explicit, warning-free in tests, and removed before this change completes so there is one authority. Local defaults are allowed only in development/test parsing and never for production.

Alternative considered: keep all values environment-driven. Rejected because the final brand and canonical origin are already approved constants, and unrestricted environment overrides recreate split-brain identity. Alternative considered: put every public and server setting in one site object. Rejected because it increases accidental secret exposure.

### 2. Centralize policy, not every phrase

Identity consumers use the brand configuration directly or receive it as an input. Repeated editorial phrases may remain in page modules, but application name, canonical origin, hostname classification, support-contact selection, and SEO construction have one authority. Brand-bearing current documentation and operational filenames can be updated deliberately.

The implementation begins with `docs/figmemento-brand-origin-audit.md`, listing each occurrence by file, classification, action, and rationale. An unclassified or uncertain occurrence is left unchanged. Product/Category descriptions, customer data, migrations, historical documents, fixtures, and internal identifiers are never included in a mechanical replacement.

Alternative considered: repository-wide case-insensitive replacement. Rejected because it would break compatibility and corrupt evidence.

### 3. Separate canonical production URLs from the current serving origin

Production SEO always composes URLs from the immutable production origin. Root metadata adds `metadataBase` (or the vinext-compatible equivalent), canonical, Open Graph URL/site identity, and structured-data URL/name from the same source. Catalog canonical paths remain application-relative and data-driven; only origin composition changes.

Environment SEO policy is explicit:

| Environment | Indexing | Canonical links / OG URL | Sitemap / robots sitemap |
| --- | --- | --- | --- |
| Production apex | indexable per existing page policy | Production origin | Production origin; public sitemap enabled |
| Production WWW alias | redirect before application content | Not emitted | Not emitted |
| Staging | `noindex, nofollow` | Omitted; never staging | Public sitemap omitted and robots disallow indexing |
| Provider preview | `noindex, nofollow` | Omitted; never preview hostname | Public sitemap omitted and robots disallow indexing |
| Development/test | nonproduction-safe defaults | Reserved/local values only when tests require them | No production network access |

Unavailable/private/admin/API route restrictions remain additive. Structured data is limited to site identity already represented by the application; the current unsupported SearchAction is audited and must either be removed or justified by an actual search capability rather than carried forward as a marketing claim.

Alternative considered: canonicalize every staging page to the equivalent production URL. Rejected because staging can contain routes/content not yet available in production, producing misleading canonicals. No canonical plus `noindex` is safer.

### 4. Cloudflare owns the WWW redirect; the application owns classification and SEO defense

The authoritative production redirect is an edge rule for the exact host `www.figmemento.com`, using a permanent HTTPS redirect to `figmemento.com` and preserving path and query. Cloudflare is the correct layer because it runs before application rendering and avoids duplicate-page responses. The rule must not match apex, staging, preview, localhost, or `.test` hosts.

The application does not introduce a broad Host-header redirect. It validates the deployment environment/host relationship and refuses to produce canonical/indexable production output in staging or preview. A pure policy function and runbook assertions make the intended redirect testable offline, while the actual edge rule is verified only during an explicitly authorized cutover.

Alternative considered: application middleware performs all redirects. Rejected because framework/adapter behavior is less direct for a DNS alias and could create loops behind proxies. Alternative considered: Cloudflare only, with no app awareness. Rejected because incorrect metadata could still index staging/preview.

### 5. Preserve technical names and session/storage/order compatibility

This change does not rename `PHOTOGIFT_PRODUCT_SOURCE`, the `photogift-uploads` default, `photogift-admin-session`, the `PG-` order-number prefix, package/template identifiers, migrations, constraints, or fixture paths. Cookie behavior remains host-only because no `Domain` attribute is set; this naturally isolates apex and staging sessions. Any later cookie-name/domain migration requires its own compatibility and security review.

The debt inventory records owner, compatibility risk, and suggested future decision point. Historical and archived material is not debt merely because it contains the old name; it is evidence.

### 6. Payment and auth origins are dependencies, not implementation scope

`app/api/orders/route.ts` currently builds Stripe success/cancel URLs from the request origin. Changing that is payment trust-boundary behavior and remains for `integrate-stripe-and-paypal-payments`; the dependency checklist records that it must use a trusted approved deployment origin before production. The expected production Stripe webhook endpoint is `https://figmemento.com/api/webhooks/stripe`, subject to that later change's dashboard and validation work. Future PayPal return/cancel/webhook paths remain unknown until its integration defines them and are not invented here.

The checklist records these later auth points: Supabase Auth Site URL, narrow Redirect URL entries for production and explicitly needed staging paths, Google provider console redirect URI (normally the Supabase provider callback supplied by the actual project), customer OTP/email-link redirect targets, and post-auth return paths. Remote Supabase/OAuth settings are not changed. The current admin cookie is host-only and preserved. The `app.local` sentinel in ChatGPT return-path validation is internal parsing infrastructure, not a public origin.

### 7. DNS and custom-domain work is an operator runbook with hard gates

Create `docs/figmemento-domain-cutover.md` with two tracks:

1. Preparation: verify registration/ownership; add the zone to the intended Cloudflare account; compare registrar-assigned authoritative nameservers; record TTL and current reachability; enable DNSSEC only after authoritative state is stable; discover the real deployment project/custom-domain target; attach and verify staging first.
2. Authorized cutover: record the previous deployment and DNS state; attach apex using provider-supplied values; attach or route WWW and enable the exact redirect; verify TLS, redirect path/query preservation, apex reachability, canonical/robots/sitemap output, and staging noindex; monitor; then enable DNSSEC if not already safely enabled.

Every remote step has prerequisite evidence, expected result, rollback action, and a human authorization checkbox. The runbook never stores secrets. DNS records for email are a separate provider-specific gate: no MX, SPF, DKIM, or DMARC values are proposed until transactional sender and mailbox policies are approved.

### 8. Keep tests offline and split policy from remote verification

Unit tests exercise configuration parsing, invalid production fallbacks, host classification, canonical composition, nonproduction indexation, support-contact absence, and redirect target construction using localhost or `.test`. New identity fixtures use `https://figmemento.test`; existing `https://photogift.test` same-origin security fixtures may remain to avoid meaningless churn. Rendered tests assert FigMemento identity and nonproduction safety without network access.

The implementation verification gate is `npm run lint`, `npm run typecheck`, relevant offline tests, production build, rendered tests where practical, `openspec validate --all --strict`, secret scanning already established by the engineering foundation, and `git diff --check`. DNS/TLS/redirect checks against real hosts are cutover checklist items, not automated apply tests.

## Risks / Trade-offs

- [Active C1 files change before this parallel change is applied] → Re-run the occurrence audit and avoid editing C1 planning artifacts or catalog semantics; resolve overlapping implementation edits against the latest file contents.
- [A deployment is mislabeled as production] → Validate environment/host combinations and fail closed for canonical/indexable behavior.
- [WWW redirect loops or drops path/query] → Match only the exact WWW host, preserve path/query, and verify apex does not redirect to itself before cutover.
- [Staging leaks into search indexes] → Omit canonicals/sitemaps, emit `noindex, nofollow`, and test staging/preview policies offline.
- [Removing the temporary support address leaves weaker contact UX] → Support an optional validated public contact and use address-free copy until mailbox policy is approved; do not fabricate deliverability.
- [Retained `photogift` names appear inconsistent internally] → Document compatibility debt and keep public identity clean; defer risky migrations.
- [Canonical constants complicate a future domain move] → The boundary concentrates the change in one reviewed contract; a future domain move becomes an explicit OpenSpec change rather than an environment accident.
- [Remote provider UI differs from the runbook] → Require provider-discovered targets and captured verification evidence instead of brittle guessed record values.

## Migration Plan

1. Re-run and review the brand/origin occurrence inventory against the latest branch, recording migrate/retain/defer decisions.
2. Add the authoritative public identity and deployment-context parser with offline contract tests; keep legacy technical names unchanged.
3. Migrate application-owned visible copy and current operational documentation; remove hardcoded temporary support contact behavior.
4. Integrate root/catalog metadata, sitemap, robots, structured data, and nonproduction indexation with the central policy.
5. Add the host/redirect policy description, dependency checklist, technical-name debt register, DNS runbook, and cutover/rollback evidence template.
6. Run local verification and review the diff to ensure C1 artifacts, migrations, business data, payment/auth behavior, and historical evidence were not changed.
7. Stop. A separately authorized operator session later verifies domain ownership and real deployment targets, establishes staging, and performs production cutover only after C1 and all listed external dependencies are ready.

Rollback before remote cutover is a normal code/config revert to the previous deployment. During an authorized cutover, retain the prior deployment reference and DNS/custom-domain state; if TLS, routing, callbacks, or SEO verification fails, remove/revert the new attachment or edge rule and restore the prior reachable route according to the runbook. Database rollback is not applicable because this change creates no migration or data mutation.

## Open Questions

- The concrete Cloudflare deployment project/custom-domain target is intentionally a deployment-time input and does not change this architecture.
- The support mailbox, transactional email provider/domain, and email DNS values remain separately approved operational inputs; until approved, no public address or DNS record is inferred.
- GA4, Meta, and TikTok identifiers remain later analytics inputs; their absence does not block application identity preparation.
