# Local Payment Batch A Legacy Boundary Audit

## Dependency gate

`build-local-order-runtime` is complete at 30/30. Its delta is synced and the
change is archived at `openspec/changes/archive/2026-08-25-build-local-order-runtime`.
The canonical boundary consumed by Payment is
`openspec/specs/local-order-runtime/spec.md`. Batch A does not modify or reopen
that archived change.

## Existing legacy seams

| Area | Actual repository seam | Classification | Batch A decision |
| --- | --- | --- | --- |
| Transport types | `app/domain/payment.ts` (`StripeCheckoutSession`, `StripeWebhookSession`, `StripeWebhookEvent`) | Legacy/provider-only | Do not import into Local Payment contracts. |
| Production checkout | `app/api/orders/route.ts` creates Stripe Checkout sessions and writes Supabase `orders` records | Production-only | Do not call or alter it. |
| Stripe webhook | `app/application/stripe-webhook.ts`, `app/api/webhooks/stripe/route.ts` | Production/provider-only | Keep signature, webhook, and production status semantics isolated. |
| Persistent payment status | Supabase `orders.payment_status` read/write paths | Production database authority | Not a Local Payment source or lifecycle store. |
| Admin order/payment paths | `app/admin/orders/page.tsx`, `app/api/admin/orders/route.ts`, and the export route | Production/admin-only | No Local Payment integration in Batch A. |
| PayPal | No PayPal implementation seam was found under `app/` | Not implemented | No provider contract is introduced. |

## Reusable conventions

Batch A follows the existing server configuration pattern and
`ServerConfigurationError`, uses bounded structural parsing, and keeps local
runtime selection separate from payment authorization. The new
`app/config/local-payment-runtime.ts` and `app/domain/local-payment.ts` files
are the new local boundary. They do not import Stripe, PayPal, Supabase,
React/UI state, provider credentials, or webhook transport types.

## Explicit stop gate

This audit does not implement a repository, aggregate, canonical Order
transition port, application service, HTTP route, or UI control. No provider,
database, migration, Order, Fulfillment, Tracking, or deployment operation is
introduced by Batch A.
