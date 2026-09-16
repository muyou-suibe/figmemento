import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const migrationsDirectory = new URL("../supabase/migrations/", import.meta.url);
const phaseAMigration = "20260812120000_add_customization_configuration_schema.sql";
const phaseBMigration = "20260812121000_add_customization_draft_media_schema.sql";
const publicationMigration = "20260812122000_add_atomic_customization_publication_rpc.sql";
const sql = readFileSync(new URL(publicationMigration, migrationsDirectory), "utf8");

test("customization publication RPC is ordered after frozen Phase A/B artifacts", () => {
  const migrations = readdirSync(migrationsDirectory)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  assert.ok(migrations.includes(phaseAMigration));
  assert.ok(migrations.includes(phaseBMigration));
  assert.ok(migrations.includes(publicationMigration));
  assert.ok(migrations.indexOf(phaseAMigration) < migrations.indexOf(publicationMigration));
  assert.ok(migrations.indexOf(phaseBMigration) < migrations.indexOf(publicationMigration));
});

test("publication RPC has the approved fixed signature and invoker-only execution posture", () => {
  assert.match(
    sql,
    /create function public\.publish_product_customization_configuration\(\s*p_product_id uuid,\s*p_expected_current_revision_id uuid,\s*p_fields jsonb\s*\)/i,
  );
  assert.match(sql, /language plpgsql\s+security invoker\s+set search_path = pg_catalog/i);
  assert.doesNotMatch(sql, /security definer/i);
  assert.doesNotMatch(sql, /\bexecute\s+(?:format\s*\(|['"])/i);

  for (const role of ["public", "anon", "authenticated", "service_role"]) {
    assert.match(
      sql,
      new RegExp(
        `revoke all privileges on function public\\.publish_product_customization_configuration\\(uuid, uuid, jsonb\\) from ${role}`,
        "i",
      ),
    );
  }
  assert.match(
    sql,
    /grant execute on function public\.publish_product_customization_configuration\(uuid, uuid, jsonb\) to service_role/i,
  );
  assert.doesNotMatch(
    sql,
    /grant execute on function public\.publish_product_customization_configuration\([^;]+\) to (?:public|anon|authenticated)/i,
  );
});

test("publication serializes by Product row and owns final revision comparison", () => {
  assert.match(
    sql,
    /from public\.products as product\s+where product\.id = p_product_id\s+for update/i,
  );
  assert.match(
    sql,
    /from public\.product_customization_configs as config[\s\S]*?config\.is_current[\s\S]*?for update/i,
  );
  assert.match(sql, /p_expected_current_revision_id is not null/i);
  assert.match(sql, /p_expected_current_revision_id is distinct from v_current_revision_id/i);
  assert.match(sql, /'stale_revision'::text/i);
  assert.match(sql, /'not_found'::text/i);
});

test("publication-state updates qualify Product ownership through target aliases", () => {
  const currentRevisionUpdate = sql.match(
    /update public\.product_customization_configs\s+as current_config[\s\S]*?where[\s\S]*?;/i,
  )?.[0];
  const newRevisionUpdate = sql.match(
    /update public\.product_customization_configs\s+as new_config[\s\S]*?where[\s\S]*?;/i,
  )?.[0];

  assert.ok(currentRevisionUpdate, "current revision update must be present");
  assert.ok(newRevisionUpdate, "new revision update must be present");
  assert.match(currentRevisionUpdate, /current_config\.id\s*=\s*v_current_revision_id/i);
  assert.match(currentRevisionUpdate, /current_config\.product_id\s*=\s*p_product_id/i);
  assert.match(currentRevisionUpdate, /current_config\.is_current/i);
  assert.match(newRevisionUpdate, /new_config\.id\s*=\s*v_new_revision_id/i);
  assert.match(newRevisionUpdate, /new_config\.product_id\s*=\s*p_product_id/i);
  assert.doesNotMatch(
    `${currentRevisionUpdate}\n${newRevisionUpdate}`,
    /(?:^|\n)\s*and\s+product_id\s*=\s*p_product_id\b/im,
  );
});

test("publication preserves immutable identity/code and complete-replacement rules", () => {
  assert.match(sql, /jsonb_array_elements\(p_fields\) with ordinality/i);
  assert.match(sql, /v_position_text !~ '\^\[0-9\]\+\$'/i);
  assert.match(sql, /pg_catalog\.length\(v_position_text\) > 10/i);
  assert.match(sql, /v_position_text > '2147483647'/i);
  assert.match(sql, /customization_field_identities as identity/i);
  assert.match(sql, /identity\.product_id = p_product_id/i);
  assert.match(sql, /v_stored_code is distinct from v_code/i);
  assert.match(sql, /historical_identity\.code = v_code/i);
  assert.match(sql, /previous_definition\.stable_field_id = any\(v_existing_ids\)/i);
  assert.match(sql, /Existing fields must be retained and explicitly deactivated/i);
  assert.match(sql, /pg_catalog\.jsonb_array_length\(p_fields\) = 0[\s\S]*?v_current_revision_id is not null/i);
  assert.doesNotMatch(sql, /update public\.customization_fields\b/i);
  assert.doesNotMatch(sql, /update public\.customization_field_identities\b/i);
});

test("publication has NULL-safe JSON shape guards and validates every int4 scalar before casting", () => {
  for (const expression of [
    "v_field",
    "v_field -> 'identity'",
    "v_field -> 'constraints'",
    "v_field -> 'required'",
    "v_field -> 'isActive'",
    "v_field -> 'position'",
  ]) {
    assert.match(
      sql,
      new RegExp(`jsonb_typeof\\(${expression.replace(/[()[\]{}*+?.\\^$|]/g, "\\$&")}\\) is distinct from`, "i"),
    );
  }
  assert.match(sql, /v_identity_kind is null\s+or v_identity_kind not in \('existing', 'new'\)/i);
  assert.match(sql, /v_kind is null\s+or v_kind not in \('image', 'short_text', 'long_text'\)/i);
  assert.doesNotMatch(sql, /jsonb_typeof\([^\n]+\) <> '(?:object|boolean|number)'/i);

  for (const scalar of [
    "v_position_text",
    "v_max_length_text",
    "v_max_bytes_text",
    "v_min_width_text",
    "v_min_height_text",
    "v_recommended_width_text",
    "v_recommended_height_text",
    "v_min_image_count_text",
    "v_max_image_count_text",
  ]) {
    assert.match(sql, new RegExp(`${scalar} !~ '\\^\\[0-9\\]\\+\\$'`, "i"));
    assert.match(sql, new RegExp(`${scalar}[\\s\\S]{0,360}?'2147483647'`, "i"));
  }

  const positionGuard = sql.indexOf("v_position_text > '2147483647'");
  const positionCast = sql.indexOf("v_position := v_position_text::integer");
  assert.ok(positionGuard >= 0);
  assert.ok(positionCast > positionGuard, "position range guard must precede its integer cast");
  const firstPassEnd = sql.indexOf("if v_current_revision_id is not null and exists");
  assert.ok(firstPassEnd > positionCast, "all scalar validation must finish before publication state changes");
});

test("publication allocates only database identities and returns deterministic new-field mappings", () => {
  assert.match(
    sql,
    /insert into public\.product_customization_configs \(product_id, is_current\)[\s\S]*?returning id into v_new_revision_id/i,
  );
  assert.match(
    sql,
    /insert into public\.customization_field_identities \(product_id, code\)[\s\S]*?returning id into v_stable_field_id/i,
  );
  assert.match(sql, /'draftId', v_draft_id[\s\S]*?'stableFieldId', v_stable_field_id::text/i);
  assert.doesNotMatch(sql, /gen_random_uuid\s*\(/i);
  assert.match(sql, /'configurationRevision', v_new_revision_id::text/i);
  assert.match(sql, /'id', definition\.stable_field_id::text/i);
  assert.doesNotMatch(sql, /'id', definition\.id::text/i);
  assert.match(
    sql,
    /jsonb_array_elements\(p_fields\) with ordinality as item\(value, ordinality\)\s+order by \(item\.value ->> 'position'\)::integer asc/i,
  );
});

test("publication writes only Phase A configuration relations and returns bounded safe outcomes", () => {
  const mutatedRelations = new Set(
    [...sql.matchAll(/(?:insert into|update|delete from)\s+public\.([a-z_]+)/gi)].map(
      (match) => match[1],
    ),
  );
  assert.deepEqual(
    [...mutatedRelations].sort(),
    [
      "customization_field_identities",
      "customization_fields",
      "product_customization_configs",
    ],
  );
  assert.match(sql, /'applied'::text/i);
  assert.match(sql, /'invalid_configuration'::text/i);
  assert.match(sql, /new_field_id_mappings jsonb/i);
  assert.match(sql, /safe_issues jsonb/i);
  assert.doesNotMatch(
    sql,
    /public\.(?:products\.customization_schema|order_items|order_uploads|product_variants|product_options|product_option_values|product_assets|product_fulfillment_configs|customization_drafts|customization_draft_values|customer_upload_receipts|customization_value_images|order_item_customization_[a-z_]+)/i,
  );
  assert.doesNotMatch(sql, /\bexception\s+when\b/i);
  assert.match(sql, /^\s*begin;/im);
  assert.match(sql, /commit;\s*$/i);
});
