## Why

Supplier Batch F is blocked because its WorkOrder admission seam does not
have a canonical runtime authority for resolving the immutable configured item
committed to a Local Order. The current Local Order line snapshot preserves
many purchased facts, but it does not provide a stable per-item identity or
the fulfillment classification needed by the downstream production boundary.
Its Product/Variant/SKU and structured selected-option facts are customer-side
catalog identity; the Supplier-specific specification key belongs to a later,
reviewed Supplier mapping boundary. Supplier code must not reconstruct either
kind of fact from the current Catalog, browser payloads, array positions, or
supplier data. The authority belongs upstream, at Local Order creation, so
that later Catalog, customization, or supplier changes cannot rewrite
purchase history.

## What Changes

Define one reusable, server-owned configured-item read capability over the
canonical Local Order store. Where the audit proves facts are missing, extend
the immutable Local Order item snapshot at creation time with only the minimum
explicit canonical facts required for exact downstream reads: a stable order
item identity, the accepted Product/Variant/SKU and selected-option machine
selection, and the physical/digital fulfillment classification. A later
reviewed Supplier mapping may translate that canonical selection into a
Supplier-local specification key. Expose the canonical facts through a narrow
`LocalConfiguredItemReadPort`-style adapter that returns an immutable found
projection or a bounded unavailable result.

The change will preserve the existing process-memory Local Order architecture,
customer behavior, authorization boundaries, and safe media-reference model.
Incomplete or legacy snapshots will fail closed rather than receive inferred
identities. Historical reads will not require current Catalog resolution.

## Capabilities

### New Capabilities

- `local-configured-item-read-authority`: Server-owned exact read authority for
  immutable configured item facts committed into a canonical Local Order.

### Modified Capabilities

None.

## Impact

The implementation will touch the Local Order creation/snapshot seam and add a
narrow read adapter plus focused domain and integration tests. It will provide
a generic seam that a reviewed Supplier mapping and SupplierWorkOrder can
consume after this prerequisite is complete, without changing Supplier Batch F
in this change. Existing customer
Cart, Checkout, Order Success, Fulfillment, and Tracking UI contracts remain
unchanged. The capability remains local-first and process-memory only; it adds
no migration, remote Supabase operation, storage provider, deployment, or
supplier-specific persistence.
