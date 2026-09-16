// Exact-run, test-only preview-required Catalog fixture for Task 11.4 M/N.
// Catalog setup alone uses service-role PostgREST; purchase facts are created
// only through the ordinary Cart, Checkout, and Order HTTP boundaries.
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

import { LocalCatalogAuthority } from "../../app/infrastructure/local-commerce/local-catalog-authority.server.ts";
import { readPersistentOrderHistoryModel } from "../../app/server/local-persistent-order-history.server.ts";
import { catalogDatabaseRows, catalogTestEnvironment, ids } from "../fixtures/local-persistent-catalog.mjs";

assert.deepEqual(process.argv.slice(2), ["run-93f6c1a2", "--confirm-disposable"]);
const run = "run-93f6c1a2";
const projectId = `figmemento-local-commerce-test-${run}`;
const root = path.resolve(".");
const workdir = path.join(root, "local/commerce/runtime/disposable", run);
const preparation = JSON.parse(readFileSync(path.join(workdir, "ledger-preparation.json"), "utf8"));
const serviceKey = process.env.LOCAL_COMMERCE_SERVICE_ROLE_KEY;
const databaseId = process.env.TASK_11_4_VERIFIED_DB_CONTAINER_ID;
assert.ok(serviceKey);
assert.match(databaseId ?? "", /^[a-f0-9]{64}$/);
assert.equal(process.env.TASK_11_4_EQUIVALENT_IDENTITY_VERIFIED, "1");
assert.equal(preparation.config.projectId, projectId);
assert.equal(preparation.config.projectKind, "disposable_test");
assert.equal(preparation.config.environment, "test");
assert.equal(preparation.config.postgresMajorVersion, 17);

function command(binary, args, input, timeout = 30_000) {
  const result = spawnSync(binary, args, { cwd: root, input, encoding: "utf8", timeout, maxBuffer: 16 * 1024 * 1024 });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, (result.stderr || "command failed").replace(/eyJ[A-Za-z0-9_.-]+/g, "[redacted]").split("\n")[0]);
  return result.stdout.trim();
}
const sql = (query) => command("docker", ["exec", "-i", databaseId, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], query);
assert.equal(sql("select current_setting('server_version_num')::int/10000;"), "17");
assert.equal(sql(`select local_commerce.verify_project_identity('${projectId}','${preparation.markerDigest}');`), "t");
assert.equal(sql("select count(*) from local_commerce.migration_ledger;"), "37");

const target = Object.fromEntries(Object.keys(ids).map((key, index) => [key, `11800000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`]));
let encoded = JSON.stringify(catalogDatabaseRows(projectId));
for (const key of Object.keys(target)) encoded = encoded.replaceAll(ids[key], target[key]);
const rows = JSON.parse(encoded);
rows.categories[0].slug = "task-11-4-preview-required";
rows.categories[0].name = "Task 11.4 preview-required acceptance";
rows.products[0].slug = "task-11-4-preview-required";
rows.products[0].name = "Task 11.4 preview-required acceptance product";
rows.variants[0].sku_code = "TASK-11-4-PREVIEW-001";
Object.assign(rows.products[0].fulfillment_definition, {
  fulfillmentType: "physical", requiresShipping: true,
  productionMode: "custom_manufacturing", requiresProductionPreview: true,
});
rows.configurations[0].definition.fields = [];
rows.rules = rows.rules.filter((row) => row.definition.kind === "shipping");
rows.rules[0].rule_key = "task-11-4-preview-shipping-us";
rows.rules[0].definition.method = "task_11_4_preview_standard";

const expected = [["catalog_categories", target.category], ["catalog_products", target.product],
  ["catalog_variants", target.variant], ["catalog_configuration_snapshots", target.config], ["catalog_pricing_rules", target.shipping]];
const existing = expected.reduce((sum, [table, id]) => sum + Number(sql(`select count(*) from local_commerce.${table} where project_id='${projectId}' and id='${id}';`)), 0);
assert.ok(existing === 0 || existing === expected.length, "TASK 11.4 PREVIEW FIXTURE IDENTITY CONFLICT");
const headers = { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, "content-type": "application/json",
  "content-profile": "local_commerce", prefer: "return=minimal" };
if (existing === 0) {
  for (const [key, table] of Object.entries({ categories: "catalog_categories", products: "catalog_products",
    variants: "catalog_variants", configurations: "catalog_configuration_snapshots", rules: "catalog_pricing_rules" })) {
    const response = await fetch(`${preparation.config.endpoints.apiUrl}/rest/v1/${table}`, { method: "POST", headers,
      body: JSON.stringify(rows[key]), signal: AbortSignal.timeout(10_000) });
    assert.equal(response.status, 201, `${table}: ${await response.text()}`);
  }
}

async function freePort() { return new Promise((resolve, reject) => { const server = net.createServer(); server.once("error", reject);
  server.listen(0, "127.0.0.1", () => { const address = server.address(); assert.ok(address && typeof address === "object");
    server.close((error) => error ? reject(error) : resolve(address.port)); }); }); }
const appPort = await freePort();
const environment = { ...process.env, ...catalogTestEnvironment({ LOCAL_COMMERCE_RUN_ID: run, LOCAL_COMMERCE_PROJECT_ID: projectId,
  LOCAL_COMMERCE_MARKER_DIGEST: preparation.markerDigest, LOCAL_COMMERCE_SERVICE_ROLE_KEY: serviceKey,
  CUSTOMER_AUTH_SOURCE: "local_persistent", CART_SOURCE: "local_persistent", PHOTOGIFT_PRODUCT_SOURCE: "local_persistent",
  CUSTOMER_UPLOAD_SOURCE: "local_persistent", LOCAL_CHECKOUT_SOURCE: "local_persistent", LOCAL_ORDER_SOURCE: "local_persistent",
  LOCAL_PAYMENT_SOURCE: "local_persistent", LOCAL_FULFILLMENT_SOURCE: "local_persistent", LOCAL_TRACKING_SOURCE: "local_persistent",
  LOCAL_ORDER_CAPABILITY_SECRET: randomBytes(32).toString("hex"), LOCAL_ORDER_CAPABILITY_TTL_SECONDS: "3600",
  PHOTOGIFT_GUEST_DRAFT_OWNER_SECRET: randomBytes(48).toString("base64url"), PHOTOGIFT_GUEST_DRAFT_OWNER_CONTEXT_TTL_SECONDS: "3600" }),
  CLOUDFLARE_INCLUDE_PROCESS_ENV: "true", WRANGLER_SEND_METRICS: "false", WRANGLER_WRITE_LOGS: "false", NODE_OPTIONS: "",
  LOCAL_COMMERCE_ACCEPTANCE_DISABLE_INSPECTOR: "true" };
for (const [name, value] of Object.entries({ SHADOW_DB: preparation.config.ports.shadowDb, API: preparation.config.ports.api,
  DB: preparation.config.ports.db, STUDIO: preparation.config.ports.studio, SMTP: preparation.config.ports.smtp })) environment[`LOCAL_COMMERCE_${name}_PORT`] = String(value);
for (const [name, value] of Object.entries({ API: preparation.config.endpoints.apiUrl, RPC: preparation.config.endpoints.rpcUrl,
  STORAGE: preparation.config.endpoints.storageUrl })) environment[`LOCAL_COMMERCE_${name}_URL`] = value;

const catalog = new LocalCatalogAuthority(environment);
const snapshot = await catalog.readSnapshot(); assert.equal(snapshot.status, "found");
const product = snapshot.value.dataSet.products.find((item) => item.id === target.product);
const variant = snapshot.value.dataSet.variants.find((item) => item.id === target.variant);
const fulfillment = snapshot.value.dataSet.fulfillmentConfigs.find((item) => item.productId === target.product);
const purchaseFulfillment = snapshot.value.purchasedFulfillments[target.product];
const configuration = await catalog.getCustomizationFieldsForProduct(target.product);
assert.equal(product?.lifecycle, "published"); assert.equal(variant?.isActive, true); assert.equal(variant?.isAvailable, true);
assert.equal(variant?.skuCode, "TASK-11-4-PREVIEW-001"); assert.equal(configuration.status, "found");
assert.equal(configuration.value.configurationRevision, "1"); assert.equal(configuration.value.fields.length, 0);
assert.deepEqual([fulfillment?.fulfillmentType, fulfillment?.requiresShipping, fulfillment?.productionMode,
  purchaseFulfillment.requiresProductionPreview], ["physical", true, "custom_manufacturing", true]);

const secrets = [serviceKey, environment.LOCAL_ORDER_CAPABILITY_SECRET, environment.PHOTOGIFT_GUEST_DRAFT_OWNER_SECRET];
const redact = (input) => secrets.reduce((value, secret) => value.split(secret).join("[redacted]"), String(input ?? "")).replace(/eyJ[A-Za-z0-9_.-]+/g, "[redacted]");
let logs = "";
const worker = spawn(process.execPath, ["tests/database/local-commerce-test-worker.mjs", run, "--confirm-disposable", String(appPort)],
  { cwd: root, env: environment, stdio: ["ignore", "pipe", "pipe"] });
for (const stream of [worker.stdout, worker.stderr]) stream.on("data", (chunk) => { logs = (logs + redact(chunk)).slice(-30_000); });
async function stop() { if (worker.exitCode !== null || worker.signalCode !== null) return; const done = new Promise((resolve) => worker.once("exit", resolve));
  worker.kill("SIGTERM"); await Promise.race([done, new Promise((resolve) => setTimeout(resolve, 5000))]); if (worker.exitCode === null && worker.signalCode === null) { worker.kill("SIGKILL"); await done; } }
class Jar { constructor() { this.values = new Map(); } header() { return [...this.values].map(([key, value]) => `${key}=${value}`).join("; "); }
  accept(response) { for (const value of response.headers.getSetCookie()) { const pair = value.split(";")[0], at = pair.indexOf("=");
    const item = pair.slice(at + 1); if (item) this.values.set(pair.slice(0, at), item); } } }
const origin = `http://127.0.0.1:${appPort}`;
async function request(jar, route, body) { const response = await fetch(origin + route, { method: "POST",
  headers: { origin, cookie: jar.header(), "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) });
  jar.accept(response); return response; }
try {
  for (let attempt = 0; attempt < 100; attempt += 1) { assert.equal(worker.exitCode, null, logs); try {
    const response = await fetch(`${origin}/api/customer-auth/session`, { signal: AbortSignal.timeout(1500) }); await response.arrayBuffer(); if (response.status === 200) break;
  } catch { /* readiness */ } if (attempt === 99) assert.fail(logs); await new Promise((resolve) => setTimeout(resolve, 300)); }
  const jar = new Jar();
  const handoff = { productId: target.product, variantId: target.variant, skuCode: variant.skuCode,
    selectedOptions: variant.selectedOptions, configurationRevision: "1", customizationValues: [] };
  let response = await request(jar, "/api/cart", { handoff }); assert.equal(response.status, 200, await response.clone().text()); await response.arrayBuffer();
  const orderInput = { creationAttemptId: randomUUID(), email: "task-11-4-preview@example.invalid", firstName: "Task", lastName: "Preview",
    country: "US", city: "Test", addressLine1: "Synthetic acceptance only", postalCode: "00000", shippingMethod: "task_11_4_preview_standard" };
  response = await request(jar, "/api/checkout", Object.fromEntries(Object.entries(orderInput).filter(([key]) => key !== "creationAttemptId")));
  assert.equal(response.status, 200, await response.clone().text()); await response.arrayBuffer();
  response = await request(jar, "/api/local-orders", orderInput); assert.equal(response.status, 204, await response.clone().text()); await response.arrayBuffer();
  response = await request(jar, "/api/local-orders", orderInput); assert.equal(response.status, 200, await response.clone().text());
  const created = await response.json(); assert.match(created.publicReference, /^FM-LOCAL-[A-Z0-9]{16}$/);
  const identity = JSON.parse(sql(`select json_build_object('orderId',o.id,'orderItemId',i.id) from local_commerce.orders o join local_commerce.order_items i on i.project_id=o.project_id and i.order_id=o.id where o.project_id='${projectId}' and o.public_reference='${created.publicReference}';`));
  const history = await readPersistentOrderHistoryModel(new Request(origin, { headers: { cookie: jar.header() } }),
    { ...identity, publicReference: created.publicReference }, environment);
  assert.equal(history.status, "found");
  assert.equal(history.value.fulfillment.requiresProductionPreview, true);
  assert.ok(Array.isArray(history.value.media)); assert.equal(history.value.media.length, 0);
  assert.deepEqual(history.value.customizationValues, []);
  const durable = JSON.parse(sql(`select json_build_object('requiresPreview',customization_facts#>'{fulfillment,requiresProductionPreview}','media',receipt_references) from local_commerce.order_item_purchase_snapshots where project_id='${projectId}' and order_item_id='${identity.orderItemId}';`));
  assert.equal(durable.requiresPreview, true); assert.ok(Array.isArray(durable.media)); assert.equal(durable.media.length, 0);
  console.info(JSON.stringify({ status: "PASS", fixture: existing === 0 ? "CREATED" : "REUSED", run, projectId,
    productId: target.product, variantId: target.variant, skuCode: variant.skuCode, configurationRevision: "1",
    fulfillment: { fulfillmentType: "physical", requiresShipping: true, productionMode: "custom_manufacturing", requiresProductionPreview: true },
    purchaseSmoke: { workerPid: worker.pid, checkout: 200, order: 200, publicReference: created.publicReference,
      immutableRequiresProductionPreview: true, mediaPresent: true, mediaCount: 0 }, rawCredentialReported: false }));
} catch (error) { console.error(redact(error?.stack ?? error)); console.error(logs); process.exitCode = 1; }
finally { await stop(); }
