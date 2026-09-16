## 1. Reliable Local Fixture Activation

- [x] 1.1 Resolve the failed Worker gate using the confirmed characterization evidence: implement a narrow server-only adapter that combines runtime `process.env` values, including the existing fixture binding, with the direct `process.env.NODE_ENV` runtime mode, pass the normalized input to the unchanged source parser, and rerun the real vinext/Cloudflare proof; do not complete this task until `.env.local` fixture activation renders fixture-backed storefront output in the actual development Worker.
- [x] 1.2 Audit the public catalog repository creation path and the legacy Product repository factory so relevant callers share the adapter without creating a second runtime-mode rule; preserve explicit environment injection for Node/offline tests and keep Cloudflare-only runtime access out of client components.
- [x] 1.3 Add focused offline coverage proving the adapter does not enumerate or log environment values, explicitly combines fixture selection with direct development/test mode, permits deterministic injected Node/test environments, defaults blank/absent selection to Supabase, never falls back after Supabase failure, and rejects fixture under direct production mode even if a runtime binding attempts to supply another `NODE_ENV` value.
- [x] 1.4 Establish the minimum local configuration/documentation boundary needed for explicit fixture activation, without committing `.env.local`, adding `NODE_ENV` to `.env.local` or Worker bindings, enabling `CLOUDFLARE_INCLUDE_PROCESS_ENV`, changing compatibility flags, selecting fixtures by default, requiring Supabase credentials, or changing the Supabase no-fallback behavior.
- [x] 1.5 Verify that the existing fixture notice is rendered on Homepage, Shop, Category, and Product Detail whenever the normalized Worker runtime selects the fixture catalog.

## 2. Deterministic Demo Fixtures

- [x] 2.1 Replace development-fixture `example.com` ProductAsset URLs with stable, contract-valid public marketing references that use the existing controlled fallback and introduce no private, customer, order, preview, delivery, binary-upload, or provider-specific semantics.
- [x] 2.2 Add the required `size` Option and `mini`, `standard`, and `deluxe` Option Values to the development-only `couple-figure` fixture using stable same-Product identities and positions.
- [x] 2.3 Replace `couple-figure`'s single default Variant with the three approved unique SKU combinations and Variant-authoritative USD prices, retaining two active/available choices, one active/unavailable choice, one eligible default, `made_to_order`, and valid deterministic physical weights.
- [x] 2.4 Validate the complete 22-Product fixture dataset through existing catalog graph and public-eligibility contracts, including unique global SKU codes, unique combinations, required-option completeness, same-Product ownership, eligible default behavior, unchanged fulfillment ownership, and at least one eligible `couple-figure` Variant.

## 3. Offline and Local Smoke Verification

- [x] 3.1 Add focused fixture tests for ProductAsset public-reference parsing, deterministic controlled fallback, absence of external placeholder URLs, and rejection of prohibited private-reference namespaces.
- [x] 3.2 Add focused catalog tests proving `couple-figure` resolves Mini and Standard to their exact SKUs and distinct authoritative prices, derives starting-price presentation, and treats Deluxe as unavailable without introducing inventory semantics.
- [x] 3.3 Add storefront interaction/rendering coverage for required Option selection, price/SKU updates, disabled or otherwise visibly unavailable Deluxe behavior, fulfillment type, shipping-required state, production mode, and 5–10 business-day lead time using the existing components.
- [x] 3.4 Implement a fully local smoke harness that starts the real development runtime with isolated fixture configuration, exercises `/`, `/shop`, `/category/3d-figures`, and `/product/couple-figure`, observes a local Supabase sentinel, and fails unless all routes show fixture-backed output with zero Supabase requests.
- [x] 3.5 Ensure the smoke harness refuses to overwrite an existing `.env.local`, uses no live provider values or APIs, does not simulate successful catalog data, allocates local resources safely, and cleans up temporary files, observation servers, and application child processes on success or failure.

## 4. Presenter Runbook

- [x] 4.1 Create `docs/local-demo.md` with prerequisites, the exact ignored `.env.local` fixture setting, verification and development startup commands, expected fixture notice, localhost URLs, and troubleshooting for accidental Supabase source selection.
- [x] 4.2 Document an 8–10 minute Homepage → Shop → 3D Figures Category → Custom Couple Figure → Mini/Standard price change → unavailable Deluxe → fulfillment/lead-time Demo sequence that uses only the existing storefront.
- [x] 4.3 Document intentional exclusions and unsafe Demo actions, including `/admin/products` saves and lifecycle operations, Supabase access, migrations, production mode, deployment, DNS/Cloudflare, fixture-to-production import, and any implication that availability is exact inventory.

## 5. Final Quality Gates

- [x] 5.1 Run the focused local-demo fixture, source-selection, ProductAsset, Variant, storefront, and zero-Supabase smoke checks and resolve only defects within this change's approved scope.
- [x] 5.2 Run the existing storefront regression tests and `npm run test:offline`, confirming no test requires live Supabase or another third-party API.
- [x] 5.3 Run `npm run typecheck` and `npm run lint` without weakening TypeScript strictness or lint coverage.
- [x] 5.4 Run `npm run build` and confirm fixture selection is not committed as a production/default value and remains rejected for production runtime use.
- [x] 5.5 Run `npm run test:rendered` and verify the fixture-backed Demo path does not introduce alternate Demo-only storefront components or fake Admin behavior.
- [x] 5.6 Run `openspec validate --all --strict` and `git diff --check`, confirm no migration or remote/production artifact was created, and confirm the active `build-configurable-product-catalog` and `configure-figmemento-brand-domain` artifacts and task state were not modified by this change.
