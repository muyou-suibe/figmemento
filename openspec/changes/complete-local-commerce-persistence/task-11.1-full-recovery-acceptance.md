# Task 11.1 full A→B commerce recovery acceptance

Status: **PASS**

Classification: **LOCAL DEVELOPMENT / TEST PERSISTENCE ACCEPTANCE**

The dedicated executable acceptance is
`tests/database/local-commerce-task-11.1-full-recovery.mjs`. The sanitized
machine-readable result is `task-11.1-full-recovery-evidence.json`. This is a
new full-matrix run and does not reuse the narrow Task 10.8 slice as Task 11.1
completion credit.

## Process and retained-state boundary

- Exact run/project: `run-5576dfd8` /
  `figmemento-local-commerce-test-run-5576dfd8`; PostgreSQL 17; ledger 37/37;
  pending migrations 0.
- Process A: PID 23746, port 51321, repository cwd and exact Worker command
  verified before ordinary `SIGTERM`.
- A exited with code 0; its PID was absent and its port was closed before B
  startup.
- Process B: PID 24096, port 51322, started after A absence against the same
  database and private Storage.
- The same generated signing configuration and the original real-Chrome guest
  cookies/member session cookie were reused. There was no relogin, replacement
  guest authority, reset, reseed, migration, row copy, or fixture replay in the
  A/B window. Raw credential values were not recorded.

## Domain matrix

| Domain | Before/after evidence | Result |
| --- | --- | --- |
| Guest Cart | Stable canonical digest; two distinct ordered lines, quantities and accepted Product/Variant/SKU/configuration/customization facts deep-equal | PASS |
| Draft/media | Stable Draft digest; two stable slots, order, non-trivial crops, version and confirmed revision deep-equal | PASS |
| Private bytes | Two originals and two derivatives re-read after B; SHA-256, byte length and `image/png` content type exactly match | PASS |
| Member session | Same customer subject and owner ID authenticated after B without relogin; member Cart and Order remained accessible | PASS |
| Multi-Order grants | Three guest Orders plus one member Order remained independently readable only with their original authority | PASS |
| Order snapshots | Four complete table-set digests (Order/items/purchase snapshots/receipt bindings and downstream histories) were exactly equal before and after B | PASS |
| Payment/action | Main Order retained ordered `failed` then `succeeded` attempts; exact committed replay after B did not create a second transition | PASS |
| Review/manifest/revision | Approved photo review, immutable v1/v2 manifests, one revision, customer approval, production and `quality_check` recovered exactly | PASS |
| Timeout | Separate Order retained one signed-Admin `operator_timeout` decision and action history | PASS |
| Shipment/tracking | One canonical delivered Shipment retained the four ordered events; committed tracking action replay after B created no duplicate | PASS |
| Digital version/grant | One ready immutable version and the same active grant recovered with 30-day expiry and max-download count 5 | PASS |
| Ticket/quota | Ticket consumed before A remained spent after B; a new ticket used the same grant and increased persisted consumption from 1 to 2 | PASS |
| Digital bytes | Normal ticket→claim→stream returned the same private PDF bytes; no Storage locator was disclosed | PASS |

The physical journey retained one Shipment only, four ordered events, one
revision, v1/v2 only, and a `quality_check` Fulfillment. The digital journey
retained one version, one grant, two consumed tickets and two delivery attempts.
There are zero `local_commerce` Supplier tables.

## Security and authority

Foreign guest/member access, forged guest cookie, forged Order capability,
forged member session, public-reference-only reads, and tracking-reference-only
reads all returned bounded non-enumerating projections. Guest and member
ownership remained separate. The run used only synthetic local persistent
Catalog facts, simulated Payment, local carrier fixtures, loopback services and
the private local Storage bucket. No remote service or production provider was
accessed.

The executable compares deterministic sanitized projections and per-table
SHA-256 digests; private bytes use SHA-256 plus byte length and content type.
Read-time-only presentation values are excluded from the durable equality
contract.
