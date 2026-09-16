import type { LocalFulfillmentAggregateRepository } from "../application/local-fulfillment-repository.ts";
import type { LocalOrderFulfillmentReadPort } from "../application/local-order-repository.ts";
import type { LocalConfiguredItemReadPort } from "../application/local-configured-item-read-port.ts";
import type { LocalSupplierAssignmentRepository } from "../application/local-supplier-assignment-repository.ts";
import type { LocalSupplierProductionRepository } from "../application/local-supplier-production-repository.ts";
import type { LocalSupplierWorkOrderRepository } from "../application/local-supplier-work-order-repository.ts";
import { readTrustedLocalSupplierConfig, type LocalSupplierConfiguration } from "../config/local-supplier-runtime.ts";
import type { SupplierDomainDataset } from "../domain/supplier-operations.ts";
import { normalizeLocalSupplierSourceFixtures, type SupplierSourceFixtureDataset } from "../domain/supplier-operations.ts";
import { LOCAL_SUPPLIER_SOURCE_FIXTURES } from "../infrastructure/suppliers/local-supplier-source-fixtures.ts";
import { applyLocalSupplierDemoMappingOverlay } from "../infrastructure/suppliers/local-supplier-demo-mapping-overlay.ts";
import { LocalMemoryLocalSupplierAssignmentRepository } from "../infrastructure/suppliers/local-memory-local-supplier-assignment-repository.server.ts";
import { LocalMemoryLocalSupplierProductionRepository } from "../infrastructure/suppliers/local-memory-local-supplier-production-repository.server.ts";
import { LocalMemoryLocalSupplierWorkOrderRepository } from "../infrastructure/suppliers/local-memory-local-supplier-work-order-repository.server.ts";
import { getSharedLocalFulfillmentRepository } from "./local-fulfillment-runtime.server.ts";
import { getSharedLocalOrderFulfillmentReadPort } from "./local-order-runtime.server.ts";
import { createLocalConfiguredItemReadAdapter } from "../application/local-configured-item-read-port.ts";

export interface LocalSupplierRuntime {
  readonly configuration: LocalSupplierConfiguration;
  readonly dataset: SupplierDomainDataset;
  readonly orders: LocalOrderFulfillmentReadPort;
  readonly configuredItems?: LocalConfiguredItemReadPort;
  readonly fulfillments: LocalFulfillmentAggregateRepository;
  readonly assignments: LocalSupplierAssignmentRepository;
  readonly workOrders: LocalSupplierWorkOrderRepository;
  readonly production: LocalSupplierProductionRepository;
}

export interface LocalSupplierRuntimeOptions {
  readonly configuration?: LocalSupplierConfiguration;
  readonly dataset?: SupplierDomainDataset;
  readonly sourceFixtures?: SupplierSourceFixtureDataset;
  readonly orders?: LocalOrderFulfillmentReadPort;
  readonly configuredItems?: LocalConfiguredItemReadPort;
  readonly fulfillments?: LocalFulfillmentAggregateRepository;
  readonly assignments?: LocalSupplierAssignmentRepository;
  readonly workOrders?: LocalSupplierWorkOrderRepository;
  readonly production?: LocalSupplierProductionRepository;
}

function normalizeFixtures(source: SupplierSourceFixtureDataset): SupplierDomainDataset {
  const normalized = normalizeLocalSupplierSourceFixtures(source);
  if (!normalized.ok) throw new Error("Invalid local supplier source fixtures.");
  return normalized.value;
}

export function createLocalSupplierRuntime(options: LocalSupplierRuntimeOptions = {}): LocalSupplierRuntime {
  const configuration = options.configuration ?? readTrustedLocalSupplierConfig();
  const orders = options.orders ?? getSharedLocalOrderFulfillmentReadPort();
  const normalizedDataset = options.dataset ?? normalizeFixtures(options.sourceFixtures ?? LOCAL_SUPPLIER_SOURCE_FIXTURES);
  return {
    configuration,
    dataset: options.dataset ?? applyLocalSupplierDemoMappingOverlay(normalizedDataset, configuration),
    orders,
    configuredItems: options.configuredItems ?? createLocalConfiguredItemReadAdapter(orders),
    fulfillments: options.fulfillments ?? getSharedLocalFulfillmentRepository(),
    assignments: options.assignments ?? new LocalMemoryLocalSupplierAssignmentRepository(),
    workOrders: options.workOrders ?? new LocalMemoryLocalSupplierWorkOrderRepository(),
    production: options.production ?? new LocalMemoryLocalSupplierProductionRepository(),
  };
}

let sharedRuntime: LocalSupplierRuntime | null = null;

/** Process-memory-only supplier runtime; reset models a process restart. */
export function getSharedLocalSupplierRuntime(): LocalSupplierRuntime {
  sharedRuntime ??= createLocalSupplierRuntime();
  return sharedRuntime;
}

export function resetSharedLocalSupplierRuntimeForTests(): void {
  sharedRuntime = null;
}
