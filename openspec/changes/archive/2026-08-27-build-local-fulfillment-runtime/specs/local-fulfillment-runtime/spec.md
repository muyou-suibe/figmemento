## Purpose

Provide a deterministic development/test-only fulfillment workflow for an authorized locally paid Order, covering photo review, protected production-preview approval, bounded revisions, production start, and terminal quality check without creating production fulfillment or shipping side effects.

## ADDED Requirements

### Requirement: Explicit local Fulfillment runtime and dependency gate

Local Fulfillment depends on the canonical Local Order and Local Payment capabilities and is available only in an explicitly selected development/test runtime such as `LOCAL_FULFILLMENT_SOURCE=local_fake`. Every Fulfillment mutation MUST still verify the canonical local `paid`/`succeeded` state. This capability MUST NOT modify either upstream capability, bypass payment, or activate from a production or absent source selection.

#### Scenario: Canonical dependencies are available
- **WHEN** the canonical Local Order and Local Payment capabilities are available and the Fulfillment source is explicitly selected in development/test
- **THEN** Local Fulfillment may evaluate its process-memory workflow with a development/test notice, while every mutation still requires canonical paid/succeeded authority and separate actor authorization

#### Scenario: Explicit local runtime is selected after dependencies pass
- **WHEN** the approved upstream local runtime state exists and the development/test Fulfillment source is explicitly enabled
- **THEN** local Fulfillment may evaluate its process-memory workflow with a development/test notice

#### Scenario: Production or absent source selection
- **WHEN** the runtime is production or the local Fulfillment source is absent
- **THEN** Fulfillment is unavailable and no fixture, provider, database, or fallback workflow is activated

### Requirement: Paid Local Order entry and server authority

Every customer and operator Fulfillment action SHALL freshly resolve the canonical Local Order and verify that its payment lifecycle is exactly `orderStatus = paid` and `paymentStatus = succeeded`. The initial Fulfillment aggregate SHALL be created only by an authorized local operator through `enter_photo_review`; the operator uses the separate server-only operator authority and MUST NOT need the customer's same-browser capability. Customer actions, after the aggregate and applicable preview state exist, MUST require the existing valid same-browser Local Order capability. A public reference, browser-submitted `paid` flag, payment status, fulfillment status, preview status, email, Cart identity, or prior browser projection MUST NOT authorize Fulfillment. `pending_payment`/`pending`, `payment_failed`/`failed`, and cancelled attempts MUST be rejected without creating Fulfillment state.

#### Scenario: Authorized operator admits a locally paid Order
- **WHEN** an authorized local operator resolves a canonical Local Order in `paid`/`succeeded` and submits `enter_photo_review`
- **THEN** the server creates the canonical local Fulfillment aggregate in `photo_review` with no preview version yet

#### Scenario: Customer capability cannot create initial Fulfillment
- **WHEN** a customer same-browser request targets a paid canonical Local Order before a Fulfillment aggregate exists
- **THEN** the request is rejected and no Fulfillment aggregate or `photo_review` state is created

#### Scenario: Unpaid Order is submitted
- **WHEN** an authorized request targets `pending_payment`/`pending` or `payment_failed`/`failed`
- **THEN** the request is rejected safely and no Fulfillment, preview, production, or quality state is created

#### Scenario: Browser forges payment or fulfillment state
- **WHEN** the browser submits `paid = true`, `paymentStatus = succeeded`, `fulfillmentStatus`, or `previewStatus`
- **THEN** those fields are rejected or ignored and cannot change the server-owned entry decision

#### Scenario: Customer public reference lacks same-browser capability
- **WHEN** a customer request knows a valid public Order reference but lacks the matching same-browser Local Order capability
- **THEN** the server returns a bounded unavailable/unauthorized result without revealing Order or Fulfillment existence and performs no customer action

#### Scenario: Operator uses separate authority
- **WHEN** an operator mutation supplies a public Order reference, has valid separate server-only operator authority, and the canonical Local Order is `paid`/`succeeded`
- **THEN** the mutation may perform only an approved operator action and does not require the customer's same-browser capability

#### Scenario: Operator public reference lacks operator authority
- **WHEN** an operator mutation supplies a public Order reference but lacks valid separate server-only operator authority
- **THEN** the mutation is rejected safely before privileged Fulfillment construction; a customer capability cannot substitute for operator authority

### Requirement: Immutable Order facts and one canonical Fulfillment aggregate

Fulfillment MUST preserve the Local Order's immutable purchase facts, including Product, Variant/SKU, selected options, quantity, price/currency, commercial snapshot, contact/address, customization revision/values, controlled image receipt references and crop facts, `createdAt`, and Order identity. Fulfillment-specific mutable state SHALL live in one canonical process-memory Fulfillment aggregate and MUST NOT create conflicting copies of Order lifecycle or business facts. Fulfillment MAY change only its own lifecycle, preview metadata, revision counters, and decision timestamps.

#### Scenario: Catalog or Cart changes after payment
- **WHEN** Product, SKU, Cart, or current customization data changes after the Local Order is paid
- **THEN** the Fulfillment aggregate continues to use the original protected Order snapshot and does not rewrite purchased facts

#### Scenario: Fulfillment transition preserves facts
- **WHEN** the workflow advances through review, preview, production, and quality check
- **THEN** the original Order facts remain deep-equal and only Fulfillment-specific state changes

#### Scenario: No duplicate lifecycle store
- **WHEN** an existing protected Order read and a Fulfillment read occur after a transition
- **THEN** both derive the result from the canonical runtime aggregate/port and no independent mutable Order or Fulfillment copy can diverge

### Requirement: Local Fulfillment lifecycle and fail-closed transitions

The local Fulfillment lifecycle SHALL use these states:

- `photo_review`
- `preview_pending`
- `preview_revision_requested`
- `preview_approved`
- `in_production`
- `quality_check`

The only allowed transitions are:

- paid/succeeded canonical Local Order → `photo_review` only through an authorized operator `enter_photo_review` action;
- `photo_review` → `preview_pending` when an operator publishes the initial preview;
- `preview_pending` → `preview_approved` when the customer approves the current preview;
- `preview_pending` → `preview_revision_requested` when the customer requests a permitted revision;
- `preview_revision_requested` → `preview_pending` when an operator publishes the next preview;
- `preview_approved` → `in_production` through an operator action;
- `in_production` → `quality_check` through an operator action.

All skipped, backward, stale, unpaid, unauthorized, or shipping transitions MUST fail closed. `quality_check` is terminal in this capability; `shipped`, `in_transit`, and `delivered` are not implemented.

#### Scenario: Operator enters Photo Review
- **WHEN** an authorized local operator admits a paid/succeeded canonical Local Order through `enter_photo_review`
- **THEN** its canonical Fulfillment state becomes `photo_review`

#### Scenario: Operator publishes initial preview
- **WHEN** an authorized operator publishes the initial deterministic preview from `photo_review`
- **THEN** the state becomes `preview_pending` with server-generated preview version 1

#### Scenario: Preview approval starts the approved path
- **WHEN** the customer approves the current preview version from `preview_pending`
- **THEN** the state becomes `preview_approved` and production is not started automatically

#### Scenario: Unapproved production is rejected
- **WHEN** a customer or operator attempts to start production from `photo_review`, `preview_pending`, or `preview_revision_requested`
- **THEN** the transition is rejected and the state remains unchanged

#### Scenario: Quality Check is terminal for Day 4
- **WHEN** an operator advances `in_production` to `quality_check`
- **THEN** the state becomes `quality_check` and no shipping transition is available in this capability

### Requirement: Deterministic private Production Preview and revision contract

Each preview SHALL have a server-generated `previewVersion` and safe provider-neutral metadata. The initial preview is version 1 and does not consume revision allowance. At most two customer Request Revision actions are permitted, producing the deterministic sequence v1, v2, and v3 when an operator publishes the corresponding revised previews. A revision request MUST enter `preview_revision_requested`; it MUST NOT make the stale preview immediately approvable. Only an operator publication returns the workflow to `preview_pending`.

Preview metadata MAY be a deterministic local fixture label/placeholder and MUST clearly state development/test-only behavior when no real preview file exists. The system MUST NOT claim to have generated a real 3D model, production artwork, supplier file, or manufacturing result. It MUST NOT expose original uploads as public URLs, storage keys, provider paths, or unguarded preview URLs.

#### Scenario: Initial preview is version 1
- **WHEN** an operator publishes the first preview from `photo_review`
- **THEN** the server creates version 1, sets `preview_pending`, and leaves revision allowance at two

#### Scenario: First revision request
- **WHEN** a customer requests revision for the current preview with a valid version guard and bounded note
- **THEN** revision requests used becomes 1, state becomes `preview_revision_requested`, and the old preview cannot be approved as current

#### Scenario: Revised preview publication
- **WHEN** an operator publishes the next preview after revision request 1 or 2
- **THEN** the server generates the next version (v2 or v3) and returns state to `preview_pending`

#### Scenario: Second revision request
- **WHEN** the customer requests revision for v2
- **THEN** revision requests used becomes 2 and the operator may publish v3

#### Scenario: Third revision request is rejected
- **WHEN** revision requests used is already 2 and the customer requests another revision
- **THEN** the request is rejected server-side and the count never exceeds 2

### Requirement: Customer preview authority and optimistic version checks

Customer actions SHALL require the same-browser Local Order capability and, for a new action, the current canonical Fulfillment state. Customer reads MUST be side-effect free and MUST NOT create or admit a Fulfillment aggregate. Customer Approve and Request Revision MAY submit an `expectedPreviewVersion` only as an optimistic concurrency selector; the server MUST compare it with the current version and MUST NOT treat it as authoritative state. An exact committed action replay is resolved before new-action state/version eligibility is evaluated. Customer actions MUST be limited to reading the safe preview, approving the current preview, or requesting a bounded plain-text revision note. Customers MUST NOT create the initial Fulfillment aggregate, publish previews, start production, mark quality check, or change Order/Product/SKU/quantity/price/customization facts.

#### Scenario: Approve current preview
- **WHEN** an authorized customer submits approval for the current preview version
- **THEN** the server transitions `preview_pending` to `preview_approved`

#### Scenario: Stale approval
- **WHEN** a customer submits approval for v1 while the canonical current preview is v2
- **THEN** the server returns a bounded conflict and leaves the Fulfillment state unchanged

#### Scenario: Bounded revision note
- **WHEN** an authorized customer submits a revision note
- **THEN** the server accepts only bounded plain text with safe length, stores it as preview feedback, and does not treat it as HTML, payment, or Order authority

#### Scenario: Customer attempts operator action
- **WHEN** a customer capability attempts to publish a preview, start production, or mark quality check
- **THEN** the request is rejected before the operator transition is constructed

### Requirement: Independent operator authority and local actions

`LOCAL_FULFILLMENT_SOURCE=local_fake` only enables the development/test Fulfillment runtime; it MUST NOT by itself authorize an operator. Operator mutations SHALL require both that runtime selection and a separate server-only development/test operator authorization seam. A customer Order capability MUST NOT satisfy operator authority, and operator input MUST NOT forge customer approval. Operator actions SHALL be limited to entering Photo Review, publishing initial/revised previews, starting production only from `preview_approved`, and advancing `in_production` to `quality_check`. No production Auth, Supabase Auth, staff system, roles, bulk operations, supplier management, or remote admin workflow is introduced.

#### Scenario: Operator publishes preview
- **WHEN** an authorized local operator publishes a valid initial or revised preview in the required state
- **THEN** the server creates the next server-generated version and applies the allowed transition

#### Scenario: Operator starts production only after approval
- **WHEN** an authorized operator starts production from `preview_approved`
- **THEN** the state becomes `in_production`

#### Scenario: Operator skips approval
- **WHEN** an operator tries to start production before `preview_approved`
- **THEN** the request is rejected and no production state is created

#### Scenario: Operator marks Quality Check
- **WHEN** an authorized operator advances `in_production`
- **THEN** the state becomes `quality_check` and remains within the local Day 4 boundary

### Requirement: Fulfillment idempotency, concurrency, and atomicity

Every customer or operator Fulfillment mutation SHALL use a distinct opaque `fulfillmentActionId`, separate from Local Order `creationAttemptId` and Local Payment `paymentAttemptId`. After actor authorization and canonical Order/Fulfillment identity resolution, the server MUST first look up a committed action binding. When the selector, canonical Order, actor kind/authorized actor context, action kind, expected preview version where applicable, and normalized relevant input are equivalent, the server SHALL return the original committed result and MUST NOT re-run current lifecycle, preview-version, revision-limit, or transition eligibility. Only when no equivalent committed binding exists may the server validate the current canonical paid/succeeded Order, current Fulfillment lifecycle, expected version, revision limit, and bounded input before staging a new action. The binding SHALL capture the canonical precondition/context at the original commit; `relevant current state` MUST NOT mean that a later replay must still equal the old pre-transition state. Raw customer capabilities, operator credentials, and secrets MUST NOT be stored in the binding. New conflicting selectors, stale version guards, invalid state transitions, and revision-limit races MUST fail safely. A state transition and its action binding/preview record SHALL commit atomically in the canonical aggregate.

#### Scenario: Duplicate approval
- **WHEN** `preview_pending` v2 is approved by action A, the state becomes `preview_approved`, the response is lost, and the customer retries action A
- **THEN** the server returns the original approval result, keeps the state `preview_approved`, and does not reject or transition twice because the current state is no longer `preview_pending`

#### Scenario: Duplicate revision request
- **WHEN** `preview_pending` v1 has `revisionRequestsUsed = 0`, revision action R commits `preview_revision_requested` with count 1, the response is lost, and the customer retries R
- **THEN** the server returns the original revision result and revision count remains 1 rather than becoming 2

#### Scenario: Concurrent revision limit
- **WHEN** revision count is 1 and two different revision actions race
- **THEN** at most one action advances the count to 2 and the other receives a bounded conflict or limit result; count never becomes 3

#### Scenario: Duplicate operator publication
- **WHEN** publication action P commits `preview_revision_requested` to `preview_pending` with v2, the response is lost, and the operator retries P
- **THEN** the original v2 result is returned without creating v3 or re-running publication eligibility

#### Scenario: Atomic failure
- **WHEN** a Fulfillment transition or preview record cannot commit
- **THEN** the action binding, preview record, revision count, and canonical Fulfillment state remain unchanged

### Requirement: Safe customer and operator projections

Customer projections SHALL contain only the public Order reference, local Fulfillment state, current preview version, safe preview metadata, revision requests used/remaining, allowed customer actions, safe timestamps, and development/test notice. Operator projections MAY include bounded operational state required for local actions but MUST NOT expose secrets or provider internals. Neither projection SHALL expose internal Order IDs, owner IDs, receipt IDs, storage keys, bucket/provider locators, private object paths, operator credentials, internal notes, factory data, SQL diagnostics, or customer-private upload content.

#### Scenario: Protected customer preview read
- **WHEN** an authorized customer reads the current preview
- **THEN** only the safe preview projection is returned and private upload/storage internals are omitted

#### Scenario: Customer success/read endpoint has no admission side effect
- **WHEN** a customer opens the Order Success boundary or reads a Fulfillment endpoint before an operator has admitted the paid Order
- **THEN** the read is side-effect free and returns a bounded unavailable result without creating `photo_review` or any Fulfillment aggregate

#### Scenario: Unauthorized preview read
- **WHEN** a separate browser or public reference-only request reads a preview
- **THEN** the server returns a uniform unavailable result without existence or private-data leakage

#### Scenario: Operator projection
- **WHEN** an authorized local operator reads a Fulfillment record
- **THEN** the response contains only bounded local operational fields and no credentials, provider locators, supplier data, or private customer content beyond already-authorized local review facts

### Requirement: Process-memory restart and production stop gate

Fulfillment aggregate state, preview records, revision records, operator bindings, and customer action bindings SHALL be process-memory only. A runtime restart MUST lose Fulfillment state and MUST NOT resurrect it from Local Order public references, browser data, localStorage, filesystem, database, or provider storage; because Local Order is also process-memory, the workflow fails closed after restart. Successful local Fulfillment MUST create no Supabase record, migration, production Order/OrderItem/Fulfillment record, storage object, supplier/factory/ERP call, payment call, shipping/tracking state, email, DNS, Cloudflare, or deployment side effect.

#### Scenario: Restart loses workflow
- **WHEN** the process restarts after a preview or quality-check transition
- **THEN** the customer and operator receive a bounded unavailable result and no workflow state is reconstructed

#### Scenario: Quality Check does not start shipping
- **WHEN** a local workflow reaches `quality_check`
- **THEN** it stops at the Day 4 boundary; a future Day 5 tracking change must require `quality_check` before creating any shipment, but no shipment is created here

#### Scenario: No production side effect
- **WHEN** the full local workflow reaches Quality Check
- **THEN** only process-memory local state changes and all production/provider/database side-effect boundaries remain untouched
