# Batch G Final Integration Audit — Cross-site Acceptance

Date: 2026-09-04
Change: `build-figmemento-html-high-fidelity-port`
Scope: Tasks 11.1–11.3 only

## Acceptance mode

Batch G is a cross-site acceptance of the real application against the
reference-derived inventories. The checked-in Fusion reference is a visual
and interaction authority for the surfaces it contains; it is not a source of
Product, Variant, Customization, Cart, Checkout, Order, Fulfillment, Tracking,
Admin, or Operator business data. Surfaces absent from the reference are
recorded as **FUSION-SYSTEM CONFORMITY**, not as exact reference-page parity.

Evidence combines the previously recorded local human Chrome acceptance for
Batches A–F with a fresh local Worker route and lifecycle recheck. The fresh
Worker ran at `http://localhost:3001/` because port 3000 was already occupied.
It used ignored local development configuration only. No remote Supabase was
accessed.

## 11.1 Complete route matrix

The following matrix records the complete real route set. Desktop and 375px
results for the full matrix are the accepted results recorded in the Batch
A–F audits; the current Worker recheck is supplementary evidence and was not
misreported as a 1280px or 375px viewport (its measured width was 735px).

| Surface | Customer | Operator | Admin | Desktop 1280 | 375px | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Home `/` | PASS | — | — | PASS | PASS | Batch A local browser acceptance |
| Shop `/shop` | PASS | — | — | PASS | PASS | Batch B local browser acceptance |
| Category `/category/[slug]` | PASS | — | — | PASS | PASS | Batch B local browser acceptance |
| Product `/product/[slug]` | PASS | — | — | PASS | PASS | Batch C local browser acceptance |
| Customization on PDP | PASS | — | — | PASS | PASS | Batch C local browser acceptance |
| Cart `/cart` | PASS | — | — | PASS | PASS | Batch D local browser acceptance |
| Local Checkout `/checkout` | PASS | — | — | PASS | PASS | Batch D local browser acceptance |
| Order `/order/success/[reference]` | PASS | — | — | PASS | PASS | Batch E human Chrome acceptance |
| Fulfillment customer view | PASS | — | — | PASS | PASS | Batch E human Chrome acceptance |
| Tracking customer view | PASS | — | — | PASS | PASS | Batch E human Chrome acceptance |
| Fulfillment `/local-fulfillment/operator` | — | PASS | — | PASS | PASS | Batch E human Chrome acceptance |
| Tracking `/local-tracking/operator` | — | PASS | — | PASS | PASS | Batch E human Chrome acceptance |
| Admin Login `/admin/login` | — | — | PASS | PASS | PASS | Archived Admin acceptance reused by Batch F |
| Admin Products `/admin/products` | — | — | PASS | PASS | PASS | Archived Admin acceptance reused by Batch F |
| Admin Orders `/admin/orders` | — | — | PASS | PASS | PASS | Archived Admin acceptance reused by Batch F |

### Fresh local Worker recheck

The following routes were requested from the real local development Worker:

- `/`, `/shop`, `/category/3d-figures`, and `/product/couple-figure` rendered
  the fixture-backed storefront, fixture notice, product media fallback,
  physical fulfillment, shipping-required state, lead-time copy, and the
  real Mini/Standard/disabled Deluxe Variant controls.
- `/cart` and `/checkout` rendered the existing local Cart and server-derived
  Local Checkout boundaries with tax not activated and local arithmetic copy.
- `/order/success/[reference]` rendered the current process-memory Local Order
  and successful Local Payment state.
- The operator routes accepted the existing local operator boundary and
  exposed only their approved lifecycle controls.
- Fulfillment was advanced through `photo_review`, `preview_pending`,
  `preview_approved`, `in_production`, and terminal `quality_check`.
- Tracking was advanced through `shipment_created`, `shipped`, `in_transit`,
  and terminal `delivered`; the operator showed no further terminal action.
- The final customer Order Success read remained safe and did not expose
  internal authority or private locators.

The fresh route continuity probe used the text-only `digital-portrait` fixture
only to exercise process-memory Order/Payment/operator route continuity. It
is explicitly excluded from the approved physical shipping demo path: the
project documentation says not to force that digital fixture through shipping
Checkout. Physical shipping-required browser acceptance remains the recorded
Batch E human Chrome acceptance using the approved physical path.

## 11.2 Interaction, motion, and accessibility matrix

| Concern | Result | Evidence |
| --- | --- | --- |
| Keyboard-only navigation and visible focus | PASS | Batch A–F audits and human Chrome acceptance |
| `prefers-reduced-motion: reduce` | PASS | Manual human Chrome DevTools acceptance; content remained visible and nonessential motion stopped/reduced |
| `pointer: coarse` | PASS | Manual human Chrome touch emulation at 375px |
| `hover: none` | PASS | Manual human Chrome touch emulation; no essential hover-only action |
| Long copy and long references | PASS | Batch B–F responsive evidence and source/regression tests |
| Image fallback and alternative text | PASS | Batch A/C/D/E evidence and rendered regression tests |
| Empty/unavailable states | PASS | Safe unavailable/empty states covered in rendered and route evidence |
| No horizontal overflow | PASS | Desktop/375 browser evidence and rendered/source checks |
| Touch-safe controls | PASS | 375px/coarse-pointer human Chrome acceptance |
| Essential content independent of motion | PASS | Reduced-motion human acceptance and scoped CSS checks |

The media evidence is classified as `HUMAN_BROWSER_ACCEPTANCE`, not Codex
in-app-browser emulation, source regex inference, or CSS-only inference.

## 11.3 Authority, provider, route, and data-drift audit

| Surface | Audit result |
| --- | --- |
| Catalog, Product, Category, SKU, Variant price/currency/availability | PASS — existing catalog authority preserved |
| Customization and CustomerUpload | PASS — customization remains outside SKU options; receipt authority remains server-owned |
| Cart and Local Checkout | PASS — current server Cart and server-derived local arithmetic remain authoritative |
| Local Order and Local Payment | PASS — immutable facts, lifecycle, exact replay, and non-production simulation boundaries preserved |
| Fulfillment and Tracking | PASS — existing separate lifecycle/action/authority boundaries preserved |
| Admin and Operator | PASS — existing authentication/authorization seams preserved; no provider or persistence claim added |
| Production source selection | PASS — local selectors remain explicit development/test choices; no local-to-production fallback |
| Browser-selected backend/source | PASS — no client authority for runtime source selection |
| Provider neutrality | PASS — no new Supabase, storage, payment, carrier, or production provider capability |
| Route integrity | PASS — existing real routes and links remain in use |
| Reference-only data drift | NONE — no invented products, prices, testimonials, ratings, claims, or reference business data |
| Order/Payment/Fulfillment/Tracking semantic drift | NONE |

No visual change modified Product/Variant authority, Customization semantics,
Cart identity, Checkout arithmetic, Order facts, Payment transitions,
Fulfillment lifecycle, Tracking lifecycle, Admin authority, or Operator
authority. No migration, provider, deployment, DNS, or backfill work was
performed.

## Fixture and reference limitations preserved

- There is no public physical shipping-required text-only fixture.
- Text-only capability is verified by deterministic domain/HTTP integration,
  not by adding a fake physical fixture.
- `glass-light-picture` is the approved physical browser path for image upload
  and shipping-required acceptance.
- `digital-portrait` was not used as an approved shipping demo path.
- Digital Checkout was not implemented.
- Order/Fulfillment/Tracking/Admin/Operator screens have no direct reference
  pages; their result is Fusion-system conformity only.

## Verification record

- Batch G focused high-fidelity/Fusion set: PASS (49/49)
- `npm run test:offline`: PASS (852/852)
- `npm run test:rendered`: PASS (9/9)
- `npm run typecheck`: PASS
- `npm run lint`: PASS (0 errors; one existing `<img>` warning)
- `npm run build`: PASS
- `npm run verify`: PASS
- `openspec validate --all --strict`: PASS (19/19)
- `git diff --check`: PASS

## Task disposition

- Task 11.1: PASS — complete route matrix recorded with real local browser
  evidence and the previously accepted desktop/375 evidence.
- Task 11.2: PASS — complete keyboard, focus, media, long-content, fallback,
  empty-state, touch, and overflow evidence recorded.
- Task 11.3: PASS — authority, provider, route, and reference-data drift audit
  found no semantic drift.
- Tasks 12.1–12.2: NOT STARTED. GitHub Pages preview refresh remains outside
  Batch G.

## Stop gates

- Application code changed for Batch G: NO
- CSS changed for Batch G: NO
- Production Admin mutation/persistence claim: NO
- Remote Supabase: NO
- Migration: NO
- C1 backfill: NO
- Provider integration: NO
- Deployment/DNS/Cloudflare: NO
- Batch H / Tasks 12.1–12.2: NOT STARTED
