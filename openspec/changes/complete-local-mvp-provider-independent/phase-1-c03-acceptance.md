# Phase 1 C03 Acceptance

Status: ACCEPTED — REAL LOCAL DATABASE EVIDENCE

## Authority boundary

C03 is implemented as a server-owned customization-surcharge authority. The
canonical purchase facts remain the authoritative Product, Variant, SKU,
selected options, configuration revision, normalized customization values,
and server-calculated pricing snapshot. Browser-supplied price or surcharge
claims are ignored. The existing Cart, Checkout, and Local Order boundaries
remain the only business write paths. Tax remains `not_activated` with a null
amount. No Catalog or Supplier authority was replaced.

## Migration chain

The source manifest contains schema version 41 and exactly 41 migrations.
There is no 0042 migration. The C03 forward migrations are:

| Version | File | SHA-256 |
| --- | --- | --- |
| 39 | `0039_local-commerce-customization-surcharge.sql` | `bc5f3cde648fce0b703b4facf9c907f6e6a415233bdd1c6de172ef926dcf9c08` |
| 40 | `0040_local-commerce-customization-surcharge-tax-forward-fix.sql` | `d979ab0441258eb6744a0535455f8eeb04654f0855c2e0f3acabb66d3318e0d0` |
| 41 | `0041_local-commerce-customization-surcharge-order-tax-shape-forward-fix.sql` | `4cd5f3c224ab7d891b40e4834436ad68a33251e62e01c171855a40f1e365ac8f` |

The accepted migrations 0001–0038 were not edited. The clean disposable
acceptance stack applied all 41 migrations in order; its ledger was 41/41,
pending migrations were 0, and `scripts/local-commerce-ledger-disposable.mjs
plan` reported `apply: 0` and `skip: 41`.

## Exact disposable database acceptance

| Field | Evidence |
| --- | --- |
| Run | `run-d7e3c0af` |
| Project | `figmemento-local-commerce-test-run-d7e3c0af` |
| Database | PostgreSQL 17.6 image / major version 17 |
| Endpoint | loopback only, API port 56221, DB port 56222 |
| Marker | exact disposable-test marker verified |
| Ledger | 41/41, ordered checksums match, pending 0 |
| Remote/provider access | none |

The run was created from the complete local migration chain and seeded only
synthetic C03 Catalog rows through the bounded service-role test setup. No
application Catalog write endpoint was used.

## Real C03 journey

The acceptance harness exercised the real persistent runtime boundaries and
reported 7/7 checks passing:

1. Cart admission computed one server-owned surcharge allocation for each
   non-empty customization field and ignored browser price claims. Base price
   was 2500 cents, surcharge was 500 cents, and final unit price was 3000
   cents.
2. Cart read-back and a separately spawned Node process reconstructed the
   same persistent pricing snapshot.
3. Checkout recomputed the final unit price and subtotal from the persistent
   Cart and returned tax status `not_activated` with `amountCents: null`.
4. Local Order creation stored the immutable C03 pricing snapshot and the
   immutable surcharge provenance; replay returned the same public result.
5. A direct delete attempt against the committed order-item purchase snapshot
   was rejected by the immutable trigger, and the row remained present.
6. A changed surcharge rule and duplicate selector made Checkout fail closed
   without repairing or mutating the Cart snapshot.
7. A foreign project/marker was rejected, including browser price claims.

The persisted Order item snapshot contained base price 2500 cents, surcharge
total 500 cents, final unit price 3000 cents, line subtotal 3000 cents, and
currency USD. The public response contained no pricing snapshot, owner ID,
operation ID, or service-role material.

## Teardown and retained-state safety

After the 7/7 acceptance, the exact disposable project was stopped. The
verified owned database volume
`supabase_db_figmemento-local-commerce-test-run-d7e3c` and exact run workdir
were removed. A read-only post-teardown check proved the exact disposable
containers, volume, and workdir were absent.

The retained development project was not reset, reseeded, or otherwise
mutated. A post-teardown read-only check verified its marker remained
`figmemento-local-commerce` / `retained_development` /
`retained-development`, its schema version remained 41, its migration ledger
remained 41 rows, and `verify_project_identity` remained true. Previously
observed retained C03 residue was left in place because committed Order
purchase facts are immutable; no row-by-row deletion or trigger bypass was
attempted.

## Negative and regression evidence

The C03 focused pure pricing contract passed 4/4. The disposable acceptance
used real bytes at the HTTP/application boundaries and passed the project,
rule-version, browser-price, Cart read-back, Checkout, Order snapshot, and
immutability checks above. No remote Supabase, production database, payment
provider, Supplier provider, or deployment was accessed.

Final repository validation passed after this evidence artifact was reviewed.
Task 1.1 is now independently accepted; all later Phase 1 tasks remain
unchecked. The historical Task 1.1 state in the other OpenSpec change is
unrelated and is not changed by C03.
