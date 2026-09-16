import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { createServer } from "node:net";

import { planMigrationLedger, sha256Text } from "../../app/application/local-commerce-migration-ledger.ts";
import { validateProjectMarker } from "../../app/application/local-commerce-environment.ts";
import { resolveGuestResourceOwner } from "../../app/application/guest-resource-ownership.server.ts";
import { createConfiguredGuestDraftOwnerService } from "../../app/lib/guest-draft-owner.ts";
import { createLocalPersistentMediaAuthority } from "../../app/infrastructure/local-commerce/local-persistent-media-authority.server.ts";
import { catalogTestEnvironment, ids } from "../fixtures/local-persistent-catalog.mjs";

const run = process.argv[2];
assert.equal(run, "run-5576dfd8");
assert.equal(process.argv[3], "--confirm-disposable");
const root = path.resolve(".");
const workdir = path.join(root, "local/commerce/runtime/disposable", run);
const preparation = JSON.parse(readFileSync(path.join(workdir, "ledger-preparation.json"), "utf8"));
const marker = JSON.parse(readFileSync(path.join(workdir, "project-marker.json"), "utf8"));
const config = preparation.config;
assert.equal(config.projectId, "figmemento-local-commerce-test-run-5576dfd8");
assert.equal(config.postgresMajorVersion, 17);
assert.equal(validateProjectMarker(marker, config), true);
assert.equal(sha256Text(JSON.stringify(marker)), preparation.markerDigest);

function command(bin, args, input) {
  const result = spawnSync(bin, args, { input, encoding: "utf8", timeout: 10000, maxBuffer: 4 * 1024 * 1024 });
  assert.equal(result.error, undefined, "bounded local command failed");
  assert.equal(result.status, 0, (result.stderr ?? "").replace(/eyJ[A-Za-z0-9_.-]+/g, "[redacted]").split("\n")[0]);
  return result.stdout.trim();
}
const candidates = command("docker", ["ps", "--filter", `label=com.supabase.cli.workdir=${workdir}`, "--format", "{{.ID}}"]).split("\n").filter(Boolean);
const inspected = JSON.parse(command("docker", ["inspect", ...candidates]));
const databases = inspected.filter(value => value.Config.Labels["com.supabase.cli.workdir"] === workdir && value.Name.startsWith("/supabase_db_"));
assert.equal(databases.length, 1);
const database = databases[0].Id;
const sql = query => command("docker", ["exec", "-i", database, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], query);
assert.equal(sql(`select local_commerce.verify_project_identity('${config.projectId}','${preparation.markerDigest}');`), "t");
const manifest = JSON.parse(readFileSync("local/commerce/migrations/manifest.json", "utf8"));
const applied = JSON.parse(sql("select json_agg(json_build_object('version',version,'migrationId',migration_id,'checksum',checksum,'projectId',project_id) order by version) from local_commerce.migration_ledger;"));
assert.equal(applied.length, 37);
for (const migration of manifest.migrations) assert.equal(sha256Text(readFileSync(path.join("local/commerce/migrations", migration.filename), "utf8")), migration.checksum);
const plan = planMigrationLedger({ ...manifest, projectId: config.projectId }, applied, config.projectId);
assert.equal(plan.status, "ready");
assert.equal(plan.apply.length, 0);

const info = JSON.parse(command(path.resolve("node_modules/.bin/supabase"), ["status", "--workdir", workdir, "-o", "json"]));
const env = { ...process.env, ...catalogTestEnvironment({
  LOCAL_COMMERCE_RUN_ID: run, LOCAL_COMMERCE_PROJECT_ID: config.projectId,
  LOCAL_COMMERCE_MARKER_DIGEST: preparation.markerDigest, LOCAL_COMMERCE_SERVICE_ROLE_KEY: info.SERVICE_ROLE_KEY,
  CUSTOMER_AUTH_SOURCE: "local_persistent", CART_SOURCE: "local_persistent", CUSTOMER_UPLOAD_SOURCE: "local_persistent",
  LOCAL_CHECKOUT_SOURCE: "local_persistent", LOCAL_ORDER_SOURCE: "disabled", LOCAL_PAYMENT_SOURCE: "disabled",
  LOCAL_FULFILLMENT_SOURCE: "disabled", LOCAL_TRACKING_SOURCE: "disabled", ADMIN_ACCEPTANCE_SOURCE: "local_fake",
  LOCAL_COMMERCE_IMAGE_HELPER_SECRET: randomBytes(32).toString("base64url"),
  PHOTOGIFT_GUEST_DRAFT_OWNER_SECRET: randomBytes(48).toString("base64url"),
  PHOTOGIFT_GUEST_DRAFT_OWNER_CONTEXT_TTL_SECONDS: "3600",
}), CLOUDFLARE_INCLUDE_PROCESS_ENV: "true", WRANGLER_SEND_METRICS: "false", WRANGLER_WRITE_LOGS: "false",
  LOCAL_COMMERCE_ACCEPTANCE_DISABLE_INSPECTOR: "true" };
for (const [key, value] of Object.entries({ SHADOW_DB: config.ports.shadowDb, API: config.ports.api, DB: config.ports.db,
  STUDIO: config.ports.studio, SMTP: config.ports.smtp, IMAGE_HELPER: config.ports.imageHelper })) env[`LOCAL_COMMERCE_${key}_PORT`] = String(value);
for (const [key, value] of Object.entries({ API: config.endpoints.apiUrl, RPC: config.endpoints.rpcUrl,
  STORAGE: config.endpoints.storageUrl, IMAGE_HELPER: config.endpoints.imageHelperUrl })) env[`LOCAL_COMMERCE_${key}_URL`] = value;
assert.equal(sql(`select count(*) from local_commerce.catalog_configuration_snapshots where project_id='${config.projectId}' and product_id='${ids.product}' and configuration_status='active' and definition->'fields'->0->>'kind'='image';`), "1");

const appPort = config.ports.imageHelper + 1;
for (const port of [config.ports.imageHelper, appPort]) await new Promise((resolve, reject) => {
  const server = createServer(); server.once("error", reject); server.listen(port, "127.0.0.1", () => server.close(resolve));
});
const origin = `http://127.0.0.1:${appPort}`;
const children = [];
let logs = "";
function start(args) {
  const child = spawn(process.execPath, args, { cwd: root, env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
  children.push(child);
  for (const stream of [child.stdout, child.stderr]) stream.on("data", chunk => { logs = (logs + chunk.toString()).slice(-30000); });
  return child;
}
async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise(resolve => child.once("exit", resolve));
  process.kill(-child.pid, "SIGTERM");
  await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 5000))]);
  if (child.exitCode === null && child.signalCode === null) { process.kill(-child.pid, "SIGKILL"); await exited; }
}
function cookiePairs(response) {
  const values = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie") ?? ""];
  return values.flatMap(value => value.split(/,(?=[^;,=\s]+=[^;,]*)/)).map(value => value.split(";", 1)[0].trim()).filter(Boolean);
}
function cookie(response) { return cookiePairs(response).join("; "); }
function cookieNamed(value, name) { return value.split(";").map(part => part.trim()).find(part => part.startsWith(`${name}=`)) ?? ""; }
function withoutCookie(value, name) { return value.split(";").map(part => part.trim()).filter(part => part && !part.startsWith(`${name}=`)).join("; "); }
function safe(value) { assert.doesNotMatch(JSON.stringify(value), /operationId|ownerId|customerId|locator|bucket|object.?key|service.?role|command.*digest/i); }
async function createDraft(key, selectedCookie = "", productId = ids.product, selectedOrigin = origin) {
  return fetch(`${origin}/api/local-drafts`, { method: "POST", headers: { origin: selectedOrigin, "sec-fetch-site": "same-origin",
    "content-type": "application/json", "idempotency-key": key, ...(selectedCookie ? { cookie: selectedCookie } : {}) },
    body: JSON.stringify({ productId }), signal: AbortSignal.timeout(15000) });
}
async function readDraft(draftId, selectedCookie) {
  return fetch(`${origin}/api/local-drafts/${draftId}`, { headers: { cookie: selectedCookie, "sec-fetch-site": "same-origin" }, signal: AbortSignal.timeout(15000) });
}
async function restoreDraft(productId, selectedCookie) {
  return fetch(`${origin}/api/local-drafts?productId=${productId}`, { headers: { cookie: selectedCookie,
    "sec-fetch-site": "same-origin" }, signal: AbortSignal.timeout(30000) });
}
async function saveDraft(draftId, expectedVersion, slots, key, selectedCookie) {
  return fetch(`${origin}/api/local-drafts/${draftId}`, { method: "PUT", headers: { origin, "sec-fetch-site": "same-origin",
    cookie: selectedCookie, "content-type": "application/json", "idempotency-key": key },
    body: JSON.stringify({ expectedVersion, slots }), signal: AbortSignal.timeout(15000) });
}
function upload(draft, key, selectedCookie, bytes, mode) {
  const form = new FormData(); form.set("file", new File([bytes], "task-10.4.png", { type: "image/png" }));
  const query = new URLSearchParams({ productId: draft.productId ?? ids.product, fieldId: ids.field, draftId: draft.draftId,
    expectedVersion: String(draft.version) });
  return fetch(`${origin}/api/uploads?${query}`, { method: "POST", headers: { origin, "sec-fetch-site": "same-origin",
    cookie: selectedCookie, "idempotency-key": key, ...(mode === "recovery" ? { "x-upload-recovery": "1" } : {}),
    ...(mode === "release" ? { "x-upload-release": "1" } : {}) }, body: form, signal: AbortSignal.timeout(30000) });
}
async function auth(pathname, body, selectedCookie = "") {
  return fetch(`${origin}/api/customer-auth/${pathname}`, { method: "POST", headers: { origin,
    "sec-fetch-site": "same-origin", ...(body ? { "content-type": "application/json" } : {}),
    ...(selectedCookie ? { cookie: selectedCookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15000) });
}
const binding = key => JSON.parse(sql(`select coalesce(json_agg(json_build_object('operation',b.operation_id,'receipt',r.receipt_reference,'lifecycle',r.lifecycle)), '[]') from local_commerce.media_upload_command_bindings b join local_commerce.media_operations o on o.project_id=b.project_id and o.id=b.operation_id left join local_commerce.media_receipts r on r.project_id=o.project_id and r.id=o.receipt_id where b.project_id='${config.projectId}' and b.key_digest='${createHash("sha256").update(key.toLowerCase()).digest("hex")}';`));
const operation = id => JSON.parse(sql(`select row_to_json(o) from local_commerce.media_operations o where project_id='${config.projectId}' and id='${id}';`));

try {
  const helper = start(["local/commerce/image-helper/server.mjs"]);
  let worker = start(["tests/database/local-commerce-test-worker.mjs", run, "--confirm-disposable", String(appPort)]);
  for (let attempt = 0; attempt < 40; attempt++) {
    assert.equal(helper.exitCode, null); assert.equal(worker.exitCode, null);
    try { const ready = await fetch(`${origin}/api/customer-auth/session`, { signal: AbortSignal.timeout(2000) }); await ready.arrayBuffer(); if (ready.status === 200) break; }
    catch { /* bounded readiness poll */ }
    if (attempt === 39) assert.fail("Task 10.4 Worker readiness timeout");
    await new Promise(resolve => setTimeout(resolve, 750));
  }
  const sharp = createRequire(path.resolve("local/commerce/image-helper/package.json"))("sharp");
  const bytes = await sharp({ create: { width: 16, height: 12, channels: 3, background: "#c4815a" } }).png().toBuffer();
  const changedBytes = await sharp({ create: { width: 16, height: 12, channels: 3, background: "#3c2a1e" } }).png().toBuffer();

  const memberCredentials = { email: `task-10.4-${randomUUID()}@example.test`, password: "local-only-password" };
  const memberSignup = await auth("sign-up", memberCredentials); assert.equal(memberSignup.status, 200, await memberSignup.clone().text());
  const memberCookie = cookie(memberSignup); assert.ok(memberCookie); await memberSignup.arrayBuffer();
  const memberDraftResponse = await createDraft(randomUUID(), memberCookie); assert.equal(memberDraftResponse.status, 201);
  const memberDraftCookies = cookie(memberDraftResponse); const memberDraft = await memberDraftResponse.json(); safe(memberDraft);
  const memberJar = `${memberCookie}; ${memberDraftCookies}`;
  const memberRestore = await restoreDraft(ids.product, memberJar); assert.equal(memberRestore.status, 200);
  assert.equal((await memberRestore.json()).draft.draftId, memberDraft.draftId);
  const otherMemberSignup = await auth("sign-up", { email: `task-10.4-${randomUUID()}@example.test`, password: "local-only-password" });
  assert.equal(otherMemberSignup.status, 200); const otherMemberCookie = cookie(otherMemberSignup); await otherMemberSignup.arrayBuffer();
  const otherMemberRead = await readDraft(memberDraft.draftId, otherMemberCookie); assert.equal(otherMemberRead.status, 404); await otherMemberRead.arrayBuffer();
  const selectorName = `photogift-local-draft-${ids.product}`;
  const forgedMemberRestore = await restoreDraft(ids.product,
    `${otherMemberCookie}; ${cookieNamed(memberDraftCookies, selectorName)}`);
  assert.equal(forgedMemberRestore.status, 200); assert.deepEqual(await forgedMemberRestore.json(), { status: "not_found" });
  const memberUploadKey = randomUUID();
  const memberUpload = await upload(memberDraft, memberUploadKey, memberCookie, bytes); assert.equal(memberUpload.status, 201);
  await memberUpload.arrayBuffer();
  const memberRelease = await upload(memberDraft, memberUploadKey, memberCookie, bytes, "release"); assert.equal(memberRelease.status, 204); await memberRelease.arrayBuffer();
  const memberSignout = await auth("sign-out", null, memberCookie); assert.equal(memberSignout.status, 200); await memberSignout.arrayBuffer();
  const revokedMemberRead = await readDraft(memberDraft.draftId, memberCookie); assert.equal(revokedMemberRead.status, 404); await revokedMemberRead.arrayBuffer();

  const beforeCrossOrigin = Number(sql(`select count(*) from local_commerce.configuration_drafts where project_id='${config.projectId}';`));
  const deniedOrigin = await createDraft(randomUUID(), "", ids.product, "https://attacker.invalid"); assert.equal(deniedOrigin.status, 403); await deniedOrigin.arrayBuffer();
  assert.equal(Number(sql(`select count(*) from local_commerce.configuration_drafts where project_id='${config.projectId}';`)), beforeCrossOrigin);

  const createKey = randomUUID();
  const createdResponse = await createDraft(createKey); assert.equal(createdResponse.status, 201, await createdResponse.clone().text());
  const guestCookie = cookie(createdResponse); assert.ok(guestCookie); assert.match(guestCookie, /photogift-local-draft-/);
  const draft = await createdResponse.json(); safe(draft); assert.equal(draft.productId, ids.product); assert.equal(draft.version, 1); assert.deepEqual(draft.slots, []);
  const createReplay = await createDraft(createKey, guestCookie); assert.equal(createReplay.status, 201); assert.deepEqual(await createReplay.json(), draft);
  const read = await readDraft(draft.draftId, guestCookie); assert.equal(read.status, 200); assert.deepEqual(await read.json(), draft);

  const foreignCreate = await createDraft(randomUUID()); assert.equal(foreignCreate.status, 201);
  const foreignCookie = cookie(foreignCreate); await foreignCreate.arrayBuffer();
  const foreignRead = await readDraft(draft.draftId, foreignCookie); assert.equal(foreignRead.status, 404); await foreignRead.arrayBuffer();

  const uploadKey = randomUUID();
  const original = await upload(draft, uploadKey, guestCookie, bytes); assert.equal(original.status, 201, await original.clone().text());
  await original.body.cancel();
  const committed = binding(uploadKey); assert.equal(committed.length, 1); assert.ok(committed[0].receipt);
  const recovered = await upload(draft, uploadKey, guestCookie, bytes, "recovery"); assert.equal(recovered.status, 201);
  const recoveredBody = await recovered.json(); safe(recoveredBody); assert.equal(recoveredBody.receipt.receiptId, committed[0].receipt);
  assert.deepEqual((await (await readDraft(draft.draftId, guestCookie)).json()).slots, []);

  const saveKey = randomUUID();
  const savedResponse = await saveDraft(draft.draftId, draft.version, [{ fieldId: ids.field,
    receiptReference: recoveredBody.receipt.receiptId }], saveKey, guestCookie);
  assert.equal(savedResponse.status, 200, await savedResponse.clone().text());
  const saved = await savedResponse.json(); safe(saved); assert.equal(saved.version, 2); assert.equal(saved.slots.length, 1); assert.match(saved.slots[0].slotId, /^[a-f0-9-]{36}$/i);
  const saveReplay = await saveDraft(draft.draftId, draft.version, [{ fieldId: ids.field,
    receiptReference: recoveredBody.receipt.receiptId }], saveKey, guestCookie);
  assert.equal(saveReplay.status, 200); assert.deepEqual(await saveReplay.json(), saved);
  const stale = await saveDraft(draft.draftId, draft.version, [], randomUUID(), guestCookie); assert.equal(stale.status, 409); await stale.arrayBuffer();

  const staleKey = randomUUID();
  const staleUpload = await upload(saved, staleKey, guestCookie, bytes); assert.equal(staleUpload.status, 201);
  const staleReceipt = (await staleUpload.json()).receipt.receiptId;
  const independentKey = randomUUID();
  const independentUpload = await upload(saved, independentKey, guestCookie, bytes); assert.equal(independentUpload.status, 201);
  const independentReceipt = (await independentUpload.json()).receipt.receiptId;
  assert.notEqual(staleReceipt, independentReceipt);
  const release = await upload(saved, staleKey, guestCookie, bytes, "release"); assert.equal(release.status, 204); await release.arrayBuffer();
  const releaseReplay = await upload(saved, staleKey, guestCookie, bytes, "release"); assert.equal(releaseReplay.status, 204); await releaseReplay.arrayBuffer();
  assert.equal(binding(staleKey)[0].lifecycle, "removed"); assert.equal(binding(independentKey)[0].lifecycle, "active");
  const independentPreview = await fetch(`${origin}/api/customer-uploads/preview?receiptId=${independentReceipt}`, { headers: { cookie: guestCookie }, signal: AbortSignal.timeout(15000) });
  assert.equal(independentPreview.status, 200); await independentPreview.arrayBuffer();

  const orderedSave = await saveDraft(saved.draftId, saved.version, [
    { fieldId: ids.field, receiptReference: independentReceipt },
    { slotId: saved.slots[0].slotId, fieldId: ids.field, receiptReference: recoveredBody.receipt.receiptId },
  ], randomUUID(), guestCookie);
  assert.equal(orderedSave.status, 200, await orderedSave.clone().text());
  const ordered = await orderedSave.json(); assert.equal(ordered.version, 3); assert.equal(ordered.slots.length, 2);

  const guestContext = decodeURIComponent(cookieNamed(guestCookie, "photogift-guest-draft-owner").split("=")[1]);
  const verifyGuest = async () => {
    const verified = await resolveGuestResourceOwner({ projectId: config.projectId, context: guestContext,
      ownerService: createConfiguredGuestDraftOwnerService(env) });
    return verified.status === "authorized" ? { owner: verified.owner, expiresAt: verified.owner.expiresAt } : null;
  };
  const mediaAuthority = createLocalPersistentMediaAuthority(env, verifyGuest);
  const independentCrop = { x: 0.1, y: 0.2, width: 0.7, height: 0.6 };
  const recoveredCrop = { x: 0, y: 0, width: 1, height: 1 };
  const croppedIndependent = await mediaAuthority.accept({ draftId: ordered.draftId, expectedVersion: ordered.version,
    fieldId: ids.field, slotId: ordered.slots[0].slotId, originalReceiptId: independentReceipt,
    crop: independentCrop, bytes: new Uint8Array() });
  assert.equal(croppedIndependent.status, "found", JSON.stringify(croppedIndependent));
  const croppedRecovered = await mediaAuthority.accept({ draftId: ordered.draftId, expectedVersion: ordered.version,
    fieldId: ids.field, slotId: ordered.slots[1].slotId, originalReceiptId: recoveredBody.receipt.receiptId,
    crop: recoveredCrop, bytes: new Uint8Array() });
  assert.equal(croppedRecovered.status, "found", JSON.stringify(croppedRecovered));
  const cropSave = await saveDraft(ordered.draftId, ordered.version, [
    { slotId: croppedIndependent.slotId, fieldId: ids.field, receiptReference: croppedIndependent.receipt.receiptId, crop: independentCrop },
    { slotId: croppedRecovered.slotId, fieldId: ids.field, receiptReference: croppedRecovered.receipt.receiptId, crop: recoveredCrop },
  ], randomUUID(), guestCookie);
  assert.equal(cropSave.status, 200, await cropSave.clone().text());
  const confirmedTwo = await cropSave.json(); assert.equal(confirmedTwo.version, 4); assert.equal(confirmedTwo.slots.length, 2);
  assert.equal(confirmedTwo.slots[0].receiptReference, croppedIndependent.receipt.receiptId);
  assert.deepEqual(confirmedTwo.slots.map(slot => slot.position), [0, 1]);
  assert.deepEqual(confirmedTwo.slots.map(slot => slot.crop), [
    independentCrop, recoveredCrop,
  ]);
  const uploadBindingsBeforeRestore = Number(sql(`select count(*) from local_commerce.media_upload_command_bindings where project_id='${config.projectId}';`));
  const restoredResponse = await restoreDraft(ids.product, guestCookie); assert.equal(restoredResponse.status, 200, await restoredResponse.clone().text());
  assert.match(restoredResponse.headers.get("cache-control") ?? "", /no-store/);
  const restored = await restoredResponse.json(); safe(restored); assert.equal(restored.status, "found");
  assert.deepEqual(restored.draft, confirmedTwo); assert.equal(restored.receipts.length, 2);
  assert.deepEqual(restored.receipts.map(entry => entry.slotId), confirmedTwo.slots.map(slot => slot.slotId));
  assert.ok(restored.receipts.every(entry => entry.status === "found" && entry.receipt.lifecycle === "active"));
  assert.equal(Number(sql(`select count(*) from local_commerce.media_upload_command_bindings where project_id='${config.projectId}';`)), uploadBindingsBeforeRestore);
  for (const entry of restored.receipts) {
    const preview = await fetch(`${origin}/api/customer-uploads/preview?receiptId=${entry.receipt.receiptId}`,
      { headers: { cookie: guestCookie }, signal: AbortSignal.timeout(15000) });
    assert.equal(preview.status, 200); assert.match(preview.headers.get("cache-control") ?? "", /private|no-store/);
    await preview.arrayBuffer();
  }
  const forgedGuestRestore = await restoreDraft(ids.product,
    `${withoutCookie(foreignCookie, selectorName)}; ${cookieNamed(guestCookie, selectorName)}`);
  assert.equal(forgedGuestRestore.status, 200); assert.deepEqual(await forgedGuestRestore.json(), { status: "not_found" });
  const loginTransitionRestore = await restoreDraft(ids.product,
    `${memberCookie}; ${cookieNamed(guestCookie, selectorName)}`);
  assert.equal(loginTransitionRestore.status, 200); assert.deepEqual(await loginTransitionRestore.json(), { status: "not_found" });
  const noSelectorRestore = await restoreDraft(ids.product, cookieNamed(guestCookie, "photogift-guest-draft-owner"));
  assert.equal(noSelectorRestore.status, 200); assert.deepEqual(await noSelectorRestore.json(), { status: "not_found" });

  const firstWorkerPid = worker.pid;
  await stop(worker);
  worker = start(["tests/database/local-commerce-test-worker.mjs", run, "--confirm-disposable", String(appPort)]);
  for (let attempt = 0; attempt < 40; attempt++) {
    assert.equal(helper.exitCode, null); assert.equal(worker.exitCode, null);
    try { const ready = await fetch(`${origin}/api/customer-auth/session`, { signal: AbortSignal.timeout(2000) }); await ready.arrayBuffer(); if (ready.status === 200) break; }
    catch { /* bounded readiness poll */ }
    if (attempt === 39) assert.fail("Task 10.5 restarted Worker readiness timeout");
    await new Promise(resolve => setTimeout(resolve, 750));
  }
  const restartedRestoreResponse = await restoreDraft(ids.product, guestCookie);
  assert.equal(restartedRestoreResponse.status, 200, await restartedRestoreResponse.clone().text());
  const restartedRestore = await restartedRestoreResponse.json();
  assert.deepEqual(restartedRestore, restored); assert.notEqual(firstWorkerPid, worker.pid);

  const changedRelease = await upload(saved, staleKey, guestCookie, changedBytes, "release"); assert.equal(changedRelease.status, 409); await changedRelease.arrayBuffer();
  const wrongDraftResponse = await createDraft(randomUUID(), guestCookie); assert.equal(wrongDraftResponse.status, 201);
  const wrongDraft = await wrongDraftResponse.json();
  const wrongDraftRelease = await upload(wrongDraft, staleKey, guestCookie, bytes, "release"); assert.equal(wrongDraftRelease.status, 409); await wrongDraftRelease.arrayBuffer();
  const wrongProduct = { ...saved, productId: randomUUID() };
  const wrongProductRelease = await upload(wrongProduct, staleKey, guestCookie, bytes, "release"); assert.ok([404, 503].includes(wrongProductRelease.status)); await wrongProductRelease.arrayBuffer();
  const wrongOwnerRelease = await upload(saved, staleKey, foreignCookie, bytes, "release"); assert.equal(wrongOwnerRelease.status, 404); await wrongOwnerRelease.arrayBuffer();
  const noOwnerRelease = await upload(saved, staleKey, "", bytes, "release"); assert.equal(noOwnerRelease.status, 404); await noOwnerRelease.arrayBuffer();
  const unknownKey = randomUUID(); const bindingsBefore = Number(sql(`select count(*) from local_commerce.media_upload_command_bindings where project_id='${config.projectId}';`));
  const unknownRelease = await upload(saved, unknownKey, guestCookie, bytes, "release"); assert.equal(unknownRelease.status, 503); await unknownRelease.arrayBuffer();
  assert.equal(Number(sql(`select count(*) from local_commerce.media_upload_command_bindings where project_id='${config.projectId}';`)), bindingsBefore);
  assert.deepEqual(binding(unknownKey), []);

  const retainedKey = randomUUID();
  const retainedUpload = await upload(confirmedTwo, retainedKey, guestCookie, bytes); assert.equal(retainedUpload.status, 201);
  await retainedUpload.arrayBuffer();
  const retainedBinding = binding(retainedKey)[0]; const retainedOperation = operation(retainedBinding.operation);
  const retainedOrderId = randomUUID(); const retainedItemId = randomUUID();
  sql(`begin;
    insert into local_commerce.orders(project_id,id,owner_id,public_reference) values('${config.projectId}','${retainedOrderId}','${retainedOperation.owner_id}','FM-SYNTHETIC-${randomUUID().toUpperCase()}');
    insert into local_commerce.order_items(project_id,id,order_id,owner_id,item_sequence) values('${config.projectId}','${retainedItemId}','${retainedOrderId}','${retainedOperation.owner_id}',0);
    insert into local_commerce.order_item_receipt_bindings(project_id,order_item_id,receipt_id,owner_id) values('${config.projectId}','${retainedItemId}','${retainedOperation.receipt_id}','${retainedOperation.owner_id}');
    commit;`);
  const retainedRelease = await upload(confirmedTwo, retainedKey, guestCookie, bytes, "release"); assert.equal(retainedRelease.status, 204); await retainedRelease.arrayBuffer();
  for (const locator of [retainedOperation.original_locator, retainedOperation.derivative_locator]) {
    const objectInfo = await fetch(`${config.endpoints.storageUrl}/object/info/local-commerce-private/${locator}`, {
      headers: { authorization: `Bearer ${info.SERVICE_ROLE_KEY}` }, signal: AbortSignal.timeout(5000) });
    assert.equal(objectInfo.status, 200); await objectInfo.arrayBuffer();
  }
  assert.equal(sql(`select count(*) from local_commerce.media_cleanup_leases where project_id='${config.projectId}' and operation_id='${retainedOperation.id}';`), "0");

  const changedSave = await saveDraft(draft.draftId, draft.version, [], saveKey, guestCookie); assert.equal(changedSave.status, 409); await changedSave.arrayBuffer();
  for (const key of [createKey, uploadKey, saveKey, staleKey, independentKey]) {
    assert.equal(sql(`select count(*) from local_commerce.media_upload_command_bindings where project_id='${config.projectId}' and key_digest='${key}';`), "0");
  }
  console.info("TASK 10.4/10.5 REAL HTTP/DB PASS", JSON.stringify({ runId: run, projectId: config.projectId,
    ledger: "37/37", pending: 0, workerPid: worker.pid, helperPid: helper.pid,
    draft: { create: 201, replay: 201, read: 200, save: 200, conflict: 409 },
    upload: { lostResponseRecovery: 201, exactReceipt: true, staleRelease: 204, releaseReplay: 204,
      independentReceipts: true, unknownReleaseCreates: 0 }, security: { csrf: 403, wrongOwner: 404, noOwner: 404,
      foreignMember: 404, revokedMember: 404, wrongDraft: 409 }, cleanup: { orderAttachedBytesRetained: true },
    refresh: { exactDraft: true, slots: 2, order: true, crops: true, privatePreviews: 2,
      uploadBindingsCreated: 0, forgedGuest: "not_found", forgedMember: "not_found", loginTransition: "not_found",
      processRestart: { firstWorkerPid, secondWorkerPid: worker.pid, recovered: true } } }));
} catch (error) {
  let safeLogs = logs;
  for (const secret of [info.SERVICE_ROLE_KEY, info.ANON_KEY, info.JWT_SECRET, env.LOCAL_COMMERCE_IMAGE_HELPER_SECRET,
    env.PHOTOGIFT_GUEST_DRAFT_OWNER_SECRET]) if (secret) safeLogs = safeLogs.split(secret).join("[redacted]");
  console.error("FIRST BLOCKER", error.message);
  console.error(safeLogs.replace(/eyJ[A-Za-z0-9_.-]+/g, "[redacted]").slice(-8000));
  process.exitCode = 1;
} finally {
  for (const child of children) await stop(child);
}
