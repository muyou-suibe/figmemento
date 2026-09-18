// C07 real disposable acceptance. This is an acceptance harness only: it
// seeds uniquely-named synthetic Catalog rows through service-role setup, then
// exercises the ordinary Cart -> Checkout -> Local Order HTTP boundaries.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { importJWK, SignJWT } from "jose";
import { catalogDatabaseRows, catalogTestEnvironment, ids } from "../fixtures/local-persistent-catalog.mjs";
import { LocalCatalogAuthority } from "../../app/infrastructure/local-commerce/local-catalog-authority.server.ts";
import { createConfiguredGuestDraftOwnerService, getGuestDraftOwnerCookieName } from "../../app/lib/guest-draft-owner.ts";
import { ensureGuestResourceOwner } from "../../app/application/guest-resource-ownership.server.ts";
import { readPersistentPurchaseCart } from "../../app/server/local-persistent-purchase-authority.server.ts";
import { evaluateLocalCheckoutLine } from "../../app/application/local-checkout-evaluator.ts";
import { LocalCheckoutRuleAuthority } from "../../app/infrastructure/local-commerce/local-checkout-rule-authority.server.ts";
import { localOrderPurchaseVersions } from "../../app/application/local-order-purchase-versions.server.ts";
import { prepareLocalOrderPurchaseFacts } from "../../app/application/local-order-purchase-facts.server.ts";

const run = process.argv.find((value) => /^run-[a-f0-9]{8}$/.test(value)) ?? "run-c07c8d53";
assert.equal(run, "run-c07c8d53", "C07 acceptance is bound to the authorized disposable run");
assert.ok(process.argv.includes("--confirm-disposable"), "explicit disposable confirmation required");

const root = process.cwd();
const dir = `${root}/local/commerce/runtime/disposable/${run}`;
const prep = JSON.parse(readFileSync(`${dir}/ledger-preparation.json`, "utf8"));
const marker = JSON.parse(readFileSync(`${dir}/project-marker.json`, "utf8"));
const manifest = JSON.parse(readFileSync(`${root}/local/commerce/migrations/manifest.json`, "utf8"));
const project = prep.config.projectId;
assert.equal(project, "figmemento-local-commerce-test-run-c07c8d53");
assert.equal(prep.config.postgresMajorVersion, 17);
assert.equal(marker.projectId, project);
assert.equal(marker.runId, run);

function command(bin, args, input) {
  const result = spawnSync(bin, args, { input, encoding: "utf8", timeout: 15_000, maxBuffer: 2 * 1024 * 1024 });
  assert.equal(result.status, 0, `${bin} ${args.join(" ")} failed`);
  return result.stdout.trim();
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

const runningIds = command("docker", ["ps", "-q"]).split("\n").filter(Boolean);
const exactContainers = runningIds.map((id) => JSON.parse(command("docker", ["inspect", id]))[0])
  .filter((container) => container.Config.Labels?.["com.supabase.cli.workdir"] === dir);
const dbContainers = exactContainers.filter((container) => container.Name.startsWith("/supabase_db_"));
assert.equal(dbContainers.length, 1, "exact C07 database container must be uniquely running");
const dbId = dbContainers[0].Id;
const dbName = dbContainers[0].Name.slice(1);
const inspected = JSON.parse(command("docker", ["inspect", dbId]))[0];
assert.equal(inspected.Config.Labels["com.supabase.cli.workdir"], dir);
assert.equal(inspected.State.Status, "running");

const sql = (query) => command("docker", [
  "exec", "-i", dbName, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres",
], query);
assert.match(sql("show server_version_num;"), /^17/);
assert.equal(sql(`select local_commerce.verify_project_identity(${sqlLiteral(project)},${sqlLiteral(prep.markerDigest)});`), "t");
const ledger = JSON.parse(sql("select coalesce(json_agg(json_build_object('version',version,'migrationId',migration_id,'checksum',checksum) order by version),'[]') from local_commerce.migration_ledger;"));
assert.equal(ledger.length, 42);
assert.equal(manifest.schemaVersion, 42);
for (const [index, migration] of manifest.migrations.entries()) {
  assert.equal(ledger[index].version, migration.version);
  assert.equal(ledger[index].migrationId, migration.migrationId);
  assert.equal(ledger[index].checksum, migration.checksum);
  const bytes = readFileSync(`${root}/local/commerce/migrations/${migration.filename}`);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), migration.checksum);
}
assert.equal(sql("select count(*) from local_commerce.migration_ledger where version > 42;"), "0");
assert.equal(sql("select count(*) from pg_proc where pronamespace='local_commerce'::regnamespace and proname='snapshot_single_select_facts';"), "1");
assert.match(sql("select pg_get_functiondef(oid) from pg_proc where pronamespace='local_commerce'::regnamespace and proname='order_commit' limit 1;"), /snapshot_single_select_facts/);

const status = JSON.parse(command("node_modules/.bin/supabase", ["status", "--workdir", dir, "-o", "json"]));
assert.equal(status.API_URL, prep.config.endpoints.apiUrl);
const restContainer = exactContainers.find((container) => container.Name.startsWith("/supabase_rest_"));
assert.ok(restContainer, "exact C07 PostgREST container must be running");
const jwtSecretPair = restContainer.Config.Env.find((entry) => entry.startsWith("PGRST_JWT_SECRET="));
assert.ok(jwtSecretPair, "exact C07 PostgREST JWT authority must be present");
const jwtAuthority = JSON.parse(jwtSecretPair.slice("PGRST_JWT_SECRET=".length));
const octKey = jwtAuthority.keys.find((key) => key.kty === "oct");
assert.ok(octKey, "exact C07 PostgREST HMAC key must be present");
const signingKey = await importJWK(octKey, "HS256");
const serviceRoleKey = await new SignJWT({ role: "service_role", iss: "supabase", iat: Math.floor(Date.now() / 1000) })
  .setProtectedHeader({ alg: "HS256", typ: "JWT" })
  .setIssuedAt()
  .setExpirationTime("2h")
  .sign(signingKey);
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
    LOCAL_CHECKOUT_SOURCE: "local_persistent",
    LOCAL_ORDER_SOURCE: "local_persistent",
    CUSTOMER_UPLOAD_SOURCE: "local_persistent",
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

const headers = {
  apikey: serviceRoleKey,
  authorization: `Bearer ${serviceRoleKey}`,
  "content-type": "application/json",
  "content-profile": "local_commerce",
};
const encoded = JSON.stringify(catalogDatabaseRows(project));
let replaced = encoded;
for (const id of Object.values(ids)) replaced = replaced.replaceAll(id, randomUUID());
const rows = JSON.parse(replaced);
const suffix = randomUUID().replaceAll("-", "");
const fieldId = randomUUID();
const activeChoiceId = randomUUID();
const inactiveChoiceId = randomUUID();
rows.categories[0].slug = `c07-category-${suffix}`;
rows.products[0].slug = `c07-product-${suffix}`;
rows.products[0].name = "C07 Synthetic Select Product";
rows.products[0].fulfillment_definition.requiresProductionPreview = false;
rows.variants[0].sku_code = `C07-SKU-${suffix}`;
rows.rules = rows.rules.filter((row) => row.definition.kind === "shipping");
rows.rules[0].rule_key = `c07-shipping-${suffix}`;
rows.rules[0].definition.method = `c07_standard_${suffix}`;
rows.configurations[0].definition = {
  productId: rows.products[0].id,
  configurationRevision: "1",
  fields: [{
    id: fieldId,
    productId: rows.products[0].id,
    code: "finish",
    label: "Finish",
    kind: "single_select",
    required: true,
    isActive: true,
    position: 0,
    configurationRevision: "1",
    constraints: {
      helpText: "Choose one finish.",
      choices: [
        { id: activeChoiceId, code: "azure", label: "Azure", position: 0, isActive: true },
        { id: inactiveChoiceId, code: "ruby", label: "Ruby", position: 1, isActive: false },
      ],
    },
  }],
};
for (const [key, table] of Object.entries({ categories: "catalog_categories", products: "catalog_products", variants: "catalog_variants", configurations: "catalog_configuration_snapshots", rules: "catalog_pricing_rules" })) {
  const response = await fetch(`${prep.config.endpoints.apiUrl}/rest/v1/${table}`, {
    method: "POST", headers, body: JSON.stringify(rows[key]), signal: AbortSignal.timeout(5_000),
  });
  if (response.status !== 201) assert.fail(`C07 synthetic ${key} setup: ${response.status} ${await response.text()}`);
  await response.arrayBuffer();
}

const catalog = new LocalCatalogAuthority(env);
const snapshot = await catalog.readSnapshot();
assert.equal(snapshot.status, "found");
const fieldResult = await catalog.getCustomizationFieldsForProduct(rows.products[0].id);
assert.equal(fieldResult.status, "found");
assert.equal(fieldResult.value.fields[0].kind, "single_select");
assert.deepEqual(fieldResult.value.fields[0].constraints.choices.map((choice) => ({ id: choice.id, code: choice.code, isActive: choice.isActive })), [
  { id: activeChoiceId, code: "azure", isActive: true },
]);

const ownerService = createConfiguredGuestDraftOwnerService(env);
const issued = await ensureGuestResourceOwner({ projectId: project, context: null, ownerService });
assert.equal(issued.status, "issued");
const guestCookieName = getGuestDraftOwnerCookieName();
let jar = new Map([[guestCookieName, encodeURIComponent(issued.context)]]);
const cookie = () => [...jar].map(([key, value]) => `${key}=${value}`).join("; ");
function acceptCookies(response) {
  for (const value of response.headers.getSetCookie()) {
    const pair = value.split(";", 1)[0];
    const at = pair.indexOf("=");
    jar.set(pair.slice(0, at), pair.slice(at + 1));
  }
}

const appPort = prep.config.ports.imageHelper + 2;
const peerPort = appPort + 1;
for (const port of [appPort, peerPort]) await new Promise((resolve, reject) => {
  const server = createServer();
  server.once("error", reject);
  server.listen(port, "127.0.0.1", () => server.close(resolve));
});
const origin = `http://127.0.0.1:${appPort}`;
let workerLogs = "";
const worker = spawn(process.execPath, ["tests/database/local-commerce-test-worker.mjs", run, "--confirm-disposable", String(appPort)], {
  env, detached: true, stdio: ["ignore", "pipe", "pipe"],
});
for (const stream of [worker.stdout, worker.stderr]) stream.on("data", (chunk) => { workerLogs = (workerLogs + chunk.toString()).slice(-20_000); });
async function stopWorker() {
  if (worker.exitCode !== null || worker.signalCode !== null) return;
  process.kill(-worker.pid, "SIGTERM");
  await new Promise((resolve) => worker.once("exit", resolve));
}
async function ready() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (worker.exitCode !== null) assert.fail(`C07 Worker exited before readiness: ${workerLogs.slice(-2000)}`);
    try {
      const response = await fetch(`${origin}/api/customer-auth/session`, { signal: AbortSignal.timeout(1_000) });
      await response.arrayBuffer();
      if (response.status === 200) return;
    } catch { /* bounded startup poll */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.fail(`C07 Worker readiness timed out: ${workerLogs.slice(-2000)}`);
}
function send(path, body, cookies = cookie()) {
  return fetch(`${origin}${path}`, {
    method: "POST",
    headers: { origin, cookie: cookies, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
}
const handoff = {
  productId: rows.products[0].id,
  variantId: rows.variants[0].id,
  skuCode: rows.variants[0].sku_code,
  selectedOptions: rows.variants[0].selected_options,
  configurationRevision: "1",
  customizationValues: [{ fieldId, fieldCode: "finish", kind: "single_select", choiceId: activeChoiceId }],
};

try {
  await ready();
  assert.match(workerLogs, /LOCAL_COMMERCE_WORKER_MODE_PROOF/);
  const cartResponse = await send("/api/cart", { handoff });
  assert.equal(cartResponse.status, 200);
  acceptCookies(cartResponse);
  const cartProjection = await cartResponse.json();
  assert.equal(cartProjection.lines.length, 1);
  assert.deepEqual(cartProjection.lines[0].customization.personalization.rows[0], {
    kind: "single_select", label: "Finish", state: "provided", value: "Azure",
  });
  const cartCookie = [...jar].find(([key]) => key.includes("cart"));
  assert.ok(cartCookie);
  const cartId = decodeURIComponent(cartCookie[1]);
  assert.match(cartId, /^[a-f0-9-]{36}$/);
  const storedConfigurationValues = JSON.parse(sql(`select configuration_values::text from local_commerce.cart_lines where project_id=${sqlLiteral(project)} and cart_id=${sqlLiteral(cartId)} and lifecycle='active' limit 1;`));
  assert.deepEqual(storedConfigurationValues, [{ fieldId, fieldCode: "finish", kind: "single_select", choiceId: activeChoiceId }]);
  assert.ok(!JSON.stringify(storedConfigurationValues).includes("Azure"));
  console.info("C07 REAL CART SINGLE-SELECT PASS", JSON.stringify({ lines: cartProjection.lines.length, choiceId: activeChoiceId }));

  const checkout = await send("/api/checkout", {
    email: `c07-${suffix}@example.invalid`, firstName: "C07", lastName: "Acceptance", country: "US",
    city: "Test", addressLine1: "Synthetic C07 address", postalCode: "00000", shippingMethod: rows.rules[0].definition.method,
  });
  assert.equal(checkout.status, 200);
  const checkoutProjection = await checkout.json();
  assert.equal(checkoutProjection.status, "accepted");
  assert.equal(checkoutProjection.tax.status, "not_activated");
  assert.equal(checkoutProjection.tax.amountCents, null);
  assert.equal(checkoutProjection.lines[0].skuCode, rows.variants[0].sku_code);
  console.info("C07 REAL CHECKOUT REVALIDATION PASS", JSON.stringify({ status: checkoutProjection.status, tax: checkoutProjection.tax.status }));

  const purchaseCart = await readPersistentPurchaseCart(new Request(origin, { headers: { cookie: cookie() } }), env);
  assert.equal(purchaseCart.status, "found");
  const purchaseBaseline = await catalog.readSnapshot();
  assert.equal(purchaseBaseline.status, "found");
  const evaluatedLine = await evaluateLocalCheckoutLine(purchaseCart.record.lines[0], {
    catalogRepository: catalog.repository,
    customizationFieldRepository: catalog,
    verifiedOwnerId: purchaseCart.owner.ownerId,
    pricingResolver: (pricingInput) => catalog.resolveCustomizationPricing(pricingInput),
  }, new Date().toISOString());
  assert.equal(evaluatedLine.status, "resolved");
  const checkoutRules = await new LocalCheckoutRuleAuthority(env).evaluate({ requiresShipping: true, country: "US", method: rows.rules[0].definition.method, currency: "USD", subtotalCents: evaluatedLine.summary.lineSubtotalCents });
  assert.equal(checkoutRules.status, "found");
  const purchaseVersions = localOrderPurchaseVersions({
    catalog: purchaseBaseline.value.dataSet,
    configurations: purchaseBaseline.value.configurations,
    rules: purchaseBaseline.value.rules,
    versions: purchaseBaseline.value.versions,
    selections: [{ productId: rows.products[0].id, variantId: rows.variants[0].id }],
    requiresShipping: true, country: "US", method: rows.rules[0].definition.method, couponCode: "",
  });
  assert.ok(purchaseVersions);
  const preparedFacts = prepareLocalOrderPurchaseFacts({
    lines: [{ ...evaluatedLine, cartLine: purchaseCart.record.lines[0] }],
    catalog: purchaseBaseline.value.dataSet,
    purchasedFulfillments: purchaseBaseline.value.purchasedFulfillments,
    configurations: purchaseBaseline.value.configurations,
    versions: purchaseVersions,
    shippingCents: checkoutRules.value.shipping.amountCents,
    discountCents: checkoutRules.value.coupon.discountCents,
  });
  assert.equal(preparedFacts.status, "found");
  console.info("C07 PREPARED ORDER FACTS PASS", JSON.stringify({
    versions: purchaseVersions,
    customizationValues: preparedFacts.value.items[0].customizationValues,
    snapshotFactKeys: Object.keys(preparedFacts.value.items[0]).sort(),
  }));

  const orderInput = {
    creationAttemptId: randomUUID(),
    email: `c07-${suffix}@example.invalid`, firstName: "C07", lastName: "Acceptance", country: "US",
    city: "Test", addressLine1: "Synthetic C07 address", postalCode: "00000", shippingMethod: rows.rules[0].definition.method,
  };
  const establishment = await send("/api/local-orders", orderInput);
  if (establishment.status !== 204) assert.fail(`C07 first Local Order establishment: ${establishment.status} ${await establishment.text()}\n${workerLogs.slice(-4000)}`);
  const secondEstablishment = await send("/api/local-orders", orderInput);
  if (secondEstablishment.status !== 204) assert.fail(`C07 second Local Order establishment: ${secondEstablishment.status} ${await secondEstablishment.text()}\n${workerLogs.slice(-4000)}`);
  acceptCookies(secondEstablishment);
  console.info("C07 ORDER CAPABILITY HANDSHAKE PASS", JSON.stringify({ cookieNames: [...jar.keys()].sort() }));
  const order = await send("/api/local-orders", orderInput);
  if (order.status !== 200) assert.fail(`C07 local order commit: ${order.status} ${await order.text()}\n${workerLogs.slice(-4000)}`);
  const orderProjection = await order.json();
  assert.match(orderProjection.publicReference, /^FM-LOCAL-[A-Z0-9]{16}$/);
  const orderId = sql(`select id from local_commerce.orders where project_id=${sqlLiteral(project)} and public_reference=${sqlLiteral(orderProjection.publicReference)};`);
  const itemId = sql(`select id from local_commerce.order_items where project_id=${sqlLiteral(project)} and order_id=${sqlLiteral(orderId)} order by item_sequence limit 1;`);
  const snapshotJson = sql(`select customization_facts::text from local_commerce.order_item_purchase_snapshots where project_id=${sqlLiteral(project)} and order_item_id=${sqlLiteral(itemId)};`);
  const customizationFacts = JSON.parse(snapshotJson);
  const serverFacts = Array.isArray(customizationFacts.values)
    ? customizationFacts.values.find((value) => value.kind === "single_select")
    : undefined;
  assert.ok(serverFacts, "Order snapshot must contain server-resolved single-select facts");
  assert.deepEqual({ fieldId: serverFacts.fieldId, fieldCode: serverFacts.fieldCode, fieldLabel: serverFacts.fieldLabel, choiceId: serverFacts.choiceId, choiceCode: serverFacts.choiceCode, choiceLabel: serverFacts.choiceLabel }, {
    fieldId, fieldCode: "finish", fieldLabel: "Finish", choiceId: activeChoiceId, choiceCode: "azure", choiceLabel: "Azure",
  });
  assert.equal(serverFacts.choicePosition, 0);
  assert.ok(!JSON.stringify(customizationFacts).includes("selectedSpecificationKey"));
  assert.equal(sql(`select sku_code from local_commerce.order_item_purchase_snapshots where project_id=${sqlLiteral(project)} and order_item_id=${sqlLiteral(itemId)};`), rows.variants[0].sku_code);
  console.info("C07 REAL LOCAL ORDER SNAPSHOT PASS", JSON.stringify({ publicReference: orderProjection.publicReference, serverResolvedChoice: true }));

  const badOwner = await ensureGuestResourceOwner({ projectId: project, context: null, ownerService });
  assert.equal(badOwner.status, "issued");
  const foreignCookies = `${guestCookieName}=${encodeURIComponent(badOwner.context)}`;
  const foreignRead = await fetch(`${origin}/api/cart`, { headers: { origin, cookie: foreignCookies }, signal: AbortSignal.timeout(5_000) });
  assert.ok([200, 404].includes(foreignRead.status));
  await foreignRead.arrayBuffer();
  const unknownChoice = await send("/api/cart", { handoff: { ...handoff, customizationValues: [{ fieldId, fieldCode: "finish", kind: "single_select", choiceId: inactiveChoiceId }] }, }, foreignCookies);
  assert.equal(unknownChoice.status, 400);
  await unknownChoice.arrayBuffer();
  const browserFacts = await send("/api/cart", { handoff: { ...handoff, customizationValues: [{ fieldId, fieldCode: "finish", kind: "single_select", choiceId: activeChoiceId, choiceCode: "azure" }] } }, foreignCookies);
  assert.equal(browserFacts.status, 400);
  await browserFacts.arrayBuffer();
  const staleRevision = await send("/api/cart", { handoff: { ...handoff, configurationRevision: "999" } }, foreignCookies);
  assert.equal(staleRevision.status, 400);
  await staleRevision.arrayBuffer();
  console.info("C07 REAL REJECTION MATRIX PASS", JSON.stringify({ inactiveChoice: 400, browserFacts: 400, staleRevision: 400 }));
} finally {
  await stopWorker();
}

console.info("C07 REAL DISPOSABLE ACCEPTANCE PASS", JSON.stringify({
  run, project, postgresMajor: 17, ledger: "42/42", pending: 0, migration: "0042", remote: false,
}));
