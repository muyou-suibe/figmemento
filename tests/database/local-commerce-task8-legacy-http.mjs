import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:net";
import { spawn, spawnSync } from "node:child_process";
import { catalogTestEnvironment } from "../fixtures/local-persistent-catalog.mjs";

const run = "run-5576dfd8";
const project = `figmemento-local-commerce-test-${run}`;
const dir = `${process.cwd()}/local/commerce/runtime/disposable/${run}`;
const prep = JSON.parse(readFileSync(`${dir}/ledger-preparation.json`, "utf8"));
const c = prep.config;
const db = "3f0a14e18d07b71e0b235dffcdc61e672086d6fb5b32b35849aa8bf54f3be3e4";
function command(bin, args, input) {
  const result = spawnSync(bin, args, { input, encoding: "utf8", timeout: 30000, maxBuffer: 8 * 1024 * 1024 });
  assert.equal(result.status, 0, result.error?.code ?? result.stderr);
  return result.stdout.trim();
}
const inspected = JSON.parse(command("docker", ["inspect", db]))[0];
assert.equal(inspected.Id, db);
assert.equal(inspected.State.Status, "running");
assert.equal(inspected.Config.Labels["com.supabase.cli.workdir"], dir);
const sql = (query) => command("docker", ["exec", "-i", db, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], query);
assert.equal(sql(`select local_commerce.verify_project_identity('${project}','${prep.markerDigest}');`), "t");
const manifest = JSON.parse(readFileSync("local/commerce/migrations/manifest.json", "utf8"));
assert.equal(manifest.schemaVersion, 30);
assert.equal(sql("select count(*) from local_commerce.migration_ledger;"), "30");
const info = JSON.parse(command("node_modules/.bin/supabase", ["status", "--workdir", dir, "-o", "json"]));
const env = {
  ...process.env,
  ...catalogTestEnvironment({
    LOCAL_COMMERCE_RUN_ID: run, LOCAL_COMMERCE_PROJECT_ID: project,
    LOCAL_COMMERCE_MARKER_DIGEST: prep.markerDigest,
    LOCAL_COMMERCE_SERVICE_ROLE_KEY: info.SERVICE_ROLE_KEY,
    CUSTOMER_AUTH_SOURCE: "local_persistent", CART_SOURCE: "local_persistent",
    PHOTOGIFT_PRODUCT_SOURCE: "local_persistent", LOCAL_CHECKOUT_SOURCE: "local_persistent",
    CUSTOMER_UPLOAD_SOURCE: "local_persistent", LOCAL_ORDER_SOURCE: "local_persistent",
    LOCAL_PAYMENT_SOURCE: "local_persistent", LOCAL_FULFILLMENT_SOURCE: "local_persistent",
    LOCAL_TRACKING_SOURCE: "local_persistent", LOCAL_FULFILLMENT_OPERATOR: "enabled",
    LOCAL_TRACKING_OPERATOR: "enabled", ADMIN_ACCEPTANCE_SOURCE: "local_persistent",
    LOCAL_ORDER_CAPABILITY_SECRET: randomBytes(32).toString("hex"),
    PHOTOGIFT_GUEST_DRAFT_OWNER_SECRET: randomBytes(48).toString("base64url"),
  }),
  CLOUDFLARE_INCLUDE_PROCESS_ENV: "true", WRANGLER_SEND_METRICS: "false",
  WRANGLER_WRITE_LOGS: "false", NODE_OPTIONS: "", LOCAL_COMMERCE_ACCEPTANCE_DISABLE_INSPECTOR: "true",
};
for (const [key, value] of Object.entries({ SHADOW_DB: c.ports.shadowDb, API: c.ports.api, DB: c.ports.db, STUDIO: c.ports.studio, SMTP: c.ports.smtp, IMAGE_HELPER: c.ports.imageHelper })) env[`LOCAL_COMMERCE_${key}_PORT`] = String(value);
for (const [key, value] of Object.entries({ API: c.endpoints.apiUrl, RPC: c.endpoints.rpcUrl, STORAGE: c.endpoints.storageUrl, IMAGE_HELPER: c.endpoints.imageHelperUrl })) env[`LOCAL_COMMERCE_${key}_URL`] = value;
const port = await new Promise((resolve, reject) => {
  const server = createServer(); server.once("error", reject);
  server.listen(0, "127.0.0.1", () => { const address = server.address(); assert.equal(typeof address, "object"); server.close(() => resolve(address.port)); });
});
const origin = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ["tests/database/local-commerce-test-worker.mjs", run, "--confirm-disposable", String(port)], { env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
let logs = "";
for (const stream of [child.stdout, child.stderr]) stream.on("data", (bytes) => { logs = (logs + bytes).slice(-16000); });
async function stop() {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const done = new Promise((resolve) => child.once("exit", resolve)); process.kill(-child.pid, "SIGTERM");
  await Promise.race([done, new Promise((resolve) => setTimeout(resolve, 5000))]);
  if (child.exitCode === null && child.signalCode === null) { process.kill(-child.pid, "SIGKILL"); await done; }
}
try {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    assert.equal(child.exitCode, null, logs);
    try { const r = await fetch(`${origin}/api/customer-auth/session`, { signal: AbortSignal.timeout(2000) }); await r.arrayBuffer(); if (r.status === 200) break; } catch { /* bounded */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (attempt === 59) assert.fail(logs);
  }
  const normalized = await fetch(`${origin}/api/orders`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ email: "legacy@example.invalid", items: [{ productId: randomUUID(), variantId: randomUUID(), skuCode: "LEGACY-STOP", selectedOptions: [], quantity: 1, configurationRevision: "1", customizationValues: [] }] }) });
  assert.equal(normalized.status, 503, await normalized.clone().text());
  const lookup = await fetch(`${origin}/api/order-lookup`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ orderNumber: "FM-LOCAL-1234567890ABCDEF", email: "legacy@example.invalid" }) });
  assert.equal(lookup.status, 400, await lookup.clone().text());
  const supplier = await fetch(`${origin}/api/local-suppliers/operator`, { headers: { origin, "sec-fetch-site": "same-origin" } });
  assert.equal(supplier.status, 503, await supplier.clone().text());
  assert.equal((await fetch(`${origin}/api/download/FM-LOCAL-1234567890ABCDEF`)).status, 404);
  const oldAdmin = await fetch(`${origin}/api/admin/orders`, { method: "PATCH", headers: { origin, "content-type": "application/json" }, body: "{}" });
  assert.ok([401, 403].includes(oldAdmin.status), `${oldAdmin.status}: ${await oldAdmin.text()}`);
  console.info(JSON.stringify({ status: "PASS", task: "8.7-legacy", run, project, ledger: 30, workerPid: child.pid, normalizedOrders503: true, emailLookupCannotSelectLocalOrder: true, oldDownloadCannotReachPersistentData: true, supplierPersistentUnsupported: true, legacyAdminMutationBlocked: true }));
} finally { await stop(); }
