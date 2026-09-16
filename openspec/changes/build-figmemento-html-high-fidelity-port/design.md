## Context

The real FigMemento application already contains the Fusion token foundation,
catalog-backed storefront components, and real route/business boundaries. The
checked-in reference at `docs/design-reference/figmemento-fusion-design-v2.html`
is the repository's formal Fusion Design v1.1 artifact. It defines a much more
specific scrapbook/editorial composition and motion language than the current
Home/shared shell: a seamless honey marquee, inline crest SVG, paper navigation,
washi search, decorated polaroids, double rules, and bounded motion primitives.

The application remains authoritative for all commerce and operational facts.
The HTML is a presentation reference only. Its sample prices, testimonials,
shipping claims, statistics, newsletter outcomes, and destinations cannot be
copied into catalog or workflow authority. The first implementation is Batch A
(shared shell and Home); later batches are planned but not authorized by this
change's first apply.

## Goals

- Port the reference's shared shell and Home composition with high visual
  fidelity, including the materials and relationships that are easy to lose in
  a generic restyle.
- Preserve real App Router navigation, catalog/SKU/Variant authority,
  customization/upload boundaries, cart/checkout, local order/payment,
  fulfillment/tracking, and admin/operator authorization.
- Make the reference interaction and motion values explicit, testable, and
  accessible at desktop, 375px, keyboard-only, coarse-pointer, and reduced-
  motion conditions.
- Keep reference-only copy and values visibly non-authoritative or omit them.
- Provide a visual parity inventory and an interaction/motion inventory that
  can be reviewed before implementation and updated with browser evidence.

## Non-Goals

- No new Product, SKU, customization, cart, checkout, order, payment,
  fulfillment, tracking, admin, operator, storage, provider, or deployment
  capability.
- No database schema or migration, Supabase change, fixture/catalog-source
  change, or server/runtime change.
- No replacement of the current App Router with the static HTML's page-switch
  SPA or creation of demo-only storefront routes/components.
- No redesign of Shop/Category, PDP/Customization, Cart/Checkout,
  Order/Fulfillment/Tracking, or Admin/Operator in Batch A except shared shell
  integration required to preserve the common visual grammar.
- No external font, image, analytics, newsletter, or other network dependency
  added solely to imitate reference content.

## Decisions

### Use the real application structure

Batch A will work through the existing `CatalogShell`, catalog discovery/Home
components, App Router layouts/routes, `CatalogPolaroid`, and scoped CSS/module
architecture. The static HTML is not copied as a second runtime. Existing
server/client boundaries remain intact; visual client behavior is isolated to
small presentation primitives or hooks where browser observation is required.

### Treat the formal HTML as an evidence source, not a data source

The formal checked-in v1.1 file is the reference for structure, token values,
transforms, timing, easing, responsive intent, and decorative details. The
inventories record where the current application differs and whether a
reference element is safe to port. Reference sample data is never used to
populate a Product, Variant, price, shipping rule, order, testimonial, or
newsletter result.

### Port exact visual primitives with real data slots

The shared shell will use the reference inline FigMemento crest SVG, repeated
marquee track, sticky translucent paper navigation, washi search, active route
and category treatments, and footer rules. The Home will use real catalog
products/assets and existing controlled fallbacks inside the reference's hero,
polaroid, card, story, trust, and newsletter presentation slots. Unsupported
reference-only facts are omitted or labeled presentation-only; no fake
testimonial, statistic, shipping promise, or subscription success is added.

### Preserve token compatibility while adding fidelity

Existing Fusion aliases and visual-system foundations remain usable. New or
updated tokens are additive and scoped to the current CSS architecture, with
the reference values documented in the inventories. The reference's local or
system fallback behavior is retained; no remote font import is required.

### Make motion explicit and non-blocking

CSS handles deterministic hover/focus/press transforms and bounded keyframes.
The Home reveal behavior uses an IntersectionObserver with threshold `0.12`,
root margin `0px 0px -30px 0px`, once-only observation, and the documented
90/180/270/360ms stagger. Route entrance behavior is applied to the real route
surface, not simulated by hiding and showing static HTML pages. Every animated
primitive has a no-motion/fallback state so actions never wait for animation.

The exact reference values are maintained in the interaction inventory:
marquee 26s linear with hover pause, page entrance 450ms ease, reveal 700ms,
polaroid float 7s/8s/9s, polaroid hover approximately 450ms to rotate-zero,
translateY(-8px), scale(1.03), search expansion 350ms, button feedback 180ms,
and cart wiggle 700ms where the real cart indicator supports it. Count-up and
FAQ motion are conditional and cannot create unsupported content.

### Keep accessibility behavior as a first-class constraint

The port preserves semantic headings, labels, landmarks, skip link, focus
states, image alternatives, and keyboard order. Reduced motion disables or
minimizes nonessential continuous motion and smooth scrolling. Coarse-pointer
behavior does not rely on hover. At 375px, all essential controls remain
touch-sized and no horizontal overflow is accepted.

### Verify against both reference and real routes

Deterministic tests cover source/data and rendered contracts without live
providers. Browser acceptance compares the formal HTML and the real Home/shared
shell at desktop and 375px and records motion/reduced-motion/coarse-pointer
evidence. A Batch A PASS does not imply that later site surfaces have reached
high-fidelity parity.

## Risks and Trade-offs

- **Reference fidelity versus real content:** the HTML contains persuasive
  sample facts that cannot become business authority. The inventory will mark
  these slots explicitly so visual structure can be preserved without making
  false claims.
- **CSS cascade interaction:** the repository contains legacy styles alongside
  Fusion styles. Changes will remain scoped and be checked for regressions;
  broad cascade cleanup is deferred to a later dedicated batch.
- **Animation test flakiness:** motion acceptance relies on deterministic
  computed styles plus bounded real-browser observations. Content remains
  visible without animation so an unavailable browser feature cannot block the
  workflow.
- **Responsive composition:** overlapping polaroids and scrapbook materials
  can create overflow at 375px. Breakpoints and explicit overflow checks are
  required before Batch A is accepted.
- **Reference source drift:** only the checked-in v1.1 formal copy is used.
  Any future reference replacement must update both inventories and undergo a
  new review; it is not silently substituted during implementation.
- **Unsupported presentation surfaces:** testimonials, count-up statistics,
  FAQ behavior, newsletter submission, and reference-only links are not
  invented. Their visual treatment is conditional on real application support.

## Migration Plan

No database or data migration is needed. Implementation is incremental within
the current application: establish inventories and a baseline, port shared
shell primitives, port Home Batch A, then verify and record browser evidence.
If a Batch A change must be reverted, revert only the scoped presentation
files and preserve all application data/runtime boundaries. Later B–H batches
remain separately gated and are not implemented or claimed by this change
until their own acceptance evidence exists.

## Open Questions

There are no unresolved architecture questions required before Batch A. The
formal reference is the checked-in `figmemento-fusion-design-v2.html` (Fusion
Design v1.1); no separate copy of the user-supplied filename is assumed. The
final storage provider, production deployment, and any unsupported reference
content remain outside this change.
