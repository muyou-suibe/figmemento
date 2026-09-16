import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

import { catalogTestEnvironment } from "../fixtures/local-persistent-catalog.mjs";

const run = process.argv.find((value) => /^run-[a-f0-9]{8}$/.test(value));
assert.ok(run);
assert.ok(process.argv.includes("--confirm-disposable"));
const projectId = `figmemento-local-commerce-test-${run}`;
const root = path.resolve(".");
const workdir = path.join(root, "local/commerce/runtime/disposable", run);
const preparation = JSON.parse(readFileSync(path.join(workdir, "ledger-preparation.json"), "utf8"));
const databaseId = process.env.TASK_11_4_VERIFIED_DB_CONTAINER_ID;
const serviceRoleKey = process.env.LOCAL_COMMERCE_SERVICE_ROLE_KEY;
assert.match(databaseId ?? "", /^[a-f0-9]{64}$/);
assert.ok(serviceRoleKey);
assert.equal(process.env.TASK_11_4_EQUIVALENT_IDENTITY_VERIFIED, "1");
assert.equal(preparation.config.projectId, projectId);
assert.equal(preparation.config.projectKind, "disposable_test");
assert.equal(preparation.config.environment, "test");
assert.equal(preparation.config.postgresMajorVersion, 17);

function command(binary, args, input, timeout = 15_000) {
  const result = spawnSync(binary, args, { cwd: root, input, encoding: "utf8", timeout, maxBuffer: 8 * 1024 * 1024 });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr || "command failed");
  return result.stdout.trim();
}

function failingCommand(binary, args, input, timeout = 15_000) {
  const result = spawnSync(binary, args, { cwd: root, input, encoding: "utf8", timeout, maxBuffer: 8 * 1024 * 1024 });
  assert.equal(result.error, undefined);
  assert.notEqual(result.status, 0, "injected transaction unexpectedly committed");
  return result.stderr;
}

const sql = (query) => command("docker", ["exec", "-i", databaseId, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], query);
assert.equal(sql("select current_setting('server_version_num')::integer / 10000;"), "17");
assert.equal(sql(`select local_commerce.verify_project_identity('${projectId}','${preparation.markerDigest}');`), "t");
assert.equal(sql("select count(*) from local_commerce.migration_ledger;"), "37");

const snapshot = () => sql(`select jsonb_build_object(
  'customers',(select count(*) from local_commerce.customer_accounts where project_id='${projectId}'),
  'sessions',(select count(*) from local_commerce.customer_sessions where project_id='${projectId}'),
  'carts',(select count(*) from local_commerce.carts where project_id='${projectId}'),
  'orders',(select count(*) from local_commerce.orders where project_id='${projectId}'),
  'payments',(select count(*) from local_commerce.payment_attempts where project_id='${projectId}')
)::text;`);

async function reservePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      assert.ok(address && typeof address !== "string");
      server.close(() => resolve(address.port));
    });
  });
}

const appPort = await reservePort();
const unavailablePort = await reservePort();
const origin = `http://127.0.0.1:${appPort}`;
const unavailableOrigin = `http://127.0.0.1:${unavailablePort}`;
const secret = randomBytes(48).toString("base64url");
const environment = {
  ...process.env,
  ...catalogTestEnvironment({
    LOCAL_COMMERCE_RUN_ID: run,
    LOCAL_COMMERCE_PROJECT_ID: projectId,
    LOCAL_COMMERCE_MARKER_DIGEST: preparation.markerDigest,
    LOCAL_COMMERCE_SERVICE_ROLE_KEY: serviceRoleKey,
    LOCAL_COMMERCE_API_PORT: String(unavailablePort),
    LOCAL_COMMERCE_API_URL: unavailableOrigin,
    LOCAL_COMMERCE_RPC_URL: unavailableOrigin,
    LOCAL_COMMERCE_STORAGE_URL: `${unavailableOrigin}/storage/v1`,
    CUSTOMER_AUTH_SOURCE: "local_persistent",
    CART_SOURCE: "local_persistent",
    PHOTOGIFT_PRODUCT_SOURCE: "local_persistent",
    CUSTOMER_UPLOAD_SOURCE: "local_persistent",
    LOCAL_CHECKOUT_SOURCE: "local_persistent",
    LOCAL_ORDER_SOURCE: "local_persistent",
    LOCAL_PAYMENT_SOURCE: "local_persistent",
    LOCAL_FULFILLMENT_SOURCE: "local_persistent",
    LOCAL_TRACKING_SOURCE: "local_persistent",
    ADMIN_ACCEPTANCE_SOURCE: "local_persistent",
    PHOTOGIFT_GUEST_DRAFT_OWNER_SECRET: secret,
    PHOTOGIFT_GUEST_DRAFT_OWNER_CONTEXT_TTL_SECONDS: "3600",
    LOCAL_ORDER_CAPABILITY_SECRET: randomBytes(32).toString("hex"),
    LOCAL_ORDER_CAPABILITY_TTL_SECONDS: "3600",
  }),
  CLOUDFLARE_INCLUDE_PROCESS_ENV: "true",
  WRANGLER_SEND_METRICS: "false",
  WRANGLER_WRITE_LOGS: "false",
  LOCAL_COMMERCE_ACCEPTANCE_DISABLE_INSPECTOR: "true",
  NODE_OPTIONS: "",
};

const before = snapshot();
const ownerId = randomUUID();
const orderId = randomUUID();
const paymentId = randomUUID();
const receiptId = randomUUID();
const transactionFailure = failingCommand("docker", ["exec", "-i", databaseId, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], `begin;
  insert into local_commerce.commerce_owners(project_id,id,owner_kind,subject_hash)
    values('${projectId}','${ownerId}','guest','${"a".repeat(64)}');
  insert into local_commerce.orders(project_id,id,owner_id,public_reference)
    values('${projectId}','${orderId}','${ownerId}','FM-LOCAL-${randomBytes(8).toString("hex").toUpperCase()}');
  insert into local_commerce.payment_attempts(project_id,id,order_id,owner_id,action_key,amount_cents,currency)
    values('${projectId}','${paymentId}','${orderId}','${ownerId}','task-11-5-rollback',1,'USD');
  insert into local_commerce.media_receipts(project_id,id,owner_id,media_object_id,product_id,field_key,expires_at)
    values('${projectId}','${receiptId}','${ownerId}','${randomUUID()}','${randomUUID()}','task-11-5',now()+interval '1 day');
  commit;`);
assert.match(transactionFailure, /foreign key/i);
assert.equal(snapshot(), before, "injected foreign-key failure left partial transaction state");
let output = "";
const worker = spawn(process.execPath, ["tests/database/local-commerce-test-worker.mjs", run, "--confirm-disposable", String(appPort)], {
  cwd: root,
  env: environment,
  detached: true,
  stdio: ["ignore", "pipe", "pipe"],
});
for (const stream of [worker.stdout, worker.stderr]) stream.on("data", (bytes) => { output = (output + bytes).slice(-20_000); });

async function stop() {
  if (worker.exitCode !== null || worker.signalCode !== null) return;
  const exited = new Promise((resolve) => worker.once("exit", resolve));
  process.kill(-worker.pid, "SIGTERM");
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 5_000))]);
  assert.ok(worker.exitCode !== null || worker.signalCode !== null, "outage Worker did not terminate normally");
}

try {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    assert.equal(worker.exitCode, null, output);
    try {
      const response = await fetch(`${origin}/api/customer-auth/session`, { signal: AbortSignal.timeout(1_000) });
      await response.arrayBuffer();
      if (response.status === 200) break;
    } catch {
      if (attempt === 59) assert.fail(`Worker readiness blocked: ${output}`);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  const signup = await fetch(`${origin}/api/customer-auth/sign-up`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ email: `task-11-5-outage-${randomUUID()}@example.invalid`, password: "Synthetic-outage-password-42!" }),
    signal: AbortSignal.timeout(10_000),
  });
  const signupBody = await signup.text();
  assert.equal(signup.status, 503);
  assert.doesNotMatch(signupBody, /postgres|supabase|service.?role|marker|ECONN|fetch failed|SQL|127\.0\.0\.1/i);

  const cart = await fetch(`${origin}/api/cart`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ handoff: {
      productId: "11400000-0000-4000-8000-000000000002",
      variantId: "11400000-0000-4000-8000-000000000003",
      skuCode: "TASK-11-4-DIGITAL-001",
      selectedOptions: [{ optionId: "11400000-0000-4000-8000-000000000004", valueId: "11400000-0000-4000-8000-000000000005" }],
      configurationRevision: "1",
      customizationValues: [],
    } }),
    signal: AbortSignal.timeout(10_000),
  });
  const cartBody = await cart.text();
  assert.equal(cart.status, 503);
  assert.doesNotMatch(cartBody, /postgres|supabase|service.?role|marker|ECONN|fetch failed|SQL|127\.0\.0\.1/i);
  assert.equal(snapshot(), before, "unavailable database produced partial persistent state");
  assert.doesNotMatch(output, new RegExp(serviceRoleKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  console.info(JSON.stringify({ status: "PASS", task: "11.5", case: "database-outage",
    run, projectId, workerPid: worker.pid, unavailableEndpoint: "loopback closed port (redacted)",
    signupStatus: signup.status, cartStatus: cart.status, transactionRollback: true, persistentSnapshotUnchanged: true,
    fakeFallback: false, credentialLeak: false }));
} finally {
  await stop();
}
