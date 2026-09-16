# Task 5.7 — New disposable infrastructure gate blocked

Date: 2026-09-12. Implementation progress remains **32/85**. Task 5.6 stays
accepted; Task 5.7 and historical Task 1.1 stay unchecked. Task 6 was not entered.

## Scope and exact target

The owner froze `run-75224a5b` as retained acceptance evidence. This turn did not
restart, reset, use, delete volumes from, or edit evidence in that run.

New identity: `run-f1abf734`.
Project: `figmemento-local-commerce-test-run-f1abf734`.
Workdir: `local/commerce/runtime/disposable/run-f1abf734`.
Ports: shadow 55880, API/RPC/Storage 55881, DB 55882, Studio 55883, SMTP 55884,
helper 55885; application 55886 and local canaries 55887–55889 were reserved.
Loopback bind preflight passed for these ports before preparation.

The existing `scripts/local-commerce-ledger-disposable.mjs prepare
--confirm-new-project` completed successfully under explicit test/disposable
configuration. It generated only the new ignored workdir's config, marker,
preparation record and twelve ledger-aware migration wrappers. Manifest version
is 12; all twelve immutable source checksums match, and the local marker file
matches its preparation digest. PostgreSQL major 17 is configured; the installed
Supabase package metadata reports 2.114.0. A separate sandbox CLI version probe
failed on a local telemetry-file permission and is not CLI-version output proof.

No source migration was edited. File checksums and wrapper preparation are NOT
evidence that migrations committed in a database.

## Actual first-start and stability evidence

The existing ledger-aware `start --confirm-new-project` workflow was used, not
reset, remote link, db push or an alternate database. Exact-workdir Docker
discovery initially timed out after 10,016 ms. Later discoveries succeeded in
2,884 ms and 714 ms while containers were still starting. The newly observed DB
container was `5faad8ddb729`, with the exact new workdir label. Initial API and
Storage connection refusals occurred before startup completed and are not
application failures.

Subsequent gate probes failed:

| Probe | Actual result |
| --- | --- |
| Exact-workdir Docker discovery | ETIMEDOUT, 10,015 ms |
| PostgreSQL readiness | ETIMEDOUT, 5,012 ms, no readiness output |
| SELECT 1 | ETIMEDOUT, 5,009 ms, no query result |
| API `/rest/v1/` | TimeoutError, 5,006 ms |
| Storage `/storage/v1/status` | HTTP 502, 4,731 ms |

No repeated stable-success sequence was established. Container health labels
were not substituted for these failed probes.

At the infrastructure STOP gate, the exact startup process chain and cwd were
verified: native CLI PID 61846, wrapper PIDs 61845/61837/61836, cwd equal to this
new workdir. SIGTERM was sent only to that native startup client, not Docker
Desktop/daemon or any existing project's containers. The workflow exited 130
with `LOCAL COMMERCE START: FAIL`; all four startup client processes exited.
The final bounded read-only DB marker/ledger probe returned "No such container"
for the previously observed new DB, after cancellation of the CLI startup.
No manual container/volume deletion, reset or retry was performed. Final volume
retention was not verified and is not claimed. Database marker verification,
12/12 applied ledger and planner pending=0 are **UNVERIFIED**; no applied
migration count is inferred from generated files.

## Runtime and acceptance not executed

The canonical repository launch is `npm run dev` (`vinext dev`), using the
Cloudflare Vite plugin with `rsc`/`ssr` environments and `worker/index.ts`.
The separately documented helper launch is
`node --experimental-strip-types local/commerce/image-helper/server.mjs`.
Neither was launched because the new stack failed its prerequisite gate.
Application/Worker PID and helper PID therefore do not exist for this acceptance.

Actual Worker upload/preview, private original/derivative/crop checks,
configured-item/Cart/readiness failure matrix, SSRF/redirect canaries,
lost-response/process-restart recovery, stale generations and independent
uploads were **NOT EXECUTED**. No Node-only harness was counted as Worker proof.
Task 5.6 regressions were not rerun and its accepted evidence was not reopened.
Attach/copy competition remains **DEFERRED TO 6.7 / 11.4**.

No application, helper, test, task checkbox, source migration, production config,
Catalog or Supplier authority was modified. No business seed was executed by an
acceptance harness. No remote Supabase, payment, email, provider or deployment
was invoked; Git staging/commit/push/reset/clean/stash were not performed.

Full validation is intentionally not claimed: focused/Worker/DB acceptance and
the requested post-acceptance lint/typecheck/offline/fresh build/rendered/verify
sequence were not run. The blocker is new disposable stack availability, not a
proven media implementation defect. Investigate infrastructure separately before
another explicitly safe new-stack attempt; do not reuse an earlier evidence run
or assume this partially started workdir is fresh.
