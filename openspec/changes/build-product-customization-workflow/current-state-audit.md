# Current Customization State

Implementation-facing baseline for `build-product-customization-workflow` Task 1.1. Reviewed from repository source and the existing read-only schema baseline on 2026-08-12. Status labels describe observed behavior, not intent inferred from filenames.

## Status legend

- **IMPLEMENTED AND ACTIVE** — called by a current runtime path.
- **IMPLEMENTED BUT LEGACY / COMPATIBILITY** — active only to preserve a transitional or historical shape.
- **PROTOTYPE ONLY** — executable behavior exists but lacks the approved final architecture or trust boundary.
- **PRESENT IN SCHEMA BUT UNUSED** — stored structure exists but no active application read uses it as authority.
- **TEST-ONLY / FIXTURE-ONLY** — available only under explicit development/test inputs.
- **DEFERRED** — intentionally owned by a later task/change.
- **BLOCKED BY ANOTHER APPROVED CHANGE** — cannot honestly complete until its approved dependency is resolved.

## 1. Customization domain

**Overall status: IMPLEMENTED BUT LEGACY / COMPATIBILITY.**

`app/domain/customization.ts` defines one broad `Customization` object:

| Concern | Existing fields | Classification |
|---|---|---|
| Customer input | `note`, `options`, `photoPath`, `photoPaths`, `photoMeta`, `photoMetas` | Compatibility payload; some fields are accepted by order parsing, but no Product-owned authority defines what a Product requires. |
| Operational/review data | `photoReviewStatus` | Active administrator/order-operations data mixed into the same object as customer input. |
| Delivery data | `digitalDeliveryPath`, `digitalDeliveryName` | Active administrator/digital-delivery data mixed into the same object. |
| Photo metadata | original filename, content type, byte size, width, height, `good | low` quality | Shape is present; values are not tied to a server-owned upload receipt. |

`parseCustomization` verifies that the input is an object and checks primitive/array shapes for recognized fields. `parsePhotoMetadata` checks types and the two quality strings. The parser does **not** reject unknown customization keys, impose text/path/count limits, verify numeric finiteness/integer/positivity, verify Product ownership, associate values with stable fields, or validate against Product-specific requirements. Unknown keys are dropped from the parsed result rather than reported.

`app/domain/order.ts` actively parses `customization` as a sibling of native Product/Variant/SKU identity and selected Variant Options. This separation is reusable. The broad Customization shape itself is not suitable as normalized authority.

There is no implemented `CustomizationField`, stable field ID/code, field kind, Product ownership, required flag, field order, configuration revision, or authoritative field-specific constraint model.

## 2. Product detail UX

**Catalog and Variant status: IMPLEMENTED AND ACTIVE. Customization status: DEFERRED.**

`/product/[slug]` currently loads an eligible Product graph from the selected catalog repository and renders:

- breadcrumb, Product name, description, Category, and listing price;
- public ProductAsset gallery;
- fulfillment type, production mode, lead-time label, and shipping-required state;
- Product Options, Option Values, and public Variant selector data;
- an explicit fixture notice when the existing development fixture source is selected.

`ProductDetailExperience` keeps only `selectedVariantId` local state so the ProductAsset gallery can prefer Variant-associated public media. `VariantSelector` keeps Option Value selections, resolves one Variant through the C1 storefront resolver, disables impossible values, reports incomplete/unavailable selections, and displays the resolved SKU code and authoritative USD price. It emits only the resolved Variant ID to its parent.

The current Product detail path has:

- no CustomizationField read or form;
- no photo/file input or `/api/uploads` caller;
- no local customer-input preview, crop, replace, remove, reorder, or summary;
- no customization draft lifecycle;
- no add-to-cart, checkout, or direct `/api/orders` action.

The public ProductAsset gallery is marketing media, not a customer upload preview.

## 3. Cart

**Overall status: IMPLEMENTED BUT LEGACY / COMPATIBILITY at type level; runtime cart is DEFERRED.**

`app/domain/cart.ts` contains only:

- `CartItem = Product & { customization?: Customization }`, based on the legacy Product-card contract;
- `CartOrderItemPayload = OrderRequestItem`.

No cart route/component, cart state service, persistence repository, browser storage, database cart, add-to-cart action, line identity, merge rule, or customization fingerprint was found in active application code. The type expresses that customization can accompany an item but does not implement cart behavior.

Complete cart-line identity is explicitly deferred by C1. Two copies of the same SKU with different customization must eventually remain distinct, but the current repository does not implement that rule.

## 4. Upload API

**Overall status: PROTOTYPE ONLY.**

Observed active flow:

```text
browser multipart field "file"
  → POST /api/uploads
  → File instance check
  → declared MIME + byte-size validation
  → read Supabase URL/secret and upload bucket configuration
  → attempt private bucket creation on each request/first use
  → upload to Supabase Storage drafts/<random UUID>.<extension>
  → return provider bucket/key and client-supplied file metadata
```

Current rules and behavior:

- allowed declared types: `image/jpeg`, `image/png`, `image/webp`;
- maximum size: 10 MiB; zero-byte files are rejected;
- file content/signature and decoded dimensions are not inspected by this route;
- bucket name is `SUPABASE_UPLOAD_BUCKET`, defaulting to `photogift-uploads`;
- the route calls `createBucket` with `public: false`, the size limit, and MIME allowlist; an error whose message contains `already exists` is ignored;
- object key is server-generated as `drafts/<crypto.randomUUID()>.(jpg|png|webp)` and upload uses `upsert: false`;
- success returns `bucket`, `storageKey`, `originalFilename`, `contentType`, and `fileSizeBytes`;
- failure logs the underlying error and returns a generic 500 message.

The route has no authentication, guest draft owner, ownership cookie/context, Product/field association, receipt persistence, expiry, replacement/removal API, or opaque upload receipt. Possession of the returned path is later treated as request data; it is not proof of ownership. The browser response is directly coupled to Supabase Storage topology and is **not** the final architecture.

No current Product detail UI calls this route, so it is an accessible prototype endpoint rather than a complete storefront upload flow.

## 5. Order customization path

**Overall status: IMPLEMENTED AND ACTIVE with LEGACY / COMPATIBILITY customization semantics.**

Observed path:

```text
POST /api/orders JSON
  → parse native or legacy item identity
  → parse broad Customization sibling
  → route-level photoPath/note/photoMeta checks
  → resolve legacy Product slug when needed
  → resolve authoritative Product + Variant/SKU + selected Options + base price
  → insert order
  → insert order_items with broad customization JSON
  → derive one order_uploads row per item from photoPath/photoMeta
  → optionally start Stripe Checkout
```

Exact handling:

| Value | Parse/check | Translation/persistence |
|---|---|---|
| `photoPath` | Broad parser accepts any string. Order route then requires every item to have a string matching `drafts/<hex-or-hyphen UUID-like value>.(jpg|png|webp)`, case-insensitive. | Copied into `order_items.customization`; also copied directly to `order_uploads.storage_key`. No object existence or current-request ownership check occurs. |
| `photoMeta` | Optional. Broad parser checks primitive types/quality. Order route additionally limits filename to 255 characters, MIME to JPEG/PNG/WebP, bytes to 1..10 MiB, width/height to positive integers, and quality to `good | low`. | Entire parsed metadata remains in `order_items.customization`; filename, MIME, and byte size are copied into the one `order_uploads` row. Browser-supplied metadata is checked but not independently derived from the stored object. |
| `note` | Broad parser checks string. Order route limits the original string to 500 characters. | Trimmed only while constructing the `order_items.customization` insert. |
| `photoPaths` / `photoMetas` | Shape-parsed only; no route-level count/ownership/association validation. | Persisted inside broad customization JSON if supplied, but ignored when creating `order_uploads`; only singular `photoPath` creates a row. |
| `options` | String-valued record only. | Persisted in broad customization JSON; not used for C1 Variant resolution. |
| `photoReviewStatus` / digital-delivery fields | Shape-parsed if submitted. | Broad order creation currently does not explicitly forbid browser submission; operational admin routes also write these fields later. They are not safe customer-input authority. |

The C1 order resolver validates Product/Variant ownership, publication eligibility, SKU code, selected Option equality, availability, quantity, and authoritative Variant base price. It deliberately carries `customization` unchanged as a sibling. It does not validate Product-specific customization requirements.

If a later failure occurs after order creation, the route attempts to delete the created order, relying on database cascades for child rows. This is prototype compensation, not a customization transaction/receipt lifecycle.

## 6. Existing schema

Evidence comes from `docs/catalog-schema-baseline.md`; Task 1.1 did not query a database.

### `products.customization_schema`

**Classification: PRESENT IN SCHEMA BUT UNUSED.**

- Shape: non-null `jsonb`, default `{}`.
- Repository seed writes informal objects such as `photo`, `note`, `people`, `pet_name`, `size`, `model`, or `style` booleans.
- No active application read or parser for `customization_schema` was found.
- Historical value: legacy Product configuration data exists and must not be assumed meaningless or overwritten without later analysis.
- Suitability: not suitable as normalized authority; it has no stable field identity, explicit kind, Product-scoped code contract, required/order semantics, bounded constraints, or configuration revision.

### `order_items.customization`

**Classification: IMPLEMENTED AND ACTIVE, but IMPLEMENTED BUT LEGACY / COMPATIBILITY as a model.**

- Shape: non-null `jsonb`, default `{}`.
- Current writes: order creation stores broad parsed Customization; admin operations merge `photoReviewStatus`, `digitalDeliveryPath`, and `digitalDeliveryName` into the same JSON.
- Current reads: admin order view/review, cleanup reference scan, fulfillment photo-approval gate, order lookup for digital delivery, and historical compatibility paths.
- Historical value: the baseline records 13 existing OrderItems; customization values were deliberately not inspected. Existing rows must be preserved.
- Suitability: useful as a historical/compatibility snapshot container, but not normalized field authority or pre-order ownership storage because it mixes customer input, review state, and delivery state.

### `order_uploads`

**Classification: IMPLEMENTED AND ACTIVE for order-attached media; insufficient for pre-order drafts.**

Columns:

- `id uuid` primary key;
- `order_item_id uuid` required FK to `order_items(id)` with `ON DELETE CASCADE`;
- `storage_key text` required;
- nullable `original_filename`, `content_type`, `file_size_bytes`;
- `review_status` default `pending`, constrained to `pending | approved | needs_reupload | rejected`;
- `created_at`.

The table is written by order creation and review updates. Admin cleanup reads its storage keys. It has no unique constraint beyond the primary key and no Product/field/position, guest owner, receipt, expiry, replacement, or pre-order lifecycle. Because `order_item_id` is required, it cannot represent a draft before order creation.

The baseline records 3 historical upload rows and no missing parent OrderItem. They must be preserved.

### Security baseline

`products`, `orders`, `order_items`, and `order_uploads` have RLS enabled and not forced. Only Products has a SELECT policy. `orders`, `order_items`, and `order_uploads` have no RLS policies, and browser roles have no table DML; `service_role` has DML and BYPASSRLS. Current server routes use the service-role Supabase client. The baseline did not establish application-specific Supabase Storage bucket policy details, so those remain **UNKNOWN**, not assumed secure by table RLS.

No other normalized customization/upload business table is recorded in the baseline.

## 7. Private media access

**Admin access: IMPLEMENTED AND ACTIVE, provider-coupled.**

- `/admin/orders` verifies the existing admin session before querying orders.
- For each `customization.photoPath`, the server requests a Supabase Storage signed URL valid for 15 minutes and renders a `View photo` link when available.
- `AdminPhotoReview` submits `pending | approved | needs_reupload | rejected` through the admin API.
- The admin API verifies the session, verifies the OrderItem belongs to the Order, merges `photoReviewStatus` into `order_items.customization`, updates all `order_uploads.review_status` rows for that OrderItem, and attempts an operation log.
- Fulfillment transitions into production or later states are blocked while an item with `photoPath` lacks `photoReviewStatus = approved`.

**Customer order lookup:** it does not expose customer photos. It creates a separate 15-minute signed URL only for eligible paid digital-delivery paths.

**Cleanup: PROTOTYPE ONLY.** The admin-only cleanup route defaults to dry-run, accepts a bounded 24-hour to 30-day age threshold, reads references from `order_uploads.storage_key` and singular `order_items.customization.photoPath`, lists up to 5,000 objects under `drafts/`, and optionally deletes old unreferenced matching keys. It does not model owner, receipt state, replacement, attachment, or retry persistence, and it does not inspect `photoPaths`.

Limitations include path-based authority, singular-photo assumptions, repeated signed-URL calls, no guest ownership, no customer preview authorization endpoint, and no provider-neutral access abstraction.

## 8. Storage provider state

- **CURRENT PROTOTYPE: Supabase Storage.** `/api/uploads`, admin photo preview, digital delivery, order lookup, and cleanup call the Supabase Storage SDK directly through the server service-role client.
- **FINAL PRODUCTION PROVIDER: UNDECIDED.** Foundation, C1, and this change explicitly defer Supabase Storage versus Cloudflare R2.
- `.openai/hosting.json` has `"r2": null`; therefore no active R2 binding is configured by the hosting metadata.
- `vite.config.ts` supports an optional R2 binding only when that hosting value is non-null. It is inactive in the current repository configuration.
- `.env.example` contains reserved R2 variables but they are not an active adapter or provider decision.
- `SUPABASE_UPLOAD_BUCKET` is server-only configuration with the prototype default `photogift-uploads`.

Task 1.1 makes no provider recommendation.

## 9. Fixtures and production separation

**Development catalog fixtures: TEST-ONLY / FIXTURE-ONLY.** The explicit fixture catalog provides Category/Product/Option/Variant/ProductAsset/Fulfillment data for local demonstration. It does not currently define normalized CustomizationFields or contain customer uploads.

**Legacy seed examples: PRESENT IN SCHEMA INPUT BUT UNUSED by active customization reads.** `supabase/seed.sql` includes 22 informal `customization_schema` objects. They are prototype examples only; active application code does not read them, and they are not approved production requirements.

**Local Demo:** `docs/local-demo.md` explicitly excludes CustomizationField and customer photo upload from Demo 1.

The existing catalog source selector defaults to Supabase and permits fixtures only in development/test when explicitly selected. Production rejects fixture mode, and Supabase source failure does not fall back to fixtures. Upload/order storage paths are separate from catalog source selection.

Required boundary: **development fixtures != production configuration**. No fixture or seed example may become production customization authority automatically.

## 10. Existing tests

Current relevant coverage:

- `tests/routes-foundation.test.mjs`: pure upload candidate tests prove unsupported/oversized input is rejected before its supplied fake store callback runs.
- `tests/order-request-contract.test.mjs`: native/legacy item parsing, Customization as a sibling of selected Variant Options, and browser price/currency rejection.
- `tests/legacy-order-compatibility.test.mjs`: customization survives exact legacy Product-slug → default Variant conversion without entering selected Options.
- `tests/order-catalog-resolution.test.mjs`: Customization survives authoritative Product/Variant resolution; source-level ordering checks ensure resolution occurs before order insert/Stripe construction.
- `tests/catalog-domain.test.mjs`: Variant Option parsers reject customization semantics; ProductAsset rejects private/preview/binary semantics.
- `tests/catalog-storefront.test.mjs`: selector payload excludes customization and public ProductAsset behavior is tested separately.
- `tests/admin-product-assets.test.mjs`: public ProductAsset admin/repository paths do not access `order_uploads` or other private domains.
- `npm run test:offline` lists deterministic local tests and does not require live storage, payment, or remote Supabase for the existing covered logic.

Clear gaps:

- no direct exhaustive tests for `parseCustomization`/`parsePhotoMetadata`, including unknown keys and numeric edge cases;
- no `/api/uploads` route contract test, file-signature/dimension test, ownership/auth test, opaque receipt test, or provider failure/compensation test;
- no browser customization/upload UI or draft lifecycle tests because that UI does not exist;
- no Product-specific field authority, required-field, field-kind, multi-image association/order, replace/remove, crop, stale configuration, or quality-threshold tests;
- no test proving a submitted `photoPath` exists and is owned by the current guest;
- no order-route integration test for normalized field values/receipt attachment or zero mutation on customization rejection;
- no provider-neutral storage adapter/lifecycle/idempotency tests;
- no complete customized cart-line identity tests; that capability is deferred.

Task 1.1 adds no tests and does not reinterpret these gaps as desired behavior.

## 11. C1 interaction

- C1 progress: **41/61**.
- C1 Task 3.5: **BLOCKED / awaiting business input**.
- BACKFILL AUTHORIZED: **NO**.
- Unresolved business inputs remain 19 physical packaged weights, 22 minimum lead times, and 22 maximum lead times: **63 total**.

Frozen chain:

```text
3.5 → 3.6 → 3.7 → 3.8 → 7.4
```

Completed C1 boundaries:

- **7.1:** shared order request can carry Product, Variant/SKU, and selected Variant Option identities while keeping Customization separate.
- **7.2:** temporary legacy Product-slug requests resolve only one exact active/default/eligible Variant and preserve Customization as a sibling.
- **7.3:** server order creation resolves Product/Variant ownership, eligibility, selected Options, availability, and authoritative Variant base price before creating an order.

C1 deliberately defers CustomizationField/Rule, private uploads, production preview, complete cart-line identity, and the final storage provider. Task 7.4 remains blocked and owns immutable Product/SKU snapshot persistence; this change must not implement or bypass it.

## 12. Implementation dependency map

| Capability | Current status | Reusable? | Replacement required? | Future task |
|---|---|---:|---:|---|
| Broad `Customization` type/parser | IMPLEMENTED BUT LEGACY / COMPATIBILITY | Partly: historical/order adapter | Yes for new normalized customer input | 2.1–2.8, 8.3–8.6 |
| `CustomizationField` | DEFERRED / absent | No | New capability | 2.x, 3.x, 4.x |
| Product customization config | PRESENT IN SCHEMA BUT UNUSED (`customization_schema`) | Historical evidence only | Normalized authority required | 3.x, 4.x |
| Variant selector | IMPLEMENTED AND ACTIVE | Yes | No; compose as sibling | 7.2 |
| Customization UI | DEFERRED / absent | No | New UI required | 7.2–7.9 |
| Cart | Type-only LEGACY / COMPATIBILITY; runtime absent | Handoff type only | Full cart deferred | 8.1–8.7 and later cart change |
| `/api/uploads` | PROTOTYPE ONLY | MIME/size concepts | Yes: trust/response/provider boundary | 5.x |
| Guest ownership | DEFERRED / absent | No | New server-owned boundary | 5.2–5.3 |
| Opaque receipt | DEFERRED / absent | No | Replaces browser path authority | 5.1, 5.5–5.7 |
| Private customer-input preview | Admin signed access only; shopper flow absent | Signed-access concept only | Authorized shopper/local preview required | 5.8, 7.4 |
| `order_items.customization` | IMPLEMENTED AND ACTIVE; LEGACY / COMPATIBILITY model | Yes for history/compatibility snapshot | Normalized adapter required; do not rewrite history | 3.x, 8.3–8.6 |
| `order_uploads` | IMPLEMENTED AND ACTIVE after order creation | Yes for order attachment/review | Additive pre-order/field ownership capability required | 3.x, 5.x, 8.5–8.6 |
| Storage adapter | Direct Supabase calls, PROTOTYPE ONLY | Behavior evidence only | Provider-neutral port required | 5.1, 6.x |
| Admin photo review | IMPLEMENTED AND ACTIVE | Yes, preserve historical workflow | Adapt later to normalized uploads | 8.6, 9.x |
| Production storage provider | UNDECIDED / DEFERRED | No | Separate approval required | 6.5, 10.2–10.3 |
| Production preview | DEFERRED | No | Separate future change | Outside this change |
| Complete cart-line identity | DEFERRED | No | Separate future cart/order change | Outside this change |
| C1 Product/SKU snapshots | BLOCKED BY ANOTHER APPROVED CHANGE | C1 7.1–7.3 contracts reusable | C1 3.8/7.4 must finish independently | Frozen C1 chain |

## Task 1.1 conclusion

The repository has an active path-based one-photo order prototype and operational private-photo review, but no Product-owned customization configuration, customer-facing workflow, guest ownership, opaque receipt, provider-neutral upload lifecycle, or runtime cart. The reusable foundation is the C1 Product/Variant authority, sibling Customization boundary, basic upload constraints, historical JSON/order upload storage, and protected admin review. All later implementation must preserve historical data and the frozen C1 chain while replacing path authority and broad customer-input semantics through approved tasks.
