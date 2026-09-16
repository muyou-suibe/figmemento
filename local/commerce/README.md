# Local Commerce Workspace

This is the isolated, development/test-only Supabase workspace for
FigMemento `local_persistent` commerce. It is separate from the repository-root
`supabase/` project. Never link this workdir to a remote project and never use
these commands against production.

The current reviewed migration inventory is `0001` through `0037`. A migration
file being present is not proof that a database has applied it: the project
marker, PostgreSQL major version, migration ledger and checksums must all be
verified against the exact target.

## Authority and support boundary

- PostgreSQL and the private local Storage bucket are the durable authorities
  only when every participating server source explicitly selects
  `local_persistent` for the same verified local project.
- `local_fake` remains process-memory behavior. Restart loss and lack of
  multi-instance durability are intentional for that mode.
- Browser values never select a project, owner, source, price, lifecycle,
  service credential or private object locator.
- The root `supabase/` project, production database, remote Supabase, real Auth,
  payment, email, carrier and Storage-provider choices are outside this local
  workspace.

## Retained development configuration

The checked-in non-secret template is `example.env`. Supply its values through
the process environment and replace secret placeholders locally without
printing or committing them. The retained project identity is
`figmemento-local-commerce`, the run is `retained-development`, and PostgreSQL
major version is 17.

From the repository root, safe inspection and lifecycle commands are:

```bash
node --experimental-strip-types scripts/local-commerce-doctor.mjs
node --experimental-strip-types scripts/local-commerce-migrations.mjs verify
node --experimental-strip-types scripts/local-commerce-stack.mjs health
node --experimental-strip-types scripts/local-commerce-stack.mjs start
node --experimental-strip-types scripts/local-commerce-stack.mjs stop
```

`doctor` and migration `verify` are offline checks. `start` does not reset or
seed. `stop` uses the local CLI's ordinary stop path and preserves volumes; it
is not a rebuild. After every start, independently verify health, the exact
marker, PostgreSQL 17, the complete ordered ledger/checksums and zero pending
migrations before starting an application Worker.

Initialize the retained marker only for a genuinely new, already-identified
project:

```bash
node --experimental-strip-types scripts/local-commerce-stack.mjs init-marker --confirm-new-project
```

The command refuses to overwrite an existing marker. Never use marker
initialization to relabel an old database.

## Disposable runs

Every disposable run uses a fresh ID matching `run-xxxxxxxx` and derives the
project ID `figmemento-local-commerce-test-<run-id>`. Its workdir must be
`local/commerce/runtime/disposable/<run-id>`, its marker must be under
`local/commerce/runtime/`, and every endpoint must be loopback-only on a unique
port plan.

Prepare a new workdir only after confirming it does not already exist:

```bash
node --experimental-strip-types scripts/local-commerce-stack.mjs prepare-disposable
```

Then initialize its exact marker, start it, and apply/plan migrations only with
the matching disposable environment. The ledger-aware entry points are:

```bash
node --experimental-strip-types scripts/local-commerce-migrations.mjs prepare-disposable
node --experimental-strip-types scripts/local-commerce-migrations.mjs plan-disposable
node --experimental-strip-types scripts/local-commerce-migrations.mjs apply-disposable
```

Do not copy retained data or customer exports into a disposable run. Synthetic
test fixtures must be created only through their reviewed acceptance setup or
normal application boundaries.

## Safe stop, restart and retained recovery

For retained recovery, record exact project/workdir/container identity and
durable DB/Storage digests before stopping. Stop the application/helper first,
then stop only the exact local stack with the wrapper above. Preserve marker,
database and Storage volumes. On restart, verify the same project and volumes,
then verify marker, ledger/checksums, RLS/RPC/private Storage and only afterward
start a fresh Worker with the same server-side signing configuration.

Do not treat a new login, replacement guest cookie, fixture replay, row copy or
Catalog reseed as restart recovery. The accepted retained stop/start procedure
and evidence are indexed in the active change's `task-11.2-acceptance.md`.

## Destructive reset and from-zero rebuild

Reset is allowed only for a disposable project. The wrapper refuses reset
unless all of these agree:

- exact disposable project marker;
- exact current run ID and derived project ID;
- exact disposable workdir and loopback endpoints;
- `LOCAL_COMMERCE_ALLOW_DISPOSABLE_RESET=true`;
- `--confirm-disposable` and `--execute`.

The command is intentionally explicit:

```bash
node --experimental-strip-types scripts/local-commerce-stack.mjs reset --confirm-disposable --execute
```

Never run it for retained development, the root project, an unidentified
workdir or any remote endpoint. A successful from-zero rebuild must reverify
marker, PostgreSQL version, all migration checksums, ledger count/order, zero
pending migrations, security boundaries, private Storage and a synthetic basic
flow. It is not retained-data recovery. See `task-11.3-acceptance.md` for the
accepted distinction and interrupted-migration recovery evidence.

## Migration rollback and forward fixes

- Verify source bytes and `manifest.json` before connecting to a database.
- Apply migrations only through the ledger-aware disposable path after a
  rollback-only pre-apply check where the task requires one.
- An applied migration is immutable. Never edit or delete it to simulate a
  rollback.
- Use the migration's recorded rollback guidance only in a disposable
  pre-apply transaction. For a committed defect, create a newly reviewed,
  ordered forward-fix migration and checksum.
- A failed or interrupted application must leave no matching ledger row; rerun
  only after exact-project identity and transaction rollback are proven.
- Schema code existing in Git does not prove application, rollback safety or
  production readiness.

The local migration contract is detailed in `migrations/README.md`.

## Image helper

The image helper is a separate loopback-only Node process. Start it with:

```bash
node --experimental-strip-types local/commerce/image-helper/server.mjs
```

It requires the exact local project/run/marker context, a dedicated
`LOCAL_COMMERCE_IMAGE_HELPER_SECRET`, and the reserved loopback helper URL/port.
Never reuse a browser credential or expose the helper directly to a browser.
The Worker verifies project identity and calls it with a bounded, authenticated
request; the helper performs decode/orientation/crop and returns processed
bytes. PostgreSQL/Storage lifecycle, receipts, slots, revisions and publication
remain server authorities outside the helper. Full limits and protocol are in
`image-helper/README.md`.

## Unsupported supplier boundary

Supplier persistence is intentionally unsupported in `local_persistent`:

- there are no `local_commerce` Supplier tables or restricted Supplier RPCs;
- persistent Supplier entry points must fail closed before constructing or
  writing a memory Supplier repository;
- a browser, Order reference, current Catalog label or fake mapping cannot
  manufacture a work order, assignment, production decision or warehouse fact;
- existing `local_fake` supplier simulation remains separate, process-memory
  development behavior and is not restart/durability evidence;
- no real supplier/factory integration or supplier-management system is
  approved.

## Deferred production decisions

The following remain explicitly unapproved and must not be inferred from the
local implementation or acceptance evidence:

- C1 historical backfill and Customization Phase C production migration;
- production Auth/account provider and identity migration;
- real payment provider and reconciliation policy;
- transactional email provider and delivery policy;
- real carrier/shipping integration;
- production Storage/provider, retention, residency and access decisions;
- Supplier persistence or provider integration;
- deployment and remote migration.

The scenario-by-scenario acceptance index is
`openspec/changes/complete-local-commerce-persistence/task-11.7-batch-evidence-index.md`.
