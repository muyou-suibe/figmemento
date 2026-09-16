// Development-only customer demo Catalog setup. This tool writes only the
// existing local_commerce Catalog tables after exact retained-stack identity,
// marker, ledger, checksum, loopback, and explicit-confirmation gates.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

import { planMigrationLedger, sha256Text } from "../app/application/local-commerce-migration-ledger.ts";

export const DEMO_PROJECT_ID = "figmemento-local-commerce";
export const DEMO_CONFIRMATION = "--confirm-local-customer-demo";
export const DEMO_CATEGORY_SLUGS = ["3d-figures", "custom-crafts", "pet-memories", "digital-gifts"];

const uuid = (group, index) => `${group}000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const imageConstraints = {
  allowedMimeTypes: ["image/png", "image/jpeg", "image/webp"],
  maxBytes: 10_485_760,
  minDimensions: { width: 600, height: 600 },
  recommendedDimensions: { width: 1600, height: 1600 },
  minImageCount: 1,
  maxImageCount: 4,
  cropEnabled: true,
};

const categoryDefinitions = [
  ["d1000000-0000-4000-8000-000000000001", "3d-figures", "3D Figurines", "Personalized keepsakes shaped from the people and moments you love."],
  ["d1000000-0000-4000-8000-000000000002", "custom-crafts", "Custom Art", "Portrait-led pieces made for meaningful rooms and occasions."],
  ["d1000000-0000-4000-8000-000000000003", "pet-memories", "Pet Memorial", "Gentle keepsakes that hold a beloved companion close."],
  ["d1000000-0000-4000-8000-000000000004", "digital-gifts", "Digital Art", "Downloadable portraits ready to share and keep."],
];

const productDefinitions = [
  {
    index: 1, categoryId: categoryDefinitions[0][0], slug: "couple-anniversary-figurine", name: "Couple Anniversary Figurine",
    description: "A hand-finished miniature keepsake inspired by a favorite photograph together.", option: ["person-count", "Person count", "person_count"],
    values: [["two-people", "Two people", 6990], ["three-people", "Three people", 8990]],
    fulfillment: ["physical", true, "custom_manufacturing", 10, 18, true],
    fields: [["photo", "Your favorite photo", "image", true, imageConstraints], ["base-text", "Optional base text", "short_text", false, { maxLength: 40, helpText: "A date, names, or a short message." }]],
  },
  {
    index: 2, categoryId: categoryDefinitions[2][0], slug: "pet-memorial-figurine", name: "Pet Memorial Figurine",
    description: "A small portrait figurine created as a warm reminder of a much-loved companion.", option: ["size", "Size", "size"],
    values: [["desk", "Desk size", 4590], ["keepsake", "Keepsake size", 5990]],
    fulfillment: ["physical", true, "custom_manufacturing", 9, 16, true],
    fields: [["photo", "Pet photo", "image", true, imageConstraints], ["memorial-text", "Memorial text", "short_text", false, { maxLength: 60, helpText: "A name or brief remembrance." }]],
  },
  {
    index: 3, categoryId: categoryDefinitions[1][0], slug: "custom-portrait-print", name: "Custom Portrait Print",
    description: "A softly illustrated portrait print composed from one meaningful photograph.", option: ["print-size", "Print size", "size"],
    values: [["eight-by-ten", "8 × 10 in", 3990], ["twelve-by-sixteen", "12 × 16 in", 5990]],
    fulfillment: ["physical", true, "custom_manufacturing", 7, 12, true],
    fields: [["photo", "Portrait photo", "image", true, imageConstraints], ["artist-note", "Note for the artist", "long_text", false, { maxLength: 500, helpText: "Share details you would like the artist to notice." }]],
  },
  {
    index: 4, categoryId: categoryDefinitions[3][0], slug: "digital-memory-portrait", name: "Digital Memory Portrait",
    description: "A finished digital portrait prepared for sharing, gifting, and personal printing.", option: ["portrait-style", "Portrait style", "other_sku"],
    values: [["classic", "Classic", 1290], ["watercolor", "Watercolor", 1590]],
    fulfillment: ["digital", false, "digital_creation", 2, 4, false],
    fields: [["photo", "Portrait photo", "image", true, imageConstraints], ["portrait-note", "Portrait note", "long_text", false, { maxLength: 500, helpText: "Tell us what makes this memory special." }]],
  },
];

export function demoCatalogRows(projectId = DEMO_PROJECT_ID) {
  const row = (id) => ({ project_id: projectId, id, version: 1, lifecycle: "active" });
  const categories = categoryDefinitions.map(([id, slug, name, description]) => ({
    ...row(id), slug, name, description, publication_status: "published",
  }));
  const products = [];
  const variants = [];
  const configurations = [];

  for (const definition of productDefinitions) {
    const productId = uuid("d2", definition.index);
    const optionId = uuid("d3", definition.index);
    const fulfillmentId = uuid("d6", definition.index);
    const configId = uuid("d7", definition.index);
    const optionValues = definition.values.map(([code, label], valueIndex) => ({
      id: `d4${String(definition.index).padStart(2, "0")}0000-0000-4000-8000-${String(valueIndex + 1).padStart(12, "0")}`,
      productId, optionId, code, label, position: valueIndex,
    }));
    const optionDefinitions = [{ id: optionId, productId, code: definition.option[0], name: definition.option[1], kind: definition.option[2], required: true, position: 0 }];
    const fields = definition.fields.map(([code, label, kind, required, constraints], fieldIndex) => ({
      id: `d8${String(definition.index).padStart(2, "0")}0000-0000-4000-8000-${String(fieldIndex + 1).padStart(12, "0")}`,
      productId, code, label, kind, required, isActive: true, position: fieldIndex, configurationRevision: "1", constraints,
    }));
    products.push({
      ...row(productId), category_id: definition.categoryId, slug: definition.slug, name: definition.name,
      description: definition.description, publication_status: "published", availability: "available",
      option_definitions: optionDefinitions, option_value_definitions: optionValues, asset_definitions: [],
      fulfillment_definition: {
        id: fulfillmentId, productId, fulfillmentType: definition.fulfillment[0], requiresShipping: definition.fulfillment[1],
        productionMode: definition.fulfillment[2], leadTime: { minBusinessDays: definition.fulfillment[3], maxBusinessDays: definition.fulfillment[4] },
        requiresProductionPreview: definition.fulfillment[5],
      },
    });
    definition.values.forEach(([, , priceCents], valueIndex) => variants.push({
      ...row(`d5${String(definition.index).padStart(2, "0")}0000-0000-4000-8000-${String(valueIndex + 1).padStart(12, "0")}`),
      product_id: productId, sku_code: `DEMO-${String(definition.index).padStart(2, "0")}-${String(valueIndex + 1).padStart(2, "0")}`,
      selected_options: [{ optionId, valueId: optionValues[valueIndex].id }], price_cents: priceCents, currency: "USD",
      availability: "available", weight_grams: definition.fulfillment[0] === "digital" ? 0 : 250,
      is_default: valueIndex === 0, supply_method: definition.fulfillment[0] === "digital" ? "digital_delivery" : "made_to_order",
    }));
    configurations.push({
      ...row(configId), product_id: productId, revision: 1, configuration_status: "active",
      definition: { productId, configurationRevision: "1", fields },
    });
  }
  return { projectId, categories, products, variants, configurations };
}

export function validateDemoTarget({ nodeEnv, marker, confirmation, apiUrl, schemaVersion, ledgerCount, pending }) {
  const loopback = (() => { try { return ["127.0.0.1", "localhost", "[::1]", "::1"].includes(new URL(apiUrl).hostname); } catch { return false; } })();
  return nodeEnv === "development" && confirmation === DEMO_CONFIRMATION && marker?.environment === "development"
    && marker?.projectKind === "retained_development" && marker?.projectId === DEMO_PROJECT_ID
    && marker?.runId === "retained-development" && marker?.postgresMajorVersion === 17
    && loopback && schemaVersion === 37 && ledgerCount === 37 && pending === 0;
}

function command(binary, args, input) {
  const result = spawnSync(binary, args, { cwd: path.resolve("."), input, encoding: "utf8", timeout: 30_000, maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: "true" } });
  assert.equal(result.error, undefined, `${binary} bounded execution failed`);
  assert.equal(result.status, 0, (result.stderr || "command failed").replace(/eyJ[A-Za-z0-9_.-]+/g, "[redacted]").split("\n")[0]);
  return result.stdout.trim();
}

async function main() {
  assert.deepEqual(process.argv.slice(2), [DEMO_CONFIRMATION]);
  const root = path.resolve(".");
  const workdir = path.join(root, "local", "commerce");
  const marker = JSON.parse(readFileSync(path.join(workdir, "runtime", "project-marker.json"), "utf8"));
  const markerDigest = sha256Text(JSON.stringify(marker));
  const manifest = JSON.parse(readFileSync(path.join(workdir, "migrations", "manifest.json"), "utf8"));
  assert.equal(manifest.schemaVersion, 37);
  assert.equal(manifest.migrations.length, 37);
  for (const migration of manifest.migrations) {
    assert.equal(sha256Text(readFileSync(path.join(workdir, "migrations", migration.filename), "utf8")), migration.checksum);
  }

  const containerIds = command("docker", ["ps", "--filter", `label=com.supabase.cli.project=${DEMO_PROJECT_ID}`, "--format", "{{.ID}}"]).split("\n").filter(Boolean);
  const inspected = containerIds.length ? JSON.parse(command("docker", ["inspect", ...containerIds])) : [];
  const databases = inspected.filter((container) => container.Name === "/supabase_db_figmemento-local-commerce"
    && container.Config?.Labels?.["com.supabase.cli.workdir"] === workdir && container.State?.Running === true);
  assert.equal(databases.length, 1, "exact retained-development PostgreSQL container required");
  const sql = (query) => command("docker", ["exec", "-i", databases[0].Id, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], query);
  assert.equal(sql("select current_setting('server_version_num')::int/10000;"), "17");
  assert.equal(sql(`select local_commerce.verify_project_identity('${DEMO_PROJECT_ID}','${markerDigest}');`), "t");
  const applied = JSON.parse(sql("select json_agg(json_build_object('version',version,'migrationId',migration_id,'checksum',checksum,'projectId',project_id) order by version) from local_commerce.migration_ledger;"));
  const plan = planMigrationLedger({ ...manifest, projectId: DEMO_PROJECT_ID }, applied, DEMO_PROJECT_ID);
  assert.equal(plan.status, "ready");
  assert.equal(plan.apply.length, 0);

  const stack = JSON.parse(command(path.resolve("node_modules/.bin/supabase"), ["status", "--workdir", workdir, "-o", "json"]));
  assert.equal(validateDemoTarget({ nodeEnv: process.env.NODE_ENV, marker, confirmation: process.argv[2], apiUrl: stack.API_URL,
    schemaVersion: manifest.schemaVersion, ledgerCount: applied.length, pending: plan.apply.length }), true, "local customer demo target rejected");

  const rows = demoCatalogRows();
  const expectedIds = [...rows.categories, ...rows.products, ...rows.variants, ...rows.configurations].map((item) => item.id);
  const existing = Number(sql(`select
    (select count(*) from local_commerce.catalog_categories where project_id='${DEMO_PROJECT_ID}' and id = any(array[${rows.categories.map((item) => `'${item.id}'::uuid`).join(",")}]))+
    (select count(*) from local_commerce.catalog_products where project_id='${DEMO_PROJECT_ID}' and id = any(array[${rows.products.map((item) => `'${item.id}'::uuid`).join(",")}]))+
    (select count(*) from local_commerce.catalog_variants where project_id='${DEMO_PROJECT_ID}' and id = any(array[${rows.variants.map((item) => `'${item.id}'::uuid`).join(",")}]))+
    (select count(*) from local_commerce.catalog_configuration_snapshots where project_id='${DEMO_PROJECT_ID}' and id = any(array[${rows.configurations.map((item) => `'${item.id}'::uuid`).join(",")}]))`));
  assert.ok(existing === 0 || existing === expectedIds.length, "partial/conflicting local customer demo identity");
  for (const category of rows.categories) {
    assert.equal(sql(`select count(*) from local_commerce.catalog_categories where project_id='${DEMO_PROJECT_ID}' and slug='${category.slug}' and id<>'${category.id}';`), "0", `category slug conflict: ${category.slug}`);
  }
  for (const product of rows.products) {
    assert.equal(sql(`select count(*) from local_commerce.catalog_products where project_id='${DEMO_PROJECT_ID}' and slug='${product.slug}' and id<>'${product.id}';`), "0", `product slug conflict: ${product.slug}`);
  }

  if (existing === 0) {
    const headers = { apikey: stack.SERVICE_ROLE_KEY, authorization: `Bearer ${stack.SERVICE_ROLE_KEY}`,
      "content-type": "application/json", "content-profile": "local_commerce", prefer: "return=minimal" };
    for (const [key, table] of Object.entries({ categories: "catalog_categories", products: "catalog_products",
      variants: "catalog_variants", configurations: "catalog_configuration_snapshots" })) {
      const response = await fetch(`${stack.API_URL}/rest/v1/${table}`, { method: "POST", headers, body: JSON.stringify(rows[key]), signal: AbortSignal.timeout(10_000) });
      assert.equal(response.status, 201, `${table}: ${await response.text()}`);
    }
  }

  assert.equal(Number(sql(`select count(*) from local_commerce.catalog_categories where project_id='${DEMO_PROJECT_ID}' and slug in (${DEMO_CATEGORY_SLUGS.map((slug) => `'${slug}'`).join(",")}) and publication_status='published' and lifecycle='active';`)), 4);
  assert.equal(Number(sql(`select count(*) from local_commerce.catalog_products where project_id='${DEMO_PROJECT_ID}' and id = any(array[${rows.products.map((item) => `'${item.id}'::uuid`).join(",")}]) and publication_status='published' and lifecycle='active';`)), 4);
  console.info(JSON.stringify({ status: "PASS", mode: existing === 0 ? "CREATED" : "REUSED", projectId: DEMO_PROJECT_ID,
    projectKind: marker.projectKind, schemaVersion: 37, ledger: "37/37", pending: 0, categories: rows.categories.length,
    products: rows.products.length, variants: rows.variants.length, physicalProducts: 3, digitalProducts: 1,
    retainedAcceptanceRowsDeleted: 0, migrationExecuted: false, credentialReported: false }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(String(error?.message ?? error).replace(/eyJ[A-Za-z0-9_.-]+/g, "[redacted]")); process.exitCode = 1; });
}
