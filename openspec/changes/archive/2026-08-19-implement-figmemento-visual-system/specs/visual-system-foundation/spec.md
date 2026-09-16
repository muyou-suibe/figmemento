# Visual System Foundation Specification

## Purpose

Defines the presentation-only visual contract for FigMemento's existing storefront. It provides a stable foundation for later composition work while preserving all approved business and data behavior.

## ADDED Requirements

### Requirement: Warm restrained token authority

The application SHALL expose one CSS custom-property authority for the FigMemento visual system using the approved warm, low-saturation palette: background `#FAF8F5`, card `#FFFCF7`, text `#1E1A15`, light text `#5C534A`, muted text `#8C8985`, accent `#A0714F`, highlight `#C5A572`, border `#EBE7E2`, light border `#F0EDE9`, tag background `#F3EDE4`, and success `#7B9E6C`. Coral and sage SHALL NOT remain the primary public visual authority, and default public primitives SHALL not use pure black or pure white where the approved tokens provide an equivalent.

#### Scenario: Shared token values are inspected offline

- **WHEN** the visual contract test reads the global stylesheet
- **THEN** every approved color token is present with its approved value and the legacy coral/sage variables are not the named primary authority

#### Scenario: Existing business UI uses the foundation

- **WHEN** an existing storefront component renders a shared surface, text, border, success state, or focus ring
- **THEN** it can resolve the visual value from the shared token authority without changing the component's business state or payload

### Requirement: Typography, grid, and spacing contract

The visual foundation SHALL define a Cormorant Garamond display stack and an Inter body stack with local/system fallbacks, Cormorant weights from 300–500, Inter weights from 300–400, the approved display/title/body scale, a 1280px content-grid maximum, responsive 12/8/4 column breakpoints for desktop/tablet/mobile, and the approved 8-based spacing scale. The foundation MUST NOT require a font binary, CDN, or remote font request.

#### Scenario: Offline build has no font network dependency

- **WHEN** the stylesheet and focused test are evaluated without network access
- **THEN** typography resolves through local/system fallback stacks and no remote font import is required

#### Scenario: Responsive foundation is selected

- **WHEN** the viewport crosses the defined desktop (`>=1024px`), tablet (`640–1023px`), or mobile (`<=639px`) boundary
- **THEN** the shared grid and spacing primitives expose the corresponding layout contract without changing route data or introducing page-specific business controls

### Requirement: Shape, depth, layering, and motion contract

The visual foundation SHALL define the approved radii (`4, 8, 12, 16, 24, 999`), deep-brown shadow scale, z-index layers (`base 0`, `dropdown 100`, `sticky 200`, `overlay 300`, `modal 400`, `toast 500`), motion durations (`150ms`, `250ms`, `300ms` card interaction, `400ms`), approved easing curves, and restrained movement/scale limits. It SHALL provide a global `prefers-reduced-motion: reduce` policy that removes non-essential motion and smooth scrolling.

#### Scenario: Motion remains restrained

- **WHEN** an existing shared interactive primitive uses the visual foundation
- **THEN** its movement is limited to the approved small translation/scale range and it does not introduce bounce, elastic easing, large rotation, or blinking

#### Scenario: Reduced motion is requested

- **WHEN** the user agent advertises `prefers-reduced-motion: reduce`
- **THEN** non-essential transitions and animations are effectively disabled and smooth scrolling is disabled

### Requirement: Accessible shared interaction primitives

The foundation SHALL provide shared styling for primary, secondary, and quiet button/link states; medium controls SHALL target a 44px minimum touch height and 8px radius; text inputs SHALL target 44px minimum height and 8px radius; keyboard focus SHALL use a visible copper focus indicator with a 3px translucent ring. Disabled states SHALL remain visually and semantically distinct. These styles MUST NOT create new navigation, purchase, customization, admin, or persistence behavior.

#### Scenario: Keyboard focus is visible

- **WHEN** a keyboard user focuses an existing button, link, input, textarea, or select
- **THEN** a visible focus indicator is rendered without removing the native semantic focus target

#### Scenario: Existing control behavior is preserved

- **WHEN** a catalog filter, variant selector, upload control, customization field, or admin control uses the shared styles
- **THEN** only presentation changes; its existing event, validation, authorization, and server boundary remain unchanged

### Requirement: Product-media foundation remains provider-neutral

Product cards and public product media SHALL use the existing ProductAsset contract and controlled fallback behavior. The visual foundation SHALL style the existing product card with a 4:5 media frame, 12px radius, copper hover border, a maximum 4px lift, the approved shadow, 1.03 image scale, a restrained warm overlay, and a 300ms transition; public detail media SHALL use a 16–24px radius. It MUST NOT add binary upload, storage-provider selection, customer-private media, production-preview media, digital-delivery files, or external asset dependencies.

#### Scenario: Public media is unavailable

- **WHEN** an existing ProductAsset URL fails or is not renderable
- **THEN** the current controlled fallback remains visible and no network-specific or private-storage behavior is introduced

### Requirement: Business-authority firewall

The visual change SHALL preserve current real storefront composition and business authority. It MUST NOT invent or imply unsupported reviews, ratings, sales, inventory, free-shipping thresholds, provider/payment claims, newsletter/social proof, supplier/production guarantees, or new filters and sorting. Unsupported homepage sections SHALL remain documented as `VISUAL / CONTENT DEPENDENCY — NOT IMPLEMENTED`; PLP behavior remains limited to approved search/category discovery; PDP behavior continues to use real gallery, SKU, fulfillment, customization, preview-boundary, and summary data.

#### Scenario: A later visual composition needs unsupported content

- **WHEN** a visual reference contains a business claim or section not backed by an approved source
- **THEN** the implementation records it as a deferred content dependency and renders no fabricated claim

### Requirement: Offline deterministic verification

The visual foundation SHALL be verifiable through deterministic offline tests, TypeScript checking, lint, production build, rendered regression tests, strict OpenSpec validation, and whitespace validation. The visual tests MUST NOT access Supabase, payment providers, email providers, tracking providers, DNS, or Cloudflare services.

#### Scenario: Visual gate runs without providers

- **WHEN** the focused visual test and existing offline verification are run with no live provider credentials
- **THEN** the tests inspect local source contracts and complete without external service access
