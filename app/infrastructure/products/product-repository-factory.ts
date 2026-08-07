import { readProductSource } from "../../config/server";
import type { ProductCatalogSource, ProductRepository } from "../../application/product-catalog";
import { getSupabaseServerClient } from "../../lib/supabase-server";
import { FixtureProductRepository } from "./fixture-product-repository";
import { SupabaseProductRepository } from "./supabase-product-repository";

export function createProductRepository(): {
  repository: ProductRepository;
  source: ProductCatalogSource;
} {
  const source = readProductSource();
  if (source === "fixture") return { repository: new FixtureProductRepository(), source };
  return { repository: new SupabaseProductRepository(getSupabaseServerClient()), source };
}
