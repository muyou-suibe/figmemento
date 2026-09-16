# Task 6.7 — Batch 6 real acceptance gate

LOCAL / DEVELOPMENT-TEST ACCEPTANCE ONLY; not production readiness.
Exact existing disposable project: `figmemento-local-commerce-test-run-5576dfd8`.
PostgreSQL 17, marker verified, ledger 18/18, pending 0; all 18 checksums verified. No new migration for 6.7.

## Evidence matrix

| Requirement | Actual evidence | Result |
| --- | --- | --- |
| Physical, digital-only, mixed / contact boundaries | `node scripts/local-commerce-order-preapply.mjs --applied-contract` and separate `--digital`, `--mixed`, all exit 0 against current installed functions. Two items, quantities 2/1. Missing physical address and invalid email rejected; digital email-only accepted. | PASS |
| Deterministic arithmetic / tax | Same real SQL runs compare PostgreSQL allocator with TS vectors (zero, uneven remainder, large integer, mixed shipping eligibility); committed header conservation, item tax null and rejection of numeric tax checked. | PASS |
| Atomic creation / snapshots | Injected final creation-binding failure rolls back all seven Order/item/snapshot/receipt/grant/binding relations. Synthetic setup and triggers entirely rolled back; current schema/functions retained. | PASS |
| Real private media / copy / quantity | `node tests/database/local-commerce-order-http-acceptance.mjs --copy`, exit 0. Actual helper/private bytes read-back; distinct copy receipt/slot/operation and provenance, explicit Draft CAS, quantity 3 with one attachment. | PASS |
| Same receipt / distinct creation keys | Live Workers 21268 / 21364 returned 409/200; one copy receipt binding and quantity 3. | PASS |
| Attach versus cleanup claim | Independent Node PID 21367 concurrently called restricted claim RPC while both Workers attempted attachment. HTTP 200 / retained, zero Storage requests. Valid/attached bytes retained. No DELETE executed. | PASS |
| Cleanup-winning rejection (existing accepted evidence) | Indexed `batch-6-task-6.3-closure.md`: complete authorized real cleanup run, retirement/cleanup-before-Order rejection, zero partial creation; historical cleanup/copy workers 99899/99900 and 99911/99912. This turn does NOT replay deletes or claim these are new 18/18 executions. | PASS — indexed prior acceptance |
| Creation same-key / different-key | `--idempotency --race-window`, exit 0. Live Workers 20130 / 20335: 200/200 same result, or 200/409, one new Order. | PASS |
| Cart precommit version race | Delayed real Worker 20405 resolves facts; Worker 20130 changes quantity through ordinary Cart HTTP before commit resumes. Stale commit 409; all counted purchase relations unchanged. | PASS |
| Catalog / shipping / coupon precommit version races | Same two live Workers, with separate psql synthetic-fixture writer processes (not a public Catalog mutation endpoint). Product and each rule changed after actual preparation and before RPC commit; each 409, no partial rows. | PASS |
| Creation response loss / restart | Worker 20032 → 20130, original cookies and request, Order FM-LOCAL-DDD60F325AC247E6 unchanged. Fault workers 20579/20664/20737/20807 exercise before-probe, actual transport probe loss, before-commit, after-commit response loss; retry one total Order. | PASS |
| History / media facts / Catalog drift | Current canonical history read in fresh processes, zero Catalog/Storage read sentinel; changed/unavailable Product does not rewrite history; exact image order/crop and receipt does not grant bytes (404 without owner, 200 with owner). Image Order FM-LOCAL-EFE41009C2F047ED. | PASS |
| Owner and changed request context | Guest/member separation, replacement capability cannot claim, natural guest/capability expiry, revoke; changed contact, quantity, options, revision, image order/crop reject without snapshot mutation. | PASS |
| Payment transaction / races / restart | `batch-6-task-6.6-closure.md`, indexed current-turn real HTTP success/failed/cancelled, retry, same/different-key, two live Workers, lost-response restart and five real SQL failure points. | PASS |

The precommit wait is an acceptance-only Vite transform in the test launcher, not a production hook or debug endpoint. The only durable exclusion is the installed PostgreSQL command/locks/constraints. Private Catalog mutation uses unique synthetic fixtures because no public price/seed mutation authority is permitted.

## Final validation

- Focused schema/ledger/port/Cart/Payment: 55/55, exit 0.
- Independent lint exit 0 (one existing image warning); typecheck exit 0; offline 913/913 exit 0.
- Final `npm run verify` exit 0, including fresh build then rendered 11/11.
- Final payment postapply rollback check exit 0: ledger 18/18, pending 0, five fault points, ACL/RLS PASS; header digest `c3571dba321c90dd70027c2d5b854c33` unchanged during this check. This digest includes newly created acceptance Orders and is not compared with pre-fixture global counts.
- OpenSpec strict 23/23; git diff --check exit 0; 25 relevant files non-index whitespace PASS (no diagnostics; no-index exit 1 denotes ordinary difference from /dev/null). Index empty. Git short status 548 entries versus initial 546; existing dirty worktree retained.

## Scope

No reset/reseed/truncate/retained Order rewrite/Storage DELETE, remote services, real Auth/payment/email/carrier provider, production config or deployment. Existing business, Catalog and Supplier authority preserved. No git staging/commit/push. Task 1.1 remains unchecked; Task 7 not started.

Batch 6 acceptance combines the explicitly indexed prior cleanup-winning evidence with this turn's new 18/18 DB/Storage/Worker/payment/race validation; it does not imply production acceptance or Task 7+ completion.

Tasks 6.6 and 6.7 checked after validation; progress 40/85. Stop before Task 7.

## Owner final closure / STOP

Final closure instruction: attachment `8a679cdb-c0fb-4001-888d-b0a386a7b778`.
Tasks 6.1–6.7 remain checked. Progress is **40/85 = 47.06%**, not 41/85.
Task 1.1 remains unchecked / blocked absent exact historical evidence; no historical failures are inferred.
Classification: **LOCAL DEVELOPMENT / TEST PERSISTENCE ACCEPTANCE**, local simulated Payment only. Business authority is unchanged.

### Frozen migration identity

Accepted ledger evidence: 18/18, pending 0, same `run-5576dfd8`.
0018 actual file and manifest SHA-256 (read-only rechecked at final closure):
`f053bb2e731f78325684840a1ecb1c27c54228b07fe7176c1e25763dea45ff1e`.
The owner attachment transcribes only 63 hexadecimal characters, omitting the final `e`; this report preserves the actual 64-character digest rather than changing SQL or manifest to match that transcription.
0001–0018 bytes, whitespace, comments, checksums and ledger entries remain immutable. Any future correction requires an authorized future-task 0019+ forward migration.

### Cumulative evidence provenance

CURRENT-RUN evidence means the accepted final Batch 6 execution indexed above, not a new execution during this documentation-only closeout.

6.7 cumulative gate incorporates the previously accepted Task 6.3
same-project cleanup-winning evidence; the final 6.7 execution itself
performed claim/retention checks with zero Storage DELETE.

PRIOR ACCEPTED SAME-RUN evidence is `batch-6-task-6.3-closure.md` on `run-5576dfd8`: eligible DELETE with completed/NoSuchKey, independent cleanup workers 99899/99900 with conflict/completed and DELETE counts 0/1, copy/cleanup workers 99911/99912 with found/retained, shared-original retention, cleanup-before-Order rejection, unavailable deleted derivatives and rejected late publication. These historical destructive results are not relabelled as new 6.7 DELETE execution and were not rerun.

### Complete validation index (existing accepted results; not rerun here)

| Validation | Accepted result / provenance |
| --- | --- |
| Focused | 55/55 PASS — final 6.6/6.7 index above |
| Additional copy / receipt / Payment regression | 50/50 PASS — `batch-6-task-6.5-closure.md`, offline copy/receipt and existing fake Payment regression; not durable Payment proof |
| Offline | 913/913 PASS |
| Fresh build | PASS |
| Rendered after fresh build | 11/11 PASS |
| Typecheck | PASS |
| Lint | 0 errors; 1 pre-existing ProductCustomizationImageField warning |
| npm run verify | PASS |
| OpenSpec strict | 23/23 PASS |
| git diff --check | PASS |
| Relevant non-index whitespace | PASS |

This closeout only updates this evidence document. No application/test/migration/checkbox changes, DB or Storage operations, staging, commit or push. Existing unrelated dirty worktree preserved; staged 0.
**STOP BEFORE TASK 7**: no Task 7 inspection for implementation, preparation, migration, wiring, Fulfillment aggregate, photo review, preview manifest/decision or production transition.

## Current-turn file inventory (not a staging list)

- `app/application/local-commerce-provider-ports.server.ts`
- `app/infrastructure/local-commerce/local-persistent-supabase-adapter.server.ts`
- `app/config/local-payment-runtime.ts`
- `app/server/local-payment-http.server.ts`
- `app/server/local-persistent-payment.server.ts`
- `app/order/success/[reference]/page.tsx`
- `local/commerce/migrations/0018_local-commerce-payment-command.sql`
- `local/commerce/migrations/manifest.json`
- `local/commerce/batch-6-task-6.6-closure.md`
- `local/commerce/batch-6-task-6.7-closure.md`
- `tests/local-persistent-payment.test.mjs`
- `tests/database/local-commerce-payment-sql.mjs`
- `tests/database/local-commerce-payment-http-acceptance.mjs`
- `tests/database/local-commerce-order-http-acceptance.mjs`
- `tests/database/local-commerce-cleanup-claim-probe.mjs`
- `tests/database/local-commerce-test-worker.mjs`
- `scripts/local-commerce-payment-migration.mjs`
- `scripts/local-commerce-order-preapply.mjs`
- `tests/customer-session-persistence.test.mjs`
- `tests/local-commerce-schema-contract.test.mjs`
- `tests/local-commerce-purchase-schema-contract.test.mjs`
- `tests/local-commerce-migration-ledger.test.mjs`
- `tests/local-commerce-security-boundary.test.mjs`
- `tests/local-persistent-cart-atomicity.test.mjs`
- `openspec/changes/complete-local-commerce-persistence/tasks.md`
