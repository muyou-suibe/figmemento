# Visual V2 adoption review

## What changed visually

Unified motion tokens, calmer physical button feedback, transform-based floating scrapbook cards, card straightening/lift, restrained image zoom, section reveal refinement, state-aware upload panels, durable preview approval stamp, calm Cart line entrance, trust-first Checkout focus and short success-state entrances.

## What dependencies were added

None.

## What files were touched

Storefront presentation components, the storefront CSS module, global presentation tokens, focused tests and this isolated evidence directory.

## Bundle/build impact

No runtime dependency was added. The change is CSS and small data-attribute/state projection markup. A fresh vinext production build passed with 571 client-reference modules, 577 RSC modules, 153 client modules and 152 SSR modules transformed.

## Accessibility impact

Focus-visible treatment is strengthened. Reduced-motion users receive immediate content with near-zero transition duration. Touch devices do not depend on hover. Existing labels, focus transfer and Escape behavior remain intact.

## Performance risks

Three hero polaroids are the only passive infinite transforms. Card/image motion is interaction-triggered. No unbounded observers, particle systems or animation framework was added.

## Visual regressions found

No horizontal overflow or breakpoint regression was observed across the recorded 36 route/viewport combinations. The fixture runtime cannot demonstrate a real approved production-preview stamp without a durable accepted Fulfillment, so that state remains contract-tested rather than fabricated for presentation.

## Validation summary

- Visual V2 focused tests: 6/6 PASS.
- Existing customer-polish regression: 13/13 PASS.
- Offline suite: 923/923 PASS.
- Rendered suite after a fresh build: 12/12 PASS.
- Full verify: PASS.
- OpenSpec strict: 23/23 PASS.
- Migration source verification: 37/37; schema version 37; no 0038.

## Business contracts changed

NONE.

## Owner decision

ADOPTED BY OWNER — INTEGRATION VALIDATED

## Local persistent integration — 2026-09-16

- Adopted source: `9722183f11559c67a19f765d63bfe4f9c46e23d2`.
- Integration branch: `adopt/visual-v2-integration`.
- Runtime authority: retained-development `local_persistent` Catalog, customer auth, Cart, upload/media, Checkout, Order, Payment simulation, Fulfillment, Tracking and Admin commerce composition. Supplier remains the accepted `local_fake` boundary.
- Retained database safety: project `figmemento-local-commerce`, PostgreSQL 17, schema version 37, ledger 37/37, pending migrations 0 and no `0038`. No migration, reset or reseed was executed.
- Real customer journey: Home → Shop → Couple Anniversary Figurine PDP → authoritative variant/SKU selection → one real PNG upload → durable receipt and Draft → persisted 90% crop → Add to Cart → quantity 1→2 → exact-line delete → restored Draft/media/crop → re-add → Checkout server review → local Order → successful local Payment simulation.
- Runtime result: upload `201`; Cart add/update/delete `200`; Checkout `200`; Order creation `200` after the documented idempotency probe; Payment simulation `200`. The created safe public reference was `FM-LOCAL-24AF26D9E0CF45DD`; no real money or provider was used.
- Total integrity: subtotal `$69.90`, local shipping fixture `$5.00`, discount `$0.00`, tax `not_activated`/`null`, local demo total `$74.90`.
- Failure projection: a stale pre-existing Cart cookie produced the bounded unavailable state with no React overlay or undefined collection crash; a fresh private context completed the journey.
- Broader surfaces: Account entry, Track Order input boundary, signed Admin login and persistent Admin Orders read all responded through their existing authorities. The new paid Order truthfully remained awaiting operator Photo Review. Preview publication/approval, production, shipment/tracking mutation and digital grant/download were not advanced or fabricated in this integration run; their existing focused and full regression contracts remain separate evidence.
- Language/runtime presentation: the retained Catalog rendered the adopted Home in EN, ES and ZH; the existing recorded 1280/1024/980/960/900/840/768/375 evidence, three independent Hero motion paths and zero-overflow checks remain unchanged.
- Business diff audit: the V2 range changes presentation, state-derived data attributes, accessibility, tests and documentation only. Pricing, Catalog authority, Cart/Checkout/Order/Payment semantics, ownership, Fulfillment/Tracking/Digital authority, RLS/RPC and Storage authorization are unchanged.

Business contract change: **NONE**.
