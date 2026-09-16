# Task 11.3 disposable reconstruction acceptance

Status: PASS

Classification: local development/test persistence acceptance only. This is
not a production migration, remote Supabase action, deployment, or retained
data recovery result.

## Exact target

- Run: `run-93f6c1a2`
- Project: `figmemento-local-commerce-test-run-93f6c1a2`
- Workdir: `local/commerce/runtime/disposable/run-93f6c1a2`
- PostgreSQL: 17
- Locked CLI: 2.114.0
- Commerce-required start profile excluded only `vector`, `logflare`,
  `studio`, `realtime`, `edge-runtime`, `mailpit`, `imgproxy`,
  `postgres-meta`, and `supavisor`.
- Migrations: 0001–0037; no 0038.

The workdir did not exist and its six reserved loopback ports were free before
preparation. The generated project marker, preparation digest, exact workdir,
project kind `disposable_test`, environment `test`, run ID and PostgreSQL major
version were checked before every acceptance phase.

## Fresh construction

The locked CLI created a new database and applied each of the 37 generated
ledger wrappers in order. Each wrapper binds reviewed source bytes and its
ledger row in one transaction.

Fresh acceptance result:

- ledger/checksums: 37/37, pending 0
- planner: apply 0, skipped 37
- ledger digest: `37:f26b2587ef7b5bb57dcf4bc84182152f`
- `verify_project_identity`: true only for the exact project/marker
- 46 `local_commerce` business tables: RLS enabled
- anon/authenticated direct CRUD: denied
- restricted identity RPC: browser roles denied, service role exact identity
  true and wrong project false
- private Storage: anon upload denied; service upload/read/delete passed; probe
  removed
- synthetic seed Product: `e802a174-87db-4577-893b-5eb2064b806c`
- durable basic flow: account created, session read from the persistent port,
  one accepted Catalog-backed Cart line committed through the unified Cart
  command port at version 2

No customer export, production Catalog row, root seed, remote data, raw token,
service credential, or private object locator is present in this evidence.

## Migration rerun

The first bounded `migration up --local` attempt timed out before connecting;
the ledger digest was identical before and after, so it had no migration
effect. After the exact DB readiness and TCP port checks passed, the single
retry returned `applied: []`. A later post-rebuild rerun also returned
`applied: []`. Both retained the exact ledger digest above and produced no
duplicate ledger rows.

## Guarded reset and from-zero rebuild

A real reset attempt without the allow flag was rejected before deletion with
`disposable_confirmation_required`. The destructive command was then invoked
only with the exact run/project/workdir/marker, loopback endpoints,
`LOCAL_COMMERCE_ALLOW_DISPOSABLE_RESET=true`, `--confirm-disposable`, and
`--execute`.

The CLI wrapper returned nonzero while waiting on the restarted Storage health
check. This was not hidden or rewritten as an exit-code pass. Independent
postconditions proved that the reset itself completed:

- the DB container identity changed;
- the old fresh Product count was zero;
- both API and Auth returned 200;
- the Storage status endpoint and real private object operations subsequently
  succeeded;
- PostgreSQL 17, exact marker, 37/37 ledger/checksums, pending 0, RLS and RPC
  checks all passed;
- a new synthetic Product `b8ee1887-9e0c-4125-94e4-e0138d55f1cc` and a new
  account/session/Cart flow were created.

The different Product and Cart identities, together with the absence of the
fresh Product before reseeding, classify this as from-zero reconstruction, not
retained-data recovery.

## Interrupted migration recovery

An initial terminal Ctrl-C experiment did not reach the Docker-contained psql
client in time. Its synthetic probe committed and is explicitly classified as
a failed interruption attempt, not acceptance evidence.

A second transaction used the exact backend application name
`task-11.3-interrupted-migration-2`, created a second synthetic probe table and
entered a 120-second sleep before commit. While the transaction was open, the
exact matching backend was terminated. The client returned a terminated
connection error, the second probe was absent, and the ledger remained 37.

The same full reset gate then rebuilt only this disposable project. Final
postconditions showed both the accidentally committed first probe and the
rolled-back second probe absent. Final `interruption-rebuild` acceptance again
passed PostgreSQL, marker, ledger/checksums, RLS, restricted RPC, generated
synthetic seed, persistent account/session/Cart, and private Storage checks.
Its new Product was `47154790-d7e2-4b70-b8f6-35c3f40acc16`.

## Isolation

The retained development project remained at:

- project `figmemento-local-commerce`
- environment `development`
- kind `retained_development`
- lifecycle `active`
- schema version and ledger 37/37

No retained, root/default, historical, remote, or production project was reset,
reseeded, migrated, or used as a fallback. This acceptance changes no Catalog,
Order, Payment, Fulfillment, Supplier, Shipment, Tracking, or digital business
authority.
