# Batch 6 infrastructure pre-gate — BLOCKED

Date: 2026-09-12. Change: complete-local-commerce-persistence.
Progress remains 33/85. Tasks 6.1–6.7 were not started or checked.

## Initial read-only gate

All commands used a 5000ms subprocess deadline:

| Command | Elapsed | Exit | Result |
| --- | --- | --- | --- |
| docker version (server version projection) | 42ms | 0 | 29.7.2 |
| docker info (server version projection) | 479ms | 0 | 29.7.2 |
| docker ps (IDs only) | 249ms | 0 | container list returned |

New run `run-2d8960ae`; project
`figmemento-local-commerce-test-run-2d8960ae`.
Ports 56520–56527 were successfully bound/released for availability checking.
Existing ledger-aware preparation generated 13 wrappers and a new marker in
`local/commerce/runtime/disposable/run-2d8960ae`.
Marker digest: `442a81d44e086a48385d65ffbcd3b8b92a5f27d5fd2923cc40fe4d6601bbd188`.
This is preparation evidence, NOT proof of applied migrations or a healthy DB.

## Startup failure

Executed existing `scripts/local-commerce-ledger-disposable.mjs start
--confirm-new-project` with exact test project/ports. Startup remained pending.
The exact-run `docker ps -a --filter label=com.supabase.cli.workdir=.../run-2d8960ae`
timed out once at 5008ms, then three consecutive times at 5009/5007/5010ms.
Each reported ETIMEDOUT (terminated subprocess exit 143), no container output.
Between these checks, three `docker version` probes passed at 86/51/52ms.

Conclusion: Docker's version endpoint responds, but container-list operations
are persistently unresponsive during this startup. This meets the owner's
infrastructure STOP gate. The underlying daemon/host/container cause is not proven.
No further new run, retry or business repair was attempted.

## Safe cancellation and retained uncertainty

Read-only ps/lsof established the exact process chain:
70586 ledger launcher → 70587 stack launcher → 70595 npm CLI wrapper →
70596 native Supabase CLI, whose cwd exactly matched the new run.
Only client PID 70596 was terminated with SIGKILL to prevent further orchestration
and avoid client exit cleanup. Wrappers exited with `LOCAL COMMERCE START: FAIL`,
exit 1. No Docker stop/rm/reset/prune, volume deletion, daemon restart or historical
analytics restart command was issued. Existing frozen runs were not targeted.

The new run is a partial-start diagnostic artifact, NOT a verified fresh or ready
acceptance run. Container/volume existence, PostgreSQL readiness, SELECT 1, REST,
Storage, DB marker and applied ledger remain UNVERIFIED. Do not assume empty or
reuse/reset it without verifying its actual state and applicable authorization.

## Scope and validation

- No application, business, Catalog, Supplier, frontend or API changes.
- No migration 0014 created; 0001–0013 source files not edited.
- No synthetic business seed, Order, Payment or provider implementation.
- No remote Supabase, deployment, stage, commit or push.
- Only generated ignored preparation artifacts and this evidence report created.
- git diff --check: exit 0; index empty.
- Full verify/focused Batch 6/database suites: NOT RUN (infrastructure gate blocked).
- Task 1.1 unchanged/unchecked; Task 5.7 unchanged/checked; Task 7 not entered.

Next: diagnose Docker container-list responsiveness read-only. Any daemon restart,
resource cleanup or modification of failed-run resources needs separate authority.
