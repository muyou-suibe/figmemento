// Acceptance-only retained synthetic Catalog setup. This creates no customer,
// Cart, Draft, media, Order, Payment, Fulfillment, Shipment, or digital state.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

import { sha256Text } from "../../app/application/local-commerce-migration-ledger.ts";
import { catalogDatabaseRows, ids } from "../fixtures/local-persistent-catalog.mjs";

assert.deepEqual(process.argv.slice(2), ["--confirm-retained-synthetic-catalog"]);
const root = path.resolve(".");
const workdir = path.join(root, "local", "commerce");
const projectId = "figmemento-local-commerce";
const marker = JSON.parse(readFileSync(path.join(workdir, "runtime", "project-marker.json"), "utf8"));
const markerDigest = sha256Text(JSON.stringify(marker));
assert.equal(marker.environment, "development");
assert.equal(marker.projectKind, "retained_development");
assert.equal(marker.runId, "retained-development");
assert.equal(marker.projectId, projectId);
assert.equal(marker.postgresMajorVersion, 17);

function command(binary, args, input) {
  const result = spawnSync(binary, args, { cwd: root, input, encoding: "utf8", timeout: 30_000, maxBuffer: 16 * 1024 * 1024 });
  assert.equal(result.error, undefined, `${binary} bounded execution failed`);
  assert.equal(result.status, 0, (result.stderr || "command failed").split("\n")[0]);
  return result.stdout.trim();
}
const containerIds = command("docker", ["ps", "--filter", `label=com.supabase.cli.project=${projectId}`, "--format", "{{.ID}}"]).split("\n").filter(Boolean);
const inspected = containerIds.length ? JSON.parse(command("docker", ["inspect", ...containerIds])) : [];
const databases = inspected.filter((container) => container.Name === "/supabase_db_figmemento-local-commerce"
  && container.Config?.Labels?.["com.supabase.cli.workdir"] === workdir && container.State?.Running === true);
assert.equal(databases.length, 1);
const sql = (query) => command("docker", ["exec", "-i", databases[0].Id, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], query);
assert.equal(sql("select current_setting('server_version_num')::int/10000;"), "17");
assert.equal(sql(`select local_commerce.verify_project_identity('${projectId}','${markerDigest}');`), "t");
assert.equal(sql("select count(*) from local_commerce.migration_ledger;"), "37");

const stack = JSON.parse(command(path.resolve("node_modules/.bin/supabase"), ["status", "--workdir", workdir, "-o", "json"]));
const serviceHeaders = {
  apikey: stack.SERVICE_ROLE_KEY,
  authorization: `Bearer ${stack.SERVICE_ROLE_KEY}`,
  "content-type": "application/json",
  "content-profile": "local_commerce",
  prefer: "resolution=ignore-duplicates",
};

function baseRows() {
  const value = catalogDatabaseRows(projectId);
  value.rules = value.rules.filter((row) => row.definition.kind === "shipping");
  return value;
}
const physical = baseRows();
physical.products[0].fulfillment_definition.requiresProductionPreview = true;
physical.configurations[0].definition.fields = [{
  id: ids.field, productId: ids.product, code: "photo", label: "Synthetic photo", kind: "image",
  required: false, isActive: true, position: 0, configurationRevision: "1",
  constraints: { allowedMimeTypes: ["image/png", "image/jpeg", "image/webp"], maxBytes: 1_048_576,
    minDimensions: { width: 1, height: 1 }, minImageCount: 0, maxImageCount: 4, cropEnabled: true },
}];

const digital = baseRows();
const fixed = {
  [ids.product]: "41d7632c-6047-4303-8cac-7eae90b7910a",
  [ids.variant]: "7a437f50-c7a2-4c99-bd98-0427b77c4c42",
  [ids.option]: "17f0edb9-eade-4447-bd55-9c729669e134",
  [ids.value]: "77828ebb-92e8-409e-b6c5-157121b445ca",
};
for (const key of ["category", "fulfillment", "config", "field", "shipping", "coupon"]) fixed[ids[key]] = randomUUID();
let encoded = JSON.stringify(digital);
for (const [from, to] of Object.entries(fixed)) encoded = encoded.replaceAll(from, to);
const digitalRows = JSON.parse(encoded);
digitalRows.categories[0].slug = "task-11-2-retained-digital";
digitalRows.products[0].slug = "task-11-2-retained-digital";
digitalRows.products[0].name = "Task 11.2 retained digital";
digitalRows.variants[0].sku_code = "GRANT-DIGITAL-d6c48d6c8b084448991a495c56708a48";
Object.assign(digitalRows.products[0].fulfillment_definition, {
  fulfillmentType: "digital", requiresShipping: false, requiresProductionPreview: false, productionMode: "digital_creation",
});
digitalRows.configurations[0].definition.fields = [];
digitalRows.rules = [];

async function persist(rows) {
  for (const [key, table] of Object.entries({ categories: "catalog_categories", products: "catalog_products", variants: "catalog_variants",
    configurations: "catalog_configuration_snapshots", rules: "catalog_pricing_rules" })) {
    if (rows[key].length === 0) continue;
    const response = await fetch(`${stack.API_URL}/rest/v1/${table}`, { method: "POST", headers: serviceHeaders,
      body: JSON.stringify(rows[key]), signal: AbortSignal.timeout(10_000) });
    assert.equal(response.status, 201, `${table}: ${await response.text()}`);
  }
}
if (sql(`select count(*) from local_commerce.catalog_products where project_id='${projectId}' and id='${ids.product}';`) === "0") await persist(physical);
if (sql(`select count(*) from local_commerce.catalog_products where project_id='${projectId}' and id='${fixed[ids.product]}';`) === "0") await persist(digitalRows);
const configurationPatch = await fetch(`${stack.API_URL}/rest/v1/catalog_configuration_snapshots?project_id=eq.${projectId}&product_id=eq.${ids.product}&revision=eq.1`, {
  method: "PATCH", headers: { ...serviceHeaders, prefer: "return=minimal" },
  body: JSON.stringify({ definition: physical.configurations[0].definition }), signal: AbortSignal.timeout(10_000),
});
assert.ok(configurationPatch.status === 200 || configurationPatch.status === 204, await configurationPatch.text());

assert.equal(sql(`select count(*) from local_commerce.catalog_products where project_id='${projectId}' and id in ('${ids.product}','${fixed[ids.product]}') and lifecycle='active';`), "2");
assert.equal(sql(`select count(*) from local_commerce.catalog_configuration_snapshots where project_id='${projectId}' and product_id='${ids.product}' and (definition::jsonb)#>>'{fields,0,kind}'='image';`), "1");
assert.equal(sql(`select ((definition::jsonb)#>>'{fields,0,required}')||':'||((definition::jsonb)#>>'{fields,0,constraints,minImageCount}') from local_commerce.catalog_configuration_snapshots where project_id='${projectId}' and product_id='${ids.product}' and revision=1;`), "false:0");
console.info(JSON.stringify({ status: "READY", classification: "RETAINED_SYNTHETIC_CATALOG_ONLY", projectId,
  markerDigest, physicalProductId: ids.product, digitalProductId: fixed[ids.product], businessRowsCreated: false }));
