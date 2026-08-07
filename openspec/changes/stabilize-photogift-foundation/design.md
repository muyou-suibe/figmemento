## Context

See `proposal.md` for motivation and `specs/engineering-foundation/spec.md` for the required behavior. The current repository is a Next.js-compatible App Router application running through vinext/Vite on Cloudflare Workers. Existing business persistence and private uploads use Supabase, while root-level D1/Drizzle starter files, an empty D1 schema, optional Cloudflare binding code, and D1 examples remain in the checkout.

The storefront is currently a large client component that owns product loading, fallback selection, cart state, upload state, and checkout initiation. Product reads attempt Supabase in the browser and silently retain a hardcoded catalog after any configuration or network error. Existing server routes import a service-role Supabase client directly, which makes offline route testing difficult and spreads provider types into route logic. Product, cart, customization, order, upload, payment, and admin types are duplicated locally.

Strict TypeScript checking currently reports errors in storefront photo types and event handlers, admin query fallback shapes, upload cleanup types, order-route metadata narrowing, and unused Cloudflare/D1 starter paths. Lint passes, but the current test script depends on a prebuilt output and covers only basic homepage rendering. The production build was not run during Explore because that phase was read-only.

No database entity is added or changed by this foundation design. Existing SQL remains the active schema description until a later approved change creates a managed baseline migration.

## Goals / Non-Goals

**Goals:**

- Make the existing checkout pass strict typecheck without weakening project safeguards.
- Create narrow domain, application, configuration, and provider boundaries that later changes can extend incrementally.
- Ensure the production product source is unambiguously Supabase and non-production fixtures are explicit.
- Make foundational and existing-route tests deterministic without live third-party services.
- Classify D1/Drizzle and Cloudflare support paths before any isolation action.
- Define the canonical migration policy future Supabase schema changes must follow.
- Preserve the current vinext/Cloudflare runtime and existing confirmed business behavior.

**Non-Goals:**

- Redesigning the storefront or introducing the future catalog, SKU, customization, authentication, cart, shipping, payment, preview, notification, tracking, analytics, or admin capabilities.
- Correcting known out-of-scope commerce behavior such as customized duplicate-line aggregation, true multi-image persistence, production-preview workflow, dynamic option pricing, missing Stripe webhook expected amount/currency verification, or the client success page. Those defects remain explicitly deferred and MUST NOT be characterized as desired behavior.
- Selecting Supabase Storage or Cloudflare R2 as the final MVP object-storage provider.
- Creating or applying any business database migration.
- Replacing vinext, Cloudflare Workers, Supabase PostgreSQL, or Stripe merely to simplify the refactor.

## Decisions

### 1. Use incremental domain and adapter boundaries inside the existing application

Introduce small modules under the existing application tree rather than moving the repository to a new `src/` layout or adopting a framework-wide architecture rewrite:

- `app/domain/`: provider-neutral types and validation/narrowing helpers for the existing Product, Cart, Customization, Upload, Order, and Payment shapes.
- `app/application/`: existing use-case logic that coordinates domain values and repository/integration interfaces.
- `app/infrastructure/`: Supabase and Stripe adapters plus fixture adapters where needed.
- `app/config/`: browser-safe and server-only configuration parsers.

UI modules consume domain/application results. Server routes remain transport adapters: they parse requests, invoke an application service, and map the result to an HTTP response. Provider response types do not become domain types.

This change extracts only behavior required to fix types, source selection, testability, and configuration boundaries. It does not introduce speculative future SKU or workflow abstractions.

**Alternatives considered:**

- A new root `src/` architecture would offer a cleaner long-term tree but would create a broad file move unrelated to the foundation defects.
- Leaving types beside each UI/route would minimize edits but preserve the incompatibilities that caused the current type failures and make later changes unsafe.

### 2. Move product-source selection behind a server-controlled repository

Define a provider-neutral product repository used by the storefront-facing application boundary:

- `SupabaseProductRepository` is the authoritative production implementation.
- A deterministic `FixtureProductRepository` is available only for tests and explicitly selected local development.
- Production defaults to Supabase even when no selection variable is present.
- A server-only product-source setting may select `fixture` only when the runtime is not production; production rejects that value.
- Supabase configuration/query failures return a typed unavailable result. The storefront renders a controlled unavailable state instead of silently continuing with fixture products.
- Fixture records live outside the production catalog module and are named/documented as fixtures.

The browser receives sanitized domain product data, not direct service-role access or a source-selection flag. Existing publishable-key use elsewhere is not expanded by this change.

**Alternatives considered:**

- Keeping the current browser query and checking `NODE_ENV` in the client would risk bundling source-selection behavior and produce inconsistent build-time substitutions.
- Deleting the hardcoded records would remove useful local/test data and violate the requested fixture-preservation constraint.
- Automatically falling back to fixtures in development would continue hiding broken Supabase setup, so fixture use remains explicit.

### 3. Keep shared contracts intentionally limited to current behavior

Each shared contract represents the current data crossing a boundary, with distinct names for domain values and external request/storage shapes. Runtime request parsing uses explicit narrowing functions rather than unchecked casts. Extraction must not add future fields solely because they appear in the confirmed long-term data model.

Known defects discovered while extracting contracts are recorded in documentation and later-change references. In particular, tests must not assert that separate customized copies of one product should be aggregated, that only one uploaded photo is desired, or that a query-string success value is authoritative payment state.

**Alternatives considered:**

- Designing the full future Product/SKU and order snapshot model now would overlap the next OpenSpec change and risk silently deciding business behavior.
- Preserving all existing ad hoc types would leave UI, request, database, and provider shapes indistinguishable.

### 4. Validate configuration in public and server-only layers

Configuration is divided into:

- Browser-safe values explicitly prefixed and allowlisted for client use.
- Core server configuration for Supabase business persistence.
- Integration-specific server configuration for Stripe, webhook handling, admin access, and later providers.
- Optional development/test fixture selection, rejected in production.

Validation occurs at the earliest safe point that does not require Cloudflare runtime secrets during compilation. Production builds therefore validate static configuration shape but do not require runtime-only secret values. Each server integration validates its required secret configuration before first use and returns a typed configuration error. Error messages may identify a missing variable name but never print values.

No broad configuration object containing secrets may be imported by client components. Tests construct explicit configuration objects instead of mutating or depending on a developer's `.env.local`.

**Alternatives considered:**

- Validating every secret at module import/build time would conflict with Cloudflare runtime secret injection.
- Reading `process.env` throughout routes preserves implicit dependencies and makes offline tests order-dependent.

### 5. Classify D1/Drizzle paths before isolation

The initial repository evidence supports the following provisional classification, which implementation must verify with imports, package scripts, hosting configuration, and a production build before applying an isolation action:

| Path or concern | Provisional class | Evidence / intended handling |
|---|---|---|
| `vite.config.ts` | Runtime-required | Configures vinext, Vite, Cloudflare plugin, and optional bindings; retain. |
| `worker/index.ts` | Runtime-required | Active Worker entry and image optimization; retain while removing only unused D1 typing if verified safe. |
| `build/sites-vite-plugin.ts` | Runtime-required build support | Imported by Vite and packages hosting metadata; retain. |
| `.openai/hosting.json` | Runtime-required deployment metadata | Currently declares no D1/R2 binding; retain. |
| Optional D1 branch inside `vite.config.ts` | Inert optional runtime support | Binding is disabled by current hosting metadata; retain unless separately approved because it shares a runtime-required file. |
| `db/index.ts` and empty `db/schema.ts` | Unused template residue | No active application import and no D1 binding; isolate from the active PhotoGift business path after the implementation inventory verifies that evidence. Do not directly delete any file whose purpose remains uncertain. |
| `drizzle.config.ts`, `drizzle/`, D1 package script and Drizzle dependencies | Unused template/tooling residue | Configured for SQLite/D1, not Supabase PostgreSQL; isolate from active tooling after verification without deleting files of uncertain purpose. |
| `examples/d1/` | Example-only | Retain as an explicitly excluded example that is not part of PhotoGift's business architecture. |

**Approved direction:** retain the four runtime-support paths and the inert optional D1 binding branch in `vite.config.ts`; after import, package-script, binding, and production-build verification, isolate root D1/Drizzle tooling from PhotoGift's active business scripts, dependencies, TypeScript coverage, and deployment path. Retain `examples/d1/` as an explicitly excluded example. Do not directly delete files whose purpose is unconfirmed.

**Alternatives considered:**

- Deleting every D1/Drizzle reference immediately risks removing Sites build support that happens to mention migrations or bindings.
- Excluding all failing files from TypeScript without classification would make the gate green while preserving misleading active-looking infrastructure.

### 6. Use Supabase CLI-style ordered SQL migrations for future business schema changes

This migration-management direction is approved for C0 and later schema-bearing changes.

The canonical future workflow is timestamped, ordered SQL under `supabase/migrations/`, compatible with Supabase PostgreSQL and reviewable in Git. Future schema-bearing changes must include:

1. An ordered migration with a descriptive name.
2. A local/test application step against a disposable Supabase-compatible database when available.
3. Verification of constraints, indexes, RLS, grants, and forward compatibility.
4. Deployment ordering before application code that depends on the new schema.
5. A rollback plan where safe, otherwise an explicit forward-fix plan.

The existing `supabase/schema.sql`, `seed.sql`, `coupons.sql`, and `operations.sql` are documented as legacy bootstrap inputs, not as the pattern for new changes. This foundation change does not convert them into a baseline migration because doing so could misrepresent what is already applied to the connected project and would constitute a business-schema operation. The first later schema-bearing change must establish or verify a baseline before adding its delta.

**Alternatives considered:**

- Reconfiguring the existing Drizzle SQLite setup for PostgreSQL would add an ORM/migration decision unrelated to current runtime use.
- Continuing unordered SQL scripts makes deployment order and applied state ambiguous.

### 7. Characterize existing route logic through injectable boundaries

Extract only the route-adjacent logic necessary to replace hard imports with interfaces for repositories, storage, clocks/IDs, and network calls. Production route exports construct real adapters; tests call factories or pure services with fakes.

Use the existing Node test runner where practical. If TypeScript test execution requires a small development-only loader, it may be added only after confirming it does not introduce a second application framework. Tests cover source selection, configuration, server-authoritative base pricing, coupon revalidation, upload rejection, existing webhook signature rejection and duplicate-event/replay behavior where practical, order lookup minimization, and admin authorization rejection. They do not require real credentials or live networks. Missing expected order amount/currency verification is recorded as deferred work for `integrate-stripe-and-paypal-payments`; this change does not add that payment-validation behavior.

The verification scripts are separated so failures are attributable:

- `npm run lint`
- `npm run typecheck`
- an offline automated-test command
- `npm run build`
- an aggregate verification command that runs the gates in a documented order

### 8. Fix TypeScript errors surgically

Resolve each current error at its source: define non-recursive photo metadata types, distinguish React and DOM keyboard events, remove the undefined photo-state setter or restore the intended existing state consistently, normalize optional Supabase result shapes, narrow unknown request metadata before comparison, and stop compiling inactive D1 application code as if it were active product code once its classification is approved.

Compiler strictness, `skipLibCheck`, test selection, and lint rules are not weakened to hide errors. No broad `any`, `@ts-ignore`, or disabled test is an acceptable fix.

### 9. Replace starter documentation with PhotoGift operational documentation

The root README becomes the developer entry point for the actual project. It documents architecture, active Supabase persistence, Cloudflare runtime, fixture opt-in, environment variable categories, setup, verification gates, migration policy, deployment assumptions, and deferred OpenSpec changes. Example environment files contain names and placeholders only. Documentation explicitly states that object-storage final selection remains unresolved and that D1/Drizzle is not an active business persistence path.

## Risks / Trade-offs

- **[Production failures become visible]** Removing silent fixtures may expose currently misconfigured deployments. → Render a controlled unavailable state, emit actionable server diagnostics without secrets, and document required configuration.
- **[Module extraction changes behavior accidentally]** Moving logic can introduce subtle request/serialization differences. → Add characterization tests before or alongside each extraction and keep transport response shapes stable.
- **[Tests preserve prototype defects]** Broad snapshots could make known defects harder to fix later. → Test only approved invariants and maintain an explicit deferred-defect list.
- **[Incorrect D1 classification breaks Cloudflare build]** Template and runtime support coexist in nearby files. → Verify imports/bindings first, retain uncertain paths, and require a production build after each isolation step.
- **[Runtime-secret validation breaks builds]** Cloudflare may inject secrets after compilation. → Separate build-safe validation from integration-specific runtime validation.
- **[Migration policy lacks an applied baseline]** Flat SQL files may not match the remote project's actual state. → Document them as legacy inputs and require the first schema-bearing change to reconcile a baseline before applying a delta.
- **[Foundation scope expands into commerce redesign]** Shared types can invite speculative SKU/order changes. → Enforce the non-goals and record future fields as deferred instead of implementing them.

## Migration Plan

1. Record the pre-change lint/typecheck/test/build results and current infrastructure import/binding inventory.
2. Add shared current-domain and configuration boundaries with characterization tests; keep existing route and UI response behavior stable.
3. Introduce server-controlled product repositories and explicit fixture selection; verify production cannot activate fixtures.
4. Apply the approved D1/Drizzle isolation action only after the inventory confirms the provisional classification.
5. Update scripts, tests, example configuration, migration-policy documentation, and README.
6. Run lint, strict typecheck, offline tests, production build, source-policy tests, and a tracked-source secret scan.

There is no database or external-service migration. Rollback is a source revert of this change. If production product-source tightening reveals missing configuration, rollback may temporarily restore the previous release, but fixture fallback must not be reintroduced as the long-term fix; the deployment configuration must be corrected.

## Open Questions

- The final object-storage provider remains intentionally unresolved and is deferred to the private-upload change; this foundation keeps existing Supabase Storage behavior without declaring it the final MVP choice.
- The exact controlled storefront presentation for a production catalog outage may follow the existing visual system, provided it is explicit, non-secret, and never substitutes fixture products.
