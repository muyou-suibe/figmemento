# Task 7.4 — independent atomic action/replay/audit gate

Status: PASS — LOCAL DEVELOPMENT / TEST PERSISTENCE ACCEPTANCE. Task 7.4 independently accepted; progress 44/85. Task 7.5 is not credited by this evidence.

## Mutation/replay inventory (source audit before execution)

All rows use canonical Order identity, exact project/marker and one `fulfillment_decisions` relation. Its `result.audit` is the bounded logical audit; it is not a separate out-of-transaction audit store. Serialization uses the canonical Order row lock for mutation. Read/prepare/probe/acquire are not new mutations.

| Implemented mutation | Fresh actor and selector | Committed replay context | New-action prerequisites | Atomic write set / original result |
| --- | --- | --- | --- | --- |
| enter_photo_review | Existing development operator verifier; fulfillmentActionId digest | Project, Order/owner, actor kind/context, action, original expected version and purchased-items digest; prepare resolves stored commit context | Paid/succeeded, immutable complete items, no existing aggregate | Unique aggregate, applicable pending photo-review rows, decision/action/audit; result.fulfillment |
| preview reserve | Same operator; actionId digest | Project, Order/owner/Fulfillment, actor, reserve, expected aggregate version, exact item and input bytes digest | Canonical paid, current server target v1/v2/v3, preview-required item | Pending media identity and reservation decision/action/audit; result.value |
| preview ready | Same operator; hash of preview_ready:actionId | Same scope plus ready kind, expected aggregate version, media ID, trusted content digest/type/bytes/dimensions | Matching pending reservation, exact current server target, trusted helper + private Storage readback in application | Ready metadata/lifecycle/version and decision/action/audit; result.value |
| publish v1 | Same operator; actionId digest | Same scope, publish kind, expected aggregate version, normalized exact item/media entries | Paid, applicable review passed, photo_review, all purchased required items covered by ready verified media | Immutable manifest/entries, aggregate current pointer/state/version, decision/action/audit; original v1 result.value |
| customer approve | Original Order capability; member additionally fresh active matching session; fulfillmentActionId digest | Project/owner/Order/Fulfillment, customer actor digest, action kind, original aggregate/preview version, historical manifest identity, normalized input | Current complete pending manifest and exact expected versions, paid | Aggregate state/version and customer decision/action/audit; result.value |
| customer revision | Same customer authority and selector | Above plus bounded normalized revision note | Above plus per-Order count < 2 | Counter + state/version and customer decision/action/audit; result.value |
| publish v2 / v3 | Existing operator publication, no second system | Same publication context | Revision-requested state and corresponding count; server allocates next version only | Same publication set; preserves revision count and old manifests |

Photo-review decision mutation is NOT currently implemented in persistent runtime (only admission creates applicable pending rows). Production, quality-check and Admin timeout are not credited here. Task 7.5/7.6 remain separate.

## Source index

- `app/server/local-persistent-fulfillment.server.ts`: independent operator check, admission prepare/commit and original replay projection.
- `app/server/local-persistent-preview-media.server.ts`: current operator verification before each RPC, reserve/ready/publish probes, trusted helper/private readback, mandatory unified command CAS.
- `app/server/local-persistent-preview-customer.server.ts`: existing customer history authorization before exact action command; no alternate customer identity.
- `local/commerce/migrations/0019_local-commerce-fulfillment-admission.sql`: admission serialization/action/audit.
- `local/commerce/migrations/0022_local-commerce-customer-preview-decisions.sql`: customer and preview replay before new lifecycle checks, atomic writes.

All changed semantic context conflicts without another successful action/audit. Authorization failure remains unavailable before stored-result disclosure. Old replay returns history, never reinstalls an old current pointer. Storage is not in the database transaction; failed publication may retain private bytes without publication success.

## Evidence plan

New independent HTTP harness: `tests/database/local-commerce-fulfillment-replay-http-acceptance.mjs`. Exact run-5576dfd8 only; verify marker/PG17/checksums/ledger22, new synthetic fixtures only, own two Worker processes and own helper. No Docker lifecycle operations, reset, deletion or migration apply. Tests compare full Task 7 row digests for replay, count action/audit uniqueness, preserve upstream digests, record distinct restart/race PIDs.

## Executed evidence — 2026-09-14

Exact run/project/workdir/container and marker verified by each real runner. PG17, initial ledger22/pending0, all 0001–0022 checksums match. Applied 0022 SHA remains deffc036ad6527244fed58ed6dbf4ed4aabd46aa942ab3930a2aa8466c4d0126.

### Diagnosed forward fix, not retry-until-pass

Initial HTTP attempts recorded a transport TimeoutError (location not retained) and an approval-vs-revision status assertion failure (individual statuses not retained). A later diagnostic run passed; that alone was not considered a repair. Independent lock-barrier reproduction proved that two simultaneous shared Order lock holders caused the old read/prepare lock upgrade to return conflict; application prepare treated non-found as unavailable. The precise cause of the earlier uninstrumented HTTP failure cannot be retrospectively proven.

0023_local-commerce-preview-read-lock.sql changes only read/prepare to retain the authorized history shared lock. Mutations still use Order FOR UPDATE. A focused exact-diff test proves all other customer authorization, replay, mutation and ACL source remains unchanged. No new identity or authorization policy.

0023 SHA-256: 2294dd8b65fd36aef1ecc856b2d820989657008b82976e26ea0632c3eab43b7b.

Rollback-only pre-apply/security passed twice before ledger-wrapped permanent apply. 47 table snapshots unchanged after rollback; baseline digest 0989a0cea3f4ee852e8e898d8fa47bfad15e5f195c6164184c18384906eb2268. Applied ledger23/23, pending0; 0001–0023 now immutable. Forward fixes require0024+. Both lock-barrier transactions now return found, exit0, no mutation. Runner: tests/database/local-commerce-preview-prepare-concurrency.mjs.

### Independent final HTTP/runtime evidence

Full safe output, before/after upstream digests and per-action audit counts: task-7.4-http-evidence.json. Final harness exit0 on applied23. Fourteen exact replay assertions pass after lifecycle advancement, including original revision1 and publicationv2 afterv3. Full Task7 row digest is unchanged by each replay. Seven changed-input cases return409 without effects: aggregate, preview version, note, kind, publication media, publication version, upload content.

Six actual process restarts: 43168→43219→43373→43387→43401→43416→43559. Classification: committed response discarded, then process restart replay; NOT injected TCP loss. Covers admission, ready, v1/v2/v3 publication, revision and approval. Disabled operator PID43483 cannot disclose replay.

Two live Workers43559/43543: same approval200/200, same revision200/200, same publication200/200, competing publication200/409, approval-vs-revision409/200, last revision200/409, publication-vs-stale200/409. Every race adds exactly one logical decision/audit. Each of nine synthetic Orders retains exactly one aggregate; counts never exceed2, no v4, no production/quality transition, zero Shipment/events. Audit count equals distinct action key count for every action kind. No credentials or Storage locator in action results.

### Independent SQL/HTTP security and rollback evidence

tests/database/local-commerce-fulfillment-replay-applied-sql.mjs: exit0 after0023, all47 table digests unchanged after rollback. Includes earlier admission/publication faults and additional reserve4, ready4, customer4, revision-publication8 fault points. Covers before/after decision/action, media finalization, aggregate state/version/counter, manifest/entries/current pointer. No compensation or Storage deletion.

Applied RPC ACL check covers admission, preview command and customer command: fixed search_path; PUBLIC/anon/authenticated no execute; service_role permitted. RLS and no direct browser CRUD checked for six Task7 tables. This turn's HTTP customer RPC security check before0023: anon401, authenticated403, service200 bounded unavailable; browser table CRUD denied; private bucket remains nonpublic. Exact0023 diff and postapply SQL confirm unchanged grants.

Fresh missing/expired guest capability and disabled operator replay rejection executed by final HTTP harness. Member valid/missing/wrong/revoked/expired session and cross-owner/Order HTTP cases are indexed specifically from accepted task-7.3-acceptance.md authorization evidence and task-7.3-http-evidence.json; transactional guest/member authorization is independently rerun in the SQL suite after0023. These are reused cases, not claimed as new member HTTP runs.

Receipt-binding counts in the new HTTP Orders are zero (configured-empty purchases); these are not claimed as nonempty upload acceptance. SQL fault fixtures and complete-table rollback digests protect the existing receipt/history baseline. Historical manifest/media/decision replay checks compare the complete Task7 row digest. Storage/helper writes are outside the SQL transaction; valid retained bytes are not deleted to simulate atomicity.

### Final validation

- Focused and supplemental contracts:78/78, exit0 (35 focused including imported purchase-fact cases;43 supplemental).
- lint: exit0, one preexisting ProductCustomizationImageField.tsx:496 img warning, zero errors.
- typecheck: exit0.
- offline:913/913, exit0.
- fresh build: exit0; subsequent rendered11/11, exit0.
- final npm run verify: exit0, including fresh build before rendered.
- OpenSpec strict:23/23, exit0; git diff --check:exit0.

An intermediate verify failed only on the old manifest22 expectation after0023 registration. Five schema-contract files now assert the exact23 baseline; domain assertions are unchanged. These failures are not rewritten as passes.

No app/frontend/business authority implementation changed. Only the local DB read/prepare locking forward fix, acceptance harnesses/evidence and schema-version test baselines changed. Catalog, Order purchase facts, Payment, Supplier and Tracking authority unchanged. No remote services, reset, cleanup DELETE, deployment or provider calls. Git index remains empty; no commit/push. Preexisting dirty worktree preserved.
