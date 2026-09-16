## Context

The canonical local chain already owns customer-facing Order, Payment,
Fulfillment, and Tracking boundaries. Local Fulfillment ends at `quality_check`
and Local Tracking begins only from that canonical state; neither boundary is
an internal supplier or warehouse system. This change therefore adds an
internal operational projection that reads approved Order/configuration facts
and never replaces an upstream authority.

The initial source is the user-provided supplier workbook named
`8-29FigMemento_供应商对接(1)(2).xlsx`. The locally readable date-matched copy
at planning time is `8-29FigMemento_供应商对接(1).xlsx`; the source filename,
sheet, row, URL, and raw value must be retained as provenance, and Batch A must
pin the reviewed source identity before fixture data is treated as stable.
The workbook has a `供应商对接` sheet with eight supplier records and a
`填写说明` sheet. It contains approximate weights, variant-specific prices,
production-only lead times, and several blank or scope-ambiguous cells.

## Goals / Non-Goals

**Goals:**

- Create a provider-neutral Supplier, offer, assignment, work-order, and
  Shanghai warehouse-receipt boundary for local operations.
- Normalize reviewed workbook information into deterministic, typed, stable
  local fixtures without reading XLSX files at request time.
- Match all explicitly eligible offers for a configured Product/SKU and leave
  the final supplier choice to an authorized operator.
- Preserve assignment and work-order snapshots so later offer edits cannot
  rewrite historical production economics.
- Provide a bounded, replayable, concurrency-safe internal lifecycle through
  `ready_for_outbound`.
- Keep supplier source data and operational costs private while exposing only
  the existing safe customer Order/Fulfillment/Tracking projections.

**Non-Goals:**

- No change to the existing customer Fulfillment lifecycle or Local Tracking
  entry gate.
- No supplier API, 1688/Taobao/Tmall integration, supplier messaging or
  supplier payment.
- No procurement, exact inventory, warehouse provider, carrier, shipping,
  production-preview, digital-delivery, payment, tax, or refund capability.
- No automatic cheapest-supplier selection, routing optimization, or full
  landed-cost/gross-margin accounting.
- No production Supabase schema, migration, durable production record,
  storage-provider choice, DNS, Cloudflare, or deployment work.

## Decisions

### 1. Keep Customer Fulfillment and Supplier Production Operations separate

The boundary is intentionally two-track:

```text
Canonical Local Order (paid/succeeded)
        │ fresh read of configured item and immutable facts
        ▼
Customer Fulfillment authority ── preview_approved → in_production → quality_check
        │ admission/coordination only
        ▼
Supplier Production Operations authority
  candidate → assignment → work order → supplier production → warehouse receipt/QC
        │ ready_for_outbound signal only; no automatic mutation
        ▼
Existing Local Tracking / Shipment boundary
```

Supplier states are never written into Customer Fulfillment. Work-order
generation requires a paid/succeeded canonical Order and at least
`preview_approved`; entering internal `in_production` additionally requires
the existing customer Fulfillment to be `in_production` or later. Reaching
`ready_for_outbound` does not create a Shipment or advance Tracking.

The alternative of adding `waiting_supplier` or `warehouse_received` to
Fulfillment was rejected because it would make internal operations the owner of
customer-visible lifecycle and break the archived Fulfillment/Tracking
contracts.

### 2. Use a local process-memory repository with provider-neutral interfaces

The first implementation will use stable local fixtures plus process-memory
repositories for Suppliers, Offers, Assignments, WorkOrders, Receipts, action
bindings, and operation history. It will follow the existing local runtime
pattern: explicit development/test source selection, server-only operator
authority, restart fail-closed behavior, and no browser persistence.

The implementation may expose interfaces that a later durable adapter can
implement, but no Supabase table or migration is created here. The local
selector follows the existing naming pattern as `LOCAL_SUPPLIER_SOURCE=local_fake`
and a separate operator authority; absent, invalid, or production activation
fails closed. The selector never authorizes an operator by itself.

This is preferred to writing directly to Supabase because the current upstream
Order/Fulfillment/Tracking local capabilities are process-memory and the
workbook facts still require business review. A direct production repository
would falsely imply durable supplier operations and bypass a later persistence
decision.

### 3. Normalize workbook records into stable source-backed fixtures

Batch A will create typed fixture data rather than a runtime XLSX reader. The
normalizer will preserve:

- stable supplier and offer IDs derived from a reviewed deterministic key;
- explicit FigMemento Product/SKU mapping, never raw-name fuzzy matching;
- one offer variant per source-backed size, material, method, piece count, or
  base option;
- source workbook filename, sheet, row, URL, raw price/weight/lead-time text,
  and an approval/provisional status;
- nullable dimensions and nullable cost/weight/lead-time values;
- `fixed`, `variant_fixed`, `area_based`, or `manual_quote_required` pricing
  basis.

The known source groups to represent conceptually are:

| Source group | Workbook capabilities | Planning treatment |
| --- | --- | --- |
| 金华市新烨供应链管理有限公司 | 3D人偶/手办, 3D宠物, 积木人, 积木宠物, 摇头娃娃 | Separate offers/variants; blank row-level warehouse or variant facts remain unresolved. |
| 泉州市品冠艺术文化有限公司 | 3D宠物 6/8/10cm, 摇头娃娃 6/8/10cm | Separate size variants and weights; both product families require explicit catalog mapping. |
| 福州祝安鼠电子商务有限公司 | 宠物纪念3d水晶 and lamp-base variants | Preserve base variants and approximate packaged weight; do not flatten base choices. |
| 福建盈浩文化创意股份有限公司 | 喷绘, 半手绘, 肌理打印 portrait work | Use method variants and area-based/manual-quote pricing. |
| 淘宝店 菠萝荔枝 | Phone-case type variants | Preserve black matte, transparent, and space-mirror variants and approximate packaged weight. |
| 淘宝店 百纹美旗舰店 | Temporary tattoo, 18×28cm source row | Preserve the known size and leave other sizes unmapped. |
| 玩布客旗舰店 | Puzzle 300/500/1000 pieces and frame add-ons | Separate piece-count variants; frame pricing is not a product SKU unless separately mapped. |
| 麦子创意礼品玩具店 | Wood engraving 6/8/10 inches | Separate size variants and packaged weights. |

The workbook does not provide digital production cycles. The seven current
physical Products without sufficient mapping or evidence, the three digital
Products, and any supplier duplicates such as 3D pet or bobblehead remain
missing/ambiguous until reviewed. The source workbook is not copied into the
runtime bundle solely to avoid provenance confusion.

### 4. Model the operational entities around immutable references and snapshots

The normalized domain contains:

- **Supplier**: stable internal identity, display/platform/source provenance,
  active status, warehouse capability, video capability, return/rework policy,
  notes, and timestamps.
- **SupplierOffer**: one Supplier plus one explicit Product/SKU mapping and
  production capability, with active state, production-only lead range,
  warehouse eligibility, source provenance, and notes.
- **SupplierOfferVariant**: source-backed variant key/label, cost/currency,
  packaged weight, optional dimensions, surcharge, raw value, pricing basis,
  and approval state.
- **SupplierAssignment**: one canonical Order-item production unit, selected
  Supplier/Offer/Variant references, assignment action binding, and immutable
  supplier facts captured at assignment time.
- **SupplierWorkOrder**: fresh canonical Order/configuration input plus the
  assignment snapshot, approved-preview marker, production target, and
  Shanghai destination indicator. Private media is represented by authorized
  internal identifiers only.
- **WarehouseReceipt**: work-order/assignment reference, received quantity and
  time, discrepancy, damage, QC result, notes, and ready-for-outbound result.

No entity copies mutable Catalog data as a second authority. Existing immutable
Order-item facts remain owned by Local Order; supplier snapshots protect the
internal operational history.

### 5. Make candidate matching explicit, complete, and operator-selected

Candidate matching takes a fresh canonical configured-item read and projects a
`CanonicalSupplierSelection` containing `productId`, `productSlug`, the
catalog Variant identity (`catalogVariantId`, sourced from the current
reader's canonical `variantId`), `skuCode`, the exact `selectedOptions` set,
canonical quantity where relevant, `fulfillmentType`, and the physical/
Shanghai requirement. `selectedOptions: []` is a valid exact identity for a
Variant with no dimensions. It does not take a canonical
`selectedSpecificationKey`, Supplier ID, SupplierOffer identity, Supplier
price, display label, or current Catalog object as input authority.

It returns every active offer/variant with an explicit approved structured
mapping, valid required evidence, compatible production method/specification,
and Shanghai eligibility when required. The mapping compares exact machine
identities and the exact option set; it never chooses a supplier.

If mapping or source evidence is ambiguous, the result is review-required and
cannot be assigned. This includes the duplicated 3D pet and bobblehead
supplier records; the operator must select after the mapping is clarified. A
price comparison is an operator aid, not a selection rule. The current
normalized fixtures have zero approved mappings, so no real candidate is
assignable under this amendment.

#### Model C identity rule

The Supplier-facing contract must distinguish the catalog Variant identity as
`catalogVariantId`, the SupplierOfferVariant identity as
`supplierOfferVariantId`, and the Supplier-local source key as
`supplierSpecificationKey`. The existing
`SupplierOfferVariant.specificationKey` remains valid Supplier-owned data; the
compatibility repair must not delete it or reinterpret it as an Order fact.

### 5A. Model C compatibility amendment: consume historical facts upstream

The current canonical read port already preserves the stable Local Order item
identity, Product/SKU identity, catalog Variant identity, exact selected
options, quantity, fulfillment type, configuration revision, and bounded
customization values. The compatibility gap is downstream: the existing
Supplier candidate and WorkOrder contracts still expect a scalar
`selectedSpecificationKey` and use ambiguous bare `variantId` names.

The narrow repair is to adapt the existing canonical read projection into the
explicit `CanonicalSupplierSelection` above and make the Supplier mapping
output explicit. It is not an Order snapshot rewrite and must not reread
current Catalog data. Missing or incomplete canonical evidence remains
unavailable; no specification is reconstructed from labels, prices, names,
filenames, array positions, Supplier mapping, or browser payloads.

The planned data flow is:

```text
ConfiguredItem
  → Cart / Checkout handoff
  → Canonical Local Order Item Snapshot
  → LocalConfiguredItemReadPort
  → CanonicalSupplierSelection
  → explicit approved SupplierCatalogMapping
  → SupplierOfferVariant
  → SupplierCandidate
  → explicit SupplierAssignment
  → SupplierWorkOrder
```

`SupplierWorkOrder` consumes two immutable server-owned sources: the canonical
read port for customer selection, Order/item identity, exact options, and
configuration/media facts; and the committed assignment snapshot for
Supplier-owned identities and production facts. It must not decide “probably
6cm” at WorkOrder creation time. The existing unavailable
`workOrderPorts().configuredItems` seam will be connected only after this
compatibility repair is implemented and reviewed.

### 6. Gate work orders on existing approved customer state

The service re-resolves Local Order and Customer Fulfillment before creating a
work order. It accepts only `paid`/`succeeded` Order state, an existing
configured item, a committed assignment, and customer Fulfillment at
`preview_approved` or later. The work order captures only fields already
present in the canonical Order/configuration snapshot, including any existing
text, style, pose, clothing, people/pets, notes, and approved preview
reference. Missing fields remain absent.

The supplier operation does not start customer preview review, modify Order
facts, create a second Order, or mutate the Customer Fulfillment state. This
fresh-read gate prevents a stale operator page from creating production work
for an unpaid, cross-Order, or unapproved item. Production-unit identity will
use the canonical Local Order `orderItemId`; it must not be synthesized from
an array index, cart line position, or SKU alone.

### 7. Use the exact bounded internal lifecycle

The lifecycle is:

```text
unassigned
  → assigned
  → work_order_ready
  → submitted_to_supplier
  → supplier_confirmed
  → in_production
  → supplier_completed
  → en_route_to_warehouse
  → warehouse_received
  → warehouse_qc
  → ready_for_outbound (terminal)
```

Only consecutive forward transitions are allowed. Each transition is an
operator mutation with a separate opaque supplier operation action identity.
`warehouse_qc` records discrepancy/damage/QC facts; only an accepted bounded
QC outcome can reach `ready_for_outbound`. No return, cancellation, loss,
reshipment, refund, or exception state is added.

### 8. Preserve production-only cost, lead-time, and weight semantics

Supplier cost uses the source pricing basis and may be unknown. Existing
customer revenue remains a separate read-only Order fact. Known supplier cost
can be compared with revenue, but estimated logistics, landed cost, fees,
duties, warehouse cost, and gross margin stay null/unavailable when inputs are
missing.

Lead time is `minProductionBusinessDays` and
`maxProductionBusinessDays`, explicitly excluding international transit,
customs, and customer delivery. Packaged weight is the standard packed
shipping weight. Approximate values retain their raw wording and approval
state; dimensions remain nullable. No field is rendered as a delivery ETA.

### 9. Reuse server-only local operator authority and safe projections

The likely internal route is `/local-suppliers/operator`, aligned with the
existing `/local-fulfillment/operator` and `/local-tracking/operator` routes.
It will show supplier list, offer comparison, assignment, production queue,
warehouse queue, and bounded failure states. It will reuse the existing
server-only operator verification seam where compatible; runtime enablement is
not authorization.

Customer routes keep their current safe projections. Operator projections may
show supplier and cost data needed for local work, but never raw capabilities,
credentials, storage keys, private locators, SQL diagnostics, or unapproved
customer-private content. Customer views never show supplier URLs, supplier
costs, sourcing platforms, assignments, or warehouse notes.

### 10. Commit mutations atomically with replay-first ordering

The local aggregate owns action bindings, assignment uniqueness, work-order
creation, lifecycle state, receipt, QC fields, and history. After operator and
canonical identity authorization, an exact action binding is resolved before
new-state validation. Exact replay returns the original result. Reusing an
action ID with different normalized input returns a bounded conflict.

The aggregate's final decision/commit remains synchronous, as in existing local
runtime repositories. Deterministic tests will queue Promise/microtask calls to
prove that concurrent distinct actions observe the latest canonical state. No
lock library, artificial delay, second Order map, or stale cache is introduced.

### 11. Keep the provider seam future-ready but inactive

Provider-neutral interfaces may later accept a real supplier, warehouse, or
shipping adapter, but this change implements no adapter and no network call.
Any future integration must provide its own authority, credentials, retry,
privacy, and deployment review in a separate OpenSpec change.

## Risks / Trade-offs

- **[Risk] Workbook rows use approximate, merged, or blank values.** → Keep raw
  source text, scope, approval status, and nulls; block candidate/assignment
  when a required fact or mapping is unresolved.
- **[Risk] Multiple suppliers encourage accidental cheapest-supplier policy.**
  → Return all eligible candidates and require an explicit operator selection;
  never derive business authority from a sort order.
- **[Risk] Supplier operations drift from customer Fulfillment.** → Use fresh
  paid/approved gates, a separate state machine, and no writes to upstream
  customer lifecycle.
- **[Risk] Internal data leaks through public routes or errors.** → Separate
  projections, authenticate before privileged construction, and apply bounded
  error mapping with no locators or SQL details.
- **[Risk] Process-memory state is mistaken for durable operations.** → Label
  all local surfaces as development/test-only and fail closed after restart.
- **[Risk] Work-order generation exposes private customer assets.** → Store
  only authorized internal references and defer final storage/provider choice.
- **[Risk] Upstream local runtime remains incomplete in production.** → Keep
  this change dependent on canonical Local Order/Payment/Fulfillment boundaries
  and stop before remote Supabase, migrations, or deployment.

## Migration Plan

No database migration or data backfill is part of this change. Apply creates
local domain contracts, normalized fixtures, process-memory repositories and
services, offline tests, and an internal local operator surface. Verification
uses the existing offline/typecheck/lint/build/rendered gates and a disposable
local runtime if needed. A rollback removes only the new local supplier
operations files and leaves Catalog, Local Order, Payment, Fulfillment,
Tracking, and archived acceptance evidence unchanged.

## Open Questions

- The exact reviewed workbook identity must be pinned before Batch A: the
  requested `(1)(2).xlsx` name was not present locally during planning, while
  the date-matched `(1).xlsx` copy was readable.
- Business owners must approve ambiguous Product/SKU mappings, approximate
  values, and the scope of warehouse eligibility before those facts become
  assignable candidates.
- A later change must decide durable persistence and the production supplier,
  warehouse, storage, shipping, and logistics providers; this change does not
  preselect them.
