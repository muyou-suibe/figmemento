## Context

The existing App Router storefront already has real presentation components for the homepage, shop/category browsing, public ProductAsset gallery, Variant selector, fulfillment details, customization fields, handoff summary, loading, error, and not-found states. Its CSS is spread between `app/globals.css` and `app/storefront/catalog-storefront.module.css`, with an earlier prototype palette (`--coral`, `--sage`, `--cream`, `--paper`) and many one-off values. See `proposal.md` for the motivation and `specs/visual-system-foundation/spec.md` for the observable contract.

## Goals / Non-Goals

**Goals:**

- Establish a single, inspectable CSS token authority while preserving existing selectors and real data paths.
- Provide typography, grid, spacing, shape, depth, z-index, motion, reduced-motion, focus, button, input, and product-media foundations.
- Record the current gap audit and explicitly separate visual direction from unsupported business/content claims.
- Verify the foundation with deterministic local tests and the repository's existing gates.

**Non-Goals:**

- Recompose the homepage, shop/category pages, PDP, information pages, loading pages, error pages, or not-found pages.
- Add Catalog, Variant/SKU, Customization, Cart, Order, Payment, Shipping, Provider, admin, or persistence behavior.
- Choose a font provider, storage provider, image provider, UI framework, animation library, migration, or deployment configuration.

## Decisions

1. **Keep CSS as the runtime authority.** The tokens will live in the existing global stylesheet so CSS Modules and existing global selectors can consume them without introducing Tailwind, MUI, Chakra, Bootstrap, Framer Motion, GSAP, or a second theme runtime.

2. **Use a compatibility bridge for the old names during V0/V1.** Existing components still reference `--ink`, `--muted`, `--cream`, `--paper`, `--line`, `--serif`, `--sans`, and the legacy accent variables. These aliases will resolve to the approved FigMemento values where safe; broad page-by-page replacement is deferred to V2 so this batch does not change layout or business composition unexpectedly. Coral/sage will not remain visual-system authority variables.

3. **Use local/system font stacks.** `Cormorant Garamond` and `Inter` are the requested first choices, followed by local editorial/system fallbacks, with display weights bounded to 300–500 and body weights bounded to 300–400. No `@import`, CDN, font binary, or build-time network dependency is introduced.

4. **Add only shared primitives in V0/V1.** Global focus, control sizing, link/button states, reduced motion, and token-backed utility classes are appropriate now. The existing product card receives the approved 4:5/12px/copper-border/4px-lift/1.03-scale/warm-overlay/300ms foundation. Homepage hero, PLP layout, PDP recomposition, content sections, and visual regression snapshots are V2 work.

5. **Test the contract statically.** A focused Node test will inspect the committed CSS and the gap-audit document for exact token values, breakpoints, motion policy, font dependency boundaries, and unsupported-content classification. It will not mount pages or call providers.

## Risks / Trade-offs

- **[Legacy selector drift]** Some old selectors contain hardcoded prototype colors → preserve those values only where they are illustrative media art or component-specific legacy styling, document them in the gap audit, and migrate them during V2 composition work rather than rewriting the layout in this batch.
- **[Font availability]** Cormorant Garamond and Inter may not be installed locally → retain robust local/system fallback stacks and do not make visual verification depend on exact font files.
- **[Global focus impact]** Shared focus styling can affect admin and customization controls → keep selectors semantic and presentation-only, then run existing rendered/offline regressions.
- **[Token migration ambiguity]** Replacing every old variable immediately could create unrelated visual or behavior regressions → use aliases and targeted primitives in V0/V1; classify full replacement as V2.

## Migration Plan

No database, runtime, provider, DNS, Cloudflare, or deployment migration is required. The implementation is a local CSS/test/documentation change. Rollback is a file-level revert of the new visual foundation and focused test; it does not affect business data or migration history.

## Open Questions

None for V0/V1. V2 may decide exact page composition and content-source mapping only after the approved business/content dependencies are available.
