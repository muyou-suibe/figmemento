## Why

Local Checkout can safely evaluate a current Cart but deliberately stops before creating a durable business record. The next local-only step is to prove the Order boundary: fresh server authority becomes one immutable, pending-payment Order that can be safely read without introducing payment, production persistence, or fulfillment behavior.

## What Changes

- Add a DEVELOPMENT / TEST ONLY Local Order runtime that creates an immutable process-memory Order from a freshly revalidated current Cart, Catalog/SKU, Customization, CustomerUpload ownership, local shipping, coupon, and tax facts.
- Add a local Order domain contract, repository port/adapter, opaque local Order reference, `pending_payment` status, `pending` payment status, safe browser projection, and safe same-browser guest read boundary.
- Add a local-only creation idempotency contract: the same opaque creation-attempt selector and same authorized current creation context return the original safe Order result; a selector reused with different current context fails safely; a distinct selector is a new creation attempt.
- Preserve the Cart after successful Local Order creation because no payment has occurred; do not clear, rewrite, reserve, or otherwise mutate it.
- Add `/order/success` and a bounded Local Order HTTP surface showing a pending-payment, development-only Order summary without payment-success language.
- Add offline, HTTP, rendered, browser, restart, privacy, idempotency, snapshot-immutability, documentation, and engineering-gate verification.

## Capabilities

### New Capabilities

- `local-order-runtime`: Development/test-only fresh Order creation, immutable snapshots, local idempotency, safe guest access, and pending-payment presentation without payment or production persistence.

### Modified Capabilities

- None.

## Impact

- Expected implementation areas: Local Order domain/application/repository/config/server boundary, local order routes and success UI, local Checkout client handoff, tests, and local-development/future-payment documentation.
- Reuses only already implemented authority seams: current server Cart, Catalog/Variant resolution, configured-item acceptance, owner-scoped CustomerUpload receipt verification, and local shipping/coupon/tax fixtures.
- Does not reuse the current Supabase `/api/orders`, `/api/order-lookup`, Admin Order, Stripe, tracking, or fulfillment paths; those remain production-oriented/legacy boundaries outside this change.
- `build-configurable-product-catalog` C1 Tasks 3.8 and 7.4 remain deferred production snapshot persistence work. `build-product-customization-workflow` remains deferred. This local runtime neither changes their planning/tasks nor claims their production persistence is complete.
- Main risks are safe guest Order access, idempotency context binding, immutable controlled image references, and preserving the strict separation between Local Order runtime and later payment/production Order work.
