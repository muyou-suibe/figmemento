# Task 7.2 — historical work-in-progress record

Task 7.1 acceptance is recorded separately. Current checked progress: 42/85.
Task 7.2 is checked after the owner-authorized 0021 apply and post-apply
real acceptance and final validation. Actual ledger 21/21, pending 0. See
[Task 7.2 applied-state evidence](task-7.2-applied-state-evidence.md).
The sections below preserve the preceding continuation's historical evidence,
not the current database state.

## Private media audit

Existing customer media authority binds customer receipts to Draft/field and
purchase-time media. It cannot be relabelled as an operator production preview.
Existing `preview_manifests.item_ids` does not establish private ready-byte proof.
The owner has authorized a separate Task 7 server-owned preview reservation;
this must use exact project/owner/Order/stable item/manifest-version bindings.

## Current implementation (not accepted)

- The unapplied 0020 candidate now permits pending reservations with all final
  content facts NULL, followed by a single pending-to-ready version transition.
  Ready media is immutable. Its exact parent scope includes Fulfillment.
- `preview_manifest_entries` has exact composite manifest/item/media foreign
  keys, including ready lifecycle and manifest version. Current manifest FK
  includes project, Fulfillment, Order and owner. Deferred completeness checks
  compare the relational set to immutable purchased preview policy. No second
  JSON entries authority is introduced.
- Restricted `fulfillment_preview_command` reuses `fulfillment_decisions` for
  reserve, ready and publication replay/input/actor/audit bindings. Initial
  version is server-allocated v1 with zero revisions. Order locking serializes
  commands; publication writes manifest, entries, pointer, lifecycle and audit
  in one transaction. Read/acquire/probe branches do not create business rows.
- Existing unified Fulfillment port retains mandatory authority, CAS and
  idempotency context; a default-preserving generic action type supports the
  new internal commands without changing existing fake actions.
- New server operator factory and POST preview endpoint implement separate
  production-preview input, bounded one-file handling, trusted helper output,
  private non-upsert write/read-back and safe projection. These are NOT yet
  validated against permanently applied 0020 or real preview Storage bytes.
- A partial real-HTTP harness has been prepared and syntax checked, **not run**.
  It requires ledger 20 and must not be used to claim full acceptance. Complete
  its remaining live mixed-item/readiness/failure/security coverage first.

## Fresh evidence from this continuation

### Exact-run rollback SQL diagnostics

Command: `node scripts/local-commerce-preview-manifest-preapply.mjs`.

- Exact container/workdir/project verified for `run-5576dfd8`.
- PostgreSQL major 17; marker verified before and after.
- Manifest/ledger 19/19, pending 0, all 0001–0019 source and ledger checksums
  match. 0019 remains
  `fa2503b466fef22cbea70d6e47b0b587c372c39e1956151c56190740af8e4d29`.
- Candidate SHA-256:
  `8d66b177b232efc27ce3dc970ac980654d1fa4dd22d378a0108366e6a816392a`.
  This is NOT an applied/final migration checksum.
- Latest diagnostic exit 0. Candidate DDL, synthetic fixtures and mutations
  were inside BEGIN/ROLLBACK; RPC absence and unchanged ledger verified after.
- Covered pending NULL facts, ready transition/immutability, reserve/ready/
  publication replay and changed context, mixed required/disabled items,
  missing/unready/duplicate/nonmatching entries, no dummy manifest, v1 and zero
  revisions, same-owner foreign-Order current-pointer rejection, immutable
  manifest/entries, header purchase digest, ACL/RLS/fixed search_path.
- Injected publication faults at manifest, entry, aggregate and decision writes
  left zero partial manifest/entries/pointer/lifecycle/publication action.
  Ready decision fault rolled back ready facts/version.
- An initial diagnostic failed due to test string/JSON concatenation. Explicit
  `r::text` corrected the test; subsequent runs passed. No permanent apply ran.

These are SQL fixture/rollback diagnostics, not customer HTTP or actual Storage
acceptance and not the complete owner-required pre-apply evidence packet.

### Offline and project validation

| Command | Actual result |
| --- | --- |
| focused manifest file | 11/11, exit 0 (5 focused + 6 imported) |
| focused media file | 19/19, exit 0 (8 media + 11 imported) |
| combined focused files | 30/30, exit 0; inherited tests counted again per file |
| lint | exit 0; final rerun 0 errors, 1 existing storefront img warning |
| typecheck | exit 0 |
| test:offline | 913/913, exit 0 |
| fresh build | exit 0 |
| test:rendered after build | 11/11, exit 0 |
| verify | exit 0, offline 913/913, fresh build, rendered 11/11 |
| OpenSpec strict | 23/23, exit 0 |
| git diff --check | exit 0 |

Verify initially reported three unused helper warnings in the new unexecuted
HTTP harness. Those helpers were removed and lint rerun to the single existing
warning. No application change was made after the successful build/verify.
Non-index whitespace checks on the 13 code/test/migration files emitted no
whitespace diagnostics (exit 1 denotes their difference from /dev/null).

Offline transport fixtures prove failure sequencing and projection only. They
do not prove actual helper decoding, private Storage persistence, process
restart recovery, DB contention or a complete live failure matrix.

## Files touched in this continuation

Modified existing candidates/boundaries:

- app/application/local-commerce-provider-ports.server.ts
- app/application/local-persistent-preview-manifest.server.ts
- app/infrastructure/local-commerce/local-persistent-supabase-adapter.server.ts
- local/commerce/migrations/0020_local-commerce-private-preview-manifest.sql
- tests/database/local-commerce-fulfillment-admission-sql.mjs (optional synthetic
  fixture preview flags only; unchanged default 7.1 test behavior)
- tests/local-persistent-preview-manifest.test.mjs
- this work-in-progress document

Created:

- app/server/local-persistent-preview-media.server.ts
- app/server/local-persistent-preview-http.server.ts
- app/api/local-fulfillment/operator/[reference]/preview/route.ts
- scripts/local-commerce-preview-manifest-preapply.mjs
- tests/database/local-commerce-preview-manifest-sql.mjs
- tests/database/local-commerce-preview-manifest-http-acceptance.mjs
- tests/local-persistent-preview-media.test.mjs

## Still required before Task 7.2 acceptance

1. Finish/audit the complete owner-required pre-apply negative and failure
   matrix. Existing diagnostics are a subset, not permission to skip that gate.
2. Only after that gate, register checksum/manifest and ledger-aware apply 0020
   to the exact run, then prove ledger 20/20, marker, actual ACL/RLS/discovery.
3. Actual helper/private Storage write/read-back, live completeness/security,
   lost response/restart PIDs, two live Worker races and readiness contention.
4. Full before/after purchase/payment/receipt/Cart/Catalog evidence and zero
   Supplier/Shipment/Tracking effects; complete live failure coverage.
5. Rerun required validation after final implementation/application. Only then
   check 7.2 and continue 7.3 under the existing authorization.

No new stack, restart/reset, private object write/delete, provider call or
permanent migration was performed in this continuation. Catalog, purchase,
Payment, Supplier and frontend authorities were not changed. Index remains
empty; no stage/commit/push. Existing unrelated worktree changes are retained.

No owner decision blocker has been established for this preparation. Remaining
work is implementation and evidence, not a request to broaden authority. Do not
mark 7.2–7.7 or enter Task 8 on the basis of this document.
