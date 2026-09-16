import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  brandName,
  canonicalHostname,
  getSupportContactText,
  parseDeploymentConfiguration,
  parsePublicOrigin,
  parsePublicSiteConfig,
  parseSupportEmail,
  productionOrigin,
  publicIdentity,
  stagingHostname,
} from "../app/config/public.ts";
import { readProductSource } from "../app/config/server.ts";
import { classifyHost } from "../app/config/host-policy.ts";
import { getWwwRedirect } from "../app/config/redirect-policy.ts";
import { buildRootMetadata, buildWebSiteStructuredData } from "../app/config/seo-metadata.ts";
import { parseSeoPolicy } from "../app/config/seo-policy.ts";
import { buildCategoryMetadataModel, buildProductMetadataModel } from "../app/application/catalog-seo.ts";
import { toNextCatalogMetadata } from "../app/storefront/catalog-metadata.ts";
import { buildRobots } from "../app/robots.ts";
import { buildSitemap } from "../app/sitemap.ts";

const emptyCatalogRepository = {
  async listPublicCategories() {
    return { status: "found", value: [] };
  },
  async listPublicProducts() {
    return { status: "found", value: [] };
  },
};

test("8.1 final verification mapping: identity, parser, support, secrets, and fixture guard", () => {
  assert.deepEqual(publicIdentity, {
    brandName: "FigMemento",
    productionOrigin: "https://figmemento.com",
    canonicalHostname: "figmemento.com",
    stagingHostname: "staging.figmemento.com",
  });
  assert.deepEqual(Object.keys(publicIdentity).sort(), [
    "brandName",
    "canonicalHostname",
    "productionOrigin",
    "stagingHostname",
  ]);
  assert.doesNotMatch(JSON.stringify(publicIdentity), /SUPABASE_SECRET_KEY|STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET|ADMIN_PASSWORD/i);
  assert.doesNotMatch(JSON.stringify(parsePublicSiteConfig({
    appDeploymentEnv: "test",
    deploymentOrigin: "https://figmemento.test",
  })), /SUPABASE_SECRET_KEY|STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET|ADMIN_PASSWORD/i);

  assert.deepEqual(
    parseDeploymentConfiguration({ appDeploymentEnv: "production", deploymentOrigin: productionOrigin }),
    { environment: "production", origin: productionOrigin },
  );
  assert.equal(parseDeploymentConfiguration({ nodeEnv: "production" }).origin, productionOrigin);
  assert.equal(parseDeploymentConfiguration({ appDeploymentEnv: "test", deploymentOrigin: "https://figmemento.test" }).origin, "https://figmemento.test");

  for (const value of [
    "javascript:alert(1)",
    "/relative",
    "https://figmemento.com/path",
    "https://figmemento.com?query=1",
    "https://figmemento.com#fragment",
    "https://user:pass@figmemento.com",
    "https://figmemento.com/with whitespace",
  ]) {
    assert.throws(() => parsePublicOrigin(value), `invalid origin must reject: ${value}`);
  }
  assert.equal(parsePublicOrigin("http://figmemento.com"), "http://figmemento.com");
  assert.throws(() => parseDeploymentConfiguration({ appDeploymentEnv: "production", deploymentOrigin: "http://figmemento.com" }));
  assert.throws(() => parseDeploymentConfiguration({ appDeploymentEnv: "production", deploymentOrigin: "https://figmemento.com:444" }));
  assert.throws(() => parseDeploymentConfiguration({ appDeploymentEnv: "production", deploymentOrigin: "https://localhost:3000" }));

  assert.equal(parseSupportEmail(undefined), undefined);
  assert.equal(parseSupportEmail("team@example.test"), "team@example.test");
  assert.equal(getSupportContactText(undefined).includes("@figmemento.com"), false);
  assert.equal(parseSupportEmail("support@figmemento.com"), "support@figmemento.com");
  assert.throws(() => parseSupportEmail("hello@photogift.example"));

  assert.equal(readProductSource({ NODE_ENV: "test", PHOTOGIFT_PRODUCT_SOURCE: "fixture" }), "fixture");
  assert.equal(readProductSource({ NODE_ENV: "production" }), "supabase");
  assert.throws(() => readProductSource({ NODE_ENV: "production", PHOTOGIFT_PRODUCT_SOURCE: "fixture" }));
});

test("8.2 final verification mapping: host, redirect, SEO, robots, and sitemap", async () => {
  assert.equal(classifyHost(canonicalHostname), "PRODUCTION_APEX");
  assert.equal(classifyHost(`www.${canonicalHostname}`), "PRODUCTION_WWW_ALIAS");
  assert.equal(classifyHost(stagingHostname), "STAGING");
  assert.equal(classifyHost("preview.example.test", "preview"), "TEST");
  assert.equal(classifyHost("unknown.provider.internal", "preview"), "PROVIDER_PREVIEW");
  assert.equal(classifyHost("localhost"), "DEVELOPMENT");
  assert.equal(classifyHost("127.0.0.1:8787"), "DEVELOPMENT");
  assert.equal(classifyHost("figmemento.test"), "TEST");
  assert.notEqual(classifyHost("attacker.example", "production"), "PRODUCTION_APEX");

  assert.deepEqual(
    getWwwRedirect("https://www.figmemento.com/product/example?ref=test"),
    { status: 308, location: `${productionOrigin}/product/example?ref=test` },
  );
  for (const url of [
    "https://figmemento.com/product/example",
    "https://staging.figmemento.com/product/example",
    "https://preview.example.test/product/example",
    "http://localhost:3000/product/example",
    "https://figmemento.test/product/example",
    "https://www.figmemento.com.evil.test/product/example",
  ]) {
    assert.equal(getWwwRedirect(url), null, `redirect must not capture ${url}`);
  }

  const production = parseSeoPolicy({ appDeploymentEnv: "production", hostname: canonicalHostname });
  const staging = parseSeoPolicy({ appDeploymentEnv: "staging", deploymentOrigin: `https://${stagingHostname}` });
  const preview = parseSeoPolicy({ appDeploymentEnv: "preview", deploymentOrigin: "https://preview.example.test" });
  const nodeProductionOnly = parseSeoPolicy({ nodeEnv: "production" });
  assert.equal(production.isIndexable, true);
  assert.equal(production.canonicalOrigin, productionOrigin);
  assert.equal(staging.isIndexable, false);
  assert.equal(staging.canonicalOrigin, undefined);
  assert.equal(preview.isIndexable, false);
  assert.equal(preview.canonicalOrigin, undefined);
  assert.equal(nodeProductionOnly.isIndexable, false);

  assert.deepEqual(buildRobots(production).rules, [{ userAgent: "*", allow: "/", disallow: ["/admin/", "/api/"] }]);
  assert.equal(buildRobots(production).sitemap, `${productionOrigin}/sitemap.xml`);
  assert.deepEqual(buildRobots(staging), { rules: [{ userAgent: "*", disallow: "/" }] });
  assert.deepEqual(await buildSitemap(production, async () => ({ status: "found", value: { repository: emptyCatalogRepository, source: "fixture" } })), [
    { url: `${productionOrigin}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${productionOrigin}/track-order`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${productionOrigin}/faq`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${productionOrigin}/shipping-returns`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${productionOrigin}/privacy`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${productionOrigin}/terms`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${productionOrigin}/shop`, changeFrequency: "weekly", priority: 0.9 },
  ]);
  let nonproductionReads = 0;
  assert.deepEqual(await buildSitemap(staging, async () => {
    nonproductionReads += 1;
    throw new Error("nonproduction sitemap must not read the catalog");
  }), []);
  assert.equal(nonproductionReads, 0);
});

test("8.3 final verification mapping: metadata, catalog paths, and rendered identity", async () => {
  const production = parseSeoPolicy({ appDeploymentEnv: "production" });
  const root = buildRootMetadata(production);
  assert.equal(root.title, "FigMemento — Little pieces of the people you love");
  assert.equal(root.metadataBase?.toString(), `${productionOrigin}/`);
  assert.deepEqual(root.alternates, { canonical: `${productionOrigin}/` });
  assert.equal(root.openGraph?.url, `${productionOrigin}/`);
  assert.equal(buildWebSiteStructuredData(production).url, `${productionOrigin}/`);

  const nonproductionRoot = buildRootMetadata(parseSeoPolicy({ appDeploymentEnv: "preview" }));
  assert.deepEqual(nonproductionRoot.robots, { index: false, follow: false });
  assert.equal("metadataBase" in nonproductionRoot, false);
  assert.equal("alternates" in nonproductionRoot, false);

  const category = {
    id: "category-figures",
    slug: "figures",
    name: "3D Figures",
    description: "Dimensional keepsakes.",
    lifecycle: "published",
    seo: { canonicalPath: "/collections/figures" },
  };
  const product = {
    id: "product-figure",
    slug: "example-gift",
    categoryId: category.id,
    name: "Example Gift",
    description: "A catalog gift.",
    lifecycle: "published",
    seo: null,
  };
  const site = { brandName, siteUrl: productionOrigin };
  assert.equal(buildCategoryMetadataModel(category, site).canonicalUrl, `${productionOrigin}/collections/figures`);
  assert.equal(buildProductMetadataModel(product, [], site).canonicalUrl, `${productionOrigin}/product/example-gift`);
  assert.deepEqual(toNextCatalogMetadata({
    title: "Example Gift | FigMemento",
    description: "A catalog gift.",
    canonicalUrl: `${productionOrigin}/product/example-gift`,
  }).alternates, { canonical: `${productionOrigin}/product/example-gift` });
  assert.deepEqual(toNextCatalogMetadata({ title: "Unavailable | FigMemento", description: "Unavailable" }).robots, { index: false, follow: false });

  const renderedTest = await readFile(new URL("./rendered-html.test.mjs", import.meta.url), "utf8");
  assert.match(renderedTest, /FigMemento storefront/);
  assert.match(renderedTest, /<title>FigMemento/);
});

test("8.4 final verification mapping: Brand/Domain policy does not contact production", async () => {
  const originalFetch = globalThis.fetch;
  const attemptedUrls = [];
  globalThis.fetch = async (input) => {
    attemptedUrls.push(String(input));
    throw new Error("Brand/Domain verification must remain offline");
  };
  try {
    const policy = parseSeoPolicy({ appDeploymentEnv: "production" });
    buildRootMetadata(policy);
    buildWebSiteStructuredData(policy);
    buildRobots(policy);
    await buildSitemap(policy, async () => ({ status: "found", value: { repository: emptyCatalogRepository, source: "fixture" } }));
    getWwwRedirect("https://www.figmemento.com/product/example?ref=test");
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.deepEqual(attemptedUrls, []);
});
