# Task 7.6 — signed Admin timeout confirmation

2026-09-14. LOCAL DEVELOPMENT / TEST PERSISTENCE ACCEPTANCE.

## Authority

Owner decision attachment 9903ee52-593c-46d3-a187-3062a654b714 explicitly approves the independent Admin reason maximum: 500 UTF-16 code units after existing JavaScript trim, without internal whitespace collapse or Unicode normalization. This is not inferred from customer or Supplier notes. Plain text is not executed or interpreted as authority.

Reuse existing signed Admin session verifier, photogift-admin-session cookie, same-origin mutation gate and configured-admin principal. Fresh verification occurs before prepare and commit/replay. Customer capability and operator-only context do not authorize timeout. No new identity/auth provider. Mandatory aggregate CAS, manifest selector/version and action ID remain on the unified async Fulfillment port.

The database publication timestamp generates an immutable manifest-scoped approval_deadline_at = published_at + 259200 seconds. Each v1/v2/v3 has its own deadline. No env/request duration or clock authority, no historical backfill. Comparison is database now >= stored deadline. Old NULL deadlines fail closed.

Distinct operator_timeout decision records actor, trimmed reason, server timestamp, deadline, manifest/version, context digest and bounded audit atomically with Fulfillment/version. Exact authorized replay precedes new lifecycle checks. No customer_approve, revision reset, manifest creation or automatic production. A separate authorized production command can consume the exact timeout.

## Migration

Exact run-5576dfd8, project figmemento-local-commerce-test-run-5576dfd8; workdir and full container ID verified against retained preparation metadata. PostgreSQL17. Baseline24/24, pending0; prior file/manifest/ledger checksums matched. Rollback-only pre-apply and ACL/RLS gate passed before permanent apply.

0025_local-commerce-admin-timeout.sql SHA-256:
`4828906d9ee765566bbd63547db3a2bdb83e76a42c8592ff9e643da82519cc93`

Ledger25/25, pending0, marker unchanged. 0001–0025 immutable. Further durable fixes require0026+. No reset, deletion, reseed, root or remote operation.

Restricted RPC denies PUBLIC/anon/authenticated EXECUTE and grants only service_role; fixed search_path. Internal deadline/clock helpers have no service-role/public execution grant. No new browser CRUD or public Storage access.

## Real HTTP / Worker / helper / Storage acceptance

`node tests/database/local-commerce-admin-timeout-http.mjs` exit0 twice. Fresh synthetic Cart→Order→local simulated payment→Fulfillment→private helper media→preview publication. Real /api/admin/login signs the existing cookie; primary success is POST /api/local-fulfillment/admin/:reference/timeout, not direct RPC.

Latest run:

- Fresh before deadline and deadline−1s reject409; exact deadline accepts200; after deadline accepts200.
- Old persisted NULL deadline: real signed Admin HTTP409 and complete Order-local effect digest unchanged; no backfill.
- Empty/blank/501 units/251 emoji reject400. Trimmed250 emoji accepted as500 UTF-16 units. SQL separately accepts500 ASCII units.
- Missing selector, request deadline/serverNow/owner reject400; stale version/CAS409.
- Missing, invalid, expired signed Admin and customer/operator-only cookie401. Expired Admin also denied committed replay.
- Committed response discarded; Worker51251 stopped, new Worker51305 freshly authenticates and returns exact original timeout. This is NOT TCP-fault injection.
- Replay after independently authorized production returns original timeout without state rollback. Changed reason/CAS conflict409. Exactly one timeout audit; zero customer approval for timeout.
- Revision1→v2→revision2→v3 use new server deadlines; revision-pending and old deadline rejected. v3 timeout retains revision count2; no v4.

Two simultaneously alive Workers51305 /51256:

| Race | HTTP | Logical decision |
|---|---|---|
| same action/context |200/200|one timeout, equivalent replay|
| different timeout actions |200/409|one timeout|
| timeout vs revision |200/409|one timeout; no counter increment|
| timeout vs approval |200/409|one timeout; no fabricated customer decision|

Clock boundary tests temporarily replace the internal DB clock body for exact newly created project/Order/manifest IDs only; all other IDs use clock_timestamp. Stored publication/deadline records are not altered. Original function definition restored and compared in finally: clockRestored=true. No browser clock hook exists.

Historical manifest/entries/ready-media/customer-decision digest before and after timeout/replay/production:
`2381e577bc3a2d646968230722eb1a6c` → same.
All six fresh Orders have identical before/after Order/item purchase, receipt-binding, Payment, retained Cart and Catalog/configuration digests. Receipt bindings in these media-empty purchases are empty, not proof of a new purchased-media review flow. Preview media itself uses real helper/private Storage. Zero shipments/events. No Supplier operation or provider is called.

## SQL boundary and atomicity evidence

`node tests/database/local-commerce-admin-timeout-applied-sql.mjs`: exit0. Entire47-table before/after snapshot unchanged after rollback. Includes prior publication/customer/replay/production security contracts plus timeout-specific tests.

Timeout faults before/after Fulfillment update and decision/action/audit insertion (4 positions) yield unavailable with zero partial mutation. Deadline evidence is part of the atomic decision/audit JSON, not an independent write. Exact equality, after, missing deadline, reason UTF-16, wrong actor/project/marker, stale version, replay, distinct timeout, no counter reset/v4 and private ACL checks pass. Pending/rejected applicable photo review rejects; approved passes.

IMPORTANT: SQL photo-review state changes are transaction-private fixtures. They are NOT a real authorized human review command and do NOT satisfy7.7. Real timeout success above uses correctly non-applicable purchased photo reviews. No review gate was weakened.

## Validation

- New focused6/6; focused plus supplemental40/40, exit0.
- Applied SQL gate: PASS/exit0,47 tables unchanged.
- Real HTTP acceptance: PASS/exit0; original DB clock restored.
- npm run lint: exit0;0 errors,1 existing ProductCustomizationImageField img warning.
- npm run typecheck: exit0.
- npm run test:offline:913/913,0 skipped, exit0.
- npm run build: exit0.
- npm run test:rendered after fresh build:11/11,0 skipped, exit0.
- npm run verify: exit0 (same lint/typecheck/offline/fresh-build/rendered sequence).
- OpenSpec strict:23/23, exit0. git diff --check:exit0.

## Changed files

New:
- app/application/local-persistent-admin-timeout-contract.server.ts
- app/server/local-persistent-admin-timeout.server.ts
- app/api/local-fulfillment/admin/[reference]/timeout/route.ts
- local/commerce/migrations/0025_local-commerce-admin-timeout.sql
- tests/local-persistent-admin-timeout.test.mjs
- tests/database/local-commerce-admin-timeout-{sql,migration,applied-sql,http}.mjs
- this acceptance report

Modified:
- app/application/local-commerce-provider-ports.server.ts (verified Admin actor kind, not a parallel mutation port)
- app/infrastructure/local-commerce/local-persistent-supabase-adapter.server.ts (allowlisted restricted RPC)
- local/commerce/migrations/manifest.json (version25/checksum)
- tests/customer-session-persistence.test.mjs
- tests/local-persistent-cart-atomicity.test.mjs
- tests/local-commerce-security-boundary.test.mjs
- tests/local-commerce-schema-contract.test.mjs
- tests/local-commerce-purchase-schema-contract.test.mjs
- tasks.md (7.6 only after acceptance)

The five existing tests change only manifest-version expectations. Existing unrelated worktree changes preserved. No frontend, Catalog, Order/Payment authority or Supplier semantics changed. staged0, no commit/push. No remote services or deployment.

## Next: independent7.7 gate

7.6 accepted; progress46/85. 7.7 remains unchecked;1.1 unchanged blocked. No Task8.

Read-only continuation audit confirms the known implementation gap: persistent-photo-review currently provides applicability/read gate only; admission inserts pending reviews, but there is no real review-decision HTTP mutation.7.7 still requires that authorized persistent mutation plus real purchased-media pending/rejected/passed integration. The SQL fixtures above cannot be credited toward it.7.7 is not completed by this report.
