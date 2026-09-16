import type { AdminOrdersReadRepository } from "../application/admin-orders-read-repository.ts";
import { createLocalAdminOrdersReadRepository } from "../infrastructure/orders/local-admin-orders-read-repository.server.ts";
import { createLocalPersistentAdminOrdersReadRepository } from "../infrastructure/orders/local-persistent-admin-orders-read-repository.server.ts";
import { resolveAuthorizedSource } from "./admin-source-resolution.server.ts";

export type AdminOrdersSourceSelection =
  | { readonly status: "production" }
  | { readonly status: "local_fake"; readonly repository: AdminOrdersReadRepository }
  | { readonly status: "local_persistent"; readonly repository: AdminOrdersReadRepository };

let sharedLocalOrdersRepository: AdminOrdersReadRepository | null = null;

export function getSharedLocalAdminOrdersReadRepository(): AdminOrdersReadRepository {
  sharedLocalOrdersRepository ??= createLocalAdminOrdersReadRepository();
  return sharedLocalOrdersRepository;
}

export function resetSharedLocalAdminOrdersReadRepositoryForTests(): void {
  sharedLocalOrdersRepository = null;
}

export function resolveAdminOrdersReadSource(): AdminOrdersSourceSelection {
  return resolveAuthorizedSource<AdminOrdersSourceSelection>(
    () => ({ status: "production" as const }),
    () => ({ status: "local_fake" as const, repository: getSharedLocalAdminOrdersReadRepository() }),
    () => ({ status: "local_persistent" as const, repository: createLocalPersistentAdminOrdersReadRepository() }),
  );
}
