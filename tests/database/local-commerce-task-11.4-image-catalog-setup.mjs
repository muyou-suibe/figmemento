// Exact-run Task 11.4 dependency setup. Catalog rows are the only service-role
// writes; Draft/media/Cart state is created through the real application HTTP
// and trusted image-helper boundaries.
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

import { planMigrationLedger, sha256Text } from "../../app/application/local-commerce-migration-ledger.ts";
import { validateProjectMarker } from "../../app/application/local-commerce-environment.ts";
import { LocalCatalogAuthority } from "../../app/infrastructure/local-commerce/local-catalog-authority.server.ts";
import { catalogDatabaseRows, catalogTestEnvironment, ids } from "../fixtures/local-persistent-catalog.mjs";

assert.deepEqual(process.argv.slice(2), ["run-93f6c1a2", "--confirm-disposable"]);
const run = "run-93f6c1a2";
const projectId = `figmemento-local-commerce-test-${run}`;
const root = path.resolve(".");
const workdir = path.join(root, "local/commerce/runtime/disposable", run);
const preparation = JSON.parse(readFileSync(path.join(workdir, "ledger-preparation.json"), "utf8"));
const marker = JSON.parse(readFileSync(path.join(workdir, "project-marker.json"), "utf8"));
const manifest = JSON.parse(readFileSync("local/commerce/migrations/manifest.json", "utf8"));
assert.equal(preparation.config.projectId, projectId);
assert.equal(preparation.config.projectKind, "disposable_test");
assert.equal(preparation.config.environment, "test");
assert.equal(preparation.config.postgresMajorVersion, 17);
assert.equal(validateProjectMarker(marker, preparation.config), true);
assert.equal(sha256Text(JSON.stringify(marker)), preparation.markerDigest);
assert.equal(manifest.schemaVersion, 37);
assert.equal(manifest.migrations.length, 37);

function command(binary, args, input, timeout = 30_000) {
  const result = spawnSync(binary, args, { cwd: root, input, encoding: "utf8", timeout, maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: "true" } });
  assert.equal(result.error, undefined, `${binary} bounded execution failed`);
  assert.equal(result.status, 0, (result.stderr || "command failed").replace(/eyJ[A-Za-z0-9_.-]+/g, "[redacted]").split("\n")[0]);
  return result.stdout.trim();
}
const containerIds = command("docker", ["ps", "--filter", `label=com.supabase.cli.workdir=${workdir}`, "--format", "{{.ID}}"]).split("\n").filter(Boolean);
const containers = JSON.parse(command("docker", ["inspect", ...containerIds]));
const databases = containers.filter((container) => container.Name.startsWith("/supabase_db_")
  && container.Config?.Labels?.["com.supabase.cli.workdir"] === workdir && container.State?.Running === true);
assert.equal(databases.length, 1);
const database = databases[0].Id;
const sql = (query) => command("docker", ["exec", "-i", database, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], query);
assert.equal(sql("select current_setting('server_version_num')::int/10000;"), "17");
assert.equal(sql(`select local_commerce.verify_project_identity('${projectId}','${preparation.markerDigest}');`), "t");
const applied = JSON.parse(sql("select json_agg(json_build_object('version',version,'migrationId',migration_id,'checksum',checksum,'projectId',project_id) order by version) from local_commerce.migration_ledger;"));
const plan = planMigrationLedger({ ...manifest, projectId }, applied, projectId);
assert.equal(applied.length, 37); assert.equal(plan.status, "ready"); assert.equal(plan.apply.length, 0);
for (const migration of manifest.migrations) assert.equal(sha256Text(readFileSync(path.join("local/commerce/migrations", migration.filename), "utf8")), migration.checksum);
const stack = JSON.parse(command(path.resolve("node_modules/.bin/supabase"), ["status", "--workdir", workdir, "-o", "json"]));

const target = Object.fromEntries(Object.keys(ids).map((key, index) => [key, `11600000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`]));
let encoded = JSON.stringify(catalogDatabaseRows(projectId));
for (const key of Object.keys(target)) encoded = encoded.replaceAll(ids[key], target[key]);
const rows = JSON.parse(encoded);
rows.categories[0].slug = "task-11-4-image";
rows.categories[0].name = "Task 11.4 image acceptance";
rows.products[0].slug = "task-11-4-image";
rows.products[0].name = "Task 11.4 image acceptance product";
rows.variants[0].sku_code = "TASK-11-4-IMAGE-001";
Object.assign(rows.products[0].fulfillment_definition, { fulfillmentType: "physical", requiresShipping: true,
  productionMode: "custom_manufacturing", requiresProductionPreview: false });
rows.configurations[0].definition.fields = [{ id: target.field, productId: target.product, code: "photo",
  label: "Task 11.4 synthetic photo", kind: "image", required: true, isActive: true, position: 0,
  configurationRevision: "1", constraints: { allowedMimeTypes: ["image/png", "image/jpeg", "image/webp"],
    maxBytes: 1_048_576, minDimensions: { width: 1, height: 1 }, minImageCount: 1, maxImageCount: 4, cropEnabled: true } }];
rows.rules = rows.rules.filter((row) => row.definition.kind === "shipping");
rows.rules[0].rule_key = "task-11-4-image-shipping-us";
rows.rules[0].definition.method = "task_11_4_standard";

const expected = [["catalog_categories", target.category], ["catalog_products", target.product],
  ["catalog_variants", target.variant], ["catalog_configuration_snapshots", target.config], ["catalog_pricing_rules", target.shipping]];
const existing = expected.reduce((sum, [table, id]) => sum + Number(sql(`select count(*) from local_commerce.${table} where project_id='${projectId}' and id='${id}';`)), 0);
assert.ok(existing === 0 || existing === expected.length, "TASK 11.4 IMAGE FIXTURE IDENTITY CONFLICT");
const serviceHeaders = { apikey: stack.SERVICE_ROLE_KEY, authorization: `Bearer ${stack.SERVICE_ROLE_KEY}`,
  "content-type": "application/json", "content-profile": "local_commerce", prefer: "return=minimal" };
if (existing === 0) {
  for (const [key, table] of Object.entries({ categories: "catalog_categories", products: "catalog_products",
    variants: "catalog_variants", configurations: "catalog_configuration_snapshots", rules: "catalog_pricing_rules" })) {
    const response = await fetch(`${stack.API_URL}/rest/v1/${table}`, { method: "POST", headers: serviceHeaders,
      body: JSON.stringify(rows[key]), signal: AbortSignal.timeout(10_000) });
    assert.equal(response.status, 201, `${table}: ${await response.text()}`);
  }
}

async function freePort() { return new Promise((resolve, reject) => { const server = net.createServer(); server.once("error", reject);
  server.listen(0, "127.0.0.1", () => { const address = server.address(); assert.ok(address && typeof address === "object");
    server.close((error) => error ? reject(error) : resolve(address.port)); }); }); }
const [helperPort, appPort] = await Promise.all([freePort(), freePort()]);
const environment = { ...process.env, ...catalogTestEnvironment({
  LOCAL_COMMERCE_RUN_ID: run, LOCAL_COMMERCE_PROJECT_ID: projectId, LOCAL_COMMERCE_MARKER_DIGEST: preparation.markerDigest,
  LOCAL_COMMERCE_SERVICE_ROLE_KEY: stack.SERVICE_ROLE_KEY, CUSTOMER_AUTH_SOURCE: "local_persistent", CART_SOURCE: "local_persistent",
  PHOTOGIFT_PRODUCT_SOURCE: "local_persistent", CUSTOMER_UPLOAD_SOURCE: "local_persistent", LOCAL_CHECKOUT_SOURCE: "local_persistent",
  LOCAL_ORDER_SOURCE: "local_persistent", LOCAL_PAYMENT_SOURCE: "local_persistent", LOCAL_FULFILLMENT_SOURCE: "local_persistent",
  LOCAL_TRACKING_SOURCE: "local_persistent", LOCAL_COMMERCE_IMAGE_HELPER_PORT: String(helperPort),
  LOCAL_COMMERCE_IMAGE_HELPER_URL: `http://127.0.0.1:${helperPort}`, LOCAL_COMMERCE_IMAGE_HELPER_SECRET: randomBytes(32).toString("base64url"),
  LOCAL_ORDER_CAPABILITY_SECRET: randomBytes(32).toString("hex"), PHOTOGIFT_GUEST_DRAFT_OWNER_SECRET: randomBytes(48).toString("base64url"),
}), CLOUDFLARE_INCLUDE_PROCESS_ENV: "true", WRANGLER_SEND_METRICS: "false", WRANGLER_WRITE_LOGS: "false", NODE_OPTIONS: "",
  LOCAL_COMMERCE_ACCEPTANCE_DISABLE_INSPECTOR: "true" };
for (const [name, value] of Object.entries({ SHADOW_DB: preparation.config.ports.shadowDb, API: preparation.config.ports.api,
  DB: preparation.config.ports.db, STUDIO: preparation.config.ports.studio, SMTP: preparation.config.ports.smtp })) environment[`LOCAL_COMMERCE_${name}_PORT`] = String(value);
for (const [name, value] of Object.entries({ API: preparation.config.endpoints.apiUrl, RPC: preparation.config.endpoints.rpcUrl,
  STORAGE: preparation.config.endpoints.storageUrl })) environment[`LOCAL_COMMERCE_${name}_URL`] = value;
const catalog = new LocalCatalogAuthority(environment); const snapshot = await catalog.readSnapshot(); assert.equal(snapshot.status, "found");
const product = snapshot.value.dataSet.products.find((item) => item.id === target.product);
const variant = snapshot.value.dataSet.variants.find((item) => item.id === target.variant);
const fulfillment = snapshot.value.dataSet.fulfillmentConfigs.find((item) => item.productId === target.product);
const purchaseFulfillment = snapshot.value.purchasedFulfillments[target.product];
const configuration = await catalog.getCustomizationFieldsForProduct(target.product);
assert.equal(product?.lifecycle, "published"); assert.equal(variant?.isActive, true); assert.equal(variant?.isAvailable, true);
assert.equal(variant?.skuCode, "TASK-11-4-IMAGE-001"); assert.equal(fulfillment?.fulfillmentType, "physical");
assert.equal(fulfillment?.requiresShipping, true); assert.equal(fulfillment?.productionMode, "custom_manufacturing");
assert.equal(purchaseFulfillment.requiresProductionPreview, false); assert.equal(configuration.status, "found");
const field = configuration.value.fields[0]; assert.equal(configuration.value.configurationRevision, "1"); assert.equal(field.id, target.field);
assert.equal(field.kind, "image"); assert.equal(field.required, true); assert.deepEqual(field.constraints.allowedMimeTypes, ["image/png", "image/jpeg", "image/webp"]);
assert.equal(field.constraints.maxBytes, 1_048_576); assert.deepEqual(field.constraints.minDimensions, { width: 1, height: 1 });
assert.equal(field.constraints.minImageCount, 1); assert.equal(field.constraints.maxImageCount, 4); assert.equal(field.constraints.cropEnabled, true);

const secrets = [stack.SERVICE_ROLE_KEY, stack.ANON_KEY, stack.JWT_SECRET, environment.LOCAL_COMMERCE_IMAGE_HELPER_SECRET,
  environment.LOCAL_ORDER_CAPABILITY_SECRET, environment.PHOTOGIFT_GUEST_DRAFT_OWNER_SECRET].filter(Boolean);
const redact = (input) => secrets.reduce((value, secret) => value.split(secret).join("[redacted]"), String(input ?? "")).replace(/eyJ[A-Za-z0-9_.-]+/g, "[redacted]");
let logs = ""; const children = [];
function start(args) { const child = spawn(process.execPath, args, { cwd: root, env: environment, stdio: ["ignore", "pipe", "pipe"] }); children.push(child);
  for (const stream of [child.stdout, child.stderr]) stream.on("data", (chunk) => { logs = (logs + redact(chunk)).slice(-30_000); }); return child; }
async function stop(child) { if (!child || child.exitCode !== null || child.signalCode !== null) return; const done = new Promise((resolve) => child.once("exit", resolve));
  child.kill("SIGTERM"); await Promise.race([done, new Promise((resolve) => setTimeout(resolve, 5000))]); if (child.exitCode === null && child.signalCode === null) { child.kill("SIGKILL"); await done; } }
class Jar { constructor() { this.values = new Map(); } header() { return [...this.values].map(([key, value]) => `${key}=${value}`).join("; "); }
  accept(response) { for (const value of response.headers.getSetCookie()) { const [pair] = value.split(";"); const at = pair.indexOf("=");
    const key = pair.slice(0, at); const item = pair.slice(at + 1); if (item) this.values.set(key, item); else this.values.delete(key); } } }
const origin = `http://127.0.0.1:${appPort}`;
async function request(jar, method, route, body, headers = {}) { const options = { method, headers: { origin, cookie: jar.header(), ...headers }, signal: AbortSignal.timeout(30_000) };
  if (body instanceof FormData) options.body = body; else { options.headers["content-type"] = "application/json"; options.body = JSON.stringify(body); }
  const response = await fetch(`${origin}${route}`, options); jar.accept(response); return response; }
let helper; let worker;
try {
  helper = start(["local/commerce/image-helper/server.mjs"]); worker = start(["tests/database/local-commerce-test-worker.mjs", run, "--confirm-disposable", String(appPort)]);
  for (let attempt = 0; attempt < 100; attempt += 1) { assert.equal(worker.exitCode, null, logs); try { const response = await fetch(`${origin}/api/customer-auth/session`, { signal: AbortSignal.timeout(1500) }); await response.arrayBuffer(); if (response.status === 200) break; } catch { /* readiness */ }
    if (attempt === 99) assert.fail(logs); await new Promise((resolve) => setTimeout(resolve, 300)); }
  const jar = new Jar();
  let response = await request(jar, "POST", "/api/local-drafts", { productId: target.product }, { "Idempotency-Key": randomUUID() });
  assert.equal(response.status, 201, await response.clone().text()); const draft = await response.json();
  const sharp = createRequire(path.resolve("local/commerce/image-helper/package.json"))("sharp");
  const bytes = await sharp({ create: { width: 8, height: 6, channels: 3, background: "#c4815a" } }).png().toBuffer();
  const form = new FormData(); form.set("file", new File([bytes], "task-11-4-smoke.png", { type: "image/png" }));
  const uploadRoute = `/api/uploads?${new URLSearchParams({ productId: target.product, fieldId: target.field,
    draftId: draft.draftId, expectedVersion: String(draft.version) })}`;
  response = await request(jar, "POST", uploadRoute, form, { "Idempotency-Key": randomUUID() });
  assert.equal(response.status, 201, await response.clone().text()); const uploaded = await response.json(); const receiptId = uploaded.receipt.receiptId;
  response = await request(jar, "PUT", `/api/local-drafts/${draft.draftId}`, { expectedVersion: draft.version,
    slots: [{ fieldId: target.field, receiptReference: receiptId }] }, { "Idempotency-Key": randomUUID() });
  assert.equal(response.status, 200, await response.clone().text()); const savedDraft = await response.json();
  assert.equal(savedDraft.slots.length, 1); assert.equal(savedDraft.slots[0].receiptReference, receiptId);
  const handoff = { productId: target.product, variantId: target.variant, skuCode: "TASK-11-4-IMAGE-001",
    selectedOptions: [{ optionId: target.option, valueId: target.value }], configurationRevision: "1",
    customizationValues: [{ fieldId: target.field, fieldCode: "photo", kind: "image", images: [{ receiptId }] }] };
  response = await request(jar, "POST", "/api/cart", { handoff }); assert.equal(response.status, 200, await response.clone().text());
  const cart = await response.json(); assert.equal(cart.lines.length, 1); assert.equal(cart.lines[0].productId, target.product);
  assert.equal(sql(`select count(*) from local_commerce.media_receipts where project_id='${projectId}' and receipt_reference='${receiptId}' and product_id='${target.product}' and field_key='${target.field}' and receipt_status='ready' and lifecycle='active';`), "1");
  console.info(JSON.stringify({ status: "PASS", fixture: existing === 0 ? "CREATED" : "REUSED", run, projectId, postgres: 17,
    ledger: "37/37", pending: 0, checksums: "37/37", productId: target.product, variantId: target.variant,
    fieldId: target.field, skuCode: variant.skuCode, configurationRevision: "1", imagePolicy: { required: true,
      allowedMimeTypes: field.constraints.allowedMimeTypes, maxBytes: field.constraints.maxBytes, minDimensions: field.constraints.minDimensions,
      minImageCount: field.constraints.minImageCount, maxImageCount: field.constraints.maxImageCount, cropEnabled: field.constraints.cropEnabled },
    fulfillment: { fulfillmentType: fulfillment.fulfillmentType, requiresShipping: fulfillment.requiresShipping,
      productionMode: fulfillment.productionMode, requiresProductionPreview: purchaseFulfillment.requiresProductionPreview },
    smoke: { workerPid: worker.pid, helperPid: helper.pid, receiptReady: true, privateStorage: true, cartLines: 1 }, rawCredentialReported: false }));
} catch (error) { console.error(redact(error?.stack ?? error)); console.error(logs); process.exitCode = 1; }
finally { await stop(worker); await stop(helper); }
