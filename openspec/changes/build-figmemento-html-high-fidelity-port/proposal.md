## Why

The real FigMemento application has adopted the Fusion palette and some
editorial composition, but its current Home and shared shell still diverge
visibly and behaviorally from the approved HTML reference. The next visual
iteration must port the reference's scrapbook materials, composition, and
motion relationships with high fidelity while keeping every existing business
authority and route boundary intact.

## What Changes

- Establish the checked-in `docs/design-reference/figmemento-fusion-design-v2.html`
  (Fusion Design v1.1) as the visual, interaction, motion, and responsive
  reference for this port.
- Port the shared shell and Home surface in Batch A: marquee, inline SVG crest,
  scrapbook navigation, search, category pills, editorial hero, polaroid wall,
  catalog-backed product cards, story/trust/newsletter/footer structures, and
  their reference-defined interaction and motion behavior.
- Preserve real App Router routes, catalog/SKU/Variant authority,
  customization and upload boundaries, cart/checkout/order/payment/fulfillment/
  tracking behavior, and admin/operator authorization; reference-only facts
  must never become business data.
- Add an explicit visual parity inventory and interaction/motion inventory before
  implementation, then add focused browser and deterministic regression evidence
  for each completed batch.
- Keep reduced-motion, keyboard, coarse-pointer, 375px, and no-horizontal-
  overflow behavior as acceptance requirements.
- Sequence later work as Batch B Shop/Category, Batch C PDP/Customization,
  Batch D Cart/Checkout, Batch E Order/Fulfillment/Tracking, Batch F
  Admin/Operator, Batch G cross-site acceptance, and Batch H Pages refresh;
  this first implementation round is limited to Batch A.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `figmemento-fusion-frontend`: tighten the existing Fusion presentation
  contract from broad visual adoption to high-fidelity reference parity for
  the shared shell and Home Batch A, without changing business semantics.

## Impact

- Affected presentation code is limited initially to the shared catalog shell,
  Home composition, reusable visual primitives, and their scoped CSS/animation
  support.
- Affected verification includes deterministic source/render assertions and
  real-browser desktop, 375px, interaction, motion, reduced-motion, and
  coarse-pointer evidence.
- No database schema, migration, provider integration, runtime environment,
  storage architecture, API contract, business state machine, or dependency
  major upgrade is introduced.
- The HTML reference contains reference-only copy, prices, shipping claims,
  newsletter claims, testimonials, and decorative sample data; only real
  application authority may populate business-facing values.
