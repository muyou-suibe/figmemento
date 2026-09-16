# Fusion Frontend Batch A Baseline

## Scope

This is the Task 1.1 evidence record for `integrate-figmemento-fusion-frontend`.
Batch A establishes a reusable presentation foundation only. It does not
recompose or restyle any application route.

## Existing presentation authority

- `app/globals.css` is the global token and accessibility baseline. Its
  existing `--color-*`, `--font-*`, spacing, radius, motion, grid, and
  compatibility aliases remain intact.
- `app/storefront/catalog-storefront.module.css` is the existing storefront
  presentation module for the catalog shell, discovery, PDP, cart, checkout,
  fulfillment, and tracking surfaces.
- `app/storefront/CatalogShell.tsx`, `CatalogBrowser.tsx`,
  `ProductDetailExperience.tsx`, `ProductAssetGallery.tsx`, and
  `VariantSelector.tsx` are existing route/presentation boundaries. Batch A
  does not alter their markup, data flow, or destinations.
- The new `app/storefront/fusion-foundation.module.css` and
  `app/storefront/FusionFoundation.tsx` are not imported by an existing route
  in this batch; they provide small, server-safe primitives for later batches.

## Existing canonical token baseline

The current global authority remains the existing visual-system foundation:

- Background/card/text: `#FAF8F5`, `#FFFCF7`, `#1E1A15`.
- Accent/highlight/border: `#A0714F`, `#C5A572`, `#EBE7E2`.
- Display/body stacks: Cormorant Garamond fallback stack and Inter system
  fallback stack.
- Responsive grid: 4/8/12 columns at the existing 640px/1024px changes.
- Existing focus-visible, 44px control baseline, reduced-motion rule, and
  current route aliases remain protected.

## Fusion reference audit

The audited reference is `docs/design-reference/figmemento-fusion-design-v2.html`.
Its exact warm palette, shadows, typography relationships, breakpoint
intent, and motion durations are captured in namespaced `--fusion-*` tokens in
`app/globals.css`. This is an extension of the existing global authority, not
a second provider or theme framework. The reference's Caveat font is loaded
in its HTML but has no active core selector and is intentionally not enabled.
No remote font import or binary asset was added.

## Protected implementation paths

The following domains are outside Batch A and are unchanged by this batch:

- `app/domain/**`, `app/application/**`, `app/infrastructure/**`,
  `app/config/**`, and `app/api/**`.
- Catalog source selection, Product/Variant/SKU, Customization,
  CustomerUpload, Cart, Checkout, Order, Payment, Fulfillment, Tracking,
  Auth, and operator-authority behavior.
- Existing customer/admin/operator route components and their CSS modules.
- Database, Supabase, migrations, storage, provider integrations, and
  deployment configuration.
- Active OpenSpec changes other than this change's Batch A evidence and task
  state.

## Worktree and change isolation

The repository had pre-existing worktree changes before Batch A. This audit
limits the new change to the Fusion foundation files, its offline assertions,
this baseline evidence, and the five Batch A task checkboxes. No existing
business implementation or other active change is an output of Batch A.

## Task 1.5 correction evidence

- `tests/figmemento-fusion-foundation.test.mjs` uses the repository's Vite
  middleware plus `react-dom/server` harness to render all eleven foundation
  primitives, including semantic text, wrappers, and decorative attributes.
- The responsive assertions verify the actual foundation relationship: four
  columns by default, three at or below 960px, two at or below 720px, one at
  or below 520px, with 16px narrow padding. These are CSS contract checks,
  not browser viewport claims.
- The reference `.f-tape` grammar was re-audited. `WashiTape` uses the
  reference padding, typography, rotation, shadow, and pseudo tape ends; it
  remains decorative and does not use `--fusion-tap` touch-control sizing.
- Real browser desktop and 375px acceptance were not run in this batch.
