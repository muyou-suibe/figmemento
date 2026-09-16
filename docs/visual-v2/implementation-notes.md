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

## State boundaries

- Upload styling reads the existing `slot.status`; it never promotes an upload to accepted.
- The approved stamp renders only when the durable Fulfillment projection is `preview_approved`.
- Cart animations decorate existing lines and never replace PATCH/DELETE/CAS behavior.
- Checkout pending treatment reads the existing submit/result state and never changes totals or readiness.
- Product card facts remain sourced from `item.product`, `item.category` and `item.listingPrice`.

## Reduced motion and touch

Reduced motion makes reveal content immediately visible and collapses all V2 animation/transition duration. Coarse-pointer/touch styles remove hover lift and image zoom while preserving controls, focus and content.

## Dependency evaluation

`motion/react` and `@formkit/auto-animate` were evaluated but not installed. Existing CSS/React behavior covers the bounded experiment with less bundle weight and no mutation-lifecycle coupling.

## Deferred capability

Real interactive 3D model viewer deferred until model assets exist.
