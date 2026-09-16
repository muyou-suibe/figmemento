# Task 4.5 — Persistent purchase receipt authority

Acceptance date: 2026-09-11. Local development/test only; not production readiness.

New disposable project: `figmemento-local-commerce-test-run-75224a5b`.
API/DB/helper: 55641 / 55642 / 55645. Historical stacks were not modified.
Ordered migration ledger 0001–0011 was verified against the unchanged manifest checksums.

`node tests/database/local-commerce-purchase-media-acceptance.mjs run-75224a5b --confirm-disposable`: exit 0, 22/22 groups.
Evidence: `local/commerce/runtime/disposable/run-75224a5b/purchase-media-evidence.json` (ignored runtime artifact).

- Real private original and derivative Storage, durable media operation, explicit Draft CAS/crop confirmation precede image Cart Add.
- Two explicit adds produce distinct Cart lines. The HTTP boundary and unified CAS adapter both use the same persistent receipt reader.
- Wrong owner, project, expired authority, forged receipt, removed/expired receipt and a real in-memory fake receipt are rejected.
- Exact Product/field/configuration/crop selectors are checked against durable confirmed state, not browser claims.
- Readiness returns two accepted lines without changing Cart, lines/version, Draft, operation or receipt rows (full row snapshots before/after).
- Synthetic text-only Cart/readiness succeeds with Upload disabled and zero media RPC/Storage/helper calls.
- Durable member revoke denies media reads; no process-memory receipt fallback.

Focused suite: 40/40, exit 0 (`local-persistent-purchase-receipts`, `local-commerce-media-authority`, `local-commerce-draft-port`, `local-persistent-cart`, `checkout-readiness`).

This is Node HTTP/route-handler integration evidence, NOT the actual Worker smoke required by Task 5.7. It does not complete Checkout Task 4.6, cleanup Task 5.6, or any Task 6 work.
