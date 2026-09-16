# Task 5.7 test-mode Worker evidence — partial

This evidence does not complete Task 5.7. Progress remains 32/85; 5.6 remains checked and 5.7 unchecked. Task 6 has not started.

## Local environment

Only run-24f7c009 was used. Its exact disposable workdir label resolved to exactly one PostgreSQL container. Project identity was figmemento-local-commerce-test-run-24f7c009. PostgreSQL 17, marker verification, checksums for migrations 0001–0012, applied ledger 12/12, and zero pending migrations passed. No migration, reset, reseed, container restart, or volume deletion was performed.

Three read-only stability rounds passed without timeout. Elapsed milliseconds for PostgreSQL readiness / SELECT 1 / REST / Storage / marker were respectively: 97/60/46/11/64, 46/63/5/2/65, and 46/49/3/1/48. REST and Storage returned HTTP 200.

## Test-only launch seam

Installed vinext 0.0.50 CLI does not forward a test mode option. The repository-owned launcher uses Vite createServer with mode=test and the existing vite.config.ts, vinext and Cloudflare plugins, and actual worker/index.ts. A test-only entry assertion verifies runtime identity without changing environment values or adding a debug endpoint. Ordinary dev/build/start scripts and config remain unchanged.

The generic acceptance harness takes a run ID and --confirm-disposable. It discovers the DB by exact workdir label and checks marker/ledger before creating fresh synthetic acceptance state; it does not reseed existing Catalog state. Credentials remain process-scoped and diagnostics are redacted.

## Actual Worker smoke observed

Successful recorded run: Worker launcher PID 66666; separate Node/sharp helper PID 66665; application port 55916; helper port 55915. Worker entry reported NODE_ENV=test and LOCAL_COMMERCE_ENVIRONMENT=test. These are distinct launch/helper process IDs, not a claim about the workerd child PID.

Two explicit HTTP POST /api/uploads requests with identical filename and bytes returned 201 and distinct opaque receipts. Both private preview requests returned 200 image/png, decoded to 12x8. Without the owner cookie, preview returned 404. Public projections passed locator/bucket/path/credential exclusion checks. No route-handler Node server substituted for the Worker.

## Worker compatibility fix

Actual workerd rejected fetch redirect="error" before contacting the helper: it supports follow/manual. The helper client now uses manual, and the existing non-ok response gate rejects redirects without following them. This does not loosen project, owner, source, or credential checks.

Focused image/helper and redirect tests passed 12/12. The redirect test covers 301/302/303/307/308 with a fetch stub; it is not evidence of the required actual local redirect-canary matrix.

## Remaining acceptance / contract gap

The current upload HTTP surface accepts only new uploads and returns receipt/warnings, not an operation selector. The preview surface reads an existing receipt. Internal media authority has reconcile(operationId), but that operation recovery is not connected to the actual Worker HTTP surface. Existing public projection tests deliberately exclude operationId/slotId.

Consequently, reading an old preview in a new Worker would not prove response-loss recovery of the same in-flight operation. No test-only business endpoint or direct Node invocation was introduced to claim this evidence. An explicit recovery contract must define how the caller obtains an authorized server-owned selector before a potentially lost response, without grouping by filename/hash/owner/Product or turning client IDs into authority.

The following remain unverified in this turn: original digest immutability and real Storage crop pixel matrix; four failure gates through configured-item/Cart/readiness; actual local SSRF/redirect canaries; actual Worker A-to-B same-operation recovery; stale generation; distinct operation identities for the two uploads. Distinct receipts alone do not close the last item.

Attach/copy competition remains deferred to 6.7/11.4. Task 5.6 was not reopened; its full cleanup regression was not rerun.

## Validation and safety

- Focused tests: 12/12 PASS.
- Lint: zero errors, one existing ProductCustomizationImageField.tsx warning.
- Typecheck: PASS.
- OpenSpec strict: 23/23 PASS.
- git diff --check: PASS; untracked changed-code whitespace check: PASS.
- Full offline/build/rendered/verify sequence: NOT RUN; the full acceptance prerequisite is not satisfied.
- Task checkboxes and immutable migrations: unchanged.
- Remote services, production, deployment, git staging/commit/push: not performed.
- Frozen runs run-75224a5b and run-f1abf734: untouched.

Pause follows openspec-apply-change guidance for a discovered design issue. Do not treat this partial evidence as Batch 5 closure.
