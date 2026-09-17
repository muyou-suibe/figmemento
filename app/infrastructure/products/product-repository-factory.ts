import { createCatalogRuntimeEnvironment } from "../../config/catalog-runtime-environment.ts";
import type { RuntimeEnvironment } from "../../config/server";
import type { ProductCatalogSource, ProductRepository } from "../../application/product-catalog";
import { FixtureProductRepository } from "./fixture-product-repository";
import { resolveCanonicalCatalogSource } from "../../config/server-runtime-composition.server.ts";

export function createProductRepository(
  environment?: RuntimeEnvironment,
  runtimeMode?: string,
): {
  repository: ProductRepository;
  source: ProductCatalogSource;
} {
  const runtimeEnvironment = createCatalogRuntimeEnvironment(environment, runtimeMode);
  const effectiveEnvironment = { ...(environment ?? process.env), ...runtimeEnvironment };
  const source = resolveCanonicalCatalogSource(effectiveEnvironment);
  if (source === "fixture") return { repository: new FixtureProductRepository(), source };
  if (source === "local_persistent") {
    throw new Error("Persistent Catalog requires the canonical Catalog read boundary.");
  }
  throw new Error("Catalog source is unavailable until provider activation is authorized.");
}
