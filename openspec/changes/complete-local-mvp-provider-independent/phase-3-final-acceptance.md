# Phase 3 payment reliability acceptance

Status: **PASS — local provider-independent acceptance** for E07, E28 and the Phase 3 gate (tasks 3.1–3.3). Implementation checkpoint: `725508c` (`feat: add local payment reliability foundation`). This record does not accept Phase 2, activate a payment provider, or change the canonical Order/Payment purchase facts.

## Scope and migration integrity

The Phase 2 model-independent C20/C21/N08 checkpoint is local commit `68f7dc7` (`feat: add phase 2 clarity and upload guidance checkpoint`). C22/C23/C24 remain not activated pending a licensed local vision model; tasks 2.1–2.7 remain unchecked.

The exact fresh disposable acceptance run was `run-53c03758` / `figmemento-local-commerce-test-run-53c03758`, PostgreSQL 17. Its project marker matched; ordered migrations 0001–0048 applied from scratch, ledger 48/48, pending 0, and every source/ledger checksum matched the manifest. The new immutable migrations are:

| Version | Purpose | SHA-256 source checksum |
| --- | --- | --- |
| 0047 | Refund aggregate, immutable ledger/action, restricted atomic command | `2d62b28ae76536e1dc4cc5c2c836fa350e531664df5c197d2126b47115dad5b7` |
| 0048 | Durable webhook inbox, dedupe, claim/fence, reconciliation, restricted read | `a65b7f280482622893e24658f3d24199b0cb0e799efd3c4f44beddeb54640ecc` |

No 0049 was created. Neither an applied migration nor the retained development database was reset or reseeded.

## E07 refund evidence

`tests/database/local-commerce-phase3-acceptance.mjs` used actual Admin HTTP commands and a succeeded local Payment. It passed partial, second partial, full remaining, zero-remaining refusal, over-refund rejection, stale-version rejection, exact selector replay, changed-context conflict, and signed-Admin rejection. Two simultaneously live Workers raced on a separate succeeded Payment: at most one expected-version refund committed. The immutable refund ledger and action facts survived a fresh application PID. Before/after digests of the original Order purchase snapshot and Payment attempt were equal. No Order lifecycle, Fulfillment, Shipment, Supplier, or real payment-provider action was created by the refund.

`tests/database/local-commerce-phase3-faults.mjs` injected refund ledger insert, refund action insert, and aggregate update failures inside rollback-only transactions. Each returned a bounded unavailable result with zero partial aggregate/ledger/action state; no fault probe executed a migration.

## E28 inbox evidence

Exact incoming bytes were SHA-256 hashed before JSON parsing; the durable inbox stores a bounded safe projection, not raw payload, credentials, headers, cookies, or private locators. Real DB acceptance passed first ingest, exact duplicate, same event ID with changed digest conflict, unknown event, unmatched canonical subject, explicit retry, matched reconciliation, and an older contradictory event classified stale without moving Payment/Order backwards. Restricted signed-Admin list/detail/retry HTTP returned safe fields only; there is no public provider-ingest endpoint or provider activation.

Two live Workers contested one inbox event: one claim/finalization succeeded and the other received conflict, with one effective attempt. A separate real fault Worker (PID 1586) committed a processing claim and was terminated before finalization. After the DB-owned lease expired, a different live Worker recovered and reconciled the same event. The ordinary process-restart check used original PID 1501 and fresh PID 1683, while the second live Worker was PID 1503; committed refund replay and inbox read-back survived. No process-memory lock or dedupe was used as authority.

The inbox finalization fault injection returned bounded unavailable with no partial terminal state; its transaction rolled back. RLS/restricted RPC checks denied PUBLIC, anon and authenticated execution; service_role retained only required access. Wrong project and marker failed closed. No secret or raw payload was included in the browser/Admin projection.

## Retained development

The exact retained target was `figmemento-local-commerce` / `development` / `retained_development` / `retained-development`, PostgreSQL 17. Live preflight proved marker identity, contiguous ledger 46/46, only 0047–0048 pending, and source/ledger checksum agreement. The guarded retained apply committed 0047 then 0048 with an exact ledger check after each. Post-state: 48/48, pending 0, source mismatch 0, ledger mismatch 0; retained Order and Payment row counts unchanged, and zero new refund/inbox rows. No remote project or production database was contacted.

## Regression and boundaries

The final-tree `npm run verify` passed: lint 0 errors (one pre-existing Phase 2 `<img>` warning), typecheck PASS, offline 954/954, Phase 1 focused 22/22, Phase 2 partial focused 19/19, Phase 3 focused 6/6, fresh build PASS, rendered 12/12. OpenSpec strict validation passed 24/24; `git diff --check` passed. The retained read-only post-apply plan independently returned ledger 48, pending 0.

This is local development/test persistence acceptance only. The existing Stripe-specific production webhook remains deferred; no Stripe, PayPal, remote Supabase, email, carrier, Supplier persistence, or deployment was invoked. Phase 2's model-dependent work and gate remain unaccepted. Phase 4 was not started.
