# Task 4.3 — Cart atomicity partial acceptance

Date: 2026-09-11. Change: complete-local-commerce-persistence.
Status: PARTIAL, 21/85. Cart atomicity subset only; Task 4.3 remains unchecked.
This records execution evidence, not a change to the original task contract.

## Deferred acceptance

DEFERRED: persistent Order-success Cart-retention evidence requires canonical persistent Order implementation.

Persistent canonical Order creation remains future Task 6.1/6.2. No fake success,
memory replacement, temporary success endpoint, Task 6, or Task 4.4 implementation
was used. SQL-only Order/snapshot sentinel rows below are deletion-isolation
fixtures, not an Order creation or success acceptance.

## Implementation and authority

The application-facing LocalCommerceCartPort is unchanged: verified authorization,
mandatory expectedVersion, and idempotency remain the sole mutation boundary.
The request-scoped persistent adapter now implements clear through that port.

The restricted cart_command RPC locks the currently active project/owner and the
exact owned active Cart. It rechecks authorization expiry after lock waits. An
equivalent committed result is replayed before the new-command CAS check; a new
command compares expectedVersion and commits its line mutation, server version
increment and command binding in the same PostgreSQL transaction. Stale commands
write no lines, version or binding. No process-local mutex or application
compensation is used.

An internal read-only replay_add probe resolves accepted retries before consulting
current Catalog. The final add RPC repeats binding resolution atomically, so the
probe is not a second write authority. Normalized identity uses the submitted
handoff rather than current Catalog-derived display/price snapshot fields.
Existing v8 bindings are normalized only while comparing, never rewritten.
New additions still require current authoritative Catalog/configuration acceptance.

Clear deletes only exact project/owner/Cart lines, including removed lines, while
retaining Cart identity and incrementing its version once. It does not cascade
into drafts, media, grants, Orders or Catalog. Replay returns the original result.

Existing signed guest context, durable member-session HTTP verification,
guest/member non-claim semantics, same-origin gate, public projection, local_fake,
disabled/default and source failure behavior are unchanged. No new public write
API, browser owner authority, Catalog authority, supplier behavior or visual change.

## Migration

- New: 0009_local-commerce-cart-atomicity.sql.
- SHA-256: b4e3be060b5d046b71a4e25fd4d0d864087977a7e587fbf8b43b97d1c02a9527.
- Manifest schemaVersion 9; rollback and forwardFix recorded.
- 0001–0008 remain byte-identical to this turn's baseline.
- No outer BEGIN/COMMIT: the existing ledger wrapper owns migration atomicity.
- Fixed search_path = pg_catalog, local_commerce; explicit typed parameters;
  PUBLIC/anon/authenticated execution revoked, service_role-only execution.

## Real database execution

New disposable: run-7852b08b.
Project: figmemento-local-commerce-test-run-7852b08b.
Ports: shadow 55460, API 55461, PostgreSQL 55462, Studio 55463, SMTP 55464,
image-helper reservation 55465. Prepared and started through the existing
ledger-aware disposable path with a verified project marker. No reset performed.
Neither run-68938831 nor run-904ee92e was operated on.

Command:
`node tests/database/local-commerce-cart-atomicity-acceptance.mjs run-7852b08b --confirm-disposable`
Exit 0; 16/16 groups PASS. Structured safe output:
`local/commerce/runtime/disposable/run-7852b08b/task-4.3-cart-atomicity-evidence.json`.
This runtime artifact is ignored; the durable summary is this document.

- Ledger: 9/9 ordered entries match manifest and file checksums; no pending apply.
- Signed guest Cart, two distinct explicit additions and exact-line quantities.
- New Node process/repository reconstructs the exact persisted Cart snapshot.
- Wrong owner/project/marker rejected; durable member cannot claim guest Cart.
- Missing version and stale configuration rejected.
- Actual HTTP handler plus real local DB/RPC: add, second add, update, read 200;
  cross-origin 403; forged body ownerId/cartId ignored; safe public projection.
  This is Request/Response handler execution, not a browser/listening-server claim.
- Stale add/update/remove/clear all return version_mismatch with byte-equal
  Cart rows, line rows and command binding rows.
- Six concurrent rounds use two independently constructed adapters/HTTP clients,
  with distinct keys and the same expectedVersion. Versions 4→5→6→7→8→9→10;
  each round has one found, one version_mismatch, exactly one committed binding
  and only the winning line's requested quantity change.
- Reconstructed adapter replays the original add while current synthetic Catalog
  availability is unavailable, with no new version/line. Conflicting handoff
  returns conflict without writes. Catalog change is test setup, not application
  Catalog mutation or authority replacement.
- Update/remove replay and conflicting quantity checks pass; another Cart cannot
  use the first Cart's line ID.
- A test-only database trigger raises at command-binding insertion, after Cart
  mutation/version work, for add/update/remove/clear. All four calls return
  bounded source_failure; complete pre/post Cart, lines and bindings are equal.
  Trigger/function are removed in finally. No failure switch ships in migration.
- Clear physically leaves zero exact-Cart line rows, retains Cart identity,
  increments once, replays without writes and preserves a second Cart's lines.
- Fresh DB owner revocation rejects both replay and new commands without exposing
  the stored result.

### Same-owner sentinel preservation

Before/after complete row snapshots are equal for all 11 non-Cart tables:
configuration_drafts, media_objects, media_receipts, access_grants,
commerce_owners, orders, order_purchase_snapshots, catalog_products,
catalog_variants, catalog_configuration_snapshots, catalog_pricing_rules.
All have actual records in this disposable DB. Media sentinels prove metadata/
receipt preservation; this is not a new Storage-byte or upload acceptance.

## Files changed this turn

- app/infrastructure/local-commerce/local-persistent-cart-adapter.server.ts
- local/commerce/migrations/manifest.json
- tests/customer-session-persistence.test.mjs
- tests/local-commerce-ledger-execution.test.mjs
- tests/local-commerce-migration-ledger.test.mjs
- tests/local-commerce-purchase-schema-contract.test.mjs
- tests/local-commerce-schema-contract.test.mjs
- tests/local-commerce-security-boundary.test.mjs
- local/commerce/migrations/0009_local-commerce-cart-atomicity.sql
- tests/database/local-commerce-cart-atomicity-acceptance.mjs
- tests/local-persistent-cart-atomicity.test.mjs
- openspec/changes/complete-local-commerce-persistence/task-4.3-cart-atomicity-partial-acceptance.md (this report)

The six existing schema/ledger/session test edits only advance current manifest
version/count expectations from 8 to 9. No auth test semantics were changed.
The new focused test initially had a JavaScript brace syntax error, corrected
before the successful 58/58 run; no assertion was relaxed.

## Validation

- Focused Cart/provider/schema/ledger/session: 58/58 PASS, exit 0; new atomicity 4/4.
- Real local DB: 16/16 groups PASS, exit 0.
- Independent lint: exit 0; zero errors, one pre-existing ProductCustomizationImageField img warning.
- Independent typecheck: exit 0.
- Independent offline: 913/913 PASS, exit 0.
- Independent fresh build: exit 0; then rendered 11/11 PASS, exit 0.
- OpenSpec strict: 23/23 PASS, exit 0.
- Full npm run verify: PASS, exit 0; lint (0 errors / 1 existing warning),
  typecheck, offline 913/913, fresh build, rendered 11/11 all pass in sequence.
- git diff --check: PASS, exit 0. Direct non-index whitespace checks of all 12
  changed/new files: no whitespace diagnostics (exit 1 denotes content differs
  from /dev/null, not a whitespace error).
- Final baseline file hashes: no unrelated modifications, creations or removals;
  tasks.md and 0001-0008 unchanged. Git status has 44 pre-existing tracked modified
  paths and 468 untracked entries; index contains zero staged paths.

## Scope / remaining boundary

No remote Supabase, root Supabase migration, db push, deployment, real auth/payment/
email provider, Supplier persistence, or production DB operation. Only the new
local disposable stack was started and written. It remains available for review.

Task 1.1 remains blocked/unchecked; 4.2 checked; 4.3 unchecked; 4.4+ untouched.
No staging, commit or push. Existing unrelated working-tree edits are preserved.
The next blocker for complete Task 4.3 acceptance is canonical persistent Order
creation and its real Order-success Cart-retention evidence. Stop this batch here.
