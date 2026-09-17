import type { CatalogRepositoryResult } from "../../application/catalog-repository.ts";
import type { CatalogReadRepository } from "./catalog-repository-factory.ts";
import { createCatalogRuntimeEnvironment } from "../../config/catalog-runtime-environment.ts";
import { readProductSource, type RuntimeEnvironment } from "../../config/server.ts";
import { createProductionCatalogRepository } from "./catalog-repository-factory.ts";
import { LocalCatalogAuthority } from "../local-commerce/local-catalog-authority.server.ts";
import { resolveCanonicalLocalCommerceCapability } from "../../config/server-runtime-composition.server.ts";
import {
  LocalCustomerDemoPresentationRepository,
  shouldUseLocalCustomerDemoPresentation,
} from "./local-customer-demo-presentation.server.ts";

export type ServerCatalogRepository = {
  repository: CatalogReadRepository;
  source: "supabase" | "fixture" | "local_persistent";
};

export async function createServerCatalogRepository(
  environment?: RuntimeEnvironment,
  runtimeMode?: string,
): Promise<CatalogRepositoryResult<ServerCatalogRepository>> {
  try {
    const runtimeEnvironment = createCatalogRuntimeEnvironment(environment, runtimeMode);
    const source = readProductSource(runtimeEnvironment);
    if (source === "local_persistent") {
      const effectiveEnvironment = { ...(environment ?? process.env), ...runtimeEnvironment };
      if (resolveCanonicalLocalCommerceCapability("catalog", effectiveEnvironment) !== "selected") {
        return { status: "source_failure", operation: "catalog.configure" };
      }
      const authority = new LocalCatalogAuthority(effectiveEnvironment);
      const checked = await authority.readSnapshot();
      if (checked.status !== "found") return { status: "source_failure", operation: "catalog.configure" };
      const repository = shouldUseLocalCustomerDemoPresentation(effectiveEnvironment)
        ? new LocalCustomerDemoPresentationRepository(authority.repository)
        : authority.repository;
      return { status: "found", value: { repository, source } };
    }
    if (source === "fixture") {
      const { createDevelopmentCatalogRepository } = await import(
        "./development-catalog-repository.ts"
      );
      return {
        status: "found",
        value: {
          repository: createDevelopmentCatalogRepository(runtimeEnvironment),
          source,
        },
      };
    }

    return {
      status: "found",
      value: createProductionCatalogRepository(),
    };
  } catch {
    return { status: "source_failure", operation: "catalog.configure" };
  }
}
