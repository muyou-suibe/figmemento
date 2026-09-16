# Customization Schema Decision Packet — Task 3.1

**Status:** completed read-only local evidence review
**Decision scope:** classify existing customization-related persistence for compatibility only.
**Not a schema design:** Task 3.2 owns the exact additive schema and migration proposal.

## 1. Scope and evidence rule

This packet answers only what the repository currently proves about three existing structures and their active uses:

- `products.customization_schema`
- `order_items.customization`
- `order_uploads`

Evidence was read only from the local repository: the prior baseline record in `docs/catalog-schema-baseline.md`, local SQL and migration artifacts, current routes/components, current domain code, tests, and this change's approved planning records. No remote Supabase query, dashboard, REST request, migration execution, or storage operation occurred for this task.

`docs/catalog-schema-baseline.md` is a locally stored record of a read-only inspection on 2026-08-07. It is evidence of the state observed then, not proof of the current connected database state on 2026-08-12. Where repository evidence cannot establish a fact, this packet says **UNKNOWN FROM LOCAL EVIDENCE**.

## 2. Required classifications

| Structure | Primary classification | Current role | May remain for legacy compatibility? | May become normalized authority as-is? | Evidence |
|---|---|---|---|---|---|
| `products.customization_schema` | **INSUFFICIENT** | Legacy Product JSON configuration; seed/bootstrap input only. No active application reader or writer uses it as catalog authority. | Yes — preserve existing values unchanged until separately reviewed. | No — it has arbitrary JSON but no stable field identity, kind, active/required state, deterministic position, bounded constraints, or configuration revision contract. | `supabase/schema.sql`, `supabase/seed.sql`, `docs/catalog-schema-baseline.md`, `current-state-audit.md`; no active `app/` reader was found. |
| `order_items.customization` | **COMPATIBILITY-ONLY REUSE** | Active historical/order snapshot JSON containing prototype customer input and operational review/digital-delivery values. | Yes — active order/admin/lookup/cleanup paths and historical rows depend on it. | No — it is order-created, mixes unrelated concerns, lacks normalized field/configuration/receipt identity, and cannot own pre-order draft lifecycle. | `supabase/schema.sql`, `app/api/orders/route.ts`, `app/api/admin/orders/route.ts`, `app/admin/orders/page.tsx`, `app/api/order-lookup/route.ts`, `app/api/admin/cleanup-uploads/route.ts`. |
| `order_uploads` | **COMPATIBILITY-ONLY REUSE** | Active order-item-attached private-media/review record and cleanup-reference source. | Yes — preserve existing order-media/review behavior and rows. | No — a mandatory `order_item_id` prevents pre-order use; there is no guest owner, opaque receipt, expiry, field/position association, or replacement/remove lifecycle. | `supabase/schema.sql`, `app/api/orders/route.ts`, `app/api/admin/orders/route.ts`, `app/api/admin/cleanup-uploads/route.ts`, `docs/catalog-schema-baseline.md`. |

The last classification means that `order_uploads` is reusable only for its existing historical/order-attached boundary. It cannot represent the approved guest-draft-to-order lifecycle before an Order exists.

## 3. Local schema inventory

### Legacy/bootstrap structures

`supabase/schema.sql` defines the following relevant legacy shape:

| Structure | Local shape, constraints, and indexes |
|---|---|
| `products.customization_schema` | `jsonb NOT NULL DEFAULT '{}'::jsonb` on `public.products`. The Product has a UUID PK, unique `slug`, and no JSON-shape constraint or JSON index. The legacy Product update trigger does not interpret this value. |
| `order_items.customization` | `jsonb NOT NULL DEFAULT '{}'::jsonb` on `public.order_items`. `order_items` has UUID PK; required `order_id` FK to `orders` with `ON DELETE CASCADE`; nullable `product_id` FK to `products` with `ON DELETE SET NULL`; non-negative unit price and positive quantity checks. The only listed supporting index is `order_items_order_idx(order_id)`. |
| `order_uploads` | UUID PK; required `order_item_id` FK to `order_items` with `ON DELETE CASCADE`; required `storage_key`; nullable filename, content-type, and positive-if-present byte-size metadata; `review_status NOT NULL DEFAULT 'pending'` constrained to `pending`, `approved`, `needs_reupload`, or `rejected`; `created_at`. The only listed supporting index is `order_uploads_item_idx(order_item_id)`. |

`supabase/seed.sql` upserts 22 legacy Products and writes informal boolean `customization_schema` objects such as `photo`, `note`, `people`, `pet_name`, `size`, `model`, and `style`. These are legacy bootstrap/fixture examples, not approved Product-specific customization rules and not an active runtime source.

`supabase/operations.sql` creates legacy `order_status_logs`; it does not normalize any customization data. The prior recorded baseline says this relation was absent in the inspected remote database on 2026-08-07. Its state now is **UNKNOWN FROM LOCAL EVIDENCE**.

### Historical evidence recorded locally

The 2026-08-07 baseline record observed 13 `order_items`, 3 `order_uploads`, and no orphan upload parent. It intentionally did not inspect customer-level JSON, filenames, storage keys, or upload contents. It also recorded the preservation chain:

```text
products ← order_items ← order_uploads
orders   ← order_items
```

Those historical rows and relationships must remain intact. The current count and current remote contents are **UNKNOWN FROM LOCAL EVIDENCE**.

## 4. Current read/write-path map

| Structure | Created by | Written by | Read by | Browser-visible? | Provider-coupled? | Historical dependency? | Normalized authority today? | Primary classification |
|---|---|---|---|---|---|---|---|---|
| `products.customization_schema` | Legacy `supabase/schema.sql` | Legacy `supabase/seed.sql` upsert only; no active app writer found | No active application reader found | Not established by a current public response; active catalog reads do not use it | No active runtime use established | Possible legacy Product configuration values; preserve | No | **INSUFFICIENT** |
| `order_items.customization` | Legacy `supabase/schema.sql` | `app/api/orders/route.ts`; `app/api/admin/orders/route.ts`; `app/api/admin/digital-delivery/route.ts` | `app/admin/orders/page.tsx`; `app/api/admin/orders/route.ts`; `app/api/admin/cleanup-uploads/route.ts`; `app/api/order-lookup/route.ts` | Not directly table-visible. Server-derived admin/order responses use selected values; customer lookup omits item JSON itself. | Yes, paths inside it are used to create Supabase Storage signed URLs | Yes — current admin review, fulfillment gating, cleanup, and historical order display rely on the shape | No | **COMPATIBILITY-ONLY REUSE** |
| `order_uploads` | Legacy `supabase/schema.sql` | `app/api/orders/route.ts` inserts one row from the singular photo path; `app/api/admin/orders/route.ts` updates review status | `app/api/admin/cleanup-uploads/route.ts` reads storage keys; review update targets the rows | No direct browser table exposure found | Yes — stores provider-style storage locator, and cleanup uses Supabase Storage | Yes — existing order-item upload records and review state must remain | No | **COMPATIBILITY-ONLY REUSE** |

### Broad legacy customization boundary

`app/domain/customization.ts` parses a broad compatibility object containing customer-looking `note`, `options`, `photoPath`, `photoPaths`, `photoMeta`, and `photoMetas`, plus operational `photoReviewStatus` and delivery `digitalDeliveryPath`/`digitalDeliveryName`. It has no stable field IDs, Product ownership, field kind, configuration revision, or authoritative field constraints. The parser is therefore evidence of a compatibility boundary, not normalized persistence authority.

The completed Task 2.x contracts intentionally separate Product/SKU/selected Variant Options from customer values. Existing order-resolution tests show the broad customization payload remains a sibling through Product/Variant resolution; that does not mean it is durably normalized in the database.

## 5. Upload prototype evidence

`app/api/uploads/route.ts` is a provider-coupled prototype:

- It accepts a multipart `file`, checks declared JPEG/PNG/WebP type and a positive 10 MiB maximum, then uses the server Supabase client.
- It attempts to create a private configured bucket and uploads to a server-generated `drafts/<UUID>.<extension>` key with `upsert: false`.
- It returns the bucket, storage key, original filename, MIME type, and byte size to the browser.
- It does not inspect image bytes/signature or decoded dimensions.
- It has no guest draft owner, opaque receipt, Product/field association, expiry, replacement/remove operation, attachment state, or lifecycle record.

This is not a final provider decision. The approved planning continues to defer Supabase Storage versus Cloudflare R2.

## 6. Order and admin evidence

### Order write path

`app/api/orders/route.ts` accepts the broad sibling customization payload. It requires a singular `photoPath` matching the legacy `drafts/...` format, applies limited note/metadata checks, resolves authoritative Product/Variant/SKU/selected Options/base price server-side, then:

1. writes the broad JSON to `order_items.customization`;
2. derives at most one `order_uploads` row per item from singular `photoPath` and `photoMeta`.

`photoPaths` and `photoMetas` can be shape-parsed but are not used to create corresponding ordered `order_uploads` rows. Therefore multi-image association is not structurally reliable. The route checks browser-supplied metadata but does not establish object existence, receipt identity, or guest ownership. It does not persist Product-owned field identity, configuration revision, ordered field values, crop metadata, or an opaque receipt.

The route's server-side Product/Variant/SKU/base-price resolution is an existing C1 boundary and remains separate from this task. It does not make immutable C1 purchase snapshots persisted; C1 Task 7.4 remains incomplete.

### Admin read and operations path

`app/admin/orders/page.tsx` reads `order_items.customization`; for its singular `photoPath`, it creates a 15-minute Supabase Storage signed URL after server-side admin access. It does not use `order_uploads` as the photo-preview source.

`app/api/admin/orders/route.ts` merges `photoReviewStatus` and digital-delivery fields into `order_items.customization`, updates all `order_uploads.review_status` rows for the item, and blocks later fulfillment transitions when a singular legacy photo is not approved. This confirms operational state is mixed with customer-input-shaped JSON and must not become a new customer-input authority.

`app/api/admin/cleanup-uploads/route.ts` reads both `order_uploads.storage_key` and singular `order_items.customization.photoPath`, lists provider objects under `drafts/`, defaults to dry run, and may delete older unreferenced objects. It has no persisted guest owner, receipt, expiry state, replacement/remove state, attach-once state, retry state, or ordered field association.

`app/api/order-lookup/route.ts` uses `order_items.customization` only for digital-delivery data and provides a separate 15-minute signed URL only when the paid/order-state conditions permit. It does not expose customer photo input.

## 7. Domain compatibility matrix

| Approved requirement | Existing local structure | Supported as-is? | Compatibility only? | Missing? | Evidence |
|---|---|---:|---:|---:|---|
| Stable `CustomizationField` identity | None | No | No | Yes | Task 2.x domain contracts; legacy JSON has no field ID. |
| Product ownership | `products` exists, but legacy JSON has no field ownership relation | No | No | Yes | `supabase/schema.sql`; no active Product config reader. |
| Product-scoped field code | Informal JSON keys only | No | No | Yes | `supabase/seed.sql`; no code constraint or runtime parser. |
| Kind | Informal boolean keys / broad payload | No | No | Yes | `seed.sql`; `app/domain/customization.ts`. |
| Required / active | No established field-level state | No | No | Yes | Legacy schema and current audit. |
| Deterministic position | None | No | No | Yes | Legacy schema/current code. |
| Configuration revision | None | No | No | Yes | Task 2.x domain contracts versus persistence inventory. |
| Strict kind-specific constraints | Route-level prototype checks only | No | No | Yes | `app/api/uploads/route.ts`, `app/api/orders/route.ts`. |
| Normalized text values | Broad JSON | No | Yes, historical snapshot only | Yes | `order_items.customization` active legacy role. |
| Normalized ordered image values | Singular upload derivation; `photoPaths` not structurally attached | No | Yes, historical singular behavior only | Yes | `app/api/orders/route.ts`. |
| Opaque receipt identity | None | No | No | Yes | Upload route returns bucket/key. |
| Crop metadata | None in persistence contract | No | No | Yes | Current route/domain audit. |
| Trusted metadata | Browser metadata is shape/route checked, not object-derived | No | No | Yes | `app/api/orders/route.ts`, `app/api/uploads/route.ts`. |
| Pre-order draft ownership | None | No | No | Yes | Required `order_uploads.order_item_id`; upload route has no owner. |
| Expiry | Cleanup age threshold only, no receipt expiry state | No | No | Yes | `app/api/admin/cleanup-uploads/route.ts`. |
| Replace/remove lifecycle | No persisted lifecycle | No | No | Yes | Current upload/order paths. |
| Order attachment | Existing `order_uploads` attaches to an OrderItem after order creation | No | Yes, retain historical attachment/review behavior | Yes, for approved receipt-safe attachment | `supabase/schema.sql`, order route. |
| Field-to-upload association | None | No | No | Yes | `order_uploads` has only `order_item_id`; route derives singular path. |
| Ordered image association | None | No | No | Yes | No position/field relation; plural paths ignored for upload rows. |
| Historical order compatibility | `order_items.customization` and `order_uploads` | No | Yes | No for preservation itself | Current admin/cleanup/lookup paths and recorded historical rows. |
| Private media access | Server-side Supabase signed URLs for narrowly selected paths | No | Yes, preserve current admin/digital behavior | Yes, for receipt/guest-authorized provider-neutral access | Admin page and order lookup routes. |
| ProductAsset separation | C1 public ProductAsset domain rejects private/order media paths | No | Yes, boundary test coverage exists | Yes, for explicit new receipt boundary enforcement | `tests/admin-product-assets.test.mjs`, current audit. |

## 8. RLS and security baseline

### What local artifacts establish

- Legacy `supabase/schema.sql` enables RLS for `products`, `orders`, `order_items`, and `order_uploads`.
- That file creates only the `products` public-read policy; it grants service-role CRUD on the relevant tables and comments that orders, items, and uploads are backend-only.
- The stored 2026-08-07 baseline records RLS enabled and not forced for all four relevant tables, only a Product SELECT policy, no observed policies on `orders`, `order_items`, or `order_uploads`, and server routes using a service-role client.
- Current application routes construct server clients for the database/storage operations described above. Browser components do not directly query these tables in the inspected paths.

### Not established locally

- Current connected-database RLS, grants, policies, default privileges, or changes after 2026-08-07: **UNKNOWN FROM LOCAL EVIDENCE**.
- Supabase Storage bucket policies and object-level policy behavior: **NOT ESTABLISHED BY LOCAL ARTIFACTS**.
- Any secure guest-owner authorization for the current upload path: absent in inspected code; no alternative persistence mechanism was found.

RLS on an order-attached table does not supply the required pre-order guest ownership, opaque receipt, or lifecycle controls.

## 9. Local migration chronology

| Local artifact | Relevant state | Customization relationship | Applied state supported by local evidence |
|---|---|---|---|
| `supabase/schema.sql` | Legacy bootstrap schema, including the three reviewed structures | Establishes the current legacy shape only | Not authoritative migration history. |
| `supabase/seed.sql` | Legacy Product upsert data | Writes informal `customization_schema` examples | Not production configuration authority. |
| `supabase/operations.sql` | Legacy optional operational logging SQL | No normalized customization persistence | Not authoritative migration history. |
| `20260807151745_expand_configurable_product_catalog.sql` | Local C1 additive catalog expansion artifact | Adds C1 catalog entities/fields; it does not alter `products.customization_schema`, `order_items`, or `order_uploads` | **LOCAL ARTIFACT EXISTS**; no current remote application claim. |
| `20260808120000_add_atomic_catalog_sku_graph_rpc.sql` | Local C1 SKU graph RPC artifact | Catalog/SKU only; migration test excludes `orders` and `order_items` | **LOCAL ARTIFACT EXISTS**; no current remote application claim. |
| `20260810120000_add_atomic_catalog_lifecycle_rpc.sql` | Local C1 catalog lifecycle RPC artifact | Catalog lifecycle/audit only; no reviewed legacy customization structure change | **LOCAL ARTIFACT EXISTS**; no current remote application claim. |

The baseline record correctly said `supabase/migrations/` did not exist during the 2026-08-07 inspection. The folder now exists locally because later C1 work created local artifacts. This is a temporal difference, not evidence that any artifact was applied remotely.

## 10. Historical preservation requirements

Later approved schema work must preserve, without rewrite or inferred reinterpretation:

- every legacy `products.customization_schema` value;
- every historical `order_items.customization` value, including customer-looking inputs and existing operational/digital-delivery fields;
- every `order_uploads` row and its OrderItem relationship;
- the `orders` → `order_items` and `products` → `order_items` relationship behavior;
- the current admin review/fulfillment compatibility behavior, including its singular-photo assumptions, until a separately approved adapter/cutover preserves it safely.

No legacy Product field value, seed example, customer value, filename, storage key, or upload content was read or changed in this task.

## 11. Missing capabilities

Local evidence does not show persistence capable of serving as the new authority for:

- normalized Product-owned field definitions and their bounded configuration;
- normalized field-specific text values and ordered image values;
- opaque receipt identity;
- server-verifiable pre-order guest draft ownership;
- validated/trusted image metadata and optional crop metadata;
- expiry, replacement, removal, attach-once, cleanup-pending, and retry lifecycle state;
- safe Product/field/ordered-image association before Order creation;
- receipt-safe order attachment while retaining historical order-media compatibility.

This list is capability-level only. It specifies no future table, column, type, key, policy, trigger, grant, or migration filename.

## 12. C1 coordination notes

The local C1 records remain:

- C1 progress: **41/61**;
- Task 3.5: **BLOCKED / awaiting business input**;
- BACKFILL AUTHORIZED: **NO**;
- C1 Tasks 3.5, 3.6, 3.7, 3.8, and 7.4: incomplete/frozen.

C1 Task 3.8 owns an additive `order_items` Variant reference and immutable Product/SKU/selected-option/base-price/currency snapshot. C1 Task 7.4 depends on that persistence. This customization task must neither add those snapshots nor treat application-level resolved data as persisted purchase history.

The local C1 migration artifacts above create factual ordering/coordination inputs, but they do not establish applied remote state and this packet does not propose an exact future ordering. Task 3.2 owns the exact additive customization schema proposal and its migration-scope coordination; Task 3.3 is the required human approval stop before any customization migration artifact.

## 13. Unknowns and evidence conflicts

### Unknown from local evidence

- Current connected Supabase schema, rows, RLS, policies, grants, migration history, and whether any local migration artifact has been applied.
- Current values and shapes inside the legacy JSON columns.
- Current Storage bucket/object policies, retention behavior, object existence, and provider configuration.
- Whether the legacy `order_status_logs` relation exists now; the prior stored baseline observed it absent on 2026-08-07.

### Evidence conflict review

No classification-blocking contradiction was found. The only time-sensitive difference is that the older baseline says the local `supabase/migrations/` directory was absent at the time of inspection, while the repository now contains later C1 local artifacts. The distinction between **LOCAL ARTIFACT EXISTS** and **KNOWN APPLIED REMOTELY** resolves this without remote access.

## 14. Capability-level inputs for Task 3.2

Task 3.2 needs to specify, and only after review seek approval for, an additive solution covering these capabilities:

- authoritative normalized Product-owned field persistence;
- normalized field-specific text and ordered image value persistence;
- pre-order draft owner persistence;
- opaque receipt persistence;
- expiry and lifecycle persistence;
- Product/field/ordered-image association before Order creation;
- safe one-time order attachment that preserves legacy `order_items.customization` and `order_uploads` behavior;
- explicit security, privilege, cleanup-concurrency, historical-preservation, and C1 coordination review.

No implementation choice is made here, and no production Product configuration or storage-provider decision is inferred.

## STOP

**Task 3.1 stops here.** This packet is a read-only classification decision. It creates no SQL, migration, table, column, policy, grant, trigger, repository, storage resource, application behavior change, or remote connection. Do not begin Task 3.2 until separately directed.
