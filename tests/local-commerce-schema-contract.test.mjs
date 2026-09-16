import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { sha256Text, validateMigrationManifest } from "../app/application/local-commerce-migration-ledger.ts";

const root = path.resolve(process.cwd());
const migrationRoot = path.join(root, "local/commerce/migrations");
const manifest = JSON.parse(readFileSync(path.join(migrationRoot, "manifest.json"), "utf8"));
const sql = readFileSync(path.join(migrationRoot, "0002_local-commerce-identity-catalog-cart-media.sql"), "utf8");
const migration = manifest.migrations.find((entry) => entry.version === 2);

const expectedTables = [
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
  "cart_lines",
  "configuration_drafts",
  "media_objects",
  "media_receipts",
  "media_derivatives",
  "draft_media_links",
  "media_copy_bindings",
];

test("migration 2 is ordered, checksummed, and preserves migration 1", () => {
  assert.deepEqual(validateMigrationManifest(manifest), { status: "valid" });
  assert.ok(manifest.schemaVersion >= 2);
  assert.deepEqual(manifest.migrations.slice(0, 2).map((entry) => entry.version), [1, 2]);
  assert.equal(manifest.migrations[0].version, 1);
  assert.equal(
    sha256Text(readFileSync(path.join(migrationRoot, migration.filename), "utf8")),
    migration.checksum,
  );
});

test("2.2 defines only identity, catalog, cart/draft, and media foundations", () => {
  for (const table of expectedTables) {
    assert.match(sql, new RegExp(`create table if not exists local_commerce\\.${table}\\s*\\(`, "i"));
  }
  assert.doesNotMatch(sql, /create table if not exists local_commerce\.(orders?|order_items|payments?|shipments?|suppliers?|tracking)/i);
  assert.doesNotMatch(sql, /create table if not exists (public|production|legacy)\./i);
});

test("every 2.2 entity carries project ownership, stable identity, version, lifecycle, and timestamps", () => {
  for (const table of expectedTables) {
    const match = sql.match(new RegExp(`create table if not exists local_commerce\\.${table}\\s*\\((.*?)\\n\\);`, "is"));
    assert.ok(match, `${table} definition is present`);
    const body = match[1];
    for (const field of ["project_id", "id", "version", "lifecycle", "created_at", "updated_at"]) {
      assert.match(body, new RegExp(`\\b${field}\\b`, "i"), `${table} has ${field}`);
    }
  }
});

test("identity and resource relationships use same-project and same-owner composite foreign keys", () => {
  for (const table of ["customer_accounts", "customer_sessions", "access_grants", "carts", "configuration_drafts", "media_objects", "media_receipts", "media_derivatives", "draft_media_links", "media_copy_bindings"]) {
    const start = sql.indexOf(`create table if not exists local_commerce.${table}`);
    const end = sql.indexOf("\n);", start);
    const body = sql.slice(start, end);
    assert.match(body, /foreign key \(project_id, owner_id\)/i, `${table} binds owner to project`);
  }
  assert.match(sql, /cart_lines_cart_owner_fk foreign key \(project_id, cart_id, owner_id\)/i);
  assert.match(sql, /draft_media_links_draft_owner_fk foreign key \(project_id, draft_id, owner_id\)/i);
  assert.match(sql, /draft_media_links_receipt_owner_fk foreign key \(project_id, receipt_id, owner_id\)/i);
  assert.match(sql, /media_copy_bindings_source_owner_fk foreign key \(project_id, source_receipt_id, owner_id\)/i);
  assert.match(sql, /media_copy_bindings_target_owner_fk foreign key \(project_id, target_draft_id, owner_id\)/i);
});

test("catalog, cart, and media constraints reject ambiguous or cross-entity references", () => {
  assert.match(sql, /catalog_variants_product_fk foreign key \(project_id, product_id\)/i);
  assert.match(sql, /catalog_variants_sku_key unique \(project_id, sku_code\)/i);
  assert.match(sql, /cart_lines_variant_fk foreign key \(project_id, product_id, variant_id\)/i);
  assert.match(sql, /cart_lines_configuration_fk foreign key \(project_id, product_id, configuration_revision\)/i);
  assert.match(sql, /media_receipts_object_owner_fk foreign key \(project_id, media_object_id, owner_id\)/i);
  assert.match(sql, /media_receipts_product_fk foreign key \(project_id, product_id\)/i);
  assert.match(sql, /media_receipts_reference_key unique \(project_id, receipt_reference\)/i);
  assert.match(sql, /media_receipts_reference_immutable|prevent_receipt_reference_change/i);
  assert.match(sql, /media_receipts_generation_check check \(source_generation > 0\)/i);
  assert.match(sql, /media_copy_bindings_action_key unique \(project_id, action_key\)/i);
});

test("browser and ordinary database roles receive no direct 2.2 access", () => {
  assert.match(sql, /revoke all on schema local_commerce from public, anon, authenticated/i);
  assert.match(sql, /revoke all on all tables in schema local_commerce from public, anon, authenticated/i);
  assert.match(sql, /grant usage on schema local_commerce to service_role/i);
  assert.doesNotMatch(sql, /signed_url|public_url|bucket|object_key|access_token|service_role_key/i);
});
