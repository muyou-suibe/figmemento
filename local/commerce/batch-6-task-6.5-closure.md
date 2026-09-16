# Task 6.5 canonical history closure

Accepted scope: canonical historical read and pure internal consumer projections.
No internal actor acquisition, Admin mutation, Fulfillment, Shipment, Delivery or
Supplier workflow was introduced. The previous progress report remains historical.

## Applied read-only representation forward fix

- Exact disposable run: `run-5576dfd8` (PostgreSQL 17).
- Exact project: `figmemento-local-commerce-test-run-5576dfd8`.
- PostgreSQL container: `3f0a14e18d07b71e0b235dffcdc61e672086d6fb5b32b35849aa8bf54f3be3e4`.
- Before: ledger 16/16, pending 0; 0001–0016 preserved byte-for-byte.
- 0016 did not return existing `orders.lifecycle_status`, `order_items.item_sequence`
  or immutable purchase contact in canonical_item. The pure downstream model needs
  those persisted fields; they cannot be reconstructed from current Catalog.
- Added `0017_local-commerce-history-context.sql`, SHA256
  `2339a17b5cbd4c86341bf7dbed345a99f0c308205f17e1aff04ffd9f68628b4d`.
- `node scripts/local-commerce-history-context-migration.mjs --preapply`: exit 0,
  rollback verified, function definition unchanged after rollback.
- `--apply-authorized-read-context`: exit 0, existing ledger wrapper, project and
  marker checked. After: **17/17, pending 0**, every checksum verified again by
  the real HTTP acceptance harness. 0017 is now immutable.
- No snapshot backfill/update; no schema business entity or mutation added.

## Real acceptance (current turn)

`node tests/database/local-commerce-order-http-acceptance.mjs --idempotency`:
final expanded run exit 0. Actual Worker A 14267 / B 14370, historical reader
processes 14357 / 14446. Order `FM-LOCAL-18831A6044444346`;
image Order `FM-LOCAL-03394367E94B4F52`.

- Exact order/item, customer summary, guest/member, wrong pairing/capability,
  missing/expired capability, foreign guest/member and durable revoked member
  rejection pass. Member session cannot claim guest Order.
- Fresh Node process read: Catalog, Storage, Supplier, memory Order all 0.
  Catalog method/network, Storage network and memory/Supplier method sentinels
  throw on attempted reconstruction. Canonical result/summary/projections equal
  before and after process restart. No customer credentials appear in evidence.
- Product, price, configuration, shipping/coupon drift preserves history.
  Final synthetic Product becomes draft/unavailable and preview policy false;
  original historical canonical result and summary remain deeply equal.
- Actual private Storage upload → confirmed crop → Draft → Cart → Order passes.
  Historical receipt/field/position/crop preserved, two-image ordering preserved.
  Order capability alone: private media HTTP 404. Original media owner: HTTP 200.
  No Storage calls during history reads and no Storage DELETE in this run.
- SQL ACL: PUBLIC/anon/authenticated cannot execute history RPC; service_role can.
  Real anon GET of six protected tables and RPC: 401; real authenticated JWT:
  403. Tables: orders, order_purchase_snapshots, order_items,
  order_item_purchase_snapshots, order_item_receipt_bindings, access_grants.
  Service-role correct selection found; 10 malformed/foreign selector cases
  returned bounded unavailable. No table or RPC grant was widened.
- Existing 6.1–6.4 regression: real two-Worker same-key 200/200 exactly one Order;
  different-key 200/409 exactly one Order; before-probe/probe-loss/before-commit/
  commit-loss retries exactly once. Original expiry, Cart/config/media/crop
  changes, immutable snapshot/count invariants, replay during outage pass.

`node scripts/local-commerce-history-legacy-recheck.mjs --mixed`: exit 0.
Synthetic pre-0016 snapshot is produced using old commit semantics inside a
rolled-back transaction, NOT by repairing retained Orders. Missing policy stays
unavailable after current Catalog gains policy; safe legacy summary stays found
without invented preview policy. Ledger 17/17 and retained snapshots unchanged.

## Pure projector contracts

One validated, frozen server-side history model; no projector has I/O or token
parameters. Future internal actor acquisition is deliberately not implemented.

- Shared: order ID/reference/time/lifecycle, exact item ID/sequence.
- Admin: immutable contact, Product/Variant/options/quantity, commercial facts,
  configuration/customization, fulfillment, safe media associations.
- Fulfillment: quantity/classification/shipping/production/lead time/preview,
  configuration/customization and safe ordered media.
- Tracking eligibility: classification/shipping/preview and destination; no
  email, configuration or media. No Shipment is created.
- Delivery eligibility: classification/preview/configuration/customization/safe
  media. No digital publication/grant/ticket/bytes operation.
- Supplier: explicitly unavailable.
- Recursive allowlist tests exclude owner/capability/session/hash/Storage locator
  and credentials; unvalidated objects cannot be passed to projectors.

## Validation

- Combined focused 6.1–6.5/schema/security/session regression: **115/115**, exit 0.
  Includes repeated six-case fixture-module registrations; not 115 distinct cases.
  Projector file alone is 15 executions (9 new + 6 imported fixture tests).
- Additional copy/receipt and existing fake Payment domain/HTTP/repository/config
  regression: **50/50**, exit 0. These are offline, not durable Payment acceptance.
- Initial expanded focused run: 85/86, stale ordered-version list expected 15.
  Corrected manifest expectation only to 17; applied checksums/security unchanged.
- Independent lint: exit 0; new unused-parameter warning removed before verify.
- Independent typecheck: exit 0; offline **913/913**, exit 0.
- Independent fresh build: exit 0, then rendered **11/11**, exit 0.
- Full `npm run verify`: exit 0; offline **913/913**, fresh build then rendered
  **11/11**. No new lint warning; existing storefront img warning remains.
- OpenSpec strict: **23/23**, exit 0. `git diff --check`: exit 0.

## State and limits

Task 6.5 checked only after the above evidence; progress **38/85**.
6.6/6.7 were not claimed by this report. Original task 1.1 remains unchecked.
No remote/prod access, providers, deployment, git stage/commit/push or reset.
Existing unrelated dirty worktree preserved; index empty.

## Supplemental non-index whitespace check

Tracked `git diff --check` passes. Checking these untracked files as additions
also found an extra blank EOF line in already-applied 0017 (line 104). That
immutable migration is deliberately NOT rewritten or re-checksummed for a
cosmetic warning. The unapplied legacy recheck script's blank EOF was removed.
This warning is reported separately from passing functional/verify acceptance.

## Task 6.6 transition audit

Task 6.6 remains unchecked. Its implementation needs a new atomic payment RPC
and persistent HTTP composition: current HTTP constructs the memory payment
repository and invokes points/outbox callbacks; the transport allowlist has no
payment command. Existing payment_attempts/payment_actions tables alone do not
provide atomic payment authority.

The current-turn 0017+ permission is explicitly limited to history-read
representation/helpers. The earlier permanent authorization explicitly names
0015. Do not silently treat either as permanent payment-write RPC authorization.
Before applying a payment migration, clarify permission for the next ordered
0018+ migration on exact run-5576dfd8 via the ledger wrapper. Preserve 0001–0017,
all retained snapshots/data, no reset/Storage deletion/remote/provider actions.
No Task 6.6 implementation or payment write was performed by this closure.
