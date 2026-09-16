# github-pages-frontend-preview Specification

## Purpose

Provide a public, static FigMemento frontend preview for visual, responsive, navigation, and user-flow review without changing or impersonating the server-backed application authority.

## Requirements

### Requirement: Isolated static preview artifact

The GitHub Pages preview SHALL be produced as a static frontend artifact from an isolated preview entry. The artifact MUST NOT require a server runtime and MUST NOT import, execute, or bundle API routes, server repositories, server-only environment validation, Local Order, Local Payment, Local Fulfillment, CustomerUpload server storage/receipt code, Supabase server clients, or operator authority. The main application SHALL remain a server-capable runtime and SHALL NOT be converted to static-only operation for this preview.

#### Scenario: Static artifact builds without the application server

- **WHEN** the preview build runs without a Worker, API server, Supabase, or provider credentials
- **THEN** it produces a browser-loadable static artifact or fails with a clear build error, and it never silently substitutes a server-backed implementation

#### Scenario: Preview isolation audit

- **WHEN** the preview source and generated artifact are inspected
- **THEN** no forbidden server import, API route dependency, server-only secret reader, or privileged repository dependency is present

#### Scenario: Main runtime remains server-capable

- **WHEN** the preview build configuration is added
- **THEN** the existing vinext/Vite/Cloudflare Worker configuration and server routes remain available and unchanged in behavior

### Requirement: Explicit preview fixtures and visible notice

The preview SHALL use an explicit frontend-preview fixture dataset and deterministic demo state that are not a production catalog source, server repository, or runtime fallback. Every preview surface SHALL show a clear `FRONTEND PREVIEW` notice explaining that it is for UI and user-flow demonstration only and that server-backed upload, checkout, payment, fulfillment, and tracking are inactive.

#### Scenario: Preview fixture source is explicit

- **WHEN** the static artifact is built or opened
- **THEN** its catalog and demo data come only from the preview boundary and no failure of Supabase or another source activates preview fixtures in the main application

#### Scenario: Stakeholder sees the boundary

- **WHEN** a stakeholder opens the homepage or any preview route
- **THEN** the frontend-preview notice is visible without requiring technical knowledge or a hidden interaction

#### Scenario: Tracking remains unimplemented

- **WHEN** a stakeholder opens the fulfillment or navigation area
- **THEN** tracking is omitted or explicitly labeled as not implemented in the current local development stage, with no fake carrier, tracking number, or shipment lifecycle

### Requirement: Core storefront presentation and navigation

The preview SHALL present the current FigMemento visual system and safe static content for Homepage, Shop/catalog, Category, Product Detail, Product imagery, Variant/SKU selection, customization appearance, Cart, Checkout, Order Success, Payment UX, and Fulfillment Preview UX. Navigation SHALL allow a stakeholder to move among these surfaces without a server request or a production authority claim.

#### Scenario: Storefront surfaces are viewable

- **WHEN** a stakeholder opens the preview and follows its navigation
- **THEN** Homepage, Shop, Category, Product Detail, customization, Cart, Checkout, Order Success, Payment, and Fulfillment preview surfaces render from the static artifact

#### Scenario: Existing visual system is preserved

- **WHEN** the preview surfaces render
- **THEN** they reuse the approved FigMemento typography, tokens, spacing, controls, media treatment, and product presentation rather than introducing an unrelated visual design authority

#### Scenario: Variant selection is presentation-only

- **WHEN** a stakeholder selects different preview SKU options
- **THEN** the displayed SKU, availability, and display price update deterministically for the demo, with copy that makes clear the values are presentation data and not server-authoritative pricing

### Requirement: Deterministic client-only demo interactions

The preview MAY provide client-only interactions for variant selection, customization text entry, browser-local image selection and preview, Cart add/quantity/remove/clear, Checkout form entry, local shipping/coupon visualization, Payment success/failed/cancelled states, Order Success presentation, and Fulfillment Preview transitions. These interactions MUST remain in-memory presentation state and MUST NOT create or claim an AcceptedCheckout, Order, Payment, receipt, capability, fulfillmentActionId, operator authorization, or persisted server record.

#### Scenario: Image selection remains browser-local

- **WHEN** a stakeholder selects an image in the customization preview
- **THEN** the browser may show a local preview and the UI states that the file was not uploaded; no API, storage provider, opaque receipt, or upload success is created

#### Scenario: Cart and Checkout are demo state

- **WHEN** a stakeholder adds a configured item, changes quantity, or fills the Checkout form
- **THEN** the preview updates only client-side display state and does not call Cart, Checkout Readiness, Local Order, or payment APIs or claim server validation

#### Scenario: Payment and Order Success are clearly simulated

- **WHEN** a stakeholder chooses a Payment demo outcome
- **THEN** the preview shows a labeled demo state and Order Success presentation without creating a real Payment attempt, Order reference, browser capability, or payment authorization

#### Scenario: Fulfillment states are visual only

- **WHEN** a stakeholder steps through Photo Review, preview versions, revision, approval, production, or quality-check controls
- **THEN** the preview changes only deterministic client state and never claims canonical aggregate commit, customer capability authorization, operator authorization, or production work

### Requirement: Repository-subpath-safe routing and assets

The preview SHALL operate when hosted below a repository subpath such as `/<repo-name>/`. All CSS, JavaScript, images, icons, fonts, and internal navigation references MUST resolve under the configured base path without assuming `/` or `localhost`. Deep-link navigation SHALL use a static-host-safe strategy, including a hash route or equivalent that survives direct refresh without requiring a server rewrite.

#### Scenario: Subpath artifact loads

- **WHEN** the artifact is served at a configured repository subpath
- **THEN** the entry document, CSS, JS chunks, public assets, favicon, and local fonts resolve successfully under that subpath

#### Scenario: Deep link refresh is safe

- **WHEN** a stakeholder refreshes a Product, Cart, Checkout, Order Success, Payment, or Fulfillment preview route on a static host
- **THEN** the preview returns to the same client route without a server-side rewrite or a 404 dependency

#### Scenario: Missing media is bounded

- **WHEN** a local preview asset is missing or fails to render
- **THEN** the existing controlled public-media fallback is shown and no remote private, signed, localhost, or provider URL is introduced

### Requirement: Public artifact security and authority firewall

The public Pages artifact MUST require no secret, API key, cookie, owner capability, operator token, Supabase service role, payment credential, storage credential, or provider environment value. It MUST make no production API call and MUST NOT expose private customer content, private upload locators, server diagnostics, or authority-bearing identifiers. Preview copy MUST distinguish demo status from real paid, uploaded, ordered, shipped, or fulfilled status.

#### Scenario: Secret-free build

- **WHEN** the preview source, build configuration, and generated artifact are scanned
- **THEN** no secret value or secret-bearing environment variable is committed or embedded, and the build succeeds with no provider credentials

#### Scenario: Network-free preview

- **WHEN** the preview is opened with the application server and external providers unavailable
- **THEN** the visible preview remains usable from static assets and no request is made to Supabase, API routes, storage, Stripe, PayPal, Resend, 17TRACK, or Cloudflare runtime services

#### Scenario: Operator preview is not authentication

- **WHEN** the stakeholder opens the operator visual preview
- **THEN** it is labeled `UI PREVIEW ONLY` and contains no browser authentication, operator secret, authorization token, or server mutation path

### Requirement: Manual GitHub Pages delivery boundary

The change SHALL define a custom GitHub Actions Pages workflow that builds and uploads only the static preview artifact, uses a manual `workflow_dispatch` trigger for the initial preview, and grants only the Pages deployment permissions required by the workflow. Repository Pages settings, repository visibility, the default Pages URL, and any custom domain remain human/deployment prerequisites and MUST NOT be changed by the application implementation.

#### Scenario: Manual preview deployment

- **WHEN** an authorized maintainer manually dispatches the workflow after configuring Pages to use GitHub Actions
- **THEN** the workflow builds the subpath-safe static artifact, uploads that artifact, and deploys only the frontend preview

#### Scenario: No automatic production implication

- **WHEN** the repository receives an ordinary development commit
- **THEN** the initial preview workflow does not silently deploy or claim a production release, and the main server runtime remains unaffected

#### Scenario: Minimal workflow permissions

- **WHEN** the workflow file is audited
- **THEN** it grants repository read access plus the minimum Pages artifact/deployment permissions and does not request contents write, releases, issues, provider secrets, or deployment credentials unrelated to Pages

### Requirement: Static artifact and browser acceptance verification

The preview SHALL be verified as a generated static artifact served through a local static HTTP server under a repository-like subpath. Verification MUST include source/artifact isolation, asset-path and navigation checks, no-secret/no-server-call checks, desktop rendering, 375px rendering, and deterministic interactions for catalog, customization, image preview, Cart, Checkout, Order Success, Payment, and Fulfillment presentation.

#### Scenario: Static-host smoke test

- **WHEN** the generated artifact is served by a local static server at a repository subpath
- **THEN** the homepage and every required demo route load without a server API or provider dependency

#### Scenario: Responsive acceptance

- **WHEN** the preview is opened at desktop width and 375px mobile width
- **THEN** the required surfaces have no critical horizontal overflow or blocking overlap, and primary navigation and CTAs remain usable

#### Scenario: Offline interaction acceptance

- **WHEN** the deterministic preview acceptance suite runs with network access disabled
- **THEN** variant, customization, local image preview, Cart, Checkout, Payment, Order Success, and Fulfillment demo interactions produce their bounded visual states without creating server authority
