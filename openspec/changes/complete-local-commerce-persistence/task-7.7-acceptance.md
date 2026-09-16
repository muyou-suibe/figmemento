# Task 7.7 — Full persistent Fulfillment integration acceptance

Status: **PASS**

Classification: **LOCAL DEVELOPMENT / TEST PERSISTENCE ACCEPTANCE**

## Exact persistent target

- Run: `run-5576dfd8`
- Project: `figmemento-local-commerce-test-run-5576dfd8`
- PostgreSQL: 17
- Marker digest: `a9e9004d843753efa456c4e8b66f91ed95d268034fba1166c55d9785dadf815c`
- Ledger: 26/26
- Pending migrations: 0
- Migration 0026 SHA-256: `1605742515578fd0d433041fb0c603d65aa3d5b07a45be3e1c5c758a840c2b85`
- Applied migrations 0001–0026 are immutable. Any later correction uses 0027+.

## Durable photo-review authority

- The existing development operator verifier and existing same-origin operator HTTP namespace are reused.
- `fulfillmentActionId`, stable Order item identity, and mandatory aggregate CAS are accepted only through the existing unified Fulfillment command boundary.
- Applicability and receipt facts are reconstructed from the immutable purchased snapshots and exact committed receipt bindings. Browser project, owner, review, media, or authority facts are rejected.
- Empty purchased media produces no review. A malformed purchased media fact fails closed.
- Pending review transitions to exactly one persistent `approved` or `rejected` decision. Exact committed replay is stable after a Worker restart; changed action, actor, Order item, or aggregate version conflicts.
- The transaction atomically changes the review, Fulfillment version, and action/audit row. Six before/after injected SQL fault points proved zero partial state.
- RLS remains enabled. PUBLIC, anon, and authenticated have no direct RPC execute or review/decision table CRUD; service role has the minimum RPC execute grant.

## One indexed full Task 7 gate

`tests/database/local-commerce-task-7-final-gate.mjs` executed these six suites successfully against ledger 26:

1. applied SQL/fault/security matrix;
2. real upload/private Storage/receipt/Cart/Order/Payment/admission/photo-review chain;
3. customer preview v1–v3 chain;
4. replay and atomicity chain;
5. production and quality chain;
6. signed Admin timeout chain.

The real-media matrix proved:

- one image, preview required: approved review, committed-response restart replay, v1→v2→v3, third revision rejected, then `quality_check`;
- one image, preview disabled: rejected review blocks production;
- two images with quantity three: exactly one item review, concurrent approve/reject serializes to one decision;
- two distinct lines: exactly two reviews and both approvals permit no-preview production/quality;
- mixed required items: exact one media-applicable review, complete Order-wide v1, approval, production, quality;
- zero images with preview required: zero reviews, v1 approval, production, quality;
- zero images with preview disabled: zero reviews and no dummy manifest/approval, production, quality.

All seven cases retained immutable Order purchase snapshots and produced zero Shipment and Shipment events. Supplier persistence is absent from this Task 7 boundary.

## Concurrency index

All 12 required two-live-Worker races passed:

1. same admission action ID;
2. different admission action IDs;
3. same photo-review action ID;
4. competing photo-review approve/reject;
5. last allowed customer revision;
6. publication versus stale approval;
7. two publications for the same next version;
8. two customer approvals;
9. Admin timeout versus revision;
10. Admin timeout versus approval;
11. start production versus approval/version transition;
12. quality-check exact duplicate versus new selector.

Every race produced one legal canonical effect (or exact replay), no revision count above two, no v4, no duplicate current manifest, and no process-memory mutex authority.

## Restart and failure evidence

- Review decision: committed response discarded, next PID returned the exact replay.
- Customer approval/revision/publication: five recorded process transitions.
- Fulfillment replay matrix: six recorded process transitions.
- Production/quality: three recorded process transitions.
- Admin timeout: one recorded process transition.
- Eight preview helper/Storage/readback failure cases produced no false-ready media or incomplete publication.
- SQL faults covered review, Fulfillment, decision/audit, customer decisions, manifests/entries, production/quality, and timeout; every transaction-private fixture rolled back and all 47 table digests remained unchanged.

## Validation

- Task 7 focused and supplemental tests: 64/64 PASS
- Indexed full Task 7 integration gate: 6/6 suites PASS; 12/12 race classes PASS
- Lint: PASS, 0 errors; one pre-existing `ProductCustomizationImageField.tsx` image warning
- Typecheck: PASS
- Offline: 913/913 PASS
- Fresh build: PASS
- Rendered after fresh build: 11/11 PASS
- `npm run verify`: PASS
- OpenSpec strict: 23/23 PASS
- `git diff --check`: PASS

No remote Supabase, production database, deployment, real Auth, payment/email/carrier provider, Supplier persistence, staging, commit, or push was used.
