import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { customizationFieldSourceFailure } from "../app/application/customization-field-repository.ts";
import { FixtureCustomizationFieldRepository } from "../app/infrastructure/customization/development-customization-field-repository.ts";
import {
  createProductionCustomizationFieldRepository,
  createServerCustomizationFieldRepository,
} from "../app/infrastructure/customization/server-customization-field-repository.ts";

test("explicit fixture mode creates the deterministic fixture repository before any production repository", () => {
  let productionRepositoryCalls = 0;
  const result = createServerCustomizationFieldRepository(
    { PHOTOGIFT_PRODUCT_SOURCE: "fixture", NODE_ENV: "test" },
    undefined,
    () => {
      productionRepositoryCalls += 1;
      throw new Error("production repository must not be constructed");
    },
  );

  assert.equal(result.source, "fixture");
  assert.ok(result.repository instanceof FixtureCustomizationFieldRepository);
  assert.equal(productionRepositoryCalls, 0);
});

test("provider-specific adapter factory remains available without being an application source selector", async () => {
  const authoritative = {
    async getCustomizationFieldsForProduct() {
      return { status: "not_found" };
    },
  };
  const result = createProductionCustomizationFieldRepository(() => authoritative);

  assert.deepEqual(result, { repository: authoritative, source: "supabase" });
  assert.deepEqual(await result.repository.getCustomizationFieldsForProduct("product-unknown"), { status: "not_found" });
  assert.equal(result.repository instanceof FixtureCustomizationFieldRepository, false);
});

test("provider-specific adapter results remain unchanged and never select fixture fallback", async () => {
  const results = [
    customizationFieldSourceFailure(),
    { status: "invalid_configuration", issues: [{ path: "$.fields", code: "invalid_value", message: "Invalid source data." }] },
  ];
  for (const expected of results) {
    const authoritative = {
      async getCustomizationFieldsForProduct() {
        return expected;
      },
    };
    const configured = createProductionCustomizationFieldRepository(() => authoritative);
    assert.equal(configured.source, "supabase");
    assert.equal(configured.repository instanceof FixtureCustomizationFieldRepository, false);
    assert.deepEqual(await configured.repository.getCustomizationFieldsForProduct("product-frame"), expected);
  }
});

test("application source selection fails closed for an explicit fixture in production", () => {
  assert.throws(
    () => createServerCustomizationFieldRepository(
      { PHOTOGIFT_PRODUCT_SOURCE: "fixture", NODE_ENV: "development" },
      "production",
      () => { throw new Error("must not construct production repository"); },
    ),
    /Catalog source is unavailable until provider activation is authorized/,
  );
});

test("source-aware customization factory shares the catalog runtime adapter and has no fallback/legacy path", async () => {
  const source = await readFile(
    new URL("../app/infrastructure/customization/server-customization-field-repository.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /createCatalogRuntimeEnvironment\(environment, runtimeMode\)/);
  assert.match(source, /resolveCanonicalCatalogSource\(effectiveEnvironment\)/);
  assert.doesNotMatch(source, /readProductSource\(runtimeEnvironment\)/);
  assert.doesNotMatch(source, /catch[\s\S]*fixture|customization_schema|seed|legacy|fetch\s*\(/i);
});
