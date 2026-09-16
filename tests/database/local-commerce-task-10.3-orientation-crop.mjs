import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";

import { createProductCustomizationCropEditorValues, parseProductCustomizationCropEditorValues } from "../../app/application/product-customization-crop-editor.ts";
import { sha256Text, planMigrationLedger } from "../../app/application/local-commerce-migration-ledger.ts";
import { ensureGuestResourceOwner, resolveGuestResourceOwner } from "../../app/application/guest-resource-ownership.server.ts";
import { createLocalPersistentDraftPort } from "../../app/infrastructure/local-commerce/local-persistent-draft-adapter.server.ts";
import { createLocalPersistentMediaAuthority } from "../../app/infrastructure/local-commerce/local-persistent-media-authority.server.ts";
import { createConfiguredGuestDraftOwnerService, getGuestDraftOwnerCookieName } from "../../app/lib/guest-draft-owner.ts";
import { POST } from "../../app/api/uploads/route.ts";
import { GET } from "../../app/api/customer-uploads/preview/route.ts";
import { createLocalImageHelper } from "../../local/commerce/image-helper/server.mjs";
import { catalogDatabaseRows, catalogTestEnvironment, ids } from "../fixtures/local-persistent-catalog.mjs";

const run = process.env.LOCAL_COMMERCE_ACCEPTANCE_RUN;
const expectedRun = "run-5576dfd8";
const dir = path.resolve("local/commerce/runtime/disposable", expectedRun);
const command = (bin, args, input) => {
  const result = spawnSync(bin, args, { input, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr?.replace(/eyJ[A-Za-z0-9_.-]+/g, "[redacted]"));
  return result.stdout.trim();
};
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

test("Task 10.3 orientation-normalized trusted server crop preview matches normalized editor crop", async () => {
  assert.equal(run, expectedRun);
  const preparation = JSON.parse(readFileSync(path.join(dir, "ledger-preparation.json"), "utf8"));
  const config = preparation.config;
  assert.equal(config.projectId, "figmemento-local-commerce-test-run-5576dfd8");
  assert.equal(config.postgresMajorVersion, 17);
  const names = command("docker", ["ps", "--filter", `label=com.supabase.cli.workdir=${dir}`, "--format", "{{.Names}}"]).split("\n");
  const db = names.filter((name) => name.startsWith("supabase_db_"));
  assert.equal(db.length, 1);
  const sql = (query) => command("docker", ["exec", "-i", db[0], "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], query);
  assert.equal(sql(`select local_commerce.verify_project_identity('${config.projectId}','${preparation.markerDigest}');`), "t");
  const manifest = JSON.parse(readFileSync("local/commerce/migrations/manifest.json", "utf8"));
  const applied = JSON.parse(sql("select json_agg(json_build_object('version',version,'migrationId',migration_id,'checksum',checksum,'projectId',project_id) order by version) from local_commerce.migration_ledger;"));
  assert.equal(applied.length, 37);
  for (const migration of manifest.migrations) {
    assert.equal(sha256Text(readFileSync(path.join("local/commerce/migrations", migration.filename), "utf8")), migration.checksum);
  }
  const plan = planMigrationLedger({ ...manifest, projectId: config.projectId }, applied, config.projectId);
  assert.equal(plan.status, "ready");
  assert.equal(plan.apply.length, 0);

  const status = JSON.parse(command(path.resolve("node_modules/.bin/supabase"), ["status", "--workdir", dir, "-o", "json"]));
  const env = catalogTestEnvironment({
    LOCAL_COMMERCE_RUN_ID: expectedRun,
    LOCAL_COMMERCE_PROJECT_ID: config.projectId,
    LOCAL_COMMERCE_MARKER_DIGEST: preparation.markerDigest,
    LOCAL_COMMERCE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
    CART_SOURCE: "local_persistent",
    CUSTOMER_AUTH_SOURCE: "local_persistent",
    CUSTOMER_UPLOAD_SOURCE: "local_persistent",
    LOCAL_COMMERCE_IMAGE_HELPER_SECRET: randomBytes(32).toString("base64url"),
    PHOTOGIFT_GUEST_DRAFT_OWNER_SECRET: `${randomUUID()}${randomUUID()}`,
    PHOTOGIFT_GUEST_DRAFT_OWNER_CONTEXT_TTL_SECONDS: "3600",
  });
  for (const [key, value] of Object.entries({ SHADOW_DB: config.ports.shadowDb, API: config.ports.api, DB: config.ports.db, STUDIO: config.ports.studio, SMTP: config.ports.smtp, IMAGE_HELPER: config.ports.imageHelper })) {
    env[`LOCAL_COMMERCE_${key}_PORT`] = String(value);
  }
  env.LOCAL_COMMERCE_API_URL = config.endpoints.apiUrl;
  env.LOCAL_COMMERCE_RPC_URL = config.endpoints.rpcUrl;
  env.LOCAL_COMMERCE_STORAGE_URL = config.endpoints.storageUrl;
  env.LOCAL_COMMERCE_IMAGE_HELPER_URL = config.endpoints.imageHelperUrl;
  Object.assign(process.env, env);

  const serviceHeaders = { apikey: status.ANON_KEY, authorization: `Bearer ${status.SERVICE_ROLE_KEY}`, "Content-Type": "application/json", "Content-Profile": "local_commerce" };
  const rows = catalogDatabaseRows(config.projectId);
  rows.products[0].fulfillment_definition.requiresProductionPreview = true;
  rows.configurations[0].definition.fields = [{
    ...rows.configurations[0].definition.fields[0],
    kind: "image",
    code: "photo",
    label: "Synthetic oriented photo",
    constraints: { allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"], maxBytes: 1048576, minDimensions: { width: 1, height: 1 }, minImageCount: 0, maxImageCount: 4, cropEnabled: true },
  }];
  for (const [key, table] of [["categories", "catalog_categories"], ["products", "catalog_products"], ["variants", "catalog_variants"], ["configurations", "catalog_configuration_snapshots"], ["rules", "catalog_pricing_rules"]]) {
    const response = await fetch(`${config.endpoints.apiUrl}/rest/v1/${table}`, { method: "POST", headers: { ...serviceHeaders, Prefer: "resolution=ignore-duplicates" }, body: JSON.stringify(rows[key]) });
    assert.equal(response.status, 201, table);
  }

  const helper = createLocalImageHelper(env).server;
  await new Promise((resolve, reject) => helper.once("error", reject).listen(config.ports.imageHelper, "127.0.0.1", resolve));
  const sharp = createRequire(path.resolve("local/commerce/image-helper/package.json"))("sharp");
  try {
    const blueHalf = await sharp({ create: { width: 40, height: 40, channels: 3, background: { r: 0, g: 0, b: 245 } } }).png().toBuffer();
    const orientedJpeg = await sharp({ create: { width: 80, height: 40, channels: 3, background: { r: 245, g: 0, b: 0 } } })
      .composite([{ input: blueHalf, left: 40, top: 0 }])
      .withMetadata({ orientation: 6 })
      .jpeg({ quality: 100, chromaSubsampling: "4:4:4" })
      .toBuffer();
    const encodedMetadata = await sharp(orientedJpeg).metadata();
    assert.deepEqual([encodedMetadata.width, encodedMetadata.height, encodedMetadata.orientation], [80, 40, 6]);

    const ownerService = createConfiguredGuestDraftOwnerService(env);
    const guest = await ensureGuestResourceOwner({ projectId: config.projectId, context: null, ownerService });
    assert.equal(guest.status, "issued");
    const verifyOwner = async () => {
      const resolved = await resolveGuestResourceOwner({ projectId: config.projectId, context: guest.context, ownerService });
      return resolved.status === "authorized" ? { owner: resolved.owner, expiresAt: resolved.owner.expiresAt } : null;
    };
    const draft = await createLocalPersistentDraftPort({ environment: env, verifyOwner });
    assert.equal(draft.status, "ready");
    const created = await draft.port.create({ authority: draft.authority, expectedVersion: 0, idempotency: { key: randomUUID(), fingerprint: "task-10.3-oriented-draft" }, productId: ids.product });
    assert.equal(created.status, "found");
    let draftState = created.value;
    const cookie = `${getGuestDraftOwnerCookieName()}=${encodeURIComponent(guest.context)}`;
    const form = new FormData();
    form.set("file", new File([orientedJpeg], "orientation-6-regions.jpg", { type: "image/jpeg" }));
    const upload = await POST(new Request(`http://127.0.0.1:56726/api/uploads?productId=${ids.product}&fieldId=${ids.field}&draftId=${draftState.draftId}&expectedVersion=${draftState.version}`, {
      method: "POST", headers: { origin: "http://127.0.0.1:56726", cookie, "Idempotency-Key": randomUUID() }, body: form,
    }));
    assert.equal(upload.status, 201, await upload.clone().text());
    const uploadProjection = await upload.json();
    assert.doesNotMatch(JSON.stringify(uploadProjection), /locator|bucket|object.?key|path|url|service.?role|operationId|slotId/i);
    const receiptId = uploadProjection.receipt.receiptId;
    const operation = JSON.parse(sql(`select row_to_json(x) from (select o.id,o.slot_id from local_commerce.media_operations o join local_commerce.media_receipts r on r.project_id=o.project_id and r.id=o.receipt_id where o.project_id='${config.projectId}' and r.receipt_reference='${receiptId}')x;`));
    assert.ok(operation?.slot_id);
    const saved = await draft.port.save({ authority: draft.authority, draftId: draftState.draftId, expectedVersion: draftState.version, idempotency: { key: randomUUID(), fingerprint: "task-10.3-confirm-original" }, slots: [{ slotId: operation.slot_id, fieldId: ids.field, receiptReference: receiptId }] });
    assert.equal(saved.status, "found");
    draftState = saved.value;

    const crop = { x: 0, y: 0, width: 1, height: 0.5 };
    const editorValues = createProductCustomizationCropEditorValues(crop);
    assert.deepEqual(editorValues, { x: "0", y: "0", width: "100", height: "50" });
    const parsed = parseProductCustomizationCropEditorValues(editorValues);
    assert.deepEqual(parsed, { ok: true, value: crop });
    const overlay = { left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.width * 100}%`, height: `${crop.height * 100}%` };
    assert.deepEqual(overlay, { left: "0%", top: "0%", width: "100%", height: "50%" });

    const media = createLocalPersistentMediaAuthority(env, verifyOwner);
    const cropped = await media.accept({ draftId: draftState.draftId, expectedVersion: draftState.version, fieldId: ids.field, slotId: operation.slot_id, originalReceiptId: receiptId, crop, bytes: new Uint8Array() });
    assert.equal(cropped.status, "found", JSON.stringify(cropped));
    const cropSaved = await draft.port.save({ authority: draft.authority, draftId: draftState.draftId, expectedVersion: draftState.version, idempotency: { key: randomUUID(), fingerprint: "task-10.3-confirm-crop" }, slots: [{ slotId: cropped.slotId, fieldId: ids.field, receiptReference: cropped.receipt.receiptId, crop }] });
    assert.equal(cropSaved.status, "found");
    draftState = cropSaved.value;
    const preview = await GET(new Request(`http://127.0.0.1:56726/api/customer-uploads/preview?receiptId=${cropped.receipt.receiptId}`, { headers: { cookie } }));
    assert.equal(preview.status, 200);
    assert.equal(preview.headers.get("content-type"), "image/png");
    assert.equal(preview.headers.get("cache-control"), "private, no-store");
    assert.doesNotMatch(JSON.stringify(Object.fromEntries(preview.headers)), /locator|bucket|object.?key|service.?role/i);
    const previewBytes = Buffer.from(await preview.arrayBuffer());
    const actual = await sharp(previewBytes).raw().toBuffer({ resolveWithObject: true });
    assert.deepEqual([actual.info.width, actual.info.height], [40, 40]);

    const upright = await sharp(orientedJpeg).autoOrient().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.deepEqual([upright.info.width, upright.info.height], [40, 80]);
    const expectedPng = await sharp(upright.data, { raw: upright.info }).extract({ left: 0, top: 0, width: 40, height: 40 }).png().toBuffer();
    const expected = await sharp(expectedPng).raw().toBuffer({ resolveWithObject: true });
    assert.equal(digest(actual.data), digest(expected.data));
    const wrongEncodedCrop = await sharp(orientedJpeg).extract({ left: 0, top: 0, width: 80, height: 20 }).png().toBuffer();
    const wrong = await sharp(wrongEncodedCrop).raw().toBuffer({ resolveWithObject: true });
    assert.notDeepEqual([actual.info.width, actual.info.height], [wrong.info.width, wrong.info.height]);
    assert.notEqual(digest(actual.data), digest(wrong.data));

    const priorPreviewDigest = digest(previewBytes);
    const invalid = await media.accept({ draftId: draftState.draftId, expectedVersion: draftState.version, fieldId: ids.field, slotId: cropped.slotId, originalReceiptId: cropped.receipt.receiptId, crop: { x: 0.8, y: 0, width: 0.4, height: 1 }, bytes: new Uint8Array() });
    assert.equal(invalid.status, "rejected");
    const afterInvalid = await GET(new Request(`http://127.0.0.1:56726/api/customer-uploads/preview?receiptId=${cropped.receipt.receiptId}`, { headers: { cookie } }));
    assert.equal(afterInvalid.status, 200);
    assert.equal(digest(Buffer.from(await afterInvalid.arrayBuffer())), priorPreviewDigest);
    assert.deepEqual((await draft.port.read({ authority: draft.authority, draftId: draftState.draftId })).value, draftState);

    const nativeFetch = globalThis.fetch;
    let helperCalls = 0;
    globalThis.fetch = async (url, options) => {
      if (String(url) === `${config.endpoints.imageHelperUrl}/process`) {
        helperCalls += 1;
        if (helperCalls === 2) {
          return new Response(null, { status: 503 });
        }
      }
      return nativeFetch(url, options);
    };
    try {
      const failedPreview = await media.accept({ draftId: draftState.draftId, expectedVersion: draftState.version, fieldId: ids.field,
        slotId: cropped.slotId, originalReceiptId: cropped.receipt.receiptId,
        crop: { x: 0, y: 0.5, width: 1, height: 0.5 }, bytes: new Uint8Array() });
      assert.equal(failedPreview.status, "unavailable");
    } finally {
      globalThis.fetch = nativeFetch;
    }
    assert.equal(helperCalls, 2);
    const failedOperation = JSON.parse(sql(`select row_to_json(x) from (select lifecycle,receipt_id from local_commerce.media_operations where draft_id='${draftState.draftId}' order by created_at desc limit 1)x;`));
    assert.deepEqual(failedOperation, { lifecycle: "pending", receipt_id: null });
    const afterFailure = await GET(new Request(`http://127.0.0.1:56726/api/customer-uploads/preview?receiptId=${cropped.receipt.receiptId}`, { headers: { cookie } }));
    assert.equal(afterFailure.status, 200);
    assert.equal(digest(Buffer.from(await afterFailure.arrayBuffer())), priorPreviewDigest);
    assert.deepEqual((await draft.port.read({ authority: draft.authority, draftId: draftState.draftId })).value, draftState);

    console.log(JSON.stringify({ status: "PASS", run: expectedRun, project: config.projectId, ledger: applied.length, pending: 0,
      fixture: { encoded: [80, 40], orientation: 6, upright: [40, 80], layout: "encoded left red / right blue" },
      crop, overlay, preview: { dimensions: [actual.info.width, actual.info.height], sha256: digest(previewBytes) },
      unnormalizedInterpretationRejected: true, failedPreviewPreservedPrior: true, securityProjection: "safe" }));
  } finally {
    await new Promise((resolve) => helper.close(resolve));
  }
});
