## Context

See `proposal.md` for the motivation. The repository currently has one
process-memory canonical Local Order store and immutable line snapshots, but
SupplierWorkOrder admission has no real configured-item reader: its current
`workOrderPorts()` seam returns `unavailable` for every configured-item lookup.

The existing flow is:

```text
PDP ConfiguredItem
  -> Cart / Checkout handoff
  -> canonical Local Order creation
  -> immutable Local Order line snapshot
  -> future LocalConfiguredItemReadPort
  -> SupplierWorkOrder
```

The browser handoff is a claim boundary. `ConfiguredItemHandoff` currently
contains Product/Variant/SKU identity, selected options, configuration revision,
and bounded customization values. The Cart line adds a cart-local `lineId`,
historical Product display/price/currency fields, quantity, and a safe
customization summary. Neither cart `lineId` nor the handoff becomes a
canonical Order item identity.

At Order creation, the current `LocalOrderLineSnapshot` preserves Product and
Variant identity, Product name/slug, SKU code, selected options, quantity, unit
base price, currency, and configuration revision/values. Image values preserve
safe receipt IDs and bounded crop data. It does not currently preserve a stable
per-line `orderItemId` or the `fulfillmentType` needed to prove the
physical/digital production boundary. `selectedSpecificationKey` is not an
upstream customer/catalog fact: it exists in the Supplier Offer mapping domain
and is intentionally not a Local Order field. Array position is therefore not
a permissible identity.

## Goals / Non-Goals

**Goals:**

- Capture the minimum missing immutable facts at Local Order creation, while
  preserving the explicit Product/Variant/SKU/selected-option machine
  selection already accepted by the catalog boundary.
- Expose one narrow server-side read port over the existing canonical Order
  repository.
- Make exact Order ownership and missing-evidence behavior fail closed.
- Keep historical reads independent of current Catalog state.
- Give SupplierWorkOrder a generic downstream seam without moving authority to
  supplier operations.

**Non-Goals:**

- No Supplier Batch F implementation or task-state change.
- No customer Cart, Checkout, Order Success, Fulfillment, or Tracking redesign.
- No new durable database, migration, remote Supabase operation, storage
  provider, or filesystem persistence.
- No new personalization fields, supplier mapping, browser authority, or
  production deployment behavior.

## Decisions

### 1. Choose minimum immutable Order-snapshot augmentation plus an adapter

The chosen architecture is **B**: extend the canonical Local Order item
snapshot only where the audit proves a required fact is missing, then expose a
read adapter over that same repository.

The existing-state-only adapter (**A**) cannot prove stable item identity or
fulfillment classification. A SupplierWorkOrder-time reconstruction would be
too late and would allow Catalog or supplier drift to change historical meaning.
The Order creation boundary is the last authoritative point at which the
accepted configured item can be captured. A Supplier specification key is
different: it is a Supplier mapping fact and must be resolved downstream by a
reviewed mapping, not forced into the customer Order.

The extension is limited to explicit facts: an opaque server-generated
`orderItemId` and the `fulfillmentType` required to distinguish physical from
digital production. The existing Product/Variant/SKU and complete
`selectedOptions` set are the canonical customer selection and must be retained
without reinterpretation. A downstream Supplier mapping may resolve its own
`SupplierOfferVariant.specificationKey` only from an explicit reviewed mapping;
the absence of such a mapping fails closed and never causes the Order to gain a
guessed key.

### 2. Keep one canonical Order store

`LocalMemoryLocalOrderRepository` remains the sole local Order store. The new
adapter reads a cloned immutable `LocalOrderSnapshot` through the existing
repository boundary and filters its lines by exact identity. It must not add a
second Order map, a ConfiguredItem cache, a supplier copy, or a stale lifecycle
cache.

### 3. Use an opaque server-generated per-line identity

At Local Order creation, each committed line receives one opaque stable
`orderItemId`. It is generated once as part of Order creation and then stored in
the line snapshot. Re-evaluation, request retries, line order, and duplicate
Products must not regenerate or reuse it for another committed line. The exact
identifier format remains an implementation detail; array position and cart
`lineId` are explicitly excluded.

### 4. Require explicit canonical selection and fulfillment facts

The reader's found projection includes the Product/Variant identity, approved
SKU code, complete structured `selectedOptions`, and `fulfillmentType` only
when those facts were accepted by server-side boundaries before the Order
snapshot was committed. No scalar `selectedSpecificationKey` is required in
the canonical Order. A reviewed downstream Supplier mapping may translate the
canonical selection into a Supplier-local specification key; unresolved or
ambiguous mapping is unavailable to that downstream consumer.

### 5. Define an exact, non-public read contract

Conceptually, the server-only port is:

```ts
type LocalConfiguredItemRead =
  | { status: "found"; item: ImmutableConfiguredItemOrderSnapshot }
  | { status: "unavailable" };

interface LocalConfiguredItemReadPort {
  findConfiguredItem(input: {
    internalOrderId: string;
    publicOrderReference: string;
    orderItemId: string;
  }): LocalConfiguredItemRead;
}
```

`ImmutableConfiguredItemOrderSnapshot` contains only canonical facts: Order
identity, `orderItemId`, Product/Variant identity, Product slug/name where
stored, SKU code, quantity, `fulfillmentType`, complete selected options,
configuration revision/values, and safe image receipt/crop references. It is
the input to a later reviewed Supplier mapping, not a Supplier mapping result.
The adapter first resolves the internal Order, cross-checks the
public reference against that same snapshot, then finds the stored
`orderItemId`. Any missing, malformed, or mismatched evidence returns
`unavailable` without an existence oracle.

The port is server-only. Public Order references remain identifiers rather than
authorization, and any future privileged consumer must establish its own
authority before calling the port.

### 6. Preserve safe media and customer projections

The existing receipt ID/crop representation is the only media information the
new snapshot may carry. No signed URL, bucket, storage key, provider locator,
or browser token is added. Existing customer-safe Order projections continue
to omit protected upload details; the internal read projection is not exposed
to client components.

### 7. Handle old snapshots without reconstruction

Older in-memory/test snapshots that lack the new fields remain valid inputs to
existing Local Order read paths. The new authority returns `unavailable` for
those records. There is no migration, backfill, default specification key, or
array-index fallback in this change.

### 8. Downstream Supplier mapping and SupplierWorkOrder seam

After this capability is implemented and separately reviewed, Supplier Batch F
may inject the adapter into `workOrderPorts().configuredItems`. A later,
separately reviewed Supplier mapping layer must accept the canonical Product,
Variant, SKU, and selected-option facts and explicitly resolve a
`SupplierCatalogMapping` / `SupplierOfferVariant.specificationKey`. Supplier
mapping failure is unavailable; it is never repaired by rereading current
Catalog data or guessing from labels. The supplier aggregate will consume the
immutable projection plus any reviewed mapping and still apply its own
paid/succeeded, physical, assignment, and lifecycle checks. This planning
change does not reconnect or modify the supplier change.

### 9. API, persistence, and external-service boundaries

No public HTTP contract is introduced by this planning change. The future
implementation is an internal server/application port over process-memory
Local Order state. No database entity, migration, Supabase query, external
provider, or file persistence is added.

## Risks / Trade-offs

- **[Supplier mapping boundary]** → Preserve explicit canonical
  Product/Variant/SKU/selected-option facts in the Order, and require a reviewed
  Supplier mapping for a Supplier-local specification key; unresolved mapping
  fails closed rather than changing historical Order semantics.
- **[Legacy snapshots cannot be produced for supplier operations]** → Return
  bounded unavailable for the new port while preserving existing customer-safe
  Local Order reads.
- **[Process-memory lifetime]** → Keep this capability local-first and make
  restart loss explicit; do not pretend it is production persistence.
- **[Internal projection overexposure]** → Keep the port server-only, return a
  minimal projection, and retain separate caller authorization.
- **[Duplicate configured lines]** → Generate one identity per committed line
  at Order creation and test duplicate Products with distinct snapshots.

## Migration Plan

There is no database migration or remote rollout. The implementation sequence is
local-only: first verify the audit/contracts, then extend the Order creation
snapshot, implement the read adapter, and run focused regression tests. Rollback
means removing the unshipped local capability from the working tree; older
Order snapshots remain readable through existing paths and are unavailable to
the new authority. Do not backfill old records in this change.

## Open Questions

None. The implementation must fail closed if the repository cannot provide the
explicit canonical Product/Variant/SKU/selected-option selection or fulfillment
classification at the upstream Order-creation boundary. A missing Supplier
mapping is a downstream unavailable result, not a reason to invent a canonical
Order specification key.
