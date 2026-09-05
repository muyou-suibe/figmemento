import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { loadProductCatalog } from "../app/application/product-catalog.ts";
import { createCatalogRuntimeEnvironment } from "../app/config/catalog-runtime-environment.ts";
import { ServerConfigurationError, readProductSource } from "../app/config/server.ts";
import { createServerCatalogRepository } from "../app/infrastructure/catalog/server-catalog-repository.ts";

test("runtime adapter combines the fixture binding with an authoritative development mode", () => {
  const environment = createCatalogRuntimeEnvironment(
    { PHOTOGIFT_PRODUCT_SOURCE: "fixture", NODE_ENV: "production" },
    "development",
  );

  assert.deepEqual(environment, {
    PHOTOGIFT_PRODUCT_SOURCE: "fixture",
    NODE_ENV: "development",
  });
  assert.equal(readProductSource(environment), "fixture");
});

test("blank and absent fixture selections preserve the Supabase default", () => {
  assert.equal(
    readProductSource(createCatalogRuntimeEnvironment({}, "development")),
    "supabase",
  );
  assert.equal(
    readProductSource(
      createCatalogRuntimeEnvironment({ PHOTOGIFT_PRODUCT_SOURCE: "  " }, "development"),
    ),
    "supabase",
  );
});

test("direct production mode cannot be weakened by a development NODE_ENV binding", async () => {
  const bindingEnvironment = {
    PHOTOGIFT_PRODUCT_SOURCE: "fixture",
    NODE_ENV: "development",
  };
  const environment = createCatalogRuntimeEnvironment(bindingEnvironment, "production");

  assert.equal(environment.NODE_ENV, "production");
  assert.throws(
    () => readProductSource(environment),
    (error) => error instanceof ServerConfigurationError
      && error.key === "PHOTOGIFT_PRODUCT_SOURCE",
  );
  assert.deepEqual(
    await createServerCatalogRepository(bindingEnvironment, "production"),
    { status: "source_failure", operation: "catalog.configure" },
  );
});

test("Node tests retain explicit environment injection and both callers use the shared adapter", async () => {
  const injectedEnvironment = {
    PHOTOGIFT_PRODUCT_SOURCE: "fixture",
    NODE_ENV: "test",
  };

  const catalog = await createServerCatalogRepository(injectedEnvironment);
  assert.equal(catalog.status, "found");
  assert.equal(catalog.value.source, "fixture");

  const legacyFactorySource = await readFile(
    new URL("../app/infrastructure/products/product-repository-factory.ts", import.meta.url),
    "utf8",
  );
  assert.match(legacyFactorySource, /createCatalogRuntimeEnvironment\(environment, runtimeMode\)/);
  assert.doesNotMatch(legacyFactorySource, /readProductSource\(\s*\)/);
});

test("a Supabase source outage remains unavailable and never substitutes fixtures", async () => {
  const result = await loadProductCatalog({
    async listPublishedProducts() {
      throw new Error("controlled Supabase outage");
    },
  }, "supabase");

  assert.deepEqual(result, { status: "unavailable", reason: "source" });
});

test("runtime adapter returns only parser inputs and does not log environment values", () => {
  const messages = [];
  const originalError = console.error;
  const originalLog = console.log;
  const originalWarn = console.warn;
  console.error = (...values) => messages.push(values);
  console.log = (...values) => messages.push(values);
  console.warn = (...values) => messages.push(values);

  try {
    const environment = createCatalogRuntimeEnvironment({
      PHOTOGIFT_PRODUCT_SOURCE: "fixture",
      NODE_ENV: "development",
      SUPABASE_SECRET_KEY: "must-not-escape",
      STRIPE_SECRET_KEY: "must-not-escape",
    });

    assert.deepEqual(Object.keys(environment).sort(), ["NODE_ENV", "PHOTOGIFT_PRODUCT_SOURCE"]);
    assert.equal("SUPABASE_SECRET_KEY" in environment, false);
    assert.equal("STRIPE_SECRET_KEY" in environment, false);
    assert.deepEqual(messages, []);
  } finally {
    console.error = originalError;
    console.log = originalLog;
    console.warn = originalWarn;
  }
});
