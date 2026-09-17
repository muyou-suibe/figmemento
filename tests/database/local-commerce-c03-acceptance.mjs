// Real disposable local DB acceptance for Phase 1 C03. This is an acceptance
// harness only: it creates uniquely identified synthetic Catalog rows, uses
// the real persistent Cart/Checkout/Order boundaries, and leaves committed
// facts for whole-project teardown after acceptance. It is intentionally
// excluded from test:offline.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

import { sha256Text } from "../../app/application/local-commerce-migration-ledger.ts";
import { persistentCartHttp } from "../../app/server/local-persistent-cart-http.server.ts";
import { persistentCheckoutHttp } from "../../app/server/local-persistent-checkout-http.server.ts";
import { persistentOrderCreateHttp } from "../../app/server/local-persistent-order-http.server.ts";
import { catalogDatabaseRows } from "../fixtures/local-persistent-catalog.mjs";

assert.deepEqual(process.argv.slice(2), ["run-d7e3c0af", "--confirm-disposable-c03"]);
const root = path.resolve(".");
const runId = process.argv[2];
const workdir = path.join(root, "local", "commerce", "runtime", "disposable", runId);
const projectId = "figmemento-local-commerce-test-run-d7e3c0af";
const marker = JSON.parse(readFileSync(path.join(workdir, "project-marker.json"), "utf8"));
const markerDigest = sha256Text(JSON.stringify(marker));
assert.deepEqual(marker, {
  format: "figmemento-local-commerce-marker/v1",
  projectId,
  environment: "test",
  projectKind: "disposable_test",
  runId,
  schema: "local_commerce",
  postgresMajorVersion: 17,
  createdAt: marker.createdAt,
});
assert.equal(marker.createdAt.length > 0, true);

function command(binary, args, input) {
  const result = spawnSync(binary, args, { cwd: root, input, encoding: "utf8", timeout: 30_000, maxBuffer: 16 * 1024 * 1024 });
  assert.equal(result.error, undefined, `${binary} bounded execution failed`);
  assert.equal(result.status, 0, (result.stderr || "command failed").split("\n")[0]);
  return result.stdout.trim();
}

const containers = command("docker", ["ps", "--filter", `label=com.supabase.cli.workdir=${workdir}`, "--format", "{{.ID}}"]).split("\n").filter(Boolean);
const inspected = JSON.parse(command("docker", ["inspect", ...containers]));
const database = inspected.filter((container) => /^\/supabase_db_/.test(container.Name)
  && container.Config?.Labels?.["com.supabase.cli.workdir"] === workdir
  && container.State?.Running === true);
assert.equal(database.length, 1);
assert.match(database[0].Config.Image, /postgres:17(?:\.|$)/);
assert.ok(database[0].Mounts.some((mount) => mount.Destination === "/var/lib/postgresql/data"));
const dbId = database[0].Id;
const sql = (query) => command("docker", ["exec", "-i", dbId, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], query);
assert.equal(sql("select current_setting('server_version_num')::int/10000;"), "17");
assert.equal(sql(`select local_commerce.verify_project_identity('${projectId}','${markerDigest}');`), "t");

const manifest = JSON.parse(readFileSync("local/commerce/migrations/manifest.json", "utf8"));
assert.equal(manifest.schemaVersion, 41);
assert.equal(manifest.migrations.length, 41);
assert.equal(manifest.migrations.some((migration) => migration.version === 42), false);
for (const migration of manifest.migrations) {
  assert.equal(createHash("sha256").update(readFileSync(`local/commerce/migrations/${migration.filename}`)).digest("hex"), migration.checksum);
}
const ledger = JSON.parse(sql("select json_agg(json_build_object('version',version,'checksum',checksum) order by version) from local_commerce.migration_ledger;"));
assert.equal(ledger.length, 41);
for (const [index, migration] of manifest.migrations.entries()) {
  assert.equal(ledger[index].version, migration.version);
  assert.equal(ledger[index].checksum, migration.checksum);
}

const stack = JSON.parse(command(path.resolve("node_modules/.bin/supabase"), ["status", "--workdir", workdir, "-o", "json"]));
assert.equal(new URL(stack.API_URL).hostname, "127.0.0.1");
const retainedStack = JSON.parse(command(path.resolve("node_modules/.bin/supabase"), ["status", "--workdir", path.join(root, "local", "commerce"), "-o", "json"]));
assert.equal(typeof retainedStack.SERVICE_ROLE_KEY, "string");
const fileEnv = Object.fromEntries(readFileSync(path.join(root, ".env.local"), "utf8").split("\n").flatMap((line) => {
  const value = line.trim();
  if (!value || value.startsWith("#")) return [];
  const separator = value.indexOf("=");
  if (separator < 1) return [];
  const key = value.slice(0, separator);
  let parsed = value.slice(separator + 1);
  if ((parsed.startsWith('"') && parsed.endsWith('"')) || (parsed.startsWith("'") && parsed.endsWith("'"))) parsed = parsed.slice(1, -1);
  return [[key, parsed]];
}));
const env = { ...fileEnv, ...process.env,
  NODE_ENV: "test", APP_DEPLOYMENT_ENV: "test",
  LOCAL_COMMERCE_ENVIRONMENT: "test", LOCAL_COMMERCE_PROJECT_KIND: "disposable_test",
  LOCAL_COMMERCE_PROJECT_ID: projectId, LOCAL_COMMERCE_RUN_ID: runId,
  LOCAL_COMMERCE_DB_MAJOR_VERSION: "17", LOCAL_COMMERCE_MARKER_DIGEST: markerDigest,
  LOCAL_COMMERCE_SERVICE_ROLE_KEY: retainedStack.SERVICE_ROLE_KEY,
  LOCAL_COMMERCE_SHADOW_DB_PORT: "56220", LOCAL_COMMERCE_API_PORT: "56221", LOCAL_COMMERCE_DB_PORT: "56222",
  LOCAL_COMMERCE_STUDIO_PORT: "56223", LOCAL_COMMERCE_SMTP_PORT: "56224", LOCAL_COMMERCE_IMAGE_HELPER_PORT: "56225",
  CUSTOMER_AUTH_SOURCE: "local_persistent",
  PHOTOGIFT_PRODUCT_SOURCE: "local_persistent", CART_SOURCE: "local_persistent",
  LOCAL_CHECKOUT_SOURCE: "local_persistent", LOCAL_ORDER_SOURCE: "local_persistent",
  CUSTOMER_UPLOAD_SOURCE: "disabled", LOCAL_PAYMENT_SOURCE: "disabled",
  LOCAL_FULFILLMENT_SOURCE: "disabled", LOCAL_TRACKING_SOURCE: "disabled",
  ADMIN_ACCEPTANCE_SOURCE: "local_fake", CLOUDFLARE_INCLUDE_PROCESS_ENV: "true",
  WRANGLER_SEND_METRICS: "false", WRANGLER_WRITE_LOGS: "false" };
env.LOCAL_COMMERCE_API_URL = stack.API_URL;
env.LOCAL_COMMERCE_RPC_URL = stack.API_URL;
env.LOCAL_COMMERCE_STORAGE_URL = `${stack.API_URL}/storage/v1`;
env.LOCAL_COMMERCE_IMAGE_HELPER_URL = `http://127.0.0.1:${env.LOCAL_COMMERCE_IMAGE_HELPER_PORT}`;
for (const [key, value] of Object.entries({
  SHADOW_DB: env.LOCAL_COMMERCE_SHADOW_DB_PORT, API: env.LOCAL_COMMERCE_API_PORT, DB: env.LOCAL_COMMERCE_DB_PORT,
  STUDIO: env.LOCAL_COMMERCE_STUDIO_PORT, SMTP: env.LOCAL_COMMERCE_SMTP_PORT, IMAGE_HELPER: env.LOCAL_COMMERCE_IMAGE_HELPER_PORT,
})) if (value) env[`LOCAL_COMMERCE_${key}_PORT`] = value;

const base = catalogDatabaseRows(projectId);
const replacement = Object.fromEntries(Object.keys(base).flatMap((key) => {
  const ids = key === "categories" ? [base.categories[0].id]
    : key === "products" ? [base.products[0].id, base.products[0].category_id, base.products[0].option_definitions[0].id, base.products[0].option_value_definitions[0].id, base.products[0].fulfillment_definition.id]
      : key === "variants" ? [base.variants[0].id]
        : key === "configurations" ? [base.configurations[0].id, base.configurations[0].product_id, base.configurations[0].definition.fields[0].id]
          : base.rules.map((rule) => rule.id);
  return ids.map((id) => [id, randomUUID()]);
}));
let encoded = JSON.stringify(base);
for (const [from, to] of Object.entries(replacement)) encoded = encoded.replaceAll(from, to);
const rows = JSON.parse(encoded);
const productId = rows.products[0].id;
const variantId = rows.variants[0].id;
const fieldCaption = rows.configurations[0].definition.fields[0].id;
const fieldDedication = randomUUID();
rows.categories[0].slug = `c03-${randomUUID()}`;
rows.products[0].slug = `c03-${randomUUID()}`;
rows.products[0].name = "C03 synthetic keepsake";
rows.variants[0].sku_code = `C03-${randomUUID().replaceAll("-", "").slice(0, 24).toUpperCase()}`;
rows.products[0].fulfillment_definition.requiresProductionPreview = false;
rows.configurations[0].definition.fields = [
  { ...rows.configurations[0].definition.fields[0], label: "Caption", kind: "short_text", required: false, isActive: true, position: 0 },
  { id: fieldDedication, productId, code: "dedication", label: "Dedication", kind: "long_text", required: false, isActive: true, position: 1,
    configurationRevision: "1", constraints: { maxLength: 120 } },
];
const shippingMethod = `c03_${randomUUID().replaceAll("-", "").slice(0, 20)}`;
rows.rules[0].rule_key = `c03-shipping-${randomUUID()}`;
rows.rules[0].definition.method = shippingMethod;
rows.rules[1].rule_key = `c03-coupon-${randomUUID()}`;
rows.rules.push(
  { project_id: projectId, id: randomUUID(), version: 1, lifecycle: "active", rule_key: `c03-caption-${randomUUID()}`, revision: 1, rule_status: "active",
    definition: { kind: "customization_surcharge", ruleRevision: 1, productId, configurationRevision: "1", selector: { kind: "field_present", fieldId: fieldCaption }, amountCents: 300, currency: "USD" } },
  { project_id: projectId, id: randomUUID(), version: 1, lifecycle: "active", rule_key: `c03-dedication-${randomUUID()}`, revision: 1, rule_status: "active",
    definition: { kind: "customization_surcharge", ruleRevision: 1, productId, configurationRevision: "1", selector: { kind: "field_present", fieldId: fieldDedication }, amountCents: 200, currency: "USD" } },
  { project_id: projectId, id: randomUUID(), version: 1, lifecycle: "active", rule_key: `c03-unrelated-${randomUUID()}`, revision: 1, rule_status: "active",
    definition: { kind: "customization_surcharge", ruleRevision: 1, productId: randomUUID(), configurationRevision: "1", selector: { kind: "field_present", fieldId: fieldCaption }, amountCents: 999, currency: "USD" } },
);
const serviceHeaders = { apikey: retainedStack.SERVICE_ROLE_KEY, authorization: `Bearer ${retainedStack.SERVICE_ROLE_KEY}`, "content-type": "application/json", "content-profile": "local_commerce" };
async function persistSyntheticCatalog() {
  const existing = await fetch(`${stack.API_URL}/rest/v1/catalog_products?project_id=eq.${projectId}&id=eq.${productId}&select=id`, {
    headers: { ...serviceHeaders, "accept-profile": "local_commerce" }, signal: AbortSignal.timeout(10_000),
  });
  const existingRows = await existing.json();
  assert.equal(existing.status, 200, JSON.stringify(existingRows));
  if (existingRows.length === 1) return;
  for (const [key, table] of Object.entries({ categories: "catalog_categories", products: "catalog_products", variants: "catalog_variants", configurations: "catalog_configuration_snapshots", rules: "catalog_pricing_rules" })) {
    const response = await fetch(`${stack.API_URL}/rest/v1/${table}`, { method: "POST", headers: { ...serviceHeaders, prefer: "return=minimal" }, body: JSON.stringify(rows[key]), signal: AbortSignal.timeout(10_000) });
    assert.equal(response.status, 201, `${table}: ${await response.text()}`);
  }
}
const checks = [];
const check = async (name, action) => { await action(); checks.push(name); console.log(`PASS ${name}`); };
let cartId;
let orderId;
let originalCookie = "";
const sqlFailure = (query) => {
  const result = spawnSync("docker", ["exec", "-i", dbId, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], {
    cwd: root, input: query, encoding: "utf8", timeout: 30_000, maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(result.error, undefined, "bounded immutable-rejection probe failed");
  return result;
};
{
  await persistSyntheticCatalog();
  await check("exact disposable marker, PostgreSQL 17, and 41/41 ordered checksums", async () => {});
  Object.assign(process.env, env);
  const origin = "http://localhost:3004";
  const request = (method, body, cookie = originalCookie) => new Request(`${origin}/api/cart`, { method,
    headers: { origin, cookie, "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const handoff = { productId, variantId, skuCode: rows.variants[0].sku_code, selectedOptions: rows.variants[0].selected_options,
    configurationRevision: "1", customizationValues: [
      { fieldId: fieldCaption, fieldCode: "caption", kind: "short_text", value: " A durable caption " },
      { fieldId: fieldDedication, fieldCode: "dedication", kind: "long_text", value: "A durable dedication" },
    ] };
  await check("Cart computes one allocation per non-empty field and ignores browser price claims", async () => {
    const response = await persistentCartHttp(request("POST", { handoff, priceCents: 1, surchargeAmountCents: 999999 }), "add");
    assert.equal(response.status, 200, await response.clone().text());
    for (const header of response.headers.getSetCookie()) {
      const pair = header.split(";")[0]; const at = pair.indexOf("=");
      originalCookie += `${originalCookie ? "; " : ""}${pair.slice(0, at)}=${pair.slice(at + 1)}`;
    }
    const value = await response.json();
    assert.equal(value.lines.length, 1);
    assert.equal(value.lines[0].unitPriceCents, 3000);
    assert.equal(value.subtotalCents, 3000);
    assert.doesNotMatch(JSON.stringify(value), /pricingSnapshot|operationId|ownerId|service_role/i);
    cartId = decodeURIComponent(originalCookie.match(/figmemento-local-cart=([^;]+)/)?.[1] ?? "");
    assert.match(cartId, /^[0-9a-f-]{36}$/);
    const snapshot = JSON.parse(sql(`select pricing_snapshot::text from local_commerce.cart_lines where project_id='${projectId}' and cart_id='${cartId}' and lifecycle='active';`));
    assert.equal(snapshot.basePriceCents, 2500);
    assert.equal(snapshot.totalSurchargeCents, 500);
    assert.equal(snapshot.finalUnitPriceCents, 3000);
    assert.deepEqual(snapshot.surchargeAllocations.map((allocation) => allocation.amountCents), [300, 200]);
  });
  await check("Cart read-back and process reconstruction retain the immutable pricing snapshot", async () => {
    const read = await persistentCartHttp(request("GET", undefined), "read");
    assert.equal(read.status, 200);
    const value = await read.json();
    assert.equal(value.lines[0].unitPriceCents, 3000);
    const child = `import { persistentCartHttp } from './app/server/local-persistent-cart-http.server.ts'; const r = await persistentCartHttp(new Request('http://localhost:3004/api/cart', { headers: { cookie: process.argv[1] } }), 'read'); if (r.status !== 200) process.exit(2); console.log(JSON.stringify(await r.json()));`;
    const recovered = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", child, originalCookie], { cwd: root, env, encoding: "utf8", timeout: 30_000 });
    assert.equal(recovered.status, 0, recovered.stderr);
    assert.equal(JSON.parse(recovered.stdout).lines[0].unitPriceCents, 3000);
  });
  const checkoutBody = { email: "c03@example.invalid", firstName: "C03", lastName: "Acceptance", country: "US", city: "Test",
    addressLine1: "Synthetic C03 address", postalCode: "00000", shippingMethod };
  await check("Checkout recomputes final unit price and uses final subtotal", async () => {
    const response = await persistentCheckoutHttp(new Request("http://localhost:3004/api/checkout", { headers: { cookie: originalCookie } }), checkoutBody, env);
    assert.equal(response.status, 200, await response.clone().text());
    const value = await response.json();
    assert.equal(value.subtotalCents, 3000);
    assert.equal(value.lines[0].unitBasePriceCents, 2500);
    assert.equal(value.lines[0].unitPriceCents, 3000);
    assert.equal(value.lines[0].lineSubtotalCents, 3000);
    assert.equal(value.tax.status, "not_activated");
    assert.equal(value.tax.amountCents, null);
  });
  await check("Order stores the C03 pricing snapshot and immutable surcharge provenance", async () => {
    const body = { creationAttemptId: randomUUID(), ...checkoutBody };
    const first = await persistentOrderCreateHttp(new Request("http://localhost:3004/api/local-orders", { method: "POST", headers: { origin, cookie: originalCookie, "content-type": "application/json" } }), body, env);
    assert.equal(first.status, 204);
    const cap = first.headers.getSetCookie().map((header) => header.split(";")[0]).join("; ");
    const second = await persistentOrderCreateHttp(new Request("http://localhost:3004/api/local-orders", { method: "POST", headers: { origin, cookie: `${originalCookie}; ${cap}`, "content-type": "application/json" } }), body, env);
    assert.equal(second.status, 200, await second.clone().text());
    const projection = await second.json();
    assert.match(projection.publicReference, /^FM-LOCAL-[A-Z0-9]{16}$/);
    orderId = sql(`select id from local_commerce.orders where project_id='${projectId}' and public_reference='${projection.publicReference}';`);
    const stored = JSON.parse(sql(`select pricing_snapshot::text from local_commerce.order_item_purchase_snapshots where project_id='${projectId}' and order_item_id in (select id from local_commerce.order_items where project_id='${projectId}' and order_id='${orderId}') limit 1;`));
    assert.equal(stored.basePriceCents, 2500);
    assert.equal(stored.totalSurchargeCents, 500);
    assert.equal(stored.finalUnitPriceCents, 3000);
    const item = JSON.parse(sql(`select row_to_json(s)::text from local_commerce.order_item_purchase_snapshots s where s.project_id='${projectId}' and s.order_item_id in (select id from local_commerce.order_items where project_id='${projectId}' and order_id='${orderId}') limit 1;`));
    assert.equal(item.unit_price_cents, 3000);
    assert.equal(item.line_subtotal_cents, 3000);
    assert.equal(item.currency, "USD");
    const rejected = sqlFailure(`delete from local_commerce.order_item_purchase_snapshots s using local_commerce.order_items i where s.project_id='${projectId}' and s.order_item_id=i.id and i.project_id='${projectId}' and i.order_id='${orderId}';`);
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /immutable/i);
    assert.equal(sql(`select count(*) from local_commerce.order_item_purchase_snapshots s where s.project_id='${projectId}' and s.order_item_id in (select id from local_commerce.order_items where project_id='${projectId}' and order_id='${orderId}');`), "1");
  });
  await check("Rule change and duplicate selector fail closed without automatic Cart repair", async () => {
    const duplicate = rows.rules.find((rule) => rule.definition.kind === "customization_surcharge" && rule.definition.selector.fieldId === fieldCaption);
    const response = await fetch(`${stack.API_URL}/rest/v1/catalog_pricing_rules?project_id=eq.${projectId}&id=eq.${duplicate.id}`, { method: "PATCH", headers: { ...serviceHeaders, prefer: "return=minimal" }, body: JSON.stringify({ revision: 2,
      version: 2, definition: { ...duplicate.definition, ruleRevision: 2, amountCents: 301 } }), signal: AbortSignal.timeout(10_000) });
    assert.ok(response.status === 200 || response.status === 204);
    const duplicateInsert = { ...duplicate, id: randomUUID(), rule_key: `c03-duplicate-${randomUUID()}`, revision: 1, version: 1 };
    const inserted = await fetch(`${stack.API_URL}/rest/v1/catalog_pricing_rules`, { method: "POST", headers: { ...serviceHeaders, prefer: "return=minimal" }, body: JSON.stringify(duplicateInsert), signal: AbortSignal.timeout(10_000) });
    assert.equal(inserted.status, 201);
    const failed = await persistentCheckoutHttp(new Request("http://localhost:3004/api/checkout", { headers: { cookie: originalCookie } }), checkoutBody, env);
    assert.equal(failed.status, 503);
    const pricing = JSON.parse(sql(`select pricing_snapshot::text from local_commerce.cart_lines where project_id='${projectId}' and cart_id='${cartId}' and lifecycle='active';`));
    assert.equal(pricing.finalUnitPriceCents, 3000);
    rows.rules.push(duplicateInsert);
  });
  await check("Foreign project marker and browser price remain non-authoritative", async () => {
    const foreign = await persistentCheckoutHttp(new Request("http://localhost:3004/api/checkout", { headers: { cookie: originalCookie } }), { ...checkoutBody, priceCents: 1, surchargeAmountCents: 1, projectId: "foreign" }, { ...env, LOCAL_COMMERCE_PROJECT_ID: "foreign", LOCAL_COMMERCE_MARKER_DIGEST: "0".repeat(64) });
    assert.equal(foreign.status, 503);
  });
  console.log(JSON.stringify({ status: "PASS", task: "1.1", projectId, schemaVersion: 41, ledger: "41/41", checks: checks.length,
    cart: { finalUnitPriceCents: 3000, totalSurchargeCents: 500, allocations: 2 }, order: { orderId, pricingSnapshot: true }, remote: false }));
}
