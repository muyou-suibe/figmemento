## Why

PhotoGift's C1 storefront is implemented, but the current local runtime does not reliably select the approved development catalog, its fixture media points at unusable placeholders, and its one-Variant fixture graph cannot demonstrate SKU selection. A small parallel change is needed now so the existing storefront can provide a deterministic, honest first local Demo without depending on Supabase, migrations, production infrastructure, or fake Admin persistence.

## What Changes

- Establish a documented vinext/Worker-compatible local fixture activation path using an explicit ignored local environment setting, while preserving Supabase as the production/default catalog source and preserving production fixture rejection.
- Replace only development-fixture ProductAsset placeholder URLs with contract-valid, non-private demo references that produce deterministic controlled storefront fallbacks; do not change the ProductAsset domain contract, upload binaries, or select a storage provider.
- Expand one development-only `couple-figure` fixture into a valid single-Option, three-Variant SKU graph that demonstrates complete option selection, distinct Variant-authoritative prices, unique SKU resolution, and one visibly unavailable choice using existing C1 availability semantics.
- Add focused offline and local smoke verification for Homepage, Shop, Category, Product Detail, ProductAsset fallback, Variant selection/price/availability, fulfillment details, fixture isolation, zero Supabase traffic in fixture mode, and continued production fixture rejection.
- Add a concise local Demo runbook with required non-secret configuration, verification/start commands, exact Demo path, intentional exclusions, and an Admin persistence warning.
- Keep Admin persistence, Supabase schema/application, production catalog data, C1 tasks, branding, cart/order/payment, CustomizationField, uploads, inventory, deployment, and DNS out of scope.

## Capabilities

### New Capabilities

- `local-catalog-demo`: Defines deterministic development-only fixture activation, safe fixture media fallback, a representative multi-Variant demo graph, local storefront smoke isolation, and the local Demo runbook.

### Modified Capabilities

- None. The active `build-configurable-product-catalog` change and its C1 requirements remain unchanged dependencies.

## Impact

- **Development data:** Development catalog fixture records for ProductAssets and one representative Product Option/OptionValue/Variant graph.
- **Local configuration and docs:** `.env.example` only if clarification is needed, plus `docs/local-demo.md`; developer-specific `.env.local` remains ignored and uncommitted.
- **Verification:** Fixture-focused tests, existing storefront/offline gates, and a local network-observation smoke check that fails if fixture mode contacts Supabase.
- **Runtime behavior:** Only explicitly selected development/test fixture mode changes. Production continues to default to Supabase and reject fixture activation.
- **Dependencies and risk:** Depends on completed C1 storefront/domain behavior. The repository has no suitable product media files and the current contract rejects local relative URLs, so this change deliberately uses contract-valid public references and the existing controlled fallback instead of changing the contract or adding external media dependencies.
