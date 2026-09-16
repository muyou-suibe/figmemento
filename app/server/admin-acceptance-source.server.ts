/**
 * Backwards-compatible composition entrypoint.
 *
 * New server call sites should import the capability-specific source module:
 * Catalog, Customization, or Orders. This module remains for existing tests
 * and UI callers while the ownership split is rolled out.
 */
export { isAdminAcceptanceConfigurationError } from "./admin-source-resolution.server.ts";
export {
  createAdminCatalogReader,
  createAdminCatalogRepositories,
  createAdminSkuGraphRepositories,
  createAdminProductAssetRepositories,
  createAdminProductFulfillmentRepositories,
  createAdminCatalogLifecycleRepositories,
} from "./admin-catalog-source.server.ts";
export {
  createAdminCustomizationFieldReader,
  createAdminCustomizationFieldRepositories,
} from "./admin-customization-source.server.ts";
export {
  getSharedLocalAdminOrdersReadRepository,
  resolveAdminOrdersReadSource,
  type AdminOrdersSourceSelection,
} from "./admin-orders-source.server.ts";
export {
  getSharedLocalAdminCatalogRuntime,
  resetSharedLocalAdminCatalogRuntimeForTests,
  type LocalAdminCatalogRuntime,
} from "../infrastructure/catalog/local-admin-catalog-repository.server.ts";
import { resetSharedLocalAdminCatalogRuntimeForTests } from "../infrastructure/catalog/local-admin-catalog-repository.server.ts";
import { resetSharedLocalAdminOrdersReadRepositoryForTests } from "./admin-orders-source.server.ts";

/** Test-only process reset; there is no HTTP reset endpoint. */
export function resetSharedAdminAcceptanceRuntimeForTests(): void {
  resetSharedLocalAdminCatalogRuntimeForTests();
  resetSharedLocalAdminOrdersReadRepositoryForTests();
}
