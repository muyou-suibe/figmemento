## 1. Reference and authority audit

- [x] 1.1 Verify the checked-in Fusion Design v1.1 reference copy and record its source path, version, and scope boundary.
- [x] 1.2 Complete the visual parity inventory for the reference shell, Home, materials, typography, layout, responsive behavior, and unsupported reference-only content.
- [x] 1.3 Complete the interaction and motion inventory with trigger, state, transform, opacity, timing, easing, loop, pause, mobile, and reduced-motion behavior.
- [x] 1.4 Audit the real Home/shared-shell routes, catalog source, Product/Variant authority, media fallback, fixture notice, utility state, and unsupported reference claims before porting.
- [x] 1.5 Capture a desktop and 375px baseline of the current real Home/shared shell and record known cascade, accessibility, and overflow gaps.

## 2. Batch A shared shell

- [x] 2.1 Align the shared shell's scoped Fusion tokens and aliases with the reference palette, paper surfaces, rules, shadows, typography roles, and documented motion values without broad cascade rewrites.
- [x] 2.2 Port the honey-background repeated marquee track with 26s linear motion, hover pause, responsive clipping, semantic fallback, and reduced-motion behavior.
- [x] 2.3 Replace the generic brand mark presentation with the reference inline FigMemento crest SVG, preserving the real Home link, label, focus state, rotation, scale, and drop-shadow interaction.
- [x] 2.4 Port the sticky scrapbook navigation and footer materials, active-route treatment, skip link, real utility state, fixture notice, legal/support routes, and touch-safe focus behavior without adding fabricated destinations.
- [x] 2.5 Port the washi search treatment with 216px default width, 280px focus-within width, 350ms expansion, keyboard submission, and navigation to the existing real Shop/search surface.
- [x] 2.6 Port the italic category-pill grammar, gold leading dot, active terracotta underline, hover/focus lift, and real single-level category route binding.

## 3. Batch A Home composition

- [x] 3.1 Port the editorial Home hero layout, supported copy, real CTA routes, and overlapping three-polaroid wall while preserving accessible reading order.
- [x] 3.2 Add reference-derived tape, pins, stickers, annotations, paper framing, and per-card rotation/float decoration as nonessential accessible-safe presentation elements.
- [x] 3.3 Port catalog-backed polaroid product cards with real names, prices, availability, badges, links, public-asset fallback, pins, and reference hover treatment.
- [x] 3.4 Port the story/double-frame and trust-rule sections using only supported neutral application content; omit or label unsupported testimonials, ratings, statistics, and claims.
- [x] 3.5 Port the newsletter/footer presentation using an explicit nonfunctional/preview state when no real subscription capability exists, without fabricating submission success or business promises.

## 4. Motion, accessibility, and responsive behavior

- [x] 4.1 Implement the real route entrance and once-only IntersectionObserver reveal behavior using the documented threshold, root margin, 700ms transition, and 90/180/270/360ms stagger.
- [x] 4.2 Implement the documented logo/nav/search/pill/polaroid/product/button/cart interactions and conditional count-up/FAQ behavior only where a corresponding real value or disclosure exists.
- [x] 4.3 Verify reduced-motion, keyboard-only, coarse-pointer, focus visibility, semantic labels, image alternatives, and 375px/no-horizontal-overflow behavior for the shared shell and Home.
- [x] 4.4 Audit CSS/module boundaries and runtime compatibility so the port does not leak server configuration, introduce a second runtime, or disturb real business component semantics.

## 5. Batch A deterministic and browser verification

- [x] 5.1 Add focused deterministic regression coverage for real catalog data, Product/Variant authority, public media fallback/privacy boundaries, fixture notice, route links, and absence of reference business authority drift.
- [x] 5.2 Run rendered Home/shared-shell checks at desktop and record the reference comparison evidence for layout, materials, typography, and essential actions.
- [x] 5.3 Run real-browser desktop acceptance against the checked-in reference and record visual parity for marquee, logo, navigation, search, pills, hero, polaroids, cards, story/trust, newsletter, and footer.
- [x] 5.4 Run real-browser 375px acceptance with keyboard and coarse-pointer checks, including no horizontal overflow and directly usable navigation, search, product, cart, and CTA controls.
- [x] 5.5 Run real-browser motion and accessibility acceptance for marquee movement/pause, logo/nav hover, search expansion, route entrance, reveal/stagger, polaroid float/hover, product hover, button feedback, cart feedback, and reduced motion.
- [x] 5.6 Record the Batch A final gate, including desktop/375 parity, interaction/motion evidence, reduced-motion/coarse-pointer/accessibility evidence, and existing business regression results; do not claim later batches complete.

## 6. Batch B Shop and Category parity

- [x] 6.1 Port the reference editorial listing and collection grammar onto real Shop/category surfaces without changing catalog filtering or price authority.
- [x] 6.2 Align Shop/category responsive, asset fallback, search/filter, card interaction, and reduced-motion behavior with the approved reference inventory.
- [x] 6.3 Verify and record Batch B desktop, 375px, keyboard, coarse-pointer, reduced-motion, and business-regression evidence.

## 7. Batch C PDP and Customization parity

- [x] 7.1 Port the reference product-detail composition onto the real PDP and customization entry surface without mixing SKU options and CustomizationFields.
- [x] 7.2 Preserve real upload/privacy/fallback, variant, fulfillment, availability, and add-to-cart states while applying the documented visual and motion primitives.
- [x] 7.3 Verify and record Batch C browser, responsive, accessibility, motion, and business-regression evidence.

## 8. Batch D Cart and Checkout parity

- [x] 8.1 Port cart and Local Checkout presentation using real quantity, removal, empty, address, shipping-fixture, coupon, tax, and local-summary states.
- [x] 8.2 Preserve server-derived authority, non-payable local arithmetic semantics, upload receipts, and safe errors while applying shared visual interactions.
- [x] 8.3 Verify and record Batch D desktop, 375px, accessibility, reduced-motion, and business-regression evidence without adding payment or order behavior.

## 9. Batch E Order, Fulfillment, and Tracking parity

- [x] 9.1 Port real customer/operator order, fulfillment, and tracking views with lifecycle-specific materials, timelines, terminal states, and bounded actions.
- [x] 9.2 Preserve same-browser/operator authority, replay behavior, privacy, and no-provider/no-shipping semantics while applying the shared presentation system.
- [x] 9.3 Verify and record Batch E browser, responsive, accessibility, motion, and lifecycle-regression evidence.

## 10. Batch F Admin and Operator parity

- [x] 10.1 Port the visual grammar onto real admin/operator surfaces without adding supplier, inventory, payment, fulfillment, or workflow capabilities.
- [x] 10.2 Verify authorized/rejected states, safe errors, responsive controls, keyboard/coarse-pointer behavior, reduced motion, and server-only authorization evidence.

## 11. Batch G cross-site final acceptance

- [x] 11.1 Run the complete real customer, operator, and admin visual regression matrix at desktop and 375px against the reference-derived inventories.
- [x] 11.2 Run the complete interaction/motion/accessibility matrix, including reduced motion, coarse pointer, keyboard, long copy, image fallback, and no-overflow evidence.
- [x] 11.3 Audit all visual changes for business authority, provider neutrality, production source selection, route integrity, and absence of reference-only data drift.

## 12. Batch H Pages preview refresh

- [ ] 12.1 Refresh the approved GitHub Pages preview package only after the real application batches pass and verify the existing subpath/base-path behavior.
- [ ] 12.2 Record Pages artifact, smoke, and remote-preview evidence without changing deployment architecture or claiming production commerce support.
