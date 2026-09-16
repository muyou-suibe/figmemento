## 1. Dependency, Audit, and Runtime Boundary

- [x] 1.1 Record the hard Apply gate: Local Order final approval, Local Payment applied/verified, and Local Fulfillment applied/verified through `quality_check`; do not modify, archive, or bypass any upstream change.
- [x] 1.2 Re-audit and document Local Order, Local Payment, Local Fulfillment, legacy Supabase tracking fields, Admin tracking, public order lookup, and Product FulfillmentConfig classifications.
- [x] 1.3 Add a server-only `LOCAL_TRACKING_SOURCE` parser with explicit development/test `local_fake`, absent-by-default behavior, production rejection, and no source-failure fallback.
- [x] 1.4 Define a separate server-only local Tracking operator gate; runtime enablement alone must not authorize an operator and customer capability must not substitute for it.
- [x] 1.5 Establish local Tracking module/provider-stop boundaries that exclude Supabase, migration, provider, storage, supplier, email, and deployment operations.

## 2. Shipment and Tracking Domain Contracts

- [x] 2.1 Define strict local Shipment/Tracking, server-owned identity-reference, fixture, event, action, safe projection, and bounded issue types without copying mutable Order facts; model at-most-one Shipment per canonical Fulfillment independently from `trackingActionId`.
- [x] 2.2 Define the exact `shipment_created`, `shipped`, `in_transit`, and terminal `delivered` lifecycle with the `quality_check` entry invariant and invalid-skip rejection.
- [x] 2.3 Define server-generated safe Shipment reference, obviously local deterministic tracking identity such as `FM-LOCAL-TRK-...`, carrier fixture, event labels, timestamps, and visible `DEVELOPMENT / TEST ONLY` semantics; tracking identity is never an authority.
- [x] 2.4 Define protected Local Order destination authority and explicitly reject browser address, Cart, shipping-price, coupon, tax, payment, currency, and provider fields.
- [x] 2.5 Add deterministic domain tests for quality-check admission, lifecycle transitions, terminal delivery, invalid skips, safe projections, fixture boundaries, and no-financial-authority behavior.

## 3. Canonical Process-Memory Shipment Aggregate

- [x] 3.1 Implement one canonical process-memory Local Shipment/Tracking aggregate keyed by server-owned canonical Order/Fulfillment identity, with an at-most-one Shipment relationship independent from idempotency and no second mutable Order or Shipment store.
- [x] 3.2 Implement operator-only Shipment creation with ordering of operator authorization, canonical Order/Fulfillment identity resolution, exact action-binding lookup, uniqueness check, then fresh `paid`/`succeeded` and `quality_check` validation, without fake paid or quality-check bypasses.
- [x] 3.3 Implement atomic canonical Fulfillment-to-Shipment relationship, Shipment lifecycle, event, timestamp, and action-binding commits with rollback preserving all prior state on failure.
- [x] 3.4 Implement independent `trackingActionId` bindings, actor/context matching, create replay before requiring a Shipment identity or current-state validation, new-selector uniqueness rejection, server-generated tracking identity, and bounded input handling.
- [x] 3.5 Add aggregate/repository tests for one-Shipment uniqueness, new-selector conflict, all valid transitions, invalid skips, concurrent creation, concurrent events, exact replay after state changes, rollback, restart loss, and upstream fact preservation.

## 4. Customer Tracking Read Boundary

- [x] 4.1 Implement a side-effect-free same-browser customer tracking projection for an existing Shipment with safe references, fixture metadata, state, events, timestamps, and development/test notice.
- [x] 4.2 Reject public Order reference-only, public Shipment reference-only, tracking-number-only, and separate-browser reads uniformly without revealing Order, Fulfillment, Shipment, owner, or private-object existence.
- [x] 4.3 Ensure customer reads and Order Success/tracking refreshes never create Shipment, generate a tracking number, append events, advance state, or mutate timestamps.
- [x] 4.4 Enforce projection privacy: omit internal IDs, owner IDs, receipt IDs, storage keys, provider tokens, credentials, SQL details, admin notes, and private uploads.
- [x] 4.5 Add customer application/HTTP tests for capability authorization, public-reference rejection, side-effect-free reads, safe event projection, restart unavailable, and no financial/address mutation.

## 5. Operator Actions, HTTP, and UI Surface

- [x] 5.1 Implement separately authorized operator actions for `create_shipment`, `mark_shipped`, `mark_in_transit`, and `mark_delivered` with current-state enforcement.
- [x] 5.2 Enforce runtime/operator authority separation before privileged construction; customer capability is not required for operator actions but is not sufficient for them, and customer-capability attempts to create Shipment, mark shipped, append events, or mark delivered are rejected.
- [x] 5.3 Add bounded same-origin customer/operator HTTP routes with safe errors, no browser lifecycle authority, no capabilities in JSON/URL, and no legacy Supabase tracking calls.
- [x] 5.4 Integrate the safe customer tracking view with the local Order Success boundary or narrow local tracking route and add minimal runtime-gated operator tooling; do not build a production dashboard.
- [x] 5.5 Add rendered/browser acceptance for desktop and 375px covering quality-check notice, Shipment creation, shipped, in-transit, delivered, safe tracking read, replay, and terminal wording.

## 6. Documentation and Final Verification

- [x] 6.1 Document local Tracking setup, dependency gate, quality-check entry, lifecycle, fixtures, customer/operator authority, privacy, restart behavior, and future production handoff without secrets.
- [x] 6.2 Add provider-stop-gate coverage proving no 17TRACK, carrier API/webhook/polling, label, postage, customs, supplier, email, Supabase, migration, storage, DNS, Cloudflare, deployment, or C1 backfill operation.
- [x] 6.3 Run focused local Tracking domain/aggregate/application/HTTP tests and existing Local Order, Local Payment, Local Fulfillment, CustomerUpload, Catalog, Customization, and Checkout regressions offline when upstream implementation is available.
- [x] 6.4 Run `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test:rendered`, `openspec validate --all --strict`, and `git diff --check` without weakening strictness or scope gates.
- [x] 6.5 Prepare final human review evidence for quality-check admission, Shipment uniqueness, lifecycle/event replay, concurrency, privacy, restart stop, delivered terminal boundary, and future production handoff; do not archive this change or create a later Shipping Provider change.
