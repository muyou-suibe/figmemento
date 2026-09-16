## 1. Audit and isolation boundary

- [x] 1.1 Record the installed vinext/Vite/React/Cloudflare toolchain, current Worker build entry, absence or presence of static-export support, existing GitHub workflows, and repository subpath constraints without changing the main runtime.
- [x] 1.2 Define the preview import allowlist and forbidden server/API/provider modules; add an offline source-level isolation test that fails if the preview crosses the server authority boundary.
- [x] 1.3 Define the explicit frontend-preview fixture schema and static demo-state vocabulary, including the global notice, `Paid — Demo`, `UI PREVIEW ONLY`, and Tracking-not-implemented copy.
- [x] 1.4 Confirm that preview work does not edit `build-local-fulfillment-runtime`, `build-local-tracking-runtime`, canonical runtime specs, or production source-selection semantics.

## 2. Static preview shell and shared presentation layer

- [x] 2.1 Add the isolated `preview/github-pages/` Vite/React entry and build script that emits only the Pages preview artifact without changing `vite.config.ts`, `next.config.ts`, or the Worker build.
- [x] 2.2 Implement the base-aware hash router and navigation shell for `/`, Shop, Category, Product, Cart, Checkout, Order Success, Payment, Fulfillment, and Operator preview surfaces.
- [x] 2.3 Reuse the approved FigMemento global tokens, typography, spacing, responsive primitives, and safe public media fallback without creating a second global visual authority.
- [x] 2.4 Add explicit preview-only catalog, customization, payment, and fulfillment fixtures under the preview boundary; ensure the main application never reads them as a runtime fallback.
- [x] 2.5 Add the global `FRONTEND PREVIEW` notice and accessible navigation/header/footer presentation shared by all preview routes.

## 3. Core storefront preview surfaces

- [x] 3.1 Implement static Homepage, Shop/catalog, and Category surfaces using the preview fixture adapter and current visual language.
- [x] 3.2 Implement Product Detail presentation with product imagery, local/fallback media, description, fulfillment display, and safe demo price context.
- [x] 3.3 Implement client-only Variant/SKU option selection with deterministic display of selected option values, SKU, price, and availability.
- [x] 3.4 Implement customization appearance for text fields and browser-local image selection/preview, including explicit “file is not uploaded” behavior and no CustomerUpload import.
- [x] 3.5 Verify storefront navigation, media fallback, keyboard/focus behavior, reduced motion, and desktop/375px layout for the core surfaces.

## 4. Client-only commerce and workflow demo

- [x] 4.1 Implement in-memory Cart demo state for add, quantity, remove, clear, subtotal display, and return-to-shop navigation without Cart API calls or persistence.
- [x] 4.2 Implement Checkout demo form, local shipping fixture selector, coupon visualization, and clearly labeled non-authoritative arithmetic summary without AcceptedCheckout or tax/payment authority.
- [x] 4.3 Implement Payment demo success, failed, and cancelled states plus Order Success demo presentation with placeholder reference and explicit non-payment language.
- [x] 4.4 Implement the visual Fulfillment sequence through preview versions, revision, approval, production, and quality check using deterministic client-only state.
- [x] 4.5 Implement the `UI PREVIEW ONLY` Operator visual surface and omit or label Tracking as not implemented; do not add authentication, operator secrets, tracking numbers, or provider semantics.
- [x] 4.6 Add regression checks proving all demo transitions remain client-only, do not call application APIs, and do not claim Order, Payment, upload receipt, capability, or Fulfillment aggregate persistence.

## 5. GitHub Pages artifact and workflow

- [x] 5.1 Make the preview build accept a repository base path, emit correctly prefixed assets and hash navigation, and fail closed when a required static asset or forbidden import is detected.
- [x] 5.2 Add a local static HTTP-server smoke harness that serves the generated artifact below a repository-like subpath and checks Homepage, Shop, Category, Product, Cart, Checkout, Order Success, Payment, and Fulfillment routes.
- [x] 5.3 Add a manual `workflow_dispatch` GitHub Pages workflow using lockfile installation, preview-only build output, least-privilege Pages permissions, and no application/provider secrets.
- [x] 5.4 Document the Pages Settings → Build and deployment → GitHub Actions prerequisite, default URL expectations, repository visibility check, local preview commands, limitations, and rollback/disable steps.

## 6. Final verification and acceptance

- [x] 6.1 Add source/artifact scans for secrets, private upload locators, provider URLs, API calls, server imports, and production-authority wording.
- [x] 6.2 Add asset-path, subpath-navigation, deep-refresh, and missing-media fallback tests against the generated static artifact.
- [x] 6.3 Add rendered acceptance at desktop and 375px widths for Homepage, Shop, Category, Product, customization, Cart, Checkout, Order Success, Payment, and Fulfillment preview.
- [x] 6.4 Add browser acceptance for variant selection, text entry, local image preview, Cart actions, Checkout demo, Payment states, Order Success, and Fulfillment visual transitions with network/provider access disabled.
- [x] 6.5 Run the repository-required offline/typecheck/lint/build/rendered/OpenSpec/diff gates and review the final change diff to confirm only preview scope is included.
