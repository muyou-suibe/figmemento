// C08 real disposable acceptance. Acceptance-only; never imported by the
// database-free test entrypoints and never a business runtime dependency.
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { importJWK, SignJWT } from "jose";

import { catalogDatabaseRows, catalogTestEnvironment, ids } from "../fixtures/local-persistent-catalog.mjs";

const run = process.argv.find((value) => /^run-[a-f0-9]{8}$/.test(value));
assert.equal(run, "run-9d2e7a4c", "C08 acceptance is bound to the authorized fresh run");
assert.ok(process.argv.includes("--confirm-disposable"), "explicit disposable confirmation required");

const root = process.cwd();
const dir = `${root}/local/commerce/runtime/disposable/${run}`;
const prep = JSON.parse(readFileSync(`${dir}/ledger-preparation.json`, "utf8"));
const marker = JSON.parse(readFileSync(`${dir}/project-marker.json`, "utf8"));
const manifest = JSON.parse(readFileSync(`${root}/local/commerce/migrations/manifest.json`, "utf8"));
const project = prep.config.projectId;
assert.equal(project, "figmemento-local-commerce-test-run-9d2e7a4c");
assert.equal(prep.config.postgresMajorVersion, 17);
assert.equal(marker.projectId, project);
assert.equal(marker.runId, run);

function command(binary, args, input, timeout = 20_000) {
  const result = spawnSync(binary, args, { input, encoding: "utf8", timeout, maxBuffer: 4 * 1024 * 1024 });
  assert.equal(result.status, 0, `${binary} ${args.join(" ")} failed\n${result.stderr ?? ""}`);
  return result.stdout.trim();
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

const containerIds = command("docker", ["ps", "-q"]).split("\n").filter(Boolean);
const exactContainers = containerIds.map((id) => JSON.parse(command("docker", ["inspect", id]))[0])
  .filter((container) => container.Config.Labels?.["com.supabase.cli.workdir"] === dir);
const databases = exactContainers.filter((container) => container.Name.startsWith("/supabase_db_"));
assert.equal(databases.length, 1, "exact C08 database container must be uniquely running");
const dbName = databases[0].Name.slice(1);
assert.equal(databases[0].State.Status, "running");

const sql = (query) => command("docker", [
  "exec", "-i", dbName, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres",
], query);

assert.match(sql("show server_version_num;"), /^17/);
assert.equal(sql(`select local_commerce.verify_project_identity(${sqlLiteral(project)},${sqlLiteral(prep.markerDigest)});`), "t");
const ledger = JSON.parse(sql("select coalesce(json_agg(json_build_object('version',version,'migrationId',migration_id,'checksum',checksum) order by version),'[]') from local_commerce.migration_ledger;"));
assert.equal(ledger.length, 43);
assert.equal(manifest.schemaVersion, 43);
for (const [index, migration] of manifest.migrations.entries()) {
  assert.equal(ledger[index].version, migration.version);
  assert.equal(ledger[index].migrationId, migration.migrationId);
  assert.equal(ledger[index].checksum, migration.checksum);
  assert.equal(createHash("sha256").update(readFileSync(`${root}/local/commerce/migrations/${migration.filename}`)).digest("hex"), migration.checksum);
}
assert.equal(sql("select count(*) from local_commerce.migration_ledger where version > 43;"), "0");
assert.equal(sql(`select count(*) from local_commerce.project_identities where project_id=${sqlLiteral(project)} and marker_digest=${sqlLiteral(prep.markerDigest)} and project_kind='disposable_test' and environment='test' and lifecycle='active';`), "1");

const status = JSON.parse(command("node_modules/.bin/supabase", ["status", "--workdir", dir, "-o", "json"]));
assert.equal(status.API_URL, prep.config.endpoints.apiUrl);
const restContainer = exactContainers.find((container) => container.Name.startsWith("/supabase_rest_"));
assert.ok(restContainer, "exact C08 PostgREST container must be running");
const jwtSecretPair = restContainer.Config.Env.find((entry) => entry.startsWith("PGRST_JWT_SECRET="));
assert.ok(jwtSecretPair, "exact C08 PostgREST signing authority must be present");
const jwtAuthority = JSON.parse(jwtSecretPair.slice("PGRST_JWT_SECRET=".length));
const octKey = jwtAuthority.keys.find((key) => key.kty === "oct");
assert.ok(octKey);
const signingKey = await importJWK(octKey, "HS256");
const serviceRoleKey = await new SignJWT({ role: "service_role", iss: "supabase", iat: Math.floor(Date.now() / 1000) })
  .setProtectedHeader({ alg: "HS256", typ: "JWT" }).setIssuedAt().setExpirationTime("2h").sign(signingKey);

const env = {
  ...process.env,
  ...catalogTestEnvironment({
    LOCAL_COMMERCE_RUN_ID: run,
    LOCAL_COMMERCE_PROJECT_ID: project,
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
    LOCAL_COMMERCE_SERVICE_ROLE_KEY: serviceRoleKey,
    CART_SOURCE: "local_persistent",
    CUSTOMER_AUTH_SOURCE: "local_persistent",
    PHOTOGIFT_PRODUCT_SOURCE: "local_persistent",
    LOCAL_CHECKOUT_SOURCE: "local_persistent",
    LOCAL_ORDER_SOURCE: "local_persistent",
    CUSTOMER_UPLOAD_SOURCE: "disabled",
    LOCAL_PAYMENT_SOURCE: "disabled",
    LOCAL_FULFILLMENT_SOURCE: "disabled",
    LOCAL_TRACKING_SOURCE: "disabled",
    ADMIN_ACCEPTANCE_SOURCE: "local_fake",
    LOCAL_COMMERCE_IMAGE_HELPER_SECRET: randomBytes(32).toString("base64url"),
    LOCAL_ORDER_CAPABILITY_SECRET: randomBytes(32).toString("hex"),
    PHOTOGIFT_GUEST_DRAFT_OWNER_SECRET: randomBytes(48).toString("base64url"),
    PHOTOGIFT_GUEST_DRAFT_OWNER_CONTEXT_TTL_SECONDS: "3600",
  }),
};
env.CLOUDFLARE_INCLUDE_PROCESS_ENV = "true";
env.WRANGLER_SEND_METRICS = "false";
env.WRANGLER_WRITE_LOGS = "false";
env.LOCAL_COMMERCE_ACCEPTANCE_DISABLE_INSPECTOR = "true";

const headers = {
  apikey: serviceRoleKey,
  authorization: `Bearer ${serviceRoleKey}`,
  "content-type": "application/json",
  "content-profile": "local_commerce",
};
const rows = catalogDatabaseRows(project);
const replaceIds = new Map(Object.values(ids).map((id) => [id, randomUUID()]));
const encodedRows = JSON.stringify(rows);
let replaced = encodedRows;
for (const [from, to] of replaceIds) replaced = replaced.replaceAll(from, to);
const synthetic = JSON.parse(replaced);
const suffix = randomUUID().replaceAll("-", "");
const fieldId = randomUUID();
const choiceA = randomUUID();
const choiceB = randomUUID();
const choiceC = randomUUID();
const choiceRetired = randomUUID();
synthetic.categories[0].slug = `c08-category-${suffix}`;
synthetic.products[0].slug = `c08-product-${suffix}`;
synthetic.products[0].name = "C08 Synthetic Multi-Select Product";
synthetic.products[0].fulfillment_definition.requiresProductionPreview = false;
synthetic.variants[0].sku_code = `C08-SKU-${suffix}`;
synthetic.rules = synthetic.rules.filter((row) => row.definition.kind === "shipping");
synthetic.rules[0].rule_key = `c08-shipping-${suffix}`;
synthetic.rules.push({
  project_id: project, id: randomUUID(), version: 1, lifecycle: "active", rule_key: `c08-surcharge-${suffix}`,
  revision: 1, rule_status: "active", definition: {
    kind: "customization_surcharge", ruleRevision: 1, productId: synthetic.products[0].id,
    configurationRevision: "1", selector: { kind: "field_present", fieldId }, amountCents: 125, currency: "USD",
  },
});
synthetic.configurations[0].definition = {
  productId: synthetic.products[0].id, configurationRevision: "1", fields: [{
    id: fieldId, productId: synthetic.products[0].id, code: "addons", label: "Add-ons", kind: "multi_select",
    required: true, isActive: true, position: 0, configurationRevision: "1",
    constraints: { helpText: "Choose your details.", minSelections: 1, maxSelections: 3, choices: [
      { id: choiceB, code: "b", label: "B", position: 0, isActive: true },
      { id: choiceC, code: "c", label: "C", position: 1, isActive: true },
      { id: choiceA, code: "a", label: "A", position: 2, isActive: true },
      { id: choiceRetired, code: "retired", label: "Retired", position: 3, isActive: false },
    ] },
  }],
};

for (const [key, table] of Object.entries({ categories: "catalog_categories", products: "catalog_products", variants: "catalog_variants", configurations: "catalog_configuration_snapshots", rules: "catalog_pricing_rules" })) {
  const response = await fetch(`${prep.config.endpoints.apiUrl}/rest/v1/${table}`, {
    method: "POST", headers, body: JSON.stringify(synthetic[key]), signal: AbortSignal.timeout(5_000),
  });
  assert.equal(response.status, 201, `C08 synthetic ${key} setup failed: ${response.status}`);
  await response.arrayBuffer();
}

const { createConfiguredGuestDraftOwnerService, getGuestDraftOwnerCookieName } = await import("../../app/lib/guest-draft-owner.ts");
const guestOwnerCookieName = getGuestDraftOwnerCookieName();
const { ensureGuestResourceOwner } = await import("../../app/application/guest-resource-ownership.server.ts");
const ownerService = createConfiguredGuestDraftOwnerService(env);
const issued = await ensureGuestResourceOwner({ projectId: project, context: null, ownerService });
assert.equal(issued.status, "issued");
let jar = new Map([[guestOwnerCookieName, encodeURIComponent(issued.context)]]);
const cookie = () => [...jar].map(([key, value]) => `${key}=${value}`).join("; ");
function acceptCookies(response) {
  for (const value of response.headers.getSetCookie()) {
    const pair = value.split(";", 1)[0];
    const at = pair.indexOf("=");
    jar.set(pair.slice(0, at), pair.slice(at + 1));
  }
}

const handoff = {
  productId: synthetic.products[0].id,
  variantId: synthetic.variants[0].id,
  skuCode: synthetic.variants[0].sku_code,
  selectedOptions: synthetic.variants[0].selected_options,
  configurationRevision: "1",
  customizationValues: [{ fieldId, fieldCode: "addons", kind: "multi_select", choiceIds: [choiceA, choiceB, choiceC] }],
};

const { LocalCatalogAuthority } = await import("../../app/infrastructure/local-commerce/local-catalog-authority.server.ts");
const { acceptCartItem } = await import("../../app/application/shopping-cart-service.ts");
const catalogAuthority = new LocalCatalogAuthority(env);
const catalogSnapshot = await catalogAuthority.readSnapshot();
assert.equal(catalogSnapshot.status, "found", "C08 synthetic catalog must be readable");
const directAccepted = await acceptCartItem(handoff, {
  observedAt: new Date().toISOString(), catalogRepository: catalogAuthority.repository,
  customizationFieldRepository: catalogAuthority,
  pricingResolver: (pricingInput) => catalogAuthority.resolveCustomizationPricing(pricingInput),
});
assert.equal(directAccepted.status, "accepted", `C08 server acceptance preflight rejected: ${JSON.stringify(directAccepted)}`);

const appPort = prep.config.ports.imageHelper + 2;
const peerPort = appPort + 1;
for (const port of [appPort, peerPort]) await new Promise((resolve, reject) => {
  const server = createServer(); server.once("error", reject); server.listen(port, "127.0.0.1", () => server.close(resolve));
});

function launch(port) {
  const worker = spawn(process.execPath, ["tests/database/local-commerce-test-worker.mjs", run, "--confirm-disposable", String(port)], {
    env, detached: true, stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  for (const stream of [worker.stdout, worker.stderr]) stream.on("data", (chunk) => { logs = (logs + chunk.toString()).slice(-20_000); });
  return { worker, get logs() { return logs; } };
}
async function ready(instance, port) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (instance.worker.exitCode !== null) assert.fail(`C08 Worker exited: ${instance.logs.slice(-2000)}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/customer-auth/session`, { signal: AbortSignal.timeout(1_000) });
      await response.arrayBuffer();
      if (response.status === 200) return;
    } catch { /* bounded startup poll */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.fail(`C08 Worker readiness timed out: ${instance.logs.slice(-3000)}`);
}
async function stop(instance) {
  if (instance.worker.exitCode !== null || instance.worker.signalCode !== null) return;
  process.kill(-instance.worker.pid, "SIGTERM");
  await new Promise((resolve) => instance.worker.once("exit", resolve));
}
function request(port, method, path, body, cookies = cookie()) {
  return fetch(`http://127.0.0.1:${port}${path}`, {
    method, headers: { origin: `http://127.0.0.1:${port}`, cookie: cookies, ...(body ? { "content-type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15_000),
  });
}

const first = launch(appPort);
let second;
let cartId;
let orderReference;
try {
  await ready(first, appPort);
  assert.match(first.logs, /LOCAL_COMMERCE_WORKER_MODE_PROOF/);
  const addBody = { handoff };
  for (let index = 0; index < 2; index += 1) {
    const response = await request(appPort, "POST", "/api/cart", addBody);
    if (response.status !== 200) {
      assert.fail(`C08 Cart add ${index + 1}: ${await response.text()}\n${first.logs.slice(-3000)}`);
    }
    acceptCookies(response);
    const projection = await response.json();
    assert.equal(projection.lines.length, index + 1);
    assert.deepEqual(projection.lines.at(-1).customization.personalization.rows[0], {
      kind: "multi_select", label: "Add-ons", state: "provided", value: "B, C, A",
    });
  }
  const cartCookie = [...jar].find(([key]) => key.includes("cart"));
  assert.ok(cartCookie);
  cartId = decodeURIComponent(cartCookie[1]);
  assert.match(cartId, /^[a-f0-9-]{36}$/);
  const storedLines = JSON.parse(sql(`select coalesce(json_agg(json_build_object('lineId',id,'values',configuration_values,'pricing',pricing_snapshot) order by position),'[]') from local_commerce.cart_lines where project_id=${sqlLiteral(project)} and cart_id=${sqlLiteral(cartId)} and lifecycle='active';`));
  assert.equal(storedLines.length, 2);
  assert.notEqual(storedLines[0].lineId, storedLines[1].lineId);
  for (const line of storedLines) {
    assert.deepEqual(line.values, [{ fieldId, fieldCode: "addons", kind: "multi_select", choiceIds: [choiceB, choiceC, choiceA] }]);
    assert.equal(line.pricing.totalSurchargeCents, 125);
    assert.equal(line.pricing.surchargeAllocations.length, 1);
  }
  console.info("C08 REAL CART CARDINALITY/CANONICAL ORDER/C03 PASS", JSON.stringify({ lines: 2, surchargeAllocationsPerLine: 1 }));

  const foreign = await ensureGuestResourceOwner({ projectId: project, context: null, ownerService });
  assert.equal(foreign.status, "issued");
  const foreignCookie = `${guestOwnerCookieName}=${encodeURIComponent(foreign.context)}`;
  for (const badValue of [
    [choiceRetired], [choiceA, choiceA], [choiceA, "injected"],
  ]) {
    const response = await request(appPort, "POST", "/api/cart", { handoff: { ...handoff, customizationValues: [{ ...handoff.customizationValues[0], choiceIds: badValue }] } }, foreignCookie);
    assert.equal(response.status, 400);
    await response.arrayBuffer();
  }
  const stale = await request(appPort, "POST", "/api/cart", { handoff: { ...handoff, configurationRevision: "999" } }, foreignCookie);
  assert.equal(stale.status, 400);
  await stale.arrayBuffer();
  const foreignRead = await request(appPort, "GET", "/api/cart", undefined, foreignCookie);
  assert.ok([200, 404].includes(foreignRead.status));
  await foreignRead.arrayBuffer();
  const unchanged = JSON.parse(sql(`select count(*) from local_commerce.cart_lines where project_id=${sqlLiteral(project)} and cart_id=${sqlLiteral(cartId)} and lifecycle='active';`));
  assert.equal(unchanged, 2);
  console.info("C08 REAL INACTIVE/DUPLICATE/INJECTED/STALE/CROSS-OWNER REJECTION PASS");

  await stop(first);
  second = launch(peerPort);
  await ready(second, peerPort);
  const recovered = await request(peerPort, "GET", "/api/cart");
  assert.equal(recovered.status, 200);
  const recoveredProjection = await recovered.json();
  assert.equal(recoveredProjection.lines.length, 2);
  assert.deepEqual(recoveredProjection.lines.map((line) => line.customization.personalization.rows[0].value), ["B, C, A", "B, C, A"]);
  const recoveredCookie = [...jar].map(([key, value]) => `${key}=${value}`).join("; ");
  assert.match(recoveredCookie, new RegExp(`^|;\\s*${cartCookie[0]}=`));
  console.info("C08 PROCESS RESTART CART READ-BACK PASS", JSON.stringify({ cartId, lines: recoveredProjection.lines.length }));

  const checkout = await request(peerPort, "POST", "/api/checkout", {
    email: `c08-${suffix}@example.invalid`, firstName: "C08", lastName: "Acceptance", country: "US",
    city: "Test", addressLine1: "Synthetic C08 address", postalCode: "00000", shippingMethod: synthetic.rules[0].definition.method,
  });
  assert.equal(checkout.status, 200);
  const checkoutProjection = await checkout.json();
  assert.equal(checkoutProjection.status, "accepted");
  assert.equal(checkoutProjection.tax.status, "not_activated");
  assert.equal(checkoutProjection.tax.amountCents, null);
  assert.equal(checkoutProjection.lines.length, 2);
  assert.equal(checkoutProjection.lines[0].unitPriceCents, 2625);
  console.info("C08 REAL CHECKOUT PASS", JSON.stringify({ status: checkoutProjection.status, tax: checkoutProjection.tax.status, lines: 2 }));

  const orderInput = {
    creationAttemptId: randomUUID(), email: `c08-${suffix}@example.invalid`, firstName: "C08", lastName: "Acceptance",
    country: "US", city: "Test", addressLine1: "Synthetic C08 address", postalCode: "00000", shippingMethod: synthetic.rules[0].definition.method,
  };
  const handshake = await request(peerPort, "POST", "/api/local-orders", orderInput);
  assert.equal(handshake.status, 204, "C08 order capability handshake");
  acceptCookies(handshake);
  const committed = await request(peerPort, "POST", "/api/local-orders", orderInput);
  if (committed.status !== 200) {
    assert.fail(`C08 local order commit: ${committed.status} ${await committed.text()}\n${second.logs.slice(-3000)}`);
  }
  const orderProjection = await committed.json();
  orderReference = orderProjection.publicReference;
  assert.match(orderReference, /^FM-LOCAL-[A-Z0-9]{16}$/);
  const orderId = sql(`select id from local_commerce.orders where project_id=${sqlLiteral(project)} and public_reference=${sqlLiteral(orderReference)};`);
  const snapshotRows = JSON.parse(sql(`select coalesce(json_agg(json_build_object('itemId',s.order_item_id,'facts',s.customization_facts,'sku',s.sku_code) order by s.order_item_id),'[]') from local_commerce.order_item_purchase_snapshots s join local_commerce.order_items i on i.project_id=s.project_id and i.id=s.order_item_id where s.project_id=${sqlLiteral(project)} and i.order_id=${sqlLiteral(orderId)};`));
  assert.equal(snapshotRows.length, 2);
  for (const snapshot of snapshotRows) {
    const facts = snapshot.facts;
    assert.equal(snapshot.sku, synthetic.variants[0].sku_code);
    assert.ok(!JSON.stringify(facts).includes("selectedSpecificationKey"));
    assert.deepEqual(facts.values[0].choiceIds, [choiceB, choiceC, choiceA]);
  }
  console.info("C08 REAL ORDER SNAPSHOT/VARIANT-SKU/DETACHED FACTS PASS", JSON.stringify({ orderReference, items: snapshotRows.length }));

  const beforeCount = sql(`select count(*) from local_commerce.order_item_purchase_snapshots s join local_commerce.order_items i on i.project_id=s.project_id and i.id=s.order_item_id where s.project_id=${sqlLiteral(project)} and i.order_id=${sqlLiteral(orderId)};`);
  const deleteAttempt = spawnSync("docker", ["exec", "-i", dbName, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], {
    input: `delete from local_commerce.order_item_purchase_snapshots s using local_commerce.order_items i where s.project_id=${sqlLiteral(project)} and s.order_item_id=i.id and i.project_id=${sqlLiteral(project)} and i.order_id=${sqlLiteral(orderId)};`, encoding: "utf8", timeout: 15_000,
  });
  assert.notEqual(deleteAttempt.status, 0, "immutable order snapshots must reject delete");
  assert.equal(sql(`select count(*) from local_commerce.order_item_purchase_snapshots s join local_commerce.order_items i on i.project_id=s.project_id and i.id=s.order_item_id where s.project_id=${sqlLiteral(project)} and i.order_id=${sqlLiteral(orderId)};`), beforeCount);
  console.info("C08 IMMUTABLE SNAPSHOT PASS", JSON.stringify({ rows: beforeCount }));

  const wrongProject = { ...env, LOCAL_COMMERCE_PROJECT_ID: "figmemento-local-commerce-test-run-00000000" };
  const wrongCatalog = await new LocalCatalogAuthority(wrongProject).readSnapshot();
  assert.notEqual(wrongCatalog.status, "found");
  console.info("C08 CROSS-PROJECT FAIL-CLOSED PASS");
} finally {
  if (second) await stop(second);
  else await stop(first);
}

console.info("C08 REAL DISPOSABLE ACCEPTANCE PASS", JSON.stringify({ run, project, postgresMajor: 17, ledger: "43/43", pending: 0, migration: "0043", remote: false, orderReference }));
