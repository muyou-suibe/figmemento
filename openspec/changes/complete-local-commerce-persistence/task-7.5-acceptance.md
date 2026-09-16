# Task 7.5 — production / quality commands

PASS — LOCAL DEVELOPMENT / TEST PERSISTENCE ACCEPTANCE, 2026-09-14.
Task7.5 independently accepted after7.4. Progress45/85;7.6/7.7 unchecked. No Task8.

## Boundary

Existing operator HTTP route and independent development operator verifier; existing unified async Fulfillment command port with mandatory expectedAggregateVersion and idempotency. No second Order, identity, workflow store or provider. The customer route does not admit these actions. local_fake parsing/behavior unchanged.

Only start_production and mark_quality_check are added. Actual canonical paid/succeeded, exact Order/owner/project, immutable purchased media applicability, approved applicable reviews, and latest complete required preview with matching customer approval are checked inside one Order-serialized RPC. An all-preview-disabled Order goes directly from photo_review only after applicable review passes, without dummy manifest or approval. Quality check remains terminal; no shipment.

Replay stores original projection and bounded audit in fulfillment_decisions. Fresh operator verification precedes prepare and commit. Equivalent committed context is resolved before new state/CAS eligibility. Changed actor/action/version conflicts. No direct browser owner/approval/price/manifest authority. No automatic production after customer approval.

The photo-review decision UI/private purchased-byte inspection command is NOT implemented by this task. Production consumes existing canonical review results and fails closed for pending/rejected. SQL approved-review setups below are transaction-private gate fixtures, not proof of a real human review workflow. This remains an explicit end-to-end integration limitation for the later batch gate. Admin timeout7.6 is not credited or enabled.

## Migration

Exact run5576dfd8/project figmemento-local-commerce-test-run-5576dfd8, original workdir/container and marker verified. PG17. Baseline23/23 with all prior checksums matched. Candidate pre-apply uses ledger wrapper and rolls back complete47 table snapshots. First candidate failed the unapproved-preview assertion due to an ambiguous SQL result reference; qualified d.result corrected it before application. No applied SQL was edited.

Applied0024_local-commerce-production-quality.sql:
SHA256 5005580f697ca818713b412d6cba244047f2d35efbcd48a27a758ee0bb0ea737.
Ledger24/24, pending0. 0001–0024 immutable; further changes0025+.

Restricted RPC fixed search_path, PUBLIC/anon/authenticated no EXECUTE; service_role permitted. Existing RLS unchanged. No new public table write endpoint. SQL fault and security suite passed before apply and after apply; complete47 table snapshots unchanged after rollback.

## Real evidence

Safe full HTTP results/digests: task-7.5-http-evidence.json.
Actual Cart→Order→local simulated payment→Fulfillment; actual helper/private preview for required and mixed cases. No generated business state passed directly to HTTP.

| Case | Competing production Worker PIDs | HTTP | Result |
| --- | --- | --- | --- |
| all preview-disabled |44956/44982|200/409|one production, one explicit quality, no manifest|
| preview-required |45147/45191|200/409|customer approval first, then production and quality|
| required+disabled mixed items |45299/45321|200/409|only required item in approved preview, then production/quality|

Each case has exactly one production and one quality audit/action; retained Cart/purchase/item/Payment/Catalog digests unchanged; zero shipments/events. Missing CAS and customer production input400; unapproved required preview409; disabled operator replay403/404. Repeated new quality action rejected. Six exact replay assertions pass after quality and process restart. PIDs44956→45147→45299→45350, committed response discarded then restart, not TCP-fault injection.

HTTP suite initially stopped due to test-local variable start shadowing the Worker launcher; renamed productionInput without changing application behavior or assertions, then full suite exit0. All synthetic artifacts retained; no cleanup/delete/reset.

SQL tests separately cover media-bearing pending/rejected blocking, approved applicability pass, no dummy media-empty review, required v1/v2 approval, revision-pending and unapproved currentv2 blocking, stale CAS/changed action/actor/project, terminal quality, exact old replay, immutable purchases, and four lifecycle/action fault positions for each of two applicability setups (8 injections). All roll back. Earlier customer/manifest/authorization security matrices also execute in the same gate. Synthetic approved photo-review rows are not a claimed operator mutation implementation.

## Validation from final source tree

- Task7.5 focused4/4; combined focused/supplemental82/82, exit0.
- Applied24 SQL gate:exit0,47 tables unchanged after rollback.
- Real HTTP/helper/Storage/DB:exit0, three case/race groups and six replay checks.
- npm run verify:exit0; lint0errors/one existing img warning; typecheck PASS; offline913/913; build PASS; rendered11/11 after fresh build.
- OpenSpec strict23/23; git diff --check PASS.

## Files in this continuation

- app/server/local-persistent-fulfillment-lifecycle.server.ts: bounded input, independent actor, unified CAS adapter.
- app/server/local-fulfillment-operator-http.server.ts: persistent-only production/quality dispatch; fake behavior unchanged.
- app/infrastructure/local-commerce/local-persistent-supabase-adapter.server.ts: restricted RPC name and typed arguments.
- local/commerce/migrations/0024_local-commerce-production-quality.sql and manifest.json: ordered local forward implementation/checksum.
- tests/local-persistent-production-quality.test.mjs: four focused contracts.
- tests/database/local-commerce-production-quality-{sql,migration,applied-sql,http}.mjs: isolated real acceptance.
- Five existing schema-version tests (customer-session-persistence, local-persistent-cart-atomicity, local-commerce-security-boundary, local-commerce-schema-contract, local-commerce-purchase-schema-contract): exact manifest baseline24 only; no domain assertion removed.
- This report, safe JSON evidence and tasks.md.

Order/Payment/Catalog/Supplier authority and storefront unchanged; Fulfillment commands extended only as specified. No remote Supabase, deployment, real Auth/payment/email/carrier, Supplier persistence or Task8. Existing dirty worktree preserved, staged0, commit NONE, push NOT PERFORMED.
