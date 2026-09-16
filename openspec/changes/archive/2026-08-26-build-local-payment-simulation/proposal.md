## Why

The Local Order runtime now provides a protected, immutable, process-memory Order in `pending_payment`, but it intentionally stops before introducing a Payment attempt or an Order transition. A development-only payment simulation is the next useful local milestone, provided it consumes only fresh server-authorized Local Order state and cannot be mistaken for Stripe, PayPal, payable authorization, or production settlement.

This planning change was prepared while `build-local-order-runtime` was 26/30 and PARTIAL, but that dependency has since completed its final human/browser acceptance, synced its delta into the canonical `local-order-runtime` spec, and been archived. The Local Order dependency for this Payment change is therefore satisfied, and Payment Apply may begin under this approved local-only design.

## What Changes

- Define a new `local-payment-simulation` capability for deterministic development/test-only payment attempts against an authorized Local Order.
- Add a minimal local Payment lifecycle for successful, failed, and cancelled simulation outcomes, with an explicit pending/terminal model and no refund implementation in the Day 3 MVP.
- Define a separate `paymentAttemptId` idempotency selector; do not reuse Local Order `creationAttemptId`.
- Re-read and authorize the Local Order on every payment mutation using the existing same-browser capability boundary and current process-memory state.
- Derive the simulated amount and currency only from the protected Local Order commercial snapshot; never accept browser amount, currency, status, tax, shipping, discount, or total as authority.
- Define an atomic local runtime transition so a successful Payment attempt and the corresponding Local Order transition commit together, or neither is visible.
- Add bounded same-origin HTTP and safe public projections, plus local-only UI controls that show explicit simulation wording and never request real payment data.
- Document restart loss, tax-not-activated semantics, no-money-charged semantics, retry behavior, and the future handoff to real provider/payment work.

The Local Order's existing creation semantics, immutable snapshots, Cart preservation, browser capability, `pending_payment`/`pending` starting state, and fail-closed restart behavior remain unchanged except for the explicitly specified local simulation transitions.

## Capabilities

### New Capabilities

- `local-payment-simulation`: Development/test-only Payment attempts, server-authorized simulation amount, atomic Local Order transition, idempotency, safe HTTP/UI projection, and restart/privacy boundaries.

### Modified Capabilities

- None. The new capability integrates with the active Local Order runtime only after its dependency receives final human approval; it does not alter the canonical Checkout or production Order/Payment requirements in this planning change.

## Impact

- Expected implementation areas: a new local Payment domain contract, process-memory repository/aggregate boundary, application service, runtime configuration, local payment HTTP surface, Local Order Success UI integration, tests, and development/payment handoff documentation.
- Existing legacy `app/domain/payment.ts`, `/api/orders`, Stripe webhook, Supabase `orders`, and production Order/admin paths are audit references only and remain outside this change.
- No Supabase schema, migration, remote record, Stripe/PayPal SDK, webhook, provider network call, production Payment entity, production Order persistence, fulfillment, shipping, tax, deployment, or infrastructure change is included.
- Apply is allowed because `build-local-order-runtime` is now a completed, synced, and archived dependency; implementation must consume the canonical `openspec/specs/local-order-runtime/spec.md` boundary and must not modify or reopen the archived Local Order change.
