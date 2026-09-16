## Why

The completed Local Order and Local Payment boundaries currently stop before the post-payment production workflow. Photo review, preview approval, production start, and quality check need a deterministic local contract that proves the business sequence without touching production Order persistence, suppliers, storage providers, or shipping.

The upstream Apply dependencies are satisfied: `build-local-order-runtime` is 30/30, synced, and archived, and `build-local-payment-simulation` is 30/30, reviewed, synced, and archived. Fulfillment Apply was therefore allowed to begin. The current local implementation is complete at 30/30 tasks and remains a development/test-only process-memory runtime pending Review, Sync, and Archive. The implementation consumes the canonical `paid`/`succeeded` entry state from the archived Local Payment boundary.

## What Changes

- Define a new `local-fulfillment-runtime` capability for a development/test-only, process-memory fulfillment workflow.
- Accept only a freshly authorized canonical Local Order in local `paid`/`succeeded` state; never trust browser-submitted payment or fulfillment status.
- Add a single canonical local Fulfillment lifecycle from `photo_review` through `preview_pending`, preview approval, `in_production`, and terminal `quality_check`.
- Preserve immutable Local Order purchase facts while storing fulfillment lifecycle, preview version, revision count, and decision timestamps separately within one canonical local aggregate.
- Add deterministic local Production Preview metadata/fixture behavior without claiming real rendering, manufacturing, or supplier delivery.
- Support customer Approve and Request Revision actions with bounded notes, optimistic preview-version checks, independent idempotency selectors, and a hard maximum of two revision requests.
- Support a minimal development/test operator boundary for Photo Review, initial/revised preview publication, production start, and Quality Check, separated from customer capability authority.
- Add safe customer/operator projections, restart fail-closed behavior, offline tests, and Day 5 handoff documentation.

## Capabilities

### New Capabilities

- `local-fulfillment-runtime`: Development/test-only paid-Order fulfillment lifecycle, protected preview workflow, customer approval/revision, local operator actions, idempotency, privacy, and quality-check boundary.

### Modified Capabilities

- None. This is a new local capability that depends on the completed, synced, archived canonical Local Order and Local Payment boundaries without modifying their canonical specs or legacy production requirements.

## Impact

- Implementation areas covered by this change: local Fulfillment domain and aggregate, runtime gate, customer/operator application services, safe HTTP routes, Order Success/preview UI, deterministic local behavior, tests, and development handoff documentation.
- Existing `fulfillment_status`, `photo_review`, tracking, digital-delivery, and Admin Order routes backed by Supabase are audit references only and remain legacy/production-only.
- `app/domain/catalog/fulfillment.ts` remains Product FulfillmentConfig and is not reused as Order Fulfillment state.
- No Supabase schema, migration, remote record, production Order/OrderItem/Fulfillment DB, storage-provider decision, supplier/factory/ERP integration, Payment implementation, shipping, tracking, email, deployment, DNS, Cloudflare, or C1 backfill is included.
- Fulfillment Apply was allowed because the Local Order and Local Payment dependencies are complete, reviewed where applicable, synced, archived, and their canonical specs are available; the Fulfillment implementation is now complete at 30/30 tasks, with Review, Sync, and Archive still pending.
