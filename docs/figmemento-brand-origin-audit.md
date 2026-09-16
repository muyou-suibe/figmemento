# FigMemento Brand and Origin Audit

## Audit result

**BRAND/DOMAIN BATCH 1 — AUDIT COMPLETE**

The current worktree was audited before any application edit. The audit does
not implement the FigMemento brand, domain, SEO, redirect, authentication,
payment, email, analytics, DNS, or Cloudflare changes owned by later tasks.

Audit date: 2026-08-17 (Asia/Shanghai)

- Git-tracked files in the repository: **118**.
- Files present in the audited `app/`, `worker/`, `build/`, `tests/`, `docs/`,
  `openspec/`, `public/`, and `supabase/` scope: **321**.
- The current worktree contains pre-existing untracked implementation,
  migration, documentation, and planning files. They were inspected as
  current worktree evidence; this batch did not stage, delete, or normalize
  them.
- Secret values were not printed or copied into this document.
- No remote service, database, DNS, Cloudflare API, payment dashboard, email
  provider, analytics provider, or deployment environment was accessed.

## Classification rules

Every meaningful occurrence is assigned exactly one category below. Counts in
the summary are reviewed occurrence clusters or evidence families, not raw
case-insensitive token counts.

| Category | Meaning | Batch treatment |
|---|---|---|
| **A. PUBLIC IDENTITY TO MIGRATE** | Application-owned visible brand identity and approved future FigMemento identity targets. | Migrate only in later user-visible identity tasks; do not rewrite Product or customer content. |
| **B. ACTIVE OPERATIONS / CONFIG TO MIGRATE** | Current origin, SEO, runtime, or operational configuration that later needs a single brand/origin authority. | Preserve behavior in Batch 1; migrate through the approved configuration/SEO tasks. |
| **C. OFFLINE / LOCAL FIXTURE TO RETAIN OR CLARIFY** | Reserved local, test, fixture, sentinel, or disposable-environment values. | Retain for offline isolation; never point them at production. |
| **D. COMPATIBILITY-SENSITIVE TECHNICAL DEBT TO RETAIN** | Stable internal names, cookie names, buckets, order prefixes, package/template identifiers, or active technical references. | Preserve unless a separate compatibility plan approves a rename. |
| **E. HISTORICAL EVIDENCE TO PRESERVE** | Archived changes, baselines, migration/bootstrap evidence, prior handoffs, and Git history. | Preserve verbatim; these are not current public identity authority. |
| **F. EXTERNAL DEPLOYMENT DEPENDENCY** | Values or integrations requiring provider, business, security, or deployment-owner decisions. | Record as unresolved; do not invent or activate. |
| **G. UNCLASSIFIED / BLOCKED** | Meaningful occurrence whose ownership or compatibility cannot be established. | The formal review result is **0**; no occurrence remains in this category. |

## 1. Occurrence classification

### A — Public identity to migrate

The following 18 active application-visible occurrence clusters are
application-owned identity and are later migration targets:

- `app/site-config.ts`: `PhotoGift` brand name and the current public brand
  object used by root metadata.
- `app/layout.tsx`: root title/application name/author/Open Graph/Twitter/site
  structured-data identity sourced from `siteConfig`.
- `app/page.tsx`, `app/loading.tsx`, `app/not-found.tsx`:
  storefront, loading, and not-found identity.
- `app/info-page.tsx`, `app/faq/page.tsx`, `app/privacy/page.tsx`,
  `app/terms/page.tsx`, `app/shipping-returns/page.tsx`:
  information-page shell, titles, descriptions, and visible brand copy.
- `app/shop/page.tsx`, `app/category/[slug]/page.tsx`,
  `app/storefront/CatalogShell.tsx`, `app/storefront/CatalogStatus.tsx`,
  `app/storefront/catalog-metadata.ts`:
  public catalog shell, status, and catalog metadata identity.
- `app/admin/login/page.tsx`, `app/admin/orders/page.tsx`,
  `app/admin/products/page.tsx`:
  application-owned operational headings and admin identity.
- `app/track-order/page.tsx`: order-tracking page identity.

The approved future targets are `FigMemento`, `https://figmemento.com`,
`figmemento.com`, and `staging.figmemento.com`. They are classification targets
only in this batch. No public copy was changed.

Product names, Product descriptions, Category content, customer content, and
catalog-controlled marketing content are not blanket brand-replacement
targets. They remain Product/business data and require their own review.

### B — Active operations / configuration to migrate

The following active implementation/configuration clusters are identified for
later tasks:

- `.env.example`: `NEXT_PUBLIC_SITE_URL` and `NEXT_PUBLIC_BRAND_NAME`, with a
  localhost development value and PhotoGift fallback; these are current public
  configuration inputs, not a production FigMemento authority.
- `app/config/public.ts`: `PublicSiteConfig`, `NEXT_PUBLIC_SITE_URL`,
  `NEXT_PUBLIC_BRAND_NAME`, localhost fallback, and PhotoGift fallback.
- `app/layout.tsx`: root metadata and structured data currently have no
  `metadataBase`; their identity currently comes from `siteConfig`.
- `app/application/catalog-seo.ts`, `app/storefront/catalog-metadata.ts`,
  `app/shop/page.tsx`, `app/category/[slug]/page.tsx`, and
  `app/product/[slug]/page.tsx`: application-relative Product/Category paths
  are composed with the current `PublicSiteConfig.siteUrl`.
- `app/sitemap.ts`: sitemap origin comes from `getPublicSiteConfig()` and
  public catalog paths come from the catalog read model.
- `app/robots.ts`: the sitemap reference comes from `getPublicSiteConfig()`;
  `/admin/` and `/api/` remain disallowed.
- `app/api/orders/route.ts`: Stripe success/cancel URLs currently derive from
  the request origin. This is payment trust-boundary behavior and is deferred
  to the payment change; it is not altered here.
- `vite.config.ts`, `worker/index.ts`, `build/sites-vite-plugin.ts`, and
  `.openai/hosting.json`: active vinext/Vite/Cloudflare/Sites runtime support.
  These files contain no concrete production hostname and must remain
  operational.
- Current README and architecture/configuration guidance describe PhotoGift
  as the application identity and are later documentation migration targets;
  technical names inside them are separately classified as D or E where
  applicable.

### C — Offline / local fixture to retain or clarify

The following are intentionally non-production origins or fixture values:

- Security and request-boundary tests use reserved `https://photogift.test`,
  `https://attacker.test`, and `https://provider.test` values.
- Offline customization/configuration tests use `https://example.test` and
  `https://example.com` as rejection markers, fake URLs, or non-production
  fixtures.
- Local rendered/smoke tests use `localhost` and `127.0.0.1`; the local smoke
  harness binds a loopback sentinel and never uses a public domain.
- `app/chatgpt-auth.ts` uses `https://app.local` as an internal URL-parsing
  sentinel, not as a public deployment origin.
- `supabase/config.toml` uses `http://127.0.0.1`, local Auth redirect values,
  and local SMTP testing configuration.
- `.env.example` uses `http://localhost:3000` as a local setup example.
- `docs/local-demo.md` uses localhost and explicitly prohibits production
  credentials, DNS, Cloudflare values, and live provider access.
- ProductAsset and upload tests use reserved `example.test`/provider values to
  prove private-reference rejection and controlled fallback behavior.

Current worktree counts for primary reserved-origin markers are: 46 lines for
`photogift.test`, 18 for `example.test`, 12 for `example.com`, 16 for
`localhost`, and 10 for `127.0.0.1`. These are fixture/sentinel evidence, not
production origin claims. No test is permitted to contact `https://figmemento.com`.

### D — Compatibility-sensitive technical debt to retain

These identifiers are stable technical contracts or currently active names,
not public-brand replacement targets in Batch 1:

| Identifier/family | Evidence | Preservation decision |
|---|---|---|
| `PHOTOGIFT_PRODUCT_SOURCE` | `app/config/server.ts`, `app/config/catalog-runtime-environment.ts`, `.env.example`, tests, README | Preserve exact variable name and production fixture rejection semantics. |
| `photogift-uploads` | `app/config/server.ts`, `.env.example`, legacy Supabase storage operations | Preserve until a separately approved storage/provider compatibility change. |
| `photogift-admin-session` | `app/lib/admin-auth.ts` and admin routes | Preserve cookie name. It is HttpOnly/SameSite and has no explicit `Domain`, so current behavior is host-only. |
| `photogift-guest-draft-owner` | `app/lib/guest-draft-owner.ts` | Preserve until a separate cookie compatibility/security review. |
| `PG-` order prefix | `app/api/orders/route.ts`, lookup/admin routes, tests, legacy data contract | Preserve order lookup, validation, and historical order identity. |
| Product/Category/order IDs and slugs | C1 preflight, repositories, routes, database evidence | Preserve all stable IDs, Product slugs, Category IDs/slugs, order IDs, and existing references. |
| Supabase names and runtime paths | Supabase clients, SQL/bootstrap files, `supabase/config.toml`, README | Preserve Supabase as the authoritative MVP business database; do not rename technical references. |
| Package/template identifiers | `package.json`, `package-lock.json`, `worker/index.ts`, `vite.config.ts`, D1/Sites paths | Preserve `site-creator-vinext-starter`, `vinext-starter`, `site-creator-d1`, `site-creator-r2`, and runtime support names. |

Legacy bootstrap SQL, current local migration filenames, database relations,
constraint names/behavior, RLS/policies, and migration ordering are not brand
names. They are compatibility-sensitive and are not renamed by this change.

### E — Historical evidence to preserve

The following evidence must remain available and unchanged:

- `openspec/changes/archive/2026-08-07-stabilize-photogift-foundation/`;
- active C1 and Customization proposals, designs, specs, tasks, schema packets,
  preflight, exception register, and migration handoffs;
- `docs/catalog-schema-baseline.md`, `docs/catalog-product-preflight.md`,
  `docs/catalog-product-preflight-exceptions.md`, and
  `docs/catalog-business-decision-handoff.md`;
- `docs/customization-workflow.md`, upload trust/provider handoffs, migration
  handoffs, and other prior verification records;
- `supabase/schema.sql`, `seed.sql`, `coupons.sql`, and `operations.sql` as
  legacy bootstrap/evidence inputs;
- the six current local migration artifacts under `supabase/migrations/`:
  `20260807151745_expand_configurable_product_catalog.sql`,
  `20260808120000_add_atomic_catalog_sku_graph_rpc.sql`,
  `20260810120000_add_atomic_catalog_lifecycle_rpc.sql`,
  `20260812120000_add_customization_configuration_schema.sql`,
  `20260812121000_add_customization_draft_media_schema.sql`, and
  `20260812122000_add_atomic_customization_publication_rpc.sql`;
- Git history, including the foundation and catalog planning commits.

These local migration artifacts are repository artifacts only. This audit does
not infer remote application or migration history from their filenames.

### F — External deployment dependency

The following dependencies are recorded but unresolved and unexecuted:

- production/staging Cloudflare custom-domain attachment and edge redirect;
- concrete Pages/Worker deployment hostname and provider-discovered DNS target;
- Supabase Auth Site URL and narrow Redirect URL allowlist;
- customer OTP/email-link targets and the actual Supabase Google-provider
  callback if customer authentication is later implemented;
- Stripe return-origin trust and production webhook dashboard configuration;
- future PayPal return/cancel/webhook routes and dashboard configuration;
- approved transactional sender/mailbox and MX/SPF/DKIM/DMARC records;
- GA4, Meta Pixel, and TikTok Pixel properties/IDs;
- production monitoring, TLS, DNSSEC, and rollback evidence.

The current `hello@photogift.example` occurrences in FAQ, privacy, terms,
shipping/returns, and `app/site-config.ts` are temporary public-contact
placeholders. No `support@figmemento.com` or other approved mailbox exists.
They are classified as F because the replacement requires an explicit business,
email-provider, and DNS decision. No mailbox is invented here.

### G — Unclassified / blocked

**0 meaningful occurrences remain unclassified.** The formal review resolved the
classification of runtime, fixture, technical, historical, and external
dependency occurrences before any code edit.

## 2. SEO and origin ownership inventory

| Concern | Current owner/evidence | Current state | Batch decision |
|---|---|---|---|
| Root metadata | `app/layout.tsx`, `app/site-config.ts` | Title, application name, author, Open Graph, Twitter use PhotoGift; no `metadataBase`. | Later migrate through authoritative brand/origin configuration. |
| Product/Category canonical | `app/application/catalog-seo.ts`, `app/storefront/catalog-metadata.ts`, route consumers | Uses application-relative catalog paths and `PublicSiteConfig.siteUrl`. | Preserve data-driven paths; later change only origin authority. |
| Open Graph | `app/layout.tsx`, `app/storefront/catalog-metadata.ts` | Root and catalog metadata emit Open Graph values; catalog URL is composed from current site URL. | Later unify with canonical production policy. |
| Structured data | `app/layout.tsx` JSON-LD | `WebSite` name uses PhotoGift; `SearchAction` target is relative and must be reviewed against real behavior later. | No code change in Batch 1. |
| Sitemap | `app/sitemap.ts` | Builds static/catalog entries from current `siteUrl`; no environment-aware production/staging policy. | Later implement environment-aware policy. |
| Robots | `app/robots.ts` | Allows public paths, disallows `/admin/` and `/api/`, always emits a sitemap reference from current site URL. | Later add staging/preview noindex behavior. |
| Metadata base | Repository search | **NOT FOUND**. | Later add or use the verified vinext-compatible equivalent. |

## 3. Confirmed absences and unknowns

| Item | Repository evidence | Status |
|---|---|---|
| Concrete `pages.dev` hostname | No runtime literal; only the brand-change planning text records the absence. | **NOT FOUND / UNRESOLVED** |
| Concrete `workers.dev` hostname | No runtime literal. | **NOT FOUND / UNRESOLVED** |
| Production deployment target | No provider project/hostname/DNS target in the audited worktree. | **NOT FOUND / UNRESOLVED** |
| PayPal callback implementation | No PayPal route or callback implementation; only planned/deferred references. | **NOT FOUND / UNRESOLVED** |
| Customer Google OAuth implementation | No application Auth/OAuth implementation. Local Supabase config contains disabled/provider-template sections only. | **NOT FOUND / UNRESOLVED** |
| Supabase Auth application integration | No active customer authentication route/client in `app/`; local Auth config exists in `supabase/config.toml`. | **NOT IMPLEMENTED / LATER DEPENDENCY** |
| OTP/email-link application target | No application email-link route or production target. Local Supabase email/OTP configuration is local/template configuration. | **NOT FOUND / UNRESOLVED** |
| Approved support mailbox | Only `hello@photogift.example` placeholder exists. | **NOT FOUND / UNRESOLVED** |
| Transactional sender/domain | No Resend integration, sender approval, or provider value. | **NOT FOUND / UNRESOLVED** |
| Email DNS values | No MX/SPF/DKIM/DMARC production values. | **NOT FOUND / UNRESOLVED** |
| Analytics IDs | No GA4, Meta Pixel, or TikTok Pixel IDs/scripts. | **NOT FOUND / UNRESOLVED** |
| Deployment-specific DNS target | No A/AAAA/CNAME target is recorded. | **NOT FOUND / UNRESOLVED** |
| `APP_DEPLOYMENT_ENV` | Only future planning references; no active runtime implementation. | **NOT FOUND / UNRESOLVED** |
| `NEXT_PUBLIC_DEPLOYMENT_ORIGIN` | Only future planning references; no active runtime implementation. | **NOT FOUND / UNRESOLVED** |

## 4. Compatibility and preservation decisions

### Product/catalog/order identity

All Product IDs, Product slugs, Category IDs/slugs, order IDs, existing order
references, and C1 fixed default Variant UUIDs remain unchanged. Public brand
migration must not change business identity or order lookup behavior.

The `PG-` order-number prefix remains unchanged. Existing order number
validation, admin lookup, customer lookup, Stripe metadata, and historical
records depend on it.

### Migrations, schema, and history

Migration filenames, local migration ordering, migration history evidence,
database relations, constraint behavior/names, RLS/policies, and Supabase
references remain unchanged. No database or migration change is required by
Batch 1. Legacy SQL remains legacy bootstrap evidence, not a brand surface.

### Fixtures and local source selection

Fixtures remain explicitly non-production. `PHOTOGIFT_PRODUCT_SOURCE` remains
the exact source-selection variable; production continues to reject fixture
mode and Supabase failure continues to fail closed. Reserved test origins and
fixture URLs remain offline-only.

### Cookies and storage names

`photogift-admin-session`, `photogift-guest-draft-owner`, and
`photogift-uploads` remain unchanged. The admin and guest cookies are emitted
without an explicit `Domain` attribute, so they are host-only; production adds
`Secure` where the current implementation already does so. A future cookie-name
or Domain-attribute migration requires a separate compatibility/security review.

### Package, repository, template, and Git identity

`site-creator-vinext-starter`, `vinext-starter`, D1/R2 binding names, package
lock identity, repository paths, archived OpenSpec changes, historical
baselines, and Git history are preserved. Public brand migration is not a
repository/package rename.

## 5. Auth, payment, email, analytics, and Cloudflare classification

| Area | Current behavior | Classification |
|---|---|---|
| Supabase Auth | Local `supabase/config.toml` Auth is enabled for local development; no active customer Auth app flow. | F — external/later dependency; local values are C. |
| Google OAuth | No customer implementation or production callback. | F — unresolved external dependency. |
| OTP/email link | Local Auth/email template settings exist; no production sender or callback target. | F — unresolved external dependency. |
| Stripe | Checkout and webhook routes exist. Success/cancel URLs use request origin; no production domain hardcoded in application code. | B now; later payment trust/configuration work is F. |
| PayPal | No implementation. | F — planned external dependency. |
| Support email | Temporary `hello@photogift.example` placeholder only. | F — no approved mailbox. |
| Transactional email | `RESEND_API_KEY` is an empty reserved example variable; no provider integration. | F — unresolved provider/DNS dependency. |
| Analytics | No IDs/pixels/scripts. | F — unresolved external dependency. |
| Cloudflare/vinext | Active runtime/build support in Vite, Worker, Sites plugin, and hosting config. | B — preserve runtime; concrete custom-domain target is F. |

## 6. Formal Batch 1 review before implementation

The review confirms:

1. No meaningful occurrence remains unclassified; G count is **0**.
2. Every public migration target has a file/function ownership and rationale.
3. Compatibility-sensitive identifiers are preserved.
4. Historical evidence, archived changes, baselines, migrations, and Git
   history remain preserved.
5. Offline/test origins remain offline and are not converted to production
   network dependencies.
6. No test targets `https://figmemento.com`.
7. No C1 business semantic is selected for modification.
8. No Customization semantic is selected for modification.
9. No database/migration change is required.
10. No remote, DNS, Cloudflare, payment-dashboard, email-provider, analytics,
    or deployment change is required.

Therefore Tasks 1.1–1.5 are complete. Later tasks may use this document as the
classification boundary, but must re-run the occurrence audit after their own
implementation changes.

## Summary counts for Batch 1

- Public identity clusters to migrate: **18 active application-visible
  clusters**, plus approved future FigMemento targets in planning artifacts.
- Active operations/configuration clusters to migrate or centralize: **11**.
- Primary local/test fixture origin marker lines: **102**, plus additional
  attacker/provider/app-local security sentinels.
- Compatibility-sensitive retained identifier families: **8**.
- Historical evidence families preserved: **6**.
- External deployment dependency groups: **9**.
- Unclassified occurrences: **0**.

No values for hostnames, DNS targets, mailboxes, OAuth callbacks, PayPal
endpoints, analytics IDs, email DNS, or provider bindings are invented here.

## 7. FINAL IMPLEMENTATION RE-AUDIT

Re-audit date: **2026-08-17 (Asia/Shanghai)**

Scope: current final worktree after Brand/Domain Batches 1–5, including
application-owned public identity, configuration, SEO, host/redirect policy,
operator runbooks, dependency handoff, tests, and readiness artifacts. The
re-audit did not access remote services or perform deployment operations.

### Final classification result

- Unexpected active public `PhotoGift` identity occurrences: **0**.
- Unexpected production-looking example origin occurrences: **0**.
- Retained compatibility families: `PHOTOGIFT_PRODUCT_SOURCE`,
  `photogift-uploads`, `photogift-admin-session`,
  `photogift-guest-draft-owner`, `PG-`, legacy technical/template names, and
  stable database/order identifiers.
- Retained test families: `photogift.test`, `photogift.example`,
  `attacker.test`, `provider.test`, `figmemento.test`, `example.test`,
  localhost, and loopback values where they are request-security or offline
  fixtures.
- Retained historical families: legacy bootstrap SQL, migration artifacts,
  archived OpenSpec changes, catalog/preflight baselines, foundation records,
  and historical PhotoGift documentation.
- Unresolved external dependencies: provider deployment target, Cloudflare
  account/zone and DNS evidence, Supabase Auth/OAuth/OTP settings, payment
  dashboard configuration, PayPal routes, support mailbox, email provider and
  DNS records, analytics IDs, TLS/DNSSEC/monitoring evidence.

The remaining `PhotoGift`/`photogift` occurrences match the reviewed
compatibility, offline/test, historical, or external-dependency classifications
above. No active public application surface was newly found that should be
renamed by this change.

### Final offline verification mapping

| Contract | Evidence |
|---|---|
| Approved identity constants and public secret exclusion | `tests/brand-domain-final.test.mjs` — `8.1 final verification mapping` |
| Deployment parser, origin rejection, support contact, fixture source | `tests/config.test.mjs` and `tests/brand-domain-final.test.mjs` — `8.1` |
| Host classification and hostile-host rejection | `tests/brand-domain-batch3.test.mjs` and `tests/brand-domain-final.test.mjs` — `8.2` |
| Exact WWW redirect, path/query preservation, no loop | `tests/brand-domain-batch3.test.mjs` and `tests/brand-domain-final.test.mjs` — `8.2` |
| Production/staging/preview SEO, canonical and robots policy | `tests/brand-domain-batch3.test.mjs` and `tests/brand-domain-final.test.mjs` — `8.2`/`8.3` |
| Production sitemap origin and nonproduction empty behavior | `tests/brand-domain-batch3.test.mjs` and `tests/brand-domain-final.test.mjs` — `8.2` |
| Product/Category canonical composition and unavailable metadata | `tests/brand-domain-final.test.mjs` and `tests/catalog-privacy-regression.test.mjs` — `8.3` |
| Rendered FigMemento identity and local nonproduction canonical safety | `tests/rendered-html.test.mjs` — `8.3` |
| No Brand/Domain production network call | `tests/brand-domain-final.test.mjs` — `8.4` |

Final audit result: **PASS — all remaining legacy occurrences are explained,
and local Brand/Domain readiness is complete without changing frozen business,
customization, visual, migration, or deployment scope.**
