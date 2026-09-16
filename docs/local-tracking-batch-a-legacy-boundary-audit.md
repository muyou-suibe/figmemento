# Local Tracking Batch A: Dependency and Legacy Boundary Audit

This is the Batch A implementation audit for the FigMemento Local Tracking
change. It records the hard dependency gate and the boundary decisions before
any Shipment aggregate, route, UI, provider, or persistence implementation.

## Apply gate

Local Tracking may be implemented only after all three upstream local
capabilities are complete and available:

- Local Order: reviewed, synced, and archived canonical capability.
- Local Payment: reviewed, synced, and archived canonical capability.
- Local Fulfillment: 30/30, reviewed, synced, and archived canonical
  capability at terminal `quality_check`.

The Tracking entry prerequisite is the canonical Local Fulfillment state
`quality_check`. No browser field, URL reference, prior projection, fake
checkbox, or upstream planning artifact can bypass that prerequisite. This
change does not reopen, modify, or archive any upstream change.

## Current classification

| Area | Current evidence | Batch A decision |
| --- | --- | --- |
| Local Order | `openspec/specs/local-order-runtime/spec.md` and its process-memory capability | Reuse only its canonical identity and same-browser authority conventions; do not create a Tracking Order store. |
| Local Payment | `openspec/specs/local-payment-simulation/spec.md` and its process-memory capability | Reuse only the canonical `paid`/`succeeded` entry boundary; do not create payment state or payment authority in Tracking. |
| Local Fulfillment | `openspec/specs/local-fulfillment-runtime/spec.md`, terminal `quality_check` | Reuse the canonical Fulfillment identity/read boundary; Tracking must not write or rename Fulfillment lifecycle state. |
| Product FulfillmentConfig | `app/domain/catalog/fulfillment.ts` | Catalog product metadata only; it is not Shipment state or a shipping provider contract. |
| Legacy Supabase tracking fields | `public.orders.fulfillment_status`, `tracking_carrier`, `tracking_number`, `tracking_status` in legacy SQL | Legacy/production-only data shape; not a Local Tracking authority and not read or written by Batch A. |
| Legacy status log | `public.order_status_logs` in legacy SQL; absent from the verified remote baseline | Legacy/production-only bootstrap residue; not recreated or reused. |
| Legacy Admin tracking | `app/admin/AdminTrackingControls.tsx` and `app/api/admin/orders/route.ts` | Production/legacy Admin surface; not reused for local operator authority. |
| Legacy public lookup | `app/api/order-lookup/route.ts` and `app/track-order/*` | Production/legacy Supabase lookup surface; not reused for customer Tracking reads. |

## Batch A boundary

Batch A establishes only:

- the explicit server-only `LOCAL_TRACKING_SOURCE=local_fake` parser;
- absent-by-default and production fail-closed behavior;
- a separate server-only operator authorization seam;
- the rule that runtime enablement is not operator authorization;
- the provider and persistence stop boundary for later Tracking work.

The Shipment/Tracking aggregate, Shipment identity, tracking number, event
lifecycle, customer projection, operator actions, HTTP routes, UI, and replay
implementation remain later tasks.

## Provider and persistence stop gate

The Local Tracking boundary must not call or write:

- Supabase, SQL, migrations, D1/Drizzle, SQLite, or a production database;
- 17TRACK, carrier APIs, webhooks, polling, labels, postage, customs, or
  shipping-rate services;
- storage providers, suppliers, factories, ERP, email, DNS, Cloudflare, or
  deployment infrastructure.

`LOCAL_TRACKING_SOURCE=local_fake` is a runtime selection only. A source
failure is unavailable; it never activates a different source or claims a
real carrier result. Operator authority is independently verified on the
server, and customer same-browser capability is not an operator credential.
