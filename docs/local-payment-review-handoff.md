# Local Payment Simulation: Final Review Handoff

## Status

- Payment change: 30/30 tasks complete after Final Batch.
- Review state: ready for separate Review → Sync → Archive closeout.
- This document does not authorize archive, Fulfillment Apply, Tracking Apply,
  or production Payment.

## Local Order dependency

- Local Order: 30/30, final browser acceptance PASS.
- Delta synced: YES.
- Archived: YES.
- Canonical spec: `openspec/specs/local-order-runtime/spec.md`.
- Archived Local Order planning modified by Payment: NO.
- Canonical Local Order spec modified by Payment: NO.

## Implemented architecture

- One canonical process-memory Local Order store.
- Process-memory Payment attempts and committed selector bindings.
- Server-only lifecycle transition port.
- Atomic Payment result plus canonical Local Order lifecycle transition.
- Same-browser HttpOnly capability authorization.
- Server-resolved internal Order identity and derived authority context.
- Exact committed replay before new-attempt validation.
- Bounded same-origin `POST /api/local-payments`.
- Existing `/order/success/<reference>` integration with safe public output.

## Evidence

Deterministic repository/application/HTTP evidence covers parser bounds,
fresh authority, immutable facts, atomic rollback, replay, concurrency,
privacy, restart fail-closed behavior, and provider stop gates.

Batch D real browser evidence:

- Desktop: PASS.
- 375px: PASS; horizontal overflow: NO.
- Real image upload and Local Order creation: PASS.
- Failed → new-selector success retry: PASS.
- Cancelled → new-selector success retry: PASS.
- Paid refresh: PASS.
- Rapid duplicate submit: PASS.
- `No real money was charged` and tax-not-activated wording: PASS.

The Final Batch changes only documentation, stop-gate tests, task evidence,
and verification artifacts. Browser acceptance evidence is therefore inherited
from Batch D; no relevant application code changed afterward.

## Privacy and replay boundary

Browser input contains only public reference, opaque Payment selector, and
allowlisted outcome. The capability, internal IDs, authority context, protected
snapshot, upload receipts, storage/provider identifiers, and secrets are not
returned in the HTTP projection. Exact replay returns the original result and
does not create a second attempt or transition.

## Intentional limitations and risks

- Process restart loses Local Order and Payment state.
- There is no production Payment provider.
- There is no durable Order/Payment persistence.
- Tax remains `not_activated` with `null` amount.
- Local arithmetic is not payable.
- Refund simulation is not implemented.
- Payment has no Fulfillment side effect.

These are intentional local scope limitations and future production
dependencies, not claims of production readiness.

## Explicit production exclusions

Stripe, PayPal, PaymentIntent, webhook, remote Supabase, migration,
production Payment persistence, production Order/OrderItem persistence,
production Tax, production Shipping, Fulfillment, Tracking, 17TRACK, email,
DNS, Cloudflare, deployment, and C1 backfill: **NO**.

Next step: human review, then the separately authorized OpenSpec sync/archive
closeout. Fulfillment and Tracking remain blocked until that closeout and their
own approved Apply workflows.
