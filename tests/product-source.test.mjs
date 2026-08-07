import assert from "node:assert/strict";
import test from "node:test";

import { loadProductCatalog } from "../app/application/product-catalog.ts";
import { readProductSource, readSupabaseServerConfig, ServerConfigurationError } from "../app/config/server.ts";
import { FixtureProductRepository } from "../app/infrastructure/products/fixture-product-repository.ts";
import { productFromDatabase } from "../app/infrastructure/products/product-mapper.ts";

test("Supabase product rows map into provider-neutral products", () => {
  assert.deepEqual(
    productFromDatabase({
      slug: "memory-frame",
      name: "Memory Frame",
      category: "3D keepsakes",
      description: "A current product row",
      price_cents: 2599,
      art_key: "portrait",
    }),
    {
      id: "memory-frame",
      name: "Memory Frame",
      category: "3D keepsakes",
      description: "A current product row",
      price: 25.99,
      art: "portrait",
      materials: "Made to order from your photo",
      size: "Finished size varies by design",
      leadTime: "7–14 business days",
    },
  );
  assert.equal(productFromDatabase({ category: "unsupported" }), null);
});

test("explicit fixture repository is deterministic and returns defensive copies", async () => {
  const repository = new FixtureProductRepository();
  const first = await repository.listPublishedProducts();
  const second = await repository.listPublishedProducts();
  assert.ok(first.length > 0);
  assert.deepEqual(first, second);
  assert.notEqual(first, second);
  assert.notEqual(first[0], second[0]);
});

test("catalog source failures produce an unavailable result without fixture fallback", async () => {
  const repository = {
    async listPublishedProducts() {
      throw new Error("Supabase unavailable");
    },
  };
  assert.deepEqual(await loadProductCatalog(repository, "supabase"), {
    status: "unavailable",
    reason: "source",
  });
});

test("missing Supabase server configuration fails explicitly", () => {
  assert.throws(
    () => readSupabaseServerConfig({}),
    (error) => error instanceof ServerConfigurationError && error.key === "NEXT_PUBLIC_SUPABASE_URL",
  );
});

test("fixture selection is explicit outside production and rejected in production", () => {
  assert.equal(readProductSource({ NODE_ENV: "development", PHOTOGIFT_PRODUCT_SOURCE: "fixture" }), "fixture");
  assert.throws(
    () => readProductSource({ NODE_ENV: "production", PHOTOGIFT_PRODUCT_SOURCE: "fixture" }),
    (error) => error instanceof ServerConfigurationError && error.key === "PHOTOGIFT_PRODUCT_SOURCE",
  );
});
