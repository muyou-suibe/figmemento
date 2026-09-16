## 1. Dependency, Audit, and Runtime Boundary

- [x] 1.1 Verify and record that the canonical Local Order and Local Payment dependencies are complete, synced, archived, and available through their canonical specs before Fulfillment implementation; do not modify or reopen either upstream change.
- [x] 1.2 Re-audit and document the classification of the canonical Local Order boundary, canonical Local Payment boundary, legacy Supabase Order/fulfillment/admin/tracking paths, CustomerUpload preview, and Product FulfillmentConfig.
- [x] 1.3 Add a server-only `LOCAL_FULFILLMENT_SOURCE` parser with explicit development/test `local_fake` selection, absent-by-default behavior, and production rejection.
- [x] 1.4 Define the separate server-only local operator gate without starting production Auth, Supabase Auth, client secrets, or a hardcoded browser credential.
- [x] 1.5 Establish the local Fulfillment module boundary and provider-stop assertions without reusing legacy Supabase Order state or creating a storage-provider decision.

## 2. Fulfillment Domain and Preview Contracts

- [x] 2.1 Define strict local Fulfillment, preview, revision, customer/operator action, safe projection, and bounded issue types that reference—but do not copy—the canonical Local Order facts.
- [x] 2.2 Define and validate the complete lifecycle, including operator-only `enter_photo_review` admission to `photo_review`, `preview_pending`, `preview_revision_requested`, `preview_approved`, `in_production`, and terminal `quality_check`, with customer reads side-effect free and all invalid skips rejected.
- [x] 2.3 Define server-generated preview versions v1, v2, and v3, initial-preview semantics, maximum two revision requests, current-version approval, exact lost-response replay, and no-refund/no-shipping semantics.
- [x] 2.4 Define bounded customer/operator action input and separate authorities with distinct `fulfillmentActionId`, `expectedPreviewVersion`, action kind, and plain-text revision note; require runtime enablement plus operator authority for operator mutations, reject browser lifecycle authority, and specify exact replay before new-action validation.
- [x] 2.5 Add deterministic domain tests for operator-only paid entry, transition table, preview versions, revision limit, stale version conflict, exact approval/revision/publication replay, safe projections, side-effect-free reads, and production/shipping boundary rejection.

## 3. Canonical Process-Memory Aggregate

- [x] 3.1 Implement one canonical process-memory Fulfillment aggregate that stores lifecycle/preview/action state and only canonical Local Order identity references, never a second mutable Order facts copy.
- [x] 3.2 Implement paid-entry authorization through the canonical Local Order repository and separate server-only operator boundary; allow only operator `enter_photo_review` to create `photo_review`, without a fake paid bypass or customer-capability substitute.
- [x] 3.3 Implement atomic lifecycle, preview, revision, timestamp, and action-binding commits while preserving immutable Local Order facts and protected reads.
- [x] 3.4 Implement independent customer/operator action idempotency with actor authorization first, canonical identity resolution, exact committed-binding replay before new-action state/version/revision validation, server-generated preview versioning, optimistic version checks, and revision-limit concurrency serialization.
- [x] 3.5 Add aggregate/repository tests for operator-only entry, all valid transitions, invalid skips, rollback, lost-response approval/revision/publication replay, conflicting actions, concurrent revisions, restart loss, and no second state store.

## 4. Customer Preview and Approval Boundary

- [x] 4.1 Implement a side-effect-free same-browser customer read projection for an existing Fulfillment state, preview metadata, revision usage, allowed actions, timestamps, and development/test notice; reads must never create initial `photo_review`.
- [x] 4.2 Implement customer approval for a new action only on the current `preview_pending` version, while resolving an exact committed approval replay before current-state validation, and transition atomically to `preview_approved` with a separate action selector.
- [x] 4.3 Implement bounded customer Request Revision from `preview_pending`, resolving an exact committed replay before current-state or maximum-two enforcement and otherwise applying the server-side limit and transition to `preview_revision_requested`.
- [x] 4.4 Enforce stale `expectedPreviewVersion` conflicts, safe plain-text revision notes, private image/reference boundaries, and rejection of customer operator actions.
- [x] 4.5 Add customer application/HTTP tests for capability authorization, public-reference rejection, side-effect-free reads, approval, revision #1/#2, revision #3 rejection, stale approval, exact approval/revision replay after state change, and privacy-safe failure.

## 5. Local Operator, HTTP, and UI Surface

- [x] 5.1 Implement separately authorized operator actions for entering Photo Review, publishing initial/revised previews, starting production only after approval, and advancing production to Quality Check.
- [x] 5.2 Enforce runtime enablement versus operator authority separation before privileged construction; do not require customer capability for operator actions and reject customer-capability attempts to admit, publish, start production, or mark Quality Check.
- [x] 5.3 Add bounded same-origin customer/operator HTTP routes with safe errors, no lifecycle fields from the browser, no capabilities in JSON/URL, and no legacy Admin Order calls.
- [x] 5.4 Integrate the customer preview/approval experience with the local Order Success boundary and add a minimal runtime-gated local operator route/tool; do not build a production dashboard.
- [x] 5.5 Add rendered/browser acceptance for desktop and 375px covering paid local notice, preview v1, approval, revision v2/v3, revision-limit failure, production approval gate, and Quality Check wording.

## 6. Documentation and Final Verification

- [x] 6.1 Document local Fulfillment setup, dependency gate, lifecycle, preview/revision contract, customer/operator authority, restart behavior, privacy, and Day 5 handoff without secrets.
- [x] 6.2 Add provider-stop-gate coverage proving no Payment implementation, Stripe/PayPal, Supabase/migration, storage provider, supplier/factory/ERP, shipping/tracking, email, DNS, Cloudflare, deployment, or C1 backfill operation.
- [x] 6.3 Run focused local Fulfillment domain/aggregate/application/HTTP tests and existing Local Order, Local Payment, CustomerUpload, Catalog, Customization, and Checkout regressions offline when upstream implementation is available.
- [x] 6.4 Run `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test:rendered`, `openspec validate --all --strict`, and `git diff --check` without weakening strictness or scope gates.
- [x] 6.5 Prepare final human review evidence for dependency approval, lifecycle/revision/concurrency behavior, privacy, Quality Check stop state, and Day 5 handoff; do not archive this change or create a Tracking change.
