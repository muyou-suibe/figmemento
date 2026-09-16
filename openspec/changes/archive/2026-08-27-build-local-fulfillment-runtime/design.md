## Context

The repository's Local Order runtime has one process-memory repository, one protected same-browser read boundary, immutable commercial/customization snapshots, and the canonical local Payment extension provides the `paid`/`succeeded` entry state. The Local Order and Local Payment changes are complete, synced, archived, and available through their canonical specs. This change now provides one process-memory Local Fulfillment aggregate and deterministic local Production Preview metadata; it remains development/test-only and is not a durable production workflow.

The existing Supabase `orders.fulfillment_status`, `order_status_logs`, `review_status`, tracking fields, `AdminPhotoReview`, `AdminOrderControls`, `AdminTrackingControls`, and related routes are legacy/production-oriented paths. `app/domain/catalog/fulfillment.ts` is Product FulfillmentConfig, not an Order Fulfillment lifecycle. The CustomerUpload preview route provides useful protected-object/privacy conventions but is not a Production Preview workflow.

## Goals / Non-Goals

**Goals:**

- Define one local canonical Fulfillment aggregate for a currently paid Local Order.
- Separate payment lifecycle from Fulfillment lifecycle while preserving the canonical Local Order snapshot.
- Prove Photo Review, protected deterministic preview, customer approval, two bounded revision requests, production start, and Quality Check.
- Separate customer same-browser authority from development/test operator authority.
- Provide independent idempotency, optimistic preview-version checks, atomic transitions, safe projections, and restart fail-closed behavior.
- Stop at `quality_check` and document the invariant required by a future Day 5 tracking/shipping change.

**Non-Goals:**

- Implementing or changing Local Payment, Stripe, PayPal, PaymentIntent, webhook, or production payment state.
- Supabase schema/records, migrations, production Order/OrderItem/Fulfillment persistence, storage-provider selection, binary preview upload, real rendering, AI/3D generation, supplier/factory/ERP integration, or production Admin Auth.
- Shipping, tracking, carrier labels, 17TRACK, delivery, email/Resend, production tax, DNS, Cloudflare, deployment, or C1 backfill.
- A complete operations dashboard, search/filter/roles/bulk actions, supplier management, image editor, Photoshop-style tools, background removal, or production asset generator.

## Decisions

### 1. Hard dependency gate and runtime selection

The upstream dependency gate is satisfied before Fulfillment Apply:

1. `build-local-order-runtime` is complete, synced, archived, and available through `openspec/specs/local-order-runtime/spec.md`.
2. `build-local-payment-simulation` is complete, reviewed, synced, archived, and available through `openspec/specs/local-payment-simulation/spec.md`.

Fulfillment Apply was allowed to begin from the completed upstream dependencies. The local Fulfillment implementation is now complete at 30/30 tasks, and every Fulfillment mutation must still verify the canonical Local Order `paid`/`succeeded` state.

The local runtime uses an explicit server-only development/test selection such as `LOCAL_FULFILLMENT_SOURCE=local_fake`. That selection enables the local runtime only; it is not operator authorization. Every operator mutation also requires a separate server-only local operator authorization seam. Production and absent selection are unavailable. There is no fake paid bypass, no browser override, and no fallback after an upstream source failure.

### 2. Separate payment lifecycle from Fulfillment lifecycle

The Local Order remains the authority for immutable purchase facts and payment lifecycle. Fulfillment owns only:

`photo_review → preview_pending → preview_revision_requested → preview_pending → preview_approved → in_production → quality_check`.

The canonical state machine does not rename Local Order `paid` into `photo_review` or `in_production`. An authorized local operator's `enter_photo_review` action validates Local Order `paid`/`succeeded`, then creates the Fulfillment record referencing the canonical Order identity. Customer capability reads and actions cannot create this initial aggregate. This avoids mixing payment, fulfillment, preview, and shipping semantics and avoids reusing legacy Supabase status strings.

### 3. One canonical Fulfillment aggregate without a second Order copy

Use a process-memory `LocalFulfillmentAggregate`/repository as the only authoritative owner of Fulfillment state, preview records, revision counters, timestamps, and Fulfillment action bindings. It stores the canonical Local Order internal/public identity and references the protected Local Order repository for current authorization and immutable facts; it does not copy Product, SKU, price, contact, customization, image receipt, or commercial snapshot fields into a second mutable Order object.

Every mutation begins by authorizing the actor through the appropriate server-only boundary, reading the canonical Local Order through a server-only port, and confirming `paid`/`succeeded`. Customer mutations use the same-browser capability; operator mutations use the separate operator gate and do not require the customer's capability. `enter_photo_review` is the only initial-admission path. Customer projection reads are side-effect free and never create the aggregate. The Fulfillment aggregate then performs its own state transition. Customer projection reads and operator action reads use the same aggregate state, so there is no `Order.fulfillmentStatus`, `FulfillmentAggregate.status`, `Preview.status`, and Admin status drift.

### 4. Immutable facts and review snapshot

Photo Review reads the already-locked customization values, image receipt references, crop facts, Product/SKU facts, and contact/commercial facts from the Local Order snapshot. It never reads current Cart/Catalog/customization data to rewrite the Order. Fulfillment records only lifecycle/preview/feedback metadata and references; any protected image access remains behind existing owner/operator authorization and is never exposed through a public URL.

The aggregate can retain an immutable review fingerprint or identity reference for diagnostics, but not a mutable copy of business facts. Tests compare the Local Order facts before and after every Fulfillment transition.

### 5. Preview versions and revision allowance

Initial operator publication creates server-generated version 1 and moves `photo_review` to `preview_pending`. The initial preview consumes zero revision requests. A customer Request Revision is an atomic action that checks the current version, stores a bounded plain-text note, increments `revisionRequestsUsed`, and moves to `preview_revision_requested`.

The operator must explicitly publish the next preview; no automatic generation is claimed. Publication after request 1 creates v2; publication after request 2 creates v3. The operator never supplies the authoritative version number. A third revision request is rejected at the aggregate boundary. A stale customer action with `expectedPreviewVersion` conflicts even if the browser page is otherwise authorized.

Where no binary preview exists, the record contains provider-neutral safe metadata and a visible development/test placeholder label. No storage provider, object path, signed URL, or rendering capability is selected.

### 6. Customer authority, operator authority, and action selectors

Customer actions use the existing same-browser Local Order capability and are limited to safe preview read, approval of the current preview, and bounded revision feedback. Operator actions use a separate server-only development/test operator gate enabled only with the local runtime; the existing Supabase-backed production Admin Order route is not reused because it has different persistence and status semantics.

Each mutation uses a distinct opaque `fulfillmentActionId`, bound to actor kind, a server-derived stable authorized actor/context identity, action kind, canonical Order identity, expected version, and normalized relevant input. It is not `creationAttemptId` or `paymentAttemptId`, and the binding never stores a raw capability, credential, or secret. A customer capability cannot publish or start production, and an operator cannot manufacture customer approval; the only path to production is a real customer approval transition to `preview_approved` followed by an operator action.

### 7. Atomicity and concurrency

After actor authorization and canonical Order/Fulfillment identity resolution, the aggregate first looks up a committed `fulfillmentActionId` binding. An exact equivalent selector returns the stored result immediately, before current lifecycle, preview-version, revision-limit, or transition eligibility is evaluated. The binding captures the canonical precondition/context at the original commit; its recorded relevant state is not a requirement that a later retry still equal the old pre-transition state. Only when no equivalent binding exists does the aggregate validate current Local Order state, lifecycle/version/revision conditions, and bounded input before staging. The action binding, preview record, revision count, timestamps, and Fulfillment state transition commit together. There is no Payment or Order fact mutation in this operation.

Equivalent duplicate approvals, revisions, and publications return the original result even when the committed transition has changed the current state. For example, an approval retry after `preview_pending` v2 became `preview_approved` returns the original approval; a revision retry after v1 became `preview_revision_requested` does not increment the count again; and a publication retry after v2 was committed does not create v3. Two different revision actions racing at count 1 are serialized by the process-memory atomic commit; only one can reach count 2. A failure leaves all Fulfillment state and immutable Local Order facts unchanged.

### 8. HTTP and UI surfaces

Customer read/action HTTP is same-origin, bounded, capability-protected, and returns safe projections. A likely boundary is a local Fulfillment read/action route used by the existing `/order/success/<reference>` experience; the exact route remains an implementation detail subject to the current route conventions. Customer input contains only action selector, expected version, action kind, and optional bounded revision note.

The existing `/admin/orders` route is not reused. A minimal runtime-gated local operator route/tool can support Photo Review, preview publication, production start, and Quality Check without becoming a production dashboard. All UI surfaces state `DEVELOPMENT / TEST ONLY`; they never say a real preview was generated, a supplier was contacted, or shipping began.

### 9. Safe projection and privacy

Customer output contains public Order reference, local Fulfillment state, current preview version, safe preview metadata, revision used/remaining, allowed customer actions, timestamps, and development/test notice. It excludes internal IDs, owner IDs, receipt IDs, storage keys, bucket/provider locators, private paths, operator credentials, internal notes, factory data, SQL details, and upload content. Operator output is bounded to local operational fields and does not broaden private storage access beyond an explicitly authorized server boundary.

### 10. Restart and Day 5 handoff

All local Fulfillment state is process-memory. A restart loses the aggregate and preview/action bindings; because Local Order is also process-memory, no workflow can be resurrected from a public reference, browser, localStorage, filesystem, or provider. The user sees a bounded unavailable result.

The only Day 5 handoff is an invariant: a future tracking/shipping change may create shipment state only when canonical Fulfillment is `quality_check`. This change does not create `shipped`, `in_transit`, `delivered`, carrier, tracking number, or shipment records.

### 11. Existing architecture audit classification

- **Reusable/current upstream:** canonical Local Order same-browser capability and protected read, immutable snapshot boundary, canonical Local Payment `paid`/`succeeded` entry boundary, local runtime configuration pattern, CustomerUpload protected-preview privacy conventions, same-origin parsing, safe public projections, and process-memory test fakes.
- **Legacy only:** Supabase `orders.fulfillment_status`, `order_status_logs`, legacy `review_status`, `AdminPhotoReview`, `AdminOrderControls`, `AdminTrackingControls`, digital delivery controls, and production order lookup/tracking UI.
- **Production-only:** Supabase Order/OrderItem writes, production Admin session, Stripe/PayPal payment state, storage/provider paths, supplier/manufacturing integrations, and shipping/tracking.
- **Implemented/current local capability:** Local Fulfillment aggregate, deterministic Production Preview metadata/workflow, customer approval/revision, operator gate, safe customer/operator boundary, and local review evidence.
- **Deferred/unavailable:** Durable Fulfillment persistence, production preview generation/storage, production operator authentication, supplier/factory/ERP integration, shipping, tracking, and the Day 5 tracking change.
- **New local boundary:** local Fulfillment domain, process-memory aggregate, customer/operator services, safe HTTP projections, local UI integration, and handoff documentation.

## Risks / Trade-offs

- [Upstream canonical boundaries could be bypassed] → Verify the archived Local Order and Local Payment canonical specs and require the canonical `paid`/`succeeded` entry for every Fulfillment mutation; do not create a paid bypass.
- [Fulfillment could treat runtime enablement as payment or operator authority] → Keep the separate Local Payment, customer-capability, and operator-authority checks even though the upstream changes are complete.
- [Customer and operator authority could cross] → Use separate server-only gates and action types; test both forbidden directions.
- [Preview version races] → Require expected-version checks, server-generated versions, action idempotency, and atomic process-memory commits.
- [Revision count could exceed two under concurrency] → Enforce the limit in the canonical aggregate, not only in UI, with race tests.
- [Fulfillment could duplicate Order facts] → Store only canonical Order identity/reference and read facts from the existing Local Order boundary.
- [A local placeholder could imply real production] → Require explicit development/test labels and forbid renderer/supplier/production claims.
- [Restart may lose a customer workflow] → Fail closed with no fallback or resurrection; document the local-only limitation.

## Migration Plan

No database, storage, or infrastructure migration is created or applied. With both upstream changes approved, synced, and archived, Apply adds only local development/test application modules, process-memory state, offline tests, and documentation. Enabling requires an ignored local runtime selection; rollback removes that selection and local modules. No remote record, production status, provider call, or migration history changes.

## Open Questions

None for the Day 4 local boundary. A future production fulfillment/preview change must separately decide durable Fulfillment schema, preview storage, operator identity, real rendering, supplier integration, and audit/retention rules. A future Day 5 tracking change must require `quality_check` before shipment creation.
