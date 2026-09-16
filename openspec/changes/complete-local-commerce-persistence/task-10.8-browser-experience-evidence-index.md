# Task 10.8 browser experience evidence index

Classification: LOCAL DEVELOPMENT / TEST PERSISTENCE ACCEPTANCE.

Status: PASS.

This index consolidates the accepted Task 10.6 desktop and Task 10.7 mobile/Admin evidence plus the narrowly authorized Task 11.1 cross-group dependency slice. The dedicated slice used a new controlled Worker A, proved its exact identity, terminated it, proved its PID and port absent, then started a distinct Worker B and recovered the exact saved customization with the original browser authority.

## Target and authority

- Disposable run: `run-5576dfd8`
- Project: `figmemento-local-commerce-test-run-5576dfd8`
- Database migration ledger: 37/37, pending 0; migrations 0001–0037 remain immutable.
- Primary Worker: PID 5170 on the accepted local test surface.
- Independent Worker: PID 9102 on a separate accepted local test surface.
- PID 9102 read the same durable Draft and private media created through PID 5170. This proves process memory was not read authority, but it does not prove that Process A terminated before Process B started.
- Browser owner, signed Admin, Catalog, Cart, Order, Payment, Fulfillment, Shipment, Tracking, private-media, and database authorities remained separate and unchanged.

## Scenario index

| Scenario | Route/surface | Viewport/input | Expected | Actual | Evidence type | Artifact/log/network reference | Result |
|---|---|---|---|---|---|---|---|
| Catalog-backed Product and Variant | Product detail | Desktop; authoritative Small Variant/SKU | Browser presents server Catalog facts | Product and exact Variant/SKU remained server-backed | DOM + accepted Task 10.6 trace | Task 10.6 focused contracts; Order correlation below | PASS |
| Button file selection | Product image field | Desktop button/file input | One explicit file creates one attempt | Upload accepted without browser media authority | Browser + network | `POST /api/uploads` 201 | PASS |
| Drop-equivalent admission | Product image field | Multi-file admission | Capacity is bounded; each accepted file has an independent slot | Remaining capacity filled; over-capacity files rejected without corrupting existing slots | Browser + reducer contracts | `product-customization-image-slots.test.mjs` | PASS |
| Independent upload identity | Product image field | Same bytes, explicit new action | New request key and independent operation | Independent explicit upload remained distinct | Browser + contract | Task 10.6 K4 replay and Task 10.7 replacement evidence | PASS |
| Reverse completion | Slot reducer | Two pending slots | Results attach to exact stable slots | B then A completion preserved A/B identity | DB-disabled test | `product-customization-image-async-fencing.test.mjs` | PASS |
| Reorder while pending | Slot reducer and mobile controls | Pending upload; touch/button reorder | Stable slot keeps its operation | Pending completion followed slot identity after reorder | Browser + DB-disabled test | Task 10.7 touch evidence; async-fencing test | PASS |
| Remove/cancel while pending | Product image field | Real paused HTTP response | Late success/failure cannot resurrect or add ghost error | Slot stayed removed after response release | Browser/CDP + DB-disabled test | Task 10.7 late-response trace; async-fencing test | PASS |
| Replacement generation | Product image field | Same slot, next selection generation | Old success/failure is fenced | Confirmed preview retained until replacement acceptance; removed replacement returned to empty slot | Browser + DB-disabled test | Task 10.7; async-fencing test | PASS |
| Crop | Product image field | Keyboard dimensions and coarse-pointer drag | Both inputs update the same normalized crop authority | Keyboard produced 80/80; touch produced left 14.633349665196798 and top 7.857362091576216 | Browser + contract | Task 10.7 mobile acceptance; crop tests | PASS |
| Stale decode/preview/save | Client/reducer | Superseded revision | Old async results cannot overwrite current state | Generation/revision guards rejected stale results | DB-disabled test | async-fencing and draft HTTP tests | PASS |
| Persistent Draft save | `/api/local-drafts` | Exact draft/version CAS | Server returns safe projection | HTTP 200 and exact confirmed revision persisted | Browser + network + DB | Task 10.6/10.7 accepted traces | PASS |
| Draft refresh | Product detail restore | Full browser refresh | Exact Draft and private receipt projection recover | Draft, two private images, order, and crop recovered | Browser + DB/private Storage | Task 10.6; Task 10.5 contracts | PASS |
| Independent Worker read | Product detail restore | PID 9102 after PID 5170 had created data | New process reads DB/Storage, not process memory | Same Draft/private preview/crop recovered | Browser + process evidence | Task 10.7 acceptance | PASS |
| A terminated then B started | Product detail restore | Dedicated PID 17675 then PID 17748 | Fresh process recovers after creator process termination | A exited cleanly and its port closed before B started; B recovered exact Draft/crops/private bytes | Browser + process + DB/private Storage | `task-10.8-restart-slice-evidence.json` | PASS |
| Cart and checkout | `/api/cart`, `/api/checkout` | Desktop accepted configured item | Server validates persistent purchase facts | HTTP 200/200 | Network + DB | Task 10.6 accepted trace | PASS |
| Local Order and Payment | `/api/local-orders`, payment action | Desktop | Immutable Order then simulated payment | Initial 204 then recovery 200; payment 200 | Network + DB | Order `FM-LOCAL-8FD67E9CB5A1467D` | PASS |
| Preview/revision/production/QC | Customer and signed operator surfaces | Desktop | Existing lifecycle gates serialize legal transitions | v1, revision, v2, approval, production and quality check completed | Network + DB | Task 10.6 accepted trace | PASS |
| Shipment boundary | Customer tracking | Before explicit create | No automatic Shipment/Tracking | Pre-shipment milestone showed neither | Screenshot + DB | `desktop-before-shipment.png` | PASS |
| Shipment lifecycle | Operator/customer tracking | Desktop | Explicit create then shipped/in-transit/delivered | Four canonical states observed; tracking delivered | Screenshots + network + DB | Four shipment screenshots; operator/customer requests 200 | PASS |
| Foreign customer isolation | Customer Order/tracking/media | Separate browser context | Same public selector without authority reveals nothing | Customer surfaces returned 404 | Browser + network | Task 10.6 foreign-context trace | PASS |
| Mobile overflow | Customer journey | 375x812, DPR 2 | No horizontal overflow | Every inspected state reported zero overflow | Browser DOM | Task 10.7 acceptance | PASS |
| Admin authentication | `/admin/orders`, `/admin/products` | 375x812 | Fresh signed Admin required | Unauthenticated redirect; signed cookie admitted; hostile password stayed generic | Browser + network + cookie metadata | Task 10.7 acceptance; no cookie value retained | PASS |

## Keyboard/button equivalence

| Interaction | Pointer/touch path | Keyboard/button path | Exercised result |
|---|---|---|---|
| Select media | Drop/select gesture | Labeled file-input button | Button path and bounded multi-file admission both exercised; same slot admission rules applied. |
| Reorder media | Coarse-pointer/touch activation | Labeled move-up/move-down buttons | Touch move-up exercised on mobile; button controls remained present and reducer contracts prove stable-slot ordering. |
| Crop media | Coarse-pointer drag | Numeric keyboard fields | Both exercised against one crop model; saved normalized crop recovered after refresh. |
| Remove/cancel | Pointer activation | Labeled remove/cancel buttons | Real control removal while HTTP response was paused fenced the late result. |
| Retry/recover | Retry activation | Labeled recovery action | Same request key/exact context recovered the canonical attempt; exact replay did not duplicate a receipt. |

## Safe screenshot artifacts

All screenshots are synthetic customer tracking milestones. No Admin Orders screenshot was exported because that surface contained broad customer/order content.

| Artifact | Dimensions | SHA-256 | Meaning |
|---|---:|---|---|
| `evidence/task-10.8/desktop-before-shipment.png` | 2400x1436 | `c95925eb471d6fcf0c5ce63ee4d97fb0c3bfcc53624b63bd8f5213d191595be3` | Ready-for-outbound boundary before explicit Shipment creation. |
| `evidence/task-10.8/desktop-shipment-created.png` | 2400x1436 | `bb4b733ef03bb69794178867a2dae55175b81ae6117c768f7864a4d4bdaa93f0` | Explicit shipment-created milestone. |
| `evidence/task-10.8/desktop-shipped.png` | 2400x1436 | `fe74a50987e0a9b382c81765c8e6daecbaaffa78c9ec321756b3ac6d5a4a66d8` | Shipped milestone. |
| `evidence/task-10.8/desktop-in-transit.png` | 2400x1436 | `b68d2506336ac0d3098fb04a7288d22c376e0f6d34ed26a3ee2009cb3e194d9a` | In-transit milestone. |
| `evidence/task-10.8/desktop-delivered.png` | 2400x1436 | `e1730a2ab71709a87d7f2b1d78bcec93209424534922a8c0d14bec416cc69eff` | Delivered milestone. |

## Network evidence

Only method/path/status and safe public identifiers are retained. Authorization values, cookies, request keys, service credentials, private object locators, and response secrets are excluded.

| Request | Status/result |
|---|---|
| `POST /api/uploads` | 201 |
| `POST /api/cart` | 200 |
| `POST /api/checkout` | 200 |
| `POST /api/local-orders` | 204 after commit ambiguity; exact recovery 200 |
| Payment action | 200 |
| Fulfillment operator/customer actions | 200 |
| Tracking operator/customer actions | 200 |
| Private preview generation/read | 201/200, `image/png`, `private, no-store` |
| Foreign customer reads | 404 |

## Database and private Storage correlation

Read-only checks against the exact disposable project confirmed:

- Marker: exact project, test environment, disposable-test kind, active lifecycle, schema version 37.
- Ledger: 37 distinct ordered versions and 37 distinct checksums.
- Desktop Draft `ccd34808-a6e2-4c8e-aaf6-24830adc23f0`: confirmed revision 5, version 5, two active ready receipt bindings; both originals and derivatives exist in the private bucket.
- Mobile Draft `f5820ec3-8825-40c5-a6da-36fb52993070`: confirmed revision 5, version 5; removed selections did not leave active Draft media links.
- Order `FM-LOCAL-8FD67E9CB5A1467D`: paid, one immutable item, two attached receipt facts.
- Fulfillment: quality check, revision request count 1, current immutable manifest v2.
- Shipment `FM-LOCAL-SHP-A9347116792B`, tracking `FM-LOCAL-TRK-33780281DC6B`: delivered with four events.
- Bucket `local-commerce-private`: private. No bucket path, object key, signed URL, or credential is present in this index.

## DB-disabled race suite

The suite is launched with `tests/fixtures/task-10-database-disabled-sentinel.mjs`, which replaces fetch and Node TCP/TLS/HTTP/HTTPS/datagram entry points with a synchronous fail-fast error. The sentinel is asserted independently before race tests run; therefore a passing suite cannot silently use local PostgreSQL, PostgREST/RPC, Storage, or a remote provider.

| Required race/guard | Contract evidence |
|---|---|
| Inverse completion | `Task 10.2 two independent slots accept reverse-order upload completion` |
| Reorder pending | `Task 10.2 reorder while pending preserves slot identity and completion target` |
| Remove pending | `Task 10.2 removal makes late success unable to resurrect a slot` |
| Cancel plus late success/failure | Cancellation and removal late-result tests |
| Replacement generation | Old upload success and failure fencing tests |
| Stale decode | Old decode generation test |
| Stale preview | Async crop-preview revision test |
| Stale Draft save | Async confirmed-revision test and projection-selection regression |
| Retry/recovery exact slot | Upload recovery/release exact request-key and Draft-CAS contract |
| Preserve other slot/text/crop | Unrelated image/non-image state and crop/reorder tests |

Task 10.5 stale-save and stale-preview guards are explicitly indexed above; older, regressive, and different-Draft responses are rejected by `selectPersistentDraftProjection`.

## Copy and authority audits

- A scoped search of the Product customization UI and its client/server upload path found no unsupported browser promises about blur, face detection, side profile, occlusion, or people count. Static editorial copy elsewhere is not media-validation authority.
- Admin Catalog authority separation: `/admin/products` remained the 22-product process-memory `local_fake`, visibly local/test-only and restart-resettable. `/admin/orders` remained canonical local persistent commerce. Admin Catalog changes cannot mutate persistent storefront purchase authority.
- The browser never became authority for owner, Product, field, MIME, dimensions, pricing, lifecycle, or private locator facts.

## A→B process-restart dependency slice

The earlier PID 5170/PID 9102 evidence remains classified only as simultaneous independent-process reconstruction. It was not reused as termination evidence.

- Worker A: PID 17675, port 63092. Its command named the exact acceptance Worker, run `run-5576dfd8`, and port; cwd was the repository root; its startup record named the same run and port.
- A termination: the harness sent SIGTERM only after the command/cwd/run/port identity checks. A exited with code 0; PID absence and closed port were proven before B startup.
- Worker B: PID 17748, port 63093, distinct from A, with the same exact run/project, retained DB/private Storage, and in-memory test signing configuration.
- Original browser authority: the same Chrome process/profile retained the exact original cookie values. Only safe names and metadata were recorded: `photogift-guest-draft-owner` and the exact Product Draft selector, both HttpOnly and SameSite=Lax. No login or credential reissue occurred.
- Recovered Draft: `8ed04d5c-f02d-46e1-9f20-8b57750defeb`, Product `41000000-0000-4000-8000-000000000002`, version 3, confirmedRevision 3.
- Slot 0: `694ba119-70bf-442d-b28c-463af2494b09`, crop `{x:0.1,y:0.15,width:0.7,height:0.65}`. Private PNG was 195 bytes with SHA-256 `83db4ede6215203c6d029e89863ccf2e9c0744acb06322ab358b8740db0bdb9f` before and after restart.
- Slot 1: `bca9ffa8-9445-47ee-9b35-cc4b49bcc69b`, crop `{x:0.05,y:0.1,width:0.8,height:0.75}`. Private PNG was 198 bytes with SHA-256 `295c93de75dad40b76a43280095a6339982962f3f3522600bd119f06576bb93a` before and after restart.
- Stable slot order, receipt references, crops, safe receipt metadata, byte lengths, and digests matched exactly. Read-only acceptance tooling confirmed both originals and both derivatives remained present in private Storage; no locator was exposed.
- Browser storage: local/session browser business-authority keys were absent and IndexedDB was empty. A normal presentation language preference was not treated as persistence authority.
- Foreign browser: restore returned the bounded `{status: "not_found"}` projection and private preview returned 404.
- No reset, reseed, migration, fixture replay, relogin, new Draft, replacement upload, DB/Storage recreation, row copying, or owner rewrite occurred between A and B.

The sanitized machine-readable result is in `task-10.8-restart-slice-evidence.json`; the executable focused acceptance is `tests/database/local-commerce-task-10.8-restart-slice.mjs`.

This proves only the Task 10.8 dependency slice. Task 11.1 remains unchecked; comprehensive Cart/account/Order/payment/Fulfillment/Shipment/digital/Admin restart recovery was not claimed or executed.

## Final validation

- Task 10 focused browser/security/Admin/Tracking contracts: 102/102 PASS.
- DB-disabled sentinel plus race/slot/crop/Draft suite: 44/44 PASS. The sentinel itself was asserted and attempted fetch/TCP/HTTP access failed fast.
- Evidence-index consistency, sanitized restart-slice integrity, and five PNG signature/dimension/digest checks: 3/3 PASS (included in the 102-test focused run).
- Dedicated A→terminate-A→B restart-slice acceptance: PASS with distinct PIDs 17675/17748, exact original browser authority continuity, exact Draft/private-preview recovery, and foreign-owner rejection.
- Browser copy authority search: PASS; no unsupported media-analysis promise in the scoped customization client/server surface.
- Lint: PASS with 0 errors and the single pre-existing `ProductCustomizationImageField.tsx` `<img>` warning.
- Typecheck: PASS.
- Offline: 918/918 PASS.
- Fresh build: PASS.
- Rendered after the fresh build: 11/11 PASS.
- `npm run verify`: PASS with lint, typecheck, offline 918/918, fresh build, and rendered 11/11.
- OpenSpec strict: 23/23 PASS.
- `git diff --check`: PASS.
- Index: zero staged paths. No migration, remote access, deployment, provider call, stage, commit, or push occurred.

Task 10.8 is checked after this complete validation, moving the change progress to 70/85. Task 11.1 remains unchecked and receives no progress credit from this narrow dependency slice.
