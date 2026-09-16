## Why

Project stakeholders need a public URL for an early visual, responsive, and navigation review of the current FigMemento storefront. The existing vinext/Vite/Cloudflare Worker application is server-capable and its checkout, order, payment, fulfillment, and customer-upload surfaces depend on server authority, so a GitHub Pages preview must be an isolated static presentation artifact rather than a static conversion of the main application.

## What Changes

- Add an isolated GitHub Pages frontend-preview capability with an explicit public preview notice.
- Reuse the existing brand, design tokens, CSS, catalog presentation, product imagery, typography, and safe client-capable presentation components where possible.
- Provide deterministic client-only demo state for catalog navigation, variant selection, customization appearance, browser-local image preview, cart, checkout, payment states, Order Success presentation, and fulfillment-preview states.
- Generate a repository-subpath-safe static artifact and plan a manual GitHub Pages Actions deployment workflow without requiring runtime secrets or server APIs.
- Add preview isolation, asset-path, no-secret, no-server-import, rendered, responsive, navigation, and static-artifact verification coverage.
- Document the Pages repository prerequisite and the exact limits of the frontend-only demo.

The preview must visibly communicate that it is a frontend demonstration only. It must not claim that an upload, checkout, order, payment, fulfillment action, tracking event, or other server-side authority was created.

### Explicit non-scope

- Do not static-export or otherwise rewrite the primary server-capable application runtime.
- Do not remove, weaken, or replace API routes, cookies, server-only modules, repositories, same-origin security, or local authority boundaries.
- Do not call Supabase, Local Order, Local Payment, Local Fulfillment, CustomerUpload, operator, payment-provider, storage, tracking, or production APIs from the Pages artifact.
- Do not create real orders, payments, receipts, capabilities, fulfillment actions, operator authorization, tracking numbers, or persisted browser demo state.
- Do not implement production Cart, Checkout, Order, Payment, Fulfillment, Tracking, Storage, Shipping, Tax, email, DNS, Cloudflare production deployment, or C1 backfill.
- Do not modify the active Fulfillment or Tracking changes, their task state, or any canonical upstream runtime specification.

## Capabilities

### New Capabilities

- `github-pages-frontend-preview`: An isolated, static, repository-subpath-safe frontend presentation artifact with deterministic client-only demo flows and a manual GitHub Pages deployment boundary.

### Modified Capabilities

- None. Existing Local Checkout, Local Order, Local Payment, Local Fulfillment, CustomerUpload, Shopping Cart, Catalog, visual-system, and brand-domain requirements remain unchanged.

## Impact

- Affected areas: a new preview-only entry/build boundary, reusable presentation-layer adapters/components, static demo fixtures/state, asset and navigation path handling, verification tests, deployment workflow documentation, and an optional manual GitHub Actions workflow created only during Apply.
- Existing server routes, repositories, runtime configuration, canonical specs, and production infrastructure remain unchanged.
- The current repository has no existing GitHub Actions workflow or static-export mechanism; the implementation must choose the smallest maintainable isolated approach supported by the installed vinext/Vite toolchain.
- GitHub repository Pages settings and repository visibility are human/deployment prerequisites and are not changed by this planning or implementation scope.
