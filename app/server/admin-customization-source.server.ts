import type {
  CustomizationFieldAdminReadRepository,
  PrivilegedAdminCustomizationFieldRepositories,
} from "../application/admin-customization-field-boundary.ts";
import {
  createProductionAdminCustomizationFieldReader,
  createProductionAdminCustomizationFieldRepositories,
} from "../infrastructure/customization/customization-field-repository-factory.ts";
import { getSharedLocalAdminCatalogRuntime } from "../infrastructure/catalog/local-admin-catalog-repository.server.ts";
import { createLocalPersistentAdminCustomizationRepository } from "../infrastructure/local-commerce/local-persistent-admin-customization.server.ts";
import { resolveAuthorizedAdminCustomizationSource } from "./admin-source-resolution.server.ts";

export function createAdminCustomizationFieldReader(): CustomizationFieldAdminReadRepository {
  return resolveAuthorizedAdminCustomizationSource(
    createProductionAdminCustomizationFieldReader,
    () => getSharedLocalAdminCatalogRuntime().customizationRepository,
    createLocalPersistentAdminCustomizationRepository,
  );
}

export function createAdminCustomizationFieldRepositories(): PrivilegedAdminCustomizationFieldRepositories {
  return resolveAuthorizedAdminCustomizationSource(
    createProductionAdminCustomizationFieldRepositories,
    () => {
      const runtime = getSharedLocalAdminCatalogRuntime();
      return { reader: runtime.customizationRepository, writer: runtime.customizationRepository };
    },
    () => {
      const repository = createLocalPersistentAdminCustomizationRepository();
      return { reader: repository, writer: repository };
    },
  );
}
