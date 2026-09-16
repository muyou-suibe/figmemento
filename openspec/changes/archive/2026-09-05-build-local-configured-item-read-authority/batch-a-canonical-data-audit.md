# Batch A — Canonical Data Audit and Contracts

## Status

`BLOCKED AT TASK 1.4 — AUTHORITATIVE selectedSpecificationKey SOURCE MISSING`

This document records the actual TypeScript lineage audit for
`build-local-configured-item-read-authority`. It does not repair the Local
Order snapshot, implement a read adapter, or reconnect Supplier Batch F.

## Actual data flow

```text
PDP configured-item draft
  -> ConfiguredItemHandoff
  -> StoredCartLine (handoff + server-accepted snapshot)
  -> fresh Local Checkout evaluation
  -> Local Order creation draft
  -> LocalOrderLineSnapshot
  -> future LocalConfiguredItemReadPort
  -> future SupplierWorkOrder consumer
```

The browser handoff is a claim boundary. `acceptConfiguredItemHandoff` and the
Checkout evaluator revalidate the Product, Variant, customization authority,
and upload ownership before Order creation.

| Fact | PDP / handoff | Cart | Checkout | Order request / creation | Stored Order line | Classification |
| --- | --- | --- | --- | --- | --- | --- |
| `productId` | `ConfiguredItemHandoff.productId` | handoff + snapshot | re-resolved and compared | `ResolvedOrderCatalogItem` / draft | explicit | client claim, then server-validated canonical fact |
| `variantId` | handoff | handoff + snapshot | re-resolved and compared | resolved item / draft | explicit | client claim, then server-validated canonical fact |
| `productSlug` | absent from handoff | server-accepted snapshot | compared against current Catalog | resolved item / draft | explicit | derived from server Catalog before commit, then historical |
| `skuCode` | handoff | handoff + snapshot | re-resolved and compared | resolved item / draft | explicit | client claim, then server-validated canonical fact |
| `quantity` | absent from handoff | `StoredCartLine.quantity` | normalized server-side | resolved quantity / draft | explicit | Cart-owned transient, then server-accepted canonical fact |
| `selectedOptions` | handoff | handoff + snapshot | re-resolved and compared | resolved variant / draft | explicit | client claim, then server-validated canonical fact |
| `configurationRevision` | handoff | handoff + customization summary | accepted against field authority | handoff values / draft | explicit under `customization` | client claim, then server-validated canonical fact |
| configuration values | handoff | protected handoff + safe summary | accepted and receipt-checked | handoff values / draft | explicit under `customization` | client claim, then server-validated canonical fact |
| image `receiptId` | customization value | protected handoff/summary | owner and lifecycle checked | handoff values / draft | safe explicit receipt reference | server-validated safe media fact |
| image crop | customization value, if present | protected handoff/summary | carried through acceptance | handoff values / draft | bounded crop in customization | server-validated safe media fact |
| `selectedSpecificationKey` | absent | absent | absent | absent | missing | no upstream authority found |
| `fulfillmentType` | not in handoff; explicit in Catalog detail | absent from line snapshot | available in Product Catalog detail but not line summary | dropped before `createSnapshotDraft` | missing | explicit Catalog authority exists, but not persisted |
| cart `lineId` | absent | generated cart-local ID | transient evaluator identity | not promoted to Order identity | absent | transient, not canonical Order identity |
| stable `orderItemId` | absent | absent | absent | not generated | missing | canonical gap; Batch B only |

## Source files and validation points

### ConfiguredItem and Cart

- `app/domain/configured-item.ts`: `ConfiguredItemHandoff` contains
  `productId`, `variantId`, `skuCode`, `selectedOptions`,
  `configurationRevision`, and `customizationValues`; it explicitly is not
  purchase authority.
- `app/application/shopping-cart-service.ts` and
  `app/infrastructure/cart/local-memory-shopping-cart-provider.ts`: the Cart
  stores the protected handoff, a server-accepted Product/Variant/SKU snapshot,
  quantity, customization summary, and a generated cart-local `lineId`.
- `app/application/local-checkout-evaluator.ts`: Checkout freshly validates the
  handoff and current Catalog, then returns a line summary with Product,
  Variant, SKU, options, price/currency, quantity, and cart `lineId`; it does
  not return specification identity or fulfillment type.

### Local Order

- `app/application/local-order-creation.ts`: `createSnapshotDraft()` writes
  Product/Variant/SKU, slug, selected options, quantity, unit price, currency,
  line subtotal, configuration revision, and values. It does not write
  `orderItemId`, `selectedSpecificationKey`, or `fulfillmentType`.
- `app/domain/local-order.ts`: `LocalOrderLineSnapshot` has the same preserved
  facts and safe customization values, but no stable per-line identity or
  specification/fulfillment fields.
- `app/infrastructure/local-order/local-memory-local-order-repository.server.ts`:
  one `ordersByInternalId` Map is the canonical process-memory Order store. It
  generates Order identity and browser capability, but no per-line identity.
  Existing fulfillment reads return a cloned whole Order snapshot; they do not
  provide a configured-item read port.

## Order-item identity decision

Current candidates do not qualify:

- Cart `lineId` is scoped to the Cart and is not copied into the Order.
- Product ID identifies a Product, not one ordered line.
- Variant ID and SKU identify catalog choices, not one committed unit.
- Array position is unstable under reordering and ambiguous for duplicate
  Product lines.

The canonical rule is therefore locked for Batch B design, but not implemented
here: each committed Local Order line receives one opaque server-generated
`orderItemId` exactly once at Order creation. It must be unique across
committed lines, stable after commit, distinct for duplicate Products, and
unselectable by the browser. Replaying the same committed Order must not create
another historical identity.

## Specification authority — STOP-GATE RESULT

**MISSING — authoritative source not found.**

The only current `selectedSpecificationKey` fields are in
`app/domain/supplier-operations.ts` and `app/domain/supplier-work-order.ts`.
They describe downstream Supplier Offer / WorkOrder matching and are not an
upstream configured-item or Order authority. No corresponding field exists in
`ConfiguredItemHandoff`, `ProductVariant`, Product customization configuration,
Checkout line summaries, Order request types, or Local Order snapshots.

`selectedOptions` contains exact option/value IDs, but it is not silently
reinterpreted as the supplier-facing specification identity required by the
WorkOrder boundary. No display label, size text, price, supplier mapping, or
current Catalog lookup after Order creation qualifies.

The first missing point is the upstream configured-item/catalog-to-Order
boundary: the explicit machine identity is never present before Local Order
commit. Task 1.4 therefore returns decision **B — AUTHORITATIVE SOURCE
MISSING**. No new semantic mapping is invented in Batch A.

## Fulfillment authority

**FOUND — explicit pre-Order source exists, but it is currently lost before the
Order snapshot.**

- Type: `ProductFulfillmentConfig`
- Field: `fulfillmentType: "physical" | "digital"`
- Source: `app/domain/catalog/fulfillment.ts`
- Catalog boundary: `PublicCatalogProductDetail.fulfillment` in
  `app/application/catalog-repository.ts`
- Validation: `parseProductFulfillmentConfig` /
  `validateProductFulfillmentConfig`, plus Product ownership and fulfillment
  validation in `evaluatePublicEligibility` in
  `app/domain/catalog/eligibility.ts`
- Order path: `resolveOrderCatalogItem()` receives the validated Product detail,
  but `ResolvedOrderCatalogItem`, `LocalCheckoutLineSummary`, and
  `createSnapshotDraft()` omit `fulfillmentType` before commit.

This is an explicit Catalog authority available before Order creation, not a
historical fact yet. Batch B must capture it rather than reread Catalog later.

## Read-port contract locked for later implementation

Batch A defines, but does not implement, the following server-only contract:

```ts
interface LocalConfiguredItemReadPort {
  findConfiguredItem(input: {
    internalOrderId: string;
    publicOrderReference: string;
    orderItemId: string;
  }):
    | { status: "found"; item: ImmutableConfiguredItemOrderSnapshot }
    | { status: "unavailable" };
}
```

The future reader must cross-check the internal Order ID and public reference,
then match the stored `orderItemId` exactly. Public reference is an identifier,
not authorization. Wrong Order, wrong item, missing identity, malformed
snapshot, or incomplete specification evidence returns bounded `unavailable`
without exposing cross-Order existence. No partial result is allowed.

The found projection is limited to canonical Order identity, order item
identity, Product/Variant/SKU facts, Product slug/name where stored, quantity,
explicit specification identity, fulfillment type, selected options,
configuration revision/values, and safe media receipt/crop references.

## Safe media and privacy

Allowed for the future internal projection:

- customer-upload receipt ID already present in canonical customization values;
- bounded crop coordinates already present in the existing crop model.

Forbidden:

- signed URLs;
- storage bucket names;
- raw object/storage keys;
- Supabase/provider locators;
- filesystem paths;
- browser capability tokens;
- auth/session secrets;
- unrelated contact, payment, or owner data.

Existing customer-safe Local Order projections remain separate and continue to
avoid protected upload details.

## Legacy, immutability, and supplier boundary

Older snapshots lacking `orderItemId`, `selectedSpecificationKey`, or
`fulfillmentType` remain readable through existing customer-safe Order paths,
but the future configured-item production reader must return `unavailable`.
There is no backfill, default, inference, or array-index fallback.

After Order creation, Catalog, Product, customization, pricing, and supplier
changes must not rewrite the snapshot. SupplierWorkOrder may consume the future
read port only after this prerequisite is implemented and reviewed. This batch
does not modify `build-local-supplier-production-operations`,
`LocalSupplierOperatorService.workOrderPorts()`, or SupplierWorkOrder.
