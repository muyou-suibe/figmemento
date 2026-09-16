// Task 9.1 exact retained-run acceptance. Synthetic Orders and private objects
// only; no reset/delete, grant/ticket activation, remote service, or provider.
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:net";
import { spawn, spawnSync } from "node:child_process";
import { catalogDatabaseRows, catalogTestEnvironment, ids } from "../fixtures/local-persistent-catalog.mjs";

const run = "run-5576dfd8";
const project = `figmemento-local-commerce-test-${run}`;
const dir = `${process.cwd()}/local/commerce/runtime/disposable/${run}`;
const prep = JSON.parse(readFileSync(`${dir}/ledger-preparation.json`, "utf8"));
const c = prep.config;
const db = "3f0a14e18d07b71e0b235dffcdc61e672086d6fb5b32b35849aa8bf54f3be3e4";
function command(bin, args, input) {
  const result = spawnSync(bin, args, { input, encoding: "utf8", timeout: 30000, maxBuffer: 16 * 1024 * 1024 });
  assert.equal(result.status, 0, result.error?.code ?? result.stderr);
  return result.stdout.trim();
}
const inspected = JSON.parse(command("docker", ["inspect", db]))[0];
assert.equal(inspected.Id, db);
assert.equal(inspected.State.Status, "running");
assert.equal(inspected.Config.Labels["com.supabase.cli.workdir"], dir);
assert.equal(c.projectId, project);
const sql = (query) => command("docker", ["exec", "-i", db, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], query);
assert.equal(sql("select current_setting('server_version_num')::int/10000;"), "17");
assert.equal(sql(`select local_commerce.verify_project_identity('${project}','${prep.markerDigest}');`), "t");
const manifest = JSON.parse(readFileSync("local/commerce/migrations/manifest.json", "utf8"));
assert.equal(manifest.schemaVersion, 32);
const ledger = JSON.parse(sql("select json_agg(json_build_object('version',version,'checksum',checksum) order by version) from local_commerce.migration_ledger;"));
assert.equal(ledger.length, manifest.schemaVersion);
manifest.migrations.forEach((migration, index) => {
  assert.equal(ledger[index].version, migration.version);
  assert.equal(ledger[index].checksum, migration.checksum);
  assert.equal(createHash("sha256").update(readFileSync(`local/commerce/migrations/${migration.filename}`)).digest("hex"), migration.checksum);
});
const info = JSON.parse(command("node_modules/.bin/supabase", ["status", "--workdir", dir, "-o", "json"]));
assert.equal(info.API_URL, c.endpoints.apiUrl);
const adminPassword = randomBytes(32).toString("hex");
const env = {
  ...process.env,
  ...catalogTestEnvironment({
    LOCAL_COMMERCE_RUN_ID: run, LOCAL_COMMERCE_PROJECT_ID: project,
    LOCAL_COMMERCE_MARKER_DIGEST: prep.markerDigest, LOCAL_COMMERCE_SERVICE_ROLE_KEY: info.SERVICE_ROLE_KEY,
    CUSTOMER_AUTH_SOURCE: "local_persistent", CART_SOURCE: "local_persistent",
    PHOTOGIFT_PRODUCT_SOURCE: "local_persistent", LOCAL_CHECKOUT_SOURCE: "local_persistent",
    CUSTOMER_UPLOAD_SOURCE: "local_persistent", LOCAL_ORDER_SOURCE: "local_persistent",
    LOCAL_PAYMENT_SOURCE: "local_persistent", LOCAL_FULFILLMENT_SOURCE: "local_persistent",
    LOCAL_TRACKING_SOURCE: "local_persistent", ADMIN_ACCEPTANCE_SOURCE: "local_persistent",
    LOCAL_FULFILLMENT_OPERATOR: "enabled", LOCAL_TRACKING_OPERATOR: "enabled",
    ADMIN_PASSWORD: adminPassword, LOCAL_ORDER_CAPABILITY_SECRET: randomBytes(32).toString("hex"),
    LOCAL_ORDER_CAPABILITY_TTL_SECONDS: "3600", PHOTOGIFT_GUEST_DRAFT_OWNER_SECRET: randomBytes(48).toString("base64url"),
    PHOTOGIFT_GUEST_DRAFT_OWNER_CONTEXT_TTL_SECONDS: "3600",
  }),
  CLOUDFLARE_INCLUDE_PROCESS_ENV: "true", WRANGLER_SEND_METRICS: "false", WRANGLER_WRITE_LOGS: "false",
  NODE_OPTIONS: "", LOCAL_COMMERCE_ACCEPTANCE_DISABLE_INSPECTOR: "true",
};
for (const [key, value] of Object.entries({ SHADOW_DB: c.ports.shadowDb, API: c.ports.api, DB: c.ports.db, STUDIO: c.ports.studio, SMTP: c.ports.smtp, IMAGE_HELPER: c.ports.imageHelper })) env[`LOCAL_COMMERCE_${key}_PORT`] = String(value);
for (const [key, value] of Object.entries({ API: c.endpoints.apiUrl, RPC: c.endpoints.rpcUrl, STORAGE: c.endpoints.storageUrl, IMAGE_HELPER: c.endpoints.imageHelperUrl })) env[`LOCAL_COMMERCE_${key}_URL`] = value;

const ports = [c.ports.imageHelper + 44, c.ports.imageHelper + 45];
const origins = ports.map((port) => `http://127.0.0.1:${port}`);
for (const port of ports) await new Promise((resolve, reject) => {
  const server = createServer(); server.once("error", reject); server.listen(port, "127.0.0.1", () => server.close(resolve));
});
const children = [];
let logs = "";
function start(index, fault) {
  const child = spawn(process.execPath, ["tests/database/local-commerce-test-worker.mjs", run, "--confirm-disposable", String(ports[index]), ...(fault ? [fault] : [])], { env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
  children.push(child);
  for (const stream of [child.stdout, child.stderr]) stream.on("data", (bytes) => { logs = (logs + bytes).slice(-30000); });
  return child;
}
async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const done = new Promise((resolve) => child.once("exit", resolve));
  process.kill(-child.pid, "SIGTERM");
  await Promise.race([done, new Promise((resolve) => setTimeout(resolve, 5000))]);
  if (child.exitCode === null && child.signalCode === null) { process.kill(-child.pid, "SIGKILL"); await done; }
}
async function ready(child, index) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    assert.equal(child.exitCode, null, logs);
    try { const response = await fetch(`${origins[index]}/api/customer-auth/session`, { signal: AbortSignal.timeout(2000) }); await response.arrayBuffer(); if (response.status === 200) return; } catch { /* bounded readiness */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.fail(`Worker readiness blocked: ${logs}`);
}
const cookie = (jar) => [...jar].map(([key, value]) => `${key}=${value}`).join("; ");
function accept(jar, response) {
  for (const value of response.headers.getSetCookie()) { const pair = value.split(";")[0]; const at = pair.indexOf("="); jar.set(pair.slice(0, at), pair.slice(at + 1)); }
}
const send = (index, path, body, jar = new Map()) => fetch(`${origins[index]}${path}`, { method: "POST", headers: { origin: origins[index], cookie: cookie(jar), "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
const serviceHeaders = { apikey: info.SERVICE_ROLE_KEY, authorization: `Bearer ${info.SERVICE_ROLE_KEY}`, "content-type": "application/json", "content-profile": "local_commerce" };
function fixture(kind, preview = false) {
  let encoded = JSON.stringify(catalogDatabaseRows(project));
  for (const id of Object.values(ids)) encoded = encoded.replaceAll(id, randomUUID());
  const rows = JSON.parse(encoded); const suffix = randomUUID().replaceAll("-", "");
  rows.categories[0].slug = `digital-publication-${kind}-${suffix}`;
  rows.products[0].slug = `digital-publication-${kind}-${suffix}`;
  rows.variants[0].sku_code = `DIGITAL-${kind.toUpperCase()}-${suffix}`;
  rows.products[0].fulfillment_definition.requiresProductionPreview = preview;
  rows.rules = rows.rules.filter((row) => row.definition.kind === "shipping");
  rows.rules[0].rule_key = `digital-publication-${kind}-${suffix}`;
  rows.rules[0].definition.method = `digital_publication_${kind}_${suffix}`;
  if (kind === "digital") {
    rows.products[0].fulfillment_definition.fulfillmentType = "digital";
    rows.products[0].fulfillment_definition.requiresShipping = false;
    rows.products[0].fulfillment_definition.productionMode = "digital_creation";
  }
  return rows;
}
async function persist(rows) {
  for (const [key, table] of Object.entries({ categories: "catalog_categories", products: "catalog_products", variants: "catalog_variants", configurations: "catalog_configuration_snapshots", rules: "catalog_pricing_rules" })) {
    const response = await fetch(`${c.endpoints.apiUrl}/rest/v1/${table}`, { method: "POST", headers: serviceHeaders, body: JSON.stringify(rows[key]), signal: AbortSignal.timeout(5000) });
    assert.equal(response.status, 201, `${table}: ${await response.text()}`);
  }
}
const handoff = (rows) => ({ productId: rows.products[0].id, variantId: rows.variants[0].id, skuCode: rows.variants[0].sku_code, selectedOptions: rows.variants[0].selected_options, configurationRevision: "1", customizationValues: [] });
async function newOrder(rows, pay = true) {
  const jar = new Map();
  let response = await send(0, "/api/cart", { handoff: handoff(rows) }, jar); assert.equal(response.status, 200, await response.clone().text()); accept(jar, response); await response.arrayBuffer();
  const input = { creationAttemptId: randomUUID(), email: "digital-publication@example.invalid", firstName: "Digital", lastName: "Publication", country: "US", city: "Test", addressLine1: "Synthetic only", postalCode: "00000", ...(rows.products[0].fulfillment_definition.requiresShipping ? { shippingMethod: rows.rules[0].definition.method } : {}) };
  response = await send(0, "/api/local-orders", input, jar); if (response.status === 204) { accept(jar, response); response = await send(0, "/api/local-orders", input, jar); }
  assert.equal(response.status, 200, await response.clone().text()); const { publicReference } = await response.json();
  const orderId = sql(`select id from local_commerce.orders where project_id='${project}' and public_reference='${publicReference}';`);
  const itemId = sql(`select id from local_commerce.order_items where project_id='${project}' and order_id='${orderId}' order by item_sequence limit 1;`);
  assert.match(orderId, /^[0-9a-f-]{36}$/, `Order ${publicReference} must exist in the exact persistent project`);
  assert.match(itemId, /^[0-9a-f-]{36}$/, `Order item ${publicReference} must exist in the exact persistent project`);
  if (pay) {
    response = await send(0, "/api/local-payments", { publicReference, paymentAttemptId: randomUUID(), outcome: "success" }, jar); assert.equal(response.status, 200, await response.clone().text()); await response.arrayBuffer();
    response = await send(0, `/api/local-fulfillment/operator/${publicReference}`, { fulfillmentActionId: randomUUID(), actionKind: "enter_photo_review" }, jar); assert.equal(response.status, 200, await response.clone().text()); await response.arrayBuffer();
  }
  return { jar, publicReference, orderId, itemId };
}
async function adminLogin(index = 0) { const jar = new Map(); const response = await send(index, "/api/admin/login", { password: adminPassword }, jar); assert.equal(response.status, 200); accept(jar, response); await response.arrayBuffer(); return jar; }
function pdf(label) { return new TextEncoder().encode(`%PDF-1.4\n% synthetic Task 9.1 ${label}\n%%EOF\n`); }
async function publish(index, admin, order, actionId, bytes, itemId = order.itemId, origin = origins[index]) {
  const form = new FormData(); form.set("orderNumber", order.publicReference); form.set("orderItemId", itemId); form.set("publicationActionId", actionId); form.set("file", new File([bytes], `${actionId}.pdf`, { type: "text/plain" }));
  return fetch(`${origins[index]}/api/admin/digital-delivery`, { method: "POST", headers: { origin, cookie: cookie(admin) }, body: form, signal: AbortSignal.timeout(20000) });
}
const count = (table, order) => sql(`select count(*) from local_commerce.${table} d join local_commerce.order_items i on i.project_id=d.project_id and i.id=d.order_item_id where i.order_id='${order.orderId}';`);
const report = { status: "BLOCKED", task: "9.1", run, project, ledger: manifest.schemaVersion, results: [], restarts: [] };
let normal; let fault;
try {
  normal = start(0); await ready(normal, 0);
  const digital = fixture("digital", false); const previewRequired = fixture("digital", true); const physical = fixture("physical", false);
  await persist(digital); await persist(previewRequired); await persist(physical);
  const order = await newOrder(digital); const unpaid = await newOrder(digital, false); const preview = await newOrder(previewRequired); const physicalOrder = await newOrder(physical);
  const admin = await adminLogin();
  let response = await publish(0, new Map(), order, randomUUID(), pdf("unauthorized")); assert.equal(response.status, 401); await response.arrayBuffer();
  response = await publish(0, admin, order, randomUUID(), pdf("cross-origin"), order.itemId, "https://evil.example"); assert.equal(response.status, 403); await response.arrayBuffer();
  response = await publish(0, admin, unpaid, randomUUID(), pdf("unpaid")); assert.equal(response.status, 409); await response.arrayBuffer();
  response = await publish(0, admin, physicalOrder, randomUUID(), pdf("physical")); assert.equal(response.status, 409); await response.arrayBuffer();
  response = await publish(0, admin, preview, randomUUID(), pdf("preview-unapproved")); assert.equal(response.status, 409); await response.arrayBuffer();
  response = await publish(0, admin, order, randomUUID(), pdf("cross-order"), physicalOrder.itemId); assert.equal(response.status, 409); await response.arrayBuffer();
  report.results.push("unauthorized/cross-origin/unpaid/physical/cross-order/unapproved-preview rejected");

  const firstAction = randomUUID(); const firstBytes = pdf("version-one");
  response = await publish(0, admin, order, firstAction, firstBytes); assert.equal(response.status, 200, await response.clone().text()); const first = await response.json();
  assert.equal(first.status, "committed"); assert.equal(first.publication.status, "ready"); assert.equal(first.publication.versionNumber, 1);
  assert.doesNotMatch(JSON.stringify(first), /contentReference|storagePath|bucket|signedUrl|service.role|ownerId/i);
  response = await publish(0, admin, order, firstAction, firstBytes); assert.equal(response.status, 200); const replay = await response.json(); assert.equal(replay.status, "replayed"); assert.deepEqual(replay.publication, first.publication);
  response = await publish(0, admin, order, firstAction, pdf("changed")); assert.equal(response.status, 409); await response.arrayBuffer();
  assert.equal(count("digital_versions", order), "1");
  const firstRow = JSON.parse(sql(`select json_build_object('id',id,'reference',content_reference,'digest',content_digest,'current',is_current,'status',status) from local_commerce.digital_versions where id='${first.publication.versionId}';`));
  assert.equal(firstRow.current, true); assert.equal(firstRow.status, "ready");
  report.results.push("v1 ready, exact replay stable, changed file conflicts");

  const secondAction = randomUUID(); response = await publish(0, admin, order, secondAction, pdf("version-two")); assert.equal(response.status, 200, await response.clone().text()); const second = await response.json();
  assert.equal(second.publication.versionNumber, 2); assert.equal(second.publication.status, "ready");
  const versions = JSON.parse(sql(`select json_agg(json_build_object('id',id,'version',version_number,'status',status,'current',is_current,'reference',content_reference,'digest',content_digest) order by version_number) from local_commerce.digital_versions where project_id='${project}' and order_item_id='${order.itemId}';`));
  assert.equal(versions.length, 2); assert.equal(versions[0].current, false); assert.equal(versions[1].current, true); assert.equal(versions[0].reference, firstRow.reference); assert.equal(versions[0].digest, firstRow.digest);
  assert.notEqual(versions[0].reference, versions[1].reference); assert.notEqual(versions[0].digest, versions[1].digest);
  report.results.push("replacement created immutable v2 and retained v1 bytes/metadata");

  const locator = versions[1].reference;
  const anonymous = await fetch(`${c.endpoints.storageUrl}/object/local-commerce-private/${locator}`, { headers: { apikey: info.ANON_KEY, authorization: `Bearer ${info.ANON_KEY}` }, signal: AbortSignal.timeout(5000) });
  assert.ok(anonymous.status >= 400); await anonymous.arrayBuffer();
  assert.equal(sql("select count(*) from local_commerce.digital_grants;"), "0"); assert.equal(sql("select count(*) from local_commerce.digital_tickets;"), "0");
  report.results.push("private Storage denied anon; zero grants/tickets; no Shipment prerequisite");

  await stop(normal); const lostWorker = start(0, "digital-response-loss"); normal = lostWorker; await ready(normal, 0);
  const lossOrder = await newOrder(digital); const lossAdmin = await adminLogin(); const lossAction = randomUUID(); const processA = normal.pid;
  response = await publish(0, lossAdmin, lossOrder, lossAction, pdf("response-loss")); assert.equal(response.status, 409); await response.arrayBuffer();
  assert.equal(count("digital_versions", lossOrder), "1"); assert.equal(sql(`select status from local_commerce.digital_versions where order_item_id='${lossOrder.itemId}';`), "ready");
  await stop(normal); normal = start(0); await ready(normal, 0); const processB = normal.pid; const freshAdmin = await adminLogin();
  response = await publish(0, freshAdmin, lossOrder, lossAction, pdf("response-loss")); assert.equal(response.status, 200); const recovered = await response.json(); assert.equal(recovered.status, "replayed"); assert.equal(count("digital_versions", lossOrder), "1");
  report.restarts.push({ processA, processB, result: "committed response lost then durable replay" });

  fault = start(1, "digital-storage-failure"); await ready(fault, 1); const faultAdmin = await adminLogin(1); const storageOrder = await newOrder(digital); const storageAction = randomUUID();
  response = await publish(1, faultAdmin, storageOrder, storageAction, pdf("storage-retry")); assert.equal(response.status, 409); await response.arrayBuffer(); assert.equal(sql(`select status from local_commerce.digital_versions where order_item_id='${storageOrder.itemId}';`), "pending");
  response = await publish(0, freshAdmin, storageOrder, storageAction, pdf("storage-retry")); assert.equal(response.status, 200, await response.clone().text()); assert.equal((await response.json()).publication.status, "ready"); assert.equal(count("digital_versions", storageOrder), "1");
  await stop(fault); fault = start(1, "digital-readback-mismatch"); await ready(fault, 1); const mismatchAdmin = await adminLogin(1); const mismatchOrder = await newOrder(digital); const mismatchAction = randomUUID();
  response = await publish(1, mismatchAdmin, mismatchOrder, mismatchAction, pdf("readback-mismatch")); assert.equal(response.status, 200); const failed = await response.json(); assert.equal(failed.publication.status, "failed"); assert.equal(sql(`select count(*) from local_commerce.digital_versions where order_item_id='${mismatchOrder.itemId}' and is_current;`), "0");
  report.results.push("Storage failure retained pending and exact retry resolved; readback mismatch became non-current failed");

  for (const target of [order, lossOrder, storageOrder, mismatchOrder]) {
    assert.equal(sql(`select count(*) from local_commerce.shipments where order_id='${target.orderId}';`), "0");
    assert.equal(sql(`select count(*) from local_commerce.shipment_events where order_id='${target.orderId}';`), "0");
  }
  assert.equal(sql("select count(*) from local_commerce.digital_grants;"), "0");
  report.status = "PASS"; report.classification = "LOCAL DEVELOPMENT / TEST PERSISTENCE ACCEPTANCE";
  console.info(JSON.stringify(report));
} finally {
  if (report.status !== "PASS") console.error(logs);
  await stop(fault); await stop(normal);
}
