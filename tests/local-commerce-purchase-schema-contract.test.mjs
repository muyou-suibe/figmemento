import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { sha256Text, validateMigrationManifest } from "../app/application/local-commerce-migration-ledger.ts";

const root = path.resolve(process.cwd());
const migrationRoot = path.join(root, "local/commerce/migrations");
const migrationPath = path.join(migrationRoot, "0003_local-commerce-order-operations-delivery.sql");
const manifest = JSON.parse(readFileSync(path.join(migrationRoot, "manifest.json"), "utf8"));
const sql = readFileSync(migrationPath, "utf8");

const expectedTables = [
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
  "shipment_events",
  "digital_versions",
  "digital_grants",
  "digital_tickets",
  "digital_delivery_attempts",
];

function tableBody(table) {
  const start = sql.indexOf(`create table if not exists local_commerce.${table}`);
  assert.notEqual(start, -1, `${table} definition is present`);
  const end = sql.indexOf("\n);", start);
  assert.notEqual(end, -1, `${table} definition is terminated`);
  return sql.slice(start, end);
}

test("migration 3 is ordered, checksummed, and preserves migrations 1 and 2", () => {
  assert.deepEqual(validateMigrationManifest(manifest), { status: "valid" });
  assert.ok(manifest.schemaVersion >= 3);
  assert.deepEqual(manifest.migrations.slice(0, 3).map((migration) => migration.version), [1, 2, 3]);
  assert.equal(manifest.migrations[0].checksum, "c1c653a53479f75c04b61a0da04a8ccc6e72b4aa26d602380d04e4948e79ac3a");
  assert.equal(manifest.migrations[1].checksum, "b182f96606b1bba780c9eff00f6579df68d8dc97a78056b1f6d1714d78202ab6");
  assert.equal(sha256Text(readFileSync(migrationPath, "utf8")), manifest.migrations[2].checksum);
});

test("2.3 defines only order, local payment, fulfillment, shipment, and digital entities", () => {
  for (const table of expectedTables) {
    assert.match(sql, new RegExp(`create table if not exists local_commerce\\.${table}\\s*\\(`, "i"));
  }
  assert.doesNotMatch(sql, /create table if not exists local_commerce\.(supplier|carrier|tracking_provider|downloads?)/i);
  assert.doesNotMatch(sql, /create table if not exists (public|production|legacy)\./i);
  assert.doesNotMatch(sql, /stripe|paypal|supabase\.co|remote/i);
});

test("every 2.3 entity carries project identity, stable id, version, lifecycle, and timestamps", () => {
  for (const table of expectedTables) {
    const body = tableBody(table);
    for (const field of ["project_id", "id", "version", "lifecycle", "created_at", "updated_at"]) {
      assert.match(body, new RegExp(`\\b${field}\\b`, "i"), `${table} has ${field}`);
    }
  }
});

test("order purchase facts are separate from mutable order lifecycle", () => {
  const order = tableBody("orders");
  const orderSnapshot = tableBody("order_purchase_snapshots");
  const itemSnapshot = tableBody("order_item_purchase_snapshots");
  assert.match(order, /lifecycle_status|fulfillment_status/i);
  assert.doesNotMatch(order, /product_slug|sku_code|variant_facts|customization_facts|pricing_snapshot|receipt_references/i);
  for (const field of ["purchase_facts", "pricing_snapshot", "currency", "subtotal_cents", "shipping_cents", "discount_cents", "tax_status", "total_cents"]) {
    assert.match(orderSnapshot, new RegExp(`\\b${field}\\b`, "i"), `order snapshot has ${field}`);
  }
  for (const field of ["product_id", "product_slug", "product_name", "sku_code", "variant_facts", "customization_facts", "configuration_revision", "receipt_references", "quantity", "unit_price_cents", "line_subtotal_cents", "currency", "fulfillment_type"]) {
    assert.match(itemSnapshot, new RegExp(`\\b${field}\\b`, "i"), `item snapshot has ${field}`);
  }
  assert.match(sql, /order_purchase_snapshots_immutable/i);
  assert.match(sql, /order_item_purchase_snapshots_immutable/i);
  assert.match(sql, /prevent_purchase_fact_change/i);
  assert.match(sql, /tax_status = 'not_activated' and tax_amount_cents is null/i);
});

test("purchase ownership and receipt attachment are exact and attach-once", () => {
  assert.match(sql, /order_items_order_owner_fk foreign key \(project_id, order_id, owner_id\)/i);
  assert.match(sql, /order_item_purchase_snapshots_item_owner_fk foreign key \(project_id, order_item_id, owner_id\)/i);
  assert.match(sql, /order_item_receipt_bindings_receipt_key unique \(project_id, receipt_id\)/i);
  assert.match(sql, /order_item_receipt_bindings_item_receipt_key unique \(project_id, order_item_id, receipt_id\)/i);
  assert.match(sql, /order_item_receipt_bindings_receipt_owner_fk foreign key \(project_id, receipt_id, owner_id\)/i);
  assert.match(sql, /order_item_receipt_bindings_immutable/i);
});

test("local payment simulation has idempotent action keys and no provider authority", () => {
  assert.match(sql, /payment_attempts_action_key unique \(project_id, action_key\)/i);
  assert.match(sql, /payment_actions_action_key unique \(project_id, action_key\)/i);
  assert.match(sql, /simulation_label text not null default 'local_simulation'/i);
  assert.match(sql, /payment_attempts_simulation_check check \(simulation_label = 'local_simulation'\)/i);
  assert.match(tableBody("payment_actions"), /request_digest|result/i);
});

test("fulfillment has one aggregate per order and one shipment per fulfillment", () => {
  assert.match(sql, /fulfillments_order_key unique \(project_id, order_id\)/i);
  assert.match(sql, /shipments_fulfillment_key unique \(project_id, fulfillment_id\)/i);
  assert.match(sql, /shipment_events_key unique \(project_id, event_key\)/i);
  assert.match(sql, /shipment_events_type_key unique \(project_id, shipment_id, event_type\)/i);
  for (const table of ["photo_reviews", "preview_manifests", "fulfillment_decisions", "shipments", "shipment_events"]) {
    assert.match(tableBody(table), /owner_id/i, `${table} is owner-scoped`);
    assert.match(tableBody(table), /foreign key \(project_id, .*owner_id\)/i, `${table} has an owner-bound foreign key`);
  }
});

test("version and lifecycle checks bound mutable operational entities", () => {
  for (const table of expectedTables) {
    const body = tableBody(table);
    assert.match(body, new RegExp(`${table}_[a-z_]*version_check check \\((?:[a-z_]*version|version)`, "i"), `${table} bounds version`);
    assert.match(body, new RegExp(`${table}_[a-z_]*lifecycle_check check \\(lifecycle`, "i"), `${table} bounds lifecycle`);
  }
  assert.match(sql, /digital_grants_attempts_check check \(max_attempts > 0 and used_attempts >= 0 and used_attempts <= max_attempts\)/i);
  assert.match(sql, /digital_versions_item_version_key unique \(project_id, order_item_id, version_number\)/i);
  assert.match(sql, /digital_tickets_hash_key unique \(project_id, ticket_hash\)/i);
});

test("digital delivery records are versioned without a download interface", () => {
  for (const table of ["digital_versions", "digital_grants", "digital_tickets", "digital_delivery_attempts"]) {
    assert.match(sql, new RegExp(`create table if not exists local_commerce\\.${table}`, "i"));
  }
  assert.match(sql, /digital_delivery_attempts_action_key unique \(project_id, action_key\)/i);
  assert.doesNotMatch(sql, /create table if not exists local_commerce\.downloads?/i);
  assert.doesNotMatch(sql, /download_url|signed_url|bucket|object_key|access_token/i);
});

test("ordinary database roles receive no direct 2.3 access", () => {
  assert.match(sql, /revoke all on schema local_commerce from public, anon, authenticated/i);
  assert.match(sql, /revoke all on all tables in schema local_commerce from public, anon, authenticated/i);
  assert.match(sql, /grant usage on schema local_commerce to service_role/i);
  assert.match(sql, /grant select, insert, update, delete on all tables in schema local_commerce to service_role/i);
});
