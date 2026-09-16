# Task 11.7 batch evidence index and local runbook closure

Status: **PASS**

Classification: **LOCAL DEVELOPMENT / TEST PERSISTENCE ACCEPTANCE**

This index records observed acceptance outcomes. A source file, migration,
adapter or test existing in the repository is not counted as functional proof.
Task 1.1's historical rendered 7/11 detail remains unavailable and BLOCKED; it
is not inferred or rewritten by this index.

## Scenario index

| Scenario | Result | Executed evidence | Boundary |
| --- | --- | --- | --- |
| Dedicated Process A termination → fresh Process B | PASS | `task-11.1-full-recovery-acceptance.md` and sanitized `task-11.1-full-recovery-evidence.json` | Same DB/private Storage and original guest/member credentials; no relogin/reseed/replay |
| Retained-development stack stop/start | PASS | `task-11.2-acceptance.md` | Volumes/marker preserved; account through digital quota recovered; Admin fake Catalog correctly lost |
| Fresh disposable ledger construction and rerun | PASS | `task-11.3-acceptance.md` | 37/37 checksums, pending 0; rerun applied none |
| Guarded disposable reset/from-zero rebuild | PASS | `task-11.3-acceptance.md` | Exact marker/run/allow/confirmation gates; distinct from retained recovery |
| Interrupted migration transaction and reconstruction | PASS | `task-11.3-acceptance.md` | Killed exact backend transaction rolled back; only exact disposable project rebuilt |
| Two simultaneously live Workers | PASS | `task-11.4-concurrency-acceptance.md` | A–R domain races serialized by durable authority, not process mutex/Map |
| Application/DB/Storage/helper/stream faults | PASS | `task-11.5-fault-injection-acceptance.md` | No partial commit, fake-ready response, silent fake fallback, ticket revival or quota refund |
| Actor/credential/RLS/RPC/private Storage matrix | PASS | `task-11.6-security-matrix-acceptance.md` | 46 RLS tables, 49 restricted functions, browser direct access denied, transient secrets absent from client build |
| Desktop/mobile browser commerce and Admin journey | PASS | `task-10.8-browser-experience-evidence-index.md` plus Task 10 browser screenshots under `evidence/task-10.8/` | Dynamic business facts retained; no browser authority or private locator disclosure |
| Narrow browser Draft/media A→B slice | PASS | `task-10.8-restart-slice-evidence.json` | Indexed as Task 10.8 evidence only; not substituted for full Task 11.1 |
| Historical rendered 7/11 individual failures | BLOCKED | Prior evidence audit found only the aggregate; individual names/output/causes unavailable | Task 1.1 stays unchecked; no inference |
| Persistent Supplier workflow | BLOCKED / UNSUPPORTED | Task 11.6 dynamic inventory found zero Supplier tables/functions; persistent supplier stop-gate contracts reject before memory construction | No Supplier persistence/provider claim |
| Remote/production provider behavior | BLOCKED / NOT AUTHORIZED | Local loopback sentinels and acceptance classifications | No remote Supabase, production Auth/payment/email/carrier/Storage, deployment or provider calls |

No Task 11 scenario in this table is marked FAILED. The two BLOCKED rows are
explicitly out-of-scope historical/unsupported boundaries, not silently omitted
acceptance cases.

## Evidence by required domain

- Restart durability: Cart, Draft/media, member session, multiple Order grants,
  immutable Order snapshots, Payment/action history, Fulfillment review/
  manifest/revision/timeout, Shipment/events, digital version/grant/ticket/
  quota and private byte digests are individually recorded by Task 11.1.
- Retained lifecycle: normal stack stop/start, same volumes, original browser
  credentials, revoked/expired session rejection and missing-byte unavailable
  behavior are recorded by Task 11.2.
- Rebuild hygiene: fresh ledger/checksums, no-op rerun, guarded reset,
  interrupted transaction and retained-project isolation are recorded by Task
  11.3.
- Cross-process atomicity: registration, Cart/version, media copy/cleanup,
  Order, Payment, preview decisions/publication, Shipment/events and final
  digital quota races are recorded by Task 11.4.
- Failure truthfulness: pre/post-commit response loss, DB outage/rollback,
  helper/Storage/readback failure, orphan cleanup, download claim and stream
  outcomes are recorded by Task 11.5.
- Security: guest/member/Admin/operator/Supplier, forged/revoked/expired
  credentials, cross-Order selectors, Origin/source tampering, legacy routes,
  RLS/RPC/Storage and response/log/client-artifact leakage are recorded by Task
  11.6.
- Browser evidence: desktop/mobile flows, safe unavailable states and the
  narrow original-credential Draft/media restart slice are recorded by Task
  10.8 without replacing broader process acceptance.

## Operating documentation closure

`local/commerce/README.md` now documents retained/disposable identities; safe
start, health and volume-preserving stop; retained restart verification;
guarded reset and from-zero rebuild; rollback/forward-fix discipline; helper
authority; Supplier stop gates; and deferred production decisions.

`local/commerce/migrations/README.md` records the 0001–0037 ledger workflow and
the distinction between static files and applied evidence.
`local/commerce/image-helper/README.md` records the currently integrated
development/test role without promoting helper output to durable publication or
production acceptance.

## Unsupported and deferred decisions

The batch does not authorize or claim:

- C1 historical backfill or Customization Phase C completion;
- production Auth or customer identity migration;
- real payment or financial reconciliation;
- transactional email delivery;
- carrier, warehouse or real shipment provider integration;
- production Storage/provider/retention/residency policy;
- Supplier persistence, factory integration or supplier-management restoration;
- remote migration, deployment or production readiness.

The next quality group remains separately gated. Task 11 evidence cannot mark
Task 12 complete.

## Final validation

- Task 10.8/11.1/11.2/11.3/11.7 evidence contracts: 13/13 PASS.
- Local migration manifest: 37 ordered migrations verified offline; no database
  connection or migration execution.
- Lint: PASS with 0 errors and one pre-existing `no-img-element` warning.
- Typecheck: PASS.
- Offline tests: 918/918 PASS.
- Fresh build: PASS.
- Rendered tests after the fresh build: 11/11 PASS.
- Full `npm run verify`: PASS.
- OpenSpec strict and `git diff --check`: run after the Task 11.7 checkbox update.
- Staged paths: 0; no migration, remote access, deployment, stage, commit or
  push occurred.
