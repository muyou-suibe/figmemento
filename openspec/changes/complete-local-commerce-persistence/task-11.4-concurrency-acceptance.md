# Task 11.4 two-worker concurrency acceptance

Status: **PASS**

Classification: **LOCAL DEVELOPMENT / TEST PERSISTENCE ACCEPTANCE**

This evidence is independent of Task 11.1 recovery and Task 11.3 rebuild
acceptance. It exercises two simultaneously alive application Workers against
the same durable database and private Storage. No process-memory mutex or Map
is used as cross-process authority.

## Exact target and safety boundary

- Run: `run-93f6c1a2`
- Project: `figmemento-local-commerce-test-run-93f6c1a2`
- PostgreSQL: 17
- Ledger: 37/37; pending migrations: 0; no 0038
- The exact project marker and project/workdir identity were verified before
  acceptance.
- To restore bounded target read latency, the separately identified historical
  disposable `run-24f7c009` was reversibly parked under owner authorization.
  Its containers remain present and its database/Storage volumes were not
  removed. The target then passed `SELECT 1`, marker, Fulfillment and current
  manifest reads in 0.06–0.08 seconds.
- Protected `run-5576dfd8`, retained development, root/default and remote
  projects were not stopped, reset, reseeded, migrated or modified.

## A–R matrix

| Case | Concurrent authority/evidence | Result |
| --- | --- | --- |
| A | Two Workers registered the same normalized email: HTTP 200/409, one durable identity and no losing cookie | PASS |
| B | Durable logout raced an authenticated read; post-commit reads rejected the revoked session | PASS |
| C | Same-version Cart commands returned 200/409 and advanced one server-owned version without a lost update | PASS |
| D | Independent Cart-line commands serialized as 200/409; exact retry returned 200 and retained distinct lines/quantities | PASS |
| E | Cart, Product, shipping-rule and coupon-rule version races all rejected stale commits with HTTP 409 and unchanged rows | PASS |
| F | Same receipt attach race returned 200/409, created one Order and one binding, and retained the requested quantity | PASS |
| G | Same-context copy returned `found/found` with one durable operation/receipt; changed context returned `found/conflict` | PASS |
| H | Attach-versus-cleanup retained the live receipt; cleanup-first made read/reconcile/copy unavailable with no attachment; copy-first retained the shared original | PASS |
| I | Same Order action returned 200/200 and created one Order | PASS |
| J | Changed-context Order action returned 200/409 and created one Order | PASS |
| K | Same Payment action returned 200/200 and one durable Payment transition | PASS |
| L | Different/conflicting Payment actions returned 200/409; failed-versus-success serialized to the one legal succeeded outcome | PASS |
| M | Last allowed revision race returned 200/409; `revisionRequestsUsed` never exceeded 2 | PASS |
| N | v2/v3 publication versus stale v1/v2 approval returned 200/409; one current manifest, no v4 | PASS |
| O | Shipment creation race returned 200/409 and created one Shipment/tracking identity | PASS |
| P | Each shipped/in-transit/delivered event race returned 200/409; exactly four ordered events and four action bindings remained | PASS |
| Q | Two-ticket final-download race stopped at exactly five consumed attempts | PASS |
| R | Claim versus revoke/replacement returned no stale bytes, no quota refund/reset and no ticket revival | PASS |

## Process evidence

The focused runs used distinct simultaneously alive Worker processes. Recorded
pairs included:

- A–D/F/G: PID 57151 on port 59359 and PID 57152 on port 59360.
- E/I/J: PID 54139 with competing PID 54348 or 54417.
- K/L: PID 55760 and PID 55772 after a separate restart boundary
  55710 → 55760.
- M/N: PID 53294 and PID 53167.
- O/P: PID 56106 and PID 56107.
- Q/R: independent digital-delivery Workers, including restart boundaries
  beginning 56219 → 56290.

All Workers used loopback-only local persistent composition and the same exact
database/Storage project. An orphaned acceptance helper was identified by exact
PID, command, cwd and port, terminated normally, and its port was verified
closed; no Docker project or persistent data was changed by that cleanup.

## Atomicity, replay and immutability

- Exact committed action replay returned the original logical result without a
  second row, event, receipt, operation, quota claim or lifecycle transition.
- Same-key changed context produced bounded conflict.
- Helper, Storage, readback, pre-commit and commit-response-loss faults were
  exercised by the relevant focused harnesses; retries recovered through
  durable action/operation identity rather than process memory.
- Order snapshots, receipt bindings outside the allowed attach, Cart facts,
  preview history, Payment history and digital grant limits retained their
  deterministic before/after digests.
- H cleanup-first observed already-completed durable cleanup and private
  Storage `NoSuchKey`; it is not represented as a newly observed direct DELETE.
- Shipment/Tracking cases produced no Supplier effects. Digital cases produced
  no Shipment, Tracking or Supplier effects.

## Executable acceptance entry points

- `tests/database/local-commerce-task-11.4-copy-race.mjs`
- `tests/database/local-commerce-order-http-acceptance.mjs`
- `tests/database/local-commerce-payment-http-acceptance.mjs`
- `tests/database/local-commerce-task-11.4-authority-launcher.mjs`
- `tests/database/local-commerce-task-11.4-shipment-races.mjs`
- `tests/database/local-commerce-digital-grant-http.mjs`

Browser roles do not gain direct business-table or restricted-RPC authority.
No raw capability, session token, service credential, private Storage locator,
or remote provider secret is included in this evidence.

## Final repository validation

- Focused contracts: 52/52 PASS.
- `npm run lint`: exit 0 (one pre-existing `<img>` performance warning, zero
  errors).
- `npm run typecheck`: exit 0.
- `npm run test:offline`: 918/918 PASS.
- Fresh `npm run build`: exit 0.
- `npm run test:rendered`: 11/11 PASS.
- `npm run verify`: exit 0 with the same 918 offline and 11 rendered tests.
- `openspec validate --all --strict`: 23/23 PASS.
- `git diff --check`: exit 0 before checkbox update and rechecked afterward.
