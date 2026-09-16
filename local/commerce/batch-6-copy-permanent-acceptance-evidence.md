# Batch 6 copy — permanent migration and partial real acceptance

Date: 2026-09-13. This supersedes the earlier permanent-apply permission blocker,
not the earlier evidence. Progress remains **35/85**. Task 6.3 is unchecked;
6.4–6.7 are not accepted, and Task 7 was not entered.

## Exact target and permanent migration

- Run: `run-5576dfd8`.
- Project: `figmemento-local-commerce-test-run-5576dfd8`.
- Container: `3f0a14e18d07b71e0b235dffcdc61e672086d6fb5b32b35849aa8bf54f3be3e4`.
- Full workdir label matched `local/commerce/runtime/disposable/run-5576dfd8`.
- Fresh PostgreSQL 17, exact marker, ledger 14/14 and all prior source checksums
  passed immediately before the existing ledger wrapper was invoked.
- 0015 was registered and permanently committed once. Post-commit marker and
  all 15 ledger/source checksums matched. Pending registered migrations: zero.
- Applied file: `0015_local-commerce-explicit-media-copy.sql`.
- SHA-256: `8200426f25f7ac0c97215ad00a6915d7fdcf97d161eabdb38af60caaed5b6aad`.
- 0001–0015 are now immutable. Any correction requires 0016 or later.
- Before applying, corrected the unpublished copy reservation's media-publish
  predicate in 0015; the existing Draft confirmation/CAS wrapper is retained.
- Migration source contains DDL/function changes and no business-row DML.
  Wrapper updates project schema metadata and the ledger as intended. A separate
  complete before/after business-row digest inventory was **not captured**;
  source inspection is not represented as that independent measurement.

## Actual security/discovery

- PUBLIC execute: false (actual ACL inspection).
- anon execute: false; actual PostgREST invocation: HTTP 401.
- authenticated execute: false; actual local test JWT invocation: HTTP 403.
- service_role execute: true; actual PostgREST invocation: HTTP 200 with bounded
  `unavailable` for nonexistent owner/resource selectors.
- Security definer: true; search_path: `pg_catalog, local_commerce`.
- `media_copy_bindings` RLS remains enabled.
- No new browser write route, credential output or Storage URL was introduced.

## Real HTTP/private Storage evidence

Entry: `node tests/database/local-commerce-order-http-acceptance.mjs --copy`.
Final execution exited 0 and used only newly created synthetic fixture records.

- Actual Worker establishment: HTTP 204, zero purchase row delta.
- Response-loss restart: process 97346 terminated, process 97405 replayed
  `FM-LOCAL-901A27C0417A4D32`; purchase counts unchanged despite Catalog drift.
- Forged/replacement capability rejected; guest/member separation and durable
  logout rejection passed through the real HTTP boundaries.
- Real helper/private Storage image purchase: `FM-LOCAL-46B9E6A3661C45FA`.
- Same-owner explicit copy generated distinct operation, slot and receipt.
- Equivalent retry returned exactly the same result; changed expectedVersion
  and changed target Draft under the same key returned conflict.
- Different guest and expired owner rejected without transfer/claim.
- Source/copy shared original object identity, had distinct derivative locators
  and exactly one explicit source-receipt/target-operation provenance binding.
- Actual authorized derivative byte read-back matched. Authority also verified
  original and derivative digests before returning a ready copy.
- Copy did not change the confirmed Draft; ordinary explicit Draft CAS saved
  the copied reservation afterward.
- Simultaneously alive Worker processes 97405 and 97470 competed with different
  creation keys for the same copied receipt/Cart version: HTTP 200 and 409.
- Quantity 3 produced exactly one receipt attachment to its item.
- Cleanup claim for the attached original returned `retained`; no deletion ran.
- Only acceptance-created Worker/helper child processes were terminated.
  No Docker service/container restart, reset, seed replacement or cleanup ran.

One intermediate harness execution failed because its evidence query looked
for quantity on the lifecycle `order_items` table. The query now reads the
canonical `order_item_purchase_snapshots`; no implementation or applied SQL was
changed to accommodate the test. The subsequent complete harness passed.

## Remaining / authorization boundary

The current authorization expressly forbids deleting Storage objects. Therefore
actual cleanup-wins deletion, copied-result deletion with shared-original
retention, and post-deletion readiness/race checks were not run. A retained
claim or lease-only check is not reported as successful physical deletion.
Exact synthetic-object cleanup authorization is needed before those actions.

The full 6.3 matrix is not claimed: remaining member-direction/invalid source/
configuration cases and broader cleanup concurrency need completion. 6.4–6.7
remain gated on that independent acceptance. No checkbox was changed this turn.

## Validation

- Ordered manifest/checksum verification: 15/15, exit 0.
- Focused migration/schema/security/copy tests: 34/34, exit 0.
- Standalone typecheck: exit 0.
- Final full verify: exit 0, offline 913/913, including fresh build before
  rendered 11/11; zero skipped tests in both suites.
- Lint: zero errors, one pre-existing image warning.
- OpenSpec strict: 23/23, exit 0.
- Git diff check: exit 0; index empty; no commit/push/reset/clean/stash.
- No remote Supabase, production provider, payment integration or deployment.
