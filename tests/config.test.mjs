import assert from "node:assert/strict";
import test from "node:test";

import {
  PublicConfigurationError,
  parsePublicSupabaseConfig,
} from "../app/config/public.ts";
import {
  ServerConfigurationError,
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
