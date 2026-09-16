import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";
import { LocalCatalogAuthority } from "../../app/infrastructure/local-commerce/local-catalog-authority.server.ts";
import { catalogTestEnvironment } from "../fixtures/local-persistent-catalog.mjs";

assert.ok([
  JSON.stringify(["run-93f6c1a2", "--confirm-disposable"]),
  JSON.stringify(["run-93f6c1a2", "--confirm-disposable", "--preview-only"]),
  JSON.stringify(["run-93f6c1a2", "--confirm-disposable", "--task-11.5-db-outage"]),
  JSON.stringify(["run-93f6c1a2", "--confirm-disposable", "--task-11.5-cleanup"]),
  JSON.stringify(["run-93f6c1a2", "--confirm-disposable", "--task-11.6-security"]),
].includes(JSON.stringify(process.argv.slice(2))));
const run = "run-93f6c1a2";
const projectId = `figmemento-local-commerce-test-${run}`;
const projectedProjectLabel = projectId.slice(0, 40);
const root = path.resolve(".");
const workdir = path.join(root, "local/commerce/runtime/disposable", run);
const socket = path.join(process.env.HOME, ".docker/run/docker.sock");
const marker = JSON.parse(readFileSync(path.join(workdir, "project-marker.json"), "utf8"));
const preparation = JSON.parse(readFileSync(path.join(workdir, "ledger-preparation.json"), "utf8"));
const manifest = JSON.parse(readFileSync("local/commerce/migrations/manifest.json", "utf8"));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
assert.equal(preparation.config.projectId, projectId);
assert.equal(preparation.markerDigest, sha256(JSON.stringify(marker)));
assert.equal(projectId.length, 43);
assert.equal(projectedProjectLabel, "figmemento-local-commerce-test-run-93f6c");
assert.equal(projectedProjectLabel.length, 40);
assert.equal(manifest.schemaVersion, 37);
assert.equal(manifest.migrations.length, 37);
for (const entry of manifest.migrations) {
  assert.equal(sha256(readFileSync(path.join("local/commerce/migrations", entry.filename))), entry.checksum);
}

function engine(pathname, timeout = 30_000) {
  const result = spawnSync("curl", ["--silent", "--show-error", "--max-time", String(timeout / 1000),
    "--unix-socket", socket, `http://localhost${pathname}`], { encoding: "utf8", timeout, maxBuffer: 32 * 1024 * 1024 });
  if (result.error || result.status !== 0) return null;
  return JSON.parse(result.stdout);
}

const all = engine("/containers/json?all=0", 30_000);
assert.ok(Array.isArray(all), "direct Engine inventory unavailable");
const exact = all.filter((item) => {
  const labels = item.Labels ?? {};
  return labels["com.supabase.cli.project"] === projectedProjectLabel
    && labels["com.supabase.cli.project"] === projectId.slice(0, 40)
    && labels["com.supabase.cli.project"].length === 40
    && labels["com.supabase.cli.workdir"] === workdir
    && (!labels["com.docker.compose.project"]
      || labels["com.docker.compose.project"] === projectedProjectLabel)
    && item.State === "running";
});
const byService = (name) => exact.filter((item) => {
  const composeService = item.Labels?.["com.docker.compose.service"];
  if (composeService) return composeService === name;
  return item.Names?.some((value) => value === `/supabase_${name}_${projectedProjectLabel}`);
});
for (const service of ["db", "rest", "kong", "auth", "storage"]) assert.equal(byService(service).length, 1, `${service} identity`);
const database = byService("db")[0];
assert.match(database.Image, /postgres:17\./);
assert.ok(database.Ports?.some((item) => item.PublicPort === preparation.config.ports.db));
assert.ok(byService("kong")[0].Ports?.some((item) => item.PublicPort === preparation.config.ports.api));

function serviceKeyFrom(container, names) {
  const detail = engine(`/containers/${container.Id}/json`, 30_000);
  const labels = detail?.Config?.Labels ?? {};
  if (!detail || labels["com.supabase.cli.project"] !== projectedProjectLabel
    || labels["com.supabase.cli.project"] !== projectId.slice(0, 40)
    || labels["com.supabase.cli.project"].length !== 40
    || labels["com.supabase.cli.workdir"] !== workdir
    || (labels["com.docker.compose.project"] && labels["com.docker.compose.project"] !== projectedProjectLabel)
    || detail.State?.Running !== true) return null;
  for (const entry of detail.Config?.Env ?? []) {
    const at = entry.indexOf("=");
    if (at > 0 && names.includes(entry.slice(0, at))) return entry.slice(at + 1);
  }
  return null;
}

let serviceKey = serviceKeyFrom(byService("kong")[0], ["SUPABASE_SERVICE_KEY", "SUPABASE_SERVICE_ROLE_KEY"]);
let credentialSource = "kong";
if (!serviceKey) {
  serviceKey = serviceKeyFrom(byService("storage")[0], ["SERVICE_KEY", "SUPABASE_SERVICE_KEY", "SUPABASE_SERVICE_ROLE_KEY"]);
  credentialSource = "storage";
}
assert.ok(serviceKey, "exact-run service credential unavailable");
const base = preparation.config.endpoints.apiUrl;
const serviceHeaders = { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, "accept-profile": "local_commerce" };
async function get(route) {
  const response = await fetch(`${base}/rest/v1/${route}`, { headers: serviceHeaders, signal: AbortSignal.timeout(10_000) });
  assert.equal(response.status, 200, route);
  return response.json();
}
async function identity(project) {
  const response = await fetch(`${base}/rest/v1/rpc/verify_project_identity`, { method: "POST",
    headers: { ...serviceHeaders, "content-type": "application/json", "content-profile": "local_commerce" },
    body: JSON.stringify({ p_project_id: project, p_marker_digest: preparation.markerDigest }), signal: AbortSignal.timeout(10_000) });
  assert.equal(response.status, 200);
  return response.json();
}
assert.equal(await identity(projectId), true);
assert.equal(await identity("figmemento-local-commerce-test-run-00000000"), false);
const identities = await get(`project_identities?project_id=eq.${projectId}&select=project_id,environment,project_kind,schema_version,marker_digest,lifecycle`);
assert.deepEqual(identities, [{ project_id: projectId, environment: "test", project_kind: "disposable_test",
  schema_version: 37, marker_digest: preparation.markerDigest, lifecycle: "active" }]);
const ledger = await get("migration_ledger?select=version,migration_id,checksum,project_id&order=version.asc");
assert.equal(ledger.length, 37);
for (let index = 0; index < ledger.length; index += 1) {
  assert.deepEqual(ledger[index], { version: index + 1, migration_id: manifest.migrations[index].migrationId,
    checksum: manifest.migrations[index].checksum, project_id: projectId });
}

const storage = createClient(base, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const probe = `${projectId}/probes/task-11-4-${randomUUID()}.bin`;
const probeBytes = new TextEncoder().encode("task-11-4-private-storage-authority");
const anonymous = await fetch(`${base}/storage/v1/object/local-commerce-private/${probe}`, { method: "POST",
  headers: { "content-type": "application/octet-stream" }, body: probeBytes, signal: AbortSignal.timeout(10_000) });
assert.notEqual(anonymous.status, 200);
let upload;
let readback;
let removed;
try {
  upload = await storage.storage.from("local-commerce-private").upload(probe, probeBytes,
    { contentType: "application/octet-stream", upsert: false });
  assert.equal(upload.error, null);
  readback = await storage.storage.from("local-commerce-private").download(probe);
  assert.equal(readback.error, null);
  assert.equal(sha256(new Uint8Array(await readback.data.arrayBuffer())), sha256(probeBytes));
} finally {
  removed = await storage.storage.from("local-commerce-private").remove([probe]);
}
assert.equal(removed.error, null);

const environment = { ...process.env, ...catalogTestEnvironment({ LOCAL_COMMERCE_RUN_ID: run,
  LOCAL_COMMERCE_PROJECT_ID: projectId, LOCAL_COMMERCE_MARKER_DIGEST: preparation.markerDigest,
  LOCAL_COMMERCE_SERVICE_ROLE_KEY: serviceKey, CUSTOMER_AUTH_SOURCE: "local_persistent", CART_SOURCE: "local_persistent",
  PHOTOGIFT_PRODUCT_SOURCE: "local_persistent", CUSTOMER_UPLOAD_SOURCE: "local_persistent",
  LOCAL_CHECKOUT_SOURCE: "local_persistent", LOCAL_ORDER_SOURCE: "local_persistent", LOCAL_PAYMENT_SOURCE: "local_persistent",
  LOCAL_FULFILLMENT_SOURCE: "local_persistent", LOCAL_TRACKING_SOURCE: "local_persistent" }) };
for (const [name, value] of Object.entries({ SHADOW_DB: preparation.config.ports.shadowDb, API: preparation.config.ports.api,
  DB: preparation.config.ports.db, STUDIO: preparation.config.ports.studio, SMTP: preparation.config.ports.smtp })) {
  environment[`LOCAL_COMMERCE_${name}_PORT`] = String(value);
}
for (const [name, value] of Object.entries({ API: preparation.config.endpoints.apiUrl, RPC: preparation.config.endpoints.rpcUrl,
  STORAGE: preparation.config.endpoints.storageUrl })) environment[`LOCAL_COMMERCE_${name}_URL`] = value;
const catalog = new LocalCatalogAuthority(environment);
const snapshot = await catalog.readSnapshot();
assert.equal(snapshot.status, "found");
const fixture = (id) => ({ product: snapshot.value.dataSet.products.find((item) => item.id === id),
  variant: snapshot.value.dataSet.variants.find((item) => item.productId === id),
  fulfillment: snapshot.value.dataSet.fulfillmentConfigs.find((item) => item.productId === id),
  purchase: snapshot.value.purchasedFulfillments[id] });
const digital = fixture("11400000-0000-4000-8000-000000000002");
const image = fixture("11600000-0000-4000-8000-000000000002");
const configuration = await catalog.getCustomizationFieldsForProduct("11600000-0000-4000-8000-000000000002");
assert.equal(digital.variant?.skuCode, "TASK-11-4-DIGITAL-001");
assert.deepEqual([digital.fulfillment?.fulfillmentType, digital.fulfillment?.requiresShipping,
  digital.fulfillment?.productionMode, digital.purchase?.requiresProductionPreview], ["digital", false, "digital_creation", false]);
assert.equal(image.variant?.skuCode, "TASK-11-4-IMAGE-001");
assert.deepEqual([image.fulfillment?.fulfillmentType, image.fulfillment?.requiresShipping,
  image.fulfillment?.productionMode, image.purchase?.requiresProductionPreview], ["physical", true, "custom_manufacturing", false]);
assert.equal(configuration.status, "found");
const field = configuration.value.fields.find((item) => item.id === "11600000-0000-4000-8000-000000000008");
assert.deepEqual([field?.kind, field?.required], ["image", true]);

console.info(JSON.stringify({ status: "AUTHORITY_PASS", run, projectId, credentialSource, serviceKeyReported: false,
  services: exact.map((item) => ({ id: item.Id.slice(0, 12), name: item.Names[0], image: item.Image, status: item.Status })),
  postgresEvidence: { image: database.Image, preparedMajor: preparation.config.postgresMajorVersion, freshSqlCurrentSetting: false },
  ledger: { rows: ledger.length, versions: [ledger[0].version, ledger.at(-1).version], exact: true, pending: 0 },
  rpc: { exact: true, wrong: false }, storage: { anonymousDenied: true, serviceWriteReadDelete: true },
  fixtures: { digital: true, image: true } }));

const serviceKeyForRedaction = serviceKey;
const redact = (value) => String(value ?? "").split(serviceKeyForRedaction).join("[redacted]").replace(/eyJ[A-Za-z0-9_.-]+/g, "[redacted]");
const childEnvironment = { ...process.env, LOCAL_COMMERCE_SERVICE_ROLE_KEY: serviceKey,
  TASK_11_4_VERIFIED_DB_CONTAINER_ID: database.Id, TASK_11_4_EQUIVALENT_IDENTITY_VERIFIED: "1" };
function runAcceptance(file, timeout, extraArguments = []) {
  const child = spawnSync(process.execPath, ["--experimental-strip-types", file, run, "--confirm-disposable", ...extraArguments],
    { cwd: root, encoding: "utf8", timeout, maxBuffer: 32 * 1024 * 1024, env: childEnvironment });
  if (child.stdout) process.stdout.write(redact(child.stdout));
  if (child.stderr) process.stderr.write(redact(child.stderr));
  assert.equal(child.error, undefined, `${file} bounded execution failed`);
  assert.equal(child.status, 0, `${file} failed`);
}
if (process.argv.includes("--task-11.5-db-outage")) {
  runAcceptance("tests/database/local-commerce-task-11.5-db-outage.mjs", 120_000);
  serviceKey = "";
  process.exit(0);
}
if (process.argv.includes("--task-11.5-cleanup")) {
  runAcceptance("tests/database/local-commerce-order-http-acceptance.mjs", 360_000,
    ["--copy", "--cleanup", "--task-11.5-cleanup"]);
  serviceKey = "";
  process.exit(0);
}
if (process.argv.includes("--task-11.6-security")) {
  const jwtSecret = serviceKeyFrom(byService("auth")[0], ["GOTRUE_JWT_SECRET", "JWT_SECRET"]);
  assert.ok(jwtSecret, "exact-run browser-role acceptance JWT authority unavailable");
  childEnvironment.LOCAL_COMMERCE_ACCEPTANCE_JWT_SECRET = jwtSecret;
  runAcceptance("tests/database/local-commerce-task-11.6-security-matrix.mjs", 300_000);
  serviceKey = "";
  process.exit(0);
}
runAcceptance("tests/database/local-commerce-task-11.4-preview-catalog-setup.mjs", 240_000);
if (!process.argv.includes("--preview-only")) {
  runAcceptance("tests/database/local-commerce-task-11.4-copy-race.mjs", 240_000);
}
runAcceptance("tests/database/local-commerce-customer-preview-http-acceptance.mjs", 600_000);
serviceKey = "";
