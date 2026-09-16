import type {
  CustomizationFieldReadRepository,
} from "../../application/customization-field-repository.ts";
import { createCatalogRuntimeEnvironment } from "../../config/catalog-runtime-environment.ts";
import { readProductSource, type RuntimeEnvironment } from "../../config/server.ts";
import { getSupabaseServerClient } from "../../lib/supabase-server.ts";
import { createDevelopmentCustomizationFieldRepository } from "./development-customization-field-repository.ts";
import { SupabaseCustomizationFieldRepository } from "./supabase-customization-field-repository.ts";
import { LocalCatalogAuthority } from "../local-commerce/local-catalog-authority.server.ts";

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
  createSupabaseRepository?: () => CustomizationFieldReadRepository,
): ServerCustomizationFieldRepository {
  const runtimeEnvironment = createCatalogRuntimeEnvironment(environment, runtimeMode);
  const source = readProductSource(runtimeEnvironment);
  if (source === "local_persistent") {
    return { repository: new LocalCatalogAuthority({ ...(environment ?? process.env), ...runtimeEnvironment }), source };
  }
  if (source === "fixture") {
    return {
      repository: createDevelopmentCustomizationFieldRepository(runtimeEnvironment),
      source,
    };
  }
  return createProductionCustomizationFieldRepository(createSupabaseRepository);
}
