## Why

The Fusion high-fidelity change has completed its presentation work, but its
authorized Admin browser acceptance is blocked because the real Admin Products
and Admin Orders pages currently construct production Supabase-backed sources.
PhotoGift needs a disposable, development/test-only runtime that can exercise
the real Admin login and session boundary locally without touching remote
Supabase, production Order data, or production storage.

This change is intentionally independent of the incomplete high-fidelity
change. It supplies a safe local acceptance environment so that a later human
review can record authorized Admin evidence without changing production
authority or silently weakening the existing security boundary.

## What Changes

- Add a server-only, explicit Admin acceptance source selector such as
  `ADMIN_ACCEPTANCE_SOURCE=local_fake`; absent selection keeps the existing
  production source path.
- Reject the local acceptance source in production and never fall back between
  local and production sources after a provider failure.
- Reuse the existing signed Admin session cookie, login route, and
  `ExistingAdminSessionVerifier`/`isValidAdminSession` checks before any local
  repository is constructed.
- Provide typed process-memory Admin Catalog repositories that reuse the
  existing provider-neutral catalog contracts, validation, bounded commands,
  and lifecycle intent rather than copying test helpers into production.
- Introduce a separate provider-neutral Admin Orders read seam with clearly
  synthetic local fixtures sufficient for authorized visual acceptance.
- Ensure local Admin Orders never constructs Supabase Storage clients or reads
  production Order data; local fixtures contain no real customer or provider
  secrets/identifiers.
- Route all relevant Admin Catalog reads and bounded mutations through one
  server-side source-selection boundary, including content, SKU graph, assets,
  fulfillment, lifecycle, and existing Admin customization routes where they
  are part of the real page.
- Add offline source-selection, authorization, fail-closed, no-fallback,
  restart-reset, and zero-provider sentinel tests, followed by a manual
  browser acceptance handoff for `/admin/login`, `/admin/products`, and
  `/admin/orders` at desktop and 375px with keyboard, coarse-pointer, and
  reduced-motion evidence.
- Document that local process-memory mutations reset on restart and are not
  production persistence.

## Capabilities

### New Capabilities

- `local-admin-acceptance-runtime`: A development/test-only, server-authorized
  local Admin Catalog and Orders runtime for safe browser acceptance.

### Modified Capabilities

- None. Existing Customer Auth, Catalog, Order, Payment, Fulfillment,
  Tracking, Checkout, and visual-system requirements remain unchanged.

## Impact

- Affected server composition: current Admin Products and Catalog API route
  factories, current Admin Orders read path, and the shared Admin session
  boundary.
- Affected local infrastructure: development fixture loading, typed Catalog
  repositories, and a new synthetic Admin Orders read model/adapter.
- Affected verification: offline tests, provider-construction sentinels, and
  manual local Chrome evidence. No remote service is required.
- Production behavior remains the current path:
  `Admin session → ExistingAdminSessionVerifier → AdminCatalogQueryBoundary →
  createProductionCatalogRepository → Supabase` for Products, and the current
  protected Orders/Supabase path when the local selector is absent.
- No database schema, migration, provider integration, production persistence,
  deployment, DNS, or production Admin redesign is included.
- The high-fidelity change remains untouched: Task 10.2 stays open at 39/45
  until its authorized Admin evidence is separately reviewed and recorded.
