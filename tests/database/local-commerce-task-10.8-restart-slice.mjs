import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";
import { tmpdir } from "node:os";

import { planMigrationLedger, sha256Text } from "../../app/application/local-commerce-migration-ledger.ts";
import { validateProjectMarker } from "../../app/application/local-commerce-environment.ts";
import { catalogTestEnvironment, ids } from "../fixtures/local-persistent-catalog.mjs";

const run = process.argv[2];
assert.equal(run, "run-5576dfd8");
assert.equal(process.argv[3], "--confirm-disposable");

const root = path.resolve(".");
const projectId = `figmemento-local-commerce-test-${run}`;
const workdir = path.join(root, "local/commerce/runtime/disposable", run);
const preparation = JSON.parse(readFileSync(path.join(workdir, "ledger-preparation.json"), "utf8"));
const marker = JSON.parse(readFileSync(path.join(workdir, "project-marker.json"), "utf8"));
const config = preparation.config;

assert.equal(config.projectId, projectId);
assert.equal(config.postgresMajorVersion, 17);
assert.equal(validateProjectMarker(marker, config), true);
assert.equal(sha256Text(JSON.stringify(marker)), preparation.markerDigest);

function command(bin, args, input) {
  const result = spawnSync(bin, args, { input, encoding: "utf8", timeout: 20_000, maxBuffer: 4 * 1024 * 1024 });
  assert.equal(result.error, undefined, `bounded command failed: ${bin}`);
  assert.equal(result.status, 0, (result.stderr ?? "").replace(/eyJ[A-Za-z0-9_.-]+/g, "[redacted]").split("\n")[0]);
  return result.stdout.trim();
}

const containers = command("docker", ["ps", "--filter", `label=com.supabase.cli.workdir=${workdir}`, "--format", "{{.ID}}"]).split("\n").filter(Boolean);
const inspected = JSON.parse(command("docker", ["inspect", ...containers]));
const databases = inspected.filter((value) => value.Config.Labels["com.supabase.cli.workdir"] === workdir
  && value.Name.startsWith("/supabase_db_") && value.State.Running === true);
assert.equal(databases.length, 1);
const database = databases[0].Id;
const sql = (query) => command("docker", ["exec", "-i", database, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], query);

assert.equal(sql(`select local_commerce.verify_project_identity('${projectId}','${preparation.markerDigest}');`), "t");
const manifest = JSON.parse(readFileSync("local/commerce/migrations/manifest.json", "utf8"));
const applied = JSON.parse(sql("select json_agg(json_build_object('version',version,'migrationId',migration_id,'checksum',checksum,'projectId',project_id) order by version) from local_commerce.migration_ledger;"));
assert.equal(applied.length, 37);
for (const migration of manifest.migrations) {
  assert.equal(sha256Text(readFileSync(path.join("local/commerce/migrations", migration.filename), "utf8")), migration.checksum);
}
const plan = planMigrationLedger({ ...manifest, projectId }, applied, projectId);
assert.equal(plan.status, "ready");
assert.equal(plan.apply.length, 0);
assert.equal(sql(`select count(*) from local_commerce.catalog_configuration_snapshots where project_id='${projectId}' and product_id='${ids.product}' and configuration_status='active' and definition->'fields'->0->>'kind'='image';`), "1");

const stack = JSON.parse(command(path.resolve("node_modules/.bin/supabase"), ["status", "--workdir", workdir, "-o", "json"]));

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      assert.ok(address && typeof address === "object");
      const port = address.port;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

const [helperPort, appPortA, appPortB, cdpPort, foreignCdpPort] = await Promise.all(
  Array.from({ length: 5 }, () => freePort()),
);
assert.equal(new Set([helperPort, appPortA, appPortB, cdpPort, foreignCdpPort]).size, 5);

const env = {
  ...process.env,
  ...catalogTestEnvironment({
    LOCAL_COMMERCE_RUN_ID: run,
    LOCAL_COMMERCE_PROJECT_ID: projectId,
    LOCAL_COMMERCE_MARKER_DIGEST: preparation.markerDigest,
    LOCAL_COMMERCE_SERVICE_ROLE_KEY: stack.SERVICE_ROLE_KEY,
    CUSTOMER_AUTH_SOURCE: "local_persistent",
    CART_SOURCE: "local_persistent",
    CUSTOMER_UPLOAD_SOURCE: "local_persistent",
    LOCAL_CHECKOUT_SOURCE: "local_persistent",
    LOCAL_ORDER_SOURCE: "local_persistent",
    LOCAL_PAYMENT_SOURCE: "local_persistent",
    LOCAL_FULFILLMENT_SOURCE: "local_persistent",
    LOCAL_TRACKING_SOURCE: "local_persistent",
    ADMIN_ACCEPTANCE_SOURCE: "local_persistent",
    LOCAL_COMMERCE_IMAGE_HELPER_PORT: String(helperPort),
    LOCAL_COMMERCE_IMAGE_HELPER_URL: `http://127.0.0.1:${helperPort}`,
    LOCAL_COMMERCE_IMAGE_HELPER_SECRET: randomBytes(32).toString("base64url"),
    LOCAL_ORDER_CAPABILITY_SECRET: randomBytes(32).toString("hex"),
    LOCAL_ORDER_CAPABILITY_TTL_SECONDS: "3600",
    PHOTOGIFT_GUEST_DRAFT_OWNER_SECRET: randomBytes(48).toString("base64url"),
    PHOTOGIFT_GUEST_DRAFT_OWNER_CONTEXT_TTL_SECONDS: "3600",
  }),
  CLOUDFLARE_INCLUDE_PROCESS_ENV: "true",
  WRANGLER_SEND_METRICS: "false",
  WRANGLER_WRITE_LOGS: "false",
  LOCAL_COMMERCE_ACCEPTANCE_DISABLE_INSPECTOR: "true",
};
for (const [name, value] of Object.entries({ SHADOW_DB: config.ports.shadowDb, API: config.ports.api,
  DB: config.ports.db, STUDIO: config.ports.studio, SMTP: config.ports.smtp })) {
  env[`LOCAL_COMMERCE_${name}_PORT`] = String(value);
}
for (const [name, value] of Object.entries({ API: config.endpoints.apiUrl, RPC: config.endpoints.rpcUrl,
  STORAGE: config.endpoints.storageUrl })) env[`LOCAL_COMMERCE_${name}_URL`] = value;

const secrets = [stack.SERVICE_ROLE_KEY, stack.ANON_KEY, stack.JWT_SECRET,
  env.LOCAL_COMMERCE_IMAGE_HELPER_SECRET, env.LOCAL_ORDER_CAPABILITY_SECRET,
  env.PHOTOGIFT_GUEST_DRAFT_OWNER_SECRET].filter(Boolean);
function redact(value) {
  let safe = String(value ?? "");
  for (const secret of secrets) safe = safe.split(secret).join("[redacted]");
  return safe.replace(/eyJ[A-Za-z0-9_.-]+/g, "[redacted]");
}

const children = new Set();
let logs = "";
function startNode(args) {
  const child = spawn(process.execPath, args, { cwd: root, env, detached: false, stdio: ["ignore", "pipe", "pipe"] });
  children.add(child);
  for (const stream of [child.stdout, child.stderr]) stream.on("data", (chunk) => { logs += redact(chunk); });
  child.once("exit", () => children.delete(child));
  return child;
}

function processExists(pid) {
  try { process.kill(pid, 0); return true; } catch (error) { return error.code !== "ESRCH"; }
}

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
  for (let attempt = 0; attempt < 80; attempt += 1) {
    assert.equal(child.exitCode, null, "Worker exited before readiness");
    try {
      const response = await fetch(`${origin}/api/customer-auth/session`, { signal: AbortSignal.timeout(1500) });
      await response.arrayBuffer();
      if (response.status === 200) return;
    } catch { /* bounded readiness poll */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.fail("Worker readiness timeout");
}

function exactWorkerIdentity(pid, port) {
  const commandLine = command("ps", ["-p", String(pid), "-o", "command="]);
  assert.match(commandLine, new RegExp(`local-commerce-test-worker\\.mjs ${run} --confirm-disposable ${port}`));
  const cwd = command("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"]);
  assert.match(cwd, new RegExp(`^p${pid}\\nfcwd\\nn${root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m"));
  const listener = command("lsof", ["-nP", "-a", "-p", String(pid), `-iTCP:${port}`, "-sTCP:LISTEN", "-Fn"]);
  assert.match(listener, new RegExp(`^p${pid}$`, "m"));
  assert.match(listener, new RegExp(`^n127\\.0\\.0\\.1:${port}$`, "m"));
  assert.match(logs, new RegExp(`LOCAL_COMMERCE_TEST_LAUNCH.*\\"pid\\":${pid}.*\\"port\\":${port}.*\\"runId\\":\\"${run}\\"`));
  return { pid, port, command: `node tests/database/local-commerce-test-worker.mjs ${run} --confirm-disposable ${port}`,
    cwd: root, run, projectId };
}

async function stopOwned(child, expectedPort) {
  assert.ok(child?.pid && processExists(child.pid));
  exactWorkerIdentity(child.pid, expectedPort);
  const exit = new Promise((resolve) => child.once("exit", (code, signal) => resolve({ code, signal })));
  assert.equal(child.kill("SIGTERM"), true);
  const result = await Promise.race([exit, new Promise((_, reject) => setTimeout(() => reject(new Error("Worker termination timeout")), 15_000))]);
  assert.equal(processExists(child.pid), false);
  assert.equal(await portServes(expectedPort), false);
  return result;
}

const chromeBinary = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browserProfiles = [];
const browserChildren = [];

async function startBrowser(port, initialUrl) {
  const profile = mkdtempSync(path.join(tmpdir(), "figmemento-task108-browser-"));
  browserProfiles.push(profile);
  const browser = spawn(chromeBinary, ["--headless=new", `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--disable-background-networking",
    "--disable-component-update", "--disable-sync", "--metrics-recording-only", initialUrl], { stdio: "ignore" });
  browserChildren.push(browser);
  for (let attempt = 0; attempt < 60; attempt += 1) {
    assert.equal(browser.exitCode, null, "Chrome exited before CDP readiness");
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return { browser, profile, cdpPort: port };
    } catch { /* bounded CDP readiness poll */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.fail("Chrome CDP readiness timeout");
}

async function connectPage(cdpPort) {
  const pages = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`, { signal: AbortSignal.timeout(2000) })).json();
  const page = pages.find((candidate) => candidate.type === "page");
  assert.ok(page?.webSocketDebuggerUrl);
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let nextId = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const value = JSON.parse(event.data);
    if (!value.id || !pending.has(value.id)) return;
    const promise = pending.get(value.id);
    pending.delete(value.id);
    if (value.error) promise.reject(new Error(JSON.stringify(value.error)));
    else promise.resolve(value.result);
  });
  const call = (method, params = {}) => {
    const id = ++nextId;
    socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  };
  await call("Page.enable");
  await call("Runtime.enable");
  await call("Network.enable");
  return { socket, call };
}

async function navigate(cdp, url) {
  await cdp.call("Page.navigate", { url });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await cdp.call("Runtime.evaluate", { expression: "document.readyState", returnByValue: true });
    if (state.result.value === "complete") return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.fail("Browser navigation timeout");
}

async function evaluate(cdp, expression) {
  const result = await cdp.call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  if (result.exceptionDetails) throw new Error(`Browser evaluation failed: ${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text}`);
  return result.result.value;
}

async function cookieSnapshot(cdp) {
  const result = await cdp.call("Network.getAllCookies");
  return result.cookies.filter((cookie) => cookie.domain === "127.0.0.1").map((cookie) => ({
    name: cookie.name, value: cookie.value, domain: cookie.domain, path: cookie.path,
    httpOnly: cookie.httpOnly, secure: cookie.secure, sameSite: cookie.sameSite,
  })).sort((left, right) => left.name.localeCompare(right.name));
}

function publicCookieMetadata(cookies) {
  return cookies.map((cookie) => ({ name: cookie.name, domain: cookie.domain, path: cookie.path,
    httpOnly: cookie.httpOnly, secure: cookie.secure, sameSite: cookie.sameSite }));
}

const sharp = createRequire(path.resolve("local/commerce/image-helper/package.json"))("sharp");
const imageA = await sharp({ create: { width: 64, height: 48, channels: 3, background: "#c4815a" } }).png().toBuffer();
const imageB = await sharp({ create: { width: 80, height: 60, channels: 3, background: "#3c2a1e" } }).png().toBuffer();

const helper = startNode(["local/commerce/image-helper/server.mjs"]);
let workerA;
let workerB;
let primaryCdp;
let foreignCdp;

try {
  workerA = startNode(["tests/database/local-commerce-test-worker.mjs", run, "--confirm-disposable", String(appPortA)]);
  const originA = `http://127.0.0.1:${appPortA}`;
  await waitForApp(originA, workerA);
  const identityA = exactWorkerIdentity(workerA.pid, appPortA);

  await startBrowser(cdpPort, `${originA}/product/synthetic-keepsake`);
  primaryCdp = await connectPage(cdpPort);
  await navigate(primaryCdp, `${originA}/product/synthetic-keepsake`);

  const createKey = randomUUID();
  const uploadKeyA = randomUUID();
  const uploadKeyB = randomUUID();
  const saveKey = randomUUID();
  const cropKeyA = randomUUID();
  const cropKeyB = randomUUID();
  const cropSaveKey = randomUUID();
  const browserCreate = `
    (async () => {
      const productId = ${JSON.stringify(ids.product)};
      const fieldId = ${JSON.stringify(ids.field)};
      const create = await fetch('/api/local-drafts', { method: 'POST', credentials: 'same-origin',
        headers: { 'content-type': 'application/json', 'Idempotency-Key': ${JSON.stringify(createKey)} },
        body: JSON.stringify({ productId }) });
      const draft = await create.json();
      const upload = async (encoded, name, key) => {
        const bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
        const form = new FormData();
        form.append('file', new File([bytes], name, { type: 'image/png' }));
        const response = await fetch('/api/uploads?' + new URLSearchParams({ productId, fieldId,
          draftId: draft.draftId, expectedVersion: String(draft.version) }), {
          method: 'POST', credentials: 'same-origin', headers: { 'Idempotency-Key': key }, body: form });
        return { status: response.status, body: await response.json() };
      };
      const first = await upload(${JSON.stringify(imageA.toString("base64"))}, 'synthetic-a.png', ${JSON.stringify(uploadKeyA)});
      const second = await upload(${JSON.stringify(imageB.toString("base64"))}, 'synthetic-b.png', ${JSON.stringify(uploadKeyB)});
      const savedResponse = await fetch('/api/local-drafts/' + encodeURIComponent(draft.draftId), {
        method: 'PUT', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'Idempotency-Key': ${JSON.stringify(saveKey)} },
        body: JSON.stringify({ expectedVersion: draft.version, slots: [
          { fieldId, receiptReference: second.body.receipt.receiptId },
          { fieldId, receiptReference: first.body.receipt.receiptId }
        ] }) });
      const saved = await savedResponse.json();
      const crop = async (slot, region, key) => {
        const response = await fetch('/api/customer-uploads/preview', { method: 'POST', credentials: 'same-origin',
          headers: { 'content-type': 'application/json', 'Idempotency-Key': key },
          body: JSON.stringify({ productId, fieldId, draftId: saved.draftId, expectedVersion: saved.version,
            receiptId: slot.receiptReference, crop: region }) });
        return { status: response.status, body: await response.json() };
      };
      const regions = [
        { x: 0.1, y: 0.15, width: 0.7, height: 0.65 },
        { x: 0.05, y: 0.1, width: 0.8, height: 0.75 }
      ];
      const croppedA = await crop(saved.slots[0], regions[0], ${JSON.stringify(cropKeyA)});
      const croppedB = await crop(saved.slots[1], regions[1], ${JSON.stringify(cropKeyB)});
      const confirmedResponse = await fetch('/api/local-drafts/' + encodeURIComponent(saved.draftId), {
        method: 'PUT', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'Idempotency-Key': ${JSON.stringify(cropSaveKey)} },
        body: JSON.stringify({ expectedVersion: saved.version, slots: [
          { slotId: saved.slots[0].slotId, fieldId, receiptReference: croppedA.body.receipt.receiptId, crop: regions[0] },
          { slotId: saved.slots[1].slotId, fieldId, receiptReference: croppedB.body.receipt.receiptId, crop: regions[1] }
        ] }) });
      const confirmed = await confirmedResponse.json();
      const restoreResponse = await fetch('/api/local-drafts?productId=' + encodeURIComponent(productId), {
        credentials: 'same-origin', cache: 'no-store' });
      const restored = await restoreResponse.json();
      const previews = [];
      for (const entry of restored.receipts) {
        const response = await fetch('/api/customer-uploads/preview?receiptId=' + encodeURIComponent(entry.receipt.receiptId), {
          credentials: 'same-origin', cache: 'no-store' });
        const bytes = new Uint8Array(await response.arrayBuffer());
        const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(v => v.toString(16).padStart(2, '0')).join('');
        previews.push({ status: response.status, contentType: response.headers.get('content-type'),
          byteLength: bytes.byteLength, digest, slotId: entry.slotId, receiptId: entry.receipt.receiptId });
      }
      return { route: location.pathname, createStatus: create.status, uploadStatuses: [first.status, second.status],
        saveStatus: savedResponse.status, cropStatuses: [croppedA.status, croppedB.status], confirmedStatus: confirmedResponse.status,
        restoreStatus: restoreResponse.status, restored, previews };
    })()
  `;
  const baseline = await evaluate(primaryCdp, browserCreate);
  assert.equal(baseline.route, "/product/synthetic-keepsake");
  assert.equal(baseline.createStatus, 201);
  assert.deepEqual(baseline.uploadStatuses, [201, 201]);
  assert.equal(baseline.saveStatus, 200);
  assert.deepEqual(baseline.cropStatuses, [201, 201]);
  assert.equal(baseline.confirmedStatus, 200);
  assert.equal(baseline.restoreStatus, 200);
  assert.equal(baseline.restored.status, "found");
  assert.equal(baseline.restored.draft.productId, ids.product);
  assert.equal(baseline.restored.draft.slots.length, 2);
  assert.deepEqual(baseline.restored.draft.slots.map((slot) => slot.position), [0, 1]);
  assert.ok(baseline.restored.draft.slots.every((slot) => slot.crop));
  assert.equal(baseline.previews.length, 2);
  assert.ok(baseline.previews.every((preview) => preview.status === 200 && preview.contentType === "image/png"
    && preview.byteLength > 0 && /^[a-f0-9]{64}$/.test(preview.digest)));

  const cookiesA = await cookieSnapshot(primaryCdp);
  const cookieNames = cookiesA.map((cookie) => cookie.name);
  assert.ok(cookieNames.includes("photogift-guest-draft-owner"));
  assert.ok(cookieNames.includes(`photogift-local-draft-${ids.product}`));
  assert.ok(cookiesA.every((cookie) => cookie.httpOnly && cookie.sameSite === "Lax"));

  await evaluate(primaryCdp, `(async()=>{localStorage.clear();sessionStorage.clear();for(const db of await indexedDB.databases())if(db.name)indexedDB.deleteDatabase(db.name);return true})()`);
  const terminationA = await stopOwned(workerA, appPortA);
  workerA = undefined;

  workerB = startNode(["tests/database/local-commerce-test-worker.mjs", run, "--confirm-disposable", String(appPortB)]);
  const originB = `http://127.0.0.1:${appPortB}`;
  await waitForApp(originB, workerB);
  const identityB = exactWorkerIdentity(workerB.pid, appPortB);
  assert.notEqual(identityA.pid, identityB.pid);

  await navigate(primaryCdp, `${originB}/product/synthetic-keepsake`);
  const recovered = await evaluate(primaryCdp, `
    (async()=>{
      const productId=${JSON.stringify(ids.product)};
      const response=await fetch('/api/local-drafts?productId='+encodeURIComponent(productId),{credentials:'same-origin',cache:'no-store'});
      const restored=await response.json();
      const previews=[];
      for(const entry of restored.receipts){
        const media=await fetch('/api/customer-uploads/preview?receiptId='+encodeURIComponent(entry.receipt.receiptId),{credentials:'same-origin',cache:'no-store'});
        const bytes=new Uint8Array(await media.arrayBuffer());
        const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
        previews.push({status:media.status,contentType:media.headers.get('content-type'),byteLength:bytes.byteLength,digest,
          slotId:entry.slotId,receiptId:entry.receipt.receiptId});
      }
      return {route:location.pathname,status:response.status,restored,previews,
        localStorageKeys:Object.keys(localStorage),sessionStorageKeys:Object.keys(sessionStorage),indexedDbCount:(await indexedDB.databases()).length};
    })()
  `);
  assert.equal(recovered.route, "/product/synthetic-keepsake");
  assert.equal(recovered.status, 200);
  assert.deepEqual(recovered.restored, baseline.restored);
  assert.deepEqual(recovered.previews, baseline.previews);
  assert.deepEqual(recovered.localStorageKeys.filter((key) => /draft|receipt|upload|media|slot/i.test(key)), []);
  assert.deepEqual(recovered.sessionStorageKeys, []);
  assert.equal(recovered.indexedDbCount, 0);

  const cookiesB = await cookieSnapshot(primaryCdp);
  assert.deepEqual(cookiesB, cookiesA);

  await startBrowser(foreignCdpPort, `${originB}/product/synthetic-keepsake`);
  foreignCdp = await connectPage(foreignCdpPort);
  await navigate(foreignCdp, `${originB}/product/synthetic-keepsake`);
  const foreignResult = await evaluate(foreignCdp, `
    (async()=>{
      const draft=await fetch('/api/local-drafts?productId='+encodeURIComponent(${JSON.stringify(ids.product)}),{credentials:'same-origin',cache:'no-store'});
      const draftBody=await draft.json();
      const preview=await fetch('/api/customer-uploads/preview?receiptId='+encodeURIComponent(${JSON.stringify(baseline.previews[0].receiptId)}),{credentials:'same-origin',cache:'no-store'});
      await preview.arrayBuffer();
      return {draftStatus:draft.status,draftBody,previewStatus:preview.status};
    })()
  `);
  assert.equal(foreignResult.draftStatus, 200);
  assert.deepEqual(foreignResult.draftBody, { status: "not_found" });
  assert.equal(foreignResult.previewStatus, 404);

  const mediaRows = JSON.parse(sql(`select json_agg(json_build_object('original',o.original_locator,'derivative',o.derivative_locator) order by l.position)
    from local_commerce.draft_media_links l join local_commerce.media_operations o
      on o.project_id=l.project_id and o.owner_id=l.owner_id and o.slot_id=l.id and o.receipt_id=l.receipt_id
    where l.project_id='${projectId}' and l.draft_id='${baseline.restored.draft.draftId}'
      and l.lifecycle='active';`));
  assert.equal(mediaRows.length, 2);
  let retainedObjects = 0;
  for (const row of mediaRows) {
    for (const locator of [row.original, row.derivative]) {
      assert.equal(typeof locator, "string");
      const response = await fetch(`${config.endpoints.storageUrl}/object/info/local-commerce-private/${locator}`, {
        headers: { authorization: `Bearer ${stack.SERVICE_ROLE_KEY}` }, signal: AbortSignal.timeout(5000),
      });
      assert.equal(response.status, 200);
      await response.arrayBuffer();
      retainedObjects += 1;
    }
  }

  const report = {
    status: "PASS",
    classification: "TASK 10.8 CROSS-GROUP DEPENDENCY SLICE ONLY",
    run,
    projectId,
    ledger: "37/37",
    pending: 0,
    processA: identityA,
    processATermination: { requested: "SIGTERM", exit: terminationA, absent: !processExists(identityA.pid), portClosed: !(await portServes(appPortA)) },
    processB: identityB,
    sameSigningConfiguration: true,
    originalBrowserAuthority: { sameCookieValues: true, metadata: publicCookieMetadata(cookiesB) },
    baseline: { draft: baseline.restored.draft, previews: baseline.previews },
    recovered: { draft: recovered.restored.draft, previews: recovered.previews },
    privateStorage: { originalAndDerivedObjectsRetained: retainedObjects === 4, objectCount: retainedObjects },
    foreignOwner: foreignResult,
    exclusions: { relogin: false, fixtureReplay: false, databaseReset: false, storageReset: false,
      migration: false, localStorageAuthority: false, task11_1Complete: false },
  };
  console.info("TASK 10.8 A_TO_B RESTART SLICE PASS", JSON.stringify(report));
} catch (error) {
  console.error("FIRST BLOCKER", redact(error?.stack ?? error));
  console.error(redact(logs).slice(-12_000));
  process.exitCode = 1;
} finally {
  primaryCdp?.socket.close();
  foreignCdp?.socket.close();
  for (const browser of browserChildren) {
    if (browser.exitCode === null) browser.kill("SIGTERM");
  }
  for (const child of [workerA, workerB, helper]) {
    if (child?.exitCode === null && child?.pid && processExists(child.pid)) child.kill("SIGTERM");
  }
  await new Promise((resolve) => setTimeout(resolve, 750));
  for (const profile of browserProfiles) rmSync(profile, { recursive: true, force: true });
}
