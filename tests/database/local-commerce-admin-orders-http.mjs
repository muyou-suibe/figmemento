import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:net";
import { spawn, spawnSync } from "node:child_process";
import { createSignedAdminSession } from "../../app/application/admin-session.ts";
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
const ledger = JSON.parse(sql("select json_agg(json_build_object('version',version,'checksum',checksum) order by version) from local_commerce.migration_ledger;"));
assert.ok(manifest.schemaVersion >= 27);
assert.equal(ledger.length, manifest.schemaVersion);
manifest.migrations.forEach((migration, index) => {
  assert.equal(ledger[index].version, migration.version);
  assert.equal(ledger[index].checksum, migration.checksum);
  assert.equal(createHash("sha256").update(readFileSync(`local/commerce/migrations/${migration.filename}`)).digest("hex"), migration.checksum);
});
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
const port = config.ports.imageHelper + 8;
await new Promise((resolve, reject) => { const server = createServer(); server.once("error", reject); server.listen(port, "127.0.0.1", () => server.close(resolve)); });
const origin = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ["tests/database/local-commerce-test-worker.mjs", run, "--confirm-disposable", String(port)], { env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
let logs = "";
for (const stream of [child.stdout, child.stderr]) stream.on("data", (chunk) => { logs = (logs + chunk).slice(-16000); });
async function stop() {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const done = new Promise((resolve) => child.once("exit", resolve));
  process.kill(-child.pid, "SIGTERM");
  await Promise.race([done, new Promise((resolve) => setTimeout(resolve, 5000))]);
  if (child.exitCode === null && child.signalCode === null) { process.kill(-child.pid, "SIGKILL"); await done; }
}
async function ready() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    assert.equal(child.exitCode, null, logs);
    try { const response = await fetch(`${origin}/api/customer-auth/session`, { signal: AbortSignal.timeout(2000) }); await response.arrayBuffer(); if (response.status === 200) return; } catch { /* bounded readiness */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.fail(`Worker readiness blocked: ${logs}`);
}
function cookiesFrom(response) {
  return response.headers.getSetCookie().map((value) => value.split(";", 1)[0]).join("; ");
}
try {
  await ready();
  const missing = await fetch(`${origin}/admin/orders`, { redirect: "manual" });
  assert.ok([302, 303, 307, 308].includes(missing.status));
  const invalid = await fetch(`${origin}/admin/orders`, { headers: { cookie: "photogift-admin-session=invalid.signature" }, redirect: "manual" });
  assert.ok([302, 303, 307, 308].includes(invalid.status));
  const expiredToken = await createSignedAdminSession(adminPassword, Math.floor(Date.now() / 1000) - 604801);
  const expired = await fetch(`${origin}/admin/orders`, { headers: { cookie: `photogift-admin-session=${expiredToken}` }, redirect: "manual" });
  assert.ok([302, 303, 307, 308].includes(expired.status));
  const login = await fetch(`${origin}/api/admin/login`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ password: adminPassword }) });
  assert.equal(login.status, 200);
  const cookie = cookiesFrom(login);
  assert.match(cookie, /photogift-admin-session=/);
  const page = await fetch(`${origin}/admin/orders?source=production&backend=memory`, { headers: { cookie }, signal: AbortSignal.timeout(20000) });
  assert.equal(page.status, 200, logs);
  const html = await page.text();
  assert.match(html, /LOCAL \/ TEST PERSISTENT COMMERCE/);
  assert.match(html, /FM-LOCAL-[A-Z0-9]{16}/);
  assert.match(html, /canonical local commerce Orders and immutable purchase facts/);
  assert.doesNotMatch(html, new RegExp(info.SERVICE_ROLE_KEY.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(html, /session_hash|capability_hash|password_hash|object_locator|service_role_key|signed_url/i);
  const crossSite = await fetch(`${origin}/api/local-fulfillment/admin/FM-LOCAL-1234567890ABCDEF/timeout`, {
    method: "POST",
    headers: { cookie, origin: "https://evil.example", "content-type": "application/json", "sec-fetch-site": "cross-site" },
    body: JSON.stringify({}),
  });
  assert.equal(crossSite.status, 403);
  console.info(JSON.stringify({ status: "PASS", task: "8.2", run, project, ledger: manifest.schemaVersion, pending: 0, workerPid: child.pid, signedAdmin: true, missingInvalidExpiredRejected: true, browserSourceIgnored: true, safePersistentProjection: true, sameOriginMutationGate: true, secretLeakage: false }));
} finally {
  await stop();
}
