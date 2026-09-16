# Task 6.4 — creation idempotency acceptance

Status: PASS. Task 6.4 only; not evidence of 6.5–6.7 completion.

## Real acceptance

Executed `node tests/database/local-commerce-order-http-acceptance.mjs --idempotency`, exit 0, against exact disposable `run-5576dfd8`. PostgreSQL 17, marker checked, migration ledger 15/15 and all file checksums verified. No migration applied, Storage DELETE, reset, or historical fixture repair.

Final complete run evidence:

- Worker A PID 7133 committed and discarded the success response; fresh Worker B PID 7211 replayed using original cookies and serialized request. Public reference `FM-LOCAL-803B5B889344417A` remained identical.
- Live Workers 7211/7399: same key returned 200/200 with one Order; different keys against one Cart/version returned 200/409 with one Order.
- Fault Workers 7486 (after authorization/before probe), 7555 (actual Supabase fetch response discarded before RPC result consumption), 7630 (before commit), 7701 (after commit/before HTTP response). Each returned bounded failure; retry on 7211 produced exactly one total Order and deterministic replay. Transport fault marker was explicitly asserted.
- Original guest expiry returned 503; original capability expiry returned empty 204, no Order disclosure and unchanged existing grant. Revoked member session returned 503. Replacement capability could not claim an existing binding.
- Guest key under customer Cart and member key under guest Cart returned 409. Guest Cart plus member login remained guest-owned; no owner migration.
- Independently changed email, name, address, shipping and coupon selectors rejected. Normal Cart commands changed quantity/version, customization value, selected option, configuration revision, image order, and crop; same committed key rejected without modifying original Orders.
- Real helper/private Storage → Draft → Cart → Order receipt binding succeeded (`FM-LOCAL-FAAE6B15AEBB4AF7`). Attached-receipt exact replay succeeded. New attempts against changed Cart containing attached receipts rejected. No cleanup executed.
- Only newly created synthetic Product/Variant/configuration/shipping/coupon authority was changed. Fresh Worker replay still returned the historical Order. Test-only Catalog-call interruption allowed committed replay and rejected a legitimate new create.
- Exact replay and conflict cases assert counts for orders, order_items, order_purchase_snapshots, order_item_purchase_snapshots, order_item_receipt_bindings, access_grants and order_creation_bindings; payment attempts unchanged. Item snapshot digest unchanged. Binding rows checked for raw cookie/capability/session values and private-field leakage.

Fresh project/marker and owner/selected Cart checks precede canonical context and committed probe in the real handler. Probe precedes new Catalog, receipt and rules evaluation. Static ordering test supplements, not replaces, the HTTP/DB evidence.

## Validation

- Focused capability/HTTP/purchase/copy tests: 27/27, exit 0.
- `npm run verify`: exit 0 after final transport test correction.
- Lint: 0 errors; existing ProductCustomizationImageField.tsx img warning only.
- Typecheck: exit 0.
- Offline: 913/913.
- Fresh build: exit 0, then rendered: 11/11.
- OpenSpec strict: 23/23; git diff check and relevant non-index whitespace check passed.

Intermediate harness failures are not acceptance: missing peer URL was corrected; a Worker-entry fetch override failed to intercept SDK traffic and was replaced by the test-only client fetch seam. Final complete execution above used the corrected transport assertion. No production implementation change was needed for 6.4.

## Scope

Task 6.3 closure recorded separately. Progress after 6.4: 37/85. Task 1.1 remains blocked/unchecked. Tasks 6.5–6.7 remain unchecked pending their own evidence. Business/Catalog/Supplier authority unchanged. No remote access, production/provider/deployment, staging, commit or push. Existing unrelated dirty worktree preserved.
