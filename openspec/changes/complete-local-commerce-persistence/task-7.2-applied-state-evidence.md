# Task 7.2 — applied-state evidence

## Current-turn 0021 application and acceptance update

This section supersedes the historical blocked status below; the earlier
failure record is retained and is not rewritten as a successful run.

0021 exact owner-authorized SHA-256:
`43ac7a4bd81512ab0b94d149357f02db2fc98ef4927cb79b8555a35ee5a892ef`.
The exact run/container/workdir/project/marker and PostgreSQL 17 were checked.
Rollback-only candidate validation passed, then the ledger-aware wrapper
applied only 0021. Actual ledger **21/21**, pending **0**; 0001–0020 checksums
and marker unchanged. 0021 is now immutable. All 47 business/Storage table
snapshots were unchanged by rollback verification and application (excluding
the intended ledger/project-version update at application).

Actual trigger: SECURITY DEFINER, return type trigger, owner postgres,
`search_path=pg_catalog, local_commerce`. Trigger relationship unchanged.
PUBLIC/anon/authenticated/service_role have no direct execute on either the
trigger or `fulfillment_purchased_items(text,uuid,uuid)`. Existing preview RPC
service-role execution remains allowed. Table ACLs, RLS, Storage policies and
grants unchanged. No browser access expansion.

Original failure retest: real service-role publication returned **HTTP 200,
found**, v1 with one entry and zero revision requests, for safe reference
`FM-LOCAL-2125C7296C1E45EF`. The old SQLSTATE 42501 is absent. The deferred
completeness constraint remains enabled and deferred.

Final expanded HTTP acceptance exited 0 on the applied ledger:

- Real Cart → Order → simulated Payment → operator admission, actual
  Node/sharp processing and private Storage write/read-back before ready.
- Single, all-required multi-item, mixed required/disabled publication pass.
  Disabled item upload and all-disabled dummy manifest requests return 404.
- Missing, foreign, wrong-item, duplicate-item and reused-media publication
  attempts fail without manifest/action writes. Independent operator required.
- Lost response then process restart: PIDs **32398 → 32516**, exact same v1
  manifest/action recovered, zero additional revisions/effects.
- Simultaneously live Workers **32516 / 32520**: same-key race both 200,
  different-key race exactly one success, one manifest/publication action.
- Readiness race Workers **32516 / 32721**: pending media publication 404,
  then actual ready commit and publication 200, no premature manifest.
- Controlled acceptance-only helper-result interruption, Storage transport
  interruption, read-back interruption and digest corruption each returned
  404 with no false-ready or publication. Fault Worker PIDs respectively
  32642, 32664, 32681, 32703. These are injected dependency-boundary failures,
  not a claim that the healthy helper/Storage service naturally failed. No
  production fault flag or alternate business implementation was added.
- Before/after count and digest equality asserted for purchase header/items,
  receipt bindings, Payment attempts/actions, Cart/lines, and synthetic Catalog
  Product/Variant/configuration rows. These HTTP fixtures have zero customer
  receipt bindings; real private preview media is independently created.
- Every tested Order has zero Shipment and shipment events. No Supplier
  command/provider is invoked by this harness or the preview implementation.

Applied-schema SQL acceptance also exited 0: four publication write faults
and ready-audit fault roll back atomically. All 47 table digests unchanged.
This is actual PostgreSQL transaction-local fixture evidence, distinct from
the real Worker/helper/Storage evidence above.

Actual security HTTP acceptance exited 0: anon RPC/CRUD 401; authenticated
RPC/CRUD 403; service-role RPC 200; private bucket non-public; public object
endpoint 400. Denied DELETE probes use impossible identity; no row or object
was deleted.

Final validation: focused 31/31 (includes imported purchase-contract cases),
supplemental schema/security/ledger/CAS 24/24, offline 913/913, rendered 11/11;
lint exit 0 with one pre-existing img warning, typecheck exit 0, fresh build
exit 0, then rendered exit 0. `npm run verify` exit 0 (fresh build before its
rendered suite). OpenSpec strict 23/23 and git diff check passed. Two stale
ledger test assertions ending at migration 18 were corrected to verify the
contiguous manifest version range; no production ledger implementation changed.

No remote service, deploy, Storage deletion, reset, stage, commit or push.

Task 7.2 is now checked, progress 42/85. Task 1.1 remains blocked/unchecked.
Task 7.3 dependency inspection has started, not implementation or acceptance:
the existing customer HTTP handler still uses the fake customer service;
0020 preview reservation/publication intentionally permits only initial v1,
photo_review and zero revisions. Supporting customer approve/revision and
operator v2/v3 therefore requires a new ordered migration (0022+) and a
persistent customer adapter using existing capability/member authorization.
Neither 0020 nor 0021 may be edited. No later migration was applied and 7.3
remains unchecked. Task 8 was not entered.

## Historical pre-0021 record (superseded, retained verbatim)

Progress remains **41/85**. Task 7.2 is unchecked. No Task 7.3 or Task 8 work.
Classification: LOCAL DEVELOPMENT / TEST PERSISTENCE ACCEPTANCE, incomplete.

## Exact environment and migration history

- Run: `run-5576dfd8`.
- Project: `figmemento-local-commerce-test-run-5576dfd8`.
- Container: `3f0a14e18d07b71e0b235dffcdc61e672086d6fb5b32b35849aa8bf54f3be3e4`.
- Workdir: `local/commerce/runtime/disposable/run-5576dfd8` in this repository.
- PostgreSQL 17; exact project marker verified before and after.
- 0001–0019 file/manifest/ledger checksums verified unchanged.
- 0020 final SHA-256:
  `63a4d18a984ee95511743d333072a9d56bd15421eaac6e2ed51e11647ce818e9`.
- 0020 applied using the existing ledger-aware wrapper, after expanded
  pre-apply was rerun. Immediate post-apply: ledger 20/20, pending 0.
- **0020 is now immutable.** Its only change before application was bounded
  `unavailable` for a new wrong-Fulfillment request; CAS mismatch and changed
  committed replay context retain `conflict`.
- Current registered manifest version: **21**. Actual applied ledger: **20**.
  **Pending: 1**, not zero. 0021 was NOT applied.
- 0021 candidate SHA-256:
  `43ac7a4bd81512ab0b94d149357f02db2fc98ef4927cb79b8555a35ee5a892ef`.

## Expanded pre-apply evidence

`node scripts/local-commerce-preview-manifest-preapply.mjs` passed, exit 0.
The apply runner reran it immediately before ledger-aware application.

The extended SQL module adds single/all-required/mixed publication, wrong
project/marker/actor/Fulfillment, disabled/foreign item reservation, invalid
ready metadata, foreign ready media, swapped item/media, v2/v3/v4 pollution,
exact parent/entry FK dimensions, pending-media FK, unpaid and pending photo
review denial to the prior replay/immutability/atomic-failure matrix.

Four publication write fault points roll back manifest, entries, pointer,
lifecycle/version and action. Ready audit failure rolls back final facts.
Before/after count and digest comparison covered **45 existing tables**:
all `local_commerce` tables plus Storage buckets/objects. Every digest matched.
Candidate DDL and all SQL fixtures were rolled back. No Storage bytes deleted.

Storage grants alone are not its effective privacy policy. Inspection found
RLS enabled and only service-role policies; actual anon/authenticated queries
returned zero objects/buckets. The test uses that boundary rather than
incorrectly requiring Storage-managed grants to be absent.

Important discovered coverage limit: that matrix exercised publication as
postgres. It did NOT prove the deferred trigger at service-role HTTP commit.
The subsequent real acceptance exposed that gap; it is not rewritten as PASS.

## Permanently applied security evidence

`node tests/database/local-commerce-preview-security-acceptance.mjs`: exit 0.

- Exact RPC signature discovered; SECURITY DEFINER, fixed
  `search_path=pg_catalog, local_commerce` verified.
- Execute ACL excludes PUBLIC/anon/authenticated, service_role allowed.
- Both new preview relations have RLS; browser direct CRUD denied.
- anon RPC and 8 table CRUD requests: **401**.
- authenticated RPC and 8 table CRUD requests: **403**.
- service_role read RPC: **200**, bounded unavailable for absent identifier.
- Private bucket remains non-public; public object endpoint rejected with 400.
- DELETE probes used an impossible all-zero identity; no rows were deleted.

## Real Worker/helper/Storage evidence and first failure

Two executions of the real HTTP harness reached paid Order admission and all
requested preview uploads. Each made fresh synthetic Cart/Order/Payment
records through real application HTTP. Ten total production preview media
rows reached ready, with real helper-decoded PNG, private Storage write and
verified read-back. No customer receipt was substituted for preview authority.
Public upload projections were checked for private-field leakage.

Both executions then failed at first publication: application HTTP **404**.
Test-only Worker tracing showed probe `not_found`, exact ready acquisition,
byte-size/digest match and publication command reached. No private values were
printed. A direct actual service-role HTTP diagnostic gave:

```text
HTTP 403
SQLSTATE 42501
permission denied for function fulfillment_purchased_items
```

Cause: the deferred integrity trigger executes after the RPC's security-definer
frame returns. Its invoker role lacks the internal history-read privilege.
Running the publication as postgres inside a rollback transaction succeeds,
which explains why the earlier SQL matrix did not detect it.

No successful publication, lost-response recovery or two-worker race is
claimed. Post-failure read-only counts:

| Entity | Count |
| --- | ---: |
| ready production preview media | 10 |
| preview manifests | 0 |
| preview manifest entries | 0 |
| committed preview_publish actions | 0 |
| Shipments | 0 |
| Shipment events | 0 |

All acceptance-owned Worker/helper processes were stopped in `finally`.
Synthetic rows and private objects remain intact; no cleanup was performed.

## 0021 forward fix / security approval blocker

The proposed migration changes only
`local_commerce.assert_preview_manifest_complete()` to SECURITY DEFINER,
retains fixed search_path and revokes direct execution from all caller roles.
It does not grant service_role direct history or preview-table access.

`node scripts/local-commerce-preview-deferred-authority-migration.mjs --preapply`
passed with exit 0 on ledger 20. It reruns the expanded SQL matrix and explicitly
flushes deferred constraints while `SET LOCAL ROLE service_role` is active.
All changes/fixtures rolled back; ledger unchanged.

Permanent `--apply-authorized-forward-fix` execution was **rejected before
process creation by security review**. Reason: separate explicit authority is
required for this persistent security-definer trigger change and its scope.
No workaround or retry was performed. A read-only check subsequently confirmed
the trigger remains invoker-mode and ledger still ends at 20.

Required confirmation: apply only the exact 0021 checksum above, through the
ledger wrapper, to this exact run; no grants, reset, deletes or other stack.
Risk: the integrity trigger reads its narrowly scoped canonical rows under its
owner's privileges during commit. Fixed search_path and no direct EXECUTE
limit that privilege boundary. This is not a new business-authority decision.

## Validation

- Task 7.2 focused tests: **31/31**, exit 0 (includes repeated imported tests).
- Additional manifest/schema/session/CAS contracts: **37/37**, exit 0.
  Initial four stale manifest/table-inventory assertions failed; updated to
  registered 20/21 and reviewed RPC-only tables, without weakening RLS checks.
- lint: exit 0, 0 errors / 1 existing storefront img warning.
- typecheck: exit 0.
- offline: **913/913**, exit 0.
- fresh build: exit 0; rendered afterward: **11/11**, exit 0.
- verify: final rerun exit 0 after static inventory assertion adjustments:
  lint/typecheck, offline 913/913, fresh build then rendered 11/11.
  Subsequently only the pre-apply report's pending counter was corrected to
  distinguish a registered candidate from applied ledger state; syntax/lint
  were checked separately. No application or migration bytes changed.
- OpenSpec strict: **23/23**, exit 0; git diff --check: exit 0.
- Non-index whitespace: 18 changed files checked, PASS.

These are current code checks, NOT full Task 7.2 real acceptance.

## Files changed in this continuation

- `local/commerce/migrations/0020_local-commerce-private-preview-manifest.sql`
  (before application only), `0021_local-commerce-preview-deferred-authority.sql`,
  `manifest.json`.
- `scripts/local-commerce-preview-manifest-preapply.mjs`,
  `local-commerce-preview-manifest-apply.mjs`,
  `local-commerce-preview-deferred-authority-migration.mjs`.
- `tests/database/local-commerce-preview-manifest-full-sql.mjs`,
  `local-commerce-preview-security-acceptance.mjs`,
  `local-commerce-preview-manifest-http-acceptance.mjs`,
  `local-commerce-test-worker.mjs` (safe test-only phase tracing).
- `tests/local-persistent-preview-media.test.mjs`.
- Manifest expectation updates: `tests/local-commerce-security-boundary.test.mjs`,
  `local-commerce-schema-contract.test.mjs`,
  `local-commerce-purchase-schema-contract.test.mjs`,
  `customer-session-persistence.test.mjs`,
  `local-persistent-cart-atomicity.test.mjs`.
- This evidence file and the historical work-in-progress document's pointer.

## Remaining / authority / Git

After explicit security authorization: apply/verify 0021, then resume actual
publication, complete live mixed/no-preview/negative/failure matrix, record
restart and simultaneous Worker PIDs, readiness race, separate upstream
digests and all downstream non-effects. Finally rerun validation. Only then
may 7.2 be checked and 7.3 begin.

Catalog/purchase/Payment/Supplier/frontend authorities unchanged. No remote
service, production database, provider, deployment or other stack accessed.
No task checkbox changed. Pre-existing unrelated work retained. Staged 0;
commit NONE; push NOT PERFORMED. Working tree remains broadly dirty (556
status entries before this new evidence file); that is not a list of this
continuation's edits.
