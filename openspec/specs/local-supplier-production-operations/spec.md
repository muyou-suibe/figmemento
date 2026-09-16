# local-supplier-production-operations Specification

## Purpose
Provide a local-only internal supplier and production-operations boundary that
can turn an approved paid configured item into an auditable supplier assignment,
work order, Shanghai warehouse receipt, and ready-for-outbound projection while
keeping customer Fulfillment, Tracking, and production-provider authority
separate.
## Requirements
### Requirement: Supplier master is internal and source-backed

The local Supplier master SHALL represent a supplier or factory with a stable
internal identity, display name, platform, source URL when available, active or
inactive status, Shanghai-warehouse capability when explicitly evidenced,
video capability, return or rework policy, notes, timestamps, and source
provenance. Supplier records SHALL NOT be exposed through customer-facing
projections, and a missing source fact SHALL remain unknown rather than being
invented.

#### Scenario: Supplier fixture is normalized
- **WHEN** a reviewed supplier source row is converted into a local fixture
- **THEN** the fixture has a stable supplier identity and preserves the source
  reference and raw unresolved facts without requiring the workbook at runtime

#### Scenario: Supplier source fact is missing
- **WHEN** the source does not establish a supplier capability or policy
- **THEN** the normalized record keeps that fact null or explicitly unknown and
  no operator or customer view presents a guessed value as authoritative

#### Scenario: Customer reads a product projection
- **WHEN** a customer reads Product, Order, Fulfillment, or Tracking data
- **THEN** supplier names, sourcing platforms, source URLs, supplier notes,
  costs, and assignments are absent

### Requirement: Supplier offers map explicitly to catalog identity

Each SupplierOffer SHALL belong to exactly one Supplier and SHALL carry an
explicit mapping to the canonical FigMemento Product/SKU/catalog Variant and
exact selected options where applicable, or to an explicitly reviewed
SupplierCatalogMapping that identifies those canonical facts. The mapping may
reference the canonical customer selection, but SupplierOffer and
SupplierOfferVariant remain Supplier-owned records. In particular,
`SupplierOfferVariant.specificationKey` is a Supplier-local specification key,
not a canonical Order `selectedSpecificationKey`. The offer SHALL also carry
product type, production method when applicable, active or inactive status,
production-only lead-time range, Shanghai-warehouse eligibility, source
reference, and notes. A raw supplier product label, customer price, or name
similarity SHALL NOT by itself establish a catalog mapping.

#### Scenario: Explicit offer mapping is accepted
- **WHEN** an operator or fixture supplies a reviewed Product/SKU/catalog
  Variant/selected-options mapping for a supplier capability
- **THEN** the offer can be considered for candidate matching under its active,
  physical, lead-time, and warehouse constraints

#### Scenario: Unmapped supplier label is inspected
- **WHEN** a workbook row names a product that has no explicit FigMemento
  Product/SKU mapping
- **THEN** the row remains an unmapped source record and cannot silently become
  a supplier candidate

#### Scenario: Inactive offer is queried
- **WHEN** an inactive SupplierOffer is queried for a production assignment
- **THEN** it is excluded from eligible candidates without deleting its source
  provenance or rewriting historical assignments

### Requirement: Offer variants preserve specification-level price and weight

SupplierOfferVariant SHALL represent a supplier-specific specification such as
size, material, production method, piece count, base option, or other explicit
source-backed choice. It SHALL preserve a stable variant key and label,
supplier cost and currency when known, packaged weight in grams when known,
optional dimensions when known, option surcharge when applicable, pricing basis,
and raw source value. The pricing basis SHALL support `fixed`,
`variant_fixed`, `area_based`, and `manual_quote_required` where applicable.
Area-priced work SHALL NOT be converted into a fabricated fixed unit price.

#### Scenario: Multi-size weight is normalized
- **WHEN** a source gives distinct values such as 6cm, 8cm, and 10cm weights
- **THEN** each source-backed specification is represented separately and its
  packaged weight is not collapsed into one shared value

#### Scenario: Area-priced portrait is normalized
- **WHEN** a supplier prices portrait work by area and production method
- **THEN** the offer preserves the area pricing basis and method-specific
  values, and marks a fixed unit cost as unavailable or manual-quote-required

#### Scenario: Approximate source value is retained
- **WHEN** a source says `about 50g` or `about 500g`
- **THEN** the raw approximate value remains available as provenance, any
  normalized candidate is marked as requiring approval, and no extra precision
  is inferred

### Requirement: One catalog Product may have multiple supplier offers

The supplier domain SHALL support multiple active or inactive SupplierOffers
for the same FigMemento Product/SKU and SHALL preserve the supplier identity on
each offer. Product or storefront code MUST NOT hard-code one supplier as the
only source, and supplier comparison MUST remain an internal operation.

#### Scenario: 3D pet has two suppliers
- **WHEN** reviewed offers exist for 3D pet from both Jinhua Xinye and
  Quanzhou Pinguang
- **THEN** both explicit offers can be presented as candidates for the same
  mapped canonical Product/Variant/SKU/selected-options selection without one
  replacing the other

#### Scenario: No supplier selection has been made
- **WHEN** multiple eligible offers exist for one configured item
- **THEN** the system presents the candidates and does not select the cheapest
  supplier automatically

### Requirement: Candidate matching is bounded and fail-closed

For an eligible configured Order item, the supplier service SHALL consume a
fresh server-owned canonical configured-item selection containing exact Product
identity, catalog Variant identity, SKU, selected-options set, fulfillment type,
and quantity where required. It SHALL match only active Supplier, SupplierOffer,
and SupplierOfferVariant records resolved through an explicit approved
structured SupplierCatalogMapping over that canonical selection. The selected
Supplier-local specification is obtained from the mapped SupplierOfferVariant;
it is not supplied by or reconstructed as a canonical Order fact. The selected
item SHALL have physical fulfillment, and the Supplier/Offer/Variant SHALL
satisfy Shanghai-warehouse capability when warehouse handoff is required.

Missing canonical selection evidence, missing approved mapping, ambiguous
mapping, inactive Supplier/Offer/OfferVariant, digital fulfillment, warehouse
incompatibility, and unresolved required source evidence SHALL produce no
eligible candidate or a bounded `review_required`/unavailable result. Matching
SHALL not use price, filename, customer content, display labels, Product-name
similarity, array position, or current Catalog rereads as authority.

#### Scenario: Exact candidate match
- **WHEN** a paid configured physical item has exact Product,
  catalog-Variant, SKU, and selected-options facts and an explicit approved
  structured mapping resolves active warehouse-compatible SupplierOfferVariant
  records
- **THEN** the service returns all eligible mapped Supplier candidates without
  assigning one or selecting the cheapest automatically, and each candidate
  obtains its Supplier-local specification from its mapped SupplierOfferVariant

#### Scenario: Candidate lacks warehouse support
- **WHEN** an otherwise matching offer does not have explicitly eligible
  Shanghai-warehouse handoff
- **THEN** it is excluded when warehouse handoff is required and no fallback
  supplier is silently chosen

#### Scenario: Digital item is submitted
- **WHEN** a digital Product is evaluated by this physical supplier-operations
  matcher
- **THEN** no physical supplier candidate is created and the result states that
  this capability does not cover digital delivery

### Requirement: Canonical configured-item selection is the Supplier mapping input

Supplier candidate matching SHALL consume a fresh server-owned canonical
configured-item read result, conceptually a `CanonicalSupplierSelection`, and
not a browser-carried configuration or a current Catalog object. The
Supplier-facing selection SHALL include the exact Product identity
(`productId`, `productSlug`), the catalog Variant identity named
`catalogVariantId`, the approved `skuCode`, the exact `selectedOptions` set,
the canonical `fulfillmentType`, and canonical `quantity` where production
unit quantity is required. The existing canonical reader's catalog `variantId`
is the source for `catalogVariantId`; this naming clarification does not make
Supplier operations a second Catalog or Order authority.

An empty `selectedOptions` set SHALL be valid when the catalog Variant has no
dimensions. A canonical Order/configured-item `selectedSpecificationKey` is
not required and SHALL NOT be manufactured. Matching SHALL use an explicit
approved structured mapping over the canonical machine identities and exact
option set. It SHALL NOT infer identity from display labels, Product names,
prices, filenames, array position, Supplier labels, fuzzy similarity, a
Supplier mapping guess, or current Catalog rereads. The current normalized
fixtures have no approved mappings under this contract; no mapping becomes
approved merely because a Supplier source row is present.

#### Scenario: Exact canonical selection is mapped
- **WHEN** a fresh canonical configured-item read supplies Product/SKU,
  `catalogVariantId`, exact selected options, and physical fulfillment, and an
  approved structured mapping identifies a SupplierOfferVariant
- **THEN** the Supplier service may evaluate that exact mapped offer and may
  return a candidate without automatically assigning a Supplier

#### Scenario: A dimensionless Variant has an empty option set
- **WHEN** the canonical Variant has no dimensions and its committed
  `selectedOptions` value is `[]`
- **THEN** the empty set is treated as the exact selection identity and is not
  replaced by a guessed specification key or display label

#### Scenario: Canonical selection or mapping is ambiguous
- **WHEN** the canonical identity, exact option set, or approved Supplier
  mapping is missing, ambiguous, inactive, digital, or warehouse-incompatible
- **THEN** matching returns no eligible candidate or a bounded
  `review_required`/unavailable result and does not infer or choose a Supplier

#### Scenario: Current Catalog changes after the Order is committed
- **WHEN** the current Catalog is edited or unavailable after a canonical
  configured item is committed
- **THEN** Supplier matching uses the historical server-owned configured-item
  read result and does not reread Catalog data to rewrite the selection

### Requirement: Catalog and Supplier Variant identities remain distinct

The Supplier compatibility boundary SHALL distinguish `catalogVariantId` as
the FigMemento catalog Variant committed in the canonical Order from
`supplierOfferVariantId` as the selected SupplierOfferVariant identity. A
Supplier-local `supplierSpecificationKey` is a Supplier-owned source key. The
existing `SupplierOfferVariant.specificationKey` field is valid Supplier-owned
data and SHALL be preserved; it SHALL NOT be treated as a canonical Order fact
or deleted as part of this compatibility amendment. Future Supplier-facing
projections and snapshots SHALL avoid an ambiguous bare `variantId` where the
owner is not explicit.

#### Scenario: Catalog and Supplier Variant IDs are both present
- **WHEN** an explicit mapping selects one catalog Variant and one
  SupplierOfferVariant
- **THEN** the candidate and assignment preserve both identities in their
  respective namespaces and do not compare or substitute one for the other

#### Scenario: Supplier-local specification is not in the canonical Order
- **WHEN** a canonical configured item has Product/SKU/catalog Variant and
  exact selected options but no `selectedSpecificationKey`
- **THEN** the Supplier boundary uses an approved mapping to obtain the
  Supplier-local specification and does not reject the canonical item merely
  because a Supplier-owned key was never an Order fact

### Requirement: Supplier assignment is operator-controlled

SupplierAssignment SHALL be created only by a separately authorized local
operator after a bounded candidate result exists. The assignment SHALL identify
the canonical Order item, Supplier, SupplierOffer, and selected offer variant;
the customer same-browser capability SHALL not authorize it. One production
unit SHALL have at most one committed active assignment in this phase, and a
later different selection SHALL be rejected rather than silently rewriting the
first assignment.

#### Scenario: Operator assigns an eligible candidate
- **WHEN** a separately authorized local operator selects one eligible offer
  variant for a paid, approved configured item
- **THEN** one SupplierAssignment is committed for that production unit and
  the operator receives a bounded assignment result

#### Scenario: Customer attempts assignment
- **WHEN** a customer request or customer capability submits a supplier choice
- **THEN** the request is rejected before privileged supplier-operation
  construction and no assignment is created

#### Scenario: Assignment is attempted without an eligible candidate
- **WHEN** the selected offer is inactive, unmapped, unavailable, or otherwise
  ineligible
- **THEN** assignment is rejected and the production unit remains unassigned

### Requirement: Assignment preserves immutable supplier snapshots

A committed SupplierAssignment SHALL snapshot supplier identity, offer identity,
selected SupplierOfferVariant identity and Supplier-local specification when
known, quoted supplier cost and currency when known, packaged weight when
known, production lead-time range when known, warehouse eligibility, and
assignment timestamp. The catalog Variant identity remains a separate
canonical Order/configured-item fact. Later edits to Supplier, SupplierOffer, or
SupplierOfferVariant MUST NOT rewrite the assignment snapshot or historical
cost/weight/lead-time facts. Unknown values SHALL remain unknown or null.

#### Scenario: Offer changes after assignment
- **WHEN** a supplier changes an offer price, weight, lead time, or active state
  after assignment
- **THEN** the existing assignment retains its original snapshot and only new
  unassigned work can observe the changed offer

#### Scenario: Snapshot has incomplete source facts
- **WHEN** the selected offer does not have an approved packaged weight or cost
- **THEN** the assignment preserves the missing value as unknown/null and does
  not substitute zero or a generic supplier value

### Requirement: SupplierWorkOrder derives from canonical approved Order facts

SupplierWorkOrder SHALL be generated only from a freshly resolved canonical
paid/succeeded Local Order, its configured item, the committed SupplierAssignment,
and the existing customer Fulfillment approval boundary. It SHALL preserve
references and snapshots needed for production, including Order/item identity,
FigMemento Product/SKU/catalog Variant identity, quantity, exact selected
options, selected customer configuration that already exists in the canonical
snapshot, approved-preview status, the separate SupplierOfferVariant and
Supplier-local specification from the committed assignment, supplier cost
snapshot, completion target, and Shanghai destination indicator. The
canonical configured-item read projection and the committed assignment
snapshot are the only two inputs for these facts; a SupplierWorkOrder SHALL
not reconstruct a Supplier specification from a label, price, filename, array
position, or current Catalog object.
Absent customer fields SHALL remain absent; this capability SHALL NOT invent
new personalization fields. Private upload or preview content SHALL be
represented only by authorized internal references and never by raw locators or
secrets.

#### Scenario: Work order is generated after approval
- **WHEN** a paid configured item has a committed assignment and the canonical
  customer Fulfillment is at least `preview_approved`
- **THEN** a work order is created from fresh server-owned facts and does not
  mutate the Local Order or customer Fulfillment lifecycle

#### Scenario: Work order is requested before customer approval
- **WHEN** the canonical customer Fulfillment has not reached
  `preview_approved`
- **THEN** work-order generation is rejected without exposing private content
  or creating a partial work order

#### Scenario: Catalog changes after work-order generation
- **WHEN** current Product or Catalog data changes after a work order exists
- **THEN** the work order retains its captured Order-item and assignment facts
  and does not reread current Catalog data to rewrite history

### Requirement: Customer Fulfillment and Supplier Production Operations remain separate

Supplier Production Operations SHALL use a distinct internal projection and
state machine. The existing customer Fulfillment lifecycle SHALL remain
authoritative and unchanged: `photo_review` → `preview_pending` /
`preview_revision_requested` → `preview_approved` → `in_production` →
`quality_check`. Supplier-specific states such as `assigned`,
`supplier_confirmed`, `warehouse_received`, and `ready_for_outbound` MUST NOT
be written into or substituted for customer Fulfillment states. Supplier
operations SHALL not create Tracking or Shipment state automatically.

#### Scenario: Supplier operation advances
- **WHEN** an internal supplier operation advances from assignment to warehouse
  readiness
- **THEN** only the supplier-operation aggregate changes; the canonical
  customer Fulfillment remains owned by its existing lifecycle boundary

#### Scenario: Supplier operation is read beside Fulfillment
- **WHEN** an operator reads a paid Order with both projections available
- **THEN** customer Fulfillment status and internal supplier-operation status
  are displayed as separate authorities with no state-name conflation

### Requirement: Supplier production lifecycle is bounded

The internal Supplier Production Operations lifecycle SHALL contain exactly
`unassigned`, `assigned`, `work_order_ready`, `submitted_to_supplier`,
`supplier_confirmed`, `in_production`, `supplier_completed`,
`en_route_to_warehouse`, `warehouse_received`, `warehouse_qc`, and
`ready_for_outbound`. The allowed forward transitions SHALL be consecutive
steps only. The internal `in_production` transition SHALL require the existing
customer Fulfillment to be `in_production` or a later valid state. The
`ready_for_outbound` state is terminal for this capability and is only a
downstream handoff signal; it does not create a Shipment.

#### Scenario: Normal supplier lifecycle
- **WHEN** an authorized operator advances a valid operation one step at a time
- **THEN** the next exact internal state is committed and the preceding state
  is preserved in the operation history

#### Scenario: Production starts before customer production gate
- **WHEN** an operator attempts to move supplier work into `in_production`
  while canonical customer Fulfillment is not `in_production` or later
- **THEN** the transition is rejected and no supplier lifecycle state changes

#### Scenario: Ready for outbound remains separate
- **WHEN** the supplier operation reaches `ready_for_outbound`
- **THEN** no Tracking provider, Shipment, or customer Fulfillment transition
  is created by this capability

### Requirement: Shanghai WarehouseReceipt records receipt and QC

WarehouseReceipt SHALL belong to one SupplierWorkOrder or assignment and SHALL
record a stable internal receipt identity, received timestamp, received
quantity, discrepancy information, damage flag, QC result, notes, and a bounded
ready-for-outbound result. Receipt and QC data SHALL remain local operational
state, and a real warehouse provider SHALL not be implied.

#### Scenario: Supplier work arrives at Shanghai warehouse
- **WHEN** an authorized operator records receipt for an en-route work order
- **THEN** one WarehouseReceipt is created with the received quantity and
  source-preserving operational facts, and the supplier operation becomes
  `warehouse_received`

#### Scenario: Receipt has discrepancy or damage
- **WHEN** received quantity differs or damage is reported
- **THEN** discrepancy/damage is recorded explicitly and the operation cannot
  become `ready_for_outbound` until the bounded QC rule accepts it

#### Scenario: Receipt provider is unavailable
- **WHEN** no real warehouse integration exists
- **THEN** the operator can use only the local receipt boundary and the system
  does not fabricate an external warehouse confirmation

### Requirement: Cost projections distinguish known and unknown economics

The local operations domain SHALL distinguish existing customer item revenue
from the SupplierAssignment supplier production cost snapshot. It SHALL
support known cost, currency, pricing basis, and an explicit unknown state.
Estimated logistics cost, total landed cost, gross margin, payment fees,
refunds, duties, warehouse cost, and other absent inputs MUST remain null or
unavailable rather than being represented as zero or a fabricated estimate.

#### Scenario: Known supplier cost is compared
- **WHEN** an assignment has a source-backed numeric supplier cost and currency
- **THEN** an internal operator projection shows supplier production cost
  separately from the immutable customer item revenue

#### Scenario: Landed cost inputs are absent
- **WHEN** international logistics or other cost inputs are unavailable
- **THEN** total landed cost and gross margin are not calculated and are shown
  as unknown/unavailable

#### Scenario: Area pricing is shown
- **WHEN** a supplier offer is area-based or requires a manual quote
- **THEN** the projection preserves that pricing basis and does not display a
  false unit cost or margin

### Requirement: Lead time and weight retain production-only semantics

Supplier lead time SHALL be represented as a minimum and maximum production
business-day range and SHALL explicitly exclude international logistics,
customs, and customer delivery transit. Packaged weight SHALL mean the
standard packaged/shipping weight, not bare-product weight. Per-variant
packaged weights SHALL remain separate; package dimensions MAY be null when not
source-backed. These fields MUST NOT be presented as a customer delivery ETA.

#### Scenario: Supplier production range is displayed internally
- **WHEN** a source provides a 3–4 working-day production range
- **THEN** the operator sees the range as production-only and no delivery date
  or international transit claim is derived

#### Scenario: Variant weights differ
- **WHEN** 6cm, 8cm, and 10cm variants have distinct packaged weights
- **THEN** each variant retains its own packaged weight and the system does not
  copy one value across the others

#### Scenario: Dimensions are missing
- **WHEN** a source provides weight but no package length, width, or height
- **THEN** dimensions remain null and no dimensions are inferred from weight

### Requirement: Source normalization is deterministic and reviewable

The initial local fixtures SHALL be derived from the reviewed supplier workbook
into normalized typed data with stable Supplier, SupplierOffer, and
SupplierOfferVariant identities, explicit FigMemento mapping, source URL or
source-row provenance when available, raw source values, and an approval state
for approximate or provisional facts. The application MUST NOT read the XLSX on
each request, scrape supplier URLs, infer mappings from prices, or silently
promote unresolved workbook cells to production authority.

#### Scenario: Workbook is not present at runtime
- **WHEN** the local application starts without the supplier workbook
- **THEN** normalized checked-in fixtures remain the only local source and the
  application does not fail because it expected to parse XLSX at request time

#### Scenario: Source mapping is ambiguous
- **WHEN** a workbook product can map to multiple current Products, SKUs, or
  suppliers, including 3D pet or bobblehead offers
- **THEN** the mapping is marked ambiguous and requires operator/business review
  before it can produce a candidate or assignment

#### Scenario: Source URL is unreachable
- **WHEN** a source URL cannot be fetched during local operation
- **THEN** the system uses the stored provenance only and does not scrape,
  replace, or guess the missing source fact

### Requirement: Operator authority is separate and server-side

All supplier candidate, assignment, work-order, lifecycle, receipt, QC, and
cost/lead-time mutation operations SHALL require a separate server-only local
operator authority in addition to the explicitly enabled local runtime. The
existing customer same-browser Local Order capability SHALL not authorize
supplier operations, and a public Order reference alone SHALL not disclose
internal supplier state. Authorization SHALL be checked before privileged local
repository/service construction.

#### Scenario: Authorized operator performs an operation
- **WHEN** a valid server-only local operator authority requests an allowed
  internal action against a canonical paid/approved Order item
- **THEN** the action is evaluated against fresh server state and may commit
  only its bounded internal mutation

#### Scenario: Public reference lacks operator authority
- **WHEN** a request supplies a valid public Order reference without separate
  operator authority
- **THEN** the request is rejected with a bounded result without revealing
  supplier, assignment, work-order, or warehouse existence

#### Scenario: Runtime is enabled but operator is unauthorized
- **WHEN** the local supplier runtime is enabled but operator verification
  fails
- **THEN** the request is rejected before constructing privileged repositories
  and no internal state is changed

### Requirement: Mutations are atomic, replayable, and concurrency-safe

Every supplier-operation mutation SHALL use an independent opaque operation
action identity, separate from Local Order, Local Payment, Local Fulfillment,
and Tracking action identities. After operator authorization and canonical Order
item/operation identity resolution, the service SHALL resolve an exact committed
action binding before new lifecycle validation. An exact replay SHALL return the
original committed result without a second assignment, work order, receipt,
state transition, or event. A non-equivalent reuse SHALL return a bounded
conflict. Binding, state change, snapshot, receipt, and related event data SHALL
commit atomically, and concurrent actions for one production unit SHALL be
serialized by the canonical local aggregate.

#### Scenario: Successful assignment replay
- **WHEN** an assignment action commits and its response is lost, then the same
  action is retried
- **THEN** the original assignment result is returned and no second assignment
  or snapshot is created

#### Scenario: Non-equivalent action reuse
- **WHEN** the same action identity is reused with a different supplier,
  variant, action kind, or normalized input
- **THEN** the request is rejected with a bounded conflict and the original
  committed result remains unchanged

#### Scenario: Concurrent lifecycle actions
- **WHEN** two distinct actions race for one supplier operation
- **THEN** at most one valid next transition commits, the other observes the
  latest canonical state or receives a bounded conflict, and no transition is
  lost or overwritten

#### Scenario: Partial commit failure
- **WHEN** an internal mutation cannot commit all of its binding, state,
  snapshot, receipt, or event changes
- **THEN** none of those related changes remain visible as a partial operation

### Requirement: Invalid and terminal transitions fail closed

Supplier operations SHALL reject missing or cross-Order identities, stale
states, skipped transitions, backwards transitions, duplicate receipt/QC
records, and all mutations after `ready_for_outbound`. Rejected requests SHALL
not disclose private supplier data and SHALL leave the canonical operation,
assignment, snapshots, receipts, and event history unchanged. No delete,
refund, cancellation, reshipment, loss, or exception lifecycle is introduced
by this capability.

#### Scenario: Lifecycle skip is rejected
- **WHEN** an operator attempts to move `assigned` directly to `in_production`
  or `warehouse_received` directly to `ready_for_outbound`
- **THEN** the request is rejected and no intermediate or final state is
  fabricated

#### Scenario: Terminal operation is mutated
- **WHEN** an operator attempts any new mutation after `ready_for_outbound`
- **THEN** the request is rejected or returns an exact replay, and terminal
  history remains unchanged

#### Scenario: Cross-Order reference is supplied
- **WHEN** an assignment, work-order, or receipt request combines identities
  belonging to different canonical Orders
- **THEN** the request is rejected before privileged construction without
  leaking either Order's internal supplier state

### Requirement: Local persistence and restart behavior remain non-production

The initial implementation SHALL use a local development/test repository with
process-memory state and stable fixture identities. A process restart SHALL
lose supplier assignments, work orders, lifecycle state, receipts, and action
bindings and SHALL fail closed rather than reconstructing them from browser
data, localStorage, the XLSX, filesystem state, Supabase, or a provider. No
database table, migration, durable production record, or production readiness
claim is introduced by this capability.

#### Scenario: Local runtime restarts
- **WHEN** the process restarts after a supplier assignment or warehouse receipt
- **THEN** the previous internal state is unavailable and no state is resurrected
  from a public Order reference or client storage

#### Scenario: Production runtime is requested
- **WHEN** a production runtime attempts to activate the local supplier source
- **THEN** the source fails closed and no supplier, work-order, warehouse, or
  provider operation is treated as production state

### Requirement: Provider and procurement stop gates are explicit

This capability MUST NOT call or require live 1688, Taobao, Tmall, supplier
messaging, supplier payment, ERP, procurement, inventory, warehouse, carrier,
shipping, storage, payment, email, Supabase, or other external providers. It
MUST NOT introduce supplier checkout, automatic cheapest-supplier optimization,
exact inventory, purchasing, cost accounting beyond the bounded projections,
production-preview workflow, customer delivery ETA, or deployment behavior.

#### Scenario: External supplier integration is unavailable
- **WHEN** an operator uses the local supplier operations surface
- **THEN** all results come from reviewed local fixtures and process-memory
  state, with no external supplier or warehouse request

#### Scenario: Automatic optimization is requested
- **WHEN** multiple eligible supplier candidates are present
- **THEN** the system requires explicit operator selection and does not perform
  cheapest-cost or routing optimization

#### Scenario: Production deployment is reviewed
- **WHEN** this change is reviewed for deployment
- **THEN** it is classified as local-only and does not authorize migrations,
  provider credentials, production persistence, DNS, Cloudflare, or deployment

### Requirement: Operator projections protect customer and supplier privacy

Internal operator projections MAY show bounded supplier, offer, assignment,
work-order, receipt, cost, weight, lead-time, and QC data needed for local
operations, but MUST NOT expose secrets, credentials, raw same-browser
capabilities, storage locators, private object keys, private provider URLs,
SQL diagnostics, or unapproved customer-private content. Customer-facing
projections MUST remain limited to the existing safe Order, Fulfillment, and
Tracking boundaries and MUST NOT expose supplier sourcing or internal costs.

#### Scenario: Operator reads an assigned work order
- **WHEN** an authorized operator reads a local work order
- **THEN** only bounded operational fields and authorized internal references
  are returned, with no secret or private storage locator

#### Scenario: Customer reads after supplier assignment
- **WHEN** a customer reads Order Success, Fulfillment, or Tracking after an
  internal supplier assignment exists
- **THEN** the customer receives the existing safe projection and cannot see
  supplier identity, source URL, supplier cost, work-order notes, or warehouse
  details

#### Scenario: Error is returned
- **WHEN** a supplier operation fails validation or persistence
- **THEN** the HTTP projection is bounded and does not include SQL detail,
  stack traces, internal IDs, credentials, or private locator values
