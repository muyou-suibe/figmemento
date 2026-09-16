// Task 8.6 retained-run acceptance: real guest/member HTTP authorization,
// side-effect-free customer reads and independently authorized operator move.
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:net";
import { spawn, spawnSync } from "node:child_process";
import { catalogDatabaseRows, catalogTestEnvironment, ids } from "../fixtures/local-persistent-catalog.mjs";
import { createPersistentOrderCapabilityCodec } from "../../app/server/local-order-capability.server.ts";

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
assert.equal(manifest.schemaVersion, 30);
const ledger = JSON.parse(sql("select json_agg(json_build_object('version',version,'checksum',checksum) order by version) from local_commerce.migration_ledger;"));
assert.equal(ledger.length, 30);
manifest.migrations.forEach((migration, index) => {
  assert.equal(ledger[index].checksum, migration.checksum);
  assert.equal(createHash("sha256").update(readFileSync(`local/commerce/migrations/${migration.filename}`)).digest("hex"), migration.checksum);
});

const info = JSON.parse(command("node_modules/.bin/supabase", ["status", "--workdir", dir, "-o", "json"]));
const orderSecret = randomBytes(32).toString("hex");
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
    LOCAL_ORDER_CAPABILITY_SECRET: orderSecret,
    LOCAL_ORDER_CAPABILITY_TTL_SECONDS: "2592000",
    PHOTOGIFT_GUEST_DRAFT_OWNER_SECRET: randomBytes(48).toString("base64url"),
  }),
  CLOUDFLARE_INCLUDE_PROCESS_ENV: "true",
  WRANGLER_SEND_METRICS: "false",
  WRANGLER_WRITE_LOGS: "false",
  NODE_OPTIONS: "",
  LOCAL_COMMERCE_ACCEPTANCE_DISABLE_INSPECTOR: "true",
};
for (const [key, value] of Object.entries({ SHADOW_DB: c.ports.shadowDb, API: c.ports.api, DB: c.ports.db, STUDIO: c.ports.studio, SMTP: c.ports.smtp, IMAGE_HELPER: c.ports.imageHelper })) env[`LOCAL_COMMERCE_${key}_PORT`] = String(value);
for (const [key, value] of Object.entries({ API: c.endpoints.apiUrl, RPC: c.endpoints.rpcUrl, STORAGE: c.endpoints.storageUrl, IMAGE_HELPER: c.endpoints.imageHelperUrl })) env[`LOCAL_COMMERCE_${key}_URL`] = value;

const ports = [c.ports.imageHelper + 40, c.ports.imageHelper + 41];
const origins = ports.map((port) => `http://127.0.0.1:${port}`);
for (const port of ports) await new Promise((resolve, reject) => {
  const server = createServer();
  server.once("error", reject);
  server.listen(port, "127.0.0.1", () => server.close(resolve));
});
let logs = "";
function start(index) {
  const child = spawn(process.execPath, ["tests/database/local-commerce-test-worker.mjs", run, "--confirm-disposable", String(ports[index])], { env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
  for (const stream of [child.stdout, child.stderr]) stream.on("data", (bytes) => { logs = (logs + bytes).slice(-20000); });
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
  for (let attempt = 0; attempt < 50; attempt += 1) {
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
async function post(index, path, body, jar = new Map(), origin = origins[index]) {
  const response = await fetch(`${origins[index]}${path}`, {
    method: "POST",
    headers: { ...(origin ? { origin } : {}), cookie: cookie(jar), "Content-Type": "application/json" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(20000),
  });
  accept(jar, response);
  return response;
}
const operator = (reference, body, index = 0, origin = origins[index]) => post(index, `/api/local-tracking/operator/${reference}`, body, new Map(), origin);
async function customerGet(reference, jar, index = 0, headers = {}) {
  return fetch(`${origins[index]}/api/local-tracking/${reference}`, {
    headers: { cookie: cookie(jar), ...headers }, signal: AbortSignal.timeout(20000),
  });
}

let encoded = JSON.stringify(catalogDatabaseRows(project));
for (const id of Object.values(ids)) encoded = encoded.replaceAll(id, randomUUID());
const rows = JSON.parse(encoded);
const suffix = randomUUID().replaceAll("-", "");
rows.categories[0].slug = `tracking-read-${suffix}`;
rows.products[0].slug = `tracking-read-${suffix}`;
rows.variants[0].sku_code = `TRACKREAD-${suffix}`;
rows.products[0].fulfillment_definition.requiresProductionPreview = false;
rows.rules = rows.rules.filter((row) => row.definition.kind === "shipping");
rows.rules[0].rule_key = `tracking-read-${suffix}`;
rows.rules[0].definition.method = `tracking_read_${suffix}`;
const serviceHeaders = { apikey: info.SERVICE_ROLE_KEY, authorization: `Bearer ${info.SERVICE_ROLE_KEY}`, "Content-Type": "application/json", "Content-Profile": "local_commerce" };
for (const [key, table] of Object.entries({ categories: "catalog_categories", products: "catalog_products", variants: "catalog_variants", configurations: "catalog_configuration_snapshots", rules: "catalog_pricing_rules" })) {
  const response = await fetch(`${c.endpoints.apiUrl}/rest/v1/${table}`, { method: "POST", headers: serviceHeaders, body: JSON.stringify(rows[key]), signal: AbortSignal.timeout(5000) });
  assert.equal(response.status, 201, `${table}: ${await response.text()}`);
}
const handoff = { productId: rows.products[0].id, variantId: rows.variants[0].id, skuCode: rows.variants[0].sku_code, selectedOptions: rows.variants[0].selected_options, configurationRevision: "1", customizationValues: [] };
async function newOrder(jar, email) {
  let response = await post(0, "/api/cart", { handoff }, jar);
  assert.equal(response.status, 200, await response.clone().text());
  const input = { creationAttemptId: randomUUID(), email, firstName: "Tracking", lastName: "Read", country: "US", city: "Test", addressLine1: "Synthetic only", postalCode: "00000", shippingMethod: rows.rules[0].definition.method };
  response = await post(0, "/api/local-orders", input, jar);
  if (response.status === 204) response = await post(0, "/api/local-orders", input, jar);
  assert.equal(response.status, 200, await response.clone().text());
  const body = await response.json();
  assert.match(body.publicReference, /^FM-LOCAL-[A-Z0-9]{16}$/);
  response = await post(0, "/api/local-payments", { publicReference: body.publicReference, paymentAttemptId: randomUUID(), outcome: "success" }, jar);
  assert.equal(response.status, 200, await response.clone().text());
  response = await post(0, `/api/local-fulfillment/operator/${body.publicReference}`, { fulfillmentActionId: randomUUID(), actionKind: "enter_photo_review" }, jar);
  assert.equal(response.status, 200, await response.clone().text());
  let version = Number(sql(`select f.version from local_commerce.fulfillments f join local_commerce.orders o on o.id=f.order_id and o.project_id=f.project_id where o.public_reference='${body.publicReference}';`));
  response = await post(0, `/api/local-fulfillment/operator/${body.publicReference}`, { fulfillmentActionId: randomUUID(), actionKind: "start_production", expectedAggregateVersion: version }, jar);
  assert.equal(response.status, 200, await response.clone().text());
  version = Number(sql(`select f.version from local_commerce.fulfillments f join local_commerce.orders o on o.id=f.order_id and o.project_id=f.project_id where o.public_reference='${body.publicReference}';`));
  response = await post(0, `/api/local-fulfillment/operator/${body.publicReference}`, { fulfillmentActionId: randomUUID(), actionKind: "mark_quality_check", expectedAggregateVersion: version }, jar);
  assert.equal(response.status, 200, await response.clone().text());
  response = await operator(body.publicReference, { trackingActionId: randomUUID(), actionKind: "create_shipment", expectedShipmentVersion: 0 });
  assert.equal(response.status, 200, await response.clone().text());
  return body.publicReference;
}
const digest = (reference) => sql(`select md5(string_agg(v::text,',' order by v::text)) from (
  select to_jsonb(s) v from local_commerce.shipments s join local_commerce.orders o on o.id=s.order_id and o.project_id=s.project_id where o.public_reference='${reference}'
  union all select to_jsonb(e) from local_commerce.shipment_events e join local_commerce.orders o on o.id=e.order_id and o.project_id=e.project_id where o.public_reference='${reference}'
  union all select to_jsonb(a) from local_commerce.shipment_actions a join local_commerce.orders o on o.id=a.order_id and o.project_id=a.project_id where o.public_reference='${reference}'
) q;`);

const report = { status: "BLOCKED", task: "8.6", run, project, ledger: 30, guest: [], member: [], security: [], operator: [] };
let first;
let second;
try {
  first = start(0);
  second = start(1);
  await ready(first, 0);
  await ready(second, 1);

  const guestJar = new Map();
  const guestReference = await newOrder(guestJar, `guest-tracking-${suffix}@example.invalid`);
  const before = digest(guestReference);
  let response = await customerGet(guestReference, guestJar, 0, { origin: origins[0], "sec-fetch-site": "same-origin" });
  assert.equal(response.status, 200, await response.clone().text());
  const created = await response.json();
  assert.equal(created.status, "shipment_created");
  assert.doesNotMatch(JSON.stringify(created), /internal|owner|actor|action|digest|session|capability|storage|service_role/i);
  response = await customerGet(guestReference, guestJar, 1);
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal(digest(guestReference), before);
  report.guest.push("same-origin", "missing Origin/Fetch Metadata", "cross-process read", "zero read-side effects");

  assert.ok([403, 404].includes((await customerGet(guestReference, guestJar, 0, { origin: "https://evil.example" })).status));
  assert.ok([403, 404].includes((await customerGet(guestReference, guestJar, 0, { "sec-fetch-site": "cross-site" })).status));
  const forged = new Map(guestJar);
  forged.set("figmemento-local-order-access", "v1_1_2_" + "a".repeat(64) + "_" + "b".repeat(64));
  assert.equal((await customerGet(guestReference, forged)).status, 404);
  const codec = await createPersistentOrderCapabilityCodec(env, { projectId: project, markerDigest: prep.markerDigest });
  assert.ok(codec);
  const expired = new Map(guestJar);
  expired.set("figmemento-local-order-access", await codec.issue(Math.floor(Date.now() / 1000) - 2_592_010));
  assert.equal((await customerGet(guestReference, expired)).status, 404);
  assert.equal((await customerGet(created.trackingNumber, guestJar, 0, { origin: origins[0] })).status, 404);
  assert.equal((await customerGet(`guest-tracking-${suffix}@example.invalid`, guestJar, 0, { origin: origins[0] })).status, 404);
  response = await fetch(`${origins[0]}/api/local-tracking/${guestReference}`, { method: "POST", headers: { origin: origins[0], cookie: cookie(guestJar), "content-type": "application/json" }, body: JSON.stringify({ trackingActionId: randomUUID(), actionKind: "mark_shipped", expectedShipmentVersion: 1 }) });
  assert.equal(response.status, 405);
  assert.equal((await operator(guestReference, { trackingActionId: randomUUID(), actionKind: "mark_shipped", expectedShipmentVersion: 1 }, 0, null)).status, 403);
  assert.equal((await operator(guestReference, { trackingActionId: randomUUID(), actionKind: "mark_shipped", expectedShipmentVersion: 1 }, 0, "https://evil.example")).status, 403);
  response = await operator(guestReference, { trackingActionId: randomUUID(), actionKind: "mark_shipped", expectedShipmentVersion: 1 });
  assert.equal(response.status, 200, await response.clone().text());
  response = await customerGet(guestReference, guestJar, 1);
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal((await response.json()).status, "shipped");
  report.security.push("evil/cross-site GET", "forged capability", "expired capability", "tracking/email selector", "customer POST", "operator missing/wrong Origin");
  report.operator.push("legal shipped transition independently authorized");

  const memberJar = new Map();
  response = await post(0, "/api/customer-auth/sign-up", { email: `member-tracking-${suffix}@example.invalid`, password: "Synthetic-acceptance-password-42!" }, memberJar);
  assert.equal(response.status, 200, await response.clone().text());
  const memberReference = await newOrder(memberJar, `member-tracking-${suffix}@example.invalid`);
  response = await customerGet(memberReference, memberJar, 1);
  assert.equal(response.status, 200, await response.clone().text());
  const otherJar = new Map();
  response = await post(0, "/api/customer-auth/sign-up", { email: `other-tracking-${suffix}@example.invalid`, password: "Synthetic-acceptance-password-42!" }, otherJar);
  assert.equal(response.status, 200, await response.clone().text());
  const wrongCustomer = new Map(otherJar);
  wrongCustomer.set("figmemento-local-order-access", memberJar.get("figmemento-local-order-access"));
  assert.equal((await customerGet(memberReference, wrongCustomer)).status, 404);
  const retainedMemberJar = new Map(memberJar);
  response = await post(0, "/api/customer-auth/sign-out", {}, memberJar);
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal((await customerGet(memberReference, retainedMemberJar)).status, 404);
  report.member.push("fresh matching session", "wrong customer rejected", "revoked session rejected");

  assert.equal(digest(guestReference) !== "", true);
  report.status = "PASS";
  report.pids = [first.pid, second.pid];
  report.classification = "LOCAL DEVELOPMENT / TEST PERSISTENCE ACCEPTANCE";
  console.info(JSON.stringify(report));
} finally {
  await Promise.all([stop(first), stop(second)]);
}
