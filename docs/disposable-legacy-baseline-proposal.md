# Disposable Legacy Baseline Proposal

## Status and approval gate

**DISPOSABLE FRESH APPLY: FAIL — MISSING LEGACY BASELINE**

This is a human-reviewable design document. It is not executable SQL, a
production migration, production provenance, a backfill, seed data, or
authorization to modify any connected database.

**HUMAN APPROVAL REQUIRED BEFORE EXECUTABLE BASELINE SQL.**

## Purpose and claim boundary

`20260807151745_expand_configurable_product_catalog.sql` begins by altering
`public.products`. A fresh local Supabase PostgreSQL database has no such table,
which produced SQLSTATE `42P01` before Phase A, Phase B, or the atomic
publication RPC could run.

The future schema-only bootstrap is disposable-only and supports this order:

```text
Supabase platform baseline
-> FigMemento legacy business baseline (zero rows)
-> 20260807151745
-> 20260808120000
-> 20260810120000
-> 20260812120000 Phase A
-> 20260812121000 Phase B
-> 20260812122000 atomic publication RPC
```

It proves only that the checked-in migrations can extend the reconstructed
high-confidence pre-C1 schema locally. It does not prove complete historical
production reconstruction, original migration provenance, historical
ACL/event-trigger/default-ACL fidelity, production deployment safety, or any
backfill/fixture/data migration.

## Evidence hierarchy and conflicts

| Priority | Evidence | Decision use |
|---|---|---|
| Highest | Human-provided real Supabase schema export | Controlling Product DDL and confirmation of the five legacy business tables. Context-only: never copy it verbatim into SQL. |
| High | `docs/catalog-schema-baseline.md` | Read-only actual-environment record of shape, FKs, constraints, indexes, RLS and grants. |
| Medium | `supabase/schema.sql` | Legacy bootstrap only where it agrees with higher-priority evidence; provides locally stored `set_updated_at()` body. |
| Secondary | Seed, application code, tests, docs, local Git | Compatibility/usage evidence only. |

| Conflict | Higher-priority evidence | Legacy assumption | Proposal decision |
|---|---|---|---|
| `order_status_logs` | Actual baseline: absent | `schema.sql` / `operations.sql` define it | Exclude; no current migration requires it. |
| Coupon checks | No `max_redemptions > 0` or `redemption_count >= 0` checks recorded | `schema.sql` adds them | Do not add stricter checks. |
| Coupon RLS/trigger | RLS enabled; no coupon update trigger recorded | Legacy bootstrap differs | Exclude historical RLS/trigger reproduction. |
| Default ACL/event trigger | Actual baseline has untracked behavior | Legacy files do not reproduce it | Exclude; new C1 tables secure themselves. |

## Two layers

### A. Supabase platform baseline — exclude from FigMemento bootstrap

Local Supabase platform initialization owns `auth`, `auth.users`, `public`,
Supabase roles (`anon`, `authenticated`, `service_role`) and platform migration
relations. The future FigMemento file must never create a fake `auth.users`,
roles, or remote-like migration history.

### B. FigMemento legacy business baseline — future schema-only artifact

The future artifact creates only empty approved business objects. It inserts no
Products, orders, customers, uploads, coupons, fixtures, or migration rows.

## Final decision table

| Object | Include? | Required by | Evidence | Confidence | Why |
|---|---:|---|---|---|---|
| `pgcrypto` / `gen_random_uuid()` | Yes | UUID defaults in all migrations | Human Product DDL, baseline record, legacy DDL | High | Ensure capability idempotently in future local SQL. |
| `public.set_updated_at()` | Yes | C1 expand and Phase B triggers | Baseline record + matching `schema.sql` definition | High | Referenced but not created by current migrations. |
| `public.products` | Yes | All six migrations; first migration alters it | Human export + baseline record | High | Direct fresh-apply precondition. |
| `public.orders` | Yes, continuity | No current migration directly | Human export confirmation + baseline | High | Required legacy FK graph for later C1 Task 3.8 verification. |
| `public.order_items` | Yes, continuity | No current migration directly | Human export + baseline | High | Future C1 Task 3.8 target; preserves Product history shape. |
| `public.order_uploads` | Yes, continuity | No current migration directly | Human export + baseline | High | Preserves legacy order-media relation only. |
| `public.coupons` | Yes, continuity | No current migration directly | Human export + baseline | High | Existing business table/application compatibility. |
| `auth.users` | No | `orders.customer_id` FK | Platform and baseline record | High | Supabase platform provides it. |
| `public.rls_auto_enable()` | No | None | Baseline record only | Medium | Not required to execute migrations. |
| `ensure_rls` event trigger | No | None | Baseline record only | Medium | Not required to execute migrations. |
| Default ACL | No | None | Baseline record only | Unknown | Current C1 migrations own new-table security. |
| Legacy policies/grants | No, fresh apply | None | Baseline + legacy DDL | Medium | Defer to later behavioral testing decision. |
| `public.order_status_logs` | No | None | Actual baseline says absent | High | Do not let legacy bootstrap override actual record. |

## High-confidence legacy shape

### `public.products` — direct precondition

Human-provided real schema is controlling. The future pre-C1 table must have:

| Column | Type | Nullability | Default / constraint |
|---|---|---:|---|
| `id` | `uuid` | not null | `gen_random_uuid()`; primary key |
| `slug` | `text` | not null | unique |
| `name` | `text` | not null | — |
| `category` | `text` | not null | — |
| `description` | `text` | not null | `''::text` |
| `price_cents` | `integer` | not null | `CHECK (price_cents >= 0)` |
| `currency` | `text` | not null | `'USD'::text`; USD check |
| `art_key` | `text` | nullable | — |
| `image_urls` | `text[]` | not null | `'{}'::text[]` |
| `customization_schema` | `jsonb` | not null | `'{}'::jsonb` |
| `is_digital` | `boolean` | not null | `false` |
| `is_published` | `boolean` | not null | `false` |
| `created_at` | `timestamptz` | not null | `now()` |
| `updated_at` | `timestamptz` | not null | `now()` |

`category_id`, `seo`, and `lifecycle` must not exist: `20260807151745` adds
them. The migration also requires existing `id`, `slug`, and `is_published`.

### `public.orders` — continuity, not direct migration requirement

Include its actual high-confidence legacy shape: UUID PK; unique
`order_number`; nullable email; nullable `customer_id -> auth.users(id)` with
`ON DELETE SET NULL`; checked status/payment/fulfillment states; non-negative
subtotal/shipping/discount/total; nullable `coupon_code`; USD currency; unique
nullable Stripe IDs; nullable tracking values and JSONB shipping address; and
timestamps. No migration directly alters this table.

### `public.order_items` — continuity and Task 3.8 target

Include `id`, `order_id`, nullable `product_id`, `product_name`,
`unit_price_cents`, `quantity`, `customization`, and `created_at`, with UUID PK;
`order_id -> orders.id ON DELETE CASCADE`; `product_id -> products.id ON DELETE
SET NULL`; non-negative price; positive quantity; default quantity one; and
default empty customization JSON. It must not pre-create C1 Variant/SKU or
snapshot columns; Task 3.8 owns those additions.

### `public.order_uploads` — legacy order attachment only

Include UUID PK; required `order_item_id -> order_items.id ON DELETE CASCADE`;
required storage key; nullable filename/content type/positive-if-present size;
review status defaulting to `pending` with the recorded allowed values; and
creation timestamp. It is not the future normalized CustomerUpload workflow.

### `public.coupons` — continuity, not direct migration requirement

Include UUID PK; unique code; checked `percent | fixed` discount type; positive
discount value; non-negative minimum subtotal defaulting to zero; nullable max
redemptions; non-null redemption count defaulting to zero; active flag, expiry,
and timestamps. Do not add unrecorded maximum-redemption/redemption-count
checks from `schema.sql`.

## Function, extension, RLS, and ACL decisions

- Future local SQL should ensure `pgcrypto` UUID capability idempotently.
- `public.set_updated_at()` should use the exact locally stored, matching
  invoker-rights body: set `NEW.updated_at = now()` and return `NEW`.
- Do not reproduce legacy table RLS, Product read policy, service-role grants,
  `rls_auto_enable`, `ensure_rls`, function ACLs, schema ACLs, or default ACLs
  for the migration-only gate.
- This exclusion is deliberate: it limits the result to migration-critical
  compatibility. Later runtime/RPC tests must define their permissions
  separately.

## Future execution order and location

```text
Local Supabase platform (includes auth.users and roles)
-> pgcrypto / UUID capability
-> public.set_updated_at()
-> public.products
-> public.orders
-> public.order_items
-> public.order_uploads
-> public.coupons
```

Recommended future path:

```text
tests/database/fixtures/legacy-schema-before-c1.sql
```

It must remain outside `supabase/migrations/` and must not be created until
human approval. `supabase/seed.sql` remains separate, unchanged, and disabled
for migration-only tests.

## Future executable acceptance criteria

1. Runs only on a disposable local Supabase DB and uses no remote URL/command.
2. Creates zero business rows; seed remains disabled.
3. Creates only objects approved above; no file in `supabase/migrations/`.
4. Leaves all existing migrations unchanged and is repeatable on a clean local
   Supabase platform DB.
5. Allows all six current migrations to apply in order.
6. Produces the documented Product shape without `category_id`, `seo`, or
   `lifecycle` before C1 begins.
7. Creates FKs after their platform/business targets, and uses real
   platform-provided `auth.users`.
8. Justifies the exact `set_updated_at()` definition and omits noncritical
   event/default-ACL reconstruction.
9. Does not perform runtime RPC behavior, concurrency, rerun, Task 4.5,
   backfill, deployment, or remote migration work.

## Remaining scope limits and required approval

There is no remaining critical gap for a migration-execution-focused,
disposable bootstrap if this scope is approved. Full production schema
provenance, historical security/event-trigger fidelity, and production deployment
remain unresolved and out of scope.

**HUMAN APPROVAL REQUIRED BEFORE EXECUTABLE BASELINE SQL.** The approval must
explicitly confirm that this is a disposable-only, schema-only compatibility
fixture at the non-migration path above—not an initial production migration or
a substitute for remote schema history.

## Unchanged status

- DISPOSABLE FRESH APPLY: **FAIL — MISSING LEGACY BASELINE**
- DISPOSABLE RUNTIME BEHAVIOR / CONCURRENCY / RERUN: **PENDING**
- Task 4.5: **NOT STARTED**
- Customization: **21/70**
- C1: **41/61**; Task 3.5 remains blocked
- BACKFILL AUTHORIZED: **NO**
