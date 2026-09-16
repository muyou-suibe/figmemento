# Task 6.3 current-turn synthetic cleanup evidence — BLOCKED

Authorization: owner attachment `79a22425-a750-41e6-ba05-7f1175f6fff7`.
Target only: `run-5576dfd8`, project `figmemento-local-commerce-test-run-5576dfd8`.
Progress remains **35/85**, Task 6.3 unchecked. Tasks 6.4+ not started this turn.

## Guard and scope

Exact PostgreSQL container: `3f0a14e18d07b71e0b235dffcdc61e672086d6fb5b32b35849aa8bf54f3be3e4`.
Full workdir matched `local/commerce/runtime/disposable/run-5576dfd8`.
Readiness passed; existing marker and all 15 migration checksums checked by the harness.
No migrations applied/edited. Post-run ledger count remains 15.

Only newly generated synthetic fixtures were used. The test observer independently
checked exact marker, operation, owner, creation timestamp, locator digest, active
durable lease, no Order reference and no foreign owner/project reference before
forwarding each one-object DELETE from the existing cleanup adapter. No prefix
scan, reset, historical-object cleanup, direct business-row deletion, or production
operation was performed. Private locators/cookies/credentials are not published.

## Executions

Command: `node tests/database/local-commerce-order-http-acceptance.mjs --copy --cleanup`.

1. Initial cleanup subset: exit 0. Real Worker restart replay, actual image
   Draft/Cart/Order, explicit copy, provenance, same-input replay, quantity 3 / one
   attachment, two live Order Workers (98583/98647, HTTP 200/409), shared-original
   retention, cleanup-wins read/reconcile/copy denial and unchanged Draft passed.
   Independent cleanup workers **98694 / 98695** both reached the start barrier:
   completed/conflict, physical DELETE counts **1 / 0**.
2. Expanded owner/source/attach matrix: exit 1 at configuration revision fixture
   UPDATE. Assertions before that point included real session-derived member
   copy/replay; guest→member, member→guest, other-member rejection; invalid,
   removed and naturally expired source; wrong Product and stale Draft;
   real Cart admission followed by normal Draft removal, cleanup and Order
   rejection with unchanged purchase-row counts. These are partial evidence,
   not an overall 6.3 PASS. The configuration test changed a field to inactive,
   then attempted to update a revision referenced by Draft FKs. That update
   failed; the prior inactive-field update remained committed.
3. After a test-only revision-publication edit, the next run exited 1 at the
   first real Cart POST: HTTP **503**, expected 200. It did not reach cleanup.
   No additional physical deletion occurred in this run.

The later-added independent copy/cleanup competition, pre-DELETE leased Order
rejection callback and direct late-publish RPC assertions have **not run**.
The full current harness is not accepted. No complete race-matrix claim is made.

## Exact deleted synthetic resources

All nine below were rechecked read-only after stopping: durable cleanup
`completed`, trusted Storage metadata HTTP **400**, code **NoSuchKey**.
The first four additionally have captured exact-name DELETE HTTP 200 results;
the second invocation reached its post-delete absence assertions before the
later fixture failure. SHA-256 identifies the exact private locator without
publishing a usable locator.

| Operation | Resource | Locator SHA-256 |
| --- | --- | --- |
| 07b107d6-1cf9-437a-8502-ad2e3d21c716 | derivative | 49d5e50cc544b463a423208654a5087042d09722b5452fd035053485b66039d7 |
| a78cc53a-e127-447b-b3ab-c2e174b2c947 | derivative | ffddcb0e3eecdd539e776721b46a2e6e9bda8145f74a3a7ca72cc7a91ddd48c6 |
| a78cc53a-e127-447b-b3ab-c2e174b2c947 | original | 831b4537a4dc2bc1e31957d20af9fb78720b26574cd4f6e761b27df78ef5bb54 |
| 63b27fc3-692b-4de5-80f6-8bcf319e399b | derivative | 862bf8d25783092b2fd629192e617bd5fe8ecc4ab49ea25566fe688755544d89 |
| 68306e4e-8706-4d12-ab29-4deda8b0ae26 | derivative | 9662ba13870e589b657040aab8b7a7d24e40c653e35088c74bb7619633d130fa |
| 7c061433-f2a7-4630-834c-65768875f1e2 | derivative | a87a24a7a47345faabcf541432a34612bb7f943243ebef250ba0b4e6ae76c721 |
| 7c061433-f2a7-4630-834c-65768875f1e2 | original | 6b4acedbc0fb665e862a8ffed6af3ed93447afe3c908cbcd2576273a118bfa53 |
| 79cbaa1f-6bf9-4042-8f2a-be001c95a39d | derivative | 52400940ef0e19205481298a110a0843975728a98c8a5a1f75916b55babc20a2 |
| 3f85a844-3486-4655-8fa9-e3020c1805db | derivative | fef2cc16193986d68c3661391f0d8ecbd0165f66942a49c0cd9d2c490d84e537 |

These are actual deletions, not rollbackable test transactions. No recovery of
these retired synthetic bytes was attempted. Protected shared originals and
attached historical resources were not deleted.

## First blocker and responsibility

This turn's **acceptance fixture defect**, not an external infrastructure outage:

- Configuration ID: `406fe0fa-174f-4f91-aa8a-9d0d99b30281`
- Product ID: `59979be3-64fe-4c50-acf0-4a78a6d565f1`
- Field ID: `1e2ecc8a-929d-4d93-85e8-b566fb7aa550`
- Revision: 1, active configuration containing `isActive=false`
- Created: `2026-09-12T18:27:43.866840Z`
- Inactive-field update: `2026-09-12T18:27:59.679156Z`

Read-only query found this exact invalid active configuration.
`normalizeCustomizationFieldConfiguration` rejects inactive fields in a current
configuration; `LocalCatalogAuthority.readSnapshot` fails closed when any returned
active configuration is invalid. The subsequent Cart admission therefore cannot
use this project's Catalog authority. No memory fallback was introduced.

Owner authorization explicitly stops on **manual DB business-state repair**.
Accordingly the agent did not change this stored row back, retire it, reset the
stack, or bypass Catalog validation. A narrowly authorized correction to this
current-turn synthetic configuration is required before rerunning. It should
recheck project/marker/exact IDs/current version, restore only that field's
activity through a version-checked update, and preserve revisions/Orders/media.
The future configuration-drift fixture must also publish internally consistent
revision metadata while retaining FK-referenced revisions and must not leave an
invalid active configuration after a failed assertion.

## Scope / validation

Only test harness files and this evidence report were edited. No application
implementation, migration, task checkbox, provider, Supplier or visual edits.
Existing Catalog authority was not changed; synthetic test data was changed as
explicitly disclosed above. Full verify was not rerun after the stop condition;
no previous full-suite result is claimed as current acceptance.
No git staging, commit, push, reset, clean or stash. No remote access/deployment.
