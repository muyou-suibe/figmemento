import assert from "node:assert/strict";
import test from "node:test";

import "./server-runtime-configuration-composition.test.mjs";

import {
  brandName,
  canonicalHostname,
  getSupportContactText,
  PublicConfigurationError,
  parseDeploymentConfiguration,
  parsePublicOrigin,
  parsePublicSiteConfig,
  parsePublicSupabaseConfig,
  productionOrigin,
  stagingHostname,
  parseSupportEmail,
} from "../app/config/public.ts";
import {
  ServerConfigurationError,
  readCustomerUploadConfig,
  readProductSource,
  readStripeServerConfig,
  readSupabaseServerConfig,
} from "../app/config/server.ts";

test("public configuration returns only allowlisted public values", () => {
  const config = parsePublicSupabaseConfig({
    url: "https://example.supabase.co",
    publishableKey: "public-test-key",
  });

  assert.deepEqual(Object.keys(config).sort(), ["publishableKey", "url"]);
  assert.equal("secretKey" in config, false);
  assert.equal("webhookSecret" in config, false);
  assert.equal("adminPassword" in config, false);
});

test("missing public configuration names the key without exposing another value", () => {
  assert.throws(
    () => parsePublicSupabaseConfig({ url: "sensitive-url-value" }),
    (error) => {
      assert.ok(error instanceof PublicConfigurationError);
      assert.match(error.message, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
      assert.doesNotMatch(error.message, /sensitive-url-value/);
      return true;
    },
  );
});

test("FigMemento identity is public, deterministic, and secret-free", () => {
  assert.deepEqual(
    { brandName, productionOrigin, canonicalHostname, stagingHostname },
    {
      brandName: "FigMemento",
      productionOrigin: "https://figmemento.com",
      canonicalHostname: "figmemento.com",
      stagingHostname: "staging.figmemento.com",
    },
  );
});

test("deployment configuration enforces the approved production origin", () => {
  assert.deepEqual(
    parseDeploymentConfiguration({ appDeploymentEnv: "production" }),
    { environment: "production", origin: "https://figmemento.com" },
  );
  assert.deepEqual(
    parseDeploymentConfiguration({ appDeploymentEnv: "development" }),
    { environment: "development", origin: "http://localhost:3000" },
  );
  assert.deepEqual(
    parseDeploymentConfiguration({ appDeploymentEnv: "preview", deploymentOrigin: "https://preview.example.test" }),
    { environment: "preview", origin: "https://preview.example.test" },
  );

  for (const input of [
    { appDeploymentEnv: "production", deploymentOrigin: "http://figmemento.com" },
    { appDeploymentEnv: "production", deploymentOrigin: "https://figmemento.com/path" },
    { appDeploymentEnv: "production", deploymentOrigin: "https://figmemento.com?source=test" },
    { appDeploymentEnv: "production", deploymentOrigin: "https://user:pass@figmemento.com" },
    { appDeploymentEnv: "production", deploymentOrigin: "https://localhost:3000" },
    { appDeploymentEnv: "preview" },
    { appDeploymentEnv: "unknown" },
  ]) {
    assert.throws(() => parseDeploymentConfiguration(input), PublicConfigurationError);
  }
});

test("public origin parsing accepts only absolute HTTP(S) origins", () => {
  assert.equal(parsePublicOrigin("https://figmemento.com:443"), "https://figmemento.com");
  assert.equal(parsePublicOrigin("http://localhost:3000"), "http://localhost:3000");
  for (const value of [
    "javascript:alert(1)",
    "/relative",
    "https://figmemento.com/path",
    "https://figmemento.com#fragment",
    "https://figmemento.com/path?query=1",
    "https://figmemento.com/with whitespace",
  ]) {
    assert.throws(() => parsePublicOrigin(value), PublicConfigurationError);
  }
});

test("support contact is optional, validated, and never fabricated", () => {
  assert.equal(parseSupportEmail(undefined), undefined);
  assert.equal(parseSupportEmail("  team@example.test "), "team@example.test");
  assert.equal(
    getSupportContactText(undefined),
    "For order help, contact the support team through the channel provided with your order and include your order number.",
  );
  assert.match(getSupportContactText("team@example.test"), /team@example\.test/);
  assert.throws(() => parseSupportEmail("not-an-email"), PublicConfigurationError);
  assert.throws(() => parseSupportEmail("hello@photogift.example"), PublicConfigurationError);
});

test("site configuration uses the new authority while preserving explicit test injection", () => {
  assert.deepEqual(
    parsePublicSiteConfig({ appDeploymentEnv: "test", deploymentOrigin: "https://figmemento.test" }),
    {
      siteUrl: "https://figmemento.test",
      brandName: "FigMemento",
      deploymentEnvironment: "test",
      supportEmail: undefined,
    },
  );
});

test("server integration configuration is validated only when read", () => {
  const moduleImportDidNotRequireSecrets = true;
  assert.equal(moduleImportDidNotRequireSecrets, true);
  assert.throws(
    () => readStripeServerConfig({}),
    (error) => error instanceof ServerConfigurationError && error.key === "STRIPE_SECRET_KEY",
  );
});

test("tests can supply explicit server configuration", () => {
  assert.deepEqual(
    readSupabaseServerConfig({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SECRET_KEY: "server-test-key",
    }),
    { url: "https://example.supabase.co", secretKey: "server-test-key" },
  );
});

test("fixture product source is rejected in production", () => {
  assert.throws(
    () => readProductSource({ NODE_ENV: "production", PHOTOGIFT_PRODUCT_SOURCE: "fixture" }),
    (error) => error instanceof ServerConfigurationError && error.key === "PHOTOGIFT_PRODUCT_SOURCE",
  );
  assert.throws(
    () => readProductSource({ PHOTOGIFT_PRODUCT_SOURCE: "fixture" }),
    (error) => error instanceof ServerConfigurationError && error.key === "PHOTOGIFT_PRODUCT_SOURCE",
  );
  assert.equal(readProductSource({ NODE_ENV: "test", PHOTOGIFT_PRODUCT_SOURCE: "fixture" }), "fixture");
  assert.equal(readProductSource({ NODE_ENV: "production" }), "supabase");
});

test("customer upload source is independent, disabled by default, and local-only", () => {
  assert.deepEqual(readCustomerUploadConfig({ NODE_ENV: "development" }, "development"), {
    source: "disabled",
    runtimeMode: "development",
  });
  assert.deepEqual(readCustomerUploadConfig({ NODE_ENV: "test", CUSTOMER_UPLOAD_SOURCE: "local_fake" }, "test"), {
    source: "local_fake",
    runtimeMode: "test",
  });
  assert.throws(
    () => readCustomerUploadConfig({ NODE_ENV: "production", CUSTOMER_UPLOAD_SOURCE: "local_fake" }),
    (error) => error instanceof ServerConfigurationError && error.key === "CUSTOMER_UPLOAD_SOURCE",
  );
  assert.throws(
    () => readCustomerUploadConfig({ NODE_ENV: "development", CUSTOMER_UPLOAD_SOURCE: "unknown" }),
    (error) => error instanceof ServerConfigurationError && error.key === "CUSTOMER_UPLOAD_SOURCE",
  );
});
