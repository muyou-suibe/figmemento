## Why

The application still exposes the temporary `PhotoGift` identity and derives public origins from several hardcoded or loosely validated sources. Before production cutover, FigMemento needs one explicit brand/domain contract, deterministic canonical and staging behavior, and a reviewed deployment runbook that does not rename historical business identities or guess provider-specific settings.

## What Changes

- Establish `FigMemento`, `https://figmemento.com`, `figmemento.com`, and `staging.figmemento.com` as the approved public brand and hostname inputs.
- Inventory and classify current brand, origin, SEO, cookie, callback, email, analytics, fixture, documentation, and historical/internal-name occurrences before implementation; do not perform a blind replacement.
- Introduce a provider-neutral application brand/domain configuration boundary with public constants, validated deployment context, and server-only configuration kept separate.
- Migrate user-visible application identity to FigMemento without rewriting Product/Category content, customer content, database identities, migrations, stable API identifiers, or Git history.
- Make production SEO consistently use the canonical production origin while preserving data-driven Product/Category canonical paths; make staging and provider preview deployments noncanonical and non-indexable.
- Define `figmemento.com` as the production canonical host, a permanent path/query-preserving redirect from `www.figmemento.com`, and explicit noncanonical handling for staging and preview hosts without redirect loops.
- Add a provider-aware but target-neutral Cloudflare/DNS/custom-domain runbook, including registrar, nameserver, DNSSEC, staging, cutover, verification, and rollback gates. Concrete record targets remain deployment-time inputs.
- Record the later Supabase Auth, Google OAuth, OTP, Stripe, PayPal, email DNS, and analytics configuration points affected by the final origin; this change does not mutate or expand those systems.
- Add deterministic offline tests for brand configuration, host classification, canonical/robots/sitemap behavior, visible identity, and redirect policy. Existing `.test` request origins may remain where they are merely isolated test infrastructure; new brand assertions use `figmemento.test` and never contact production.
- Produce a separately authorized production cutover checklist. Planning and application of this change do not themselves authorize DNS mutation, remote configuration, or deployment.

Out of scope: visual identity design; catalog or order semantics; schema, IDs, slugs, tables, migrations, or Supabase data; payment behavior; customer authentication implementation; email-provider records; analytics credentials; object-storage decisions; and production publication.

This change is parallel to `build-configurable-product-catalog`: it may integrate with that change's storefront and SEO surfaces but does not edit its artifacts or business behavior. Production remains blocked by that change's own migration and preflight gates.

## Capabilities

### New Capabilities

- `brand-domain-configuration`: Defines the authoritative FigMemento application identity, production/staging/preview hostname and SEO behavior, safe visible-copy migration, deployment dependency inventory, and operator-gated domain cutover requirements.

### Modified Capabilities

- None. The existing `engineering-foundation` requirements remain in force and are not changed by this proposal.

## Impact

- Expected implementation surfaces include public/server configuration modules, root and catalog metadata, sitemap and robots routes, storefront/admin copy, operational exports, environment examples, current architecture documentation, and offline/rendered tests.
- Cloudflare DNS/custom-domain settings, Supabase Auth redirect settings, OAuth consoles, payment dashboards, email DNS, and analytics properties are documented dependencies only; changing them requires later explicit authorization.
- Existing technical identifiers such as `PHOTOGIFT_PRODUCT_SOURCE`, `photogift-uploads`, `photogift-admin-session`, approved migration filenames/history, database constraints, fixture URLs, archived specifications, and historical baseline records are preserved unless a separately reviewed compatibility plan approves a rename.
- Main risks are split-brain origins, staging indexation, host redirect loops, payment/auth callbacks using the wrong origin, support-contact fabrication, and accidental churn to stable internal identities. Central configuration, environment classification, tests, and operator gates mitigate these risks.
