import type { SupabaseClient } from "@supabase/supabase-js";
import type { CatalogAdminReadRepository } from "../../application/catalog-repository.ts";
import type { PrivilegedAdminCatalogRepositories } from "../../application/admin-catalog-boundary.ts";
import type { PrivilegedAdminSkuGraphRepositories } from "../../application/admin-sku-graph.ts";
import type { PrivilegedAdminProductAssetRepositories } from "../../application/admin-product-assets.ts";
import type { PrivilegedAdminProductFulfillmentRepositories } from "../../application/admin-product-fulfillment.ts";
import type { PrivilegedAdminCatalogLifecycleRepositories } from "../../application/admin-catalog-lifecycle.ts";
import { getSupabaseServerClient } from "../../lib/supabase-server.ts";
import { SupabaseCatalogAdminCommandRepository } from "./supabase-catalog-admin-repository.ts";
import { SupabaseCatalogRepository } from "./supabase-catalog-repository.ts";
import { SupabaseProductSkuGraphRepository } from "./supabase-product-sku-graph-repository.ts";
import { SupabaseProductAssetRepository } from "./supabase-product-asset-repository.ts";
import { SupabaseProductFulfillmentRepository } from "./supabase-product-fulfillment-repository.ts";
import { SupabaseCatalogLifecycleRepository } from "./supabase-catalog-lifecycle-repository.ts";

export function createProductionAdminCatalogReader(
  createSupabaseClient: () => SupabaseClient = getSupabaseServerClient,
): CatalogAdminReadRepository {
  return SupabaseCatalogRepository.fromClient(createSupabaseClient());
}

export function createProductionAdminCatalogRepositories(
  createSupabaseClient: () => SupabaseClient = getSupabaseServerClient,
): PrivilegedAdminCatalogRepositories {
  const client = createSupabaseClient();
  return {
    reader: SupabaseCatalogRepository.fromClient(client),
    writer: SupabaseCatalogAdminCommandRepository.fromClient(client),
  };
}

export function createProductionAdminSkuGraphRepositories(
  createSupabaseClient: () => SupabaseClient = getSupabaseServerClient,
): PrivilegedAdminSkuGraphRepositories {
  const client = createSupabaseClient();
  return {
    reader: SupabaseCatalogRepository.fromClient(client),
    writer: SupabaseProductSkuGraphRepository.fromClient(client),
  };
}

export function createProductionAdminProductAssetRepositories(
  createSupabaseClient: () => SupabaseClient = getSupabaseServerClient,
): PrivilegedAdminProductAssetRepositories {
  const client = createSupabaseClient();
  return {
    reader: SupabaseCatalogRepository.fromClient(client),
    writer: SupabaseProductAssetRepository.fromClient(client),
  };
}

export function createProductionAdminProductFulfillmentRepositories(
  createSupabaseClient: () => SupabaseClient = getSupabaseServerClient,
): PrivilegedAdminProductFulfillmentRepositories {
  const client = createSupabaseClient();
  return {
    reader: SupabaseCatalogRepository.fromClient(client),
    writer: SupabaseProductFulfillmentRepository.fromClient(client),
  };
}

export function createProductionAdminCatalogLifecycleRepositories(
  createSupabaseClient: () => SupabaseClient = getSupabaseServerClient,
): PrivilegedAdminCatalogLifecycleRepositories {
  const client = createSupabaseClient();
  return { writer: SupabaseCatalogLifecycleRepository.fromClient(client) };
}
