# Task 4.2 — Persistent Cart acceptance

Date: 2026-09-11. Scope: Task 4.2 only. Local/development-test evidence; no production readiness claim.

## Command authority

HTTP/application → existing `LocalCommerceCartPort` → `createLocalPersistentCartPort` → internal unexported `OwnerScopedCartStore` → restricted `cart_command` RPC → local PostgreSQL.

The existing port definition is unchanged. Mutations retain verified authorization, mandatory expectedVersion and idempotency. HTTP obtains the expected version from the exact authorized Cart read; browser ownerId/cartId payloads are not authority. No parallel non-CAS provider was added. The legacy ShoppingCartProvider factory returns no provider for persistent mode rather than a memory fallback.

Guest identity is resolved by the existing signed, expiring context verifier. The database guest owner stores a digest of its opaque owner identifier. Member identity comes from the existing durable session provider. Existing guest Cart cookies remain guest-owned after login; stale guest cookies cannot claim or mask a separately member-owned Cart. No email merge/claim was added.

Accepted handoffs are revalidated through the same project's persistent Catalog/configuration authority before insertion. Persisted lines retain Product/Variant/SKU/options, revision, customization values, accepted price and safe summary. Every explicit add generates a distinct stable line identity. Quantity remains 1–20 and addresses one exact owner-scoped line. Public projections do not expose internal project/owner identities.

## Migration

- New ordered migration: `0008_local-commerce-cart-persistence.sql`.
- SHA-256: `efa071f458c4135a1ca8543751de34e04d671c92caba1590c3dd29e6ee979eda`.
- Manifest schemaVersion: 8, including rollback/forwardFix guidance.
- Applied 0001–0007 were not edited. 0008 has no outer BEGIN/COMMIT; the verified ledger wrapper owns the transaction.
- Adds accepted Cart line snapshot and quantity constraint, an owner-scoped command replay binding, RLS and service-role-only fixed-search-path RPC.
- Legacy lines without an accepted snapshot are rejected before mutation; they are not reconstructed from Catalog.

## Real database evidence

New disposable run: `run-904ee92e`.

Project: `figmemento-local-commerce-test-run-904ee92e`.

Ports: shadow 55440, API 55441, DB 55442, Studio 55443, SMTP 55444, image-helper reservation 55445. Existing `run-68938831` was not reset, migrated or modified.

Prepared and started through `scripts/local-commerce-ledger-disposable.mjs`, with exact marker validation and ledger-aware ordered migrations. Actual database ledger contains 8/8 matching checksums, planner pending count 0.

Executable: `node tests/database/local-commerce-cart-acceptance.mjs run-904ee92e --confirm-disposable` — exit 0, 9/9 groups PASS:

1. Exact project/marker and ledger/checksums 8/8.
2. Private synthetic Catalog setup through real local service-role HTTP (test-only; no business seed endpoint).
3. Guest Cart creation and identical explicit additions retain distinct IDs and accepted values.
4. Exact-line quantity survives without altering the other line; invalid quantities reject.
5. A separately spawned Node process constructs a new repository/port and reads the identical database snapshot.
6. Wrong owner, project and marker reject; no guest claim.
7. Real durable account/session-backed member creates a separate Cart and cannot read the guest Cart.
8. Stale configuration and absent expectedVersion reject without changing the observed snapshot.
9. Request/Response HTTP-handler boundary backed by the real DB: add/second add/update/read 200, cross-origin 403; safe projection and signed guest-cookie reuse. Member Cart recovery with a residual guest cookie and guest Cart retention after member login both pass.

Group 9 invokes the actual HTTP handler with Request objects; it is not a browser or listening-web-server acceptance claim. The adapter performs real local HTTP/RPC. Structured, credential-free output is at `local/commerce/runtime/disposable/run-904ee92e/task-4.2-cart-evidence.json` (ignored runtime evidence).

The first harness attempt rejected a wrongly shaped test customization value. The fixture was corrected to the existing typed customization array; application validation was not weakened. Subsequent complete DB runs passed. Synthetic setup reruns ignore only duplicate known fixture identities; no database reset was used.

## Fresh validation

- Focused Cart + schema + ledger + session compatibility tests: 48/48 PASS, exit 0 (`/tmp/figmemento-task42-focused.log`). Cart-specific subset: 6/6.
- Final `npm run verify`: exit 0 (`/tmp/figmemento-task42-verify-final.log`).
- Lint: 0 errors, one pre-existing ProductCustomizationImageField img warning.
- Typecheck: PASS.
- Offline: 913/913 PASS.
- Fresh build: PASS, before rendered execution.
- Rendered: 11/11 PASS.
- OpenSpec strict: 23/23 PASS.
- Existing manifest-list test expectations were updated from version 7 to 8; historical evidence and session behavior assertions were preserved.

## Explicit deferred boundaries

Task 4.3 remains unchecked: no acceptance claim for concurrent CAS/no-lost-update, atomic clear, or Order-success Cart retention. Basic mandatory version comparison and replay plumbing are prerequisites only. Persistent `clear` currently returns bounded `not_supported`; local_fake clear behavior is unchanged.

Durable image receipt resolution belongs to the later upload task. Image handoffs without that authority reject; this adapter never borrows memory receipts. No download/upload API or durable draft feature was added here.

Catalog/business/Supplier authority, visuals, production source defaults, root Supabase and remote providers are unchanged. No remote Supabase, deployment, stage, commit or push. Only Task 4.2 is completed: 21/85. Task 1.1 remains historically blocked/unchecked. Stop before 4.3.
