# Task 5.7 — real Worker/media closure

Date: 2026-09-12. Change: complete-local-commerce-persistence.
Result: PASS, development/test local acceptance only; no production readiness claim.

## Authority and scope

Only existing disposable `run-24f7c009` was used. Project:
`figmemento-local-commerce-test-run-24f7c009`.
Marker digest: `901ed1ba46178bdd9776c06594212bce089a31b1d99185fb0a2c00416645bfa8`.
API 55911, DB 55912, separate helper 55915, actual Worker 55916.
Exact Docker DB was resolved from the exact workdir label, not a truncated name.
No reset/reseed, no changes to frozen runs 75224a5b/f1abf734, no other container stop/restart.
Catalog, customer/guest authentication, Supplier and purchase authority are unchanged.
No Task 6, remote Supabase, production providers, deployment, stage, commit or push.

## Recovery implementation

The sole persistent `POST /api/uploads` requires a UUID `Idempotency-Key`.
Optional `X-Upload-Recovery: 1` cannot create an unknown operation.
Fresh verified owner precedes request admission. Server-detected bytes/digest,
project, owner, draft, original expected version, Product, field and configuration
facts determine the fingerprint. Browser fingerprints and internal operation IDs
are not accepted. Keys are selectors, never authorization.

`media_upload_command` atomically creates the server operation and its durable
project/owner/key-digest binding. A matching pending retry resumes that operation;
ready replay reads back immutable bytes and returns the same receipt. Failed
operations remain unavailable. Different inputs conflict; absent recovery keys
cannot create state. Independent explicit keys do not content-deduplicate.
The browser response contains only receipt/warnings, not operation/slot/owner,
bucket, locator or service credentials. Full browser draft/retry UI remains Task 10.

## Migration

Added and applied through `ledgerWrappers` only:
`0013_local-commerce-upload-command-binding.sql`.

SHA-256: `84672f02203adcf056231de466b24e95089d363576a58e94ff2d356fad06aff1`.

Manifest schemaVersion 13; all source checksums matched; applied ledger 13/13,
pending 0. Only version 13 was applied; 0001–0012 were not edited or reapplied.
0013 is now applied/immutable; any subsequent repair requires a forward migration.
Rollback/forwardFix instructions are in the manifest. No outer SQL transaction:
the ledger wrapper owns it. RLS enabled, browser roles revoked, fixed search_path,
explicit RPC parameter types and service-role-only execution.

## Final real acceptance command and result

`node tests/database/local-commerce-worker-media-acceptance.mjs run-24f7c009 --confirm-disposable`

Exit 0. Worker A PID **69377**, Worker B PID **69389**, helper PID **69376**.
Real Vite/vinext/Cloudflare configuration and `worker/index.ts`, mode test/test;
not imported Node API handlers. Ordinary dev/build/start were not changed.
Only the test's own helper/Worker child processes were terminated afterward.

| Evidence | Actual result |
| --- | --- |
| Two independent explicit uploads, identical bytes, new keys | HTTP 201/201; different durable operation IDs and receipts |
| Same-origin private preview | HTTP 200, image/png, 12×8; no owner HTTP 404 |
| Simulated lost response | After HTTP 201 and durable commit, cancel/discard response body without reading receipt JSON; this is client response-body loss, not a claimed network-proxy outage |
| Terminate A, start B, original cookie/context/key | HTTP 201; identical durable operation/binding and receipt; one binding, two private objects before and after; no new login/fixture replay |
| Changed bytes / original expected version | HTTP 409 / 409 |
| Different unknown Product / field / draft selector | HTTP 404 / 404 / 404, no binding change |
| Different valid signed guest owner / no owner | HTTP 404 / 404 |
| Unknown key, recovery only | HTTP 503, zero bindings for that key |
| anon table GET/POST/PATCH/DELETE and RPC | HTTP 401 for all five |
| authenticated table GET/POST/PATCH/DELETE and RPC | HTTP 403 for all five |
| Operation/binding atomicity | Transaction-local CHECK failure on one new synthetic key; operation and binding counts unchanged; rollback removes the injected constraint; no permanent schema edit |
| Immutable original | Real Storage download SHA-256 equals uploaded original |
| Trusted crop | Nonuniform 12×8 image → 6×4; decoded pixels equal exact original rectangle (left 3, top 2) |
| Original Storage write failure | Real unauthorized Storage request; unavailable, pending/no receipt; purchase validators reject |
| Metadata publish failure | Real RPC wrong-marker rejection; unavailable, pending/no receipt; purchase validators reject |
| Helper render failure | Separate real helper wrong-credential rejection; unavailable, pending/no receipt; purchase validators reject |
| Read-back failure | Real unauthorized Storage read; unavailable, pending/no receipt; purchase validators reject |
| Recovery of each of the four pending failures | Same key/context restores the same durable operation; one binding |
| Stale generation | Late old operation returns conflict; confirmed latest draft deep-equal |
| Missing private derivative | Only this invocation's new synthetic derivative removed after exact project/operation/locator check; read unavailable, no substitute |
| Actual local SSRF/canary | URL/path/file URL, wrong origin/port/project/marker/credential rejected; local 302 redirect not followed; redirect requests 1, second-target requests 0, second-target credentials 0 |

Failure gates use real DB/Storage/helper faults and actual configured-item/Cart
acceptance services plus CheckoutReadinessEvaluator. Readiness receives a hostile
test record derived from an otherwise accepted item, not a persisted fake Cart.
This is validator-level rejection evidence, not a claimed complete HTTP Order
creation or browser journey. Upload/restart/preview evidence above is actual Worker
HTTP. Attach/copy concurrency is explicitly deferred to 6.7 and 11.4.

Missing-object probes removed only newly created synthetic derivatives from this
acceptance. Original bytes and unrelated/historical data were retained. Recovery
of such an intentionally removed derivative would require a new authorized test
operation, not restoring or silently reusing a removed receipt.

## Validation (actual runs)

| Command | Exit/result |
| --- | --- |
| `node --test tests/local-commerce-upload-binding.test.mjs tests/local-commerce-worker-redirect.test.mjs` | 0; 6/6 |
| `node --test tests/local-commerce-*.test.mjs tests/local-persistent-*.test.mjs tests/customer-session-persistence.test.mjs` | 0; 136/136; local helper listen allowed, no remote |
| `npm run lint` | 0; 0 errors, one existing ProductCustomizationImageField.tsx img warning |
| `npm run typecheck` | 0 |
| `npm run test:offline` | 0; 913/913 |
| `npm run build` | 0; no deployment |
| `npm run test:rendered` after fresh build | 0; 11/11 |
| `npm run verify` | 0; lint/typecheck/offline 913/build/rendered 11 all executed |
| `openspec validate --all --strict` | 0; 23/23 |
| `git diff --check` | 0 |

Earlier attempts are not hidden: the first expanded focused run encountered
sandbox-denied local helper listening and obsolete migration counts (10 rather
than 13), plus a stale unconditional Upload dependency for text-only Checkout.
Listening was rerun with local permission; discovery assertions were updated and
the dependency assertion aligned with the existing text-only implementation (the
image receipt boundary remains tested). No business implementation was altered to
satisfy those assertions. An initial rollback probe exceeded the existing 8192-byte
operation bound before reaching binding insertion; it was replaced with the
transaction-local, exact-new-key constraint probe above. Both final suites passed.

One later pre-start `docker ps` timed out at 10 seconds. No Worker or fixtures had
been created by that attempt. Three subsequent exact-run read-only checks passed
in 62/30/32ms without remediation. The final acceptance then passed. This records
the transient rather than claiming Docker never timed out.

## Files touched in this turn

- `app/client/customer-customization-image-upload.ts`: per-request key and recovery header.
- `app/server/local-persistent-media-http.server.ts`: bounded key/recovery admission, original command version replay.
- `app/infrastructure/local-commerce/local-persistent-media-authority.server.ts`: fresh-owner fingerprint/binding and exact replay/read-back.
- `app/infrastructure/local-commerce/local-persistent-supabase-adapter.server.ts`: typed allowlisted RPC.
- `local/commerce/migrations/0013_local-commerce-upload-command-binding.sql` (new).
- `local/commerce/migrations/manifest.json`.
- `tests/database/local-commerce-worker-media-acceptance.mjs`: actual Worker restart/HTTP evidence.
- `tests/database/local-commerce-worker-media-matrix.mjs` (new): bytes/fault/recovery/stale/missing-object evidence.
- `tests/database/local-commerce-image-canary.mjs` (new): actual loopback canary.
- `tests/database/local-commerce-upload-binding-security.mjs` (new): HTTP permissions/transaction rollback.
- `tests/local-commerce-upload-binding.test.mjs` (new).
- `tests/customer-session-persistence.test.mjs`: migration discovery only.
- `tests/local-commerce-purchase-schema-contract.test.mjs`: migration discovery only.
- `tests/local-commerce-schema-contract.test.mjs`: migration discovery only.
- `tests/local-commerce-migration-ledger.test.mjs`: ordered migration discovery.
- `tests/local-commerce-security-boundary.test.mjs`: new table/RPC discovery.
- `tests/local-commerce-ledger-execution.test.mjs`: current ledger count.
- `tests/local-persistent-cart-atomicity.test.mjs`: migration discovery only.
- `tests/local-persistent-commerce-source.test.mjs`: existing text-only dependency contract.
- This evidence file.
- `openspec/changes/complete-local-commerce-persistence/tasks.md`: only 5.7 checkbox.

Pre-existing unrelated dirty/untracked work remains uncommitted and was not
restored/cleaned. Index empty. Task 1.1 remains unchecked; historical rendered
failures were not inferred. Task 5.6 remains checked. Progress **33/85** after 5.7.
STOP before Task 6.
