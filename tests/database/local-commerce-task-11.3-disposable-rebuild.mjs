// Task 11.3 real disposable-stack acceptance. This executable is intentionally
// excluded from database-free suites and accepts only a freshly named,
// explicitly confirmed disposable project.
import assert from "node:assert/strict";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

import { acceptCartItem } from "../../app/application/shopping-cart-service.ts";
import { createLocalPersistentCustomerAuthProvider } from "../../app/application/customer-auth-persistent-provider.server.ts";
import { sha256Text, planMigrationLedger } from "../../app/application/local-commerce-migration-ledger.ts";
import { validateProjectMarker } from "../../app/application/local-commerce-environment.ts";
import { createLocalPersistentCartPort } from "../../app/infrastructure/local-commerce/local-persistent-cart-adapter.server.ts";
import { LocalCatalogAuthority } from "../../app/infrastructure/local-commerce/local-catalog-authority.server.ts";
import { catalogDatabaseRows, catalogTestEnvironment, ids } from "../fixtures/local-persistent-catalog.mjs";

const run = process.argv[2];
const phase = process.argv[3];
assert.match(run ?? "", /^run-[a-f0-9]{8}$/);
assert.ok(["fresh", "reset-rebuild", "interruption-rebuild"].includes(phase));
assert.equal(process.argv[4], "--confirm-task-11.3-disposable");

const root = path.resolve(".");
const projectId = `figmemento-local-commerce-test-${run}`;
const workdir = path.join(root, "local", "commerce", "runtime", "disposable", run);
const marker = JSON.parse(readFileSync(path.join(workdir, "project-marker.json"), "utf8"));
const preparation = JSON.parse(readFileSync(path.join(workdir, "ledger-preparation.json"), "utf8"));
const manifest = JSON.parse(readFileSync(path.join(root, "local", "commerce", "migrations", "manifest.json"), "utf8"));
assert.equal(preparation.config.projectId, projectId);
assert.equal(preparation.config.projectKind, "disposable_test");
assert.equal(preparation.config.environment, "test");
assert.equal(preparation.config.postgresMajorVersion, 17);
assert.equal(validateProjectMarker(marker, preparation.config), true);
assert.equal(sha256Text(JSON.stringify(marker)), preparation.markerDigest);
assert.equal(manifest.schemaVersion, 37);
assert.equal(manifest.migrations.length, 37);

function command(binary, args, input, timeout = 30_000) {
  const result = spawnSync(binary, args, {
    cwd: root,
    input,
    encoding: "utf8",
    timeout,
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: "true" },
  });
  assert.equal(result.error, undefined, `${binary} did not complete within the bounded timeout`);
  assert.equal(result.status, 0, (result.stderr || "command failed").replace(/eyJ[A-Za-z0-9_.-]+/g, "[redacted]").split("\n")[0]);
  return result.stdout.trim();
}

const containerIds = command("docker", ["ps", "--filter", `label=com.supabase.cli.workdir=${workdir}`, "--format", "{{.ID}}"])
  .split("\n").filter(Boolean);
const containers = containerIds.length ? JSON.parse(command("docker", ["inspect", ...containerIds])) : [];
const databases = containers.filter((container) => container.Name.startsWith("/supabase_db_")
  && container.Config?.Labels?.["com.supabase.cli.workdir"] === workdir
  && container.State?.Running === true);
assert.equal(databases.length, 1);
const databaseId = databases[0].Id;
const sql = (query) => command("docker", ["exec", "-i", databaseId, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], query);

assert.equal(sql("select current_setting('server_version_num')::int/10000;"), "17");
assert.equal(sql(`select local_commerce.verify_project_identity('${projectId}','${preparation.markerDigest}');`), "t");
const applied = JSON.parse(sql("select json_agg(json_build_object('version',version,'migrationId',migration_id,'checksum',checksum,'projectId',project_id) order by version) from local_commerce.migration_ledger;"));
assert.equal(applied.length, 37);
for (const [index, migration] of manifest.migrations.entries()) {
  assert.equal(applied[index].version, migration.version);
  assert.equal(applied[index].migrationId, migration.migrationId);
  assert.equal(applied[index].checksum, migration.checksum);
  assert.equal(applied[index].projectId, projectId);
  assert.equal(createHash("sha256").update(readFileSync(path.join(root, "local", "commerce", "migrations", migration.filename))).digest("hex"), migration.checksum);
}
const plan = planMigrationLedger({ ...manifest, projectId }, applied, projectId);
assert.equal(plan.status, "ready");
assert.equal(plan.apply.length, 0);
assert.equal(plan.skipped.length, 37);

const status = JSON.parse(command(path.join(root, "node_modules", ".bin", "supabase"), ["status", "--workdir", workdir, "-o", "json"]));
assert.equal(new URL(status.API_URL).origin, new URL(preparation.config.endpoints.apiUrl).origin);
const environment = catalogTestEnvironment({
  LOCAL_COMMERCE_RUN_ID: run,
  LOCAL_COMMERCE_PROJECT_ID: projectId,
  LOCAL_COMMERCE_MARKER_DIGEST: preparation.markerDigest,
  LOCAL_COMMERCE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
  CUSTOMER_AUTH_SOURCE: "local_persistent",
  CART_SOURCE: "local_persistent",
  PHOTOGIFT_PRODUCT_SOURCE: "local_persistent",
});
for (const [key, value] of Object.entries({ SHADOW_DB: preparation.config.ports.shadowDb, API: preparation.config.ports.api,
  DB: preparation.config.ports.db, STUDIO: preparation.config.ports.studio, SMTP: preparation.config.ports.smtp,
  IMAGE_HELPER: preparation.config.ports.imageHelper })) environment[`LOCAL_COMMERCE_${key}_PORT`] = String(value);
for (const [key, value] of Object.entries({ API: preparation.config.endpoints.apiUrl, RPC: preparation.config.endpoints.rpcUrl,
  STORAGE: preparation.config.endpoints.storageUrl, IMAGE_HELPER: preparation.config.endpoints.imageHelperUrl })) environment[`LOCAL_COMMERCE_${key}_URL`] = value;

const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const jwtBody = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ role: "authenticated", aud: "authenticated", sub: randomUUID(), exp: Math.floor(Date.now() / 1000) + 300 })}`;
const authenticatedKey = `${jwtBody}.${createHmac("sha256", status.JWT_SECRET).update(jwtBody).digest("base64url")}`;
const roleHeaders = (key) => ({ apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json", "content-profile": "local_commerce" });

const tables = JSON.parse(sql("select json_agg(json_build_object('name',c.relname,'rls',c.relrowsecurity) order by c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='local_commerce' and c.relkind='r';"));
assert.equal(tables.length, 46);
assert.ok(tables.every((table) => table.rls));
for (const role of ["anon", "authenticated"]) {
  assert.equal(sql(`select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='local_commerce' and c.relkind='r' and has_table_privilege('${role}',c.oid,'select,insert,update,delete');`), "0");
}
const rpc = async (key, body) => fetch(`${status.API_URL}/rest/v1/rpc/verify_project_identity`, {
  method: "POST", headers: roleHeaders(key), body: JSON.stringify(body), signal: AbortSignal.timeout(5_000),
});
const identity = { p_project_id: projectId, p_marker_digest: preparation.markerDigest };
for (const key of [status.ANON_KEY, authenticatedKey]) assert.ok([401, 403].includes((await rpc(key, identity)).status));
assert.deepEqual(await (await rpc(status.SERVICE_ROLE_KEY, identity)).json(), true);
assert.deepEqual(await (await rpc(status.SERVICE_ROLE_KEY, { ...identity, p_project_id: "wrong-project" })).json(), false);

const seeded = structuredClone(catalogDatabaseRows(projectId));
const replacements = Object.fromEntries(Object.values(ids).map((id) => [id, randomUUID()]));
let encodedRows = JSON.stringify(seeded);
for (const [from, to] of Object.entries(replacements)) encodedRows = encodedRows.replaceAll(from, to);
const rows = JSON.parse(encodedRows);
const suffix = randomUUID().replaceAll("-", "");
rows.categories[0].slug = `task-11-3-${phase}-${suffix}`;
rows.products[0].slug = `task-11-3-${phase}-${suffix}`;
rows.products[0].name = `Task 11.3 ${phase} synthetic product`;
rows.variants[0].sku_code = `TASK-11-3-${phase.toUpperCase()}-${suffix}`;
rows.rules[0].rule_key = `task-11-3-shipping-${suffix}`;
rows.rules[1].rule_key = `task-11-3-coupon-${suffix}`;
rows.rules[1].definition.code = `T113${suffix.slice(0, 12).toUpperCase()}`;
const serviceHeaders = { ...roleHeaders(status.SERVICE_ROLE_KEY), prefer: "return=minimal" };
for (const [key, table] of Object.entries({ categories: "catalog_categories", products: "catalog_products", variants: "catalog_variants",
  configurations: "catalog_configuration_snapshots", rules: "catalog_pricing_rules" })) {
  const response = await fetch(`${status.API_URL}/rest/v1/${table}`, { method: "POST", headers: serviceHeaders,
    body: JSON.stringify(rows[key]), signal: AbortSignal.timeout(10_000) });
  assert.equal(response.status, 201, `${table}: ${await response.text()}`);
}

const provider = createLocalPersistentCustomerAuthProvider(environment);
const email = `task-11-3-${phase}-${suffix}@example.invalid`;
const signedUp = await provider.signUp({ email, password: "Task-11.3-valid-password!" });
assert.equal(signedUp.status, "ok");
const sessionRead = await provider.getSession(signedUp.value.sessionId);
assert.equal(sessionRead.status, "ok");
assert.equal(sessionRead.value.customer.id, signedUp.value.session.customer.id);
const cartReady = await createLocalPersistentCartPort({
  environment,
  owner: {
    kind: "customer",
    projectId,
    ownerId: signedUp.value.session.ownerId,
    customerId: signedUp.value.session.customer.id,
  },
  authorityExpiresAt: Date.parse(signedUp.value.session.expiresAt) / 1000,
});
assert.equal(cartReady.status, "ready");
const createdCart = await cartReady.port.create({ authority: cartReady.authority,
  idempotency: { key: randomUUID(), fingerprint: `task-11.3-${phase}-cart-create` } });
assert.equal(createdCart.status, "found");
const catalog = new LocalCatalogAuthority(environment);
const accepted = await acceptCartItem({
  productId: rows.products[0].id,
  variantId: rows.variants[0].id,
  skuCode: rows.variants[0].sku_code,
  selectedOptions: rows.variants[0].selected_options,
  configurationRevision: "1",
  customizationValues: [{ fieldId: rows.configurations[0].definition.fields[0].id, fieldCode: "caption", kind: "short_text", value: `Task 11.3 ${phase}` }],
}, { observedAt: new Date().toISOString(), catalogRepository: catalog.repository, customizationFieldRepository: catalog });
assert.equal(accepted.status, "accepted");
const added = await cartReady.port.addLine({ authority: cartReady.authority, cartId: createdCart.value.cartId,
  expectedVersion: createdCart.value.version, item: accepted.value,
  idempotency: { key: randomUUID(), fingerprint: `task-11.3-${phase}-cart-add` } });
assert.equal(added.status, "found");
assert.equal(added.value.record.lines.length, 1);

const objectName = `${projectId}/task-11.3/${phase}-${suffix}.bin`;
const objectBytes = Buffer.from(`task-11.3-${phase}-${suffix}`);
const objectHeaders = { apikey: status.SERVICE_ROLE_KEY, authorization: `Bearer ${status.SERVICE_ROLE_KEY}`, "content-type": "application/octet-stream" };
const denied = await fetch(`${status.API_URL}/storage/v1/object/local-commerce-private/${objectName}`, {
  method: "POST", headers: roleHeaders(status.ANON_KEY), body: objectBytes, signal: AbortSignal.timeout(5_000),
});
assert.ok([400, 401, 403].includes(denied.status));
assert.ok((await fetch(`${status.API_URL}/storage/v1/object/local-commerce-private/${objectName}`, {
  method: "POST", headers: objectHeaders, body: objectBytes, signal: AbortSignal.timeout(5_000),
})).status < 300);
const objectRead = await fetch(`${status.API_URL}/storage/v1/object/authenticated/local-commerce-private/${objectName}`, {
  headers: objectHeaders, signal: AbortSignal.timeout(5_000),
});
assert.equal(objectRead.status, 200);
assert.deepEqual(Buffer.from(await objectRead.arrayBuffer()), objectBytes);
assert.ok((await fetch(`${status.API_URL}/storage/v1/object/local-commerce-private`, {
  method: "DELETE", headers: { ...objectHeaders, "content-type": "application/json" },
  body: JSON.stringify({ prefixes: [objectName] }), signal: AbortSignal.timeout(5_000),
})).status < 300);

const report = {
  status: "PASS",
  task: "11.3",
  phase,
  run,
  projectId,
  postgres: 17,
  ledger: "37/37",
  pending: 0,
  markerVerified: true,
  checksums: "37/37",
  rlsTables: tables.length,
  directBrowserCrud: "DENIED",
  restrictedIdentityRpc: "PASS",
  syntheticSeed: {
    productId: rows.products[0].id,
    skuCode: rows.variants[0].sku_code,
    source: "generated-for-this-disposable-phase",
  },
  basicFlow: {
    accountCreated: true,
    durableSessionRead: true,
    cartId: createdCart.value.cartId,
    cartVersion: added.value.version,
    lineCount: added.value.record.lines.length,
  },
  privateStorage: { anonDenied: true, serviceRoundTrip: true, probeDeleted: true },
  rawCredentialsReported: false,
};
console.info(JSON.stringify(report));
