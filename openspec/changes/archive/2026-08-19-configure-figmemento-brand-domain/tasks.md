## 1. Repository Brand and Origin Audit

- [x] 1.1 Re-run the case-insensitive brand/origin audit against the latest worktree, covering application code, tests, active docs/config, historical artifacts, host/origin logic, SEO, cookies, auth, payments, email placeholders, analytics placeholders, and provider preview references.
- [x] 1.2 Create `docs/figmemento-brand-origin-audit.md` and classify every relevant occurrence as public identity to migrate, active operations/config to migrate, offline/local fixture to retain or clarify, compatibility-sensitive technical debt to retain, historical evidence to preserve, or external deployment dependency.
- [x] 1.3 Record the explicit preservation decision and compatibility rationale for IDs, slugs, migrations/history, database constraints, Supabase references, `PHOTOGIFT_PRODUCT_SOURCE`, `photogift-uploads`, `photogift-admin-session`, `PG-` order prefixes, package/template identifiers, fixtures, archived records, and Git history.
- [x] 1.4 Record confirmed absences and unknowns, including no known concrete `pages.dev` hostname, PayPal callback implementation, customer Google OAuth implementation, analytics IDs, approved support mailbox, email DNS values, or known deployment-specific DNS target; do not fill them with guesses.
- [x] 1.5 Review the audit before code edits and stop on any unclassified occurrence or compatibility conflict; confirm no `build-configurable-product-catalog` planning artifact or catalog business semantic is selected for modification.

## 2. Authoritative Brand and Deployment Configuration

- [x] 2.1 Add a provider-neutral public identity contract containing only the approved `FigMemento`, `https://figmemento.com`, `figmemento.com`, and `staging.figmemento.com` constants, with no secret-bearing fields.
- [x] 2.2 Add strict parsing for `APP_DEPLOYMENT_ENV` and optional `NEXT_PUBLIC_DEPLOYMENT_ORIGIN`, including production-origin equality, absolute-origin shape, secure production protocol, no credentials/path/query/fragment, and fail-closed production behavior.
- [x] 2.3 Add optional validated `NEXT_PUBLIC_SUPPORT_EMAIL` handling that never fabricates a FigMemento mailbox and supports address-free contact copy when no mailbox is approved.
- [x] 2.4 Consolidate `app/site-config.ts` and `app/config/public.ts` consumers around the new authority, remove `NEXT_PUBLIC_BRAND_NAME` and `NEXT_PUBLIC_SITE_URL` from authoritative use, and retain local fallback behavior only where explicitly limited to development/test.
- [x] 2.5 Update `.env.example` and current configuration documentation for the new non-secret inputs while preserving existing server secrets, technical variable names, and the production fixture-source prohibition.

## 3. User-Visible FigMemento Copy

- [x] 3.1 Migrate application-owned storefront identity in navigation, home/shop/category/catalog states, loading, and not-found surfaces to the authoritative FigMemento name without rewriting catalog content.
- [x] 3.2 Migrate admin login, product, and order headings plus brand-bearing operational export filenames to FigMemento without changing authorization, cookies, order IDs, or admin business behavior.
- [x] 3.3 Migrate active page titles, descriptions, information-page labels, and current public brand references; replace hardcoded temporary support addresses with the approved optional-contact rendering policy.
- [x] 3.4 Update README and current architecture/project-context documentation to identify FigMemento while leaving legacy bootstrap evidence, archived changes, migrations, historical baselines, and compatibility-sensitive technical names intact.

## 4. SEO, Canonical, Sitemap, and Robots Integration

- [x] 4.1 Introduce one environment-aware SEO policy that returns production-canonical/indexable behavior only for the approved production context and returns noncanonical/noindex behavior for staging and preview.
- [x] 4.2 Update root metadata and public structured data to use FigMemento and the production origin, add `metadataBase` or the verified vinext-compatible equivalent, and remove or formally justify any structured action unsupported by implemented behavior.
- [x] 4.3 Update catalog metadata composition so production uses the authoritative origin while existing Product/Category application-relative canonical paths and SEO content remain data-driven and unchanged.
- [x] 4.4 Update sitemap generation so only production publishes public entries based on `https://figmemento.com`; staging and preview must not publish their own origin as a sitemap.
- [x] 4.5 Update robots behavior so production references the canonical sitemap and retains admin/API restrictions, while staging and preview emit `noindex`/disallow behavior and no public sitemap reference.

## 5. Production, Staging, Preview, and WWW Host Policy

- [x] 5.1 Implement and test provider-neutral host/deployment classification for production apex, production WWW alias, staging, provider preview, development, and test without hardcoding an unknown Pages project hostname.
- [x] 5.2 Define a pure redirect-policy contract for exact-host `www.figmemento.com` to permanent HTTPS apex redirects with path/query preservation and no match for apex, staging, preview, localhost, or `.test`.
- [x] 5.3 Document Cloudflare as the authoritative edge enforcement layer for the WWW redirect and application environment policy as SEO defense-in-depth; do not add a broad Host-header application redirect.
- [x] 5.4 Verify host classification and metadata policy do not weaken same-origin admin mutation checks, host-only admin-cookie isolation, or production fixture rejection.

## 6. Cloudflare DNS and Custom-Domain Runbook

- [x] 6.1 Create `docs/figmemento-domain-cutover.md` with operator gates for registration/ownership, intended Cloudflare account/zone, authoritative nameservers, TTL/current-state evidence, and DNSSEC sequencing.
- [x] 6.2 Document staging-first custom-domain attachment and verification using provider-discovered deployment targets; mark all concrete CNAME/A/AAAA/custom-domain values as deployment-time inputs rather than inventing them.
- [x] 6.3 Document separately authorized apex attachment and exact WWW attachment/redirect steps with TLS, path/query, canonical, robots, sitemap, and no-loop verification criteria.
- [x] 6.4 Add rollback evidence and actions that preserve the previous reachable deployment and restore prior routing when TLS, routing, callback, or SEO verification fails; include a no-secrets recording rule.

## 7. External-Origin Deployment Dependencies

- [x] 7.1 Create `docs/figmemento-origin-dependencies.md` covering Supabase Auth Site URL, narrow production/staging Redirect URL entries, customer OTP/email-link targets, and the actual Supabase Google-provider callback to configure later without remote mutation.
- [x] 7.2 Record current host-only admin cookie behavior and preserved cookie name, plus the requirement for a separate compatibility/security review before any future cookie-name or Domain-attribute migration.
- [x] 7.3 Record that current Stripe success/cancel URLs are request-origin-derived, the expected production webhook endpoint is `https://figmemento.com/api/webhooks/stripe`, and trusted return-origin/payment validation work belongs to `integrate-stripe-and-paypal-payments`; do not change payment behavior here.
- [x] 7.4 Record future PayPal return/cancel/webhook dependencies without inventing routes, and gate all payment dashboard changes behind the relevant payment change and explicit authorization.
- [x] 7.5 Record transactional sender/mailbox and MX/SPF/DKIM/DMARC work as provider-specific later gates, and record GA4/Meta/TikTok domain dependencies without generating sender claims, records, measurement IDs, or pixels.

## 8. Offline Verification

- [x] 8.1 Add deterministic offline tests for approved constants, deployment parser validation, secret exclusion, optional support contact, production fallback rejection, and preservation of fixture-source safeguards.
- [x] 8.2 Add offline tests for host classification, exact WWW redirect target/path/query preservation, no loops, staging/preview noindex, canonical omission, and sitemap/robots environment behavior using localhost and reserved `.test` origins only.
- [x] 8.3 Update metadata, catalog SEO, and rendered-output assertions for FigMemento and `figmemento.test` where brand clarity is relevant; retain harmless `photogift.test` request-security fixtures where the name has no public effect, and assert no test contacts `figmemento.com`.
- [x] 8.4 Run relevant offline tests, `npm run lint`, `npm run typecheck`, production build, rendered tests where practical, established secret scanning, `openspec validate --all --strict`, and `git diff --check`; fix failures without weakening strictness or test gates.

## 9. Production Cutover Readiness and Stop Gate

- [x] 9.1 Add a production cutover checklist that requires C1 migration/preflight deployability, reviewed application verification, approved support/contact policy as needed, and completion of relevant auth/payment/email dependencies before domain launch.
- [x] 9.2 Add manual evidence fields for domain ownership, Cloudflare zone/account, provider-discovered targets, nameservers, TLS, apex response, WWW permanent redirect, staging noindex, canonical/OG, sitemap/robots, callbacks, monitoring, and rollback readiness.
- [x] 9.3 Re-run the occurrence audit after implementation and confirm remaining PhotoGift/photogift, example, localhost, preview, origin, sender, callback, and analytics occurrences exactly match the reviewed preserve/defer classifications.
- [x] 9.4 Review the final diff and confirm no Product/Category/customer content, IDs, slugs, database schema/data, migrations/history, C1 artifacts, payment/auth behavior, storage architecture, remote service, or historical evidence was changed.
- [x] 9.5 Stop after local readiness artifacts are complete; leave every registrar, DNS, DNSSEC, Cloudflare custom-domain/redirect, Supabase/OAuth, payment-dashboard, email-provider, analytics, and production deployment action unexecuted until separately authorized.
