import type { CatalogRepositoryResult } from "../../application/catalog-repository.ts";
import type { CatalogReadRepository } from "./catalog-repository-factory.ts";
import { createCatalogRuntimeEnvironment } from "../../config/catalog-runtime-environment.ts";
import { readProductSource, type RuntimeEnvironment } from "../../config/server.ts";
import { createProductionCatalogRepository } from "./catalog-repository-factory.ts";
import { LocalCatalogAuthority } from "../local-commerce/local-catalog-authority.server.ts";

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
      const authority = new LocalCatalogAuthority({ ...(environment ?? process.env), ...runtimeEnvironment });
      const checked = await authority.readSnapshot();
      if (checked.status !== "found") return { status: "source_failure", operation: "catalog.configure" };
      return { status: "found", value: { repository: authority.repository, source } };
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
