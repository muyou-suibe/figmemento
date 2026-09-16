## Context

See `proposal.md` for the motivation. The current Admin composition has two
different production-only shapes:

- Admin Products verifies the signed Admin session through
  `ExistingAdminSessionVerifier` and `AdminCatalogQueryBoundary`, then receives
  a deferred `createProductionCatalogRepository` callback. Its Catalog API
  routes similarly pass production repository factories to the existing typed
  Admin boundaries for content, SKU graph, assets, fulfillment, and lifecycle.
- Admin Orders verifies `isValidAdminSession` and then directly creates a
  Supabase server client for the Orders query. It may subsequently create a
  Supabase Storage signed URL for a private photo locator.

The repository already has provider-neutral Catalog contracts, development
Catalog fixtures, Catalog validation/services, and test fakes. The development
Catalog repository is a public fixture reader, not an Admin command runtime;
test fakes are not to be copied blindly into the application. There is no
provider-neutral Admin Orders read boundary yet.

The high-fidelity change remains separate. Its Task 10.2 needs authorized
Admin browser evidence, but the task asks for authorized/rejected states,
safe errors, responsive/accessibility behavior, and server-only authorization;
it does not require a new production Admin mutation workflow. This change
therefore makes authorized rendering safe and reproducible, while keeping
existing bounded Catalog editors available against process-local state when
they are exercised.

## Goals / Non-Goals

**Goals:**

- Establish one server-only Admin source policy shared by the real Admin
  Products and Orders surfaces and every related API route.
- Preserve real Admin login, signed-cookie verification, and authorization
  ordering for both local and production modes.
- Add typed, process-memory local Catalog adapters backed by deterministic
  development data and the existing validation/bounded command boundaries.
- Add an independent synthetic Admin Orders read adapter that can render the
  existing page without Storage or production Order access.
- Make source isolation, production fail-closed behavior, restart reset, and
  zero-provider behavior testable with offline sentinels.
- Produce a truthful manual Chrome acceptance handoff for desktop, 375px,
  keyboard, coarse pointer, reduced motion, long content, safe errors, and
  no horizontal overflow.

**Non-Goals:**

- No Supabase schema, migration, database persistence, production data
  backfill, or deployment change.
- No replacement production authentication system, fake login, auto-login,
  browser auth, or client-visible backend selector.
- No production Admin redesign and no new Catalog, customization, Order,
  Payment, Fulfillment, Tracking, shipping, delivery, inventory, supplier,
  procurement, warehouse, or provider capability.
- No local replacement for the production Order mutation workflow. Existing
  Order/payment/photo-review/digital-delivery/Fulfillment/Tracking controls
  remain disabled, bounded, or unavailable in local mode as appropriate.
- No change to public storefront source selection or to the incomplete
  high-fidelity change's tasks, specs, audit, or code.

## Decisions

### 1. Use a separate, explicit Admin acceptance selector

The runtime will parse a server-only `ADMIN_ACCEPTANCE_SOURCE` value. The only
local value is `local_fake`; absence means the existing production path, and
unknown values are configuration failures. The value is read from the server
runtime configuration boundary, never from `import.meta.env`, `define`, query
parameters, request bodies, cookies, or client props. It is intentionally
separate from the public catalog selector `PHOTOGIFT_PRODUCT_SOURCE`.

`local_fake` is valid only for development and test. A production process with
that value fails closed before local data is served. This preserves the
engineering-foundation rule that production Supabase remains authoritative and
that a provider failure never falls back to fixtures.

Alternatives rejected:

- Automatically using existing catalog fixtures would make Admin source
  selection implicit and could expose synthetic data in production.
- Reusing the public storefront selector would couple Admin authority to an
  unrelated surface and would not protect Orders/Storage.
- A browser selector would allow an untrusted caller to choose a privileged
  repository.

### 2. Resolve source only after the existing Admin authority boundary

Page and route composition will retain `ExistingAdminSessionVerifier` or the
existing `isValidAdminSession` equivalent. Each composition passes a deferred,
server-side repository factory or source resolver so an unauthorized request
returns before local, Supabase, or Storage construction. The selector decides
which already-authorized adapter is constructed; it does not authorize the
request.

The production branch keeps the current factories and client behavior when the
selector is absent. The local branch is selected only after authorization and
cannot be chosen by request data. Error mapping remains the existing bounded
HTTP/page mapping; raw SQL, provider, filesystem, stack, environment, and
secret values are not returned.

### 3. Build one process-memory local Catalog graph over existing contracts

Create a server-only local Admin Catalog repository composition seeded from the
existing deterministic development Catalog fixture factory. Keep the state in
one typed in-memory graph and expose the existing provider-neutral read,
command, SKU graph, ProductAsset, FulfillmentConfig, and lifecycle repository
interfaces required by the Admin boundaries. Commands use the current domain
parsers, graph validation, lifecycle rules, and bounded intent; they do not
add semantics or hard-delete behavior.

The local graph is a development/test authority only. The implementation must
provide test injection/reset boundaries without introducing a durable reset
endpoint or browser storage. A process restart creates the deterministic seed
again; filesystem, SQLite, Supabase, D1, Drizzle, and network persistence are
not used. The existing public development Catalog repository remains separate
from this Admin composition so the public storefront cannot accidentally read
Admin acceptance mutations.

### 4. Add a separate read-only synthetic Admin Orders seam

Define a provider-neutral Admin Orders read model with only the fields the
existing Orders page needs for local presentation: bounded order identity,
safe display statuses, line-item summaries, long-copy customization display,
pagination/filter results, and empty/error states. Seed it with clearly
synthetic `LOCAL / TEST ONLY` fixtures, including long references and long
content for wrapping checks. It contains no real email, PII, payment ID,
upload key, storage path, carrier, or production Order data.

In local mode, the Orders page and its read/API path use this seam rather than
calling `getSupabaseServerClient`. A local fixture never contains a private
photo locator, so the page must not enter Supabase Storage signed-URL logic.
Existing Order/payment/photo-review/digital-delivery/Fulfillment/Tracking
controls are not turned into a new local workflow; they are explicitly
disabled or return bounded unavailable behavior in local mode. No fake
Supabase signed URL is generated.

### 5. Apply the same policy to the whole Admin route family

The source resolver is used by the Admin Products page and all existing
Catalog API paths surfaced by its editors: content, SKU graph, ProductAsset,
FulfillmentConfig, lifecycle, and any existing Catalog-adjacent
CustomizationField route that the real page invokes. A read path and its
mutation path must receive the same local composition; no route may silently
write production while the page reads local data.

Admin Orders remains a separate composition and is not forced through Catalog
interfaces. Public storefront, Customer Auth, Local Order, Local Payment,
Fulfillment, Tracking, and existing production Admin paths are not changed
when the selector is absent.

### 6. Make no-provider guarantees observable

Offline tests will wrap the production Supabase client factory, remote fetch,
Storage construction, and production Order repository seam with counters or
throwing sentinels. An authorized local Products + Orders request must observe
zero calls to all of them. Unauthorized and invalid-session tests must observe
zero repository construction. Production/default tests must continue to reach
the existing production factory through dependency injection without making a
live network call.

The browser acceptance run will use a local Worker with the explicit selector
and a separate local Admin password value supplied outside committed source.
The evidence will record the local mode and zero-provider observation without
printing credentials or complete environment objects.

### 7. Treat local persistence and browser acceptance honestly

The local Catalog graph is intentionally process-memory only; any editor
mutation that is exercised is an honest in-memory result and is lost on
restart. This is not a production persistence claim and does not authorize
Admin completion in the high-fidelity change by itself.

The minimum sufficient Task 10.2 acceptance is an authorized page render and
safe control presentation across the required browser/accessibility matrix.
Real production Admin mutation is not a Task 10.2 prerequisite. The handoff
will therefore avoid destructive controls and will separately document that
local process-memory commands are not durable.

## Risks / Trade-offs

- [Risk] Module-level process memory can differ across Worker isolates or
  development restarts. → State the single-process limitation, reset on
  restart, and never present it as persistence; use deterministic fixtures for
  every acceptance run.
- [Risk] A missed Admin route could still construct Supabase in local mode. →
  Centralize source composition, cover every route used by the pages, and use
  factory/network/Storage sentinels plus static route audits.
- [Risk] Existing Orders UI expects production-only mutation or storage data.
  → Keep the local Orders seam read-only, use safe synthetic fixtures, and
  disable or return bounded unavailable results for those controls.
- [Risk] An environment value could be accidentally bundled or supplied by a
  request. → Keep parsing in server-only configuration code, do not export it
  to Client Components, and test that request/query/body/cookie input cannot
  change source selection.
- [Risk] Local Catalog commands could drift from current validation. → Reuse
  the existing typed boundaries and domain parsers, add only composition/state
  adapters, and do not copy test-only behavior into the runtime.
- [Risk] The new local runtime could be mistaken for production readiness. →
  require explicit local notices, local/test-only fixture labels, runbook
  exclusions, and a handoff back to high-fidelity Task 10.2 rather than
  changing that task automatically.

## Migration Plan

There is no database migration or schema change. Apply is a local code/test
change only. Before implementation, record the source selector and route
composition decisions; during implementation, land the local adapters and
sentinel tests behind the explicit development/test gate. Validate the real
login and signed session flow in a local Worker, then record the browser
acceptance handoff.

Rollback is a code rollback/removal of this independent change. With the
selector absent, the pre-existing production Admin composition remains the
fallback authority; a provider failure must not trigger the local branch.
No remote state is created or changed.

## Open Questions

None. The selector name, production/default behavior, Admin authorization
ordering, local Catalog process-memory boundary, separate Orders read seam,
and Task 10.2 acceptance minimum are resolved by this design.
