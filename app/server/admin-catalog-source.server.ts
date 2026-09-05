import type { PrivilegedAdminCatalogRepositories } from "../application/admin-catalog-boundary.ts";
import type { PrivilegedAdminCatalogLifecycleRepositories } from "../application/admin-catalog-lifecycle.ts";
import type { PrivilegedAdminProductAssetRepositories } from "../application/admin-product-assets.ts";
import type { PrivilegedAdminProductFulfillmentRepositories } from "../application/admin-product-fulfillment.ts";
import type { PrivilegedAdminSkuGraphRepositories } from "../application/admin-sku-graph.ts";
import type { CatalogAdminReadRepository } from "../application/catalog-repository.ts";
import {
  createProductionAdminCatalogLifecycleRepositories,
  createProductionAdminCatalogReader,
  createProductionAdminCatalogRepositories,
  createProductionAdminProductAssetRepositories,
  createProductionAdminProductFulfillmentRepositories,
  createProductionAdminSkuGraphRepositories,
} from "../infrastructure/catalog/catalog-admin-repository-factory.ts";
import { getSharedLocalCatalogAdminRuntime } from "../infrastructure/catalog/local-admin-catalog-runtime.server.ts";
import { resolveAuthorizedSource } from "./admin-source-resolution.server.ts";

export function createAdminCatalogReader(): CatalogAdminReadRepository {
  return resolveAuthorizedSource(
    createProductionAdminCatalogReader,
    () => getSharedLocalCatalogAdminRuntime().reader,
  );
}

export function createAdminCatalogRepositories(): PrivilegedAdminCatalogRepositories {
  return resolveAuthorizedSource(
    createProductionAdminCatalogRepositories,
    () => {
      const runtime = getSharedLocalCatalogAdminRuntime();
      return { reader: runtime.reader, writer: runtime.commandRepository };
    },
  );
}

export function createAdminSkuGraphRepositories(): PrivilegedAdminSkuGraphRepositories {
  return resolveAuthorizedSource(
    createProductionAdminSkuGraphRepositories,
    () => {
      const runtime = getSharedLocalCatalogAdminRuntime();
      return { reader: runtime.reader, writer: runtime.skuGraphRepository };
    },
  );
}

export function createAdminProductAssetRepositories(): PrivilegedAdminProductAssetRepositories {
  return resolveAuthorizedSource(
    createProductionAdminProductAssetRepositories,
    () => {
      const runtime = getSharedLocalCatalogAdminRuntime();
      return { reader: runtime.reader, writer: runtime.assetRepository };
    },
  );
}

export function createAdminProductFulfillmentRepositories(): PrivilegedAdminProductFulfillmentRepositories {
  return resolveAuthorizedSource(
    createProductionAdminProductFulfillmentRepositories,
    () => {
      const runtime = getSharedLocalCatalogAdminRuntime();
      return { reader: runtime.reader, writer: runtime.fulfillmentRepository };
    },
  );
}

export function createAdminCatalogLifecycleRepositories(): PrivilegedAdminCatalogLifecycleRepositories {
  return resolveAuthorizedSource(
    createProductionAdminCatalogLifecycleRepositories,
    () => ({ writer: getSharedLocalCatalogAdminRuntime().lifecycleRepository }),
  );
}
