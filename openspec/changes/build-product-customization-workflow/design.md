## Context

See `proposal.md` for motivation and scope. Repository inspection found a partial prototype rather than an end-to-end customization capability:

- `app/domain/customization.ts` defines a permissive compatibility object with note/options, one-or-many photo paths and metadata, photo review state, and digital-delivery fields. Its parser checks primitive shapes but has no Product-owned field definitions, unknown-field rejection, text bounds, upload ownership, or configuration version.
- `app/domain/order.ts` correctly keeps `customization` alongside Product/Variant identity and selected Variant Options. C1 resolution preserves that sibling value.
- `app/domain/cart.ts` is only a type alias over the legacy Product card plus optional customization; no cart UI, persistence, line identity, or configured-item reducer exists.
- `/product/[slug]` and `ProductDetailExperience` render ProductAssets, fulfillment details, and an interactive `VariantSelector`. They have no customization fields, file input, customer preview, draft state, summary, or add-to-cart/order action.
- `/api/uploads` validates JPEG/PNG/WebP and a 10 MB ceiling, lazily creates a private Supabase bucket, writes `drafts/<uuid>.<ext>`, and returns `bucket` and `storageKey`. There is no guest owner record or opaque receipt. This is an active but provider-coupled prototype.
- `/api/orders` currently requires each item to contain a `drafts/...` `photoPath`, checks note length and optional metadata, writes broad JSON to `order_items.customization`, and adds one `order_uploads` row from `photoPath`. It does not resolve CustomizationFields, verify draft ownership, or handle field-associated ordered multi-image input.
- The admin order page uses server-generated signed Supabase URLs for photo review. Cleanup scans Supabase Storage and references in `order_uploads`/customization JSON. These prove private operational use but not a final storage architecture.
- The read-only schema baseline confirms legacy `products.customization_schema jsonb`, `order_items.customization jsonb`, and `order_uploads(order_item_id, storage_key, original_filename, content_type, file_size_bytes, review_status)`. Only the Product seed writes `customization_schema`; active application code does not read it. No pre-order upload owner/draft table or normalized field table exists.
- Supabase Storage is currently used by prototype routes; `.openai/hosting.json` has no R2 binding. Foundation and C1 explicitly defer the final provider choice.
- Existing tests cover MIME/size rejection before storage, compatibility parsing, Customization/Variant separation, and C1 order resolution. They do not cover a field-driven UX, guest ownership, opaque receipts, image dimensions, draft lifecycle, or storage-independent upload behavior.

The implementation must remain compatible with the current vinext/Cloudflare runtime, strict TypeScript, Supabase as the business database, and the C1 Product/Variant contracts. C1 Tasks 3.5–3.8 and 7.4 remain frozen at progress 41/61 and are not dependencies for this work.

## Goals / Non-Goals

**Goals:**

- Turn the broad prototype shape into provider-neutral field/value/draft contracts with deterministic runtime parsing.
- Allow local-first editing in the Product detail client while server-validating field configuration, upload ownership, and final handoff.
- Isolate private object storage behind a contract that can be exercised entirely offline.
- Preserve a narrow backward-compatible adapter for existing order customization data while preventing new clients from submitting provider paths.
- Define additive schema needs and an approval gate without creating a migration during planning.

**Non-Goals:**

- Do not implement full cart identity or persistence, payment/shipping/order snapshot changes, production preview, pricing rules, arbitrary field dependencies, provider selection, or production infrastructure.
- Do not treat fixture/seed examples as approved production field requirements.
- Do not merge public ProductAsset and private customer media boundaries.

## Decisions

### 1. Introduce a minimal normalized `CustomizationField`

Use a provider-neutral definition with:

```text
CustomizationField
- id: stable identifier
- productId: owning Product
- code: stable Product-scoped code
- label: customer-facing text
- kind: image | short_text | long_text
- required: boolean
- position: non-negative integer
- isActive: boolean
- constraints: kind-specific bounded object
- version metadata: sufficient for stale-draft detection
```

Text constraints contain an approved positive maximum length and optional instructional text. Image constraints contain allowed MIME types (restricted by this change to JPEG/PNG/WebP), maximum bytes, minimum/recommended dimensions, minimum/maximum image count, and whether non-destructive crop input is enabled. Unsupported keys and constraints for the wrong kind are rejected. Field code is unique within a Product, and deterministic ordering uses `position` then stable identity.

`image`, `short_text`, and `long_text` cover the confirmed immediate needs: photos, names/short labels, and notes/instructions. Generic `file`, select/multiselect, numeric fields, conditional dependencies, and arbitrary validation expressions are deferred. A future change can add kinds explicitly without weakening parsers.

**Alternatives considered:** Reusing `products.customization_schema` as unrestricted JSON would preserve hard-to-test shapes and no stable field identity. Modeling text/photo as Product Options violates C1. Building the entire requirement-document field/rule matrix now would introduce pricing and dependency engines explicitly excluded from this change.

### 2. Use typed field values and ordered image references

The new customization value set is an ordered collection keyed by stable field identity/code:

```text
short_text | long_text -> normalized text value
image -> ordered upload receipt references plus optional crop metadata per image
```

Each value carries the field identity required for authoritative lookup; it does not copy field rules as browser authority. The normalized handoff includes a field-configuration version or equivalent server-recognized revision. Unknown fields, duplicated single text values, cross-Product fields, wrong kinds, unowned receipts, count violations, and stale configuration fail closed.

Existing `Customization` remains a legacy/order-read compatibility shape during an incremental transition. New Product detail and handoff code uses the normalized model. An explicit adapter maps accepted normalized values to the legacy `order_items.customization`/`order_uploads` path only at the existing order boundary until a future order-customization schema cutover is approved; digital-delivery and photo-review fields are not part of customer input.

**Alternatives considered:** Mutating the broad legacy type in place would risk historical admin/lookup paths and continue mixing customer input with operational delivery/review fields. Using a free-form record of values makes ordering and multi-image association ambiguous.

### 3. Derive a local-first draft lifecycle

The client holds local state for Product ID, selected Variant/SKU, selected Variant Options, field configuration revision, normalized field values, current local preview handles, upload operations, and validation issues. No status is persisted or trusted directly. A pure evaluator derives:

- `empty`: no selected Variant or customization value;
- `editing`: some input exists but required composition is incomplete;
- `upload_pending`: at least one active upload operation is incomplete;
- `ready`: Variant and all required fields are valid with owned active receipts;
- `invalid`: current values fail validation or configuration is stale;
- `expired`: a required receipt/draft ownership context is known to have expired.

Text input and Variant selection remain local. Selecting a file creates a revocable browser preview and runs client preflight; only explicit upload crosses the server boundary. Reload persistence is not promised by this change, because doing so safely would create a cart/draft persistence architecture. Draft actions are pure enough for reducer/domain tests.

**Alternatives considered:** Persisting every keystroke adds PII writes and network coupling. A fully server-persisted draft is premature without authentication/cart architecture. Omitting state semantics makes pending uploads and stale receipts easy to submit incorrectly.

### 4. Keep Variant selection and customization composition at one parent boundary

`ProductDetailExperience` remains the composition point. `VariantSelector` continues resolving only Variant Options and emits the selected SKU identity. A sibling customizer consumes Product-owned field definitions. A parent draft coordinator combines:

```text
Product identity
+ resolved Variant/SKU identity
+ selected Variant Option IDs
+ normalized Customization values
```

The customizer cannot modify Variant price, currency, weight, availability, or SKU code. A configured-item summary shows the selected SKU and separate customer inputs. This architecture lets a shopper upload first, edit text, and later select a Variant without losing values.

**Alternatives considered:** Nesting customization into `VariantSelector` would make photo/text part of SKU resolution. Giving each component an independent purchase action risks mismatched state.

### 5. Treat customer-input preview and crop as local, non-production representations

Before upload, image previews use browser-local object URLs and are revoked on replace/remove/unmount. After upload, any server-backed preview is obtained through an authorized short-lived endpoint; the receipt itself is not a public URL. Alt text/status labels use the field label and safe filename, upload progress is announced, and controls remain keyboard accessible.

The confirmed product baseline mentions crop and preview. This change plans minimal non-destructive crop metadata only when an image field enables it: normalized finite coordinates constrained to the original image. The original private file remains unchanged. No rendered derivative, production mockup, background removal, AI enhancement, or face/person analysis is produced.

**Alternatives considered:** Editing the binary client-side complicates quality and original preservation. Calling a thumbnail a production preview would violate the separate production workflow.

### 6. Put browser and server validation on one domain vocabulary

Pure validators parse field definitions, image metadata, crop metadata, draft values, and configured-item handoffs. The browser uses them for immediate feedback, but the server re-reads authoritative Product/Variant/field configuration and authoritative receipt records. It also inspects file bytes sufficiently to confirm supported image type and decode dimensions; browser-provided MIME, size, dimensions, filename, receipt ownership, and quality state are non-authoritative.

Quality uses deterministic metadata thresholds only:

- below a required minimum: validation error;
- at/above required minimum but below a configured recommendation: warning;
- at/above recommendation: no warning.

The design does not claim blur, face, pose, occlusion, or people-count detection.

**Alternatives considered:** Duplicating unrelated client/server schemas will drift. Trusting browser metadata permits policy bypass. Adding automated visual analysis creates a separate moderation/AI capability.

### 7. Replace provider paths with an opaque upload receipt boundary

Define a server-only `CustomerUploadRepository` or equivalent port with operations to create/store an object, persist validated receipt metadata, resolve by receipt plus ownership, authorize temporary preview, mark replaced/removed, attach to an order boundary exactly once, expire, and clean up. Domain-facing objects use:

```text
CustomerUploadReceipt
- id: opaque unguessable identity
- fieldId / Product draft association
- safe validated metadata
- warning state
- created/expires timestamps
- lifecycle state
```

Provider adapter details own bucket/object keys and never serialize them into the customer handoff. Node/offline tests use deterministic in-memory repositories. The current Supabase route is prototype evidence only; this change does not approve it as the final adapter, and no R2 adapter/provider configuration is selected.

**Alternatives considered:** Keeping `photoPath` browser-authoritative leaves object access and ownership unverifiable. Returning a signed URL as the receipt confuses access with identity and expires unpredictably. Selecting Supabase Storage because code exists contradicts the approved deferred provider decision.

### 8. Use an opaque guest draft owner without designing authentication

Guest checkout is first-class, so upload ownership cannot require a user account. The server issues/verifies an unguessable draft ID plus an integrity-protected, HttpOnly, SameSite cookie (or an equivalent server-managed mechanism supported by the runtime). Only a verifier-derived owner identity is passed into the upload application service. Requests reject invalid ownership before constructing a privileged provider client. Receipt IDs alone never authorize access.

The design intentionally does not create Supabase Auth or account-linking behavior. A later auth change can associate an authenticated principal while preserving the owner abstraction.

**Alternatives considered:** A browser-readable bearer owner token increases theft/exfiltration risk. IP/email ownership is unreliable and leaks identity semantics. Requiring login conflicts with guest purchasing.

### 9. Make upload lifecycle and retries explicit

Provider-neutral receipt states distinguish at least active temporary content, replaced/removed content, order-attached content, expired content, and cleanup pending/completed. State transitions are server-derived and conditional/idempotent. Replacement creates a new receipt before retiring the old active draft value. Removal never deletes order-attached content. Cleanup considers only expired, unreferenced temporary receipts and records retryable failure rather than claiming deletion.

If object storage succeeds but receipt persistence fails, the service returns no receipt and invokes/records compensation. If receipt state persists but object upload fails, no active receipt is exposed. Exact atomicity differs by provider, so reconciliation is required rather than pretending a distributed transaction exists.

**Alternatives considered:** Reusing filename paths and a periodic bucket scan cannot robustly establish ownership or attachment. Hard-deleting on replace can destroy media already referenced by an order during retries.

### 10. Reuse legacy order storage only behind a compatibility adapter

**REUSE EXISTING:**

- `order_items.customization` can hold an immutable normalized customer-input snapshot at order creation once the existing order boundary accepts it.
- `order_uploads` can continue linking private order media to an `order_item` and supporting operations review.
- Current signed admin access demonstrates the intended temporary private-access behavior, subject to the future provider adapter.

**INSUFFICIENT / NEW SCHEMA REQUIRED:**

- authoritative normalized Product-owned `customization_fields`;
- a pre-order private upload receipt/draft-owner relation with lifecycle and expiry;
- association from each upload to Product, field, and ordered position before order creation;
- a safe attachment mapping or additive columns allowing accepted receipts to become `order_uploads` without browser storage keys;
- indexes, constraints, RLS/privileges, and cleanup/attachment concurrency safeguards.

The legacy `products.customization_schema` is retained for compatibility and is not migrated or trusted automatically. Historical `order_items` and `order_uploads` are preserved unchanged. The future implementation must first produce a migration decision packet using the current schema baseline and coordinate ordering with any unapplied C1 migrations. No migration may be created until the user approves that exact scope.

**Alternatives considered:** Storing all pre-order ownership in client state cannot authorize provider objects. Writing temporary uploads directly into `order_uploads` is impossible before an `order_item` exists and overloads order semantics. Replacing historical JSONB is destructive and overlaps C1 order snapshots.

### 11. Product-specific requirements need authorized configuration, not fixture promotion

Public catalog reads join active CustomizationFields by Product. Basic administrator management is limited to field identity/code/label/kind/required/position/active state and approved constraints. It uses the existing admin authorization boundary and server-only persistence; no supplier, pricing, conditional rule, or production instruction UI is included.

Development fixture mode may include clearly marked deterministic sample field definitions solely to exercise the workflow offline. Those definitions must be colocated with development fixture adapters, must not contain real media/reference data, and must never be imported or used as fallback in production. Current `seed.sql` examples such as `photo`, `people`, `style`, or `note` are evidence of prototype intent only, not approved production configuration.

**Alternatives considered:** Hardcoding by slug would recreate the catalog defect C1 removes. Automatically translating legacy JSON risks inventing field semantics and production requirements.

### 12. Cart/order handoff is narrow and explicitly incomplete

The handoff emits ordered normalized values and distinct opaque upload IDs so a later cart change has enough information to keep customized copies separate. This change does not compute a fingerprint, merge key, or durable cart identity. The existing order route can receive the normalized sibling payload only after server revalidation and a compatibility mapper; base subtotal remains Variant-authoritative.

Task 7.4's immutable Product/SKU snapshot remains frozen and is neither implemented nor bypassed. This change can define an immutable customization snapshot shape, but durable order persistence/cutover must be coordinated with C1 and separately approved migration work. Stripe, PayPal, coupons, shipping, payment status, and fulfillment are untouched.

**Alternatives considered:** Fixing line merge here violates the parallel change boundary. Writing directly to incomplete order snapshot columns would bypass C1's ordered migration gate.

### 13. Fail closed without exposing customer or provider details

Stable public errors distinguish invalid field/value, upload rejected, unauthorized/expired receipt, stale configuration, and temporary service failure. Public responses do not include SQL errors, provider diagnostics, object keys, signed URLs beyond an authorized temporary-preview response, customer content, cookies, or secrets. Logs contain correlation-safe event context, not uploaded bytes, text values, filenames unless strictly sanitized/necessary, or ownership credentials.

Production configuration/source failures do not fall back to fixtures or an empty permissive customizer. A failed upload never becomes a ready draft value. Unauthorized requests are rejected before privileged repository/provider construction.

**Alternatives considered:** Returning raw provider errors helps debugging but leaks object topology and secrets. Treating unavailable field configuration as “no customization required” can allow incomplete orders.

### 14. Offline verification is a first-class adapter requirement

Pure tests cover parsers, constraints, quality decisions, draft states, crop bounds, and normalized handoff. Repository/application tests use in-memory fields, receipt lifecycle, object-store failure, compensation, idempotent replacement/removal/attachment, and cross-owner rejection. UI tests cover field rendering, Variant/customization separation, accessible preview, replacement/removal/reorder, pending/stale errors, and summary. Route tests prove server validation and no bucket/key leakage. No automated test uses live Supabase, Supabase Storage, R2, Stripe, PayPal, or other external APIs.

## Risks / Trade-offs

- **[Parallel schema work conflicts with unapplied C1 migrations]** → Require a schema/migration decision packet and explicit approval; inspect current migration artifacts and order additions without editing C1.
- **[Guest owner cookie is lost]** → Treat receipts as expired/unowned, preserve server privacy, and give the shopper a clear re-upload path rather than weakening authorization.
- **[Object and metadata writes cannot be one database transaction]** → Use compensation, explicit lifecycle states, and retryable cleanup; never return an accepted receipt before authoritative metadata exists.
- **[Legacy order compatibility prolongs two shapes]** → Isolate translation in one adapter, keep new clients path-free, and assign removal to the later cart/order cutover.
- **[Fixture definitions are mistaken for production rules]** → Label fixture source and UI, prohibit production fallback/import, and require approved configuration for production.
- **[Browser image decoding differs from server validation]** → Treat browser checks as advisory; server-supported decoding and constraints determine acceptance.
- **[Multi-image/crop expands scope]** → Limit both to configured image constraints and normalized metadata; do not add arbitrary editors or rendered derivatives.
- **[Private access leaks through catalog or logs]** → Add boundary tests for ProductAsset/sitemap/catalog separation, opaque responses, safe logs, and authorization-before-provider construction.

## Migration Plan

Planning does not authorize migration creation or execution. During Apply:

1. Implement and test provider-neutral domain contracts without schema changes.
2. Produce a read-only schema compatibility and migration decision packet covering active C1 migration artifacts, legacy rows, RLS/grants, and exact additive tables/columns. STOP for human approval.
3. After explicit approval only, create ordered additive migration artifact(s) for normalized fields and private draft upload receipts/associations. Do not apply them automatically.
4. Verify migration artifacts in a disposable Supabase-compatible environment with historical `order_items`/`order_uploads` preservation and rerun/rollback evidence.
5. Implement repositories, local fake, UI, and upload/order adapters behind feature/source boundaries; keep production disabled until approved migrations and provider configuration are deployed by the responsible owner.
6. Cut new browser contracts from path-based upload data to opaque receipts while retaining server-side historical reads.

Rollback before production cutover removes/turns off new application paths while leaving additive tables dormant. After new orders attach receipts, prefer forward-fix; never drop historical customization or upload rows as rollback.

## Open Questions

- Exact production Product-specific field definitions and image count/dimension limits require business approval; they are configuration data, not an architecture blocker.
- The final Supabase Storage versus Cloudflare R2 adapter and deployment values remain a separately approved provider decision.
- Retention duration for abandoned drafts and post-order customer originals requires a privacy/operations decision before production deployment; the lifecycle supports a configured duration without fixing one here.
