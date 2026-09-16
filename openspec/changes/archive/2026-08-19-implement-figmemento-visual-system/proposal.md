## Why

FigMemento's current storefront has real catalog, SKU, fulfillment, media, and customization flows, but its visual authority is still distributed across prototype CSS with coral/sage accents, one-off values, and page-specific interaction rules. A small, presentation-only foundation is needed now so later homepage, PLP, and PDP composition work can build on a coherent premium system without changing the approved business behavior.

## What Changes

- Add a documented visual gap audit for the current storefront and classify unsupported visual-document content as dependencies rather than inventing business claims.
- Establish one FigMemento visual token authority for the approved warm neutral palette, typography stacks, responsive grid, spacing, radii, shadows, z-index layers, motion, and reduced-motion behavior.
- Add shared foundation styling for existing buttons, inputs, links, focus states, and product-media/card primitives where the current selectors permit it.
- Add deterministic offline contract tests that verify the visual token and accessibility foundation without loading remote fonts, images, or services.
- Leave all full homepage, PLP, PDP, information-page, status-page, and responsive composition work for a later V2 implementation.

## Capabilities

### New Capabilities

- `visual-system-foundation`: Provider- and business-neutral visual tokens and accessible interaction primitives for the existing storefront.

### Modified Capabilities

- None. This change modifies presentation implementation only; it does not change Catalog, Variant/SKU, Customization, Cart, Order, Payment, Shipping, Provider, or business-data requirements.

## Impact

- Affected presentation files: `app/globals.css`, the existing storefront CSS module where shared primitives are defined, and the visual gap-audit documentation.
- Affected verification: one focused static contract test added to the existing offline test gate.
- No API, persistence, migration, external-service, runtime, font dependency, DNS, Cloudflare, or deployment changes.
- Existing approved real data paths remain authoritative. Fixture notices, unavailable states, SKU resolution, fulfillment display, customization composition, and production fail-closed behavior are preserved.
