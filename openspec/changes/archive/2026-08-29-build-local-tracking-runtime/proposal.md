## Why

The local Day 4 workflow is planned to stop at canonical Fulfillment `quality_check`, leaving no safe local representation of shipment identity or tracking progression. Day 5 needs a bounded development/test-only shipment and tracking boundary so an authorized operator can demonstrate the complete local core flow through delivery without confusing local fixtures with production shipping or allowing browser-controlled logistics state.

Apply is intentionally blocked until `build-local-order-runtime` receives final approval, `build-local-payment-simulation` is applied and verified, and `build-local-fulfillment-runtime` is applied and verified through `quality_check`. No fake paid, Order, Fulfillment, or Quality Check bypass is permitted.

## What Changes

- Add an explicit development/test-only `LOCAL_TRACKING_SOURCE=local_fake` runtime gate with absent-by-default and production-stop behavior.
- Define one canonical process-memory Local Shipment/Tracking aggregate with safe shipment identity, deterministic local carrier/tracking fixtures, shipment lifecycle, tracking events, timestamps, and action bindings.
- Permit only an authorized operator to create a Shipment from canonical paid/succeeded Local Order plus canonical Fulfillment `quality_check`.
- Support the bounded lifecycle `shipment_created → shipped → in_transit → delivered`, with `delivered` terminal and invalid skips rejected.
- Provide safe same-browser customer tracking reads and separate server-only operator actions for shipment creation and lifecycle progression.
- Define independent `trackingActionId` idempotency, replay-first ordering, concurrency serialization, atomic state/event commits, privacy-safe projections, and restart fail-closed behavior.
- Preserve Local Order immutable facts, Local Payment state, and Local Fulfillment lifecycle; do not add a second mutable Order snapshot or financial/shipping-price authority.

## Capabilities

### New Capabilities

- `local-tracking-runtime`: Development/test-only local Shipment identity, tracking lifecycle, customer projection, operator actions, idempotency, concurrency, and restart boundary through `delivered`.

### Modified Capabilities

- None. Existing Local Order, Local Payment, and Local Fulfillment requirements remain unchanged and are dependencies, not modified capabilities.

## Impact

- Future implementation will add local tracking domain/application/repository boundaries, bounded same-origin HTTP routes, a minimal customer tracking view, local operator tooling, offline tests, and documentation.
- Legacy Supabase `orders` tracking fields, production Admin tracking controls, carrier APIs, 17TRACK, webhooks/polling, shipping labels, customs, and production persistence remain legacy or out of scope.
- Tracking Apply is blocked by the three upstream local runtime changes and must not access remote Supabase, create migrations, call providers, or deploy infrastructure.
