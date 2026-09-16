# Task 5.6 — Implementation present; real acceptance BLOCKED

2026-09-11. Task 5.6 remains unchecked. Task 5.7 not started. Progress 31/85.

Latest owner request explicitly authorizes Phase D Task 5.6 in attachment
`04c96b0f-c940-4101-82b1-2180f19adc86/pasted-text.txt`, lines 398–429.

0012 `local-commerce-media-cleanup` was applied successfully (exit 0, COMMIT) through the existing ledger wrapper to NEW disposable project `figmemento-local-commerce-test-run-75224a5b` only.
Checksum: `fa64a7b2c3b2ece25d7469aef9be1e9d24c31315a323303db2fdfea394c55867`.
0001–0011 were not modified. No historical stack reset or mutation.

Implementation introduces internal server cleanup with DB-owned bounded lease, immutable locator fencing, shared-original/Order-binding retention checks and common project advisory lock before media/Draft commands. It retires replaced/removed/expired Draft receipt eligibility without deleting Order bindings. No public cleanup/seed/price route or Task 6 attachment command.

After application, execution safety review rejected the real DB acceptance command twice. The reported reason was a prior-turn prohibition on Task 5.6; the latest attachment authorization was re-read and supplied on the same-command retry, but the retry was also rejected. No indirect execution or bypass was attempted.

Therefore the following are UNVERIFIED, not PASS:

- Actual concurrent cleanup workers, failure/retry/lease expiry.
- Real shared original retention and synthetic Order-attached original/derivative retention.
- Full media/Cart/Draft regression after applying 0012.
- Actual Worker → Node/sharp smoke, deferred to 5.7.

Earlier 25/25 real integration results apply to 0001–0011 and Tasks 4.5–4.7 only; they MUST NOT be cited as 0012 or 5.6 acceptance. Offline/static tests and successful SQL application do not close this gate.

Next action requires renewed explicit authorization accepted by the execution safety gate for the same run's Task 5.6 real DB/Storage acceptance. Do not start Task 6.

## 2026-09-12 — Current-turn authorization and partial real execution

The owner supplied explicit current-turn authorization in
`0e6765ff-7fcd-4c45-a806-55d746f3da61/pasted-text.txt`, including exact eligible
synthetic-object deletion and private synthetic Order-binding retention setup on
the EXISTING `run-75224a5b`. No reset or other run was authorized or performed.

After authorization review, the existing purchase/media harness ran successfully:
25/25 check groups, exit 0, against the applied 0001–0012 ledger. This supersedes
the earlier lack of post-0012 regression evidence, but is NOT full 5.6 acceptance.

Added `tests/database/local-commerce-media-cleanup-acceptance.mjs` and invoked it
from the existing purchase/media harness. Changed the harness's missing-object
case to remove receipt eligibility and invoke the cleanup authority, rather than
directly delete an active object. No application implementation was changed.

The extended real run passed its existing 25 groups and these two new groups:

- Expired receipt read denied while its exact private derivative still existed;
  cleanup then deleted only its durable-operation-selected original/derivative,
  and reconciliation remained unavailable.
- Two independent Node worker PIDs competed for one removed receipt's derivative;
  their instrumented real Storage DELETE call count summed to exactly one,
  outcomes were bounded completed/conflict, and the durable lease was completed.
  Completed cleanup replay did not issue another destructive request.

It then failed with HTTP 404 at the new lease test's RPC call. The test had
incorrectly appended the function name to `rpcUrl`; it now uses the established
`apiUrl + /rest/v1/rpc/media_cleanup_command` address. This is a test-harness
correction, not an applied SQL defect. The corrected real run has NOT executed:
execution safety review rejected the same command and its authorization-review
retry, citing an older prohibition despite the explicit current attachment.
No alternative execution path was attempted.

Still UNVERIFIED: the corrected lease acquisition/expiry/retry case; actual
Storage-denial retry; shared-original final-reference cleanup; synthetic committed
Order/item retention; dedicated late-result cleanup; dedicated invalid cleanup
selector cases. The synthetic Order fixture code was not reached. Existing
stale-generation regression passed, but does not replace these cleanup checks.

Validation this turn: cleanup focused 3/3 PASS; targeted ESLint PASS;
`npm run verify` exit 0 (offline 913/913, fresh build followed by rendered 11/11,
typecheck PASS, lint zero errors with one pre-existing image warning);
OpenSpec strict 23/23 PASS. No 0013 was created; 0012 checksum remains
`fa64a7b2c3b2ece25d7469aef9be1e9d24c31315a323303db2fdfea394c55867`.

Task 5.6 remains unchecked, Task 5.7 has not started, progress remains 31/85.
The next required action is the corrected real acceptance run after the execution
gate accepts the owner's authorization. Task 6 remains outside scope.

## 2026-09-12 — Inline authorization accepted; local stack reachability blocker

The owner's subsequent CURRENT-TURN EXPLICIT OWNER AUTHORIZATION in chat body
was accepted by the execution gate. Authorization is no longer the blocker.
The exact existing-run acceptance command executed without resetting the stack.

The fresh full harness passed ledger/marker, private original/derivative,
explicit Draft CAS, crop, physical Checkout rules, concurrent Cart CAS and image
Cart/readiness checks. It failed in the mixed Checkout check at
`local-commerce-purchase-media-acceptance.mjs:221`: HTTP 409 `UPLOAD_INVALID`,
expected 200. This failure remains visible; no assertion or business semantics
was relaxed. Its exact cause is not proven by the subsequent availability probes.

Read-only probes after the failure:

- `docker ps` for this exact workdir returned the five existing run containers;
  PostgreSQL, Storage, Auth and Kong reported healthy (about 17 hours uptime).
- GET `http://127.0.0.1:55641/rest/v1/`: timed out after 10,005 ms.
- GET `http://127.0.0.1:55641/storage/v1/status`: timed out after 10,001 ms.
- A repeat probe attempted only `select 1;` through the exact verified database
  container. The Docker client exceeded its 15-second timeout (ETIMEDOUT), with
  no query result. It performed no database write or service stop/reset.
- Repeat API probe again timed out after 10,005 ms.
- Repeat Storage probe eventually returned HTTP 200 after 8,775 ms; this partial
  response alone does not establish PostgreSQL/API recovery.
- A final bounded probe allowed 30 seconds for the same `select 1;`: ETIMEDOUT
  after 30,132 ms, no result. The following API probe also timed out. No broader
  Docker restart, stack reset or alternate project was attempted.

Container health labels therefore do not establish current host/API/database
reachability. Do not classify the mixed-checkout failure as an implementation
defect or as merely transient without a successful fresh rerun.

Only test tooling changed: the cleanup lease-expiry fixture now uses one stable
`statement_timestamp()` for both endpoints, preserving its exact 60-second
constraint; a named `--cleanup-only` focused invocation was added with a separate
`cleanup-evidence.json` output so it cannot overwrite or pretend to be full
purchase/media regression evidence. This focused invocation has not run yet.
No application code, applied migrations or task checkbox changed.

Focused media/helper/cleanup tests first returned 17/19 in the sandbox because
loopback listen was forbidden (EPERM); the same tests with local-listener
permission passed 19/19, exit 0. `npm run verify` passed, exit 0, with fresh build
before rendered. This does not prove DB acceptance. Task 5.6 is still unchecked,
Task 5.7 unstarted, progress 31/85. Next: restore/reconfirm this exact existing
stack's reachability without reset or touching other projects, then rerun the
corrected real cleanup acceptance and investigate any remaining full-regression
failure. No further cleanup or Task 6 was attempted after this blocker.

## 2026-09-12 — Authorized exact restart; Task 5.6 acceptance complete

The owner explicitly authorized restarting only `run-75224a5b`, preserving
volumes, PostgreSQL, private Storage, marker and ledger. Exact workdir labels,
container IDs and mounts were checked before restarting the five existing
DB/REST/Auth/Storage/Kong containers. CLI labels truncate the project suffix;
the full workdir and durable marker identify the exact run unambiguously.

The restart client timed out after 55 seconds (exit 143), acknowledging four
containers. Subsequent read-only inspection proved all five existing IDs had
restarted, including Kong shortly afterward, with unchanged volume mounts.
No second restart, reset, recreation, reseed or volume deletion occurred.
PostgreSQL readiness, SELECT 1, API and Storage passed; the original marker
remained valid. Three further SELECT/API/Storage rounds passed in 576, 183 and
112 ms total. The acceptance harness independently verified all twelve applied
migration checksums against immutable files and the ordered manifest, with no
pending migration or ledger changes.

Real acceptance exposed a bounded adapter defect: an anonymous Storage DELETE
returned HTTP 200 with an empty array (zero deleted objects), yet the adapter
treated absence of an SDK error as completed cleanup. The adapter now requires
an exact deleted object name, or a trusted metadata read reporting `NoSuchKey`
for response-loss retry. Existing objects, denied metadata and unknown failures
remain unavailable. The real retry test proves a failed lease, retained bytes,
non-restored receipt eligibility, and successful service-role retry. Tests also
cover empty-delete and exact-absence behavior. No cleanup eligibility or SQL
authority was changed. The shared-original fixture was corrected to confirm its
slot through the existing Draft CAS before requesting crop; no browser slot was
promoted to authority.

Fresh real results, both exit 0:

- `--cleanup-only`: 9/9 checks (ledger plus eight cleanup groups).
- Full purchase/media acceptance: 33/33 checks, including mixed Checkout PASS
  and all cleanup groups. The previous 409 occurred before severe availability
  degradation, but this rerun does not prove causality.
- Evidence remains in this exact ignored runtime directory as
  `cleanup-evidence.json` and `purchase-media-evidence.json`.
- Two independent workers produced one DELETE; durable lease expiry, fencing
  and retry passed. Shared originals and synthetic committed Order/item bindings
  retained the required bytes. Late results and invalid selectors passed.
- Deletions were restricted to newly created synthetic objects selected by the
  exact durable cleanup authority. Earlier failed-run objects were not swept or
  manually repaired. Synthetic Order bindings are retention fixtures only, not
  Task 6 implementation.

Validation: focused adapter/cleanup 8/8 PASS; typecheck PASS; `npm run verify`
exit 0, offline 913/913, fresh build PASS followed by rendered 11/11, lint zero
errors with the existing image warning. The first typecheck caught a missing
StorageError property narrowing; explicit narrowing fixed it before verify.
No migration was created or modified; 0012 retains the checksum above.

Task 5.6 is checked on this new evidence; progress is 32/85. Task 5.7 remains
unchecked and has not begun. Before starting it, a bounded SELECT 1 timed out
after 5,025 ms (API 200 in 2,592 ms; Storage 200 in 179 ms), and the subsequent
fresh stability gate again timed out on SELECT 1 after 5,019 ms. A successful
acceptance run is not proof of ongoing stack stability. Stop here until this
exact stack is reliably reachable. No repeated infrastructure restart, broader
Docker action, Task 6, remote service, staging, commit or push was performed.
