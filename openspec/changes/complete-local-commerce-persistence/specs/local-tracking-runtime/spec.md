## MODIFIED Requirements

### Requirement: Explicit local Tracking runtime and dependency gate

Local Tracking SHALL be available only when `LOCAL_TRACKING_SOURCE=local_fake` or `local_persistent` is explicitly selected in a development/test runtime. An absent or disabled source SHALL disable the runtime, and a production runtime SHALL reject local modes. Staging SHALL also reject `local_persistent`. Tracking execution MUST require the canonical Local Order, Local Payment, and Local Fulfillment authorities, with Fulfillment at canonical `quality_check`. Persistent authorities and required item/media authorization SHALL use the same independent Docker local Supabase project and MUST NOT mix memory, another project, or legacy Orders. A source, database, required private Storage, or configuration failure MUST NOT fall back to the local fixture, and no fake paid, Fulfillment, or Quality Check bypass may activate Tracking.

#### Scenario: Tracking remains unavailable before canonical dependencies are ready
- **WHEN** the canonical Local Order, Local Payment, or Local Fulfillment authority is unavailable, or the Fulfillment is not at `quality_check`
- **THEN** no local Shipment or Tracking workflow is activated

#### Scenario: Tracking runtime source is absent or production
- **WHEN** the local source is absent or the runtime is production
- **THEN** Tracking is unavailable and no local shipment, provider, database, or fallback workflow is activated

#### Scenario: Provider or fixture source failure
- **WHEN** a local Tracking source or fixture cannot be safely resolved
- **THEN** the request fails closed without switching to another source or claiming a real carrier result

#### Scenario: Persistent source mismatch
- **WHEN** persistent Tracking is selected in staging or required Order/payment/fulfillment sources resolve to different projects, a non-local project, or fake state
- **THEN** no Shipment mutation or fallback read is performed and the server returns a bounded configuration/unavailable result

### Requirement: Quality Check and paid Order are mandatory Shipment entry gates

Shipment creation SHALL be an operator mutation that freshly resolves the canonical Local Order and canonical Local Fulfillment. It SHALL succeed only when the Order payment lifecycle is exactly `paid`/`succeeded` and the Fulfillment lifecycle is exactly `quality_check`. Browser-submitted `qualityCheck`, `fulfillmentStatus`, `shipped`, `trackingStatus`, payment fields, or prior projections MUST NOT authorize Shipment creation. In `local_persistent`, both creation and dispatch SHALL atomically validate these gates with their transition and MUST verify physical shipping eligibility from immutable Order-item facts through the shared fulfillment command boundary. All applicable photo-review and latest required-preview gates MUST have been satisfied; direct Admin/supplier/tracking status writes MUST NOT manufacture Quality Check. Digital-only Orders SHALL not require or create physical Shipment/Tracking. Mixed Orders SHALL check physical shipment and digital-delivery eligibility independently, without treating a physical shipment as digital delivery or demanding tracking for a digital item.

#### Scenario: Authorized operator creates Shipment after Quality Check
- **WHEN** a separately authorized local operator requests Shipment creation for a canonical paid/succeeded physical Local Order whose Fulfillment is `quality_check`
- **THEN** the server creates one canonical local Shipment in `shipment_created`

#### Scenario: Shipment creation before Quality Check is rejected
- **WHEN** the canonical Fulfillment is `photo_review`, `preview_pending`, `preview_revision_requested`, `preview_approved`, or `in_production`
- **THEN** Shipment creation is rejected and no Shipment state is created

#### Scenario: Customer cannot create Shipment
- **WHEN** a customer same-browser capability or browser body attempts to create a Shipment or submits `qualityCheck = true`
- **THEN** the request is rejected before privileged Shipment construction and the canonical Fulfillment remains unchanged

#### Scenario: Unpaid Order cannot create Shipment
- **WHEN** the canonical Local Order is not exactly `paid`/`succeeded`
- **THEN** Shipment creation is rejected even if the Fulfillment state is `quality_check`

#### Scenario: Digital-only Order does not enter physical tracking
- **WHEN** an authorized persistent command evaluates an Order with only digital items
- **THEN** physical Shipment creation is inapplicable and private digital delivery is not blocked for lacking a Shipment or tracking number

#### Scenario: Mixed Order has independent delivery branches
- **WHEN** a persistent mixed Order reaches physical shipment eligibility
- **THEN** only its physical branch may enter Shipment and digital publication/download eligibility remains separately checked against its exact digital items

#### Scenario: Dispatch attempts to bypass canonical gates
- **WHEN** an Admin, supplier, operator, or tracking route attempts dispatch without canonical paid/Quality Check and applicable review/preview evidence
- **THEN** the shared command rejects it atomically without setting `shipped` or appending a dispatch event

### Requirement: Canonical local Shipment and Tracking aggregate

One canonical local Shipment/Tracking aggregate SHALL own the Shipment lifecycle, deterministic local tracking events, timestamps, and action bindings. It SHALL use process memory in `local_fake` and durable state in the same selected local project as Order/Fulfillment in `local_persistent`. Each canonical Fulfillment SHALL have at most one canonical Shipment relationship, independently of any `trackingActionId`; a new create selector after that relationship exists MUST receive a bounded conflict/already-exists result and MUST NOT create a second Shipment. This business uniqueness SHALL be bound to stable server-owned canonical Fulfillment identity and its canonical Order relationship, never to a browser Order reference, Shipment reference, or tracking number. It SHALL retain only server-side Shipment identity, safe public Shipment reference, canonical Order and Fulfillment identity references, allowlisted local carrier fixture metadata, server-generated local tracking number, Shipment state, event history, lifecycle timestamps, and bounded audit/context bindings. It MUST NOT copy Product, SKU, price, address, customization, upload, or mutable Order facts into a second Order snapshot; protected immutable destination facts remain owned by canonical Local Order.

#### Scenario: Shipment references canonical facts
- **WHEN** a local Shipment is created
- **THEN** it references the canonical Order and Fulfillment identities and reads protected immutable destination facts without creating a mutable duplicate

#### Scenario: Catalog or Order facts change after Shipment creation
- **WHEN** current Product, Cart, or Catalog data changes after Shipment creation
- **THEN** Shipment and historical tracking use the original canonical Local Order facts and do not rewrite them from current Cart/Catalog data

#### Scenario: Tracking does not mutate upstream lifecycles
- **WHEN** Shipment or Tracking advances
- **THEN** Local Order remains `paid`/`succeeded`, Local Fulfillment remains `quality_check`, and payment, preview, revision, Product, SKU, and customization facts are unchanged

#### Scenario: New Shipment selector after one already exists
- **WHEN** a different create selector targets the same canonical Fulfillment after Shipment S1 already exists
- **THEN** the server returns a bounded `shipment_already_exists` or conflict result and the canonical Fulfillment retains only S1

#### Scenario: Concurrent distinct Shipment selectors
- **WHEN** two different create selectors race for the same canonical Fulfillment
- **THEN** at most one creates the canonical Shipment relationship and the other receives a bounded conflict/already-exists result

### Requirement: Customer tracking authority and safe projection

Customer tracking reads SHALL require the existing same-browser Local Order capability, any required current member-session binding, server-side resolution of the canonical Order, and the canonical Order relationship to the Local Fulfillment/Shipment. Persistent reads SHALL verify those durable relationships from the same selected local project and preserve existing guest signature/expiry semantics across restart. A public Order reference alone, a public Shipment reference alone, a local tracking number alone, or matching email MUST NOT authorize a read. Customer reads SHALL be side-effect free and SHALL return only a safe projection containing public references, safe carrier display label, safe local tracking number, Shipment/tracking state, deterministic event labels/timestamps, and the development/test notice. It MUST NOT expose internal IDs, owner IDs, receipt IDs, storage keys, credentials, tokens, SQL details, or private customer content.

#### Scenario: Authorized customer reads tracking
- **WHEN** a customer with the matching same-browser capability and any required valid member session reads an existing local Shipment
- **THEN** the server returns the safe tracking projection without exposing private identifiers or provider internals

#### Scenario: Public reference or tracking number alone cannot read tracking
- **WHEN** a separate browser or public-reference/tracking-number-only request reads a Shipment or Order tracking view
- **THEN** the server returns a bounded unavailable/unauthorized result without revealing Order, Fulfillment, or Shipment existence

#### Scenario: Customer tracking read has no mutation side effect
- **WHEN** a customer opens Order Success or a tracking view before a Shipment exists, or refreshes an existing tracking view
- **THEN** no Shipment is created, no tracking number is generated, no event is appended, and no lifecycle timestamp is changed

#### Scenario: Persistent tracking is read after restart
- **WHEN** the same authorized customer returns with valid Order capability and any required unexpired/unrevoked session after restart
- **THEN** the stored Shipment and events are available without email-based claims or browser reconstruction

### Requirement: Independent operator authority and local Shipment actions

Operator Shipment mutations SHALL require both the enabled local Tracking runtime and a separate server-only local tracking/operator authority. `LOCAL_TRACKING_SOURCE=local_fake` or `local_persistent` MUST NOT itself authorize an operator. Customer same-browser capability is not required for operator actions, and customer capability MUST NOT satisfy operator authority. Operator actions SHALL be limited to `create_shipment`, `mark_shipped`, `mark_in_transit`, and `mark_delivered` for the required current state; the available next action SHALL be derived from the canonical Shipment state, not from the upstream Fulfillment state. Persistent actions SHALL be manual local simulation commands through the same shared paid/review/preview/Quality Check gate as Admin and supplier writes, never evidence from a real carrier. Unadapted operator/supplier routes MUST fail closed rather than write a memory Shipment or Order. Bounded same-origin HTTP protection SHALL allow an eligible same-origin operator GET under the existing read convention even when `Origin` is absent, while cross-site or evil-origin GET requests are rejected; operator POST mutations SHALL reject a missing or evil `Origin` and accept only the exact same-origin gate. No production Admin Auth, staff system, new Admin role split, bulk operations, carrier management, or warehouse dashboard is introduced.

#### Scenario: Authorized operator performs bounded action
- **WHEN** a separately authorized operator submits an allowed action against the current Shipment state
- **THEN** the server applies only the corresponding local lifecycle transition

#### Scenario: Customer attempts operator mutation
- **WHEN** a customer capability attempts to create Shipment, mark shipped, append a tracking event, or mark delivered
- **THEN** the request is rejected before privileged operator construction

#### Scenario: Public reference lacks operator authority
- **WHEN** an operator-like request supplies a public reference without valid separate server-only operator authority
- **THEN** the request is rejected safely and does not disclose Shipment existence; customer capability cannot substitute for operator authority

#### Scenario: Operator action projection follows Shipment state
- **WHEN** an authorized operator reads a canonical Fulfillment that remains `quality_check`
- **THEN** the available action is `create_shipment` when no Shipment exists, `mark_shipped` at `shipment_created`, `mark_in_transit` at `shipped`, `mark_delivered` at `in_transit`, and no further action at `delivered`, subject to applicable physical-item and shared eligibility gates

#### Scenario: Operator HTTP read and mutation origin boundaries remain distinct
- **WHEN** an operator GET is same-origin without `Origin`, or has no Fetch Metadata, or an operator POST has the exact same-origin `Origin`
- **THEN** the request passes the applicable origin gate; cross-site or evil-origin GETs and missing or evil-origin POST mutations are rejected safely

### Requirement: Atomicity and concurrency safety

Shipment action binding, canonical Fulfillment-to-Shipment uniqueness relationship, Shipment lifecycle transition, tracking event creation, and related timestamps SHALL commit atomically in the canonical process-memory aggregate for `local_fake`, or in one database transaction for `local_persistent`. A failed commit MUST leave all five unchanged. Persistent gate decisions and bounded audit facts SHALL be consistent with the same commit. Concurrent Shipment creation for one canonical Order/Fulfillment may create at most one Shipment, including requests from different application instances. Concurrent lifecycle actions MUST obey the transition order and MUST NOT skip `in_transit` or duplicate terminal events. Existing replay-first action binding rules SHALL remain authoritative across restart; no new in-memory idempotency map may substitute for durable bindings.

#### Scenario: Concurrent Shipment creation
- **WHEN** two different create selectors race for the same paid/succeeded Order at Fulfillment `quality_check`
- **THEN** at most one canonical Shipment is created and the other receives a bounded conflict or existing-result outcome

#### Scenario: Concurrent event transition
- **WHEN** `mark_in_transit` and `mark_delivered` race from `shipped`
- **THEN** only the valid current-state transition succeeds and delivery cannot skip the required `in_transit` transition

#### Scenario: Atomic failure
- **WHEN** a Shipment transition, event, timestamp, or action binding cannot commit
- **THEN** Shipment state, events, timestamps, and binding remain unchanged

#### Scenario: Persistent response loss and replay
- **WHEN** a create, dispatch, transit, or delivery action commits and an equivalent authorized retry occurs after restart
- **THEN** the original committed result is returned before new-action eligibility without a second Shipment, event, timestamp change, or audit mutation

#### Scenario: Conflicting durable tracking selector
- **WHEN** a committed `trackingActionId` is reused for a different actor context, Order/Fulfillment, action, or normalized input
- **THEN** it fails with a bounded conflict without modifying or exposing the original record

### Requirement: Process-memory restart and production stop gate

In `local_fake`, Local Shipment, Tracking events, timestamps, and action bindings SHALL be process-memory only. A fake restart MUST lose the local workflow and MUST NOT resurrect it from public references, tracking numbers, browser storage, filesystem, SQLite, Supabase, or provider storage. The explicit `local_persistent` exception SHALL retain manual local Shipment/events/authorization relationships/idempotency/audit state in the independent Docker local Supabase PostgreSQL project's local commerce namespace. It MUST NOT write legacy `orders/order_items`, perform C1 backfill or Phase C production migration, or remove the normalized `/api/orders` 503 and incompatible old-path stop gates. The capability SHALL create no production Shipment/Tracking database records, production migration, real provider call, payment change, storage object, supplier handoff, email, DNS, Cloudflare, or deployment side effect; fake mode continues to introduce no migration at all. `delivered` is the terminal tracking boundary for this change and MUST NOT imply that a digital delivery was completed.

#### Scenario: Restart fails closed
- **WHEN** a `local_fake` Shipment reaches `shipped` or `delivered` and the process restarts
- **THEN** old customer/operator references return bounded unavailable and no Shipment or event state is reconstructed

#### Scenario: Delivered is terminal
- **WHEN** a local Shipment reaches `delivered`
- **THEN** the local Tracking workflow stops and no return, refund, reshipment, exception, or shipment-side effect is created

#### Scenario: No production side effect
- **WHEN** the `local_fake` workflow advances from `quality_check` through `delivered`
- **THEN** only process-memory local state changes and Local Order/Payment/Fulfillment authorities remain untouched

#### Scenario: Persistent local history is not a carrier confirmation
- **WHEN** stored manual tracking events are read after application restart
- **THEN** they remain explicitly development/test simulation history, no real carrier is queried, and original Order/payment/fulfillment facts are unchanged

## ADDED Requirements

### Requirement: Persistent tracking outage preserves authorization and history

Persistent Tracking SHALL resolve its authoritative records and access/action bindings from the same selected local project on every protected read or mutation. Database failure, unavailable required authority, or inconsistent project identity MUST return bounded unavailable results rather than use public identifiers, email, prior browser projections, or fake aggregates to recover state. Restart SHALL preserve valid authorized relationships and committed events but MUST NOT extend expired guest capabilities or revoked member sessions. Manual local carrier fixtures SHALL retain their server-owned obviously local identifiers and no-real-provider notice.

#### Scenario: Persistent store unavailable during a tracking read
- **WHEN** the server cannot read the canonical Shipment or its required Order authorization
- **THEN** it returns a non-enumerating unavailable response without stale memory results or provider diagnostics

#### Scenario: Expired authorization after restart
- **WHEN** persistent Shipment state exists but the required browser capability or member session is no longer valid
- **THEN** the read is denied without creating a replacement grant from email, Order reference, or tracking number