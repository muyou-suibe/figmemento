## Context

See `proposal.md` for motivation and `specs/local-catalog-demo/spec.md` for the observable contract. The C1 storefront and catalog domain already support explicit fixture selection, fixture notices, ProductAsset fallbacks, Variant resolution, authoritative Variant pricing, availability, and fulfillment presentation. The remaining Demo gap is in the local Worker environment and the quality of development-only fixture data.

The current server source reader defaults to Supabase and rejects `fixture` outside development/test. Investigation of the failed Task 1.1 gate confirmed that `.env.local` is loaded and `PHOTOGIFT_PRODUCT_SOURCE=fixture` reaches the Worker binding and runtime `process.env`. The failure occurs because the parser receives the whole `process.env` object and reads `environment.NODE_ENV`, while vinext/Vite determines the runtime mode through the direct `process.env.NODE_ENV` expression. That static runtime-mode value does not follow the aliased object-property read, so the parser cannot confirm development/test and correctly rejects fixture mode. The repository has no suitable product photography, ProductAsset URL values must be HTTPS, and `public_reference` values intentionally render through the existing controlled fallback. All 22 current fixture Products have one default Variant and no Options.

This change is parallel to `build-configurable-product-catalog`: it may consume completed C1 contracts and storefront behavior, but it must not edit that change's planning artifacts, completion state, migrations, or production persistence design.

## Goals / Non-Goals

**Goals:**

- Make explicit fixture selection reliable in the actual local Worker runtime without weakening the current source-selection guardrails.
- Produce a deterministic, externally independent storefront Demo using the existing route and component graph.
- Exercise one real C1 Option/OptionValue/Variant graph with distinct Variant-authoritative prices and an unavailable choice.
- Prove offline that the Demo route sequence does not contact Supabase.
- Give the presenter a short, accurate runbook that distinguishes fixture-backed storefront behavior from database-backed Admin persistence.

**Non-Goals:**

- Provide any Admin write persistence, local database, migration execution, or fake successful mutation.
- Change ProductAsset validation, add local-relative asset URLs, introduce binary assets, or decide a storage provider.
- Change production catalog-source behavior, catalog schema, C1 business semantics, or active C1 tasks.
- Add CustomizationField behavior, inventory quantities, supplier concepts, cart/order/payment work, branding, deployment, DNS, or production configuration.

## Decisions

### 1. Combine an ignored fixture binding with a narrow server-only runtime-mode adapter

The runbook will require an uncommitted `.env.local` containing only the explicit `PHOTOGIFT_PRODUCT_SOURCE=fixture` selection needed for local development. The binding and the other existing runtime configuration values continue to come from runtime `process.env`. Fixture activation no longer relies on `.env.local` alone: a narrow server-only adapter will combine those existing values with the runtime mode obtained from the direct `process.env.NODE_ENV` expression that vinext/Vite determines for development, test, and production.

The adapter only normalizes the environment object passed to the existing `readProductSource(environment)` parser. It does not choose a source, implement fallback behavior, reinterpret runtime modes, enumerate or log `process.env`, expose configuration to client components, or accept a `NODE_ENV` binding as production authority. The parser and its business rules remain unchanged. Node/offline tests continue to pass explicit environment inputs without requiring a Cloudflare runtime.

The public catalog repository creation path will use the adapter only when no explicit test environment has been supplied. Apply will also audit the legacy Product repository factory that calls the same parser: it must either share the same adapter where relevant or remain explicitly outside the Demo path without creating a second runtime-mode rule. `.env.example` will be changed only if its existing comments are insufficient to explain the required local file.

The source reader remains authoritative: absent/blank selection resolves to Supabase, Supabase failure never activates fixtures, and `NODE_ENV=production` rejects fixture mode. No committed file will select fixture mode by default, and the runbook will not require Supabase credentials for the fixture Demo.

**Alternatives considered:**

- Shell-prefixing `npm run dev` was rejected because the current Worker runtime has already shown that this value can be lost across the vinext/Cloudflare boundary.
- Committing a fixture default was rejected because it would weaken production/default source behavior.
- Adding an automatic Supabase-to-fixture fallback was rejected because it would hide source failures and violate the engineering foundation.
- Adding `NODE_ENV` to `.env.local` or creating a `NODE_ENV` Worker binding was rejected because runtime mode must come from vinext/Vite and must not be operator-overridable production authority.
- Enabling `CLOUDFLARE_INCLUDE_PROCESS_ENV` or changing compatibility flags was rejected because the required fixture binding already reaches runtime `process.env`, while broad host-environment injection would increase secret exposure without fixing the aliased runtime-mode read.
- `import.meta.env` or Vite `define` bridging was rejected because it would create build-time inlining and potential client-boundary ambiguity.
- A `cloudflare:workers` binding adapter remains unnecessary for this change because the approved investigation confirmed that `PHOTOGIFT_PRODUCT_SOURCE` already reaches runtime `process.env`; introducing Cloudflare-specific binding access and types would be a larger solution than the confirmed defect requires.

### 2. Use provider-neutral public references and the existing controlled fallback for fixture media

Each development fixture ProductAsset will use a stable `public_reference`, such as `marketing:development-catalog/<product-slug>/thumbnail`, instead of an `example.com` URL. These values pass the existing whitespace and private-prefix checks, remain clearly public marketing metadata, and are deliberately non-renderable as direct media URLs. The existing ProductAsset gallery/card behavior will therefore display its controlled fallback without making an external media request.

This is a deliberate first-Demo trade-off: it is deterministic and honest but not a product-photography showcase. If Apply discovers that a proposed reference does not pass the unchanged ProductAsset contract or does not produce the existing fallback, implementation must stop that branch rather than broaden the contract.

**Alternatives considered:**

- Local relative URLs were rejected because the approved ProductAsset contract accepts HTTPS URLs or provider-neutral references, not local path semantics.
- New external image URLs were rejected because they add network availability and licensing dependencies.
- Adding generated or uploaded binaries was rejected because upload/storage architecture is outside this change.

### 3. Expand only `couple-figure` into the representative multi-Variant graph

The development-only `couple-figure` Product will own one required Option:

| Entity | Code / label | Purpose |
|---|---|---|
| Option | `size` / Size | Existing SKU-defining `size` kind |
| Value | `mini` / Mini | Available entry Variant |
| Value | `standard` / Standard | Available higher-price Variant |
| Value | `deluxe` / Deluxe | Explicit unavailable Variant |

The graph will use stable fixture IDs and globally unique SKU codes. The planned Variants are:

| SKU code | Selected value | USD price | Active | Available | Default | Supply method |
|---|---:|---:|---:|---:|---:|---|
| `DEV-COUPLE-FIGURE-MINI` | `mini` | 6,990 cents | yes | yes | yes | `made_to_order` |
| `DEV-COUPLE-FIGURE-STANDARD` | `standard` | 8,990 cents | yes | yes | no | `made_to_order` |
| `DEV-COUPLE-FIGURE-DELUXE` | `deluxe` | 10,990 cents | yes | no | no | `made_to_order` |

Each Variant will retain valid physical weights using deterministic fixture values. The Product's existing physical FulfillmentConfig remains authoritative for `physical`, shipping-required, `custom_manufacturing`, and its 5–10 business-day lead-time range. The unavailable flag represents only the existing C1 boolean availability semantics; it is not exact inventory.

All other fixture Products retain their existing default empty-combination Variant. The entire resulting dataset must pass current graph/public-eligibility validation, including required-option completeness, same-Product ownership, one value per Option, unique combination, unique SKU, USD pricing, and at least one eligible Variant.

**Alternatives considered:**

- Adding multiple Options was rejected as unnecessary for the first 8–10 minute Demo.
- Reusing personalization concepts such as photo count, names, or styles was rejected because those belong to later CustomizationField work.
- Changing every fixture Product was rejected because it would increase test surface without improving the core Demo path.

### 4. Verify the real local route path with a zero-request Supabase sentinel

Verification has two layers:

1. Deterministic offline tests validate runtime-mode normalization, explicit Node/test environment injection, source selection, the complete fixture dataset, asset fallback behavior, the representative Variant graph, exact Variant resolution, price transitions, unavailable selection, fulfillment presentation, and production fixture rejection.
2. A local smoke harness starts the actual development runtime with fixture mode and a local request-counting sentinel configured as the Supabase URL, requests Homepage, Shop, the `3d-figures` Category, and `couple-figure` Product routes, and asserts successful fixture-backed output plus zero sentinel requests.

The sentinel is only an observation endpoint; it does not return catalog success or simulate Supabase data. The fixture repository remains the real Demo source. The harness must not overwrite an existing `.env.local`: it must either operate in an isolated temporary project context or fail safely with clear instructions. Any temporary non-secret environment file must be ignored, removed on exit, and contain no live provider value.

Local smoke uses development mode because production is intentionally required to reject fixtures. `npm run build` remains a verification gate, not the fixture Demo startup mode.

**Alternatives considered:**

- A repository-only unit test was rejected as insufficient to prove the environment value reaches the Worker and the actual routes.
- A live Supabase project was rejected because this change must remain fully offline.
- Treating route success alone as proof was rejected because explicit request observation provides a stronger no-Supabase assertion.

### 5. Keep the runbook narrow and presenter-safe

`docs/local-demo.md` will contain prerequisites, the exact ignored `.env.local` value, verification and startup commands, expected fixture notice, localhost URLs, an 8–10 minute storefront sequence, and troubleshooting for accidental Supabase selection. It will explicitly state that `/admin/products` persistence and all save/lifecycle actions require a compatible Supabase database with C1 migrations and are not part of this Demo.

The runbook will not include credentials, production provider values, migration commands, production start/deployment steps, DNS operations, or instructions that imply fixture content is production data.

## Risks / Trade-offs

- **[Controlled fallbacks are visually modest]** → Clearly frame this Demo around catalog structure and Variant behavior; defer polished media to the approved asset/storage work.
- **[Worker runtime mode is statically determined while bindings are runtime values]** → Keep the adapter server-only and narrow, overlay only the direct vinext/Vite runtime mode, preserve explicit Node/test injection, and retain an end-to-end local smoke gate.
- **[An unavailable button may be mistaken for exact inventory]** → Runbook and fixture naming describe it only as C1 availability, never stock quantity.
- **[Fixture edits could break existing Admin/offline tests that reuse the dataset]** → Validate the full graph and run the complete existing offline and rendered suites, making only scope-preserving fixture expectation updates.
- **[Smoke harness could collide with developer configuration or ports]** → Refuse to overwrite local environment files, use isolated temporary configuration and dynamically allocated observation ports where practical, and clean up child processes deterministically.
- **[Fixture mode could accidentally leak into production]** → Preserve and test the production rejection guard and keep fixture selection out of all committed defaults.

## Migration Plan

There is no database or production migration.

1. Implement and test the narrow runtime-mode adapter, then rerun the previously failed Task 1.1 Worker proof before treating fixture activation as reliable.
2. Update development-only fixture assets and the single representative Variant graph.
3. Add offline and local smoke verification.
4. Add and verify the Demo runbook.
5. Run all required quality gates before declaring the change Demo-ready.

Rollback consists of reverting this change's local configuration documentation, fixture data, tests/smoke harness, and runbook. No remote state, production catalog data, migration history, or C1 task state is affected.
