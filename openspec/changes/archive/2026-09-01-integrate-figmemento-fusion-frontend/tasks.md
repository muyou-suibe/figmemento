## 1. Visual foundation and baseline

- [x] 1.1 Record the current real route/component presentation baseline and identify the protected business, auth, upload, payment, order, fulfillment, tracking, and active-change paths that this visual change must not alter.
- [x] 1.2 Add the Fusion color, surface, border, spacing, radius, focus, shadow, and motion tokens through the existing global/catalog style authority, retaining compatibility aliases required by current pages.
- [x] 1.3 Establish the reference typography hierarchy using the audited `--serif`, `--hand`, `--ital`, and `--body` stacks with resilient Playfair/Lato/Noto fallbacks, explicitly keeping Caveat inactive as a core token unless a directly audited local selector requires it, with long-copy wrapping and no server-only configuration in client styles.
- [x] 1.4 Implement or consolidate small reusable presentation primitives for editorial headings, paper cards, media frames, rules, annotations, status blocks, action rows, and responsive grids.
- [x] 1.5 Add focused foundation assertions, a rendered desktop/mobile smoke check, and a path/scope audit proving only the approved visual foundation surface changed.

## 2. Shared shell and navigation

- [x] 2.1 Integrate the Fusion brand mark treatment, header hierarchy, top note, skip link, and footer surfaces into the existing `CatalogShell` without replacing its real route or notice logic.
- [x] 2.2 Restyle navigation, search, language affordance boundaries, cart quantity, account access, active links, and footer/legal links using current application destinations and state.
- [x] 2.3 Implement compact navigation, menu focus behavior, search feedback, keyboard semantics, and touch-safe target sizing without adding reference-only Journal/About/Contact navigation.
- [x] 2.4 Run focused shell tests and rendered/browser acceptance for desktop and 375px, including fixture notice, cart indicator, keyboard focus, and unavailable-route behavior.
- [x] 2.5 Audit the shell diff for route, cart, account, source-selection, authorization, and reference-claim drift; record that no business workflow was added.

## 3. Home, shop, category, and discovery

- [x] 3.1 Recompose the home presentation around the Fusion hero, narrative sections, collection entry points, trust/story content, and real catalog loading/unavailable states.
- [x] 3.2 Integrate the Fusion collection/card grammar into `/shop` and `/category/[slug]` while preserving single-level category resolution, real search, filters, counts, and empty states.
- [x] 3.3 Apply editorial product-card, paper/polaroid, media-fallback, pricing-display, and CTA treatments using real Product, Variant, and ProductAsset data only.
- [x] 3.4 Run focused storefront tests and rendered/browser acceptance for `/`, `/shop`, and representative category routes at desktop and 375px.
- [x] 3.5 Audit discovery surfaces for hardcoded reference prices, ratings, shipping promises, static product authority, nested-category behavior, and silent fixture fallback.

## 4. Product detail and customization presentation

- [x] 4.1 Integrate the Fusion PDP composition, breadcrumb, editorial title/description, spec-sheet treatment, and purchase action framing into the existing product route.
- [x] 4.2 Restyle VariantSelector and fulfillment/lead-time information while keeping Variant/SKU price, currency, availability, option combination, and supply-method authority unchanged.
- [x] 4.3 Restyle customization field, text feedback, image-slot, crop, upload, and handoff presentation without mixing SKU options with CustomizationField semantics.
- [x] 4.4 Integrate ProductAsset gallery framing, safe public-reference fallbacks, captions, and accessible labels without adding binary upload, private-media, preview, or delivery-file semantics.
- [x] 4.5 Run focused PDP/customization tests and rendered/browser acceptance for valid, unavailable, validation-error, upload, and fixture/unavailable states; complete a scope audit.

## 5. Cart and Local Checkout presentation

- [x] 5.1 Apply the Fusion line-item, quantity-control, remove/clear, empty-cart, summary, and return-to-shop presentation to the real `CartExperience`.
- [x] 5.2 Restyle `LocalCheckoutExperience` address, shipping-fixture, coupon, tax, local arithmetic summary, upload receipt, and action states without adding Order or Payment behavior.
- [x] 5.3 Make loading, validation, unavailable, coupon-invalid, tax-not-activated, and server-error states visually explicit while retaining server-derived amounts and safe public projections.
- [x] 5.4 Run focused cart/checkout tests and rendered/browser acceptance for quantity/removal/empty flows, valid/invalid input, physical shipping fixture, upload receipt, and 375px layout.
- [x] 5.5 Audit cart/checkout changes for browser-authority, price, discount, shipping, tax, payment, order, and persisted-state drift; verify no reference claim is presented as payable authority.

## 6. Order, fulfillment, and tracking presentation

- [x] 6.1 Apply the shared Fusion visual grammar to order-success and local-order views, including the existing Local Payment status/action presentation in `app/storefront/LocalOrderSuccessExperience.tsx`, while preserving immutable order facts, customer capability boundaries, payment semantics, and safe reference handling.
- [x] 6.2 Restyle customer and operator fulfillment states, preview/revision labels, action rows, and terminal quality-check presentation without adding production-provider or preview behavior.
- [x] 6.3 Restyle customer and operator tracking timelines, shipment cards, status controls, and delivered terminal state while preserving separate authority and lifecycle transitions.
- [x] 6.4 Run focused order/fulfillment/tracking tests and rendered/browser acceptance for customer/operator authorized and rejected states, replay/terminal states, and 375px readability.
- [x] 6.5 Audit this batch for order mutation, payment mutation, fulfillment/tracking lifecycle drift, existence leakage, storage-provider decisions, and unauthorized controls.

## 7. Admin and operator visual consistency

- [x] 7.1 Apply shared Fusion tokens, cards, forms, tables, tabs, and status treatments to the admin catalog/products and admin orders presentation without changing existing operations.
- [x] 7.2 Apply the same presentation language to fulfillment/tracking operator pages while keeping operator authority separate from customer same-browser capability.
- [x] 7.3 Preserve safe unauthorized responses, server-only privileged construction, validation feedback, lifecycle controls, and terminal-state affordances during visual integration.
- [x] 7.4 Run focused admin/operator tests and rendered/browser acceptance for authorized and rejected flows at desktop and 375px.
- [x] 7.5 Audit admin/operator changes for accidental supplier, inventory, procurement, payment, fulfillment, tracking, or authorization scope expansion.

## 8. Responsive, motion, and accessibility hardening

- [x] 8.1 Implement and verify the reference-intended responsive transitions around 960px, 720px, and 520px, with explicit 375px customer and operator acceptance coverage.
- [x] 8.2 Add bounded page, card, control, reveal, marquee, disclosure, and feedback motion only where it does not gate content or actions; preserve the existing CSS-first architecture.
- [x] 8.3 Implement reduced-motion, touch-pointer, focus-visible, semantic heading/landmark, label, live-region, image-alt, and disclosure behavior across all integrated surfaces.
- [x] 8.4 Run responsive/browser regression checks for desktop, 375px, keyboard-only, touch/coarse pointer, reduced-motion, long-copy, image-fallback, and horizontal-overflow cases.
- [x] 8.5 Complete an accessibility and visual-cascade audit, including contrast/focus review, hover-independence review, motion review, and protected-path scope review.

## 9. Final visual integration gates

- [x] 9.1 Perform a complete reference-claim and authority audit proving static demo facts never become Product, SKU, customization, cart, checkout, order, payment, fulfillment, tracking, or SEO authority.
- [x] 9.2 Run cross-flow customer, admin, and operator visual regression from discovery through tracking using real routes and controlled offline fixtures where permitted.
- [x] 9.3 Verify the repository's focused visual tests, offline tests, rendered tests, and existing page-preview checks use deterministic assertions and do not require live third-party services.
- [x] 9.4 Run a final changed-path audit confirming no dependency upgrade, database migration, storage-provider choice, remote Supabase operation, deployment, DNS change, or modification to archived/active OpenSpec changes occurred.
- [x] 9.5 Run `npm run typecheck`, `npm run lint`, `npm run test:offline`, `npm run build`, `npm run test:rendered`, `openspec validate --all --strict`, and `git diff --check`, then record browser acceptance evidence.
