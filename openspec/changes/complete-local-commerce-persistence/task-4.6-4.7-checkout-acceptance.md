# Tasks 4.6 / 4.7 — Persistent read-only Checkout

2026-09-11; LOCAL DEVELOPMENT/TEST ONLY.

New run `run-75224a5b`, project `figmemento-local-commerce-test-run-75224a5b`, API 55641, DB 55642, helper 55645. No historical stack modified.

Real command: `node tests/database/local-commerce-purchase-media-acceptance.mjs run-75224a5b --confirm-disposable`.
Result: exit 0, 25/25 groups. Ignored evidence: `local/commerce/runtime/disposable/run-75224a5b/purchase-media-evidence.json`.

- Shared existing configured-item/Catalog line evaluator; no second pricing/Product authority.
- Exact durable Cart owner read, original/derivative receipt validation and confirmed Draft crop.
- Physical image Checkout: subtotal 5000, shipping 500, total 5500. Four coupon states validated against real DB rules.
- Controlled shipping amount/version change is read on next Checkout; old expected versions fail closed. Price change rejects stale Cart facts. Setup values restored afterward.
- Digital-only text Checkout with Upload disabled requires contact email, no physical address/method, shipping not_applicable/0. Mixed Cart requires physical inputs and uses DB shipping rule.
- Tax is exactly not_activated/amountCents null; no tax arithmetic.
- Readiness/Checkout compare full-row digests of all non-Catalog local_commerce tables before/after, including Order, Payment, Cart, Draft and media state. No durable checkout/handoff or business writes.
- Independent Cart adapters compete on identical expectedVersion: exactly one found, one conflict, one version increment; fresh read matches the winning lines.
- Existing real Draft recovery, stable slots/crops, private bytes, owner/project rejection, media failure/recovery and browser-role denial are rerun in this new project.

Focused existing Checkout tests: 23/23. One stale fake test expected 500 shipping despite the pre-existing >=4900 free-shipping fixture; only that assertion was reconciled to shipping 0/total 4000, fixture unchanged.
New persistent source matrix: 12/12, rejecting absent/disabled/invalid/fake/production/staging/unknown/remote/project mismatch/mixed capability with zero external requests. Text-only composition does not require Upload.

This evidence does not complete Task 5.6 cleanup/retention, Task 5.7 actual Worker smoke, or Task 6 Order creation. Full batch quality gate is recorded separately after implementation.
