import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const fixtureUrl = new URL("./database/fixtures/legacy-schema-before-c1.sql", import.meta.url);
const fixturePath = fileURLToPath(fixtureUrl);
const source = readFileSync(fixtureUrl, "utf8");
const executableSql = source
  .replace(/--[^\n]*/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .toLowerCase();

function tableBlock(tableName) {
  const match = source.match(new RegExp(`create table public\\.${tableName} \\(([\\s\\S]*?)\\n\\);`, "i"));
  assert.ok(match, `expected public.${tableName} create-table block`);
  return match[1];
}

function assertContainsAll(block, requiredFragments) {
  const normalized = block.replace(/\s+/g, " ").toLowerCase();
  for (const fragment of requiredFragments) {
    assert.ok(normalized.includes(fragment.toLowerCase()), `expected fragment: ${fragment}`);
  }
}

test("disposable legacy baseline is a schema-only non-migration fixture", () => {
  assert.equal(relative(process.cwd(), fixturePath).includes("supabase/migrations"), false);
  assert.match(source, /DISPOSABLE LOCAL TEST FIXTURE ONLY/i);
  assert.match(source, /NOT A PRODUCTION MIGRATION/i);
  assert.match(source, /NOT AUTHORITATIVE HISTORICAL MIGRATION PROVENANCE/i);
  assert.match(source, /SCHEMA ONLY[^\n]*ZERO BUSINESS DATA/i);
  assert.match(source, /DO NOT APPLY TO REMOTE OR CONNECTED DATABASES/i);
  assert.match(executableSql, /create extension if not exists "pgcrypto"/);
  assert.match(executableSql, /create function public\.set_updated_at\(\)/);
  assert.doesNotMatch(executableSql, /(?:^|;)\s*(?:insert|update|delete|copy|merge)\b/m);
  assert.doesNotMatch(executableSql, /\bdrop\s+/);
  assert.doesNotMatch(executableSql, /https?:\/\/|project[-_ ]?ref|database_url|service[_-]?role\s+(?:key|secret)/);
});

test("disposable legacy baseline has the exact approved Product precondition", () => {
  const products = tableBlock("products");
  assertContainsAll(products, [
    "id uuid not null default gen_random_uuid()",
    "slug text not null",
    "name text not null",
    "category text not null",
    "description text not null default ''::text",
    "price_cents integer not null",
    "currency text not null default 'USD'::text",
    "art_key text",
    "image_urls text[] not null default '{}'::text[]",
    "customization_schema jsonb not null default '{}'::jsonb",
    "is_digital boolean not null default false",
    "is_published boolean not null default false",
    "created_at timestamp with time zone not null default now()",
    "updated_at timestamp with time zone not null default now()",
    "constraint products_pkey primary key (id)",
    "constraint products_slug_key unique (slug)",
    "check (price_cents >= 0)",
    "check (currency = 'USD'::text)",
  ]);
  assert.doesNotMatch(products, /\bcategory_id\b|\bseo\b|\blifecycle\b/i);
});

test("disposable legacy baseline preserves only approved legacy FK graph", () => {
  const orders = tableBlock("orders");
  const orderItems = tableBlock("order_items");
  const orderUploads = tableBlock("order_uploads");
  const coupons = tableBlock("coupons");

  assertContainsAll(orders, [
    "constraint orders_pkey primary key (id)",
    "constraint orders_order_number_key unique (order_number)",
    "foreign key (customer_id) references auth.users(id)",
    "on update no action on delete set null",
  ]);
  assertContainsAll(orderItems, [
    "foreign key (order_id) references public.orders(id)",
    "on update no action on delete cascade",
    "foreign key (product_id) references public.products(id)",
    "on update no action on delete set null",
    "customization jsonb not null default '{}'::jsonb",
  ]);
  assertContainsAll(orderUploads, [
    "foreign key (order_item_id) references public.order_items(id)",
    "on update no action on delete cascade",
    "storage_key text not null",
  ]);
  assertContainsAll(coupons, [
    "constraint coupons_code_key unique (code)",
    "max_redemptions integer",
    "redemption_count integer not null default 0",
  ]);
  assert.doesNotMatch(coupons, /max_redemptions[^\n]*>\s*0|redemption_count[^\n]*>=\s*0/i);
});

test("disposable legacy baseline excludes historical security and future schema", () => {
  const createdTables = [...source.matchAll(/create table public\.([a-z_]+)/gi)].map((match) => match[1]);
  assert.deepEqual(createdTables, ["products", "orders", "order_items", "order_uploads", "coupons"]);
  assert.doesNotMatch(executableSql, /create table\s+auth\.users/);
  assert.doesNotMatch(executableSql, /order_status_logs|rls_auto_enable|ensure_rls|create policy|grant |revoke |enable row level security/);
  assert.doesNotMatch(executableSql, /product_options|product_option_values|product_variants|product_variant_values|product_assets|product_fulfillment_configs/);
  assert.doesNotMatch(executableSql, /product_customization_configs|customization_field_identities|customization_fields/);
  assert.doesNotMatch(executableSql, /customization_drafts|customization_draft_values|customer_upload_receipts|customization_value_images/);
  assert.doesNotMatch(executableSql, /publish_product_customization_configuration|supabase_migrations/);
  assert.ok(source.indexOf("create table public.products") < source.indexOf("create table public.orders"));
  assert.ok(source.indexOf("create table public.orders") < source.indexOf("create table public.order_items"));
  assert.ok(source.indexOf("create table public.order_items") < source.indexOf("create table public.order_uploads"));
  assert.ok(source.indexOf("create table public.order_uploads") < source.indexOf("create table public.coupons"));
});
