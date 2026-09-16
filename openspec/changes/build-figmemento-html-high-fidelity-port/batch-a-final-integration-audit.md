# FigMemento HTML High-Fidelity Port — Batch A Audit

Date: 2026-09-01

## Scope and authority

This record covers only Batch A (Global Shell + Home) of
`build-figmemento-html-high-fidelity-port`. The checked-in reference is
`docs/design-reference/figmemento-fusion-design-v2.html`, identified as
`FIGMEMENTO FUSION DESIGN v1.1`. It is used only for presentation,
interaction, motion, and responsive comparison. Product, Variant/SKU,
Customization, CustomerUpload, Cart, Checkout, Order, Payment, Fulfillment,
Tracking, authentication, and deployment authorities remain in their existing
application boundaries.

## Reference and pre-port audit

- The visual parity inventory contains 21 reference rows with an acceptance
  method for shell, Home, typography, materials, responsive behavior, and
  unsupported reference-only content.
- The interaction/motion inventory contains 29 rows covering triggers, state,
  transforms, timing, easing, loops, pauses, mobile behavior, and reduced
  motion.
- The pre-port route audit confirmed that Home and the shared shell already
  read the real catalog source, use real product/category links, keep live
  cart/account utility state, and fail closed when the catalog is unavailable.
- No reference-only prices, ratings, testimonials, shipping claims, payment
  claims, destinations, subscription result, or other business authority was
  copied into the application.

## Implemented Batch A evidence

### Shared shell and Home

- The real Home route uses the existing catalog repository and
  `loadPublicShopPage`; product names, prices, availability, public assets, and
  links remain catalog-backed.
- The shell includes a semantic fixture notice only when the fixture source is
  explicitly selected. The unavailable state does not substitute products.
- The repeated honey marquee, inline crest, sticky paper navigation, search,
  category pills, editorial hero, polaroid wall, story/trust content,
  preview-only studio/newsletter presentation, and footer are implemented in
  the existing storefront boundary.
- The preview-only studio/newsletter presentation does not submit, create a
  record, or report subscription success. Existing FAQ, shipping/returns,
  privacy, and terms links remain the only retained support/legal routes.

### Motion and accessibility contract

- Runtime desktop inspection observed the 26s linear marquee, 450ms page
  entrance, 7s/8s/9s polaroid float loops, 4s sticker motion, and the search
  transition from 216px to 280px after focus.
- Pointer movement over the marquee changed its computed animation state from
  `running` to `paused`.
- The reveal implementation uses threshold `0.12`, root margin
  `0px 0px -30px 0px`, once-only observation, and the documented stagger
  delays. It falls back to visible content when observation is unavailable.
- The shell exposes a skip link, semantic search, labelled controls, focus
  behavior, and a mobile disclosure menu. Opening the mobile menu moves focus
  to its first Home link.
- Reduced-motion and coarse-pointer CSS behavior is implemented and covered by
  deterministic tests. The current in-app browser exposes viewport sizing but
  not media-query emulation; therefore this audit does not claim runtime
  `prefers-reduced-motion: reduce` or `pointer: coarse` acceptance.

## Browser route evidence

Runtime: local vinext development Worker at `http://localhost:3001/`.

### Desktop

- Home rendered the real fixture catalog, fixture notice, product links,
  category links, fallback marketing-media states, story/trust content,
  preview-only subscription copy, and footer.
- Evaluated viewport was 1280px wide with document/client/body width all
  1280px; no document-level horizontal overflow was observed.
- Real search focus expanded to 280px and the marquee paused while the pointer
  was over its note region.

### 375px

The viewport override was 375px wide. The following real routes loaded with a
375px document/client width and no document-level horizontal overflow:

- `/`
- `/shop`
- `/category/3d-figures`
- `/product/couple-figure`
- `/cart`

The fixture notice was present on catalog-backed storefront routes. The
mobile menu opened with `aria-expanded="true"` and focused its Home link. The
searchbox remained visible, accepted `couple`, and its real submit button
navigated to `/shop?q=couple`, where `Custom Couple Figure` was present.

### Media emulation limitation

The current browser test surface does not expose a supported way to emulate
`prefers-reduced-motion: reduce`, `pointer: coarse`, or `hover: none`. Their
CSS contracts are verified offline, while the real browser's default values
were `false` for those three media queries. Manual DevTools media acceptance
is still required before the corresponding tasks can be closed.

## Verification evidence

- Focused Batch A plus existing Fusion regressions: 27/27 passed.
- Full offline regression: 851/851 passed.
- Rendered regression: 9/9 passed.
- TypeScript typecheck: passed.
- Lint: passed with 0 errors and 1 pre-existing `no-img-element` warning in
  `app/storefront/ProductCustomizationImageField.tsx`.
- Production build: passed.
- `git diff --check`: passed for the implementation changes inspected so far.

## Final Batch A correction pass

The final implementation pass reconciled the remaining concrete reference
differences without changing catalog, cart, upload, route, or business
authority semantics:

- Marquee: honey-yellow background, warm-brown text/border treatment, 26s
  linear track, and hover pause now match the audited reference material.
- Desktop navigation: the shared header now has one horizontal desktop row
  containing the real crest/brand, real navigation, search, and live utility
  actions. Compact layouts use the existing disclosure menu.
- Category pills: real catalog categories are rendered immediately below the
  shared header through `CatalogShellCategoryPills`; the Home collection guide
  retains its real category cards without duplicating the pill navigation.
- Newsletter: the reference input/button composition is present as a
  preview-only form. Its controls are disabled, no action submits, and the
  surrounding copy explicitly states that no subscription is created.
- Footer: the footer uses the warm paper surface, a 3px double editorial rule,
  a neutral ornament, and only the existing FAQ, Shipping & returns, Privacy,
  and Terms destinations.
- Cart feedback: the cart utility receives one decorative 700ms wiggle on
  mount; no cart state or API call is changed, and reduced motion disables it.
- Search hover: the reference `rotate(-8deg) scale(1.1)` treatment is applied.

### Evidence classification

#### IMPLEMENTED

The source implementation and focused deterministic tests cover the material,
composition, preview-only form, cart animation, exact search transform,
responsive layout, reduced-motion CSS, and real catalog-link boundaries.

#### BROWSER VERIFIED

The local vinext development Worker was inspected at desktop and 375px for
`/`, `/shop`, `/category/3d-figures`, `/product/couple-figure`, and `/cart`.
All routes rendered without a Runtime Error or document-level horizontal
overflow. The desktop check observed the honey marquee, warm-paper footer,
shell category navigation, disabled newsletter controls, marquee hover pause,
and search expansion to 280px. The mobile check observed the disclosure menu,
search, category pills, and no overflow at 375px.

#### REFERENCE VISUALLY VERIFIED

The checked-in reference source and its exact visual/motion values were
re-read. A new reference screenshot could not be captured in this browser run:
the browser URL policy rejected navigation to the local `file://` HTML asset.
The prior reference-source audit remains valid, but this run does not claim a
new reference screenshot comparison.

#### MEDIA VERIFIED

Not completed in the available browser surface. `prefers-reduced-motion`,
`pointer: coarse`, and `hover: none` could not be emulated here. Offline CSS
and deterministic tests cover the fail-safe rules; manual Chrome DevTools
acceptance remains required for Tasks 4.3, 5.4, and 5.5.

### Batch A difference register

- P1 implementation differences: none identified after the final correction
  pass. The shared shell, Home composition, real catalog links, public media
  fallback, newsletter boundary, cart feedback, and search interaction are
  aligned with the approved reference contract or the existing product
  authority.
- P2 verification differences: the pre-port screenshot baseline cannot be
  reconstructed from the current Git history; a new reference screenshot was
  blocked by the browser's local-file URL policy; and real media-query
  emulation is unavailable in the current browser surface. These are evidence
  gaps, not reasons to weaken the implementation or invent browser results.
- Intentional reference differences: reference-only subscription incentives,
  testimonials, ratings, unsupported destinations, shipping promises, and
  other business claims remain omitted or explicitly preview-labelled.

## Batch A task closeout boundary

Tasks 1.1–1.4, 2.1–4.2, 4.4, and 5.1–5.3 have implementation and available
verification evidence. Task 1.5 remains open because a pre-port screenshot
baseline was not recoverable from the current Git history. Task 4.3 and Tasks
5.4–5.6 remain open pending complete real reduced-motion and coarse-pointer
browser acceptance; 5.6 also remains the final Batch A gate. No Batch B or
later task is claimed.

## Batch A evidence closeout

### Reference and real Home captures

The checked-in reference was served through a temporary local static server at
`http://127.0.0.1:4173/figmemento-fusion-design-v2.html`, and a desktop Home
capture was obtained from that served page. The real application was inspected
through the local vinext development Worker at `http://localhost:3001/`; a
desktop Home capture and a 375px Home capture were obtained from the real route.
The temporary reference server was closed after the comparison.

The screen-by-screen comparison found no new P1 presentation difference:

| Surface | Comparison result | Boundary note |
| --- | --- | --- |
| Marquee | PASS | Honey band, repeated track, warm treatment, and motion grammar are aligned. |
| Header | PASS | Crest, real navigation, search, and utility controls preserve the real route surface. |
| Category pills | PASS | Pills are real catalog links and retain the single-level category boundary. |
| Hero | PASS | Editorial hierarchy, CTA routes, paper composition, and accessible order are aligned. |
| Polaroids | PASS | Overlap, pins, fallback media treatment, and decorative motion are preserved. |
| Product cards | PASS | Cards remain catalog-backed; unsupported reference prices/ratings are not copied. |
| Story | PASS | Neutral supported copy is retained without invented business claims. |
| Trust | PASS | Only supported neutral reassurance is shown; reference-only promises remain excluded. |
| Newsletter | PASS | The composition is explicitly preview-only; no subscription success is claimed. |
| Footer | PASS | Warm paper, editorial rule, neutral ornament, and real support/legal links are present. |

The real application intentionally differs from reference-only copy, products,
ratings, testimonials, destinations, and promises where those values lack
current application authority. Those differences are documented omissions or
preview-labelled presentation, not P1 parity defects.

### Runtime evidence classification

- Reference served via localhost: PASS.
- Reference desktop screenshot: PASS.
- Real desktop Home screenshot: PASS.
- Real 375px Home screenshot: PASS.
- Reference-vs-real structural/presentation comparison: PASS; no new P1
  difference identified.
- The 375px real route reported `innerWidth = 375`, document width `375`, body
  width `375`, and no document-level horizontal overflow.

### Reduced motion

Runtime media emulation is not available in the current browser surface. The
real runtime value was not changed to `prefers-reduced-motion: reduce`, so this
is recorded as `HUMAN_REQUIRED`, not as a fabricated pass. The CSS contract and
offline assertions remain in place. Manual Chrome DevTools acceptance must
confirm marquee, polaroid, sticker, and cart motion are disabled while reveal
content and business navigation remain usable.

### Coarse pointer

Runtime media emulation is not available in the current browser surface. The
real runtime values were not changed to `pointer: coarse` and `hover: none`,
so this is recorded as `HUMAN_REQUIRED`, not as a fabricated pass. Manual
Chrome Device Toolbar acceptance must confirm navigation, search, category
pills, CTA, product links, Cart, touch-target usability, and no hover-only
dependency.

### Task 1.5 recovery

Recovery was attempted by checking `git reflog`, `git stash list`, all reachable
history, unreachable Git objects, repository screenshot/evidence directories,
and existing audit artifacts. No provenance-verifiable pre-port desktop or
375px screenshot baseline was found. Task 1.5 therefore remains
`UNRECOVERABLE HISTORICAL EVIDENCE` and stays open; no baseline was invented or
waived.

### Current closeout state

- Task 1.5: OPEN — unrecoverable historical baseline.
- Task 4.3: OPEN — manual reduced-motion and coarse-pointer acceptance
  required.
- Task 5.4: OPEN — manual coarse-pointer acceptance required.
- Task 5.5: OPEN — manual reduced-motion and coarse-pointer acceptance
  required.
- Task 5.6: OPEN — final Batch A gate remains pending the above evidence.
- Batch B and all later batches remain locked and unclaimed.

## Human browser acceptance and final Batch A closeout

The following evidence was supplied from manual human acceptance in local
Chrome, not from Codex browser emulation, source inspection, or CSS-only
inference. It is recorded as `evidence_type: HUMAN_BROWSER_ACCEPTANCE`.

### Reduced Motion

- Result: PASS.
- Marquee stopped.
- Polaroids stopped.
- Sticker stopped.
- Cart wiggle stopped.
- Reveal/content remained visible.
- Navigation, search, CTA, product links, and Cart remained usable.

### Coarse Pointer

- Result: PASS.
- `pointer: coarse = true`.
- `hover: none = true`.
- Mobile navigation, search, category pills, CTA, product links, and Cart
  remained usable.
- No hover-only dependency was required.
- No horizontal overflow was observed.

### Historical Baseline Waiver

- Task: 1.5.
- Recovery: UNRECOVERABLE.
- Disposition: HUMAN WAIVED — HISTORICAL EVIDENCE UNRECOVERABLE.
- Approved by: `mike`.
- Approved date: `2026-09-01`.
- Replacement evidence: Reference Desktop, Real Desktop, Real 375, and
  Reference-vs-Real PASS, already recorded above.
- No historical screenshot was fabricated, and the task is not represented as
  `baseline recovered`.

The approved waiver closes the Task 1.5 acceptance disposition while
preserving its historical-evidence limitation permanently in this audit.

### Final Batch A disposition

- Task 1.5: PASS by approved human waiver; historical evidence remains
  unrecoverable.
- Task 4.3: PASS — HUMAN BROWSER ACCEPTANCE.
- Task 5.4: PASS — HUMAN COARSE POINTER ACCEPTANCE.
- Task 5.5: PASS — HUMAN REDUCED MOTION ACCEPTANCE.
- Task 5.6: PASS — Batch A final gate.
- Batch A implementation and current acceptance: PASS.
- Batch A tasks: 26/26 complete; overall change progress: 26/45.
- Batch B: READY FOR HUMAN UNLOCK, but not started in this round.
- No catalog, SKU/Variant, customization, upload, cart, checkout, order,
  payment, fulfillment, tracking, auth, or deployment authority changed.
