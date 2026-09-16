## MODIFIED Requirements

### Requirement: Fusion visual tokens remain the presentation authority

The application SHALL use one coherent Fusion presentation layer for the
shared shell and Home Batch A. The checked-in Fusion Design v1.1 reference
(`docs/design-reference/figmemento-fusion-design-v2.html`) SHALL be the source
for the reference palette, paper/background surfaces, terracotta and gold
accents, ink hierarchy, borders, spacing, radii, scrapbook materials,
shadows, focus treatment, and motion tokens. Existing token aliases may be
preserved for compatibility, but a page or component MUST NOT replace the
reference vocabulary with a generic card, gradient, logo, or animation system.

#### Scenario: Shared token rendering
- **WHEN** a user opens the Home route and another real storefront route
- **THEN** their shared shell, controls, cards, feedback states, and decorative
  materials use the same approved Fusion vocabulary while route-specific
  content remains intact

#### Scenario: Reference material fidelity
- **WHEN** a corresponding reference primitive is ported in Batch A
- **THEN** its paper, rule, tape, pin, sticker, rotation, shadow, and spacing
  relationships remain recognizably faithful instead of being removed or
  flattened into generic UI decoration

#### Scenario: Existing business state is restyled
- **WHEN** a real product, catalog, cart, checkout, order, or tracking state
  changes
- **THEN** the visual state changes through shared tokens and semantic styles
  without changing the underlying state, authority, or data source

### Requirement: Editorial typography hierarchy is consistent

The application SHALL provide the reference's readable editorial hierarchy
using the declared serif, sans, handwritten/annotation, weight, size,
line-height, and letter-spacing relationships, with appropriate Chinese
fallbacks. It MUST remain legible without an external font download and MUST
not add a network-only font dependency for visual parity.

#### Scenario: Font fallback
- **WHEN** a reference font cannot be downloaded
- **THEN** headings, body copy, controls, and annotations remain readable
  using the declared local/system fallback stack

#### Scenario: Long product copy
- **WHEN** a real product title, customization instruction, or validation
  message is longer than the reference sample
- **THEN** the hierarchy wraps without clipping, overlapping, or hiding the
  action it describes

### Requirement: Real navigation uses the current route surface

The shared shell SHALL port the reference's sticky scrapbook navigation,
inline FigMemento crest, search affordance, language affordance, cart access,
account access, and support/legal links onto the real application route graph.
The reference-only Journal, About, and Contact destinations MUST NOT be
presented as working routes unless corresponding application routes exist.
Search expansion SHALL use the reference's 216px default, 280px focused
state, and approximately 350ms transition; a nonempty Enter action SHALL
reach the real Shop/search surface rather than a fabricated route.

#### Scenario: Navigation to an existing route
- **WHEN** a user activates Home, Shop, Cart, Account, FAQ, Shipping & Returns,
  Privacy, or Terms
- **THEN** the application navigates to the corresponding existing route and
  preserves the current business flow

#### Scenario: Reference-only destination
- **WHEN** the visual reference contains a Journal, About, or Contact link but
  the application has no matching route
- **THEN** the link is omitted, clearly marked as unavailable, or deferred from
  navigation rather than routing to fabricated content

#### Scenario: Search interaction
- **WHEN** a user focuses the shared search and submits a nonempty query
- **THEN** the search expands with the reference interaction and navigates to
  the real supported Shop/search surface without exposing server-only config

### Requirement: Header and footer preserve real utility state

The shared shell SHALL retain skip-link behavior, active navigation indication,
cart quantity truth, account state, fixture/source notices, and safe feedback
while adopting the reference's marquee, warm translucent paper navigation,
double rules, footer hierarchy, and decorative materials. The marquee SHALL be
an actual repeated seamless track using the reference honey treatment, 26s
linear loop, and hover pause. Decorative reference badges or copy MUST NOT
become business controls or authoritative facts.

#### Scenario: Cart indicator
- **WHEN** the real cart quantity changes
- **THEN** the header indicator reflects the current cart state and does not
  use a static reference badge or hardcoded count

#### Scenario: Fixture notice
- **WHEN** the catalog source is an explicitly selected development fixture
- **THEN** the shell displays the existing fixture notice without changing the
  production source-selection rules

#### Scenario: Marquee behavior
- **WHEN** the shared shell is visible
- **THEN** the repeated track moves continuously at the reference timing, pauses
  on pointer hover when applicable, and remains readable and nonessential on
  narrow or reduced-motion layouts

### Requirement: Home presents real catalog discovery

The Home route SHALL use the real catalog data and existing storefront
components to express the reference's editorial hero, overlapping three-card
polaroid wall, collection/category discovery, story/trust treatment,
newsletter presentation, and footer structures. Product names, prices,
availability, assets, badges, and entry points MUST remain catalog-backed.
Reference-only testimonials, ratings, claims, prices, shipping promises, and
newsletter outcomes MUST be omitted, explicitly labeled as presentation-only,
or replaced only by already-authoritative application content.

#### Scenario: Home with available catalog
- **WHEN** the Home route loads a valid catalog source
- **THEN** the user sees the real product/category entry points in the reference
  composition and can open a real Shop, category, or product route

#### Scenario: Catalog unavailable
- **WHEN** the authoritative catalog cannot be safely loaded
- **THEN** the existing unavailable state is shown and no hardcoded reference
  product card is silently substituted

#### Scenario: Unsupported reference content
- **WHEN** the reference includes a testimonial, statistic, shipping claim,
  newsletter promise, or other fact not supplied by the real application
- **THEN** the Home surface does not present it as a real business claim or
  commerce authority

### Requirement: Responsive layouts cover desktop and narrow mobile

The shared shell and Home Batch A SHALL follow the reference breakpoint intent
around 960px, 720px, and 520px and remain usable at 375px. No decorative
composition, fixed-width search, polaroid wall, product card, primary action,
or footer structure may cause horizontal overflow, clipping, or loss of
meaningful content. The same real routes and business controls remain the
source of truth at every viewport.

#### Scenario: 375px Home journey
- **WHEN** a user visits Home at a 375px viewport
- **THEN** the marquee, navigation, search, hero, polaroid wall, catalog cards,
  story/trust content, newsletter presentation, and footer remain readable and
  operable without horizontal scrolling

#### Scenario: 375px customer journey
- **WHEN** a user visits home, shop, category, product, cart, checkout, order,
  or tracking at 375px
- **THEN** the primary content and action fit the viewport and remain operable
  with touch-sized controls

#### Scenario: Desktop composition
- **WHEN** a user visits Home at a desktop viewport
- **THEN** the editorial columns, overlapping polaroids, supporting decoration,
  product cards, and shell hierarchy match the reference composition without
  hiding core business information

### Requirement: Motion is purposeful and bounded

For each corresponding real Batch A primitive, the application SHALL port the
reference motion relationships without making motion a prerequisite for
content or actions. The reference values are: marquee 26s linear infinite
with hover pause; page entrance 450ms ease from opacity 0 and translateY(14px)
to visible; scroll reveal 700ms with translateY(26px), threshold 0.12, root
margin `0px 0px -30px 0px`, once-only observation, and 90/180/270/360ms
stagger; polaroid float loops of 7s, 8s, and 9s; polaroid hover around 450ms
to zero rotation, translateY(-8px), and scale(1.03); search expansion around
350ms; and button feedback around 180ms. Cart wiggle SHALL remain 700ms where
the existing real cart indicator supports it. Any count-up or FAQ motion is
conditional on a corresponding real application value or disclosure and MUST
NOT invent reference content.

#### Scenario: Reference motion fidelity
- **WHEN** a reference-defined motion primitive is implemented on its
  corresponding real surface
- **THEN** its duration, easing, loop, pause condition, and transform
  relationship match the reference within the current CSS/React architecture,
  unless a documented accessibility or business-interaction exception applies

#### Scenario: Interaction feedback
- **WHEN** a user focuses, hovers, presses, opens, filters, or changes a
  supported control
- **THEN** the feedback is visible, bounded in duration, and the control remains
  immediately usable

#### Scenario: Motion does not gate content
- **WHEN** an animation is unavailable, interrupted, or not yet observed
- **THEN** the content and required action remain visible and functional

#### Scenario: Reveal and stagger behavior
- **WHEN** a real Home section enters the viewport
- **THEN** it reveals once using the specified observer boundary and its
  supported children use only the specified bounded stagger delays

### Requirement: Reduced-motion and touch behavior are first-class

The application SHALL honor `prefers-reduced-motion: reduce`, SHALL not depend
on hover-only meaning, and SHALL provide touch-safe behavior for all essential
Batch A navigation, search, catalog, and CTA interactions. Nonessential
continuous decorative motion SHALL stop or be reduced for reduced-motion users;
content, focus, and state changes SHALL remain understandable.

#### Scenario: Reduced motion
- **WHEN** the user prefers reduced motion
- **THEN** marquee, polaroid float, cart wiggle, smooth scrolling, and other
  nonessential continuous motion are reduced or disabled while page content,
  focus, and required actions remain visible

#### Scenario: Touch pointer
- **WHEN** a user interacts with a coarse pointer or hover-none device
- **THEN** essential navigation, search, category, product, cart, and CTA
  actions remain directly targetable without hover-only behavior

### Requirement: Accessibility semantics are preserved or improved

The integrated Home and shared shell SHALL retain semantic headings, labels,
landmarks, skip-link behavior, keyboard navigation, visible focus, live
feedback, image alternatives, and sufficient contrast. Decorative pins,
stickers, tape, SVG marks, and motion MUST be hidden from assistive technology
when they are not meaningful content.

#### Scenario: Keyboard-only navigation
- **WHEN** a user navigates Home and the shared shell without a pointing device
- **THEN** every required navigation, search, category, product, cart, and
  disclosure action can be reached and has a visible focus indicator

#### Scenario: Validation and loading feedback
- **WHEN** a real server result, validation error, unavailable state, or loading
  state is shown
- **THEN** it is associated with the relevant control or region and is not
  communicated by color or animation alone

### Requirement: Reference content cannot become business authority

Static copy, numbers, product names, prices, ratings, reviews, shipping
promises, lead-time claims, discounts, country counts, preview claims,
newsletter claims, payment marks, and other facts present only in the Fusion
HTML SHALL NOT become catalog, customization, cart, checkout, order, payment,
fulfillment, tracking, or SEO authority. Batch A presentation code MUST
consume existing real catalog and runtime boundaries and MUST keep reference
content that is not authoritative visibly non-authoritative or omit it.

#### Scenario: Reference price is displayed
- **WHEN** a price appears in the visual reference but not in the real catalog
- **THEN** the application omits it or uses an explicit non-commerce
  presentation label and never uses it for totals or purchase decisions

#### Scenario: Reference shipping promise is displayed
- **WHEN** the reference contains a free-shipping threshold, worldwide-shipping
  promise, or delivery claim
- **THEN** the real application does not present that claim as an applicable
  shipping rule unless an existing authoritative rule supplies it

#### Scenario: Reference interaction has no real authority
- **WHEN** a reference-only newsletter, statistic, testimonial, or destination
  is shown in the HTML
- **THEN** it is omitted, clearly marked as preview/nonfunctional, or bound to
  an existing real capability without fabricating success or data

### Requirement: The integration remains compatible with the current runtime

The change SHALL use the existing App Router, React, TypeScript, vinext,
Cloudflare-compatible configuration, and CSS/module organization. It SHALL
not require a dependency major upgrade, a second application runtime, a
static demo-only storefront, a Vite environment bridge, or a database
migration. Shared visual behavior MAY use client-only interaction primitives,
but server-only configuration and business authority MUST remain server-only.

#### Scenario: Existing route verification
- **WHEN** the normal development and production build checks run
- **THEN** the real route graph builds with the same authority boundaries and no
  reference-only route is required for success

#### Scenario: Offline verification
- **WHEN** deterministic offline and rendered checks run without Supabase,
  Stripe, PayPal, Resend, 17TRACK, or other live providers
- **THEN** the visual integration can be verified through controlled fixtures,
  fakes, and rendered assertions without network-dependent success

#### Scenario: No client configuration leak
- **WHEN** the browser bundle is built for the real application
- **THEN** server-only environment values, source-selection internals, and
  provider credentials are not serialized into client components or visual
  data attributes

### Requirement: Visual acceptance covers the complete real journey

This change SHALL use explicit inventories and browser evidence to verify the
shared shell and Home Batch A before later batches are claimed. Batch A MUST
cover the reference-derived visual, responsive, interaction, motion,
reduced-motion, keyboard, coarse-pointer, and no-overflow behavior of Home
and the shared shell at desktop and 375px. Later Shop/Category, PDP/
Customization, Cart/Checkout, Order/Fulfillment/Tracking, Admin/Operator,
cross-site, and Pages-refresh batches remain separately gated.

#### Scenario: Batch A visual comparison
- **WHEN** a reviewer compares the reference HTML with the real Home route at
  desktop and 375px
- **THEN** the marquee, crest logo, navigation, search, pills, hero, polaroid
  wall, product cards, story/trust/newsletter/footer structures, spacing,
  materials, and visual hierarchy are recorded as reference parity evidence

#### Scenario: Batch A interaction and motion acceptance
- **WHEN** a reviewer exercises the real Home and shared shell
- **THEN** marquee pause, logo/nav hover, search expansion, route entrance,
  scroll reveal/stagger, polaroid float/hover, product hover, button feedback,
  cart feedback, keyboard operation, coarse pointer operation, and reduced
  motion are recorded as PASS or FAIL with unavailable states stated honestly

#### Scenario: Customer business regression
- **WHEN** the Batch A presentation checks run
- **THEN** real catalog source selection, Product/Variant authority, asset
  fallback and privacy boundaries, customization/upload, cart, checkout,
  local order, payment, fulfillment, tracking, and admin/operator authority
  remain unchanged and their existing tests continue to pass

#### Scenario: Customer visual regression
- **WHEN** the focused customer route checks run
- **THEN** they cover Home → Shop/Category → PDP → Variant/SKU →
  Customization → CustomerUpload → Cart → Local Checkout → Local Order →
  existing Local Payment presentation/state → Customer Fulfillment → Customer
  Tracking → delivered terminal presentation, while preserving the documented
  authority, fallback, and error states

#### Scenario: Operational visual regression
- **WHEN** the focused admin/operator route checks run
- **THEN** they cover authorized and rejected states, lifecycle controls,
  terminal states, and responsive readability without invoking remote services
