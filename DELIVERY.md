# FigMemento delivery handoff

FigMemento is a multilingual personalized-gift storefront with a validated
local commerce core. This is the single entry point for a production
integrator.

- Repository: `https://github.com/muyou-suibe/figmemento-frontend-preview.git`
- Authoritative branch: `main`
- Frozen delivery source: `af60bc8a2c47b2d0edab9c23bcf0d42d49ee6f15`
- Frozen tag: `handoff-local-v2-2026-09-17`

## Delivery status

- **LOCAL CORE + CUSTOMER EXPERIENCE: COMPLETE AND VALIDATED**
- **VISUAL V2: ADOPTED**
- **LOCAL_PERSISTENT INTEGRATION: VALIDATED**
- **GITHUB MAIN: PUBLISHED**
- **PRODUCTION INTEGRATION: PENDING**
- **PRODUCTION DEPLOYMENT: NOT STARTED**

This repository is a validated local-development handoff. It is not a claim
that the application is production-ready.

## What is complete

The local core includes Catalog, customer authentication, Cart,
Customization, upload/media processing, Checkout, immutable Orders, local
Payment simulation, Fulfillment, local Tracking, Admin commerce, digital
delivery contracts, the adopted Visual V2 storefront, and responsive EN/ES/ZH
customer presentation.

The accepted validation baseline is:

- Visual V2 focused tests: 6/6 PASS
- customer-polish tests: 13/13 PASS
- offline tests: 923/923 PASS
- rendered tests after a fresh build: 12/12 PASS
- OpenSpec strict validation: 23/23 PASS
- typecheck, build and full `npm run verify`: PASS
- lint: PASS with the one documented existing `img` warning
- local migration source verification: 37/37 PASS

These counts describe the accepted source snapshot. Re-run the commands below
and record current results rather than treating the counts as permanent.

## What remains for production

Production integration is still required for all of the following:

- production Supabase database and RLS/RPC acceptance;
- production private Storage and retention policy;
- OTP and Google authentication;
- Stripe and PayPal, including verified provider webhooks and refunds;
- Resend or another transactional email provider;
- 17TRACK or another carrier/tracking provider;
- GA4, Meta Pixel and TikTok analytics with consent handling;
- Cloudflare project, domain, DNS, TLS and rollback setup;
- production Admin Catalog persistence;
- Supplier persistence/integration;
- photo content-quality recognition;
- monitoring, alerting and incident ownership;
- production end-to-end acceptance and deployment.

Do not activate a production source merely by filling an environment variable.
Each item requires its own approved adapter, security review and acceptance.

## Reproduce the accepted source

Requirements: Git, Docker Desktop, Node.js `>=22.13.0`, npm, and the repository
version of Supabase CLI (`2.114.0`, installed through npm).

```bash
git clone https://github.com/muyou-suibe/figmemento-frontend-preview.git
cd figmemento-frontend-preview
git checkout handoff-local-v2-2026-09-17
npm ci
npm run lint
npm run typecheck
npm run test:offline
npm run build
npm run test:rendered
npx openspec validate --all --strict
node --experimental-strip-types scripts/local-commerce-migrations.mjs verify
```

Run `npm run build` immediately before `npm run test:rendered`. The historical
7/11 rendered baseline and the accepted present-day 12/12 result are distinct
facts; do not rewrite the historical evidence.

## Start an isolated local persistent environment

Never copy the owner's database, retained Docker volumes, `.env.local`, media,
credentials or runtime directories. Create your own ignored local environment
from the checked-in templates:

```bash
cp .env.example .env.local
cp local/commerce/example.env local/commerce/.env.local
```

Generate new local-only secrets and populate the ignored files. Do not commit
them. Load the `local/commerce/.env.local` values into the shell before running
the commerce commands; the scripts intentionally do not treat a tracked file
as secret authority.

First run the offline gates. If an exact retained-development stack was already
initialized by the guarded operator procedure, start and inspect that stack:

```bash
node --experimental-strip-types scripts/local-commerce-doctor.mjs
node --experimental-strip-types scripts/local-commerce-migrations.mjs verify
node --experimental-strip-types scripts/local-commerce-stack.mjs start
node --experimental-strip-types scripts/local-commerce-stack.mjs health
```

The retained initializer is not a generic fresh-clone bootstrap: it requires an
exact pre-created retained volume set and refuses an existing running stack.
Do not run it casually or copy retained volumes to satisfy that precondition.
For from-zero database acceptance, use a unique disposable run and the guarded
`prepare-disposable`/`apply-disposable` workflow in
`local/commerce/README.md`. Never use `db push`, link this workspace to a
remote project, reset retained development, or relabel an old database.

Start the loopback-only image helper in a separate terminal after exact marker,
project, PostgreSQL 17, ledger and endpoint verification:

```bash
node --experimental-strip-types local/commerce/image-helper/server.mjs
```

If synthetic development Catalog/customer data is needed, use only the guarded
demo setup after the exact local environment is healthy:

```bash
node --experimental-strip-types scripts/local-commerce-customer-demo.mjs --confirm-local-customer-demo
```

For an initialized retained stack, select `local_persistent` only for the same
verified project and start the application. Without that stack, leave durable
selectors disabled (or use the documented `local_fake` development boundary):

```bash
npm run dev
```

The source selectors and required server-only names are documented in
`.env.example`. Unknown, mixed-project, remote, staging and production local
composition must fail closed. `local_fake` remains a separate process-memory
development boundary.

## Migration freeze

- `schemaVersion`: 37
- SQL migrations: 37
- manifest entries: 37
- `0001` through `0037`: immutable
- `0038`: absent; any approved future forward migration starts at `0038`
- accepted publication-only whitespace exception: `0017` and `0025`

Never edit an applied migration, including whitespace or line endings. Verify
all source checksums against `local/commerce/migrations/manifest.json`. The
exception rationale is in
`docs/production-handoff/12-immutable-migration-whitespace-exception.md`.

## Protected contracts

Do not bypass or duplicate the existing server authority boundaries. In
particular, preserve Catalog authority; immutable Order snapshots; Cart CAS and
idempotency; guest/member ownership separation; private receipt/media
authorization; Payment/Fulfillment/Tracking/Digital action replay; tax
`not_activated`/`null`; and the fail-closed production/source matrix.

Supplier persistence is unsupported. The existing Supplier simulation is
development/test-only and must not be promoted into a durable or production
authority.

## Documentation map

- [Production handoff index](docs/production-handoff/README.md)
- [Environment and provider inventory](docs/production-handoff/02-production-environment.md)
- [Code handoff manifest](docs/production-handoff/11-code-handoff-manifest.md)
- [Immutable migration exception](docs/production-handoff/12-immutable-migration-whitespace-exception.md)
- [Local commerce operations](local/commerce/README.md)
- [Visual V2 evidence](docs/visual-v2/README.md)
- [Visual V2 adoption review](docs/visual-v2/adoption-review.md)
- [Production E2E checklist](docs/production-handoff/10-production-e2e-checklist.md)
- [OpenSpec project and active changes](openspec/)

The production integrator should begin with environment ownership, provider
decisions, canonical production data mapping and staging security acceptance.
Deployment is the final step, not the first.
