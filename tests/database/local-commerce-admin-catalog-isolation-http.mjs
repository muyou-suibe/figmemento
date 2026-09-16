import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:net";
import { spawn, spawnSync } from "node:child_process";
import { createDevelopmentCatalogFixtures } from "../../app/infrastructure/catalog/development-catalog-fixtures.ts";
import { catalogTestEnvironment } from "../fixtures/local-persistent-catalog.mjs";

const run = "run-5576dfd8";
const project = `figmemento-local-commerce-test-${run}`;
const dir = `${process.cwd()}/local/commerce/runtime/disposable/${run}`;
const prep = JSON.parse(readFileSync(`${dir}/ledger-preparation.json`, "utf8"));
const config = prep.config;
const db = "3f0a14e18d07b71e0b235dffcdc61e672086d6fb5b32b35849aa8bf54f3be3e4";

function command(bin, args, input) {
  const result = spawnSync(bin, args, { input, encoding: "utf8", timeout: 20000, maxBuffer: 4 * 1024 * 1024 });
  assert.equal(result.status, 0, result.error?.code ?? result.stderr);
  return result.stdout.trim();
}

const inspected = JSON.parse(command("docker", ["inspect", db]))[0];
assert.equal(inspected.Id, db);
assert.equal(inspected.State.Status, "running");
assert.equal(inspected.Config.Labels["com.supabase.cli.workdir"], dir);
assert.equal(config.projectId, project);
const sql = (query) => command("docker", ["exec", "-i", db, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], query);
assert.equal(sql("select current_setting('server_version_num')::int/10000;"), "17");
assert.equal(sql(`select local_commerce.verify_project_identity('${project}','${prep.markerDigest}');`), "t");
const manifest = JSON.parse(readFileSync("local/commerce/migrations/manifest.json", "utf8"));
assert.ok(manifest.schemaVersion >= 27);
assert.equal(sql("select count(*) from local_commerce.migration_ledger;"), String(manifest.schemaVersion));

const info = JSON.parse(command("node_modules/.bin/supabase", ["status", "--workdir", dir, "-o", "json"]));
assert.equal(info.API_URL, config.endpoints.apiUrl);
const adminPassword = randomBytes(32).toString("hex");
const env = { ...process.env, ...catalogTestEnvironment({
  LOCAL_COMMERCE_RUN_ID: run,
  LOCAL_COMMERCE_PROJECT_ID: project,
  LOCAL_COMMERCE_MARKER_DIGEST: prep.markerDigest,
  LOCAL_COMMERCE_SERVICE_ROLE_KEY: info.SERVICE_ROLE_KEY,
  CUSTOMER_AUTH_SOURCE: "local_persistent",
  CART_SOURCE: "local_persistent",
  LOCAL_CHECKOUT_SOURCE: "local_persistent",
  LOCAL_ORDER_SOURCE: "local_persistent",
  CUSTOMER_UPLOAD_SOURCE: "local_persistent",
  LOCAL_PAYMENT_SOURCE: "local_persistent",
  LOCAL_FULFILLMENT_SOURCE: "local_persistent",
  LOCAL_TRACKING_SOURCE: "local_persistent",
  ADMIN_ACCEPTANCE_SOURCE: "local_persistent",
  ADMIN_PASSWORD: adminPassword,
}) };
for (const [key, value] of Object.entries({ SHADOW_DB: config.ports.shadowDb, API: config.ports.api, DB: config.ports.db, STUDIO: config.ports.studio, SMTP: config.ports.smtp, IMAGE_HELPER: config.ports.imageHelper })) env[`LOCAL_COMMERCE_${key}_PORT`] = String(value);
for (const [key, value] of Object.entries({ API: config.endpoints.apiUrl, RPC: config.endpoints.rpcUrl, STORAGE: config.endpoints.storageUrl, IMAGE_HELPER: config.endpoints.imageHelperUrl })) env[`LOCAL_COMMERCE_${key}_URL`] = value;
Object.assign(env, { CLOUDFLARE_INCLUDE_PROCESS_ENV: "true", WRANGLER_SEND_METRICS: "false", WRANGLER_WRITE_LOGS: "false" });

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function databaseDigests() {
  return {
    catalog: digest(sql(`select jsonb_build_object(
      'products',coalesce((select jsonb_agg(to_jsonb(p) order by p.id) from local_commerce.catalog_products p where p.project_id='${project}'),'[]'::jsonb),
      'variants',coalesce((select jsonb_agg(to_jsonb(v) order by v.id) from local_commerce.catalog_variants v where v.project_id='${project}'),'[]'::jsonb),
      'configurations',coalesce((select jsonb_agg(to_jsonb(c) order by c.id) from local_commerce.catalog_configuration_snapshots c where c.project_id='${project}'),'[]'::jsonb)
    );`)),
    orders: digest(sql(`select jsonb_build_object(
      'orders',coalesce((select jsonb_agg(to_jsonb(o) order by o.id) from local_commerce.orders o where o.project_id='${project}'),'[]'::jsonb),
      'purchase',coalesce((select jsonb_agg(to_jsonb(s) order by s.id) from local_commerce.order_purchase_snapshots s where s.project_id='${project}'),'[]'::jsonb),
      'items',coalesce((select jsonb_agg(to_jsonb(s) order by s.id) from local_commerce.order_item_purchase_snapshots s where s.project_id='${project}'),'[]'::jsonb)
    );`)),
  };
}

async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      assert.equal(typeof address, "object");
      const port = address.port;
      server.close(() => resolve(port));
    });
  });
}

async function launchWorker() {
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["tests/database/local-commerce-test-worker.mjs", run, "--confirm-disposable", String(port)], {
    env,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  for (const stream of [child.stdout, child.stderr]) stream.on("data", (chunk) => { logs = (logs + chunk).slice(-16000); });
  for (let attempt = 0; attempt < 60; attempt += 1) {
    assert.equal(child.exitCode, null, logs);
    try {
      const response = await fetch(`${origin}/api/customer-auth/session`, { signal: AbortSignal.timeout(2000) });
      await response.arrayBuffer();
      if (response.status === 200) return { child, origin, logs: () => logs };
    } catch { /* bounded readiness */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.fail(`Worker readiness blocked: ${logs}`);
}

async function stopWorker(worker) {
  const { child } = worker;
  if (child.exitCode !== null || child.signalCode !== null) return;
  const done = new Promise((resolve) => child.once("exit", resolve));
  process.kill(-child.pid, "SIGTERM");
  await Promise.race([done, new Promise((resolve) => setTimeout(resolve, 5000))]);
  if (child.exitCode === null && child.signalCode === null) {
    process.kill(-child.pid, "SIGKILL");
    await done;
  }
}

function cookiesFrom(response) {
  return response.headers.getSetCookie().map((value) => value.split(";", 1)[0]).join("; ");
}

async function login(origin) {
  const response = await fetch(`${origin}/api/admin/login`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ password: adminPassword }),
  });
  assert.equal(response.status, 200);
  return cookiesFrom(response);
}

async function adminPage(origin, cookie) {
  const response = await fetch(`${origin}/admin/products`, { headers: { cookie }, signal: AbortSignal.timeout(20000) });
  assert.equal(response.status, 200);
  return await response.text();
}

function withoutProductId(value) {
  const { productId: ignored, ...rest } = value;
  void ignored;
  return rest;
}

const fixture = createDevelopmentCatalogFixtures();
const product = fixture.products[0];
const variant = fixture.variants.find((entry) => entry.productId === product.id);
assert.ok(variant);
const fakeName = `Task 8.3 process-only ${randomBytes(4).toString("hex")}`;
const before = databaseDigests();
let first;
let second;
try {
  first = await launchWorker();
  const firstCookie = await login(first.origin);
  const initialPage = await adminPage(first.origin, firstCookie);
  assert.match(initialPage, /Catalog edits are process-memory only and reset when the development process restarts/);
  assert.match(initialPage, new RegExp(product.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  const productResponse = await fetch(`${first.origin}/api/admin/catalog/products/${encodeURIComponent(product.id)}`, {
    method: "POST",
    headers: { cookie: firstCookie, origin: first.origin, "sec-fetch-site": "same-origin", "content-type": "application/json" },
    body: JSON.stringify({ kind: "save_product", payload: { ...product, name: fakeName } }),
  });
  assert.equal(productResponse.status, 200, first.logs());
  assert.equal((await productResponse.json()).status, "applied");

  const graphResponse = await fetch(`${first.origin}/api/admin/catalog/products/${encodeURIComponent(product.id)}/sku-graph`, {
    method: "POST",
    headers: { cookie: firstCookie, origin: first.origin, "sec-fetch-site": "same-origin", "content-type": "application/json" },
    body: JSON.stringify({
      productId: product.id,
      options: fixture.options.filter((entry) => entry.productId === product.id).map(withoutProductId),
      optionValues: fixture.optionValues.filter((entry) => entry.productId === product.id).map(withoutProductId),
      variants: fixture.variants.filter((entry) => entry.productId === product.id).map((entry) => withoutProductId({ ...entry, priceCents: entry.id === variant.id ? entry.priceCents + 777 : entry.priceCents })),
    }),
  });
  assert.equal(graphResponse.status, 200, first.logs());
  assert.equal((await graphResponse.json()).status, "applied");
  assert.match(await adminPage(first.origin, firstCookie), new RegExp(fakeName));
  assert.deepEqual(databaseDigests(), before);

  const firstPid = first.child.pid;
  await stopWorker(first);
  first = undefined;
  second = await launchWorker();
  assert.notEqual(second.child.pid, firstPid);
  const secondCookie = await login(second.origin);
  const restartedPage = await adminPage(second.origin, secondCookie);
  assert.doesNotMatch(restartedPage, new RegExp(fakeName));
  assert.match(restartedPage, new RegExp(product.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.deepEqual(databaseDigests(), before);

  console.info(JSON.stringify({
    status: "PASS",
    task: "8.3",
    run,
    project,
    ledger: manifest.schemaVersion,
    pending: 0,
    firstWorkerPid: firstPid,
    secondWorkerPid: second.child.pid,
    signedAdmin: true,
    fakeProductEdit: true,
    fakePriceEdit: true,
    restartLoss: true,
    persistentCatalogDigestUnchanged: true,
    immutableOrderDigestUnchanged: true,
    persistentCatalogCrud: false,
  }));
} finally {
  if (first) await stopWorker(first);
  if (second) await stopWorker(second);
}
