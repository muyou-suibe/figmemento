# Task 4.1 — partial implementation / database gate

Historical report retained. The later fresh-disposable closure is recorded in
[task-4.1-final-acceptance.md](task-4.1-final-acceptance.md); it supersedes the
partial status and the unapplied 0007 checksum below, without backfilling the old DB.

Observed 2026-09-11. Task 4.1 remains unchecked; progress remains 19/85.

## Validation hygiene

The wrong opaque session token now deterministically differs in its last valid
character while retaining length and the `not_found` assertion. No auth runtime
code changed. Fixed 32 independent focused runs passed, each 10/10.

Before Task 4.1 implementation, independent lint, typecheck, offline (913/913),
fresh build, rendered (11/11), verify, OpenSpec strict (23/23), and diff check
all exited 0. Lint retained one existing image warning and no errors.

## Implementation and offline evidence

Added request-scoped Catalog/configuration and bounded checkout-rule readers,
explicit persistent source composition, and an unapplied migration 0007.
The readers use the same-project restricted RPC, existing Catalog parsers and
configured-item admission. No public write/seed endpoint or memory fallback.
Checkout HTTP persistence is not activated here; later tasks own that flow.

Task 4.1 focused tests: 11/11. Combined new reader plus ledger/schema/security
tests: 40/40. These use an injected offline RPC client, NOT a real database.
They cover canonical selections, stale revisions/versions, fail-closed source
matrix, actual fake Admin mutation isolation, bounded shipping, four coupon
states, and tax `{status: "not_activated", amountCents: null}`.

After implementation: verify exit 0 (offline 913/913, fresh build then rendered
11/11, typecheck and lint); separate typecheck and lint exit 0; OpenSpec strict
23/23; diff check exit 0. The new focused suite ran separately from verify.

## Real database blocker

Read-only Docker/psql inspection of the authorized disposable project
`figmemento-local-commerce-test-run-20260911a1b2` found:

- `project_identities`: matching project exists.
- Supabase native `schema_migrations`: entries 0001 through 0006 exist.
- `local_commerce.migration_ledger`: **0 rows**.

Native version/name entries do not prove the custom checksum ledger. No missing
historical ledger entries were manufactured. Migration 0007 was NOT applied;
no synthetic Catalog DB writes or real DB adapter acceptance ran in this turn.
Next prerequisite is to reconcile the actual migration ledger with independently
verified applied SQL evidence, then run Task 4.1 against a verified disposable DB.
Do not reset another stack or infer old checksums. No Task 4.2 work performed.

## Migration

Manifest schema version: 7.
File: `0007_local-commerce-catalog-authority.sql`.
SHA-256: `27b79e3190aa93b3e1dc76194eb035b3f15829c2021cd681b1a55437eb48c0d6`.
0001–0006 SQL files were not modified. Earlier schema tests were updated only
for the additive manifest version/list; their original constraint/hash assertions
remain. Session implementation and Task 3.x checkboxes were not changed.

## Files changed in this turn

- tests/customer-session-persistence.test.mjs
- local/commerce/migrations/0007_local-commerce-catalog-authority.sql (new)
- local/commerce/migrations/manifest.json
- app/infrastructure/local-commerce/local-catalog-authority.server.ts (new)
- app/infrastructure/local-commerce/local-checkout-rule-authority.server.ts (new)
- app/infrastructure/local-commerce/local-persistent-supabase-adapter.server.ts
- app/config/server.ts
- app/config/local-checkout-runtime.ts
- app/infrastructure/catalog/server-catalog-repository.ts
- app/infrastructure/customization/server-customization-field-repository.ts
- app/infrastructure/products/product-repository-factory.ts
- app/product/[slug]/page.tsx (server environment composition only, no markup)
- app/server/customer-upload-field-resolution.server.ts
- tests/fixtures/local-persistent-catalog.mjs (new)
- tests/local-persistent-catalog-authority.test.mjs (new)
- tests/local-commerce-schema-contract.test.mjs
- tests/local-commerce-security-boundary.test.mjs
- tests/local-commerce-purchase-schema-contract.test.mjs
- tests/local-commerce-migration-ledger.test.mjs
- local/commerce/task-4.1-acceptance.md (this report)

Existing unrelated worktree changes were preserved. Index remains empty;
no stage, commit, push, remote Supabase, payment/email/provider call or deployment.
Catalog business facts and Supplier semantics unchanged. Runtime source wiring
is new and not claimed real-DB accepted. The complete working-tree status has
508 entries before this report; it is not a list of changes made in this turn.
