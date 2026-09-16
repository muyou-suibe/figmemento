# 11 — Code handoff manifest

Status: **HANDOFF AUDIT COMPLETE — GIT PUBLICATION REQUIRED**

This manifest describes the accepted local source tree that must be reviewed
and published before a production integrator can reproduce it from Git. It is
an inventory only. It does not authorize deployment, remote service access,
production migrations, provider activation, or changes to the frozen local
commerce authority.

## Repository identity

- Repository root: `/Users/youmu/Documents/个性化礼品定制独立站`
- Branch: `feat/build-configurable-product-catalog`
- HEAD: `d9b5fe1f03610bb203f10009148c605f4ba6be0d`
- Remote: `origin` → `https://github.com/muyou-suibe/figmemento-frontend-preview.git`
- Upstream branch: none configured for the current branch
- Audit date: 2026-09-16 (Asia/Shanghai)
- Git snapshot at audit: 186 tracked files, 50 modified tracked files,
  1,036 non-ignored untracked files, and 0 staged paths

The local accepted tree is therefore **not reproducible from the current
remote clone**. The current branch has no upstream, the accepted implementation
contains both uncommitted tracked changes and required untracked source, and
the production handoff package itself is untracked.

## Required handoff contents

The following existing areas are required source or required engineering
context. Review their individual changes before publication; do not replace
them with generated output.

### Application and runtime source

- `app/` — storefront, account/admin surfaces, routes, domain/application
  services, server-only authorization boundaries, infrastructure adapters,
  local commerce composition, and presentation source.
- `worker/` — Worker entry point.
- `build/sites-vite-plugin.ts` — source build integration; this tracked source
  file is distinct from generated `dist/` output.
- `db/`, `drizzle/`, `drizzle.config.ts`, and `examples/` — schema/source
  inventory and development examples used by the repository.
- `preview/` — GitHub Pages preview source (not generated preview output).
- `public/`, including `public/brand/figmemento-logo.png` — committed/static
  public assets.

### Local commerce persistence foundation

- `local/commerce/README.md`, `example.env`, project-marker example, runbooks,
  and accepted evidence documents.
- `local/commerce/image-helper/` — separate trusted image-helper source and its
  package metadata.
- `local/commerce/migrations/` — ordered local migration source, manifest,
  checksums, rollback notes, and forward-fix rules for versions `0001`–`0037`.
- `local/commerce/supabase/config.toml` — isolated local stack configuration.
- Exclude every path covered by `local/commerce/.gitignore`, especially
  runtime state, temporary Supabase state, volumes, branches, and local env
  files.

### Verification, specifications, and evidence

- `tests/` — offline, rendered, security, migration-contract, browser/runtime,
  restart/recovery, and evidence-verifier suites plus synthetic fixtures.
- `openspec/` — project rules, current specs, archived changes, the completed
  `complete-local-commerce-persistence` change, its accepted evidence, and
  production-integration planning artifacts.
- `docs/` — architecture, boundary audits, development runbooks, visual
  references, and production handoff material.
- `docs/production-handoff/` — this package, files `01`–`10`, README, status
  matrix, and this manifest.
- `scripts/` — local commerce doctor, isolated stack, ledger, migration,
  pre-apply, retained-stack, and acceptance support tooling.
- `.agents/skills/` — repository-local OpenSpec workflow instructions. Ignore
  only OS metadata inside the directory.

### Engineering and automation configuration

- `package.json` and `package-lock.json`.
- `tsconfig.json`, `eslint.config.mjs`, `vite.config.ts`, `next.config.ts`, and
  `postcss.config.mjs`.
- `.env.example` and `local/commerce/example.env` as templates only; neither
  may contain real credentials.
- `.gitignore`, `local/commerce/.gitignore`, and `supabase/.gitignore`.
- `.github/workflows/github-pages-preview.yml` — currently untracked CI source
  that requires owner review before inclusion.
- `.openai/hosting.json` — tracked hosting configuration metadata; its presence
  does not authorize deployment.
- `supabase/` — current canonical schema/migration source and local config.
  These files must be handed off for review, but they are **not** authorization
  to apply a production migration.
- `README.md`, `独立站构建项目需求.md`, and other tracked root engineering
  files.

## Keep for evidence and development

These materials are not production runtime payloads, but should remain in the
engineering handoff because they explain and independently verify the accepted
contracts:

- OpenSpec proposals, designs, tasks, specs, archived changes, and evidence.
- Task 1.1 historical rendered source event and recovery verification.
- Task 10 browser evidence, Task 11 recovery/concurrency/fault evidence, and
  Task 12 quality/traceability evidence.
- Synthetic database/test fixtures and disposable-stack tooling under
  `tests/`, `scripts/`, and the non-runtime parts of `local/commerce/`.
- The five synthetic Task 10.8 browser screenshots under the accepted OpenSpec
  evidence directory.
- Development/demo/reference documentation under `docs/demo/` and
  `docs/design-reference/`.
- The GitHub Pages preview source under `preview/`.
- The historical archived OpenSpec ZIP, provided it remains intentionally
  retained as evidence and is not treated as executable production input.

## Excluded local and generated contents

The following existing or conventionally generated paths are not project
source and must not be included in a code handoff archive or commit:

- `.env.local` and any `.env`, `.env.*`, `.dev.vars`, private-key, credential,
  or secret override files. Only reviewed templates belong in Git.
- `node_modules/` (approximately 844 MB at audit time).
- `dist/`, `.next/`, `.vinext/`, `out/`, coverage output, `outputs/`, and
  `work/`.
- `.wrangler/`, including runtime logs/cache.
- `.local/`, including the locally downloaded Stripe CLI binary.
- `local/commerce/runtime/`, all disposable run workdirs/markers/logs,
  `local/commerce/.supabase/`, `local/commerce/supabase/.temp/`, branch state,
  local volumes, and generated start secrets.
- `supabase/.temp/` and `supabase/.branches/`.
- Docker containers, networks, volumes, database data directories, and private
  Storage runtime objects. These are infrastructure state, never repository
  source.
- `.DS_Store`, editor/OS metadata, debug logs, transient screenshots, and
  ad-hoc test output outside an intentionally indexed evidence directory.
- Real customer records, uploaded customer media, exports, database dumps, or
  analytics payloads. None is authorized for Git handoff.

The existing ignore rules cover the principal local env, dependency, build,
Wrangler, OS-metadata, and local-commerce runtime paths. A reviewer must still
inspect the final proposed Git diff because ignore rules do not sanitize files
that are deliberately added or already tracked.

## Security handoff rules

- The handoff-source scan covered 1,222 tracked plus non-ignored untracked
  candidate files and found no high-confidence literal private key, Stripe
  secret/webhook key, Supabase secret, JWT, Google client secret, AWS access
  key, GitHub token, Resend key, or credential-bearing database URL.
- `.env.local` is ignored and contains set values for local Admin, guest-owner,
  Stripe, and Supabase secret categories. Their values were not copied into
  this report. The file must remain excluded; if any value is not purely local
  test material, the owner must rotate it before sharing the machine or an
  archive.
- `.env.example` and `local/commerce/example.env` contain empty,
  placeholder/local, or non-secret configuration examples. Populate real
  values only in an approved secret manager or deployment environment.
- No confirmed real customer upload was found among repository candidates.
  Non-ignored binary/media candidates are the official brand logo, synthetic
  acceptance screenshots, and an intentional historical OpenSpec archive.
- Never expose service-role credentials, signing secrets, raw session/order
  capabilities, private object locators, payment credentials, customer data,
  or provider tokens through Git, logs, screenshots, evidence JSON, or client
  configuration.

This is a bounded static scan, not a substitute for secret scanning on the
final commit and its complete Git history. Run an approved scanner again on
the exact proposed commit before publishing it.

## Local accepted baseline

- OpenSpec change: `complete-local-commerce-persistence`
- Tasks: **85 checked / 0 unchecked / 85 total**
- Task 1.1: checked; historical rendered 7/11 evidence remains a distinct
  accepted historical fact from the current rendered 11/11 result.
- Local migration files: **37**, ordered `0001`–`0037`.
- Migration manifest: `schemaVersion = 37`, 37 entries, versions 1 through 37.
- `0038`: absent.
- Local core classification: **frozen, local development/test persistence
  acceptance**.
- Existing production handoff package: present (`README`, `01`–`10`, and
  `handoff-status.md`), but untracked at this audit snapshot.

No migration was executed or modified during this audit.

## Production boundaries

The accepted local baseline does not complete or authorize:

- production deployment or DNS cutover;
- canonical production Supabase migration/backfill or remote database access;
- Supabase Auth, OTP, Google OAuth, or production identity migration;
- Stripe or PayPal production payment processing and webhooks;
- Resend transactional email;
- 17TRACK or another real carrier/tracking integration;
- production private Storage/provider selection and migration;
- GA4, Meta Pixel/CAPI, or TikTok analytics activation;
- production end-to-end acceptance;
- Supplier persistence, C1 historical backfill, or Customization Phase C.

The future integrator must adapt providers to the accepted server-owned
Catalog, Cart, Draft/media, Checkout, Order, Payment, Fulfillment, Shipment,
Tracking, and digital-delivery boundaries. Provider payloads and browser input
must not become business authority.

## Git handoff status

**Can an integrator clone the current remote and receive the complete accepted
85/85 project? NO.**

At this audit snapshot:

- 50 tracked files contain unstaged modifications;
- 1,036 required-or-reviewable non-ignored files are untracked, including most
  of the accepted application expansion, tests, local commerce source,
  OpenSpec artifacts, scripts, CI workflow, and production handoff docs;
- the current branch has no configured upstream;
- no matching remote-tracking branch for the current branch is present in the
  local refs;
- this audit intentionally did not fetch, commit, stage, or push.

Therefore the known remote commit cannot reproduce the accepted working tree,
regardless of any unverified remote-side changes made after the last local
fetch.

### Recommended owner-reviewed Git action

1. Review the complete tracked diff and every non-ignored untracked path by
   classification in this manifest.
2. Ensure ignored runtime/secret/generated paths remain excluded and run a
   secret/history scan against the exact proposed commit.
3. Decide whether the accepted baseline belongs on the current branch or a
   dedicated handoff branch, and confirm the intended remote repository (the
   configured remote is named `figmemento-frontend-preview`).
4. Create an owner-reviewed commit that includes all required source,
   migrations, tests, OpenSpec evidence, scripts, assets, configuration
   templates, and handoff docs—without local runtime or credentials.
5. Run the accepted validation gates from that exact clean commit, then push
   only with separate authorization and provide the integrator an immutable
   commit SHA/tag.

No Git publication action was performed by this audit.
