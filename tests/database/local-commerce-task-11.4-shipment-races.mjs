// Task 11.4 O/P: two live Workers race the existing Shipment commands.
// Synthetic Catalog and Orders only; no reset, migration, carrier or Supplier.
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:net";
import { spawn, spawnSync } from "node:child_process";

import { catalogDatabaseRows, catalogTestEnvironment, ids } from "../fixtures/local-persistent-catalog.mjs";

const run = process.argv[2];
assert.match(run ?? "", /^run-[a-f0-9]{8}$/);
assert.equal(process.argv[3], "--confirm-disposable");
const workdir = `${process.cwd()}/local/commerce/runtime/disposable/${run}`;
const preparation = JSON.parse(readFileSync(`${workdir}/ledger-preparation.json`, "utf8"));
const config = preparation.config;
const project = config.projectId;
const database = process.env.TASK_11_4_VERIFIED_DB_CONTAINER_ID;
assert.match(database ?? "", /^[a-f0-9]{64}$/);

function command(bin, args, input) {
  const result = spawnSync(bin, args, { input, encoding: "utf8", timeout: 30_000, maxBuffer: 16 * 1024 * 1024 });
  assert.equal(result.status, 0, result.error?.code ?? result.stderr);
  return result.stdout.trim();
}
const inspected = JSON.parse(command("docker", ["inspect", database]))[0];
assert.equal(inspected.Id, database);
assert.equal(inspected.State.Status, "running");
assert.equal(inspected.Config.Labels["com.supabase.cli.workdir"], workdir);
const sql = (query) => command("docker", ["exec", "-i", database, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], query);
assert.equal(sql("select current_setting('server_version_num')::int/10000;"), "17");
assert.equal(sql(`select local_commerce.verify_project_identity('${project}','${preparation.markerDigest}');`), "t");
const manifest = JSON.parse(readFileSync("local/commerce/migrations/manifest.json", "utf8"));
const ledger = JSON.parse(sql("select json_agg(json_build_object('version',version,'checksum',checksum) order by version) from local_commerce.migration_ledger;"));
assert.equal(ledger.length, manifest.schemaVersion);
manifest.migrations.forEach((entry, index) => {
  assert.equal(ledger[index].version, entry.version);
  assert.equal(ledger[index].checksum, entry.checksum);
  assert.equal(createHash("sha256").update(readFileSync(`local/commerce/migrations/${entry.filename}`)).digest("hex"), entry.checksum);
});
const stack = JSON.parse(command("node_modules/.bin/supabase", ["status", "--workdir", workdir, "-o", "json"]));
assert.equal(stack.API_URL, config.endpoints.apiUrl);

const environment = {
  ...process.env,
  ...catalogTestEnvironment({
    LOCAL_COMMERCE_RUN_ID: run,
    LOCAL_COMMERCE_PROJECT_ID: project,
    LOCAL_COMMERCE_MARKER_DIGEST: preparation.markerDigest,
    LOCAL_COMMERCE_SERVICE_ROLE_KEY: stack.SERVICE_ROLE_KEY,
    CUSTOMER_AUTH_SOURCE: "local_persistent",
    CART_SOURCE: "local_persistent",
    PHOTOGIFT_PRODUCT_SOURCE: "local_persistent",
    LOCAL_CHECKOUT_SOURCE: "local_persistent",
    CUSTOMER_UPLOAD_SOURCE: "local_persistent",
    LOCAL_ORDER_SOURCE: "local_persistent",
    LOCAL_PAYMENT_SOURCE: "local_persistent",
    LOCAL_FULFILLMENT_SOURCE: "local_persistent",
    LOCAL_TRACKING_SOURCE: "local_persistent",
    LOCAL_FULFILLMENT_OPERATOR: "enabled",
    LOCAL_TRACKING_OPERATOR: "enabled",
    ADMIN_ACCEPTANCE_SOURCE: "local_fake",
    LOCAL_COMMERCE_IMAGE_HELPER_SECRET: randomBytes(32).toString("base64url"),
    LOCAL_ORDER_CAPABILITY_SECRET: randomBytes(32).toString("hex"),
    LOCAL_ORDER_CAPABILITY_TTL_SECONDS: "3600",
    PHOTOGIFT_GUEST_DRAFT_OWNER_SECRET: randomBytes(48).toString("base64url"),
    PHOTOGIFT_GUEST_DRAFT_OWNER_CONTEXT_TTL_SECONDS: "3600",
  }),
  CLOUDFLARE_INCLUDE_PROCESS_ENV: "true",
  WRANGLER_SEND_METRICS: "false",
  WRANGLER_WRITE_LOGS: "false",
  NODE_OPTIONS: "",
  LOCAL_COMMERCE_ACCEPTANCE_DISABLE_INSPECTOR: "true",
};
for (const [name, value] of Object.entries({ SHADOW_DB: config.ports.shadowDb, API: config.ports.api, DB: config.ports.db,
  STUDIO: config.ports.studio, SMTP: config.ports.smtp, IMAGE_HELPER: config.ports.imageHelper })) environment[`LOCAL_COMMERCE_${name}_PORT`] = String(value);
for (const [name, value] of Object.entries({ API: config.endpoints.apiUrl, RPC: config.endpoints.rpcUrl,
  STORAGE: config.endpoints.storageUrl, IMAGE_HELPER: config.endpoints.imageHelperUrl })) environment[`LOCAL_COMMERCE_${name}_URL`] = value;

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => { const { port } = server.address(); server.close(() => resolve(port)); });
  });
}
const ports = await Promise.all([freePort(), freePort()]);
const origins = ports.map((port) => `http://127.0.0.1:${port}`);
const children = [];
let logs = "";
function start(index) {
  const child = spawn(process.execPath, ["tests/database/local-commerce-test-worker.mjs", run, "--confirm-disposable", String(ports[index])],
    { env: environment, detached: true, stdio: ["ignore", "pipe", "pipe"] });
  children.push(child);
  for (const stream of [child.stdout, child.stderr]) stream.on("data", (bytes) => { logs = (logs + bytes).slice(-30_000); });
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
    try {
      const response = await fetch(`${origins[index]}/api/customer-auth/session`, { signal: AbortSignal.timeout(2000) });
      await response.arrayBuffer();
      if (response.status === 200) return;
    } catch { /* bounded readiness */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.fail(`Worker readiness failed: ${logs}`);
}
const cookie = (jar) => [...jar].map(([key, value]) => `${key}=${value}`).join("; ");
function accept(jar, response) {
  for (const header of response.headers.getSetCookie()) {
    const pair = header.split(";")[0]; const at = pair.indexOf("="); jar.set(pair.slice(0, at), pair.slice(at + 1));
  }
}
const post = (index, pathname, body, jar = new Map()) => fetch(`${origins[index]}${pathname}`, {
  method: "POST", headers: { origin: origins[index], cookie: cookie(jar), "content-type": "application/json" },
  body: JSON.stringify(body), signal: AbortSignal.timeout(20_000),
});
const fulfillment = (index, reference, body, jar) => post(index, `/api/local-fulfillment/operator/${reference}`, body, jar);
const tracking = (index, reference, body) => post(index, `/api/local-tracking/operator/${reference}`, body);
const action = (actionKind, expectedShipmentVersion, trackingActionId = randomUUID()) => ({ trackingActionId, actionKind, expectedShipmentVersion });

let encoded = JSON.stringify(catalogDatabaseRows(project));
for (const id of Object.values(ids)) encoded = encoded.replaceAll(id, randomUUID());
const rows = JSON.parse(encoded);
const suffix = randomUUID().replaceAll("-", "");
rows.categories[0].slug = `task-11-4-shipment-${suffix}`;
rows.products[0].slug = `task-11-4-shipment-${suffix}`;
rows.products[0].fulfillment_definition.requiresProductionPreview = false;
rows.variants[0].sku_code = `TASK-11-4-SHIP-${suffix}`;
rows.rules = rows.rules.filter((row) => row.definition.kind === "shipping");
rows.rules[0].rule_key = `task-11-4-shipping-${suffix}`;
rows.rules[0].definition.method = `task_11_4_shipping_${suffix}`;
const serviceHeaders = { apikey: stack.SERVICE_ROLE_KEY, authorization: `Bearer ${stack.SERVICE_ROLE_KEY}`,
  "content-type": "application/json", "content-profile": "local_commerce" };
for (const [key, table] of Object.entries({ categories: "catalog_categories", products: "catalog_products", variants: "catalog_variants",
  configurations: "catalog_configuration_snapshots", rules: "catalog_pricing_rules" })) {
  const response = await fetch(`${config.endpoints.apiUrl}/rest/v1/${table}`, { method: "POST", headers: serviceHeaders,
    body: JSON.stringify(rows[key]), signal: AbortSignal.timeout(5000) });
  assert.equal(response.status, 201, `${table}: ${await response.text()}`);
}
const handoff = { productId: rows.products[0].id, variantId: rows.variants[0].id, skuCode: rows.variants[0].sku_code,
  selectedOptions: rows.variants[0].selected_options, configurationRevision: "1", customizationValues: [] };

async function createQualityOrder() {
  const jar = new Map();
  let response = await post(0, "/api/cart", { handoff }, jar);
  assert.equal(response.status, 200, `Cart: ${await response.clone().text()} / ${logs.slice(-2000)}`);
  accept(jar, response); await response.arrayBuffer();
  const input = { creationAttemptId: randomUUID(), email: "task-11-4-shipment@example.invalid", firstName: "Synthetic", lastName: "Shipment",
    country: "US", city: "Test", addressLine1: "Synthetic only", postalCode: "00000", shippingMethod: rows.rules[0].definition.method };
  response = await post(0, "/api/local-orders", input, jar);
  if (response.status === 204) { accept(jar, response); response = await post(0, "/api/local-orders", input, jar); }
  assert.equal(response.status, 200, await response.clone().text());
  const { publicReference } = await response.json();
  response = await post(0, "/api/local-payments", { publicReference, paymentAttemptId: randomUUID(), outcome: "success" }, jar);
  assert.equal(response.status, 200, await response.clone().text()); await response.arrayBuffer();
  response = await fulfillment(0, publicReference, { fulfillmentActionId: randomUUID(), actionKind: "enter_photo_review" }, jar);
  assert.equal(response.status, 200, await response.clone().text()); await response.arrayBuffer();
  const version = () => Number(sql(`select f.version from local_commerce.fulfillments f join local_commerce.orders o on o.id=f.order_id and o.project_id=f.project_id where o.public_reference='${publicReference}';`));
  response = await fulfillment(0, publicReference, { fulfillmentActionId: randomUUID(), actionKind: "start_production", expectedAggregateVersion: version() }, jar);
  assert.equal(response.status, 200, await response.clone().text()); await response.arrayBuffer();
  response = await fulfillment(0, publicReference, { fulfillmentActionId: randomUUID(), actionKind: "mark_quality_check", expectedAggregateVersion: version() }, jar);
  assert.equal(response.status, 200, await response.clone().text()); await response.arrayBuffer();
  return { publicReference, jar };
}
const state = (reference) => JSON.parse(sql(`select json_build_object('id',s.id,'publicReference',s.public_reference,
  'trackingNumber',s.tracking_reference,'status',s.tracking_lifecycle,'version',s.version,'shippedAt',s.shipped_at,
  'inTransitAt',s.in_transit_at,'deliveredAt',s.delivered_at,
  'events',(select json_agg(e.event_type order by e.version) from local_commerce.shipment_events e where e.project_id=s.project_id and e.shipment_id=s.id),
  'actions',(select count(*) from local_commerce.shipment_actions a where a.project_id=s.project_id and a.shipment_id=s.id))
  from local_commerce.shipments s join local_commerce.orders o on o.project_id=s.project_id and o.id=s.order_id where o.public_reference='${reference}';`));
const immutable = (reference) => sql(`select md5(coalesce(string_agg(v::text,',' order by v::text),'')) from (
  select to_jsonb(s) v from local_commerce.order_purchase_snapshots s join local_commerce.orders o on o.id=s.order_id where o.public_reference='${reference}'
  union all select to_jsonb(s) from local_commerce.order_item_purchase_snapshots s join local_commerce.order_items i on i.id=s.order_item_id join local_commerce.orders o on o.id=i.order_id where o.public_reference='${reference}'
  union all select to_jsonb(p) from local_commerce.payment_attempts p join local_commerce.orders o on o.id=p.order_id where o.public_reference='${reference}') facts;`);

let workerA; let workerB;
try {
  workerA = start(0); workerB = start(1); await Promise.all([ready(workerA, 0), ready(workerB, 1)]);
  const order = await createQualityOrder();
  const before = immutable(order.publicReference);
  const createA = action("create_shipment", 0); const createB = action("create_shipment", 0);
  let responses = await Promise.all([tracking(0, order.publicReference, createA), tracking(1, order.publicReference, createB)]);
  assert.equal(responses.filter((item) => item.status === 200).length, 1);
  assert.equal(responses.filter((item) => item.status === 409).length, 1);
  await Promise.all(responses.map((item) => item.arrayBuffer()));
  let current = state(order.publicReference);
  assert.equal(current.version, 1); assert.deepEqual(current.events, ["shipment_created"]); assert.equal(current.actions, 1);
  assert.match(current.publicReference, /^FM-LOCAL-SHP-[A-Z0-9]{12}$/); assert.match(current.trackingNumber, /^FM-LOCAL-TRK-[A-Z0-9]{12}$/);
  const winner = (await tracking(0, order.publicReference, createA)).status === 200 ? createA : createB;
  const replay = await tracking(1, order.publicReference, winner); assert.equal(replay.status, 200); await replay.arrayBuffer();
  assert.deepEqual(state(order.publicReference), current);

  responses = await Promise.all([tracking(0, order.publicReference, action("mark_shipped", 1)), tracking(1, order.publicReference, action("mark_shipped", 1))]);
  assert.deepEqual(responses.map((item) => item.status).sort(), [200, 409]); await Promise.all(responses.map((item) => item.arrayBuffer()));
  responses = await Promise.all([tracking(0, order.publicReference, action("mark_in_transit", 2)), tracking(1, order.publicReference, action("mark_delivered", 2))]);
  assert.deepEqual(responses.map((item) => item.status).sort(), [200, 409]); await Promise.all(responses.map((item) => item.arrayBuffer()));
  responses = await Promise.all([tracking(0, order.publicReference, action("mark_delivered", 3)), tracking(1, order.publicReference, action("mark_delivered", 3))]);
  assert.deepEqual(responses.map((item) => item.status).sort(), [200, 409]); await Promise.all(responses.map((item) => item.arrayBuffer()));
  current = state(order.publicReference);
  assert.equal(current.status, "delivered"); assert.equal(current.version, 4);
  assert.deepEqual(current.events, ["shipment_created", "shipped", "in_transit", "delivered"]); assert.equal(current.actions, 4);
  assert.equal(sql(`select count(distinct tracking_reference) from local_commerce.shipments where project_id='${project}' and order_id=(select id from local_commerce.orders where public_reference='${order.publicReference}');`), "1");
  assert.equal(immutable(order.publicReference), before);
  assert.equal(sql("select count(*) from information_schema.tables where table_schema='local_commerce' and table_name like '%supplier%';"), "0");
  console.info(JSON.stringify({ status: "PASS", task: "11.4-O-P", run, project, workerPids: [workerA.pid, workerB.pid],
    createRace: [200, 409], lifecycleRaces: [[200, 409], [200, 409], [200, 409]], final: current,
    oneShipment: true, oneTrackingNumber: true, immutableOrderDigest: before, supplierEffects: 0 }));
} finally {
  await stop(workerA); await stop(workerB);
}
