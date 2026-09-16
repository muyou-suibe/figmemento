# 01 — Accepted local core baseline

Status: **LOCAL CORE COMPLETE** for isolated development/test persistence.

The completed `complete-local-commerce-persistence` change is the frozen
behavioral baseline. Production adapters must consume these authorities rather
than recreate them.

## Accepted capabilities

| Capability | Classification | Accepted contract |
| --- | --- | --- |
| Catalog/configuration reads | LOCAL CORE COMPLETE | Same-project synthetic Product, Variant, SKU, options, configuration, fulfillment, pricing, bounded shipping and coupon facts; no browser authority or silent fallback. |
| Cart persistence | LOCAL CORE COMPLETE | Owner/project scoped Cart, stable distinct lines, quantities, ordering, server-owned version and CAS; Order creation does not clear Cart. |
| Customization Draft | LOCAL CORE COMPLETE | Durable owner-scoped Draft, stable slot order, crop values, confirmed revision and stale-write rejection. |
| Private uploads/media | LOCAL CORE COMPLETE | Server-inspected bytes, private receipts, immutable originals, derived crops, operation recovery, lifecycle cleanup and cross-owner denial. |
| Image processing | LOCAL CORE COMPLETE | Local loopback sharp helper for orientation/decode/crop; helper output alone is never a receipt or publication. |
| Checkout | LOCAL CORE COMPLETE | Fresh server validation against Cart, Catalog/configuration and bounded rules; tax remains `not_activated/null`. |
| Order creation | LOCAL CORE COMPLETE | Atomic immutable Order/item snapshots, exact purchase facts, receipt attachment, capability grant and idempotent replay. |
| Payment | LOCAL SIMULATION ONLY | Atomic local attempts/actions and canonical paid transition; no real money or provider reconciliation. |
| Photo review | LOCAL CORE COMPLETE | Explicit operator admission and durable per-item review decisions. |
| Production preview | LOCAL CORE COMPLETE | Immutable Order-wide manifests, exact current version authority and complete required-item coverage. |
| Customer decisions | LOCAL CORE COMPLETE | Approve/current-version or bounded revision request; maximum two revisions per Order, v1→v2→v3 only. |
| Production/QC gates | LOCAL CORE COMPLETE | Paid/review/current-preview decision gates; no automatic production from timeout or approval. |
| Shipment/Tracking | LOCAL CORE COMPLETE | One physical Shipment per Fulfillment, ordered local lifecycle/events and replay-safe customer/operator reads. |
| Digital delivery | LOCAL CORE COMPLETE | Immutable private versions, owner/item grant, opaque ticket, atomic claim/quota, revoke/replace and truthful stream outcome. |
| Identity/session | LOCAL CORE COMPLETE | Local persistent customer/password hash, opaque session hash, revoke/expiry and guest/member separation. |
| Restart durability | LOCAL CORE COMPLETE | Original guest/member credentials recover durable state across different application processes and retained stack stop/start. |
| Concurrency | LOCAL CORE COMPLETE | Two live Workers validated database serialization across Cart, media, Order, Payment, preview, Shipment and download quota. |
| Fault handling | LOCAL CORE COMPLETE | Application/DB/Storage/helper/stream failure matrix preserves rollback, truthful state and retry/reconciliation behavior. |
| Security | LOCAL CORE COMPLETE | RLS, restricted RPCs, private Storage, actor/owner checks, origin checks and client-secret/locator leakage audit. |
| Desktop/mobile UX | LOCAL CORE COMPLETE | Accepted desktop and 375px mobile journeys, keyboard alternatives, upload/reorder/crop/retry and safe Admin journey. |

## Durable invariants production must preserve

- Product/Variant/SKU/options and accepted configuration are canonical purchase
  facts; current Catalog changes never rewrite historical Orders.
- Server-calculated prices, discounts and shipping are authoritative. Browser
  totals and provider payloads are evidence inputs only.
- Order snapshots are immutable; mutable Payment/Fulfillment/Shipment/delivery
  lifecycles are separate.
- Guest and member owners do not merge by email. Order capabilities and active
  member sessions retain their existing scope.
- Original media remains private and immutable. Receipts, slots, crop revisions
  and derived/publication state remain server-owned.
- Every mutation uses fresh actor authorization, expected version where
  required and durable idempotency/replay semantics.
- Production preview has at most two customer revision requests per Order.
- Digital download quota is consumed by a committed claim attempt, not by a
  browser assertion that bytes were received.

## Accepted evidence anchors

- Task 10.8: desktop/mobile/browser evidence and narrow restart slice.
- Task 11.1: complete A→B commerce recovery.
- Task 11.2: retained database/private Storage stop/start.
- Task 11.3: fresh ledger, rerun, guarded rebuild and interrupted migration.
- Task 11.4: two-live-instance concurrency.
- Task 11.5: fault injection.
- Task 11.6: security field and permission matrix.
- Task 11.7: consolidated scenario index and runbooks.
- Task 12: independent lint/typecheck/offline/build/rendered/full verification.

## Explicit non-claims

- Real Auth, payment, email, carrier, analytics or production Storage:
  **PRODUCTION INTEGRATION REQUIRED**.
- Supplier persistence and C1/Customization Phase C:
  **DEFERRED / NOT AUTHORIZED**.
- Production remote migration/deployment readiness:
  **DEFERRED / NOT AUTHORIZED**.
