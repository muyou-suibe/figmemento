// Real disposable C09/C10/C28/C29 acceptance. No fixture HTTP mutation route.
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { catalogDatabaseRows, catalogTestEnvironment, ids } from "../fixtures/local-persistent-catalog.mjs";
import { quarantineSyntheticShippingRule } from "./local-commerce-shipping-fixture-quarantine.mjs";

const run = "run-b74c8e21";
assert.ok(process.argv.includes("--confirm-disposable"));
assert.equal(process.env.PHASE1_DISPOSABLE_RUN_ID, run);
const secret = process.env.PHASE1_DISPOSABLE_SECRET_KEY;
assert.ok(secret);
const root = process.cwd();
const dir = `${root}/local/commerce/runtime/disposable/${run}`;
const prep = JSON.parse(readFileSync(`${dir}/ledger-preparation.json`, "utf8"));
const project = `figmemento-local-commerce-test-${run}`;
assert.equal(prep.config.projectId, project);
assert.equal(prep.config.postgresMajorVersion, 17);
const manifest = JSON.parse(readFileSync("local/commerce/migrations/manifest.json", "utf8"));
assert.equal(manifest.schemaVersion, 46);

function command(binary, args, input) {
  const result = spawnSync(binary, args, { input, encoding: "utf8", timeout: 20_000, maxBuffer: 4_000_000 });
  assert.equal(result.status, 0, `${binary} failed: ${result.error?.code ?? result.stderr?.slice(-500)}`);
  return result.stdout.trim();
}
const exact = command("docker", ["ps", "-q"]).split("\n").filter(Boolean)
  .map(id => JSON.parse(command("docker", ["inspect", id]))[0])
  .filter(item => item.Config.Labels?.["com.supabase.cli.workdir"] === dir
    && item.Name.startsWith("/supabase_db_") && item.State.Status === "running");
assert.equal(exact.length, 1);
const sql = statement => command("docker", ["exec", "-i", exact[0].Id, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], statement);
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
assert.equal(sql("select current_setting('server_version_num')::int/10000;"), "17");
assert.equal(sql(`select local_commerce.verify_project_identity(${literal(project)},${literal(prep.markerDigest)});`), "t");
const ledger = JSON.parse(sql("select json_agg(json_build_object('version',version,'checksum',checksum) order by version) from local_commerce.migration_ledger;"));
assert.equal(ledger.length, 46);
for (const [index, item] of manifest.migrations.entries()) {
  assert.equal(ledger[index].version, item.version);
  assert.equal(ledger[index].checksum, item.checksum);
  assert.equal(createHash("sha256").update(readFileSync(`local/commerce/migrations/${item.filename}`)).digest("hex"), item.checksum);
}
const keyHeaders = { apikey: secret, ...(!secret.startsWith("sb_secret_") ? { authorization: `Bearer ${secret}` } : {}) };
const env = { ...process.env, ...catalogTestEnvironment({
  LOCAL_COMMERCE_RUN_ID: run, LOCAL_COMMERCE_PROJECT_ID: project, LOCAL_COMMERCE_MARKER_DIGEST: prep.markerDigest,
  LOCAL_COMMERCE_API_URL: prep.config.endpoints.apiUrl, LOCAL_COMMERCE_RPC_URL: prep.config.endpoints.rpcUrl,
  LOCAL_COMMERCE_STORAGE_URL: prep.config.endpoints.storageUrl,
  LOCAL_COMMERCE_IMAGE_HELPER_URL: prep.config.endpoints.imageHelperUrl,
  LOCAL_COMMERCE_SHADOW_DB_PORT: String(prep.config.ports.shadowDb),
  LOCAL_COMMERCE_API_PORT: String(prep.config.ports.api), LOCAL_COMMERCE_DB_PORT: String(prep.config.ports.db),
  LOCAL_COMMERCE_STUDIO_PORT: String(prep.config.ports.studio), LOCAL_COMMERCE_SMTP_PORT: String(prep.config.ports.smtp),
  LOCAL_COMMERCE_IMAGE_HELPER_PORT: String(prep.config.ports.imageHelper),
  LOCAL_COMMERCE_SERVICE_ROLE_KEY: secret, CART_SOURCE: "local_persistent", CUSTOMER_AUTH_SOURCE: "local_persistent",
  PHOTOGIFT_PRODUCT_SOURCE: "local_persistent", LOCAL_CHECKOUT_SOURCE: "local_persistent",
  LOCAL_ORDER_SOURCE: "local_persistent", CUSTOMER_UPLOAD_SOURCE: "local_persistent",
  LOCAL_PAYMENT_SOURCE: "disabled", LOCAL_FULFILLMENT_SOURCE: "disabled", LOCAL_TRACKING_SOURCE: "disabled",
  ADMIN_ACCEPTANCE_SOURCE: "local_fake", LOCAL_COMMERCE_IMAGE_HELPER_SECRET: randomBytes(32).toString("base64url"),
  LOCAL_ORDER_CAPABILITY_SECRET: randomBytes(32).toString("hex"),
  PHOTOGIFT_GUEST_DRAFT_OWNER_SECRET: randomBytes(48).toString("base64url"),
  PHOTOGIFT_GUEST_DRAFT_OWNER_CONTEXT_TTL_SECONDS: "3600",
}), CLOUDFLARE_INCLUDE_PROCESS_ENV: "true", WRANGLER_SEND_METRICS: "false", WRANGLER_WRITE_LOGS: "false",
  LOCAL_COMMERCE_ACCEPTANCE_DISABLE_INSPECTOR: "true" };

const source = catalogDatabaseRows(project);
let encoded = JSON.stringify(source);
for (const id of Object.values(ids)) encoded = encoded.replaceAll(id, randomUUID());
const fixture = JSON.parse(encoded);
const suffix = randomUUID().replaceAll("-", "");
const productId = fixture.products[0].id;
const variantId = fixture.variants[0].id;
const numericId = randomUUID(), toggleId = randomUUID(), choiceId = randomUUID(), noteId = randomUUID(), fileId = randomUUID();
fixture.categories[0].slug = `phase1-category-${suffix}`;
fixture.products[0].slug = `phase1-product-${suffix}`;
fixture.products[0].name = "Phase 1 synthetic configured file product";
fixture.products[0].fulfillment_definition.requiresProductionPreview = false;
fixture.variants[0].sku_code = `PHASE1-SKU-${suffix}`;
fixture.rules = fixture.rules.filter(rule => rule.definition.kind === "shipping");
fixture.rules[0].rule_key = `phase1-shipping-${suffix}`;
fixture.configurations[0].definition.fields = [
  { id: numericId, productId, code: "size_value", label: "Size value", kind: "numeric", required: true, isActive: true,
    position: 0, configurationRevision: "1", constraints: { min: "0.1", max: "0.3", step: "0.1" } },
  { id: toggleId, productId, code: "include_note", label: "Include note", kind: "single_select", required: false, isActive: true,
    position: 1, configurationRevision: "1", constraints: { choices: [{ id: choiceId, code: "yes", label: "Yes", position: 0, isActive: true }] } },
  { id: noteId, productId, code: "note", label: "Note", kind: "short_text", required: false, isActive: true,
    position: 2, configurationRevision: "1", constraints: { maxLength: 80 },
    rules: { visibleWhen: { kind: "field_present", fieldId: toggleId },
      requiredWhen: { kind: "single_select_is", fieldId: toggleId, choiceId } } },
  { id: fileId, productId, code: "document", label: "Document", kind: "generic_file", required: true, isActive: true,
    position: 3, configurationRevision: "1", constraints: { allowedMimeTypes: ["application/pdf", "text/plain"],
      maxBytes: 20_971_520, minFileCount: 1, maxFileCount: 3 } },
];
const shippingId = fixture.rules[0].id;
let insertedShippingRuleId;
let worker;
try {
  for (const [key, table] of Object.entries({ categories: "catalog_categories", products: "catalog_products", variants: "catalog_variants",
    configurations: "catalog_configuration_snapshots", rules: "catalog_pricing_rules" })) {
    const response = await fetch(`${prep.config.endpoints.apiUrl}/rest/v1/${table}`, {
      method: "POST", headers: { ...keyHeaders, "content-type": "application/json", "content-profile": "local_commerce" },
      body: JSON.stringify(fixture[key]), signal: AbortSignal.timeout(8_000),
    });
    assert.equal(response.status, 201, `Phase 1 ${key} setup: ${response.status}`);
    await response.arrayBuffer();
    if (key === "rules") insertedShippingRuleId = shippingId;
  }
  const { LocalCatalogAuthority } = await import("../../app/infrastructure/local-commerce/local-catalog-authority.server.ts");
  const catalog = await new LocalCatalogAuthority(env).readSnapshot();
  assert.equal(catalog.status, "found");
  assert.equal(catalog.value.dataSet.products.some(product => product.id === productId), true);
  const fields = await new LocalCatalogAuthority(env).getCustomizationFieldsForProduct(productId);
  assert.equal(fields.status, "found", `Phase 1 field authority: ${fields.status}`);
  assert.equal(fields.value.fields.length, 4);
  const { resolveLocalPersistentComposition } = await import("../../app/application/local-persistent-commerce-composition.server.ts");
  const composition = resolveLocalPersistentComposition(env, { requiredCapabilities: ["upload", "cart", "catalog"] });
  assert.equal(composition.status, "ready", `Phase 1 upload composition: ${composition.status}`);
  const { createServerCustomerUploadFieldResolver } = await import("../../app/server/customer-upload-field-resolution.server.ts");
  const policy = await createServerCustomerUploadFieldResolver(env, "test")({
    headers: new Headers(), method: "POST", url: `http://127.0.0.1/api/uploads?productId=${productId}&fieldId=${fileId}`,
  });
  assert.equal(policy.status, "found", `Phase 1 upload policy: ${policy.status}`);
  assert.equal(policy.kind, "generic_file");

  const { createConfiguredGuestDraftOwnerService, getGuestDraftOwnerCookieName } = await import("../../app/lib/guest-draft-owner.ts");
  const { ensureGuestResourceOwner } = await import("../../app/application/guest-resource-ownership.server.ts");
  const ownerService = createConfiguredGuestDraftOwnerService(env);
  const issued = await ensureGuestResourceOwner({ projectId: project, context: null, ownerService });
  assert.equal(issued.status, "issued");
  const jar = new Map([[getGuestDraftOwnerCookieName(), encodeURIComponent(issued.context)]]);
  const cookie = () => [...jar].map(([key, value]) => `${key}=${value}`).join("; ");
  const acceptCookies = response => { for (const value of response.headers.getSetCookie()) {
    const pair = value.split(";", 1)[0], at = pair.indexOf("="); jar.set(pair.slice(0, at), pair.slice(at + 1));
  } };

  const port = prep.config.ports.imageHelper + 4;
  await new Promise((resolve, reject) => { const server = createServer(); server.once("error", reject);
    server.listen(port, "127.0.0.1", () => server.close(resolve)); });
  worker = spawn(process.execPath, ["tests/database/local-commerce-test-worker.mjs", run, "--confirm-disposable", String(port)], {
    env, detached: true, stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  for (const stream of [worker.stdout, worker.stderr]) stream.on("data", chunk => { logs = (logs + chunk.toString()).slice(-12_000); });
  const origin = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (worker.exitCode !== null) assert.fail(`Phase 1 Worker exited: ${logs.slice(-1500)}`);
    try { const response = await fetch(`${origin}/api/customer-auth/session`, { signal: AbortSignal.timeout(1000) });
      await response.arrayBuffer(); if (response.status === 200) break; } catch { /* bounded startup poll */ }
    if (attempt === 59) assert.fail(`Phase 1 Worker readiness: ${logs.slice(-1500)}`);
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  async function post(path, body, cookies = cookie()) {
    const response = await fetch(`${origin}${path}`, { method: "POST", headers: { origin, cookie: cookies, "content-type": "application/json", "idempotency-key": randomUUID() },
      body: JSON.stringify(body), signal: AbortSignal.timeout(20_000) });
    return response;
  }
  async function upload(bytes, filename, claimedMime, cookies = cookie(), timeout = 60_000) {
    const form = new FormData(); form.append("file", new Blob([bytes], { type: claimedMime }), filename);
    const response = await fetch(`${origin}/api/uploads?productId=${productId}&fieldId=${fileId}`, {
      method: "POST", headers: { origin, cookie: cookies, "idempotency-key": randomUUID() }, body: form,
      signal: AbortSignal.timeout(timeout),
    });
    acceptCookies(response);
    return response;
  }

  // The ordinary durable Draft command registers the signed guest owner in
  // commerce_owners. Generic-file receipts require that verified owner row.
  const draftResponse = await post("/api/local-drafts", { productId });
  if (draftResponse.status !== 201) assert.fail(`draft owner setup: ${draftResponse.status} ${await draftResponse.text()}`);
  acceptCookies(draftResponse);
  const draft = await draftResponse.json();
  assert.equal(draft.productId, productId);

  const pdfBytes = new TextEncoder().encode("%PDF-1.7\nPhase 1 private customer PDF\n");
  const pdfResponse = await upload(pdfBytes, "brief.pdf", "text/plain");
  if (pdfResponse.status !== 201) assert.fail(`PDF upload: ${pdfResponse.status} ${await pdfResponse.text()} ${logs.slice(-2000)}`);
  const pdf = await pdfResponse.json();
  assert.equal(pdf.receipt.contentType, "application/pdf");
  assert.equal(pdf.receipt.byteSize, pdfBytes.length);
  assert.equal(pdf.warnings.some(warning => warning.code === "declared_mime_ignored"), true);
  assert.equal(JSON.stringify(pdf).includes("internalLocator"), false);
  const txtBytes = new TextEncoder().encode("Phase 1 private customer TXT\n");
  const txtResponse = await upload(txtBytes, "brief.txt", "text/plain");
  assert.equal(txtResponse.status, 201);
  const txt = await txtResponse.json();
  assert.equal(txt.receipt.contentType, "text/plain");
  const invalid = await upload(new Uint8Array([0, 1, 2, 3]), "invalid.bin", "application/pdf");
  assert.equal(invalid.status, 400);
  await invalid.arrayBuffer();
  // Probe the transport ceiling before the admitted 20 MiB request so the
  // rejection is independent of private Storage work performed later.
  const receiptsBeforeTransport = Number(sql(`select count(*) from local_commerce.generic_file_receipts
    where project_id=${literal(project)} and product_id=${literal(productId)};`));
  const objectsBeforeTransport = Number(sql("select count(*) from storage.objects where bucket_id='local-commerce-private';"));
  const transportOversize = await upload(new Uint8Array(22_020_096).fill(65), "transport-limit.txt", "text/plain", cookie(), 90_000);
  if (transportOversize.status !== 413) assert.fail(`21 MiB transport ceiling: ${transportOversize.status} ${
    (await transportOversize.clone().text()).slice(0, 300)}`);
  await transportOversize.arrayBuffer();
  assert.equal(Number(sql(`select count(*) from local_commerce.generic_file_receipts
    where project_id=${literal(project)} and product_id=${literal(productId)};`)), receiptsBeforeTransport);
  assert.equal(Number(sql("select count(*) from storage.objects where bucket_id='local-commerce-private';")), objectsBeforeTransport);
  const atLimitBytes = new Uint8Array(20_971_520).fill(65);
  const atLimit = await upload(atLimitBytes, "at-limit.txt", "text/plain", cookie(), 90_000);
  if (atLimit.status !== 201) assert.fail(`20 MiB boundary: ${atLimit.status} ${await atLimit.text()}`);
  const atLimitReceipt = await atLimit.json();
  assert.equal(atLimitReceipt.receipt.byteSize, atLimitBytes.length);
  const atLimitRow = JSON.parse(sql(`select row_to_json(r) from (select byte_size, internal_locator, receipt_status
    from local_commerce.generic_file_receipts where project_id=${literal(project)}
    and receipt_reference=${literal(atLimitReceipt.receipt.receiptId)}::uuid) r;`));
  assert.equal(Number(atLimitRow.byte_size), 20_971_520);
  assert.equal(atLimitRow.receipt_status, "ready");
  assert.equal(sql(`select count(*) from storage.objects where bucket_id='local-commerce-private'
    and name=${literal(atLimitRow.internal_locator)};`), "1");
  assert.equal(JSON.stringify(atLimitReceipt).includes(atLimitRow.internal_locator), false);
  const receiptCountBeforeRejection = Number(sql(`select count(*) from local_commerce.generic_file_receipts
    where project_id=${literal(project)} and product_id=${literal(productId)};`));
  const objectCountBeforeRejection = Number(sql("select count(*) from storage.objects where bucket_id='local-commerce-private';"));
  const oversize = await upload(new Uint8Array(20_971_521).fill(65), "oversize.txt", "text/plain", cookie(), 90_000);
  assert.equal(oversize.status, 400, `20 MiB + 1 business rejection: ${oversize.status}`);
  await oversize.arrayBuffer();
  assert.equal(Number(sql(`select count(*) from local_commerce.generic_file_receipts
    where project_id=${literal(project)} and product_id=${literal(productId)};`)), receiptCountBeforeRejection);
  assert.equal(Number(sql("select count(*) from storage.objects where bucket_id='local-commerce-private';")), objectCountBeforeRejection);
  console.info("PHASE1 REAL C10 LAYERED FILE/TRANSPORT LIMIT PASS", JSON.stringify({ acceptedFileBytes: 20_971_520,
    rejectedBusinessFileBytes: 20_971_521, rejectedTransportBodyGreaterThan: 22_020_096,
    receiptCountAfterRejections: receiptCountBeforeRejection }));
  const receiptRow = JSON.parse(sql(`select row_to_json(r) from (select receipt_reference,owner_id,product_id,field_key,configuration_revision,
    content_type,byte_size,content_digest,internal_locator,receipt_status,lifecycle from local_commerce.generic_file_receipts
    where project_id=${literal(project)} and receipt_reference=${literal(pdf.receipt.receiptId)}::uuid) r;`));
  assert.equal(receiptRow.receipt_status, "ready");
  assert.equal(receiptRow.product_id, productId);
  assert.equal(receiptRow.field_key, fileId);
  assert.equal(receiptRow.content_digest, createHash("sha256").update(pdfBytes).digest("hex"));
  assert.equal(sql(`select public from storage.buckets where id='local-commerce-private';`), "f");
  assert.equal(sql(`select count(*) from storage.objects where bucket_id='local-commerce-private' and name=${literal(receiptRow.internal_locator)};`), "1");
  assert.equal(JSON.stringify(pdf).includes(receiptRow.internal_locator), false);
  console.info("PHASE1 REAL C10 PRIVATE PDF/TXT/MIME/SIZE/OWNER STORAGE PASS");

  const base = { productId, variantId, skuCode: fixture.variants[0].sku_code,
    selectedOptions: fixture.variants[0].selected_options, configurationRevision: "1" };
  const number = value => ({ fieldId: numericId, fieldCode: "size_value", kind: "numeric", value });
  const toggle = { fieldId: toggleId, fieldCode: "include_note", kind: "single_select", choiceId };
  const note = { fieldId: noteId, fieldCode: "note", kind: "short_text", value: "Customer note" };
  const file = ids => ({ fieldId: fileId, fieldCode: "document", kind: "generic_file", files: ids.map(receiptId => ({ receiptId })) });
  const valid = { ...base, customizationValues: [number("0.3000"), toggle, note, file([pdf.receipt.receiptId, txt.receipt.receiptId])] };
  for (const [label, values] of [
    ["numeric_step", [number("0.25"), file([pdf.receipt.receiptId])]],
    ["numeric_range", [number("0.4"), file([pdf.receipt.receiptId])]],
    ["conditional_required", [number("0.2"), toggle, file([pdf.receipt.receiptId])]],
    ["hidden_value", [number("0.2"), note, file([pdf.receipt.receiptId])]],
    ["file_count", [number("0.2"), file(Array(4).fill(pdf.receipt.receiptId))]],
  ]) {
    const response = await post("/api/cart", { handoff: { ...base, customizationValues: values } });
    assert.equal(response.status, 400, `${label}: ${response.status}`);
    await response.arrayBuffer();
  }
  const foreign = await ensureGuestResourceOwner({ projectId: project, context: null, ownerService });
  assert.equal(foreign.status, "issued");
  const foreignCookie = `${getGuestDraftOwnerCookieName()}=${encodeURIComponent(foreign.context)}`;
  const foreignUse = await post("/api/cart", { handoff: valid }, foreignCookie);
  assert.notEqual(foreignUse.status, 200);
  await foreignUse.arrayBuffer();
  const added = await post("/api/cart", { handoff: valid });
  if (added.status !== 200) assert.fail(`valid configured item: ${added.status} ${await added.text()}`);
  acceptCookies(added);
  const cart = await added.json();
  assert.equal(cart.lines.length, 1);
  const cartId = decodeURIComponent([...jar].find(([key]) => key.includes("cart"))[1]);
  const stored = JSON.parse(sql(`select configuration_values from local_commerce.cart_lines where project_id=${literal(project)} and cart_id=${literal(cartId)} and lifecycle='active';`));
  assert.equal(stored.find(value => value.kind === "numeric").value, "0.3");
  assert.deepEqual(stored.find(value => value.kind === "generic_file").files.map(item => item.receiptId),
    [pdf.receipt.receiptId, txt.receipt.receiptId]);
  console.info("PHASE1 REAL C09/C28/C29 CART ACCEPTANCE/REJECTION PASS");

  const checkout = await post("/api/checkout", { email: `phase1-${suffix}@example.invalid`, firstName: "Phase", lastName: "One",
    country: "US", city: "Test", addressLine1: "Synthetic address", postalCode: "00000",
    shippingMethod: fixture.rules[0].definition.method });
  if (checkout.status !== 200) assert.fail(`checkout: ${checkout.status} ${await checkout.text()}`);
  const projection = await checkout.json();
  assert.equal(projection.status, "accepted");
  assert.equal(projection.tax.status, "not_activated");
  assert.equal(projection.tax.amountCents, null);
  const orderInput = { creationAttemptId: randomUUID(), email: `phase1-${suffix}@example.invalid`, firstName: "Phase",
    lastName: "One", country: "US", city: "Test", addressLine1: "Synthetic address", postalCode: "00000",
    shippingMethod: fixture.rules[0].definition.method };
  const handshake = await post("/api/local-orders", orderInput);
  assert.equal(handshake.status, 204);
  acceptCookies(handshake);
  const committed = await post("/api/local-orders", orderInput);
  if (committed.status !== 200) assert.fail(`order: ${committed.status} ${await committed.text()}`);
  const order = await committed.json();
  assert.match(order.publicReference, /^FM-LOCAL-[A-Z0-9]{16}$/);
  const orderId = sql(`select id from local_commerce.orders where project_id=${literal(project)} and public_reference=${literal(order.publicReference)};`);
  const facts = JSON.parse(sql(`select customization_facts from local_commerce.order_item_purchase_snapshots s
    join local_commerce.order_items i on i.project_id=s.project_id and i.id=s.order_item_id
    where s.project_id=${literal(project)} and i.order_id=${literal(orderId)};`));
  assert.equal(facts.values.find(value => value.kind === "numeric").value, "0.3");
  assert.deepEqual(facts.values.find(value => value.kind === "generic_file").files.map(item => item.receiptId),
    [pdf.receipt.receiptId, txt.receipt.receiptId]);
  assert.equal(sql(`select count(*) from local_commerce.order_item_generic_file_receipt_bindings b
    join local_commerce.order_items i on i.project_id=b.project_id and i.id=b.order_item_id
    where b.project_id=${literal(project)} and i.order_id=${literal(orderId)};`), "2");
  assert.equal(JSON.stringify(order).includes(receiptRow.internal_locator), false);
  console.info("PHASE1 REAL PRIVATE FILE CART/CHECKOUT/ORDER IMMUTABLE FACTS PASS", JSON.stringify({ run, ledger: "46/46", orderReference: order.publicReference }));
} finally {
  if (worker && worker.exitCode === null && worker.signalCode === null) {
    process.kill(-worker.pid, "SIGTERM");
    await new Promise(resolve => worker.once("exit", resolve));
  }
  if (insertedShippingRuleId) quarantineSyntheticShippingRule({ sql, project, id: insertedShippingRuleId,
    ruleKey: fixture.rules[0].rule_key, method: fixture.rules[0].definition.method });
}
