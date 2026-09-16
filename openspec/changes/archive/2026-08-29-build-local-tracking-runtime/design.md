## Context

The repository has a process-memory Local Order boundary with protected same-browser reads, but Local Order currently exposes only `pending_payment`/`pending`. Local Payment is planning-complete but unapplied, and Local Fulfillment is planning-complete but unapplied; its approved future boundary stops at `quality_check`. There is no local Shipment or Tracking aggregate.

The audit found legacy/production tracking paths: Supabase `orders.fulfillment_status`, `tracking_carrier`, `tracking_number`, `tracking_status`, `shipping_address`, `order_status_logs`, `app/admin/AdminTrackingControls.tsx`, `app/api/admin/orders/route.ts`, `app/api/order-lookup/route.ts`, and `app/track-order/*`. These paths use production-oriented Supabase order state and are not a valid local Shipment authority. `app/domain/catalog/fulfillment.ts` is Product FulfillmentConfig and does not represent Order Shipment state. No active 17TRACK API, carrier webhook/polling, shipping-label, postage, customs, or local Shipment implementation was found in the audit.

## Goals / Non-Goals

**Goals:**

- Define a minimal local Shipment boundary after canonical Fulfillment `quality_check`.
- Complete the local Day 5 demonstration through `delivered` with deterministic fixtures.
- Keep Local Order payment/facts, Local Fulfillment production-preview state, and Local Tracking shipment state as separate authorities.
- Enforce separate customer/operator authority, safe projections, replay-first idempotency, concurrency, atomicity, and restart fail-closed behavior.
- Preserve a clear handoff to a future production Shipping/Tracking change.

**Non-Goals:**

- Applying or implementing Local Order, Local Payment, or Local Fulfillment.
- Supabase schema, migration, durable Shipment/Tracking persistence, D1/Drizzle, SQLite, or production database records.
- Stripe, PayPal, payment state, Order/OrderItem mutation, shipping-price calculation, coupons, tax, or currency authority.
- 17TRACK, carrier APIs, webhooks, polling, live carrier identifiers, labels, postage, customs, GPS, delivery proof, notifications, supplier, factory, ERP, warehouse, returns, refunds, reshipment, or tracking exceptions.
- Production Admin Auth, staff roles, bulk operations, or a full shipping dashboard.

## Decisions

### 1. Hard dependency gate and explicit runtime

Tracking planning is allowed now, but Apply is blocked until Local Order has final human approval, Local Payment is applied and verified, and Local Fulfillment is applied and verified through `quality_check`. The only local runtime selection is an explicit server-only `LOCAL_TRACKING_SOURCE=local_fake`; absent and production modes are unavailable. Runtime enablement is not operator authorization, and no upstream fake bypass or provider-failure fallback is allowed.

### 2. One canonical LocalShipmentAggregate

Use one process-memory aggregate/repository as the only owner of Shipment state, safe Shipment identity, tracking events, timestamps, and `trackingActionId` bindings. The business invariant is independent from idempotency: each canonical Fulfillment internal identity, together with its canonical Order relationship, may have at most one canonical Shipment. `trackingActionId` protects a side effect from exact replay but is not the Shipment uniqueness key. A new create selector after S1 exists receives a bounded conflict/already-exists result, while concurrent distinct selectors can create at most one relationship. Browser Order references, Shipment references, and tracking numbers are never uniqueness authorities. Do not create parallel `Order.shippingStatus`, `TrackingAggregate.status`, `AdminTracking.status`, or a second mutable Shipment store.

The aggregate stores identity references and delivery/tracking metadata only. It reads protected immutable destination facts from canonical Local Order when needed and never copies Product, SKU, price, address, customization, upload, or Cart facts into a mutable Tracking snapshot.

### 3. Quality Check is the hard entry gate

`create_shipment` is an operator-only action. Its ordering is: operator authorization → canonical Order identity → canonical Fulfillment identity → committed `trackingActionId` binding lookup → exact replay return if matched. The initial create action does not have a Shipment identity yet, so its binding is matched from the action selector, canonical Order/Fulfillment identities, authorized operator context, action kind, and normalized relevant input. Only when no equivalent binding exists does the server check whether the canonical Fulfillment already has a Shipment; an existing S1 rejects a new selector. If no Shipment exists, the server then fresh-reads canonical Local Order and Local Fulfillment, verifies `paid`/`succeeded` and `quality_check`, validates bounded fixture input, generates server identities, and atomically commits the relationship and Shipment. Browser fields such as `qualityCheck`, `fulfillmentStatus`, `shipped`, or tracking data are never authority. Tracking does not rename or mutate upstream lifecycle states.

### 4. Separate customer and operator authority

Customer same-browser capability permits only a side-effect-free safe tracking read. The server must resolve the canonical Order and its canonical Fulfillment/Shipment relationship; a public Order reference, public Shipment reference, or local tracking number alone is not authorization. It cannot create Shipment or advance events. Operator actions use a separate server-only local tracking/operator gate and do not require the customer capability. A public reference alone authorizes neither role. Existing production Admin/Supabase routes are not reused.

### 5. Bounded lifecycle and deterministic events

The only local Shipment states are:

```text
quality_check → shipment_created → shipped → in_transit → delivered
```

`quality_check` belongs to Local Fulfillment; Local Tracking owns the four Shipment states. Each valid transition produces the required safe timestamp and deterministic local event metadata. `delivered` is terminal. The fixture may use `Local Demo Carrier` and an obviously local server-generated format such as `FM-LOCAL-TRK-...` (or an equivalent repo-approved format), but the UI must label all results `DEVELOPMENT / TEST ONLY` and must not imply a real carrier scan. The tracking number is display data only and never authorizes reads or mutations.

### 6. Independent action identity and replay-first ordering

Every mutation uses an opaque `trackingActionId`, independent of Local Order creation, Payment, and Fulfillment selectors. After actor authorization and canonical Order/Fulfillment identity resolution, plus Shipment identity resolution when one exists, the server looks up the committed binding first. For initial create, Shipment identity is absent and is not a mandatory lookup key. An exact equivalent create, dispatch, in-transit, or delivery retry returns its original result even when current state has advanced. Only a new/non-equivalent selector performs current-state and bounded-input validation; for a new create it first checks the canonical Fulfillment-to-Shipment uniqueness relationship. Raw capabilities, credentials, and secrets are never stored in bindings.

### 7. Atomicity and concurrency

Action binding, canonical Fulfillment-to-Shipment uniqueness relationship, lifecycle transition, event creation, and timestamps commit together. A failure leaves all unchanged. Process-memory atomic commit serializes concurrent creates and event transitions: at most one Shipment is created per canonical Order/Fulfillment, and no action may skip `shipped → in_transit → delivered`. A different selector that loses a race receives a bounded conflict or existing-result response; an exact retry receives the committed result.

### 8. Address and financial authority

Shipment does not recalculate shipping, coupons, tax, totals, or payment. Destination eligibility comes from the protected immutable Local Order snapshot. Tracking routes do not accept browser address, Cart, shipping amount, discount, tax, payment, or currency authority and do not introduce a mutable address copy.

### 9. HTTP and UI boundary

Use bounded same-origin customer/operator routes following existing local runtime conventions. The customer view may be integrated into the existing Local Order Success boundary or a narrow tracking route; the exact route is an implementation detail and must not reuse the legacy Supabase order-lookup authority. A minimal local operator tool exposes only Create Shipment, Mark Shipped, Mark In Transit, and Mark Delivered. Every surface states `DEVELOPMENT / TEST ONLY`; no customer account or production shipping dashboard is added.

### 10. Privacy-safe projections

Customer output contains only safe public Order/Shipment references, fixture carrier label, local tracking number, Shipment/tracking state, event labels/timestamps, and the development notice. It excludes internal IDs, owner IDs, receipt IDs, storage keys, provider tokens, credentials, SQL details, raw admin notes, and private uploads. Operator output is also bounded and does not broaden existing private-upload access.

### 11. Restart and production stop gate

All local Shipment/Tracking state is process-memory. Restart loses the local workflow and old references fail closed; no state is resurrected from browser storage, filesystem, SQLite, Supabase, or provider storage. No remote database, migration, provider, storage, supplier, email, DNS, Cloudflare, deployment, payment, or production shipping side effect is allowed.

### 12. Audit classification and future handoff

- **Reusable:** Local Order protected capability/read conventions, immutable snapshot boundary, local runtime configuration pattern, Local Fulfillment `quality_check` contract, safe same-origin parsing, safe projections, and process-memory test fakes.
- **Legacy only:** Supabase `orders` tracking columns, `order_status_logs`, `app/track-order/*`, `app/api/order-lookup/route.ts`, `AdminTrackingControls`, and legacy Admin order transitions.
- **Production only:** Supabase Order/Shipment persistence, Admin session, carrier identifiers, 17TRACK, carrier APIs/webhooks/polling, labels, postage, customs, supplier/warehouse handoff, and notifications.
- **Deferred:** Local Order final approval, Local Payment application, Local Fulfillment implementation, production Shipment schema/provider strategy, exceptions, returns, and real delivery proof.
- **New local boundary:** Local Shipment/Tracking domain, aggregate/repository, operator/customer services, safe HTTP projections, local UI, fixtures, offline tests, and documentation.

The future production change must separately decide durable Shipment schema, carrier integration, 17TRACK, webhook/polling, real identifiers, exceptions, returns, delivery proof, customs, and notifications.

## Risks / Trade-offs

- [All upstream Apply gates remain blocked] → Keep Tracking planning complete but do not implement or fabricate paid/quality-check state.
- [Legacy Supabase tracking paths look reusable] → Classify them as production/legacy and enforce a new local aggregate boundary.
- [Concurrent Shipment creation could duplicate shipments] → Enforce one aggregate keyed by canonical Order/Fulfillment and serialize commits.
- [Replay could be rejected after state changes] → Resolve exact `trackingActionId` bindings before current-state validation.
- [Customer and operator authority could cross] → Use separate server-only gates and test both forbidden directions.
- [Local fixture could be mistaken for real carrier tracking] → Use safe deterministic labels, generated identifiers, and visible development/test notices.
- [Restart loses a local tracking workflow] → Fail closed with no resurrection or fallback and document the local-only limitation.

## Migration Plan

No database, storage, provider, or infrastructure migration is created or applied. After all upstream dependencies are approved and applied, implementation adds only local process-memory modules, offline tests, bounded UI/routes, and documentation. Rollback disables the ignored local runtime selection and removes local modules; no remote records or migration history change.

## Open Questions

The exact local route path and fixture display label may be selected during Apply from the existing route conventions, provided the spec boundaries remain unchanged. Production carrier, persistence, tracking exception, and notification decisions are intentionally deferred to a future change.
