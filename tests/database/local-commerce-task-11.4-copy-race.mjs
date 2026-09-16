// Task 11.4 race G: two canonical application Workers stay live while two
// independent server-command invokers contend through the existing DB/RPC and
// private Storage authority.
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { fork, spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import net from "node:net";
import path from "node:path";

import { sha256Text } from "../../app/application/local-commerce-migration-ledger.ts";
import { catalogTestEnvironment } from "../fixtures/local-persistent-catalog.mjs";

assert.deepEqual(process.argv.slice(2), ["run-93f6c1a2", "--confirm-disposable"]);
const run = "run-93f6c1a2", projectId = `figmemento-local-commerce-test-${run}`, root = path.resolve(".");
const workdir = path.join(root, "local/commerce/runtime/disposable", run);
const preparation = JSON.parse(readFileSync(path.join(workdir, "ledger-preparation.json"), "utf8"));
const marker = JSON.parse(readFileSync(path.join(workdir, "project-marker.json"), "utf8"));
assert.equal(preparation.config.projectId, projectId); assert.equal(sha256Text(JSON.stringify(marker)), preparation.markerDigest);
function command(binary, args, input, timeout = 30_000) { const result = spawnSync(binary, args, { cwd: root, input, encoding: "utf8", timeout, maxBuffer: 16 * 1024 * 1024 });
  assert.equal(result.error, undefined); assert.equal(result.status, 0, (result.stderr || "command failed").replace(/eyJ[A-Za-z0-9_.-]+/g, "[redacted]").split("\n")[0]); return result.stdout.trim(); }
let databaseId = process.env.TASK_11_4_VERIFIED_DB_CONTAINER_ID;
if (databaseId) {
  assert.match(databaseId, /^[a-f0-9]{64}$/);
  assert.equal(process.env.TASK_11_4_EQUIVALENT_IDENTITY_VERIFIED, "1");
} else {
  const ids = command("docker", ["ps", "--filter", `label=com.supabase.cli.workdir=${workdir}`, "--format", "{{.ID}}"]).split("\n").filter(Boolean);
  const containers = JSON.parse(command("docker", ["inspect", ...ids])); const dbs = containers.filter((c) => c.Name.startsWith("/supabase_db_") && c.State.Running && c.Config.Labels["com.supabase.cli.workdir"] === workdir); assert.equal(dbs.length, 1);
  databaseId = dbs[0].Id;
}
const sql = (query) => command("docker", ["exec", "-i", databaseId, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], query);
assert.equal(sql("select current_setting('server_version_num')::int/10000;"), "17"); assert.equal(sql(`select local_commerce.verify_project_identity('${projectId}','${preparation.markerDigest}');`), "t"); assert.equal(sql("select count(*) from local_commerce.migration_ledger;"), "37");
// A parent acceptance launcher may supply the transient exact-run service key
// after validating it against the restricted project-identity RPC. This keeps
// the credential out of argv/files and avoids making Docker CLI status an
// authority when the Engine control plane is degraded.
const stack = process.env.LOCAL_COMMERCE_SERVICE_ROLE_KEY
  ? { SERVICE_ROLE_KEY: process.env.LOCAL_COMMERCE_SERVICE_ROLE_KEY, API_URL: preparation.config.endpoints.apiUrl }
  : JSON.parse(command(path.resolve("node_modules/.bin/supabase"), ["status", "--workdir", workdir, "-o", "json"]));
async function freePort() { return new Promise((resolve, reject) => { const s = net.createServer(); s.once("error", reject); s.listen(0, "127.0.0.1", () => { const a = s.address(); assert.ok(a && typeof a === "object"); s.close((e) => e ? reject(e) : resolve(a.port)); }); }); }
const [helperPort, portA, portB] = await Promise.all([freePort(), freePort(), freePort()]);
const env = { ...process.env, ...catalogTestEnvironment({ LOCAL_COMMERCE_RUN_ID: run, LOCAL_COMMERCE_PROJECT_ID: projectId,
  LOCAL_COMMERCE_MARKER_DIGEST: preparation.markerDigest, LOCAL_COMMERCE_SERVICE_ROLE_KEY: stack.SERVICE_ROLE_KEY,
  CUSTOMER_AUTH_SOURCE: "local_persistent", CART_SOURCE: "local_persistent", PHOTOGIFT_PRODUCT_SOURCE: "local_persistent",
  CUSTOMER_UPLOAD_SOURCE: "local_persistent", LOCAL_CHECKOUT_SOURCE: "local_persistent", LOCAL_ORDER_SOURCE: "local_persistent",
  LOCAL_PAYMENT_SOURCE: "local_persistent", LOCAL_FULFILLMENT_SOURCE: "local_persistent", LOCAL_TRACKING_SOURCE: "local_persistent",
  LOCAL_COMMERCE_IMAGE_HELPER_PORT: String(helperPort), LOCAL_COMMERCE_IMAGE_HELPER_URL: `http://127.0.0.1:${helperPort}`,
  LOCAL_COMMERCE_IMAGE_HELPER_SECRET: randomBytes(32).toString("base64url"), LOCAL_ORDER_CAPABILITY_SECRET: randomBytes(32).toString("hex"),
  LOCAL_ORDER_CAPABILITY_TTL_SECONDS: "3600", PHOTOGIFT_GUEST_DRAFT_OWNER_SECRET: randomBytes(48).toString("base64url"),
  PHOTOGIFT_GUEST_DRAFT_OWNER_CONTEXT_TTL_SECONDS: "3600" }), CLOUDFLARE_INCLUDE_PROCESS_ENV: "true",
  WRANGLER_SEND_METRICS: "false", WRANGLER_WRITE_LOGS: "false", NODE_OPTIONS: "", LOCAL_COMMERCE_ACCEPTANCE_DISABLE_INSPECTOR: "true" };
for (const [name, value] of Object.entries({ SHADOW_DB: preparation.config.ports.shadowDb, API: preparation.config.ports.api, DB: preparation.config.ports.db, STUDIO: preparation.config.ports.studio, SMTP: preparation.config.ports.smtp })) env[`LOCAL_COMMERCE_${name}_PORT`] = String(value);
for (const [name, value] of Object.entries({ API: preparation.config.endpoints.apiUrl, RPC: preparation.config.endpoints.rpcUrl, STORAGE: preparation.config.endpoints.storageUrl })) env[`LOCAL_COMMERCE_${name}_URL`] = value;
const secrets = [stack.SERVICE_ROLE_KEY, stack.ANON_KEY, stack.JWT_SECRET, env.LOCAL_COMMERCE_IMAGE_HELPER_SECRET, env.LOCAL_ORDER_CAPABILITY_SECRET, env.PHOTOGIFT_GUEST_DRAFT_OWNER_SECRET].filter(Boolean);
const redact = (input) => secrets.reduce((v, secret) => v.split(secret).join("[redacted]"), String(input ?? "")).replace(/eyJ[A-Za-z0-9_.-]+/g, "[redacted]");
let logs = ""; const children = [];
function start(args) { const child = spawn(process.execPath, args, { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] }); children.push(child); for (const stream of [child.stdout, child.stderr]) stream.on("data", (b) => { logs = (logs + redact(b)).slice(-30_000); }); return child; }
function exists(pid) { try { process.kill(pid, 0); return true; } catch (error) { return error.code !== "ESRCH"; } }
async function ready(child, port) { for (let i = 0; i < 100; i += 1) { assert.equal(child.exitCode, null, logs); try { const r = await fetch(`http://127.0.0.1:${port}/api/customer-auth/session`, { signal: AbortSignal.timeout(1500) }); await r.arrayBuffer(); if (r.status === 200) return; } catch { /* readiness */ } await new Promise((resolve) => setTimeout(resolve, 300)); } assert.fail(logs); }
function workerIdentity(child, port) { assert.ok(child.pid && exists(child.pid)); const line = command("ps", ["-p", String(child.pid), "-o", "command="]); assert.match(line, new RegExp(`local-commerce-test-worker\\.mjs ${run} --confirm-disposable ${port}`)); return { pid: child.pid, port, cwd: root, command: line }; }
async function stop(child) { if (!child || child.exitCode !== null || child.signalCode !== null) return; const done = new Promise((resolve) => child.once("exit", resolve)); child.kill("SIGTERM"); await Promise.race([done, new Promise((resolve) => setTimeout(resolve, 5000))]); if (child.exitCode === null && child.signalCode === null) { child.kill("SIGKILL"); await done; } }
class Jar { constructor() { this.values = new Map(); } header() { return [...this.values].map(([k, v]) => `${k}=${v}`).join("; "); } accept(r) { for (const value of r.headers.getSetCookie()) { const pair = value.split(";")[0], at = pair.indexOf("="); const v = pair.slice(at + 1); if (v) this.values.set(pair.slice(0, at), v); } } }
const origins = [`http://127.0.0.1:${portA}`, `http://127.0.0.1:${portB}`];
async function request(instance, jar, method, route, body, headers = {}) { const options = { method, headers: { origin: origins[instance], cookie: jar.header(), ...headers }, signal: AbortSignal.timeout(30_000) }; if (body instanceof FormData) options.body = body; else { options.headers["content-type"] = "application/json"; options.body = JSON.stringify(body); } const response = await fetch(origins[instance] + route, options); jar.accept(response); return response; }
const product = { productId: "11600000-0000-4000-8000-000000000002", fieldId: "11600000-0000-4000-8000-000000000008" };
const sharp = createRequire(path.resolve("local/commerce/image-helper/package.json"))("sharp"); const bytes = await sharp({ create: { width: 12, height: 9, channels: 3, background: "#d4b896" } }).png().toBuffer();
async function draft(jar, instance = 0) { const r = await request(instance, jar, "POST", "/api/local-drafts", { productId: product.productId }, { "Idempotency-Key": randomUUID() }); assert.equal(r.status, 201, await r.clone().text()); return r.json(); }
async function upload(jar, d, instance = 0) { const form = new FormData(); form.set("file", new File([bytes], `task114-${randomUUID()}.png`, { type: "image/png" })); const route = `/api/uploads?${new URLSearchParams({ productId: product.productId, fieldId: product.fieldId, draftId: d.draftId, expectedVersion: String(d.version) })}`; const r = await request(instance, jar, "POST", route, form, { "Idempotency-Key": randomUUID() }); assert.equal(r.status, 201, await r.clone().text()); return (await r.json()).receipt.receiptId; }
const invokerFile = fileURLToPath(new URL("./local-commerce-task-11.4-copy-invoker.mjs", import.meta.url));
async function invokePair(messages, workers) { const invokers = [0, 1].map(() => fork(invokerFile, [], { cwd: root, env, stdio: ["ignore", "ignore", "pipe", "ipc"] })); const exits = invokers.map((child) => new Promise((resolve) => child.once("exit", resolve))); const readyFacts = await Promise.all(invokers.map((child) => new Promise((resolve, reject) => { child.once("message", resolve); child.once("error", reject); child.stderr.on("data", (b) => { logs = (logs + redact(b)).slice(-30_000); }); }))); assert.ok(invokers.every((c) => c.exitCode === null)); assert.ok(workers.every((c) => exists(c.pid))); assert.equal(new Set([...workers, ...invokers].map((c) => c.pid)).size, 4); const releasedAt = new Date().toISOString(); const results = invokers.map((child) => new Promise((resolve, reject) => { child.once("message", resolve); child.once("error", reject); })); invokers.forEach((child, index) => child.send(messages[index])); const outcomes = await Promise.all(results); await Promise.all(exits); return { readyFacts, releasedAt, outcomes }; }
function op(receipt) { return JSON.parse(sql(`select row_to_json(o) from local_commerce.media_operations o where o.project_id='${projectId}' and o.receipt_id=(select id from local_commerce.media_receipts where project_id='${projectId}' and receipt_reference='${receipt}');`)); }
const storageBytes = async (locator) => { const r = await fetch(`${stack.API_URL}/storage/v1/object/authenticated/local-commerce-private/${locator}`, { headers: { apikey: stack.SERVICE_ROLE_KEY, authorization: `Bearer ${stack.SERVICE_ROLE_KEY}` }, signal: AbortSignal.timeout(10_000) }); assert.equal(r.status, 200); return Buffer.from(await r.arrayBuffer()); };
const digest = (value) => createHash("sha256").update(value).digest("hex");
let helper, workerA, workerB;
try {
  helper = start(["local/commerce/image-helper/server.mjs"]); workerA = start(["tests/database/local-commerce-test-worker.mjs", run, "--confirm-disposable", String(portA)]); workerB = start(["tests/database/local-commerce-test-worker.mjs", run, "--confirm-disposable", String(portB)]); await Promise.all([ready(workerA, portA), ready(workerB, portB)]); const A = workerIdentity(workerA, portA), B = workerIdentity(workerB, portB);
  const signup = async (instance, jar, email) => request(instance, jar, "POST", "/api/customer-auth/sign-up", { email, password: "Task-11.4-concurrency-password!" });
  const sameEmail = `task-11-4-same-${randomUUID()}@example.invalid`, sameJars = [new Jar(), new Jar()];
  const registrationReleasedAt = new Date().toISOString();
  const sameRegistration = await Promise.all([signup(0, sameJars[0], sameEmail.toUpperCase()), signup(1, sameJars[1], sameEmail)]);
  const registrationStatuses = sameRegistration.map((response) => response.status); for (const response of sameRegistration) await response.arrayBuffer();
  assert.deepEqual([...registrationStatuses].sort((a, b) => a - b), [200, 409]);
  assert.equal(Number(sql(`select count(*) from local_commerce.customer_accounts where project_id='${projectId}' and normalized_email='${sameEmail}';`)), 1);
  assert.equal(Number(sql(`select count(*) from local_commerce.commerce_owners o join local_commerce.customer_accounts a on a.project_id=o.project_id and a.owner_id=o.id where a.project_id='${projectId}' and a.normalized_email='${sameEmail}';`)), 1);
  assert.equal(sameJars.filter((jar) => jar.values.has("figmemento-local-customer-session")).length, 1);
  const distinctJars = [new Jar(), new Jar()], distinctEmails = [0, 1].map(() => `task-11-4-distinct-${randomUUID()}@example.invalid`);
  const distinctRegistration = await Promise.all([signup(0, distinctJars[0], distinctEmails[0]), signup(1, distinctJars[1], distinctEmails[1])]);
  assert.deepEqual(distinctRegistration.map((response) => response.status), [200, 200]); for (const response of distinctRegistration) await response.arrayBuffer();
  const memberJar = sameJars.find((jar) => jar.values.has("figmemento-local-customer-session")); assert.ok(memberJar);
  const sessionToken = memberJar.values.get("figmemento-local-customer-session"); assert.ok(sessionToken);
  const sessionHash = digest(decodeURIComponent(sessionToken));
  const sessionRaceReleasedAt = new Date().toISOString();
  const [logoutResponse, racingRead] = await Promise.all([
    request(0, memberJar, "POST", "/api/customer-auth/sign-out", {}),
    fetch(`${origins[1]}/api/customer-auth/session`, { headers: { cookie: memberJar.header() }, signal: AbortSignal.timeout(10_000) }),
  ]);
  assert.equal(logoutResponse.status, 200); await logoutResponse.arrayBuffer(); const racingReadBody = await racingRead.json();
  const afterRevoke = await fetch(`${origins[1]}/api/customer-auth/session`, { headers: { cookie: `figmemento-local-customer-session=${sessionToken}` }, signal: AbortSignal.timeout(10_000) });
  assert.equal(afterRevoke.status, 200); assert.deepEqual(await afterRevoke.json(), { status: "ok", authenticated: false });
  assert.equal(sql(`select case when revoked_at is not null then 'revoked' else 'active' end from local_commerce.customer_sessions where project_id='${projectId}' and session_hash='${sessionHash}';`), "revoked");
  const AB = { registration: { releasedAt: registrationReleasedAt, statuses: registrationStatuses, normalizedIdentityCount: 1,
    distinctControlStatuses: distinctRegistration.map((response) => response.status), noLosingCookie: true },
    session: { releasedAt: sessionRaceReleasedAt, logoutStatus: logoutResponse.status,
      racingReadAuthenticated: racingReadBody.authenticated, postCommitAuthenticated: false, durableLifecycle: "revoked" } };
  const cartJar = distinctJars[0];
  const digitalHandoff = { productId: "11400000-0000-4000-8000-000000000002", variantId: "11400000-0000-4000-8000-000000000003",
    skuCode: "TASK-11-4-DIGITAL-001", selectedOptions: [{ optionId: "11400000-0000-4000-8000-000000000004", valueId: "11400000-0000-4000-8000-000000000005" }],
    configurationRevision: "1", customizationValues: [] };
  const firstCart = await request(0, cartJar, "POST", "/api/cart", { handoff: digitalHandoff }); assert.equal(firstCart.status, 200, await firstCart.clone().text()); await firstCart.json();
  const secondCart = await request(0, cartJar, "POST", "/api/cart", { handoff: digitalHandoff }); assert.equal(secondCart.status, 200, await secondCart.clone().text()); const secondCartBody = await secondCart.json();
  assert.equal(secondCartBody.lines.length, 2); assert.notEqual(secondCartBody.lines[0].lineId, secondCartBody.lines[1].lineId);
  const cartId = decodeURIComponent(cartJar.values.get("figmemento-local-cart")); assert.ok(cartId);
  const versionBeforeC = Number(sql(`select version from local_commerce.carts where project_id='${projectId}' and id='${cartId}';`));
  const cReleasedAt = new Date().toISOString(), cLine = secondCartBody.lines[0].lineId;
  const cResponses = await Promise.all([request(0, cartJar, "PATCH", `/api/cart/items/${cLine}`, { quantity: 2 }), request(1, cartJar, "PATCH", `/api/cart/items/${cLine}`, { quantity: 3 })]);
  const cStatuses = cResponses.map((response) => response.status); for (const response of cResponses) await response.arrayBuffer();
  assert.deepEqual([...cStatuses].sort((a, b) => a - b), [200, 409]);
  const versionAfterC = Number(sql(`select version from local_commerce.carts where project_id='${projectId}' and id='${cartId}';`)); assert.equal(versionAfterC, versionBeforeC + 1);
  const cFinal = JSON.parse(sql(`select json_build_object('lineCount',count(*),'quantity',max(quantity)) from local_commerce.cart_lines where project_id='${projectId}' and cart_id='${cartId}' and id='${cLine}';`)); assert.equal(cFinal.lineCount, 1); assert.ok([2, 3].includes(cFinal.quantity));
  const cartRead = await request(0, cartJar, "GET", "/api/cart"); assert.equal(cartRead.status, 200); const dInitial = await cartRead.json(); assert.equal(dInitial.lines.length, 2);
  const dVersionBefore = versionAfterC, dReleasedAt = new Date().toISOString();
  const dCommands = [{ lineId: dInitial.lines[0].lineId, quantity: 4, instance: 0 }, { lineId: dInitial.lines[1].lineId, quantity: 5, instance: 1 }];
  const dResponses = await Promise.all(dCommands.map((item) => request(item.instance, cartJar, "PATCH", `/api/cart/items/${item.lineId}`, { quantity: item.quantity })));
  const dStatuses = dResponses.map((response) => response.status); for (const response of dResponses) await response.arrayBuffer(); assert.deepEqual([...dStatuses].sort((a, b) => a - b), [200, 409]);
  const loser = dCommands[dStatuses.indexOf(409)], dRetry = await request(loser.instance, cartJar, "PATCH", `/api/cart/items/${loser.lineId}`, { quantity: loser.quantity }); assert.equal(dRetry.status, 200); await dRetry.arrayBuffer();
  const dVersionAfter = Number(sql(`select version from local_commerce.carts where project_id='${projectId}' and id='${cartId}';`)); assert.equal(dVersionAfter, dVersionBefore + 2);
  const dLines = JSON.parse(sql(`select json_agg(json_build_object('id',id,'quantity',quantity) order by position) from local_commerce.cart_lines where project_id='${projectId}' and cart_id='${cartId}';`));
  for (const command of dCommands) assert.equal(dLines.find((line) => line.id === command.lineId).quantity, command.quantity);
  const CD = { sameVersion: { releasedAt: cReleasedAt, statuses: cStatuses, versionBefore: versionBeforeC, versionAfter: versionAfterC, oneLine: true, noLostUpdate: true },
    independentLines: { releasedAt: dReleasedAt, statuses: dStatuses, retryStatus: dRetry.status, versionBefore: dVersionBefore, versionAfter: dVersionAfter, finalQuantities: [4, 5] } };
  const jar = new Jar(); const sourceDraft = await draft(jar); const sourceReceipt = await upload(jar, sourceDraft); const target = await draft(jar);
  const guestContext = jar.values.get("photogift-guest-draft-owner"); assert.ok(guestContext); const key = randomUUID(); const requestG1 = { sourceReceiptId: sourceReceipt, targetDraftId: target.draftId, expectedVersion: target.version, idempotencyKey: key };
  const G1 = await invokePair([0, 1].map(() => ({ guestContext, request: requestG1 })), [workerA, workerB]);
  console.error("G1 SAFE OUTCOMES", JSON.stringify(G1.outcomes.map((o) => ({ type: o.type, status: o.result?.status, error: o.error, stage: o.stage, safeReason: o.safeReason }))));
  assert.ok(G1.outcomes.every((o) => o.type === "result" && o.result.status === "found")); assert.equal(G1.outcomes[0].result.operationId, G1.outcomes[1].result.operationId); assert.equal(G1.outcomes[0].result.receipt.receiptId, G1.outcomes[1].result.receipt.receiptId); assert.equal(G1.outcomes[0].ownerDigest, G1.outcomes[1].ownerDigest);
  const sourceOperation = op(sourceReceipt), copiedOperation = op(G1.outcomes[0].result.receipt.receiptId); assert.equal(sourceOperation.original_object_id, copiedOperation.original_object_id); assert.notEqual(sourceOperation.derivative_locator, copiedOperation.derivative_locator); assert.equal(sql(`select count(*) from local_commerce.media_copy_bindings where project_id='${projectId}' and target_operation_id='${copiedOperation.id}';`), "1"); assert.equal(digest(await storageBytes(sourceOperation.derivative_locator)), digest(await storageBytes(copiedOperation.derivative_locator)));
  const sourceDraft2 = await draft(jar), sourceReceipt2 = await upload(jar, sourceDraft2), targetA = await draft(jar), targetB = await draft(jar), conflictKey = randomUUID();
  const G2 = await invokePair([{ guestContext, request: { sourceReceiptId: sourceReceipt2, targetDraftId: targetA.draftId, expectedVersion: targetA.version, idempotencyKey: conflictKey } }, { guestContext, request: { sourceReceiptId: sourceReceipt2, targetDraftId: targetB.draftId, expectedVersion: targetB.version, idempotencyKey: conflictKey } }], [workerA, workerB]); const statuses = G2.outcomes.map((o) => o.result?.status); assert.equal(statuses.filter((s) => s === "found").length, 1); assert.equal(statuses.filter((s) => s === "conflict").length, 1);
  const savedDraftResponse = await request(0, jar, "PUT", `/api/local-drafts/${sourceDraft.draftId}`, { expectedVersion: sourceDraft.version,
    slots: [{ fieldId: product.fieldId, receiptReference: sourceReceipt }] }, { "Idempotency-Key": randomUUID() });
  assert.equal(savedDraftResponse.status, 200, await savedDraftResponse.clone().text()); const savedDraft = await savedDraftResponse.json(); assert.equal(savedDraft.slots.length, 1);
  const imageHandoff = { productId: product.productId, variantId: "11600000-0000-4000-8000-000000000003", skuCode: "TASK-11-4-IMAGE-001",
    selectedOptions: [{ optionId: "11600000-0000-4000-8000-000000000004", valueId: "11600000-0000-4000-8000-000000000005" }], configurationRevision: "1",
    customizationValues: [{ fieldId: product.fieldId, fieldCode: "photo", kind: "image", images: [{ receiptId: sourceReceipt }] }] };
  const imageCart = await request(0, jar, "POST", "/api/cart", { handoff: imageHandoff }); assert.equal(imageCart.status, 200, await imageCart.clone().text()); await imageCart.arrayBuffer();
  const orderBase = { email: "task-11-4-order@example.invalid", firstName: "Task", lastName: "Concurrency", country: "US", city: "Local",
    addressLine1: "Synthetic acceptance address", postalCode: "00000", shippingMethod: "task_11_4_standard" };
  const establishKey = randomUUID(), establishment = await request(0, jar, "POST", "/api/local-orders", { ...orderBase, creationAttemptId: establishKey });
  assert.equal(establishment.status, 204, await establishment.clone().text()); await establishment.arrayBuffer(); assert.ok(jar.values.has("figmemento-local-order-access"));
  const sourceOwner = sourceOperation.owner_id;
  const beforeF = JSON.parse(sql(`select json_build_object('orders',(select count(*) from local_commerce.orders where project_id='${projectId}' and owner_id='${sourceOwner}'),'bindings',(select count(*) from local_commerce.order_item_receipt_bindings where project_id='${projectId}' and receipt_id=(select id from local_commerce.media_receipts where project_id='${projectId}' and receipt_reference='${sourceReceipt}')));`));
  const fReleasedAt = new Date().toISOString(), fAttempts = [randomUUID(), randomUUID()];
  const fResponses = await Promise.all(fAttempts.map((creationAttemptId, instance) => request(instance, jar, "POST", "/api/local-orders", { ...orderBase, creationAttemptId })));
  const fStatuses = fResponses.map((response) => response.status); for (const response of fResponses) await response.arrayBuffer();
  assert.equal(fStatuses.filter((status) => status === 200).length, 1); assert.ok(fStatuses.every((status) => [200, 409, 503].includes(status)));
  const afterF = JSON.parse(sql(`select json_build_object('orders',(select count(*) from local_commerce.orders where project_id='${projectId}' and owner_id='${sourceOwner}'),'bindings',(select count(*) from local_commerce.order_item_receipt_bindings where project_id='${projectId}' and receipt_id=(select id from local_commerce.media_receipts where project_id='${projectId}' and receipt_reference='${sourceReceipt}')),'snapshots',(select count(*) from local_commerce.order_item_purchase_snapshots s join local_commerce.order_items i on i.project_id=s.project_id and i.id=s.order_item_id where s.project_id='${projectId}' and i.owner_id='${sourceOwner}'));`));
  assert.equal(afterF.orders, beforeF.orders + 1); assert.equal(afterF.bindings, beforeF.bindings + 1); assert.equal(afterF.bindings, 1);
  const F = { releasedAt: fReleasedAt, statuses: fStatuses, orderDelta: 1, receiptBindingCount: 1, noHalfAttach: true, attemptsDistinct: fAttempts[0] !== fAttempts[1] };
  console.info(JSON.stringify({ status: "PASS", task: "11.4-A-D-F-G", run, projectId, workers: { A, B }, AB, CD, F, G1: { invokers: G1.readyFacts, releasedAt: G1.releasedAt, statuses: G1.outcomes.map((o) => o.result.status), sameOperation: true, sameReceipt: true, oneBinding: true, privateBytesEqual: true }, G2: { invokers: G2.readyFacts, releasedAt: G2.releasedAt, statuses, oneLogicalCopy: true }, noHttpCopyRoute: true, noInProcessLock: true, rawAuthorityReported: false }));
} catch (error) { console.error(redact(error?.stack ?? error)); console.error(logs); process.exitCode = 1; }
finally { await stop(workerB); await stop(workerA); await stop(helper); }
