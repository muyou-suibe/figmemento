## MODIFIED Requirements

### Requirement: Explicit local Fulfillment runtime and dependency gate

Local Fulfillment depends on the canonical Local Order and Local Payment capabilities and is available only in an explicitly selected development/test runtime with `LOCAL_FULFILLMENT_SOURCE=local_fake` or `local_persistent`. Every Fulfillment mutation MUST still verify canonical local `paid`/`succeeded` authority, with equivalent committed replays handled under the existing replay-first contract. The capability MUST NOT bypass payment or activate from a production, disabled, or absent source selection. `local_persistent` MUST also be rejected in staging and SHALL use the independent Docker local Supabase PostgreSQL and private Storage project shared with its Order, Payment, item/media, and required authorization authorities. Mode/project mismatch or database/Storage failure MUST fail closed without a fake workflow or alternate data source. `local_fake` retains its process-memory behavior.

#### Scenario: Canonical dependencies are available
- **WHEN** the canonical Local Order and Local Payment capabilities are available and the Fulfillment source is explicitly selected in development/test
- **THEN** Local Fulfillment may evaluate its selected local workflow with a development/test notice, while every mutation still requires canonical paid/succeeded authority and separate actor authorization; `local_fake` remains process-memory

#### Scenario: Explicit local runtime is selected after dependencies pass
- **WHEN** the approved upstream local runtime state exists and the development/test Fulfillment source is explicitly enabled
- **THEN** local Fulfillment may evaluate its selected local workflow with a development/test notice without changing fake persistence behavior

#### Scenario: Production or absent source selection
- **WHEN** the runtime is production or the local Fulfillment source is absent
- **THEN** Fulfillment is unavailable and no fixture, provider, database, or fallback workflow is activated

#### Scenario: Persistent project or environment is invalid
- **WHEN** persistent Fulfillment is selected in staging, against a non-local project, or with a required memory/different-project authority
- **THEN** Fulfillment fails closed without creating or mutating an aggregate

### Requirement: Immutable Order facts and one canonical Fulfillment aggregate

Fulfillment MUST preserve the Local Order's immutable purchase facts, including Product, Variant/SKU, selected options, quantity, price/currency, commercial snapshot, contact/address, customization revision/values, controlled image receipt references and crop facts, `createdAt`, and Order identity. Fulfillment-specific mutable state SHALL live in one canonical aggregate, process-memory for `local_fake` or durable in the same local project for `local_persistent`, and MUST NOT create conflicting copies of Order lifecycle or business facts. Fulfillment MAY change only its own lifecycle, photo-review decisions, preview metadata/manifests, revision counters, decision timestamps, and bounded audit/action records. Purchased per-item preview and physical/digital rules SHALL remain immutable; current Catalog changes MUST NOT weaken them.

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

The allowed transitions SHALL be:

- paid/succeeded canonical Local Order → `photo_review` only through an authorized operator `enter_photo_review` action;
- `photo_review` → `preview_pending` when an operator publishes the initial preview;
- `preview_pending` → `preview_approved` when the customer approves the current preview;
- `preview_pending` → `preview_revision_requested` when the customer requests a permitted revision;
- `preview_revision_requested` → `preview_pending` when an operator publishes the next preview;
- `preview_approved` → `in_production` through an operator action;
- `in_production` → `quality_check` through an operator action.

In `local_persistent`, production SHALL additionally require completed applicable photo review and approval of the latest complete manifest for every Order item whose purchased configuration requires preview. Only when no item requires preview MAY an authorized operator move from `photo_review` directly to `in_production`, after all applicable photo-review and paid gates pass, without inventing preview approval. An explicitly authorized, audited Admin timeout confirmation MAY move a current `preview_pending` manifest to `preview_approved` only under the separate deadline contract; it MUST NOT be recorded as customer approval. These exceptions MUST NOT change `local_fake` transitions. All other skipped, backward, stale, unpaid, unauthorized, or shipping transitions MUST fail closed. `quality_check` is terminal in this capability; `shipped`, `in_transit`, and `delivered` belong to the separate Tracking capability and are not Fulfillment transitions.

#### Scenario: Operator enters Photo Review
- **WHEN** an authorized local operator admits a paid/succeeded canonical Local Order through `enter_photo_review`
- **THEN** its canonical Fulfillment state becomes `photo_review`

#### Scenario: Operator publishes initial preview
- **WHEN** an authorized operator publishes the initial deterministic preview from `photo_review` and any applicable persistent review/manifest checks pass
- **THEN** the state becomes `preview_pending` with server-generated preview version 1

#### Scenario: Preview approval starts the approved path
- **WHEN** the customer approves the current preview version from `preview_pending`
- **THEN** the state becomes `preview_approved` and production is not started automatically

#### Scenario: Unapproved production is rejected
- **WHEN** a customer or operator attempts to start production from `photo_review`, `preview_pending`, or `preview_revision_requested` in `local_fake` or for a persistent Order requiring preview
- **THEN** the transition is rejected and the state remains unchanged

#### Scenario: Quality Check is terminal for Day 4
- **WHEN** an operator advances `in_production` to `quality_check`
- **THEN** the state becomes `quality_check` and no shipping transition is available in this capability

#### Scenario: No item requires preview
- **WHEN** an authorized persistent operator starts production for a paid Order whose purchased item configurations all disable preview and applicable photo review has passed
- **THEN** production may start without generating or approving a dummy preview and an audit fact records that preview was not required

#### Scenario: Review is still incomplete
- **WHEN** a persistent operator attempts production while an applicable photo review is pending or rejected
- **THEN** production is denied even if payment succeeded and a preview approval exists

### Requirement: Deterministic private Production Preview and revision contract

Each preview SHALL have a server-generated `previewVersion` and safe provider-neutral metadata. The initial preview is version 1 and does not consume revision allowance. At most two customer Request Revision actions are permitted PER ORDER, not per item, file, preview image, session, or restart, producing the deterministic sequence v1, v2, and v3 when an operator publishes the corresponding revised previews. A revision request MUST enter `preview_revision_requested`; it MUST NOT make the stale preview immediately approvable. Only an operator publication returns the workflow to `preview_pending`. Publication and Admin timeout confirmation MUST NOT reset or bypass the two-request count.

In `local_fake`, preview metadata MAY be a deterministic local fixture label/placeholder and MUST clearly state development/test-only behavior when no real preview file exists. In `local_persistent`, each publication SHALL create a new immutable manifest binding the canonical Order, version, and private preview media to each exact stable item requiring preview. A placeholder, missing item, unrelated item, or unverified media MUST NOT satisfy persistent preview approval. Items with preview disabled MUST NOT be required to supply preview media. The system MUST NOT claim to have generated a real 3D model, production artwork, supplier file, or manufacturing result merely by storing a preview. It MUST NOT expose original uploads as public URLs, storage keys, provider paths, or unguarded preview URLs.

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

#### Scenario: Manifest omits a required item
- **WHEN** a persistent publication lacks private preview media for any item whose purchased configuration requires preview
- **THEN** publication fails without advancing the version or making the incomplete manifest approvable

#### Scenario: Multiple previews do not consume revision allowance
- **WHEN** an initial complete manifest contains several item-specific preview images
- **THEN** those images collectively belong to v1 and consume zero customer revision requests

#### Scenario: Latest manifest replaces approval eligibility not history
- **WHEN** an operator publishes v2 or v3 after a permitted revision request
- **THEN** the new manifest becomes the only approvable version, the older immutable manifest remains historical, and no earlier approval authorizes production

### Requirement: Customer preview authority and optimistic version checks

Customer actions SHALL require the same-browser Local Order capability, any required persistent member-session binding, and, for a new action, the current canonical Fulfillment state. Customer reads MUST be side-effect free and MUST NOT create or admit a Fulfillment aggregate. Customer Approve and Request Revision MAY submit an `expectedPreviewVersion` only as an optimistic concurrency selector; the server MUST compare it with the current version and MUST NOT treat it as authoritative state. In `local_persistent`, this guard SHALL identify the current immutable complete Order-wide manifest and MUST be required for every new approval or revision action. An exact committed action replay is resolved before new-action state/version eligibility is evaluated but after fresh actor authorization. Customer actions MUST be limited to reading the safe preview, approving the current preview, or requesting a bounded plain-text revision note. Customers MUST NOT create the initial Fulfillment aggregate, publish previews, start production, mark quality check, or change Order/Product/SKU/quantity/price/customization facts.

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

#### Scenario: Stale revision or missing persistent version
- **WHEN** a new persistent revision/approval targets an old manifest or omits the required expected version
- **THEN** the server rejects the action without consuming a revision allowance or changing approval

### Requirement: Independent operator authority and local actions

`LOCAL_FULFILLMENT_SOURCE=local_fake` or `local_persistent` only enables the development/test Fulfillment runtime; it MUST NOT by itself authorize an operator. Operator mutations SHALL require both the permitted runtime selection and a separate server-only development/test operator authorization seam. A customer Order capability MUST NOT satisfy operator authority, and operator input MUST NOT forge customer approval. Operator actions SHALL be limited to entering Photo Review, publishing initial/revised previews, starting production only from `preview_approved`, and advancing `in_production` to `quality_check`, except for the explicit persistent no-preview production path and separately audited existing-Admin timeout confirmation. Persistent review decisions and preview publication MUST use the shared canonical command boundary. No production Auth, Supabase Auth, new staff system, new dual-Admin role model, bulk operations, supplier-management system, or remote admin workflow is introduced. Existing Admin authorization MAY authorize bounded local commands but MUST NOT bypass customer revision limits or write lifecycle fields directly.

#### Scenario: Operator publishes preview
- **WHEN** an authorized local operator publishes a valid initial or revised preview in the required state
- **THEN** the server creates the next server-generated version and applies the allowed transition

#### Scenario: Operator starts production only after approval
- **WHEN** an authorized operator starts production from `preview_approved` and all applicable persistent paid/review/manifest gates pass
- **THEN** the state becomes `in_production`

#### Scenario: Operator skips approval
- **WHEN** an operator tries to start production before `preview_approved` for an Order requiring preview, or outside the explicit persistent no-preview exception
- **THEN** the request is rejected and no production state is created

#### Scenario: Operator marks Quality Check
- **WHEN** an authorized operator advances `in_production`
- **THEN** the state becomes `quality_check` and remains within the local Day 4 boundary

### Requirement: Fulfillment idempotency, concurrency, and atomicity

Every customer or operator Fulfillment mutation SHALL use a distinct opaque `fulfillmentActionId`, separate from Local Order `creationAttemptId` and Local Payment `paymentAttemptId`. After actor authorization and canonical Order/Fulfillment identity resolution, the server MUST first look up a committed action binding. When the selector, canonical Order, actor kind/authorized actor context, action kind, expected preview version where applicable, and normalized relevant input are equivalent, the server SHALL return the original committed result and MUST NOT re-run current lifecycle, preview-version, revision-limit, or transition eligibility. Only when no equivalent committed binding exists may the server validate the current canonical paid/succeeded Order, current Fulfillment lifecycle, expected version, revision limit, and bounded input before staging a new action. The binding SHALL capture the canonical precondition/context at the original commit; `relevant current state` MUST NOT mean that a later replay must still equal the old pre-transition state. Raw customer capabilities, operator credentials, and secrets MUST NOT be stored in the binding. New conflicting selectors, stale version guards, invalid state transitions, and revision-limit races MUST fail safely. A state transition and its action binding/preview record SHALL commit atomically in the canonical aggregate. In `local_persistent`, that atomic unit SHALL also include the manifest/version, revision counter, photo-review/approval decisions, timeout-confirmation decision where applicable, and audit facts in one database transaction, consistent across application instances and restarts. Private object writes are not part of a distributed database transaction; failed publication MUST NOT make an incomplete manifest current.

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

#### Scenario: Restart replay does not consume another revision
- **WHEN** a persistent revision or publication has committed and its authorized equivalent action is retried after restart
- **THEN** the original result is returned with the same Order-wide count and version and no duplicate audit mutation

#### Scenario: Concurrent publication and approval
- **WHEN** two instances race a new publication or revision against approval of an older manifest
- **THEN** only transitions valid for the serialized canonical version commit and stale approval cannot authorize production

### Requirement: Process-memory restart and production stop gate

In `local_fake`, Fulfillment aggregate state, preview records, revision records, operator bindings, and customer action bindings SHALL be process-memory only. A fake runtime restart MUST lose Fulfillment state and MUST NOT resurrect it from Local Order public references, browser data, localStorage, filesystem, database, or provider storage; because its Local Order is also process-memory, the workflow fails closed after restart. Successful fake Fulfillment MUST create no Supabase record, migration, production Order/OrderItem/Fulfillment record, storage object, supplier/factory/ERP call, payment call, shipping/tracking state, email, DNS, Cloudflare, or deployment side effect. The explicit `local_persistent` exception SHALL retain local aggregate/manifest/revision/decision/audit/action state and private preview media in the independent local project's commerce namespace and private Storage. It MUST NOT touch legacy `orders/order_items`, perform C1 backfill or Phase C production migration, select production Storage, or change `/api/orders` normalized 503 and old-path stop gates. Neither mode SHALL invoke real production, supplier, payment, carrier, email, or deployment services.

#### Scenario: Restart loses workflow
- **WHEN** the `local_fake` process restarts after a preview or quality-check transition
- **THEN** the customer and operator receive a bounded unavailable result and no workflow state is reconstructed

#### Scenario: Quality Check does not start shipping
- **WHEN** a local workflow reaches `quality_check`
- **THEN** it stops at the Fulfillment boundary; the separate Tracking capability must require `quality_check` before creating any shipment, but no shipment is created here

#### Scenario: No production side effect
- **WHEN** the full `local_fake` workflow reaches Quality Check
- **THEN** only process-memory local state changes and all production/provider/database side-effect boundaries remain untouched

#### Scenario: Persistent workflow resumes with its decisions
- **WHEN** an authorized actor reads the same persistent Order after application restart
- **THEN** the stored review, latest manifest, revision count, approval kind, lifecycle, and audit history remain authoritative without production activation or reconstruction from memory

## ADDED Requirements

### Requirement: Every local write entrance shares production eligibility gates

All persistent customer, Admin, local operator, supplier, and tracking write entry points SHALL enforce the same canonical command eligibility and actor authorization on the server, not merely hide controls. No route, direct status mutation, supplier assignment/admission, or tracking helper SHALL bypass paid/succeeded, applicable photo review, latest required preview approval, revision limits, or Quality Check. Preview requirements SHALL come from the immutable configuration of each item; preview-disabled items MUST NOT acquire unnecessary preview gates, while every required item MUST be covered by the latest approved immutable manifest. Physical and digital fulfillment SHALL use their respective purchased item classifications; mixed Orders MUST satisfy both applicable branches independently. Unadapted supplier entry points MAY remain unavailable in persistent mode, but MUST explicitly fail closed without writing a new Order/workflow through memory and MUST be disclosed as not restored.

#### Scenario: Admin or supplier tries direct production mutation
- **WHEN** any Admin, operator, supplier, or alternate API attempts to start production without paid state, passed applicable photo review, or latest complete required preview approval
- **THEN** the shared server boundary rejects the action without changing production state regardless of UI visibility

#### Scenario: One required item remains unapproved
- **WHEN** a mixed-item Order has preview media or approval only for some preview-required items
- **THEN** production remains blocked until the latest complete manifest covers every required item

#### Scenario: Supplier entry is still memory-only
- **WHEN** an unadapted supplier entry receives a persistent Order operation
- **THEN** it returns an explicit unsupported/unavailable result, writes no memory Order or supplier workflow, and documentation identifies this acceptance limit

#### Scenario: Quality Check is bypassed at shipping entry
- **WHEN** a tracking, Admin, or supplier entry attempts shipment before canonical Quality Check
- **THEN** the shared server gate rejects it without creating shipment or dispatch state

### Requirement: Audited Admin timeout confirmation is not customer approval

In `local_persistent`, the existing authorized Admin MAY explicitly confirm the current complete pending preview only after its server-owned configured confirmation deadline has passed. The server MUST verify paid/succeeded, passed applicable photo review, current manifest/version, no pending revision request, and a non-empty bounded reason, then atomically persist the actual Admin actor, reason, server timestamp, deadline evidence, manifest/version, distinct timeout-confirmation decision, and idempotency/audit binding. A missing deadline MUST fail closed. This action SHALL NOT impersonate a customer, create a customer approval record, generate a new preview version, reset/increase revision allowance, or bypass the two customer requests per Order. It SHALL use existing Admin authority without introducing two Admin roles. The decision MAY satisfy the preview gate only for that exact current manifest; production still requires a separate authorized command and all other gates.

#### Scenario: Valid timeout confirmation
- **WHEN** the existing authorized Admin confirms the current complete pending preview after its stored deadline with a valid version and bounded reason and all other gates pass
- **THEN** one audited Admin timeout decision commits for that manifest, approval eligibility is satisfied without customer impersonation, and production does not start automatically

#### Scenario: Deadline or reason is invalid
- **WHEN** the deadline is absent or not passed, the reason is blank/invalid, the version is stale, or a revision is pending
- **THEN** confirmation fails without changing approval, version, revision count, or lifecycle

#### Scenario: Admin tries to bypass two-request limit
- **WHEN** an Admin timeout action or publication attempts to reset the count, create a third customer revision, or produce v4 outside the permitted sequence
- **THEN** the mutation is rejected and the Order-wide count remains at most two

#### Scenario: Timeout response is lost
- **WHEN** a timeout confirmation commits and the same authorized action is retried after a lost response or restart
- **THEN** the original distinct Admin decision is returned without a second audit mutation or any customer approval record