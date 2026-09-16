## Why

PhotoGift already has provider-neutral CustomerUpload contracts, acceptance and
ownership logic, but the real local development routes still fail closed because
no legitimate runtime composition supplies a shared object store and receipt
repository. A bounded local runtime is needed now to verify the browser upload →
preview → Cart → Checkout Readiness path without selecting or implying a
production storage provider.

## What Changes

- Add a planning-defined `CUSTOMER_UPLOAD_SOURCE` boundary with only `disabled`
  and `local_fake` values; absence defaults to disabled, invalid values fail
  closed, and `local_fake` is accepted only in development/test.
- Compose one process-local, provider-neutral CustomerUpload runtime bundle for
  the existing upload route, customer-input preview route, Cart Add, and
  Checkout Readiness boundaries.
- Reuse the existing CustomerUpload domain contracts, acceptance service,
  signed `photogift-guest-draft-owner` context, and configured-item handoff;
  do not create a second upload model or authorize uploads with Cart/Auth/Admin
  identity.
- Keep private bytes and owner-scoped receipts in process memory only, with
  opaque server-generated receipt IDs, safe projections, explicit restart and
  multi-instance limitations, and deterministic offline test reset support.
- Preserve the existing server-owned CustomizationField constraints, exact
  same-origin mutation checks, private no-store preview behavior, fail-closed
  error mapping, and partial-write compensation semantics.
- Compose local receipt authority into image Cart Add and Checkout Readiness
  while keeping text-only Cart behavior independent and preserving their
  archived canonical contracts.
- Add local-development and production-handoff documentation and verification
  planning without activating production persistence, checkout, payment, or
  deployment.

## Capabilities

### New Capabilities

- `local-customer-upload-runtime`: Defines explicit local CustomerUpload source
  selection, shared process-local runtime composition, private receipt/object
  behavior, upload and preview route activation, Cart/Readiness composition,
  and production stop boundaries.

### Modified Capabilities

- None. Shopping Cart, Checkout Readiness, Customer Auth, Customization, C1,
  Brand/Domain, and Visual remain existing dependencies and their canonical
  requirements are not changed by this planning change.

## Impact

- **Server/runtime:** The existing `/api/uploads` and customer-input preview
  routes gain a planned local-only dependency composition; production remains
  fail-closed until a separately approved provider is selected.
- **Application boundaries:** Existing CustomerUpload ports, acceptance,
  lifecycle, preview authorization, guest-owner, configured-item, Cart, and
  readiness contracts are reused. Test fakes remain test infrastructure and are
  not imported by public routes.
- **Configuration:** A new non-secret `CUSTOMER_UPLOAD_SOURCE` selector is
  planned. Missing configuration remains disabled; no `.env.local`, signing
  secret, provider credential, or binding is committed.
- **Persistence/infrastructure:** No migration, receipt table, RLS policy,
  trigger, RPC, provider SDK, bucket, Supabase Storage, R2, filesystem, or
  database byte store is introduced.
- **Dependencies:** The change depends on existing guest-owner issuance,
  server-owned CustomizationField authority, and archived Cart/Checkout
  Readiness receipt boundaries. Production provider, retention, cleanup,
  checkout, order, payment, DNS, Cloudflare, and deployment decisions remain
  deferred.
