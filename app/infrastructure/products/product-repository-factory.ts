import { createCatalogRuntimeEnvironment } from "../../config/catalog-runtime-environment.ts";
import { readProductSource, type RuntimeEnvironment } from "../../config/server";
import type { ProductCatalogSource, ProductRepository } from "../../application/product-catalog";
import { getSupabaseServerClient } from "../../lib/supabase-server";
import { FixtureProductRepository } from "./fixture-product-repository";
import { SupabaseProductRepository } from "./supabase-product-repository";
import { resolveCanonicalLocalCommerceCapability } from "../../config/server-runtime-composition.server.ts";

export function createProductRepository(
  environment?: RuntimeEnvironment,
  runtimeMode?: string,
): {
  repository: ProductRepository;
  source: ProductCatalogSource;
} {
  const source = readProductSource(createCatalogRuntimeEnvironment(environment, runtimeMode));
  if (source === "fixture") return { repository: new FixtureProductRepository(), source };
  if (source === "local_persistent") {
    const effectiveEnvironment = { ...(environment ?? process.env), ...createCatalogRuntimeEnvironment(environment, runtimeMode) };
    if (resolveCanonicalLocalCommerceCapability("catalog", effectiveEnvironment) !== "selected") {
      throw new Error("Persistent Catalog requires the canonical Catalog read boundary.");
    }
    throw new Error("Persistent Catalog requires the canonical Catalog read boundary.");
  }
  return { repository: new SupabaseProductRepository(getSupabaseServerClient()), source };
}
