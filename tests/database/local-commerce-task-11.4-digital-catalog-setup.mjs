// Exact-run, test-only Catalog dependency setup for Task 11.4. This file has
// no application import path and writes only through the local service-role
// PostgREST Catalog boundary after the complete project/ledger identity gate.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { createLocalPersistentCustomerAuthProvider } from "../../app/application/customer-auth-persistent-provider.server.ts";
import { planMigrationLedger, sha256Text } from "../../app/application/local-commerce-migration-ledger.ts";
import { acceptCartItem } from "../../app/application/shopping-cart-service.ts";
import { validateProjectMarker } from "../../app/application/local-commerce-environment.ts";
import { createLocalPersistentCartPort } from "../../app/infrastructure/local-commerce/local-persistent-cart-adapter.server.ts";
import { LocalCatalogAuthority } from "../../app/infrastructure/local-commerce/local-catalog-authority.server.ts";
import { catalogDatabaseRows, catalogTestEnvironment, ids } from "../fixtures/local-persistent-catalog.mjs";

assert.deepEqual(process.argv.slice(2), ["run-93f6c1a2", "--confirm-disposable"]);
const run = "run-93f6c1a2";
const projectId = `figmemento-local-commerce-test-${run}`;
const root = path.resolve(".");
const workdir = path.join(root, "local/commerce/runtime/disposable", run);
const preparation = JSON.parse(readFileSync(path.join(workdir, "ledger-preparation.json"), "utf8"));
const marker = JSON.parse(readFileSync(path.join(workdir, "project-marker.json"), "utf8"));
const manifest = JSON.parse(readFileSync("local/commerce/migrations/manifest.json", "utf8"));
assert.equal(preparation.config.projectId, projectId);
assert.equal(preparation.config.projectKind, "disposable_test");
assert.equal(preparation.config.environment, "test");
assert.equal(preparation.config.postgresMajorVersion, 17);
assert.equal(validateProjectMarker(marker, preparation.config), true);
assert.equal(sha256Text(JSON.stringify(marker)), preparation.markerDigest);
assert.equal(manifest.schemaVersion, 37);
assert.equal(manifest.migrations.length, 37);

function command(binary, args, input, timeout = 30_000) {
  const result = spawnSync(binary, args, { cwd: root, input, encoding: "utf8", timeout, maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: "true" } });
  assert.equal(result.error, undefined, `${binary} bounded execution failed`);
  assert.equal(result.status, 0, (result.stderr || "command failed").replace(/eyJ[A-Za-z0-9_.-]+/g, "[redacted]").split("\n")[0]);
  return result.stdout.trim();
}
const containerIds = command("docker", ["ps", "--filter", `label=com.supabase.cli.workdir=${workdir}`, "--format", "{{.ID}}"]).split("\n").filter(Boolean);
const containers = JSON.parse(command("docker", ["inspect", ...containerIds]));
const databases = containers.filter((container) => container.Name.startsWith("/supabase_db_")
  && container.Config?.Labels?.["com.supabase.cli.workdir"] === workdir && container.State?.Running === true);
assert.equal(databases.length, 1);
const database = databases[0].Id;
const sql = (query) => command("docker", ["exec", "-i", database, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], query);
assert.equal(sql("select current_setting('server_version_num')::int/10000;"), "17");
assert.equal(sql(`select local_commerce.verify_project_identity('${projectId}','${preparation.markerDigest}');`), "t");
const applied = JSON.parse(sql("select json_agg(json_build_object('version',version,'migrationId',migration_id,'checksum',checksum,'projectId',project_id) order by version) from local_commerce.migration_ledger;"));
const plan = planMigrationLedger({ ...manifest, projectId }, applied, projectId);
assert.equal(applied.length, 37);
assert.equal(plan.status, "ready");
assert.equal(plan.apply.length, 0);
for (const migration of manifest.migrations) {
  assert.equal(sha256Text(readFileSync(path.join("local/commerce/migrations", migration.filename), "utf8")), migration.checksum);
}

const stack = JSON.parse(command(path.resolve("node_modules/.bin/supabase"), ["status", "--workdir", workdir, "-o", "json"]));
const target = {
  category: "11400000-0000-4000-8000-000000000001",
  product: "11400000-0000-4000-8000-000000000002",
  variant: "11400000-0000-4000-8000-000000000003",
  option: "11400000-0000-4000-8000-000000000004",
  value: "11400000-0000-4000-8000-000000000005",
  fulfillment: "11400000-0000-4000-8000-000000000006",
  config: "11400000-0000-4000-8000-000000000007",
  field: "11400000-0000-4000-8000-000000000008",
  shipping: "11400000-0000-4000-8000-000000000009",
  coupon: "11400000-0000-4000-8000-000000000010",
};
let encoded = JSON.stringify(catalogDatabaseRows(projectId));
for (const key of Object.keys(target)) encoded = encoded.replaceAll(ids[key], target[key]);
const rows = JSON.parse(encoded);
rows.categories[0].slug = "task-11-4-digital";
rows.categories[0].name = "Task 11.4 digital acceptance";
rows.products[0].slug = "task-11-4-digital";
rows.products[0].name = "Task 11.4 digital acceptance product";
rows.variants[0].sku_code = "TASK-11-4-DIGITAL-001";
Object.assign(rows.products[0].fulfillment_definition, {
  fulfillmentType: "digital", requiresShipping: false,
  productionMode: "digital_creation", requiresProductionPreview: false,
});
rows.configurations[0].definition.fields = [];
rows.rules = [];

const expectedIds = [target.category, target.product, target.variant, target.config];
const existing = Number(sql(`select
  (select count(*) from local_commerce.catalog_categories where project_id='${projectId}' and id='${target.category}')+
  (select count(*) from local_commerce.catalog_products where project_id='${projectId}' and id='${target.product}')+
  (select count(*) from local_commerce.catalog_variants where project_id='${projectId}' and id='${target.variant}')+
  (select count(*) from local_commerce.catalog_configuration_snapshots where project_id='${projectId}' and id='${target.config}');`));
assert.ok(existing === 0 || existing === expectedIds.length, "partial/conflicting Task 11.4 fixture identity");
const serviceHeaders = { apikey: stack.SERVICE_ROLE_KEY, authorization: `Bearer ${stack.SERVICE_ROLE_KEY}`,
  "content-type": "application/json", "content-profile": "local_commerce", prefer: "return=minimal" };
if (existing === 0) {
  for (const [key, table] of Object.entries({ categories: "catalog_categories", products: "catalog_products",
    variants: "catalog_variants", configurations: "catalog_configuration_snapshots" })) {
    const response = await fetch(`${stack.API_URL}/rest/v1/${table}`, { method: "POST", headers: serviceHeaders,
      body: JSON.stringify(rows[key]), signal: AbortSignal.timeout(10_000) });
    assert.equal(response.status, 201, `${table}: ${await response.text()}`);
  }
}

const environment = catalogTestEnvironment({
  LOCAL_COMMERCE_RUN_ID: run, LOCAL_COMMERCE_PROJECT_ID: projectId,
  LOCAL_COMMERCE_MARKER_DIGEST: preparation.markerDigest, LOCAL_COMMERCE_SERVICE_ROLE_KEY: stack.SERVICE_ROLE_KEY,
  LOCAL_COMMERCE_API_URL: preparation.config.endpoints.apiUrl, LOCAL_COMMERCE_RPC_URL: preparation.config.endpoints.rpcUrl,
  LOCAL_COMMERCE_STORAGE_URL: preparation.config.endpoints.storageUrl,
  CUSTOMER_AUTH_SOURCE: "local_persistent", CART_SOURCE: "local_persistent", PHOTOGIFT_PRODUCT_SOURCE: "local_persistent",
});
for (const [name, value] of Object.entries({ SHADOW_DB: preparation.config.ports.shadowDb, API: preparation.config.ports.api,
  DB: preparation.config.ports.db, STUDIO: preparation.config.ports.studio, SMTP: preparation.config.ports.smtp })) {
  environment[`LOCAL_COMMERCE_${name}_PORT`] = String(value);
}
const catalog = new LocalCatalogAuthority(environment);
const snapshot = await catalog.readSnapshot();
assert.equal(snapshot.status, "found");
const product = snapshot.value.dataSet.products.find((item) => item.id === target.product);
const variant = snapshot.value.dataSet.variants.find((item) => item.id === target.variant);
const fulfillment = snapshot.value.dataSet.fulfillmentConfigs.find((item) => item.productId === target.product);
const purchaseFulfillment = snapshot.value.purchasedFulfillments[target.product];
const configuration = snapshot.value.configurations.find((item) => item.product_id === target.product);
assert.equal(product?.lifecycle, "published");
assert.equal(variant?.isActive, true);
assert.equal(variant?.isAvailable, true);
assert.equal(variant?.skuCode, "TASK-11-4-DIGITAL-001");
assert.equal(configuration?.revision, 1);
assert.equal(fulfillment?.fulfillmentType, "digital");
assert.equal(fulfillment?.requiresShipping, false);
assert.equal(fulfillment?.productionMode, "digital_creation");
assert.equal(purchaseFulfillment?.requiresProductionPreview, false);

const auth = createLocalPersistentCustomerAuthProvider(environment);
const signedUp = await auth.signUp({ email: `task-11-4-digital-smoke-${randomUUID()}@example.invalid`, password: "Task-11.4-digital-smoke-password!" });
assert.equal(signedUp.status, "ok");
const cart = await createLocalPersistentCartPort({ environment,
  owner: { kind: "customer", projectId, ownerId: signedUp.value.session.ownerId, customerId: signedUp.value.session.customer.id },
  authorityExpiresAt: Date.parse(signedUp.value.session.expiresAt) / 1000 });
assert.equal(cart.status, "ready");
const created = await cart.port.create({ authority: cart.authority,
  idempotency: { key: randomUUID(), fingerprint: "task-11.4-digital-fixture-smoke-cart" } });
assert.equal(created.status, "found");
const accepted = await acceptCartItem({ productId: target.product, variantId: target.variant, skuCode: variant.skuCode,
  selectedOptions: variant.selectedOptions, configurationRevision: "1", customizationValues: [] },
{ observedAt: new Date().toISOString(), catalogRepository: catalog.repository, customizationFieldRepository: catalog });
assert.equal(accepted.status, "accepted");
const added = await cart.port.addLine({ authority: cart.authority, cartId: created.value.cartId,
  expectedVersion: created.value.version, item: accepted.value,
  idempotency: { key: randomUUID(), fingerprint: "task-11.4-digital-fixture-smoke-add" } });
assert.equal(added.status, "found");
assert.equal(added.value.record.lines.length, 1);
assert.equal(added.value.record.lines[0].snapshot.productId, target.product);

console.info(JSON.stringify({ status: "PASS", fixture: existing === 0 ? "CREATED" : "REUSED", run, projectId,
  postgres: 17, ledger: "37/37", pending: 0, checksums: "37/37", productId: target.product,
  variantId: target.variant, skuCode: variant.skuCode, configurationRevision: "1",
  fulfillment: { fulfillmentType: fulfillment.fulfillmentType, requiresShipping: fulfillment.requiresShipping,
    productionMode: fulfillment.productionMode, requiresProductionPreview: purchaseFulfillment.requiresProductionPreview },
  serverAuthoritySmoke: { cartId: created.value.cartId, cartVersion: added.value.version, lineCount: 1,
    shippingRequired: false, shipmentRequired: false }, rawCredentialReported: false }));
