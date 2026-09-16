# Fusion Frontend Batch D — PDP and Customization Audit

## Scope

This batch is limited to presentation integration for `/product/[slug]` and
its existing ProductAsset, Variant/SKU, customization, CustomerUpload, handoff,
and Add to Cart components. It does not change domain, persistence, API,
storage-provider, payment, order, fulfillment, tracking, or deployment
behavior.

## Current PDP Map

| Boundary | Current authority and presentation owner |
| --- | --- |
| Route | `app/product/[slug]/page.tsx`; server route resolves the public catalog and matching customization configuration. |
| Product authority | `loadPublicProductDetailWithCustomization` through the selected catalog repository. |
| Variant/SKU authority | `resolveVariantSelection` and `toPublicSelectorVariants`; browser events contain identifiers and selected options only. |
| Price authority | Product/Variant catalog result; the PDP only formats the server-provided listing and selected Variant values. |
| Fulfillment authority | Product fulfillment projection passed by the route; only existing type, production mode, shipping requirement, and lead-time fields are shown. |
| Customization authority | Existing `CustomizationField` configuration and `ProductCustomizationDraft` composition. |
| Upload authority | Existing customer-upload flow, local preview, safe receipt result, and handoff gate. |
| ProductAsset authority | Existing public `ProductAsset` reference view and controlled rendering fallback. |
| Cart handoff | Existing `AddToCartButton` posts the accepted configured-item handoff; no cart semantics changed. |

## Reference PDP Parity

- **Layout:** Fusion editorial split composition on larger screens; a clear
  media → product copy → options → customization → action flow on small screens.
- **Typography:** serif editorial product title and spec heading, hand-style
  labels, and resilient existing Fusion fallbacks.
- **Gallery:** paper/media frame, tape and inner rule treatment, active
  thumbnail framing, public caption, and controlled unavailable fallback.
- **Title and price:** real Product identity and real listing price only;
  no reference product names or prices.
- **Spec/fulfillment:** a compact “At a glance” sheet showing only the existing
  fulfillment projection.
- **Variant:** existing accessible native buttons and resolver-driven status;
  no browser-created SKU or price.
- **Customization:** existing text, image-slot, crop, progress, error, summary,
  and handoff controls receive the same paper/card/rule language.
- **Purchase framing:** the existing Add to Cart readiness gate remains the
  only condition that reveals the action.
- **Motion:** bounded thumbnail/option/action feedback; no state depends on
  animation.
- **Responsive:** explicit 960/720/520 transitions, 375-safe controls,
  coarse-pointer behavior, and reduced-motion overrides.

## Authority Boundaries

Reference HTML supplies visual and interaction grammar only. Current
application data and state remain authoritative for Product, SKU, price,
availability, fulfillment, CustomizationField validation, CustomerUpload
ownership, and Cart handoff.

## ProductAsset / CustomerUpload Separation

ProductAsset remains public marketing media from the provider-neutral
`public_reference`/URL contract. CustomerUpload remains private customer
customization media with local preview, safe upload status, opaque receipt
handling, and existing ownership boundary. The gallery does not import or
render CustomerUpload receipts, storage keys, owners, buckets, or provider
locators.

## Fixture / Reference Claim Firewall

Fixture notices remain visible through the existing route source selection.
Fixture catalog values may drive the local demo, but are not production
authority. The Fusion reference's example prices, ratings, reviews, shipping
promises, discounts, payment marks, and other demo facts were not copied into
the PDP.

## Fixture Coverage Limitation

There is no public physical, shipping-required text-only fixture in the
current catalog. Text-only capability remains covered by deterministic domain
and HTTP integration tests. The real physical browser acceptance used
`glass-light-picture` where applicable; `digital-portrait` was not forced
through shipping Checkout. No fake physical text-only Product was added, and
Digital Checkout was not implemented.

## Active Change Overlap

`build-product-customization-workflow` and
`build-configurable-product-catalog` remain unchanged OpenSpec artifacts and
task states. Existing application files for catalog/customization/PDP were
already dirty or untracked before Batch D. The Batch D delta is limited to
PDP presentation wrappers, scoped CSS, public asset caption metadata, focused
tests, and this audit.

## Browser Evidence

The real development Worker was started with the existing explicit fixture
selection and was stopped after acceptance. No remote Supabase request was
made. The observed PDP evidence is:

- Desktop valid PDP: PASS at `http://localhost:3001/product/couple-figure`;
  the real Product identity, description, breadcrumb, spec sheet, fulfillment
  fields, selector, customization form, handoff gate, and cart handoff were
  rendered.
- Fixture notice: PASS; the existing development-only notice remained
  visible.
- ProductAsset fallback: PASS; the development `public_reference` rendered the
  existing controlled `THUMBNAIL MEDIA UNAVAILABLE` state and a safe public
  caption. No customer receipt or private locator appeared.
- Variant behavior: PASS; selecting Mini showed
  `DEV-COUPLE-FIGURE-MINI` and `$69.90 · Available`, selecting Standard showed
  `DEV-COUPLE-FIGURE-STANDARD` and `$89.90 · Available`, and the selected
  image/customization remained attached. Deluxe remained disabled/unavailable
  and was not an eligible purchase selection.
- Validation/upload behavior: PASS; the required image initially blocked
  personalization, a real local image selection produced preview, file
  metadata, advisory dimension feedback, and the existing crop controls, and
  the real upload endpoint returned the existing accepted receipt contract.
  The handoff then became locally ready and the existing Add to cart action
  added the configured item without changing its authority.
- Unavailable route: PASS; `/product/not-a-real-product` returned the existing
  safe not-found page without catalog/provider diagnostics.
- 375px: PASS; viewport width 375 had no horizontal overflow, preserved the
  fixture notice and ProductAsset fallback, kept Mini/Standard enabled and
  Deluxe disabled, and retained the real PDP content and controls.

## Validation Evidence

Focused Batch D and related PDP/customization regression tests passed (49/49).
The full offline suite passed (844/844). `npm run test:rendered` passed (9/9),
`npm run typecheck` passed, `npm run lint` passed with 0 errors and 1 existing
`@next/next/no-img-element` warning, `npm run build` passed, `openspec
validate --all --strict` passed (17/17), and `git diff --check` passed.

The only adjustment made during verification was to replace the new PDP
fallback gradient and literal 3px radii with existing Fusion token-based
styles so the pre-existing visual-v2 regression gate remains satisfied.

## Remaining P2/P3 Visual Differences

The supplied reference is a static single-page prototype rather than a real
PDP route. No reference-only product claims, media URLs, or unsupported
navigation were transplanted. Decorative tape/paper details are therefore
bounded to the real PDP and intentionally subordinate to accessible controls
and business state.
