import {
  CatalogRepositoryService,
  type CatalogDataSource,
  type CatalogRepositoryResult,
} from "../../application/catalog-repository.ts";
import type { CatalogDataSet } from "../../application/catalog-data-set.ts";
import { readProductSource, type RuntimeEnvironment } from "../../config/server.ts";
import { createDevelopmentCatalogFixtures } from "./development-catalog-fixtures.ts";

class DevelopmentCatalogDataSource implements CatalogDataSource {
  async loadCatalogDataSet(): Promise<CatalogRepositoryResult<CatalogDataSet>> {
    return { status: "found", value: createDevelopmentCatalogFixtures() };
  }
}

class DevelopmentCatalogRepository extends CatalogRepositoryService {
  constructor() {
    super(new DevelopmentCatalogDataSource());
  }
}

export function createDevelopmentCatalogRepository(
  environment: RuntimeEnvironment,
): DevelopmentCatalogRepository {
  const source = readProductSource(environment);
  if (source !== "fixture") {
    throw new Error("Development catalog fixtures require explicit fixture source selection.");
  }
  return new DevelopmentCatalogRepository();
}
