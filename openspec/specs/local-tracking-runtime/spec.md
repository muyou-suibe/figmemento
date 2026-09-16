# local-tracking-runtime Specification

## Purpose

Provide a deterministic development/test-only shipment and tracking workflow after an authorized Local Fulfillment reaches `quality_check`, ending at local `delivered` without creating production shipping, carrier, payment, or database side effects.

## Requirements

### Requirement: Explicit local Tracking runtime and dependency gate

Local Tracking SHALL be available only when `LOCAL_TRACKING_SOURCE=local_fake` is explicitly selected in a development/test runtime. An absent source SHALL disable the runtime, and a production runtime SHALL reject it. Tracking execution MUST require the canonical Local Order, Local Payment, and Local Fulfillment authorities, with Fulfillment at canonical `quality_check`. A source failure MUST NOT fall back to the local fixture, and no fake paid, Fulfillment, or Quality Check bypass may activate Tracking.

#### Scenario: Tracking remains unavailable before canonical dependencies are ready
- **WHEN** the canonical Local Order, Local Payment, or Local Fulfillment authority is unavailable, or the Fulfillment is not at `quality_check`
- **THEN** no local Shipment or Tracking workflow is activated

#### Scenario: Tracking runtime source is absent or production
- **WHEN** the local source is absent or the runtime is production
- **THEN** Tracking is unavailable and no local shipment, provider, database, or fallback workflow is activated

#### Scenario: Provider or fixture source failure
- **WHEN** a local Tracking source or fixture cannot be safely resolved
- **THEN** the request fails closed without switching to another source or claiming a real carrier result

### Requirement: Quality Check and paid Order are mandatory Shipment entry gates

Shipment creation SHALL be an operator mutation that freshly resolves the canonical Local Order and canonical Local Fulfillment. It SHALL succeed only when the Order payment lifecycle is exactly `paid`/`succeeded` and the Fulfillment lifecycle is exactly `quality_check`. Browser-submitted `qualityCheck`, `fulfillmentStatus`, `shipped`, `trackingStatus`, payment fields, or prior projections MUST NOT authorize Shipment creation.

#### Scenario: Authorized operator creates Shipment after Quality Check
- **WHEN** a separately authorized local operator requests Shipment creation for a canonical paid/succeeded Local Order whose Fulfillment is `quality_check`
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

### Requirement: Canonical local Shipment and Tracking aggregate

One canonical local Shipment/Tracking aggregate SHALL own the Shipment lifecycle, deterministic tracking events, timestamps, and action bindings. Each canonical Fulfillment SHALL have at most one canonical Shipment relationship, independently of any `trackingActionId`; a new create selector after that relationship exists MUST receive a bounded conflict/already-exists result and MUST NOT create a second Shipment. This business uniqueness SHALL be bound to stable server-owned canonical Fulfillment identity and its canonical Order relationship, never to a browser Order reference, Shipment reference, or tracking number. It SHALL retain only server-side Shipment identity, safe public Shipment reference, canonical Order and Fulfillment identity references, allowlisted local carrier fixture metadata, server-generated local tracking number, Shipment state, event history, and lifecycle timestamps. It MUST NOT copy Product, SKU, price, address, customization, upload, or mutable Order facts into a second Order snapshot; protected immutable destination facts remain owned by canonical Local Order.

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

### Requirement: Bounded local Shipment lifecycle

The local Shipment lifecycle SHALL contain exactly `shipment_created`, `shipped`, `in_transit`, and terminal `delivered`. The only allowed transitions SHALL be `quality_check → shipment_created`, `shipment_created → shipped`, `shipped → in_transit`, and `in_transit → delivered`. Skips, backwards transitions, repeated new selectors, and transitions after `delivered` MUST fail closed. This capability SHALL NOT add return, refund, reshipment, loss, exception, cancellation, or delivery-failure states.

#### Scenario: Operator dispatches Shipment
- **WHEN** an authorized operator advances `shipment_created`
- **THEN** the Shipment becomes `shipped` and records a server timestamp

#### Scenario: Operator advances in transit
- **WHEN** an authorized operator advances `shipped`
- **THEN** the Shipment becomes `in_transit` and records one deterministic local tracking event

#### Scenario: Operator records delivery
- **WHEN** an authorized operator advances `in_transit`
- **THEN** the Shipment becomes `delivered`, records `deliveredAt`, and appends one deterministic local delivery event

#### Scenario: Invalid lifecycle skip is rejected
- **WHEN** an actor attempts to move `shipment_created` directly to `in_transit` or `delivered`, or attempts any transition from `delivered`
- **THEN** the request is rejected and Shipment state, events, and timestamps remain unchanged

### Requirement: Deterministic local carrier and Tracking fixtures

Local Tracking SHALL use only server-selected or allowlisted deterministic development fixtures. The server SHALL generate or deterministically derive the local Shipment reference, carrier display label, tracking number, event labels, and safe timestamps. The tracking number MUST use an obviously local format such as `FM-LOCAL-TRK-...` or an equivalent server-owned format, and the UI SHALL identify the fixture as `Local Demo Carrier` where applicable. Fixtures MUST be visibly labeled `DEVELOPMENT / TEST ONLY` and MUST NOT claim carrier confirmation, live GPS, 17TRACK confirmation, or a real delivery scan. Browser input MUST NOT become authoritative carrier response, tracking number, shipping price, provider token, or provider credential.

#### Scenario: Local fixture creates safe tracking identity
- **WHEN** an authorized operator selects an allowlisted local carrier fixture
- **THEN** the server returns a safe local reference and deterministic tracking number with a development/test notice

#### Scenario: Browser submits provider-like tracking data
- **WHEN** the browser submits a carrier API result, arbitrary tracking number, provider token, or shipping amount
- **THEN** those values are rejected or ignored and cannot change server-owned Shipment authority

#### Scenario: Tracking identity cannot authorize access
- **WHEN** a browser knows only a public Shipment reference or local tracking number
- **THEN** that value does not authorize customer reads or operator mutations

#### Scenario: No external tracking provider is called
- **WHEN** the local Shipment advances through delivery
- **THEN** no 17TRACK, carrier API, polling, webhook, label, postage, customs, supplier, or warehouse call occurs

### Requirement: Customer tracking authority and safe projection

Customer tracking reads SHALL require the existing same-browser Local Order capability, server-side resolution of the canonical Order, and the canonical Order relationship to the Local Fulfillment/Shipment. A public Order reference alone, a public Shipment reference alone, or a local tracking number alone MUST NOT authorize a read. Customer reads SHALL be side-effect free and SHALL return only a safe projection containing public references, safe carrier display label, safe local tracking number, Shipment/tracking state, deterministic event labels/timestamps, and the development/test notice. It MUST NOT expose internal IDs, owner IDs, receipt IDs, storage keys, credentials, tokens, SQL details, or private customer content.

#### Scenario: Authorized customer reads tracking
- **WHEN** a customer with the matching same-browser capability reads an existing local Shipment
- **THEN** the server returns the safe tracking projection without exposing private identifiers or provider internals

#### Scenario: Public reference or tracking number alone cannot read tracking
- **WHEN** a separate browser or public-reference/tracking-number-only request reads a Shipment or Order tracking view
- **THEN** the server returns a bounded unavailable/unauthorized result without revealing Order, Fulfillment, or Shipment existence

#### Scenario: Customer tracking read has no mutation side effect
- **WHEN** a customer opens Order Success or a tracking view before a Shipment exists, or refreshes an existing tracking view
- **THEN** no Shipment is created, no tracking number is generated, no event is appended, and no lifecycle timestamp is changed

### Requirement: Independent operator authority and local Shipment actions

Operator Shipment mutations SHALL require both the enabled local Tracking runtime and a separate server-only local tracking/operator authority. `LOCAL_TRACKING_SOURCE=local_fake` MUST NOT itself authorize an operator. Customer same-browser capability is not required for operator actions, and customer capability MUST NOT satisfy operator authority. Operator actions SHALL be limited to `create_shipment`, `mark_shipped`, `mark_in_transit`, and `mark_delivered` for the required current state; the available next action SHALL be derived from the canonical Shipment state, not from the upstream Fulfillment state. Bounded same-origin HTTP protection SHALL allow an eligible same-origin operator GET under the existing read convention even when `Origin` is absent, while cross-site or evil-origin GET requests are rejected; operator POST mutations SHALL reject a missing or evil `Origin` and accept only the exact same-origin gate. No production Admin Auth, staff system, bulk operations, carrier management, or warehouse dashboard is introduced.

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
- **THEN** the available action is `create_shipment` when no Shipment exists, `mark_shipped` at `shipment_created`, `mark_in_transit` at `shipped`, `mark_delivered` at `in_transit`, and no further action at `delivered`

#### Scenario: Operator HTTP read and mutation origin boundaries remain distinct
- **WHEN** an operator GET is same-origin without `Origin`, or has no Fetch Metadata, or an operator POST has the exact same-origin `Origin`
- **THEN** the request passes the applicable origin gate; cross-site or evil-origin GETs and missing or evil-origin POST mutations are rejected safely

### Requirement: Tracking action idempotency and replay-first ordering

Every Shipment or Tracking mutation SHALL use an independent opaque `trackingActionId`, separate from Local Order `creationAttemptId`, Local Payment `paymentAttemptId`, and Local Fulfillment `fulfillmentActionId`. After actor authorization and canonical Order/Fulfillment identity resolution, plus canonical Shipment identity resolution when one already exists, the server MUST look up a committed action binding before checking current Shipment state or creating a new event. For `create_shipment`, the binding lookup MUST NOT require an existing Shipment identity because the initial action occurs before Shipment creation; it may match using `trackingActionId`, canonical Order identity, canonical Fulfillment identity, actor/context, action kind, and normalized relevant input. An exact equivalent replay SHALL return the original committed result even when current state has advanced; a non-equivalent create selector SHALL first check the canonical Fulfillment-to-Shipment uniqueness relationship, then validate current Order `paid`/`succeeded`, Fulfillment `quality_check`, current Shipment state where applicable, and bounded input. Action bindings MUST use server-derived actor/context identity and MUST NOT store raw capabilities, credentials, or secrets.

#### Scenario: Duplicate Shipment creation replay
- **WHEN** create action A creates Shipment S1 from `quality_check`, the response is lost, and A is retried
- **THEN** the original S1 result is returned and no S2 is created, even though a Shipment already exists

#### Scenario: New Shipment creation after exact replay binding
- **WHEN** create action B is not equivalent to committed action A and canonical Shipment S1 already exists
- **THEN** B is rejected with a bounded conflict/already-exists result without re-running create eligibility or creating S2

#### Scenario: Duplicate dispatch replay
- **WHEN** dispatch action B changes `shipment_created` to `shipped`, the response is lost, and B is retried
- **THEN** the original shipped result is returned without rejecting because the current state is already `shipped`

#### Scenario: Duplicate tracking event replay
- **WHEN** action C advances `shipped` to `in_transit` and creates one event, the response is lost, and C is retried
- **THEN** the original result is returned and the event count remains unchanged

#### Scenario: Duplicate delivery replay
- **WHEN** an action advances `in_transit` to `delivered`, the response is lost, and the same selector is retried
- **THEN** the original delivered result is returned without duplicating the event or changing `deliveredAt`

### Requirement: Atomicity and concurrency safety

Shipment action binding, canonical Fulfillment-to-Shipment uniqueness relationship, Shipment lifecycle transition, tracking event creation, and related timestamps SHALL commit atomically in the canonical process-memory aggregate. A failed commit MUST leave all five unchanged. Concurrent Shipment creation for one canonical Order/Fulfillment may create at most one Shipment. Concurrent lifecycle actions MUST obey the transition order and MUST NOT skip `in_transit` or duplicate terminal events.

#### Scenario: Concurrent Shipment creation
- **WHEN** two different create selectors race for the same paid/succeeded Order at Fulfillment `quality_check`
- **THEN** at most one canonical Shipment is created and the other receives a bounded conflict or existing-result outcome

#### Scenario: Concurrent event transition
- **WHEN** `mark_in_transit` and `mark_delivered` race from `shipped`
- **THEN** only the valid current-state transition succeeds and delivery cannot skip the required `in_transit` transition

#### Scenario: Atomic failure
- **WHEN** a Shipment transition, event, timestamp, or action binding cannot commit
- **THEN** Shipment state, events, timestamps, and binding remain unchanged

### Requirement: Process-memory restart and production stop gate

Local Shipment, Tracking events, timestamps, and action bindings SHALL be process-memory only. A restart MUST lose the local workflow and MUST NOT resurrect it from public references, tracking numbers, browser storage, filesystem, SQLite, Supabase, or provider storage. The capability SHALL create no production Shipment/Tracking database records, migration, provider call, payment change, storage object, supplier handoff, email, DNS, Cloudflare, or deployment side effect. `delivered` is the terminal boundary for this change.

#### Scenario: Restart fails closed
- **WHEN** a local Shipment reaches `shipped` or `delivered` and the process restarts
- **THEN** old customer/operator references return bounded unavailable and no Shipment or event state is reconstructed

#### Scenario: Delivered is terminal
- **WHEN** a local Shipment reaches `delivered`
- **THEN** the local Tracking workflow stops and no return, refund, reshipment, exception, or shipment-side effect is created

#### Scenario: No production side effect
- **WHEN** the local workflow advances from `quality_check` through `delivered`
- **THEN** only process-memory local state changes and Local Order/Payment/Fulfillment authorities remain untouched

### Requirement: No financial, address, provider, or production shipping authority

Tracking SHALL not recalculate shipping price, coupon, tax, order total, payment amount, or currency. Destination data SHALL come from the protected immutable Local Order snapshot; Tracking SHALL not accept browser changes to address, phone, shipping amount, discount, tax, or payment amount and SHALL not re-read Cart data. Production shipping, real carrier integration, labels, postage, customs, returns, delivery exceptions, notifications, and 17TRACK belong to later changes.

#### Scenario: Browser submits financial or address mutation
- **WHEN** a browser submits a new address, shipping amount, discount, tax, payment amount, or Cart identity during Tracking
- **THEN** the request is rejected or ignored and the canonical Order snapshot remains unchanged

#### Scenario: Protected destination is used
- **WHEN** an authorized operator creates a local Shipment
- **THEN** destination eligibility is derived from protected canonical Order facts and no mutable Tracking address copy is accepted
