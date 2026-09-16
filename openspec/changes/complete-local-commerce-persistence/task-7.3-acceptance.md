# Task 7.3 — customer approval / revision acceptance

Classification: LOCAL DEVELOPMENT / TEST PERSISTENCE ACCEPTANCE.
No Task 7.4 or Task 8 acceptance is claimed by this report.
Task 7.3 is checked after the gates below; current progress is 43/85.

## Applied identity and migration

- Exact run: `run-5576dfd8`.
- Project: `figmemento-local-commerce-test-run-5576dfd8`.
- Container: `3f0a14e18d07b71e0b235dffcdc61e672086d6fb5b32b35849aa8bf54f3be3e4`.
- Workdir: `local/commerce/runtime/disposable/run-5576dfd8` under this repository.
- PostgreSQL 17; exact workdir label, marker and all prior checksums verified.
- Before: ledger 21/21, pending 0. Final 0022 was tested through the existing
  ledger wrapper with its final COMMIT replaced by rollback, before registration.
- Final 0022 SHA-256:
  `deffc036ad6527244fed58ed6dbf4ed4aabd46aa942ab3930a2aa8466c4d0126`.
- Applied with `ledgerWrappers`, after the rollback gate. After: 22/22, pending 0.
  Prior 21 ledger rows and marker unchanged; 45 business/Storage table digests
  unchanged by permanent DDL application. 0001–0022 now immutable; no 0023.
- Pre-apply and post-apply transaction-local fixture suites each verified all
  47 commerce/Storage table digests equal before/after rollback.
- Historical candidate comments/earlier WIP checksums are not current apply state.

## Authority and implementation

- Existing `/api/local-fulfillment/:reference` GET/POST only. Existing same-origin,
  bounded JSON and reference guards retained. No second public API or identity.
- Existing `readPersistentOrderHistory` must authorize first. Original signed
  Order capability, verified owner, and fresh matching member session are reused.
  Restricted SQL repeats the existing `read_order_history` authorization before
  prepare/read/replay. A prepared identity never bypasses transactional auth.
- Application mutations use `LocalCommerceFulfillmentPort` with verified context,
  mandatory aggregate CAS and idempotency. Public inputs cannot supply owner,
  customer identity, manifest identity, lifecycle or target publication version.
- Persistent parser additionally requires `expectedAggregateVersion`; it remains
  an optimistic selector, not state authority. Both this value and expected
  preview version are retained exactly for replay, never replaced by a new read.
- SQL digest binds project, Order, owner/customer actor, Fulfillment, action,
  historical manifest identity, expected preview/aggregate versions and normalized
  note. Stored aggregate version is also explicitly compared on replay.
- Existing `fulfillment_decisions` stores decision/action/result/bounded audit;
  no second decision table. Fresh authorization precedes replay; exact replay
  precedes new-action lifecycle/version eligibility.
- Note policy: existing `LOCAL_FULFILLMENT_REVISION_NOTE_MAX_LENGTH=500`, existing
  JavaScript trim and UTF-16 length. Persistent revision requires non-empty text.
  SQL uses the same trim set and counts supplementary code points as two units.
  Local fake optional-note behavior unchanged. Notes are not HTML authority.
- Operator derives `targetManifestVersion` from restricted durable context, not
  request input. New reserve/acquire/ready/artifact/completeness/publication uses
  that target. Null permits only committed-action probes; no new publication.
  Historical committed ready-result recovery does not grant a new version.

## Evidence entry points and observed results

1. `node tests/database/local-commerce-customer-preview-preapply.mjs` — exit 0,
   BEFORE registration/apply; will intentionally refuse the now-applied baseline.
2. `node tests/database/local-commerce-customer-preview-applied-sql.mjs` — exit 0.
3. `node tests/database/local-commerce-customer-preview-http-acceptance.mjs` —
   exit 0, real vinext Workers / separate sharp helper / DB / private Storage.
4. `node tests/database/local-commerce-customer-preview-security-http.mjs` — exit 0.

Full safe runtime output, including synthetic references and upstream digests,
is retained in `task-7.3-http-evidence.json`.

### Customer lifecycle, authorization and replay

- Independent fresh v1 approval → preview_approved, revision count 0, one approval,
  no revision decision/v2/Shipment. Exact replay stable; changed aggregate or
  preview CAS/action/context conflicts without a second mutation.
- Fresh v1 revision → count 1 / revision_requested → real operator v2 → pending
  with count 1. Second revision → count 2 → real v3 → pending with count 2.
- Third revision rejects; three manifests only, maximum version 3. SQL and operator
  target gates provide no v4 reservation/publication authority.
- Missing/invalid/future preview selector, missing/stale aggregate selector,
  old v1/v2 approval, and revision-pending approval rejected with zero illegal effect.
- 500 ASCII and 250 supplementary characters accepted; 501 ASCII, 251 supplementary,
  empty/whitespace rejected. Existing parser normalization separately tested.
- Guest original capability allowed; missing/forged/expired/foreign capability and
  wrong owner/Order rejected. Member valid session allowed; missing/wrong/revoked
  and expired sessions denied even when the action previously committed.
- Expiry HTTP fixture changes only its newly created synthetic session expiry to
  the DB server clock, then proves denial from the other live Worker. No existing
  accepted session or authentication implementation changed.
- Response-loss model: client discards committed HTTP response, serving process
  terminates, a new process with original cookies/action/CAS reads the same result.
  This is not a forced TCP fault. Revision count/publication version do not advance.
- Restart PID pairs: 37592→37617→37660→37673→37730→37745.

### Simultaneously live Workers

Workers 37745 / 37594:

| Race | HTTP results |
| --- | --- |
| Two approvals | 200 / 409 |
| Approval vs revision | 409 / 200 |
| Same key/context | 200 / 200, same result |
| Last allowed revision | 200 / 409 |
| v2 publication vs stale v1 approval | 200 / 409 |
| v3 publication vs stale v2 approval | 200 / 409 |

Database serialization, no process-memory mutex. No count >2, duplicate current
manifest or v4; exact replay stable.

### Faults, privacy and immutability

- SQL before/after aggregate update and decision insertion: four injection points
  cover counter, lifecycle/version, decision, action binding and embedded audit.
  Whole scoped state digest unchanged after every failed command.
- Four publication fault points for each of v2/v3: manifest, entries, current
  pointer/aggregate and action/audit. Eight failures, zero partial new state.
- Real helper, Storage write, read-back and digest mismatch failures for each v2/v3:
  eight failures, no false ready/incomplete publication, historic ready media intact.
  Their newly created pending resources remain retained; no cleanup/DELETE issued.
- Restricted RPC: anon 401, authenticated 403; service role 200 with bounded
  unavailable for nonexistent authority. Three tables' direct CRUD denied for both
  browser roles. Fixed search_path/minimal ACL and RLS verified; private bucket,
  public object access 400. DELETE denial probes use an exact impossible UUID.
- Historical manifest/entries/ready-media and Order/item snapshots, Payment, Cart,
  Cart lines and purchased Catalog/configuration digests preserved across revisions.
  Real HTTP Orders in this suite are configured-empty: receipt-binding counts are
  explicitly 0, not evidence of a new nonempty customer-upload purchase flow.
- Zero Shipment/events for all new test Orders; no Supplier integration or calls.
  No remote, production, real Auth/payment/email/carrier/provider access.

## Validation

- Focused plus relevant customer/preview regressions: 30/30, exit 0
  (includes 8 Task 7.3-focused tests).
- Supplemental schema/session/atomicity/port contracts: 43/43, exit 0.
- Lint: exit 0; one existing ProductCustomizationImageField.tsx:496 img warning.
- Typecheck: exit 0.
- Offline: 913/913, exit 0.
- Fresh build: exit 0; subsequent rendered: 11/11, exit 0.
- Full verify: exit 0; all five stages executed, including its own fresh build.
- OpenSpec strict: 23/23, exit 0. `git diff --check`: exit 0.
- Initial offline/supplemental failures were global manifest-version/list assertions
  still fixed at 21. Updated only expected version/list to applied 22. No checksum,
  security, session or other business assertions removed/weakened; no old SQL edited.

## Scope

Only Task 7.3 may be checked on this evidence. Task 1.1 remains unchecked, and
7.4–7.7/Task 8 remain separate. No storefront, Catalog authority, Supplier semantics,
Order creation, Payment implementation or real provider changes.
Existing unrelated worktree changes retained. Index 0; no stage/commit/push.

## Changed-path inventory for this continuation

Application: `app/application/local-persistent-preview-customer-contract.server.ts`,
`app/infrastructure/local-commerce/local-persistent-supabase-adapter.server.ts`,
`app/server/local-persistent-preview-media.server.ts`,
`app/server/local-persistent-preview-customer.server.ts`,
`app/server/local-fulfillment-customer-http.server.ts`.

Migration: `local/commerce/migrations/0022_local-commerce-customer-preview-decisions.sql`
and `manifest.json`. No applied 0001–0021 source changed.

Tests: `tests/local-persistent-preview-customer-contract.test.mjs`,
`tests/local-persistent-preview-customer-security.test.mjs`; database suites
`local-commerce-customer-preview-{sql,fault-sql,preapply,applied-sql,http-acceptance,security-http}.mjs`.
Manifest assertions only: `tests/customer-session-persistence.test.mjs`,
`tests/local-commerce-schema-contract.test.mjs`,
`tests/local-commerce-purchase-schema-contract.test.mjs`,
`tests/local-commerce-security-boundary.test.mjs`,
`tests/local-persistent-cart-atomicity.test.mjs`.

Evidence: this report, `task-7.3-http-evidence.json`, historical WIP header,
and only the 7.3 checkbox in this change's `tasks.md`.

The owner attachment simultaneously says not to enter 7.4 and to continue to it
after acceptance. This continuation stops at 7.3 rather than extending scope;
7.4 requires scope reconciliation and its own independent acceptance.
