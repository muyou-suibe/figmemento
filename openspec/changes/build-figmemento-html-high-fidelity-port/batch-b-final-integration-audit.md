# Batch B Final Integration Audit — Shop and Category

## Scope and authority

This audit covers only Batch B tasks 6.1–6.3 of
`build-figmemento-html-high-fidelity-port`. Batch A remains the approved
shared-shell and Home baseline. Batch C and all later batches are not started.

The checked-in reference at
`docs/design-reference/figmemento-fusion-design-v2.html` is used only for
visual structure, editorial hierarchy, paper/rule treatment, card composition,
spacing, decoration, interaction, motion, and responsive intent. The real
application remains authoritative for categories, products, filtering, search,
prices, availability, public assets, routes, and SKU/business semantics.

## Implementation evidence

### Shop

- The real `/shop` route now presents the reference-derived editorial heading:
  eyebrow, `THE SHOP`, supported introductory copy, a double-rule boundary,
  and source/catalog-derived summary values.
- The real catalog listing is rendered before the collection guide, matching the
  reference's discovery rhythm while preserving the existing `CatalogBrowser`
  search and filter behavior.
- The collection guide remains a separate editorial discovery surface from the
  shared shell category pills. Each guide entry uses the real category slug and
  leads to the real `/category/[slug]` route.
- Filter and search results continue to use `filterCatalogProducts`; listing
  prices continue to use the existing Variant-derived `listingPrice` formatter.
  No reference sample price, review, bestseller, shipping, or sales claim was
  introduced.

### Category

- The real `/category/[slug]` route presents a reference-derived collection
  hero with editorial heading, supported category description, published-item
  fact, single-level collection fact, browse CTA, and two catalog-backed
  polaroids with the existing controlled public-asset fallback.
- The category shell exposes the complete public single-level category
  navigation, while the listing is still constrained by the exact category ID
  through `fixedCategoryId` and the server-side category loader.
- Category cards remain real product links. Products from another category are
  not included in the category listing.

### Media, accessibility, and motion boundaries

- ProductAsset rendering remains metadata/reference-only and accepts only the
  existing renderable public URL contract. Invalid, failed, or unavailable
  marketing media renders `Marketing preview unavailable` with an accessible
  label; no private, customer, preview, or delivery asset path is introduced.
- Existing card/polaroid paper surfaces, pins, rotations, focus-within states,
  hover/focus feedback, responsive breakpoints, coarse-pointer fallback rules,
  and reduced-motion rules are preserved in the scoped catalog stylesheet.
- Category and Shop controls remain semantic links, buttons, labels, and a live
  result summary. The Batch B keyboard smoke reached the skip-link/shell focus
  path and observed a visible focus outline; filter, search, reset, and card
  actions remain directly targetable without hover-only meaning.

## Reference comparison evidence

The checked-in reference was served through a temporary local static server and
inspected alongside the real vinext development Worker. The comparison covered
the reference Shop `f-shophead`, `f-shopbar`, `f-pgrid`, and `f-cats` grammar,
and the reference Category `f-cathero` and product-listing grammar. Reference
sample products, prices, promotions, and claims were not copied into the real
catalog.

| Surface | Result | Evidence / boundary |
| --- | --- | --- |
| Shop editorial heading | PASS | Real `THE SHOP` heading, eyebrow, intro, supported catalog summary, and double rule. |
| Shop listing rhythm | PASS | Real listing precedes the separate collection guide; cards retain paper, pin, rotation, fallback, and price authority. |
| Shop controls | PASS | Real search, category buttons, live result summary, empty state, and reset behavior. |
| Category hero | PASS | Real category name/description/count, collection fact, CTA, polaroids, and fixture/source notice. |
| Category isolation | PASS | Listing is filtered by the exact category ID; no foreign product card observed. |
| Asset fallback | PASS | Public marketing URL validation and controlled unavailable fallback remain active. |
| Unsupported reference facts | PASS | No reference-only price, rating, review, bestseller, shipping, or promotion authority introduced. |

## Real browser evidence

Runtime: local vinext development Worker at `http://localhost:3001/`.

### Shop interactions

- Search query `couple`: result summary became `2 keepsakes in view` and the
  two real matching cards were `Custom Couple Figure` and `Digital Wallpaper
  Illustration`.
- Category filter `3D Figures`: result summary became `6 keepsakes in view`
  and the selected button reported `aria-pressed="true"`.
- Search query `no-such-keepsake`: one real empty-state region and one reset
  action were rendered. Reset returned the full `22 keepsakes in view` result.
- The real `3D Figures` category link opened
  `/category/3d-figures`; browser back returned to `/shop` and forward returned
  to `/category/3d-figures`.

### Responsive matrix

The real Shop and Category routes were inspected at 1280, 960, 720, 520, and
375 CSS pixels in the connected Chrome viewport. At every checked width,
`document.documentElement.scrollWidth` matched `window.innerWidth`; no
horizontal overflow was observed.

| Viewport | Shop | Category | Result |
| ---: | ---: | ---: | --- |
| 1280 | 1280 / 1280 | 1280 / 1280 | PASS |
| 960 | 960 / 960 | 960 / 960 | PASS |
| 720 | 720 / 720 | 720 / 720 | PASS |
| 520 | 520 / 520 | 520 / 520 | PASS |
| 375 | 375 / 375 | 375 / 375 | PASS |

### Media-query evidence classification

The connected browser automation exposed viewport control but not runtime
media emulation. Therefore the following are not claimed as automated passes:

- `prefers-reduced-motion: reduce`: `HUMAN_REQUIRED`.
- `pointer: coarse` and `hover: none`: `HUMAN_REQUIRED`.

The stylesheet contains the corresponding no-motion and no-hover-only rules,
and deterministic tests assert their presence, but manual Chrome DevTools
acceptance is still required for the live media states. No browser result was
fabricated.

## Business regression

- Public catalog source and fixture notice behavior are unchanged.
- Product, Variant/SKU, price, currency, availability, category ownership,
  route, and public asset authority remain in the existing repositories and
  domain/application boundaries.
- Category filtering is exact-category rather than a client-side display-only
  approximation.
- No Product, SKU, customization, cart, checkout, order, payment, fulfillment,
  tracking, authentication, storage, migration, or deployment behavior was
  added by Batch B.

## Verification record

The following commands were run for this Batch B closeout:

- focused Batch B, catalog storefront, discovery, and Batch A regression tests
- `npm run test:offline`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm run test:rendered`
- `npm run verify`
- `openspec validate --all --strict`
- `git diff --check`

Results:

- Focused Batch B/catalog/discovery/Batch A regression tests: 26/26 PASS.
- `npm run test:offline`: 852/852 PASS.
- `npm run typecheck`: PASS.
- `npm run lint`: PASS — 0 errors and 1 pre-existing `<img>` warning.
- `npm run build`: PASS.
- `npm run test:rendered`: 9/9 PASS.
- `npm run verify`: PASS.
- `openspec validate --all --strict`: 18/18 PASS.
- `git diff --check`: PASS; the new untracked audit was also checked with a
  non-index whitespace check.

## Batch B disposition

- Task 6.1: PASS — reference editorial listing and
  collection grammar are ported onto real Shop/Category surfaces without
  changing catalog authority.
- Task 6.2: PASS — responsive, fallback,
  search/filter, card interaction, and CSS safety rules are aligned; live
  reduced-motion/coarse-pointer evidence remains separately classified above.
- Task 6.3: PASS — combined automated and human browser acceptance. Desktop,
  375px, keyboard, business-regression, reduced-motion, and coarse-pointer
  evidence are all recorded. The two media-state results below are explicitly
  classified as human acceptance rather than automated media emulation.

## Human Browser Acceptance and Final Batch B Closeout

### Reduced Motion

- Result: PASS.
- Evidence type: `HUMAN_BROWSER_ACCEPTANCE` from real local Chrome DevTools;
  this is not Codex media emulation.
- `/shop`: content, search, filters, reset, product links, and no-overflow
  behavior all passed.
- `/category/3d-figures`: content, category pills, CTA, polaroids, product
  links, and no-overflow behavior all passed.
- Essential content remained visible and usable while nonessential motion was
  reduced/disabled.

### Coarse Pointer

- Result: PASS.
- Evidence type: `HUMAN_BROWSER_ACCEPTANCE` from real local Chrome DevTools;
  this is not Codex media emulation.
- Observed media state: `pointer: coarse = true`; `hover: none = true`.
- `/shop`: search, filters, reset, product cards/links, collection guide,
  no-hover-only behavior, and no-overflow behavior all passed.
- `/category/3d-figures`: category pills, CTA, polaroid/product links,
  back/forward behavior, no-hover-only behavior, and no-overflow behavior all
  passed.

### Final Task 6.3 Disposition

| Acceptance dimension | Result | Evidence |
| --- | --- | --- |
| Desktop | PASS | Real local browser route inspection and reference comparison. |
| 375px | PASS | Real local Chrome viewport inspection with no horizontal overflow. |
| Keyboard | PASS | Semantic control and visible-focus browser smoke. |
| Reduced motion | PASS | `HUMAN_BROWSER_ACCEPTANCE`. |
| Coarse pointer | PASS | `HUMAN_BROWSER_ACCEPTANCE`, `pointer: coarse`, `hover: none`. |
| Business regression | PASS | 852/852 offline regression plus focused catalog checks. |

Task 6.3 is complete as `PASS — COMBINED AUTOMATED + HUMAN BROWSER
ACCEPTANCE`. The earlier tooling limitation remains preserved as historical
context; it was closed by the manual human Chrome acceptance above.

## Final Batch B status

- Batch B tasks 6.1–6.3: 3/3 complete.
- Overall change progress: 29/45.
- P2 debt: historical CSS comments/naming and legacy-rule override cleanup are
  deferred and non-blocking; no cleanup was performed in this closeout.
- Batch C tasks 7.1–7.3: not started and remain ready for separate human
  review/unlock.

Batch C and all later batches remain not started.
