## Purpose

This capability gives the real FigMemento application a coherent warm,
editorial, narrative presentation across customer, operator, and admin flows
without changing the business authority behind those flows.

## ADDED Requirements

### Requirement: Fusion visual tokens remain the presentation authority

The application SHALL expose one coherent visual token layer for the Fusion
presentation, including the reference palette, paper/background surfaces,
terracotta and gold accents, ink hierarchy, borders, spacing, radii, shadows,
focus treatment, and motion timing. Existing business components SHALL consume
the shared presentation layer rather than introducing unrelated page palettes.

#### Scenario: Shared token rendering
- **WHEN** a customer opens two different real storefront routes
- **THEN** their shared shell, controls, cards, and feedback states use the same
  approved Fusion visual vocabulary while route-specific content remains intact

#### Scenario: Existing business state is restyled
- **WHEN** a product, cart, checkout, or tracking state changes
- **THEN** the visual state changes through shared tokens and semantic styles
  without changing the underlying state or authority

### Requirement: Editorial typography hierarchy is consistent

The application SHALL provide a readable editorial hierarchy using the
reference serif, sans, handwritten/annotation, weight, size, line-height, and
letter-spacing relationships, with appropriate Chinese fallbacks. Typography
MUST remain legible when external font loading is unavailable.

#### Scenario: Font fallback
- **WHEN** a reference font cannot be downloaded
- **THEN** headings, body copy, controls, and annotations remain readable using
  the declared local/system fallback stack

#### Scenario: Long product copy
- **WHEN** a product title, customization instruction, or validation message is
  longer than the reference sample
- **THEN** the hierarchy wraps without clipping, overlapping, or hiding the
  action it describes

### Requirement: Real navigation uses the current route surface

The shared header and footer SHALL present FigMemento brand navigation,
search, language affordance, cart access, account access, and support/legal
links using real application routes and real interaction state. Reference-only
Journal, About, and Contact destinations MUST NOT be presented as working
routes unless corresponding application routes exist.

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

### Requirement: Header and footer preserve real utility state

The shared shell SHALL keep skip-link behavior, active navigation indication,
cart quantity truth, account state, fixture/source notices, and safe feedback
visible without turning decorative reference elements into business controls.

#### Scenario: Cart indicator
- **WHEN** the real cart quantity changes
- **THEN** the header indicator reflects the current cart state and does not use
  a static reference badge or hardcoded count

#### Scenario: Fixture notice
- **WHEN** the catalog source is an explicitly selected development fixture
- **THEN** the shell displays the existing fixture notice without changing the
  production source-selection rules

### Requirement: Home presents real catalog discovery

The home route SHALL use the real catalog data and existing storefront
components to express a warm narrative hero, collection discovery, trust or
story content, and a clear path to real catalog browsing. Decorative narrative
content MUST NOT imply unimplemented commerce guarantees.

#### Scenario: Home with available catalog
- **WHEN** the home route loads a valid catalog source
- **THEN** the user sees real product/category entry points and can open a real
  shop, category, or product route

#### Scenario: Catalog unavailable
- **WHEN** the authoritative catalog cannot be safely loaded
- **THEN** the existing unavailable state is shown and no hardcoded reference
  product card is silently substituted

### Requirement: Shop and category browsing remain data-driven

The shop and single-level category routes SHALL retain real product listing,
search, category filtering, result feedback, asset fallbacks, and listing-price
derivation while adopting the Fusion editorial card and collection grammar.

#### Scenario: Product listing interaction
- **WHEN** a user searches or filters the shop
- **THEN** visible results, result count, empty state, and product links update
  from the real catalog dataset

#### Scenario: Category route
- **WHEN** a user opens `/category/[slug]`
- **THEN** only the resolved real category and its eligible products are shown,
  with no nested-category behavior introduced

### Requirement: Product detail communicates authoritative SKU selection

The product detail route SHALL present real product identity, assets, variant
options, availability, authoritative price, fulfillment information, and
customization entry points within the Fusion presentation. It MUST keep SKU
selection and customer customization as separate concepts.

#### Scenario: Variant selection
- **WHEN** a user chooses a valid available variant
- **THEN** the displayed price, availability, option summary, and add-to-cart
  readiness reflect that real variant

#### Scenario: Unavailable variant
- **WHEN** a variant is inactive or unavailable
- **THEN** the UI communicates that it cannot be purchased and does not enable a
  purchase action for that variant

### Requirement: Customization and media presentation preserve privacy boundaries

Customization fields, image slots, upload feedback, previews, and product
marketing assets SHALL be presented with clear labels, safe fallback states,
and existing ownership/privacy boundaries. Public product media MUST remain
distinct from customer-private uploads, production previews, and digital
delivery files.

#### Scenario: Public product media
- **WHEN** a real ProductAsset has an allowed public reference
- **THEN** the asset is rendered as marketing media with a meaningful fallback
  if it cannot load, without exposing private storage semantics

#### Scenario: Customer upload state
- **WHEN** a customer selects, replaces, removes, or previews an upload
- **THEN** the UI uses the existing owner-scoped upload behavior and never
  presents a public marketing URL as the upload authority

### Requirement: Cart and checkout visual integration is side-effect preserving

Cart and Local Checkout SHALL receive the Fusion visual treatment for line
items, quantity controls, remove/clear/empty states, address fields, shipping
fixture feedback, coupon/tax status, local arithmetic summary, and bounded
errors without changing their existing server authority or payment boundary.

#### Scenario: Cart mutation
- **WHEN** a user changes quantity, removes an item, clears the cart, or returns
  to shopping
- **THEN** the existing cart behavior remains the source of truth and the UI
  communicates the resulting state in the shared visual grammar

#### Scenario: Tax not activated
- **WHEN** Local Checkout displays its current summary
- **THEN** tax remains visibly not activated and any local demo arithmetic total
  is not labeled as payable, charged, or final authorization amount

### Requirement: Order, fulfillment, and tracking views remain recognizable

Order success, customer fulfillment/tracking, operator fulfillment/tracking,
and their timelines SHALL share the Fusion visual language while preserving
the existing lifecycle labels, action permissions, replay behavior, and
terminal states.

#### Scenario: Customer order view
- **WHEN** a customer opens an existing authorized local order or shipment
- **THEN** the view exposes only the information already allowed by the current
  customer boundary and does not create or mutate business state

#### Scenario: Operator lifecycle view
- **WHEN** an authorized operator opens a fulfillment or tracking action
- **THEN** only the existing allowed next action is presented and terminal
  states remain terminal

### Requirement: Admin and operator surfaces share visual grammar without workflow expansion

The admin catalog/orders and operator pages SHALL use the same typography,
surfaces, focus states, feedback patterns, and responsive rules where practical,
while keeping their existing server-only authorization and business controls.
This capability SHALL NOT add supplier, production-provider, inventory, payment,
or fulfillment operations.

#### Scenario: Unauthorized admin or operator access
- **WHEN** an unauthorized user opens an admin or operator route
- **THEN** the existing safe rejection is preserved and no privileged UI state
  or data is exposed by the visual integration

#### Scenario: Existing admin action
- **WHEN** an authorized administrator uses an existing catalog control
- **THEN** the same operation, validation, and safe error mapping are retained
  while only presentation changes

### Requirement: Responsive layouts cover desktop and narrow mobile

All integrated surfaces SHALL remain usable at desktop widths and at 375px
without horizontal overflow, clipped primary actions, unreadable content, or
loss of required workflow controls. Layout changes SHALL follow the reference
breakpoint intent around 960px, 720px, and 520px without assuming the reference
static page structure is a real application route.

#### Scenario: 375px customer journey
- **WHEN** a user visits home, shop, category, product, cart, checkout, order,
  or tracking at 375px
- **THEN** the primary content and action fit the viewport and remain operable
  with touch-sized controls

#### Scenario: Desktop composition
- **WHEN** a user visits the same real route at a desktop viewport
- **THEN** the intended editorial columns, media framing, and supporting content
  are visible without hiding core business information

### Requirement: Motion is purposeful and bounded

The integrated interface SHALL use the reference-defined motion relationships
for any corresponding real visual primitive, subject to explicit
accessibility, reduced-motion, real-interaction, or runtime exceptions recorded
by the implementation. Motion SHALL remain compatible with the existing CSS
architecture and MUST NOT delay, block, or obscure product selection,
customization, cart, checkout, order, fulfillment, or tracking actions.

#### Scenario: Interaction feedback
- **WHEN** a user focuses, hovers, presses, opens, filters, or changes a
  supported control
- **THEN** the feedback is visible, bounded in duration, and the control remains
  immediately usable

#### Scenario: Motion does not gate content
- **WHEN** an animation is unavailable or interrupted
- **THEN** the content and required action remain visible and functional

#### Scenario: Reference motion fidelity
- **WHEN** a reference-defined motion primitive is implemented on its
  corresponding real visual surface
- **THEN** its duration, easing, and transform relationship matches the
  reference within the approved implementation architecture, unless an
  explicit accessibility or business-interaction exception is recorded

### Requirement: Reduced-motion and touch behavior are first-class

The application SHALL honor `prefers-reduced-motion: reduce`, SHALL not depend
on hover-only meaning, and SHALL provide touch-safe behavior for mobile users.

#### Scenario: Reduced motion
- **WHEN** the user prefers reduced motion
- **THEN** nonessential animation and smooth scrolling are reduced or disabled,
  while content, focus, and state changes remain understandable

#### Scenario: Touch pointer
- **WHEN** a user interacts with a touch or coarse pointer
- **THEN** essential information and actions do not require hover and controls
  remain comfortably targetable

### Requirement: Accessibility semantics are preserved or improved

The integrated surfaces SHALL retain semantic headings, labels, landmarks,
keyboard navigation, visible focus, live feedback, image alternatives, dialog
or disclosure semantics, and sufficient contrast for the real workflows.

#### Scenario: Keyboard-only navigation
- **WHEN** a user navigates a route without a pointing device
- **THEN** every required navigation, product, customization, cart, checkout,
  and disclosure action can be reached and has a visible focus indicator

#### Scenario: Validation and loading feedback
- **WHEN** a server result, validation error, unavailable state, or loading
  state is shown
- **THEN** it is associated with the relevant control or region and is not
  communicated by color or animation alone

### Requirement: Reference content cannot become business authority

Static copy, numbers, product names, prices, ratings, reviews, shipping
promises, lead-time claims, discounts, country counts, preview claims,
newsletter claims, payment marks, and other facts present only in the Fusion
HTML SHALL NOT become catalog, customization, cart, checkout, order, payment,
fulfillment, tracking, or SEO authority unless the existing authoritative
application source already provides them.

#### Scenario: Reference price is displayed
- **WHEN** a price appears in the visual reference but not in the real catalog
- **THEN** the application omits it or uses an explicit non-commerce
  presentation label and never uses it for totals or purchase decisions

#### Scenario: Reference shipping promise is displayed
- **WHEN** the reference contains a free-shipping threshold, worldwide-shipping
  promise, or delivery claim
- **THEN** the real application does not present that claim as an applicable
  shipping rule unless an existing authoritative rule supplies it

### Requirement: Production configuration and provider neutrality remain intact

This visual integration SHALL preserve production-versus-development source
selection, server-only secrets, Supabase authority, private-upload access,
payment/provider boundaries, and the unresolved final choice between Supabase
Storage and Cloudflare R2. It SHALL NOT add external visual dependencies that
require a provider or alter deployment infrastructure.

#### Scenario: Production source selection
- **WHEN** the application runs without an explicit development fixture
  selection
- **THEN** the existing production catalog source behavior remains in force and
  the visual layer does not silently activate fixtures

#### Scenario: Asset provider neutrality
- **WHEN** a product or customer media state is rendered
- **THEN** the presentation consumes the existing allowed reference/receipt
  boundary without choosing Supabase Storage, R2, or another provider

### Requirement: The integration remains compatible with the current runtime

The change SHALL use the existing App Router, React, TypeScript, vinext,
Cloudflare-compatible configuration, and CSS/module organization. It SHALL
not require a dependency major upgrade, a second application runtime, a static
demo-only storefront, or a database migration.

#### Scenario: Existing route verification
- **WHEN** the normal development and production build checks run
- **THEN** the real route graph builds with the same authority boundaries and no
  reference-only route is required for success

#### Scenario: Offline verification
- **WHEN** deterministic offline and rendered checks run without Supabase,
  Stripe, PayPal, Resend, 17TRACK, or other live providers
- **THEN** the visual integration can be verified through controlled fixtures,
  fakes, and rendered assertions without network-dependent success

### Requirement: Visual acceptance covers the complete real journey

The implementation SHALL provide focused verification for the shared shell,
home, catalog, product/customization, cart, checkout, order, fulfillment,
tracking, and relevant admin/operator surfaces at desktop and 375px, including
visual states that are easy to regress.

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
