# Task 11.2 retained-development stop/start acceptance

Status: **PASS**

Classification: `LOCAL DEVELOPMENT / TEST PERSISTENCE ACCEPTANCE`

- Project: `figmemento-local-commerce`
- Environment/kind/run: `development` / `retained_development` / `retained-development`
- PostgreSQL: 17
- Canonical marker digest: `111be9eaf847cf677e06d9f162bf810848414e7de7af5b80856f2e48fc4d9f6d`
- Ledger: 37/37; pending: 0; schema version: 37
- Migrations 0001–0037 remained unchanged; no 0038 was created or applied.
- Remote services, production database, reset, reseed, deployment and real providers: none.

## Commerce-required profile

The locked Supabase CLI 2.114.0 started the retained stack with:

`vector,logflare,studio,realtime,edge-runtime,mailpit,imgproxy,postgres-meta,supavisor`

excluded. PostgreSQL, PostgREST, Kong, GoTrue and Storage remained required and healthy. The retained DB, Storage and historical edge-runtime volumes remained present before and after each stop/start.

The pre-business security gate passed real RLS, restricted project-identity RPC and private Storage checks. The synthetic Storage probe was deleted before the gate completed.

## Evidence index

- Final retained stop/start executable: `tests/database/local-commerce-task-11.1-full-recovery.mjs` in `retained-development --confirm-retained` mode. Its terminal result was `TASK 11.2 RETAINED BASELINE PASS`.
- Retained account/session lifecycle executable: `tests/database/local-commerce-task-11.2-retained-session-lifecycle.mjs`.
- Retained security gate: `tests/database/local-commerce-task-11.2-retained-security.mjs`.
- Minimum persistent Catalog preparation: `tests/database/local-commerce-task-11.2-retained-catalog-setup.mjs`.
- Static evidence contract: `tests/task-11.2-retained-stop-start-evidence.test.mjs`.
- Retained ledger contract: `tests/local-commerce-retained-ledger-execution.test.mjs`.

## Baseline and retention evidence

Normal application HTTP/browser commands created the retained acceptance baseline; only the minimum synthetic persistent Catalog fixture was prepared through service-role Catalog setup. No final Cart, Draft, media, Order, Payment, Fulfillment, Shipment or digital row was directly seeded.

Application Worker A PID 34502 used port 62508. It exited normally and its port was closed before Worker B PID 34841 started on port 62509. The baseline was frozen, both application/helper processes were stopped, and the retained Supabase project was stopped without `--no-backup`. Containers reached zero while the exact three retained volumes and marker remained unchanged.

The stack then started with the same exclusion profile. The post-start database container was resolved again from exact project/workdir labels. PostgreSQL 17, marker identity, ledger 37/37 and all five required services were reverified before Worker PID 35485 started on port 62510.

With the original in-memory browser credentials (no relogin, replacement guest authority, reset, reseed or row copy), the following survived:

- guest Cart digest `666dd898f53850193a37dd0438ba6e3f3fafe06361e6cc99166257697662ce4a`;
- Draft/media digest `e17dab2e4ffd68eca807177d7ed23cff9350ab2f8d1b087595cb3bd9893fd266`;
- stable two-image ordering/crops and four private original/derivative byte facts;
- member subject/customer/owner continuity;
- four canonical Orders and immutable snapshot digests;
- failed then successful Payment history and action replay;
- photo review, v1→revision→v2 approval, production and quality-check history;
- distinct signed-Admin timeout decision history;
- one delivered Shipment with four ordered events and replay-safe tracking action;
- ready digital version, one canonical grant with `maxDownloads=5`, consumed quota 2 and two spent tickets.

The private byte digest/length pairs remained exactly:

- `7f771efc51da7ff6af6b2335ddb496278d26d4eda210a15697edb34a1c26389f` / 203;
- `586b6edc47733e97378c160466555ba0fb784857d5487622a4550d6aad29f07a` / 171;
- `097ad2cfe226c21078dfe15fdf0778f0b71965bf38904995921e1787394178ee` / 248;
- `b4603702f62b97b2b49a967b6c76f8e145b3d187796fc25fd242d4ae8c980a5b` / 220.

The executable included `contentType` in each private-byte fact and required exact before/after deep equality for digest, byte length and content type. Raw private locators were not copied into this sanitized acceptance document.

A normal local_fake Admin Catalog edit was visible in PID 35485 and absent after fresh application PID startup; persistent Catalog and commerce state remained unchanged. A separate non-destructive missing-object fault seam returned bounded 404/503, leaked no locator, emitted no fake bytes and did not consume quota or revive the ticket.

## Session lifecycle evidence

A separate retained stop/start preserved an original valid customer session. A session revoked through the durable provider remained unauthenticated. A 100 ms session created with the existing server-controlled lifetime seam reached `expired` and remained expired after restart. Raw session tokens were held only in the acceptance process and were not reported or persisted by the test artifact.

## Mandatory matrix reconciliation

- Retained stack: same DB/Storage volumes, zero containers while stopped, volumes present while stopped, same project marker and locked exclusion profile after restart — PASS.
- Account/authority: persistent account, original valid session and stable customer/owner recovered; revoked and expired sessions remained denied — PASS.
- Cart/Draft/media: exact Cart and Draft digests, stable slot order/crops, and original/derived byte facts matched — PASS.
- Order/Payment: four canonical Order snapshot digests and failed-to-successful payment/action history matched — PASS.
- Fulfillment/Tracking: photo review, manifest revision/approval, timeout decision, production/quality-check, one Shipment and four ordered events were retained without duplicates — PASS.
- Digital delivery: the same ready version and grant retained `maxDownloads=5`, consumed quota 2 and two spent tickets; no fresh grant or quota reset occurred — PASS.
- Missing private bytes: bounded 404/503, no fake/replacement bytes, locator leak, quota consumption or ticket revival — PASS.
- Admin `local_fake`: one process-local Catalog edit disappeared after a dedicated fresh application process while persistent Catalog/commerce remained unchanged — PASS.

## Associated validation record

- Task 11.2 focused evidence plus retained-ledger contracts: 7/7 PASS.
- Final Task 11.3 evidence/environment/ledger focused group on the accepted 11.2/11.3 tree: 15/15 PASS.
- Offline: 918/918 PASS.
- Fresh build: PASS; rendered afterward: 11/11 PASS.
- Lint: PASS with zero errors and the single existing `ProductCustomizationImageField.tsx` image warning.
- Typecheck: PASS.
- Full `npm run verify`: PASS.
- OpenSpec strict: 23/23 PASS.
- `git diff --check`: PASS.

## Harness corrections during acceptance

Three acceptance-tool defects were corrected without production changes: retained Worker mode originally forced `NODE_ENV=test`; a synthetic image field incorrectly required one image on every Cart line; and the first lifecycle harness retained the pre-restart PostgreSQL container ID. A later session probe omitted the `local_commerce` PostgREST profile and lacked a bounded post-start readiness window. Each failure occurred in acceptance tooling, preserved data/volumes, and was rerun only after the specific defect was fixed.
