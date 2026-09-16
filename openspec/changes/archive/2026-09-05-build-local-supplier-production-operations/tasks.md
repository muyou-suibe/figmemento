## 1. Supplier Source Normalization

- [x] 1.1 Pin the reviewed supplier workbook identity, sheet/row provenance, source URL policy, and provisional/approved fact status without reading XLSX at runtime
- [x] 1.2 Define stable typed Supplier fixture records for the reviewed supplier groups, preserving explicit unknown warehouse, video, return, and rework facts
- [x] 1.3 Normalize SupplierOffer and SupplierOfferVariant fixtures for source-backed sizes, methods, piece counts, bases, prices, currencies, packaged weights, lead times, and pricing bases
- [x] 1.4 Add offline normalization and coverage tests for explicit mappings, duplicate 3D-pet/bobblehead sources, approximate values, area pricing, missing digital lead times, and unmapped catalog Products

## 2. Supplier Domain and Matching

- [x] 2.1 Implement strict TypeScript domain contracts and validation for Supplier, SupplierOffer, SupplierOfferVariant, and explicit Product/SKU/specification mappings
- [x] 2.2 Implement bounded candidate matching that returns all active eligible mapped offers without heuristic matching or automatic cheapest-supplier selection
- [x] 2.3 Implement operator-controlled SupplierAssignment creation with separate operator authority, one active assignment per production unit, and no customer-capability authorization
- [x] 2.4 Add domain tests for ambiguous/missing evidence, inactive offers, physical-versus-digital scope, cross-Order identity rejection, and assignment conflicts

## 3. SupplierWorkOrder

- [x] 3.1 Implement fresh canonical Local Order and Customer Fulfillment gates requiring paid/succeeded Order state, a configured item, a committed assignment, and at least preview_approved
- [x] 3.2 Implement privacy-safe work-order projection of existing immutable Order/configuration facts and authorized internal media references without adding personalization fields or raw locators
- [x] 3.3 Implement atomic SupplierWorkOrder generation with immutable assignment snapshots, independent operation identity, replay-first binding, and bounded non-equivalent conflict handling
- [x] 3.4 Add offline tests for approval gates, cross-Order references, catalog drift, private-content boundaries, exact replay, and partial-commit rollback

## 4. Supplier Production Lifecycle

- [x] 4.1 Implement the exact consecutive Supplier Production Operations transition table from unassigned through terminal ready_for_outbound
- [x] 4.2 Implement server-only operator lifecycle actions with fresh canonical gates, existing customer Fulfillment in_production admission, safe error mapping, and no customer-state mutation
- [x] 4.3 Implement atomic process-memory lifecycle repository behavior with independent action bindings, synchronous aggregate commit, and deterministic per-unit concurrency serialization
- [x] 4.4 Add lifecycle tests for valid sequencing, skipped/backward/terminal transitions, exact replay, conflicting action identity, concurrent actions, and unchanged customer Fulfillment

## 5. Shanghai Warehouse Receipt

- [x] 5.1 Implement WarehouseReceipt creation for en-route work orders with received quantity, timestamp, discrepancy, damage, QC, notes, and bounded ready-for-outbound result
- [x] 5.2 Implement discrepancy, damage, and QC validation that blocks ready_for_outbound until the approved bounded QC outcome is present
- [x] 5.3 Implement the ready_for_outbound downstream handoff projection without creating Shipment, Tracking, shipping, reshipment, refund, or exception state
- [x] 5.4 Add offline receipt tests for authorization, en-route gate, duplicate receipt/QC rejection, discrepancy handling, terminal behavior, and absence of warehouse-provider confirmation

## 6. Local Operator Surface

Model C compatibility gate (planning-only): before unchecked Supplier matching
and WorkOrder work resumes, the Supplier boundary must be amended to consume
the canonical configured-item selection and an explicit approved mapping. The
amended contract must distinguish catalog Variant identity from
SupplierOfferVariant identity and Supplier-local specification identity;
the 6.2–6.4 implementation and regression checks are acceptance-complete
only after the final Apply repair validation passes.

- [x] 6.1 Add explicit development/test-only supplier source configuration and a server-only operator route using process-memory repositories with restart fail-closed behavior
- [x] 6.2 Implement private operator projections for supplier list, source-backed offer comparison, canonical configured-item candidate evidence, and explicit assignment selection; Supplier-local specification is mapping output and unresolved mappings remain review_required
- [x] 6.3 Implement private operator projections for work-order, supplier-production, Shanghai-warehouse, QC, and ready_for_outbound queues with bounded action results, preserving distinct canonical catalog Variant/orderItemId and SupplierOfferVariant identities from the committed assignment
- [x] 6.4 Add authorization, privacy, responsive, accessibility, and safe-error tests for the local operator surface without exposing supplier data to customer routes

## 7. Cost, Lead Time, and Weight

- [x] 7.1 Implement supplier production cost projections separately from immutable customer revenue, retaining currency, pricing basis, unknown values, and no fabricated area-based unit price
- [x] 7.2 Implement production-only min/max lead-time and standard packaged-weight projections with per-variant values, nullable dimensions, and no delivery ETA semantics
- [x] 7.3 Implement provenance and approval-state display for approximate or provisional supplier facts, while keeping landed cost, logistics, fees, duties, warehouse cost, and margin unavailable when inputs are absent
- [x] 7.4 Add offline tests for currency/amount safety, area pricing, approximate values, per-variant weights, production-only lead times, null dimensions, and customer-projection redaction

## 8. Integration and Acceptance

- [x] 8.1 Add a deterministic local integration path from an existing paid/approved configured Order through assignment, work order, supplier lifecycle, warehouse receipt/QC, and ready_for_outbound
- [x] 8.2 Add regression coverage for customer/operator authority separation, replay and concurrency behavior, immutable snapshots, privacy, restart fail-closed behavior, and all provider/procurement stop gates
- [x] 8.3 Run the relevant offline, typecheck, lint, build, rendered, OpenSpec, and diff checks for the completed local supplier operations implementation
- [x] 8.4 Record final source coverage, unresolved mapping/business approvals, lifecycle and snapshot evidence, local-only limitations, and explicit no-provider/no-migration/no-deployment scope
