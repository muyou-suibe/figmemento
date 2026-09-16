# FigMemento Visual Gap Audit (V0/V1)

Date: 2026-08-17
Scope: `implement-figmemento-visual-system` V0/V1 only

## Audit conclusion

The repository already has real storefront behavior for catalog discovery, category filtering, ProductAsset rendering with controlled fallback, Variant/SKU selection, fulfillment details, customization fields, customization summary/handoff boundary, fixture notices, and fail-closed catalog states. The immediate gap is presentation authority: styles are spread across global CSS and the catalog CSS module, with prototype coral/sage variables, one-off colors, inconsistent control radii/heights, and several page-specific responsive breakpoints.

This batch establishes tokens and shared foundations only. It does not recompose the pages or change any domain, persistence, route, or business behavior.

## Current implementation versus V0/V1 direction

| Surface | Current evidence | V0/V1 result | Later V2 work |
| --- | --- | --- | --- |
| Global theme | `app/globals.css` has `--ink`, `--cream`, `--paper`, `--sage`, `--coral`, and many hardcoded prototype colors. | Add approved FigMemento tokens and safe compatibility aliases; keep CSS as the authority. | Replace remaining page-specific legacy values during composition. |
| Typography | Existing `--serif`/`--sans` stacks use Georgia/Avenir-style defaults; heading scale is mostly page-specific clamps. | Add Cormorant Garamond and Inter local/system stacks plus approved scale tokens, without remote font loading. | Apply exact type roles page by page. |
| Layout | Catalog CSS uses 1240/1320px local maxima and 620/640/900px media queries; the approved system is 1280px with 1024/640 breakpoints. | Add grid, gutter, margin, and spacing tokens plus a reusable grid primitive. | Recompose each route to the approved grid. |
| Buttons and links | Primary links/buttons use dark ink, mixed heights, and mixed radii; focus rules are partly selector-specific. | Add copper primary foundation, 44px minimum shared control height, visible copper focus ring, disabled presentation. | Normalize all page-specific variants and copy. |
| Inputs and selectors | Search, option, customization, and admin controls have separate module rules; option/filter controls intentionally remain pills. | Add global focus/height foundation while preserving existing control semantics. | Apply the full component matrix to each page. |
| Product cards | `CatalogBrowser` uses real summaries and ProductAsset thumbnails; media is currently 4:3. | Style the existing card with a 4:5 media frame, 12px radius, copper hover border, restrained lift/shadow/image scale, and existing fallback. | Recompose PLP/home card placement and content hierarchy. |
| Product detail | `ProductDetailExperience` composes gallery, fulfillment, VariantSelector, customization form, summary, and handoff gate from real data. | Add media radius, focus, typography, and shared interaction primitives only. | Full PDP visual recomposition while preserving this composition. |
| Product media | `ProductAssetGallery` uses provider-neutral public references and a controlled fallback on invalid/unavailable media. | Preserve behavior; style the existing media frame and thumbnails only. | No new asset source or upload pipeline in this change. |
| Status/loading/errors | Catalog status, loading, and not-found surfaces exist, but use legacy global/module styles. | Token authority and reduced-motion policy cover their shared primitives. | Recompose copy/layout after content dependencies are approved. |
| Information pages | `app/info-page.module.css` is a separate compact legacy palette. | No route redesign; global tokens remain available for later migration. | Apply the visual system to FAQ, terms, privacy, shipping, and tracking pages. |
| Accessibility/motion | Reduced-motion media query already exists; focus styling is inconsistent and mostly coral-specific. | Centralize focus ring, motion tokens, and reduced-motion behavior. | Run route-level visual/a11y review in V2. |

## Real behavior protected by this change

- Production catalog source remains Supabase and continues to fail closed; no fixture fallback is introduced.
- Explicit development fixture behavior and fixture notice remain unchanged.
- Product, Category, Variant/SKU, ProductAsset, FulfillmentConfig, CustomizationField, Cart, Order, Payment, Shipping, and Provider semantics are not changed.
- Existing ProductAsset fallback remains the only response to unavailable public media.
- Existing SKU selection, authoritative price/availability resolution, fulfillment display, customization validation, preview boundary, and handoff summary remain unchanged.
- No new filter, sorting, pagination, pricing, surcharge, inventory, shipping, review, rating, payment, authentication, or admin behavior is added.

## Unsupported visual-reference content

The following visual-reference ideas are not backed by the approved product/domain sources and are therefore classified as `VISUAL / CONTENT DEPENDENCY — NOT IMPLEMENTED`:

- reviews, ratings, testimonials, customer-count claims, achievements, response-time guarantees, and social-proof avatars;
- featured/sale labels, wishlist, exact stock/inventory, free-shipping thresholds, or shipping promises;
- PayPal/payment-provider promotion, newsletter capture, Instagram/social feed, or provider/supplier claims;
- named people, named suppliers, named production partners, or invented maker/location stories;
- unsupported category counts, SKU counts, product counts, or product benefits;
- any production-preview, delivery, or quality guarantee not already present in approved runtime data.

Homepage sections that need such content remain unimplemented dependencies. The current homepage continues to show only its existing approved copy and live catalog data.

## Deferred V2 scope

V2 may recompose the shared shell, homepage, shop/category discovery, PDP, information pages, loading/error/not-found states, and responsive/a11y presentation after the required content sources are approved. V2 must preserve real Catalog, SKU, fulfillment, customization, preview-boundary, and handoff behavior and must not fill the dependency list with invented business claims.

## FINAL V2 review

Date: 2026-08-17

Scope: final local Visual V2 implementation for shared storefront shell,
homepage, Shop/Category, Product Detail, information pages, loading/error/not-
found states, responsive composition, accessibility foundations, rendered
regressions, and active public cascade review.

### Completed presentation work

- Shared `CatalogShell` now owns the skip link, warm FigMemento header,
  navigation, fixture notice styling, and restrained footer.
- Homepage, Shop/Category discovery, Product Detail, ProductAsset gallery,
  Variant selector, fulfillment facts, customization controls, summary, and
  handoff boundary use the approved semantic token authority.
- Information pages, Track Order, loading, catalog status, and not-found use
  the same local/system typography and warm-neutral surfaces.
- Mobile, tablet, and desktop layouts use the approved `640px` and `1024px`
  boundaries with a `1280px` content maximum. Interactive controls retain
  visible focus and minimum touch sizing; reduced motion disables non-essential
  transitions and skeleton animation.
- Product media remains provider-neutral, metadata-only/public, and uses the
  existing controlled fallback. No remote image or font dependency was added.

### Content and business firewall

The following remain `VISUAL / CONTENT DEPENDENCY — NOT IMPLEMENTED`: reviews,
ratings, testimonials, social proof, customer counts, inventory or sale claims,
free-shipping thresholds, payment promotions, newsletter capture, Instagram,
supplier/maker claims, production guarantees, and production preview.

Search, category filtering, real catalog data, ProductAsset fallback,
Variant/SKU resolution, authoritative price, fulfillment, customization
validation, upload ownership, summary, and handoff behavior remain unchanged.
No cart, checkout, payment, authentication, shipping-rule, persistence, or
provider behavior was added.

### Active public legacy-style review

- `--coral`, `--sage`, `--cream`, and `--paper` remain only as documented
  compatibility aliases or internal/admin compatibility values; the active
  public V2 CSS Module and information-page styles use `--color-*` authority.
- Legacy prototype gradients, 3px public radii, 900px public breakpoints, and
  public coral/sage selectors were removed from the active storefront modules.
- Old global admin/internal selectors remain intentionally available and are
  not public storefront composition authority.
- Approved shadow values are now `xs 0 1px 2px rgba(30,26,21,0.04)`,
  `sm 0 2px 8px rgba(30,26,21,0.06)`,
  `md 0 4px 16px rgba(30,26,21,0.08)`, and
  `lg 0 8px 24px rgba(30,26,21,0.10)`.

### Final verification evidence

- `tests/figmemento-visual-system.test.mjs` and
  `tests/figmemento-visual-v2.test.mjs` verify tokens, shadows, semantic
  authority, breakpoints, reduced motion, focus foundations, content firewall,
  and preserved catalog/customization wiring.
- `tests/rendered-html.test.mjs` verifies the representative V2 routes and
  safe unavailable/not-found states without live providers.
- No remote Supabase, payment, email, tracking, DNS, Cloudflare, or deployment
  action is required or performed by this change.

Final V2 review result: **PASS — local storefront composition and regression
verification complete; unsupported visual/content dependencies remain
explicitly deferred.**
