# Supplier Model C Compatibility Amendment

## Status

This is a planning-only compatibility amendment for
`build-local-supplier-production-operations`. Supplier progress remains
`21/32`; tasks `6.2`–`8.4` remain unchecked. It does not reconnect or resume
Supplier Batch F.

The original Supplier Batches A–E remain valid historical work under the
earlier contract. This document records the narrower Model C contract repair
needed after the canonical configured-item read authority became available; it
does not reclassify that earlier work as a failure.

## Current canonical data flow audit

The current server-owned flow is:

```text
PDP ConfiguredItem
  → Cart/configured-item handoff
  → Checkout normalization
  → canonical Local Order line snapshot
  → LocalConfiguredItemReadPort
```

The canonical read projection currently carries the committed `internalOrderId`,
`publicOrderReference`, `orderItemId`, `productId`, `productName`,
`productSlug`, the canonical catalog variant identity currently exposed as
`variantId`, `skuCode`, exact `selectedOptions`, `quantity`,
`fulfillmentType`, `configurationRevision`, and bounded `customizationValues`.
It intentionally does not carry a canonical `selectedSpecificationKey`.

The first compatibility gap is therefore not missing Order persistence. It is
that the existing Supplier matching and WorkOrder contracts still treat the
bare `selectedSpecificationKey` as if it were a canonical Order fact, while
the canonical reader provides exact catalog identity and selected options
instead. The existing Supplier `variantId` names are also ambiguous: some
refer to a SupplierOfferVariant while a Local Order line's `variantId` refers
to the catalog Variant.

## Model C canonical input

The amended Supplier matching boundary SHALL consume a fresh server-owned
`CanonicalSupplierSelection` derived from `LocalConfiguredItemReadPort`:

- `productId`
- `productSlug`
- `catalogVariantId` (the disambiguated Supplier-facing name for the current
  canonical reader's catalog `variantId`)
- `skuCode`
- the exact `selectedOptions` set, including `[]` when the catalog Variant
  has no dimensions
- `fulfillmentType`
- canonical `quantity` where production-unit quantity is required

It SHALL also receive the required physical/Shanghai production context, but
it SHALL NOT receive a canonical `selectedSpecificationKey`, Supplier ID,
SupplierOffer ID, SupplierOfferVariant ID, Supplier price, display label, or
current Catalog object as an identity shortcut.

## Mapping authority

Supplier matching SHALL use an explicit, approved structured mapping from the
canonical Product/SKU/catalog Variant and exact option set to a
`SupplierOfferVariant`. No fuzzy matching, label matching, price matching,
Product-name matching, filename matching, array-position matching, current
Catalog reread, or Supplier-provided guess may establish authority.

The current normalized Supplier fixtures contain zero approved mappings. No
fixture is added by this amendment. Unresolved, ambiguous, inactive, digital,
or unsupported warehouse cases remain `review_required`/unavailable and do
not become candidates through a cheapest-price rule.

## Supplier identity and specification

The amended Supplier-facing naming MUST distinguish:

| Boundary | Identity | Meaning |
| --- | --- | --- |
| Catalog/Order | `catalogVariantId` | FigMemento catalog Variant committed in the canonical Order item |
| Supplier offer | `supplierOfferVariantId` | SupplierOfferVariant selected from an explicit approved mapping |
| Supplier source | `supplierSpecificationKey` | Supplier-local size/material/method/piece-count key |

The existing `SupplierOfferVariant.specificationKey` is a legitimate
Supplier-owned field. It must be preserved and may be renamed or aliased only
inside the future Supplier-facing contract to make ownership explicit. It is
not a canonical Order fact and must not be deleted globally.

## Assignment and WorkOrder boundary

SupplierAssignment SHALL snapshot the selected Supplier-owned identities and
facts, including `supplierOfferVariantId` and `supplierSpecificationKey`,
without replacing the canonical catalog identity. A WorkOrder will consume two
immutable server-owned sources:

1. the canonical configured-item reader for Order/item identity, catalog
   Product/SKU/Variant, quantity, exact selected options, fulfillment, and
   committed configuration/media facts; and
2. the committed SupplierAssignment snapshot for Supplier, offer, Supplier
   Offer Variant, Supplier-local specification, cost, weight, lead time, and
   provenance.

The WorkOrder MUST NOT decide that an item is “probably 6cm,” derive a
Supplier specification from a display label or price, or ask the browser to
carry configuration authority. Future production unit identity must use the
canonical Local Order `orderItemId`; it must not be synthesized from an array
index, cart line position, or SKU alone.

The existing `workOrderPorts().configuredItems` unavailable seam remains a
future integration point. This amendment does not implement or reconnect it.

## Compatibility and scope gates

- Existing Local Order and `LocalConfiguredItemReadPort` authority remains
  unchanged.
- Existing customer Cart, Checkout, Order, Fulfillment, and Tracking behavior
  remains unchanged.
- Supplier operations remain generic and do not add Supplier IDs, offers,
  costs, warehouse state, or assignments to the canonical configured-item
  authority.
- No Supplier mapping is treated as production-approved without explicit
  business review.
- No application code, tests, fixtures, migration, Supabase, provider,
  deployment, or Supplier Batch F task state is changed by this planning
  amendment.
