import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  brandName,
  productionOrigin,
} from "../app/config/identity.ts";
import { classifyHost } from "../app/config/host-policy.ts";
import { getWwwRedirect } from "../app/config/redirect-policy.ts";
import { parseSeoPolicy } from "../app/config/seo-policy.ts";
import { buildRootMetadata, buildWebSiteStructuredData } from "../app/config/seo-metadata.ts";
import { buildCategoryMetadataModel, buildProductMetadataModel } from "../app/application/catalog-seo.ts";
import { buildSitemap } from "../app/sitemap.ts";
import { buildRobots } from "../app/robots.ts";
import { getSessionCookieHeader, getSessionCookieName } from "../app/lib/admin-auth.ts";
import { getGuestDraftOwnerCookieName } from "../app/lib/guest-draft-owner.ts";
import { ServerConfigurationError, readProductSource } from "../app/config/server.ts";
import { createDevelopmentCatalogRepository } from "../app/infrastructure/catalog/development-catalog-repository.ts";

test("SEO policy grants canonical authority only to explicit approved production", () => {
  const production = parseSeoPolicy({ appDeploymentEnv: "production" });
  assert.equal(production.isIndexable, true);
  assert.equal(production.canonicalOrigin, productionOrigin);
  assert.equal(production.canPublishSitemap, true);

  for (const input of [
    { appDeploymentEnv: "staging", deploymentOrigin: "https://staging.figmemento.com" },
    { appDeploymentEnv: "preview" },
    { appDeploymentEnv: "development" },
    { appDeploymentEnv: "test", deploymentOrigin: "https://figmemento.test" },
    { nodeEnv: "production" },
  ]) {
    const policy = parseSeoPolicy(input);
    assert.equal(policy.isIndexable, false);
    assert.equal(policy.canonicalOrigin, undefined);
    assert.equal(policy.canPublishSitemap, false);
  }
});

test("root metadata and structured data are canonical only in approved production", () => {
  const production = parseSeoPolicy({ appDeploymentEnv: "production" });
  const root = buildRootMetadata(production);
  assert.equal(root.metadataBase?.toString(), `${productionOrigin}/`);
  assert.deepEqual(root.alternates, { canonical: `${productionOrigin}/` });
  assert.deepEqual(root.robots, { index: true, follow: true });
  assert.equal(root.openGraph?.url, `${productionOrigin}/`);

  const structured = buildWebSiteStructuredData(production);
  assert.equal(structured.name, brandName);
  assert.equal(structured.url, `${productionOrigin}/`);
  assert.equal("potentialAction" in structured, false);

  const nonproduction = buildRootMetadata(parseSeoPolicy({ appDeploymentEnv: "preview" }));
  assert.equal("metadataBase" in nonproduction, false);
  assert.equal("alternates" in nonproduction, false);
  assert.deepEqual(nonproduction.robots, { index: false, follow: false });
  assert.equal("url" in buildWebSiteStructuredData(parseSeoPolicy({ appDeploymentEnv: "preview" })), false);
});

test("catalog canonical paths remain relative and only production receives the approved origin", () => {
  const productionSite = { brandName, siteUrl: productionOrigin };
  const category = {
    id: "category-figures",
    slug: "figures",
    name: "3D Figures",
    description: "Dimensional keepsakes.",
    lifecycle: "published",
    seo: { canonicalPath: "/collections/figures" },
  };
  assert.equal(
    buildCategoryMetadataModel(category, productionSite).canonicalUrl,
    `${productionOrigin}/collections/figures`,
  );
  assert.equal(
    buildCategoryMetadataModel(category, { brandName, siteUrl: undefined }).canonicalUrl,
    undefined,
  );
  assert.equal(
    buildProductMetadataModel({
      id: "product-figure",
      slug: "example-gift",
      categoryId: category.id,
      name: "Example Gift",
      description: "A catalog gift.",
      lifecycle: "published",
      seo: null,
    }, [], productionSite).canonicalUrl,
    `${productionOrigin}/product/example-gift`,
  );
});

test("production sitemap uses only the approved origin and nonproduction never reads catalog data", async () => {
  const production = parseSeoPolicy({ appDeploymentEnv: "production" });
  const repository = createDevelopmentCatalogRepository({ NODE_ENV: "test", PHOTOGIFT_PRODUCT_SOURCE: "fixture" });
  const productionSitemap = await buildSitemap(production, async () => ({
    status: "found",
    value: { repository, source: "fixture" },
  }));
  assert.ok(productionSitemap.length > 0);
  assert.ok(productionSitemap.every((entry) => entry.url.startsWith(`${productionOrigin}/`)));

  let nonproductionReads = 0;
  const nonproductionSitemap = await buildSitemap(parseSeoPolicy({ appDeploymentEnv: "staging" }), async () => {
    nonproductionReads += 1;
    throw new Error("nonproduction sitemap must not read catalog");
  });
  assert.deepEqual(nonproductionSitemap, []);
  assert.equal(nonproductionReads, 0);
});

test("robots preserves production restrictions and blocks nonproduction discovery", () => {
  const production = buildRobots(parseSeoPolicy({ appDeploymentEnv: "production" }));
  assert.deepEqual(production.rules, [{ userAgent: "*", allow: "/", disallow: ["/admin/", "/api/"] }]);
  assert.equal(production.sitemap, `${productionOrigin}/sitemap.xml`);

  const preview = buildRobots(parseSeoPolicy({ appDeploymentEnv: "preview" }));
  assert.deepEqual(preview.rules, [{ userAgent: "*", disallow: "/" }]);
  assert.equal("sitemap" in preview, false);
});

test("host classification normalizes approved hosts without trusting arbitrary hosts", () => {
  assert.equal(classifyHost("FIGMEMENTO.COM:443"), "PRODUCTION_APEX");
  assert.equal(classifyHost("www.figmemento.com"), "PRODUCTION_WWW_ALIAS");
  assert.equal(classifyHost("staging.figmemento.com"), "STAGING");
  assert.equal(classifyHost("localhost:3000"), "DEVELOPMENT");
  assert.equal(classifyHost("127.0.0.1:8787"), "DEVELOPMENT");
  assert.equal(classifyHost("figmemento.test"), "TEST");
  assert.equal(classifyHost("preview-123.example.internal", "preview"), "PROVIDER_PREVIEW");
  assert.equal(classifyHost("attacker.example", "production"), "UNKNOWN");
});

test("only the exact WWW alias receives a permanent HTTPS apex redirect", () => {
  assert.deepEqual(
    getWwwRedirect("https://www.figmemento.com/product/example?ref=email"),
    { status: 308, location: `${productionOrigin}/product/example?ref=email` },
  );
  assert.deepEqual(
    getWwwRedirect("http://WWW.FIGMEMENTO.COM:80/path?x=1"),
    { status: 308, location: `${productionOrigin}/path?x=1` },
  );
  for (const value of [
    "https://figmemento.com/product/example",
    "https://staging.figmemento.com/product/example",
    "https://preview-123.example.internal/product/example",
    "http://localhost:3000/product/example",
    "https://figmemento.test/product/example",
    "not a URL",
  ]) {
    assert.equal(getWwwRedirect(value), null);
  }
});

test("Batch 3 preserves admin/guest cookie boundaries and production fixture rejection", async () => {
  assert.equal(getSessionCookieName(), "photogift-admin-session");
  assert.equal(getGuestDraftOwnerCookieName(), "photogift-guest-draft-owner");
  assert.doesNotMatch(getSessionCookieHeader("token"), /Domain=/i);

  const adminBoundary = await readFile(new URL("../app/server/admin-catalog-http.server.ts", import.meta.url), "utf8");
  assert.match(adminBoundary, /origin\.origin !== destination\.origin/);
  assert.throws(
    () => readProductSource({ NODE_ENV: "production", PHOTOGIFT_PRODUCT_SOURCE: "fixture" }),
    (error) => error instanceof ServerConfigurationError && error.key === "PHOTOGIFT_PRODUCT_SOURCE",
  );
});
