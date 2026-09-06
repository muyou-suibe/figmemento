# PhotoGift Catalog Schema Baseline

## Gate outcome

**PASSED — the read-only C1 schema baseline gate is complete.**

Inspection date: 2026-08-07 (Asia/Shanghai)

The connected Supabase PostgreSQL database was inspected through `psql` using environment-provided connection fields. Every PostgreSQL invocation used `--single-transaction`, `-v ON_ERROR_STOP=1`, and an explicit first command of `SET TRANSACTION READ ONLY;`. The database reported `transaction_read_only = on` for the verified connection.

Only `SELECT`, `SHOW`, and read-only `pg_catalog`/information functions were used. No credential or password-bearing connection string was printed or persisted. No remote write, migration creation/application, Product mutation, publication change, fixture import, migration-history change, or implementation-code change occurred.

Connection evidence:

- Database: `postgres`
- User: `postgres`
- PostgreSQL server: `17.6`
- PostgREST OpenAPI document version observed earlier: `14.15` (this is not the PostgreSQL server version)
- `supabase/migrations/` did not exist before or after baseline inspection.

## Relevant schemas and relations

| Schema | Owner | Relevant relation | Kind | RLS enabled | RLS forced |
|---|---|---|---|---:|---:|
| `public` | `pg_database_owner` | `products` | table | yes | no |
| `public` | `pg_database_owner` | `orders` | table | yes | no |
| `public` | `pg_database_owner` | `order_items` | table | yes | no |
| `public` | `pg_database_owner` | `order_uploads` | table | yes | no |
| `public` | `pg_database_owner` | `coupons` | table | yes | no |
| `auth` | `supabase_admin` | `users` | table | yes | no |

The five `public` business tables are owned by `postgres`. `auth.users` is relevant only because `orders.customer_id` references it. No C1 target catalog relation currently exists: `categories`, `product_options`, `product_option_values`, `product_variants`, `product_variant_values`, `product_assets`, `product_fulfillment_configs`, and a catalog-admin audit relation are all absent.

`public.order_status_logs` is also absent despite appearing in repository bootstrap SQL. No sequence backs the UUID identities; UUID defaults use `gen_random_uuid()`.

## Columns

`Nullable = no` means the remote column is `NOT NULL`.

### `public.products`

| Column | Type | Nullable | Default |
|---|---|---:|---|
| `id` | `uuid` | no | `gen_random_uuid()` |
| `slug` | `text` | no | — |
| `name` | `text` | no | — |
| `category` | `text` | no | — |
| `description` | `text` | no | `''::text` |
| `price_cents` | `integer` | no | — |
| `currency` | `text` | no | `'USD'::text` |
| `art_key` | `text` | yes | — |
| `image_urls` | `text[]` | no | `'{}'::text[]` |
| `customization_schema` | `jsonb` | no | `'{}'::jsonb` |
| `is_digital` | `boolean` | no | `false` |
| `is_published` | `boolean` | no | `false` |
| `created_at` | `timestamptz` | no | `now()` |
| `updated_at` | `timestamptz` | no | `now()` |

There is no soft-delete timestamp, deletion flag, lifecycle status, Category FK, Variant/SKU FK, ProductAsset relationship, or FulfillmentConfig relationship.

### `public.orders`

| Column | Type | Nullable | Default |
|---|---|---:|---|
| `id` | `uuid` | no | `gen_random_uuid()` |
| `order_number` | `text` | no | — |
| `customer_email` | `text` | yes | — |
| `customer_id` | `uuid` | yes | — |
| `status` | `text` | no | `'pending_payment'::text` |
| `payment_status` | `text` | no | `'unpaid'::text` |
| `fulfillment_status` | `text` | no | `'awaiting_payment'::text` |
| `subtotal_cents` | `integer` | no | `0` |
| `shipping_cents` | `integer` | no | `0` |
| `discount_cents` | `integer` | no | `0` |
| `total_cents` | `integer` | no | `0` |
| `currency` | `text` | no | `'USD'::text` |
| `stripe_checkout_session_id` | `text` | yes | — |
| `stripe_payment_intent_id` | `text` | yes | — |
| `tracking_number` | `text` | yes | — |
| `tracking_carrier` | `text` | yes | — |
| `tracking_status` | `text` | yes | — |
| `shipping_address` | `jsonb` | yes | — |
| `created_at` | `timestamptz` | no | `now()` |
| `updated_at` | `timestamptz` | no | `now()` |
| `coupon_code` | `text` | yes | — |

### `public.order_items`

| Column | Type | Nullable | Default |
|---|---|---:|---|
| `id` | `uuid` | no | `gen_random_uuid()` |
| `order_id` | `uuid` | no | — |
| `product_id` | `uuid` | yes | — |
| `product_name` | `text` | no | — |
| `unit_price_cents` | `integer` | no | — |
| `quantity` | `integer` | no | `1` |
| `customization` | `jsonb` | no | `'{}'::jsonb` |
| `created_at` | `timestamptz` | no | `now()` |

No Variant/SKU reference, Product slug snapshot, SKU snapshot, selected-option snapshot, or explicit item currency snapshot exists.

### `public.order_uploads`

| Column | Type | Nullable | Default |
|---|---|---:|---|
| `id` | `uuid` | no | `gen_random_uuid()` |
| `order_item_id` | `uuid` | no | — |
| `storage_key` | `text` | no | — |
| `original_filename` | `text` | yes | — |
| `content_type` | `text` | yes | — |
| `file_size_bytes` | `integer` | yes | — |
| `review_status` | `text` | no | `'pending'::text` |
| `created_at` | `timestamptz` | no | `now()` |

No filename, storage key, upload content, or customer-level value was read during this baseline.

### `public.coupons`

| Column | Type | Nullable | Default |
|---|---|---:|---|
| `id` | `uuid` | no | `gen_random_uuid()` |
| `code` | `text` | no | — |
| `discount_type` | `text` | no | — |
| `discount_value` | `integer` | no | — |
| `min_subtotal_cents` | `integer` | no | `0` |
| `max_redemptions` | `integer` | yes | — |
| `redemption_count` | `integer` | no | `0` |
| `active` | `boolean` | no | `true` |
| `expires_at` | `timestamptz` | yes | — |
| `created_at` | `timestamptz` | no | `now()` |
| `updated_at` | `timestamptz` | no | `now()` |

## Constraints and relationships

No exclusion constraint is present on the relevant tables. All observed constraints are validated, non-deferrable, and initially immediate.

### Primary keys and unique constraints

| Table | Primary key | Other UNIQUE constraints |
|---|---|---|
| `products` | `products_pkey (id)` | `products_slug_key (slug)` |
| `orders` | `orders_pkey (id)` | `order_number`, `stripe_checkout_session_id`, `stripe_payment_intent_id` |
| `order_items` | `order_items_pkey (id)` | none |
| `order_uploads` | `order_uploads_pkey (id)` | none |
| `coupons` | `coupons_pkey (id)` | `coupons_code_key (code)` |

### Foreign keys

All foreign keys use `ON UPDATE NO ACTION`.

| Source | Target | ON DELETE |
|---|---|---|
| `orders.customer_id` | `auth.users.id` | `SET NULL` |
| `order_items.order_id` | `orders.id` | `CASCADE` |
| `order_items.product_id` | `products.id` | `SET NULL` |
| `order_uploads.order_item_id` | `order_items.id` | `CASCADE` |

No other schema contains an FK to or from these five business tables. No dependent view references them.

The Product preservation chain is `products` ← `order_items` ← `order_uploads`, with `orders` ← `order_items`. A Product deletion would null `order_items.product_id`, so C1 must preserve Product identity and add snapshots rather than relying on deletion behavior.

### CHECK constraints

| Table | Checks |
|---|---|
| `products` | `price_cents >= 0`; `currency = 'USD'` |
| `orders` | allowed `status`; allowed `payment_status`; allowed `fulfillment_status`; non-negative subtotal/shipping/discount/total; `currency = 'USD'` |
| `order_items` | `unit_price_cents >= 0`; `quantity > 0` |
| `order_uploads` | `file_size_bytes > 0`; allowed `review_status` |
| `coupons` | `discount_type IN ('percent','fixed')`; `discount_value > 0`; `min_subtotal_cents >= 0` |

Remote `coupons` has no CHECK for positive-or-null `max_redemptions` and no CHECK for non-negative `redemption_count`.

## Indexes

All indexes are valid B-tree indexes. No expression, included-column, or partial/predicate index is present.

| Table | Index | Unique | Columns |
|---|---|---:|---|
| `products` | `products_pkey` | yes | `id` |
| `products` | `products_slug_key` | yes | `slug` |
| `products` | `products_published_category_idx` | no | `is_published, category` |
| `orders` | `orders_pkey` | yes | `id` |
| `orders` | `orders_order_number_key` | yes | `order_number` |
| `orders` | `orders_stripe_checkout_session_id_key` | yes | `stripe_checkout_session_id` |
| `orders` | `orders_stripe_payment_intent_id_key` | yes | `stripe_payment_intent_id` |
| `orders` | `orders_customer_idx` | no | `customer_id` |
| `orders` | `orders_email_idx` | no | `customer_email` |
| `order_items` | `order_items_pkey` | yes | `id` |
| `order_items` | `order_items_order_idx` | no | `order_id` |
| `order_uploads` | `order_uploads_pkey` | yes | `id` |
| `order_uploads` | `order_uploads_item_idx` | no | `order_item_id` |
| `coupons` | `coupons_pkey` | yes | `id` |
| `coupons` | `coupons_code_key` | yes | `code` |

## Triggers, functions, and migration-safety hooks

### Row triggers

| Table | Trigger | Timing | Function |
|---|---|---|---|
| `products` | `products_set_updated_at` | before update, each row | `public.set_updated_at()` |
| `orders` | `orders_set_updated_at` | before update, each row | `public.set_updated_at()` |

There is no `coupons_set_updated_at` trigger and no relevant trigger on `order_items` or `order_uploads`.

`public.set_updated_at()` is an invoker-rights PL/pgSQL trigger function that replaces `NEW.updated_at` with `now()`. Its definition matches the legacy bootstrap function.

### RLS auto-enable event trigger

Remote PostgreSQL contains a repository-untracked `public.rls_auto_enable()` SECURITY DEFINER event-trigger function and enabled `ensure_rls` event trigger. At `ddl_command_end`, it reacts to `CREATE TABLE`, `CREATE TABLE AS`, and `SELECT INTO` in `public` and enables RLS on the new table. The function was inspected but never invoked.

This changes migration safety details: a C1 migration must still define explicit policies and grants/revokes after creating each table. Automatic RLS enablement is defense in depth, not a replacement for C1 security DDL.

Other enabled Supabase platform event triggers watch extension and PostgREST DDL/drop activity. None was invoked by this inspection.

## Security baseline

### RLS and policies

All five business tables have RLS enabled and not forced. Only one policy exists:

| Table | Policy | Mode | Roles | Command | USING | WITH CHECK |
|---|---|---|---|---|---|---|
| `products` | `published products are readable` | permissive | `PUBLIC` | `SELECT` | `is_published = true` | — |

`orders`, `order_items`, `order_uploads`, and `coupons` have no RLS policy. No explicit policy grants browser access to customer/order/upload data.

### Effective role privileges

`anon`, `authenticated`, and `service_role` all have `USAGE` but not `CREATE` on `public`. `service_role` has `BYPASSRLS`; `anon` and `authenticated` do not.

For every one of the five business tables:

| Role | SELECT/INSERT/UPDATE/DELETE | TRUNCATE/REFERENCES/TRIGGER/MAINTAIN |
|---|---|---|
| `anon` | none | all four granted |
| `authenticated` | none | all four granted |
| `service_role` | all four granted | all four granted |

Consequently, the Product SELECT policy exists but `anon`/`authenticated` do not currently have the table-level `SELECT` privilege needed to use it. C1 must not assume that policy presence alone provides public access.

The same unusual non-DML grants are present in `postgres` default ACLs for future `public` tables. C1 migrations must explicitly revoke unsupported browser-role privileges and then grant only the intended minimum privileges. RLS does not substitute for privilege hygiene, particularly for `TRUNCATE`.

Both public functions (`set_updated_at` and `rls_auto_enable`) currently grant `EXECUTE` to `PUBLIC`, so `anon`, `authenticated`, and `service_role` report effective execute privilege. C1 does not invoke or depend on direct RPC access to either function.

No business-table sequence grants are required because the tables use UUID identities.

## Migration history

The connected database has no `supabase_migrations` schema and no `supabase_migrations.schema_migrations` relation. Therefore there is no accessible Supabase CLI-style business migration history to reconcile.

Platform subsystem histories exist but do not establish PhotoGift business schema provenance:

| Relation | Rows | Purpose |
|---|---:|---|
| `auth.schema_migrations` | 77 | Supabase Auth subsystem |
| `realtime.schema_migrations` | 81 | Supabase Realtime subsystem |
| `storage.migrations` | 61 | Supabase Storage subsystem |

The first C1 timestamped migration must therefore treat this baseline as its actual starting state. It must not claim that `schema.sql`, `seed.sql`, `coupons.sql`, or `operations.sql` were previously applied as tracked migrations. Applying any migration remains a separate, explicitly authorized deployment operation.

## Product migration evidence

Only aggregate catalog metadata was inspected; no customer data was read.

| Measure | Remote result |
|---|---:|
| Total Products | 22 |
| Published | 22 |
| Unpublished | 0 |
| Digital indicator = true | 3 |
| Digital indicator = false | 19 |
| Distinct text categories | 3 |
| Minimum `price_cents` | 790 |
| Maximum `price_cents` | 6990 |
| Duplicate slug groups | 0 |
| Missing/blank/padded slug | 0 |
| Missing/blank name | 0 |
| Missing/blank category | 0 |
| Null or negative price | 0 |
| Missing or non-USD currency | 0 |
| Null publication/digital flag | 0 |
| Missing `art_key` | 0 |
| Null `image_urls` or `customization_schema` | 0 |

Category distribution:

| Category | Products |
|---|---:|
| `3D keepsakes` | 16 |
| `Digital gifts` | 3 |
| `Pet memories` | 3 |

Currency distribution is `USD = 22`.

Every current Product has structurally usable identity, legacy price, currency, publication state, and physical/digital indicator evidence. All 22 Products lack a Variant/SKU relation and will require later default-Variant preflight mapping. The binary `is_digital` value supplies an explicit fulfillment input, but C1 must not invent `production_mode`, `supply_method`, SKU code, or other business data: Task 3.5 still requires a reviewed per-Product mapping before the guarded backfill is created.

There is no soft-delete state to preserve beyond the current row set; all 22 current rows are published. C1 must preserve those IDs and publication values exactly.

The repository seed contains 22 slugs, and all 22 overlap the 22 remote slugs; there are no remote-only or fixture-only slugs. This is evidence of slug overlap only. It does **not** prove provenance or make repository fixtures a production migration source, even though count and category/publication/digital aggregates also correspond.

## Historical order preservation evidence

No customer email, shipping address, Stripe identifier, filename, storage key, customization JSON, or upload content was selected or recorded.

| Measure | Remote result |
|---|---:|
| Orders | 11 |
| Order items | 13 |
| Order uploads | 3 |
| Order items with `product_id IS NULL` | 0 |
| Order items with `product_id IS NOT NULL` | 13 |
| Orphan Product references | 0 |
| Distinct Products referenced by order items | 6 |
| Products with historical order references | 6 |
| Products without historical order references | 16 |
| Order items with missing parent Order | 0 |
| Order uploads with missing parent OrderItem | 0 |

All current order-item Product references are valid. The expand migration must preserve every Product ID and all existing FKs. The six historically referenced Products especially prohibit destructive identity replacement. Additive Variant references and immutable snapshot fields are required later because current order items preserve only Product ID/name, unit price, quantity, and broad customization data.

## Audit facility assessment

`auth.audit_log_entries` exists for the Supabase Auth subsystem, but it is not a compatible PhotoGift catalog/admin audit facility. No public catalog audit relation exists, and the legacy `order_status_logs` relation is absent remotely.

The approved C1 decision therefore resolves to creating a narrow catalog/admin audit facility in the later expand-schema migration. It must cover publish, unpublish, retire, and destructive-state mutation attempts without storing secrets, customer-private content, or payment-sensitive data.

## Legacy bootstrap difference matrix

The repository files below remain **legacy bootstrap inputs, not authoritative migration history**:

- `supabase/schema.sql`
- `supabase/seed.sql`
- `supabase/coupons.sql`
- `supabase/operations.sql`

| Area | Remote actual state | Legacy repository assumption | Identity | Data preservation | Order compatibility | RLS/grants | Migration ordering | Approved C1 architecture |
|---|---|---|---|---|---|---|---|---|
| Migration history | No `supabase_migrations` schema/relation; only platform subsystem histories | Flat SQL comments imply manual execution order but provide no tracked history | none directly | remote is authoritative | none directly | security provenance cannot be inferred | first migration starts from this recorded state; never replay legacy files wholesale | no change; reinforces timestamped migrations and baseline-first rule |
| Public relation set | Five business tables; no `order_status_logs` | `schema.sql` and `operations.sql` define `order_status_logs` | no Product identity change | no operational-log data exists to preserve | no FK from missing log table | missing table has no RLS/grants | do not assume it exists or recreate it incidentally | no change; create a separate narrow catalog audit facility as approved |
| Catalog target relations | All C1 Category/Option/Variant/Asset/Fulfillment relations absent | Legacy SQL has only flat Product model | all 22 Product IDs must remain stable | additive expansion required | later order fields must be additive | every new table needs explicit security | expand schema before backfill/cutover | exactly matches approved C1 target |
| Coupon checks | No positive-or-null check on `max_redemptions`; no non-negative check on `redemption_count` | `schema.sql` includes both; `coupons.sql` omits both | none | preserve current Coupon rows/behavior; C1 must not silently tighten unrelated data | none | none | do not copy `schema.sql` checks into C1 unintentionally | no architecture change; Coupon cleanup is outside C1 |
| Coupon trigger | No `coupons_set_updated_at` trigger | `schema.sql` defines it | none | current update behavior differs from bootstrap | none | none | do not assume trigger exists | no C1 change; catalog migration must not fix unrelated Coupon behavior |
| Coupon RLS | RLS enabled, no policies | Legacy SQL does not explicitly enable Coupon RLS | none | backend-only current behavior preserved | none | remote is stricter than file text | preserve actual RLS, do not replay assumptions | compatible with server-only boundaries |
| Product policy versus grants | Product SELECT policy exists, but `anon`/`authenticated` lack SELECT | Legacy creates policy but does not explicitly grant browser SELECT | none | published rows remain server-readable | no order effect | public policy is ineffective without table SELECT | C1 must deliberately choose and encode read grants/policies; no implicit inheritance | compatible with dedicated server read models and explicit policy design |
| Table ACLs/default ACLs | Browser roles lack DML but have TRUNCATE/REFERENCES/TRIGGER/MAINTAIN; service role has broad privileges | Legacy explicitly grants service-role DML only | none | unsupported privileges must not be propagated | no direct order data change during C1 | material privilege drift | create table, allow auto-RLS, then explicitly revoke/grant and add policies in the same migration | no architecture change; strengthens approved explicit-grant requirement |
| RLS auto-enable hook | `ensure_rls` event trigger automatically enables RLS on new public tables | No equivalent in the four legacy files | none | none | none | defense in depth but no policies created | migration must account for event-trigger side effect and still define explicit security | compatible with approved security design |
| Updated-at triggers | Product and Order triggers exist; Coupon trigger missing | `schema.sql` defines all three | none | preserve actual Product/Order timestamp behavior | Order behavior matches | none | avoid unrelated Coupon repair | no C1 change |
| Seed correspondence | 22 remote Products; all 22 seed slugs overlap; all remote Products published | `seed.sql` upserts and publishes 22 fixture rows despite “21-SKU” comment | remote UUIDs, not seed text, are authoritative | preserve remote rows/publication exactly | six Products have historical references | none | fixtures cannot be used as migration input | matches approved fixture isolation |
| Historical orders | 11 Orders, 13 OrderItems, 3 uploads; six Products referenced; no orphans | Legacy schema describes the same FK chain but is not proof of current data | Product IDs must not be replaced | historical rows/FKs must remain | additive snapshots/Variant refs required later | private tables remain backend-only | expand before backfill and application cutover | matches approved minimal order compatibility scope |
| Public functions | `set_updated_at` and `rls_auto_enable` executable by PUBLIC | Legacy defines only `set_updated_at` and does not document PUBLIC function ACLs | none | no function is invoked by C1 baseline | none | function ACLs require explicit review | C1 must not expose new privileged RPCs by default | compatible with server-side command boundary |

## Conflict review and required later safeguards

No discovered difference requires changing the approved C1 business model, entity ownership, expand-and-contract strategy, two-migration split, or schema-baseline gate. The differences refine implementation safeguards already required by the design:

1. The expand migration must be additive and preserve all Product and order identities.
2. The enabled `ensure_rls` event trigger will automatically enable RLS on new public tables, but the migration must still add explicit policies and immediately normalize grants/revokes.
3. Browser-role default ACLs must not leak `TRUNCATE`, `TRIGGER`, `REFERENCES`, or `MAINTAIN` to new C1 tables.
4. The absent Supabase CLI migration relation means no legacy SQL may be replayed or marked as applied; the first timestamped migration starts from this documented state.
5. The missing `order_status_logs` table is not a reusable catalog audit facility; C1 will add the already-approved narrow catalog/admin audit relation.
6. All 22 Products require a reviewed default-Variant mapping before guarded backfill creation. Slug overlap with fixtures does not waive that preflight.
7. The six Products referenced by historical order items must retain their IDs and relationship integrity; all snapshot changes remain additive.
8. Current Product publication/deletion state must remain unchanged: all 22 Products are currently published and no soft-delete field exists.

## Baseline gate completion

Tasks 1.2–1.7 may be marked complete because:

- the read-only inspection method was independently verified for every invocation;
- all required schema, constraint, index, trigger/function, security, grant, migration-history, Product, and historical-order evidence is recorded;
- every relevant difference from the four legacy bootstrap files is classified;
- no approval-level conflict changes the approved C1 architecture or safe high-level migration strategy;
- `supabase/migrations/` remains absent;
- no remote or implementation mutation occurred.

This gate permits later C1 implementation planning to create the expand-schema migration only when the user separately resumes the change. It does not authorize migration creation, application, Product backfill, publication changes, or Task 2 work in this execution.
