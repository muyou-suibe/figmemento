// Acceptance-only H03 test. Exact disposable project; no retained/root/remote access.
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { catalogDatabaseRows, catalogTestEnvironment, ids } from "../fixtures/local-persistent-catalog.mjs";
import { defaultCustomizationConstraints, editorFieldsFromConfiguration } from "../../app/application/admin-customization-field-editor-state.ts";
import { LocalCatalogAuthority } from "../../app/infrastructure/local-commerce/local-catalog-authority.server.ts";
import { quarantineSyntheticShippingRule } from "./local-commerce-shipping-fixture-quarantine.mjs";

const run = process.argv.find((value) => /^run-[a-f0-9]{8}$/.test(value)) ?? "run-e6a4c7d2";
assert.ok(process.argv.includes("--confirm-disposable"));
const dir = `${process.cwd()}/local/commerce/runtime/disposable/${run}`;
const prep = JSON.parse(readFileSync(`${dir}/ledger-preparation.json`, "utf8"));
const project = `figmemento-local-commerce-test-${run}`;
assert.equal(prep.config.projectId, project);
assert.equal(prep.config.postgresMajorVersion, 17);
const manifest = JSON.parse(readFileSync("local/commerce/migrations/manifest.json", "utf8"));
assert.equal(manifest.schemaVersion, 46);

function command(binary, args, input) {
  const result = spawnSync(binary, args, { input, encoding: "utf8", timeout: 30_000, maxBuffer: 4_000_000 });
  assert.equal(result.status, 0, `${binary} failed: ${result.error?.code ?? result.stderr?.slice(-900)}`);
  return result.stdout.trim();
}
const exact = command("docker", ["ps", "-q"]).split("\n").filter(Boolean)
  .map((id) => JSON.parse(command("docker", ["inspect", id]))[0])
  .filter((item) => item.Config.Labels?.["com.supabase.cli.workdir"] === dir);
const db = exact.filter((item) => item.Name.startsWith("/supabase_db_") && item.State.Status === "running");
assert.equal(db.length, 1, "exact disposable PostgreSQL container");
const sql = (statement) => command("docker", ["exec", "-i", db[0].Id, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], statement);
const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;
assert.equal(sql("select current_setting('server_version_num')::int/10000;"), "17");
assert.equal(sql(`select local_commerce.verify_project_identity(${literal(project)},${literal(prep.markerDigest)});`), "t");
const ledger = JSON.parse(sql("select json_agg(json_build_object('version',version,'checksum',checksum) order by version) from local_commerce.migration_ledger;"));
assert.equal(ledger.length, 46);
for (const [index, item] of manifest.migrations.entries()) {
  assert.equal(ledger[index].version, item.version);
  assert.equal(ledger[index].checksum, item.checksum);
  assert.equal(createHash("sha256").update(readFileSync(`local/commerce/migrations/${item.filename}`)).digest("hex"), item.checksum);
}
const info = JSON.parse(command("node_modules/.bin/supabase", ["status", "--workdir", dir, "-o", "json"]));
assert.equal(new URL(info.API_URL).origin, new URL(prep.config.endpoints.apiUrl).origin);
// Credentials must be explicitly provisioned for this exact disposable run.
// Never inspect container environments or derive signing material here.
assert.equal(process.env.H03_DISPOSABLE_RUN_ID, run, "explicit exact-run credential scope required");
const privilegedKey = process.env.H03_DISPOSABLE_SECRET_KEY ?? process.env.H03_DISPOSABLE_SERVICE_ROLE_KEY;
const publicKey = process.env.H03_DISPOSABLE_PUBLISHABLE_KEY ?? process.env.H03_DISPOSABLE_ANON_KEY;
assert.ok(privilegedKey && publicKey, "explicit disposable test credentials required");
const apiKeyHeaders = (key) => ({
  apikey: key,
  ...(!key.startsWith("sb_secret_") && !key.startsWith("sb_publishable_") ? { authorization: `Bearer ${key}` } : {}),
});
const adminPassword = randomBytes(32).toString("hex");
const env = { ...process.env, ...catalogTestEnvironment({
  LOCAL_COMMERCE_RUN_ID: run, LOCAL_COMMERCE_PROJECT_ID: project,
  LOCAL_COMMERCE_MARKER_DIGEST: prep.markerDigest,
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
  LOCAL_COMMERCE_SERVICE_ROLE_KEY: privilegedKey,
  ADMIN_ACCEPTANCE_SOURCE: "local_persistent", ADMIN_PASSWORD: adminPassword,
  CART_SOURCE: "local_persistent", CUSTOMER_AUTH_SOURCE: "local_persistent",
  LOCAL_CHECKOUT_SOURCE: "local_persistent", LOCAL_ORDER_SOURCE: "local_persistent",
  CUSTOMER_UPLOAD_SOURCE: "disabled", LOCAL_PAYMENT_SOURCE: "local_persistent",
  LOCAL_FULFILLMENT_SOURCE: "local_persistent", LOCAL_TRACKING_SOURCE: "local_persistent",
}), CLOUDFLARE_INCLUDE_PROCESS_ENV: "true", WRANGLER_SEND_METRICS: "false", WRANGLER_WRITE_LOGS: "false", LOCAL_COMMERCE_ACCEPTANCE_DISABLE_INSPECTOR: "true" };

const rows = catalogDatabaseRows(project);
const replacements = new Map(Object.values(ids).map((id) => [id, randomUUID()]));
let encoded = JSON.stringify(rows);
for (const [from, to] of replacements) encoded = encoded.replaceAll(from, to);
const fixture = JSON.parse(encoded);
const suffix = randomUUID().replaceAll("-", "");
fixture.categories[0].slug = `h03-category-${suffix}`;
fixture.products[0].slug = `h03-product-${suffix}`;
fixture.products[0].name = "H03 Synthetic Product";
fixture.variants[0].sku_code = `H03-SKU-${suffix}`;
fixture.rules = fixture.rules.filter((rule) => rule.definition.kind === "shipping");
fixture.rules[0].rule_key = `h03-shipping-${suffix}`;
const productId = fixture.products[0].id;
let insertedShippingRuleId;
try {
for (const [key, table] of Object.entries({ categories: "catalog_categories", products: "catalog_products", variants: "catalog_variants", configurations: "catalog_configuration_snapshots", rules: "catalog_pricing_rules" })) {
  const response = await fetch(`${prep.config.endpoints.apiUrl}/rest/v1/${table}`, {
    method: "POST", headers: { ...apiKeyHeaders(privilegedKey), "content-type": "application/json", "content-profile": "local_commerce" },
    body: JSON.stringify(fixture[key]), signal: AbortSignal.timeout(8_000),
  });
  assert.equal(response.status, 201, `synthetic ${key} setup: ${response.status}`);
  await response.arrayBuffer();
  if (key === "rules") insertedShippingRuleId = fixture.rules[0].id;
}
const canonicalBefore = await new LocalCatalogAuthority(env).readSnapshot();
assert.equal(canonicalBefore.status, "found", "customer Catalog must read pre-publication fixture");
const productBefore = canonicalBefore.value.dataSet.products.find((product) => product.id === productId);
const variantBefore = canonicalBefore.value.dataSet.variants.find((variant) => variant.productId === productId);
assert.ok(productBefore && variantBefore);

async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = createServer(); server.once("error", reject);
    server.listen(0, "127.0.0.1", () => { const port = server.address().port; server.close(() => resolve(port)); });
  });
}
async function launch() {
  const port = await freePort();
  const child = spawn(process.execPath, ["tests/database/local-commerce-test-worker.mjs", run, "--confirm-disposable", String(port)], {
    env, detached: true, stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  for (const stream of [child.stdout, child.stderr]) stream.on("data", (chunk) => { logs = (logs + chunk.toString()).slice(-5000); });
  for (let attempt = 0; attempt < 80; attempt++) {
    assert.equal(child.exitCode, null, logs);
    try {
      const ready = await fetch(`http://127.0.0.1:${port}/api/customer-auth/session`, { signal: AbortSignal.timeout(2_000) });
      await ready.arrayBuffer();
      if (ready.status === 200) return { child, port, logs: () => logs };
    } catch { /* bounded startup */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.fail(`H03 Worker startup failed: ${logs}`);
}
async function stop(worker) {
  if (worker.child.exitCode !== null || worker.child.signalCode !== null) return;
  process.kill(-worker.child.pid, "SIGTERM");
  await new Promise((resolve) => worker.child.once("exit", resolve));
}
async function request(worker, method, path, body, cookie) {
  const response = await fetch(`http://127.0.0.1:${worker.port}${path}`, {
    method, headers: { origin: `http://127.0.0.1:${worker.port}`, ...(cookie ? { cookie } : {}), ...(body ? { "content-type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15_000),
  });
  return { http: response.status, body: await response.json().catch(() => null), cookies: response.headers.getSetCookie() };
}
const path = `/api/admin/catalog/products/${productId}/customization`;
let a; let b; let c;
try {
  a = await launch();
  b = await launch();
  const login = await request(a, "POST", "/api/admin/login", { password: adminPassword });
  assert.equal(login.http, 200, `Admin login: ${JSON.stringify(login.body)}`);
  const adminCookie = login.cookies.find((item) => item.startsWith("photogift-admin-session="))?.split(";", 1)[0];
  assert.ok(adminCookie);
  assert.equal((await request(a, "GET", path)).http, 401);
  const initial = await request(a, "GET", path, null, adminCookie);
  assert.equal(initial.http, 200, `initial read: ${JSON.stringify(initial.body)}`);
  assert.equal(initial.body.value.configurationRevision, "1");
  const originalDefinition = sql(`select definition from local_commerce.catalog_configuration_snapshots where project_id=${literal(project)} and product_id=${literal(productId)} and revision=1;`);
  const base = editorFieldsFromConfiguration(initial.body.value.fields);
  const kinds = ["image", "short_text", "long_text", "single_select", "multi_select", "numeric", "generic_file"];
  const additions = kinds.map((kind, index) => ({
    identity: { kind: "new", draftId: `new:${kind}`, code: `h03_${kind}` }, label: `H03 ${kind}`, kind,
    required: false, isActive: kind !== "long_text", position: base.length + index,
    constraints: defaultCustomizationConstraints(kind),
    ...(kind === "numeric" ? { rules: { requiredWhen: { kind: "field_present", fieldId: base[0].identity.id } } } : {}),
  }));
  const publish = await request(a, "POST", path, { expectedCurrentRevision: "1", fields: [...base, ...additions], surchargeRules: [
    { ruleKey: "new:h03-caption-fee", expectedRevision: null, fieldId: base[0].identity.id, amountCents: 120, currency: "USD" },
    { ruleKey: "new:h03-image-fee", expectedRevision: null, fieldId: "new:image", amountCents: 250, currency: "USD" },
    { ruleKey: "new:h03-multi-select-fee", expectedRevision: null, fieldId: "new:multi_select", amountCents: 175, currency: "USD" },
  ] }, adminCookie);
  assert.equal(publish.http, 200, `H03 publish: ${JSON.stringify(publish.body)}`);
  assert.equal(publish.body.value.configurationRevision, "2");
  assert.deepEqual(new Set(publish.body.value.fields.map((field) => field.kind)), new Set(kinds));
  assert.equal(publish.body.value.surchargeRules.length, 3);
  const multiSelect = publish.body.value.fields.find((field) => field.kind === "multi_select");
  assert.equal(publish.body.value.surchargeRules.some((rule) => rule.fieldId === multiSelect.id && rule.amountCents === 175), true);
  assert.equal(publish.body.value.surchargeRules.some((rule) => rule.fieldId.startsWith("new:")), false);
  const storefront = new LocalCatalogAuthority(env);
  const canonicalAfter = await storefront.readSnapshot();
  assert.equal(canonicalAfter.status, "found", "customer Catalog must re-read published persistent facts");
  assert.deepEqual(canonicalAfter.value.dataSet.products.find((product) => product.id === productId), productBefore);
  const variantAfter = canonicalAfter.value.dataSet.variants.find((variant) => variant.productId === productId);
  assert.deepEqual(variantAfter, variantBefore);
  assert.equal(variantAfter.skuCode, fixture.variants[0].sku_code);
  assert.equal(Object.hasOwn(variantAfter, "selectedSpecificationKey"), false);
  assert.deepEqual(variantAfter.selectedOptions, variantBefore.selectedOptions);
  const publicConfiguration = await storefront.getCustomizationFieldsForProduct(productId);
  assert.equal(publicConfiguration.status, "found");
  assert.equal(publicConfiguration.value.configurationRevision, "2");
  assert.equal(publicConfiguration.value.fields.length, base.length + kinds.length - 1, "inactive long_text stays private to Admin");
  assert.equal(publicConfiguration.value.fields.some((field) => field.kind === "long_text"), false);
  assert.equal(publicConfiguration.value.fields.some((field) => field.id.startsWith("new:") || Object.hasOwn(field, "selectedSpecificationKey")), false);
  assert.deepEqual(publicConfiguration.value.fields.find((field) => field.kind === "multi_select").constraints.choices.map((choice) => choice.isActive), [true]);
  const auditBeforeWrongMarker = sql(`select count(*) from local_commerce.admin_customization_actions where project_id=${literal(project)} and product_id=${literal(productId)};`);
  const wrongMarker = `${prep.markerDigest[0] === "0" ? "1" : "0"}${prep.markerDigest.slice(1)}`;
  const rejectedRead = await fetch(`${prep.config.endpoints.apiUrl}/rest/v1/rpc/admin_customization_read`, {
    method: "POST", headers: { ...apiKeyHeaders(privilegedKey), "content-type": "application/json", "content-profile": "local_commerce" },
    body: JSON.stringify({ p_project_id: project, p_marker_digest: wrongMarker, p_product_id: productId }),
    signal: AbortSignal.timeout(5_000),
  });
  assert.equal((await rejectedRead.json()).status, "unavailable");
  const rejectedPublish = await fetch(`${prep.config.endpoints.apiUrl}/rest/v1/rpc/admin_customization_publish`, {
    method: "POST", headers: { ...apiKeyHeaders(privilegedKey), "content-type": "application/json", "content-profile": "local_commerce" },
    body: JSON.stringify({
      p_project_id: project, p_marker_digest: wrongMarker, p_product_id: productId,
      p_expected_revision: 2, p_actor_id: "configured-admin", p_fields: [], p_surcharges: [],
      p_restored_from_revision: null,
    }), signal: AbortSignal.timeout(5_000),
  });
  assert.equal((await rejectedPublish.json()).status, "unavailable");
  assert.equal(sql(`select count(*) from local_commerce.admin_customization_actions where project_id=${literal(project)} and product_id=${literal(productId)};`), auditBeforeWrongMarker);
  const persisted = await request(b, "GET", path, null, adminCookie);
  assert.equal(persisted.http, 200);
  assert.deepEqual(persisted.body.value.fields, publish.body.value.fields);
  assert.equal(persisted.body.value.fields.find((field) => field.kind === "long_text").isActive, false);
  assert.equal(sql(`select count(*) from local_commerce.admin_customization_actions where project_id=${literal(project)} and product_id=${literal(productId)} and operation='publish';`), "1");
  assert.equal(sql(`select definition from local_commerce.catalog_configuration_snapshots where project_id=${literal(project)} and product_id=${literal(productId)} and revision=1;`), originalDefinition);
  const identities = editorFieldsFromConfiguration(persisted.body.value.fields);
  const options = identities.find((field) => field.kind === "single_select");
  const rebound = structuredClone(identities);
  rebound.find((field) => field.kind === "single_select").constraints.choices[0].code = "rebound";
  const rejectedChoice = await request(a, "POST", path, { expectedCurrentRevision: "2", fields: rebound, surchargeRules: persisted.body.value.surchargeRules }, adminCookie);
  assert.equal(rejectedChoice.http, 409);
  assert.equal(options.constraints.choices[0].code, "choice-1");
  const nextFields = identities.map((field) => ({ ...field, label: field.label + " edited" }));
  const action = { expectedCurrentRevision: "2", fields: nextFields, surchargeRules: persisted.body.value.surchargeRules };
  const [raceA, raceB] = await Promise.all([request(a, "POST", path, action, adminCookie), request(b, "POST", path, action, adminCookie)]);
  assert.deepEqual([raceA.http, raceB.http].sort(), [200, 409]);
  assert.equal(sql(`select count(*) from local_commerce.catalog_configuration_snapshots where project_id=${literal(project)} and product_id=${literal(productId)} and revision=3;`), "1");
  const restored = await request(a, "POST", path, { expectedCurrentRevision: "3", restoreFromRevision: 1 }, adminCookie);
  assert.equal(restored.http, 200, `H03 restore: ${JSON.stringify(restored.body)}`);
  assert.equal(restored.body.value.configurationRevision, "4");
  assert.equal(sql(`select definition from local_commerce.catalog_configuration_snapshots where project_id=${literal(project)} and product_id=${literal(productId)} and revision=1;`), originalDefinition);
  assert.equal(sql(`select count(*) from local_commerce.admin_customization_actions where project_id=${literal(project)} and product_id=${literal(productId)} and operation='restore' and restored_from_revision=1;`), "1");
  assert.equal(sql(`select count(*) from local_commerce.catalog_configuration_snapshots where project_id=${literal(project)} and product_id=${literal(productId)} and configuration_status='active';`), "1");
  const unauthorized = await request(b, "POST", path, { expectedCurrentRevision: "4", restoreFromRevision: 2 });
  assert.equal(unauthorized.http, 401);
  const anon = await fetch(`${prep.config.endpoints.apiUrl}/rest/v1/rpc/admin_customization_publish`, {
    method: "POST", headers: { ...apiKeyHeaders(publicKey), "content-type": "application/json", "content-profile": "local_commerce" },
    body: "{}", signal: AbortSignal.timeout(5_000),
  });
  assert.ok([401, 403, 404].includes(anon.status));
  await anon.arrayBuffer();
  const beforeRestart = await request(b, "GET", path, null, adminCookie);
  assert.equal(beforeRestart.http, 200);
  await stop(a); await stop(b);
  c = await launch();
  const afterRestart = await request(c, "GET", path, null, adminCookie);
  assert.equal(afterRestart.http, 200);
  assert.deepEqual(afterRestart.body.value, beforeRestart.body.value);
  console.info("H03 REAL DISPOSABLE ACCEPTANCE PASS", JSON.stringify({ run, project, postgresMajor: 17,
    ledger: "46/46", publishRevision: 2, concurrentWinnerRevision: 3, restoredRevision: 4,
    audit: 3, restartPidChanged: c.child.pid !== a.child.pid, unauthorizedHttp: unauthorized.http, anonRpcHttp: anon.status }));
} finally {
  for (const worker of [a, b, c]) if (worker) await stop(worker);
}
} finally {
  if (insertedShippingRuleId) quarantineSyntheticShippingRule({ sql, project, id: insertedShippingRuleId,
    ruleKey: fixture.rules[0].rule_key, method: fixture.rules[0].definition.method });
}
