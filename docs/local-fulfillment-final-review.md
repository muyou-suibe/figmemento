# Local Fulfillment Runtime: Final Review Evidence

This document is the final local review packet for the Fulfillment change. It
records the evidence needed for human review; it is not an archive, a remote
deployment approval, or a production-readiness claim.

## Change boundary

- Change: `build-local-fulfillment-runtime`
- Review scope: local development/test runtime only
- Implementation status: Tasks 6.1–6.5 complete locally after the gates below
- Upstream dependencies: canonical, synced, archived Local Order and Local
  Payment boundaries
- Tracking: not implemented and not started

No remote Supabase access, migration execution, provider integration,
deployment, DNS/Cloudflare operation, C1 backfill, or Tracking change was
performed for this batch.

## Lifecycle evidence

The Fulfillment aggregate preserves the approved separate lifecycle:

| Check | Result |
| --- | --- |
| Paid/succeeded Local Order is required before admission | PASS |
| Operator-only `enter_photo_review` | PASS |
| `photo_review` -> `preview_pending` | PASS |
| `preview_pending` -> `preview_revision_requested` | PASS |
| `preview_revision_requested` -> `preview_pending` | PASS |
| `preview_pending` -> `preview_approved` | PASS |
| `preview_approved` -> `in_production` | PASS |
| `in_production` -> terminal `quality_check` | PASS |
| Invalid, skipped, backward, unpaid, and shipping/tracking transitions rejected | PASS |
| Local Order facts and lifecycle remain unchanged | PASS |

There are no shipment, transit, delivery, or tracking states in this change.

## Preview and revision evidence

- Server-generated preview versions v1, v2, and v3 are covered.
- The initial v1 preview does not consume revision allowance.
- Revision requests are capped at two; a third request is rejected.
- Approval requires the current preview version.
- `expectedPreviewVersion` stale-action protection is covered.
- Preview publication and approval/revision lost-response replays are covered.

## Replay, concurrency, and atomicity evidence

- `fulfillmentActionId` is the independent opaque selector for Fulfillment
  mutations.
- Actor authorization and canonical Order identity resolution precede replay
  lookup.
- Exact committed replay returns the original safe result.
- Same-selector conflicting payloads are rejected.
- Repeated equivalent actions do not create a second transition.
- Concurrent revision requests cannot consume more than the two permitted
  revision slots.
- Lifecycle, preview/revision records, and action bindings commit atomically
  at the local aggregate/repository boundary.
- There is one process-memory Fulfillment aggregate store and no second mutable
  Order store.

## Authority and privacy evidence

- Customer reads and mutations require the existing same-browser Local Order
  capability.
- Customer reads are side-effect free and cannot create the initial aggregate.
- Operator mutations use a separate server-only operator gate.
- Customer capability is not accepted as operator authority.
- Browser lifecycle fields, customer capabilities, operator secrets, owner IDs,
  internal identifiers, provider diagnostics, payment identifiers, private
  object paths, and customer-private upload content are not returned.
- Unauthorized and invalid requests use bounded results without aggregate
  existence disclosure.

## Restart and provider-stop evidence

- Local Order, Fulfillment state, previews, revisions, and action bindings are
  process-memory only.
- After restart, old local references fail closed; no persistence or restore
  path was added.
- `LOCAL_FULFILLMENT_SOURCE=local_fake` is explicit and accepted only in
  development/test.
- Absent source and production mode fail closed; there is no production
  fallback to the local fake.
- No Stripe, PayPal, Payment webhook, Supabase write, migration, storage
  provider, supplier/factory/ERP, email, shipping, or tracking operation is
  implemented.

## Day 5 handoff

`quality_check` is the terminal state of this capability. A future Tracking or
Shipping change must define its own persistence, authorization, shipment
state, carrier/tracking fields, and provider boundary. This change does not
create or imply those semantics.

## Verification evidence

| Gate | Result |
| --- | --- |
| Focused Fulfillment and upstream local regression tests | 223/223 passed |
| `npm run test:offline` | 830/830 passed |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS; 0 errors, 1 existing warning |
| `npm run build` | PASS |
| `npm run test:rendered` | 6/6 passed |
| `npm run verify` | PASS |
| `openspec validate --all --strict` | 16/16 passed |
| `git diff --check` | PASS |

The existing lint warning is the known `@next/next/no-img-element` warning in
`app/storefront/ProductCustomizationImageField.tsx`; it is not part of the
Fulfillment implementation and does not produce a lint error.

## Review stop conditions

This evidence packet does not authorize:

- Review/Sync/Archive of the Fulfillment change;
- a Tracking change;
- remote Supabase inspection or mutation;
- any migration or backfill;
- production fulfillment, shipping, tracking, payment, or deployment.
