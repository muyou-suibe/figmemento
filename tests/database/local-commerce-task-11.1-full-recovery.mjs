import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

import { planMigrationLedger, sha256Text } from "../../app/application/local-commerce-migration-ledger.ts";
import { validateProjectMarker } from "../../app/application/local-commerce-environment.ts";
import { catalogTestEnvironment, ids } from "../fixtures/local-persistent-catalog.mjs";
import { createDevelopmentCatalogFixtures } from "../../app/infrastructure/catalog/development-catalog-fixtures.ts";

const run = process.argv[2];
const retained = run === "retained-development" && process.argv[3] === "--confirm-retained";
if (!retained) { assert.equal(run, "run-5576dfd8"); assert.equal(process.argv[3], "--confirm-disposable"); }
const root = path.resolve(".");
const projectId = retained ? "figmemento-local-commerce" : `figmemento-local-commerce-test-${run}`;
const workdir = retained ? path.join(root, "local/commerce") : path.join(root, "local/commerce/runtime/disposable", run);
const markerPath = retained ? path.join(workdir, "runtime/project-marker.json") : path.join(workdir, "project-marker.json");
const marker = JSON.parse(readFileSync(markerPath, "utf8"));
const config = retained ? {
  projectId, environment: "development", projectKind: "retained_development", runId: run, postgresMajorVersion: 17,
  ports: { shadowDb: 55420, api: 55421, db: 55422, studio: 55423, smtp: 55424, imageHelper: 55425 },
  endpoints: { apiUrl: "http://127.0.0.1:55421", rpcUrl: "http://127.0.0.1:55421", storageUrl: "http://127.0.0.1:55421/storage/v1", imageHelperUrl: "http://127.0.0.1:55425" },
} : JSON.parse(readFileSync(path.join(workdir, "ledger-preparation.json"), "utf8")).config;
const preparation = { config, markerDigest: sha256Text(JSON.stringify(marker)) };
assert.equal(config.projectId, projectId);
assert.equal(config.postgresMajorVersion, 17);
assert.equal(validateProjectMarker(marker, config), true);
assert.equal(sha256Text(JSON.stringify(marker)), preparation.markerDigest);

function command(bin, args, input, timeout = 30_000) {
  const result = spawnSync(bin, args, { input, encoding: "utf8", timeout, maxBuffer: 16 * 1024 * 1024 });
  assert.equal(result.error, undefined, `bounded command failed: ${bin}`);
  assert.equal(result.status, 0, (result.stderr ?? "").replace(/eyJ[A-Za-z0-9_.-]+/g, "[redacted]").split("\n")[0]);
  return result.stdout.trim();
}
const containers = command("docker", ["ps", "--filter", `label=com.supabase.cli.workdir=${workdir}`, "--format", "{{.ID}}"]).split("\n").filter(Boolean);
const inspected = JSON.parse(command("docker", ["inspect", ...containers]));
const databases = inspected.filter((value) => value.Config.Labels["com.supabase.cli.workdir"] === workdir
  && value.Name.startsWith("/supabase_db_") && value.State.Running === true);
assert.equal(databases.length, 1);
let database = databases[0].Id;
const sql = (query) => command("docker", ["exec", "-i", database, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], query);
assert.equal(sql("select current_setting('server_version_num')::int/10000;"), "17");
assert.equal(sql(`select local_commerce.verify_project_identity('${projectId}','${preparation.markerDigest}');`), "t");
const manifest = JSON.parse(readFileSync("local/commerce/migrations/manifest.json", "utf8"));
assert.equal(manifest.schemaVersion, 37);
const applied = JSON.parse(sql("select json_agg(json_build_object('version',version,'migrationId',migration_id,'checksum',checksum,'projectId',project_id) order by version) from local_commerce.migration_ledger;"));
assert.equal(applied.length, 37);
for (const migration of manifest.migrations) assert.equal(sha256Text(readFileSync(path.join("local/commerce/migrations", migration.filename), "utf8")), migration.checksum);
const plan = planMigrationLedger({ ...manifest, projectId }, applied, projectId);
assert.equal(plan.status, "ready");
assert.equal(plan.apply.length, 0);

const stack = JSON.parse(command(path.resolve("node_modules/.bin/supabase"), ["status", "--workdir", workdir, "-o", "json"]));
async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      assert.ok(address && typeof address === "object");
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}
const [helperPort, appPortA, appPortB, appPortC, guestCdpPort, memberCdpPort] = await Promise.all(Array.from({ length: 6 }, () => freePort()));
assert.equal(new Set([helperPort, appPortA, appPortB, appPortC, guestCdpPort, memberCdpPort]).size, 6);
const adminPassword = randomBytes(32).toString("base64url");
const env = {
  ...process.env,
  ...catalogTestEnvironment({
    LOCAL_COMMERCE_RUN_ID: run,
    LOCAL_COMMERCE_PROJECT_ID: projectId,
    LOCAL_COMMERCE_ENVIRONMENT: retained ? "development" : "test",
    LOCAL_COMMERCE_PROJECT_KIND: retained ? "retained_development" : "disposable_test",
    LOCAL_COMMERCE_MARKER_DIGEST: preparation.markerDigest,
    LOCAL_COMMERCE_SERVICE_ROLE_KEY: stack.SERVICE_ROLE_KEY,
    CUSTOMER_AUTH_SOURCE: "local_persistent",
    CART_SOURCE: "local_persistent",
    PHOTOGIFT_PRODUCT_SOURCE: "local_persistent",
    CUSTOMER_UPLOAD_SOURCE: "local_persistent",
    LOCAL_CHECKOUT_SOURCE: "local_persistent",
    LOCAL_ORDER_SOURCE: "local_persistent",
    LOCAL_PAYMENT_SOURCE: "local_persistent",
    LOCAL_FULFILLMENT_SOURCE: "local_persistent",
    LOCAL_TRACKING_SOURCE: "local_persistent",
    LOCAL_FULFILLMENT_OPERATOR: "enabled",
    LOCAL_TRACKING_OPERATOR: "enabled",
    ADMIN_ACCEPTANCE_SOURCE: "local_persistent",
    ADMIN_PASSWORD: adminPassword,
    LOCAL_COMMERCE_IMAGE_HELPER_PORT: String(helperPort),
    LOCAL_COMMERCE_IMAGE_HELPER_URL: `http://127.0.0.1:${helperPort}`,
    LOCAL_COMMERCE_IMAGE_HELPER_SECRET: randomBytes(32).toString("base64url"),
    LOCAL_ORDER_CAPABILITY_SECRET: randomBytes(32).toString("hex"),
    LOCAL_ORDER_CAPABILITY_TTL_SECONDS: "2592000",
    PHOTOGIFT_GUEST_DRAFT_OWNER_SECRET: randomBytes(48).toString("base64url"),
    PHOTOGIFT_GUEST_DRAFT_OWNER_CONTEXT_TTL_SECONDS: "3600",
  }),
  CLOUDFLARE_INCLUDE_PROCESS_ENV: "true",
  WRANGLER_SEND_METRICS: "false",
  WRANGLER_WRITE_LOGS: "false",
  NODE_OPTIONS: "",
  LOCAL_COMMERCE_ACCEPTANCE_DISABLE_INSPECTOR: "true",
};
if (retained) env.NODE_ENV = "development";
for (const [name, value] of Object.entries({ SHADOW_DB: config.ports.shadowDb, API: config.ports.api,
  DB: config.ports.db, STUDIO: config.ports.studio, SMTP: config.ports.smtp })) env[`LOCAL_COMMERCE_${name}_PORT`] = String(value);
for (const [name, value] of Object.entries({ API: config.endpoints.apiUrl, RPC: config.endpoints.rpcUrl,
  STORAGE: config.endpoints.storageUrl })) env[`LOCAL_COMMERCE_${name}_URL`] = value;
const secrets = [stack.SERVICE_ROLE_KEY, stack.ANON_KEY, stack.JWT_SECRET, adminPassword,
  env.LOCAL_COMMERCE_IMAGE_HELPER_SECRET, env.LOCAL_ORDER_CAPABILITY_SECRET, env.PHOTOGIFT_GUEST_DRAFT_OWNER_SECRET].filter(Boolean);
const redact = (input) => secrets.reduce((safe, secret) => safe.split(secret).join("[redacted]"), String(input ?? ""))
  .replace(/eyJ[A-Za-z0-9_.-]+/g, "[redacted]");

let logs = "";
const children = new Set();
function startNode(args) {
  const child = spawn(process.execPath, args, { cwd: root, env, detached: false, stdio: ["ignore", "pipe", "pipe"] });
  children.add(child);
  for (const stream of [child.stdout, child.stderr]) stream.on("data", (chunk) => { logs = (logs + redact(chunk)).slice(-30_000); });
  child.once("exit", () => children.delete(child));
  return child;
}
function processExists(pid) { try { process.kill(pid, 0); return true; } catch (error) { return error.code !== "ESRCH"; } }
async function portServes(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    const done = (value) => { socket.destroy(); resolve(value); };
    socket.setTimeout(1000, () => done(false));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}
async function waitForApp(origin, child) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    assert.equal(child.exitCode, null, logs);
    try {
      const response = await fetch(`${origin}/api/customer-auth/session`, { signal: AbortSignal.timeout(1500) });
      await response.arrayBuffer();
      if (response.status === 200) return;
    } catch { /* bounded readiness */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.fail(`Worker readiness timeout: ${logs}`);
}
function exactWorkerIdentity(child, port) {
  assert.ok(child?.pid && processExists(child.pid));
  const commandLine = command("ps", ["-p", String(child.pid), "-o", "command="]);
  assert.match(commandLine, new RegExp(`local-commerce-test-worker\\.mjs ${run} ${retained ? "--confirm-retained" : "--confirm-disposable"} ${port}`));
  const cwd = command("lsof", ["-a", "-p", String(child.pid), "-d", "cwd", "-Fn"]);
  assert.match(cwd, new RegExp(`^p${child.pid}\\nfcwd\\nn${root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m"));
  const listener = command("lsof", ["-nP", "-a", "-p", String(child.pid), `-iTCP:${port}`, "-sTCP:LISTEN", "-Fn"]);
  assert.match(listener, new RegExp(`^p${child.pid}$`, "m"));
  assert.match(listener, new RegExp(`^n127\\.0\\.0\\.1:${port}$`, "m"));
  return { pid: child.pid, port, command: `node tests/database/local-commerce-test-worker.mjs ${run} ${retained ? "--confirm-retained" : "--confirm-disposable"} ${port}`, cwd: root, run, projectId };
}
async function stopOwned(child, port) {
  const identity = exactWorkerIdentity(child, port);
  const exited = new Promise((resolve) => child.once("exit", (code, signal) => resolve({ code, signal })));
  assert.equal(child.kill("SIGTERM"), true);
  const result = await Promise.race([exited, new Promise((_, reject) => setTimeout(() => reject(new Error("Worker termination timeout")), 15_000))]);
  assert.equal(processExists(identity.pid), false);
  assert.equal(await portServes(port), false);
  return { identity, requestedAt: new Date().toISOString(), signal: "SIGTERM", result, absent: true, portClosed: true };
}
async function stopExactChild(child) {
  assert.ok(child?.pid && processExists(child.pid));
  const pid = child.pid;
  const exited = new Promise((resolve) => child.once("exit", (code, signal) => resolve({ code, signal })));
  assert.equal(child.kill("SIGTERM"), true);
  const result = await Promise.race([exited, new Promise((_, reject) => setTimeout(() => reject(new Error("Child termination timeout")), 15_000))]);
  assert.equal(processExists(pid), false);
  return { pid, result, absent: true };
}

const chromeBinary = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browserProfiles = [];
const browserChildren = [];
async function startBrowser(port, initialUrl) {
  const profile = mkdtempSync(path.join(tmpdir(), "figmemento-task111-browser-")); browserProfiles.push(profile);
  const browser = spawn(chromeBinary, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "--disable-component-update",
    "--disable-sync", "--metrics-recording-only", initialUrl], { stdio: "ignore" });
  browserChildren.push(browser);
  for (let attempt = 0; attempt < 60; attempt += 1) {
    assert.equal(browser.exitCode, null, "Chrome exited before CDP readiness");
    try { const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1000) }); if (response.ok) return; }
    catch { /* bounded readiness */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.fail("Chrome CDP readiness timeout");
}
async function connectPage(port) {
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(2000) })).json();
  const page = pages.find((candidate) => candidate.type === "page"); assert.ok(page?.webSocketDebuggerUrl);
  const socket = new WebSocket(page.webSocketDebuggerUrl); await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true });
  });
  let nextId = 0; const pending = new Map();
  socket.addEventListener("message", (event) => { const value = JSON.parse(event.data); if (!value.id || !pending.has(value.id)) return;
    const promise = pending.get(value.id); pending.delete(value.id);
    if (value.error) promise.reject(new Error(JSON.stringify(value.error)));
    else promise.resolve(value.result);
  });
  const call = (method, params = {}) => { const id = ++nextId; socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject })); };
  await call("Page.enable"); await call("Runtime.enable"); await call("Network.enable"); return { socket, call };
}
async function navigate(cdp, url) {
  await cdp.call("Page.navigate", { url });
  for (let attempt = 0; attempt < 80; attempt += 1) { const state = await cdp.call("Runtime.evaluate", { expression: "document.readyState", returnByValue: true });
    if (state.result.value === "complete") return; await new Promise((resolve) => setTimeout(resolve, 250)); }
  assert.fail("Browser navigation timeout");
}
async function evaluate(cdp, expression) {
  const result = await cdp.call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text); return result.result.value;
}
async function importBrowserCookies(cdp, jar) {
  const result = await cdp.call("Network.getAllCookies");
  for (const cookie of result.cookies.filter((item) => item.domain === "127.0.0.1")) jar.values.set(cookie.name, cookie.value);
}
async function exportBrowserCookies(cdp, jar, origin) {
  for (const [name, value] of jar.values) assert.equal((await cdp.call("Network.setCookie", { name, value, url: origin, path: "/", httpOnly: true, sameSite: "Lax" })).success, true);
}

class CookieJar {
  constructor(entries = []) { this.values = new Map(entries); }
  header() { return [...this.values].map(([key, value]) => `${key}=${value}`).join("; "); }
  accept(response) {
    for (const value of response.headers.getSetCookie()) {
      const pair = value.split(";")[0]; const at = pair.indexOf("="); const key = pair.slice(0, at); const item = pair.slice(at + 1);
      if (item) this.values.set(key, item); else this.values.delete(key);
    }
  }
  clone() { return new CookieJar(this.values); }
  removeMatching(pattern) { for (const key of this.values.keys()) if (pattern.test(key)) this.values.delete(key); }
  metadata() { return [...this.values.keys()].sort(); }
}
let activeOrigin;
async function request(jar, method, route, body, headers = {}) {
  const options = { method, headers: { origin: activeOrigin, cookie: jar?.header() ?? "", ...headers }, signal: AbortSignal.timeout(30_000) };
  if (body instanceof FormData) options.body = body;
  else if (body !== undefined) { options.headers["content-type"] = "application/json"; options.body = JSON.stringify(body); }
  const response = await fetch(`${activeOrigin}${route}`, options);
  jar?.accept(response);
  return response;
}
const get = (jar, route, headers) => request(jar, "GET", route, undefined, headers);
const post = (jar, route, body, headers) => request(jar, "POST", route, body, headers);
const put = (jar, route, body, headers) => request(jar, "PUT", route, body, headers);
const patchRequest = (jar, route, body, headers) => request(jar, "PATCH", route, body, headers);
async function json(response, expected = 200) { assert.equal(response.status, expected, await response.clone().text()); return response.json(); }

const physical = {
  productId: ids.product, variantId: ids.variant, skuCode: "SYNTHETIC-KEEPSAKE-S",
  selectedOptions: [{ optionId: ids.option, valueId: ids.value }], configurationRevision: "1", fieldId: ids.field,
};
const digital = {
  productId: "41d7632c-6047-4303-8cac-7eae90b7910a", variantId: "7a437f50-c7a2-4c99-bd98-0427b77c4c42",
  skuCode: "GRANT-DIGITAL-d6c48d6c8b084448991a495c56708a48",
  selectedOptions: [{ optionId: "17f0edb9-eade-4447-bd55-9c729669e134", valueId: "77828ebb-92e8-409e-b6c5-157121b445ca" }],
  configurationRevision: "1",
};
for (const item of [physical, digital]) assert.equal(sql(`select count(*) from local_commerce.catalog_products p join local_commerce.catalog_variants v on v.project_id=p.project_id and v.product_id=p.id join local_commerce.catalog_configuration_snapshots c on c.project_id=p.project_id and c.product_id=p.id where p.project_id='${projectId}' and p.id='${item.productId}' and v.id='${item.variantId}' and v.sku_code='${item.skuCode}' and c.revision=1 and p.lifecycle='active' and v.lifecycle='active' and c.lifecycle='active';`), "1");

const sha = (value) => createHash("sha256").update(value).digest("hex");
function rows(query) { const raw = sql(query); return raw ? JSON.parse(raw) : null; }
function orderIdentity(reference) {
  return rows(`select json_build_object('id',o.id,'ownerId',o.owner_id,'ownerKind',w.owner_kind,'reference',o.public_reference,'items',(select json_agg(json_build_object('id',i.id,'sequence',i.item_sequence) order by i.item_sequence) from local_commerce.order_items i where i.project_id=o.project_id and i.order_id=o.id)) from local_commerce.orders o join local_commerce.commerce_owners w on w.project_id=o.project_id and w.id=o.owner_id where o.project_id='${projectId}' and o.public_reference='${reference}';`);
}
function tableDigest(table, where) { return sql(`select encode(digest(coalesce(string_agg(to_jsonb(t)::text,E'\\n' order by to_jsonb(t)::text),''),'sha256'),'hex') from local_commerce.${table} t where ${where};`); }
function domainSnapshot(order) {
  const oid = order.id;
  const itemScope = `project_id='${projectId}' and order_item_id in(select id from local_commerce.order_items where project_id='${projectId}' and order_id='${oid}')`;
  const orderScope = `project_id='${projectId}' and order_id='${oid}'`;
  const tables = {
    order: ["orders", `project_id='${projectId}' and id='${oid}'`], items: ["order_items", orderScope],
    purchase: ["order_purchase_snapshots", orderScope], itemPurchase: ["order_item_purchase_snapshots", itemScope],
    receipts: ["order_item_receipt_bindings", itemScope], payments: ["payment_attempts", orderScope], paymentActions: ["payment_actions", orderScope],
    fulfillment: ["fulfillments", orderScope], reviews: ["photo_reviews", orderScope], decisions: ["fulfillment_decisions", orderScope],
    manifests: ["preview_manifests", orderScope], manifestEntries: ["preview_manifest_entries", orderScope], previewMedia: ["fulfillment_preview_media", orderScope],
    shipments: ["shipments", orderScope], shipmentEvents: ["shipment_events", orderScope], shipmentActions: ["shipment_actions", orderScope],
    digitalVersions: ["digital_versions", itemScope], digitalGrants: ["digital_grants", itemScope], digitalTickets: ["digital_tickets", itemScope],
    digitalAttempts: ["digital_delivery_attempts", itemScope],
  };
  return Object.fromEntries(Object.entries(tables).map(([name, [table, where]]) => [name, tableDigest(table, where)]));
}
function fulfillment(reference) {
  return rows(`select json_build_object('id',f.id,'version',f.version,'status',f.fulfillment_state,'revisionRequestsUsed',f.revision_requests_used,'manifestId',f.current_manifest_id,'manifestVersion',(select manifest_version from local_commerce.preview_manifests where id=f.current_manifest_id),'items',(select json_agg(i.id order by i.item_sequence) from local_commerce.order_items i where i.order_id=o.id)) from local_commerce.fulfillments f join local_commerce.orders o on o.project_id=f.project_id and o.id=f.order_id where o.project_id='${projectId}' and o.public_reference='${reference}';`);
}

const sharp = createRequire(path.resolve("local/commerce/image-helper/package.json"))("sharp");
const imageA = await sharp({ create: { width: 64, height: 48, channels: 3, background: "#c4815a" } }).png().toBuffer();
const imageB = await sharp({ create: { width: 80, height: 60, channels: 3, background: "#3c2a1e" } }).png().toBuffer();
const previewBytes = await sharp({ create: { width: 48, height: 36, channels: 3, background: "#d4b896" } }).png().toBuffer();
const pdfBytes = Buffer.from("%PDF-1.4\n% Figmemento Task 11.1 synthetic private digital file\n%%EOF\n");

async function createDraft(jar, created) {
  const receipts = [];
  for (const [index, bytes] of [imageA, imageB].entries()) {
    const form = new FormData(); form.set("file", new File([bytes], `task111-${index}.png`, { type: "image/png" }));
    const route = `/api/uploads?${new URLSearchParams({ productId: physical.productId, fieldId: physical.fieldId, draftId: created.draftId, expectedVersion: String(created.version) })}`;
    receipts.push((await json(await post(jar, route, form, { "Idempotency-Key": randomUUID() }), 201)).receipt.receiptId);
  }
  let saved = await json(await put(jar, `/api/local-drafts/${created.draftId}`, { expectedVersion: created.version,
    slots: receipts.map((receiptReference) => ({ fieldId: physical.fieldId, receiptReference })) }, { "Idempotency-Key": randomUUID() }));
  const crops = [{ x: 0.1, y: 0.15, width: 0.7, height: 0.65 }, { x: 0.05, y: 0.1, width: 0.8, height: 0.75 }];
  const cropped = [];
  for (const [index, slot] of saved.slots.entries()) cropped.push((await json(await post(jar, "/api/customer-uploads/preview", {
    productId: physical.productId, fieldId: physical.fieldId, draftId: saved.draftId, expectedVersion: saved.version,
    receiptId: slot.receiptReference, crop: crops[index],
  }, { "Idempotency-Key": randomUUID() }), 201)).receipt.receiptId);
  saved = await json(await put(jar, `/api/local-drafts/${saved.draftId}`, { expectedVersion: saved.version,
    slots: saved.slots.map((slot, index) => ({ slotId: slot.slotId, fieldId: physical.fieldId, receiptReference: cropped[index], crop: crops[index] })) }, { "Idempotency-Key": randomUUID() }));
  const restored = await json(await get(jar, `/api/local-drafts?productId=${physical.productId}`));
  assert.equal(restored.status, "found");
  return restored;
}
function physicalHandoff(receipts = [], cropOffset = 0) {
  const { fieldId, ...canonical } = physical;
  return { ...canonical, customizationValues: receipts.length ? [{ fieldId, fieldCode: "photo", kind: "image",
    images: receipts.map((receiptId, index) => ({ receiptId, crop: [{ x: 0.1, y: 0.15, width: 0.7, height: 0.65 }, { x: 0.05, y: 0.1, width: 0.8, height: 0.75 }][index + cropOffset] })) }] : [] };
}
const digitalHandoff = { ...digital, customizationValues: [] };
async function addCart(jar, handoff, quantity = 1) {
  const cart = await json(await post(jar, "/api/cart", { handoff }));
  const line = cart.lines.at(-1);
  if (quantity === 1) return cart;
  return json(await patchRequest(jar, `/api/cart/items/${line.lineId}`, { quantity }));
}
async function createOrder(jar, label, shippingMethod = "local_standard") {
  const input = { creationAttemptId: randomUUID(), email: `${label}@example.invalid`, firstName: "Task", lastName: "Recovery",
    country: "US", city: "Test", addressLine1: "Synthetic acceptance only", postalCode: "00000", shippingMethod };
  const checkout = await post(jar, "/api/checkout", Object.fromEntries(Object.entries(input).filter(([key]) => key !== "creationAttemptId")));
  assert.equal(checkout.status, 200, `checkout: ${await checkout.clone().text()}`); await checkout.arrayBuffer();
  let response = await post(jar, "/api/local-orders", input);
  if (response.status === 204) {
    await response.arrayBuffer();
    assert.ok(jar.metadata().some((name) => name.includes("order-access")), `missing Order capability cookie: ${jar.metadata().join(",")}`);
    response = await post(jar, "/api/local-orders", input);
  }
  const body = await json(response);
  assert.match(body.publicReference, /^FM-LOCAL-[A-Z0-9]{16}$/);
  return { ...orderIdentity(body.publicReference), creationInput: input };
}
async function payment(jar, reference, key, outcome) { return json(await post(jar, "/api/local-payments", { publicReference: reference, paymentAttemptId: key, outcome })); }
async function operator(reference, body) { return json(await post(null, `/api/local-fulfillment/operator/${reference}`, body)); }
async function review(reference, itemId, actionKind) {
  const state = fulfillment(reference);
  return operator(reference, { fulfillmentActionId: randomUUID(), actionKind, orderItemId: itemId, expectedAggregateVersion: state.version });
}
async function uploadPreview(reference, itemId) {
  const form = new FormData(); form.set("file", new File([previewBytes], "preview.png", { type: "image/png" }));
  const route = `/api/local-fulfillment/operator/${reference}/preview?${new URLSearchParams({ orderItemId: itemId, actionId: randomUUID(), expectedVersion: String(fulfillment(reference).version) })}`;
  return json(await post(null, route, form));
}
async function publishPreview(reference) {
  const state = fulfillment(reference); const entries = [];
  for (const itemId of state.items) { const ready = await uploadPreview(reference, itemId); entries.push({ orderItemId: itemId, previewMediaId: ready.value.previewMediaId }); }
  return json(await post(null, `/api/local-fulfillment/operator/${reference}/preview`, { actionId: randomUUID(), expectedVersion: fulfillment(reference).version, entries }));
}
async function customerPreview(jar, reference, actionKind, revisionNote) {
  const state = fulfillment(reference);
  return json(await post(jar, `/api/local-fulfillment/${reference}`, { fulfillmentActionId: randomUUID(), actionKind,
    expectedPreviewVersion: state.manifestVersion, expectedAggregateVersion: state.version, ...(revisionNote ? { revisionNote } : {}) }));
}
async function lifecycle(reference, actionKind) {
  return operator(reference, { fulfillmentActionId: randomUUID(), actionKind, expectedAggregateVersion: fulfillment(reference).version });
}
async function tracking(reference, actionKind, key, version) {
  return json(await post(null, `/api/local-tracking/operator/${reference}`, { trackingActionId: key, actionKind, expectedShipmentVersion: version }));
}
async function adminLogin(jar) { return json(await post(jar, "/api/admin/login", { password: adminPassword })); }

const report = { status: "BLOCKED", task: retained ? "11.2-retained-baseline" : "11.1", run, projectId, ledger: "37/37", pending: 0,
  process: {}, credentials: {}, before: {}, after: {}, negatives: [], exclusions: {} };
let helper = startNode(["local/commerce/image-helper/server.mjs"]);
let workerA; let workerB; let originalClock; let guestCdp; let memberCdp;
try {
  workerA = startNode(["tests/database/local-commerce-test-worker.mjs", run, retained ? "--confirm-retained" : "--confirm-disposable", String(appPortA)]);
  activeOrigin = `http://127.0.0.1:${appPortA}`;
  await waitForApp(activeOrigin, workerA);
  const identityA = exactWorkerIdentity(workerA, appPortA);
  report.process.A = identityA;

  const guest = new CookieJar(); const member = new CookieJar(); const admin = new CookieJar(); const foreign = new CookieJar();
  await startBrowser(guestCdpPort, `${activeOrigin}/product/synthetic-keepsake`); guestCdp = await connectPage(guestCdpPort);
  await navigate(guestCdp, `${activeOrigin}/product/synthetic-keepsake`);
  const browserDraftCreate = await evaluate(guestCdp, `(async()=>{const response=await fetch('/api/local-drafts',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json','Idempotency-Key':crypto.randomUUID()},body:JSON.stringify({productId:${JSON.stringify(physical.productId)}})});return {status:response.status,body:await response.json()}})()`);
  assert.equal(browserDraftCreate.status, 201); await importBrowserCookies(guestCdp, guest);
  const draft = await createDraft(guest, browserDraftCreate.body);
  const draftReceipts = draft.draft.slots.map((slot) => slot.receiptReference);
  assert.equal(draftReceipts.length, 2);

  await addCart(guest, physicalHandoff(draftReceipts));
  await addCart(guest, physicalHandoff(), 2);
  const main = await createOrder(guest, `task111-physical-${randomUUID()}`);
  const failedPaymentKey = randomUUID(); const successPaymentKey = randomUUID();
  await payment(guest, main.reference, failedPaymentKey, "failed");
  await payment(guest, main.reference, successPaymentKey, "success");
  await operator(main.reference, { fulfillmentActionId: randomUUID(), actionKind: "enter_photo_review" });
  const reviewItems = rows(`select coalesce(json_agg(order_item_id order by order_item_id),'[]'::json) from local_commerce.photo_reviews where project_id='${projectId}' and order_id='${main.id}';`);
  assert.equal(reviewItems.length, 1);
  for (const itemId of reviewItems) await review(main.reference, itemId, "approve_photo_review");
  await publishPreview(main.reference);
  await customerPreview(guest, main.reference, "request_revision", "Please revise this exact preview.");
  await publishPreview(main.reference);
  await customerPreview(guest, main.reference, "approve_preview");
  await lifecycle(main.reference, "start_production");
  await lifecycle(main.reference, "mark_quality_check");
  const createShipmentKey = randomUUID(); const shippedKey = randomUUID(); const transitKey = randomUUID(); const deliveredKey = randomUUID();
  await tracking(main.reference, "create_shipment", createShipmentKey, 0);
  await tracking(main.reference, "mark_shipped", shippedKey, 1);
  await tracking(main.reference, "mark_in_transit", transitKey, 2);
  await tracking(main.reference, "mark_delivered", deliveredKey, 3);

  guest.removeMatching(/cart/i);
  await addCart(guest, physicalHandoff());
  const timeoutOrder = await createOrder(guest, `task111-timeout-${randomUUID()}`);
  await payment(guest, timeoutOrder.reference, randomUUID(), "success");
  await operator(timeoutOrder.reference, { fulfillmentActionId: randomUUID(), actionKind: "enter_photo_review" });
  await publishPreview(timeoutOrder.reference);
  await adminLogin(admin);
  const timeoutState = fulfillment(timeoutOrder.reference);
  originalClock = sql("select pg_get_functiondef('local_commerce.fulfillment_timeout_now(text,uuid,uuid)'::regprocedure);");
  sql(`create or replace function local_commerce.fulfillment_timeout_now(p_project_id text,p_order_id uuid,p_manifest_id uuid) returns timestamptz language sql volatile set search_path=pg_catalog as $clock$ select case when p_project_id='${projectId}' and p_order_id='${timeoutOrder.id}'::uuid and p_manifest_id='${timeoutState.manifestId}'::uuid then (select approval_deadline_at from local_commerce.preview_manifests where project_id='${projectId}' and id='${timeoutState.manifestId}'::uuid) else clock_timestamp() end;$clock$;`);
  const timeoutActionId = randomUUID();
  const timeoutInput = { actionKind: "operator_timeout", fulfillmentActionId: timeoutActionId,
    expectedAggregateVersion: timeoutState.version, expectedPreviewVersion: timeoutState.manifestVersion,
    manifestId: timeoutState.manifestId, reason: "Task 11.1 controlled recovery timeout." };
  const timeoutCommitted = await json(await post(admin, `/api/local-fulfillment/admin/${timeoutOrder.reference}/timeout`, timeoutInput));
  assert.equal(timeoutCommitted.status, "committed");
  sql(originalClock);
  assert.equal(sql("select pg_get_functiondef('local_commerce.fulfillment_timeout_now(text,uuid,uuid)'::regprocedure);") , originalClock);
  originalClock = undefined;

  guest.removeMatching(/cart/i);
  await addCart(guest, digitalHandoff);
  const digitalOrder = await createOrder(guest, `task111-digital-${randomUUID()}`);
  await payment(guest, digitalOrder.reference, randomUUID(), "success");
  await operator(digitalOrder.reference, { fulfillmentActionId: randomUUID(), actionKind: "enter_photo_review" });
  const publication = new FormData(); publication.set("orderNumber", digitalOrder.reference); publication.set("orderItemId", digitalOrder.items[0].id);
  publication.set("publicationActionId", randomUUID()); publication.set("file", new File([pdfBytes], "task111.pdf", { type: "application/pdf" }));
  await json(await post(admin, "/api/admin/digital-delivery", publication));
  const grantActionId = randomUUID();
  const grant = await json(await post(guest, `/api/local-orders/${digitalOrder.reference}/digital-delivery/grant`, { orderItemId: digitalOrder.items[0].id, grantActionId }));
  const ticket = await json(await post(guest, `/api/local-orders/${digitalOrder.reference}/digital-delivery/tickets`, { orderItemId: digitalOrder.items[0].id, grantId: grant.grant.grantId }));
  const downloaded = await get(guest, `/api/local-orders/${digitalOrder.reference}/digital-delivery/download`, {
    "x-figmemento-download-ticket": ticket.ticket, "x-figmemento-download-intent": "explicit",
  });
  assert.equal(downloaded.status, 200); assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), pdfBytes);

  guest.removeMatching(/cart/i);
  await addCart(guest, physicalHandoff(draftReceipts));
  const finalCart = await addCart(guest, physicalHandoff(), 3);
  assert.equal(finalCart.lines.length, 2);

  const memberEmail = `task111-member-${randomUUID()}@example.invalid`;
  await startBrowser(memberCdpPort, `${activeOrigin}/register`); memberCdp = await connectPage(memberCdpPort);
  await navigate(memberCdp, `${activeOrigin}/register`);
  const memberSignup = await evaluate(memberCdp, `(async()=>{const response=await fetch('/api/customer-auth/sign-up',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({email:${JSON.stringify(memberEmail)},password:'Synthetic-acceptance-password-42!'})});return {status:response.status,body:await response.json()}})()`);
  assert.equal(memberSignup.status, 200); await importBrowserCookies(memberCdp, member);
  const memberSessionA = await json(await get(member, "/api/customer-auth/session"));
  assert.equal(memberSessionA.authenticated, true);
  await addCart(member, digitalHandoff, 2);
  const memberOrder = await createOrder(member, memberEmail.replace("@", "-"));
  assert.equal((await get(member, `/api/local-orders/${memberOrder.reference}`)).status, 200);

  const privateMedia = rows(`select json_agg(json_build_object('original',o.original_locator,'derivative',o.derivative_locator) order by l.position) from local_commerce.draft_media_links l join local_commerce.media_operations o on o.project_id=l.project_id and o.owner_id=l.owner_id and o.slot_id=l.id and o.receipt_id=l.receipt_id where l.project_id='${projectId}' and l.draft_id='${draft.draft.draftId}' and l.lifecycle='active';`);
  async function readPrivateByteFacts() {
    const facts = [];
    for (const item of privateMedia) for (const kind of ["original", "derivative"]) {
      const response = await fetch(`${config.endpoints.storageUrl}/object/local-commerce-private/${item[kind]}`, { headers: { authorization: `Bearer ${stack.SERVICE_ROLE_KEY}` }, signal: AbortSignal.timeout(5000) });
      assert.equal(response.status, 200); const bytes = Buffer.from(await response.arrayBuffer());
      facts.push({ kind, digest: sha(bytes), byteLength: bytes.length, contentType: response.headers.get("content-type") });
    }
    return facts;
  }
  const byteFacts = await readPrivateByteFacts();
  const before = {
    cart: await json(await get(guest, "/api/cart")), draft: await json(await get(guest, `/api/local-drafts?productId=${physical.productId}`)),
    memberSession: memberSessionA, memberCart: await json(await get(member, "/api/cart")),
    orders: Object.fromEntries([main, timeoutOrder, digitalOrder, memberOrder].map((order) => [order.reference, domainSnapshot(order)])),
    orderReads: {}, tracking: await json(await get(guest, `/api/local-tracking/${main.reference}`)), byteFacts,
  };
  for (const order of [main, timeoutOrder, digitalOrder]) before.orderReads[order.reference] = await json(await get(guest, `/api/local-orders/${order.reference}`));
  before.orderReads[memberOrder.reference] = await json(await get(member, `/api/local-orders/${memberOrder.reference}`));
  report.before = { cartDigest: sha(JSON.stringify(before.cart)), draftDigest: sha(JSON.stringify(before.draft)),
    memberSession: { authenticated: true, customerId: before.memberSession.customer.id, ownerId: before.memberSession.ownerId },
    orderDigests: Object.fromEntries(Object.entries(before.orders).map(([key, value]) => [key, sha(JSON.stringify(value))])),
    trackingDigest: sha(JSON.stringify(before.tracking)), privateBytes: byteFacts };
  report.credentials = { guestCookieNames: guest.metadata(), memberCookieNames: member.metadata(), adminCookieNames: admin.metadata(),
    realChromeProfiles: true, browserContinuity: true, rawValuesReported: false };

  const termination = await stopOwned(workerA, appPortA); workerA = undefined;
  report.process.termination = termination;
  assert.equal(processExists(identityA.pid), false); assert.equal(await portServes(appPortA), false);
  const bStartedAt = new Date().toISOString();
  workerB = startNode(["tests/database/local-commerce-test-worker.mjs", run, retained ? "--confirm-retained" : "--confirm-disposable", String(appPortB)]);
  activeOrigin = `http://127.0.0.1:${appPortB}`;
  await waitForApp(activeOrigin, workerB);
  const identityB = exactWorkerIdentity(workerB, appPortB); assert.notEqual(identityA.pid, identityB.pid);
  report.process.B = { ...identityB, startedAt: bStartedAt, afterAAbsent: true };

  await exportBrowserCookies(guestCdp, guest, activeOrigin); await navigate(guestCdp, `${activeOrigin}/product/synthetic-keepsake`);
  await exportBrowserCookies(memberCdp, member, activeOrigin); await navigate(memberCdp, `${activeOrigin}/account`);
  const browserContinuity = {
    guestDraft: await evaluate(guestCdp, `(async()=>{const r=await fetch('/api/local-drafts?productId=${physical.productId}',{credentials:'same-origin',cache:'no-store'});return {status:r.status,body:await r.json()}})()`),
    memberSession: await evaluate(memberCdp, `(async()=>{const r=await fetch('/api/customer-auth/session',{credentials:'same-origin',cache:'no-store'});return {status:r.status,body:await r.json()}})()`),
  };
  assert.equal(browserContinuity.guestDraft.status, 200); assert.equal(browserContinuity.guestDraft.body.status, "found");
  assert.equal(browserContinuity.memberSession.status, 200); assert.equal(browserContinuity.memberSession.body.authenticated, true);

  const memberSessionB = await json(await get(member, "/api/customer-auth/session"));
  assert.deepEqual({ authenticated: memberSessionB.authenticated, customerId: memberSessionB.customer.id, ownerId: memberSessionB.ownerId },
    { authenticated: true, customerId: memberSessionA.customer.id, ownerId: memberSessionA.ownerId });
  const after = {
    cart: await json(await get(guest, "/api/cart")), draft: await json(await get(guest, `/api/local-drafts?productId=${physical.productId}`)),
    memberSession: memberSessionB, memberCart: await json(await get(member, "/api/cart")), orders: {}, orderReads: {},
    tracking: await json(await get(guest, `/api/local-tracking/${main.reference}`)),
  };
  for (const order of [main, timeoutOrder, digitalOrder, memberOrder]) after.orders[order.reference] = domainSnapshot(order);
  for (const order of [main, timeoutOrder, digitalOrder]) after.orderReads[order.reference] = await json(await get(guest, `/api/local-orders/${order.reference}`));
  after.orderReads[memberOrder.reference] = await json(await get(member, `/api/local-orders/${memberOrder.reference}`));
  assert.deepEqual(after.cart, before.cart); assert.deepEqual(after.draft, before.draft); assert.deepEqual(after.memberCart, before.memberCart);
  assert.deepEqual(after.orders, before.orders); assert.deepEqual(after.orderReads, before.orderReads); assert.deepEqual(after.tracking, before.tracking);
  const recoveredByteFacts = await readPrivateByteFacts();
  assert.deepEqual(recoveredByteFacts, byteFacts);

  const paymentReplay = await payment(guest, main.reference, successPaymentKey, "success"); assert.ok(["committed", "replayed"].includes(paymentReplay.status));
  const trackingReplay = await tracking(main.reference, "mark_shipped", shippedKey, 1); assert.equal(trackingReplay.status, "replayed");
  assert.equal((await post(guest, `/api/local-orders/${digitalOrder.reference}/digital-delivery/download`, undefined, {
    "x-figmemento-download-ticket": ticket.ticket, "x-figmemento-download-intent": "explicit",
  })).status, 405);
  const spent = await get(guest, `/api/local-orders/${digitalOrder.reference}/digital-delivery/download`, {
    "x-figmemento-download-ticket": ticket.ticket, "x-figmemento-download-intent": "explicit",
  }); assert.equal(spent.status, 404); await spent.arrayBuffer();
  const newTicket = await json(await post(guest, `/api/local-orders/${digitalOrder.reference}/digital-delivery/tickets`, { orderItemId: digitalOrder.items[0].id, grantId: grant.grant.grantId }));
  const secondDownload = await get(guest, `/api/local-orders/${digitalOrder.reference}/digital-delivery/download`, {
    "x-figmemento-download-ticket": newTicket.ticket, "x-figmemento-download-intent": "explicit",
  }); assert.equal(secondDownload.status, 200); assert.deepEqual(Buffer.from(await secondDownload.arrayBuffer()), pdfBytes);
  const timeoutReplay = await json(await post(admin, `/api/local-fulfillment/admin/${timeoutOrder.reference}/timeout`, timeoutInput));
  assert.equal(timeoutReplay.status, "replayed");

  for (const [label, jar, route] of [
    ["foreign cart", foreign, "/api/cart"], ["foreign draft", foreign, `/api/local-drafts?productId=${physical.productId}`],
    ["foreign guest order", foreign, `/api/local-orders/${main.reference}`], ["foreign member order", foreign, `/api/local-orders/${memberOrder.reference}`],
    ["public reference tracking", foreign, `/api/local-tracking/${main.reference}`],
  ]) {
    const response = await get(jar, route); assert.ok([200, 403, 404].includes(response.status));
    const body = await response.json();
    if (response.status === 200) assert.ok(body.status === "not_found" || (label === "foreign cart" && body.lines?.length === 0));
    report.negatives.push({ label, status: response.status, bounded: true });
  }
  const forgedGuest = guest.clone(); const guestKey = [...forgedGuest.values.keys()].find((key) => key.includes("guest-draft-owner"));
  assert.ok(guestKey); forgedGuest.values.set(guestKey, "forged");
  assert.equal((await get(forgedGuest, `/api/local-drafts?productId=${physical.productId}`)).status, 200);
  const forgedOrder = guest.clone(); const orderKey = [...forgedOrder.values.keys()].find((key) => key.includes("order-access"));
  assert.ok(orderKey); forgedOrder.values.set(orderKey, "forged"); assert.equal((await get(forgedOrder, `/api/local-orders/${main.reference}`)).status, 404);
  const wrongMember = member.clone(); const memberSessionKey = [...wrongMember.values.keys()].find((key) => key.includes("customer-session"));
  assert.ok(memberSessionKey); wrongMember.values.set(memberSessionKey, "forged"); assert.equal((await get(wrongMember, `/api/local-orders/${memberOrder.reference}`)).status, 404);

  const grantFacts = rows(`select json_build_object('id',id,'activatedAt',activated_at,'expiresAt',expires_at,'maxDownloads',max_attempts,'consumed',used_attempts,'status',grant_status) from local_commerce.digital_grants where project_id='${projectId}' and order_item_id='${digitalOrder.items[0].id}';`);
  assert.equal(grantFacts.maxDownloads, 5); assert.equal(grantFacts.consumed, 2); assert.equal(grantFacts.status, "active");
  assert.equal(sql(`select count(*) from local_commerce.digital_tickets where project_id='${projectId}' and order_item_id='${digitalOrder.items[0].id}' and lifecycle='consumed';`), "2");
  assert.equal(sql(`select revision_requests_used from local_commerce.fulfillments where project_id='${projectId}' and order_id='${main.id}';`), "1");
  assert.equal(sql(`select count(*)||':'||max(manifest_version) from local_commerce.preview_manifests where project_id='${projectId}' and order_id='${main.id}';`), "2:2");
  assert.equal(sql(`select tracking_lifecycle from local_commerce.shipments where project_id='${projectId}' and order_id='${main.id}';`), "delivered");
  assert.equal(sql(`select count(*) from local_commerce.shipment_events where project_id='${projectId}' and order_id='${main.id}';`), "4");
  assert.equal(sql(`select count(*) from local_commerce.fulfillment_decisions where project_id='${projectId}' and order_id='${timeoutOrder.id}' and decision_kind='operator_timeout';`), "1");
  assert.equal(sql("select count(*) from information_schema.tables where table_schema='local_commerce' and table_name like '%supplier%';"), "0");

  if (retained) {
    const exclusionProfile = "vector,logflare,studio,realtime,edge-runtime,mailpit,imgproxy,postgres-meta,supavisor";
    const markerBefore = sha256Text(JSON.stringify(JSON.parse(readFileSync(markerPath, "utf8"))));
    const volumeNames = () => command("docker", ["volume", "ls", "--filter", `label=com.supabase.cli.project=${projectId}`, "--format", "{{.Name}}"]).split("\n").filter(Boolean).sort();
    const volumesBefore = volumeNames();
    assert.deepEqual(volumesBefore, ["supabase_db_figmemento-local-commerce", "supabase_edge_runtime_figmemento-local-commerce", "supabase_storage_figmemento-local-commerce"]);

    const baselineB = await stopOwned(workerB, appPortB); workerB = undefined;
    const helperStop = await stopExactChild(helper); helper = undefined;
    command(path.resolve("node_modules/.bin/supabase"), ["stop", "--project-id", projectId, "--workdir", workdir], undefined, 120_000);
    assert.equal(command("docker", ["ps", "-a", "--filter", `label=com.supabase.cli.project=${projectId}`, "--format", "{{.ID}}"]).trim(), "");
    assert.deepEqual(volumeNames(), volumesBefore);
    assert.equal(sha256Text(JSON.stringify(JSON.parse(readFileSync(markerPath, "utf8")))), markerBefore);

    command(path.resolve("node_modules/.bin/supabase"), ["start", "--workdir", workdir, "-x", exclusionProfile], undefined, 300_000);
    const requiredNames = command("docker", ["ps", "--filter", `label=com.supabase.cli.project=${projectId}`, "--format", "{{.Names}}"]).split("\n").filter(Boolean).sort();
    assert.deepEqual(requiredNames, ["supabase_auth_figmemento-local-commerce", "supabase_db_figmemento-local-commerce", "supabase_kong_figmemento-local-commerce", "supabase_rest_figmemento-local-commerce", "supabase_storage_figmemento-local-commerce"]);
    const restartedIds = command("docker", ["ps", "--filter", `label=com.supabase.cli.project=${projectId}`, "--format", "{{.ID}}"]).split("\n").filter(Boolean);
    const restartedInspected = JSON.parse(command("docker", ["inspect", ...restartedIds]));
    const restartedDatabases = restartedInspected.filter((value) => value.Config.Labels["com.supabase.cli.workdir"] === workdir
      && value.Name === "/supabase_db_figmemento-local-commerce" && value.State.Running === true);
    assert.equal(restartedDatabases.length, 1); database = restartedDatabases[0].Id;
    assert.equal(sql("select current_setting('server_version_num')::int/10000;"), "17");
    assert.equal(sql(`select local_commerce.verify_project_identity('${projectId}','${preparation.markerDigest}');`), "t");
    assert.equal(sql("select count(*) from local_commerce.migration_ledger;"), "37");
    assert.deepEqual(volumeNames(), volumesBefore);

    helper = startNode(["local/commerce/image-helper/server.mjs"]);
    workerB = startNode(["tests/database/local-commerce-test-worker.mjs", run, "--confirm-retained", String(appPortC)]);
    activeOrigin = `http://127.0.0.1:${appPortC}`;
    await waitForApp(activeOrigin, workerB);
    const retainedWorker = exactWorkerIdentity(workerB, appPortC);
    await exportBrowserCookies(guestCdp, guest, activeOrigin); await exportBrowserCookies(memberCdp, member, activeOrigin);
    assert.deepEqual(await json(await get(guest, "/api/cart")), before.cart);
    assert.deepEqual(await json(await get(guest, `/api/local-drafts?productId=${physical.productId}`)), before.draft);
    const retainedMember = await json(await get(member, "/api/customer-auth/session"));
    assert.equal(retainedMember.authenticated, true); assert.equal(retainedMember.customer.id, memberSessionA.customer.id);
    for (const order of [main, timeoutOrder, digitalOrder]) assert.deepEqual(await json(await get(guest, `/api/local-orders/${order.reference}`)), before.orderReads[order.reference]);
    assert.deepEqual(await json(await get(member, `/api/local-orders/${memberOrder.reference}`)), before.orderReads[memberOrder.reference]);
    assert.deepEqual(await json(await get(guest, `/api/local-tracking/${main.reference}`)), before.tracking);
    assert.deepEqual(await readPrivateByteFacts(), byteFacts);
    assert.equal(sql(`select used_attempts from local_commerce.digital_grants where id='${grant.grant.grantId}';`), "2");
    assert.equal(sql(`select count(*) from local_commerce.digital_tickets where grant_id='${grant.grant.grantId}' and lifecycle='consumed';`), "2");

    const adminFixture = createDevelopmentCatalogFixtures();
    const fakeProduct = adminFixture.products[0];
    const fakeName = `Task 11.2 process-only ${randomUUID()}`;
    const adminPageBefore = await get(admin, "/admin/products"); assert.equal(adminPageBefore.status, 200);
    const fakeEdit = await post(admin, `/api/admin/catalog/products/${encodeURIComponent(fakeProduct.id)}`, { kind: "save_product", payload: { ...fakeProduct, name: fakeName } }, { "sec-fetch-site": "same-origin" });
    assert.equal(fakeEdit.status, 200, await fakeEdit.clone().text());
    assert.match(await (await get(admin, "/admin/products")).text(), new RegExp(fakeName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

    const recoveryTicket = await json(await post(guest, `/api/local-orders/${digitalOrder.reference}/digital-delivery/tickets`, { orderItemId: digitalOrder.items[0].id, grantId: grant.grant.grantId }));
    const quotaBeforeMissing = sql(`select used_attempts from local_commerce.digital_grants where id='${grant.grant.grantId}';`);
    const processBeforeAdminRestart = await stopOwned(workerB, appPortC); workerB = undefined;
    workerB = startNode(["tests/database/local-commerce-test-worker.mjs", run, "--confirm-retained", String(appPortC), "digital-download-missing-object"]);
    activeOrigin = `http://127.0.0.1:${appPortC}`; await waitForApp(activeOrigin, workerB);
    await exportBrowserCookies(guestCdp, guest, activeOrigin);
    const freshAdmin = new CookieJar(); await adminLogin(freshAdmin);
    assert.doesNotMatch(await (await get(freshAdmin, "/admin/products")).text(), new RegExp(fakeName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    const missing = await get(guest, `/api/local-orders/${digitalOrder.reference}/digital-delivery/download`, {
      "x-figmemento-download-ticket": recoveryTicket.ticket, "x-figmemento-download-intent": "explicit",
    });
    assert.ok([404, 503].includes(missing.status));
    assert.doesNotMatch(await missing.text(), /content_reference|storage|bucket|object|locator|service.?role/i);
    assert.equal(sql(`select used_attempts from local_commerce.digital_grants where id='${grant.grant.grantId}';`), quotaBeforeMissing);
    report.retainedCycle = { exclusionProfile: exclusionProfile.split(","), volumesBefore, volumesAfter: volumeNames(), markerUnchanged: true,
      baselineWorkerStopped: baselineB, helperStopped: helperStop, retainedWorker, processBeforeAdminRestart,
      accountSession: "PASS", cart: "PASS", draftMedia: "PASS", ordersPaymentsFulfillment: "PASS", shipmentEvents: "PASS",
      digitalGrantQuotaTicket: "PASS", privateBytes: "PASS", adminLocalFakeRestartLoss: "PASS", missingByteFault: "PASS" };
  }

  report.after = { cartDigest: sha(JSON.stringify(after.cart)), draftDigest: sha(JSON.stringify(after.draft)),
    memberSession: { authenticated: true, customerId: memberSessionB.customer.id, ownerId: memberSessionB.ownerId },
    orderDigests: Object.fromEntries(Object.entries(after.orders).map(([key, value]) => [key, sha(JSON.stringify(value))])),
    trackingDigest: sha(JSON.stringify(after.tracking)), privateBytes: recoveredByteFacts, digitalGrant: grantFacts, spentTickets: 2 };
  report.exclusions = { reset: false, reseed: false, relogin: false, newGuestAuthority: false, rowCopy: false,
    migration: false, remote: false, supplier: false, realPayment: false, realCarrier: false };
  report.status = "PASS";
  report.classification = "LOCAL DEVELOPMENT / TEST PERSISTENCE ACCEPTANCE";
  console.info(retained ? "TASK 11.2 RETAINED BASELINE PASS" : "TASK 11.1 FULL A_TO_B COMMERCE RECOVERY PASS", JSON.stringify(report));
} catch (error) {
  console.error("FIRST BLOCKER", redact(error?.stack ?? error));
  console.error(redact(logs).slice(-15_000));
  process.exitCode = 1;
} finally {
  if (originalClock) { try { sql(originalClock); } catch (error) { console.error("CLOCK RESTORE BLOCKER", redact(error)); process.exitCode = 1; } }
  for (const child of [workerA, workerB, helper]) if (child?.exitCode === null && child?.pid && processExists(child.pid)) child.kill("SIGTERM");
  guestCdp?.socket.close(); memberCdp?.socket.close();
  for (const browser of browserChildren) if (browser.exitCode === null) browser.kill("SIGTERM");
  await new Promise((resolve) => setTimeout(resolve, 750));
  for (const profile of browserProfiles) rmSync(profile, { recursive: true, force: true });
}
