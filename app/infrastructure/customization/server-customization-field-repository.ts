import type {
  CustomizationFieldReadRepository,
} from "../../application/customization-field-repository.ts";
import { createCatalogRuntimeEnvironment } from "../../config/catalog-runtime-environment.ts";
import type { RuntimeEnvironment } from "../../config/server.ts";
import { getSupabaseServerClient } from "../../lib/supabase-server.ts";
import { createDevelopmentCustomizationFieldRepository } from "./development-customization-field-repository.ts";
import { SupabaseCustomizationFieldRepository } from "./supabase-customization-field-repository.ts";
import { LocalCatalogAuthority } from "../local-commerce/local-catalog-authority.server.ts";
import { resolveCanonicalCatalogSource } from "../../config/server-runtime-composition.server.ts";

export interface ServerCustomizationFieldRepository {
  repository: CustomizationFieldReadRepository;
  source: "supabase" | "fixture" | "local_persistent";
}

export function createProductionCustomizationFieldRepository(
  createSupabaseRepository: () => CustomizationFieldReadRepository = () =>
    SupabaseCustomizationFieldRepository.fromClient(getSupabaseServerClient()),
): ServerCustomizationFieldRepository {
  return { repository: createSupabaseRepository(), source: "supabase" };
}

/**
 * Resolves the same explicit source selection as the catalog. Fixture mode is
 * selected before any production repository construction; normal source use
 * returns only the authoritative repository and never substitutes fixtures.
 */
export function createServerCustomizationFieldRepository(
  environment?: RuntimeEnvironment,
  runtimeMode?: string,
): ServerCustomizationFieldRepository {
  const runtimeEnvironment = createCatalogRuntimeEnvironment(environment, runtimeMode);
  const effectiveEnvironment = { ...(environment ?? process.env), ...runtimeEnvironment };
  const source = resolveCanonicalCatalogSource(effectiveEnvironment);
  if (source === "local_persistent") {
    return { repository: new LocalCatalogAuthority(effectiveEnvironment), source };
  }
  if (source === "fixture") {
    return {
      repository: createDevelopmentCustomizationFieldRepository(runtimeEnvironment),
      source,
    };
  }
  throw new Error("Catalog source is unavailable until provider activation is authorized.");
}
