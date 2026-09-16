# Implementation notes

## Motion foundation

Visual V2 uses the existing React/CSS stack. No `motion`, Framer Motion, Lottie or AutoAnimate dependency was added. The repository already has section-level IntersectionObserver reveal, stateful React projections and reduced-motion handling; a dependency would add bundle and compatibility cost without improving authority correctness.

The scoped V2 tokens are:

- micro: 160ms;
- controls/cards: 230ms;
- reveal: 520ms;
- editorial entrance: 680ms;
- control lift: 2px;
- card lift: 7px;
- reveal distance: 22px maximum.

The motion-visibility pass uses nested polaroid layers: the outer frame owns a 5.1–6.4 second passive transform-only path, while the inner link owns the stable straighten/lift/scale inspection state. Three different paths and phase offsets avoid synchronized motion. Two decorative marks drift independently, keeping the continuous hero budget at five animations. Tape, kicker, headline, copy, CTA and the polaroid group use finite 620–780ms staggered entrance motion.

The mid-width composition pass keeps the established two-column Hero through 980px and uses a dedicated stacked layout only from 721–960px. The outer motion frames own absolute cluster positioning; the inner links remain the inspection transform layer. Intermediate title and spacing compression is scoped to that range, so desktop and narrow-mobile typography stay on their existing contracts.

## State boundaries

- Upload styling reads the existing `slot.status`; it never promotes an upload to accepted.
- The approved stamp renders only when the durable Fulfillment projection is `preview_approved`.
- Cart animations decorate existing lines and never replace PATCH/DELETE/CAS behavior.
- Checkout pending treatment reads the existing submit/result state and never changes totals or readiness.
- Product card facts remain sourced from `item.product`, `item.category` and `item.listingPrice`.

## Reduced motion and touch

Reduced motion makes reveal content immediately visible, removes the passive/decoration loops and entrance motion, and collapses all remaining V2 animation/transition duration. Coarse-pointer/touch styles remove hover lift and image zoom while preserving passive ambience, controls, focus and content.

## Dependency evaluation

`motion/react` and `@formkit/auto-animate` were evaluated but not installed. Existing CSS/React behavior covers the bounded experiment with less bundle weight and no mutation-lifecycle coupling.

## Deferred capability

Real interactive 3D model viewer deferred until model assets exist.
