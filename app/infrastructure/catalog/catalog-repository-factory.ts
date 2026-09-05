import type { SupabaseClient } from "@supabase/supabase-js";
import type { PublicCatalogReadRepository } from "../../application/catalog-repository.ts";
import { getSupabaseServerClient } from "../../lib/supabase-server.ts";
import { SupabaseCatalogRepository } from "./supabase-catalog-repository.ts";

export type CatalogReadRepository = PublicCatalogReadRepository;

export function createProductionCatalogRepository(
  createSupabaseClient: () => SupabaseClient = getSupabaseServerClient,
): { repository: CatalogReadRepository; source: "supabase" } {
  return {
    repository: SupabaseCatalogRepository.fromClient(createSupabaseClient()),
    source: "supabase",
  };
}
