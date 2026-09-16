import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { sha256Text, validateMigrationManifest } from "../app/application/local-commerce-migration-ledger.ts";

const root = path.resolve(process.cwd());
const migrationRoot = path.join(root, "local/commerce/migrations");
const migrationPath = path.join(migrationRoot, "0004_local-commerce-security-boundary.sql");
const manifest = JSON.parse(readFileSync(path.join(migrationRoot, "manifest.json"), "utf8"));
const draftSql = readFileSync(path.join(migrationRoot, "0010_local-commerce-draft-authority.sql"), "utf8");
const previewSql = readFileSync(path.join(migrationRoot, "0020_local-commerce-private-preview-manifest.sql"), "utf8");
const rpcOnlyTables = ["fulfillment_preview_media", "preview_manifest_entries"];
const sql = manifest.migrations
  .map((entry) => readFileSync(path.join(migrationRoot, entry.filename), "utf8"))
  .join("\n");

const localTables = [
  ...rpcOnlyTables,
  "order_creation_bindings",
  "media_upload_command_bindings",
  "media_slot_reservations",
  "media_operations",
  "media_cleanup_leases",
  "catalog_categories",
  "migration_ledger",
  "project_identities",
  "commerce_owners",
  "customer_accounts",
  "customer_sessions",
  "access_grants",
  "catalog_products",
  "catalog_variants",
  "catalog_configuration_snapshots",
  "catalog_pricing_rules",
  "carts",
  "cart_command_bindings",
  "cart_lines",
  "configuration_drafts",
  "media_objects",
  "media_receipts",
  "media_derivatives",
  "draft_media_links",
  "draft_command_bindings",
  "media_copy_bindings",
  "orders",
  "order_purchase_snapshots",
  "order_items",
  "order_item_purchase_snapshots",
  "order_item_receipt_bindings",
  "payment_attempts",
  "payment_actions",
  "fulfillments",
  "photo_reviews",
  "preview_manifests",
  "fulfillment_decisions",
  "shipments",
  "shipment_actions",
  "shipment_events",
  "digital_versions",
  "digital_grants",
  "digital_tickets",
  "digital_delivery_attempts",
];

test("migration 4 is ordered, checksummed, and preserves migrations 1 through 3", () => {
  assert.deepEqual(validateMigrationManifest(manifest), { status: "valid" });
  assert.ok(manifest.schemaVersion >= 4);
  assert.deepEqual(manifest.migrations.slice(0, 4).map((entry) => entry.version), [1, 2, 3, 4]);
  assert.equal(sha256Text(readFileSync(migrationPath, "utf8")), manifest.migrations[3].checksum);
});

test("all local commerce tables enable RLS", () => {
  // Discover every manifest-owned table independently of the hand-maintained
  // security list. A new migration must not silently fall outside this contract.
  const declared = new Set(manifest.migrations.flatMap(entry =>
    [...readFileSync(path.join(migrationRoot, entry.filename), "utf8")
      .matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?local_commerce\.([a-z_]+)/gi)]
      .map(match => match[1])));
  assert.deepEqual([...declared].sort(), [...localTables].sort(), "every migration-owned table is security-reviewed");
  for (const table of localTables) {
    assert.match(sql + previewSql, new RegExp(`alter table local_commerce\\.${table} enable row level security;`, "i"), `${table} enables RLS`);
  }
  const rlsTables = new Set([...(sql + previewSql).matchAll(/alter table local_commerce\.([a-z_]+) enable row level security;/gi)]
    .map((match) => match[1]));
  assert.deepEqual([...rlsTables].sort(), [...localTables].sort());
});

test("local table policies are service-role-only and browser roles remain denied", () => {
  for (const table of localTables) {
    if (rpcOnlyTables.includes(table)) {
      assert.match(previewSql, new RegExp(`revoke all on local_commerce\\.${table} from public,anon,authenticated,service_role;`, "i"));
      assert.doesNotMatch(previewSql, new RegExp(`grant .+ on (?:table )?local_commerce\\.${table} `, "i"));
      continue;
    }
    assert.match(sql, new RegExp(`create policy [a-z_]+\\s+on(?: table)? local_commerce\\.${table}\\s+for all to service_role`, "i"), `${table} has service policy`);
  }
  assert.doesNotMatch(sql, /create policy[\s\S]*?to\s+(?:public|anon|authenticated)\b/i);
  assert.match(sql, /revoke all on schema local_commerce from public, anon, authenticated/i);
  assert.match(sql, /revoke all on all tables in schema local_commerce from public, anon, authenticated/i);
  assert.match(sql, /grant usage on schema local_commerce to service_role/i);
  assert.match(sql, /grant select, insert, update, delete on all tables in schema local_commerce to service_role/i);
  assert.match(sql, /revoke all on all functions in schema local_commerce from public, anon, authenticated/i);
  assert.match(sql, /revoke all on table storage\.buckets from public, anon, authenticated/i);
  assert.match(sql, /revoke all on table storage\.objects from public, anon, authenticated/i);
});

test("Storage is private and does not expose signed URLs or object locators", () => {
  assert.match(sql, /insert into storage\.buckets \(id, name, public\)[\s\S]*?values \('local-commerce-private', 'local-commerce-private', false\)/i);
  assert.match(sql, /on conflict \(id\) do update set public = false/i);
  assert.match(sql, /alter table storage\.buckets enable row level security/i);
  assert.match(sql, /alter table storage\.objects enable row level security/i);
  assert.match(sql, /create policy local_commerce_private_bucket_service_role[\s\S]*?to service_role/i);
  assert.match(sql, /create policy local_commerce_private_objects_service_role[\s\S]*?to service_role/i);
  assert.doesNotMatch(sql, /signed_url|public_url|bucket_name|object_key|storage_path|access_token/i);
});

test("the identity RPC is security-definer, fixed-search-path, explicitly typed, and restricted", () => {
  assert.match(sql, /create or replace function local_commerce\.verify_project_identity\(\s*p_project_id text,\s*p_marker_digest text\s*\)/i);
  assert.match(sql, /returns boolean/i);
  assert.match(sql, /language sql\s+security definer\s+set search_path = local_commerce, pg_catalog/i);
  assert.match(sql, /where project_id = p_project_id\s+and marker_digest = p_marker_digest\s+and lifecycle = 'active'/i);
  assert.match(sql, /revoke all on function local_commerce\.verify_project_identity\(text, text\) from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function local_commerce\.verify_project_identity\(text, text\) to service_role/i);
  assert.doesNotMatch(sql, /execute\s*\(|format\s*\(|quote_ident|quote_literal/i);
});

test("draft command and idempotency bindings retain the migration 0010 privilege boundary", () => {
  assert.match(draftSql, /alter table local_commerce\.draft_command_bindings enable row level security/i);
  assert.match(draftSql, /revoke all on local_commerce\.draft_command_bindings from public,anon,authenticated/i);
  assert.match(draftSql, /grant select,insert on local_commerce\.draft_command_bindings to service_role/i);
  assert.match(draftSql, /returns jsonb language plpgsql security definer\s+set search_path=pg_catalog,local_commerce/i);
  const signature = "text,text,text,text,uuid,timestamptz,text,uuid,uuid,integer,text,text,jsonb";
  assert.ok(draftSql.includes(`revoke all on function local_commerce.draft_command(${signature}) from public,anon,authenticated;`));
  assert.ok(draftSql.includes(`grant execute on function local_commerce.draft_command(${signature}) to service_role;`));
  assert.doesNotMatch(draftSql, /grant\s+execute[^;]*to\s+(?:public|anon|authenticated)\b/i);
});

test("security migration has no business data, remote, or provider expansion", () => {
  const sql = readFileSync(migrationPath, "utf8");
  assert.doesNotMatch(sql, /create table|insert into local_commerce\./i);
  assert.doesNotMatch(sql, /remote|production database|payment provider|carrier|stripe|paypal/i);
  assert.doesNotMatch(sql, /alter table (?!local_commerce\.|storage\.)/i);
});
