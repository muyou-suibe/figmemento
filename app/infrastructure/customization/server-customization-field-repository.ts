import type {
  CustomizationFieldReadRepository,
} from "../../application/customization-field-repository.ts";
import { createCatalogRuntimeEnvironment } from "../../config/catalog-runtime-environment.ts";
import { readProductSource, type RuntimeEnvironment } from "../../config/server.ts";
import { getSupabaseServerClient } from "../../lib/supabase-server.ts";
import { createDevelopmentCustomizationFieldRepository } from "./development-customization-field-repository.ts";
import { SupabaseCustomizationFieldRepository } from "./supabase-customization-field-repository.ts";
import { LocalCatalogAuthority } from "../local-commerce/local-catalog-authority.server.ts";
import { resolveCanonicalLocalCommerceCapability } from "../../config/server-runtime-composition.server.ts";

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
    const effectiveEnvironment = { ...(environment ?? process.env), ...runtimeEnvironment };
    if (resolveCanonicalLocalCommerceCapability("catalog", effectiveEnvironment) !== "selected") {
      throw new Error("Persistent Catalog requires the canonical Catalog read boundary.");
    }
    return { repository: new LocalCatalogAuthority(effectiveEnvironment), source };
  }
  if (source === "fixture") {
    return {
      repository: createDevelopmentCustomizationFieldRepository(runtimeEnvironment),
      source,
    };
  }
  return createProductionCustomizationFieldRepository(createSupabaseRepository);
}
