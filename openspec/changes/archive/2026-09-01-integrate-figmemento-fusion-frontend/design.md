## Context

The complete visual reference is `docs/design-reference/figmemento-fusion-design-v2.html`.
It is a single static warm-editorial prototype with a paper background, cream
and white paper surfaces, terracotta/copper/gold accents, dark ink, serif
headlines, sans-serif body copy, handwritten annotations, polaroid/media
frames, tape/pin/sticker motifs, newspaper rules, restrained shadows, and
small narrative motion. Its responsive intent is expressed around 960px,
720px, and 520px, with an explicit reduced-motion mode and touch behavior.

The reference is not the application's data source. It contains static demo
facts such as example prices, ratings, shipping promises, delivery/production
claims, country counts, discount claims, newsletter claims, payment marks, and
preview promises. Those facts must remain excluded from business and SEO
authority.

The current application is a Next.js-compatible App Router application using
React, TypeScript, vinext, Vite, Cloudflare-compatible configuration, and CSS
modules. It already has real server-backed or explicitly local boundaries:

| Reference concern | Current application boundary | Integration rule |
| --- | --- | --- |
| Shared header/footer | `app/storefront/CatalogShell.tsx` | Restyle the real shell; retain skip link, routes, cart/account state, and notices. |
| Home | `/`, `app/page.tsx` | Use the real catalog and existing home composition. |
| Shop | `/shop`, `CatalogBrowser.tsx` | Keep real search/filter/result behavior. |
| Collections | `/category/[slug]` | Map to existing single-level categories; do not create nested reference sections. |
| Product/PDP | `/product/[slug]`, `ProductDetailExperience.tsx` | Preserve SKU, asset, fulfillment, customization, and add-to-cart authority. |
| Cart | `/cart`, `CartExperience.tsx` | Preserve real line-item, quantity, remove, clear, and empty behavior. |
| Checkout | `/checkout`, `LocalCheckoutExperience.tsx` | Preserve local evaluation, tax-not-activated, shipping fixture, and non-payment semantics. |
| Order | `/order/success/[reference]` and order APIs | Preserve read/creation authority and immutable facts. |
| Fulfillment/tracking | customer and operator routes/components | Preserve action authority, lifecycle, replay, and terminal behavior. |
| Admin/operator | `/admin/*`, `/local-fulfillment/operator`, `/local-tracking/operator` | Apply shared presentation only; retain separate authorization and controls. |
| Reference Journal/About/Contact | No corresponding current public route | Do not add fake navigation or copy these pages into the application as a side effect. |
| Reference language switch | No approved full application i18n contract in this change | Defer functional language expansion; visual copy must not imply a completed i18n system. |

The existing visual-system-foundation canonical spec is the baseline. This
change supplies an integration capability on top of it rather than modifying
that canonical contract or rewriting the current application architecture.

## Goals / Non-Goals

**Goals:**

- Translate the reference's visual grammar into reusable, accessible, CSS-first
  primitives that can be shared by real customer, admin, and operator surfaces.
- Make the complete real journey visually coherent from home through catalog,
  customization, cart, Local Checkout, order, fulfillment, and tracking.
- Preserve real data and state authority while improving hierarchy, content
  framing, responsive composition, loading/error/empty states, and interaction
  feedback.
- Verify desktop and 375px layouts, keyboard use, touch behavior, reduced
  motion, public media fallbacks, and the most important state transitions.

**Non-Goals:**

- No new Product/SKU, CustomizationField, cart, checkout, order, payment,
  fulfillment, tracking, auth, upload, shipping, tax, or SEO business rules.
- No production preview, digital checkout/delivery, provider integration,
  storage-provider decision, database migration, remote Supabase operation,
  DNS/Cloudflare change, or deployment.
- No static reference data migration, reference-only page creation, or
  demo-only storefront.
- No dependency major upgrade or replacement of vinext, React, the App Router,
  the current test harness, or the current source-selection architecture.

## Decisions

### 1. Extend the existing token authority instead of replacing it

The implementation will map the reference tokens into the existing global and
catalog style layers, retaining compatibility aliases where current business
surfaces depend on them. The reference values are the target visual
relationship, while the existing visual-system-foundation contract remains the
canonical guardrail. A new parallel theme framework was rejected because it
would create competing token authorities and make admin/customer state drift
more likely.

The planned token groups are:

- surface: paper background, cream, card, dark ink, muted ink, border/rule;
- accent: terracotta, deep terracotta, copper, gold, honey, pin/red;
- typography: `--serif` = Playfair Display/Noto Serif SC/serif,
  `--hand` = Lato/Noto Sans SC/PingFang SC/sans-serif, `--ital` =
  Lato/Noto Sans SC/PingFang SC/sans-serif, and `--body` =
  Lato/Noto Sans SC/PingFang SC/Microsoft YaHei/sans-serif;
- layout: content padding, editorial columns, card gaps, control minimum target
  size, radii, and breakpoint values;
- depth/motion: card/lift shadows, focus ring, short control transitions,
  reveal/stagger timing, and reduced-motion overrides.

The implementation must avoid embedding server-only configuration or business
data in CSS or client bundles.

The reference HTML loads Caveat through Google Fonts, but Caveat is not an
active core typography token: none of `--hand`, `--ital`, or `--body` uses it.
The complete reference audit found no separate active Caveat selector that
would justify enabling it in the application. Caveat MUST NOT be activated
merely because it is available; any future local use would require a directly
audited reference selector and an explicit implementation record.

### 2. Build on current component boundaries

`CatalogShell`, `CatalogBrowser`, `ProductDetailExperience`,
`ProductAssetGallery`, `VariantSelector`, customization components,
`CartExperience`, `LocalCheckoutExperience`, order-success, fulfillment,
tracking, admin, and operator components remain the behavior owners. Visual
primitives and class/module changes may be introduced around them, but a
component may not reimplement catalog resolution, price derivation, upload
ownership, checkout evaluation, order/payment state, or lifecycle authority.

For repeated presentation patterns, prefer small shared primitives or
well-scoped CSS classes for editorial heading, eyebrow, paper card, media frame,
status block, action row, timeline, and responsive grid. A large UI library or
animation library was rejected because it would add dependency and styling
authority without solving the current integration problem.

### 3. Use real route mapping, not a static page transplant

The reference's ten static page sections are used to extract visual patterns,
not copied as a new single-page router. The application will map them to the
real route graph described in Context. Existing `/faq`, `/privacy`,
`/shipping-returns`, and `/terms` remain the information/legal destinations;
reference Journal/About/Contact content is not linked until real routes and
content authority are separately approved.

The header's search remains the current real product search/filter behavior.
Cart quantity remains derived from the actual cart. Account and tracking links
remain real routes. A language selector, if later added, must be a separately
approved application capability rather than an untranslated copy of the
reference's localStorage demo.

### 4. Treat media as presentation input with safe fallbacks

ProductAsset rendering will consume the current provider-neutral public
reference contract. When media is missing or cannot load, the existing
controlled fallback will receive the Fusion framing and accessible label.
Customer-private uploads, production previews, and digital-delivery files will
continue through their existing boundaries and will not be converted into
public marketing media. The final Supabase Storage versus Cloudflare R2
decision remains outside this change.

### 5. Preserve authority through visual composition

Visual copy and labels will be derived from the current server/application
result wherever a value affects purchase, order, payment, fulfillment, or
tracking meaning. Static reference claims are allowed only as clearly
non-authoritative decorative/editorial copy, and must not be placed beside a
control in a way that could be interpreted as an applicable rule. Existing
fixture notices and unavailable states remain visible when appropriate.

### 6. Reproduce reference motion with explicit fidelity exceptions

The reference HTML is the visual and interaction source of truth for the
motion primitives that are actually used on a corresponding real application
surface. Implementation should preserve each primitive's timing, easing,
transform, and sequencing relationship within the existing CSS-first and
React-compatible architecture. A difference is allowed only when required by
accessibility, reduced-motion preferences, a real application interaction
model, or the current runtime boundary; every such difference must be recorded
with its concrete reason. “Similar motion” or visual proximity alone is not a
parity justification.

#### Reference motion fidelity matrix

| Primitive | Reference behavior | Integration rule |
| --- | --- | --- |
| Marquee | `fmar`, 26s, linear, infinite; `translateX(0)` to `translateX(-50%)`; pauses on hover | Match duration/easing/translation where a real announcement surface uses it; do not use reference-only claims as content. |
| Page entrance | `pgin`, .45s ease; opacity 0 to 1; `translateY(14px)` to none | Preserve the relationship without delaying route content. |
| Scroll reveal | .7s opacity ease plus .7s `cubic-bezier(.22,.8,.36,1)`; `translateY(26px)` to none | Preserve reveal relationship; IntersectionObserver or an existing equivalent may replace the reference implementation. |
| Stagger | `.09s`, `.18s`, `.27s`, `.36s` transition delays | Preserve the ordered rhythm where multiple real items are revealed. |
| Polaroid float | `fl1` 7s, `fl2` 8s, `fl3` 9s; ease-in-out; margin-top 0 to -7px/-9px/-5px | Preserve relative duration and movement; use only for decorative media that does not hide meaning. |
| Polaroid hover | .45s `cubic-bezier(.34,1.4,.64,1)`; rotation to 0, lift -8px, scale 1.03; lift shadow | Preserve the lift/straighten relationship on pointer-capable devices; touch must not depend on it. |
| Pin/sticker | Pin hover .3s to rotate/scale; sticker `tw` 4s ease-in-out, opacity .75 to 1, rotate -6deg to 6deg, scale 1 to 1.12 | Keep decorative motion bounded and nonessential; no hover-only information. |
| Button hover/press | .18s ease; hover translate (1px,1px); active translate (3px,4px); shadow reduces | Preserve immediate press feedback while keeping focus and disabled states explicit. |
| Search expansion | width 216px to 280px on focus-within over .35s ease; focus tape/border changes | Apply only to the real search control and keep the field usable at narrow widths. |
| FAQ accordion | answer max-height .45s ease; plus rotation .35s to 45deg | Preserve disclosure state and ARIA behavior; content must remain available without animation. |
| Count-up | 1200ms cubic ease-out `1-(1-p)^3`; reduced motion jumps to final value | Use only for authoritative values if present; never animate reference-only commerce claims. |
| Cart feedback | 900ms delayed Web Animations API wiggle, 700ms ease-in-out: rotate 0 → -10deg/scale 1.12 → 6deg → 0 | Apply only to the real cart indicator when a corresponding real state change exists; it must not imply a static quantity. |
| Other control/card motion | Reference uses .2–.35s hover/focus color, transform, shadow, and background transitions, with card lift generally -5px to -7px | Preserve the relationship per real component while respecting touch and reduced-motion rules. |

The reference's reduced-motion rule disables nonessential animation/transition
and smooth scrolling, forces reveal content visible, and disables marquee
animation. The implementation will retain that behavior. The reference's touch
rule makes card peek content visible and disables hover transforms; the real
application will keep essential meaning visible without hover. No large
animation dependency or native-HTML demo router will be introduced.

### 7. Verification is route- and state-oriented

Focused tests will assert stable class/token/accessibility contracts and
rendered output for real routes. Browser acceptance will use the development
runtime and controlled fixtures where applicable, without promoting fixtures or
reference numbers into production. The final gates use the repository's
existing `npm run typecheck`, `npm run lint`, `npm run build`, `npm run
test:offline`, `npm run test:rendered`, and `openspec validate --all --strict`
commands as applicable.

## Risks / Trade-offs

- [Visual regression in existing business flows] → Integrate one surface batch
  at a time, retain the current component boundaries, and run route-specific
  rendered checks after each batch.
- [Reference static claims accidentally become user-facing promises] → Keep a
  written authority firewall in the spec, use real server-derived values in
  commerce-adjacent UI, and add source/claim audit tests.
- [CSS cascade conflicts with existing pages] → Preserve current module
  boundaries, use explicit Fusion namespaces/tokens, and audit computed or
  rendered states rather than relying on selector order alone.
- [External font loading changes layout or is unavailable] → Use declared
  fallbacks, test long copy and 375px rendering, and do not make layout
  correctness depend on a remote font response.
- [Decorative elements reduce accessibility or hit targets] → Keep semantic
  HTML, visible focus, labels, live status, minimum touch targets, and reduced
  motion as acceptance criteria.
- [Current dirty worktree obscures unrelated changes] → Restrict implementation
  edits to the approved visual surface files, review changed paths before each
  batch, and never edit the two active deferred changes.
- [Admin/operator styling is mistaken for new workflow work] → Permit only
  presentation changes and explicitly regression-test authorization and action
  boundaries.

## Migration Plan

There is no database or runtime migration for this change. Implementation is a
reversible presentation rollout:

1. Record the current route/component and visual token baseline.
2. Apply the shared token/foundation layer and verify it independently.
3. Integrate shell, home/catalog, PDP/customization, cart/checkout, and
   order/fulfillment/tracking in dependency order, with focused checks after
   each batch.
4. Add responsive, accessibility, reduced-motion, and final browser acceptance
   coverage.
5. If a batch causes a regression, revert that batch's presentation changes
   without changing business data, API contracts, migrations, or canonical
   upstream specs.

No deployment, DNS, Cloudflare, Supabase, storage, payment-provider, or
production configuration action is authorized by this plan.

## Open Questions

- The exact final font-loading mechanism can be selected during implementation
  as long as it keeps the declared fallback behavior, does not expose
  server-only configuration, and does not add an unnecessary dependency.
- The exact division between shared CSS classes and small React presentation
  primitives can be selected per surface after the current component markup is
  inspected; it must not move business authority into client presentation.
