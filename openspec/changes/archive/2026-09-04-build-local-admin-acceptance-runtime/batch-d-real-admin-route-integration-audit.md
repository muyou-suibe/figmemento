# Batch D — Real Admin Route Integration Audit

## Scope

Batch D integrates the existing Admin Products, Catalog API, and Admin Orders
read/export surfaces with the approved server-only Admin acceptance source
policy. It does not add persistence, migrations, browser acceptance, or
production capability.

## Authorization and source composition

- Every Catalog mutation handler retains the existing Admin session verifier,
  same-origin check, JSON parsing, and safe response mapping before invoking
  its repository factory.
- `/admin/products` passes its existing session verifier through the shared
  Catalog query boundary. The selected local Catalog runtime is created lazily
  only after authorization and is reused process-wide by the page and all
  Catalog API handlers.
- Catalog content, SKU graph, ProductAsset, FulfillmentConfig, lifecycle, and
  page-used CustomizationField handlers all use the same source family. There
  is no local-read/production-write split.
- The explicit `ADMIN_ACCEPTANCE_SOURCE=local_fake` selector is accepted only
  in development/test runtime modes. Absent selection remains production;
  invalid selection and local selection in production fail closed.
- A local source failure is returned as a bounded source failure and is never
  retried through the production source.

## Catalog route evidence

`tests/admin-acceptance-batch-d.test.mjs` invokes the actual route handler
modules and verifies this deterministic sequence with one signed local Admin
session:

1. An unauthenticated Catalog content request returns `401` before its source
   factory is constructed.
2. Product content and Category content mutations return `applied`.
3. The existing Product SKU graph is submitted through the SKU graph route and
   returns `applied`.
4. Existing ProductAsset metadata is updated through the Asset route and
   returns `applied`.
5. Existing ProductFulfillmentConfig is submitted through the Fulfillment
   route and returns `applied`.
6. Customization configuration is read through its protected route.
7. Product lifecycle is unpublish-then-publish through the lifecycle route.
8. A subsequent shared Catalog read observes all applied changes and the final
   Product lifecycle remains `published`.
9. Repeated access to the shared local runtime returns the same runtime and
   reader instances.

The test uses the development Catalog fixture only as local test input. It
does not call Supabase, Storage, a production Order repository, or any network
provider.

## Local Orders route boundary

After the existing Admin session check, `/admin/orders` and
`/api/admin/orders/export` resolve the separate synthetic Orders read seam.
In local mode they use the process-memory local Orders repository, expose the
`LOCAL / TEST ONLY` notice, share the normalized query/filter semantics, and
render only disabled/read-only controls. They do not construct Supabase,
Storage, signed URLs, private upload locators, or production Order mutation
controls. Export rows are the safe public projection and use a local-test
filename.

The local Orders integration evidence verifies reference/search and attention
filter coherence, export coherence, USD-only fixture projection, and the
absence of private photo locators. The route source audit also verifies that
local source resolution precedes the production Supabase query path.

## Failure and production safety evidence

- The source policy test proves a thrown local source produces `source_failure`
  without invoking the production factory.
- A local selector with `NODE_ENV=production` produces bounded
  `invalid_configuration` rather than constructing either source.
- The existing absent-selector production composition is preserved after the
  local branch; no production schema or records are changed by this change.
- The local runtime is process-memory only and is reset by the test-only reset
  seam; no filesystem, SQLite, D1, Supabase, Storage, or network persistence is
  introduced.

## Verification record

- Focused Batch D route integration: `4/4` passed.
- Full offline, rendered, typecheck, lint, build, verify, strict OpenSpec, and
  diff checks are recorded in the implementation handoff after the final gate.
- Authorized local browser acceptance (Tasks 6.x) has not been run.

## Scope audit

- Tasks 4.1–4.5 only.
- Tasks 5.x, 6.x, and 7.x remain unchecked.
- No Order persistence, Payment, Fulfillment, Tracking, migration, remote
  Supabase access, deployment, or high-fidelity change work was performed.
