## 1. Baseline and Decision Gates

- [x] 1.1 Record the current `npm run lint`, strict TypeScript typecheck, offline-test, and production-build results, including each failure's owning module, without weakening any verification setting.
- [x] 1.2 Inventory every D1-, Drizzle-, Cloudflare-binding-, starter-example-, and generated-support path; record active imports, package scripts, dependencies, deployment bindings, and build participation as evidence for its classification.
- [x] 1.3 Reconcile the inventory with the approved D1/Drizzle classification in `design.md`; preserve verified runtime support, retain uncertain files, and apply no isolation action until the import, package-script, binding, and production-build evidence confirms it is safe.
- [x] 1.4 Record the approved Supabase CLI-style migration-management policy as the canonical future workflow without creating or applying a business migration in C0.
- [x] 1.5 Create a visible deferred-assumptions record for known out-of-scope prototype behavior, including customized-line aggregation, multi-image persistence, dynamic option pricing, client-reported payment success, production preview, future storage-provider selection, and the Stripe webhook's missing expected amount/currency verification; assign the payment-verification gap to the later `integrate-stripe-and-paypal-payments` change.

## 2. Shared Domain and Configuration Boundaries

- [x] 2.1 Add provider-neutral shared contracts for the existing Product and Cart payloads, then replace incompatible duplicate boundary types without introducing the future Product/SKU model or new cart behavior.
- [x] 2.2 Add provider-neutral shared contracts for the existing Customization and Upload payloads, including explicit runtime narrowing for external request data, without adding crop or multi-image behavior.
- [x] 2.3 Add provider-neutral shared contracts for the existing Order and Payment payloads, keeping Supabase and Stripe response shapes inside their adapters and excluding future providers or workflow states.
- [x] 2.4 Add allowlisted browser-safe configuration parsing and server-only configuration parsing that reports missing key names without exposing values.
- [x] 2.5 Add integration-scoped runtime validation for existing Supabase, Stripe, webhook, and admin secrets so Cloudflare runtime injection remains compatible with production builds.
- [x] 2.6 Add configuration tests proving browser code cannot access server secrets, missing values fail clearly at use time, and tests can supply explicit configuration objects without reading a developer's `.env.local`.

## 3. Authoritative Product Source and Fixture Isolation

- [x] 3.1 Introduce a provider-neutral repository boundary for the current product reads and map Supabase rows into the shared Product contract.
- [x] 3.2 Move the existing hardcoded development records into a clearly named deterministic fixture repository outside the production catalog path.
- [x] 3.3 Add server-controlled source selection that defaults production to Supabase, permits fixtures only through explicit non-production configuration, and rejects fixture selection in production.
- [x] 3.4 Replace silent catalog fallback with a typed unavailable/configuration result and an explicit storefront unavailable state while preserving all other confirmed storefront behavior.
- [x] 3.5 Add offline tests for successful Supabase mapping, failed or missing Supabase configuration, explicit fixture use in development/test, and rejected fixture use in production.

## 4. Route Testability and TypeScript Repairs

- [x] 4.1 Extract injectable boundaries from existing critical server routes only where required to substitute repositories, storage, clocks/IDs, or network integrations during offline tests.
- [x] 4.2 Add characterization tests for existing server-authoritative base pricing and coupon revalidation without asserting dynamic pricing or shipping behavior that belongs to later changes.
- [x] 4.3 Add characterization tests for upload rejection and authorization boundaries using fakes, without selecting a final object-storage provider or adding new upload capabilities.
- [x] 4.4 Add characterization tests for the existing Stripe webhook signature-rejection and duplicate-event/replay behavior where practical, without adding new payment validation behavior. Record missing expected amount/currency verification as deferred work for the later `integrate-stripe-and-paypal-payments` change.
- [x] 4.5 Add characterization tests for minimized guest order lookup responses, cross-order access rejection where currently supported, and admin authorization rejection without adding customer authentication or new admin features.
- [x] 4.6 Fix the current storefront photo metadata and React/DOM event typing errors at their source without broad `any`, `@ts-ignore`, or behavior changes.
- [x] 4.7 Fix the current admin result-shape, upload cleanup, order metadata narrowing, and other remaining application TypeScript errors without suppressing compiler coverage.

## 5. Approved D1/Drizzle Isolation

- [x] 5.1 Apply only the user-approved isolation action to paths confirmed as unused template residue, preserving all runtime-required vinext, Vite, Worker, Sites, and Cloudflare deployment support.
- [x] 5.2 Update package scripts, dependencies, TypeScript coverage, and deployment metadata so inactive D1/Drizzle tooling cannot appear to be PhotoGift's business persistence path.
- [x] 5.3 Retain `examples/d1/` as an explicitly excluded example, document that it is not part of PhotoGift's business architecture, and verify it is excluded from product compilation and verification.
- [x] 5.4 Run strict typecheck and a production build immediately after isolation and revise the classification instead of suppressing errors if runtime participation differs from the inventory.

## 6. Migration and Operational Documentation

- [x] 6.1 Document the approved ordered Supabase migration workflow, deployment ordering, RLS/index/grant verification, and rollback or forward-fix expectations without creating or applying a business migration.
- [x] 6.2 Mark the current flat Supabase SQL files as legacy bootstrap inputs and document how the first later schema-bearing change must reconcile the applied baseline before adding a delta.
- [x] 6.3 Replace obsolete starter README content with the actual Next.js-compatible App Router, vinext, Cloudflare Worker, Supabase persistence, Stripe, explicit fixture, and verification architecture.
- [x] 6.4 Document environment-variable categories, local setup, fixture opt-in, runtime-secret behavior, deployment assumptions, and the intentionally unresolved Supabase Storage versus Cloudflare R2 decision.
- [x] 6.5 Update example environment configuration with names and non-secret placeholders only, and verify local secret files remain ignored.

## 7. Reliable Verification Gates

- [x] 7.1 Provide distinct package scripts for lint, strict TypeScript typecheck, offline automated tests, and production build, plus a documented aggregate verification command.
- [x] 7.2 Ensure the offline-test gate runs with no live Supabase, Stripe, PayPal, Resend, 17TRACK, or other third-party API dependency and fails when a covered assertion fails.
- [x] 7.3 Run `npm run lint` and resolve every reported foundation-scope failure without disabling rules.
- [x] 7.4 Run the documented strict TypeScript typecheck and resolve every reported error without weakening strictness or excluding active application code.
- [x] 7.5 Run the documented offline automated-test command and verify all foundational and practical critical-route tests pass without real credentials.
- [x] 7.6 Run `npm run build` for the production target and verify the active vinext/Cloudflare runtime still builds successfully.
- [x] 7.7 Run the aggregate verification command from a clean checkout configuration and confirm each underlying gate remains independently attributable.

## 8. Completion Audit

- [x] 8.1 Verify by automated test and production configuration review that no production product read can depend on or silently fall back to the hardcoded fixture catalog.
- [x] 8.2 Scan tracked source, configuration examples, tests, and planning artifacts for committed secrets and replace any discovered value with a non-secret placeholder before completion.
- [x] 8.3 Review the implementation diff against `独立站构建项目需求.md`, `proposal.md`, and the engineering-foundation spec; confirm no confirmed business rule changed and no out-of-scope feature or business migration was introduced.
- [x] 8.4 Record final verification evidence and remaining deferred prototype assumptions so the next OpenSpec change does not silently depend on them.
