## Why

PhotoGift can resolve a Product and Variant/SKU, but it does not yet provide a trustworthy customer customization workflow: the product page has no customization form, the current upload route exposes storage details, and the broad prototype JSON contract is not driven by validated Product-specific field definitions. This change is needed now so shoppers can prepare private customization input without collapsing customer content into SKU identity or waiting for the blocked C1 catalog backfill decisions.

## Current Problem

- `app/domain/customization.ts` accepts a broad compatibility shape, but it has no stable field identity, Product ownership, required-field rules, ordering, bounded text validation, or authoritative Product configuration.
- `/product/[slug]` renders catalog media, fulfillment information, and the Variant selector, but has no customer customization, upload, draft, summary, or add-to-cart/order-boundary UI.
- `/api/uploads` validates MIME type and size and writes to a private Supabase Storage bucket, but returns the bucket and storage key to the browser and has no server-enforced guest draft ownership record.
- `/api/orders` requires a `drafts/...` path, validates some photo metadata and notes, writes broad JSON to `order_items.customization`, and creates `order_uploads` rows. These are active prototype behaviors, not a complete field-driven workflow.
- The existing `products.customization_schema` JSONB column is legacy, unparsed by the application, and insufficient as an authoritative field model. `order_items.customization` and `order_uploads` can be reused in part, but they do not provide pre-order upload ownership or robust field/multi-image association.

## Goals

- Introduce a minimal provider-neutral `CustomizationField` model with stable Product-owned identity, code, label, `image | short_text | long_text` kind, required state, position, and bounded kind-specific validation constraints.
- Add a local-first customization draft that composes one Product, one resolved Variant/SKU with its selected Variant Options, and structurally separate customer customization values.
- Support private JPEG, PNG, and WebP selection, client preflight, server validation, metadata capture, customer-input preview, replacement/removal, bounded multi-image ordering where configured, non-destructive crop data where explicitly enabled, and actionable quality warnings based on configured dimensions.
- Replace browser-authoritative storage paths with an opaque, server-authorized upload receipt and a provider-neutral `CustomerUploadRepository` boundary.
- Render Product-specific customization requirements on the Product detail experience and produce a normalized handoff payload for the later cart/order-line workflow and the existing order boundary.
- Keep all domain validation and provider boundaries testable offline with deterministic fakes.

## Non-Goals

- No arbitrary conditional-rule engine, customization pricing or surcharge formulas, promotions, shipping pricing, supplier instructions, production routing, exact inventory, or AI prompt workflow.
- No background removal, AI enhancement, face detection, automated moderation, or production rendering.
- No production mockup, rendered/3D/AI finished-product preview, production-preview approval workflow, or reuse of customer-input preview as a production preview.
- No complete cart-line identity, hashing, customization fingerprint, merge algorithm, generalized cart persistence, or redesign of differently customized line handling.
- No rewrite of order snapshot persistence, C1 Task 7.4, Stripe, PayPal, coupons, payment state, shipping, or fulfillment workflow.
- No final selection of Supabase Storage or Cloudflare R2, production bucket creation, provider configuration, production upload, deployment, DNS, or Cloudflare change.
- No production Product-specific field values inferred from development fixtures, legacy seed JSON, or examples.

## User-Visible Outcome

A shopper can select an eligible SKU, complete the Product's configured text and image requirements, see accessible previews of their selected input, replace/remove/reorder images when allowed, understand validation or stale-upload failures, review a customization summary, and submit a normalized configured item to the cart/order boundary. The UI clearly distinguishes this customer-input preview from any future production preview.

## Technical Scope

- Provider-neutral customization field, value, image metadata/crop, draft, validation, upload receipt, and configured-item handoff contracts.
- Authoritative Product-specific field reads and validation, plus the minimum authorized catalog-management boundary needed to configure fields without hardcoding production Product rules.
- A server-only upload service boundary that validates content, creates/uses an opaque guest draft owner, stores only provider-private references server-side, and returns no bucket or object key.
- Client-side local draft state and customer-input previews; explicit server upload is the only remote draft operation, so text edits and Variant changes do not write the database on every change.
- Backward-compatible normalization at the existing customization/order request sibling boundary without making customization part of Variant identity or base pricing.
- Offline repository, route, validation, security, and UI tests using in-memory/deterministic adapters rather than live providers.

## Security and Privacy Scope

Customer media is private customer content and is never a ProductAsset. Private access is server-authorized through opaque upload identity and draft ownership; browser payloads cannot choose storage paths, and permanent public URLs are prohibited. Customer uploads must not enter public fixtures, catalog responses, sitemap output, logs, or error details. Authorized temporary access, expiry, attachment, replacement, removal, and orphan cleanup are provider-neutral lifecycle concerns.

## Dependencies and Interaction with C1

- Depends on the completed engineering foundation and the C1 domain boundary that Variant Options define SKU identity while Customization remains a sibling domain.
- Uses existing C1 Product and Variant identities and authoritative Variant base pricing, but does not change C1 pricing, catalog publication, fulfillment, ProductAsset, or lifecycle semantics.
- C1 Tasks 3.5–3.8 and 7.4 are currently blocked by business Product weight/lead-time decisions. This customization change does not depend on those decisions and MUST NOT modify, bypass, complete, or resume those tasks.
- The customization handoff intentionally emits enough normalized information for a later cart/order change to distinguish Photo A from Photo B on the same SKU, but that later change owns actual cart-line identity and merge behavior.
- The existing `order_items.customization` JSONB and `order_uploads` relation are partial reuse points. Any additive schema required for field configuration, pre-order upload ownership, or field/upload association requires a separately approved migration scope before implementation and must preserve historical orders.

## Deferred Work

- Complete cart persistence and customized line identity.
- Customization surcharges and all other dynamic pricing formulas.
- Production-preview generation, versioning, approval, and revision workflow.
- Automated image/content analysis beyond deterministic metadata-based warnings.
- Final Supabase Storage versus Cloudflare R2 selection and production provider configuration.
- Advanced field dependencies, arbitrary conditional display, additional field kinds, supplier/manufacturing instructions, and production routing.
- Production Product-specific customization configuration until approved business data is supplied.

## Capabilities

### New Capabilities

- `product-customization-workflow`: Defines Product-owned customization fields, local draft behavior, Product detail UX, Variant/Customization composition, normalized configured-item handoff, and deferred cart/pricing/production-preview boundaries.
- `private-customer-uploads`: Defines image validation, opaque private upload receipts, guest draft ownership, provider-neutral storage access, lifecycle/failure behavior, and offline adapters.

### Modified Capabilities

- None. `engineering-foundation` remains authoritative, and the active C1 catalog specs remain unchanged dependencies.

## Impact

- **Domain/application:** The broad prototype `Customization` type will be incrementally narrowed behind field-driven parsers and draft/application services while preserving a compatible order-request sibling boundary.
- **UI/routes:** The Product detail client experience gains configuration fields, upload/input previews, draft feedback, and a configured-item handoff. Existing public catalog and Variant selector responsibilities remain intact.
- **Server/API:** The upload route and order customization validation require server-authorized abstractions and safe error mapping; no live provider call is required by planning or offline tests.
- **Data:** A future additive migration is expected for normalized `customization_fields`, private pre-order upload metadata/ownership, and robust field/upload association. Existing `order_items.customization` and `order_uploads` remain preservation/reuse inputs rather than being replaced destructively.
- **Security:** Current browser-visible bucket/storage-key behavior must be retired from the public contract. No customer media may cross into ProductAsset, fixture, sitemap, log, or permanent-public-URL paths.
- **Risks:** Guest draft ownership, abandoned upload cleanup, schema sequencing with active C1 work, legacy customization compatibility, and external object-store failure require explicit fail-closed behavior and implementation gates.
