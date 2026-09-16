# Task 7.1 — durable Fulfillment admission acceptance

Acceptance date: 2026-09-13. Local/development-test only; not production ready.

## Authority

Owner decision: explicit immutable purchased `media` array, not current Catalog,
Draft, Storage listing or `requiresProductionPreview`, determines applicability.
Missing/malformed facts fail closed. One review per exact stable item regardless
of quantity or media count. Empty media has no review row. Existing statuses
remain pending/approved/rejected. Only approved satisfies the photo prerequisite;
the independently purchased preview requirement is not satisfied by that result.

The existing server-only development operator verifier is checked before the
service client. The source selector/customer cookie does not grant that authority.
Application mutation passes the unified async command boundary with verified
actor, expected version and idempotency context. No memory fallback is added.

## Database and migration

Exact project: `figmemento-local-commerce-test-run-5576dfd8`.
PostgreSQL 17; exact container/workdir/marker checked before execution.

0019: `0019_local-commerce-fulfillment-admission.sql`

SHA-256: `fa2503b466fef22cbea70d6e47b0b587c372c39e1956151c56190740af8e4d29`.

Rollback-only preapply PASS, ledger-aware authorized application PASS, subsequent
postapply check PASS: ledger 19/19, pending 0, all prior checksums exact.
0019 is now applied and immutable; any forward fix must use 0020+.

One existing Fulfillment/Order relation, exact project/owner/Order/item foreign
keys, review uniqueness, action binding and bounded audit are used. No second
Order lifecycle store. Admission/reviews/action/audit commit atomically.

## Real HTTP, private Storage and independent Workers

`tests/database/local-commerce-fulfillment-admission-http-acceptance.mjs` exit 0.
New synthetic Catalog setup only; real Cart → Order → local Payment HTTP creates
all tested Orders. Image input uses real Node/sharp helper/private Storage plus
durable Draft confirmation before Cart/Order. No SQL purchase fixtures substitute
for this HTTP evidence. Test-created data is retained; no DELETE/reset occurred.

Latest successful run: restart PIDs 25409 → 25452; simultaneous Worker PIDs
25452 and 25456. Exact-key races return 200/200; different-key race 200/409.
Lost response + new process replays original result without duplicate rows.
Unpaid admission and disabled-operator/customer-cookie admission reject.
Reads and Payment produce zero Fulfillment/review rows before explicit admission.

| Real Order reference | Purchased media / policy | Pending reviews |
| --- | --- | --- |
| FM-LOCAL-93ABCFEFD069406A | 1 image, preview required | 1 |
| FM-LOCAL-A3EF4905FA904EF4 | 1 image, preview disabled | 1 |
| FM-LOCAL-3FE7391FFCC448AE | 2 images, quantity 3, one stable item | 1 |
| FM-LOCAL-48B3F5060A404CAB | two distinct media-bearing items | 2 |
| FM-LOCAL-C40AEE27A1364337 | image item + media-empty item | 1 |
| FM-LOCAL-7F3672EA1F6A4744 | explicit empty media, preview disabled | 0 |

The same harness also proves explicit empty media with preview required has zero
reviews. Each admitted Order has exactly one aggregate and one admission action.
Purchase header and item snapshot digests are equal before/after admission.

## Security and rollback evidence

`tests/database/local-commerce-fulfillment-security-acceptance.mjs` exit 0:
anon 401; authenticated 403; service role 200 with bounded unavailable for unknown
Order. Wrong project, marker, customer actor, malformed actor and invalid operation
all return unavailable. This security run performs no writes.

`scripts/local-commerce-fulfillment-admission-migration.mjs --postapply-check`
exit 0: RLS remains enabled, internal history helper is not service-callable,
RPC execution restricted. SQL-only synthetic fixtures, all rolled back, prove
missing/malformed media rejection, foreign-item FK rejection, quantity/multiple
media review cardinality, actor/key conflict, and faults at aggregate/review/action
insertion leave zero partial effects. These are database tests, not customer-flow
evidence. Existing immutable snapshots remain unchanged during that check.

## Offline and quality evidence

`tests/local-persistent-photo-review.test.mjs`: 17/17 PASS (11 new photo tests,
6 imported existing purchase-fact tests). Four independent gate combinations,
pending/rejected blocking, approved photo gate with independent preview gate,
missing/malformed facts, invalid authority stamp and fake/foreign rows covered.
This is prerequisite computation, not a claim that Task 7.5 production command
or a byte-inspecting review approval command is already implemented.

Focused photo + existing schema/security/session/cart contract set: 54/54 PASS.
`npm run verify`: exit 0, lint 0 errors (one existing img warning), typecheck PASS,
offline PASS, fresh build PASS, then rendered 11/11 PASS.
OpenSpec strict 23/23 PASS; git diff --check PASS.

## Scope

Task 7.1 accepted. Task 7.2–7.7 still require independent evidence. No production,
Supplier, Catalog business authority, customer visual or remote service change.
No stage/commit/push/reset/cleanup. Historical Task 1.1 remains unchecked.
