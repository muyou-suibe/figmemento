# Batch D — Regression and Integration Verification

## Status

`PASS — canonical configured-item read authority verified locally`

This batch verifies the immutable Local Order configured-item read boundary
implemented by Batch C. It does not reconnect or modify
`build-local-supplier-production-operations`.

## Regression evidence

- Historical reads remain identical after simulated Product, Catalog, SKU,
  option, price, customization-schema, and Supplier-mapping drift. The reader
  uses the committed Local Order snapshot and does not reread those sources.
- Exact internal Order ID, public reference, and `orderItemId` ownership are
  required. Wrong Order, wrong public reference, wrong item, cross-Order item,
  and duplicate stored `orderItemId` values return the same bounded
  `{ status: "unavailable" }` result.
- Duplicate Product/Variant/SKU/selected-option lines remain independently
  addressable by their distinct server-generated `orderItemId` values.
- Missing or malformed identity, Product, Variant, SKU, selected options,
  quantity, fulfillment classification, configuration revision, and
  customization values fail closed. Legacy snapshots remain available through
  the existing customer-safe read path but are unavailable through the new
  production-oriented configured-item port. No read backfills or infers data.
- Found projections may retain receipt IDs and bounded crops, but exclude
  contact, payment, owner/capability, provider-locator, filesystem, and
  Supplier-private data. Returned nested values are frozen; repeated reads and
  the stored Local Order remain unchanged after caller mutation attempts.

## Downstream seam

A test-only production-consumer seam reads quantity, Product/Variant/SKU,
selected options, fulfillment type, configuration, and safe media from the
canonical projection. Replacement quantity or configuration supplied by the
caller is ignored, and the canonical result contains no
`selectedSpecificationKey`.

The current Supplier contract remains a separate downstream compatibility
boundary: `SupplierWorkOrderConfiguredItem` still requires a Supplier-facing
`selectedSpecificationKey` and `lineIndex`, while the canonical Local Order
read result intentionally owns neither. Reviewed Supplier mapping work remains
in `build-local-supplier-production-operations`; this prerequisite does not
manufacture a key, reconnect `workOrderPorts()`, or mark Supplier tasks done.

## Validation

- Focused configured-item/Order/domain integration: `69/69 PASS`
- `npm run test:offline`: `884/884 PASS`
- `npm run typecheck`: `PASS`
- `npm run lint`: `PASS` (0 errors; one pre-existing `<img>` warning)
- `npm run build`: `PASS`
- `openspec validate --all --strict`: run after final task closeout
- `git diff --check`: run after final task closeout

## Architecture and safety audit

Final authority chain:

```text
Catalog + ConfiguredItem claims
  -> server validation
  -> Local Checkout
  -> Local Order creation
  -> immutable Order line (orderItemId, Product/Variant/SKU/options,
     quantity, fulfillmentType, configuration, safe media)
  -> LocalConfiguredItemReadPort
  -> future reviewed Supplier mapping
```

The capability remains one process-memory Local Order store plus a read
adapter. It adds no Catalog/Cart/browser reconstruction, second Order store,
cache, database, migration, remote Supabase operation, provider, filesystem
persistence, public configured-item endpoint, or backfill. No Browser rehearsal
was required for this server-side prerequisite.
