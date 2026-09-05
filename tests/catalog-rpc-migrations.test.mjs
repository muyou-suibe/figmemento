import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const migrationsDirectory = new URL("../supabase/migrations/", import.meta.url);
const expandMigration = "20260807151745_expand_configurable_product_catalog.sql";
const rpcMigration = "20260808120000_add_atomic_catalog_sku_graph_rpc.sql";
const sql = readFileSync(new URL(rpcMigration, migrationsDirectory), "utf8");

function sqlBetween(startMarker, endMarker) {
  const start = sql.indexOf(startMarker);
  assert.notEqual(start, -1, `missing SQL marker: ${startMarker}`);
  const end = sql.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing SQL marker: ${endMarker}`);
  return sql.slice(start, end);
}

test("atomic SKU graph RPC is ordered after expand and before guarded backfill", () => {
  const migrations = readdirSync(migrationsDirectory)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  assert.ok(migrations.includes(expandMigration));
  assert.ok(migrations.includes(rpcMigration));
  assert.ok(migrations.indexOf(expandMigration) < migrations.indexOf(rpcMigration));
  assert.equal(
    migrations.some((file) => /guarded.*backfill|backfill.*guarded/i.test(file)),
    false,
    "Phase A must not create the guarded legacy backfill migration",
  );
});

test("RPC has a fixed complete-graph signature and hardened invoker security", () => {
  assert.match(
    sql,
    /create function public\.save_product_sku_graph\(\s*p_product_id uuid,\s*p_options jsonb,\s*p_option_values jsonb,\s*p_variants jsonb,\s*p_variant_values jsonb\s*\)/i,
  );
  assert.match(sql, /language plpgsql\s+security invoker\s+set search_path = pg_catalog/i);
  assert.doesNotMatch(sql, /security definer/i);
  assert.doesNotMatch(sql, /\bexecute\s+(?:format\s*\(|['"])/i);

  for (const role of ["public", "anon", "authenticated", "service_role"]) {
    assert.match(
      sql,
      new RegExp(
        `revoke all privileges on function public\\.save_product_sku_graph\\(uuid, jsonb, jsonb, jsonb, jsonb\\) from ${role}`,
        "i",
      ),
    );
  }
  assert.match(
    sql,
    /grant execute on function public\.save_product_sku_graph\(uuid, jsonb, jsonb, jsonb, jsonb\) to service_role/i,
  );
  assert.doesNotMatch(
    sql,
    /grant execute on function public\.save_product_sku_graph\([^;]+\) to (?:public|anon|authenticated)/i,
  );
});

test("RPC locks one Product and limits writes to the four SKU graph relations", () => {
  assert.match(
    sql,
    /from public\.products as product\s+where product\.id = p_product_id\s+for update/i,
  );

  const mutatedRelations = new Set(
    [...sql.matchAll(/(?:insert into|update|delete from)\s+public\.([a-z_]+)/gi)].map(
      (match) => match[1],
    ),
  );
  assert.deepEqual(
    [...mutatedRelations].sort(),
    [
      "product_option_values",
      "product_options",
      "product_variant_values",
      "product_variants",
    ],
  );
  assert.doesNotMatch(sql, /(?:update|delete from)\s+public\.products\b/i);
  assert.doesNotMatch(sql, /public\.catalog_audit_events/i);
  assert.doesNotMatch(
    sql,
    /public\.(?:orders|order_items|product_assets|product_fulfillment_configs|customers|profiles)\b/i,
  );
});

test("RPC validates same-Product ownership and deterministic stable identities", () => {
  assert.match(sql, /Every Product Option must belong to the target Product/i);
  assert.match(sql, /Every Product Option Value must belong to the target Product/i);
  assert.match(sql, /Every Product Variant must belong to the target Product/i);
  assert.match(sql, /Every Variant Value must belong to the target Product/i);
  assert.match(sql, /Option Value must reference an Option in the desired Product graph/i);
  assert.match(
    sql,
    /Variant Values must reference same-Product Variants, Options, and Values/i,
  );
  assert.match(sql, /An existing SKU graph identity belongs to another Product/i);
  assert.match(sql, /Variant combination signature is not canonical/i);
  assert.match(sql, /SKU graph uses a reserved reconciliation value/i);
  assert.doesNotMatch(sql, /gen_random_uuid\s*\(/i);
  assert.equal((sql.match(/on conflict \(id\) do update/gi) ?? []).length, 3);
});

test("ID-conflict upserts cannot re-parent another Product's catalog identity", () => {
  const optionUpsert = sqlBetween(
    "insert into public.product_options as existing",
    "insert into public.product_option_values as existing",
  );
  const optionValueUpsert = sqlBetween(
    "insert into public.product_option_values as existing",
    "insert into public.product_variants as existing",
  );
  const variantUpsert = sqlBetween(
    "insert into public.product_variants as existing",
    "if exists (",
  );

  for (const upsert of [optionUpsert, optionValueUpsert, variantUpsert]) {
    const conflictUpdate = upsert.slice(upsert.indexOf("on conflict (id) do update"));
    const setClause = conflictUpdate.slice(
      conflictUpdate.indexOf("set "),
      conflictUpdate.indexOf("where "),
    );
    assert.doesNotMatch(setClause, /\bproduct_id\s*=/i);
    assert.match(
      conflictUpdate,
      /where existing\.product_id = excluded\.product_id\s*;/i,
    );
  }
});

test("post-upsert coverage fails closed before Variant Value insertion", () => {
  const variantUpsertStart = sql.indexOf(
    "insert into public.product_variants as existing",
  );
  const coverageStart = sql.indexOf("if exists (", variantUpsertStart);
  const linksInsertStart = sql.indexOf(
    "insert into public.product_variant_values",
    coverageStart,
  );
  assert.ok(variantUpsertStart >= 0);
  assert.ok(coverageStart > variantUpsertStart);
  assert.ok(linksInsertStart > coverageStart);
  const coverage = sql.slice(coverageStart, linksInsertStart);

  for (const [payload, relation] of [
    ["p_options", "product_options"],
    ["p_option_values", "product_option_values"],
    ["p_variants", "product_variants"],
  ]) {
    assert.match(
      coverage,
      new RegExp(
        `jsonb_to_recordset\\(${payload}\\)[\\s\\S]*?left join public\\.${relation} as persisted[\\s\\S]*?persisted\\.id = desired\\.id[\\s\\S]*?persisted\\.product_id = p_product_id[\\s\\S]*?where persisted\\.id is null[\\s\\S]*?raise exception`,
        "i",
      ),
    );
  }
});

test("reserved reconciliation signature prefix treats underscores literally", () => {
  assert.doesNotMatch(
    sql,
    /combination_signature\s+like\s+'__rpc_reconcile__:%'/i,
  );
  assert.match(
    sql,
    /pg_catalog\.left\(\s*desired\.combination_signature,\s*pg_catalog\.length\('__rpc_reconcile__:'\)\s*\)\s*=\s*'__rpc_reconcile__:'/i,
  );
});

test("full-graph replacement is FK-ordered and fails atomically", () => {
  const linksDelete = sql.indexOf("delete from public.product_variant_values");
  const variantsDelete = sql.indexOf("delete from public.product_variants as existing");
  const valuesDelete = sql.indexOf("delete from public.product_option_values as existing");
  const optionsDelete = sql.indexOf("delete from public.product_options as existing");

  assert.ok(linksDelete >= 0);
  assert.ok(linksDelete < variantsDelete);
  assert.ok(variantsDelete < valuesDelete);
  assert.ok(valuesDelete < optionsDelete);
  assert.doesNotMatch(sql, /\bcascade\b/i);
  assert.doesNotMatch(sql, /\bexception\s+when\b/i);
  assert.match(sql, /^\s*begin;/im);
  assert.match(sql, /commit;\s*$/i);
});
