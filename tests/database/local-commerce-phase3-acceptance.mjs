// Phase 3 exact disposable acceptance. No retained/root/remote access.
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { catalogDatabaseRows, catalogTestEnvironment, ids } from "../fixtures/local-persistent-catalog.mjs";
import { ingestLocalPaymentEvidence, processLocalPaymentEvidence } from "../../app/server/local-payment-webhook-inbox.server.ts";
import { quarantineSyntheticShippingRule } from "./local-commerce-shipping-fixture-quarantine.mjs";

const run = process.argv.find(value => /^run-[0-9a-f]{8}$/.test(value));
assert.ok(run && process.argv.includes("--confirm-disposable"));
const dir = `${process.cwd()}/local/commerce/runtime/disposable/${run}`;
const prep = JSON.parse(readFileSync(`${dir}/ledger-preparation.json`, "utf8"));
const project = `figmemento-local-commerce-test-${run}`;
assert.equal(prep.config.projectId, project);
assert.equal(prep.config.postgresMajorVersion, 17);
const manifest = JSON.parse(readFileSync("local/commerce/migrations/manifest.json", "utf8"));
assert.equal(manifest.schemaVersion, 48);
function command(binary, args, input) {
  const result = spawnSync(binary, args, { input, encoding: "utf8", timeout: 20_000, maxBuffer: 4_000_000 });
  assert.equal(result.status, 0, `${binary}: ${result.error?.code ?? "command failed"}`);
  return result.stdout.trim();
}
const dbs = command("docker", ["ps", "--filter", `label=com.supabase.cli.workdir=${dir}`, "--format", "{{.ID}} {{.Names}}"]).split("\n")
  .filter(value => value.includes("supabase_db_")).map(value => value.split(" ")[0]);
assert.equal(dbs.length, 1);
const inspected = JSON.parse(command("docker", ["inspect", dbs[0]]))[0];
assert.equal(inspected.Config.Labels["com.supabase.cli.workdir"], dir);
assert.equal(inspected.State.Status, "running");
const sql = statement => command("docker", ["exec", "-i", dbs[0], "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], statement);
assert.equal(sql("select current_setting('server_version_num')::int/10000;"), "17");
assert.equal(sql(`select local_commerce.verify_project_identity('${project}','${prep.markerDigest}');`), "t");
const ledger = JSON.parse(sql("select json_agg(json_build_object('version',version,'checksum',checksum) order by version) from local_commerce.migration_ledger;"));
assert.equal(ledger.length, 48);
for (const [index, migration] of manifest.migrations.entries()) {
  assert.equal(ledger[index].version, migration.version);
  assert.equal(ledger[index].checksum, migration.checksum);
  assert.equal(createHash("sha256").update(readFileSync(`local/commerce/migrations/${migration.filename}`)).digest("hex"), migration.checksum);
}
const info = JSON.parse(command("node_modules/.bin/supabase", ["status", "--workdir", dir, "-o", "json"]));
assert.equal(info.API_URL, prep.config.endpoints.apiUrl);
const key = info.SECRET_KEY ?? info.SERVICE_ROLE_KEY;
assert.ok(key, "exact local service key required");
const adminPassword = randomBytes(32).toString("hex");
const env = { ...process.env, ...catalogTestEnvironment({
  LOCAL_COMMERCE_RUN_ID: run, LOCAL_COMMERCE_PROJECT_ID: project,
  LOCAL_COMMERCE_MARKER_DIGEST: prep.markerDigest,
  LOCAL_COMMERCE_SERVICE_ROLE_KEY: key,
  LOCAL_COMMERCE_API_URL: prep.config.endpoints.apiUrl,
  LOCAL_COMMERCE_RPC_URL: prep.config.endpoints.rpcUrl,
  LOCAL_COMMERCE_STORAGE_URL: prep.config.endpoints.storageUrl,
  LOCAL_COMMERCE_IMAGE_HELPER_URL: prep.config.endpoints.imageHelperUrl,
  LOCAL_COMMERCE_SHADOW_DB_PORT: String(prep.config.ports.shadowDb),
  LOCAL_COMMERCE_API_PORT: String(prep.config.ports.api),
  LOCAL_COMMERCE_DB_PORT: String(prep.config.ports.db),
  LOCAL_COMMERCE_STUDIO_PORT: String(prep.config.ports.studio),
  LOCAL_COMMERCE_SMTP_PORT: String(prep.config.ports.smtp),
  LOCAL_COMMERCE_IMAGE_HELPER_PORT: String(prep.config.ports.imageHelper),
  ADMIN_ACCEPTANCE_SOURCE: "local_persistent", ADMIN_PASSWORD: adminPassword,
  CART_SOURCE: "local_persistent", CUSTOMER_AUTH_SOURCE: "local_persistent",
  LOCAL_CHECKOUT_SOURCE: "local_persistent", LOCAL_ORDER_SOURCE: "local_persistent",
  CUSTOMER_UPLOAD_SOURCE: "local_persistent", LOCAL_PAYMENT_SOURCE: "local_persistent",
  LOCAL_FULFILLMENT_SOURCE: "local_persistent", LOCAL_TRACKING_SOURCE: "local_persistent",
  LOCAL_COMMERCE_IMAGE_HELPER_SECRET: randomBytes(32).toString("base64url"),
  LOCAL_ORDER_CAPABILITY_SECRET: randomBytes(32).toString("hex"),
  PHOTOGIFT_GUEST_DRAFT_OWNER_SECRET: randomBytes(48).toString("base64url"),
}), CLOUDFLARE_INCLUDE_PROCESS_ENV: "true", WRANGLER_SEND_METRICS: "false",
  WRANGLER_WRITE_LOGS: "false", LOCAL_COMMERCE_ACCEPTANCE_DISABLE_INSPECTOR: "true" };
const keyHeaders = { apikey: key,
  ...(!key.startsWith("sb_secret_") ? { authorization: `Bearer ${key}` } : {}),
  "content-type": "application/json", "content-profile": "local_commerce" };

const originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(input);
  assert.ok([prep.config.endpoints.apiUrl, "http://127.0.0.1:58627", "http://127.0.0.1:58628",
    "http://127.0.0.1:58629"].includes(url.origin), "exact loopback endpoints only");
  return originalFetch(input, init);
};
const ports = [58627, 58628, 58629];
const workers = [];
let workerLogs = "";
function launch(index, fault) {
  const child = spawn(process.execPath, ["tests/database/local-commerce-test-worker.mjs", run,
    "--confirm-disposable", String(ports[index]), ...(fault ? [fault] : [])],
  { env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
  workers.push(child);
  for (const stream of [child.stdout, child.stderr]) stream.on("data", chunk => {
    workerLogs = (workerLogs + chunk.toString()).slice(-5000);
  });
  return child;
}
async function ready(child, index) {
  for (let attempt = 0; attempt < 80; attempt++) {
    assert.equal(child.exitCode, null, `Worker exited: ${workerLogs.replace(/sb_(?:secret|publishable)_[A-Za-z0-9_-]+/g, "[REDACTED]")}`);
    try {
      const response = await fetch(`http://127.0.0.1:${ports[index]}/api/customer-auth/session`, { signal: AbortSignal.timeout(2000) });
      await response.arrayBuffer();
      if (response.status === 200) return;
    } catch { /* startup only */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.fail(`Worker not ready: ${workerLogs.replace(/sb_(?:secret|publishable)_[A-Za-z0-9_-]+/g, "[REDACTED]")}`);
}
async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const done = new Promise(resolve => child.once("exit", resolve));
  process.kill(-child.pid, "SIGTERM");
  await Promise.race([done, new Promise(resolve => setTimeout(resolve, 5000))]);
  if (child.exitCode === null && child.signalCode === null) {
    process.kill(-child.pid, "SIGKILL"); await done;
  }
}
function cookie(jar) { return [...jar].map(([name, value]) => `${name}=${value}`).join("; "); }
function accept(jar, response) {
  for (const header of response.headers.getSetCookie()) {
    const [part] = header.split(";"); const position = part.indexOf("=");
    jar.set(part.slice(0, position), part.slice(position + 1));
  }
}
async function post(index, path, body, jar) {
  return fetch(`http://127.0.0.1:${ports[index]}${path}`, { method: "POST",
    headers: { origin: `http://127.0.0.1:${ports[index]}`, "sec-fetch-site": "same-origin",
      "content-type": "application/json", ...(jar ? { cookie: typeof jar === "string" ? jar : cookie(jar) } : {}) },
    body: JSON.stringify(body), signal: AbortSignal.timeout(20_000) });
}
function literal(value) { return `'${String(value).replaceAll("'", "''")}'`; }
function count(table, clause = "true") { return Number(sql(`select count(*) from local_commerce.${table} where project_id=${literal(project)} and ${clause};`)); }
const report = { run, project, ledger: "48/48", results: [] };
let shippingFixture = null;
try {
  const fixture = catalogDatabaseRows(project);
  let encoded = JSON.stringify(fixture);
  for (const id of Object.values(ids)) encoded = encoded.replaceAll(id, randomUUID());
  const rows = JSON.parse(encoded), suffix = randomUUID().replaceAll("-", "");
  rows.categories[0].slug = `phase3-${suffix}`;
  rows.products[0].slug = `phase3-${suffix}`;
  rows.products[0].fulfillment_definition.requiresProductionPreview = false;
  rows.variants[0].sku_code = `PHASE3-${suffix}`;
  rows.variants[0].price_cents = 10000;
  rows.rules = rows.rules.filter(rule => rule.definition.kind === "shipping");
  rows.rules[0].rule_key = `phase3-shipping-${suffix}`;
  rows.rules[0].definition.method = `phase3_${suffix}`;
  for (const [kind, table] of Object.entries({ categories: "catalog_categories", products: "catalog_products",
    variants: "catalog_variants", configurations: "catalog_configuration_snapshots", rules: "catalog_pricing_rules" })) {
    const response = await fetch(`${prep.config.endpoints.apiUrl}/rest/v1/${table}`, {
      method: "POST", headers: keyHeaders, body: JSON.stringify(rows[kind]), signal: AbortSignal.timeout(8000) });
    assert.equal(response.status, 201, `synthetic ${kind}`); await response.arrayBuffer();
    if (kind === "rules") shippingFixture = { id: rows.rules[0].id,
      ruleKey: rows.rules[0].rule_key, method: rows.rules[0].definition.method };
  }
  const a = launch(0); await ready(a, 0);
  const b = launch(1); await ready(b, 1);
  report.workerPids = [a.pid, b.pid];
  const adminLogin = await post(0, "/api/admin/login", { password: adminPassword });
  assert.equal(adminLogin.status, 200, "signed Admin login");
  const adminCookie = adminLogin.headers.getSetCookie().find(value => value.startsWith("photogift-admin-session="))?.split(";", 1)[0];
  assert.ok(adminCookie); await adminLogin.arrayBuffer();
  const handoff = { productId: rows.products[0].id, variantId: rows.variants[0].id,
    skuCode: rows.variants[0].sku_code, selectedOptions: rows.variants[0].selected_options,
    configurationRevision: "1", customizationValues: [] };
  async function createPaid() {
    const jar = new Map();
    const cart = await post(0, "/api/cart", { handoff }, jar);
    assert.equal(cart.status, 200, "Cart"); accept(jar, cart); await cart.arrayBuffer();
    const creationAttemptId = randomUUID();
    const orderBody = { creationAttemptId, email: "phase3@example.invalid", firstName: "Synthetic",
      lastName: "Phase3", country: "US", city: "Test", addressLine1: "Test only", postalCode: "00000",
      shippingMethod: rows.rules[0].definition.method };
    let order = await post(0, "/api/local-orders", orderBody, jar);
    if (order.status === 204) { accept(jar, order); order = await post(0, "/api/local-orders", orderBody, jar); }
    assert.equal(order.status, 200, "Order"); const orderResult = await order.json(); accept(jar, order);
    const payment = await post(0, "/api/local-payments", { publicReference: orderResult.publicReference,
      paymentAttemptId: randomUUID(), outcome: "success" }, jar);
    assert.equal(payment.status, 200, "Payment"); const paymentResult = await payment.json();
    assert.equal(paymentResult.payment.status, "succeeded");
    return { jar, order: orderResult.publicReference, payment: paymentResult.payment.paymentReference,
      amount: paymentResult.payment.simulatedAmountCents };
  }
  const paid = await createPaid();
  assert.equal(paid.amount, 10500);
  const immutable = sql(`select md5(row_to_json(s)::text) from local_commerce.order_purchase_snapshots s
    join local_commerce.orders o on o.id=s.order_id and o.project_id=s.project_id
    where o.public_reference=${literal(paid.order)};`);
  const originalPayment = sql(`select md5(row_to_json(p)::text) from local_commerce.payment_attempts p
    join local_commerce.payment_actions a on a.attempt_id=p.id and a.project_id=p.project_id
    where a.result#>>'{payment,paymentReference}'=${literal(paid.payment)};`);
  const refundCount = reference => count("refund_ledger", `payment_attempt_id in
    (select p.id from local_commerce.payment_attempts p join local_commerce.payment_actions a
      on a.attempt_id=p.id and a.project_id=p.project_id
      where a.result#>>'{payment,paymentReference}'=${literal(reference)})`);
  const inboxBase = count("webhook_inbox");
  async function refund(index, amountCents, expectedVersion, refundAttemptId = randomUUID(), admin = adminCookie) {
    const response = await post(index, "/api/admin/refunds", { paymentReference: paid.payment,
      refundAttemptId, amountCents, expectedVersion }, admin);
    return { http: response.status, body: await response.json() };
  }
  assert.equal((await refund(0, 10501, 1)).http, 409, "over-refund");
  assert.equal(refundCount(paid.payment), 0);
  const firstKey = randomUUID(), first = await refund(0, 1000, 1, firstKey);
  assert.equal(first.http, 200, JSON.stringify(first.body));
  assert.equal(first.body.refund.remainingRefundableCents, 9500);
  const replay = await refund(1, 1000, 1, firstKey);
  assert.equal(replay.http, 200); assert.equal(replay.body.status, "replayed");
  assert.deepEqual(replay.body.refund, first.body.refund);
  assert.equal((await refund(1, 1001, 1, firstKey)).http, 409, "changed same key");
  assert.equal((await refund(0, 1000, 1)).http, 409, "stale CAS");
  const second = await refund(0, 1000, 2);
  assert.equal(second.http, 200); assert.equal(second.body.refund.remainingRefundableCents, 8500);
  const final = await refund(0, 8500, 3);
  assert.equal(final.http, 200); assert.equal(final.body.refund.remainingRefundableCents, 0);
  assert.equal((await refund(0, 1, 4)).http, 409, "zero remaining");
  assert.equal(refundCount(paid.payment), 3);
  assert.equal(sql(`select sum(amount_cents) from local_commerce.refund_ledger where project_id=${literal(project)}
    and payment_attempt_id in (select p.id from local_commerce.payment_attempts p
      join local_commerce.payment_actions a on a.attempt_id=p.id and a.project_id=p.project_id
      where a.result#>>'{payment,paymentReference}'=${literal(paid.payment)});`), "10500");
  assert.equal((await refund(0, 1000, 1, firstKey, "")).http, 401);
  assert.equal((await refund(0, 1000, 1, firstKey)).body.status, "replayed");
  report.results.push("refund partial/full/over/zero/stale/replay/conflict/Admin");
  // A second paid Payment proves the two-worker last-remaining CAS race.
  const racePaid = await createPaid();
  const race = await Promise.all([0, 1].map(async index => {
    const response = await post(index, "/api/admin/refunds", { paymentReference: racePaid.payment,
      refundAttemptId: randomUUID(), amountCents: 6000, expectedVersion: 1 }, adminCookie);
    return { http: response.status, body: await response.json() };
  }));
  assert.deepEqual(race.map(item => item.http).sort(), [200, 409]);
  assert.equal(count("refund_ledger", `payment_attempt_id in (select id from local_commerce.payment_attempts where order_id in
    (select id from local_commerce.orders where public_reference=${literal(racePaid.order)}))`), 1);
  report.results.push("two live Worker refund CAS race");
  function evidence(id, type, reference, amount = paid.amount) {
    return new TextEncoder().encode(JSON.stringify({ id, type, occurredAt: "2026-09-22T00:00:00Z",
      subjectReference: reference, amountCents: amount, currency: "USD" }));
  }
  const id = `evt-${randomUUID()}`;
  const accepted = await ingestLocalPaymentEvidence("local_fixture", evidence(id, "payment.succeeded", paid.payment), env);
  assert.equal(accepted.status, "found"); assert.equal(accepted.replayed, false);
  const duplicate = await ingestLocalPaymentEvidence("local_fixture", evidence(id, "payment.succeeded", paid.payment), env);
  assert.equal(duplicate.status, "found"); assert.equal(duplicate.replayed, true);
  const conflict = await ingestLocalPaymentEvidence("local_fixture", evidence(id, "payment.failed", paid.payment), env);
  assert.equal(conflict.status, "conflict");
  assert.equal((await processLocalPaymentEvidence("local_fixture", id, env)).value.state, "reconciled");
  const unmatchedId = `evt-${randomUUID()}`;
  assert.equal((await ingestLocalPaymentEvidence("local_fixture", evidence(unmatchedId, "payment.succeeded",
    "LP-LOCAL-0000000000000000"), env)).status, "found");
  assert.equal((await processLocalPaymentEvidence("local_fixture", unmatchedId, env)).value.state, "unmatched");
  const unknownId = `evt-${randomUUID()}`;
  assert.equal((await ingestLocalPaymentEvidence("local_fixture", evidence(unknownId, "payment.pending", paid.payment), env)).status, "found");
  assert.equal((await processLocalPaymentEvidence("local_fixture", unknownId, env)).value.state, "unknown");
  const staleId = `evt-${randomUUID()}`;
  assert.equal((await ingestLocalPaymentEvidence("local_fixture", evidence(staleId, "payment.failed", paid.payment), env)).status, "found");
  assert.equal((await processLocalPaymentEvidence("local_fixture", staleId, env)).value.state, "stale");
  const inboxRead = await fetch(`http://127.0.0.1:${ports[0]}/api/admin/payment-events?source=local_fixture&state=unmatched`,
    { headers: { cookie: adminCookie }, signal: AbortSignal.timeout(5000) });
  assert.equal(inboxRead.status, 200);
  assert.equal((await inboxRead.json()).value.some(event => event.externalEventId === unmatchedId), true);
  const adminRetry = await post(1, "/api/admin/payment-events", { source: "local_fixture", externalEventId: unmatchedId }, adminCookie);
  assert.equal(adminRetry.status, 200);
  assert.equal((await adminRetry.json()).value.state, "unmatched");
  assert.equal(count("webhook_inbox"), inboxBase + 4);
  report.results.push("inbox dedupe/conflict/reconciled/unmatched/unknown/stale/Admin retry");
  const claimRaceId = `evt-${randomUUID()}`;
  assert.equal((await ingestLocalPaymentEvidence("local_fixture", evidence(claimRaceId, "payment.succeeded", paid.payment), env)).status, "found");
  const claimRace = await Promise.all([0, 1].map(index => post(index, "/api/admin/payment-events",
    { source: "local_fixture", externalEventId: claimRaceId }, adminCookie)));
  assert.deepEqual(claimRace.map(item => item.status).sort(), [200, 409]);
  for (const response of claimRace) await response.arrayBuffer();
  assert.equal(sql(`select attempt_count from local_commerce.webhook_inbox where project_id=${literal(project)}
    and external_event_id=${literal(claimRaceId)};`), "1");
  const crashId = `evt-${randomUUID()}`;
  assert.equal((await ingestLocalPaymentEvidence("local_fixture", evidence(crashId, "payment.succeeded", paid.payment), env)).status, "found");
  const claimHeaders = { apikey: key, ...(!key.startsWith("sb_secret_") ? { authorization: `Bearer ${key}` } : {}),
    "content-type": "application/json", "content-profile": "local_commerce" };
  const claimed = await fetch(`${prep.config.endpoints.apiUrl}/rest/v1/rpc/webhook_inbox_claim`, {
    method: "POST", headers: claimHeaders, body: JSON.stringify({ p_project_id: project,
      p_marker_digest: prep.markerDigest, p_source: "local_fixture", p_external_event_id: crashId }),
    signal: AbortSignal.timeout(5000) });
  assert.equal(claimed.status, 200);
  const claimedBody = await claimed.json(); assert.equal(claimedBody.status, "claimed");
  assert.equal((await processLocalPaymentEvidence("local_fixture", crashId, env)).status, "conflict");
  await new Promise(resolve => setTimeout(resolve, 5500));
  const recovered = await post(1, "/api/admin/payment-events",
    { source: "local_fixture", externalEventId: crashId }, adminCookie);
  assert.equal(recovered.status, 200); assert.equal((await recovered.json()).value.state, "reconciled");
  assert.equal(sql(`select attempt_count from local_commerce.webhook_inbox where project_id=${literal(project)}
    and external_event_id=${literal(crashId)};`), "2");
  report.results.push("two live Worker inbox claim race + expired lease recovery");
  const crashWorker = launch(2, "inbox-hang-after-claim"); await ready(crashWorker, 2);
  const crashWorkerId = `evt-${randomUUID()}`;
  assert.equal((await ingestLocalPaymentEvidence("local_fixture", evidence(crashWorkerId, "payment.succeeded", paid.payment), env)).status, "found");
  const pendingResponse = post(2, "/api/admin/payment-events",
    { source: "local_fixture", externalEventId: crashWorkerId }, adminCookie).catch(() => null);
  let claimedByWorker = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    const state = sql(`select state from local_commerce.webhook_inbox where project_id=${literal(project)}
      and external_event_id=${literal(crashWorkerId)};`);
    if (state === "processing") { claimedByWorker = true; break; }
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  assert.equal(claimedByWorker, true, "fault Worker committed a lease before termination");
  await stop(crashWorker); await pendingResponse;
  assert.ok(crashWorker.exitCode !== null || crashWorker.signalCode !== null);
  await new Promise(resolve => setTimeout(resolve, 5500));
  const recoveredAfterCrash = await post(1, "/api/admin/payment-events",
    { source: "local_fixture", externalEventId: crashWorkerId }, adminCookie);
  assert.equal(recoveredAfterCrash.status, 200);
  assert.equal((await recoveredAfterCrash.json()).value.state, "reconciled");
  report.crashWorkerPid = crashWorker.pid;
  report.results.push("fault Worker terminated after durable claim; separate live Worker recovers expired fence");
  // Direct restricted RPCs are service-only; a wrong project/marker cannot
  // mutate even with the local service key. No browser role is granted EXECUTE.
  const functions = ["admin_refund_command(text,text,text,text,text,integer,integer)",
    "webhook_inbox_ingest(text,text,text,text,text,integer,text,timestamptz,text,text,jsonb)",
    "webhook_inbox_claim(text,text,text,text)",
    "webhook_inbox_finalize(text,text,text,text,uuid,integer)",
    "admin_webhook_inbox_read(text,text,text,text,text,text,integer)"];
  for (const signature of functions) {
    for (const role of ["anon", "authenticated"]) {
      assert.equal(sql(`select has_function_privilege(${literal(role)},'local_commerce.${signature}','EXECUTE');`), "f");
    }
    assert.equal(sql(`select not exists (select 1 from pg_proc p,
      aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x
      where p.oid='local_commerce.${signature}'::regprocedure
        and x.grantee=0 and x.privilege_type='EXECUTE');`), "t");
    assert.equal(sql(`select has_function_privilege('service_role','local_commerce.${signature}','EXECUTE');`), "t");
  }
  assert.equal(sql(`select local_commerce.admin_refund_command('wrong-project',${literal(prep.markerDigest)},
    'configured-admin',${literal(paid.payment)},'${"a".repeat(64)}',1,1)->>'status';`), "unavailable");
  assert.equal(sql(`select local_commerce.admin_refund_command(${literal(project)},'${"0".repeat(64)}',
    'configured-admin',${literal(paid.payment)},'${"a".repeat(64)}',1,1)->>'status';`), "unavailable");
  assert.equal(sql(`select local_commerce.webhook_inbox_claim('wrong-project',${literal(prep.markerDigest)},
    'local_fixture',${literal(crashId)})->>'status';`), "unavailable");
  const anon = info.PUBLISHABLE_KEY ?? info.ANON_KEY;
  assert.ok(anon);
  const deniedRpc = await fetch(`${prep.config.endpoints.apiUrl}/rest/v1/rpc/webhook_inbox_claim`, {
    method: "POST", headers: { apikey: anon,
      ...(!anon.startsWith("sb_publishable_") ? { authorization: `Bearer ${anon}` } : {}),
      "content-type": "application/json", "content-profile": "local_commerce" },
    body: JSON.stringify({ p_project_id: project, p_marker_digest: prep.markerDigest,
      p_source: "local_fixture", p_external_event_id: crashId }), signal: AbortSignal.timeout(5000) });
  assert.ok([401, 403, 404].includes(deniedRpc.status)); await deniedRpc.arrayBuffer();
  report.results.push("RLS/RPC ACL public/anon/authenticated denied; project/marker fail closed");
  // Demonstrate durability through a distinct application PID; the DB remains.
  await stop(a);
  const a2 = launch(0); await ready(a2, 0);
  assert.notEqual(a.pid, a2.pid);
  const restarted = await refund(0, 1000, 1, firstKey);
  assert.equal(restarted.http, 200); assert.equal(restarted.body.status, "replayed");
  const afterRestart = await fetch(`http://127.0.0.1:${ports[0]}/api/admin/payment-events?source=local_fixture&externalEventId=${id}`,
    { headers: { cookie: adminCookie }, signal: AbortSignal.timeout(5000) });
  assert.equal(afterRestart.status, 200);
  assert.equal((await afterRestart.json()).value.state, "reconciled");
  assert.equal(sql(`select md5(row_to_json(s)::text) from local_commerce.order_purchase_snapshots s
    join local_commerce.orders o on o.id=s.order_id and o.project_id=s.project_id
    where o.public_reference=${literal(paid.order)};`), immutable);
  assert.equal(sql(`select md5(row_to_json(p)::text) from local_commerce.payment_attempts p
    join local_commerce.payment_actions act on act.attempt_id=p.id and act.project_id=p.project_id
    where act.result#>>'{payment,paymentReference}'=${literal(paid.payment)};`), originalPayment);
  report.results.push("process restart replay/read + immutable Order/Payment");
  report.restartPids = [a.pid, a2.pid];
  report.status = "PASS";
  console.info(JSON.stringify(report));
} finally {
  if (report.status !== "PASS") console.info(JSON.stringify({ status: "INCOMPLETE", completed: report.results }));
  globalThis.fetch = originalFetch;
  for (const worker of workers.reverse()) await stop(worker);
  if (shippingFixture) quarantineSyntheticShippingRule({ sql, project, ...shippingFixture });
}
