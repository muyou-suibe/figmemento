# Local Customer Upload Runtime Audit

Status: Batch 1 implementation audit for `build-local-customer-upload-runtime`.

This audit records the repository boundary before the local-only runtime is
enabled. It does not authorize a production upload provider, a database
migration, remote Supabase access, or Order/Payment integration.

## Scope and frozen boundaries

- This apply is limited to Batch 1 (20/30 tasks): configuration, local
  process-memory runtime, selector-aware server composition, and offline
  regression coverage.
- `CUSTOMER_UPLOAD_SOURCE` is independent from `PHOTOGIFT_PRODUCT_SOURCE`.
  It is absent/`disabled` by default and only `local_fake` is allowed in the
  development/test runtime.
- Production remains fail-closed until a later provider decision. A provider
  failure must not fall back to a local runtime.
- No Cart, Checkout Readiness, Order, Payment, DNS, Cloudflare, deployment, or
  remote Supabase behavior is changed by this audit.
- The existing HTTP contract remains non-idempotent: each successful POST is an
  independent attempt; no retry deduplication or equivalence is promised.

## Existing implementation classification

### Reusable provider-neutral authority

The following existing boundaries are suitable for local composition and are
not provider decisions:

- `app/domain/customer-upload.ts`: opaque receipt/owner identities, safe
  receipt shape, lifecycle state, and expiry rules.
- `app/application/customer-upload-object-store.ts`: private object storage
  port, inspection port, and private streaming read port.
- `app/application/customer-upload-repository.ts`: receipt persistence and
  preview authorization ports, including lifecycle and attachment guards.
- `app/application/customer-upload-acceptance-service.ts`: server inspection,
  receipt creation, object write, receipt persistence, and existing best-effort
  compensation when receipt persistence fails.
- `app/server/customer-upload-http-handler.server.ts` and
  `app/server/customer-upload-preview-handler.server.ts`: same-origin,
  guest-owner, safe-error, private-receipt, and private-streaming boundaries.
- `app/infrastructure/catalog/server-catalog-repository.ts` and
  `app/application/catalog-repository.ts`: current public Product authority.
- `app/infrastructure/customization/server-customization-field-repository.ts`
  and `app/application/customization-field-repository.ts`: current
  Product-owned CustomizationField authority.

### Local/test-only evidence

`app/testing/customer-upload-fakes.ts` and
`app/testing/customer-upload-local-smoke-harness.ts` are test-only evidence.
They must not be imported by public application routes. The local runtime uses
the same application ports with a separate server/infrastructure implementation
so a production route cannot accidentally depend on a test fake.

### Legacy/prototype compatibility

`readUploadConfig` and `SUPABASE_UPLOAD_BUCKET` remain legacy configuration for
the unresolved provider-era upload design. They are not repurposed as the
local runtime selector and are not deleted in Batch 1. The current route's
provider stop gate is retained until the explicit local source gate is selected.

### Production-stopped dependency

The repository contains no approved production object-storage or durable
receipt provider for this change. Before this apply, `/api/uploads` and the
preview route therefore fail closed. Batch 1 may make them work only when the
explicit development/test `local_fake` source is selected; production and
default/disabled operation remain unavailable.

### Not implemented before this apply

Before this change there was no `CUSTOMER_UPLOAD_SOURCE` parser, no legitimate
server-side process-memory runtime bundle, no source-aware upload field
resolver in the public route, and no selector transport from the image-field
client helper. Those are the narrow Batch 1 implementation targets.

## Local runtime limitations

The `local_fake` bundle is process-memory only. A process restart, worker
instance replacement, hot reload that creates a new module instance, or a
second application instance loses the bytes and receipts held by that bundle.
It has no filesystem, database, remote, or cross-instance persistence. At the
Batch 1 audit snapshot, the shared singleton was only an in-process
coordination boundary for upload and preview. The Final Batch now composes the
same singleton into local Cart Add and Checkout Readiness when an image receipt
is present; production persistence remains stopped.
The reset function is a test/development seam and is not exposed through HTTP.

The local receipt expiry and preview capability intervals are development-only
runtime policy (24 hours for local receipt retention and five minutes for a
preview capability, bounded by the receipt expiry). They are not production
retention, cleanup, or provider decisions. Receipt IDs use the existing
cryptographic opaque generator, while acceptance dependencies retain explicit
test injection.

## Required authority and side-effect ordering

The upload route must reject disabled or invalid configuration before creating
the local runtime or provider-bound dependencies. It must resolve `productId`
and `fieldId` from non-body request context, re-read the current Product and
CustomizationField authority on the server, and reject missing, cross-Product,
inactive, or invalid configuration. Browser-supplied constraints, filename,
bytes, and the UI-only `operationId` are not authority.

Guest-owner verification and same-origin checks remain in the existing handler.
Selector failure must occur before multipart parsing, object writes, and
receipt persistence. An owner cookie issued by an existing protected boundary
is not reported as zero side effects; it is not an upload object or receipt
mutation.

## Unchanged project decisions

- C1 catalog progress remains 41/61; Task 3.5 is blocked on business input and
  `BACKFILL AUTHORIZED` remains `NO`.
- Customization, Cart, Checkout Readiness, Auth, Brand/Domain, and Visual
  changes retain their separately approved scope/status.
- Customer upload production retention, orphan reconciliation, provider choice,
  and durable production persistence remain unresolved for later work.
