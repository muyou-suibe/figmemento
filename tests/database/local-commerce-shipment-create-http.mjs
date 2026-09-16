// Task 8.4 retained-run acceptance: actual Worker HTTP plus the restricted
// transaction gate. Synthetic fixtures only; no reset, delete, remote service,
// external carrier, Supplier persistence, or retained purchase rewrite.
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
  const r = spawnSync(bin, args, { input, encoding: "utf8", timeout: 30000, maxBuffer: 16 * 1024 * 1024 });
  assert.equal(r.status, 0, r.error?.code ?? r.stderr);
  return r.stdout.trim();
}
const inspected = JSON.parse(command("docker", ["inspect", db]))[0];
assert.equal(inspected.Id, db);
assert.equal(inspected.State.Status, "running");
assert.equal(inspected.Config.Labels["com.supabase.cli.workdir"], dir);
assert.equal(c.projectId, project);
assert.equal(c.projectKind, "disposable_test");
const sql = (q) => command("docker", ["exec", "-i", db, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], q);
assert.equal(sql("select current_setting('server_version_num')::int/10000;"), "17");
assert.equal(sql(`select local_commerce.verify_project_identity('${project}','${prep.markerDigest}');`), "t");
const manifest = JSON.parse(readFileSync("local/commerce/migrations/manifest.json", "utf8"));
assert.ok(manifest.schemaVersion >= 28);
const ledger = JSON.parse(sql("select json_agg(json_build_object('version',version,'checksum',checksum) order by version) from local_commerce.migration_ledger;"));
assert.equal(ledger.length, manifest.schemaVersion);
manifest.migrations.forEach((m, i) => {
  assert.equal(ledger[i].version, m.version);
  assert.equal(ledger[i].checksum, m.checksum);
  assert.equal(createHash("sha256").update(readFileSync(`local/commerce/migrations/${m.filename}`)).digest("hex"), m.checksum);
});

const info = JSON.parse(command("node_modules/.bin/supabase", ["status", "--workdir", dir, "-o", "json"]));
assert.equal(info.API_URL, c.endpoints.apiUrl);
const env = {
  ...process.env,
  ...catalogTestEnvironment({
    LOCAL_COMMERCE_RUN_ID: run,
    LOCAL_COMMERCE_PROJECT_ID: project,
    LOCAL_COMMERCE_MARKER_DIGEST: prep.markerDigest,
    LOCAL_COMMERCE_SERVICE_ROLE_KEY: info.SERVICE_ROLE_KEY,
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
    LOCAL_ORDER_CAPABILITY_SECRET: randomBytes(32).toString("hex"),
    LOCAL_ORDER_CAPABILITY_TTL_SECONDS: "3600",
    PHOTOGIFT_GUEST_DRAFT_OWNER_SECRET: randomBytes(48).toString("base64url"),
    PHOTOGIFT_GUEST_DRAFT_OWNER_CONTEXT_TTL_SECONDS: "3600",
  }),
  CLOUDFLARE_INCLUDE_PROCESS_ENV: "true",
  WRANGLER_SEND_METRICS: "false",
  WRANGLER_WRITE_LOGS: "false",
  // Do not inherit a developer inspector port into two acceptance Workers.
  NODE_OPTIONS: "",
  LOCAL_COMMERCE_ACCEPTANCE_DISABLE_INSPECTOR: "true",
};
for (const [k, v] of Object.entries({ SHADOW_DB: c.ports.shadowDb, API: c.ports.api, DB: c.ports.db, STUDIO: c.ports.studio, SMTP: c.ports.smtp, IMAGE_HELPER: c.ports.imageHelper })) env[`LOCAL_COMMERCE_${k}_PORT`] = String(v);
for (const [k, v] of Object.entries({ API: c.endpoints.apiUrl, RPC: c.endpoints.rpcUrl, STORAGE: c.endpoints.storageUrl, IMAGE_HELPER: c.endpoints.imageHelperUrl })) env[`LOCAL_COMMERCE_${k}_URL`] = v;

const ports = [c.ports.imageHelper + 20, c.ports.imageHelper + 21];
const origins = ports.map((port) => `http://127.0.0.1:${port}`);
for (const port of ports) await new Promise((resolve, reject) => {
  const server = createServer();
  server.once("error", reject);
  server.listen(port, "127.0.0.1", () => server.close(resolve));
});
const children = [];
let logs = "";
function start(index) {
  const child = spawn(process.execPath, ["tests/database/local-commerce-test-worker.mjs", run, "--confirm-disposable", String(ports[index])], {
    env,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);
  for (const stream of [child.stdout, child.stderr]) stream.on("data", (bytes) => { logs = (logs + bytes).slice(-20000); });
  return child;
}
async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const done = new Promise((resolve) => child.once("exit", resolve));
  process.kill(-child.pid, "SIGTERM");
  await Promise.race([done, new Promise((resolve) => setTimeout(resolve, 5000))]);
  if (child.exitCode === null && child.signalCode === null) {
    process.kill(-child.pid, "SIGKILL");
    await done;
  }
}
async function ready(child, index) {
  for (let i = 0; i < 50; i += 1) {
    assert.equal(child.exitCode, null, logs);
    try {
      const response = await fetch(`${origins[index]}/api/customer-auth/session`, { signal: AbortSignal.timeout(2000) });
      await response.arrayBuffer();
      if (response.status === 200) return;
    } catch { /* bounded readiness */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.fail(`Worker readiness blocked: ${logs}`);
}

const cookie = (jar) => [...jar].map(([key, value]) => `${key}=${value}`).join("; ");
function accept(jar, response) {
  for (const value of response.headers.getSetCookie()) {
    const pair = value.split(";")[0];
    const at = pair.indexOf("=");
    jar.set(pair.slice(0, at), pair.slice(at + 1));
  }
}
const send = (index, path, body, jar = new Map()) => fetch(`${origins[index]}${path}`, {
  method: "POST",
  headers: { origin: origins[index], cookie: cookie(jar), "Content-Type": "application/json" },
  body: JSON.stringify(body),
  signal: AbortSignal.timeout(20000),
});
const tracking = (reference, action, index = 0) => send(index, `/api/local-tracking/operator/${reference}`, action);
const fulfillment = (reference, action, index = 0, jar = new Map()) => send(index, `/api/local-fulfillment/operator/${reference}`, action, jar);
const createAction = (id = randomUUID()) => ({ trackingActionId: id, actionKind: "create_shipment", expectedShipmentVersion: 0 });
const count = (table, reference) => sql(`select count(*) from local_commerce.${table} t join local_commerce.orders o on o.project_id=t.project_id and o.id=t.order_id where o.public_reference='${reference}';`);
const upstream = (reference) => sql(`select md5(coalesce(string_agg(v::text,',' order by v::text),'')) from (
  select to_jsonb(s) v from local_commerce.order_purchase_snapshots s join local_commerce.orders o on o.id=s.order_id and o.project_id=s.project_id where o.public_reference='${reference}'
  union all select to_jsonb(s) from local_commerce.order_item_purchase_snapshots s join local_commerce.order_items i on i.id=s.order_item_id and i.project_id=s.project_id join local_commerce.orders o on o.id=i.order_id and o.project_id=i.project_id where o.public_reference='${reference}'
  union all select to_jsonb(p) from local_commerce.payment_attempts p join local_commerce.orders o on o.id=p.order_id and o.project_id=p.project_id where o.public_reference='${reference}'
  union all select to_jsonb(f) from local_commerce.fulfillments f join local_commerce.orders o on o.id=f.order_id and o.project_id=f.project_id where o.public_reference='${reference}'
) q;`);

const serviceHeaders = { apikey: info.SERVICE_ROLE_KEY, authorization: `Bearer ${info.SERVICE_ROLE_KEY}`, "Content-Type": "application/json", "Content-Profile": "local_commerce" };
function fixture(kind) {
  let encoded = JSON.stringify(catalogDatabaseRows(project));
  for (const id of Object.values(ids)) encoded = encoded.replaceAll(id, randomUUID());
  const rows = JSON.parse(encoded);
  const suffix = randomUUID().replaceAll("-", "");
  rows.categories[0].slug = `shipment-${kind}-${suffix}`;
  rows.products[0].slug = `shipment-${kind}-${suffix}`;
  rows.variants[0].sku_code = `SHIP-${kind.toUpperCase()}-${suffix}`;
  rows.products[0].fulfillment_definition.requiresProductionPreview = false;
  rows.rules = rows.rules.filter((row) => row.definition.kind === "shipping");
  rows.rules[0].rule_key = `shipment-${kind}-${suffix}`;
  rows.rules[0].definition.method = `shipment_${kind}_${suffix}`;
  if (kind === "digital") {
    rows.products[0].fulfillment_definition.fulfillmentType = "digital";
    rows.products[0].fulfillment_definition.requiresShipping = false;
    rows.products[0].fulfillment_definition.productionMode = "digital_creation";
  }
  return rows;
}
async function persistFixture(rows) {
  for (const [key, table] of Object.entries({ categories: "catalog_categories", products: "catalog_products", variants: "catalog_variants", configurations: "catalog_configuration_snapshots", rules: "catalog_pricing_rules" })) {
    const response = await fetch(`${c.endpoints.apiUrl}/rest/v1/${table}`, { method: "POST", headers: serviceHeaders, body: JSON.stringify(rows[key]), signal: AbortSignal.timeout(5000) });
    assert.equal(response.status, 201, `${table}: ${await response.text()}`);
  }
}
const handoff = (rows) => ({
  productId: rows.products[0].id,
  variantId: rows.variants[0].id,
  skuCode: rows.variants[0].sku_code,
  selectedOptions: rows.variants[0].selected_options,
  configurationRevision: "1",
  customizationValues: [],
});
async function newOrder(handoffs, rows) {
  const jar = new Map();
  for (const value of handoffs) {
    const response = await send(0, "/api/cart", { handoff: value }, jar);
    assert.equal(response.status, 200, await response.clone().text());
    accept(jar, response);
  }
  const input = {
    creationAttemptId: randomUUID(),
    email: "shipment-task@example.invalid",
    firstName: "Shipment",
    lastName: "Task",
    country: "US",
    city: "Test",
    addressLine1: "Synthetic only",
    postalCode: "00000",
    ...(handoffs.some((value) => value.productId === rows.products[0].id && rows.products[0].fulfillment_definition.requiresShipping)
      ? { shippingMethod: rows.rules[0].definition.method }
      : {}),
  };
  let response = await send(0, "/api/local-orders", input, jar);
  if (response.status === 204) {
    accept(jar, response);
    response = await send(0, "/api/local-orders", input, jar);
  }
  assert.equal(response.status, 200, await response.clone().text());
  const body = await response.json();
  assert.match(body.publicReference, /^FM-LOCAL-[A-Z0-9]{16}$/);
  return { jar, reference: body.publicReference };
}
async function advanceToQuality(order) {
  let response = await send(0, "/api/local-payments", { publicReference: order.reference, paymentAttemptId: randomUUID(), outcome: "success" }, order.jar);
  assert.equal(response.status, 200, await response.clone().text());
  response = await fulfillment(order.reference, { fulfillmentActionId: randomUUID(), actionKind: "enter_photo_review" }, 0, order.jar);
  assert.equal(response.status, 200, await response.clone().text());
  let version = Number(sql(`select f.version from local_commerce.fulfillments f join local_commerce.orders o on o.id=f.order_id and o.project_id=f.project_id where o.public_reference='${order.reference}';`));
  response = await fulfillment(order.reference, { fulfillmentActionId: randomUUID(), actionKind: "start_production", expectedAggregateVersion: version }, 0, order.jar);
  assert.equal(response.status, 200, await response.clone().text());
  version = Number(sql(`select f.version from local_commerce.fulfillments f join local_commerce.orders o on o.id=f.order_id and o.project_id=f.project_id where o.public_reference='${order.reference}';`));
  response = await fulfillment(order.reference, { fulfillmentActionId: randomUUID(), actionKind: "mark_quality_check", expectedAggregateVersion: version }, 0, order.jar);
  assert.equal(response.status, 200, await response.clone().text());
}

const report = { status: "BLOCKED", task: "8.4", run, project, ledger: manifest.schemaVersion, results: [], races: [], restarts: [] };
let first;
let second;
try {
  first = start(0);
  second = start(1);
  await ready(first, 0);
  await ready(second, 1);

  for (const [label, reference] of [
    ["before quality_check", "FM-LOCAL-9DCB67377ECC41FF"],
    ["unpaid", "FM-LOCAL-5442399F15E14D0D"],
    ["photo review rejected", "FM-LOCAL-7B1A9500617A46B5"],
    ["required preview unapproved", "FM-LOCAL-72F06EB95FEB4DC4"],
  ]) {
    const response = await tracking(reference, createAction());
    assert.ok([404, 409].includes(response.status), `${label}: ${response.status}`);
    await response.arrayBuffer();
    assert.equal(count("shipments", reference), "0");
    report.results.push(label);
  }

  const customerApproved = "FM-LOCAL-E8CEAEF244F54A46";
  const customerBefore = upstream(customerApproved);
  const create = createAction("shipment-customer-approved-0001");
  let response = await tracking(customerApproved, create);
  assert.equal(response.status, 200, await response.clone().text());
  const original = await response.json();
  assert.ok(["committed", "replayed"].includes(original.status));
  assert.equal(original.shipment.status, "shipment_created");
  assert.match(original.shipment.publicShipmentReference, /^FM-LOCAL-SHP-[A-Z0-9]{12}$/);
  assert.match(original.shipment.trackingNumber, /^FM-LOCAL-TRK-[A-Z0-9]{12}$/);
  assert.equal(original.shipment.carrierLabel, "Local Demo Carrier");
  assert.doesNotMatch(JSON.stringify(original), /ownerId|internal|action_key|digest|supplier|address|service_role/i);
  const firstPid = first.pid;
  await stop(first);
  first = start(0);
  await ready(first, 0);
  response = await tracking(customerApproved, create);
  assert.equal(response.status, 200, await response.clone().text());
  const replay = await response.json();
  assert.equal(replay.status, "replayed");
  assert.deepEqual(replay.shipment, original.shipment);
  assert.equal(count("shipments", customerApproved), "1");
  assert.ok(Number(count("shipment_events", customerApproved)) >= 1, "later accepted lifecycle events must not invalidate create replay");
  assert.equal(upstream(customerApproved), customerBefore);
  report.restarts.push({ kind: "Shipment create replay", firstPid, secondPid: first.pid });

  const sameKeyReference = "FM-LOCAL-EE5391B165DF49EE";
  const sameKey = createAction("shipment-concurrent-same-key-0001");
  const sameResponses = await Promise.all([tracking(sameKeyReference, sameKey, 0), tracking(sameKeyReference, sameKey, 1)]);
  assert.deepEqual(sameResponses.map((item) => item.status), [200, 200]);
  const sameBodies = await Promise.all(sameResponses.map((item) => item.json()));
  assert.deepEqual(new Set(sameBodies.map((item) => item.shipment.publicShipmentReference)).size, 1);
  assert.equal(count("shipments", sameKeyReference), "1");
  response = await tracking(sameKeyReference, createAction("shipment-concurrent-other-key-0001"), 1);
  assert.equal(response.status, 409, await response.clone().text());
  report.races.push({ kind: "same and different selector", pids: [first.pid, second.pid], statuses: sameBodies.map((item) => item.status) });

  const mixedReference = "FM-LOCAL-032FD3B8562D4393";
  response = await tracking(mixedReference, createAction("shipment-mixed-physical-branch-0001"));
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal(count("shipments", mixedReference), "1");
  assert.equal(JSON.parse(sql(`select jsonb_array_length(local_commerce.fulfillment_purchased_items(o.project_id,o.id,o.owner_id)) from local_commerce.orders o where o.public_reference='${mixedReference}';`)), 2);
  report.results.push("mixed physical branch only");

  const timeoutReference = "FM-LOCAL-74EB702B6F894F04";
  response = await fulfillment(timeoutReference, { fulfillmentActionId: "shipment-timeout-quality-0001", actionKind: "mark_quality_check", expectedAggregateVersion: 4 });
  assert.equal(response.status, 200, await response.clone().text());
  response = await tracking(timeoutReference, createAction("shipment-admin-timeout-gate-0001"));
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal(count("shipments", timeoutReference), "1");
  report.results.push("Admin timeout exact manifest gate");

  const physicalRows = fixture("physical");
  const digitalRows = fixture("digital");
  await persistFixture(physicalRows);
  await persistFixture(digitalRows);
  const digitalOrder = await newOrder([handoff(digitalRows)], digitalRows);
  await advanceToQuality(digitalOrder);
  response = await tracking(digitalOrder.reference, createAction());
  assert.equal(response.status, 409, await response.clone().text());
  assert.equal(count("shipments", digitalOrder.reference), "0");
  report.results.push("digital-only no physical Shipment");

  const mixedOrder = await newOrder([handoff(physicalRows), handoff(digitalRows)], physicalRows);
  await advanceToQuality(mixedOrder);
  const mixedBefore = upstream(mixedOrder.reference);
  response = await tracking(mixedOrder.reference, createAction(randomUUID()));
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal(count("shipments", mixedOrder.reference), "1");
  assert.equal(count("shipment_events", mixedOrder.reference), "1");
  assert.equal(upstream(mixedOrder.reference), mixedBefore);
  report.results.push("fresh mixed Order physical branch");

  // Transaction-level fault injection on a still-eligible retained synthetic
  // Order. The trigger and all attempted effects are rollback-only.
  const faultReference = "FM-LOCAL-CC8E74A1435E47D7";
  for (const [label, table] of [["Shipment insert", "shipments"], ["event", "shipment_events"], ["action/audit", "shipment_actions"]]) {
    const actionKey = createHash("sha256").update(`shipment-fault-${label}`).digest("hex");
    const faultResult = sql(`begin;
      create function pg_temp.shipment_fault() returns trigger language plpgsql as \$\$begin raise exception 'synthetic ${label} fault'; end;\$\$;
      create trigger shipment_fault after insert on local_commerce.${table} for each row execute function pg_temp.shipment_fault();
      do \$test\$ declare prepared jsonb; committed jsonb; begin
        prepared:=local_commerce.shipment_command('${project}','${prep.markerDigest}','operator','local-tracking-development-operator','${faultReference}','prepare','create_shipment',0,'${actionKey}',null);
        if prepared->>'status'<>'found' then raise exception 'fault prepare rejected'; end if;
        committed:=local_commerce.shipment_command('${project}','${prep.markerDigest}','operator','local-tracking-development-operator','${faultReference}','commit','create_shipment',0,'${actionKey}',prepared#>>'{value,contextDigest}');
        if committed->>'status'<>'unavailable' then raise exception 'fault did not fail closed'; end if;
        if exists(select 1 from local_commerce.shipments s join local_commerce.orders o on o.id=s.order_id and o.project_id=s.project_id where o.public_reference='${faultReference}') then raise exception 'partial Shipment'; end if;
      end \$test\$;
      rollback; select 'PASS';`);
    assert.equal(faultResult, "PASS");
    report.results.push(`atomic ${label} fault rollback`);
  }

  assert.equal(sql("select count(*) from information_schema.tables where table_schema='local_commerce' and table_name like '%supplier%';"), "0");
  report.status = "PASS";
  report.classification = "LOCAL DEVELOPMENT / TEST PERSISTENCE ACCEPTANCE";
  report.shipments = JSON.parse(sql("select json_build_object('shipments',count(*),'events',(select count(*) from local_commerce.shipment_events),'actions',(select count(*) from local_commerce.shipment_actions)) from local_commerce.shipments;"));
  console.info(JSON.stringify(report));
} finally {
  if (first) await stop(first);
  if (second) await stop(second);
}
