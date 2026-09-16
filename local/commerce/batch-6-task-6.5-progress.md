# Task 6.5 progress — not final acceptance

Status: PARTIAL. Task 6.5 remains unchecked; overall progress remains 37/85.
Tasks 6.6/6.7 and Task 7 were not implemented in this turn.

## Owner decision implemented

The previous missing-preview-authority decision is resolved by the owner's
current attachment `d70b4cbf-8fb6-4d48-b10c-893181a4480a/pasted-text.txt`.
Only local_persistent recognizes the explicit versioned Product fulfillment
boolean. The shared production parser is unchanged. Selected missing/malformed
policy rejects; unrelated missing policy does not poison Catalog browsing.
Snapshots contain one immutable boolean per item, not per quantity unit.
Historical incomplete canonical items remain unavailable without backfill.

## Permanent migration evidence

- Exact run: run-5576dfd8
- Project: figmemento-local-commerce-test-run-5576dfd8
- Container: 3f0a14e18d07b71e0b235dffcdc61e672086d6fb5b32b35849aa8bf54f3be3e4
- Workdir: local/commerce/runtime/disposable/run-5576dfd8
- PostgreSQL 17, exact marker verified.
- Prior ledger 15/15 and every source checksum verified.
- New migration: 0016_local-commerce-order-history.sql
- SHA256: 8b11496906434353e3d16ba67ab450a4e2ca27db0bd3e005fc2b88f686666909
- Applied through existing ledgerWrappers, not db push: exit 0.
- After apply: ledger 16/16, pending 0, all checksums match.
- anon/authenticated history EXECUTE denied; service_role allowed.
- PostgREST discovery evidenced by successful real history RPC through adapter.
- No existing snapshot updates/backfill, reset, Storage deletion or remote access.
- Applied 0016 is now immutable. Any subsequent SQL correction requires 0017+.

## Pre-apply (not permanent acceptance)

`node scripts/local-commerce-order-history-preapply.mjs --mixed`: exit 0.
`--digital`: exit 0 before final customer-summary projection edit; final current
bytes were rechecked with --mixed before manifest registration and application.
Fixtures, temporary triggers and function replacement were transactionally rolled
back; ledger unchanged. Verified SQL rollback on injected late write failure,
Product policy/version race conflict, historical read after Catalog mutation,
legacy missing policy refusal before/after Catalog gains policy, safe legacy
customer summary, incorrect capability rejection, and RPC privilege restrictions.
Legacy evidence here is a newly synthesized pre-forward-fix Order in a rolled-back
transaction using the original 0014 function; no retained acceptance Order was repaired.

## Real HTTP / DB evidence

`node tests/database/local-commerce-order-http-acceptance.mjs --idempotency`: exit 0.
Only new uniquely named synthetic Catalog rows declared explicit true policy.
Real Worker A PID 10333 created Order; Worker B PID 10447 restarted and replayed.
Safe reference: FM-LOCAL-B413F194BF1B431F.
Image Order: FM-LOCAL-41B228226D6849A9.

Verified canonical exact-item read from an independent Node process after Worker
commit, unchanged history after Product/price drift and Worker restart, safe
customer HTTP summary, absent capability, wrong Order/item, cross-Order pairing,
fresh member read, member cannot claim guest history, and durable logout rejection.
Real private Storage → Draft → Cart → Order still passed without DELETE.
Two live Workers 10447/10780: same-key 200/200 with one Order; different-key 409/200
with one Order. Before-probe, real RPC response-loss, before-commit and commit-loss
faults recovered exactly once. Original expiry, Cart/config/options/media/crop
changes, and replay across Catalog/rule drift/outage retained 6.4 invariants.

The latter outage check is **creation replay evidence**, not yet the complete
Task 6.5 exact-item historical outage matrix. Do not conflate the two.

## Validation

- Preview-focused file: 22/22 executions (16 new policy cases + 6 imported base cases).
- Combined focused regression: 49/49 executions; includes 6 base tests executed
  again through the imported fixture test module, so this is not 49 distinct cases.
- First verify: exit 1, offline 912/913; stale schemaVersion=15 assertion.
- Updated only current manifest-version assertions in five schema tests; retained
  applied migration hashes, session behavior, RLS and security assertions.
- Repeated npm run verify: exit 0. Lint 0 errors/1 pre-existing img warning;
  typecheck PASS; offline PASS; fresh build PASS then rendered 11/11 PASS.
- OpenSpec strict: 23/23 PASS. git diff --check: exit 0.
- No task checkboxes changed; no stage/commit/push. Existing dirty worktree retained.

## Remaining before 6.5 can be checked

1. Complete and independently verify minimal Admin/Fulfillment/Tracking/Delivery
   projections over this same authority, rather than leaving their old memory seams.
2. Full canonical historical outage/removal matrix for Product, Variant/SKU labels,
   configuration, preview policy and shipping/coupon rules after restart.
3. Exact historical ordered image/crop/safe-media projection and privacy matrix.
4. Broaden adversarial complete-facts validation and regression coverage, including
   invalid project/marker and expired session in the new read path specifically.
5. Final acceptance report and fresh validation after remaining edits. Only then
   check 6.5 and advance to 6.6; no completion is claimed here.
