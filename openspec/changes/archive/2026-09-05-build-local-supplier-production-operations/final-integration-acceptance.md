# Batch H — Final Integration and Acceptance

Status: complete for the local development/test runtime only. This is not a production-readiness claim.

## 8.1 Deterministic local integration path

`tests/local-supplier-final-acceptance.test.mjs` exercised the real application boundaries in this order:

1. A configured physical Cart line with a server-resolved SKU and bounded customer text was accepted by `LocalOrderCreationService`.
2. The canonical process-memory Local Order generated its own Order and `orderItemId`; no paid state was manually rewritten.
3. `LocalPaymentService` and the canonical Local Payment repository committed a successful Payment, producing `paid` / `succeeded`.
4. The real Fulfillment operator boundary entered photo review and published a preview.
5. The real customer Fulfillment boundary approved the preview using the existing same-browser capability.
6. The canonical configured-item read adapter supplied the exact Order item to Supplier candidate matching.
7. Candidate inspection used one explicit TEST-ONLY approved Model C mapping. Checked-in business mappings remain unapproved.
8. The explicit assignment and WorkOrder actions committed through `LocalSupplierOperatorService`.
9. The Supplier operation advanced through every exact state:

   `unassigned → assigned → work_order_ready → submitted_to_supplier → supplier_confirmed → in_production → supplier_completed → en_route_to_warehouse → warehouse_received → warehouse_qc → ready_for_outbound`

10. The first `supplier_confirmed → in_production` attempt was rejected while customer Fulfillment was only `preview_approved`. The customer operator boundary then moved Fulfillment to `in_production`, and a new Supplier action committed.
11. Warehouse receipt rejected an incorrect expected quantity and then accepted the exact canonical quantity with `receivedQuantity === expectedQuantity` and `damageReported === false`.
12. Accepted Warehouse QC and ready-for-outbound actions committed; no Shipment, Tracking, carrier, tracking number, or label was created.

The final operator projection retained assignment, WorkOrder, production, warehouse, terminal readiness, and Batch G economics. Customer Fulfillment remained a separate lifecycle and was not mutated by Supplier transitions.

## 8.2 Regression and authority matrix

- Separate server-only operator authority is required; an unauthorised Supplier operator cannot read or mutate Supplier state.
- Customer/browser authority is not accepted as Supplier operator authority.
- Browser-carried canonical Product fields are rejected by the Supplier boundary.
- Exact Order and `orderItemId` identity is used; cross-Order and missing state remain unavailable.
- Assignment, WorkOrder, production, receipt, QC, and outbound actions have exact replay behavior. Non-equivalent action reuse remains conflict/reject behavior.
- Existing Supplier lifecycle concurrency tests continue to pass; the synchronous process-memory repositories remain the only Supplier stores.
- Canonical configured-item reads remain immutable after Supplier dataset edits and are not reconstructed from current Catalog state.
- Restarting the Supplier process-memory repositories fails closed for previously created WorkOrders.
- Checked-in source coverage remains 8 Suppliers, 13 Offers, and 31 Supplier Offer Variants. It contains 0 approved catalog mappings; the acceptance test's one mapping is explicitly TEST-ONLY.
- Batch G cost, currency, production lead-time, packaged-weight, provenance, and unavailable landed-cost/margin semantics remain unchanged.
- Customer-facing projections retain their existing supplier-data redaction.

## 8.3 Verification evidence

- Focused Supplier A–H suite: 101/101 PASS.
- `npm run test:offline`: 887/887 PASS.
- `npm run verify`: PASS. This included lint, typecheck, offline tests, build, and rendered tests.
- `npm run typecheck`: PASS.
- `npm run lint`: PASS, 0 errors and 1 existing `@next/next/no-img-element` warning in `app/storefront/ProductCustomizationImageField.tsx`.
- `npm run build`: PASS.
- `npm run test:rendered`: 9/9 PASS.
- `openspec validate --all --strict`: PASS.
- `git diff --check`: PASS.
- Untracked Batch H files received a direct whitespace check: PASS.

## 8.4 Local-only boundary

Supplier source data, assignment, WorkOrder, production lifecycle, warehouse receipt, QC, and ready-for-outbound state are process-memory local development/test behavior. No real supplier mapping approval was created. No automatic cheapest-supplier selection was introduced.

This Batch H acceptance does not add or claim:

- production supplier connectivity or procurement;
- remote Supabase, migration, persistence, or backfill;
- storage provider, carrier, Shipment, Tracking, label, or shipping integration;
- production fulfillment, deployment, DNS, or Cloudflare changes.
