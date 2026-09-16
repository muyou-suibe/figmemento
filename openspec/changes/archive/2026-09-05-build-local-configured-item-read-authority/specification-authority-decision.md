# Specification Authority Decision

## Decision

**Model C — `selectedSpecificationKey` is a Supplier mapping fact.**

The canonical Customer Order must not acquire a scalar
`selectedSpecificationKey` merely to satisfy the downstream SupplierWorkOrder
shape. The Local Order must preserve the exact customer/catalog machine
selection already accepted at checkout: Product/Variant identity, approved SKU
code, and the complete `selectedOptions` set. A reviewed downstream Supplier
mapping may translate those canonical facts into a Supplier Offer Variant
`specificationKey`. If that mapping cannot be proven, the Supplier consumer
must fail closed.

This decision resolves the Batch A authority stop gate. It does not implement
the snapshot repair, read port, or Supplier integration.

## Repository evidence

- `ConfiguredItemHandoff` carries `productId`, `variantId`, `skuCode`, and
  structured `selectedOptions`, together with configuration revision and
  bounded customization values. It is a browser claim that is revalidated by
  server boundaries.
- `ProductVariant` is the catalog authority for a purchasable variant. Its
  `selectedOptions` are explicit option/value IDs, and the catalog validator
  enforces Product ownership, required options, duplicate signatures, and one
  default variant.
- `canonicalVariantSignature()` sorts option IDs and encodes the complete
  option/value set. This supports more than one simultaneous product
  dimension without inventing a scalar specification key.
- The current `LocalOrderLineSnapshot` already preserves Product/Variant
  identity, Product name/slug, SKU code, selected options, quantity, pricing,
  currency, configuration revision/values, and safe image receipt/crop data.
  It still needs a server-generated `orderItemId` and must capture
  `fulfillmentType` at Order creation.
- `ProductFulfillmentConfig.fulfillmentType` is an explicit Catalog authority
  available before Order creation. It is not a Supplier mapping fact and is
  currently dropped before the Order snapshot is committed.

## Product Variant semantics

`ProductVariant.id`, `skuCode`, and `selectedOptions` identify the customer’s
accepted catalog choice. Option and value IDs are stable machine identities;
labels, prices, display names, and array positions are not substitutes. The
canonical snapshot should preserve the full structured selection, including
multiple dimensions such as size plus material where the Product defines them.

The customer Order therefore remains meaningful if the Supplier subsystem is
deleted: it still identifies the Product Variant and the exact catalog option
selection that was purchased.

## Supplier specification semantics

`SupplierOfferVariant.specificationKey` is attached to a Supplier Offer and
varies with Supplier, Offer, and supplier-specific variant terminology. The
current Supplier fixtures demonstrate keys such as `6cm`, `8cm`, `spray`,
`semi-hand-painted`, `black-matte`, and `300-pieces`; the same source product
can also have multiple Supplier Offers with different variant sets. The
Supplier domain constructs mapping keys from Product slug, SKU, and this
Supplier specification key.

If the Supplier subsystem were removed, these keys would no longer have a
customer-order meaning. That critical test therefore assigns ownership to the
Supplier mapping boundary, not to the canonical Local Order.

## Exact authority model

The future authoritative chain is:

```text
ProductVariant + SKU + selectedOptions + fulfillmentType
  -> validated Local Order creation
  -> immutable Canonical Local Order Item Snapshot
  -> LocalConfiguredItemReadPort
  -> reviewed Supplier mapping
  -> SupplierWorkOrder
```

The Local Order snapshot must add only the missing generic facts needed for
historical reading: a server-generated opaque `orderItemId` and
`fulfillmentType`. It must retain the existing Product/Variant/SKU/options and
configuration facts. It must not add `selectedSpecificationKey`.

`orderItemId` remains server-generated once at Order commit and is never
derived from cart line IDs or array position. `fulfillmentType` remains the
validated Product Catalog fact captured at that boundary. The read port returns
only canonical Order facts and does not read the current Catalog to rewrite
history.

## Required planning amendments

The planning artifacts are amended to:

1. replace the proposed canonical `selectedSpecificationKey` with explicit
   Product/Variant/SKU/`selectedOptions` preservation;
2. retain `fulfillmentType` as a separate Product Catalog fact captured at
   Order creation;
3. require Supplier mapping to resolve a Supplier Offer Variant only through
   an explicit reviewed mapping, with unavailable/fail-closed behavior when
   unresolved; and
4. prohibit inference of a Supplier key from labels, price, Product display
   text, array position, filename, current Catalog guesses, or supplier source
   labels.

Batch A’s original audit remains historical evidence that no upstream
`selectedSpecificationKey` exists today. This decision does not rewrite that
audit or claim implementation progress.

## Future Supplier compatibility contract

This prerequisite does not modify `build-local-supplier-production-operations`.
Before Supplier Batch F resumes, its later contract review must define how:

- `SupplierCandidateInput` receives canonical Product/Variant/SKU/options or
  an already-reviewed mapping result, rather than requiring a canonical
  Supplier key;
- `SupplierCatalogMapping` owns the explicit mapping key and review status;
- `SupplierOfferVariant.specificationKey` remains Supplier-local;
- `SupplierCandidate` carries the resolved Supplier identity and mapping
  result; and
- `SupplierAssignmentSnapshot` and `SupplierWorkOrder` consume the reviewed
  mapping without becoming the source of historical Order facts.

No Supplier ID, Offer, cost, warehouse state, assignment, or WorkOrder data is
added to the canonical configured-item authority in this change.

## Decision boundary

The architecture is resolved for planning. The next implementation work is
the minimum canonical Order snapshot repair followed by the read adapter.
Supplier mapping remains a downstream, separately reviewed capability.
