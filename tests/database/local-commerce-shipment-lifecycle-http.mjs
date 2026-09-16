// Task 8.5 retained-run acceptance: two actual Workers, durable Shipment
// lifecycle commands, restart replay, concurrency and rollback-only faults.
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
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
assert.ok(manifest.schemaVersion >= 29);
const ledger = JSON.parse(sql("select json_agg(json_build_object('version',version,'checksum',checksum) order by version) from local_commerce.migration_ledger;"));
assert.equal(ledger.length, manifest.schemaVersion);
manifest.migrations.forEach((migration, index) => {
  assert.equal(ledger[index].version, migration.version);
  assert.equal(ledger[index].checksum, migration.checksum);
  assert.equal(createHash("sha256").update(readFileSync(`local/commerce/migrations/${migration.filename}`)).digest("hex"), migration.checksum);
});

const info = JSON.parse(command("node_modules/.bin/supabase", ["status", "--workdir", dir, "-o", "json"]));
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

const ports = [c.ports.imageHelper + 30, c.ports.imageHelper + 31];
const origins = ports.map((port) => `http://127.0.0.1:${port}`);
for (const port of ports) await new Promise((resolve, reject) => {
  const server = createServer();
  server.once("error", reject);
  server.listen(port, "127.0.0.1", () => server.close(resolve));
});
let logs = "";
function start(index) {
  const child = spawn(process.execPath, ["tests/database/local-commerce-test-worker.mjs", run, "--confirm-disposable", String(ports[index])], {
    env, detached: true, stdio: ["ignore", "pipe", "pipe"],
  });
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
const action = (trackingActionId, actionKind, expectedShipmentVersion) => ({ trackingActionId, actionKind, expectedShipmentVersion });
const send = (index, reference, body) => fetch(`${origins[index]}/api/local-tracking/operator/${reference}`, {
  method: "POST",
  headers: { origin: origins[index], "Content-Type": "application/json" },
  body: JSON.stringify(body),
  signal: AbortSignal.timeout(20000),
});
const upstream = (reference) => sql(`select md5(coalesce(string_agg(v::text,',' order by v::text),'')) from (
  select to_jsonb(s) v from local_commerce.order_purchase_snapshots s join local_commerce.orders o on o.id=s.order_id and o.project_id=s.project_id where o.public_reference='${reference}'
  union all select to_jsonb(s) from local_commerce.order_item_purchase_snapshots s join local_commerce.order_items i on i.id=s.order_item_id and i.project_id=s.project_id join local_commerce.orders o on o.id=i.order_id and o.project_id=i.project_id where o.public_reference='${reference}'
  union all select to_jsonb(p) from local_commerce.payment_attempts p join local_commerce.orders o on o.id=p.order_id and o.project_id=p.project_id where o.public_reference='${reference}'
  union all select to_jsonb(f) from local_commerce.fulfillments f join local_commerce.orders o on o.id=f.order_id and o.project_id=f.project_id where o.public_reference='${reference}'
) q;`);
const state = (reference) => JSON.parse(sql(`select json_build_object('status',s.tracking_lifecycle,'version',s.version,'lifecycle',s.lifecycle,'shippedAt',s.shipped_at,'inTransitAt',s.in_transit_at,'deliveredAt',s.delivered_at,'events',(select json_agg(e.event_type order by e.version) from local_commerce.shipment_events e where e.project_id=s.project_id and e.shipment_id=s.id),'actions',(select count(*) from local_commerce.shipment_actions a where a.project_id=s.project_id and a.shipment_id=s.id)) from local_commerce.shipments s join local_commerce.orders o on o.project_id=s.project_id and o.id=s.order_id where o.public_reference='${reference}';`));

const report = { status: "BLOCKED", task: "8.5", run, project, ledger: manifest.schemaVersion, results: [], races: [], restarts: [] };
let first;
let second;
try {
  first = start(0);
  second = start(1);
  await ready(first, 0);
  await ready(second, 1);

  const lifecycleReference = "FM-LOCAL-E8CEAEF244F54A46";
  const before = upstream(lifecycleReference);
  const shippedAction = action("shipment-lifecycle-shipped-0001", "mark_shipped", 1);
  let response = await send(0, lifecycleReference, shippedAction);
  assert.equal(response.status, 200, await response.clone().text());
  const shipped = await response.json();
  assert.ok(["committed", "replayed"].includes(shipped.status));
  assert.equal(shipped.shipment.status, "shipped");
  assert.equal(shipped.version, 2);

  response = await send(0, lifecycleReference, action("shipment-lifecycle-transit-0001", "mark_in_transit", 2));
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal((await response.json()).shipment.status, "in_transit");
  response = await send(0, lifecycleReference, action("shipment-lifecycle-delivered-0001", "mark_delivered", 3));
  assert.equal(response.status, 200, await response.clone().text());
  const delivered = await response.json();
  assert.equal(delivered.shipment.status, "delivered");
  assert.equal(delivered.version, 4);
  assert.deepEqual(delivered.shipment.events.map((event) => event.status), ["shipment_created", "shipped", "in_transit", "delivered"]);
  assert.ok(Date.parse(delivered.shipment.createdAt) <= Date.parse(delivered.shipment.shippedAt));
  assert.ok(Date.parse(delivered.shipment.shippedAt) <= Date.parse(delivered.shipment.inTransitAt));
  assert.ok(Date.parse(delivered.shipment.inTransitAt) <= Date.parse(delivered.shipment.deliveredAt));
  assert.equal(upstream(lifecycleReference), before);

  const firstPid = first.pid;
  await stop(first);
  first = start(0);
  await ready(first, 0);
  response = await send(0, lifecycleReference, shippedAction);
  assert.equal(response.status, 200, await response.clone().text());
  const oldReplay = await response.json();
  assert.equal(oldReplay.status, "replayed");
  assert.equal(oldReplay.shipment.status, "shipped");
  assert.equal(oldReplay.version, 2);
  assert.equal(state(lifecycleReference).status, "delivered");
  report.restarts.push({ firstPid, secondPid: first.pid, replayedHistoricalStatus: oldReplay.shipment.status });

  response = await send(0, lifecycleReference, action("shipment-terminal-again-0001", "mark_delivered", 4));
  assert.equal(response.status, 409, await response.clone().text());
  response = await send(0, lifecycleReference, action("shipment-stale-ship-000001", "mark_shipped", 1));
  assert.equal(response.status, 409, await response.clone().text());
  response = await send(0, lifecycleReference, { ...shippedAction, occurredAt: new Date().toISOString() });
  assert.equal(response.status, 400, await response.clone().text());
  report.results.push("exact lifecycle, terminal, stale and browser timestamp rejection");

  const raceReference = "FM-LOCAL-EE5391B165DF49EE";
  const same = action("shipment-race-same-ship-0001", "mark_shipped", 1);
  let responses = await Promise.all([send(0, raceReference, same), send(1, raceReference, same)]);
  assert.deepEqual(responses.map((item) => item.status), [200, 200]);
  let bodies = await Promise.all(responses.map((item) => item.json()));
  assert.deepEqual(new Set(bodies.map((item) => item.shipment.status)), new Set(["shipped"]));

  responses = await Promise.all([
    send(0, raceReference, action("shipment-race-transit-a-0001", "mark_in_transit", 2)),
    send(1, raceReference, action("shipment-race-transit-b-0001", "mark_in_transit", 2)),
  ]);
  assert.equal(responses.filter((item) => item.status === 200).length, 1);
  assert.equal(responses.filter((item) => item.status === 409).length, 1);
  await Promise.all(responses.map((item) => item.arrayBuffer()));

  responses = await Promise.all([
    send(0, raceReference, action("shipment-race-deliver-a-0001", "mark_delivered", 3)),
    send(1, raceReference, action("shipment-race-deliver-b-0001", "mark_delivered", 3)),
  ]);
  assert.equal(responses.filter((item) => item.status === 200).length, 1);
  assert.equal(responses.filter((item) => item.status === 409).length, 1);
  await Promise.all(responses.map((item) => item.arrayBuffer()));
  const raceState = state(raceReference);
  assert.equal(raceState.status, "delivered");
  assert.equal(raceState.version, 4);
  assert.deepEqual(raceState.events, ["shipment_created", "shipped", "in_transit", "delivered"]);
  assert.equal(raceState.actions, 4);
  report.races.push({ pids: [first.pid, second.pid], final: raceState });

  const faultReference = "FM-LOCAL-74EB702B6F894F04";
  for (const [label, table, timing] of [
    ["lifecycle", "shipments", "update"], ["event", "shipment_events", "insert"], ["action/audit", "shipment_actions", "insert"],
  ]) {
    const key = createHash("sha256").update(`shipment-lifecycle-fault-${label}`).digest("hex");
    const result = sql(`begin;
      create function pg_temp.shipment_lifecycle_fault() returns trigger language plpgsql as \$\$begin raise exception 'synthetic ${label} fault'; end;\$\$;
      create trigger shipment_lifecycle_fault after ${timing} on local_commerce.${table} for each row execute function pg_temp.shipment_lifecycle_fault();
      do \$test\$ declare prepared jsonb; committed jsonb; begin
        prepared:=local_commerce.shipment_command('${project}','${prep.markerDigest}','operator','local-tracking-development-operator','${faultReference}','prepare','mark_shipped',1,'${key}',null);
        if prepared->>'status'<>'found' then raise exception 'fault prepare rejected'; end if;
        committed:=local_commerce.shipment_command('${project}','${prep.markerDigest}','operator','local-tracking-development-operator','${faultReference}','commit','mark_shipped',1,'${key}',prepared#>>'{value,contextDigest}');
        if committed->>'status'<>'unavailable' then raise exception 'fault did not fail closed'; end if;
        if (select tracking_lifecycle from local_commerce.shipments s join local_commerce.orders o on o.project_id=s.project_id and o.id=s.order_id where o.public_reference='${faultReference}')<>'shipment_created' then raise exception 'partial lifecycle'; end if;
        if exists(select 1 from local_commerce.shipment_events e join local_commerce.orders o on o.project_id=e.project_id and o.id=e.order_id where o.public_reference='${faultReference}' and e.event_type='shipped') then raise exception 'partial event'; end if;
        if exists(select 1 from local_commerce.shipment_actions a join local_commerce.orders o on o.project_id=a.project_id and o.id=a.order_id where o.public_reference='${faultReference}' and a.action_key='${key}') then raise exception 'partial action'; end if;
      end \$test\$;
      rollback; select 'PASS';`);
    assert.equal(result, "PASS");
    report.results.push(`atomic ${label} rollback`);
  }

  assert.equal(sql("select count(*) from information_schema.tables where table_schema='local_commerce' and table_name like '%supplier%';"), "0");
  assert.equal(sql("select count(*) from local_commerce.digital_delivery_attempts where created_at > (select min(created_at) from local_commerce.shipment_actions where action_kind<>'create_shipment');"), "0");
  report.status = "PASS";
  report.classification = "LOCAL DEVELOPMENT / TEST PERSISTENCE ACCEPTANCE";
  console.info(JSON.stringify(report));
} finally {
  await stop(first);
  await stop(second);
}
