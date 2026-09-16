import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  DEMO_CATEGORY_SLUGS,
  DEMO_CONFIRMATION,
  DEMO_PROJECT_ID,
  demoCatalogRows,
  validateDemoTarget,
} from "../scripts/local-commerce-customer-demo.mjs";
import { LocalCatalogAuthority } from "../app/infrastructure/local-commerce/local-catalog-authority.server.ts";
import {
  LocalCustomerDemoPresentationRepository,
  shouldUseLocalCustomerDemoPresentation,
} from "../app/infrastructure/catalog/local-customer-demo-presentation.server.ts";
import { catalogTestEnvironment, offlineCatalogClient } from "./fixtures/local-persistent-catalog.mjs";

const navigation = readFileSync("app/storefront/CatalogShellNavigation.tsx", "utf8");
const shell = readFileSync("app/storefront/CatalogShell.tsx", "utf8");
const styles = readFileSync("app/storefront/catalog-storefront.module.css", "utf8");
const translations = readFileSync("app/storefront/ReferenceLanguageProvider.tsx", "utf8");
const marker = {
  environment: "development",
  projectKind: "retained_development",
  projectId: DEMO_PROJECT_ID,
  runId: "retained-development",
  postgresMajorVersion: 17,
};
const acceptedTarget = {
  nodeEnv: "development",
  marker,
  confirmation: DEMO_CONFIRMATION,
  apiUrl: "http://127.0.0.1:54321",
  schemaVersion: 37,
  ledgerCount: 37,
  pending: 0,
};

test("Chinese navigation labels use an explicit no-wrap/keep-all contract", () => {
  assert.match(styles, /\.referenceShell\.referenceShell \.nav a,[\s\S]*white-space: nowrap;[\s\S]*word-break: keep-all;/);
  for (const label of ["商店", "工坊手记", "关于我们", "联系我们"]) assert.match(translations, new RegExp(label));
});

test("English and Spanish navigation retain the shared translated navigation", () => {
  for (const label of ["Shop", "Journal", "About", "Contact"]) assert.match(navigation, new RegExp(`label: "${label}"`));
  for (const label of ["Tienda", "Diario", "Nosotros", "Contacto"]) assert.match(translations, new RegExp(label));
});

test("compact navigation replaces the desktop controls before translated labels compete", () => {
  assert.match(styles, /@media \(min-width: 981px\)[\s\S]*width: clamp\(140px, 16vw, 216px\);/);
  assert.match(styles, /@media \(max-width: 980px\)[\s\S]*\.referenceShell\.referenceShell \.headerControls \{ display: none !important; \}/);
  assert.match(styles, /\.referenceShell\.referenceShell \.menuButton \{ display: inline-flex !important; \}/);
  assert.match(styles, /\.referenceShell\.referenceShell \.shellCategoryPills \{[\s\S]*overflow-x: auto;/);
  assert.match(navigation, /aria-controls="catalog-mobile-menu"/);
  assert.match(navigation, /className=\{styles\.mobileSearch\}[\s\S]*role="search"/);
});

test("customer shell omits internal Fusion annotation while retaining customer footer links", () => {
  assert.doesNotMatch(shell, /ReferenceAnnotation|Fusion design annotation|Fusion<\/b> 02\+07\+08\+12/);
  assert.doesNotMatch(shell, /#FDF8F2|#3C2A1E|#C4815A|#D4B896|#FFE4A0/);
  for (const path of ["/shop", "/journal", "/about", "/contact", "/privacy", "/terms", "/shipping-returns"]) {
    assert.match(shell, new RegExp(`href="${path.replaceAll("/", "\\/")}"`));
  }
});

test("demo setup rejects production, non-loopback, wrong project, and incomplete ledgers", () => {
  assert.equal(validateDemoTarget(acceptedTarget), true);
  assert.equal(validateDemoTarget({ ...acceptedTarget, nodeEnv: "production" }), false);
  assert.equal(validateDemoTarget({ ...acceptedTarget, apiUrl: "https://example.com" }), false);
  assert.equal(validateDemoTarget({ ...acceptedTarget, marker: { ...marker, projectId: "wrong" } }), false);
  assert.equal(validateDemoTarget({ ...acceptedTarget, ledgerCount: 36, pending: 1 }), false);
});

test("demo setup is deterministic and therefore idempotent by stable identities", () => {
  const first = demoCatalogRows();
  const second = demoCatalogRows();
  assert.deepEqual(second, first);
  const identities = [...first.categories, ...first.products, ...first.variants, ...first.configurations].map((row) => row.id);
  assert.equal(new Set(identities).size, identities.length);
});

test("demo rows pass the existing local persistent Catalog authority", async () => {
  const rows = { ...demoCatalogRows(), rules: [] };
  const environment = catalogTestEnvironment({
    NODE_ENV: "development",
    LOCAL_COMMERCE_ENVIRONMENT: "development",
    LOCAL_COMMERCE_PROJECT_KIND: "retained_development",
    LOCAL_COMMERCE_PROJECT_ID: DEMO_PROJECT_ID,
    LOCAL_COMMERCE_RUN_ID: "retained-development",
  });
  const authority = new LocalCatalogAuthority(environment, offlineCatalogClient(rows));
  const products = await authority.repository.listPublicProducts();
  assert.equal(products.status, "found");
  assert.equal(products.value.length, 4);
});

test("demo Catalog exposes the expected customer category slugs without duplicates", () => {
  const rows = demoCatalogRows();
  assert.deepEqual(rows.categories.map((category) => category.slug), DEMO_CATEGORY_SLUGS);
  assert.equal(new Set(rows.categories.map((category) => category.name)).size, rows.categories.length);
});

test("physical demo Products retain physical fulfillment and preview authority", () => {
  const rows = demoCatalogRows();
  const physical = rows.products.filter((product) => product.fulfillment_definition.fulfillmentType === "physical");
  assert.equal(physical.length, 3);
  for (const product of physical) {
    assert.equal(product.fulfillment_definition.requiresShipping, true);
    assert.equal(product.fulfillment_definition.requiresProductionPreview, true);
    assert.ok(product.option_definitions.length > 0);
    assert.ok(product.option_value_definitions.length > 0);
  }
});

test("digital demo Product uses digital delivery without physical shipping", () => {
  const rows = demoCatalogRows();
  const digital = rows.products.filter((product) => product.fulfillment_definition.fulfillmentType === "digital");
  assert.equal(digital.length, 1);
  assert.equal(digital[0].fulfillment_definition.requiresShipping, false);
  assert.equal(digital[0].fulfillment_definition.requiresProductionPreview, false);
  assert.ok(rows.variants.filter((variant) => variant.product_id === digital[0].id).every((variant) => variant.supply_method === "digital_delivery"));
});

test("customer demo assortment does not introduce synthetic category labels", () => {
  const labels = demoCatalogRows().categories.map((category) => category.name);
  assert.equal(labels.filter((label) => /synthetic keepsakes/i.test(label)).length, 0);
});

test("retained-development presentation hides acceptance listings without deleting authority", async () => {
  const rows = { ...demoCatalogRows(), rules: [] };
  const syntheticCategory = { ...rows.categories[0], id: "e1000000-0000-4000-8000-000000000001", slug: "synthetic-keepsakes", name: "Synthetic keepsakes" };
  const authority = {
    async listPublicCategories() { return { status: "found", value: [...rows.categories.map((category) => ({ id: category.id, slug: category.slug, name: category.name, description: category.description, seo: {}, lifecycle: "published" })), syntheticCategory] }; },
    async listPublicProducts() { return { status: "found", value: [{ product: { id: "e2000000-0000-4000-8000-000000000001", categoryId: syntheticCategory.id }, category: syntheticCategory }] }; },
    async findPublicProductById() { return { status: "not_found" }; }, async findPublicProductBySlug() { return { status: "not_found" }; },
    async resolveExactVariant() { return { status: "not_found" }; },
  };
  const presentation = new LocalCustomerDemoPresentationRepository(authority);
  assert.deepEqual((await presentation.listPublicCategories()).value.map((category) => category.slug), DEMO_CATEGORY_SLUGS);
  assert.equal((await presentation.listPublicProducts()).value.length, 0);
  assert.equal((await authority.listPublicCategories()).value.some((category) => category.slug === "synthetic-keepsakes"), true);
  assert.equal(shouldUseLocalCustomerDemoPresentation({ ...acceptedTarget.marker, NODE_ENV: "development", LOCAL_COMMERCE_ENVIRONMENT: "development",
    LOCAL_COMMERCE_PROJECT_KIND: "retained_development", LOCAL_COMMERCE_PROJECT_ID: DEMO_PROJECT_ID, PHOTOGIFT_PRODUCT_SOURCE: "local_persistent" }), true);
  assert.equal(shouldUseLocalCustomerDemoPresentation({ NODE_ENV: "production", PHOTOGIFT_PRODUCT_SOURCE: "local_persistent" }), false);
});

test("storefront remains Catalog-driven and contains no hardcoded demo assortment", () => {
  const storefront = [
    readFileSync("app/page.tsx", "utf8"),
    readFileSync("app/shop/page.tsx", "utf8"),
    readFileSync("app/category/[slug]/page.tsx", "utf8"),
    readFileSync("app/storefront/CatalogDiscovery.tsx", "utf8"),
  ].join("\n");
  for (const product of demoCatalogRows().products) assert.doesNotMatch(storefront, new RegExp(product.slug));
  assert.match(storefront, /createServerCatalogRepository/);
  assert.match(storefront, /loadPublicShopPage/);
});
