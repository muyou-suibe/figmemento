## Why

FigMemento's current application already has the real catalog, customization,
cart, checkout, order, payment, fulfillment, tracking, customer-upload, and
admin boundaries, but its presentation still reads as a collection of earlier
page-level treatments. The complete Fusion Design reference provides a
coherent warm editorial language; integrating that language now will make the
real product journey understandable and trustworthy without replacing any
business authority or inventing reference-only commerce claims.

## What Changes

- Establish a reusable FigMemento Fusion visual layer for the existing App
  Router surfaces: tokens, typography, spacing, paper/card/layer treatments,
  controls, feedback, media framing, navigation, and responsive behavior.
- Recompose the current home, shop, category, product/customization, cart,
  local checkout, order-success, fulfillment, tracking, and information
  surfaces within the existing route and component boundaries.
- Bring the current admin and operator surfaces into the same visual grammar
  where this can be done without changing their business workflows.
- Preserve real catalog queries, server-derived prices, customization and
  upload ownership, cart identity, checkout evaluation, local order/payment/
  fulfillment/tracking state, and existing authorization boundaries.
- Add deterministic visual and rendered/browser acceptance coverage for
  desktop, 375px mobile, keyboard focus, reduced motion, media fallbacks, and
  critical interaction states.
- Treat the supplied Fusion HTML as a visual and interaction reference only;
  static prices, ratings, shipping promises, preview claims, country counts,
  discount claims, newsletter claims, and payment marks in that file shall not
  become production data or business authority.

## Capabilities

### New Capabilities

- `figmemento-fusion-frontend`: Integrates the approved Fusion visual language
  into the real FigMemento storefront, customer-flow, operator, and admin
  presentation surfaces while preserving existing application authority.

### Modified Capabilities

- None. Existing canonical visual-system, catalog, customization, cart,
  checkout, order, payment, fulfillment, tracking, upload, and auth
  requirements remain authoritative and are not rewritten by this change.

## Impact

- Affects the shared storefront shell, global and catalog styles, existing
  route-level presentation components, and visual test/rendered-browser
  coverage. Exact files are determined during implementation from the current
  component boundaries.
- Does not add a runtime, database, storage provider, payment provider,
  external content source, or new product data model.
- Uses the current Next.js-compatible App Router, React, TypeScript, vinext,
  and Cloudflare-compatible build without upgrading dependencies.
- Depends on the archived `visual-system-foundation` contract and the current
  canonical customer/business-flow specs. It must remain compatible with the
  two active deferred changes without editing them.
- No database migration, remote Supabase operation, deployment, DNS change,
  or production configuration change is part of this planning or its proposed
  implementation scope.
