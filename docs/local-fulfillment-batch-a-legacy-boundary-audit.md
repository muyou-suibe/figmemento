# Local Fulfillment Batch A Legacy Boundary Audit

Status: Batch A implementation scope only. No Fulfillment aggregate, repository,
customer application, operator HTTP route, UI, migration, or remote operation is
started by this audit.

## Dependency gate

- Canonical Local Order: complete, synced, and archived at
  `openspec/specs/local-order-runtime/spec.md`.
- Canonical Local Payment: complete, synced, and archived at
  `openspec/specs/local-payment-simulation/spec.md`.
- Fulfillment remains a new local capability and currently has no durable or
  process-memory aggregate implementation.

Every later Fulfillment mutation must consume the canonical Local Order
`paid`/`succeeded` entry boundary. Runtime enablement is not payment authority
and is not operator authority.

## Reusable/current boundaries

Batch A may define provider-neutral contracts around these existing boundaries:

- canonical Local Order identity, protected same-browser authority, immutable
  purchase/customization snapshot, and side-effect-free reads;
- canonical Local Payment `paid`/`succeeded` entry state;
- server-only runtime configuration and safe configuration errors;
- CustomerUpload protected preview/privacy conventions;
- same-origin input parsing and safe public projections;
- deterministic process-memory test fakes.

These are references and seams only. Batch A does not reopen or alter the
archived upstream changes.

## Legacy or production-only paths

The following existing paths are not the Local Fulfillment lifecycle and must
not be reused as its mutable state authority:

- Supabase `orders.fulfillment_status` and `order_status_logs`;
- legacy `review_status` and production tracking/status fields;
- `AdminPhotoReview`, `AdminOrderControls`, and `AdminTrackingControls`;
- production order lookup, fulfillment, digital-delivery, and tracking UI;
- production Admin/session authorization and Supabase-backed writes.

The existing `app/domain/catalog/fulfillment.ts` is Product-level
`ProductFulfillmentConfig`. It is not Order Fulfillment lifecycle state and is
not a substitute for the local Fulfillment domain.

## Production/provider boundaries excluded from Batch A

Batch A does not introduce or invoke:

- Supabase persistence or migrations;
- Stripe, PayPal, payment webhooks, or payment-provider calls;
- storage provider selection, binary preview upload, signed URLs, or object
  paths;
- supplier, factory, ERP, procurement, warehouse, or routing semantics;
- shipping, tracking, carrier, delivery, email, DNS, Cloudflare, or deployment
  behavior;
- customer Auth, production operator roles, or a browser credential;
- Product/C1 backfill.

## Batch A local boundary

Batch A is limited to:

- explicit development/test-only `LOCAL_FULFILLMENT_SOURCE=local_fake` runtime
  parsing with absent-by-default and production fail-closed behavior;
- a separate server-only operator authorization seam that runtime enablement
  cannot satisfy;
- provider-neutral Fulfillment lifecycle, preview/revision, authority, replay,
  and safe projection contracts;
- deterministic offline tests and provider-stop assertions.

No Fulfillment state is persisted or reconstructed from a public reference,
browser data, filesystem, database, or provider.
