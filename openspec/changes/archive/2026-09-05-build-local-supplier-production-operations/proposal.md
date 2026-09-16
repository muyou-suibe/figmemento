## Why

The customer-facing local chain now proves checkout, payment simulation,
customer approval, Fulfillment Quality Check, and Tracking, but it does not
give internal operators a bounded way to compare suppliers, assign production,
track a supplier work order, or receive goods at the Shanghai warehouse. The
supplier workbook provides the first reviewed source material for this next
local-development phase, so the operational boundary should be planned before
any supplier or warehouse workflow is implemented.

## What Changes

- Add a local-only internal Supplier and SupplierOffer model with explicit
  Product/SKU/variant mapping and preserved source provenance.
- Add supplier-offer variants for size, material, production method, piece
  count, and other source-backed specifications, including nullable packaged
  weight and bounded production-only lead-time ranges.
- Add operator-controlled candidate matching and SupplierAssignment snapshots;
  do not automatically choose the cheapest supplier.
- Add privacy-safe SupplierWorkOrder generation from an existing configured
  Local Order item and approved customer configuration.
- Add a separate Supplier Production Operations lifecycle through Shanghai
  warehouse receipt, QC, and ready-for-outbound, without adding supplier states
  to customer Fulfillment.
- Add local cost and lead-time projections that preserve unknown values and
  distinguish supplier production cost from customer revenue and incomplete
  landed-cost inputs.
- Add local operator-facing projections and deterministic replay, invalid-
  transition, terminal-state, authority, and privacy requirements.
- Normalize reviewed workbook information into stable, code-reviewable local
  fixtures; the workbook is source material and is not read at runtime.

### Model C compatibility amendment

The completed canonical configured-item read authority now provides the
server-owned Product/SKU/catalog-Variant identity, exact selected options,
quantity, fulfillment, and committed configuration facts needed by Supplier
operations. Before Supplier operator matching or WorkOrder work resumes, the
Supplier boundary must be amended to consume those facts through an explicit
`CanonicalSupplierSelection` and an approved structured Supplier mapping.
Supplier-local specification keys remain Supplier-owned outputs; they are not
canonical Order facts. This is a compatibility repair upstream of Supplier
operations, not a reconstruction at WorkOrder creation time.

This amendment preserves the validity of the completed Supplier Batches A–E
under their earlier contract. It does not add approved mappings, resume Batch
F, or change any upstream canonical capability.

## Capabilities

### New Capabilities

- `local-supplier-production-operations`: Local supplier, production work-order,
  Shanghai warehouse receipt, cost/lead-time, operator, and customer-projection
  boundary for internal operations.

### Modified Capabilities

None. Existing Local Order, Local Payment, Local Fulfillment, Local Tracking,
Catalog, CustomerUpload, and customer-facing visual capabilities remain
authoritative and unchanged.

## Impact

- Affected future code includes provider-neutral domain contracts, normalized
  local fixtures, process-memory repositories/services, bounded local operator
  routes, and offline regression tests.
- Existing Local Order, Local Fulfillment, and Tracking boundaries are read or
  referenced as dependencies; their lifecycle and customer projections are not
  rewritten.
- The initial implementation remains development/test-only and process-local.
  No remote Supabase schema, migration, supplier API, warehouse provider,
  storage provider, payment flow, shipping engine, or deployment configuration
  is introduced.
- The supplied supplier workbook is treated as reviewed source/reference data.
  Missing, approximate, conflicting, and unmapped business facts remain
  explicit review outcomes rather than guessed production values.
- The existing canonical Local Order/configured-item reader is the only source
  for historical customer selection facts; Supplier matching must not treat a
  bare Supplier specification key as an Order fact or infer a mapping from
  current Catalog data.
