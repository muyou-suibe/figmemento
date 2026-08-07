## Why

PhotoGift already contains an early MVP prototype, but the repository does not currently provide a trustworthy base for the remaining MVP work: strict TypeScript checking fails, production product reads can silently fall back to a hardcoded catalog, active Supabase persistence is mixed with unused D1/Drizzle starter paths, and critical domain contracts and verification coverage are fragmented. This foundation change is needed now so later Product/SKU, authentication, checkout, payment, preview, and fulfillment changes do not inherit or amplify those uncertainties.

## What Changes

- Restore reliable lint, strict TypeScript typecheck, automated-test, and production-build verification gates without weakening compiler or test settings.
- Make Supabase PostgreSQL the single authoritative MVP business database while preserving the existing Next.js-compatible, vinext, and Cloudflare runtime.
- Inventory D1, Drizzle, Cloudflare binding, starter-example, and generated-support files; classify each as runtime-required, unused template residue, or intentionally retained for a documented future use before isolating any unused path.
- Replace silent production use of the hardcoded product catalog with an explicit source policy: production reads use Supabase, while development and tests may opt into separate, clearly named fixtures.
- Introduce shared domain contracts and module boundaries for the existing Product, Cart, Customization, Upload, Order, and Payment concepts without adding future Product/SKU behavior.
- Centralize environment-variable parsing and validation, preserve server/browser secret boundaries, and make missing required production configuration fail clearly.
- Establish offline automated tests for foundational source selection, configuration boundaries, domain contracts, and existing critical server-route behavior where practical.
- Define and document the migration-management approach to be used by later Supabase business-schema changes; this change creates no future Product/SKU business migration.
- Replace obsolete starter documentation with an accurate description of the current architecture, setup, verification commands, persistence boundaries, and fixture policy.
- Preserve confirmed PhotoGift business behavior except for removing unsafe or misleading silent fallback behavior in production.

### Non-scope

- No new Product/SKU schema, configurable catalog, customization engine, crop or multi-image functionality.
- No customer authentication, Google OAuth, new cart behavior, shipping engine, PayPal, Stripe feature expansion (including adding missing webhook expected amount/currency verification), production preview, Resend, 17TRACK, analytics, loyalty, referrals, or new admin business features.
- No replacement of the current runtime or infrastructure and no decision on the final Supabase Storage versus Cloudflare R2 provider.
- No deletion of D1/Drizzle files before the design classification is verified during implementation.
- No change to confirmed business rules in `独立站构建项目需求.md`.

## Capabilities

### New Capabilities

- `engineering-foundation`: Defines the reliable verification gates, authoritative production data-source policy, explicit fixture isolation, shared domain/configuration boundaries, infrastructure-remnant classification, migration-management contract, secret hygiene, and architecture documentation required before further MVP development.

### Modified Capabilities

None. No main OpenSpec capability specs exist yet, and this change does not revise confirmed PhotoGift product behavior.

## Impact

- **Affected application areas:** TypeScript configuration and types, current product-loading path, domain-facing modules used by storefront and server routes, environment/configuration helpers, tests, package scripts, and repository documentation.
- **Affected infrastructure descriptions:** Supabase PostgreSQL, Supabase-backed current business persistence, vinext/Cloudflare runtime, and the presently unused or ambiguous D1/Drizzle starter files and bindings.
- **Externally observable behavior:** Production will no longer mask unavailable or misconfigured Supabase product data by silently presenting hardcoded products. Development and test fixtures remain available only through an explicit non-production mechanism.
- **Dependencies:** This is the first foundation change. Later catalog, auth, upload, cart/pricing, checkout, payment, preview, fulfillment, and admin changes depend on its verified baseline and documented migration contract.
- **Risks:** Tightening source and configuration behavior may expose environments that previously appeared healthy because fallback data hid failures; module extraction may accidentally alter prototype behavior unless covered by characterization tests; D1/Drizzle isolation may break build support if classification is incorrect; production-build verification may reveal additional vinext/Cloudflare compatibility defects.
