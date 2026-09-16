# Task 4.1 — fresh disposable database acceptance

Observed 2026-09-11. This supersedes the partial conclusion in
`task-4.1-acceptance.md`, without changing that historical evidence.

## Scope and execution boundary

The old `run-20260911a1b2` database was not modified, reset or backfilled.
Its native history remains insufficient evidence for a custom checksum ledger.
No historical ledger rows were reconstructed.

The disposable-only migration commands are now:

- `node scripts/local-commerce-migrations.mjs prepare-disposable --confirm-new-project`
- `node scripts/local-commerce-migrations.mjs apply-disposable --confirm-new-project`
- `node scripts/local-commerce-migrations.mjs plan-disposable`

They require the existing explicit test/disposable environment and unique run ID.
Preparation verifies manifest, original SQL checksums, ordered versions and exact
project identity. Generated SQL wrappers place each migration and its custom
ledger row in one transaction. Version 1 requires an absent schema; subsequent
versions validate the exact prior ledger prefix, and after project initialization
also the marker. Migration 2 creates the fresh disposable project identity.
Ledger project lineage is the actual disposable project, not the template name.
The ledger checksum refers to reviewed original SQL; separately checked generated
wrapper bytes contain the execution envelope. Supabase CLI owns its native
history; the wrapper does not insert into internal `schema_migrations`.

Existing stack startup/port checks remain in use. There is no reset or repair-old
database command in this path. A failed initial new run `run-b6804f93` encountered
the CLI analytics default port 54327 conflict. Only new generated configuration
was corrected to disable unneeded analytics; no competing service was stopped.

## Fresh database evidence

Successful run: `run-68938831`.
Project: `figmemento-local-commerce-test-run-68938831`.
PostgreSQL: **17.6**. Supabase CLI: **2.114.0**.
Local API: `http://127.0.0.1:55431`; DB port: `55432`.
Full sanitized HTTP/checksum evidence: `task-4.1-real-db-evidence.json`.
Reproducible acceptance entry:
`NODE_ENV=test node tests/database/local-commerce-catalog-acceptance.mjs run-68938831 --confirm-disposable`.

All 15 acceptance groups passed, against actual local PostgreSQL/PostgREST/Storage
and actual Catalog/rule adapters. Private synthetic fixture setup uses service-role
HTTP; it is not a public seed or price mutation endpoint.

- Custom ledger: 7 rows, versions 1–7, exact manifest IDs/checksums and actual
  project lineage. Database planner rerun: **apply 0 / skip 7**.
- 36 RLS tables: anon GET/POST/PATCH/DELETE **401** on each; authenticated
  GET/POST/PATCH/DELETE **403** on each; service-role GET **200** on each.
- Identity RPC: correct project/marker true; wrong project or marker false.
  Both restricted identity/Catalog RPCs reject anon **401** and authenticated
  **403**; service role succeeds; fixed security-definer search paths checked.
- Storage bucket private: anon upload **400** denied; service-role
  upload/download/delete **200**, bytes verified and test object removed.
- Duplicate ledger write rolls back the transaction's DDL effect; ledger stays 7.
  Separate Order/payment/receipt FK-failure transaction leaves all three at zero.
- Actual Product/Variant/SKU/options/configuration/customization/fulfillment and
  price/currency read succeeds. No canonical `selectedSpecificationKey` added.
- Wrong marker/project rejected; cross-project FK write **409** rejected.
  Stale configuration and expected row versions rejected. Mutating existing fake
  Admin Catalog leaves persistent Catalog unchanged.
- Bounded shipping: USD 500 cents, 5–10 display days, plus unsupported and
  not-applicable states. No carrier/real ETA claim.
- Coupon valid/invalid/expired/not_applicable returns 500/0/0/0 cents in the
  tested cart; non-valid selectors do not themselves make the authority
  unavailable. Browser discountAmount ignored. Tax stays
  `{status: "not_activated", amountCents: null}`.
- Real rule update increments version; stale version rejected. Unavailable
  authority produces no memory fallback.
- Production/staging/unknown/remote/mixed composition fail closed. Explicit test
  source executes against the test project. Development source is recognized,
  but development pointing at this test-marked stack is intentionally rejected.
  A retained development database was not accessed for acceptance.
- Fake provider sentinel: zero DB client constructions and zero network calls.

## Migration identity

0001–0006 SQL/checksums unchanged. Before first application, 0007 added the
service-role-only categories policy and minimum CRUD grants. Manifest version 7:

`98017e6d5b61f37d6137656be0d6d971ee66c8efb963e81b03443c0369c4ee2f`

## Validation

Executed independently, in order; every command exited **0**:

| Entry | Actual result |
| --- | --- |
| Ledger/security/Catalog focused tests | 27/27 |
| npm run lint | 0 errors; 1 pre-existing image warning |
| npm run typecheck | PASS |
| npm run test:offline | 913/913 |
| npm run build | PASS, fresh build |
| npm run test:rendered | 11/11, after fresh build |
| npm run verify | PASS; offline 913/913, fresh build then rendered 11/11 |
| openspec validate --all --strict | 23/23 |
| git diff --check | PASS |

Logs: `/private/tmp/task41-final-*.log`. New focused tests are run explicitly;
their 27 tests must not be presented as part of the existing offline count.

## Task and authority boundary

Task 2.7 remains checked based on this fresh database evidence. Task 4.1 is now
checked: **20/85**. Task 1.1 remains unchecked/blocked; 3.1–3.6 unchanged.
Task 4.2 and later work was not started. Persistent Checkout/Cart mutation and
later HTTP integration are not claimed by this read-authority acceptance.

No storefront visual, Supplier, payment/email provider, production/root Supabase
workflow or existing business semantics changed. No remote Supabase, real Auth,
deployment, stage, commit or push. Existing unrelated worktree edits preserved.

## Files in this closure

- app/application/local-commerce-migration-ledger.ts — reject ledger version gaps.
- scripts/local-commerce-migrations.mjs — explicit disposable execution commands.
- scripts/local-commerce-ledger-wrapper.mjs — atomic ordered wrappers.
- scripts/local-commerce-ledger-disposable.mjs — identity-bound prepare/start/plan.
- local/commerce/migrations/0007_local-commerce-catalog-authority.sql — categories security.
- local/commerce/migrations/manifest.json — final 0007 checksum.
- tests/local-commerce-security-boundary.test.mjs — 36-table contract.
- tests/local-commerce-ledger-execution.test.mjs — wrapper/planner negative tests.
- tests/database/local-commerce-catalog-acceptance.mjs — actual isolated DB acceptance.
- local/commerce/task-4.1-real-db-evidence.json — sanitized actual HTTP and ledger evidence.
- local/commerce/task-4.1-acceptance.md — historical report supersession link only.
- local/commerce/task-4.1-final-acceptance.md — this report.
- openspec/changes/complete-local-commerce-persistence/tasks.md — only 4.1 checked.

Next recommended task is 4.2 after this acceptance review; do not begin it here.
