import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath = new URL(
  "../supabase/migrations/20260807151745_expand_configurable_product_catalog.sql",
  import.meta.url,
);
const sql = readFileSync(migrationPath, "utf8");

const expectedCreatedTables = [
  "categories",
  "product_options",
  "product_option_values",
  "product_variants",
  "product_variant_values",
  "product_assets",
  "product_fulfillment_configs",
  "catalog_audit_events",
];

function tableDefinition(tableName) {
  const start = sql.indexOf(`create table public.${tableName}`);
  assert.notEqual(start, -1, `${tableName} must be created`);
  const end = sql.indexOf(";", start);
  assert.notEqual(end, -1, `${tableName} definition must terminate`);
  return sql.slice(start, end + 1);
}

test("expand migration creates only the approved additive catalog relations", () => {
  for (const tableName of expectedCreatedTables) {
    assert.match(sql, new RegExp(`create table public\\.${tableName}\\b`, "i"));
  }

  assert.match(sql, /alter table public\.products\s+add column category_id uuid/i);
  assert.match(sql, /add column seo jsonb/i);
  assert.match(sql, /add column lifecycle text/i);
  assert.doesNotMatch(sql, /\bdrop\s+(?:table|column|constraint)\b/i);
  assert.doesNotMatch(sql, /\brename\s+(?:table|column)\b/i);
  assert.doesNotMatch(sql, /\binsert\s+into\b/i);
  assert.doesNotMatch(sql, /\bupdate\s+public\./i);
  assert.doesNotMatch(sql, /\bdelete\s+from\b/i);
  assert.doesNotMatch(sql, /\bif\s+not\s+exists\b/i);
});

test("Variant and FulfillmentConfig database ownership stays separated", () => {
  const variants = tableDefinition("product_variants");
  const fulfillment = tableDefinition("product_fulfillment_configs");

  assert.match(variants, /supply_method text not null/i);
  assert.doesNotMatch(variants, /production_mode/i);
  assert.match(variants, /currency = 'USD'/i);
  assert.match(variants, /price_cents >= 0/i);
  assert.match(variants, /weight_grams >= 0/i);
  assert.match(variants, /unique \(product_id, combination_signature\)/i);

  assert.match(fulfillment, /production_mode text not null/i);
  assert.doesNotMatch(fulfillment, /supply_method/i);
  assert.match(fulfillment, /fulfillment_type in \('physical', 'digital'\)/i);
  assert.match(fulfillment, /min_lead_time_business_days >= 0/i);
});

test("ProductAsset source checks match the domain URL and reference contract", () => {
  const assets = tableDefinition("product_assets");
  assert.match(assets, /source_value !~ '\[\[:space:\]\]'/i);
  assert.match(assets, /source_value ~\* '\^https:\/\/'/i);
  assert.match(
    assets,
    /source_value !~\* '\^\(private\|customer\|order\|preview\|delivery\):'/i,
  );
});

test("relational constraints enforce catalog ownership and uniqueness", () => {
  assert.match(sql, /product_variants_sku_code_key unique \(sku_code\)/i);
  assert.match(sql, /create unique index product_variants_one_default_idx/i);
  assert.match(
    sql,
    /foreign key \(option_value_id, option_id, product_id\)[\s\S]*?references public\.product_option_values\(id, option_id, product_id\)/i,
  );
  assert.match(
    sql,
    /foreign key \(variant_id, product_id\)[\s\S]*?references public\.product_variants\(id, product_id\)/i,
  );
  assert.match(sql, /on delete restrict/gi);
  assert.doesNotMatch(sql, /on delete cascade/i);
});

test("every new relation explicitly enables RLS and removes browser privileges", () => {
  for (const tableName of expectedCreatedTables) {
    assert.match(
      sql,
      new RegExp(`alter table public\\.${tableName} enable row level security`, "i"),
    );
  }

  assert.match(sql, /from public, anon, authenticated, service_role/i);
  assert.doesNotMatch(sql, /grant[\s\S]*?\bto\s+(?:anon|authenticated)\b/i);
  assert.match(sql, /for all to service_role/gi);
  assert.match(sql, /grant select, insert on table public\.catalog_audit_events to service_role/i);
  assert.doesNotMatch(
    sql,
    /grant\s+(?:update|delete|truncate)[^;]*on table public\.catalog_audit_events\s+to service_role/i,
  );
});

test("audit persistence is narrow and contains no sensitive payload column", () => {
  const audit = tableDefinition("catalog_audit_events");
  assert.match(audit, /'publish'/i);
  assert.match(audit, /'unpublish'/i);
  assert.match(audit, /'retire'/i);
  assert.match(audit, /'destructive_state_mutation_attempt'/i);
  assert.doesNotMatch(
    audit,
    /password|secret|payment|customer|upload|customization|delivery|storage|payload|metadata/i,
  );
});

test("migration contains no out-of-scope operational data model", () => {
  assert.doesNotMatch(
    sql,
    /\b(?:supplier_id|factory_id|warehouse_id|procurement_id|purchase_cost|inventory_quantity|stock_quantity|shipping_rule|payment_status|preview_file)\b/i,
  );
});
