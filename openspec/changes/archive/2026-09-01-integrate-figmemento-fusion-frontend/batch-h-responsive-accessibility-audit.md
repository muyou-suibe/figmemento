# Batch H — Responsive, Motion, and Accessibility Audit

Date: 2026-08-31

## Scope

This audit covers only Fusion Frontend Batch H (Tasks 8.1–8.5). It does not
reopen Task 7.4, start Section 9, or change any catalog, checkout, order,
payment, fulfillment, tracking, upload, storage, deployment, or authority
boundary.

## Responsive Implementation

- The real Fusion customer and operator wrappers retain `min-width: 0` and
  explicit content wrapping.
- `960px` collapses multi-column PDP, Cart, Checkout, and Order layouts where
  the available width requires it, while discovery and trust grids reduce
  density.
- `720px` stacks shell controls, forms, operator controls, and commerce
  summaries; actionable links and buttons remain bounded by their container.
- `520px` uses single-column narrow layouts, full-width critical controls,
  wrapped long identifiers/copy, and the existing 44px minimum target.
- The existing Fusion styles preserve the reference's 375px customer and
  operator intent without adding a second layout system.

## Motion Implementation

- Page entrance uses the audited `450ms ease` relationship and never owns
  data, lifecycle, or authorization state.
- Existing audited tokens remain authoritative: marquee `26s`, reveal `700ms`,
  stagger `90/180/270/360ms`, polaroid floats `7/8/9s`, hover `450ms`, button
  `180ms`, search `350ms`, FAQ `450ms`, and cart feedback `700ms`.
- Polaroid/card/control motion remains CSS-first. No Framer Motion, GSAP, or
  new animation dependency was added.
- The real application has no Batch H-specific marquee, FAQ, payment, order,
  fulfillment, tracking, or upload lifecycle animation. Those behaviors are
  not fabricated to imitate the static reference.

## Reveal Fail-Safe

The shared `.reveal` primitive is visible by default. A future observer may
opt a node into the hidden phase only with the explicit
`data-reveal-state="pending"` attribute. Reduced motion forces every reveal
state visible. Therefore script, hydration, or observer failure cannot hide
content from the user.

## Accessibility Implementation

- The shared shell retains the skip link, header/footer landmarks, active
  navigation, labelled search, cart label, and mobile menu disclosure.
- Opening the mobile menu focuses the first link; Escape closes it and restores
  focus to the menu button.
- Home/category media groups and PDP media thumbnails have explicit group
  semantics; image/video rendering retains descriptive alternatives and the
  controlled fallback label.
- Catalog filters expose `aria-pressed` and result changes use a polite live
  region. Checkout, Order, Fulfillment, Tracking, and admin feedback retain
  status/alert regions.
- Tracking operator results are a labelled polite live region; the customer
  and operator authority boundaries remain unchanged.
- Admin controls, summaries, forms, and links retain visible focus treatment,
  44px minimum targets, and long-copy wrapping.

## Touch and Reduced Motion

- `hover: none` / `pointer: coarse` rules remove hover transforms and make
  discovery card peek content visible without requiring hover.
- Reduced-motion rules stop page/card/polaroid/loading motion, remove
  nonessential transitions, disable marquee motion, restore reveal content,
  and use auto scrolling.
- No customer, operator, payment, checkout, order, fulfillment, tracking, or
  upload action requires motion to reveal a control or state.

The available in-app browser control surface does not expose a forced
`prefers-reduced-motion` or coarse-pointer emulation switch. The above behavior
was verified through the CSS/source contract tests and the default browser
keyboard/route acceptance; no unverified emulated result is claimed. This is
historical tooling context; the missing media evidence was later closed by
manual human acceptance in local Chrome DevTools, recorded below.

## Browser Evidence

The real development Worker was running at `http://localhost:3001/` because
port 3000 was already occupied. No remote provider was contacted.

### Desktop (1280px)

The following real routes rendered with a `<main>` landmark and no horizontal
overflow (`document.documentElement.scrollWidth === innerWidth` and
`document.body.scrollWidth === innerWidth`):

`/`, `/shop`, `/category/3d-figures`, `/product/couple-figure`, `/cart`,
`/checkout`, `/local-fulfillment/operator`, and `/local-tracking/operator`.

### Responsive widths

The same route set was checked at `960px`, `720px`, `520px`, and `375px`.
Every route remained within the viewport with no horizontal overflow.

### 375px customer evidence

- `/`, `/shop`, `/category/3d-figures`, and `/product/couple-figure` showed the
  fixture-backed catalog and the fixture notice.
- The product page showed the controlled marketing-media fallback and the
  real fulfillment details.
- Selecting Mini resolved `DEV-COUPLE-FIGURE-MINI` at `$69.90`; selecting
  Standard resolved `DEV-COUPLE-FIGURE-STANDARD` at `$89.90`.
- Deluxe remained visibly disabled/unavailable.
- Product and discovery routes did not show a catalog-unavailable state.

### 375px operator evidence

`/local-tracking/operator` remained within the viewport. Submitting an invalid
local reference returned the bounded unavailable message without exposing
secrets or order existence details.

### Keyboard evidence

At 375px, opening the mobile menu focused `Home`; pressing Escape closed the
menu, set `aria-expanded="false"`, and restored focus to the menu button.

### Admin limitation

`/admin/products` and `/admin/orders` remain protected. Batch H does not claim
an authorized admin session or persistence behavior. Static responsive and
focus rules were audited; unauthorized access must continue to redirect safely.

## Stateful Customer Responsive Recheck

The current local development Worker was used to create one real process-memory
paid Local Order and advance it through the approved local-only path:
`paid/succeeded` → `photo_review` → preview v1 published → customer approval →
`quality_check` → local Shipment → shipped → in transit → delivered. No remote
provider or persistent database was used.

- Order desktop (1280px): PASS. Heading, payment state, fulfillment section,
  long public reference, line facts, actions, and Tracking entry rendered with
  both document widths equal to 1280.
- Order 375px: PASS. The same paid Order, Quality Check state, preview facts,
  customer controls, and long public reference remained readable with both
  document widths equal to 375.
- Fulfillment desktop (1280px): PASS. Customer Quality Check terminal state
  and operator Quality Check projection rendered without overflow.
- Fulfillment 375px: PASS. The same customer/operator states and controls
  remained bounded without horizontal overflow.
- Tracking desktop (1280px): PASS. Shipment reference, tracking number,
  Local Demo Carrier, full timeline, and delivered terminal state rendered.
- Tracking 375px: PASS. The same shipment facts and timeline remained readable
  without horizontal overflow.

## Pointer Browser Evidence — Historical Tooling Result

- `pointer: coarse`: FALSE
- `hover: none`: FALSE
- Browser acceptance: NOT AVAILABLE

The current browser reported a normal fine-pointer/hover environment at 375px.
The available browser capabilities expose viewport control only; no coarse
pointer or hover media emulation was used or claimed.

## Reduced Motion Browser Evidence — Historical Tooling Result

- `matchMedia('(prefers-reduced-motion: reduce)')`: FALSE
- Browser emulation: NO
- Browser acceptance: NOT AVAILABLE
- Home / Shop / PDP / Cart / Tracking under forced reduced motion: NOT RUN

The current browser tooling cannot force the reduced-motion media feature. CSS
and source-contract tests still cover the implementation, but they do not
substitute for the required browser media-emulation evidence.

## Manual Chrome Media Acceptance

Evidence source: **MANUAL HUMAN CHROME ACCEPTANCE** using local Chrome
DevTools, not Codex in-app browser emulation, source regex, or CSS-only
inference.

### Reduced Motion

- `window.matchMedia('(prefers-reduced-motion: reduce)').matches`: TRUE
- Home: PASS
- Shop: PASS
- PDP: PASS
- Cart: PASS
- Tracking: PASS
- Essential content hidden: NO
- Continuous nonessential motion remains: NO

### Coarse Pointer

- `window.matchMedia('(pointer: coarse)').matches`: TRUE
- `window.matchMedia('(hover: none)').matches`: TRUE
- `window.innerWidth`: 375
- Home/Shop cards: PASS
- PDP controls: PASS
- Cart: PASS
- Checkout: PASS
- Fulfillment operator: PASS
- Tracking operator: PASS
- Hover-only essential action: NO

The previous tooling limitation was closed by this manual human acceptance in
local Chrome DevTools. Task 8.4 is therefore complete.

## Task 8.4 Conclusion

PASS — desktop, 375px, keyboard-only, touch/coarse pointer, reduced motion,
long-copy, image-fallback, and horizontal-overflow evidence are recorded.
Task 8.4 is checked and progress is 43/45.

## Regression and Scope Evidence

- Focused Fusion Batch H and adjacent Fusion regression tests: 34/34 PASS.
- Full offline test suite: 847/847 PASS.
- `npm run test:rendered`: 9/9 PASS.
- `npm run typecheck`: PASS.
- `npm run lint`: PASS with 0 errors and 1 pre-existing warning in
  `app/storefront/ProductCustomizationImageField.tsx`.
- `npm run build`: PASS.
- `npm run verify`: PASS.
- `openspec validate --all --strict`: PASS.
- `git diff --check`: PASS.
- Existing customer/operator route and rendered tests remain the verification
  surface for business states; no test uses a live provider.
- No new dependency, provider, database migration, remote Supabase operation,
  or deployment action was introduced.
- The active Fusion change remains the only planning change touched by Batch H;
  Task 7.4 and Task 9.2 remain unchecked.

## Outcome

Batch H implementation is complete. The earlier in-app browser capability gap
was closed by manual human Chrome DevTools acceptance, and the combined
evidence confirms the current shared CSS across customer and operator routes.
Tasks 8.1–8.5 are checked; Task 7.4 and Task 9.2 remain unchecked.
